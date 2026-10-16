#!/bin/sh
# Shows what the ASETTFX exporter reads from a PNG or .aseprite file. Set ASEPRITE if it is not at the macOS default path.
set -e
[ -n "$1" ] || { echo "usage: sh tools/inspect.sh <file.png|file.aseprite> [chars]"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
exec "$ASEPRITE" -b --script-param root="$ROOT" --script-param file="$FILE" --script-param chars="$2" --script "$ROOT/tools/inspect.lua"
