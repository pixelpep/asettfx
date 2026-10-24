const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ttf = require('../../web/src/ttf.js');
const model = require('../../web/src/editor/model.js');

const dir = path.join(__dirname, '..', 'fixtures', 'ttf');
const cases = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8')).cases;

// The fonts of tests/fixtures/ttf were written by the Lua writer (sh tools/make-ttf-golden.sh): the JavaScript one gives the
// same bytes.
for (const c of cases) {
  test('the JavaScript writer gives the same bytes as the Lua writer: ' + c.name, () => {
    const { font, info } = ttf.build({ glyphs: c.glyphs.map(g => Object.assign({ inside: true }, g)) }, c.settings, c.options);
    const golden = fs.readFileSync(path.join(dir, c.name + '.ttf'));
    assert.equal(font.length, golden.length);
    assert.equal(info.bytes, golden.length);
    let at = -1;
    for (let i = 0; i < font.length; i++) if (font[i] !== golden[i]) { at = i; break; }
    assert.equal(at, -1, 'first difference at byte ' + at);
  });
}

test('the outline of a ring has a hole turning the other way, and pixels that touch at a corner stay apart', () => {
  const ring = ttf.trace(['###', '#.#', '###']);
  assert.equal(ring.length, 2);
  const area = c => c.reduce((s, p, i) => { const q = c[(i + 1) % c.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  assert.deepEqual(ring.map(area).sort((a, b) => a - b), [-1, 9]);   // the outer one clockwise (positive, y down), the hole the other way
  assert.equal(ttf.trace(['#.', '.#']).length, 2);
  assert.equal(ttf.trace(['....']).length, 0);
});

test('a drawing of the editor becomes a font: ink, widths, spacing, empty characters and hidden ink', () => {
  const meta = { v: 1, cell: { w: 4, h: 4 }, grid: { cols: 3, rows: 1 }, mode: 'var', map: ['0041-0043'], name: 'Test', metrics: { baseline: 1, spacing: 1 } };
  const m = model.create(meta, [4, 4, 4]);
  m.setPixel(0x41, 0, 1); m.setPixel(0x41, 5, 1);          // A: two pixels
  m.setWidth(0x41, 2);
  m.setPixel(0x42, 3, 1);                                   // B: a pixel at x = 3, under the marker once its width is 2
  m.setWidth(0x42, 2);
  const r = ttf.fromModel(m);
  const a = r.analysis.glyphs.find(g => g.cp === 0x41);
  assert.deepEqual(a.ink_rows, ['#.', '.#', '..', '..']);   // cropped to the width
  assert.equal(a.advance, 3);                               // the width and the spacing
  assert.deepEqual(r.warnings.empty, [0x42, 0x43]);         // C has nothing drawn, B only under its marker
  assert.deepEqual(r.warnings.beyond, [0x42]);              // the pixel of B is under the marker
  const { font, info } = ttf.build(r.analysis, r.settings, { family: 'Test', timestamp: 1760000000 });
  assert.equal(info.glyphs, 2);                             // .notdef and A: B and C have no visible ink
  assert.equal(font[0], 0); assert.equal(font[1], 1);       // sfnt version 1.0
});

test('in GB Studio the two darkest shades are ink and the two light ones are background', () => {
  const meta = { v: 1, target: 'gbstudio', cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 1 }, mode: 'mono', map: ['0041-0044'], metrics: { baseline: 1 } };
  const m = model.create(meta);
  m.setPixel(0x41, 0, 1); m.setPixel(0x41, 1, 2); m.setPixel(0x41, 2, 3); m.setPixel(0x41, 3, 4);
  const a = ttf.fromModel(m).analysis.glyphs.find(g => g.cp === 0x41);
  assert.equal(a.ink_rows[0], '##......');
  assert.equal(a.advance, 8);
});

test('the file of the font is named after the font', () => {
  const generate = require('../../web/src/generate.js');
  assert.equal(generate.fontFileName('My Pixel Font!'), 'my-pixel-font.ttf');
  assert.equal(generate.fontFileName('Café'), 'cafe.ttf');
  assert.equal(generate.fontFileName(''), 'font.ttf');
});
