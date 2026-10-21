#!/bin/sh
# Builds dist/digiface-<version>.aseprite-extension, the file users install in Aseprite.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/aseprite-extension"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$SRC/package.json" | head -n 1)"
[ -n "$VERSION" ] || { echo "no version in aseprite-extension/package.json"; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$SRC/package.json" "$SRC/digiface.lua" "$SRC/README.md" "$STAGE/"
cp "$ROOT/LICENSE" "$ROOT/NOTICE" "$STAGE/"
mkdir "$STAGE/digiface"
cp "$SRC"/digiface/*.lua "$STAGE/digiface/"

mkdir -p "$ROOT/dist"
OUT="$ROOT/dist/digiface-$VERSION.aseprite-extension"
rm -f "$OUT"
(cd "$STAGE" && zip -q -X -r "$OUT" .)
echo "$OUT"
unzip -l "$OUT" | tail -n +4
