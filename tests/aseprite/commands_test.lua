local commands = require("asettfx.commands")
local form = require("asettfx.form")
local settings = require("asettfx.settings")
local jsonutil = require("asettfx.jsonutil")
local ui = require("asettfx.ui")
local fake = require("fake_dialog")
local reader = require("ttf_reader")

return function(T)
  local function paint(img, x0, y0, rows, marker_from)
    local black, pink = app.pixelColor.rgba(0, 0, 0, 255), app.pixelColor.rgba(255, 0, 255, 255)
    for y, row in ipairs(rows) do
      for x = 1, #row do
        if row:sub(x, x) == "#" then img:putPixel(x0 + x - 1, y0 + y - 1, black) end
      end
    end
    for x = marker_from, 7 do
      for y = 0, 7 do img:putPixel(x0 + x, y0 + y, pink) end
    end
  end

  local A = { ".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" }
  local B = { "####.", "#...#", "#...#", "####.", "#...#", "#...#", "####." }

  -- 16 x 8 sprite: A and B in 8 x 8 cells, magenta after the sixth column. With draw = false nothing is drawn.
  local function make_sprite(draw)
    local sprite = Sprite(16, 8, ColorMode.RGB)
    if draw ~= false then
      local img = Image(16, 8, ColorMode.RGB)
      paint(img, 0, 0, A, 6)
      paint(img, 8, 0, B, 6)
      sprite:newCel(sprite.layers[1], 1, img, Point(0, 0))
    end
    return sprite
  end

  local VAR = jsonutil.parse([[{"v":1,"cell":{"w":8,"h":8},"grid":{"cols":2,"rows":1},"mode":"var","map":["0041-0042"],"metrics":{"baseline":1}}]])

  -- env with scripted dialogs: script(dlg, n) is called for each dialog, n counting from 1
  local function env_for(sprite, script)
    local D, shown = fake.new(script)
    local alerts, written = {}, {}
    local env = {
      sprite = sprite, prefs = {},
      ui = {
        settings_form = function(initial, message) return ui.settings_form(initial, message, D) end,
        export_dialog = function(model) return ui.export_dialog(model, D) end,
      },
      alert = function(o) alerts[#alerts + 1] = o; return 1 end,
    }
    return env, shown, alerts
  end

  local function out_path(name) return app.fs.joinPath(app.fs.tempPath, "asettfx-test-" .. name .. ".ttf") end

  local function read_file(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local s = f:read("a"); f:close(); return s
  end

  T.test("export without settings: form, checks, file", function()
    local sprite = make_sprite()
    local path = out_path("flow")
    os.remove(path)
    local env, shown, alerts = env_for(sprite, function(dlg, n)
      if dlg.title:find("template settings") then
        dlg.data.charset = form.CUSTOM_LABEL
        dlg.data.custom = "0041-0042"
        dlg.data.cols = 2; dlg.data.rows = 1
        dlg.data.mode = form.MODE_LABELS.var
        dlg.click("ok")
      else
        dlg.data.family = "Flow Font"; dlg.data.copyright = "(c) test"
        dlg.data.path = path
        dlg.click("export")
      end
    end)
    local result = commands.export(env)
    T.eq(result, path)
    T.eq(#shown, 2)
    T.truthy(shown[1].title:find("template settings"))
    T.truthy(shown[2].title:find("export TTF"))
    local texts = table.concat(shown[2].texts(), "\n")
    T.truthy(texts:find("Template settings not found"), texts)

    local font = reader.parse(assert(read_file(path)))
    T.eq(font.names["3:1"], "Flow Font"); T.eq(font.names["3:0"], "(c) test")
    T.eq(font.cmap["3,1"].map[0x41], 1); T.eq(font.cmap["3,1"].map[0x42], 2)
    T.eq(font.hmtx[1].advance, 6 * 64, "A is 6 wide: 5 ink columns and the gap before the magenta")
    T.eq(#alerts, 1)
    T.truthy(alerts[1].text[1]:find(path, 1, true))

    T.eq(settings.resolve(sprite).source, "properties", "settings are remembered in the sprite")
    T.eq(env.prefs.family, "Flow Font"); T.eq(env.prefs.copyright, "(c) test")
    os.remove(path)
  end)

  T.test("cancelling the settings form writes nothing", function()
    local env, shown = env_for(make_sprite(), function(dlg) dlg.click("cancel") end)
    T.eq(commands.export(env), nil)
    T.eq(#shown, 1)
  end)

  T.test("an invalid form is shown again with the reason", function()
    local sprite = make_sprite()
    local path = out_path("retry")
    local env, shown = env_for(sprite, function(dlg, n)
      if dlg.title:find("template settings") then
        if n == 1 then dlg.data.cols = 5; dlg.data.rows = 5 end  -- 25 cells cannot be right for... the map fits, grid is wrong
        dlg.data.charset = form.CUSTOM_LABEL
        dlg.data.custom = n == 1 and "zz" or "0041-0042"
        if n == 2 then dlg.data.cols = 2; dlg.data.rows = 1 end
        dlg.click("ok")
      else
        dlg.data.path = path
        dlg.click("export")
      end
    end)
    T.eq(commands.export(env), path)
    T.eq(#shown, 3)
    T.truthy(shown[2].widgets[1].options.text:find("Invalid map token"), shown[2].widgets[1].options.text)
    T.eq(shown[2].initial("cols").text, "5", "the second form keeps what was typed")
    T.eq(shown[2].initial("custom").text, "zz")
    os.remove(path)
  end)

  T.test("known settings go straight to the export dialog, the file gets .ttf added", function()
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local base = out_path("ext")
    os.remove(base)
    local env, shown = env_for(sprite, function(dlg)
      dlg.data.path = app.fs.joinPath(app.fs.tempPath, "asettfx-test-ext")
      dlg.click("export")
    end)
    T.eq(commands.export(env), base)
    T.eq(#shown, 1)
    T.truthy(read_file(base))
    os.remove(base)
  end)

  T.test("Settings...: edited values replace the found ones", function()
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local path = out_path("edit")
    local env, shown = env_for(sprite, function(dlg, n)
      if dlg.title:find("template settings") then
        T.eq(dlg.data.cols, 2, "the form starts from the stored settings")
        T.eq(dlg.data.charset, form.to_dialog(form.from_meta(VAR)).charset)
        dlg.data.spacing = 1
        dlg.click("ok")
      elseif n == 1 then
        dlg.click("settings")
      else
        dlg.data.path = path
        dlg.click("export")
      end
    end)
    T.eq(commands.export(env), path)
    T.eq(#shown, 3)
    local font = reader.parse(assert(read_file(path)))
    T.eq(font.hmtx[1].advance, 7 * 64, "6 plus 1 pixel of extra spacing")
    local texts = table.concat(shown[3].texts(), "\n")
    T.truthy(texts:find("No problem found.", 1, true), texts)
    T.truthy(not texts:find("damaged") and not texts:find("not found: using"), "the edited settings are not reported as damaged or absent")
    os.remove(path)
  end)

  T.test("the spacing is chosen in the export dialog, and a change shows the dialog again with what was typed", function()
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local path = out_path("mode")
    os.remove(path)
    local env, shown = env_for(sprite, function(dlg, n)
      if n == 1 then
        T.eq(dlg.initial("spacing_mode").option, form.MODE_LABELS.var, "magenta found: variable spacing")
        T.eq(dlg.initial("spacing_mode").enabled, true)
        T.truthy(dlg.initial("mode_note").text:find("Magenta found: variable spacing selected"))
        dlg.data.family = "Typed Once"
        dlg.change("spacing_mode", form.MODE_LABELS.mono)
      else
        T.eq(dlg.initial("spacing_mode").option, form.MODE_LABELS.mono, "the choice is kept")
        T.eq(dlg.initial("family").text, "Typed Once", "what was typed is kept")
        T.truthy(dlg.initial("mode_note").text:find("ignored: monospace"))
        dlg.data.path = path
        dlg.click("export")
      end
    end)
    T.eq(commands.export(env), path)
    T.eq(#shown, 2)
    local font = reader.parse(assert(read_file(path)))
    T.eq(font.hmtx[1].advance, 8 * 64, "monospace: the full cell, magenta ignored")
    T.eq(font.names["3:1"], "Typed Once")
    os.remove(path)
  end)

  T.test("without magenta the spacing is monospace and cannot be changed", function()
    local sprite = Sprite(16, 8, ColorMode.RGB)
    local img = Image(16, 8, ColorMode.RGB)
    paint(img, 0, 0, A, 8)
    paint(img, 8, 0, B, 8)  -- no magenta: marker_from beyond the cell
    sprite:newCel(sprite.layers[1], 1, img, Point(0, 0))
    settings.remember(sprite, VAR)
    local env, shown = env_for(sprite, function(dlg) dlg.click("cancel") end)
    commands.export(env)
    T.eq(shown[1].initial("spacing_mode").option, form.MODE_LABELS.mono)
    T.eq(shown[1].initial("spacing_mode").enabled, false)
    T.eq(shown[1].initial("mode_note").text, "No magenta found: monospace spacing.")
  end)

  T.test("the typography option is remembered", function()
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local path = out_path("typo")
    local env = env_for(sprite, function(dlg)
      T.eq(dlg.initial("aliases").selected, true, "on by default")
      dlg.data.aliases = false
      dlg.data.path = path
      dlg.click("export")
    end)
    commands.export(env)
    T.eq(env.prefs.aliases, false)
    os.remove(path)
  end)

  T.test("errors disable Export", function()
    local sprite = make_sprite(false)
    settings.remember(sprite, VAR)
    local env, shown = env_for(sprite, function(dlg)
      T.eq(dlg.click("export"), false)
      dlg.click("cancel")
    end)
    T.eq(commands.export(env), nil)
    T.eq(shown[1].buttons.export.enabled, false)
    T.truthy(table.concat(shown[1].texts(), "\n"):find("ERROR:   No glyph found"))
  end)

  T.test("a file that cannot be written is reported and the dialog stays", function()
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local env, shown, alerts = env_for(sprite, function(dlg, n)
      if n == 1 then dlg.data.path = out_path("never"); dlg.click("export") else dlg.click("cancel") end
    end)
    env.write = function() return false, "disk full" end
    T.eq(commands.export(env), nil)
    T.eq(#shown, 2)
    T.eq(alerts[1].text[2], "disk full")
  end)

  T.test("an empty file name asks again", function()
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local env, shown, alerts = env_for(sprite, function(dlg, n)
      if n == 1 then dlg.data.path = ""; dlg.click("export") else dlg.click("cancel") end
    end)
    T.eq(commands.export(env), nil)
    T.truthy(alerts[1].text:find("Choose where"))
  end)

  T.test("no sprite, and an unexpected error, are shown instead of failing silently", function()
    local alerts = {}
    commands.export({ sprite = false, alert = function(o) alerts[#alerts + 1] = o end })
    T.eq(alerts[1].text, "Open a sprite first.")
    local sprite = make_sprite()
    settings.remember(sprite, VAR)
    local failing = { sprite = sprite, alert = function(o) alerts[#alerts + 1] = o end,
      ui = { export_dialog = function() error("boom") end, settings_form = function() end } }
    local _, err = commands.export(failing)
    T.truthy(tostring(err):find("boom"))
    T.truthy(alerts[#alerts].text[1]:find("went wrong"))
  end)

  T.test("grid command sets Aseprite's grid from the settings and remembers them", function()
    local sprite = make_sprite()
    local env = env_for(sprite, function(dlg)
      dlg.data.charset = form.CUSTOM_LABEL; dlg.data.custom = "0041-0042"
      dlg.data.cols = 2; dlg.data.rows = 1; dlg.data.cell_w = 8; dlg.data.cell_h = 8
      dlg.click("ok")
    end)
    T.eq(commands.grid(env), true)
    T.eq(sprite.gridBounds.width, 8); T.eq(sprite.gridBounds.height, 8)
    T.eq(settings.resolve(sprite).status, "ok")
  end)

  T.test("the entry script registers the menu group and both commands", function()
    local root = T.root .. "/aseprite-extension"
    local chunk = assert(loadfile(root .. "/asettfx.lua"))
    chunk()
    local calls = { groups = {}, commands = {} }
    local plugin = { path = root, preferences = {} }
    function plugin:newMenuGroup(o) calls.groups[#calls.groups + 1] = o end
    function plugin:newCommand(o) calls.commands[#calls.commands + 1] = o end
    local before = package.path
    init(plugin)
    T.eq(#calls.groups, 1); T.eq(calls.groups[1].id, "asettfx_menu"); T.eq(calls.groups[1].group, "file_scripts")
    T.eq(#calls.commands, 2)
    for _, c in ipairs(calls.commands) do
      T.eq(c.group, "asettfx_menu")
      T.eq(type(c.onclick), "function")
      T.eq(c.onenabled(), app.sprite ~= nil)
    end
    T.truthy(package.path:find(root .. "/?.lua", 1, true))
    T.eq(type(exit), "function")
  end)

  T.test("the manifest points to files that exist and carries the license", function()
    local root = T.root .. "/aseprite-extension"
    local manifest = jsonutil.parse(T.read(root .. "/package.json"))
    T.eq(manifest.name, "asettfx")
    T.eq(manifest.license, "Apache-2.0")
    T.truthy(manifest.version:match("^%d+%.%d+%.%d+$"))
    for _, script in ipairs(manifest.contributes.scripts) do
      local f = io.open(root .. "/" .. script.path:gsub("^%./", ""), "rb")
      T.truthy(f, script.path)
      f:close()
    end
  end)
end
