-- Tiny test harness. A failing run ends with error(), which gives a non-zero exit code.
local T = { passed = 0, failed = 0, failures = {} }

local function show(v)
  if type(v) == "table" then
    local parts = {}
    for _, x in ipairs(v) do parts[#parts + 1] = show(x) end
    return "{" .. table.concat(parts, ", ") .. "}"
  end
  return tostring(v)
end

function T.test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    T.passed = T.passed + 1
    print("ok   " .. name)
  else
    T.failed = T.failed + 1
    T.failures[#T.failures + 1] = name .. ": " .. tostring(err)
    print("FAIL " .. name .. "\n     " .. tostring(err))
  end
end

function T.eq(actual, expected, msg)
  if actual ~= expected then
    error((msg and (msg .. ": ") or "") .. "expected " .. show(expected) .. ", got " .. show(actual), 2)
  end
end

function T.truthy(v, msg)
  if not v then error(msg or "expected a truthy value", 2) end
end

function T.list_eq(actual, expected, msg)
  if #actual ~= #expected then error((msg or "") .. ": expected " .. show(expected) .. ", got " .. show(actual), 2) end
  for i = 1, #expected do
    if actual[i] ~= expected[i] then error((msg or "") .. ": expected " .. show(expected) .. ", got " .. show(actual), 2) end
  end
end

function T.read(path)
  local f = assert(io.open(path, "rb"))
  local s = f:read("a")
  f:close()
  return s
end

function T.finish()
  print(string.format("\n%d passed, %d failed", T.passed, T.failed))
  if T.failed > 0 then error(T.failed .. " test(s) failed") end
end

return T
