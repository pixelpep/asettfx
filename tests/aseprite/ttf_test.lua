local ttf = require("asettfx.ttf")
local meta = require("asettfx.meta")
local reader = require("ttf_reader")

return function(T)
  local TIME = 1760000000

  local function settings(over)
    local m = { v = 1, cell = { w = 8, h = 8 }, grid = { cols = 16, rows = 1 }, mode = "var", map = { "0020-007E" },
      metrics = { baseline = 1 } }
    for k, v in pairs(over or {}) do m[k] = v end
    return meta.with_defaults(m)
  end

  local function glyph(cp, rows, advance)
    return { cp = cp, inside = true, has_ink = rows ~= nil, ink_rows = rows or {}, advance = advance or 8, blank = false }
  end

  local H = { "#...#", "#...#", "#####", "#...#", "#...#", "#...#", "#...#", "....." }
  local O = { ".###.", "#...#", "#...#", "#...#", "#...#", ".###.", ".....", "....." }
  local CHECK = { "#.#.", ".#.#", "#.#.", ".#.#", "#.#.", ".#.#", "#.#.", ".#.#" }

  local function build(glyphs, s, options)
    local opts = { timestamp = TIME }
    for k, v in pairs(options or {}) do opts[k] = v end
    local font, info = ttf.build({ glyphs = glyphs }, s or settings(), opts)
    return font, info, reader.parse(font)
  end

  -- fills the glyph in a grid of '#' and '.' from its outline (non-zero winding at pixel centres)
  local function rasterize(f, gid, cell_h, baseline, width)
    local contours = reader.glyph(f, gid)
    local rows = {}
    for y = 0, cell_h - 1 do
      local line = {}
      for x = 0, width - 1 do
        local px, py = x * 64 + 32, (cell_h - y - baseline) * 64 - 32
        local w = 0
        for _, c in ipairs(contours) do
          for i = 1, #c do
            local a, b = c[i], c[i % #c + 1]
            local cross = (b[1] - a[1]) * (py - a[2]) - (px - a[1]) * (b[2] - a[2])
            if a[2] <= py and b[2] > py and cross > 0 then w = w + 1
            elseif a[2] > py and b[2] <= py and cross < 0 then w = w - 1 end
          end
        end
        line[#line + 1] = w ~= 0 and "#" or "."
      end
      rows[#rows + 1] = table.concat(line)
    end
    return rows
  end

  T.test("table directory: sorted tags, aligned offsets, checksums and the whole-file adjustment", function()
    local font, _, f = build({ glyph(0x48, H, 5), glyph(0x4F, O, 5) })
    T.eq(f.sfnt, 0x00010000)
    T.list_eq(f.order, { "OS/2", "cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "post" })
    for _, tag in ipairs(f.order) do
      local t = f.tables[tag]
      T.eq(t.offset % 4, 0, tag .. " offset")
      local data = t.data
      if tag == "head" then data = data:sub(1, 8) .. "\0\0\0\0" .. data:sub(13) end
      T.eq(reader.checksum(data), t.checksum, tag .. " checksum")
    end
    T.eq(reader.checksum(font), 0xB1B0AFBA)
    T.eq(#font % 4, 0)
    T.eq(f.head.magic, 0x5F0F3CF5)
  end)

  T.test("head and hhea follow the cell size and baseline", function()
    local _, _, f = build({ glyph(0x48, H, 5) }, settings({ cell = { w = 8, h = 16 }, metrics = { baseline = 3 } }))
    T.eq(f.head.upm, 16 * 64)
    T.eq(f.head.flags, 0x000B)
    T.eq(f.head.lowest_ppem, 16)
    T.eq(f.hhea.ascender, 13 * 64)
    T.eq(f.hhea.descender, -3 * 64)
    T.eq(f.hhea.num_metrics, f.num_glyphs)
  end)

  T.test("glyph order, metrics and the cmap", function()
    local _, info, f = build({ glyph(0x4F, O, 5), glyph(0x48, H, 6), glyph(0x20, nil, 3) })
    T.eq(f.num_glyphs, 4)
    T.eq(info.glyphs, 4)
    local map = f.cmap["3,1"].map
    T.eq(map[0x20], 1); T.eq(map[0x48], 2); T.eq(map[0x4F], 3)
    T.eq(map[0x41], nil)
    T.eq(f.cmap["0,3"].format, 4)
    T.eq(f.hmtx[0].advance, 8 * 64)
    T.eq(f.hmtx[1].advance, 3 * 64); T.eq(f.hmtx[1].lsb, 0)
    T.eq(f.hmtx[2].advance, 6 * 64)
    T.eq(f.hmtx[3].advance, 5 * 64)
  end)

  T.test("outlines drawn back from the font equal the ink, baseline included", function()
    local _, _, f = build({ glyph(0x48, H, 5), glyph(0x4F, O, 5), glyph(0x23, CHECK, 4) })
    local expected = { [0x48] = { H, 5 }, [0x4F] = { O, 5 }, [0x23] = { CHECK, 4 } }
    for cp, e in pairs(expected) do
      local gid = f.cmap["3,1"].map[cp]
      local got = rasterize(f, gid, 8, 1, #e[1][1])
      local want = {}
      for y, row in ipairs(e[1]) do want[y] = row end
      for y = 1, 8 do T.eq(got[y], want[y], string.format("U+%04X row %d", cp, y)) end
    end
  end)

  T.test("left side bearing equals the smallest x, and every glyph box is exact", function()
    local _, _, f = build({ glyph(0x2E, { "...", "...", "...", "...", "...", "...", ".#.", "..." }, 3) })
    local gid = f.cmap["3,1"].map[0x2E]
    local contours, box = reader.glyph(f, gid)
    T.eq(f.hmtx[gid].lsb, box.xmin)
    T.eq(box.xmin, 64); T.eq(box.xmax, 128)
    T.eq(box.ymin, 0 * 64); T.eq(box.ymax, 64)  -- row 6 of 8 with baseline 1 sits on the baseline
    T.eq(#contours, 1)
  end)

  T.test("a hollow glyph keeps its hole turning the other way", function()
    local _, _, f = build({ glyph(0x4F, { "###", "#.#", "###", "...", "...", "...", "...", "..." }, 4) })
    local contours = reader.glyph(f, f.cmap["3,1"].map[0x4F])
    T.eq(#contours, 2)
    local function area(c)
      local s = 0
      for i = 1, #c do local a, b = c[i], c[i % #c + 1]; s = s + a[1] * b[2] - b[1] * a[2] end
      return s / 2
    end
    local a1, a2 = area(contours[1]), area(contours[2])
    T.truthy((a1 < 0) ~= (a2 < 0), "opposite winding")
    -- y is up in the font, so the outer contour has negative area (clockwise)
    T.truthy(math.min(a1, a2) < 0 and math.max(a1, a2) > 0)
    T.eq(math.abs(a1) + math.abs(a2) - 2 * math.min(math.abs(a1), math.abs(a2)) > 0, true)
  end)

  T.test("only spaces and drawn characters become glyphs", function()
    local list = {
      glyph(0x41, H, 5), glyph(0x20, nil, 3), glyph(0xA0, nil, 3),
      glyph(0x42, nil, 5),          -- undrawn letter
      glyph(0x7F, nil, 8),          -- control character
      glyph(0x200B, nil, 0),        -- zero width space (format character)
      glyph(0x2003, nil, 6),        -- em space (Zs)
    }
    local _, _, f = build(list)
    local map = f.cmap["3,1"].map
    T.truthy(map[0x41] and map[0x20] and map[0xA0] and map[0x2003])
    T.eq(map[0x42], nil); T.eq(map[0x7F], nil); T.eq(map[0x200B], nil)
    T.eq(f.num_glyphs, 5)
  end)

  T.test("glyphs outside the image are not exported", function()
    local g = glyph(0x41, H, 5)
    g.inside = false
    T.eq(pcall(build, { g }), false)
  end)

  T.test("no glyph at all is an error", function()
    T.eq(pcall(build, {}), false)
  end)

  T.test(".notdef is a visible box", function()
    local _, _, f = build({ glyph(0x41, H, 5) })
    local contours = reader.glyph(f, 0)
    T.eq(#contours, 2)
    local rows = rasterize(f, 0, 8, 1, 8)
    T.eq(rows[1], "........")
    T.eq(rows[2], ".######.")
    T.eq(rows[3], ".#....#.")
    T.eq(rows[7], ".######.")
    T.eq(rows[8], "........")
  end)

  T.test("characters above U+FFFF get a format 12 cmap and the BMP ones stay in format 4", function()
    local _, _, f = build({ glyph(0x41, H, 5), glyph(0x1F600, O, 5), glyph(0x1F601, O, 5) })
    T.eq(f.cmap["3,10"].format, 12)
    T.eq(f.cmap["0,4"].format, 12)
    T.eq(f.cmap["3,10"].map[0x1F600], 2)
    T.eq(f.cmap["3,10"].map[0x1F601], 3)
    T.eq(f.cmap["3,10"].map[0x41], 1)
    T.eq(f.cmap["3,1"].map[0x1F600], nil)
    T.eq(f.cmap["3,1"].map[0x41], 1)
  end)

  T.test("separate code point runs make separate cmap segments with the right glyph ids", function()
    local list = {}
    for _, cp in ipairs({ 0x41, 0x42, 0x43, 0x45, 0x100, 0x101, 0x3042 }) do list[#list + 1] = glyph(cp, O, 5) end
    local _, _, f = build(list)
    local map = f.cmap["3,1"].map
    for i, cp in ipairs({ 0x41, 0x42, 0x43, 0x45, 0x100, 0x101, 0x3042 }) do T.eq(map[cp], i, string.format("U+%04X", cp)) end
    T.eq(map[0x44], nil)
  end)

  T.test("large fonts switch to the long loca format and still read back", function()
    local list = {}
    local CHECK8 = {}
    for y = 1, 8 do CHECK8[y] = y % 2 == 1 and "#.#.#.#." or ".#.#.#.#" end
    for i = 0, 699 do list[#list + 1] = glyph(0x4E00 + i, CHECK8, 8) end
    local _, info, f = build(list, settings({ cell = { w = 8, h = 8 }, grid = { cols = 16, rows = 44 }, map = { "4E00-50BB" } }))
    T.truthy(#f.tables.glyf.data > 0x1FFFE, "glyf is large enough")
    T.eq(f.head.loca_format, 1)
    T.eq(f.num_glyphs, 701)
    local rows = rasterize(f, f.cmap["3,1"].map[0x4E00 + 150], 8, 1, 8)
    for y = 1, 8 do T.eq(rows[y], CHECK8[y]) end
  end)

  T.test("names: Windows strings in UTF-16, PostScript name restricted", function()
    local _, _, f = build({ glyph(0x41, H, 5) }, nil, { family = "Pixel Café 🙂", copyright = "© pixelPep" })
    T.eq(f.names["3:1"], "Pixel Café 🙂")
    T.eq(f.names["3:2"], "Regular")
    T.eq(f.names["3:0"], "© pixelPep")
    T.eq(f.names["3:5"], "Version 1.000")
    T.eq(f.names["3:6"], "PixelCaf-Regular")
    T.eq(f.names["1:1"], nil, "no Macintosh record when a name is not ASCII")
    local _, _, plain = build({ glyph(0x41, H, 5) }, nil, { family = "My Font", subfamily = "Bold" })
    T.eq(plain.names["1:1"], "My Font")
    T.eq(plain.names["3:4"], "My Font Bold")
    T.eq(plain.names["3:6"], "MyFont-Bold")
  end)

  T.test("OS/2: x height, cap height, character range and Unicode blocks", function()
    local X = { ".....", ".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#" }  -- top at row 3: 4 px above the baseline
    local _, _, f = build({ glyph(0x48, H, 5), glyph(0x78, X, 5), glyph(0xE9, O, 5) })
    local os2 = f.tables["OS/2"].data
    T.eq(#os2, 96)
    T.eq(string.unpack(">I2", os2, 1), 4)
    T.eq(string.unpack(">i2", os2, 87), 4 * 64, "x height measured from the glyph x")
    T.eq(string.unpack(">i2", os2, 89), 7 * 64, "cap height measured from the glyph H")
    T.eq(string.unpack(">I2", os2, 65), 0x48)
    T.eq(string.unpack(">I2", os2, 67), 0xE9)
    local range1 = string.unpack(">I4", os2, 43)
    T.eq(range1 & 3, 3, "Basic Latin and Latin-1")
    local _, _, g = build({ glyph(0x48, H, 5) }, settings({ metrics = { baseline = 1, xHeight = 4, capHeight = 6 } }))
    T.eq(string.unpack(">i2", g.tables["OS/2"].data, 87), 4 * 64)
    T.eq(string.unpack(">i2", g.tables["OS/2"].data, 89), 6 * 64)
  end)

  T.test("post is format 3 and flags a fixed pitch font", function()
    local _, _, mono = build({ glyph(0x48, H, 8), glyph(0x4F, O, 8) }, nil)
    local post = mono.tables.post.data
    T.eq(string.unpack(">I4", post, 1), 0x00030000)
    T.eq(string.unpack(">I4", post, 13), 1, "every advance is 8 pixels, .notdef included")
    local _, _, prop = build({ glyph(0x48, H, 5), glyph(0x4F, O, 6) })
    T.eq(string.unpack(">I4", prop.tables.post.data, 13), 0)
    T.eq(#prop.tables.post.data, 32)
  end)

  T.test("same input and time give identical bytes", function()
    local a = build({ glyph(0x48, H, 5), glyph(0x4F, O, 5) })
    local b = build({ glyph(0x4F, O, 5), glyph(0x48, H, 5) })
    T.eq(a, b)
  end)
end
