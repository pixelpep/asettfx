local form = require("digiface.form")
local report = require("digiface.report")
local jsonutil = require("digiface.jsonutil")
local meta = require("digiface.meta")
local fake = require("fake_dialog")
local ui = require("digiface.ui")

return function(T)
  local function base(over)
    local f = form.defaults({ width = 128, height = 48 })
    for k, v in pairs(over or {}) do f[k] = v end
    return f
  end

  T.test("defaults fill the image with 8 pixel cells", function()
    local f = form.defaults({ width = 128, height = 48 })
    T.eq(f.cols, 16); T.eq(f.rows, 6); T.eq(f.cell_w, 8); T.eq(f.mode, "mono"); T.eq(f.charset, "ascii")
    T.eq(form.defaults({ width = 4, height = 4 }).cols, 1)
    T.eq(form.defaults({ width = 5000, height = 8 }).cols, 256)
  end)

  T.test("a preset form becomes valid metadata", function()
    local value, errors = form.to_meta(base({ mode = "var", width_source = "auto" }))
    T.truthy(value, errors and errors[1])
    T.list_eq(meta.validate(value), {})
    T.eq(value.mode, "var"); T.eq(value.widthSource, "auto"); T.eq(value.ink, "dark")
    T.list_eq(value.map, { "0020-007E" })
    T.eq(value.metrics.baseline, 1)
  end)

  T.test("widthSource is left out in monospace, ink light is kept", function()
    local value = form.to_meta(base({ ink_light = true }))
    T.eq(value.widthSource, nil)
    T.eq(value.ink, "light")
  end)

  T.test("custom ranges", function()
    local value, errors = form.to_meta(base({ charset = "custom", custom = "U+41-5A, 20ac _", cols = 8, rows = 4 }))
    T.truthy(value, errors and errors[1])
    T.list_eq(value.map, { "0041-005A", "20AC", "_" })
    local bad, why = form.to_meta(base({ charset = "custom", custom = "zz" }))
    T.eq(bad, nil); T.truthy(#why > 0)
    local empty, why2 = form.to_meta(base({ charset = "custom", custom = "  " }))
    T.eq(empty, nil); T.truthy(why2[1]:find("at least one"))
  end)

  T.test("an invalid grid or baseline is reported", function()
    local value, errors = form.to_meta(base({ cols = 4, rows = 4 }))
    T.eq(value, nil); T.truthy(errors[1]:find("grid"), errors[1])
    local v2, e2 = form.to_meta(base({ baseline = 8 }))
    T.eq(v2, nil); T.truthy(e2[1]:find("baseline"), e2[1])
    local v3, e3 = form.to_meta(base({ cell_w = 0 }))
    T.eq(v3, nil); T.truthy(#e3 > 0)
  end)

  T.test("metadata goes back to a form and a preset is recognized", function()
    local value = form.to_meta(base({ mode = "var", spacing = 1, name = "My Font" }))
    local f = form.from_meta(value)
    T.eq(f.charset, "ascii"); T.eq(f.mode, "var"); T.eq(f.spacing, 1); T.eq(f.cols, 16)
    local custom = form.from_meta(jsonutil.parse('{"v":1,"cell":{"w":8,"h":8},"grid":{"cols":4,"rows":1},"mode":"mono","map":["0041-0043","_"]}'))
    T.eq(custom.charset, "custom"); T.eq(custom.custom, "0041-0043 _")
  end)

  T.test("dialog values: labels and decimals are read back", function()
    local dialog = form.to_dialog(base({ mode = "var", charset = "gbstudio" }))
    dialog.cell_w = 8.0; dialog.cols = 15.6
    local f = form.from_dialog(dialog)
    T.eq(f.cell_w, 8); T.eq(f.cols, 16); T.eq(f.mode, "var"); T.eq(f.charset, "gbstudio")
    dialog.charset = form.CUSTOM_LABEL
    T.eq(form.from_dialog(dialog).charset, "custom")
  end)

  T.test("report lines are wrapped, limited and summarized", function()
    local records = {
      { level = "error", id = "a", message = "No glyph found." },
      { level = "warning", id = "b", message = string.rep("word ", 40) },
      { level = "info", id = "c", message = "Magenta is ignored in this mode." },
    }
    local lines = report.lines(records, nil, 40)
    T.eq(lines[1], "ERROR:   No glyph found.")
    T.truthy(#lines > 4)
    for _, l in ipairs(lines) do T.truthy(#l <= 40, l) end
    T.eq(lines[3]:sub(1, 9), "         ", "continuation lines are indented")
    local limited = report.lines(records, 3, 40)
    T.eq(#limited, 3)
    T.truthy(limited[3]:find("more lines"))
    T.eq(report.summary(records), "1 error and 1 warning")
    T.eq(report.summary({}), "no problem found")
    T.eq(report.summary({ { level = "warning" }, { level = "warning" } }), "2 warnings")
  end)

  T.test("settings dialog: widgets, initial values and what OK returns", function()
    local D, shown = fake.new(function(dlg)
      dlg.data.cell_w = 16
      dlg.data.mode = form.MODE_LABELS.var
      dlg.click("ok")
    end)
    local result = ui.settings_form(base({ cell_h = 8 }), "Hello", D)
    T.eq(result.cell_w, 16); T.eq(result.cell_h, 8); T.eq(result.mode, "var")
    T.eq(shown[1].widgets[1].options.text, "Hello")
    T.truthy(shown[1].closed)
    local cancelled = ui.settings_form(base(), nil, fake.new(function(dlg) dlg.click("cancel") end))
    T.eq(cancelled, nil)
  end)

  T.test("export dialog: report lines, disabled export button, answers", function()
    local model = { lines = { "Note:    one", "Warning: two" }, can_export = false, family = "F", copyright = "", version = "V", path = "/x/f.ttf" }
    local D, shown = fake.new(function(dlg)
      T.eq(dlg.click("export"), false, "a disabled button does nothing")
      dlg.click("settings")
    end)
    local answer = ui.export_dialog(model, D)
    T.eq(answer.action, "settings")
    T.eq(answer.family, "F"); T.eq(answer.path, "/x/f.ttf")
    local texts = shown[1].texts()
    T.eq(texts[1], "Note:    one"); T.eq(texts[2], "Warning: two")
    T.eq(shown[1].buttons.export.enabled, false)

    model.can_export = true
    local ok = ui.export_dialog(model, fake.new(function(dlg) dlg.data.family = "Changed"; dlg.click("export") end))
    T.eq(ok.action, "export"); T.eq(ok.family, "Changed")
    T.eq(ui.export_dialog(model, fake.new(function(dlg) dlg.click("cancel") end)), nil)

    local clean = { lines = {}, can_export = true, family = "F", copyright = "", version = "V", path = "x.ttf" }
    local _, shown2 = fake.new()
    local D2, shown3 = fake.new(function(dlg) dlg.click("cancel") end)
    ui.export_dialog(clean, D2)
    T.eq(shown3[1].texts()[1], "No problem found.")
  end)
end
