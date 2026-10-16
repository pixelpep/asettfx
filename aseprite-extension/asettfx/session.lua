-- Everything the export dialog needs, without any UI: settings, checks and the glyph analysis of a sprite.
local meta = require("asettfx.meta")
local settings = require("asettfx.settings")
local flatten = require("asettfx.flatten")
local glyphs = require("asettfx.glyphs")
local checks = require("asettfx.checks")

local M = {}

-- manual: metadata table entered in the dialog. It is used when no valid settings were found,
-- or instead of them when override is true (the user edited the settings on purpose).
-- Returns {meta, source, records, analysis, can_export}.
function M.inspect(sprite, frame, manual, override)
  local found = settings.resolve(sprite)
  local value, source, status, reason = found.meta, found.source, found.status, found.reason
  if manual and (override or not value) then
    value, source = manual, "dialog"
    if override then status, reason = "ok", nil end
  end

  local errors = {}
  if value and source == "dialog" then errors = meta.validate(value) end
  if not value then errors = {} end

  local ctx = {
    meta_status = status == "ok" and "ok" or status,
    meta_reason = reason,
    settings_errors = errors,
    size = { width = sprite.width, height = sprite.height },
    visible_layers = flatten.visible_layers(sprite),
    frames = #sprite.frames,
    frame = frame,
  }

  local analysis
  if value and #errors == 0 then
    ctx.settings = meta.with_defaults(value)
    analysis = glyphs.analyze(flatten.source(sprite, frame), ctx.settings)
    ctx.analysis = analysis
  end

  local records = checks.run(ctx)
  return {
    meta = value, source = source, settings = ctx.settings,
    records = records, analysis = analysis, can_export = value ~= nil and not checks.has_error(records),
  }
end

return M
