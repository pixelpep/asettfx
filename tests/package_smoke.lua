-- Runs the unpacked extension (app.params.dir) without any file of the repository.
local dir = assert(app.params.dir, "pass --script-param dir=<unpacked extension>")
for _, name in ipairs({ "package.json", "asettfx.lua", "LICENSE", "NOTICE", "README.md", "asettfx/ttf.lua", "asettfx/commands.lua" }) do
  assert(io.open(dir .. "/" .. name, "rb"), "missing in the package: " .. name):close()
end
package.path = dir .. "/?.lua"  -- nothing else: the package must not need the repository

assert(loadfile(dir .. "/asettfx.lua"))()
local commands = {}
local plugin = { path = dir, preferences = {} }
function plugin:newMenuGroup() end
function plugin:newCommand(o) commands[#commands + 1] = o end
init(plugin)
assert(#commands == 2, "two commands expected")

-- a font from a small sprite, through the same modules the menu command uses
local jsonutil = require("asettfx.jsonutil")
local settings = require("asettfx.settings")
local export = require("asettfx.export")

local sprite = Sprite(8, 8, ColorMode.RGB)
local img = Image(8, 8, ColorMode.RGB)
for y = 0, 6 do img:putPixel(1, y, app.pixelColor.rgba(0, 0, 0, 255)) end
sprite:newCel(sprite.layers[1], 1, img, Point(0, 0))
settings.remember(sprite, jsonutil.parse('{"v":1,"cell":{"w":8,"h":8},"grid":{"cols":1,"rows":1},"mode":"mono","map":["0049"],"metrics":{"baseline":1}}'))
local result = export.run(sprite, 1, { family = "Smoke" })
assert(result.ok, "export failed")
assert(#result.font > 200 and result.info.glyphs == 2)
print("package smoke test: ok, " .. result.info.bytes .. " bytes")
