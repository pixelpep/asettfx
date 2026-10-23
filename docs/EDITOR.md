# Digiface Matrix editor: design and plan

Status: planned, nothing is written yet. Last updated: 2026-10-23.

The idea: draw the glyphs in the browser, on the template, with a few tools, instead of only downloading a template to draw in Aseprite. This file records what was decided, how it is built, and in which order.

## 1. Decisions so far

| Question | Decision |
|---|---|
| What is "normal mode"? | Monospace: pure black only, no width layer. |
| Selection tool | A rectangle first. The lasso comes later, if the need is confirmed. |
| Changing the grid after drawing | The grid is locked inside the editor for now (go back to the settings, with a confirmation that the drawing is erased). The model is built so that this limit can be lifted later (see section 2). |
| What the first version exports | Two PNGs (for Aseprite, for GB Studio with its `.json`). A TrueType font comes later, and an OpenType one with it (section 9). |
| Name of the layers in the interface | English: Width, Writing, Template, Background. |

## 2. Model: glyphs, not a grid

The drawing is stored **per character** (per code point), not per position in the grid. The grid is a view of these glyphs.

- Each glyph holds its pixels (a `cellW x cellH` array of palette indexes, 0 meaning empty) and, in variable mode, its width (the number of columns of the cell that are not width marker).
- Changing the number of columns or the character set, or adding or removing a character, then moves the drawings with their characters: nothing is lost or shifted.
- Changing the **cell size** needs a rule (where the old drawing is anchored, what is cut and warned about). It is not part of the first version.
- The history of the editor (undo and redo) records the changes of a glyph, not whole images.

## 3. Layers (from top to bottom)

1. **Width** (variable mode only): the width marker of each cell. It is not a bitmap but one number per cell, drawn as magenta columns on the right of the cell, over its whole height, so that the rule "right side, full height" cannot be broken. It hides the writing under it.
2. **Writing**: the pixels drawn by the user. All the tools act on this layer (and the width tool on the width layer).
3. **Template**: the guide characters in the hint font.
4. **Background**: white, or the palest color of GB Studio in GB Studio mode, with the checkerboard and the baseline ticks when they are ticked.

Each layer has an eye to show or hide it.

## 4. Palettes by mode

| Mode | Writing layer | Width layer |
|---|---|---|
| Monospace | pure black only | none |
| Variable | pure black only | magenta, from the pointer column to the right edge of the cell |
| GB Studio (monospace or variable) | the 4 colors of GB Studio's palette | magenta, if variable |

With the magenta chosen in the palette, the brush sets the start of the marker at the clicked column (everything on its right becomes magenta, dragging moves it), and the eraser clears the marker of the cell. Only assigned cells can be edited: the unused cells (the 11 hatched cells of the GB Studio layout, the empty cells at the end of the grid) are not.

## 5. Tools

- **Hand** (H): moves the view. Also active while the space bar is held, and the previous tool comes back on release. The middle mouse button and the two-finger scroll of a trackpad also move the view. Not in the history (the position and the zoom belong to the view, not to the drawing). The space bar stays a space in a text field, and a hand that was left on when the window lost the focus is released.
- **Brush** (B) and **Eraser** (E): a square of 1 to 16 pixels, with the pixels between two pointer events filled in so that a fast stroke has no gaps. An option, on by default, keeps a stroke inside the cell where it started.
- **Rectangle selection** (M): move the pixels with the mouse, nudge them with the arrow keys, cut, copy, paste and delete, with the keyboard and with buttons. A pasted selection floats: it can be moved with the mouse until it is validated (click outside, Enter) or cancelled (Escape). The clipboard is internal to the application. The selection acts on the writing layer.
- **Zoom**: wheel with Cmd or Ctrl, pinch, buttons, 0 for "fit", 1 for the real size, centered on the pointer.
- **Undo and redo**: Cmd+Z and Cmd+Shift+Z, for strokes, cuts, pastes, moves and widths.

## 6. Screen

A full screen mode opened by an **Edit** button (the Fullscreen API, with an overlay of the page as a fallback):

- top bar: undo, redo, zoom, fit, export, close;
- toolbox on the left: hand, brush, eraser, selection, size, palette;
- right panel: the layers and, for the cell under the pointer, its character, its code point (`U+0041`) and its width;
- status bar: position and cell.

The look follows the neon design system of the page. The interface will be adjusted while the editing is tried.

## 7. Export and warnings

- **Download PNG (drawing)**: the writing and the width layers flattened over the background, with the `digiface` metadata chunk, so that the Aseprite extension recognizes the settings: black on white and magenta in the normal modes, an indexed image with GB Studio's palette in GB Studio mode, with the **GB Studio .json** as now.
- A panel lists the warnings before the export, with the cells named as in the extension (`U+0041 "A" (row 3, column 2)`), and the export stays possible:
  - writing under the width layer (it is hidden by it, so lost in the export);
  - characters with nothing drawn;
  - GB Studio: pixels of the Light shade are background for the TrueType export, as the Mid shade is ink.

## 8. Saving

- First version: the drawing is saved automatically in the browser (it stays on the computer of the user and is never sent anywhere).
- Next: a project file to download and open, and the import of a PNG drawn in Aseprite (the ink goes to the writing layer, the magenta to the width layer), to retouch it.

## 9. Later

- **TrueType export** from the page: the writer of the Aseprite extension (`outline.lua`, `ttf.lua`, `export.lua`, rules in `spec/TTF.md`) ported to JavaScript, with the checks of `spec/CHECKS.md`, kept in agreement with the Lua code by shared test fixtures.
- **OpenType**: the same file with TrueType outlines is accepted by the applications under the `.otf` extension. A CFF flavored OpenType font needs a second writer (a `CFF` table and charstrings): possible, as the outlines are rectilinear, but separate.
- Lasso selection, lines, rectangles and flood fill, flips, copying a glyph to another cell, a live text preview with the drawn glyphs and their advances, onion skin of the neighbor glyph, changing the cell size without losing the drawing, kerning, pen pressure.

## 10. Milestones of the first version

Each one is tried by the maintainer before the next one starts, on a `editor` branch.

1. Full screen shell, rendering of the layers, zoom and hand.
2. Brush, eraser, palettes, undo and redo.
3. Width layer and the three modes.
4. Selection and clipboard.
5. Warnings, PNG export (and the GB Studio `.json`), automatic saving.
6. Shortcuts, status bar, adjustments of the interface.

## 11. How it is tested

- The model (glyphs, layout, width layer, history, tool algorithms, composition, warnings) and the export are pure modules, tested with `node --test`.
- The exported PNG is read back with the pixel rule of GB Studio (as for the templates) and by the Aseprite extension in batch mode (the settings are recognized, the glyph widths are the expected ones).
- The screens are checked in headless Chrome: layout, tool switching, the space bar and the hand, undo, export.
