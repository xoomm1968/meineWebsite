const fetch = require('node-fetch');

/**
 * Adapter for ElevenLabs voice listing and preview.
 * Uses XI-API-Key header: 'xi-api-key'
 */
async function listVoicesElevenLabs(apiKey){
  if(!apiKey) throw new Error('ELEVENLABS_API_KEY not provided');
  const url = 'https://api.elevenlabs.io/v1/voices';
  const res = await fetch(url, { headers: { 'xi-api-key': apiKey, 'Accept': 'application/json' } });
  if(!res.ok){
    const txt = await res.text();
    throw new Error('elevenlabs list failed: ' + res.status + ' ' + txt);
  }
  const j = await res.json();
  const voices = (j.voices || []).map(v => ({
    id: `elevenlabs:${v.voice_id || v.id || v.voice}`,
    provider: 'elevenlabs',
    name: v.name || v.voice || ('voice-' + (v.voice_id||v.id||Math.random().toString(36).slice(2,6))),
    locale: v.language || v.locale || v.language_code || null,
    gender: v.gender || null,
    description: v.description || null,
    sampleUrl: v.preview_url || null,
    meta: v
  }));
  return voices;
}

/**
 * Generate a short preview audio via ElevenLabs TTS for a voiceId.
 * Returns a data-url (base64) for convenience.
 */
async function previewVoiceElevenLabs(apiKey, voiceId, text){
  if(!apiKey) throw new Error('ELEVENLABS_API_KEY not provided');
  if(!voiceId) throw new Error('voiceId required');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const body = { text: text || 'Dies ist eine kurze Vorschau.', voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const txt = await res.text();
    throw new Error('elevenlabs tts failed: ' + res.status + ' ' + txt);
  }
  const buf = await res.buffer();
  const b64 = buf.toString('base64');
  const contentType = res.headers.get('content-type') || 'audio/mpeg';
  return `data:${contentType};base64,${b64}`;
}

module.exports = { listVoicesElevenLabs, previewVoiceElevenLabs };
