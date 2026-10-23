const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const model = require('../../web/src/editor/model.js');
const tools = require('../../web/src/editor/tools.js');
const exporter = require('../../web/src/editor/export.js');
const png = require('../../web/src/png.js');
const md = require('../../web/src/metadata.js');
const gen = require('../../web/src/generate.js');
const charsets = require('../../web/src/charsets.js');

const plainMeta = () => ({ v: 1, cell: { w: 4, h: 4 }, grid: { cols: 3, rows: 2 }, mode: 'var', widthSource: 'magenta', map: ['0041-0043', '_', '0045-0046'] });
const at = (img, x, y) => Array.from(img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

test('a plain drawing is black on white with the marker in magenta, and nothing else', () => {
  const m = model.create(plainMeta(), [4, 3, 4, 4, 4, 4]);
  tools.beginStroke(m, { tool: 'brush', size: 1, color: 1 }).add(1, 1);        // cell A
  m.setWidth(0x42, 2);                                                         // cell B: columns 2 and 3 are marker
  const img = exporter.renderDrawing(m);
  assert.equal(img.palette, null);
  assert.deepEqual(at(img, 1, 1), [0, 0, 0, 255]);
  assert.deepEqual(at(img, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(at(img, 4 + 2, 0), [255, 0, 255, 255]);
  assert.deepEqual(at(img, 4 + 1, 3), [255, 255, 255, 255]);
  assert.deepEqual(at(img, 4 * 1, 5), [255, 255, 255, 255]);                  // the unused cell (row 1, column 1) is white
  const colors = new Set();
  for (let o = 0; o < img.rgba.length; o += 4) colors.add(img.rgba.subarray(o, o + 3).join(','));
  assert.deepEqual([...colors].sort(), ['0,0,0', '255,0,255', '255,255,255']);
});

test('the marker covers the ink under it, as in the editor', () => {
  const m = model.create(plainMeta());
  m.glyphs.get(0x41).pixels[3] = 1;                                            // column 3, row 0
  m.setWidth(0x41, 3);
  assert.deepEqual(at(exporter.renderDrawing(m), 3, 0), [255, 0, 255, 255]);
});

test('a monospace drawing has no marker even if the glyphs have a width', () => {
  const m = model.create(Object.assign(plainMeta(), { mode: 'mono' }));
  m.setWidth(0x41, 1);
  const img = exporter.renderDrawing(m);
  for (let o = 0; o < img.rgba.length; o += 4) assert.notDeepEqual(Array.from(img.rgba.subarray(o, o + 3)), [255, 0, 255]);
});

test('a GB Studio drawing has the palest color as background, the four shades, and an indexed palette', async () => {
  const meta = { v: 1, cell: { w: 8, h: 8 }, grid: { cols: 16, rows: 6 }, mode: 'var', widthSource: 'magenta', map: ['0020-007E'], target: 'gbstudio' };
  const m = model.create(meta, new Array(96).fill(8));
  for (let k = 1; k <= 4; k++) tools.beginStroke(m, { tool: 'brush', size: 1, color: k }).add(8 + k - 1, 0);   // cell "!", columns 0 to 3
  m.setWidth(0x21, 6);
  const img = exporter.renderDrawing(m);
  assert.deepEqual(at(img, 0, 0), [0xE0, 0xF8, 0xCF, 255]);                    // the space cell: background
  assert.deepEqual(at(img, 8, 0), [0x07, 0x18, 0x21, 255]);
  assert.deepEqual(at(img, 9, 0), [0x30, 0x68, 0x50, 255]);
  assert.deepEqual(at(img, 10, 0), [0x86, 0xC0, 0x6C, 255]);
  assert.deepEqual(at(img, 11, 0), [0xE0, 0xF8, 0xCF, 255]);                   // the palest shade is the background color
  assert.deepEqual(at(img, 8 + 6, 0), [255, 0, 255, 255]);
  assert.deepEqual(img.palette, exporter.GB_PALETTE);
  assert.deepEqual(img.palette[0], [0xE0, 0xF8, 0xCF]);
  assert.deepEqual(img.palette[1], [0x07, 0x18, 0x21]);

  // written as an indexed PNG: the palest color is index 0, the darkest index 1, and GB Studio reads it as expected
  const bytes = await png.encode(img.width, img.height, img.rgba, { palette: img.palette, text: [{ keyword: md.KEYWORD, text: md.serialize(meta) }] });
  const chunks = png.readChunks(bytes);
  assert.equal(chunks.find(c => c.type === 'IHDR').data[9], 3);
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => Buffer.from(c.data))));
  const stride = img.width + 1;
  const index = (x, y) => raw[y * stride + 1 + x];
  assert.deepEqual([index(0, 0), index(8, 0), index(14, 0), index(9, 0), index(10, 0)], [0, 1, 2, 3, 4]);
  const gbShade = ([r, g, b]) => (g > 249 || (r > 249 && b > 249)) ? 'transparent' : g < 65 ? 'dark' : g < 130 ? 'mid' : g < 205 ? 'light' : 'white';
  assert.deepEqual([0, 1, 2, 3, 4].map(i => gbShade(img.palette[i])), ['white', 'dark', 'transparent', 'mid', 'light']);
  assert.equal(png.readText(bytes, md.KEYWORD).status, 'ok');
});

test('the metadata of a drawing are valid and the Aseprite extension can read them back', () => {
  const layers = gen.layers({ name: 'T', cellW: 4, cellH: 5, cols: 16, mode: 'var', widthSource: 'magenta', map: ['0020-007E'], baseline: 1,
    guide: { checker: true, baseline: true, hint: 'none' } }, null);
  assert.equal(layers.ok, true);
  const m = model.create(layers.meta, layers.advances);
  const img = exporter.renderDrawing(m);
  assert.equal(img.width, 64);
  assert.deepEqual(md.validate(layers.meta, { width: img.width, height: img.height }), []);
});

test('the file name of a drawing is the one of the template without "template"', () => {
  assert.equal(gen.drawingFileName('My Pixel Font', 8, 8), 'my-pixel-font-8x8.png');
  assert.equal(gen.drawingFileName('', 4, 5), 'font-4x5.png');
});
