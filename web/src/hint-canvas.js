// Browser-only: turns a character into a crisp 1-bit mask by rendering it with a system font at 8x and thresholding coverage.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ASETTFX = root.ASETTFX || {}; root.ASETTFX.hintCanvas = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCALE = 8;
  const CAP_RATIO = 0.7;   // cap height / font size, typical for Latin fonts
  const THRESHOLD = 0.4;   // share of a pixel that must be covered to count as ink

  // options: {fontFamily, weight, align}. align is 'center' (default) or 'left' (1 px from the left edge).
  // Returns maskProvider(cp, cellW, cellH, baseline).
  function create(options) {
    options = options || {};
    const family = options.fontFamily || 'monospace';
    const weight = options.weight || 'normal';
    const left = options.align === 'left';
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');

    function prepare(w, h) {
      const W = w * SCALE, H = h * SCALE;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      return canvas.getContext('2d', { willReadFrequently: true });
    }

    const fontSize = (h, baseline) => Math.max(3, h - baseline - 1) * SCALE / CAP_RATIO;

    const provider = function (cp, w, h, baseline) {
      const W = w * SCALE, H = h * SCALE;
      const ctx = prepare(w, h);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.textAlign = left ? 'left' : 'center';
      ctx.textBaseline = 'alphabetic';

      const text = String.fromCodePoint(cp);
      let size = fontSize(h, baseline);
      ctx.font = weight + ' ' + size + 'px ' + family;
      const measured = ctx.measureText(text).width;
      const room = left ? W - SCALE : W * 0.92;
      if (measured > room) {
        size *= room / measured;
        ctx.font = weight + ' ' + size + 'px ' + family;
      }
      ctx.fillText(text, left ? SCALE : W / 2, (h - baseline) * SCALE);

      const data = ctx.getImageData(0, 0, W, H).data;
      const mask = new Uint8Array(w * h);
      const full = SCALE * SCALE * 255;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let sy = 0; sy < SCALE; sy++) {
            const row = ((y * SCALE + sy) * W + x * SCALE) * 4 + 3;
            for (let sx = 0; sx < SCALE; sx++) sum += data[row + sx * 4];
          }
          if (sum / full >= THRESHOLD) mask[y * w + x] = 1;
        }
      }
      return mask;
    };

    // Width in pixels of a space in this font, for cells that have no shape to measure.
    provider.blankAdvance = function (w, h, baseline) {
      const ctx = prepare(w, h);
      ctx.font = weight + ' ' + fontSize(h, baseline) + 'px ' + family;
      return Math.max(1, Math.min(w, Math.round(ctx.measureText(' ').width / SCALE)));
    };
    return provider;
  }

  return { create, SCALE, THRESHOLD };
});
