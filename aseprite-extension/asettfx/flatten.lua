-- Turns a sprite frame into a pixel source: visible layers only, composited over white.
-- Image:drawSprite honors layer visibility but replaces the destination instead of blending with it,
-- so the white background is applied here.
local M = {}

local function count_visible(container)
  local n = 0
  for _, layer in ipairs(container.layers) do
    if layer.isVisible then
      if layer.isGroup then n = n + count_visible(layer) else n = n + 1 end
    end
  end
  return n
end

-- Number of visible image layers, groups included only through their visible children.
function M.visible_layers(sprite)
  return count_visible(sprite)
end

function M.source(sprite, frame)
  local img = Image(sprite.width, sprite.height, ColorMode.RGB)
  img:drawSprite(sprite, frame, Point(0, 0))
  local bytes, width = img.bytes, sprite.width
  assert(#bytes == width * sprite.height * 4, "unexpected image buffer size")
  return {
    width = width,
    height = sprite.height,
    rgb = function(x, y)
      local o = (y * width + x) * 4
      local r, g, b, a = bytes:byte(o + 1, o + 4)
      if a == 255 then return r, g, b end
      local k = 255 - a
      return (r * a + 255 * k + 127) // 255, (g * a + 255 * k + 127) // 255, (b * a + 255 * k + 127) // 255
    end,
  }
end

return M
