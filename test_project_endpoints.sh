#!/usr/bin/env bash
# Kleines Testskript für die Projekt-Endpunkte
# Usage: API_HOST=https://localhost:8787 API_TOKEN=xxxx ./test_project_endpoints.sh
set -euo pipefail
: ${API_HOST:?Need to set API_HOST}
: ${API_TOKEN:?Need to set API_TOKEN}

echo "Create new (protected) project..."
resp=$(curl -s -X POST "$API_HOST/api/projects/save" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"TestProjekt","content_json":"{\"foo\":1}","password":"mypassword123"}')
echo "Response: $resp"

# try to extract id (supports quoted string id or numeric id)
id=$(echo "$resp" | sed -nE 's/.*"id"\s*:\s*"([^"]+)".*/\1/p')
if [ -z "$id" ]; then
  id=$(echo "$resp" | sed -nE 's/.*"id"\s*:\s*([0-9]+).*/\1/p')
fi
if [ -z "$id" ]; then
  echo "Failed to get id from response"
  exit 1
fi

echo "Loading project without password (should be 403 for protected)..."
curl -i -s -H "Authorization: Bearer $API_TOKEN" "$API_HOST/api/projects/$id" || true

echo -e "\nLoading project with password (query param)..."
curl -i -s -H "Authorization: Bearer $API_TOKEN" "$API_HOST/api/projects/$id?key=mypassword123"

echo -e "\nListing projects..."
curl -s -H "Authorization: Bearer $API_TOKEN" "$API_HOST/api/projects/list" | jq '.' || true

# Update project (change name)
echo -e "\nUpdating project name..."
curl -s -X POST "$API_HOST/api/projects/save" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$id\", \"name\": \"UpdatedName\"}" | jq '.' || true

echo "Done."
