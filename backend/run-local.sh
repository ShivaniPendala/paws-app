#!/bin/sh
set -eu

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-paws}"

exec "$BACKEND_DIR/.venv/bin/uvicorn" main:app \
  --app-dir "$BACKEND_DIR" \
  --host 0.0.0.0 \
  --port "${PORT:-8000}"
