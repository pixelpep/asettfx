// The drawing tools of the editor, on the model: brush and eraser. Pure, no DOM. docs/EDITOR.md section 5.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.editorTools = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_SIZE = 1, MAX_SIZE = 16;

  const clampSize = size => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number(size)) || MIN_SIZE));

  // The pixels of a square brush of the given size centered, as far as an even size can be, on (x, y): [[x, y], ...].
  function footprint(x, y, size) {
    const n = clampSize(size);
    const o = Math.floor((n - 1) / 2);
    const points = [];
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) points.push([x - o + dx, y - o + dy]);
    return points;
  }

  // The pixels on the line from (x0, y0) to (x1, y1), both ends included (Bresenham).
  function line(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      points.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return points;
  }

  // A stroke of the brush (it paints the color, a number of the palette, from 1) or of the eraser (it clears), on the writing
  // layer. opts: {tool: 'brush' | 'eraser', size, color, clip}. With clip, the stroke stays in the cell where it started, and
  // nothing is drawn when that cell is unused. Without it, it can cross cells, and only the unused ones are left alone.
  // add(x, y) takes a whole pixel of the sheet and fills in the pixels since the last call; it returns the pixels of the
  // sheet that changed: [{x, y, value}]. end() returns the changes for the history: [{cp, i, before, after}].
  function beginStroke(model, opts) {
    const value = opts.tool === 'eraser' ? 0 : (opts.color || 1);
    const size = clampSize(opts.size);
    const clip = opts.clip !== false;
    const changes = new Map();
    let last = null;
    let start = null;
    let dead = false;

    function stamp(x, y, updated) {
      const cell = model.cellAt(x, y);
      if (!cell || !cell.assigned) return;
      if (clip && start && cell.index !== start.index) return;
      const i = cell.py * model.cellW + cell.px;
      const pixels = cell.glyph.pixels;
      const key = cell.cp + ':' + i;
      const seen = changes.get(key);
      if (pixels[i] === value) return;
      if (seen) seen.after = value; else changes.set(key, { cp: cell.cp, i, before: pixels[i], after: value });
      updated.push(model.setPixel(cell.cp, i, value));
    }

    return {
      add(x, y) {
        if (dead) return [];
        const updated = [];
        if (!last) {
          start = model.cellAt(x, y);
          if (clip && (!start || !start.assigned)) { dead = true; return []; }
        }
        const path = last ? line(last[0], last[1], x, y) : [[x, y]];
        for (const [px, py] of path) for (const [fx, fy] of footprint(px, py, size)) stamp(fx, fy, updated);
        last = [x, y];
        return updated;
      },
      end() {
        return Array.from(changes.values()).filter(c => c.before !== c.after);
      }
    };
  }

  // The width a position gives to a glyph: the number of columns kept, from 1 (a glyph keeps one column at least) to the width of
  // the cell (no marker). The marker starts at the nearest border between two columns, so that the whole range can be chosen:
  // the left half of a column puts the marker at its left, the right half at its right. x is a position of the sheet, not
  // rounded; cell is the cell it is in (model.cellAt).
  function widthAt(model, cell, x) {
    return Math.max(1, Math.min(model.cellW, Math.round(x - cell.x0)));
  }

  // A stroke of the Width tool, in a variable font: it sets the width of the cell where it started to the one the pointer gives
  // (see widthAt), and follows the pointer, even beyond the cell, as long as the button is down. It is a tool of its own, apart
  // from the brush and the eraser: it also clears the marker (a width of the whole cell).
  // add(x, y) takes a position of the sheet, not rounded, and returns the change of the width layer, [{kind: 'width', cp, width}];
  // end() returns the changes for the history: [{kind: 'width', cp, before, after}].
  function beginWidthStroke(model) {
    let start = null;
    let first = true;
    let dead = !model.variable;
    let change = null;

    return {
      add(x, y) {
        if (dead) return [];
        if (first) {
          first = false;
          const cell = model.cellAt(x, y);
          if (!cell || !cell.assigned) { dead = true; return []; }
          start = cell;
          change = { kind: 'width', cp: cell.cp, before: cell.glyph.width, after: cell.glyph.width };
        }
        const width = widthAt(model, start, x);
        if (start.glyph.width === width) return [];
        change.after = width;
        return [model.setWidth(start.cp, width)];
      },
      end() {
        return change && change.before !== change.after ? [change] : [];
      }
    };
  }

  return { MIN_SIZE, MAX_SIZE, clampSize, footprint, line, beginStroke, widthAt, beginWidthStroke };
});
