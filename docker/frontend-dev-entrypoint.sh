#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/app}"
STAMP_FILE="node_modules/.manifest-hash"

cd "$APP_DIR"

if [ ! -f package.json ]; then
  echo "package.json was not found in $APP_DIR" >&2
  echo "Initialize or restore the frontend project before starting Docker." >&2
  exit 1
fi

mkdir -p node_modules

if [ -f package-lock.json ]; then
  MANIFEST_HASH="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"
else
  MANIFEST_HASH="$(sha256sum package.json | awk '{print $1}')"
fi

CURRENT_HASH=""
if [ -f "$STAMP_FILE" ]; then
  CURRENT_HASH="$(cat "$STAMP_FILE")"
fi

if [ "$CURRENT_HASH" != "$MANIFEST_HASH" ]; then
  echo "Installing frontend dependencies..."
  if [ -f package-lock.json ]; then
    # Use the lock file when present for repeatable installs.
    npm ci
  else
    npm install
  fi
  printf "%s" "$MANIFEST_HASH" > "$STAMP_FILE"
else
  echo "Frontend dependencies are up to date."
fi

exec "$@"
