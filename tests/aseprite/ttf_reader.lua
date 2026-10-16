-- A small independent TrueType reader for the tests: it only parses what the writer produces.
local M = {}

local function u16(s, o) return (string.unpack(">I2", s, o + 1)) end
local function i16(s, o) return (string.unpack(">i2", s, o + 1)) end
local function u32(s, o) return (string.unpack(">I4", s, o + 1)) end

function M.checksum(data)
  data = data .. string.rep("\0", (4 - #data % 4) % 4)
  local sum = 0
  for i = 1, #data, 4 do sum = (sum + string.unpack(">I4", data, i)) & 0xFFFFFFFF end
  return sum
end

function M.parse(font)
  local f = { raw = font, tables = {}, order = {} }
  f.sfnt = u32(font, 0)
  local count = u16(font, 4)
  for i = 0, count - 1 do
    local o = 12 + 16 * i
    local tag = font:sub(o + 1, o + 4)
    local t = { tag = tag, checksum = u32(font, o + 4), offset = u32(font, o + 8), length = u32(font, o + 12) }
    t.data = font:sub(t.offset + 1, t.offset + t.length)
    f.tables[tag] = t
    f.order[#f.order + 1] = tag
  end
  f.count = count

  local head = f.tables.head.data
  f.head = {
    magic = u32(head, 12), flags = u16(head, 16), upm = u16(head, 18),
    xmin = i16(head, 36), ymin = i16(head, 38), xmax = i16(head, 40), ymax = i16(head, 42),
    loca_format = i16(head, 50), adjustment = u32(head, 8), lowest_ppem = u16(head, 46),
  }
  f.num_glyphs = u16(f.tables.maxp.data, 4)
  f.hhea = {
    ascender = i16(f.tables.hhea.data, 4), descender = i16(f.tables.hhea.data, 6),
    num_metrics = u16(f.tables.hhea.data, 34),
  }

  f.hmtx = {}
  for g = 0, f.num_glyphs - 1 do
    f.hmtx[g] = { advance = u16(f.tables.hmtx.data, g * 4), lsb = i16(f.tables.hmtx.data, g * 4 + 2) }
  end

  local loca, offsets = f.tables.loca.data, {}
  for g = 0, f.num_glyphs do
    offsets[g] = f.head.loca_format == 0 and u16(loca, g * 2) * 2 or u32(loca, g * 4)
  end
  f.loca = offsets

  -- cmap: lookup tables per (platform, encoding)
  local cmap = f.tables.cmap.data
  f.cmap = {}
  for i = 0, u16(cmap, 2) - 1 do
    local platform, encoding, off = u16(cmap, 4 + 8 * i), u16(cmap, 6 + 8 * i), u32(cmap, 8 + 8 * i)
    local format = u16(cmap, off)
    local map = {}
    if format == 4 then
      local segs = u16(cmap, off + 6) // 2
      local ends, starts, deltas, ranges = off + 14, off + 16 + segs * 2, off + 16 + segs * 4, off + 16 + segs * 6
      for s = 0, segs - 1 do
        local last, first = u16(cmap, ends + 2 * s), u16(cmap, starts + 2 * s)
        local delta, range = u16(cmap, deltas + 2 * s), u16(cmap, ranges + 2 * s)
        assert(range == 0, "writer never uses idRangeOffset")
        for cp = first, last do
          if cp ~= 0xFFFF then map[cp] = (cp + delta) & 0xFFFF end
        end
      end
    elseif format == 12 then
      for g = 0, u32(cmap, off + 12) - 1 do
        local first, last, gid = u32(cmap, off + 16 + 12 * g), u32(cmap, off + 20 + 12 * g), u32(cmap, off + 24 + 12 * g)
        for cp = first, last do map[cp] = gid + (cp - first) end
      end
    end
    f.cmap[platform .. "," .. encoding] = { format = format, map = map }
  end

  -- name records
  local name = f.tables.name.data
  f.names = {}
  local base = u16(name, 4)
  for i = 0, u16(name, 2) - 1 do
    local o = 6 + 12 * i
    local platform, id, len, off = u16(name, o), u16(name, o + 6), u16(name, o + 8), u16(name, o + 10)
    local raw = name:sub(base + off + 1, base + off + len)
    local text
    if platform == 3 then
      local chars = {}
      for j = 1, #raw, 2 do
        local unit = string.unpack(">I2", raw, j)
        if unit >= 0xD800 and unit < 0xDC00 then
          local low = string.unpack(">I2", raw, j + 2)
          chars[#chars + 1] = utf8.char(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00))
        elseif unit < 0xDC00 or unit >= 0xE000 then
          chars[#chars + 1] = utf8.char(unit)
        end
      end
      text = table.concat(chars)
    else
      text = raw
    end
    f.names[platform .. ":" .. id] = text
  end
  return f
end

-- Contours of a glyph as arrays of {x, y, on_curve} in font units.
function M.glyph(f, gid)
  local from, to = f.loca[gid], f.loca[gid + 1]
  if from == to then return {} end
  local g = f.tables.glyf.data:sub(from + 1, to)
  local n = i16(g, 0)
  assert(n > 0, "simple glyphs only")
  local ends = {}
  for i = 0, n - 1 do ends[i + 1] = u16(g, 10 + 2 * i) end
  local points = ends[n] + 1
  local pos = 10 + 2 * n
  pos = pos + 2 + u16(g, pos)  -- skip instructions
  local flags = {}
  while #flags < points do
    local flag = string.byte(g, pos + 1); pos = pos + 1
    flags[#flags + 1] = flag
    if flag & 0x08 ~= 0 then
      local repeats = string.byte(g, pos + 1); pos = pos + 1
      for _ = 1, repeats do flags[#flags + 1] = flag end
    end
  end
  local function coords(short_bit, same_bit)
    local out, v = {}, 0
    for i = 1, points do
      local flag = flags[i]
      if flag & short_bit ~= 0 then
        local d = string.byte(g, pos + 1); pos = pos + 1
        v = v + ((flag & same_bit ~= 0) and d or -d)
      elseif flag & same_bit == 0 then
        v = v + i16(g, pos); pos = pos + 2
      end
      out[i] = v
    end
    return out
  end
  local xs = coords(0x02, 0x10)
  local ys = coords(0x04, 0x20)
  local contours, first = {}, 1
  for _, last in ipairs(ends) do
    local c = {}
    for i = first, last + 1 do c[#c + 1] = { xs[i], ys[i], flags[i] & 1 == 1 } end
    contours[#contours + 1] = c
    first = last + 2
  end
  return contours, { xmin = i16(g, 2), ymin = i16(g, 4), xmax = i16(g, 6), ymax = i16(g, 8), bytes = #g }
end

return M
