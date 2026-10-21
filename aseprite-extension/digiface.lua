-- Entry point of the ASETTFX extension: registers the menu commands.
function init(plugin)
  package.path = plugin.path .. "/?.lua;" .. package.path
  local commands = require("asettfx.commands")

  local function has_sprite() return app.sprite ~= nil end

  plugin:newMenuGroup{ id = "asettfx_menu", title = "ASETTFX", group = "file_scripts" }
  plugin:newCommand{
    id = "asettfx_export", title = "Export as TTF...", group = "asettfx_menu",
    onenabled = has_sprite,
    onclick = function() commands.export({ prefs = plugin.preferences }) end,
  }
  plugin:newCommand{
    id = "asettfx_grid", title = "Set grid from template settings", group = "asettfx_menu",
    onenabled = has_sprite,
    onclick = function() commands.grid({ prefs = plugin.preferences }) end,
  }
end

function exit(plugin)
end
