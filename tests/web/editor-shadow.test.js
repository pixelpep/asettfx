const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../web/src/editor/model.js');
const sel = require('../../web/src/editor/selection.js');
const history = require('../../web/src/editor/history.js');
const exporter = require('../../web/src/editor/export.js');

const gbMeta = () => ({ v: 1, target: 'gbstudio', cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 6 }, mode: 'mono', map: ['0020-007E'] });
const shadow = (extra) => Object.assign({ id: 1, source: 1, color: 3, thickness: 1, dx: 1, dy: 1 }, extra);
const at = (arr, x, y, w = 8) => arr[y * w + x];

test('a shadow is a copy of the source pixels, moved, in its own color', () => {
  const px = new Uint8Array(64); px[2 * 8 + 2] = 1; px[2 * 8 + 3] = 2;
  const out = model.shadowOf(px, 8, 8, [shadow()]);
  assert.equal(at(out, 3, 3), 3);
  assert.equal(out.filter(Boolean).length, 1);            // the pixel of another color has no shadow
});

test('the thickness grows the copy all around, and the cell cuts it', () => {
  const px = new Uint8Array(64); px[7 * 8 + 7] = 1;
  const out = model.shadowOf(px, 8, 8, [shadow({ thickness: 2, dx: 0, dy: 0 })]);
  assert.equal(out.filter(Boolean).length, 4);            // 3 x 3 square, cut to the corner of the cell
  assert.equal(at(out, 6, 6), 3);
  assert.equal(model.shadowOf(px, 8, 8, [shadow({ dx: 3, dy: 3 })]).filter(Boolean).length, 0);
});

test('with two shadows the oldest is on top', () => {
  const px = new Uint8Array(64); px[8 + 1] = 1;
  const out = model.shadowOf(px, 8, 8, [shadow({ color: 2 }), shadow({ id: 2, color: 4 })]);
  assert.equal(at(out, 2, 2), 2);
});

test('the shadow layer is rendered under the writing and follows it, in the drawing too', () => {
  const m = model.create(gbMeta());
  m.setPixel(0x41, 9, 1);                                  // x 1, y 1 of the cell of A
  m.setShadows([shadow()]);
  const pos = m.pixelPosition(0x41, 9);
  const layer = m.renderShadow();
  const o = ((pos.y + 1) * m.width + pos.x + 1) * 4;
  assert.equal(layer[o + 3], 255);
  assert.deepEqual(Array.from(layer.slice(o, o + 3)), model.GB_SHADES[2]);
  const img = exporter.renderDrawing(m);
  assert.deepEqual(Array.from(img.rgba.slice(o, o + 3)), model.GB_SHADES[2]);        // the flat image has the shadow
  m.setPixel(0x41, 18, 4);                                 // the writing hides it: x 2, y 2
  const hidden = ((pos.y + 1) * m.width + pos.x + 1) * 4;
  assert.deepEqual(Array.from(exporter.renderDrawing(m).rgba.slice(hidden, hidden + 3)), model.GB_SHADES[3]);
});

test('shadow changes are undone and redone with the history', () => {
  const m = model.create(gbMeta());
  const h = history.create();
  const after = [shadow()];
  h.push([{ kind: 'shadows', before: [], after }]);
  m.setShadows(after);
  h.undo(m);
  assert.equal(m.shadows.length, 0);
  h.redo(m);
  assert.deepEqual(m.shadows, after);
});

test('switching two colors switches the shadows too', () => {
  const m = model.create(gbMeta());
  m.setPixel(0x41, 0, 1);
  m.setShadows([shadow({ source: 1, color: 3 }), shadow({ id: 2, source: 4, color: 2 })]);
  const done = sel.swapColors(m, 1, 3);
  assert.deepEqual(m.shadows.map(s => [s.source, s.color]), [[3, 1], [4, 2]]);
  const h = history.create(); h.push(done.changes); h.undo(m);
  assert.deepEqual(m.shadows.map(s => [s.source, s.color]), [[1, 3], [4, 2]]);
  assert.equal(m.glyphs.get(0x41).pixels[0], 1);
});

test('a switch that touches only a shadow still counts, and shadows follow a layout change but not a way back to black', () => {
  const m = model.create(gbMeta());
  m.setShadows([shadow({ source: 2, color: 4 })]);
  assert.equal(sel.swapColors(m, 2, 3).changes.length, 1);
  const bigger = Object.assign(gbMeta(), { cell: { w: 8, h: 10 } });
  assert.equal(model.relayout(m, bigger).model.shadows.length, 1);
  const plain = { v: 1, cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 6 }, mode: 'mono', map: ['0020-007E'] };
  const report = model.impact(m, plain);
  assert.equal(report.lostShadows, 1);
  assert.equal(model.risky(report), true);
  assert.equal(model.relayout(m, plain).model.shadows.length, 0);
});

test('switching colors switches the background too, in the flat drawing and in the history', () => {
  const m = model.create(gbMeta());
  assert.equal(m.background, 4);
  const done = sel.swapColors(m, 1, 4);                    // the darkest with the palest, which is the background
  assert.equal(m.background, 1);
  const img = exporter.renderDrawing(m);
  assert.deepEqual(Array.from(img.rgba.slice(0, 3)), model.GB_SHADES[0]);
  const h = history.create(); h.push(done.changes); h.undo(m);
  assert.equal(m.background, 4);
  h.redo(m);
  assert.equal(m.background, 1);
  assert.equal(sel.swapColors(m, 2, 3).changes.length, 0);  // two colors that are not the background change nothing here
  const bigger = Object.assign(gbMeta(), { cell: { w: 8, h: 10 } });
  assert.equal(model.relayout(m, bigger).model.background, 1);
});
