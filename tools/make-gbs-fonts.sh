#!/bin/sh
# Rebuilds web/fonts/original/GBStudioMono.ttf and GBStudioVariable.ttf from web/fonts/source/*.png (needs Aseprite).
# Run "node tools/gen-bundled-fonts.mjs" afterwards. Set ASEPRITE if it is not at the macOS default path.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
exec "$ASEPRITE" -b --script-param root="$ROOT" --script "$ROOT/tools/make-gbs-fonts.lua"
