#!/bin/sh
# Unpacks the built extension somewhere else and runs it there, to prove the package is self-contained.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
PACKAGE="$(sh "$ROOT/tools/pack.sh" | head -n 1)"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
unzip -q "$PACKAGE" -d "$DIR"
"$ASEPRITE" -b --script-param dir="$DIR" --script "$ROOT/tests/package_smoke.lua"
