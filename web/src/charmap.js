// Code point map tokens, see spec/GRID.md section 2.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.charmap = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOKEN_RE = /^(_|[0-9A-Fa-f]{4,6}(-[0-9A-Fa-f]{4,6})?)$/;
  const MAX_TOKENS = 512;

  function isValidCodepoint(cp) {
    return Number.isInteger(cp) && cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF);
  }

  function hex(cp) {
    return cp.toString(16).toUpperCase().padStart(4, '0');
  }

  // Returns {unassigned: true} | {start, end} | {error}.
  function parseToken(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { error: 'Invalid map token: ' + token };
    if (token === '_') return { unassigned: true };
    const parts = token.split('-').map(p => parseInt(p, 16));
    const start = parts[0];
    const end = parts.length > 1 ? parts[1] : start;
    if (end < start) return { error: 'Reversed range: ' + token };
    if (!isValidCodepoint(start) || !isValidCodepoint(end)) return { error: 'Invalid code point in ' + token };
    if (start < 0xD800 && end > 0xDFFF) return { error: 'Range crosses surrogates: ' + token };
    return { start, end };
  }

  // Expands tokens to one entry per cell: a code point, or null for an unassigned cell.
  // Invalid tokens are reported in errors and skipped.
  function expandMap(tokens) {
    const cells = [];
    const errors = [];
    for (const token of tokens) {
      const t = parseToken(token);
      if (t.error) { errors.push(t.error); continue; }
      if (t.unassigned) { cells.push(null); continue; }
      for (let cp = t.start; cp <= t.end; cp++) cells.push(cp);
      if (cells.length > 0x110000) { errors.push('Map is too large'); break; }
    }
    return { cells, errors };
  }

  function validateMap(tokens, maxCells) {
    if (!Array.isArray(tokens) || tokens.length < 1) return ['map must be a non-empty array'];
    if (tokens.length > MAX_TOKENS) return ['map has more than ' + MAX_TOKENS + ' tokens'];
    const { cells, errors } = expandMap(tokens);
    if (errors.length) return errors;
    const out = [];
    if (cells.length > maxCells) out.push('map covers ' + cells.length + ' cells but the grid has ' + maxCells);
    const seen = new Set();
    for (const cp of cells) {
      if (cp === null) continue;
      if (seen.has(cp)) { out.push('Duplicate code point U+' + hex(cp)); break; }
      seen.add(cp);
    }
    return out;
  }

  // Inverse of expandMap. Trailing unassigned cells are dropped.
  function compress(cells) {
    const tokens = [];
    let i = 0;
    while (i < cells.length) {
      const cp = cells[i];
      if (cp === null) { tokens.push('_'); i++; continue; }
      let j = i;
      while (j + 1 < cells.length && cells[j + 1] === cells[j] + 1) j++;
      tokens.push(j > i ? hex(cp) + '-' + hex(cells[j]) : hex(cp));
      i = j + 1;
    }
    while (tokens.length && tokens[tokens.length - 1] === '_') tokens.pop();
    return tokens;
  }

  // Literal characters typed by the user. Line breaks and tabs are ignored, duplicates keep their first place.
  function fromText(text) {
    const seen = new Set();
    const cells = [];
    for (const ch of Array.from(text.replace(/[\r\n\t]/g, ''))) {
      const cp = ch.codePointAt(0);
      if (!isValidCodepoint(cp) || seen.has(cp)) continue;
      seen.add(cp);
      cells.push(cp);
    }
    return cells;
  }

  // Hex list such as "0020-007E U+00C0-00FF 20AC _". Separators: spaces and commas.
  function fromHexList(text) {
    const tokens = [];
    const errors = [];
    for (const raw of text.split(/[\s,]+/).filter(Boolean)) {
      const norm = raw.replace(/U\+|0x/gi, '')
        .split('-').map(p => (/^[0-9A-Fa-f]+$/.test(p) ? p.padStart(4, '0') : p)).join('-');
      const t = parseToken(norm);
      if (t.error) errors.push(t.error); else tokens.push(norm.toUpperCase());
    }
    return { tokens, errors };
  }

  return { TOKEN_RE, MAX_TOKENS, isValidCodepoint, hex, parseToken, expandMap, validateMap, compress, fromText, fromHexList };
});
