#!/usr/bin/env bash
# Simple idempotency test for Worker /api/charge
# Usage: WORKER_URL=http://localhost:8787 ./test_idempotency.sh

set -euo pipefail
WORKER_URL=${WORKER_URL:-http://localhost:8787}
USER_ID=${1:-test-user-1}
CHARS=${2:-50}
REF=${3:-ref-$(date +%s)-$RANDOM}

echo "Using WORKER_URL=$WORKER_URL"
echo "User: $USER_ID, chars: $CHARS, reference: $REF"

PAYLOAD=$(jq -n --arg uid "$USER_ID" --argjson chars $CHARS --arg ref "$REF" '{ userId: $uid, charCount: $chars, isPremium: false, referenceTxId: $ref }')

echo "Payload: $PAYLOAD"

echo "--- First request ---"
RESP1=$(curl -sS -X POST "$WORKER_URL/api/charge" -H 'Content-Type: application/json' -d "$PAYLOAD" || true)
HTTP1=$?
echo "Response1: $RESP1"

sleep 1

echo "--- Second request (same reference) ---"
RESP2=$(curl -sS -X POST "$WORKER_URL/api/charge" -H 'Content-Type: application/json' -d "$PAYLOAD" || true)
HTTP2=$?
echo "Response2: $RESP2"

# Try to pretty-print JSON if possible
if command -v jq >/dev/null 2>&1; then
  echo "\n--- Parsed Responses ---"
  echo "First:"; echo "$RESP1" | jq . || echo "$RESP1"
  echo "Second:"; echo "$RESP2" | jq . || echo "$RESP2"
fi

# Summarize
echo "\nSummary:"
if [[ "$RESP1" == "$RESP2" ]]; then
  echo "Responses identical — idempotency likely returned same result."
else
  echo "Responses differ — inspect 'transaction' or 'existing' fields for idempotency behavior."
fi
