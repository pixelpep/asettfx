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
  const bytes = await png.encode(2, 2, new Uint8Array(16), { text: [{ keyword: 'asettfx', text: '{"v":1}' }] });
  assert.deepEqual(png.readChunks(bytes).map(c => c.type), ['IHDR', 'tEXt', 'IDAT', 'IEND']);
  assert.deepEqual(png.readText(bytes, 'asettfx'), { status: 'ok', text: '{"v":1}' });
  assert.equal(png.readText(bytes, 'other').status, 'absent');
});

test('corrupted tEXt is reported as crc-error', async () => {
  const bytes = await png.encode(2, 2, new Uint8Array(16), { text: [{ keyword: 'asettfx', text: '{"v":1}' }] });
  const tampered = Uint8Array.from(bytes);
  const at = Buffer.from(tampered).indexOf('{"v"');
  tampered[at + 5] ^= 1;
  assert.equal(png.readText(tampered, 'asettfx').status, 'crc-error');
});

test('invalid inputs are rejected', async () => {
  await assert.rejects(png.encode(2, 2, new Uint8Array(3)));
  assert.throws(() => png.makeTextChunk('', 'x'));
  assert.throws(() => png.makeTextChunk('k', '€'));
  assert.throws(() => png.readChunks(ascii('not a png at all')));
});
