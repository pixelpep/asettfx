// Draws the guide template: checkerboard, ghost characters, baseline ticks. See spec/GRID.md section 6.
(function (root, factory) {
  const dep = name => (typeof require === 'function' && typeof module === 'object')
    ? require('./' + name + '.js') : root.Digiface[name];
  const api = factory(dep('charmap'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.template = api; }
})(typeof self !== 'undefined' ? self : this, function (charmap) {
  'use strict';

  const COLORS = {
    checkerA: [0xF4, 0xF4, 0xF4],
    checkerB: [0xE8, 0xE8, 0xE8],
    unassigned: [0xD2, 0xD2, 0xD2],
    ghost: [0xB4, 0xB4, 0xB4],
    baseline: [0x9C, 0xC3, 0xE6]
  };

  // GB Studio reads a font image by the green channel: below 65 is its darkest shade (the ink, #071821), 205 to 249 is its
  // lightest opaque shade (the background, #E0F8CF); above 249, and magenta, are transparent. The guide colors of a GB Studio
  // template stay in that lightest range, so GB Studio would read them as background even if the template were left visible.
  const GB_COLORS = {
    background: [0xE0, 0xF8, 0xCF],
    unassigned: [0xB4, 0xD8, 0xA4],
    ghost: [0xC0, 0xE0, 0xB0],
    baseline: [0xA0, 0xD0, 0xB8]
  };

  const MARKER = [0xFF, 0x00, 0xFF];

  // The palette of a GB Studio template, which is written as an indexed PNG like GB Studio's own font sheets: the palest color
  // first (the background; Aseprite writes the transparent pixels of a layer as index 0), the darkest second (the ink), then
  // the marker and the three guide colors.
  const GB_INK = [0x07, 0x18, 0x21];
  const GB_PALETTE = [GB_COLORS.background, GB_INK, MARKER, GB_COLORS.ghost, GB_COLORS.unassigned, GB_COLORS.baseline];

  const BLANK_RE = /^[\p{Cc}\p{Zs}\p{Cf}]$/u;

  // Space, control and format characters have no shape to show.
  function isBlankCodepoint(cp) {
    return BLANK_RE.test(String.fromCodePoint(cp));
  }

  // Width of a glyph shown by its ghost: right-most ink column plus one pixel of space.
  // Returns cellW when there is nothing to measure or no room for a marker.
  function widthFromMask(mask, w, h) {
    let last = -1;
    for (let y = 0; y < h; y++) for (let x = w - 1; x > last; x--) if (mask[y * w + x]) { last = x; break; }
    return last < 0 ? w : Math.min(w, last + 2);
  }

  // cfg: {cellW, cellH, cols, rows, map, baseline, prefillWidths, guide: {checker, baseline, hint}}
  // maskProvider(cp, cellW, cellH, baseline) returns a Uint8Array(cellW*cellH) of 0/1, or null.
  // With prefillWidths, magenta columns are drawn at the right of each cell from the ghost width
  // (maskProvider.blankAdvance gives the width of blank characters). Needs hint 'ghost'.
  function render(cfg, maskProvider) {
    const { cellW: w, cellH: h, cols, rows } = cfg;
    const baseline = cfg.baseline || 0;
    const guide = cfg.guide || {};
    const width = cols * w;
    const height = rows * h;
    const rgba = new Uint8Array(width * height * 4);
    const cells = charmap.expandMap(cfg.map).cells;
    const gb = cfg.target === 'gbstudio';
    const palette = gb ? GB_COLORS : COLORS;

    const put = (x, y, color) => {
      const o = (y * width + x) * 4;
      rgba[o] = color[0]; rgba[o + 1] = color[1]; rgba[o + 2] = color[2]; rgba[o + 3] = 255;
    };

    for (let i = 0; i < cols * rows; i++) {
      const x0 = (i % cols) * w;
      const y0 = Math.floor(i / cols) * h;
      const cp = i < cells.length ? cells[i] : null;
      const assigned = cp !== null;
      const base = !assigned ? palette.unassigned
        : gb ? GB_COLORS.background
        : (guide.checker !== false && ((i % cols) + Math.floor(i / cols)) % 2 === 1) ? COLORS.checkerB : COLORS.checkerA;

      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, base);
      if (!assigned) continue;

      // The baseline ticks come first, so that a pixel of the ghost character is never hidden by one (in a small cell
      // the ticks are a large share of the pixels).
      if (guide.baseline !== false) {
        const y = h - baseline - 1;
        put(x0, y0 + y, palette.baseline);
        put(x0 + w - 1, y0 + y, palette.baseline);
      }

      let advance = w;
      if (guide.hint !== 'none') {
        if (isBlankCodepoint(cp)) {
          if (cfg.prefillWidths && maskProvider && maskProvider.blankAdvance) advance = maskProvider.blankAdvance(w, h, baseline);
          const y = Math.max(0, h - 2);
          for (let x = 1; x < w - 1; x += 2) put(x0 + x, y0 + y, palette.ghost);
        } else {
          const mask = maskProvider ? maskProvider(cp, w, h, baseline) : null;
          if (mask) {
            if (cfg.prefillWidths) advance = widthFromMask(mask, w, h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) put(x0 + x, y0 + y, palette.ghost);
          }
        }
      }

      for (let x = advance; x < w; x++) for (let y = 0; y < h; y++) put(x0 + x, y0 + y, MARKER);
    }
    return { width, height, rgba };
  }

  return { COLORS, GB_COLORS, GB_INK, GB_PALETTE, MARKER, isBlankCodepoint, widthFromMask, render };
});
