-- Exports a PNG or .aseprite file to a TTF from the command line, with the same checks as the future dialog.
-- Usage: sh tools/export.sh <file.png|file.aseprite> <out.ttf> [family]
package.path = app.params.root .. "/aseprite-extension/?.lua;" .. package.path
local export = require("asettfx.export")

local sprite = assert(app.open(app.params.file), "cannot open " .. tostring(app.params.file))
local result = export.run(sprite, 1, { family = app.params.family ~= "" and app.params.family or nil })

for _, r in ipairs(result.records) do print(string.format("%-8s %-17s %s", r.level, r.id, r.message)) end
if not result.ok then error("not exported: fix the errors above") end

local ok, err = export.write(app.params.out, result.font)
assert(ok, err)
print(string.format("Wrote %s: %d glyphs, %d bytes", app.params.out, result.info.glyphs, result.info.bytes))
