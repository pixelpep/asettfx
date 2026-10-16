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
