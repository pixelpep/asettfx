local checks = require("digiface.checks")
local meta = require("digiface.meta")

return function(T)
  local function settings(over)
    local m = { v = 1, cell = { w = 8, h = 8 }, grid = { cols = 2, rows = 1 }, mode = "var", map = { "0041-0042" } }
    for k, v in pairs(over or {}) do m[k] = v end
    return meta.with_defaults(m)
  end

  local function glyph(cp, over)
    local g = { cp = cp, inside = true, has_ink = true, blank = false }
    for k, v in pairs(over or {}) do g[k] = v end
    return g
  end

  local function analysis(over)
    local a = {
      glyphs = { glyph(0x41), glyph(0x42) },
      outside = {},
      counts = { impure = 0, ink = 10, marker_pixels = 0, guide = 0, assigned = 2, inside = 2 },
      geometry = { image_w = 16, image_h = 8, grid_w = 16, grid_h = 8 },
    }
    for k, v in pairs(over or {}) do a[k] = v end
    return a
  end

  local function ids(records)
    local out = {}
    for i, r in ipairs(records) do out[i] = r.id .. ":" .. r.level end
    return out
  end

  local function run(over)
    local ctx = { meta_status = "ok", settings = settings(), analysis = analysis(), visible_layers = 1, frames = 1, frame = 1 }
    for k, v in pairs(over or {}) do ctx[k] = v end
    return checks.run(ctx)
  end

  T.test("a clean sprite has no records", function()
    T.eq(#run(), 0)
  end)

  T.test("missing and damaged settings", function()
    T.list_eq(ids(run({ meta_status = "absent", analysis = false })), { "meta-absent:info" })
    local r = run({ meta_status = "invalid", meta_reason = "bad CRC" })
    T.eq(r[1].id, "meta-invalid")
    T.eq(r[1].message, "Template settings are damaged (bad CRC). Using the values entered in this dialog.")
  end)

  T.test("invalid dialog settings are errors", function()
    local r = run({ settings_errors = { "metrics.baseline must be smaller than cell.h" }, settings = false })
    T.list_eq(ids(r), { "settings-invalid:error" })
    T.truthy(checks.has_error(r))
  end)

  T.test("size mismatch, cells outside and extra area", function()
    local a = analysis({
      outside = { glyph(0x42, { col = 1, row = 0 }) },
      geometry = { image_w = 20, image_h = 12, grid_w = 16, grid_h = 8 },
      counts = { impure = 0, ink = 5, marker_pixels = 0, guide = 0, assigned = 2, inside = 1 },
    })
    local r = run({ analysis = a })
    T.list_eq(ids(r), { "size-mismatch:warning", "cells-outside:warning", "extra-area:warning", "extra-area:warning" })
    T.eq(r[1].message, "Image is 20x12 but the grid expects 16x8.")
    T.eq(r[2].message, '1 cell is outside the image and was skipped: U+0042 "B" (row 1, column 2)')
    T.eq(r[3].message, "4 pixel columns to the right of the grid are ignored.")
    T.eq(r[4].message, "4 pixel rows below the grid are ignored.")
  end)

  T.test("no cell inside the image is an error and sorts first", function()
    local a = analysis({ counts = { impure = 3, ink = 0, marker_pixels = 0, guide = 0, assigned = 2, inside = 0 } })
    T.list_eq(ids(run({ analysis = a })), { "no-cells:error" })
  end)

  T.test("no layer visible, several frames", function()
    T.list_eq(ids(run({ visible_layers = 0 })), { "no-visible-layer:error" })
    local r = run({ frames = 3, frame = 2 })
    T.list_eq(ids(r), { "frames-ignored:info" })
    T.eq(r[1].message, "Only frame 2 is exported.")
  end)

  T.test("no ink is an error", function()
    local a = analysis({ counts = { impure = 0, ink = 0, marker_pixels = 0, guide = 0, assigned = 2, inside = 2 } })
    local r = run({ analysis = a })
    T.list_eq(ids(r), { "no-ink:error" })
  end)

  T.test("impure pixels, singular and plural", function()
    local one = analysis({ counts = { impure = 1, ink = 4, marker_pixels = 0, guide = 0, assigned = 2, inside = 2 } })
    T.eq(run({ analysis = one })[1].message, "1 pixel is not pure black, white or magenta and was thresholded.")
    local many = analysis({ counts = { impure = 12, ink = 4, marker_pixels = 0, guide = 0, assigned = 2, inside = 2 } })
    T.eq(run({ analysis = many })[1].message, "12 pixels are not pure black, white or magenta and were thresholded.")
  end)

  T.test("empty glyphs skip blank characters and name at most 8", function()
    local gs = {}
    for i = 1, 10 do gs[i] = glyph(0x40 + i, { has_ink = false }) end
    gs[11] = glyph(0x20, { has_ink = false, blank = true })
    gs[12] = glyph(0x5A)
    local r = run({ analysis = analysis({ glyphs = gs }) })
    T.list_eq(ids(r), { "empty-glyphs:warning" })
    T.eq(r[1].message,
      '10 characters are empty: U+0041 "A"; U+0042 "B"; U+0043 "C"; U+0044 "D"; U+0045 "E"; U+0046 "F"; U+0047 "G"; U+0048 "H"; and 2 more')
  end)

  T.test("a template with no drawing yet reports no-ink, and no empty glyphs", function()
    local gs = { glyph(0x41, { has_ink = false }), glyph(0x42, { has_ink = false }) }
    local a = analysis({ glyphs = gs, counts = { impure = 5, ink = 0, marker_pixels = 0, guide = 5, assigned = 2, inside = 2 } })
    T.list_eq(ids(run({ analysis = a })), { "no-ink:error", "impure-pixels:warning", "template-visible:warning" })
  end)

  T.test("partial magenta column and ink beyond the width", function()
    local gs = { glyph(0x41, { mixed = true }), glyph(0x42, { beyond = true }) }
    local r = run({ analysis = analysis({ glyphs = gs }) })
    T.list_eq(ids(r), { "marker-mixed:warning", "ink-beyond-width:warning" })
    T.eq(r[1].message, '1 character has a partial magenta column: U+0041 "A"')
    T.eq(r[2].message, 'Ink beyond the magenta in 1 character: U+0042 "B"')
  end)

  T.test("a visible template is noticed", function()
    local counts = { impure = 0, ink = 4, marker_pixels = 6, guide = 3, assigned = 2, inside = 2 }
    T.list_eq(ids(run({ analysis = analysis({ counts = counts }) })), { "template-visible:warning" })
  end)

  T.test("the spacing is explained: magenta found, none found, or magenta ignored by choice", function()
    local detected = run({ mode_reason = "detected" })
    T.list_eq(ids(detected), { "mode-detected:info" })
    T.eq(detected[1].message, "Magenta found: variable spacing selected.")
    local none = run({ mode_reason = "none" })
    T.eq(none[1].message, "No magenta found: monospace spacing.")
    local chosen = run({ mode_reason = "chosen" })
    T.list_eq(ids(chosen), { "marker-ignored:info" })
    T.eq(chosen[1].message, "Magenta found but ignored: monospace spacing selected.")
    T.list_eq(ids(run({ mode_reason = "ok" })), {})
  end)

  T.test("positions are one-based, printable ASCII is quoted, other characters are not", function()
    local gs = { glyph(0x5F, { has_ink = false, col = 15, row = 3 }), glyph(0xE9, { has_ink = false, col = 0, row = 0 }) }
    local r = run({ analysis = analysis({ glyphs = gs }) })
    T.eq(r[1].message, '2 characters are empty: U+005F "_" (row 4, column 16); U+00E9 (row 1, column 1)')
  end)

  T.test("unusual cell size is informative", function()
    local r = run({ settings = settings({ cell = { w = 7, h = 9 } }) })
    T.list_eq(ids(r), { "cell-size-unusual:info" })
    T.eq(r[1].message, "Cell size 7x9 is not a multiple of 8.")
  end)

  T.test("errors come first, then warnings, then info", function()
    local a = analysis({
      counts = { impure = 2, ink = 0, marker_pixels = 0, guide = 0, assigned = 2, inside = 2 },
      geometry = { image_w = 16, image_h = 9, grid_w = 16, grid_h = 8 },
    })
    local r = run({ analysis = a, frames = 2, settings = settings({ cell = { w = 7, h = 9 } }) })
    local levels = {}
    for i, rec in ipairs(r) do levels[i] = rec.level end
    local rank = { error = 1, warning = 2, info = 3 }
    for i = 2, #levels do T.truthy(rank[levels[i - 1]] <= rank[levels[i]], table.concat(levels, ",")) end
    T.eq(r[1].level, "error")
  end)
end
