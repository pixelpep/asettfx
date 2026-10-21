-- Entry point of the Digiface extension: registers the menu commands.
function init(plugin)
  package.path = plugin.path .. "/?.lua;" .. package.path
  local commands = require("digiface.commands")

  local function has_sprite() return app.sprite ~= nil end

  plugin:newMenuGroup{ id = "digiface_menu", title = "Digiface", group = "file_scripts" }
  plugin:newCommand{
    id = "digiface_export", title = "Export as TTF...", group = "digiface_menu",
    onenabled = has_sprite,
    onclick = function() commands.export({ prefs = plugin.preferences }) end,
  }
  plugin:newCommand{
    id = "digiface_grid", title = "Set grid from template settings", group = "digiface_menu",
    onenabled = has_sprite,
    onclick = function() commands.grid({ prefs = plugin.preferences }) end,
  }
end

function exit(plugin)
end
