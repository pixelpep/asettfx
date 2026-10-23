const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const png = require('../../web/src/png.js');
const md = require('../../web/src/metadata.js');
const gen = require('../../web/src/generate.js');
const charsets = require('../../web/src/charsets.js');

const settings = (extra) => Object.assign({
  name: 'Test Font', cellW: 8, cellH: 8, cols: 16, mode: 'var', widthSource: 'magenta',
  map: ['0020-00FF'], baseline: 1, spacing: 0,
  guide: { checker: true, baseline: true, hint: 'ghost', hintFont: 'monospace' }
}, extra);

test('PNG round trip: metadata is embedded, valid and matches the image', async () => {
  const r = await gen.generate(settings(), (cp, w, h) => new Uint8Array(w * h));
  assert.equal(r.ok, true);
  assert.equal(r.width, 128);
  assert.equal(r.height, 112);

  const found = png.readText(r.png, md.KEYWORD);
  assert.equal(found.status, 'ok');
  const meta = JSON.parse(found.text);
  assert.deepEqual(meta, r.meta);
  assert.deepEqual(md.validate(meta, png.readSize(r.png)), []);
  assert.equal(meta.mode, 'var');
  assert.equal(meta.widthSource, 'magenta');

  const idat = Buffer.concat(png.readChunks(r.png).filter(c => c.type === 'IDAT').map(c => Buffer.from(c.data)));
  const raw = zlib.inflateSync(idat);
  assert.equal(raw.length, 112 * (1 + 128 * 4));
  assert.equal(raw[0], 0);
  assert.deepEqual(Array.from(raw.subarray(1, 5)), Array.from(r.rgba.subarray(0, 4)));
});

test('rows follow from the map and the column count', () => {
  assert.equal(gen.rowsFor(['0020-007E'], 16), 6);
  assert.equal(gen.rowsFor(['0020-007E'], 10), 10);
  assert.equal(gen.rowsFor(['0041'], 16), 1);
});

test('every charset preset generates a valid template', async () => {
  for (const p of charsets.presets) {
    const r = await gen.generate(settings({ map: p.map, cols: p.cols, mode: 'mono' }));
    assert.equal(r.ok, true, p.id);
    assert.deepEqual(md.validate(r.meta, { width: r.width, height: r.height }), [], p.id);
  }
});

test('invalid settings are reported, not thrown', async () => {
  const dup = await gen.generate(settings({ map: ['0041', '0041'] }));
  assert.equal(dup.ok, false);
  const baseline = await gen.generate(settings({ baseline: 8 }));
  assert.equal(baseline.ok, false);
  const big = await gen.generate(settings({ cellW: 64, cellH: 64, cols: 100, map: ['0020-00FF'] }));
  assert.equal(big.ok, false);
  assert.match(big.errors[0], /limit/);
});

test('a large custom map triggers the metadata size warning', async () => {
  const map = [];
  for (let i = 0; i < 300; i++) map.push((0x4E00 + i * 2).toString(16).toUpperCase());
  const r = await gen.generate(settings({ map, cols: 16 }));
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});

test('prefill is applied only for variable mode with magenta widths and a ghost hint', async () => {
  const mask = (cp, w, h) => { const m = new Uint8Array(w * h); m[0] = 1; return m; };
  const hasPink = r => { for (let i = 0; i < r.rgba.length; i += 4) if (r.rgba[i] === 255 && r.rgba[i + 1] === 0 && r.rgba[i + 2] === 255) return true; return false; };
  const guide = (extra) => Object.assign({ checker: true, baseline: true, hint: 'ghost', prefill: true }, extra);

  const on = await gen.generate(settings({ guide: guide() }), mask);
  assert.equal(hasPink(on), true);
  assert.equal(on.meta.guide.prefill, true);

  for (const extra of [{ mode: 'mono' }, { widthSource: 'auto' }, { guide: guide({ hint: 'none' }) }]) {
    const r = await gen.generate(settings(extra), mask);
    assert.equal(hasPink(r), false, JSON.stringify(extra));
    assert.equal('prefill' in (r.meta.guide || {}), false, JSON.stringify(extra));
  }
});

test('fileName: the font name in lowercase with hyphens, then the cell size and template', () => {
  assert.equal(gen.fileName('My Pixel Font', 8, 8), 'my-pixel-font-8x8-template.png');
  assert.equal(gen.fileName('  Caf\u00e9 -- Mono!! ', 16, 24), 'cafe-mono-16x24-template.png');
  assert.equal(gen.fileName('\u00c9criture \u4e2d', 8, 8), 'ecriture-8x8-template.png');
  assert.equal(gen.fileName('', 8, 8), 'font-8x8-template.png');
  assert.equal(gen.fileName('***', 8, 8), 'font-8x8-template.png');
  assert.equal(gen.fileName(undefined, 8, 8), 'font-8x8-template.png');
});

test('a GB Studio template records its target and is refused when the grid does not fit GB Studio', async () => {
  const ok = await gen.generate(settings({ target: 'gbstudio', cellW: 8, cellH: 8, cols: 16, map: charsets.presets.find(p => p.id === 'gbstudio').map }), () => null);
  assert.equal(ok.ok, true);
  assert.equal(ok.meta.target, 'gbstudio');
  assert.equal(JSON.parse(png.readText(ok.png, md.KEYWORD).text).target, 'gbstudio');
  assert.equal(ok.height, 14 * 8);

  const bad = await gen.generate(settings({ target: 'gbstudio', cellW: 8, cellH: 16, cols: 16, map: ['0020-007E'] }), () => null);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(), /target gbstudio needs/);

  const none = await gen.generate(settings({ map: ['0020-007E'] }), () => null);
  assert.equal('target' in none.meta, false);
});

test('the GB Studio mapping lists the characters that are not in the cell of their own code', () => {
  const mapping = gen.gbMapping(charsets.presets.find(p => p.id === 'gbstudio').map);
  // Windows-1252 block 0x80-0x9F: 27 characters are defined; the euro sign sits in cell 128
  assert.equal(Object.keys(mapping).length, 27);
  assert.equal(mapping['€'], 128);
  assert.equal(mapping['’'], 146);
  assert.equal(mapping['œ'], 156);
  assert.equal(mapping['Ÿ'], 159);
  // plain ASCII and the Latin-1 letters are in their own cell: no entry
  assert.equal(mapping['A'], undefined);
  assert.equal(mapping['é'], undefined);
  // every code is a cell of the 0x80-0x9F block, checked against the Windows-1252 table
  const cp1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
  for (const [ch, code] of Object.entries(mapping)) assert.equal(cp1252[code - 128], ch);
  // a layout in reading order from the space needs nothing
  assert.deepEqual(gen.gbMapping(['0020-007E']), {});
});

// A port of resolveMapping and encodeString of GB Studio (src/shared/lib/helpers/fonts.ts, MIT License), without the escapes of
// the typed text, to check what the mapping file does: the code that GB Studio writes for a character, then the cell it shows.
function gbEncode(text, mapping) {
  const codes = [];
  for (let i = 0; i < text.length;) {
    let key = '';
    for (const k of Object.keys(mapping || {})) if (text.startsWith(k, i) && k.length > key.length) key = k;
    if (key) { codes.push(mapping[key]); i += key.length; continue; }
    const code = text.codePointAt(i);
    codes.push(code & 0xff);
    i += code > 0xffff ? 2 : 1;
  }
  return codes;
}

test('with the mapping file GB Studio shows the cell of the euro sign, the curly quote and oe; without it, other cells', () => {
  const layout = charsets.presets.find(p => p.id === 'gbstudio').map;
  const cells = require('../../web/src/charmap.js').expandMap(layout).cells;
  const cellOf = code => cells[code - 32];
  const mapping = gen.gbMapping(layout);
  for (const ch of ['€', '’', 'œ', '“', '…', 'Ÿ']) {
    assert.equal(cellOf(gbEncode(ch, mapping)[0]), ch.codePointAt(0), ch + ' lands on its own cell with the mapping');
    assert.notEqual(cellOf(gbEncode(ch, {})[0]), ch.codePointAt(0), ch + ' lands elsewhere without it');
  }
  // letters of Latin-1 and ASCII do not need the mapping
  for (const ch of 'Cur éàç«') assert.equal(cellOf(gbEncode(ch, {})[0]), ch.codePointAt(0));
});

test('generate.layers also gives the background without its guides: no checkerboard, no ticks, the unused cells still shaded', () => {
  const tpl = require('../../web/src/template.js');
  const r = gen.layers({
    name: 'T', cellW: 8, cellH: 8, cols: 4, mode: 'mono', map: ['0041-0043', '_'], baseline: 1,
    guide: { checker: true, baseline: true, hint: 'ghost' }
  }, (cp, w, h) => { const m = new Uint8Array(w * h); m[0] = 1; return m; });
  assert.equal(r.ok, true);
  const at = (buf, x, y) => Array.from(buf.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 3));
  const C = tpl.COLORS;
  assert.deepEqual(at(r.background, 8, 0), C.checkerB);       // the second cell is the dark square of the checkerboard
  assert.deepEqual(at(r.plainBackground, 8, 0), C.checkerA);  // plain: every cell the same
  assert.deepEqual(at(r.background, 0, 6), C.baseline);       // a baseline tick (baseline 1: row 8 - 1 - 1)
  assert.deepEqual(at(r.plainBackground, 0, 6), C.checkerA);
  assert.deepEqual(at(r.background, 24, 0), C.unassigned);    // the fourth cell is unused in both
  assert.deepEqual(at(r.plainBackground, 24, 0), C.unassigned);
  assert.equal(r.plainBackground.length, r.background.length);
});
