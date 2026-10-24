const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../web/src/editor/model.js');
const sel = require('../../web/src/editor/selection.js');
const history = require('../../web/src/editor/history.js');

// 3 columns of 4 x 4 cells, 2 rows: the sheet is 12 x 8; the cell at index 4 (row 1, column 1) is unused
const meta = (extra) => Object.assign({ v: 1, cell: { w: 4, h: 4 }, grid: { cols: 3, rows: 2 }, mode: 'mono', map: ['0041-0044', '_', '0046'] }, extra);
const fresh = () => model.create(meta());
const px = (m, x, y) => sel.pixelAt(m, x, y);
const set = (m, x, y, v = 1) => { const p = px(m, x, y); m.setPixel(p.cp, p.i, v); };

test('a rectangle is normalized, cut to the sheet, and null outside of it', () => {
  const m = fresh();
  assert.deepEqual(sel.normalize(m, 5, 3, 2, 1), { x: 2, y: 1, w: 4, h: 3 });
  assert.deepEqual(sel.normalize(m, -5, -5, 2, 1), { x: 0, y: 0, w: 3, h: 2 });
  assert.deepEqual(sel.normalize(m, 10, 6, 40, 40), { x: 10, y: 6, w: 2, h: 2 });
  assert.equal(sel.normalize(m, 20, 20, 30, 30), null);
  assert.deepEqual(sel.normalize(m, 3, 3, 3, 3), { x: 3, y: 3, w: 1, h: 1 });
});

test('a whole cell can be selected, unless it is unused or outside', () => {
  const m = fresh();
  assert.deepEqual(sel.cellRect(m, 5, 2), { x: 4, y: 0, w: 4, h: 4 });
  assert.equal(sel.cellRect(m, 5, 5), null);                       // the unused cell
  assert.equal(sel.cellRect(m, 50, 5), null);
  assert.equal(sel.inside({ x: 2, y: 2, w: 3, h: 3 }, 4, 4), true);
  assert.equal(sel.inside({ x: 2, y: 2, w: 3, h: 3 }, 5, 4), false);
  assert.equal(sel.inside(null, 0, 0), false);
});

test('reading a rectangle gives the values, and clearing it gives the changes', () => {
  const m = fresh();
  set(m, 1, 1, 1); set(m, 2, 1, 1); set(m, 5, 2, 1);
  const b = sel.readBuffer(m, { x: 0, y: 0, w: 6, h: 3 });
  assert.equal(b.w, 6); assert.equal(b.h, 3);
  assert.deepEqual(Array.from(b.pixels), [0, 0, 0, 0, 0, 0,  0, 1, 1, 0, 0, 0,  0, 0, 0, 0, 0, 1]);
  const cleared = sel.clearRect(m, { x: 0, y: 0, w: 6, h: 3 });
  assert.equal(cleared.changes.length, 3);
  assert.deepEqual(cleared.changes.find(c => c.cp === 0x42), { cp: 0x42, i: 2 * 4 + 1, before: 1, after: 0 });
  assert.equal(px(m, 1, 1).value, 0);
  assert.equal(cleared.updates.length, 3);
});

test('moving a selection to another cell moves the pixels to the other glyph, and one gesture undoes it', () => {
  const m = fresh();
  set(m, 1, 1); set(m, 2, 2);
  const h = history.create();
  const { float, updates } = sel.lift(m, { x: 0, y: 0, w: 4, h: 4 });
  assert.equal(updates.length, 2);
  assert.equal(px(m, 1, 1).value, 0);                              // lifted: the layer is clear
  sel.moveTo(m, float, 4, 0);                                      // to the next cell
  const done = sel.commit(m, float);
  h.push(done.changes);
  assert.equal(px(m, 5, 1).value, 1);
  assert.equal(px(m, 6, 2).value, 1);
  assert.equal(m.glyphs.get(0x41).pixels.some(Boolean), false);
  assert.equal(m.glyphs.get(0x42).pixels.filter(Boolean).length, 2);
  assert.equal(h.size(), 1);
  h.undo(m);
  assert.equal(px(m, 1, 1).value, 1);
  assert.equal(m.glyphs.get(0x42).pixels.some(Boolean), false);
  h.redo(m);
  assert.equal(px(m, 5, 1).value, 1);
});

test('a selection put back where it was taken changes nothing', () => {
  const m = fresh();
  set(m, 1, 1); set(m, 3, 3, 1);
  const { float } = sel.lift(m, { x: 0, y: 0, w: 4, h: 4 });
  const done = sel.commit(m, float);
  assert.deepEqual(done.changes, []);
  assert.equal(px(m, 1, 1).value, 1);
  assert.equal(px(m, 3, 3).value, 1);
});

test('canceling a lift puts every pixel back', () => {
  const m = fresh();
  set(m, 0, 0); set(m, 1, 1);
  const before = Array.from(m.glyphs.get(0x41).pixels);
  const { float } = sel.lift(m, { x: 0, y: 0, w: 4, h: 4 });
  sel.moveTo(m, float, 8, 4);
  const updates = sel.cancel(m, float);
  assert.equal(updates.length, 2);
  assert.deepEqual(Array.from(m.glyphs.get(0x41).pixels), before);
});

test('transparent pixels do not overwrite, and unused cells and the outside are left out', () => {
  const m = fresh();
  set(m, 4, 0, 1);                                                 // the top-left pixel of cell B
  const buffer = { w: 3, h: 1, pixels: Uint8Array.from([0, 1, 1]), gb: false };
  const r = sel.placeBuffer(m, buffer, 4, 0);                      // [transparent, ink, ink]
  assert.equal(px(m, 4, 0).value, 1);                              // under the transparent pixel: kept
  assert.equal(r.changes.length, 2);
  const into = sel.placeBuffer(m, { w: 2, h: 2, pixels: Uint8Array.from([1, 1, 1, 1]), gb: false }, 3, 3);   // 3,3 is cell D; 4,3 is B; 3,4 and 4,4 are...
  assert.ok(into.changes.length >= 1);
  const unused = sel.placeBuffer(m, { w: 1, h: 1, pixels: Uint8Array.from([1]), gb: false }, 5, 5);          // the unused cell
  assert.deepEqual(unused.changes, []);
  const outside = sel.placeBuffer(m, { w: 3, h: 1, pixels: Uint8Array.from([1, 1, 1]), gb: false }, 10, 0);
  assert.equal(outside.changes.length, 2);                         // only the two pixels still in the sheet
});

test('a paste floats, stays in the sheet, and is placed on commit', () => {
  const m = fresh();
  const buffer = { w: 2, h: 2, pixels: Uint8Array.from([1, 0, 1, 1]), gb: false };
  const f = sel.pasteFloat(m, buffer, 100, 100);                   // far outside: kept inside, as near as possible
  assert.deepEqual([f.x, f.y], [10, 6]);
  assert.equal(f.from, null);
  sel.moveTo(m, f, 1, 1);
  const done = sel.commit(m, f);
  assert.equal(done.changes.length, 3);
  assert.equal(px(m, 1, 1).value, 1);
  assert.equal(px(m, 2, 1).value, 0);
  assert.equal(px(m, 1, 2).value, 1);
  // a paste canceled leaves nothing: it never touched the layer
  const g = sel.pasteFloat(m, buffer, 4, 0);
  assert.deepEqual(sel.cancel(m, g), []);
  assert.equal(px(m, 4, 0).value, 0);
});

test('a buffer bigger than the sheet sits at its corner', () => {
  const m = fresh();
  const big = { w: 20, h: 20, pixels: new Uint8Array(400), gb: false };
  const f = sel.pasteFloat(m, big, 5, 5);
  assert.deepEqual([f.x, f.y], [0, 0]);
});

test('merging keeps the first before and the last after, and drops what ends where it began', () => {
  const merged = sel.merge([
    { cp: 1, i: 0, before: 0, after: 1 }, { cp: 1, i: 0, before: 1, after: 2 },
    { cp: 1, i: 1, before: 1, after: 0 }, { cp: 1, i: 1, before: 0, after: 1 },
    { cp: 2, i: 5, before: 3, after: 0 }]);
  assert.deepEqual(merged, [{ cp: 1, i: 0, before: 0, after: 2 }, { cp: 2, i: 5, before: 3, after: 0 }]);
});

test('a pasted buffer follows the palette of the sheet: shades to black, or black to shades', () => {
  const plain = model.create(meta());
  const gbMeta = { v: 1, cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 6 }, mode: 'mono', map: ['0020-007E'], target: 'gbstudio' };
  const gb = model.create(gbMeta);
  const shades = { w: 4, h: 1, pixels: Uint8Array.from([1, 2, 3, 4]), gb: true };
  assert.deepEqual(Array.from(sel.convertBuffer(shades, false).pixels), [1, 1, 0, 0]);
  const f = sel.pasteFloat(plain, shades, 0, 0);
  assert.deepEqual(Array.from(f.buffer.pixels), [1, 1, 0, 0]);
  const black = { w: 2, h: 1, pixels: Uint8Array.from([1, 1]), gb: false };
  assert.deepEqual(Array.from(sel.pasteFloat(gb, black, 0, 0).buffer.pixels), [1, 1]);
  assert.equal(sel.pasteFloat(gb, shades, 0, 0).buffer.pixels[2], 3);                // shades kept in a GB Studio sheet
});

test('swapping two colors changes every glyph, can be undone, and leaves the others alone', () => {
  const m = model.create(meta({ target: 'gbstudio', cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 2 }, map: ['0020-007E'] }));
  const cps = [0x41, 0x42];
  m.setPixel(cps[0], 0, 1); m.setPixel(cps[0], 1, 3); m.setPixel(cps[1], 5, 3); m.setPixel(cps[1], 6, 2);
  const h = history.create();
  const done = sel.swapColors(m, 1, 3);
  h.push(done.changes);
  assert.deepEqual([m.glyphs.get(0x41).pixels[0], m.glyphs.get(0x41).pixels[1], m.glyphs.get(0x42).pixels[5], m.glyphs.get(0x42).pixels[6]], [3, 1, 1, 2]);
  h.undo(m);
  assert.deepEqual([m.glyphs.get(0x41).pixels[0], m.glyphs.get(0x41).pixels[1], m.glyphs.get(0x42).pixels[5], m.glyphs.get(0x42).pixels[6]], [1, 3, 3, 2]);
  assert.equal(sel.swapColors(m, 2, 2).changes.length, 0);
});
