// The drawing of the editor: one glyph per character (not one image), laid out by the grid of the metadata.
// Pure, no DOM. docs/EDITOR.md sections 2 to 4.
(function (root, factory) {
  const dep = name => (typeof require === 'function' && typeof module === 'object')
    ? require('../' + name + '.js') : root.Digiface[name];
  const api = factory(dep('charmap'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.editorModel = api; }
})(typeof self !== 'undefined' ? self : this, function (charmap) {
  'use strict';

  const MARKER = [0xFF, 0x00, 0xFF];
  // The colors the writing layer can use, by mode (docs/EDITOR.md section 4). A pixel of a glyph is 0 (nothing) or the
  // number of its color in the list, starting at 1.
  const PLAIN = [[0x00, 0x00, 0x00]];
  // GB Studio's four shades, from the darkest to the palest (spec/GRID.md "GB Studio templates").
  const GB_SHADES = [[0x07, 0x18, 0x21], [0x30, 0x68, 0x50], [0x86, 0xC0, 0x6C], [0xE0, 0xF8, 0xCF]];

  const BLANK_NAMES = { 0x20: 'space', 0xA0: 'no-break space' };
  const hex = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

  // meta: the metadata of the template (validated). advances: one width per cell, as given by template.renderLayers
  // (the cell width where there is no marker); without it every glyph is as wide as its cell.
  function create(meta, advances) {
    const w = meta.cell.w, h = meta.cell.h, cols = meta.grid.cols, rows = meta.grid.rows;
    const cells = charmap.expandMap(meta.map).cells;
    const variable = meta.mode === 'var' && (meta.widthSource || 'magenta') === 'magenta';
    const gb = meta.target === 'gbstudio';

    const glyphs = new Map();
    const indexOf = new Map();
    cells.forEach((cp, i) => {
      if (cp === null) return;
      glyphs.set(cp, { pixels: new Uint8Array(w * h), width: variable && advances ? advances[i] : w });
      indexOf.set(cp, i);
    });

    const model = {
      meta, cellW: w, cellH: h, cols, rows, cells, variable, gb, glyphs,
      width: cols * w, height: rows * h,
      palette: gb ? GB_SHADES : PLAIN,

      // The cell under a point of the image (whole pixels), or null outside of it.
      cellAt(x, y) {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || y < 0 || x >= model.width || y >= model.height) return null;
        const col = Math.floor(x / w), row = Math.floor(y / h), index = row * cols + col;
        const cp = index < cells.length ? cells[index] : null;
        return { index, col, row, x0: col * w, y0: row * h, cp, assigned: cp !== null, glyph: cp !== null ? glyphs.get(cp) : null, px: x - col * w, py: y - row * h };
      },

      // The position, in the sheet, of the pixel i (row by row) of the glyph of a character: {x, y}.
      pixelPosition(cp, i) {
        const cell = indexOf.get(cp);
        return { x: (cell % cols) * w + (i % w), y: Math.floor(cell / cols) * h + Math.floor(i / w) };
      },

      // Sets the pixel i of a glyph: 0 for nothing, or the number of a color of the palette. Returns {x, y, value}, the pixel of the
      // sheet that changed.
      setPixel(cp, i, value) {
        glyphs.get(cp).pixels[i] = value;
        const pos = model.pixelPosition(cp, i);
        return { x: pos.x, y: pos.y, value };
      },

      // Sets the width of a glyph (the columns of its cell that are not marker), from 1 to the width of the cell. Returns
      // {kind: 'width', cp, width}, the change of the width layer.
      setWidth(cp, width) {
        const g = glyphs.get(cp);
        g.width = Math.max(1, Math.min(w, Math.round(width)));
        return { kind: 'width', cp, width: g.width };
      },

      // What may be wrong with the drawing: [{id, cp, index, row, col, count}]. For now: ink under the width marker, which hides
      // it (the exporter reads the marker, and the pixels under it are lost).
      warnings() {
        const list = [];
        if (!variable) return list;
        for (const [cp, glyph] of glyphs) {
          if (glyph.width >= w) continue;
          let count = 0;
          for (let i = 0; i < glyph.pixels.length; i++) if (glyph.pixels[i] && (i % w) >= glyph.width) count++;
          if (count) { const index = indexOf.get(cp); list.push({ id: 'ink-under-marker', cp, index, row: Math.floor(index / cols), col: index % cols, count }); }
        }
        return list.sort((a, b) => a.index - b.index);
      },

      // The RGBA of a pixel value: transparent for 0.
      rgbaOf(value) {
        if (!value) return [0, 0, 0, 0];
        const c = model.palette[value - 1];
        return [c[0], c[1], c[2], 255];
      },

      // The writing layer as an RGBA image of the whole sheet: transparent where nothing is drawn.
      renderWriting() {
        const rgba = new Uint8Array(model.width * model.height * 4);
        for (const [cp, glyph] of glyphs) {
          const i = indexOf.get(cp);
          const x0 = (i % cols) * w, y0 = Math.floor(i / cols) * h;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const k = glyph.pixels[y * w + x];
            if (!k) continue;
            const c = model.palette[k - 1];
            const o = ((y0 + y) * model.width + x0 + x) * 4;
            rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
          }
        }
        return rgba;
      },

      // The width layer as an RGBA image of the whole sheet: magenta columns from the width of each glyph to the right edge of
      // its cell, over the whole height. Transparent everywhere when the font is not variable.
      renderWidth() {
        const rgba = new Uint8Array(model.width * model.height * 4);
        if (!variable) return rgba;
        for (const [cp, glyph] of glyphs) {
          const i = indexOf.get(cp);
          const x0 = (i % cols) * w, y0 = Math.floor(i / cols) * h;
          for (let x = glyph.width; x < w; x++) for (let y = 0; y < h; y++) {
            const o = ((y0 + y) * model.width + x0 + x) * 4;
            rgba[o] = MARKER[0]; rgba[o + 1] = MARKER[1]; rgba[o + 2] = MARKER[2]; rgba[o + 3] = 255;
          }
        }
        return rgba;
      }
    };
    return model;
  }

  // What a change of the layout (the cell size, the grid, the characters, the mode, GB Studio) does to a drawing, before it is made.
  // old: a model. meta: the new metadata. Returns {hasWork, sameCell, lostGlyphs, lossyColors}: whether anything is drawn, whether
  // the drawings can follow (they can only when the cell has the same size), how many drawn glyphs would be lost (their
  // character is not in the new layout, or the cell size changed), and whether going from GB Studio's shades to black loses some
  // (see convertValue).
  function impact(old, meta) {
    const sameCell = old.cellW === meta.cell.w && old.cellH === meta.cell.h;
    const kept = new Set(charmap.expandMap(meta.map).cells.filter(cp => cp !== null));
    const toGb = meta.target === 'gbstudio';
    let hasWork = false, lostGlyphs = 0, lossyColors = false;
    for (const [cp, glyph] of old.glyphs) {
      if (!glyph.pixels.some(Boolean)) continue;
      hasWork = true;
      if (!sameCell || !kept.has(cp)) lostGlyphs++;
      else if (old.gb && !toGb && glyph.pixels.some(p => p > 1)) lossyColors = true;
    }
    return { hasWork, sameCell, lostGlyphs, lossyColors };
  }

  // A pixel value when the palette changes. From black to GB Studio's shades the number stays (1 is the darkest). From the
  // shades to black, what the exporter reads as ink stays ink (the darkest and the dark shade become black) and the light and
  // the palest shade, which it reads as background, are removed.
  function convertValue(value, fromGb, toGb) {
    if (!value || fromGb === toGb || !fromGb) return value;
    return value <= 2 ? 1 : 0;
  }

  // The drawing of an old model in a new layout: the glyphs follow their character (when the cell has the same size), with
  // their widths in variable mode, and the colors are converted. Returns {model, kept, lost} (counts of drawn glyphs).
  function relayout(old, meta, advances) {
    const next = create(meta, advances);
    const sameCell = old.cellW === next.cellW && old.cellH === next.cellH;
    let kept = 0, lost = 0;
    for (const [cp, glyph] of old.glyphs) {
      const drawn = glyph.pixels.some(Boolean);
      const target = sameCell ? next.glyphs.get(cp) : null;
      if (!target) { if (drawn) lost++; continue; }
      for (let i = 0; i < glyph.pixels.length; i++) target.pixels[i] = convertValue(glyph.pixels[i], old.gb, next.gb);
      if (next.variable && old.variable) target.width = glyph.width;
      if (drawn) kept++;
    }
    return { model: next, kept, lost };
  }

  // The part of the metadata that decides the layout and the mode: when it is the same, the drawing needs no change.
  function layoutKey(meta) {
    return JSON.stringify({ cell: meta.cell, grid: meta.grid, map: meta.map, mode: meta.mode, widthSource: meta.widthSource || 'magenta', target: meta.target || null });
  }

  // The name of a character in a message: U+0041 "A", U+0020 (space).
  function label(cp) {
    const blank = /^[\p{Cc}\p{Zs}\p{Cf}]$/u.test(String.fromCodePoint(cp));
    return hex(cp) + (blank ? ' (' + (BLANK_NAMES[cp] || 'blank') + ')' : ' "' + String.fromCodePoint(cp) + '"');
  }

  // A warning as a sentence, with the place of the cell as the Aseprite extension gives it (rows and columns from 1).
  function describeWarning(warning) {
    const place = label(warning.cp) + ' (row ' + (warning.row + 1) + ', column ' + (warning.col + 1) + ')';
    return place + ': ' + warning.count + (warning.count === 1 ? ' pixel is' : ' pixels are') + ' under the width marker and hidden by it.';
  }

  // "A U+0041", "space U+0020": what to show for a character.
  function describe(cp) {
    const blank = /^[\p{Cc}\p{Zs}\p{Cf}]$/u.test(String.fromCodePoint(cp));
    return (blank ? (BLANK_NAMES[cp] || 'blank') : String.fromCodePoint(cp)) + ' ' + hex(cp);
  }

  // Names of the colors of the palette, for the tool tips.
  const COLOR_NAMES = { plain: ['Black'], gbstudio: ['Darkest', 'Dark', 'Light', 'Palest'] };

  return { PLAIN, GB_SHADES, MARKER, COLOR_NAMES, create, describe, label, describeWarning, impact, relayout, convertValue, layoutKey };
});
