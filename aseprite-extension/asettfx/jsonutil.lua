-- Aseprite's json.decode returns userdata objects and float numbers. This converts them to plain Lua values:
-- objects become tables, arrays become tables tagged as arrays, integral numbers become integers.
local M = {}

local ARRAY = {}

function M.normalize(v)
  local t = type(v)
  if t == "number" then return math.tointeger(v) or v end
  if t ~= "userdata" then return v end
  local text = tostring(v)
  local first = text:sub(1, 1)
  if first == "[" then
    local out = setmetatable({}, ARRAY)
    for i, x in ipairs(v) do out[i] = M.normalize(x) end
    return out
  elseif first == "{" then
    local out = {}
    for k, x in pairs(v) do out[k] = M.normalize(x) end
    return out
  end
  return text
end

-- Marks a plain list as a JSON array, as normalize does for decoded arrays.
function M.array(list) return setmetatable(list, ARRAY) end

function M.is_array(t) return type(t) == "table" and getmetatable(t) == ARRAY end
function M.is_object(t) return type(t) == "table" and getmetatable(t) == nil end

-- Parses JSON text. Returns the normalized value, or nil and a message.
function M.parse(text)
  local ok, value = pcall(json.decode, text)
  if not ok then return nil, tostring(value) end
  return M.normalize(value)
end

return M
