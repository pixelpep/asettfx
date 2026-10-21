const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('aseprite-extension/digiface/blank.lua is in sync with the JS rule (run node tools/gen-blank.mjs)', async () => {
  const { render } = await import('../../tools/gen-blank.mjs');
  const committed = fs.readFileSync(path.join(__dirname, '..', '..', 'aseprite-extension', 'digiface', 'blank.lua'), 'utf8');
  assert.equal(committed, render());
});

test('the extension manifest and the repository package.json carry the same version', () => {
  const root = path.join(__dirname, '..', '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'aseprite-extension', 'package.json'), 'utf8'));
  const repo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.version, repo.version);
  assert.equal(manifest.license, 'Apache-2.0');
});
