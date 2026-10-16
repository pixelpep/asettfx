// Minimal PNG writer and chunk reader. No dependencies, works in browsers and node.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ASETTFX = root.ASETTFX || {}; root.ASETTFX.png = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c >>> 0;
  }

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function adler32(bytes) {
    let a = 1, b = 0;
    for (let i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  function concat(parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  function latin1Bytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code > 255) throw new Error('tEXt data must be Latin-1');
      out[i] = code;
    }
    return out;
  }

  function latin1String(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function makeChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  const KEYWORD_RE = /^[\x21-\x7E](?:[\x20-\x7E]{0,77}[\x21-\x7E])?$/;

  function makeTextChunk(keyword, text) {
    if (!KEYWORD_RE.test(keyword)) throw new Error('Invalid tEXt keyword: ' + keyword);
    if (text.indexOf('\0') !== -1) throw new Error('tEXt text must not contain NUL');
    return makeChunk('tEXt', concat([latin1Bytes(keyword), Uint8Array.of(0), latin1Bytes(text)]));
  }

  // zlib stream made of stored (uncompressed) blocks. Fallback when CompressionStream is missing.
  function deflateStored(data) {
    const parts = [Uint8Array.of(0x78, 0x01)];
    let pos = 0;
    do {
      const len = Math.min(65535, data.length - pos);
      const final = pos + len >= data.length ? 1 : 0;
      const head = new Uint8Array(5);
      const dv = new DataView(head.buffer);
      head[0] = final;
      dv.setUint16(1, len, true);
      dv.setUint16(3, (~len) & 0xFFFF, true);
      parts.push(head, data.subarray(pos, pos + len));
      pos += len;
    } while (pos < data.length);
    const tail = new Uint8Array(4);
    new DataView(tail.buffer).setUint32(0, adler32(data));
    parts.push(tail);
    return concat(parts);
  }

  async function deflate(data) {
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return deflateStored(data);
  }

  // options.text: [{keyword, text}] written as tEXt chunks between IHDR and IDAT.
  // options.stored: force the uncompressed fallback.
  async function encode(width, height, rgba, options) {
    options = options || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error('Invalid image size');
    }
    if (rgba.length !== width * height * 4) throw new Error('RGBA buffer does not match image size');

    const stride = width * 4;
    const raw = new Uint8Array(height * (1 + stride));
    for (let y = 0; y < height; y++) {
      raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
    }
    const idat = options.stored ? deflateStored(raw) : await deflate(raw);

    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // RGBA

    const parts = [SIGNATURE, makeChunk('IHDR', ihdr)];
    for (const t of options.text || []) parts.push(makeTextChunk(t.keyword, t.text));
    parts.push(makeChunk('IDAT', idat), makeChunk('IEND', new Uint8Array(0)));
    return concat(parts);
  }

  function readChunks(bytes) {
    for (let i = 0; i < SIGNATURE.length; i++) {
      if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
    }
    const chunks = [];
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = SIGNATURE.length;
    while (pos < bytes.length) {
      if (pos + 12 > bytes.length) throw new Error('Truncated PNG');
      const len = dv.getUint32(pos);
      if (pos + 12 + len > bytes.length) throw new Error('Truncated PNG');
      const type = latin1String(bytes.subarray(pos + 4, pos + 8));
      const data = bytes.subarray(pos + 8, pos + 8 + len);
      const crc = dv.getUint32(pos + 8 + len);
      const crcOk = crc === crc32(bytes.subarray(pos + 4, pos + 8 + len));
      chunks.push({ type, data, crcOk });
      pos += 12 + len;
    }
    return chunks;
  }

  function readSize(bytes) {
    const ihdr = readChunks(bytes).find(c => c.type === 'IHDR');
    if (!ihdr) throw new Error('Missing IHDR');
    const dv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
    return { width: dv.getUint32(0), height: dv.getUint32(4) };
  }

  // Looks for a tEXt chunk before the first IDAT.
  // Returns {status: 'ok' | 'crc-error' | 'absent', text?}.
  function readText(bytes, keyword) {
    for (const ch of readChunks(bytes)) {
      if (ch.type === 'IDAT') break;
      if (ch.type !== 'tEXt') continue;
      const z = ch.data.indexOf(0);
      if (z < 1) continue;
      if (latin1String(ch.data.subarray(0, z)) !== keyword) continue;
      return { status: ch.crcOk ? 'ok' : 'crc-error', text: latin1String(ch.data.subarray(z + 1)) };
    }
    return { status: 'absent' };
  }

  return { crc32, adler32, encode, makeChunk, makeTextChunk, readChunks, readSize, readText, deflateStored };
});
