-- Writes the reference fonts of tests/fixtures/ttf/ with the Lua writer, from cases.json (see tools/make-ttf-cases.mjs).
-- Run it with: sh tools/make-ttf-golden.sh
local root = app.params.root
package.path = root .. "/aseprite-extension/?.lua;" .. package.path
local jsonutil = require("digiface.jsonutil")
local ttf = require("digiface.ttf")

local function read(path)
  local f = assert(io.open(path, "rb"))
  local text = f:read("a")
  f:close()
  return text
end

local dir = root .. "/tests/fixtures/ttf/"
local data = assert(jsonutil.parse(read(dir .. "cases.json")))
for _, case in ipairs(data.cases) do
  local glyphs = {}
  for i, g in ipairs(case.glyphs) do
    glyphs[i] = { cp = g.cp, inside = true, has_ink = g.has_ink, ink_rows = g.ink_rows, advance = g.advance }
  end
  local s = case.settings
  s.x_height, s.cap_height = s.x_height, s.cap_height
  local font, info = ttf.build({ glyphs = glyphs }, s, case.options)
  local f = assert(io.open(dir .. case.name .. ".ttf", "wb"))
  f:write(font)
  f:close()
  print(string.format("%-12s %d glyphs, %d bytes", case.name, info.glyphs, info.bytes))
end
