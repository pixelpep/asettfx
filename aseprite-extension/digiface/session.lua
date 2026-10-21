-- Everything the export dialog needs, without any UI: settings, checks and the glyph analysis of a sprite.
local meta = require("asettfx.meta")
local settings = require("asettfx.settings")
local flatten = require("asettfx.flatten")
local glyphs = require("asettfx.glyphs")
local checks = require("asettfx.checks")

local M = {}

local function with_mode(value, mode)
  local copy = {}
  for k, v in pairs(value) do copy[k] = v end
  copy.mode = mode
  copy.widthSource = mode == "var" and "magenta" or nil
  return copy
end

-- manual: metadata table entered in the dialog. It is used when no valid settings were found,
-- or instead of them when override is true (the user edited the settings on purpose).
-- mode: "mono" or "var" when the user chose the spacing; nil lets the image decide.
-- The spacing follows what is drawn: magenta found means variable, no magenta means monospace, and the user may
-- still choose monospace when magenta is there (the magenta is then ignored).
-- Returns {meta, source, settings, records, analysis, can_export, mode, mode_reason, magenta_found}.
function M.inspect(sprite, frame, manual, override, mode)
  local found = settings.resolve(sprite)
  local value, source, status, reason = found.meta, found.source, found.status, found.reason
  if manual and (override or not value) then
    value, source = manual, "dialog"
    if override then status, reason = "ok", nil end
  end

  local errors = {}
  if value and source == "dialog" then errors = meta.validate(value) end

  local ctx = {
    meta_status = status == "ok" and "ok" or status,
    meta_reason = reason,
    settings_errors = errors,
    size = { width = sprite.width, height = sprite.height },
    visible_layers = flatten.visible_layers(sprite),
    frames = #sprite.frames,
    frame = frame,
  }

  local analysis, effective, magenta
  if value and #errors == 0 then
    local pixels = flatten.source(sprite, frame)
    local first = glyphs.analyze(pixels, meta.with_defaults(value))
    magenta = first.counts.marker_pixels > 0
    if not magenta then
      effective, ctx.mode_reason = "mono", "none"
    elseif mode == "mono" then
      effective, ctx.mode_reason = "mono", "chosen"
    else
      effective, ctx.mode_reason = "var", "detected"
    end
    local adjusted = with_mode(value, effective)
    if value.mode == effective and (effective == "mono" or value.widthSource ~= "auto") then
      analysis = first
    else
      analysis = glyphs.analyze(pixels, meta.with_defaults(adjusted))
    end
    value = adjusted
    ctx.settings = meta.with_defaults(value)
    ctx.analysis = analysis
  end

  local records = checks.run(ctx)
  return {
    meta = value, source = source, settings = ctx.settings,
    records = records, analysis = analysis, can_export = value ~= nil and not checks.has_error(records),
    mode = effective, mode_reason = ctx.mode_reason, magenta_found = magenta or false,
  }
end

return M
