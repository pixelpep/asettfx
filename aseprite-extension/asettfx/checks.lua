-- Export checks, see spec/CHECKS.md. Each record is {id, level, message}.
local M = {}

local MAX_NAMED = 8
local ORDER = { error = 1, warning = 2, info = 3 }

local function plural(n, one, many)
  return n == 1 and one or many
end

-- "U+0041, U+0042 and 3 more" style list, at most MAX_NAMED code points.
local function named(cps)
  local parts = {}
  for i = 1, math.min(#cps, MAX_NAMED) do parts[i] = string.format("U+%04X", cps[i]) end
  local text = table.concat(parts, ", ")
  if #cps > MAX_NAMED then text = text .. ", and " .. (#cps - MAX_NAMED) .. " more" end
  return text
end

-- ctx: {meta_status, meta_reason, settings_errors, settings, size, analysis, visible_layers, frames, frame}
function M.run(ctx)
  local out = {}
  local function add(id, level, message) out[#out + 1] = { id = id, level = level, message = message } end

  if ctx.meta_status == "absent" then
    add("meta-absent", "info", "Template settings not found. Using the values entered in this dialog.")
  elseif ctx.meta_status == "invalid" then
    add("meta-invalid", "warning",
      "Template settings are damaged (" .. tostring(ctx.meta_reason) .. "). Using the values entered in this dialog.")
  end

  for _, e in ipairs(ctx.settings_errors or {}) do add("settings-invalid", "error", e) end

  if (ctx.visible_layers or 1) == 0 then
    add("no-visible-layer", "error", "No visible layer. Show the layer with your glyphs.")
  end
  if (ctx.frames or 1) > 1 then
    add("frames-ignored", "info", string.format("Only frame %d is exported.", ctx.frame or 1))
  end

  local a, s = ctx.analysis, ctx.settings
  if a and s then
    local g = a.geometry
    if g.image_w ~= g.grid_w or g.image_h ~= g.grid_h then
      add("size-mismatch", "warning",
        string.format("Image is %dx%d but the grid expects %dx%d.", g.image_w, g.image_h, g.grid_w, g.grid_h))
    end
    if #a.outside > 0 then
      add("cells-outside", "warning", string.format("%d %s outside the image and %s skipped: %s",
        #a.outside, plural(#a.outside, "cell is", "cells are"), plural(#a.outside, "was", "were"), named(a.outside)))
    end
    if g.image_w > g.grid_w then
      add("extra-area", "warning", string.format("%d pixel %s to the right of the grid %s ignored.",
        g.image_w - g.grid_w, plural(g.image_w - g.grid_w, "column", "columns"), plural(g.image_w - g.grid_w, "is", "are")))
    end
    if g.image_h > g.grid_h then
      add("extra-area", "warning", string.format("%d pixel %s below the grid %s ignored.",
        g.image_h - g.grid_h, plural(g.image_h - g.grid_h, "row", "rows"), plural(g.image_h - g.grid_h, "is", "are")))
    end
    if a.counts.inside == 0 then
      add("no-cells", "error", "The image does not contain any cell of the grid.")
    end
    if s.cell_w % 8 ~= 0 or s.cell_h % 8 ~= 0 then
      add("cell-size-unusual", "info", string.format("Cell size %dx%d is not a multiple of 8.", s.cell_w, s.cell_h))
    end

    if a.counts.inside > 0 then
      if a.counts.ink == 0 then
        add("no-ink", "error", "No glyph found. Draw in black, with the template layer hidden.")
      end
      if a.counts.impure > 0 then
        add("impure-pixels", "warning", string.format("%d %s not pure black, white or magenta and %s thresholded.",
          a.counts.impure, plural(a.counts.impure, "pixel is", "pixels are"), plural(a.counts.impure, "was", "were")))
      end

      local empty, mixed, beyond = {}, {}, {}
      for _, glyph in ipairs(a.glyphs) do
        if glyph.inside then
          if not glyph.has_ink and not glyph.blank then empty[#empty + 1] = glyph.cp end
          if glyph.mixed then mixed[#mixed + 1] = glyph.cp end
          if glyph.beyond then beyond[#beyond + 1] = glyph.cp end
        end
      end
      if #empty > 0 and a.counts.ink > 0 then
        add("empty-glyphs", "warning", string.format("%d %s empty: %s",
          #empty, plural(#empty, "character is", "characters are"), named(empty)))
      end
      if #mixed > 0 then
        add("marker-mixed", "warning", string.format("%d %s a partial magenta column: %s",
          #mixed, plural(#mixed, "character has", "characters have"), named(mixed)))
      end
      if #beyond > 0 then
        add("ink-beyond-width", "warning", string.format("Ink beyond the magenta in %d %s: %s",
          #beyond, plural(#beyond, "character", "characters"), named(beyond)))
      end
      if a.counts.marker_pixels > 0 and (s.mode == "mono" or s.width_source == "auto") then
        add("marker-ignored", "info", "Magenta is ignored in this mode.")
      end
      if a.counts.guide > 0 then
        add("template-visible", "warning",
          "The template layer looks visible. It is read as background, but hide it to be safe.")
      end
    end
  end

  -- stable sort: errors, then warnings, then info, keeping the order above inside a level
  for i, r in ipairs(out) do r.seq = i end
  table.sort(out, function(x, y)
    if ORDER[x.level] ~= ORDER[y.level] then return ORDER[x.level] < ORDER[y.level] end
    return x.seq < y.seq
  end)
  for _, r in ipairs(out) do r.seq = nil end
  return out
end

function M.has_error(records)
  for _, r in ipairs(records) do if r.level == "error" then return true end end
  return false
end

return M
