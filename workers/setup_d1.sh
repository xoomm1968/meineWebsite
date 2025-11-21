#!/usr/bin/env bash
# Setup script for Cloudflare D1 + Worker binding for HHHoerbuch
# Creates a D1 database named 'db-elite-pro', applies schema and seed files,
# and sets a Worker secret placeholder for ELEVENLABS_API_KEY.
#
# Usage: ./workers/setup_d1.sh
# Requirements: wrangler CLI installed and logged-in (`wrangler login`).

set -euo pipefail

DB_NAME="db-elite-pro"
SCHEMA_FILE="$(pwd)/workers/schema_full.sql"
SEED_FILE="$(pwd)/workers/init_sample_data.sql"
WORKER_NAME="hhb-d1-api"

echo "Checking wrangler..."
if ! command -v wrangler >/dev/null 2>&1; then
  echo "Error: wrangler not found. Install from https://developers.cloudflare.com/workers/cli-wrangler/install" >&2
  exit 2
fi

echo "Creating D1 database: $DB_NAME"
# `wrangler d1 create` may prompt; it returns JSON with database name
wrangler d1 create "$DB_NAME"

echo "Applying schema..."
# Some wrangler versions expose `wrangler d1 apply`. If not available, instruct user to run via Dashboard.
if wrangler d1 apply "$DB_NAME" --file "$SCHEMA_FILE" >/dev/null 2>&1; then
  echo "Schema applied via wrangler d1 apply"
else
  echo "wrangler d1 apply not available or failed. Please open Cloudflare Dashboard -> D1 -> $DB_NAME -> Run SQL and paste the contents of: $SCHEMA_FILE"
fi

echo "Loading seed data..."
if wrangler d1 execute "$DB_NAME" --file "$SEED_FILE" >/dev/null 2>&1; then
  echo "Seed data loaded via wrangler d1 execute"
else
  echo "wrangler d1 execute not available or failed. Please paste the contents of: $SEED_FILE into the D1 SQL console in the Dashboard"
fi

# Set worker secret for ElevenLabs (interactive)
if command -v jq >/dev/null 2>&1; then
  echo "Next: set ELEVENLABS_API_KEY secret for your Worker."
  echo "Running: wrangler secret put ELEVENLABS_API_KEY"
  echo "(Enter the key when prompted)"
  wrangler secret put ELEVENLABS_API_KEY || true
else
  echo "Note: jq not found. Please run: wrangler secret put ELEVENLABS_API_KEY and paste your ElevenLabs key when prompted."
fi

# Attempt to update wrangler.toml with the created D1 binding (non-destructive)
WRANGLER_TOML="$(pwd)/workers/wrangler.toml"
if [ -f "$WRANGLER_TOML" ]; then
  echo "Updating $WRANGLER_TOML with D1 binding (binding name: AUDIO_STORAGE, database_name: $DB_NAME)"
  # Insert or replace d1_databases line under [env.production]
  python3 - "$WRANGLER_TOML" "$DB_NAME" <<'PY'
import sys,io,re
path=sys.argv[1]
db=sys.argv[2]
with open(path,'r',encoding='utf-8') as f:
    s=f.read()
if '[env.production]' not in s:
    s += '\n[env.production]\n'
# replace existing d1_databases line if present
if 'd1_databases' in s:
    s=re.sub(r'd1_databases\s*=\s*\[.*?\]\n', f'd1_databases = [ {{ binding = "AUDIO_STORAGE", database_name = "{db}" }} ]\n', s, flags=re.S)
else:
    s=s.replace('[env.production]\n', f'[env.production]\n# D1 database binding added by setup script\nd1_databases = [ {{ binding = "AUDIO_STORAGE", database_name = "{db}" }} ]\n')
with open(path,'w',encoding='utf-8') as f:
    f.write(s)
print('wrangler.toml updated')
PY
else
  echo "$WRANGLER_TOML not found; please add this binding to your wrangler.toml manually:"
  echo "[env.production]"
  echo "d1_databases = [ { binding = \"AUDIO_STORAGE\", database_name = \"$DB_NAME\" } ]"
fi

echo "All done. If any step failed, follow the printed instructions to complete the missing actions via the Dashboard."

exit 0
