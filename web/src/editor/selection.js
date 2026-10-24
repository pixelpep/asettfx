// The rectangle selection of the editor: reading, clearing, moving and placing pixels of the writing layer, as pure functions
// on the model. docs/EDITOR.md section 5.
//
// A rectangle is {x, y, w, h} in pixels of the sheet. A buffer is {w, h, pixels, gb}: the values of the pixels (0 is transparent: it
// does not overwrite what is under it) and whether they are GB Studio shades. A floating selection is
// {buffer, x, y, from, restore}: the buffer lifted from the layer (from is where it came from, or null for a paste, restore the
// changes that cleared the source), shown at x, y until it is placed (commit) or put back (cancel).
//
// The changes are the ones of the history, [{cp, i, before, after}]; the updates are what the screen needs to redraw,
// [{x, y, value}] as model.setPixel gives them.
(function (root, factory) {
  const model = (typeof require === 'function' && typeof module === 'object') ? require('./model.js') : root.Digiface.editorModel;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.editorSelection = api; }
})(typeof self !== 'undefined' ? self : this, function (modelModule) {
  'use strict';

  // The rectangle between two corners (any order), cut to the sheet; at least one pixel. null when it is outside the sheet.
  function normalize(m, x0, y0, x1, y1) {
    const left = Math.max(0, Math.min(x0, x1)), top = Math.max(0, Math.min(y0, y1));
    const right = Math.min(m.width - 1, Math.max(x0, x1)), bottom = Math.min(m.height - 1, Math.max(y0, y1));
    if (right < left || bottom < top) return null;
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  // The rectangle of a whole cell (the one under a point of the sheet), or null when the cell is unused or outside the sheet.
  function cellRect(m, x, y) {
    const cell = m.cellAt(x, y);
    return cell && cell.assigned ? { x: cell.x0, y: cell.y0, w: m.cellW, h: m.cellH } : null;
  }

  const inside = (r, x, y) => !!r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

  // The pixel of the sheet at (x, y): {cp, i, value}, or null when it is outside the sheet or in an unused cell.
  function pixelAt(m, x, y) {
    const cell = m.cellAt(x, y);
    if (!cell || !cell.assigned) return null;
    const i = cell.py * m.cellW + cell.px;
    return { cp: cell.cp, i, value: cell.glyph.pixels[i] };
  }

  function readBuffer(m, rect) {
    const pixels = new Uint8Array(rect.w * rect.h);
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
      const p = pixelAt(m, rect.x + x, rect.y + y);
      if (p) pixels[y * rect.w + x] = p.value;
    }
    return { w: rect.w, h: rect.h, pixels, gb: m.gb };
  }

  // Clears the pixels of a rectangle. Returns {changes, updates}.
  function clearRect(m, rect) {
    const changes = [], updates = [];
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
      const p = pixelAt(m, rect.x + x, rect.y + y);
      if (!p || !p.value) continue;
      changes.push({ cp: p.cp, i: p.i, before: p.value, after: 0 });
      updates.push(m.setPixel(p.cp, p.i, 0));
    }
    return { changes, updates };
  }

  // Puts the pixels of a buffer with its top-left corner at (x, y). Transparent pixels, pixels outside the sheet and pixels in an
  // unused cell are left out. Returns {changes, updates}.
  function placeBuffer(m, buffer, x, y) {
    const changes = [], updates = [];
    for (let by = 0; by < buffer.h; by++) for (let bx = 0; bx < buffer.w; bx++) {
      const v = buffer.pixels[by * buffer.w + bx];
      if (!v) continue;
      const p = pixelAt(m, x + bx, y + by);
      if (!p || p.value === v) continue;
      changes.push({ cp: p.cp, i: p.i, before: p.value, after: v });
      updates.push(m.setPixel(p.cp, p.i, v));
    }
    return { changes, updates };
  }

  // Several lists of changes in order as one: each pixel keeps its first "before" and its last "after", and the ones that end as
  // they began are dropped.
  function merge(changes) {
    const map = new Map();
    for (const c of changes) {
      const key = c.cp + ':' + c.i;
      if (map.has(key)) map.get(key).after = c.after; else map.set(key, { cp: c.cp, i: c.i, before: c.before, after: c.after });
    }
    return Array.from(map.values()).filter(c => c.before !== c.after);
  }

  // A buffer in the colors of another palette (the shades of GB Studio, or black): see model.convertValue.
  function convertBuffer(buffer, toGb) {
    if (buffer.gb === toGb) return buffer;
    return { w: buffer.w, h: buffer.h, gb: toGb, pixels: buffer.pixels.map(v => modelModule.convertValue(v, buffer.gb, toGb)) };
  }

  // Lifts the pixels of a rectangle: they leave the layer (the source is cleared) and float. Returns {float, updates}.
  function lift(m, rect) {
    const buffer = readBuffer(m, rect);
    const cleared = clearRect(m, rect);
    return { float: { buffer, x: rect.x, y: rect.y, from: { x: rect.x, y: rect.y }, restore: cleared.changes }, updates: cleared.updates };
  }

  // A floating paste of a buffer, at (x, y): nothing leaves the layer.
  function pasteFloat(m, buffer, x, y) {
    const b = convertBuffer(buffer, m.gb);
    const f = { buffer: b, x, y, from: null, restore: [] };
    return moveTo(m, f, x, y);
  }

  // Moves a floating selection to (x, y), kept inside the sheet (as far as the buffer fits in it).
  function moveTo(m, float, x, y) {
    float.x = Math.max(0, Math.min(Math.max(0, m.width - float.buffer.w), x));
    float.y = Math.max(0, Math.min(Math.max(0, m.height - float.buffer.h), y));
    return float;
  }

  // Places the floating selection where it is. Returns {changes, updates}: the changes of the whole gesture (the source cleared and
  // the pixels put), which are none when it was put back where it was taken.
  function commit(m, float) {
    const placed = placeBuffer(m, float.buffer, float.x, float.y);
    return { changes: merge(float.restore.concat(placed.changes)), updates: placed.updates };
  }

  // Puts the lifted pixels back and forgets the float. Returns the updates.
  function cancel(m, float) {
    const updates = [];
    for (const c of float.restore.slice().reverse()) updates.push(m.setPixel(c.cp, c.i, c.before));
    return updates;
  }

  // Swaps two palette colors (values 1..n) in every glyph. Returns {changes, updates}.
  function swapColors(m, a, b) {
    const changes = [], updates = [];
    if (a === b) return { changes, updates };
    for (const [cp, g] of m.glyphs) {
      g.pixels.forEach((v, i) => {
        if (v !== a && v !== b) return;
        const after = v === a ? b : a;
        changes.push({ cp, i, before: v, after });
        updates.push(m.setPixel(cp, i, after));
      });
    }
    // the drop shadows follow: the source color and the color of each one are swapped too
    const swap = v => v === a ? b : v === b ? a : v;
    if (m.shadows.some(s => swap(s.source) !== s.source || swap(s.color) !== s.color)) {
      const before = m.shadows.map(s => Object.assign({}, s));
      const after = before.map(s => Object.assign({}, s, { source: swap(s.source), color: swap(s.color) }));
      updates.push(m.setShadows(after));
      changes.push({ kind: 'shadows', before, after });
    }
    if (m.gb && (swap(m.background) !== m.background)) {   // the background is a color of the palette too
      const before = m.background, after = swap(before);
      updates.push(m.setBackground(after));
      changes.push({ kind: 'background', before, after });
    }
    return { changes, updates };
  }

  return { swapColors, normalize, cellRect, inside, pixelAt, readBuffer, clearRect, placeBuffer, merge, convertBuffer, lift, pasteFloat, moveTo, commit, cancel };
});
