-- Traces the boundary of ink pixels into closed polygons, see spec/TTF.md.
-- Coordinates are pixel corners, x to the right and y down, relative to the top left of the bitmap.
-- Contours are clockwise on screen with the ink on their right, so holes come out counter-clockwise.
local M = {}

local function key(x, y) return x * 65536 + y end

-- rows: array of strings of '#' (ink) and '.' (background), all of the same width.
-- Returns an array of contours; a contour is an array of {x, y} corner points (collinear points removed).
function M.trace(rows)
  local height = #rows
  local width = height > 0 and #rows[1] or 0

  local function ink(x, y)
    return x >= 0 and y >= 0 and x < width and y < height and rows[y + 1]:byte(x + 1) == 35
  end

  -- Directed boundary edges, grouped by start vertex.
  local out = {}
  local function edge(x1, y1, x2, y2)
    local k = key(x1, y1)
    local list = out[k]
    if not list then list = {}; out[k] = list end
    list[#list + 1] = { x1 = x1, y1 = y1, x2 = x2, y2 = y2, dx = x2 - x1, dy = y2 - y1, used = false }
  end

  for y = 0, height - 1 do
    for x = 0, width - 1 do
      if ink(x, y) then
        if not ink(x, y - 1) then edge(x, y, x + 1, y) end              -- top, east
        if not ink(x + 1, y) then edge(x + 1, y, x + 1, y + 1) end      -- right, south
        if not ink(x, y + 1) then edge(x + 1, y + 1, x, y + 1) end      -- bottom, west
        if not ink(x - 1, y) then edge(x, y + 1, x, y) end              -- left, north
      end
    end
  end

  -- Deterministic start order.
  local starts = {}
  for k in pairs(out) do starts[#starts + 1] = k end
  table.sort(starts)

  local contours = {}
  for _, k in ipairs(starts) do
    for _, first in ipairs(out[k]) do
      if not first.used then
        local points = {}
        local e = first
        repeat
          e.used = true
          points[#points + 1] = { e.x1, e.y1 }
          -- Next edge from the end vertex. Preferring a right turn keeps pixels that only touch at a corner apart.
          local nexts = out[key(e.x2, e.y2)]
          local right, straight, left
          for _, c in ipairs(nexts or {}) do
            if not c.used or c == first then
              if c.dx == -e.dy and c.dy == e.dx then right = c
              elseif c.dx == e.dx and c.dy == e.dy then straight = c
              else left = c end
            end
          end
          e = right or straight or left
          assert(e, "open outline")
        until e == first

        -- drop points between two collinear segments
        local n = #points
        local simple = {}
        for i = 1, n do
          local p, q, r = points[(i - 2) % n + 1], points[i], points[i % n + 1]
          local cross = (q[1] - p[1]) * (r[2] - q[2]) - (q[2] - p[2]) * (r[1] - q[1])
          if cross ~= 0 then simple[#simple + 1] = q end
        end
        contours[#contours + 1] = simple
      end
    end
  end
  return contours
end

-- Signed area with the shoelace formula in y-down coordinates: positive for clockwise on screen.
function M.signed_area(contour)
  local sum, n = 0, #contour
  for i = 1, n do
    local p, q = contour[i], contour[i % n + 1]
    sum = sum + p[1] * q[2] - q[1] * p[2]
  end
  return sum / 2
end

return M
