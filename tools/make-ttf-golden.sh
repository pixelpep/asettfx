#!/bin/sh
# Rebuilds the reference fonts of tests/fixtures/ttf/ with the Lua writer (needs Aseprite). Run "node tools/make-ttf-cases.mjs" first
# when the cases changed. Set ASEPRITE if it is not at the macOS default path.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
exec "$ASEPRITE" -b --script-param root="$ROOT" --script "$ROOT/tools/make-ttf-golden.lua"
