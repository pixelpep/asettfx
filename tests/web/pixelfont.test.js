const test = require('node:test');
const assert = require('node:assert/strict');
const pf = require('../../web/src/pixelfont.js');

// A synthetic "font drawing": bars of given widths in pixel units, rendered at `size` pixels per em, with edge noise.
function drawing(emPixels, size, widthsInUnits, noise) {
  const unit = size / emPixels;
  const runs = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const k of widthsInUnits) runs.push(Math.round(k * unit + (rnd() * 2 - 1) * noise));
  return runs;
}
const WIDTHS = [];
for (let i = 0; i < 60; i++) WIDTHS.push(1 + (i * 7) % 3, 1 + (i * 5) % 2, 1 + (i % 5 === 0 ? 3 : 0));

test('collectRuns: ink runs and gaps between them, rows and columns, ignoring the outside', () => {
  const m = Uint8Array.from([
    0, 0, 0, 0, 0, 0,
    0, 1, 1, 0, 0, 1,
    0, 0, 0, 0, 0, 0,
  ]);
  const runs = pf.collectRuns(m, 6, 3);
  // row 1: ink 2, gap 2, ink 1; columns 1, 2 and 5: ink 1 each
  assert.deepEqual(runs.sort(), [1, 1, 1, 1, 2, 2].sort());
  assert.deepEqual(pf.collectRuns(new Uint8Array(12), 4, 3), []);
});

test('fitGrid finds the em of an exact pixel grid, whole and fractional', () => {
  for (const em of [5, 6, 8, 16, 17, 20, 7.8125, 21.3333]) {
    const fit = pf.fitGrid(drawing(em, 512, WIDTHS, 0.8), 512);
    assert.ok(fit, 'em ' + em);
    assert.ok(Math.abs(fit.em - em) < 0.05, em + ' found as ' + fit.em);
  }
});

test('fitGrid takes the coarsest grid, not a finer one that also fits', () => {
  const fit = pf.fitGrid(drawing(8, 512, WIDTHS, 0.8), 512);
  assert.ok(Math.abs(fit.em - 8) < 0.02, 'not 16 or 32: ' + fit.em);
});

test('fitGrid ignores characters the font lacks (drawn by another font) and keeps the pixel grid', () => {
  const smooth = () => { const r = []; for (let i = 0; i < 300; i++) r.push(3 + ((i * 37) % 211)); return r; };
  const groups = [];
  for (let i = 0; i < 8; i++) groups.push(drawing(8, 512, WIDTHS, 1.2));
  for (let i = 0; i < 3; i++) groups.push(smooth());  // 3 of 11 characters come from a fallback font
  const fit = pf.fitGrid(groups, 512);
  assert.ok(fit && Math.abs(fit.em - 8) < 0.05, 'em ' + (fit && fit.em));
  assert.equal(fit.fitted, 8);
});

test('fitGrid snaps measurement noise to a whole em, but keeps a real fraction', () => {
  assert.equal(pf.fitGrid(drawing(16, 512, WIDTHS, 1.2), 512).em, 16);
  const fraction = pf.fitGrid(drawing(7.8125, 512, WIDTHS, 0.8), 512).em;
  assert.ok(Math.abs(fraction - 7.8125) < 0.03 && fraction !== 8, String(fraction));
});

test('fitGrid says no when most characters are smooth', () => {
  const smooth = () => { const r = []; for (let i = 0; i < 300; i++) r.push(3 + ((i * 37) % 211)); return r; };
  const groups = [drawing(8, 512, WIDTHS, 1), smooth(), smooth(), smooth(), smooth(), smooth(), smooth()];
  assert.equal(pf.fitGrid(groups, 512), null);
});

test('fitGrid says no for a smooth font (runs of any length)', () => {
  const runs = [];
  for (let i = 0; i < 400; i++) runs.push(3 + ((i * 37) % 211));
  assert.equal(pf.fitGrid(runs, 512), null);
});

test('fitGrid says no when there is too little to judge', () => {
  assert.equal(pf.fitGrid([64, 64, 128], 512), null);
});

test('cellFor stands the letters on the baseline and keeps one row below it', () => {
  // Bytesized: ink from 1 below to 3 above the font's own baseline, letters hang 1 row below it
  assert.deepEqual(pf.cellFor(3, 1, 1), { height: 5, baseline: 1, lift: 1 });
  // a font whose letters stand on the baseline and which has descenders
  assert.deepEqual(pf.cellFor(7, 1, 0), { height: 8, baseline: 1, lift: 0 });
  assert.deepEqual(pf.cellFor(12, 3, 0), { height: 15, baseline: 3, lift: 0 });
  // no descender at all: one row is still kept below the baseline
  assert.deepEqual(pf.cellFor(8, 0, 0), { height: 9, baseline: 1, lift: 0 });
  // accents above and cedillas below, with the letters raised by 1: 5 above, 3 below the font baseline
  assert.deepEqual(pf.cellFor(5, 3, 1), { height: 8, baseline: 2, lift: 1 });
});
