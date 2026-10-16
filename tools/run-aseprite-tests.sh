#!/bin/sh
# Runs the Lua tests in Aseprite's batch mode. Set ASEPRITE to the executable if it is not in the default place.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASEPRITE="${ASEPRITE:-/Applications/Aseprite.app/Contents/MacOS/aseprite}"
exec "$ASEPRITE" -b --script-param root="$ROOT" --script "$ROOT/tests/aseprite/run.lua"
