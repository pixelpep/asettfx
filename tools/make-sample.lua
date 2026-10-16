-- Builds a small sample font sprite (A to Z and a space, variable width) and exports it.
-- Usage: sh tools/make-sample.sh <output directory>   writes sample.aseprite and sample.ttf
package.path = app.params.root .. "/aseprite-extension/?.lua;" .. package.path
local jsonutil = require("asettfx.jsonutil")
local settings = require("asettfx.settings")
local export = require("asettfx.export")

-- 5 x 7 capitals drawn for this project. '#' is ink.
local LETTERS = {
  A = { ".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" },
  B = { "####.", "#...#", "#...#", "####.", "#...#", "#...#", "####." },
  C = { ".###.", "#...#", "#....", "#....", "#....", "#...#", ".###." },
  D = { "####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####." },
  E = { "#####", "#....", "#....", "####.", "#....", "#....", "#####" },
  F = { "#####", "#....", "#....", "####.", "#....", "#....", "#...." },
  G = { ".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###." },
  H = { "#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" },
  I = { "###", ".#.", ".#.", ".#.", ".#.", ".#.", "###" },
  J = { "..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.." },
  K = { "#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#" },
  L = { "#....", "#....", "#....", "#....", "#....", "#....", "#####" },
  M = { "#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#" },
  N = { "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#" },
  O = { ".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###." },
  P = { "####.", "#...#", "#...#", "####.", "#....", "#....", "#...." },
  Q = { ".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#" },
  R = { "####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#" },
  S = { ".####", "#....", "#....", ".###.", "....#", "....#", "####." },
  T = { "#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.." },
  U = { "#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###." },
  V = { "#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.." },
  W = { "#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#" },
  X = { "#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#" },
  Y = { "#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.." },
  Z = { "#####", "....#", "...#.", "..#..", ".#...", "#....", "#####" },
}

local out_dir = assert(app.params.out, "usage: sh tools/make-sample.sh <output directory>")
local CELL, COLS, ROWS = 8, 9, 3

local meta = jsonutil.parse(string.format(
  '{"v":1,"name":"ASETTFX Sample","cell":{"w":%d,"h":%d},"grid":{"cols":%d,"rows":%d},"mode":"var","widthSource":"magenta",' ..
  '"map":["0020","0041-005A"],"metrics":{"baseline":1,"xHeight":7,"capHeight":7}}', CELL, CELL, COLS, ROWS))

local sprite = Sprite(COLS * CELL, ROWS * CELL, ColorMode.RGB)
sprite.layers[1].name = "glyphs"
local img = Image(sprite.width, sprite.height, ColorMode.RGB)
local black, pink = app.pixelColor.rgba(0, 0, 0, 255), app.pixelColor.rgba(255, 0, 255, 255)

local function cell_origin(index) return ((index - 1) % COLS) * CELL, ((index - 1) // COLS) * CELL end
local function pink_from(index, from_col)
  local x0, y0 = cell_origin(index)
  for x = from_col, CELL - 1 do
    for y = 0, CELL - 1 do img:putPixel(x0 + x, y0 + y, pink) end
  end
end

pink_from(1, 3)  -- the space is 3 pixels wide
for i = 0, 25 do
  local letter = string.char(65 + i)
  local rows = LETTERS[letter]
  local x0, y0 = cell_origin(i + 2)
  for y, row in ipairs(rows) do
    for x = 1, #row do
      if row:sub(x, x) == "#" then img:putPixel(x0 + x - 1, y0 + y - 1, black) end
    end
  end
  pink_from(i + 2, #rows[1] + 1)
end
sprite:newCel(sprite.layers[1], 1, img, Point(0, 0))
settings.remember(sprite, meta)

local result = export.run(sprite, 1, { family = "ASETTFX Sample" })
for _, r in ipairs(result.records) do print(string.format("%-8s %-17s %s", r.level, r.id, r.message)) end
assert(result.ok, "sample font was not exported")
sprite:saveAs(out_dir .. "/sample.aseprite")
assert(export.write(out_dir .. "/sample.ttf", result.font))
print(string.format("Wrote sample.aseprite and sample.ttf in %s (%d glyphs, %d bytes)", out_dir, result.info.glyphs, result.info.bytes))
