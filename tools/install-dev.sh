#!/bin/sh
# Copies the extension into Aseprite's extensions folder for development. Restart Aseprite afterwards.
# Set ASEPRITE_CONFIG to the Aseprite user folder if it is not the macOS default.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${ASEPRITE_CONFIG:-$HOME/Library/Application Support/Aseprite}"
DEST="$CONFIG/extensions/asettfx"
mkdir -p "$DEST/asettfx"
cp "$ROOT/aseprite-extension/package.json" "$ROOT/aseprite-extension/asettfx.lua" "$DEST/"
cp "$ROOT"/aseprite-extension/asettfx/*.lua "$DEST/asettfx/"
echo "Installed in $DEST. Restart Aseprite."
