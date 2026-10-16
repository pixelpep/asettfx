local outline = require("asettfx.outline")

return function(T)
  local function trace(rows) return outline.trace(rows) end

  local function total_area(contours)
    local sum = 0
    for _, c in ipairs(contours) do sum = sum + outline.signed_area(c) end
    return sum
  end

  local function count_ink(rows)
    local n = 0
    for _, r in ipairs(rows) do for _ in r:gmatch("#") do n = n + 1 end end
    return n
  end

  -- winding number of the polygon set around (px, py), ray to the right
  local function winding(contours, px, py)
    local w = 0
    for _, c in ipairs(contours) do
      for i = 1, #c do
        local a, b = c[i], c[i % #c + 1]
        if a[2] <= py and b[2] > py and (b[1] - a[1]) * (py - a[2]) - (px - a[1]) * (b[2] - a[2]) > 0 then w = w + 1
        elseif a[2] > py and b[2] <= py and (b[1] - a[1]) * (py - a[2]) - (px - a[1]) * (b[2] - a[2]) < 0 then w = w - 1 end
      end
    end
    return w
  end

  T.test("a single pixel is one square", function()
    local c = trace({ "#" })
    T.eq(#c, 1); T.eq(#c[1], 4)
    T.eq(outline.signed_area(c[1]), 1)
  end)

  T.test("a bar has four corners however long", function()
    local c = trace({ "#####" })
    T.eq(#c, 1); T.eq(#c[1], 4); T.eq(outline.signed_area(c[1]), 5)
  end)

  T.test("an L shape has six corners", function()
    local c = trace({ "#.", "#.", "##" })
    T.eq(#c, 1); T.eq(#c[1], 6); T.eq(outline.signed_area(c[1]), 4)
  end)

  T.test("a ring has an outer contour and a hole turning the other way", function()
    local c = trace({ "###", "#.#", "###" })
    T.eq(#c, 2)
    local areas = { outline.signed_area(c[1]), outline.signed_area(c[2]) }
    table.sort(areas)
    T.eq(areas[1], -1); T.eq(areas[2], 9)
  end)

  T.test("pixels that touch at a corner are separate shapes", function()
    local c = trace({ "#.", ".#" })
    T.eq(#c, 2)
    T.eq(#c[1], 4); T.eq(#c[2], 4)
    T.eq(total_area(c), 2)
  end)

  T.test("an empty bitmap has no contour", function()
    T.eq(#trace({ "...", "..." }), 0)
    T.eq(#trace({}), 0)
  end)

  T.test("random bitmaps: area, closure, axis-aligned edges and rasterized winding match the pixels", function()
    math.randomseed(20261016)
    for round = 1, 300 do
      local w, h = math.random(1, 8), math.random(1, 8)
      local density = math.random(15, 85) / 100
      local rows = {}
      for y = 1, h do
        local line = {}
        for x = 1, w do line[x] = math.random() < density and "#" or "." end
        rows[y] = table.concat(line)
      end
      local contours = trace(rows)
      T.eq(total_area(contours), count_ink(rows), "area, round " .. round .. ": " .. table.concat(rows, "/"))
      for _, c in ipairs(contours) do
        T.truthy(#c >= 4 and #c % 2 == 0, "corner count")
        for i = 1, #c do
          local a, b = c[i], c[i % #c + 1]
          T.truthy((a[1] == b[1]) ~= (a[2] == b[2]), "axis-aligned, distinct points")
        end
      end
      for y = 0, h - 1 do
        for x = 0, w - 1 do
          local inside = winding(contours, x + 0.5, y + 0.5) ~= 0
          T.eq(inside, rows[y + 1]:sub(x + 1, x + 1) == "#", string.format("pixel %d,%d in %s", x, y, table.concat(rows, "/")))
        end
      end
    end
  end)
end
