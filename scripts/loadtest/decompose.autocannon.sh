#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5173}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CONNECTIONS="${CONNECTIONS:-100}"
DURATION="${DURATION:-60}"

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "AUTH_TOKEN 未设置。请先 export AUTH_TOKEN=..." >&2
  exit 1
fi

BODY='{"userGoal":"认识钟表","learningFocus":"认识时针和分针","musicStyle":"欢快","musicVoice":"男生","pictureBookStyle":"柔和水彩扁平","characterType":"男生","characterName":"乐乐"}'

npx autocannon \
  -c "$CONNECTIONS" \
  -d "$DURATION" \
  -m POST \
  -H "content-type: application/json" \
  -H "authorization: Bearer ${AUTH_TOKEN}" \
  -b "$BODY" \
  "${BASE_URL}/api/decompose-prompt"
