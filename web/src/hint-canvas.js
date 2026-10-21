// Browser-only: turns a character into a crisp 1-bit mask by rendering it with a system font at 8x and thresholding coverage.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ASETTFX = root.ASETTFX || {}; root.ASETTFX.hintCanvas = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCALE = 8;
  const CAP_RATIO = 0.7;   // cap height / font size, typical for Latin fonts
  const THRESHOLDS = [0.4, 0.25, 0.12];  // share of a pixel that must be covered to count as ink; thin glyphs retry lower

  // options: {fontFamily, weight, align, padding, lift, exactSize}. lift raises the characters above the baseline by that many
  // pixels (negative lowers them): the baseline itself, which is also the font's descent, does not move. exactSize is a font size in pixels: the font is then drawn at
  // exactly that size, without fitting it to the cell, which gives a pixel font its own pixels (see spec/GRID.md 6.3). align is 'center' (default) or 'left'. With 'left' the left edge of the ink
  // is placed exactly padding pixels from the left edge of the cell (0 by default), whatever the side bearing of the font.
  // Returns maskProvider(cp, cellW, cellH, baseline).
  function create(options) {
    options = options || {};
    const family = options.fontFamily || 'monospace';
    const weight = options.weight || 'normal';
    const left = options.align === 'left';
    const padding = Math.max(0, options.padding || 0);
    const exact = options.exactSize > 0 ? options.exactSize : 0;
    const lift = Math.round(options.lift || 0);
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');

    function prepare(w, h) {
      const W = w * SCALE, H = h * SCALE;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      return canvas.getContext('2d', { willReadFrequently: true });
    }

    const fontSize = (h, baseline) => Math.max(3, h - baseline - lift - 1) * SCALE / CAP_RATIO;

    const provider = function (cp, w, h, baseline) {
      const W = w * SCALE, H = h * SCALE;
      const ctx = prepare(w, h);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.textAlign = left ? 'left' : 'center';
      ctx.textBaseline = 'alphabetic';

      const text = String.fromCodePoint(cp);
      let size = exact ? exact * SCALE : fontSize(h, baseline);
      ctx.font = weight + ' ' + size + 'px ' + family;
      // ink box of the text, relative to the alignment point (falls back to the advance where it is not available)
      const inkBox = () => {
        const m = ctx.measureText(text);
        if (typeof m.actualBoundingBoxLeft === 'number' && typeof m.actualBoundingBoxRight === 'number') {
          return { left: m.actualBoundingBoxLeft, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight };
        }
        return { left: 0, width: m.width };
      };
      const room = left ? W - padding * SCALE : W * 0.92;
      let box = inkBox();
      if (!exact && box.width > room) {
        size *= room / box.width;
        ctx.font = weight + ' ' + size + 'px ' + family;
        box = inkBox();
      }
      // left: the ink starts at the padding; center: the text is centered on the cell
      ctx.fillText(text, left ? padding * SCALE + box.left : W / 2, (h - baseline - lift) * SCALE);

      const data = ctx.getImageData(0, 0, W, H).data;
      const cover = new Float64Array(w * h);
      const full = SCALE * SCALE * 255;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let sy = 0; sy < SCALE; sy++) {
            const row = ((y * SCALE + sy) * W + x * SCALE) * 4 + 3;
            for (let sx = 0; sx < SCALE; sx++) sum += data[row + sx * 4];
          }
          cover[y * w + x] = sum / full;
        }
      }
      // A thin stroke such as the underscore or a dot can stay under the first threshold everywhere:
      // lower it until something shows, so that no printable character leaves an empty cell.
      const mask = new Uint8Array(w * h);
      for (const threshold of THRESHOLDS) {
        let any = false;
        for (let i = 0; i < cover.length; i++) {
          mask[i] = cover[i] >= threshold ? 1 : 0;
          if (mask[i]) any = true;
        }
        if (any) break;
      }
      return mask;
    };

    // Width in pixels of a space in this font, for cells that have no shape to measure.
    provider.blankAdvance = function (w, h, baseline) {
      const ctx = prepare(w, h);
      ctx.font = weight + ' ' + (exact ? exact * SCALE : fontSize(h, baseline)) + 'px ' + family;
      return Math.max(1, Math.min(w, Math.round(ctx.measureText(' ').width / SCALE)));
    };
    return provider;
  }

  return { create, SCALE, THRESHOLDS };
});
