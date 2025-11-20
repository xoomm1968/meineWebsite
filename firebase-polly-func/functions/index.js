const functions = require('firebase-functions');
const AWS = require('aws-sdk');
const cors = require('cors')({ origin: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');
let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {
  // ffmpeg-static not installed — merge feature will fail with a clear error
  ffmpegPath = null;
}

// Read AWS creds from firebase functions config (preferred) or fallback to env vars
const awsCfg = (functions && functions.config && functions.config().aws) || {};
const pollyCfg = (functions && functions.config && functions.config().polly) || {};
const ACCESS_KEY_ID = awsCfg.access_key_id || process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = awsCfg.secret_access_key || process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = awsCfg.region || process.env.AWS_REGION || 'eu-central-1';
// Optional protection token (set via functions config or env)
const POLLY_FIREBASE_TOKEN = pollyCfg.token || process.env.POLLY_FIREBASE_TOKEN || null;

AWS.config.update({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  region: AWS_REGION
});

const polly = new AWS.Polly();

exports.synthesize = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).send('Only POST allowed');
    }

    // If a protection token is configured, require header x-worker-auth to match
    if (POLLY_FIREBASE_TOKEN) {
      const headerToken = req.header('x-worker-auth') || req.header('X-Worker-Auth') || null;
      if (!headerToken || headerToken !== POLLY_FIREBASE_TOKEN) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }

    // Accept either single { text, voiceId } or multiple segments: { segments: [{text, voiceId}, ...], merge: true }
    const body = req.body || {};
    const segments = Array.isArray(body.segments) ? body.segments : (body.text && body.voiceId ? [{ text: body.text, voiceId: body.voiceId }] : []);
    if (!segments || segments.length === 0) {
      return res.status(400).json({ ok: false, error: 'text and voiceId required (or segments array)' });
    }

    // synthesize each segment
    try {
      const partFiles = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg || !seg.text || !seg.voiceId) continue;
        const params = { OutputFormat: 'mp3', Text: seg.text, VoiceId: seg.voiceId };
        const data = await polly.synthesizeSpeech(params).promise();
        if (!data || !data.AudioStream) continue;
        // write to temp file
        const fname = path.join(os.tmpdir(), `polly_part_${Date.now()}_${i}.mp3`);
        fs.writeFileSync(fname, data.AudioStream);
        partFiles.push(fname);
      }

      if (partFiles.length === 0) return res.status(500).json({ ok: false, error: 'No audio produced' });

      const merge = !!body.merge && partFiles.length > 1;
      if (!merge) {
        // return first part
        const buf = fs.readFileSync(partFiles[0]);
        // cleanup other parts
        partFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e){} });
        res.set('Content-Type', 'audio/mpeg');
        return res.status(200).send(buf);
      }

      // Merge using ffmpeg concat demuxer
      if (!ffmpegPath) return res.status(500).json({ ok: false, error: 'ffmpeg not available on the server. Install ffmpeg-static dependency.' });

      const listFile = path.join(os.tmpdir(), `polly_list_${Date.now()}.txt`);
      const listContent = partFiles.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      fs.writeFileSync(listFile, listContent);
      const outFile = path.join(os.tmpdir(), `polly_out_${Date.now()}.mp3`);

      // Run ffmpeg: ffmpeg -f concat -safe 0 -i listFile -c copy outFile
      const args = ['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile];
      try {
        child_process.execFileSync(ffmpegPath, args, { stdio: 'ignore', timeout: 20000 });
      } catch (e) {
        // cleanup
        partFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e){} });
        try { if (fs.existsSync(listFile)) fs.unlinkSync(listFile); } catch(e){}
        return res.status(500).json({ ok: false, error: 'ffmpeg merge failed', details: e && e.message ? e.message : String(e) });
      }

      const outBuf = fs.readFileSync(outFile);
      // cleanup
      partFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e){} });
      try { if (fs.existsSync(listFile)) fs.unlinkSync(listFile); } catch(e){}
      try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch(e){}

      res.set('Content-Type', 'audio/mpeg');
      return res.status(200).send(outBuf);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  });
});
