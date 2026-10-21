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

test('aseprite-extension/digiface/charsets.lua is in sync (run npm run gen:charsets)', async () => {
  const gen = await import('../../tools/gen-charsets.mjs');
  const lua = fs.readFileSync(path.join(__dirname, '..', '..', 'aseprite-extension', 'digiface', 'charsets.lua'), 'utf8');
  assert.equal(lua, gen.renderLua(gen.loadPresets()));
  assert.equal(charsets.presets.length, gen.loadPresets().length);
});

test('every preset is a valid map', () => {
  for (const p of charsets.presets) {
    const { cells } = cm.expandMap(p.map);
    assert.deepEqual(cm.validateMap(p.map, cells.length), [], p.id);
  }
});

test('the GB Studio layout follows gbs-mono.png and gbs-var.png: Windows-1252 order, 11 unused cells', () => {
  const preset = charsets.presets.find(p => p.id === 'gbstudio');
  const { cells, errors } = cm.expandMap(preset.map);
  assert.deepEqual(errors, []);
  assert.equal(cells.length, 224, '16 x 14 cells starting at 0x20');
  const UNUSED = [0x7F, 0x81, 0x8D, 0x8F, 0x90, 0x9D, 0xA0, 0xAD, 0xBC, 0xBD, 0xBE];  // the hatched cells of the two PNG files
  const cp1252 = new TextDecoder('windows-1252');
  for (let b = 0x20; b <= 0xFF; b++) {
    const cell = cells[b - 0x20];
    if (UNUSED.includes(b)) assert.equal(cell, null, 'byte ' + b.toString(16) + ' is a hatched cell');
    else assert.equal(cell, cp1252.decode(Uint8Array.of(b)).codePointAt(0), 'byte ' + b.toString(16));
  }
  assert.equal(cells[0x80 - 0x20], 0x20AC, 'the euro sign is where GB Studio draws it');
  assert.equal(cells[0x99 - 0x20], 0x2122);
  assert.equal(cells[0x9F - 0x20], 0x0178);
  assert.equal(cells.filter(c => c === null).length, 11);
  assert.equal(new Set(cells.filter(c => c !== null)).size, 213, 'no code point twice');
});
