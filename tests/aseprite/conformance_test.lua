local jsonutil = require("digiface.jsonutil")
local meta = require("digiface.meta")
local charmap = require("digiface.charmap")
local blank = require("digiface.blank")

return function(T)
  local function load_json(rel)
    local value, err = jsonutil.parse(T.read(T.root .. "/" .. rel))
    assert(value ~= nil, rel .. ": " .. tostring(err))
    return value
  end

  T.test("metadata conformance cases (shared with the JavaScript tests)", function()
    local shared = load_json("spec/conformance/metadata-cases.json")
    T.truthy(#shared.cases > 20)
    for _, c in ipairs(shared.cases) do
      local errors = meta.validate(c.meta, c.size)
      T.eq(#errors == 0, c.valid, c.name .. ": " .. table.concat(errors, "; "))
    end
  end)

  T.test("spec examples are valid", function()
    for _, name in ipairs({ "mono-ascii", "var-gbstudio" }) do
      local value = load_json("spec/examples/" .. name .. ".json")
      T.list_eq(meta.validate(value), {}, name)
    end
  end)

  T.test("fractional numbers are kept fractional, not truncated by Aseprite's math.tointeger", function()
    local v = jsonutil.parse('{"a":1.5,"b":2.0,"c":8}')
    T.eq(v.a, 1.5); T.eq(math.type(v.a), "float")
    T.eq(v.b, 2); T.eq(math.type(v.b), "integer")
    T.eq(math.type(v.c), "integer")
  end)

  T.test("non-object metadata is rejected", function()
    T.eq(#meta.validate(jsonutil.parse("[1,2]")), 1)
    T.eq(#meta.validate(nil), 1)
  end)

  T.test("charmap conformance cases (shared with the JavaScript tests)", function()
    local shared = load_json("spec/conformance/charmap-cases.json")
    for _, c in ipairs(shared.cases) do
      local cells, errors = charmap.expand(c.tokens)
      if c.error then
        T.truthy(#errors > 0, c.name)
      else
        T.eq(#errors, 0, c.name)
        local got = {}
        for i, cp in ipairs(cells) do got[i] = cp == false and -1 or cp end
        T.list_eq(got, c.cells, c.name)
      end
    end
  end)

  T.test("custom hex list entry (shared with the JavaScript tests)", function()
    local shared = load_json("spec/conformance/charmap-cases.json")
    for _, c in ipairs(shared.hexList) do
      local tokens, errors = charmap.from_hex_list(c.input)
      if c.error then
        T.truthy(#errors > 0, "hexList " .. c.input)
      else
        T.eq(#errors, 0, c.input)
        T.list_eq(tokens, c.tokens, c.input)
      end
    end
  end)

  T.test("blank characters follow the same rule as the web tool", function()
    local shared = load_json("spec/conformance/charmap-cases.json")
    for _, cp in ipairs(shared.blank.blank) do T.truthy(blank.is_blank(cp), "blank " .. cp) end
    for _, cp in ipairs(shared.blank.notBlank) do T.truthy(not blank.is_blank(cp), "not blank " .. cp) end
  end)

  T.test("a map with a duplicate or too many cells is rejected", function()
    local tokens = jsonutil.parse('["0041-0043"]')
    T.eq(#charmap.validate(tokens, 3), 0)
    T.eq(#charmap.validate(tokens, 2), 1)
    T.eq(#charmap.validate(jsonutil.parse('["0041","0041"]'), 9), 1)
  end)
end
