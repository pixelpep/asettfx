-- A stand-in for Aseprite's Dialog, which is not available in batch mode. It records the widgets, keeps the values
-- in dlg.data like the real one, and lets a test script act on the dialog when it is shown.
local M = {}

-- script: function(dlg) called by show(); it can edit dlg.data and call dlg.click("Export").
-- Returns the constructor to pass as D, and the list of dialogs that were shown.
function M.new(script)
  local shown = {}
  local function D(options)
    local dlg = { title = options.title, widgets = {}, buttons = {}, data = {}, closed = false }
    local function add(kind, o, value)
      dlg.widgets[#dlg.widgets + 1] = { kind = kind, options = o }
      if o.id then dlg.data[o.id] = value end
      return dlg
    end
    function dlg:label(o) return add("label", o, nil) end
    function dlg:separator(o) return add("separator", o, nil) end
    function dlg:newrow() return dlg end
    function dlg:entry(o) return add("entry", o, o.text) end
    function dlg:number(o) return add("number", o, tonumber(o.text)) end
    function dlg:check(o) return add("check", o, o.selected == true) end
    function dlg:combobox(o) return add("combobox", o, o.option) end
    function dlg:file(o) return add("file", o, o.filename) end
    function dlg:button(o)
      dlg.buttons[o.id or o.text] = o
      return add("button", o, nil)
    end
    function dlg:modify() return dlg end
    function dlg:close() dlg.closed = true end
    function dlg:show()
      shown[#shown + 1] = dlg
      if script then script(dlg, #shown) end
      return dlg
    end
    -- what the user does: click a button, unless it is disabled
    function dlg.click(id)
      local b = dlg.buttons[id]
      assert(b, "no button " .. id)
      if b.enabled == false then return false end
      if b.onclick then b.onclick() end
      return true
    end
    -- the options a widget was created with (its initial value is options.text, .option or .selected)
    function dlg.initial(id)
      for _, w in ipairs(dlg.widgets) do if w.options.id == id then return w.options end end
    end
    function dlg.texts()
      local out = {}
      for _, w in ipairs(dlg.widgets) do if w.kind == "label" then out[#out + 1] = w.options.text end end
      return out
    end
    return dlg
  end
  return D, shown
end

return M
