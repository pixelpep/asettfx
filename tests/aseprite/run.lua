-- Runs the Lua tests inside Aseprite: tools/run-aseprite-tests.sh (or npm run test:aseprite).
local root = app.params.root
assert(root, "pass --script-param root=<repository>")
package.path = root .. "/aseprite-extension/?.lua;" .. root .. "/tests/aseprite/?.lua;" .. package.path

local T = require("harness")
T.root = root

for _, name in ipairs({ "crc_png_test", "conformance_test", "glyphs_test", "checks_test", "outline_test", "ttf_test", "session_test", "form_test", "commands_test" }) do
  require(name)(T)
end

T.finish()
