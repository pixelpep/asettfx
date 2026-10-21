-- CRC-32 as used by PNG chunks.
local M = {}

local TABLE = {}
for n = 0, 255 do
  local c = n
  for _ = 1, 8 do
    if c & 1 == 1 then c = 0xEDB88320 ~ (c >> 1) else c = c >> 1 end
  end
  TABLE[n] = c
end

-- CRC of s:sub(i, j), 1-based inclusive. Defaults to the whole string.
function M.crc32(s, i, j)
  local c = 0xFFFFFFFF
  for k = i or 1, j or #s do
    c = TABLE[(c ~ s:byte(k)) & 0xFF] ~ (c >> 8)
  end
  return (c ~ 0xFFFFFFFF) & 0xFFFFFFFF
end

return M
