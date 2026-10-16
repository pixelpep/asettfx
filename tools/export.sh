#!/bin/sh
# Exports a PNG or .aseprite file to a TTF from the command line. Set ASEPRITE if it is not at the macOS default path.
set -e
[ -n "$2" ] || { echo "usage: sh tools/export.sh <file.png|file.aseprite> <out.ttf> [family]"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
exec "$ASEPRITE" -b --script-param root="$ROOT" --script-param file="$FILE" --script-param out="$OUT" --script-param family="$3" --script "$ROOT/tools/export.lua"
