-- Inspects a sprite and, when the checks allow it, builds the font. No UI: the dialog and the command-line tools call this.
local session = require("asettfx.session")
local ttf = require("asettfx.ttf")

local M = {}

-- Builds the font from the result of session.inspect.
-- options: family, subfamily, copyright, version (all optional).
-- Returns {ok, records, font, info, session}. ok is false when a check reports an error.
function M.build(inspected, options)
  local result = { ok = false, records = inspected.records, session = inspected }
  if not inspected.can_export then return result end
  local opts = {}
  for k, v in pairs(options or {}) do opts[k] = v end
  local built, font, info = pcall(ttf.build, inspected.analysis, inspected.settings, opts)
  if not built then
    result.records[#result.records + 1] = { id = "build-failed", level = "error", message = tostring(font) }
    return result
  end
  result.ok, result.font, result.info = true, font, info
  return result
end

-- Inspects and builds in one go. manual and override are passed to session.inspect.
function M.run(sprite, frame, options, manual, override)
  return M.build(session.inspect(sprite, frame, manual, override), options)
end

function M.write(path, font)
  local f, err = io.open(path, "wb")
  if not f then return false, err end
  f:write(font)
  f:close()
  return true
end

return M
