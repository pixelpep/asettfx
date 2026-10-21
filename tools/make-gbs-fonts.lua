-- Rebuilds the two GB Studio fonts of the template generator (web/fonts/original/GBStudio*.ttf) from the PNG files of
-- GB Studio (web/fonts/source/), with this project's own exporter. Run it with: sh tools/make-gbs-fonts.sh
-- The PNG files are those of https://github.com/chrismaltby/gb-studio at commit a227e7dbe5eef9186afabc1b4e27cf873438b4c4
-- (appData/templates/gbs2/assets/fonts/), MIT License, Copyright (c) 2019-2026 Chris Maltby.
local root = app.params.root
package.path = root .. "/aseprite-extension/?.lua;" .. package.path
local jsonutil = require("asettfx.jsonutil")
local export = require("asettfx.export")

local function read(path)
  local f = assert(io.open(path, "rb"))
  local text = f:read("a")
  f:close()
  return text
end

-- The grid of GB Studio: 16 x 14 cells of 8 x 8 pixels in Windows-1252 order (spec/charsets/gbstudio.json).
local preset = assert(jsonutil.parse(read(root .. "/spec/charsets/gbstudio.json")))
local settings = jsonutil.parse('{"v":1,"cell":{"w":8,"h":8},"grid":{"cols":16,"rows":14},"mode":"mono","map":["0020"],"metrics":{"baseline":1}}')
settings.map = preset.map

local COPYRIGHT = "Copyright (c) 2019-2026 Chris Maltby, MIT License (GB Studio, https://github.com/chrismaltby/gb-studio)"
local FONTS = {
  { png = "gbs-mono.png", family = "GB Studio Mono", out = "GBStudioMono.ttf" },
  { png = "gbs-var.png", family = "GB Studio Variable", out = "GBStudioVariable.ttf" },
}

for _, font in ipairs(FONTS) do
  local sprite = assert(app.open(root .. "/web/fonts/source/" .. font.png))
  local result = export.run(sprite, 1, { family = font.family, copyright = COPYRIGHT, version = "Version 1.000", timestamp = 1792491626 },
    settings, true)
  for _, r in ipairs(result.records) do print(string.format("%-8s %-17s %s", r.level, r.id, r.message)) end
  assert(result.ok, font.family .. " was not exported")
  assert(export.write(root .. "/web/fonts/original/" .. font.out, result.font))
  print(string.format("Wrote web/fonts/original/%s: %d glyphs, %d bytes", font.out, result.info.glyphs, result.info.bytes))
  sprite:close()
end
