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

  // cfg: {cellW, cellH, cols, rows, map, baseline, prefillWidths, target, guide: {checker, baseline, hint}}
  // maskProvider(cp, cellW, cellH, baseline) returns a Uint8Array(cellW*cellH) of 0/1, or null.
  // With prefillWidths, the width of each cell comes from the ghost character (maskProvider.blankAdvance gives the width of
  // blank characters), the rest of the cell being the magenta marker. Needs hint 'ghost'.
  //
  // The template is made of layers, from the bottom: the background (the base color of each cell, with the baseline ticks),
  // the ghost characters (transparent where there is none), and the width marker, which is one advance per cell (the cell
  // width when there is no marker) drawn as magenta columns on the right of the cell, over its whole height.
  // Returns {width, height, background, ghost, advances}: two RGBA buffers, and one advance per cell of the grid.
  function renderLayers(cfg, maskProvider) {
    const { cellW: w, cellH: h, cols, rows } = cfg;
    const baseline = cfg.baseline || 0;
    const guide = cfg.guide || {};
    const width = cols * w;
    const height = rows * h;
    const background = new Uint8Array(width * height * 4);
    const ghost = new Uint8Array(width * height * 4);
    const advances = new Array(cols * rows).fill(w);
    const cells = charmap.expandMap(cfg.map).cells;
    const gb = cfg.target === 'gbstudio';
    const palette = gb ? GB_COLORS : COLORS;

    const put = (buf, x, y, color) => {
      const o = (y * width + x) * 4;
      buf[o] = color[0]; buf[o + 1] = color[1]; buf[o + 2] = color[2]; buf[o + 3] = 255;
    };

    for (let i = 0; i < cols * rows; i++) {
      const x0 = (i % cols) * w;
      const y0 = Math.floor(i / cols) * h;
      const cp = i < cells.length ? cells[i] : null;
      const assigned = cp !== null;
      const base = !assigned ? palette.unassigned
        : gb ? GB_COLORS.background
        : (guide.checker !== false && ((i % cols) + Math.floor(i / cols)) % 2 === 1) ? COLORS.checkerB : COLORS.checkerA;

      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(background, x0 + x, y0 + y, base);
      if (!assigned) continue;

      if (guide.baseline !== false) {
        const y = h - baseline - 1;
        put(background, x0, y0 + y, palette.baseline);
        put(background, x0 + w - 1, y0 + y, palette.baseline);
      }

      if (guide.hint !== 'none') {
        if (isBlankCodepoint(cp)) {
          if (cfg.prefillWidths && maskProvider && maskProvider.blankAdvance) advances[i] = maskProvider.blankAdvance(w, h, baseline);
          const y = Math.max(0, h - 2);
          for (let x = 1; x < w - 1; x += 2) put(ghost, x0 + x, y0 + y, palette.ghost);
        } else {
          const mask = maskProvider ? maskProvider(cp, w, h, baseline) : null;
          if (mask) {
            if (cfg.prefillWidths) advances[i] = widthFromMask(mask, w, h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) put(ghost, x0 + x, y0 + y, palette.ghost);
          }
        }
      }
    }
    return { width, height, background, ghost, advances };
  }

  // The marker, drawn over a flattened image: magenta columns from the advance to the right edge of each cell.
  function drawMarker(rgba, width, cfg, advances) {
    const { cellW: w, cellH: h, cols, rows } = cfg;
    for (let i = 0; i < cols * rows; i++) {
      const x0 = (i % cols) * w;
      const y0 = Math.floor(i / cols) * h;
      for (let x = advances[i]; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const o = ((y0 + y) * width + x0 + x) * 4;
          rgba[o] = MARKER[0]; rgba[o + 1] = MARKER[1]; rgba[o + 2] = MARKER[2]; rgba[o + 3] = 255;
        }
      }
    }
  }

  // The template as one image: the layers flattened, the marker on top. Returns {width, height, rgba}.
  function render(cfg, maskProvider) {
    const layers = renderLayers(cfg, maskProvider);
    const rgba = layers.background;
    for (let o = 0; o < rgba.length; o += 4) {
      if (layers.ghost[o + 3]) { rgba[o] = layers.ghost[o]; rgba[o + 1] = layers.ghost[o + 1]; rgba[o + 2] = layers.ghost[o + 2]; }
    }
    drawMarker(rgba, layers.width, cfg, layers.advances);
    return { width: layers.width, height: layers.height, rgba };
  }

  return { COLORS, GB_COLORS, GB_INK, GB_PALETTE, MARKER, isBlankCodepoint, widthFromMask, renderLayers, render };
});
