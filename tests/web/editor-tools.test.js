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

// ---- the width layer (milestone 3)
const vmeta = () => Object.assign(meta(), { mode: 'var', widthSource: 'magenta' });
const variable = () => model.create(vmeta(), [4, 4, 4, 4, 4, 4]);

test('the Width tool puts the marker at the nearest border between columns, in the cell where it started', () => {
  const m = variable();
  const s = tools.beginWidthStroke(m);
  assert.deepEqual(s.add(6.2, 1), [{ kind: 'width', cp: 0x42, width: 2 }]);  // cell B starts at x = 4: 2.2 is nearest to the border 2
  assert.equal(m.glyphs.get(0x42).width, 2);
  s.add(5.4, 1);                                                              // 1.4 -> border 1
  assert.equal(m.glyphs.get(0x42).width, 1);
  assert.deepEqual(s.add(5.4, 3), []);                                        // the same width: nothing changes
  s.add(9.9, 1);                                                              // dragged into the next cell: still the cell B, clamped to its width
  assert.equal(m.glyphs.get(0x42).width, 4);
  assert.equal(m.glyphs.get(0x43).width, 4);                                  // the other cell is not touched
  assert.deepEqual(s.end(), []);                                              // it is back to where it was: no change for the history
});

test('the whole range of widths can be chosen: the left half of a column and its right half differ', () => {
  const m = variable();
  const at = (x) => { const s = tools.beginWidthStroke(m); s.add(x, 1); return m.glyphs.get(0x41).width; };
  assert.equal(at(0.2), 1);                                                    // the first border would give 0: a glyph keeps one column
  assert.equal(at(1.4), 1);
  assert.equal(at(1.6), 2);
  assert.equal(at(2.4), 2);
  assert.equal(at(3.6), 4);                                                    // the right half of the last column: the whole cell, no marker
  assert.equal(tools.widthAt(m, m.cellAt(0, 0), 3.99), 4);
  assert.deepEqual(tools.beginWidthStroke(m).add(0.2, 0), [{ kind: 'width', cp: 0x41, width: 1 }]);
});

test('the history entry of a width stroke goes from the first width to the last', () => {
  const m = variable();
  const s = tools.beginWidthStroke(m);
  s.add(6, 1); s.add(5, 1); s.add(6, 1);
  assert.deepEqual(s.end(), [{ kind: 'width', cp: 0x42, before: 4, after: 2 }]);
});

test('the Width tool does nothing in a monospace font, in an unused cell, or outside the sheet', () => {
  const mono = model.create(meta());
  assert.deepEqual(tools.beginWidthStroke(mono).add(1.4, 1), []);
  const m = variable();
  assert.deepEqual(tools.beginWidthStroke(m).add(5, 5), []);                   // the unused cell (index 4)
  assert.deepEqual(tools.beginWidthStroke(m).add(-3, 0), []);
  const s = tools.beginWidthStroke(m);
  s.add(5, 5);
  assert.deepEqual(s.add(1, 1), []);                                           // started in an unused cell: the stroke stays dead
  assert.deepEqual(s.end(), []);
});

test('the history undoes and redoes widths with the pixels of the same gesture', () => {
  const m = variable();
  const h = history.create();
  const px = tools.beginStroke(m, { tool: 'brush', size: 1, color: 1 }); px.add(3, 0);
  const wd = tools.beginWidthStroke(m); wd.add(2, 0);
  h.push(px.end().concat(wd.end()));
  assert.equal(m.glyphs.get(0x41).width, 2);
  assert.equal(count(m, 0x41), 1);
  const undone = h.undo(m);
  assert.equal(m.glyphs.get(0x41).width, 4);
  assert.equal(count(m, 0x41), 0);
  assert.ok(undone.some(u => u.kind === 'width' && u.cp === 0x41 && u.width === 4));
  assert.ok(undone.some(u => u.value === 0 && u.x === 3));
  const redone = h.redo(m);
  assert.equal(m.glyphs.get(0x41).width, 2);
  assert.equal(count(m, 0x41), 1);
  assert.ok(redone.some(u => u.kind === 'width' && u.width === 2));
});

test('ink under the width marker is a warning, with the place of the cell', () => {
  const m = variable();
  m.glyphs.get(0x42).pixels[3] = 1;                                          // column 3 of the first row of B
  assert.deepEqual(m.warnings(), []);                                        // the width is the whole cell
  m.setWidth(0x42, 2);
  m.glyphs.get(0x42).pixels[0] = 1;                                          // column 0: under nothing
  const list = m.warnings();
  assert.deepEqual(list, [{ id: 'ink-under-marker', cp: 0x42, index: 1, row: 0, col: 1, count: 1 }]);
  assert.equal(model.describeWarning(list[0]), 'U+0042 "B" (row 1, column 2): 1 pixel is under the width marker and hidden by it.');
  m.glyphs.get(0x43).pixels.fill(1); m.setWidth(0x43, 1);
  assert.equal(m.warnings().length, 2);
  assert.match(model.describeWarning(m.warnings()[1]), /U\+0043 "C" \(row 1, column 3\): 12 pixels are under/);
  // no marker in a monospace font, so nothing to warn about
  const mono = model.create(meta());
  mono.glyphs.get(0x41).pixels.fill(1); mono.setWidth(0x41, 1);
  assert.deepEqual(mono.warnings(), []);
  assert.equal(model.label(0x20), 'U+0020 (space)');
});
