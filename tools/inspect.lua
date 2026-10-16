-- Prints what the exporter would see in a file: settings, export checks and the width of each character.
-- Usage: sh tools/inspect.sh <file.png|file.aseprite> [chars]   (chars: characters whose pixels to print)
local root = app.params.root
package.path = root .. "/aseprite-extension/?.lua;" .. package.path
local session = require("asettfx.session")

local path = app.params.file
assert(path, "usage: sh tools/inspect.sh <file> [chars]")
local sprite = app.open(path)
assert(sprite, "cannot open " .. path)
local frame = 1
local result = session.inspect(sprite, frame)

print(string.format("File:     %s (%dx%d)", path, sprite.width, sprite.height))
if result.meta then
  local m = result.meta
  print(string.format("Settings: from %s, %s, cell %dx%d, grid %dx%d, %d characters mapped",
    result.source, m.mode, m.cell.w, m.cell.h, m.grid.cols, m.grid.rows, #result.analysis.glyphs))
else
  print("Settings: none found (the export dialog would ask for them)")
end

print("\nChecks:")
if #result.records == 0 then print("  none") end
for _, r in ipairs(result.records) do print(string.format("  %-8s %-17s %s", r.level, r.id, r.message)) end
print("\nCan export: " .. tostring(result.can_export))

if result.analysis then
  local rows = {}
  for _, g in ipairs(result.analysis.glyphs) do
    if g.inside then
      rows[#rows + 1] = string.format("U+%04X=%d%s", g.cp, g.advance, g.has_ink and "" or "(empty)")
    end
  end
  print("\nAdvance in pixels per character (empty = no ink):")
  for i = 1, #rows, 8 do print("  " .. table.concat(rows, "  ", i, math.min(i + 7, #rows))) end

  local wanted = app.params.chars or ""
  for _, g in ipairs(result.analysis.glyphs) do
    local ch = utf8.char(g.cp)
    if g.inside and wanted:find(ch, 1, true) then
      print(string.format("\n%s  U+%04X  advance %d, width %d, origin %d", ch, g.cp, g.advance, g.width, g.origin))
      for _, line in ipairs(g.ink_rows) do print("  " .. line) end
    end
  end
end
