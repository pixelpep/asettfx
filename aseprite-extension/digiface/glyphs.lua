-- Cuts the flattened image into cells and reads ink, width markers and advances, see spec/GRID.md sections 1 to 4.
-- A pixel source is {width, height, rgb = function(x, y) return r, g, b end}, already flattened over white.
local charmap = require("digiface.charmap")
local blank = require("digiface.blank")

local M = {}

-- Colors of the template guide (spec/GRID.md section 6), used to notice a template left visible.
local GUIDE = {
  [0xF4F4F4] = true, [0xE8E8E8] = true, [0xD2D2D2] = true, [0xB4B4B4] = true, [0x9CC3E6] = true,
}

local function pack(r, g, b) return (r << 16) | (g << 8) | b end

-- "ink", "marker" or "background".
local function classify(r, g, b, ink_is_dark)
  if r == 255 and g == 0 and b == 255 then return "marker" end
  local lum = 299 * r + 587 * g + 114 * b  -- thousandths, integer so that mid grey is exactly 128000
  local is_ink
  if ink_is_dark then is_ink = lum < 128000 else is_ink = lum >= 128000 end
  return is_ink and "ink" or "background"
end

local function is_pure(r, g, b)
  local c = pack(r, g, b)
  return c == 0x000000 or c == 0xFFFFFF or c == 0xFF00FF
end

-- settings: meta.with_defaults(meta). Returns {glyphs, counts, outside, geometry}.
-- Each glyph: {cp, index, col, row, inside, ink_rows, origin, width, advance, has_ink, mixed, beyond}
-- ink_rows are cell.h strings of '#' and '.', cropped to the glyph width; pixel x of the cell is column x - origin.
function M.analyze(src, settings)
  local w, h, cols = settings.cell_w, settings.cell_h, settings.cols
  local var_magenta = settings.mode == "var" and settings.width_source == "magenta"
  local ink_is_dark = settings.ink == "dark"
  local cells = charmap.expand(settings.map)

  local result = {
    glyphs = {},
    outside = {},
    counts = { impure = 0, ink = 0, marker_pixels = 0, guide = 0, assigned = 0, inside = 0 },
    geometry = {
      image_w = src.width, image_h = src.height,
      grid_w = cols * w, grid_h = settings.rows * h,
    },
  }
  local counts = result.counts

  for i, cp in ipairs(cells) do
    if cp then
      counts.assigned = counts.assigned + 1
      local col, row = (i - 1) % cols, (i - 1) // cols
      local x0, y0 = col * w, row * h
      local glyph = { cp = cp, index = i, col = col, row = row, inside = x0 + w <= src.width and y0 + h <= src.height }
      result.glyphs[#result.glyphs + 1] = glyph

      if not glyph.inside then
        result.outside[#result.outside + 1] = glyph
      else
        counts.inside = counts.inside + 1
        local cls = {}
        local marker_in_col = {}
        local max_ink_x = -1
        for y = 0, h - 1 do
          cls[y] = {}
          for x = 0, w - 1 do
            local r, g, b = src.rgb(x0 + x, y0 + y)
            if not is_pure(r, g, b) then counts.impure = counts.impure + 1 end
            if GUIDE[pack(r, g, b)] then counts.guide = counts.guide + 1 end
            local kind = classify(r, g, b, ink_is_dark)
            cls[y][x] = kind
            if kind == "marker" then
              counts.marker_pixels = counts.marker_pixels + 1
              marker_in_col[x] = (marker_in_col[x] or 0) + 1
            end
            if kind == "ink" then
              counts.ink = counts.ink + 1
              if x > max_ink_x then max_ink_x = x end
            end
          end
        end

        -- Width: GRID.md section 4. origin is the first column of the glyph, last the column after its end.
        local origin, last = 0, w
        local advance = w
        if settings.mode == "var" then
          if var_magenta then
            local function is_marker_col(x) return (marker_in_col[x] or 0) == h end
            while origin < w and is_marker_col(origin) do origin = origin + 1 end
            last = origin
            while last < w and not is_marker_col(last) do last = last + 1 end
            advance = (last - origin) + settings.spacing
            for x = 0, w - 1 do
              if (marker_in_col[x] or 0) > 0 and not is_marker_col(x) then glyph.mixed = true; break end
            end
          else
            advance = (max_ink_x >= 0 and (max_ink_x + 1) or ((w + 1) // 2)) + settings.spacing
          end
        end

        local rows = {}
        for y = 0, h - 1 do
          local line = {}
          for x = origin, last - 1 do line[#line + 1] = cls[y][x] == "ink" and "#" or "." end
          rows[#rows + 1] = table.concat(line)
        end
        for x = last, w - 1 do
          for y = 0, h - 1 do
            if cls[y][x] == "ink" then glyph.beyond = true end
          end
        end

        glyph.origin, glyph.width, glyph.advance = origin, last - origin, advance
        glyph.ink_rows = rows
        glyph.has_ink = false
        for _, line in ipairs(rows) do
          if line:find("#", 1, true) then glyph.has_ink = true; break end
        end
        glyph.blank = blank.is_blank(cp)
      end
    end
  end
  return result
end

return M
