#!/bin/sh
# Copies the logo from references/ (not in the repository) to web/logo.svg, which the page uses in its header and as its favicon.
# Does nothing when references/logo-digiface.svg is not there. Usage: sh tools/sync-logo.sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/references/logo-digiface.svg"
if [ -f "$SRC" ]; then
  cmp -s "$SRC" "$ROOT/web/logo.svg" || { cp "$SRC" "$ROOT/web/logo.svg"; echo "web/logo.svg updated from references/"; }
fi
