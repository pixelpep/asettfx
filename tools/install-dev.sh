#!/bin/sh
# Copies the extension into Aseprite's extensions folder for development. Restart Aseprite afterwards.
# Set ASEPRITE_CONFIG to the Aseprite user folder if it is not the macOS default.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${ASEPRITE_CONFIG:-$HOME/Library/Application Support/Aseprite}"
DEST="$CONFIG/extensions/digiface"
mkdir -p "$DEST/digiface"
cp "$ROOT/aseprite-extension/package.json" "$ROOT/aseprite-extension/digiface.lua" "$DEST/"
cp "$ROOT"/aseprite-extension/digiface/*.lua "$DEST/digiface/"
echo "Installed in $DEST. Restart Aseprite."
