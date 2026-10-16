-- The two dialogs. D is the Dialog constructor (injected so the flows can be tested without Aseprite's UI).
local form = require("asettfx.form")

local M = {}

local TITLE = "ASETTFX"

-- Shows the template settings form. Returns the form values, or nil when cancelled.
-- initial: form table (see form.lua); message: optional line shown on top (for example a validation error).
function M.settings_form(initial, message, D)
  D = D or Dialog
  local dlg = D{ title = TITLE .. " - template settings" }
  local values = form.to_dialog(initial)
  local result

  dlg:label{ id = "intro", text = message or "Describe the grid of your template." }
  dlg:newrow()
  dlg:separator{ id = "sep_grid", text = "Grid" }
  dlg:number{ id = "cell_w", label = "Cell width (px)", text = tostring(values.cell_w), decimals = 0 }
  dlg:number{ id = "cell_h", label = "Cell height (px)", text = tostring(values.cell_h), decimals = 0 }
  dlg:number{ id = "cols", label = "Columns", text = tostring(values.cols), decimals = 0 }
  dlg:number{ id = "rows", label = "Rows", text = tostring(values.rows), decimals = 0 }
  dlg:separator{ id = "sep_chars", text = "Characters, in reading order" }
  dlg:combobox{ id = "charset", label = "Character set", option = values.charset, options = form.charset_labels() }
  dlg:entry{ id = "custom", label = "Custom ranges", text = values.custom }
  dlg:separator{ id = "sep_spacing", text = "Spacing" }
  dlg:combobox{ id = "mode", label = "Mode", option = values.mode,
    options = { form.MODE_LABELS.mono, form.MODE_LABELS.var } }
  dlg:combobox{ id = "width_source", label = "Width from", option = values.width_source,
    options = { form.WIDTH_LABELS.magenta, form.WIDTH_LABELS.auto } }
  dlg:number{ id = "spacing", label = "Extra spacing (px)", text = tostring(values.spacing), decimals = 0 }
  dlg:number{ id = "baseline", label = "Rows below the baseline", text = tostring(values.baseline), decimals = 0 }
  dlg:check{ id = "ink_light", label = "Ink", text = "light ink on a dark background", selected = values.ink_light }
  dlg:newrow()
  dlg:button{ id = "ok", text = "OK", focus = true, onclick = function()
    result = form.from_dialog(dlg.data)
    dlg:close()
  end }
  dlg:button{ id = "cancel", text = "Cancel", onclick = function() dlg:close() end }
  dlg:show{ wait = true }
  return result
end

-- model: {lines, can_export, family, copyright, version, path}
-- Returns nil when cancelled, otherwise {action = "export" | "settings", family, copyright, version, path}.
function M.export_dialog(model, D)
  D = D or Dialog
  local dlg = D{ title = TITLE .. " - export TTF" }
  local answer

  dlg:separator{ id = "sep_checks", text = "Checks" }
  if #model.lines == 0 then
    dlg:label{ id = "check_none", text = "No problem found." }
  else
    for i, line in ipairs(model.lines) do
      dlg:label{ id = "check_" .. i, text = line }
      dlg:newrow()
    end
  end
  dlg:separator{ id = "sep_font", text = "Font" }
  dlg:entry{ id = "family", label = "Family name", text = model.family }
  dlg:entry{ id = "copyright", label = "Copyright", text = model.copyright }
  dlg:entry{ id = "version", label = "Version", text = model.version }
  dlg:file{ id = "path", label = "Save as", title = "Save the font", save = true,
    filename = model.path, filetypes = { "ttf" } }
  dlg:newrow()

  local function collect(action)
    answer = {
      action = action,
      family = dlg.data.family, copyright = dlg.data.copyright,
      version = dlg.data.version, path = dlg.data.path,
    }
    dlg:close()
  end
  dlg:button{ id = "export", text = "Export", focus = model.can_export, enabled = model.can_export,
    onclick = function() collect("export") end }
  dlg:button{ id = "settings", text = "Settings...", onclick = function() collect("settings") end }
  dlg:button{ id = "cancel", text = "Cancel", onclick = function() dlg:close() end }
  dlg:show{ wait = true }
  return answer
end

return M
