-- Turns check records into short lines of text for the dialog. No UI here.
local M = {}

local PREFIX = { error = "ERROR:   ", warning = "Warning: ", info = "Note:    " }

-- Word wrap of text to width characters. Continuation lines are indented by indent spaces.
function M.wrap(text, width, indent)
  local lines, line = {}, ""
  for word in text:gmatch("%S+") do
    if line ~= "" and #line + 1 + #word > width then
      lines[#lines + 1] = line
      line = string.rep(" ", indent) .. word
    else
      line = line == "" and word or (line .. " " .. word)
    end
  end
  if line ~= "" then lines[#lines + 1] = line end
  return lines
end

-- At most max_lines lines. When there are more, the last line says how many were left out.
function M.lines(records, max_lines, width)
  width = width or 78
  local out = {}
  for _, r in ipairs(records) do
    local prefix = PREFIX[r.level] or ""
    local pad = string.rep(" ", #prefix)
    for i, line in ipairs(M.wrap(r.message, width - #prefix, 0)) do
      out[#out + 1] = (i == 1 and prefix or pad) .. line
    end
  end
  if max_lines and #out > max_lines then
    local hidden = #out - (max_lines - 1)
    local kept = {}
    for i = 1, max_lines - 1 do kept[i] = out[i] end
    kept[#kept + 1] = string.format("... and %d more %s", hidden, hidden == 1 and "line" or "lines")
    out = kept
  end
  return out
end

function M.counts(records)
  local c = { error = 0, warning = 0, info = 0 }
  for _, r in ipairs(records) do c[r.level] = (c[r.level] or 0) + 1 end
  return c
end

-- "2 warnings", "1 error and 3 warnings", "no problem found"
function M.summary(records)
  local c = M.counts(records)
  local parts = {}
  if c.error > 0 then parts[#parts + 1] = c.error .. (c.error == 1 and " error" or " errors") end
  if c.warning > 0 then parts[#parts + 1] = c.warning .. (c.warning == 1 and " warning" or " warnings") end
  if #parts == 0 then return "no problem found" end
  return table.concat(parts, " and ")
end

return M
