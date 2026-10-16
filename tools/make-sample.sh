#!/bin/sh
# Builds the sample font (A to Z, variable width) into the given directory. Set ASEPRITE if needed.
set -e
[ -n "$1" ] || { echo "usage: sh tools/make-sample.sh <output directory>"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
mkdir -p "$1"
OUT="$(cd "$1" && pwd)"
exec "$ASEPRITE" -b --script-param root="$ROOT" --script-param out="$OUT" --script "$ROOT/tools/make-sample.lua"
