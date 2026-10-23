# Grid, pixel and metric rules (v1)

This document is the contract between the template generator and the Aseprite exporter.
Metadata fields are defined in [metadata.schema.json](metadata.schema.json), embedding in [METADATA.md](METADATA.md).

## 1. Geometry

- The image is `cols * cell.w` pixels wide and `rows * cell.h` pixels high, with no gutter between cells. Cell sizes that are multiples of 8 are recommended, not required.
- Cell `(c, r)` covers `x in [c*w, (c+1)*w)` and `y in [r*h, (r+1)*h)`, with `(0,0)` at the top left.
- Cells are read in reading order: index `i = r*cols + c`.

## 2. Character mapping

`map` is an ordered list of tokens. Expanding it gives one entry per cell, starting at index 0:

| Token | Meaning |
|---|---|
| `0041` | one code point (U+0041) |
| `0020-007E` | inclusive range, one cell per code point |
| `_` | one unassigned cell |

- Hex is case-insensitive, 4 to 6 digits, and the value must be at most U+10FFFF and not a surrogate (U+D800-U+DFFF).
- The expanded length must not exceed `cols * rows`. Cells after the last entry are unassigned.
- A code point appears at most once. Unassigned cells are ignored by the exporter.
- Charset presets live in [charsets/](charsets/). A preset gives `map` and a suggested `cols`; the generator computes `rows = ceil(count / cols)`.

## 3. How the exporter reads pixels

The exporter reads what the user sees. The user hides the template layer (and any other guide) in Aseprite; every **visible** layer is flattened over a **white** background. A white background layer or a transparent one gives the same result. There is no special layer name or marker.

For each flattened pixel:

| Pixel | Class |
|---|---|
| exactly `FF00FF` | marker |
| luminance `0.299 R + 0.587 G + 0.114 B` below 128 (`ink = dark`, the default) | ink |
| otherwise | background |

The luminance is computed in integers (`299 R + 587 G + 114 B` below `128000`) so that a mid grey `#808080` is exactly 128 and is background. With `ink = light` the test is inverted: luminance at or above 128 is ink. It exists for images drawn light on dark, such as the GB Studio reference fonts, whose flattened background is not white.

Compositing a semi-transparent pixel over white is part of flattening, so a transparent layer needs no special case. White drawn on top of black erases it.

**Warnings, not errors.** A flattened pixel that is not exactly pure black, pure white or pure magenta is counted. The export dialog shows the count (for example "12 pixels are not pure black, white or magenta and were thresholded") and still exports. Antialiasing is the typical cause. This is one of the checks listed in [CHECKS.md](CHECKS.md), which also covers wrong image size, empty characters and partial magenta columns.

**Guide colors and the threshold.** Every guide color of the template has a luminance well above 128 (the darkest, `#B4B4B4`, is 180), so a guide left visible by mistake is read as background. A guide left visible would also leave its pre-filled magenta in place, which then counts as markers.

## 4. Advance and left edge

**Which spacing applies.** At export the spacing follows what is drawn, not what the template said. If the image holds magenta in the cells of the grid, the spacing is `var` with `widthSource = magenta`. If it holds none, the spacing is `mono`, and variable spacing is not offered. When magenta is present the user may still choose `mono`; the magenta is then read as empty background. The `mode` and `widthSource` in the metadata only describe how the template was made; `widthSource = auto` is not offered by the Aseprite dialogs.

A column of a cell is a *marker column* when every pixel of that column is a marker.
A column that mixes marker and non-marker pixels is not a marker column, and the exporter warns.

**`mono`**: advance = `cell.w` for every glyph. Markers are ignored.

**`var`, `widthSource = magenta`** (default):

1. `L` = number of leading marker columns of the cell.
2. `R` = index of the first marker column at or after `L`, or `cell.w` if there is none.
3. Advance = `(R - L) + metrics.spacing`. The glyph origin is column `L`, so pixels at column `x` land at font-unit position `(x - L) * 64`.
4. Ink at or beyond column `R` is outside the width: the exporter warns and clips it.
5. A cell with no marker column keeps the full width: advance = `cell.w + spacing`.
6. A cell made only of marker columns has advance 0 plus spacing.

This matches the reference grids, where the space is 4 columns of background followed by 4 marker columns.

**`var`, `widthSource = auto`**: markers are ignored. Advance = `maxInkX + 1 + spacing` where `maxInkX` is the right-most ink column, so left bearing is kept and only the right side is trimmed. An empty cell gets `ceil(cell.w / 2) + spacing`. *Provisional: to validate visually on a sample font.*

## 5. Font metrics

One pixel is 64 font units.

| Value | Formula |
|---|---|
| unitsPerEm | `cell.h * 64` |
| ascender (hhea, OS/2 typo and win) | `(cell.h - baseline) * 64`; `baseline` must be smaller than `cell.h` |
| descender | `-baseline * 64` |
| line gap | 0 |
| glyph y | `(cell.h - y_pixel - baseline) * 64`, y_pixel counted from the top of the cell |
| sxHeight, sCapHeight | `xHeight * 64`, `capHeight * 64` when given, otherwise measured from glyphs `x` and `H` if mapped, otherwise 0 |

The font renders sharpest at sizes that are multiples of `cell.h` pixels.

## 6. Guide template look (informative)

The template PNG is only a guide, meant to be hidden before export. Suggested colors, all with luminance above 160:

| Element | Color |
|---|---|
| cell A / cell B (checkerboard) | `#F4F4F4` / `#E8E8E8` |
| ghost character | `#B4B4B4`, rendered with the hint font (`guide.hintFont`) at 8x, then thresholded to 1-bit pixels so there is no antialiasing; Arial and Times New Roman are fitted to the cell, a pixel font (from a file or bundled) is drawn at its own size (6.3) |
| baseline tick | `#9CC3E6`, one pixel at the left and right edge of the cell, on the last row above the baseline (row `cell.h - baseline - 1`); drawn under the ghost character, so a ghost pixel is never hidden by a tick |
| unassigned cell | `#D2D2D2`, flat, no ghost |
| blank-cell marker (space, control codes) | `#B4B4B4` dotted bar near the bottom of the cell |

The ghost is always left-aligned: the left edge of its ink is `guide.padding` pixels from the left edge of the cell (0 by default), whatever the side bearing of the hint font. Pixel fonts keep their glyphs at the left of the cell, and in `var` mode the natural width of the ghost shows where the magenta starts.

The ghost stands on the baseline row, raised by `guide.marginBottom` pixels (0 by default; negative lowers it). This moves the drawing guide only: the baseline ticks, `metrics.baseline` and the font metrics stay where they are.

Grid lines are not drawn in pixels. The extension sets Aseprite's grid to `cell.w x cell.h`.

### 6.1 Pre-filled widths

In `var` mode with `widthSource = magenta` and `guide.hint = ghost`, the generator can pre-fill the widths (`guide.prefill = true`). It draws `#FF00FF` over the full height of the columns at the right of each assigned cell:

- for a character with a shape: width = right-most ghost ink column + 2 (one pixel of space), capped at `cell.w`;
- for a blank character (space, no-break space, control and format characters): width = the advance of a space in the hint font, rounded, between 1 and `cell.w`;
- no magenta when the width equals `cell.w`, or when the ghost has no ink (font without that character);
- the magenta is drawn last, over ticks and markers, so that marker columns are complete.

These widths are a starting point taken from a system font. The user adjusts them and copies them onto a visible layer (6.2).

### 6.2 Using the pre-filled magenta

The user hides the template layer before exporting, which also hides its magenta. To keep the pre-filled widths, the user copies the magenta onto a visible layer (for example with *Select → Color Range* on the template, then copy and paste into the drawing layer) and adjusts it. This is deliberately left to the user: nothing in the extension moves or edits layers.

### 6.3 Pixel fonts

A pixel font, loaded from a file or one of the bundled fonts, is drawn with its own pixels, so each pixel of the font is exactly one pixel of the template. The generator finds the font's pixel size by drawing probe characters at 512 px and fitting the lengths of the ink runs and of the gaps between them to a grid; it keeps the coarsest grid that fits for at least 40 % of the characters (the others may be missing from the font). The font size at which one font pixel is one screen pixel, `em`, follows from it (whole pixels when within 0.4 %). A font with no such grid is not a pixel font, and is fitted to the cell like Arial.

The font is then drawn at exactly `em` pixels, with the baseline on a pixel boundary and the left edge of its ink at the padding, so the result has no antialiasing to threshold: every character equals the outline sampled at the centre of each pixel (checked on 10 fonts, 920 characters, identical).

The cell the font needs is suggested, never forced, in two sizes:

- **The letters** (the plain ASCII characters of the font): the letters are made to stand on the baseline. Some fonts draw all their letters below their own baseline (Bytesized: from one row below it to three above); the suggestion raises the characters by that many rows, `guide.marginBottom`, found as the median hang of `H E I L T x z`. The cell then has the ink rows above the baseline, plus `baseline` rows below it, where `baseline` is the ink that remains below it, and **at least one row**, room for a descender. Width = the widest advance (ignoring a character more than 2.5 times wider than the median). Bytesized: 4 x 5, baseline 1, bottom margin 1.
- **The letters and the accents** of the chosen character set, when that needs more: accents and cedillas can reach much further than letters (Bytesized needs 4 x 8, baseline 2, for Latin-1 or Latin Extended-A). A second button applies it.

A character the font cannot draw is drawn by another font (or as a box), so it is told apart by drawing it with and without the font, and against the font's own missing-character box, and is left out of the measure; the number of characters left out is shown. A character that the font draws by combining a letter and an accent it has (Bytesized has no precomposed Ĉ, but draws it) counts as drawn. Both sizes are checked against the outlines of the bundled fonts.

The font file stays in the browser: nothing is uploaded or stored, and the metadata only records its name (`guide.hintFont`, `File: <file name>`).

## GB Studio templates

When the metadata have `"target": "gbstudio"` the grid is the one of GB Studio's own font sheets: 8 x 8 cells, 16 columns, at most 15 rows (below 16 rows GB Studio starts its table at character code 32, so the first cell is the space), characters in the order of the `gbstudio` charset (see `charsets/gbstudio.json`).

GB Studio reads a font image by the green channel of each pixel (`src/lib/fonts/fontData.ts` of GB Studio): below 65 is its darkest shade (the ink, `#071821` in its sheets), 65 to 129 and 130 to 204 are two middle shades (`#306850`, `#86C06C`), 205 to 249 is its lightest opaque shade (the background, `#E0F8CF`). A green above 249, or red and blue both above 249 (pure white, magenta), is transparent: the transparent columns are trimmed on both sides of each cell, which gives the width of a variable-width font. The transparency (alpha) of a pixel is ignored.

So the template of a GB Studio font has a solid `#E0F8CF` background (no checkerboard), the unassigned cells, the ghost characters and the baseline ticks in light greens whose green channel stays between 205 and 249 (GB Studio reads them as background, even if the template layer is left visible), and magenta `#FF00FF` for the width columns, as in the other templates. A white background must not be used: GB Studio would read it as transparent.

