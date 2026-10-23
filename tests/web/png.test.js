const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const png = require('../../web/src/png.js');

const ascii = s => Uint8Array.from(Buffer.from(s, 'latin1'));

function pixelsOf(bytes) {
  const { width, height } = png.readSize(bytes);
  const idat = Buffer.concat(png.readChunks(bytes).filter(c => c.type === 'IDAT').map(c => Buffer.from(c.data)));
  const raw = zlib.inflateSync(idat);
  const stride = width * 4;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (stride + 1)], 0, 'filter byte');
    out.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return out;
}

test('crc32 and adler32 known values', () => {
  assert.equal(png.crc32(ascii('123456789')), 0xCBF43926);
  assert.equal(png.adler32(ascii('Wikipedia')), 0x11E60398);
});

for (const stored of [false, true]) {
  test('encode round trip, stored=' + stored, async () => {
    const w = 5, h = 3;
    const rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 37) & 255);
    const bytes = await png.encode(w, h, rgba, { stored });
    assert.deepEqual(png.readSize(bytes), { width: w, height: h });
    assert.ok(png.readChunks(bytes).every(c => c.crcOk));
    assert.deepEqual(pixelsOf(bytes), rgba);
  });
}

test('stored fallback handles data over 65535 bytes', async () => {
  const w = 200, h = 200;
  const rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 7) & 255);
  const bytes = await png.encode(w, h, rgba, { stored: true });
  assert.deepEqual(pixelsOf(bytes), rgba);
});

test('tEXt chunk sits between IHDR and IDAT and reads back', async () => {
  const bytes = await png.encode(2, 2, new Uint8Array(16), { text: [{ keyword: 'digiface', text: '{"v":1}' }] });
  assert.deepEqual(png.readChunks(bytes).map(c => c.type), ['IHDR', 'tEXt', 'IDAT', 'IEND']);
  assert.deepEqual(png.readText(bytes, 'digiface'), { status: 'ok', text: '{"v":1}' });
  assert.equal(png.readText(bytes, 'other').status, 'absent');
});

test('corrupted tEXt is reported as crc-error', async () => {
  const bytes = await png.encode(2, 2, new Uint8Array(16), { text: [{ keyword: 'digiface', text: '{"v":1}' }] });
  const tampered = Uint8Array.from(bytes);
  const at = Buffer.from(tampered).indexOf('{"v"');
  tampered[at + 5] ^= 1;
  assert.equal(png.readText(tampered, 'digiface').status, 'crc-error');
});

test('invalid inputs are rejected', async () => {
  await assert.rejects(png.encode(2, 2, new Uint8Array(3)));
  assert.throws(() => png.makeTextChunk('', 'x'));
  assert.throws(() => png.makeTextChunk('k', '€'));
  assert.throws(() => png.readChunks(ascii('not a png at all')));
});

test('a PNG written with a palette is an indexed image that decodes to the same pixels', async () => {
  const zlib = require('node:zlib');
  const palette = [[0xE0, 0xF8, 0xCF], [0x07, 0x18, 0x21], [0xFF, 0x00, 0xFF]];
  const rgba = new Uint8Array([
    0xE0, 0xF8, 0xCF, 255, 0x07, 0x18, 0x21, 255, 0xFF, 0x00, 0xFF, 255,
    0xFF, 0x00, 0xFF, 255, 0xE0, 0xF8, 0xCF, 255, 0x07, 0x18, 0x21, 255]);
  const bytes = await png.encode(3, 2, rgba, { palette, text: [{ keyword: 'digiface', text: '{}' }] });
  const chunks = png.readChunks(bytes);
  assert.ok(chunks.every(c => c.crcOk));
  const ihdr = chunks.find(c => c.type === 'IHDR').data;
  assert.equal(ihdr[8], 8); assert.equal(ihdr[9], 3);
  const plte = chunks.find(c => c.type === 'PLTE').data;
  assert.deepEqual(Array.from(plte), palette.flat());
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => Buffer.from(c.data))));
  assert.deepEqual(Array.from(raw), [0, 0, 1, 2, 0, 2, 0, 1]);
  assert.equal(png.readText(bytes, 'digiface').status, 'ok');
  // a color outside the palette is refused
  await assert.rejects(() => png.encode(1, 1, new Uint8Array([1, 2, 3, 255]), { palette }), /not in the palette/);
});
