#!/usr/bin/env bash
set -euo pipefail

MDMBOX_URL="${MDMBOX_URL:-http://localhost:3003}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Waiting for MDMbox at $MDMBOX_URL ..."
until curl -sf "$MDMBOX_URL/healthz" > /dev/null 2>&1; do
  sleep 2
done
echo "MDMbox is ready."

echo "Applying SQL functions ..."
bun run "$SCRIPT_DIR/init-sql.ts"
echo "SQL functions applied."

echo "Loading sample Patient data ..."
curl -f -X POST "$MDMBOX_URL/fhir-server-api/\$load" \
  -H "Content-Type: application/json" \
  -d '{"source": "https://storage.googleapis.com/aidbox-public/fake1000.ndjson.gz"}'
echo ""
echo "Patient data loaded."

echo "Creating MatchingModel in MDMbox ..."
curl -f -X POST "$MDMBOX_URL/api/models" \
  -H "Content-Type: application/json" \
  -d @"$SCRIPT_DIR/patient-model.json"
echo ""
echo "MatchingModel created."

echo "Done! You can now run the app."
