#!/usr/bin/env bash
# Testskript für TTS Endpunkte
# Usage: API_HOST=http://localhost:58033 API_TOKEN=... ./test_tts_endpoints.sh
set -euo pipefail
: ${API_HOST:="http://localhost:58033"}
: ${API_TOKEN:=""}

echo "Using API_HOST=$API_HOST"

echo "\n1) POST /api/tts/generate"
curl -v -X POST "$API_HOST/api/tts/generate" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hallo von lokal","voiceId":"de-DE-voice","provider":"polly"}' || true

echo "\n2) POST /api/tts/merge"
curl -v -X POST "$API_HOST/api/tts/merge" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"segments":[{"text":"Teil A","voiceId":"v1"},{"text":"Teil B","voiceId":"v2"}],"merge":true,"provider":"polly"}' || true

echo "\n3) POST /api/tts/proxy"
curl -v -X POST "$API_HOST/api/tts/proxy" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Proxy Test","voiceId":"v","provider":"openai"}' || true

echo "\nFinished TTS endpoint tests."
