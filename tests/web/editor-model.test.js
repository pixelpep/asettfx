const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../web/src/editor/model.js');
const tpl = require('../../web/src/template.js');
const gen = require('../../web/src/generate.js');
const charsets = require('../../web/src/charsets.js');

const meta = (extra) => Object.assign({
  v: 1, cell: { w: 4, h: 5 }, grid: { cols: 3, rows: 2 }, mode: 'var', widthSource: 'magenta', map: ['0041-0043', '_', '0045-0046']
}, extra);

test('the model has one glyph per assigned cell and ignores the unused ones', () => {
  const m = model.create(meta());
  assert.equal(m.glyphs.size, 5);
  assert.ok(m.glyphs.has(0x41) && m.glyphs.has(0x46) && !m.glyphs.has(0x44));
  assert.equal(m.width, 12);
  assert.equal(m.height, 10);
  assert.equal(m.glyphs.get(0x41).pixels.length, 20);
});

test('cellAt gives the row, column, character and position in the cell, or null outside the sheet', () => {
  const m = model.create(meta());
  assert.deepEqual([m.cellAt(5, 1).col, m.cellAt(5, 1).row, m.cellAt(5, 1).cp, m.cellAt(5, 1).px, m.cellAt(5, 1).py], [1, 0, 0x42, 1, 1]);
  assert.equal(m.cellAt(2.9, 5.2).cp, null);                 // row 1, column 0: the "_" cell is index 3, which is unused
  assert.equal(m.cellAt(2.9, 5.2).assigned, false);
  assert.equal(m.cellAt(4, 5).cp, 0x45);                      // index 4
  assert.equal(m.cellAt(-1, 0), null);
  assert.equal(m.cellAt(12, 0), null);
  assert.equal(m.cellAt(0, 10), null);
});

test('in variable mode the widths come from the advances and the width layer draws magenta columns over the whole cell height', () => {
  const m = model.create(meta(), [2, 4, 3, 4, 4, 1]);
  assert.equal(m.glyphs.get(0x41).width, 2);
  assert.equal(m.glyphs.get(0x42).width, 4);
  const rgba = m.renderWidth();
  const at = (x, y) => Array.from(rgba.subarray((y * m.width + x) * 4, (y * m.width + x) * 4 + 4));
  for (let y = 0; y < 5; y++) {
    assert.deepEqual(at(2, y), [255, 0, 255, 255]);       // cell A, columns 2 and 3
    assert.deepEqual(at(3, y), [255, 0, 255, 255]);
    assert.deepEqual(at(1, y), [0, 0, 0, 0]);
    assert.deepEqual(at(4, y), [0, 0, 0, 0]);             // cell B is full width: no marker
    assert.deepEqual(at(11, y), [255, 0, 255, 255]);      // cell F has width 1: columns 1 to 3, so the last one is magenta
  }
  assert.deepEqual(at(0, 5), [0, 0, 0, 0]);               // the unused cell
});

test('without the variable mode there is no width layer', () => {
  const m = model.create(meta({ mode: 'mono' }), [1, 1, 1, 1, 1, 1]);
  assert.equal(m.variable, false);
  assert.equal(m.glyphs.get(0x41).width, 4);
  assert.ok(m.renderWidth().every(b => b === 0));
});

test('the writing layer draws the pixels of the glyphs with the colors of the mode', () => {
  const plain = model.create(meta());
  plain.glyphs.get(0x42).pixels[0] = 1;                    // top-left pixel of cell B
  const rgba = plain.renderWriting();
  assert.deepEqual(Array.from(rgba.subarray(4 * 4, 4 * 4 + 4)), [0, 0, 0, 255]);
  assert.equal(rgba[0 + 3], 0);
  assert.deepEqual(plain.palette, [[0, 0, 0]]);

  const gb = model.create(Object.assign(meta(), { cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 14 }, map: ['0020-007E'], target: 'gbstudio' }));
  assert.equal(gb.gb, true);
  assert.equal(gb.palette.length, 4);
  gb.glyphs.get(0x21).pixels[0] = 3;                       // the third shade
  const g = gb.renderWriting();
  assert.deepEqual(Array.from(g.subarray(8 * 4, 8 * 4 + 4)), [0x86, 0xC0, 0x6C, 255]);
});

test('the colors of GB Studio are the ones of the GB Studio template', () => {
  assert.deepEqual(model.GB_SHADES[0], tpl.GB_INK);
  assert.deepEqual(model.GB_SHADES[3], tpl.GB_COLORS.background);
  assert.deepEqual(model.MARKER, tpl.MARKER);
});

test('describe names a character and its code point', () => {
  assert.equal(model.describe(0x41), 'A U+0041');
  assert.equal(model.describe(0x20), 'space U+0020');
  assert.equal(model.describe(0xA0), 'no-break space U+00A0');
  assert.equal(model.describe(0x20AC), '€ U+20AC');
  assert.equal(model.describe(0x200B), 'blank U+200B');
});

test('layers from the generator feed the model: the advances give the widths of the glyphs', () => {
  const layers = gen.layers({
    name: 'T', cellW: 8, cellH: 8, cols: 16, mode: 'var', widthSource: 'magenta', map: ['0020-007E'], baseline: 1,
    guide: { checker: true, baseline: true, hint: 'ghost', prefill: true, hintFont: 'x' }
  }, (cp, w, h) => { const m = new Uint8Array(w * h); m[2 * w + 1] = 1; m[3 * w + 2] = 1; return m; });
  assert.equal(layers.ok, true);
  const m = model.create(layers.meta, layers.advances);
  assert.equal(m.glyphs.get(0x41).width, 4);                // right-most ink column 2, plus one pixel of space
  assert.equal(m.glyphs.get(0x20).width, 8);                // a blank character without blankAdvance keeps its cell
  assert.equal(layers.advances.length, 16 * 6);
});

test('layoutKey changes with the layout and the mode, not with the guide', () => {
  const a = meta();
  const key = model.layoutKey(a);
  assert.equal(model.layoutKey(Object.assign({}, a, { guide: { checker: false }, metrics: { baseline: 2 }, name: 'other' })), key);
  assert.notEqual(model.layoutKey(Object.assign({}, a, { mode: 'mono' })), key);
  assert.notEqual(model.layoutKey(Object.assign({}, a, { cell: { w: 8, h: 5 } })), key);
  assert.notEqual(model.layoutKey(Object.assign({}, a, { map: ['0041-0046'] })), key);
  assert.notEqual(model.layoutKey(Object.assign({}, a, { target: 'gbstudio' })), key);
});

test('a drawing follows its characters when the grid changes and the cell keeps its size', () => {
  const old = model.create(meta(), [4, 4, 4, 4, 4, 4]);
  old.glyphs.get(0x41).pixels[0] = 1;
  old.glyphs.get(0x45).pixels[5] = 1;
  old.glyphs.get(0x45).width = 2;
  const moved = Object.assign(meta(), { grid: { cols: 2, rows: 3 }, map: ['0045', '0041-0043'] });   // reordered, E first, F gone
  const report = model.impact(old, moved);
  assert.deepEqual(report, { hasWork: true, sameCell: true, lostGlyphs: 0, lossyColors: false });
  const r = model.relayout(old, moved, [4, 4, 4, 4]);
  assert.equal(r.kept, 2);
  assert.equal(r.lost, 0);
  assert.equal(r.model.glyphs.get(0x41).pixels[0], 1);
  assert.equal(r.model.glyphs.get(0x45).pixels[5], 1);
  assert.equal(r.model.glyphs.get(0x45).width, 2);                          // the width follows too
  assert.equal(r.model.cellAt(0, 0).cp, 0x45);                              // and the first cell is now E
});

test('characters that leave the layout lose their drawing, the others keep it', () => {
  const old = model.create(meta());
  old.glyphs.get(0x41).pixels[0] = 1;
  old.glyphs.get(0x46).pixels[0] = 1;
  const fewer = Object.assign(meta(), { map: ['0041-0043'] });
  assert.equal(model.impact(old, fewer).lostGlyphs, 1);
  const r = model.relayout(old, fewer);
  assert.equal(r.lost, 1);
  assert.equal(r.kept, 1);
  assert.equal(r.model.glyphs.has(0x46), false);
});

test('a change of the cell size starts the drawing again', () => {
  const old = model.create(meta());
  old.glyphs.get(0x41).pixels[0] = 1;
  const bigger = Object.assign(meta(), { cell: { w: 8, h: 8 } });
  const report = model.impact(old, bigger);
  assert.equal(report.sameCell, false);
  assert.equal(report.lostGlyphs, 1);
  const r = model.relayout(old, bigger);
  assert.equal(r.kept, 0);
  assert.equal(r.model.glyphs.get(0x41).pixels.every(p => p === 0), true);
  // an empty drawing loses nothing
  assert.deepEqual(model.impact(model.create(meta()), bigger), { hasWork: false, sameCell: false, lostGlyphs: 0, lossyColors: false });
});

test('going to GB Studio keeps the pixels, going back keeps what is ink and drops what is background', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(v => model.convertValue(v, false, true)), [0, 1, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 4].map(v => model.convertValue(v, true, false)), [0, 1, 1, 0, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].map(v => model.convertValue(v, true, true)), [0, 1, 2, 3, 4]);

  const gbMeta = { v: 1, cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 6 }, mode: 'mono', map: ['0020-007E'], target: 'gbstudio' };
  const plainMeta = Object.assign({}, gbMeta); delete plainMeta.target;
  const gb = model.create(gbMeta);
  gb.glyphs.get(0x41).pixels[0] = 1; gb.glyphs.get(0x41).pixels[1] = 2; gb.glyphs.get(0x41).pixels[2] = 3; gb.glyphs.get(0x41).pixels[3] = 4;
  assert.equal(model.impact(gb, plainMeta).lossyColors, true);
  const back = model.relayout(gb, plainMeta);
  assert.deepEqual(Array.from(back.model.glyphs.get(0x41).pixels.subarray(0, 4)), [1, 1, 0, 0]);
  // from black to GB Studio: the same numbers, nothing lost
  const plain = model.create(plainMeta);
  plain.glyphs.get(0x41).pixels[0] = 1;
  assert.equal(model.impact(plain, gbMeta).lossyColors, false);
  assert.equal(model.relayout(plain, gbMeta).model.glyphs.get(0x41).pixels[0], 1);
});
