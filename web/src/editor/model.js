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

  // "A U+0041", "space U+0020": what to show for a character.
  function describe(cp) {
    const blank = /^[\p{Cc}\p{Zs}\p{Cf}]$/u.test(String.fromCodePoint(cp));
    return (blank ? (BLANK_NAMES[cp] || 'blank') : String.fromCodePoint(cp)) + ' ' + hex(cp);
  }

  return { PLAIN, GB_SHADES, MARKER, create, describe };
});
