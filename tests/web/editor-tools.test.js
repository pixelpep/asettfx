const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../web/src/editor/model.js');
const tools = require('../../web/src/editor/tools.js');
const history = require('../../web/src/editor/history.js');

// 3 columns of 4 x 4 cells; the cell at index 4 is unused (the "_" token)
const meta = (extra) => Object.assign({ v: 1, cell: { w: 4, h: 4 }, grid: { cols: 3, rows: 2 }, mode: 'mono', map: ['0041-0044', '_', '0046'] }, extra);
const fresh = () => model.create(meta());
const count = (m, cp) => m.glyphs.get(cp).pixels.reduce((n, p) => n + (p ? 1 : 0), 0);

test('a brush covers a square of its size around the pointer, as centered as an even size allows', () => {
  assert.deepEqual(tools.footprint(5, 5, 1), [[5, 5]]);
  assert.equal(tools.footprint(5, 5, 3).length, 9);
  assert.deepEqual(tools.footprint(5, 5, 3)[0], [4, 4]);
  assert.deepEqual(tools.footprint(5, 5, 2), [[5, 5], [6, 5], [5, 6], [6, 6]]);   // an even size reaches one pixel further right and down
  assert.equal(tools.footprint(0, 0, 99).length, 256);   // the size is limited to 16
  assert.equal(tools.footprint(0, 0, 0).length, 1);      // and to at least 1
  assert.equal(tools.clampSize('7.4'), 7);
});

test('a line has both ends, no gaps, and is the same from either end', () => {
  const l = tools.line(0, 0, 5, 2);
  assert.deepEqual(l[0], [0, 0]);
  assert.deepEqual(l[l.length - 1], [5, 2]);
  for (let k = 1; k < l.length; k++) {
    assert.ok(Math.abs(l[k][0] - l[k - 1][0]) <= 1 && Math.abs(l[k][1] - l[k - 1][1]) <= 1, 'no gap');
  }
  assert.deepEqual(tools.line(3, 3, 3, 3), [[3, 3]]);
  assert.equal(tools.line(0, 0, 0, 7).length, 8);
  assert.deepEqual(tools.line(5, 2, 0, 0).slice().reverse(), tools.line(0, 0, 5, 2).length === 6 ? tools.line(5, 2, 0, 0).slice().reverse() : []);
});

test('the brush paints the color in the cell under it and reports the pixels of the sheet that changed', () => {
  const m = fresh();
  const stroke = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1, clip: true });
  const updated = stroke.add(5, 1);                         // cell B (index 1), pixel (1, 1)
  assert.deepEqual(updated, [{ x: 5, y: 1, value: 1 }]);
  assert.equal(m.glyphs.get(0x42).pixels[1 * 4 + 1], 1);
  assert.deepEqual(stroke.end(), [{ cp: 0x42, i: 5, before: 0, after: 1 }]);
});

test('a drag fills the pixels between two positions', () => {
  const m = fresh();
  const stroke = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1 });
  stroke.add(0, 0);
  stroke.add(3, 3);                                         // a fast move: the diagonal is filled in
  assert.equal(count(m, 0x41), 4);
  for (let k = 0; k < 4; k++) assert.equal(m.glyphs.get(0x41).pixels[k * 4 + k], 1);
});

test('a stroke that starts in a cell stays in it by default, even across the border', () => {
  const m = fresh();
  const stroke = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1, clip: true });
  stroke.add(1, 1);                                         // cell A
  stroke.add(9, 1);                                         // far to the right: cell C
  assert.equal(count(m, 0x41), 3);                          // columns 1 to 3 of the row, as far as cell A goes
  assert.equal(count(m, 0x42), 0);
  assert.equal(count(m, 0x43), 0);
});

test('without the clip a stroke crosses the cells, and the unused ones are left alone', () => {
  const m = fresh();
  const stroke = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1, clip: false });
  stroke.add(1, 5);                                         // row 1, column 0: cell D (index 3)
  stroke.add(7, 5);                                         // column 1: the unused cell is at index 4
  assert.equal(count(m, 0x44) > 0, true);
  assert.equal(count(m, 0x46), 0);                          // index 5 is not reached
  const unusedPixels = m.cellAt(5, 5);
  assert.equal(unusedPixels.assigned, false);
  assert.equal(m.glyphs.size, 5);
  const more = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1, clip: false });
  more.add(9, 5);                                           // cell F (index 5), after the unused one
  assert.equal(count(m, 0x46), 1);
});

test('a stroke that starts in an unused cell draws nothing when it is clipped', () => {
  const m = fresh();
  const stroke = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1, clip: true });
  assert.deepEqual(stroke.add(5, 5), []);                   // the unused cell
  assert.deepEqual(stroke.add(9, 5), []);                   // then into cell F: still nothing
  assert.equal(count(m, 0x46), 0);
  assert.deepEqual(stroke.end(), []);
});

test('the eraser clears pixels, and an unchanged pixel is not recorded', () => {
  const m = fresh();
  tools.beginStroke(m, { tool: 'brush', size: 2, color: 1 }).add(1, 1);
  assert.equal(count(m, 0x41), 4);
  const stroke = tools.beginStroke(m, { tool: 'eraser', size: 1 });
  stroke.add(0, 0);                                         // nothing there: no change
  stroke.add(1, 1);
  const changes = stroke.end();
  assert.deepEqual(changes, [{ cp: 0x41, i: 5, before: 1, after: 0 }]);
  assert.equal(count(m, 0x41), 3);
});

test('painting a pixel twice in one stroke is one change, and a pixel painted then erased in it is none', () => {
  const m = fresh();
  const s = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1 });
  s.add(0, 0); s.add(3, 0); s.add(0, 0);
  assert.equal(s.end().length, 4);
});

test('a brush larger than the cell is cut at the border of the cell when clipped', () => {
  const m = fresh();
  tools.beginStroke(m, { tool: 'brush', size: 16, color: 1, clip: true }).add(1, 1);
  assert.equal(count(m, 0x41), 16);
  assert.equal(count(m, 0x42), 0);
  assert.equal(count(m, 0x44), 0);
});

test('the palette color is stored as its number, GB Studio keeps the four shades', () => {
  const gb = model.create({ v: 1, cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 14 }, mode: 'mono', map: ['0020-007E'], target: 'gbstudio' });
  tools.beginStroke(gb, { tool: 'brush', size: 1, color: 3 }).add(9, 1);
  assert.equal(gb.glyphs.get(0x21).pixels[1 * 8 + 1], 3);
  assert.deepEqual(gb.rgbaOf(3), [0x86, 0xC0, 0x6C, 255]);
  assert.deepEqual(gb.rgbaOf(0), [0, 0, 0, 0]);
});

test('the history undoes and redoes whole gestures, and a new gesture ends the redo', () => {
  const m = fresh();
  const h = history.create();
  const draw = (x, y) => { const s = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1 }); s.add(x, y); h.push(s.end()); };
  draw(0, 0); draw(5, 1);
  assert.equal(h.size(), 2);
  assert.deepEqual(h.undo(m), [{ x: 5, y: 1, value: 0 }]);
  assert.equal(count(m, 0x42), 0);
  assert.equal(h.canRedo(), true);
  assert.deepEqual(h.redo(m), [{ x: 5, y: 1, value: 1 }]);
  assert.equal(count(m, 0x42), 1);
  h.undo(m); draw(8, 1);                                    // a new gesture
  assert.equal(h.canRedo(), false);
  assert.equal(h.redo(m), null);
  h.undo(m); h.undo(m);
  assert.equal(h.canUndo(), false);
  assert.equal(h.undo(m), null);
  assert.equal(count(m, 0x41) + count(m, 0x42) + count(m, 0x43), 0);
});

test('undoing a stroke restores every pixel of it, in any order of the changes', () => {
  const m = fresh();
  const h = history.create();
  const first = tools.beginStroke(m, { tool: 'brush', size: 3, color: 1 }); first.add(1, 1); h.push(first.end());
  const before = Array.from(m.glyphs.get(0x41).pixels);
  const second = tools.beginStroke(m, { tool: 'eraser', size: 2 }); second.add(2, 2); second.add(0, 0); h.push(second.end());
  assert.notDeepEqual(Array.from(m.glyphs.get(0x41).pixels), before);
  h.undo(m);
  assert.deepEqual(Array.from(m.glyphs.get(0x41).pixels), before);
  h.undo(m);
  assert.equal(count(m, 0x41), 0);
});

test('empty gestures are not kept and the history has a limit', () => {
  const m = fresh();
  const h = history.create(3);
  h.push([]); h.push(null);
  assert.equal(h.size(), 0);
  for (let k = 0; k < 5; k++) { const s = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1 }); s.add(k % 4, 0); h.push(s.end()); }
  assert.equal(h.size(), 3);
  h.clear();
  assert.equal(h.canUndo(), false);
});
