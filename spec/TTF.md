# Font output (v1)

How the glyph analysis of [GRID.md](GRID.md) becomes a `.ttf` file. Metrics are in GRID.md section 5; this document covers the rest.

## Glyphs

| Glyph | Included when |
|---|---|
| `.notdef` (glyph 0) | always: a hollow box one pixel thick (solid if the cell is too small), `cell.w` wide |
| a mapped character with ink | always |
| a space separator without ink (U+0020, U+00A0, U+1680, U+2000 to U+200A, U+202F, U+205F, U+3000) | always, with its advance and no outline |
| any other character without ink (control and format characters, undrawn letters) | never; the export dialog already warns about empty characters (`empty-glyphs`) |

Glyphs follow code point order after `.notdef`. Cells that are unassigned, outside the image, or clipped are not glyphs.

## Outlines

- Every outline is made of straight segments with on-curve points only. One pixel is 64 font units.
- The boundary of the ink pixels is traced as closed loops. Pixels that touch only at a corner are separate shapes (4-connectivity), so a diagonal line is a chain of squares that touch at points.
- Outer contours run clockwise and holes counter-clockwise (TrueType convention, non-zero winding). Points between two collinear segments are dropped.
- The origin of a glyph is the first column of its width (GRID.md section 4), so the left side bearing equals the smallest x of its outline and `head.flags` bit 1 is set.

## Tables

`OS/2`, `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name`, `post`.

| Table | Content |
|---|---|
| `head` | `unitsPerEm = cell.h * 64`; flags `0x000B` (baseline at y=0, lsb at x=0, integer ppem); bounding box of all outlines; `lowestRecPPEM = cell.h`; short or long `loca` depending on the size of `glyf` |
| `hhea`, `hmtx` | ascender `(cell.h - baseline) * 64`, descender `-baseline * 64`, line gap 0; one full metric (advance, left side bearing) per glyph |
| `maxp` | version 1.0, no instructions |
| `OS/2` | version 4, weight 400, width class 5, `fsSelection` regular plus use-typo-metrics; typo metrics equal to hhea; win ascent and descent widened to cover the outlines; `sxHeight` and `sCapHeight` as in GRID.md section 5; first and last character from the cmap (capped at U+FFFF); Unicode ranges set for the blocks the font covers (Basic Latin, Latin-1, Latin Extended A and B, IPA, Spacing Modifiers, Combining Diacriticals, Greek, Cyrillic, General Punctuation, Currency Symbols, and Non-Plane 0); code page Latin 1 |
| `cmap` | format 4 for U+0000 to U+FFFF under (0,3) and (3,1); format 12 under (0,4) and (3,10) only when a character is above U+FFFF |
| `name` | copyright (if given), family, subfamily (default `Regular`), unique id, full name, version, PostScript name; written for Windows (UTF-16BE) and, when every string is ASCII, for Macintosh |
| `post` | format 3.0 (no glyph names); `isFixedPitch` set when every advance is equal; underline 1 pixel thick, 1 pixel below the baseline |

Tables are 4-byte aligned, checksums are computed, and `head.checkSumAdjustment` is set.

## Names

- Family: the name given in the export dialog, else `name` from the metadata, else `ASETTFX Font`.
- PostScript name: family without spaces, then `-` and the subfamily, restricted to letters, digits and hyphens, at most 63 characters.
- Version: `Version 1.000` unless given.
- Timestamps are set to the export time; tests pass a fixed time to get reproducible bytes.
