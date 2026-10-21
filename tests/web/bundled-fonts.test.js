const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p));

// Only licenses that allow redistribution, with a link to their text.
const ALLOWED = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'SIL OFL 1.1': 'https://openfontlicense.org/',
};

test('the generated catalog and font data are in sync with web/fonts (run npm run gen:fonts)', async () => {
  const gen = await import('../../tools/gen-bundled-fonts.mjs');
  const built = gen.build();
  assert.equal(read('web', 'src', 'bundled-fonts.js').toString('utf8'), built.catalogJs);
  for (const f of built.catalog) assert.equal(read('web', 'fonts', 'data', f.id + '.js').toString('utf8'), built.data[f.id], f.id);
});

test('every bundled font has an author, an allowed license with its link, a source, and a credit in LICENSES.md', () => {
  const catalog = JSON.parse(read('web', 'fonts', 'fonts.json').toString('utf8'));
  const licenses = read('web', 'fonts', 'LICENSES.md').toString('utf8');
  assert.ok(catalog.length >= 5);
  const ids = new Set();
  for (const f of catalog) {
    assert.ok(!ids.has(f.id), 'duplicate id ' + f.id); ids.add(f.id);
    assert.ok(f.author && f.label && f.source, f.id);
    assert.equal(ALLOWED[f.license], f.licenseUrl, f.id + ': ' + f.license);
    assert.ok(licenses.includes(f.author), f.id + ' author in LICENSES.md');
    assert.ok(licenses.includes(f.label), f.id + ' label in LICENSES.md');
    assert.ok(licenses.includes(f.license) || licenses.includes(f.licenseUrl), f.id + ' license in LICENSES.md');
  }
});

test('an OFL font carries its copyright line and the full license text, as the license requires', () => {
  const catalog = JSON.parse(read('web', 'fonts', 'fonts.json').toString('utf8'));
  const ofl = catalog.filter(f => f.license === 'SIL OFL 1.1');
  assert.ok(ofl.length >= 1);
  for (const f of ofl) {
    assert.ok(f.copyright && f.licenseText, f.id);
    const text = read('web', 'fonts', f.licenseText).toString('utf8');
    assert.ok(text.startsWith(f.copyright), f.id + ': the license file starts with the copyright line');
    assert.ok(text.includes('SIL OPEN FONT LICENSE Version 1.1'), f.id);
    assert.ok(text.includes('PERMISSION & CONDITIONS') && text.includes('DISCLAIMER'), f.id + ': complete text');
    const sandbox = { self: {} };
    const data = read('web', 'fonts', 'data', f.id + '.js').toString('utf8');
    assert.ok(data.includes(f.copyright), f.id + ': the data file names the copyright holder');
  }
});

test('each data file holds exactly the original font, which is a TrueType or OpenType file', () => {
  const catalog = JSON.parse(read('web', 'fonts', 'fonts.json').toString('utf8'));
  for (const f of catalog) {
    const sandbox = { self: {} };
    vm.runInNewContext(read('web', 'fonts', 'data', f.id + '.js').toString('utf8'), sandbox);
    const bytes = Buffer.from(sandbox.self.ASETTFX.fontData[f.id], 'base64');
    assert.ok(bytes.equals(read('web', 'fonts', 'original', f.file)), f.id);
    const magic = bytes.subarray(0, 4).toString('latin1');
    assert.ok(magic === '\u0000\u0001\u0000\u0000' || magic === 'OTTO' || magic === 'true', f.id + ' header');
  }
});

test('NOTICE credits the bundled fonts', () => {
  const notice = read('NOTICE').toString('utf8');
  assert.ok(notice.includes('jeti') && notice.includes('Polda18') && notice.includes('Bytesized Project Authors'));
});
