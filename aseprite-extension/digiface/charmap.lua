-- Code point map tokens, see spec/GRID.md section 2. Mirrors web/src/charmap.js.
local jsonutil = require("digiface.jsonutil")

local M = {}

M.MAX_TOKENS = 512

function M.is_valid_codepoint(cp)
  return math.type(cp) == "integer" and cp >= 0 and cp <= 0x10FFFF and not (cp >= 0xD800 and cp <= 0xDFFF)
end

local function hex_ok(s)
  return #s >= 4 and #s <= 6 and s:match("^%x+$") ~= nil
end

-- Returns {unassigned = true} | {first, last}, or nil and a message.
function M.parse_token(token)
  if type(token) ~= "string" then return nil, "Invalid map token: " .. tostring(token) end
  if token == "_" then return { unassigned = true } end
  local a, b = token:match("^(%x+)%-(%x+)$")
  if not a then
    a = token:match("^(%x+)$")
    b = a
  end
  if not a or not hex_ok(a) or not hex_ok(b) then return nil, "Invalid map token: " .. token end
  local first, last = tonumber(a, 16), tonumber(b, 16)
  if last < first then return nil, "Reversed range: " .. token end
  if not M.is_valid_codepoint(first) or not M.is_valid_codepoint(last) then
    return nil, "Invalid code point in " .. token
  end
  if first < 0xD800 and last > 0xDFFF then return nil, "Range crosses surrogates: " .. token end
  return { first = first, last = last }
end

-- One entry per cell: a code point, or false for an unassigned cell. Invalid tokens are reported and skipped.
function M.expand(tokens)
  local cells, errors = {}, {}
  for _, token in ipairs(tokens) do
    local t, err = M.parse_token(token)
    if not t then
      errors[#errors + 1] = err
    elseif t.unassigned then
      cells[#cells + 1] = false
    else
      for cp = t.first, t.last do cells[#cells + 1] = cp end
      if #cells > 0x110000 then errors[#errors + 1] = "Map is too large"; break end
    end
  end
  return cells, errors
end

function M.validate(tokens, max_cells)
  if not jsonutil.is_array(tokens) or #tokens < 1 then return { "map must be a non-empty array" } end
  if #tokens > M.MAX_TOKENS then return { "map has more than " .. M.MAX_TOKENS .. " tokens" } end
  local cells, errors = M.expand(tokens)
  if #errors > 0 then return errors end
  local out = {}
  if #cells > max_cells then
    out[#out + 1] = "map covers " .. #cells .. " cells but the grid has " .. max_cells
  end
  local seen = {}
  for _, cp in ipairs(cells) do
    if cp then
      if seen[cp] then out[#out + 1] = string.format("Duplicate code point U+%04X", cp); break end
      seen[cp] = true
    end
  end
  return out
end

-- Hex list such as "0020-007E U+00C0-00FF 20AC _". Separators: spaces and commas.
-- Returns the tokens (an array) and a list of error messages for the entries that are not valid.
function M.from_hex_list(text)
  local tokens, errors = jsonutil.array({}), {}
  for raw in text:gmatch("[^%s,]+") do
    local norm = (raw:gsub("[Uu]%+", "")):gsub("0[xX]", "")
    local parts = {}
    for part in (norm .. "-"):gmatch("([^-]*)-") do
      if part:match("^%x+$") and #part < 4 then part = string.rep("0", 4 - #part) .. part end
      parts[#parts + 1] = part
    end
    norm = table.concat(parts, "-")
    local _, err = M.parse_token(norm)
    if err then errors[#errors + 1] = err else tokens[#tokens + 1] = norm:upper() end
  end
  return tokens, errors
end

return M
