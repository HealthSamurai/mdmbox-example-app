#!/usr/bin/env bash
set -euo pipefail

AIDBOX_URL="${AIDBOX_URL:-http://localhost:8888}"
MDMBOX_URL="${MDMBOX_URL:-http://localhost:3003}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Waiting for Aidbox at $AIDBOX_URL ..."
until curl -sf "$AIDBOX_URL/health" > /dev/null 2>&1; do
  sleep 2
done
echo "Aidbox is ready."

echo "Waiting for MDMbox at $MDMBOX_URL ..."
until curl -sf "$MDMBOX_URL/healthz" > /dev/null 2>&1; do
  sleep 2
done
echo "MDMbox is ready."

echo "Creating SQL functions ..."
curl -f -X POST "$AIDBOX_URL/\$sql" \
  -H "Content-Type: application/json" \
  -u "root:root" \
  -d @"$SCRIPT_DIR/init-sql.json"
echo ""
echo "SQL functions created."

echo "Creating Client resource in Aidbox ..."
curl -f -X PUT "$AIDBOX_URL/fhir/Client/basic" \
  -H "Content-Type: application/json" \
  -u "root:root" \
  -d @"$SCRIPT_DIR/app-client.json"
echo ""
echo "Client created."

echo "Loading sample Patient data ..."
curl -f -X POST "$AIDBOX_URL/fhir/Patient/\$load" \
  -H "Content-Type: text/yaml" \
  -u "root:root" \
  -d "source: 'https://storage.googleapis.com/aidbox-public/fake1000.ndjson.gz'"
echo ""
echo "Patient data loaded."

echo "Creating AidboxQuery/patients ..."
curl -f -X PUT "$AIDBOX_URL/AidboxQuery/patients" \
  -H "Content-Type: text/yaml" \
  -u "root:root" \
  --data-binary @"$SCRIPT_DIR/patients-query.yaml"
echo ""
echo "AidboxQuery created."

echo "Creating MatchingModel in MDMbox ..."
curl -f -X POST "$MDMBOX_URL/api/models" \
  -H "Content-Type: application/json" \
  -d @"$SCRIPT_DIR/patient-model.json"
echo ""
echo "MatchingModel created."

echo "Done! You can now run the app."
