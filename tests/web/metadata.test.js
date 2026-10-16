const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const md = require('../../web/src/metadata.js');

const examplesDir = path.join(__dirname, '..', '..', 'spec', 'examples');
const examples = fs.readdirSync(examplesDir).filter(f => f.endsWith('.json'));

test('spec examples are valid', () => {
  assert.ok(examples.length >= 2);
  for (const f of examples) {
    const meta = JSON.parse(fs.readFileSync(path.join(examplesDir, f), 'utf8'));
    assert.deepEqual(md.validate(meta), [], f);
  }
});

const conformance = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'spec', 'conformance', 'metadata-cases.json'), 'utf8'));

test('shared conformance cases (also run by the Lua tests)', () => {
  assert.ok(conformance.cases.length > 20);
  for (const c of conformance.cases) {
    const errors = md.validate(c.meta, c.size);
    assert.equal(errors.length === 0, c.valid, c.name + ': ' + errors.join('; '));
  }
});

const base = () => JSON.parse(fs.readFileSync(path.join(examplesDir, examples[0]), 'utf8'));

test('geometry is checked against the image size', () => {
  const m = base();
  const w = m.grid.cols * m.cell.w, h = m.grid.rows * m.cell.h;
  assert.deepEqual(md.validate(m, { width: w, height: h }), []);
  assert.equal(md.validate(m, { width: w, height: h + 8 }).length, 1);
});

test('serialize is compact ASCII', () => {
  const m = base();
  m.guide.hintFont = 'Café €';
  const text = md.serialize(m);
  assert.ok(/^[\x20-\x7E]*$/.test(text));
  assert.equal(JSON.parse(text).guide.hintFont, 'Café €');
  assert.ok(!/\s{2}|\n/.test(text));
});

test('build omits widthSource in mono mode', () => {
  const cfg = { cellW: 8, cellH: 8, cols: 16, rows: 6, mode: 'mono', widthSource: 'auto', map: ['0020-007E'], baseline: 1 };
  assert.equal('widthSource' in md.build(cfg), false);
  assert.equal(md.build(Object.assign({}, cfg, { mode: 'var' })).widthSource, 'auto');
});
