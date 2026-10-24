// Writes a TrueType font from the drawing: the outline of the ink, the tables, the glyph aliases. A port of
// aseprite-extension/digiface/{outline,ttf}.lua, which tests/web/ttf.test.js compares byte for byte with the Lua writer (golden
// fonts in tests/fixtures/ttf/). Pure code, no DOM. See spec/TTF.md.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.ttf = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCALE = 64;   // font units per pixel

  // ---- bytes
  const u16 = v => { v &= 0xFFFF; return [v >> 8, v & 0xFF]; };
  const i16 = v => u16(v);
  const u32 = v => { v = v >>> 0; return [v >>> 24, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]; };
  const i64 = v => { const out = []; let n = BigInt(v); for (let k = 7; k >= 0; k--) out.push(Number((n >> BigInt(8 * k)) & 0xFFn)); return out; };
  const bytesOfText = s => Array.from(new TextEncoder().encode(s));
  function cat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const pad4 = data => { const extra = (4 - data.length % 4) % 4; return extra ? cat([data, new Uint8Array(extra)]) : data; };
  function checksum(data) {
    data = pad4(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum = (sum + ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3])) >>> 0;
    return sum;
  }
  const floorLog2 = n => { let k = 0; while (2 ** (k + 1) <= n) k++; return k; };

  // ---- the outline of the ink (outline.lua)
  // rows: strings of '#' (ink) and '.', all of the same width. Returns contours, arrays of [x, y] pixel corners (y down),
  // clockwise on screen with the ink on their right, so that holes come out counter-clockwise; collinear points are removed.
  function trace(rows) {
    const height = rows.length;
    const width = height > 0 ? rows[0].length : 0;
    const ink = (x, y) => x >= 0 && y >= 0 && x < width && y < height && rows[y].charCodeAt(x) === 35;
    const key = (x, y) => x * 65536 + y;
    const out = new Map();
    const edge = (x1, y1, x2, y2) => {
      const k = key(x1, y1);
      if (!out.has(k)) out.set(k, []);
      out.get(k).push({ x1, y1, x2, y2, dx: x2 - x1, dy: y2 - y1, used: false });
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!ink(x, y)) continue;
      if (!ink(x, y - 1)) edge(x, y, x + 1, y);
      if (!ink(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!ink(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!ink(x - 1, y)) edge(x, y + 1, x, y);
    }
    const starts = Array.from(out.keys()).sort((a, b) => a - b);
    const contours = [];
    for (const k of starts) {
      for (const first of out.get(k)) {
        if (first.used) continue;
        const points = [];
        let e = first;
        do {
          e.used = true;
          points.push([e.x1, e.y1]);
          let right = null, straight = null, left = null;
          for (const c of out.get(key(e.x2, e.y2)) || []) {
            if (!c.used || c === first) {
              if (c.dx === -e.dy && c.dy === e.dx) right = c;
              else if (c.dx === e.dx && c.dy === e.dy) straight = c;
              else left = c;
            }
          }
          e = right || straight || left;
          if (!e) throw new Error('open outline');
        } while (e !== first);
        const n = points.length;
        const simple = [];
        for (let i = 0; i < n; i++) {
          const p = points[(i - 1 + n) % n], q = points[i], r = points[(i + 1) % n];
          const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
          if (cross !== 0) simple.push(q);
        }
        contours.push(simple);
      }
    }
    return contours;
  }

  // ---- characters (ttf.lua)
  const SPACES = [0x20, 0xA0, 0x1680, 0x202F, 0x205F, 0x3000];
  const isSpace = cp => (cp >= 0x2000 && cp <= 0x200A) || SPACES.includes(cp);

  // Typographic characters that word processors insert in place of the plain ones: when the font has the plain glyph and none
  // of its own for the typographic character, the character uses the plain glyph.
  const ALIASES = {
    0x2018: 0x27, 0x2019: 0x27, 0x201B: 0x27,
    0x201C: 0x22, 0x201D: 0x22, 0x201F: 0x22,
    0x2010: 0x2D, 0x2011: 0x2D, 0x2012: 0x2D, 0x2013: 0x2D, 0x2014: 0x2D, 0x2212: 0x2D,
    0x00A0: 0x20
  };

  function addAliases(glyphs) {
    const byCp = new Map();
    for (const g of glyphs) if (g.cp !== undefined) byCp.set(g.cp, g);
    let added = 0;
    for (const cp of Object.keys(ALIASES).map(Number).sort((a, b) => a - b)) {
      const target = byCp.get(ALIASES[cp]);
      if (target && !byCp.has(cp)) {
        (target.aliases = target.aliases || []).push(cp);
        added++;
      }
    }
    return added;
  }
  const codePoints = g => (g.cp !== undefined ? [g.cp] : []).concat(g.aliases || []);

  // ---- glyphs
  function convert(contours, s) {
    return contours.map(c => c.map(p => [p[0] * SCALE, (s.cell_h - p[1] - s.baseline) * SCALE]));
  }
  function bounds(contours) {
    let x0, y0, x1, y1;
    for (const c of contours) for (const p of c) {
      x0 = x0 === undefined ? p[0] : Math.min(x0, p[0]); x1 = x1 === undefined ? p[0] : Math.max(x1, p[0]);
      y0 = y0 === undefined ? p[1] : Math.min(y0, p[1]); y1 = y1 === undefined ? p[1] : Math.max(y1, p[1]);
    }
    return [x0 || 0, y0 || 0, x1 || 0, y1 || 0];
  }
  function notdef(s) {
    const w = s.cell_w;
    const top = Math.max(2, s.cell_h - s.baseline - 1);
    const x0 = w >= 3 ? 1 : 0, x1 = w >= 3 ? w - 1 : w;
    const contours = [[[x0, 0], [x0, top], [x1, top], [x1, 0]]];
    if (x1 - x0 >= 3 && top >= 3) contours.push([[x0 + 1, 1], [x1 - 1, 1], [x1 - 1, top - 1], [x0 + 1, top - 1]]);
    return { name: '.notdef', advance: w * SCALE, contours: contours.map(c => c.map(p => [p[0] * SCALE, p[1] * SCALE])) };
  }
  function collect(analysis, s) {
    const list = [];
    for (const g of analysis.glyphs) {
      if (g.inside && (g.has_ink || isSpace(g.cp))) {
        list.push({ cp: g.cp, advance: g.advance * SCALE, contours: g.has_ink ? convert(trace(g.ink_rows), s) : [] });
      }
    }
    list.sort((a, b) => a.cp - b.cp);
    list.unshift(notdef(s));
    for (const g of list) {
      [g.xmin, g.ymin, g.xmax, g.ymax] = bounds(g.contours);
      g.lsb = g.contours.length > 0 ? g.xmin : 0;
    }
    return list;
  }

  function encodeGlyph(g) {
    if (g.contours.length === 0) return new Uint8Array(0);
    const ends = [], xs = [], ys = [];
    for (const c of g.contours) {
      for (const p of c) { xs.push(p[0]); ys.push(p[1]); }
      ends.push(xs.length - 1);
    }
    const flags = [], xb = [], yb = [];
    let px = 0, py = 0;
    for (let i = 0; i < xs.length; i++) {
      let flag = 0x01;
      const dx = xs[i] - px, dy = ys[i] - py;
      px = xs[i]; py = ys[i];
      if (dx === 0) flag |= 0x10;
      else if (dx >= -255 && dx <= 255) { flag |= 0x02 | (dx > 0 ? 0x10 : 0); xb.push(Math.abs(dx)); }
      else xb.push(...i16(dx));
      if (dy === 0) flag |= 0x20;
      else if (dy >= -255 && dy <= 255) { flag |= 0x04 | (dy > 0 ? 0x20 : 0); yb.push(Math.abs(dy)); }
      else yb.push(...i16(dy));
      flags.push(flag);
    }
    const parts = [i16(g.contours.length), i16(g.xmin), i16(g.ymin), i16(g.xmax), i16(g.ymax)];
    for (const e of ends) parts.push(u16(e));
    parts.push(u16(0), flags, xb, yb);                 // no instructions
    return pad4(Uint8Array.from(parts.flat()));
  }

  // ---- tables
  function buildHead(info, s, timestamp) {
    const stamp = timestamp + 2082844800;               // seconds from 1904-01-01
    return Uint8Array.from([
      u32(0x00010000), u32(0x00010000), u32(0), u32(0x5F0F3CF5),
      u16(0x000B), u16(s.cell_h * SCALE),
      i64(stamp), i64(stamp),
      i16(info.xmin), i16(info.ymin), i16(info.xmax), i16(info.ymax),
      u16(0), u16(s.cell_h), i16(2), i16(info.longLoca ? 1 : 0), i16(0)
    ].flat());
  }
  function buildHhea(s, glyphs) {
    let maxAdvance = 0, minLsb, minRsb, maxExtent;
    for (const g of glyphs) {
      maxAdvance = Math.max(maxAdvance, g.advance);
      if (g.contours.length > 0) {
        const rsb = g.advance - g.xmax;
        minLsb = minLsb === undefined ? g.lsb : Math.min(minLsb, g.lsb);
        minRsb = minRsb === undefined ? rsb : Math.min(minRsb, rsb);
        maxExtent = maxExtent === undefined ? g.xmax : Math.max(maxExtent, g.xmax);
      }
    }
    return Uint8Array.from([
      u32(0x00010000),
      i16((s.cell_h - s.baseline) * SCALE), i16(-s.baseline * SCALE), i16(0),
      u16(maxAdvance), i16(minLsb || 0), i16(minRsb || 0), i16(maxExtent || 0),
      i16(1), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), u16(glyphs.length)
    ].flat());
  }
  function buildMaxp(glyphs) {
    let maxPoints = 0, maxContours = 0;
    for (const g of glyphs) {
      maxPoints = Math.max(maxPoints, g.contours.reduce((n, c) => n + c.length, 0));
      maxContours = Math.max(maxContours, g.contours.length);
    }
    return Uint8Array.from([
      u32(0x00010000), u16(glyphs.length), u16(maxPoints), u16(maxContours),
      u16(0), u16(0), u16(1), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0)
    ].flat());
  }

  // Unicode blocks reported in OS/2 ulUnicodeRange: [first, last, bit]
  const BLOCKS = [
    [0x0000, 0x007F, 0], [0x0080, 0x00FF, 1], [0x0100, 0x017F, 2], [0x0180, 0x024F, 3],
    [0x0250, 0x02AF, 4], [0x02B0, 0x02FF, 5], [0x0300, 0x036F, 6], [0x0370, 0x03FF, 7],
    [0x0400, 0x04FF, 9], [0x2000, 0x206F, 31], [0x20A0, 0x20CF, 33]
  ];
  function unicodeRanges(glyphs) {
    const words = [0, 0, 0, 0];
    const set = bit => { words[Math.floor(bit / 32)] = (words[Math.floor(bit / 32)] | (1 << (bit % 32))) >>> 0; };
    for (const g of glyphs) for (const cp of codePoints(g)) {
      if (cp > 0xFFFF) set(57);
      for (const b of BLOCKS) if (cp >= b[0] && cp <= b[1]) set(b[2]);
    }
    return words;
  }
  function glyphTop(glyphs, cp) {
    for (const g of glyphs) if (g.cp === cp && g.contours.length > 0) return g.ymax;
    return undefined;
  }
  function buildOs2(info, s, glyphs) {
    const ascender = (s.cell_h - s.baseline) * SCALE;
    const descender = -s.baseline * SCALE;
    // as in the Lua (where 0 is a value too): the metric when it is given, else the height of x and H, else 0
    const xHeight = s.x_height != null ? s.x_height * SCALE : (glyphTop(glyphs, 0x78) ?? 0);
    const capHeight = s.cap_height != null ? s.cap_height * SCALE : (glyphTop(glyphs, 0x48) ?? 0);
    let total = 0, count = 0, first = 0xFFFF, last = 0;
    for (const g of glyphs) {
      if (g.advance > 0) { total += g.advance; count++; }
      for (const cp of codePoints(g)) { first = Math.min(first, cp); last = Math.max(last, cp); }
    }
    const ranges = unicodeRanges(glyphs);
    const halfW = Math.floor(s.cell_w * SCALE / 2), halfH = Math.floor(s.cell_h * SCALE / 2);
    return Uint8Array.from([
      u16(4), i16(count > 0 ? Math.floor(total / count) : 0), u16(400), u16(5), u16(0),
      i16(halfW), i16(halfH), i16(0), i16(Math.floor(s.cell_h * SCALE / 8)),
      i16(halfW), i16(halfH), i16(0), i16(halfH),
      i16(SCALE), i16(xHeight > 0 ? Math.floor(xHeight / 2) : Math.floor(ascender / 3)), i16(0),
      new Array(10).fill(0),
      u32(ranges[0]), u32(ranges[1]), u32(ranges[2]), u32(ranges[3]),
      [0x20, 0x20, 0x20, 0x20], u16(0x00C0), u16(Math.min(first, 0xFFFF)), u16(Math.min(last, 0xFFFF)),
      i16(ascender), i16(descender), i16(0),
      u16(Math.max(ascender, info.ymax)), u16(Math.max(-descender, -info.ymin)),
      u32(1), u32(0),
      i16(xHeight), i16(capHeight), u16(0), u16(0x20), u16(1)
    ].flat());
  }

  function buildCmap(glyphs) {
    const entries = [];
    glyphs.forEach((g, gid) => { for (const cp of codePoints(g)) entries.push({ cp, gid }); });
    entries.sort((a, b) => a.cp - b.cp);
    const groups = limit => {
      const out = [];
      for (const e of entries) {
        if (e.cp > limit) continue;
        const last = out[out.length - 1];
        if (last && e.cp === last.last + 1 && e.gid === last.gid + (last.last - last.first + 1)) last.last = e.cp;
        else out.push({ first: e.cp, last: e.cp, gid: e.gid });
      }
      return out;
    };
    const bmp = groups(0xFFFE);
    const segCount = bmp.length + 1;
    const ends = [], starts = [], deltas = [], offsets = [];
    bmp.forEach(grp => { ends.push(u16(grp.last)); starts.push(u16(grp.first)); deltas.push(u16(grp.gid - grp.first)); offsets.push(u16(0)); });
    ends.push(u16(0xFFFF)); starts.push(u16(0xFFFF)); deltas.push(u16(1)); offsets.push(u16(0));
    const search = 2 * 2 ** floorLog2(segCount);
    const body = [
      u16(segCount * 2), u16(search), u16(floorLog2(segCount)), u16(segCount * 2 - search),
      ends.flat(), u16(0), starts.flat(), deltas.flat(), offsets.flat()
    ].flat();
    const format4 = [u16(4), u16(6 + body.length), u16(0), body].flat();

    const subtables = [format4];
    const records = [[0, 3, 1], [3, 1, 1]];            // platform, encoding, subtable index
    const hasAstral = entries.some(e => e.cp > 0xFFFF);
    if (hasAstral) {
      const wide = groups(0x10FFFF);
      const rows = wide.map(grp => [u32(grp.first), u32(grp.last), u32(grp.gid)].flat()).flat();
      subtables.push([u16(12), u16(0), u32(16 + 12 * wide.length), u32(0), u32(wide.length), rows].flat());
      records.push([0, 4, 2], [3, 10, 2]);
    }
    records.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
    let offset = 4 + 8 * records.length;
    const startsAt = subtables.map(s => { const at = offset; offset += s.length; return at; });
    const parts = [u16(0), u16(records.length)];
    for (const r of records) parts.push(u16(r[0]), u16(r[1]), u32(startsAt[r[2] - 1]));
    for (const s of subtables) parts.push(s);
    return Uint8Array.from(parts.flat());
  }

  function utf16be(s) {
    const out = [];
    for (const ch of s) {
      let cp = ch.codePointAt(0);
      if (cp >= 0x10000) { cp -= 0x10000; out.push(...u16(0xD800 + (cp >> 10)), ...u16(0xDC00 + (cp & 0x3FF))); }
      else out.push(...u16(cp));
    }
    return out;
  }
  function buildName(names) {
    const ids = Object.keys(names).map(Number).sort((a, b) => a - b);
    const ascii = !Object.values(names).some(t => /[^\x20-\x7e]/.test(t));
    const records = [];
    for (const id of ids) {
      if (ascii) records.push([1, 0, 0, id, bytesOfText(names[id])]);
      records.push([3, 1, 0x409, id, utf16be(names[id])]);
    }
    records.sort((a, b) => { for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
    const dir = [], strings = [];
    let offset = 0;
    for (const r of records) {
      dir.push(...u16(r[0]), ...u16(r[1]), ...u16(r[2]), ...u16(r[3]), ...u16(r[4].length), ...u16(offset));
      strings.push(...r[4]);
      offset += r[4].length;
    }
    return Uint8Array.from([...u16(0), ...u16(records.length), ...u16(6 + 12 * records.length), ...dir, ...strings]);
  }
  function buildPost(glyphs) {
    const fixed = glyphs.every(g => g.advance === glyphs[0].advance) ? 1 : 0;
    return Uint8Array.from([u32(0x00030000), u32(0), i16(-SCALE), i16(SCALE), u32(fixed), u32(0), u32(0), u32(0), u32(0)].flat());
  }

  // ---- the font
  // analysis: {glyphs: [{cp, inside, has_ink, ink_rows, advance}]} (advance in pixels), see fromModel.
  // s: {name, cell_w, cell_h, baseline, x_height, cap_height}.
  // options: family, subfamily, copyright, version, timestamp (unix seconds), aliases (default true).
  // Returns {font: Uint8Array, info: {glyphs, bytes, aliases}}.
  function build(analysis, s, options) {
    options = options || {};
    const glyphs = collect(analysis, s);
    if (glyphs.length < 2) throw new Error('no glyph to export');
    const aliases = options.aliases !== false ? addAliases(glyphs) : 0;

    const info = { longLoca: false };
    for (const g of glyphs) {
      if (g.contours.length === 0) continue;
      info.xmin = info.xmin === undefined ? g.xmin : Math.min(info.xmin, g.xmin); info.xmax = info.xmax === undefined ? g.xmax : Math.max(info.xmax, g.xmax);
      info.ymin = info.ymin === undefined ? g.ymin : Math.min(info.ymin, g.ymin); info.ymax = info.ymax === undefined ? g.ymax : Math.max(info.ymax, g.ymax);
    }
    for (const k of ['xmin', 'ymin', 'xmax', 'ymax']) info[k] = info[k] || 0;

    const glyf = [], offsets = [];
    let pos = 0;
    for (const g of glyphs) { const data = encodeGlyph(g); offsets.push(pos); glyf.push(data); pos += data.length; }
    offsets.push(pos);
    info.longLoca = pos > 0x1FFFE;
    const loca = Uint8Array.from(offsets.map(o => info.longLoca ? u32(o) : u16(Math.floor(o / 2))).flat());
    const hmtx = Uint8Array.from(glyphs.map(g => [...u16(g.advance), ...i16(g.lsb)]).flat());

    const family = options.family || s.name || 'Digiface Font';
    const subfamily = options.subfamily || 'Regular';
    const version = options.version || 'Version 1.000';
    let ps = family.replace(/[^A-Za-z0-9]/g, '') + '-' + subfamily.replace(/[^A-Za-z0-9]/g, '');
    if (ps[0] === '-') ps = 'Font' + ps;
    const names = {
      1: family, 2: subfamily, 3: family + ';' + version + ';Digiface',
      4: subfamily === 'Regular' ? family : family + ' ' + subfamily, 5: version, 6: ps.slice(0, 63)
    };
    if (options.copyright) names[0] = options.copyright;

    const tables = {
      'OS/2': buildOs2(info, s, glyphs),
      cmap: buildCmap(glyphs),
      glyf: cat(glyf),
      head: buildHead(info, s, options.timestamp !== undefined ? options.timestamp : Math.floor(Date.now() / 1000)),
      hhea: buildHhea(s, glyphs),
      hmtx,
      loca,
      maxp: buildMaxp(glyphs),
      name: buildName(names),
      post: buildPost(glyphs)
    };
    const tags = Object.keys(tables).sort();
    const count = tags.length;
    const search = 16 * 2 ** floorLog2(count);
    const parts = [u32(0x00010000), u16(count), u16(search), u16(floorLog2(count)), u16(count * 16 - search)];
    let offset = 12 + 16 * count;
    let headOffset = 0;
    const bodies = [];
    for (const tag of tags) {
      const data = tables[tag];
      parts.push(bytesOfText(tag), u32(checksum(data)), u32(offset), u32(data.length));
      const padded = pad4(data);
      bodies.push(padded);
      if (tag === 'head') headOffset = offset;
      offset += padded.length;
    }
    const font = cat([Uint8Array.from(parts.flat()), ...bodies]);
    const adjustment = (0xB1B0AFBA - checksum(font)) >>> 0;
    font.set(u32(adjustment), headOffset + 8);
    return { font, info: { glyphs: glyphs.length, bytes: font.length, aliases } };
  }

  // ---- from the drawing of the editor
  // m: an editor model (editor/model.js). Ink is what the exporter reads as dark: black, or the darkest and the dark shade of
  // GB Studio (the light and the palest ones are background). Returns {analysis, settings, warnings}: the drawn glyphs read as the
  // extension reads an image, the settings for build, and what is worth telling before the export.
  function fromModel(m) {
    const meta = m.meta || {};
    const metrics = meta.metrics || {};
    const spacing = metrics.spacing || 0;
    const isInk = v => (m.gb ? v >= 1 && v <= 2 : v === 1);
    const glyphs = [];
    const empty = [], beyond = [];
    for (const [cp, g] of m.glyphs) {
      const width = m.variable ? g.width : m.cellW;
      const rows = [];
      let hasInk = false, hidden = false;
      for (let y = 0; y < m.cellH; y++) {
        let line = '';
        for (let x = 0; x < m.cellW; x++) {
          const ink = isInk(g.pixels[y * m.cellW + x]);
          if (x < width) { line += ink ? '#' : '.'; if (ink) hasInk = true; }
          else if (ink) hidden = true;
        }
        rows.push(line);
      }
      if (hidden) beyond.push(cp);
      if (!hasInk && !isSpace(cp)) empty.push(cp);
      glyphs.push({ cp, inside: true, has_ink: hasInk, ink_rows: rows, advance: m.variable ? width + spacing : m.cellW });
    }
    return {
      analysis: { glyphs },
      settings: { name: meta.name, cell_w: m.cellW, cell_h: m.cellH, baseline: metrics.baseline || 0, spacing, x_height: metrics.xHeight, cap_height: metrics.capHeight },
      warnings: { empty, beyond }
    };
  }

  return { SCALE, trace, build, fromModel, isSpace };
});
