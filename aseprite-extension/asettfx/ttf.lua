-- Writes a TrueType font from the glyph analysis, see spec/TTF.md. Pure Lua: string.pack and nothing else.
local outline = require("asettfx.outline")

local M = {}

local SCALE = 64  -- font units per pixel

local function u16(v) return string.pack(">I2", v & 0xFFFF) end
local function i16(v) return string.pack(">i2", v) end
local function u32(v) return string.pack(">I4", v & 0xFFFFFFFF) end

local function pad4(data)
  local extra = (4 - #data % 4) % 4
  return extra == 0 and data or data .. string.rep("\0", extra)
end

local function checksum(data)
  data = pad4(data)
  local sum = 0
  for i = 1, #data, 4 do sum = (sum + string.unpack(">I4", data, i)) & 0xFFFFFFFF end
  return sum
end

local function floor_log2(n)
  local k = 0
  while (1 << (k + 1)) <= n do k = k + 1 end
  return k
end

-- Space separators (Unicode Zs). They are glyphs even without ink.
local SPACES = { 0x20, 0xA0, 0x1680, 0x202F, 0x205F, 0x3000 }
local function is_space(cp)
  if cp >= 0x2000 and cp <= 0x200A then return true end
  for _, s in ipairs(SPACES) do if s == cp then return true end end
  return false
end

-- Typographic characters that word processors insert in place of the plain ones. When the font has the plain glyph
-- and no glyph of its own for the typographic character, the character uses the plain glyph.
local ALIASES = {
  [0x2018] = 0x27, [0x2019] = 0x27, [0x201B] = 0x27,                                -- single quotes -> '
  [0x201C] = 0x22, [0x201D] = 0x22, [0x201F] = 0x22,                                -- double quotes -> "
  [0x2010] = 0x2D, [0x2011] = 0x2D, [0x2012] = 0x2D, [0x2013] = 0x2D, [0x2014] = 0x2D, [0x2212] = 0x2D,  -- dashes, minus -> -
  [0x00A0] = 0x20,                                                                  -- no-break space -> space
}

-- Returns how many characters were added to glyphs as aliases.
local function add_aliases(glyphs)
  local by_cp = {}
  for _, g in ipairs(glyphs) do if g.cp then by_cp[g.cp] = g end end
  local cps = {}
  for cp in pairs(ALIASES) do cps[#cps + 1] = cp end
  table.sort(cps)
  local added = 0
  for _, cp in ipairs(cps) do
    local target = by_cp[ALIASES[cp]]
    if target and not by_cp[cp] then
      target.aliases = target.aliases or {}
      target.aliases[#target.aliases + 1] = cp
      added = added + 1
    end
  end
  return added
end

-- Every code point a glyph answers to: its own, then its aliases.
local function code_points(g)
  local out = {}
  if g.cp then out[1] = g.cp end
  for _, cp in ipairs(g.aliases or {}) do out[#out + 1] = cp end
  return out
end

-- Glyphs ------------------------------------------------------------------

local function convert(contours, settings)
  local out = {}
  for _, contour in ipairs(contours) do
    local points = {}
    for i, p in ipairs(contour) do
      points[i] = { p[1] * SCALE, (settings.cell_h - p[2] - settings.baseline) * SCALE }
    end
    out[#out + 1] = points
  end
  return out
end

local function bounds(contours)
  local x0, y0, x1, y1
  for _, contour in ipairs(contours) do
    for _, p in ipairs(contour) do
      x0 = math.min(x0 or p[1], p[1]); x1 = math.max(x1 or p[1], p[1])
      y0 = math.min(y0 or p[2], p[2]); y1 = math.max(y1 or p[2], p[2])
    end
  end
  return x0 or 0, y0 or 0, x1 or 0, y1 or 0
end

local function notdef(settings)
  local w = settings.cell_w
  local top = math.max(2, settings.cell_h - settings.baseline - 1)
  local x0, x1 = (w >= 3) and 1 or 0, (w >= 3) and (w - 1) or w
  local contours = { { { x0, 0 }, { x0, top }, { x1, top }, { x1, 0 } } }  -- clockwise, y up
  if x1 - x0 >= 3 and top >= 3 then
    contours[2] = { { x0 + 1, 1 }, { x1 - 1, 1 }, { x1 - 1, top - 1 }, { x0 + 1, top - 1 } }  -- counter-clockwise
  end
  for _, c in ipairs(contours) do
    for _, p in ipairs(c) do p[1], p[2] = p[1] * SCALE, p[2] * SCALE end
  end
  return { name = ".notdef", advance = w * SCALE, contours = contours }
end

-- Glyph list: .notdef, then the included characters in code point order.
local function collect(analysis, settings)
  local list = {}
  for _, g in ipairs(analysis.glyphs) do
    if g.inside and (g.has_ink or is_space(g.cp)) then
      local contours = g.has_ink and convert(outline.trace(g.ink_rows), settings) or {}
      list[#list + 1] = { cp = g.cp, advance = g.advance * SCALE, contours = contours }
    end
  end
  table.sort(list, function(a, b) return a.cp < b.cp end)
  table.insert(list, 1, notdef(settings))
  for _, g in ipairs(list) do
    g.xmin, g.ymin, g.xmax, g.ymax = bounds(g.contours)
    g.lsb = #g.contours > 0 and g.xmin or 0
  end
  return list
end

local function encode_glyph(g)
  if #g.contours == 0 then return "" end
  local ends, xs, ys, n = {}, {}, {}, 0
  for _, contour in ipairs(g.contours) do
    for _, p in ipairs(contour) do n = n + 1; xs[n] = p[1]; ys[n] = p[2] end
    ends[#ends + 1] = n - 1
  end

  local flags, xb, yb = {}, {}, {}
  local px, py = 0, 0
  for i = 1, n do
    local flag = 0x01  -- on curve
    local dx, dy = xs[i] - px, ys[i] - py
    px, py = xs[i], ys[i]
    if dx == 0 then flag = flag | 0x10
    elseif dx >= -255 and dx <= 255 then
      flag = flag | 0x02 | (dx > 0 and 0x10 or 0)
      xb[#xb + 1] = string.pack(">B", math.abs(dx))
    else xb[#xb + 1] = i16(dx) end
    if dy == 0 then flag = flag | 0x20
    elseif dy >= -255 and dy <= 255 then
      flag = flag | 0x04 | (dy > 0 and 0x20 or 0)
      yb[#yb + 1] = string.pack(">B", math.abs(dy))
    else yb[#yb + 1] = i16(dy) end
    flags[i] = string.pack(">B", flag)
  end

  local parts = { i16(#g.contours), i16(g.xmin), i16(g.ymin), i16(g.xmax), i16(g.ymax) }
  for _, e in ipairs(ends) do parts[#parts + 1] = u16(e) end
  parts[#parts + 1] = u16(0)  -- no instructions
  parts[#parts + 1] = table.concat(flags)
  parts[#parts + 1] = table.concat(xb)
  parts[#parts + 1] = table.concat(yb)
  return pad4(table.concat(parts))
end

-- Tables ------------------------------------------------------------------

local function build_head(info, settings, timestamp)
  local stamp = timestamp + 2082844800  -- seconds from 1904-01-01
  return table.concat({
    u32(0x00010000), u32(0x00010000), u32(0), u32(0x5F0F3CF5),
    u16(0x000B), u16(settings.cell_h * SCALE),
    string.pack(">i8", stamp), string.pack(">i8", stamp),
    i16(info.xmin), i16(info.ymin), i16(info.xmax), i16(info.ymax),
    u16(0), u16(settings.cell_h), i16(2), i16(info.long_loca and 1 or 0), i16(0),
  })
end

local function build_hhea(info, settings, glyphs)
  local max_advance, min_lsb, min_rsb, max_extent
  for _, g in ipairs(glyphs) do
    max_advance = math.max(max_advance or 0, g.advance)
    if #g.contours > 0 then
      local rsb = g.advance - g.xmax
      min_lsb = math.min(min_lsb or g.lsb, g.lsb)
      min_rsb = math.min(min_rsb or rsb, rsb)
      max_extent = math.max(max_extent or g.xmax, g.xmax)
    end
  end
  return table.concat({
    u32(0x00010000),
    i16((settings.cell_h - settings.baseline) * SCALE), i16(-settings.baseline * SCALE), i16(0),
    u16(max_advance), i16(min_lsb or 0), i16(min_rsb or 0), i16(max_extent or 0),
    i16(1), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), u16(#glyphs),
  })
end

local function build_maxp(glyphs)
  local max_points, max_contours = 0, 0
  for _, g in ipairs(glyphs) do
    local points = 0
    for _, c in ipairs(g.contours) do points = points + #c end
    max_points = math.max(max_points, points)
    max_contours = math.max(max_contours, #g.contours)
  end
  return table.concat({
    u32(0x00010000), u16(#glyphs), u16(max_points), u16(max_contours),
    u16(0), u16(0), u16(1), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0),
  })
end

-- Unicode blocks reported in OS/2 ulUnicodeRange: {first, last, bit}
local BLOCKS = {
  { 0x0000, 0x007F, 0 }, { 0x0080, 0x00FF, 1 }, { 0x0100, 0x017F, 2 }, { 0x0180, 0x024F, 3 },
  { 0x0250, 0x02AF, 4 }, { 0x02B0, 0x02FF, 5 }, { 0x0300, 0x036F, 6 }, { 0x0370, 0x03FF, 7 },
  { 0x0400, 0x04FF, 9 }, { 0x2000, 0x206F, 31 }, { 0x20A0, 0x20CF, 33 },
}

local function unicode_ranges(glyphs)
  local words = { 0, 0, 0, 0 }
  local function set(bit) local w = bit // 32 + 1; words[w] = words[w] | (1 << (bit % 32)) end
  for _, g in ipairs(glyphs) do
    for _, cp in ipairs(code_points(g)) do
      if cp > 0xFFFF then set(57) end
      for _, b in ipairs(BLOCKS) do
        if cp >= b[1] and cp <= b[2] then set(b[3]) end
      end
    end
  end
  return words
end

local function glyph_top(glyphs, cp)
  for _, g in ipairs(glyphs) do if g.cp == cp and #g.contours > 0 then return g.ymax end end
end

local function build_os2(info, settings, glyphs)
  local ascender = (settings.cell_h - settings.baseline) * SCALE
  local descender = -settings.baseline * SCALE
  local x_height = settings.x_height and settings.x_height * SCALE or glyph_top(glyphs, 0x78) or 0
  local cap_height = settings.cap_height and settings.cap_height * SCALE or glyph_top(glyphs, 0x48) or 0
  local total, count, first, last = 0, 0, 0xFFFF, 0
  for _, g in ipairs(glyphs) do
    if g.advance > 0 then total = total + g.advance; count = count + 1 end
    for _, cp in ipairs(code_points(g)) do first = math.min(first, cp); last = math.max(last, cp) end
  end
  local ranges = unicode_ranges(glyphs)
  local half_w, half_h = settings.cell_w * SCALE // 2, settings.cell_h * SCALE // 2
  return table.concat({
    u16(4), i16(count > 0 and (total // count) or 0), u16(400), u16(5), u16(0),
    i16(half_w), i16(half_h), i16(0), i16(settings.cell_h * SCALE // 8),
    i16(half_w), i16(half_h), i16(0), i16(half_h),
    i16(SCALE), i16(x_height > 0 and x_height // 2 or ascender // 3), i16(0),
    string.rep("\0", 10),
    u32(ranges[1]), u32(ranges[2]), u32(ranges[3]), u32(ranges[4]),
    "    ", u16(0x00C0), u16(math.min(first, 0xFFFF)), u16(math.min(last, 0xFFFF)),
    i16(ascender), i16(descender), i16(0),
    u16(math.max(ascender, info.ymax)), u16(math.max(-descender, -info.ymin)),
    u32(1), u32(0),
    i16(x_height), i16(cap_height), u16(0), u16(0x20), u16(1),
  })
end

local function build_cmap(glyphs)
  -- code point -> glyph id, in order
  local entries = {}
  for gid, g in ipairs(glyphs) do
    for _, cp in ipairs(code_points(g)) do entries[#entries + 1] = { cp = cp, gid = gid - 1 } end
  end
  table.sort(entries, function(a, b) return a.cp < b.cp end)

  local function groups(limit)
    local out = {}
    for _, e in ipairs(entries) do
      if e.cp <= limit then
        local last = out[#out]
        if last and e.cp == last.last + 1 and e.gid == last.gid + (last.last - last.first + 1) then
          last.last = e.cp
        else
          out[#out + 1] = { first = e.cp, last = e.cp, gid = e.gid }
        end
      end
    end
    return out
  end

  -- format 4: BMP, one segment per run, then the mandatory 0xFFFF segment
  local bmp = groups(0xFFFE)
  local seg_count = #bmp + 1
  local ends, starts, deltas, offsets = {}, {}, {}, {}
  for i, grp in ipairs(bmp) do
    ends[i], starts[i], deltas[i], offsets[i] = u16(grp.last), u16(grp.first), u16(grp.gid - grp.first), u16(0)
  end
  ends[seg_count], starts[seg_count], deltas[seg_count], offsets[seg_count] = u16(0xFFFF), u16(0xFFFF), u16(1), u16(0)
  local search = 2 * (1 << floor_log2(seg_count))
  local body = table.concat({
    u16(seg_count * 2), u16(search), u16(floor_log2(seg_count)), u16(seg_count * 2 - search),
    table.concat(ends), u16(0), table.concat(starts), table.concat(deltas), table.concat(offsets),
  })
  local format4 = u16(4) .. u16(6 + #body) .. u16(0) .. body

  local subtables = { format4 }
  local records = { { 0, 3, 1 }, { 3, 1, 1 } }  -- platform, encoding, subtable index

  local wide = groups(0x10FFFF)
  local has_astral = false
  for _, e in ipairs(entries) do if e.cp > 0xFFFF then has_astral = true end end
  if has_astral then
    local rows = {}
    for _, grp in ipairs(wide) do rows[#rows + 1] = u32(grp.first) .. u32(grp.last) .. u32(grp.gid) end
    subtables[2] = u16(12) .. u16(0) .. u32(16 + 12 * #wide) .. u32(0) .. u32(#wide) .. table.concat(rows)
    records[#records + 1] = { 0, 4, 2 }
    records[#records + 1] = { 3, 10, 2 }
  end
  table.sort(records, function(a, b) if a[1] ~= b[1] then return a[1] < b[1] end return a[2] < b[2] end)

  local offset = 4 + 8 * #records
  local starts_at = {}
  for i, s in ipairs(subtables) do starts_at[i] = offset; offset = offset + #s end
  local parts = { u16(0), u16(#records) }
  for _, r in ipairs(records) do parts[#parts + 1] = u16(r[1]) .. u16(r[2]) .. u32(starts_at[r[3]]) end
  for _, s in ipairs(subtables) do parts[#parts + 1] = s end
  return table.concat(parts)
end

local function utf16be(s)
  local out = {}
  for _, cp in utf8.codes(s) do
    if cp >= 0x10000 then
      cp = cp - 0x10000
      out[#out + 1] = string.pack(">I2I2", 0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF))
    else
      out[#out + 1] = string.pack(">I2", cp)
    end
  end
  return table.concat(out)
end

local function build_name(names)
  local ids = {}
  for id in pairs(names) do ids[#ids + 1] = id end
  table.sort(ids)

  local ascii = true
  for _, text in pairs(names) do if text:find("[^\32-\126]") then ascii = false end end

  local records = {}
  for _, id in ipairs(ids) do
    if ascii then records[#records + 1] = { 1, 0, 0, id, names[id] } end
    records[#records + 1] = { 3, 1, 0x409, id, utf16be(names[id]) }
  end
  table.sort(records, function(a, b)
    for i = 1, 4 do if a[i] ~= b[i] then return a[i] < b[i] end end
    return false
  end)

  local dir, strings, offset = {}, {}, 0
  for _, r in ipairs(records) do
    dir[#dir + 1] = u16(r[1]) .. u16(r[2]) .. u16(r[3]) .. u16(r[4]) .. u16(#r[5]) .. u16(offset)
    strings[#strings + 1] = r[5]
    offset = offset + #r[5]
  end
  return u16(0) .. u16(#records) .. u16(6 + 12 * #records) .. table.concat(dir) .. table.concat(strings)
end

local function build_post(glyphs, settings)
  local fixed = 1
  for _, g in ipairs(glyphs) do if g.advance ~= glyphs[1].advance then fixed = 0 end end
  return table.concat({
    u32(0x00030000), u32(0), i16(-SCALE), i16(SCALE), u32(fixed), u32(0), u32(0), u32(0), u32(0),
  })
end

-- Entry point ---------------------------------------------------------------

-- analysis: glyphs.analyze result; settings: meta.with_defaults.
-- options: family, subfamily, copyright, version, timestamp (unix seconds), aliases (default true: typographic
-- quotes, dashes and the no-break space reuse the plain glyphs when they are not drawn).
-- Returns the font as a binary string and an info table {glyphs, bytes, aliases}.
function M.build(analysis, settings, options)
  options = options or {}
  local glyphs = collect(analysis, settings)
  if #glyphs < 2 then error("no glyph to export") end
  local aliases = options.aliases ~= false and add_aliases(glyphs) or 0

  local info = { long_loca = false }
  for _, g in ipairs(glyphs) do
    if #g.contours > 0 then
      info.xmin = math.min(info.xmin or g.xmin, g.xmin); info.xmax = math.max(info.xmax or g.xmax, g.xmax)
      info.ymin = math.min(info.ymin or g.ymin, g.ymin); info.ymax = math.max(info.ymax or g.ymax, g.ymax)
    end
  end
  info.xmin, info.ymin, info.xmax, info.ymax = info.xmin or 0, info.ymin or 0, info.xmax or 0, info.ymax or 0

  local glyf, offsets, pos = {}, {}, 0
  for i, g in ipairs(glyphs) do
    local data = encode_glyph(g)
    offsets[i] = pos
    glyf[i] = data
    pos = pos + #data
  end
  offsets[#glyphs + 1] = pos
  info.long_loca = pos > 0x1FFFE

  local loca = {}
  for i, off in ipairs(offsets) do loca[i] = info.long_loca and u32(off) or u16(off // 2) end

  local hmtx = {}
  for i, g in ipairs(glyphs) do hmtx[i] = u16(g.advance) .. i16(g.lsb) end

  local family = options.family or settings.name or "ASETTFX Font"
  local subfamily = options.subfamily or "Regular"
  local version = options.version or "Version 1.000"
  local ps = (family:gsub("[^%w]", "")) .. "-" .. (subfamily:gsub("[^%w]", ""))
  if ps:sub(1, 1) == "-" then ps = "Font" .. ps end
  local names = {
    [1] = family, [2] = subfamily, [3] = family .. ";" .. version .. ";ASETTFX",
    [4] = subfamily == "Regular" and family or (family .. " " .. subfamily), [5] = version, [6] = ps:sub(1, 63),
  }
  if options.copyright and options.copyright ~= "" then names[0] = options.copyright end

  local tables = {
    ["OS/2"] = build_os2(info, settings, glyphs),
    cmap = build_cmap(glyphs),
    glyf = table.concat(glyf),
    head = build_head(info, settings, options.timestamp or os.time()),
    hhea = build_hhea(info, settings, glyphs),
    hmtx = table.concat(hmtx),
    loca = table.concat(loca),
    maxp = build_maxp(glyphs),
    name = build_name(names),
    post = build_post(glyphs, settings),
  }

  local tags = {}
  for tag in pairs(tables) do tags[#tags + 1] = tag end
  table.sort(tags)

  local count = #tags
  local search = 16 * (1 << floor_log2(count))
  local parts = { u32(0x00010000), u16(count), u16(search), u16(floor_log2(count)), u16(count * 16 - search) }
  local offset = 12 + 16 * count
  local bodies = {}
  for _, tag in ipairs(tags) do
    local data = tables[tag]
    parts[#parts + 1] = tag .. u32(checksum(data)) .. u32(offset) .. u32(#data)
    bodies[#bodies + 1] = pad4(data)
    if tag == "head" then info.head_offset = offset end
    offset = offset + #pad4(data)
  end

  local font = table.concat(parts) .. table.concat(bodies)
  local adjustment = (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF
  font = font:sub(1, info.head_offset + 8) .. u32(adjustment) .. font:sub(info.head_offset + 13)

  info.glyphs, info.bytes, info.aliases = #glyphs, #font, aliases
  return font, info
end

return M
