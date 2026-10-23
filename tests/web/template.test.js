const test = require('node:test');
const assert = require('node:assert/strict');
const tpl = require('../../web/src/template.js');

const cfg = (extra) => Object.assign({
  cellW: 8, cellH: 8, cols: 4, rows: 2, map: ['0041', '0020', '0042-0043'], baseline: 1,
  guide: { checker: true, baseline: true, hint: 'ghost' }
}, extra);

const px = (img, x, y) => Array.from(img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const C = tpl.COLORS;
const rgb = c => [...c, 255];

const fullMask = (cp, w, h) => new Uint8Array(w * h).fill(1);
const emptyMask = () => null;

test('image size is cols*cellW by rows*cellH', () => {
  const img = tpl.render(cfg(), emptyMask);
  assert.equal(img.width, 32);
  assert.equal(img.height, 16);
  assert.equal(img.rgba.length, 32 * 16 * 4);
});

test('checkerboard alternates between cells and unassigned cells are flat', () => {
  const img = tpl.render(cfg(), emptyMask);
  assert.deepEqual(px(img, 3, 3), rgb(C.checkerA));   // cell 0
  assert.deepEqual(px(img, 11, 3), rgb(C.checkerB));  // cell 1 (space, no ghost besides marker)
  assert.deepEqual(px(img, 27, 3), rgb(C.checkerB));  // cell 3 (the last mapped cell)
  assert.deepEqual(px(img, 3, 11), rgb(C.unassigned)); // cell 4 is past the map
});

test('checker can be turned off', () => {
  const img = tpl.render(cfg({ guide: { checker: false, baseline: false, hint: 'none' } }), emptyMask);
  assert.deepEqual(px(img, 11, 3), rgb(C.checkerA));
});

test('ghost mask is drawn in the ghost color, only in its cell', () => {
  const mask = (cp, w, h) => { const m = new Uint8Array(w * h); m[2 * w + 3] = 1; return m; };
  const img = tpl.render(cfg(), mask);
  assert.deepEqual(px(img, 3, 2), rgb(C.ghost));
  assert.deepEqual(px(img, 3 + 16, 2), rgb(C.ghost));
  assert.deepEqual(px(img, 4, 2), rgb(C.checkerA));
});

test('blank characters get a dotted marker instead of a ghost', () => {
  const img = tpl.render(cfg(), fullMask);
  assert.deepEqual(px(img, 8 + 1, 6), rgb(C.ghost));
  assert.deepEqual(px(img, 8 + 2, 6), rgb(C.checkerB));
  assert.deepEqual(px(img, 8 + 3, 2), rgb(C.checkerB)); // no ghost inside the space cell
  assert.ok(tpl.isBlankCodepoint(0x20) && tpl.isBlankCodepoint(0xA0) && tpl.isBlankCodepoint(0x85) && tpl.isBlankCodepoint(0xAD));
  assert.ok(!tpl.isBlankCodepoint(0x41));
});

test('baseline ticks mark the last row above the baseline at both cell edges', () => {
  const img = tpl.render(cfg({ baseline: 2 }), emptyMask);
  assert.deepEqual(px(img, 0, 5), rgb(C.baseline));
  assert.deepEqual(px(img, 7, 5), rgb(C.baseline));
  assert.deepEqual(px(img, 1, 5), rgb(C.checkerA));
});

test('no pixel is marker magenta, and every pixel is opaque', () => {
  const img = tpl.render(cfg(), fullMask);
  for (let i = 0; i < img.rgba.length; i += 4) {
    assert.ok(!(img.rgba[i] === 255 && img.rgba[i + 1] === 0 && img.rgba[i + 2] === 255));
    assert.equal(img.rgba[i + 3], 255);
  }
  for (const c of Object.values(C)) assert.ok(!(c[0] === 255 && c[1] === 0 && c[2] === 255));
});

// Prefilled widths (variable mode)
const isPink = (img, x, y) => { const p = px(img, x, y); return p[0] === 255 && p[1] === 0 && p[2] === 255; };
const prefillCfg = (extra) => cfg(Object.assign({ prefillWidths: true, cols: 4, rows: 1, map: ['0041', '0020', '0049', '0057'] }, extra));
// 'A' ink ends at column 4, 'I' at column 2, 'W' fills the cell, blank uses the font space width.
const lastInk = { 0x41: 4, 0x49: 2, 0x57: 7 };
const widthMask = (cp, w, h) => { const m = new Uint8Array(w * h); m[3 * w + lastInk[cp]] = 1; return m; };
widthMask.blankAdvance = () => 3;

test('widthFromMask is the last ink column plus one pixel of space', () => {
  assert.equal(tpl.widthFromMask(widthMask(0x41, 8, 8), 8, 8), 6);
  assert.equal(tpl.widthFromMask(widthMask(0x49, 8, 8), 8, 8), 4);
  assert.equal(tpl.widthFromMask(widthMask(0x57, 8, 8), 8, 8), 8);
  assert.equal(tpl.widthFromMask(new Uint8Array(64), 8, 8), 8);
});

test('prefill paints full-height magenta columns right of the ghost width', () => {
  const img = tpl.render(prefillCfg(), widthMask);
  for (let y = 0; y < 8; y++) {
    assert.ok(!isPink(img, 5, y) && isPink(img, 6, y) && isPink(img, 7, y), 'A: width 6');
    assert.ok(!isPink(img, 8 + 2, y) && isPink(img, 8 + 3, y) && isPink(img, 8 + 7, y), 'space: width 3');
    assert.ok(!isPink(img, 16 + 3, y) && isPink(img, 16 + 4, y), 'I: width 4');
    for (let x = 0; x < 8; x++) assert.ok(!isPink(img, 24 + x, y), 'W: no marker');
  }
});

test('ghost pixels never overlap the magenta', () => {
  const img = tpl.render(prefillCfg(), widthMask);
  assert.deepEqual(px(img, 4, 3), rgb(C.ghost));
  assert.ok(!isPink(img, 4, 3));
});

test('no magenta without prefill, without hint, or in unassigned cells', () => {
  const none = tpl.render(prefillCfg({ prefillWidths: false }), widthMask);
  const noHint = tpl.render(prefillCfg({ guide: { hint: 'none' } }), widthMask);
  const sparse = tpl.render(prefillCfg({ cols: 6, map: ['0041'] }), widthMask);
  for (const img of [none, noHint]) {
    for (let i = 0; i < img.rgba.length; i += 4) assert.ok(!(img.rgba[i] === 255 && img.rgba[i + 1] === 0 && img.rgba[i + 2] === 255));
  }
  for (let x = 8; x < sparse.width; x++) for (let y = 0; y < 8; y++) assert.ok(!isPink(sparse, x, y));
});

test('every guide color is far above the ink threshold (luminance 128)', () => {
  for (const [name, c] of Object.entries(C)) {
    const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    assert.ok(lum > 160, name + ' luminance ' + lum.toFixed(1));
  }
});

test('a ghost pixel on a baseline tick stays visible (the tick is drawn under the ghost)', () => {
  const onTick = (cp, w, h) => { const m = new Uint8Array(w * h); m[5 * w + 0] = 1; m[5 * w + 7] = 1; return m; };  // row 5 is cell.h - baseline - 1 for baseline 2
  const img = tpl.render(cfg({ baseline: 2 }), onTick);
  assert.deepEqual(px(img, 0, 5), rgb(C.ghost));
  assert.deepEqual(px(img, 7, 5), rgb(C.ghost));
  assert.deepEqual(px(img, 1, 5), rgb(C.checkerA));
  const none = tpl.render(cfg({ baseline: 2 }), () => null);
  assert.deepEqual(px(none, 0, 5), rgb(C.baseline), 'the tick shows where there is no ink');
});

// How GB Studio classes a pixel (src/lib/fonts/fontData.ts): by the green channel, magenta and near-white are transparent.
const gbShade = ([r, g, b]) => (g > 249 || (r > 249 && b > 249)) ? 'transparent' : g < 65 ? 'dark' : g < 130 ? 'mid' : g < 205 ? 'light' : 'white';

test('a GB Studio template is solid GB Studio background: no checkerboard, and every guide pixel reads as white to GB Studio', () => {
  const gb = cfg({ target: 'gbstudio', cols: 16, rows: 14, map: ['0020-007E'], prefillWidths: false });
  const withGhost = (cp, w, h) => { const m = new Uint8Array(w * h); m[3 * w + 2] = 1; m[4 * w + 2] = 1; return m; };
  const img = tpl.render(gb, withGhost);
  const shades = new Set();
  for (let i = 0; i < img.rgba.length; i += 4) shades.add(gbShade([img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]]));
  assert.deepEqual([...shades], ['white']);
  // the first cell is plain background, the next one is too (the checkerboard of the normal template would alternate)
  assert.deepEqual(px(img, 0, 0), [...tpl.GB_COLORS.background, 255]);
  assert.deepEqual(px(img, 8, 0), [...tpl.GB_COLORS.background, 255]);
});

test('the guide colors of a GB Studio template stay light for the Aseprite reader too (not ink, not magenta)', () => {
  for (const key of ['background', 'unassigned', 'ghost', 'baseline']) {
    const [r, g, b] = tpl.GB_COLORS[key];
    assert.ok(r * 299 + g * 587 + b * 114 >= 128000, key + ' is not ink');
    assert.notDeepEqual([r, g, b], tpl.MARKER);
  }
});

test('the magenta width columns of a GB Studio template are transparent to GB Studio', () => {
  const img = tpl.render(cfg({ target: 'gbstudio', cols: 16, rows: 14, map: ['0020-007E'], prefillWidths: true }), (cp, w, h) => { const m = new Uint8Array(w * h); m[3 * w] = 1; return m; });
  const magenta = px(img, 8 + 7, 0);  // cell 1 is '!': the first cell is a space, which has no width of its own here
  assert.deepEqual(magenta, [255, 0, 255, 255]);
  assert.equal(gbShade(magenta.slice(0, 3)), 'transparent');
});
