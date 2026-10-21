-- Reads the ASETTFX metadata chunk of a PNG file, see spec/METADATA.md.
local crc32 = require("asettfx.crc32")
local jsonutil = require("asettfx.jsonutil")
local meta = require("asettfx.meta")

local M = {}

local SIGNATURE = "\137PNG\r\n\26\n"
local MAX_CHUNK = 64 * 1024

-- Looks for a tEXt chunk with the given keyword before the first IDAT.
-- Returns {status, size, text}: status is "ok", "crc-error", "too-large", "absent", "truncated" or "not-png".
function M.parse(bytes, keyword)
  if bytes:sub(1, 8) ~= SIGNATURE then return { status = "not-png" } end
  local pos, size = 9, nil
  local done = false
  while pos <= #bytes do
    if pos + 11 > #bytes then return { status = "truncated", size = size } end
    local len = string.unpack(">I4", bytes, pos)
    local kind = bytes:sub(pos + 4, pos + 7)
    if pos + 11 + len > #bytes then return { status = "truncated", size = size } end
    if kind == "IHDR" and len >= 8 then
      local w, h = string.unpack(">I4I4", bytes, pos + 8)
      size = { width = w, height = h }
    end
    if kind == "IDAT" or kind == "IEND" then done = true; break end
    if kind == "tEXt" then
      local data = bytes:sub(pos + 8, pos + 7 + len)
      local z = data:find("\0", 1, true)
      if z and z > 1 and data:sub(1, z - 1) == keyword then
        if len > MAX_CHUNK then return { status = "too-large", size = size } end
        local stored = string.unpack(">I4", bytes, pos + 8 + len)
        local ok = stored == crc32.crc32(bytes, pos + 4, pos + 7 + len)
        return { status = ok and "ok" or "crc-error", size = size, text = data:sub(z + 1) }
      end
    end
    pos = pos + 12 + len
  end
  if not size then return { status = "not-png" } end
  if not done then return { status = "truncated", size = size } end
  return { status = "absent", size = size }
end

function M.read_file(path)
  local f, err = io.open(path, "rb")
  if not f then return nil, err end
  local bytes = f:read("a")
  f:close()
  return bytes
end

-- Turns the chunk text into validated metadata.
-- Returns {status = "ok", meta, size} or {status = "absent" | "invalid", reason, size}.
function M.interpret(parsed)
  if parsed.status == "absent" or parsed.status == "not-png" then
    return { status = "absent", size = parsed.size }
  end
  if parsed.status ~= "ok" then
    local reasons = {
      ["crc-error"] = "the chunk checksum does not match",
      ["too-large"] = "the chunk is larger than 64 KB",
      truncated = "the PNG file is truncated",
    }
    return { status = "invalid", reason = reasons[parsed.status], size = parsed.size }
  end
  local value, err = jsonutil.parse(parsed.text)
  if value == nil then return { status = "invalid", reason = "invalid JSON: " .. tostring(err), size = parsed.size } end
  local errors = meta.validate(value)
  if #errors > 0 then return { status = "invalid", reason = errors[1], size = parsed.size } end
  return { status = "ok", meta = value, size = parsed.size }
end

function M.load(path)
  local bytes, err = M.read_file(path)
  if not bytes then return { status = "absent", reason = err } end
  return M.interpret(M.parse(bytes, meta.KEYWORD))
end

return M
