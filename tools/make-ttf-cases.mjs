// Writes tests/fixtures/ttf/cases.json: the glyphs and settings given to the TrueType writers, to compare the JavaScript one
// (web/src/ttf.js) with the Lua one (aseprite-extension/digiface/ttf.lua) byte for byte. The reference fonts (*.ttf next to the
// cases) are made by the Lua writer: sh tools/make-ttf-golden.sh (needs Aseprite). Usage: node tools/make-ttf-cases.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tests', 'fixtures', 'ttf');
mkdirSync(dir, { recursive: true });

const H = ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#', '.....'];
const O = ['.###.', '#...#', '#...#', '#...#', '#...#', '.###.', '.....', '.....'];
const CHECK = ['#.#.', '.#.#', '#.#.', '.#.#', '#.#.', '.#.#', '#.#.', '.#.#'];
const DOT = ['.', '.', '.', '.', '#', '.', '.', '.'];
const DASH = ['....', '....', '....', '####', '....', '....', '....', '....'];
const QUOTE = ['#', '#', '.', '.', '.', '.', '.', '.'];
const X = ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....', '.....', '.....'];
const g = (cp, rows, advance) => ({ cp, inside: true, has_ink: !!rows, ink_rows: rows || [], advance: advance || 8 });

const checker16 = [];
for (let y = 0; y < 16; y++) { let line = ''; for (let x = 0; x < 16; x++) line += (x + y) % 2 ? '#' : '.'; checker16.push(line); }
const big = [];
for (let cp = 0x100; cp < 0x16E; cp++) big.push(g(cp, checker16, 16));

const cases = [
  {
    name: 'mono', settings: { name: 'Mono', cell_w: 8, cell_h: 8, baseline: 1 },
    glyphs: [g(0x20), g(0x41, H), g(0x42, O), g(0x43, CHECK, 4), g(0x58, X)],
    options: { family: 'Mono Test', timestamp: 1760000000 }
  },
  {
    name: 'var-aliases', settings: { name: 'Var', cell_w: 8, cell_h: 8, baseline: 1 },
    glyphs: [g(0x20, null, 3), g(0x22, ['#.#', '#.#', '...', '...', '...', '...', '...', '...'], 4), g(0x27, QUOTE, 2), g(0x2D, DASH, 5), g(0x2E, DOT, 2),
      g(0x48, H, 6), g(0x4F, O, 6), g(0x78, X, 6), g(0xE9, O, 6), g(0x20AC, H, 6), g(0x1F600, O, 6), g(0x3000, null, 8)],
    options: { family: 'Café Pixel', subfamily: 'Regular', copyright: 'Copyright (c) pixelPep', version: 'Version 2.001', timestamp: 1760000000 }
  },
  {
    name: 'no-aliases', settings: { name: 'NoAlias', cell_w: 8, cell_h: 8, baseline: 2, x_height: 4, cap_height: 6 },
    glyphs: [g(0x20, null, 3), g(0x27, QUOTE, 2), g(0x2D, DASH, 5), g(0x41, H, 6)],
    options: { family: 'Plain Test', timestamp: 1760000000, aliases: false }
  },
  {
    name: 'long-loca', settings: { name: 'Big', cell_w: 16, cell_h: 16, baseline: 3 },
    glyphs: big,
    options: { family: 'Big Test', timestamp: 1760000000 }
  }
];
writeFileSync(join(dir, 'cases.json'), JSON.stringify({ cases }, null, 1) + '\n');
console.log('Wrote', cases.length, 'cases');
