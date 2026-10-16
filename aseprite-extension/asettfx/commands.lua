-- The menu commands. env makes them testable: env.sprite, env.frame, env.ui, env.alert, env.prefs.
local session = require("asettfx.session")
local settings = require("asettfx.settings")
local export = require("asettfx.export")
local form = require("asettfx.form")
local report = require("asettfx.report")
local ui = require("asettfx.ui")

local M = {}

local MAX_REPORT_LINES = 14

local function context(env)
  env = env or {}
  local sprite = env.sprite
  if sprite == nil then sprite = app.sprite end  -- false means "no sprite", used by the tests
  local frame = env.frame or (app.frame and app.frame.frameNumber) or 1
  return {
    sprite = sprite, frame = frame,
    ui = env.ui or ui, alert = env.alert or app.alert, prefs = env.prefs or {},
    write = env.write or export.write,
  }
end

local function title_of(sprite)
  local name = sprite.filename or ""
  if name == "" then return "font" end
  return app.fs.fileTitle(name)
end

local function default_path(c)
  local name = c.sprite.filename or ""
  local dir = c.prefs.directory
  if name ~= "" then dir = app.fs.filePath(name) end
  dir = dir or app.fs.userDocsPath
  return app.fs.joinPath(dir, title_of(c.sprite) .. ".ttf")
end

local function ensure_ttf(path)
  if path == nil or path == "" then return nil end
  if not path:lower():match("%.ttf$") then path = path .. ".ttf" end
  return path
end

-- Asks for the settings until they are valid. Returns the metadata, or nil when cancelled.
local function ask_settings(c, initial)
  local message
  while true do
    local entered = c.ui.settings_form(initial, message)
    if not entered then return nil end
    entered.name = initial.name
    local value, errors = form.to_meta(entered)
    if value then return value end
    initial = entered
    message = errors[1]
  end
end

local function export_flow(c)
  local manual, override = nil, false
  local inspected = session.inspect(c.sprite, c.frame)
  if not inspected.meta then
    manual = ask_settings(c, form.defaults(c.sprite))
    if not manual then return end
    inspected = session.inspect(c.sprite, c.frame, manual)
  end

  while true do
    local lines = report.lines(inspected.records, MAX_REPORT_LINES)
    local answer = c.ui.export_dialog({
      lines = lines, can_export = inspected.can_export,
      family = c.prefs.family or (inspected.meta and inspected.meta.name) or title_of(c.sprite),
      copyright = c.prefs.copyright or "", version = c.prefs.version or "Version 1.000",
      path = default_path(c),
    })
    if not answer then return end

    if answer.action == "settings" then
      local edited = ask_settings(c, inspected.meta and form.from_meta(inspected.meta) or form.defaults(c.sprite))
      if edited then
        manual, override = edited, true
        inspected = session.inspect(c.sprite, c.frame, manual, override)
      end
    elseif answer.action == "export" then
      local path = ensure_ttf(answer.path)
      if not path then
        c.alert{ title = "ASETTFX", text = "Choose where to save the font.", buttons = "OK" }
      else
        local built = export.build(inspected, {
          family = answer.family ~= "" and answer.family or nil,
          copyright = answer.copyright, version = answer.version ~= "" and answer.version or nil,
        })
        if not built.ok then
          inspected.records = built.records
          c.alert{ title = "ASETTFX", text = "The font was not exported. See the checks.", buttons = "OK" }
        else
          local ok, err = c.write(path, built.font)
          if not ok then
            c.alert{ title = "ASETTFX", text = { "The file could not be written:", tostring(err) }, buttons = "OK" }
          else
            settings.remember(c.sprite, inspected.meta)
            c.prefs.family, c.prefs.copyright, c.prefs.version = answer.family, answer.copyright, answer.version
            c.prefs.directory = app.fs.filePath(path)
            c.alert{ title = "ASETTFX", buttons = "OK", text = {
              "Font written: " .. path,
              string.format("%d glyphs, %d bytes, %s.", built.info.glyphs, built.info.bytes, report.summary(inspected.records)),
            } }
            return path
          end
        end
      end
    end
  end
end

local function grid_flow(c)
  local inspected = session.inspect(c.sprite, c.frame)
  local value = inspected.meta
  if not value then
    value = ask_settings(c, form.defaults(c.sprite))
    if not value then return end
  end
  settings.remember(c.sprite, value)
  c.sprite.gridBounds = Rectangle(0, 0, value.cell.w, value.cell.h)
  return true
end

-- Runs a command body and shows any unexpected error instead of failing silently.
local function guarded(flow)
  return function(env)
    local c = context(env)
    if not c.sprite then
      c.alert{ title = "ASETTFX", text = "Open a sprite first.", buttons = "OK" }
      return
    end
    local ok, result = pcall(flow, c)
    if not ok then
      c.alert{ title = "ASETTFX", text = { "Something went wrong:", tostring(result) }, buttons = "OK" }
      return nil, result
    end
    return result
  end
end

M.export = guarded(export_flow)
M.grid = guarded(grid_flow)

return M
