const test = require('node:test');
const assert = require('node:assert/strict');
const cm = require('../../web/src/charmap.js');

test('expand ranges, single code points and gaps', () => {
  const { cells, errors } = cm.expandMap(['0041-0043', '_', '20AC']);
  assert.deepEqual(errors, []);
  assert.deepEqual(cells, [0x41, 0x42, 0x43, null, 0x20AC]);
});

test('invalid tokens are reported', () => {
  for (const bad of ['41', 'GGGG', '0043-0041', 'D800', '0041-0042-0043', '110000', '']) {
    assert.ok(cm.expandMap([bad]).errors.length > 0, bad);
  }
  assert.ok(cm.expandMap(['D7FF-E000']).errors.length > 0, 'range crossing surrogates');
});

test('validateMap checks size and duplicates', () => {
  assert.deepEqual(cm.validateMap(['0020-007E'], 96), []);
  assert.equal(cm.validateMap(['0020-007E'], 90).length, 1);
  assert.equal(cm.validateMap(['0041', '0040-0042'], 10).length, 1);
  assert.equal(cm.validateMap([], 10).length, 1);
});

test('compress is the inverse of expand', () => {
  const cells = [0x41, 0x42, 0x43, null, 0x20AC, 0x5A, null, null];
  assert.deepEqual(cm.compress(cells), ['0041-0043', '_', '20AC', '005A']);
  assert.deepEqual(cm.expandMap(cm.compress(cells)).cells, cells.slice(0, 6));
});

test('fromText keeps order, drops duplicates and line breaks', () => {
  assert.deepEqual(cm.fromText('ab\nbaé'), [0x61, 0x62, 0xE9]);
  assert.deepEqual(cm.fromText('\u{1F600}'), [0x1F600]);
});

test('fromHexList accepts U+ prefixes, short hex and commas', () => {
  const r = cm.fromHexList('U+20-7E, 00C0-00FF 20ac _');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.tokens, ['0020-007E', '00C0-00FF', '20AC', '_']);
  assert.equal(cm.fromHexList('zz').errors.length, 1);
});

test('shared conformance cases (also run by the Lua tests)', () => {
  const file = require('node:path').join(__dirname, '..', '..', 'spec', 'conformance', 'charmap-cases.json');
  const shared = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
  for (const c of shared.cases) {
    const r = cm.expandMap(c.tokens);
    if (c.error) assert.ok(r.errors.length > 0, c.name);
    else assert.deepEqual(r.cells.map(x => (x === null ? -1 : x)), c.cells, c.name);
  }
  for (const c of shared.hexList) {
    const r = cm.fromHexList(c.input);
    if (c.error) assert.ok(r.errors.length > 0, 'hexList ' + JSON.stringify(c.input));
    else { assert.deepEqual(r.errors, [], c.input); assert.deepEqual(r.tokens, c.tokens, c.input); }
  }
  const tpl = require('../../web/src/template.js');
  for (const cp of shared.blank.blank) assert.ok(tpl.isBlankCodepoint(cp), 'blank ' + cp);
  for (const cp of shared.blank.notBlank) assert.ok(!tpl.isBlankCodepoint(cp), 'not blank ' + cp);
});
