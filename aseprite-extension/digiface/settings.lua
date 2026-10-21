-- Finds the template settings of a sprite, in the order of spec/METADATA.md: the sprite properties (no file access),
-- the PNG on disk, a sidecar file. The manual dialog is the caller's last resort.
local jsonutil = require("digiface.jsonutil")
local meta = require("digiface.meta")
local png_meta = require("digiface.png_meta")

local M = {}

local PROPERTY = "digiface"

local function from_text(text)
  local value, err = jsonutil.parse(text)
  if value == nil then return { status = "invalid", reason = "invalid JSON: " .. tostring(err) } end
  local errors = meta.validate(value)
  if #errors > 0 then return { status = "invalid", reason = errors[1] } end
  return { status = "ok", meta = value }
end

local function from_properties(sprite)
  local ok, text = pcall(function() return sprite.properties(PROPERTY).meta end)
  if not ok or type(text) ~= "string" or text == "" then return { status = "absent" } end
  return from_text(text)
end

local function sidecar_path(filename)
  if not filename or filename == "" then return nil end
  return app.fs.filePathAndTitle(filename) .. ".digiface.json"
end

local function from_sidecar(filename)
  local path = sidecar_path(filename)
  if not path then return { status = "absent" } end
  if not app.fs.isFile(path) then return { status = "absent" } end  -- Aseprite asks permission for each file it opens
  local text = png_meta.read_file(path)
  if not text then return { status = "absent" } end
  return from_text(text)
end

local function from_png(filename)
  if not filename or not filename:lower():match("%.png$") then return { status = "absent" } end
  return png_meta.load(filename)
end

-- Returns {status = "ok", meta, source} | {status = "invalid", reason} | {status = "absent"}.
-- With an invalid source and no valid one after it, the first reason is reported.
function M.resolve(sprite)
  local invalid
  local sources = {
    { "properties", function() return from_properties(sprite) end },
    { "png", function() return from_png(sprite.filename) end },
    { "sidecar", function() return from_sidecar(sprite.filename) end },
  }
  for _, source in ipairs(sources) do
    local result = source[2]()
    if result.status == "ok" then return { status = "ok", meta = result.meta, source = source[1] } end
    if result.status == "invalid" and not invalid then
      invalid = { status = "invalid", reason = result.reason, source = source[1] }
    end
  end
  return invalid or { status = "absent" }
end

-- Keeps the settings in the sprite so they survive saving as .aseprite.
function M.remember(sprite, value)
  sprite.properties(PROPERTY).meta = json.encode(value)
end

return M
