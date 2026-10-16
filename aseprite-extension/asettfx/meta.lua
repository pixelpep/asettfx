-- Validation of the template metadata, see spec/metadata.schema.json. Mirrors web/src/metadata.js;
-- spec/conformance/metadata-cases.json is run against both.
local jsonutil = require("asettfx.jsonutil")
local charmap = require("asettfx.charmap")

local M = {}

M.KEYWORD = "asettfx"

local function is_int(v, min, max)
  return math.type(v) == "integer" and v >= min and v <= max
end

local function contains(list, value)
  for _, x in ipairs(list) do if x == value then return true end end
  return false
end

local function check_keys(obj, allowed, path, errors)
  for k in pairs(obj) do
    if not contains(allowed, k) then errors[#errors + 1] = path .. "." .. tostring(k) .. " is not allowed" end
  end
end

-- meta must come from jsonutil.normalize. size is optional: {width=, height=}.
-- Returns a list of error strings, empty when valid.
function M.validate(meta, size)
  local errors = {}
  local function add(msg) errors[#errors + 1] = msg end

  if not jsonutil.is_object(meta) then return { "metadata must be an object" } end

  for _, k in ipairs({ "v", "cell", "grid", "mode", "map" }) do
    if meta[k] == nil then add("Missing " .. k) end
  end
  if meta.v ~= nil and meta.v ~= 1 then add("Unsupported version " .. tostring(meta.v)) end
  if meta.tool ~= nil and not (type(meta.tool) == "string" and #meta.tool <= 64) then
    add("tool must be a string of at most 64 characters")
  end
  if meta.name ~= nil and not (type(meta.name) == "string" and #meta.name <= 64 and not meta.name:find("[^ -~]")) then
    add("name must be printable ASCII of at most 64 characters")
  end

  for _, def in ipairs({ { "cell", "w", "h" }, { "grid", "cols", "rows" } }) do
    local key, a, b = def[1], def[2], def[3]
    local o = meta[key]
    if o ~= nil then
      if not jsonutil.is_object(o) then
        add(key .. " must be an object")
      else
        check_keys(o, { a, b }, key, errors)
        for _, f in ipairs({ a, b }) do
          if not is_int(o[f], 1, 256) then add(key .. "." .. f .. " must be an integer from 1 to 256") end
        end
      end
    end
  end

  if meta.mode ~= nil and not contains({ "mono", "var" }, meta.mode) then add("mode must be mono or var") end
  if meta.widthSource ~= nil and not contains({ "magenta", "auto" }, meta.widthSource) then
    add("widthSource must be magenta or auto")
  end
  if meta.ink ~= nil and not contains({ "dark", "light" }, meta.ink) then add("ink must be dark or light") end
  if meta.marker ~= nil and meta.marker ~= "#FF00FF" then add("marker must be #FF00FF") end

  if meta.metrics ~= nil then
    local m = meta.metrics
    if not jsonutil.is_object(m) then
      add("metrics must be an object")
    else
      local fields = { "baseline", "spacing", "xHeight", "capHeight" }
      check_keys(m, fields, "metrics", errors)
      for _, f in ipairs(fields) do
        if m[f] ~= nil and not is_int(m[f], 0, 0x7FFFFFFF) then add("metrics." .. f .. " must be a non-negative integer") end
      end
      if jsonutil.is_object(meta.cell) and is_int(meta.cell.h, 1, 256) and is_int(m.baseline, 0, 0x7FFFFFFF)
        and m.baseline >= meta.cell.h then
        add("metrics.baseline must be smaller than cell.h")
      end
    end
  end

  if meta.guide ~= nil then
    local g = meta.guide
    if not jsonutil.is_object(g) then
      add("guide must be an object")
    else
      check_keys(g, { "checker", "baseline", "hint", "hintFont", "prefill" }, "guide", errors)
      for _, f in ipairs({ "checker", "baseline", "prefill" }) do
        if g[f] ~= nil and type(g[f]) ~= "boolean" then add("guide." .. f .. " must be a boolean") end
      end
      if g.hint ~= nil and not contains({ "ghost", "none" }, g.hint) then add("guide.hint must be ghost or none") end
      if g.hintFont ~= nil and not (type(g.hintFont) == "string" and #g.hintFont <= 64) then
        add("guide.hintFont must be a string of at most 64 characters")
      end
    end
  end

  if meta.map ~= nil then
    local cells = math.huge
    if jsonutil.is_object(meta.grid) and is_int(meta.grid.cols, 1, 256) and is_int(meta.grid.rows, 1, 256) then
      cells = meta.grid.cols * meta.grid.rows
    end
    for _, e in ipairs(charmap.validate(meta.map, cells)) do add(e) end
  end

  if size and jsonutil.is_object(meta.cell) and jsonutil.is_object(meta.grid)
    and is_int(meta.cell.w, 1, 256) and is_int(meta.cell.h, 1, 256)
    and is_int(meta.grid.cols, 1, 256) and is_int(meta.grid.rows, 1, 256) then
    local w = meta.grid.cols * meta.cell.w
    local h = meta.grid.rows * meta.cell.h
    if w ~= size.width or h ~= size.height then
      add(string.format("Grid is %dx%d but the image is %dx%d", w, h, size.width, size.height))
    end
  end
  return errors
end

-- Settings with the defaults of the schema applied. meta must be valid.
function M.with_defaults(meta)
  local metrics = meta.metrics or {}
  return {
    name = meta.name,
    cell_w = meta.cell.w, cell_h = meta.cell.h,
    cols = meta.grid.cols, rows = meta.grid.rows,
    mode = meta.mode,
    width_source = meta.widthSource or "magenta",
    ink = meta.ink or "dark",
    map = meta.map,
    baseline = metrics.baseline or 0,
    spacing = metrics.spacing or 0,
    x_height = metrics.xHeight,
    cap_height = metrics.capHeight,
  }
end

return M
