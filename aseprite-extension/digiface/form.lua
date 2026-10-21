-- The "template settings" form: defaults, conversion to and from metadata. No UI here, so it can be tested.
local charsets = require("digiface.charsets")
local charmap = require("digiface.charmap")
local jsonutil = require("digiface.jsonutil")
local meta = require("digiface.meta")

local M = {}

M.CUSTOM_LABEL = "Custom: code point ranges (hex)"
M.MODE_LABELS = { mono = "Monospace", var = "Variable space (magenta columns)" }
M.WIDTH_LABELS = { magenta = "Magenta columns", auto = "Drawn pixels (magenta ignored)" }

local function label_of(labels, id)
  return labels[id]
end

local function id_of(labels, label, default)
  for id, text in pairs(labels) do if text == label then return id end end
  return default
end

-- "mono" or "var" from the label shown in the spacing combobox.
function M.mode_from_label(label)
  return id_of(M.MODE_LABELS, label, "mono")
end

function M.charset_labels()
  local out = {}
  for _, preset in ipairs(charsets) do out[#out + 1] = preset.label end
  out[#out + 1] = M.CUSTOM_LABEL
  return out
end

local function preset_by_id(id)
  for _, preset in ipairs(charsets) do if preset.id == id then return preset end end
end

local function preset_by_label(label)
  for _, preset in ipairs(charsets) do if preset.label == label then return preset end end
end

local function same(a, b)
  if #a ~= #b then return false end
  for i = 1, #a do if a[i] ~= b[i] then return false end end
  return true
end

local function clamp(n, lo, hi) return math.max(lo, math.min(hi, n)) end

-- Values for a sprite that carries no settings: 8 x 8 cells filling the image.
function M.defaults(sprite)
  return {
    cell_w = 8, cell_h = 8,
    cols = clamp(sprite.width // 8, 1, 256), rows = clamp(sprite.height // 8, 1, 256),
    mode = "mono", width_source = "magenta",
    charset = "ascii", custom = "",
    baseline = 1, spacing = 0, ink_light = false,
  }
end

-- Form values from valid metadata, to edit settings that were found.
function M.from_meta(value)
  local s = meta.with_defaults(value)
  local form = {
    cell_w = s.cell_w, cell_h = s.cell_h, cols = s.cols, rows = s.rows,
    mode = s.mode, width_source = s.width_source,
    baseline = s.baseline, spacing = s.spacing, ink_light = s.ink == "light",
    name = s.name,
    charset = "custom", custom = table.concat(s.map, " "),
  }
  for _, preset in ipairs(charsets) do
    if same(preset.map, s.map) then form.charset = preset.id; form.custom = "" end
  end
  return form
end

local function whole(v, fallback)
  if type(v) ~= "number" then return fallback end
  return math.floor(v + 0.5)
end

-- Reads the raw values of the dialog (numbers, labels, booleans) into a form table.
function M.from_dialog(data)
  local preset = preset_by_label(data.charset)
  return {
    cell_w = whole(data.cell_w, 0), cell_h = whole(data.cell_h, 0),
    cols = whole(data.cols, 0), rows = whole(data.rows, 0),
    mode = id_of(M.MODE_LABELS, data.mode, "mono"),
    width_source = id_of(M.WIDTH_LABELS, data.width_source, "magenta"),
    charset = preset and preset.id or "custom", custom = data.custom or "",
    baseline = whole(data.baseline, 0), spacing = whole(data.spacing, 0),
    ink_light = data.ink_light == true,
  }
end

-- Dialog values for a form.
function M.to_dialog(form)
  local preset = preset_by_id(form.charset)
  return {
    cell_w = form.cell_w, cell_h = form.cell_h, cols = form.cols, rows = form.rows,
    mode = label_of(M.MODE_LABELS, form.mode), width_source = label_of(M.WIDTH_LABELS, form.width_source),
    charset = preset and preset.label or M.CUSTOM_LABEL, custom = form.custom or "",
    baseline = form.baseline, spacing = form.spacing, ink_light = form.ink_light,
  }
end

-- Metadata from a form. Returns the metadata, or nil and a list of messages.
function M.to_meta(form)
  local tokens
  local preset = preset_by_id(form.charset)
  if preset then
    tokens = jsonutil.array({ table.unpack(preset.map) })
  else
    local errors
    tokens, errors = charmap.from_hex_list(form.custom or "")
    if #errors > 0 then return nil, errors end
    if #tokens == 0 then return nil, { "Enter at least one code point range, for example 0020-007E" } end
  end

  local value = {
    v = 1,
    cell = { w = form.cell_w, h = form.cell_h },
    grid = { cols = form.cols, rows = form.rows },
    mode = form.mode,
    ink = form.ink_light and "light" or "dark",
    marker = "#FF00FF",
    map = tokens,
    metrics = { baseline = form.baseline, spacing = form.spacing },
  }
  if form.mode == "var" then value.widthSource = form.width_source end
  if form.name and form.name ~= "" then value.name = form.name end

  local errors = meta.validate(value)
  if #errors > 0 then return nil, errors end
  return value
end

return M
