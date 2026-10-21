const test = require('node:test');
const assert = require('node:assert/strict');
const fonts = require('../../web/src/fonts.js');
const bundled = require('../../web/src/bundled-fonts.js');

test('the list holds Arial, Times New Roman, the bundled pixel fonts, then the file choice', () => {
  const ids = fonts.FONTS.map(f => f.id);
  assert.deepEqual(ids.slice(0, 2), ['arial', 'times']);
  assert.equal(ids[ids.length - 1], 'file');
  assert.deepEqual(ids.slice(2, -1), bundled.fonts.map(b => 'bundled:' + b.id));
  assert.ok(bundled.fonts.length >= 5);
});

test('Arial and Times are fitted to the cell, always left-aligned', () => {
  for (const id of ['arial', 'times']) {
    const r = fonts.resolve({ id });
    assert.equal(r.align, 'left');
    assert.equal(r.exactSize, 0);
    assert.equal(r.weight, 'normal');
    assert.equal(r.hintFont, r.family);
  }
  assert.match(fonts.resolve({ id: 'arial' }).family, /Arial/);
  assert.match(fonts.resolve({ id: 'times' }).family, /Times/);
});

test('a pixel font read from a file is drawn at its own size', () => {
  const loaded = { family: '"asettfx-font-1"', label: 'Early GameBoy', pixelFont: true, em: 8 };
  const r = fonts.resolve({ id: 'file', loaded });
  assert.equal(r.family, '"asettfx-font-1"');
  assert.equal(r.exactSize, 8);
  assert.equal(r.align, 'left');
  assert.equal(r.hintFont, 'File: Early GameBoy');
});

test('a bundled font records its author and license in the metadata', () => {
  const loaded = { family: '"asettfx-font-2"', label: 'Digital Disco', pixelFont: true, em: 16 };
  const r = fonts.resolve({ id: 'bundled:digital-disco', loaded });
  assert.equal(r.exactSize, 16);
  assert.equal(r.hintFont, 'Digital Disco (jeti, CC BY 4.0)');
  for (const b of bundled.fonts) {
    const text = fonts.resolve({ id: 'bundled:' + b.id, loaded }).hintFont;
    assert.ok(Array.from(text).length <= 64, b.id);
    assert.ok(text.includes(b.author) && text.includes(b.license), b.id);
  }
});

test('a font that is not a pixel font is fitted to the cell', () => {
  const r = fonts.resolve({ id: 'file', loaded: { family: '"x"', label: 'Smooth', pixelFont: false } });
  assert.equal(r.exactSize, 0);
});

test('without the font loaded yet, the choice falls back to Arial', () => {
  assert.match(fonts.resolve({ id: 'file' }).family, /Arial/);
  assert.match(fonts.resolve({ id: 'bundled:digital-disco' }).family, /Arial/);
  assert.match(fonts.resolve({ id: 'unknown' }).family, /Arial/);
});

test('the name recorded for a file fits the metadata limit, whatever the file name', () => {
  const r = fonts.resolve({ id: 'file', loaded: { family: '"x"', label: 'café '.repeat(40), pixelFont: true, em: 8 } });
  assert.ok(Array.from(r.hintFont).length <= 64);
  for (const f of fonts.FONTS) if (f.family) assert.ok(f.family.length <= 64, f.id);
});
