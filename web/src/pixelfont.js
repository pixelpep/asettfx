// Finds out whether a font is a pixel font and at which size one font pixel is one screen pixel.
// The font is drawn large; the lengths of the ink runs and of the gaps between them are then fitted to a grid.
// This works for any format the browser can draw, without reading the font file itself.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.pixelfont = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PROBE = 'HIlimnoEWTgjy.,:!?%&@Qa';
  const PROBE_SIZE = 512;
  const MIN_EM = 3, MAX_EM = 64, EM_STEP = 1 / 16;
  const GLYPH_SCORE = 0.97;   // share of one character's runs that must sit on the grid for the character to fit
  const MIN_GLYPH_SHARE = 0.4; // share of the characters that must fit (the others may be missing from the font)
  const MIN_GLYPHS = 4;

  // Lengths of the ink runs and of the gaps between ink runs, along every row and column of a binary mask.
  function collectRuns(mask, w, h) {
    const runs = [];
    const scan = (get, length) => {
      let first = -1, last = -1;
      for (let i = 0; i < length; i++) if (get(i)) { if (first < 0) first = i; last = i; }
      if (first < 0) return;
      let start = first, state = 1;
      for (let i = first + 1; i <= last + 1; i++) {
        const v = i <= last ? get(i) : -1;
        if (v !== state) { runs.push(i - start); start = i; state = v; }
      }
    };
    for (let y = 0; y < h; y++) scan(x => mask[y * w + x] ? 1 : 0, w);
    for (let x = 0; x < w; x++) scan(y => mask[y * w + x] ? 1 : 0, h);
    return runs;
  }

  function fitsAt(runs, unit, tolerance) {
    let fit = 0;
    for (const r of runs) {
      const k = Math.round(r / unit);
      if (k >= 1 && Math.abs(r - k * unit) <= tolerance) fit++;
    }
    return runs.length ? fit / runs.length : 0;
  }

  // groups: one array of run lengths per character (a flat array of numbers counts as one character), measured on a
  // drawing of the font at `size` pixels. Returns {em, unit, score, fitted} for the coarsest grid that fits, or null
  // when the font is not made of pixels. em is the font size in pixels at which one font pixel is exactly one pixel.
  // A character the font does not have is drawn by another font, so it never fits and is simply left out.
  function fitGrid(groups, size) {
    if (groups.length && typeof groups[0] === 'number') groups = [groups];
    groups = groups.filter(g => g.length >= 8);
    if (!groups.length) return null;
    const tolerance = Math.max(2.5, size / 200);  // an edge is found to within a pixel on each side
    const needed = Math.min(groups.length, Math.max(MIN_GLYPHS, Math.ceil(groups.length * MIN_GLYPH_SHARE)));
    for (let em = MIN_EM; em <= MAX_EM + 1e-9; em += EM_STEP) {
      const unit = size / em;
      const fitted = groups.filter(g => fitsAt(g, unit, tolerance) >= GLYPH_SCORE);
      if (fitted.length < needed) continue;
      // refine the unit by least squares over the runs of the characters that fit
      let top = 0, bottom = 0, fit = 0, all = 0;
      for (const g of fitted) {
        for (const r of g) {
          all++;
          const k = Math.round(r / unit);
          if (k >= 1 && Math.abs(r - k * unit) <= tolerance) { top += r * k; bottom += k * k; fit++; }
        }
      }
      const refined = top / bottom;
      let found = size / refined;
      const whole = Math.round(found);
      if (Math.abs(found - whole) <= 0.004 * found) found = whole;  // measurement noise: 15.95 is 16
      return { em: found, unit: size / found, score: fit / all, fitted: fitted.length };
    }
    return null;
  }

  // Draws the probe characters large and returns the runs of each, one array per character.
  function measureRuns(family, makeCanvas) {
    const size = PROBE_SIZE;
    const canvas = makeCanvas(size * 2, size * 2);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const groups = [];
    for (const ch of PROBE) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.font = 'normal ' + size + 'px ' + family;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ch, size / 2, size * 1.3);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const mask = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
      groups.push(collectRuns(mask, canvas.width, canvas.height));
    }
    return groups;
  }

  // Whether the font itself has a glyph for the character. A character the font lacks is drawn by another font, or as the
  // "missing character" box of the first font that is tried, so it is told apart from a real glyph by three comparisons:
  // the font alone is not what the fallback font draws, is not the font's own missing-character box, and is not empty.
  const glyphCache = new Map();
  const sameAlpha = (a, b) => { for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false; return true; };
  const hasInk = a => { for (let i = 3; i < a.length; i += 4) if (a[i]) return true; return false; };

  function hasGlyph(family, ch, makeCanvas) {
    const key = family + '|' + ch;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const size = 32;
    const canvas = makeCanvas(size * 2, size * 2);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const draw = (stack, text) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.font = 'normal ' + size + 'px ' + stack;
      ctx.fillText(text, 4, size * 1.3);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const missingKey = family + '|notdef';
    if (!glyphCache.has(missingKey)) glyphCache.set(missingKey, draw(family + ', serif', '\uFFFF'));  // not a character at all
    const withFont = draw(family + ', serif', ch);
    const present = hasInk(withFont) && !sameAlpha(withFont, draw('serif', ch)) && !sameAlpha(withFont, glyphCache.get(missingKey));
    glyphCache.set(key, present);
    return present;
  }

  const BLANK = /^[\p{Cc}\p{Zs}\p{Cf}]$/u;

  // What a cell must hold to show the given characters in a font drawn at em pixels.
  // Returns whole pixels {ascent, descent, width} above and below the baseline and the widest advance, plus how many
  // of the characters have a shape (total) and how many of those the font lacks (missing).
  function extents(family, em, codePoints, makeCanvas) {
    const ctx = makeCanvas(16, 16).getContext('2d');
    ctx.font = 'normal ' + em + 'px ' + family;
    let ascent = 0, descent = 0, total = 0, missing = 0;
    const advances = [];
    for (const cp of codePoints) {
      const ch = String.fromCodePoint(cp);
      if (BLANK.test(ch)) continue;
      total++;
      if (!hasGlyph(family, ch, makeCanvas)) { missing++; continue; }
      const m = ctx.measureText(ch);
      if (typeof m.actualBoundingBoxAscent === 'number') {
        ascent = Math.max(ascent, m.actualBoundingBoxAscent);
        descent = Math.max(descent, m.actualBoundingBoxDescent);
      }
      advances.push(m.width);
    }
    // a character far wider than the others (a symbol) must not set the width of the cell
    const sorted = advances.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[sorted.length >> 1] : 0;
    const width = advances.length ? Math.max(...advances.filter(a => a <= 2.5 * median)) : 0;
    const whole = v => Math.round(v - 1e-6);  // pixel edges: a value of 6.0001 is 6, not 7
    return { ascent: whole(ascent), descent: Math.max(0, whole(descent)), width: Math.ceil(width - 1e-6), total, missing };
  }

  // How many pixels the plain letters hang below the font's own baseline (0 for most fonts). Bytesized draws every
  // letter one row below its baseline, so a template raises the characters by that much to stand them on the baseline.
  function baseLift(family, em, makeCanvas) {
    const ctx = makeCanvas(16, 16).getContext('2d');
    ctx.font = 'normal ' + em + 'px ' + family;
    const hangs = [];
    for (const ch of 'HEILTxz') {
      if (!hasGlyph(family, ch, makeCanvas)) continue;
      const m = ctx.measureText(ch);
      if (typeof m.actualBoundingBoxDescent === 'number') hangs.push(Math.max(0, Math.round(m.actualBoundingBoxDescent - 1e-6)));
    }
    hangs.sort((a, b) => a - b);
    return hangs.length ? hangs[hangs.length >> 1] : 0;
  }

  // The cell that holds characters whose ink spans `ascent` rows above and `descent` rows below the font's baseline,
  // once the characters are raised by `lift` rows so that the letters stand on the baseline of the template.
  // There is always at least one row below the baseline, room for a descender.
  // Returns {height, baseline, lift}.
  function cellFor(ascent, descent, lift) {
    const above = ascent + lift;
    const baseline = Math.max(1, descent - lift);
    return { height: above + baseline, baseline, lift };
  }

  // Whether the font is a pixel font, and the size at which one font pixel is one pixel.
  // Returns {pixelFont, em, score}.
  function analyze(family, makeCanvas) {
    const fit = fitGrid(measureRuns(family, makeCanvas), PROBE_SIZE);
    if (!fit) return { pixelFont: false };
    return { pixelFont: true, em: Math.round(fit.em * 1000) / 1000, score: fit.score };
  }

  return { PROBE, PROBE_SIZE, collectRuns, fitGrid, measureRuns, analyze, extents, hasGlyph, baseLift, cellFor };
});
