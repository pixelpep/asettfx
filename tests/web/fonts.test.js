const test = require('node:test');
const assert = require('node:assert/strict');
const fonts = require('../../web/src/fonts.js');

test('automatic choice depends on the spacing mode', () => {
  const mono = fonts.resolve({ id: 'auto' }, 'mono');
  const variable = fonts.resolve({ id: 'auto' }, 'var');
  assert.match(mono.family, /Menlo/);
  assert.equal(mono.align, 'center');
  assert.match(variable.family, /Verdana/);
  assert.equal(variable.weight, 'normal');
  assert.equal(variable.align, 'left');
});

test('a fixed choice keeps its font and only the alignment follows the mode', () => {
  assert.equal(fonts.resolve({ id: 'sans' }, 'mono').family, fonts.resolve({ id: 'sans' }, 'var').family);
  assert.equal(fonts.resolve({ id: 'sans' }, 'var').align, 'left');
});

test('custom font is trimmed, capped at 64 characters, and falls back when empty', () => {
  assert.equal(fonts.resolve({ id: 'custom', custom: { family: '  Georgia ', bold: true } }, 'mono').family, 'Georgia');
  assert.equal(fonts.resolve({ id: 'custom', custom: { family: '  Georgia ', bold: true } }, 'mono').weight, 'bold');
  assert.equal(fonts.resolve({ id: 'custom', custom: { family: 'x'.repeat(100) } }, 'mono').family.length, 64);
  assert.match(fonts.resolve({ id: 'custom', custom: { family: '' } }, 'mono').family, /Menlo/);
});

test('serif and typewriter choices are offered', () => {
  const ids = fonts.FONTS.map(f => f.id);
  for (const id of ['georgia', 'times', 'courier']) assert.ok(ids.includes(id), id);
  assert.match(fonts.resolve({ id: 'georgia' }, 'var').family, /serif/);
});

test('every font family fits the metadata limit', () => {
  for (const f of fonts.FONTS) if (f.family) assert.ok(f.family.length <= 64, f.id);
});
