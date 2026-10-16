// Writes the PNG fixtures used by the Lua tests (tests/fixtures) with the real web generator,
// using a deterministic fake ghost font so the expected widths are known.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'fixtures');
mkdirSync(out, { recursive: true });

const png = require('../web/src/png.js');
const md = require('../web/src/metadata.js');
const gen = require('../web/src/generate.js');

// Ghost ink of character cp ends at column cp % 7, so its prefilled width is min(8, cp % 7 + 2). Spaces are 3 wide.
const mask = (cp, w, h) => { const m = new Uint8Array(w * h); m[2 * w + (cp % 7)] = 1; return m; };
mask.blankAdvance = () => 3;

const base = {
  name: 'Fixture', cellW: 8, cellH: 8, cols: 16, mode: 'var', widthSource: 'magenta',
  map: ['0020-007E'], baseline: 1, spacing: 0,
  guide: { checker: true, baseline: true, hint: 'ghost', prefill: true, hintFont: 'fake' }
};

const write = (name, bytes) => writeFileSync(join(out, name), bytes);
const textChunk = text => ({ text: [{ keyword: md.KEYWORD, text }] });

const variable = await gen.generate(base, mask);
write('template-var.png', variable.png);
const advances = {};
for (let cp = 0x20; cp <= 0x7E; cp++) advances[cp] = cp === 0x20 ? 3 : Math.min(8, (cp % 7) + 2);
writeFileSync(join(out, 'template-var.expected.json'), JSON.stringify({ cellW: 8, cellH: 8, advances }, null, 1) + '\n');

const mono = await gen.generate(Object.assign({}, base, { mode: 'mono', guide: { checker: true, baseline: true, hint: 'ghost' } }), mask);
write('template-mono.png', mono.png);

const { width, height, rgba } = variable;
write('template-no-meta.png', await png.encode(width, height, rgba));
write('template-bad-json.png', await png.encode(width, height, rgba, textChunk('{"v":1')));
write('template-bad-schema.png', await png.encode(width, height, rgba, textChunk(JSON.stringify(Object.assign({}, variable.meta, { v: 2 })))));

const corrupt = Uint8Array.from(variable.png);
corrupt[Buffer.from(corrupt).indexOf('"mode"') + 8] ^= 1;
write('template-corrupt-crc.png', corrupt);

const taller = new Uint8Array(width * (height + 8) * 4).fill(255);
taller.set(rgba);
write('template-wrong-size.png', await png.encode(width, height + 8, taller, textChunk(variable.metaText)));

console.log('tests/fixtures: 7 PNG files and the expected widths');
