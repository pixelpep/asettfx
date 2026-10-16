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
| ghost character | `#B4B4B4`, rendered with a system font (`guide.hintFont`) at 8x, then thresholded to 1-bit pixels so there is no antialiasing |
| baseline tick | `#9CC3E6`, one pixel at the left and right edge of the cell, on the last row above the baseline (row `cell.h - baseline - 1`) |
| unassigned cell | `#D2D2D2`, flat, no ghost |
| blank-cell marker (space, control codes) | `#B4B4B4` dotted bar near the bottom of the cell |

In `var` mode the ghost is left-aligned, one pixel from the left edge, so that its natural width shows where the magenta starts. In `mono` mode it is centered.

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
