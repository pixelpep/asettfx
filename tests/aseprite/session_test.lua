local jsonutil = require("digiface.jsonutil")
local session = require("digiface.session")
local settings = require("digiface.settings")
local flatten = require("digiface.flatten")

return function(T)
  local fixtures = T.root .. "/tests/fixtures/"
  local opened = {}

  local function open_fixture(name)
    local sprite = assert(app.open(fixtures .. name))
    opened[#opened + 1] = sprite
    return sprite
  end

  local function ids(result)
    local out = {}
    for _, r in ipairs(result.records) do out[#out + 1] = r.id end
    return out
  end

  local function has(result, id)
    for _, r in ipairs(result.records) do if r.id == id then return r end end
  end

  -- ASCII art to an Image: '#' black, '.' white, 'M' magenta, 'a' semi-transparent black, ' ' transparent,
  -- 'o' guide grey (F4F4F4), 'b' guide blue (9CC3E6).
  local PIXELS = {
    ["#"] = { 0, 0, 0, 255 }, ["."] = { 255, 255, 255, 255 }, M = { 255, 0, 255, 255 },
    a = { 0, 0, 0, 128 }, [" "] = { 0, 0, 0, 0 }, o = { 244, 244, 244, 255 }, b = { 156, 195, 230, 255 },
  }
  local function image(rows)
    local img = Image(#rows[1], #rows, ColorMode.RGB)
    for y, row in ipairs(rows) do
      for x = 1, #row do
        local c = PIXELS[row:sub(x, x)]
        img:putPixel(x - 1, y - 1, app.pixelColor.rgba(c[1], c[2], c[3], c[4]))
      end
    end
    return img
  end

  -- 12 x 4 sprite: cells of 6 x 4, two columns, map U+0041 and U+0042, variable width.
  local function make_sprite()
    local sprite = Sprite(12, 4, ColorMode.RGB)
    local template = sprite.layers[1]
    template.name = "template"
    sprite:newCel(template, 1, image({ "oooooooooooo", "oooooooooooo", "oooooooooooo", "bbbbbbbbbbbb" }), Point(0, 0))
    local glyphs = sprite:newLayer()
    glyphs.name = "glyphs"
    sprite:newCel(glyphs, 1, image({
      "##  MM#MMMMM",
      "#   MM#MMMMM",
      "##  MM#MMMMM",
      "#   MM#MMMMM",
    }), Point(0, 0))
    return sprite, template, glyphs
  end

  local META = jsonutil.parse([[{"v":1,"cell":{"w":6,"h":4},"grid":{"cols":2,"rows":1},"mode":"var","map":["0041-0042"],"metrics":{"baseline":1}}]])

  T.test("variable template fixture: widths match what the web generator drew", function()
    local sprite = open_fixture("template-var.png")
    local expected = jsonutil.parse(T.read(fixtures .. "template-var.expected.json"))
    local result = session.inspect(sprite, 1)
    T.eq(result.source, "png")
    T.eq(result.meta.mode, "var")
    local count = 0
    for _, g in ipairs(result.analysis.glyphs) do
      T.eq(g.advance, expected.advances[tostring(g.cp)], string.format("advance of U+%04X", g.cp))
      count = count + 1
    end
    T.eq(count, 95)
  end)

  T.test("a template left visible with no drawing cannot be exported", function()
    local result = session.inspect(open_fixture("template-var.png"), 1)
    T.eq(result.can_export, false)
    T.truthy(has(result, "no-ink"))
    T.truthy(has(result, "template-visible"))
    T.truthy(has(result, "impure-pixels"))
    T.eq(has(result, "empty-glyphs"), nil)
  end)

  T.test("monospace template", function()
    local result = session.inspect(open_fixture("template-mono.png"), 1)
    T.eq(result.meta.mode, "mono")
    for _, g in ipairs(result.analysis.glyphs) do T.eq(g.advance, 8) end
  end)

  T.test("PNG without metadata asks for the dialog, then uses its values", function()
    local sprite = open_fixture("template-no-meta.png")
    local result = session.inspect(sprite, 1)
    T.eq(result.meta, nil)
    T.eq(result.can_export, false)
    T.list_eq(ids(result), { "meta-absent" })

    local manual = jsonutil.parse([[{"v":1,"cell":{"w":8,"h":8},"grid":{"cols":16,"rows":6},"mode":"var","map":["0020-007E"]}]])
    local with_dialog = session.inspect(sprite, 1, manual)
    T.eq(with_dialog.source, "dialog")
    T.truthy(has(with_dialog, "meta-absent"))
    T.eq(#with_dialog.analysis.glyphs, 95)
  end)

  T.test("invalid dialog values are an error", function()
    local manual = jsonutil.parse([[{"v":1,"cell":{"w":8,"h":8},"grid":{"cols":16,"rows":6},"mode":"var","map":["0020-007E"],"metrics":{"baseline":8}}]])
    local result = session.inspect(open_fixture("template-no-meta.png"), 1, manual)
    T.eq(result.can_export, false)
    T.truthy(has(result, "settings-invalid"))
  end)

  T.test("damaged settings are reported and the dialog values are used", function()
    local sprite = open_fixture("template-corrupt-crc.png")
    local result = session.inspect(sprite, 1)
    T.eq(result.meta, nil)
    T.truthy(has(result, "meta-invalid"))
    T.truthy(has(result, "meta-invalid").message:find("checksum"))
  end)

  T.test("a resized canvas keeps the settings and reports the geometry", function()
    local result = session.inspect(open_fixture("template-wrong-size.png"), 1)
    T.eq(result.source, "png")
    T.eq(has(result, "size-mismatch").message, "Image is 128x56 but the grid expects 128x48.")
    T.eq(has(result, "extra-area").message, "8 pixel rows below the grid are ignored.")
  end)

  T.test("hidden template: only the drawing is read, over a white background", function()
    local sprite, template = make_sprite()
    settings.remember(sprite, META)
    template.isVisible = false
    local result = session.inspect(sprite, 1)
    T.eq(result.source, "properties")
    T.eq(result.can_export, true)
    T.list_eq(ids(result), { "cell-size-unusual", "mode-detected" })
    local a, b = result.analysis.glyphs[1], result.analysis.glyphs[2]
    T.eq(a.advance, 4); T.list_eq(a.ink_rows, { "##..", "#...", "##..", "#..." })
    T.eq(b.advance, 1); T.list_eq(b.ink_rows, { "#", "#", "#", "#" })
  end)

  T.test("template left visible is read as background and flagged", function()
    local sprite = make_sprite()
    settings.remember(sprite, META)
    local result = session.inspect(sprite, 1)
    T.eq(result.can_export, true)
    T.truthy(has(result, "template-visible"))
    T.truthy(has(result, "impure-pixels"))
    T.eq(result.analysis.glyphs[1].advance, 4)
  end)

  T.test("every layer hidden is an error", function()
    local sprite, template, glyphs = make_sprite()
    settings.remember(sprite, META)
    template.isVisible, glyphs.isVisible = false, false
    local result = session.inspect(sprite, 1)
    T.eq(result.can_export, false)
    T.truthy(has(result, "no-visible-layer"))
    T.eq(flatten.visible_layers(sprite), 0)
  end)

  T.test("white drawn over black erases it, semi-transparent black is thresholded and reported", function()
    local sprite, template, glyphs = make_sprite()
    settings.remember(sprite, META)
    template.isVisible = false
    local eraser = sprite:newLayer()
    sprite:newCel(eraser, 1, image({ "............", "............", "............", "............" }), Point(0, 0))
    local result = session.inspect(sprite, 1)
    T.eq(result.analysis.counts.ink, 0)
    T.truthy(has(result, "no-ink"))

    eraser.isVisible = false
    local semi = sprite:newLayer()
    sprite:newCel(semi, 1, image({ "aaaaaa", "      ", "      ", "      " }), Point(6, 0))
    glyphs.isVisible = false
    local r2 = session.inspect(sprite, 1)
    T.eq(r2.analysis.counts.impure, 6)
    T.truthy(has(r2, "impure-pixels"))
    T.eq(r2.analysis.counts.ink, 6)
  end)

  T.test("hidden group hides its layers", function()
    local sprite = Sprite(4, 4, ColorMode.RGB)
    local group = sprite:newGroup()
    local child = sprite:newLayer()
    child.parent = group
    T.eq(flatten.visible_layers(sprite), 2)
    group.isVisible = false
    T.eq(flatten.visible_layers(sprite), 1)
  end)

  T.test("pixels of a hidden group, or of a hidden layer inside a group, are not read", function()
    local sprite = Sprite(2, 1, ColorMode.RGB)
    local group = sprite:newGroup()
    local child = sprite:newLayer()
    child.parent = group
    local black = Image(2, 1)
    black:clear(app.pixelColor.rgba(0, 0, 0, 255))
    sprite:newCel(child, 1, black, Point(0, 0))
    local function red() return (flatten.source(sprite, 1).rgb(0, 0)) end
    T.eq(red(), 0, "group visible")
    group.isVisible = false
    T.eq(red(), 255, "group hidden")
    group.isVisible = true
    child.isVisible = false
    T.eq(red(), 255, "child hidden")
  end)

  T.test("several frames: the active frame is named", function()
    local sprite, template = make_sprite()
    settings.remember(sprite, META)
    sprite:newFrame()
    template.isVisible = false
    local result = session.inspect(sprite, 2)
    T.truthy(has(result, "frames-ignored"))
    T.eq(has(result, "frames-ignored").message, "Only frame 2 is exported.")
  end)

  T.test("settings survive in the sprite properties and in a sidecar file", function()
    local sprite = make_sprite()
    T.eq(settings.resolve(sprite).status, "absent")
    settings.remember(sprite, META)
    local found = settings.resolve(sprite)
    T.eq(found.status, "ok")
    T.eq(found.source, "properties")
    T.eq(found.meta.cell.w, 6)
    T.list_eq(found.meta.map, { "0041-0042" })

    local dir = app.fs.tempPath
    local base = app.fs.joinPath(dir, "digiface-test-sidecar")
    local f = assert(io.open(base .. ".digiface.json", "wb"))
    f:write(json.encode(META))
    f:close()
    local other = make_sprite()
    other.filename = base .. ".aseprite"
    local viaSidecar = settings.resolve(other)
    os.remove(base .. ".digiface.json")
    T.eq(viaSidecar.status, "ok")
    T.eq(viaSidecar.source, "sidecar")
  end)

  T.test("the sprite's own settings come first, so no file has to be opened", function()
    local sprite = open_fixture("template-corrupt-crc.png")
    settings.remember(sprite, META)
    local found = settings.resolve(sprite)
    T.eq(found.status, "ok")
    T.eq(found.source, "properties")
  end)

  T.test("the spacing follows the magenta: found means variable, none means monospace", function()
    local sprite, template = make_sprite()
    settings.remember(sprite, jsonutil.parse([[{"v":1,"cell":{"w":6,"h":4},"grid":{"cols":2,"rows":1},"mode":"mono","map":["0041-0042"]}]]))
    template.isVisible = false
    local detected = session.inspect(sprite, 1)
    T.eq(detected.mode, "var"); T.eq(detected.mode_reason, "detected"); T.eq(detected.magenta_found, true)
    T.eq(detected.meta.mode, "var"); T.eq(detected.meta.widthSource, "magenta")
    T.eq(detected.analysis.glyphs[1].advance, 4, "the magenta sets the width even though the settings said monospace")

    local chosen = session.inspect(sprite, 1, nil, false, "mono")
    T.eq(chosen.mode, "mono"); T.eq(chosen.mode_reason, "chosen"); T.eq(chosen.magenta_found, true)
    T.eq(chosen.analysis.glyphs[1].advance, 6, "magenta is treated as empty: the full cell width")
    T.truthy(chosen.analysis.glyphs[1].has_ink)
    T.list_eq(chosen.analysis.glyphs[1].ink_rows, { "##....", "#.....", "##....", "#....." })

    local plain = Sprite(12, 4, ColorMode.RGB)
    settings.remember(plain, jsonutil.parse([[{"v":1,"cell":{"w":6,"h":4},"grid":{"cols":2,"rows":1},"mode":"var","map":["0041-0042"]}]]))
    local ink = Image(12, 4, ColorMode.RGB)
    ink:putPixel(0, 0, app.pixelColor.rgba(0, 0, 0, 255))
    plain:newCel(plain.layers[1], 1, ink, Point(0, 0))
    local none = session.inspect(plain, 1, nil, false, "var")
    T.eq(none.mode, "mono", "variable spacing is not available without magenta")
    T.eq(none.mode_reason, "none"); T.eq(none.magenta_found, false)
    T.eq(none.analysis.glyphs[1].advance, 6)
  end)

  T.test("settings that asked for auto width use the magenta once it is found", function()
    local sprite, template = make_sprite()
    settings.remember(sprite, jsonutil.parse([[{"v":1,"cell":{"w":6,"h":4},"grid":{"cols":2,"rows":1},"mode":"var","widthSource":"auto","map":["0041-0042"]}]]))
    template.isVisible = false
    local result = session.inspect(sprite, 1)
    T.eq(result.meta.widthSource, "magenta")
    T.eq(result.analysis.glyphs[1].advance, 4)
  end)

  for _, sprite in ipairs(opened) do sprite:close() end
end
