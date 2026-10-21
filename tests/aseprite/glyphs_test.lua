local meta = require("digiface.meta")
local glyphs = require("digiface.glyphs")

return function(T)
  -- ASCII art pixel source. '#' black, '.' or ' ' white, 'M' magenta, 'g' grey, 'o' light grey.
  local COLORS = {
    ["#"] = { 0, 0, 0 }, ["."] = { 255, 255, 255 }, [" "] = { 255, 255, 255 }, M = { 255, 0, 255 },
    g = { 128, 128, 128 }, o = { 244, 244, 244 },
  }
  local function source(rows)
    return {
      width = #rows[1], height = #rows,
      rgb = function(x, y)
        local c = COLORS[rows[y + 1]:sub(x + 1, x + 1)]
        return c[1], c[2], c[3]
      end,
    }
  end

  local function settings(over)
    local m = { v = 1, cell = { w = 6, h = 3 }, grid = { cols = 1, rows = 1 }, mode = "var", map = { "0041" } }
    for k, v in pairs(over or {}) do m[k] = v end
    return meta.with_defaults(m)
  end

  local function one(rows, over)
    local a = glyphs.analyze(source(rows), settings(over))
    return a.glyphs[1], a
  end

  T.test("variable width: markers at the right set the advance", function()
    local g = one({ "##..MM", "#...MM", "##..MM" })
    T.eq(g.origin, 0); T.eq(g.width, 4); T.eq(g.advance, 4)
    T.list_eq(g.ink_rows, { "##..", "#...", "##.." })
    T.truthy(g.has_ink)
  end)

  T.test("variable width: leading markers move the origin", function()
    local g = one({ "MM##..", "MM#...", "MM##.." })
    T.eq(g.origin, 2); T.eq(g.width, 4); T.eq(g.advance, 4)
    T.list_eq(g.ink_rows, { "##..", "#...", "##.." })
  end)

  T.test("variable width: no marker keeps the full width", function()
    local g = one({ "##....", "#.....", "##...." })
    T.eq(g.advance, 6); T.eq(g.width, 6)
  end)

  T.test("variable width: a cell of markers only has advance 0, plus spacing", function()
    T.eq(one({ "MMMMMM", "MMMMMM", "MMMMMM" }).advance, 0)
    local g = one({ "MMMMMM", "MMMMMM", "MMMMMM" }, { metrics = { spacing = 2 } })
    T.eq(g.advance, 2)
  end)

  T.test("spacing is added to the advance", function()
    T.eq(one({ "##..MM", "#...MM", "##..MM" }, { metrics = { spacing = 1 } }).advance, 5)
  end)

  T.test("a partial magenta column is flagged and does not count as a marker", function()
    local g = one({ "##..M.", "#...M.", "##...." })
    T.truthy(g.mixed)
    T.eq(g.advance, 6)
  end)

  T.test("ink beyond the magenta is flagged and clipped", function()
    local g = one({ "##M#..", "#.M...", "##M..." })
    T.eq(g.advance, 2)
    T.truthy(g.beyond)
    T.list_eq(g.ink_rows, { "##", "#.", "##" })
  end)

  T.test("monospace ignores the markers", function()
    local g = one({ "##..MM", "#...MM", "##..MM" }, { mode = "mono" })
    T.eq(g.advance, 6); T.eq(g.origin, 0); T.eq(g.width, 6)
    T.eq(g.mixed, nil)
  end)

  T.test("auto width follows the ink and ignores the markers", function()
    local g = one({ "#.....", "..#...", ".#...." }, { widthSource = "auto" })
    T.eq(g.advance, 3)
    local empty = one({ "......", "......", "......" }, { widthSource = "auto" })
    T.eq(empty.advance, 3)
    T.truthy(not empty.has_ink)
  end)

  T.test("light ink on a dark background", function()
    local a = glyphs.analyze({
      width = 6, height = 3,
      rgb = function(x, y) if x < 2 then return 224, 248, 207 end return 7, 24, 33 end,
    }, settings({ ink = "light", mode = "mono" }))
    T.eq(a.glyphs[1].ink_rows[1], "##....")
    T.eq(a.counts.impure, 18)
  end)

  T.test("impure pixels and guide colors are counted", function()
    local _, a = one({ "g#.oMM", "......", "......" })
    T.eq(a.counts.impure, 2)
    T.eq(a.counts.guide, 1)
    T.eq(a.counts.ink, 1)
    T.eq(a.counts.marker_pixels, 2)
  end)

  T.test("cells outside the image are reported, not read", function()
    local a = glyphs.analyze(source({ "##..MM", "#...MM", "##..MM" }),
      settings({ grid = { cols = 1, rows = 2 }, map = { "0041", "0042" } }))
    T.eq(#a.glyphs, 2)
    T.truthy(a.glyphs[1].inside)
    T.truthy(not a.glyphs[2].inside)
    T.eq(#a.outside, 1)
    T.eq(a.outside[1].cp, 0x42); T.eq(a.outside[1].col, 0); T.eq(a.outside[1].row, 1)
    T.eq(a.counts.inside, 1)
  end)

  T.test("unassigned cells are skipped and the index follows reading order", function()
    local src = source({ "##..MM#.....", "#...MM......", "##..MM......" })
    local a = glyphs.analyze(src, settings({ grid = { cols = 2, rows = 1 }, map = { "_", "0042" } }))
    T.eq(#a.glyphs, 1)
    T.eq(a.glyphs[1].cp, 0x42)
    T.eq(a.glyphs[1].col, 1)
    T.eq(a.glyphs[1].ink_rows[1], "#.....")
  end)
end
