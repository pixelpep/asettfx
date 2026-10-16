const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const charsets = require('../../web/src/charsets.js');
const cm = require('../../web/src/charmap.js');

const dir = path.join(__dirname, '..', '..', 'spec', 'charsets');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

test('web/src/charsets.js is in sync with spec/charsets (run npm run gen:charsets)', () => {
  assert.deepEqual(charsets.presets, files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
});

test('aseprite-extension/asettfx/charsets.lua is in sync (run npm run gen:charsets)', async () => {
  const gen = await import('../../tools/gen-charsets.mjs');
  const lua = fs.readFileSync(path.join(__dirname, '..', '..', 'aseprite-extension', 'asettfx', 'charsets.lua'), 'utf8');
  assert.equal(lua, gen.renderLua(gen.loadPresets()));
  assert.equal(charsets.presets.length, gen.loadPresets().length);
});

test('every preset is a valid map', () => {
  for (const p of charsets.presets) {
    const { cells } = cm.expandMap(p.map);
    assert.deepEqual(cm.validateMap(p.map, cells.length), [], p.id);
  }
});
