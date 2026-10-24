# Digiface Matrix editor: design and state

Status: milestones 1 to 4 of 6 are written: the editor in the page, the brush, the eraser, the width tool, the downloads (tried and adjusted three times), and the rectangle selection with its clipboard (milestone 4, not tried by hand yet). Next: automatic saving (milestone 5). Last updated: 2026-10-23.

The idea: draw the glyphs in the browser, on the template, with a few tools, instead of only downloading a template to draw in Aseprite. This file records what was decided, how it works, and what is left.

## 1. Decisions

| Question | Decision |
|---|---|
| What is "normal mode"? | Monospace: pure black only, no width layer. |
| Window or page? | In the page: the preview and the editor are one component (same header, same zoom); editing adds the tools and folds the settings. A full screen button gives it the whole screen. |
| Selection tool | A rectangle, on the writing layer only. The lasso comes later, if the need is confirmed. |
| Width | A tool of its own, not a mode of the brush and the eraser, with its value shown on the canvas. |
| Cell grid | Part of the visual guides (check box in the header). |
| GB Studio from inside the editor | Yes: the drawing follows (section 6). |
| Changing the grid while editing | Free, except *Pre-fill the magenta*. The drawing follows its characters; a smaller cell, a shorter set or fewer columns ask first (section 3). |
| What the editor downloads | **Template** and **Drawing** as PNGs, the drawing with its GB Studio `.json` in GB Studio mode. A TrueType font comes later, and an OpenType one with it (section 9). |
| Name of the font | Asked in a window when something is downloaded, with an explanation of that download. |
| Warnings panel | None: a yellow frame in the editor and a note in the window of the download. |
| Names in the interface | English: Width, Writing, Template, Background. |

## 2. Model: glyphs, not a grid

The drawing is stored **per character** (per code point), not per position in the grid. The grid is a view of these glyphs (`web/src/editor/model.js`).

- Each glyph holds its pixels (a `cellW x cellH` array of palette indexes, 0 meaning empty) and, in a variable font, its width (the number of columns of the cell that are not width marker).
- A change of the layout moves the drawings with their characters (`model.relayout`): changing the columns or the character set, or ticking GB Studio, loses nothing as long as the cell keeps its size and the characters are still in the layout. `model.impact` says before what would be lost.
- A change of the **cell size** keeps the left and the bottom edges of each glyph: a bigger cell adds blank pixels on the right and on top, a smaller one cuts from the right and from the top, after a question.
- Undo and redo record the changes of pixels and widths, not whole images (`history.js`).

## 3. Layers, from top to bottom

1. **Width** (variable fonts only): the width marker of each cell. It is not a bitmap but one number per cell, drawn as magenta columns on the right of the cell, over its whole height, so that the rule "right side, full height" cannot be broken. It hides the writing under it.
2. **Writing**: the pixels drawn by the user. The brush and the eraser act on it.
3. **Drop shadows** (GB Studio only, see section 5): not drawn by hand but derived from the writing, under it.
4. **Template**: the guide characters in the guide font.
5. **Background**: white, or the palest color of GB Studio in GB Studio mode, with the checkerboard and the baseline ticks when they are ticked.

One check box in the header, **Visual guides**, shows or hides everything that is only a help: the guide characters, the checkerboard, the baseline ticks and the limits of the cells (drawn with a difference blend, so that they show on a pale background as well as on a dark one). The writing and the width are never hidden: they are the drawing.

## 4. Colors by mode

| Mode | Writing layer | Width layer |
|---|---|---|
| Monospace | pure black only | none (no Width tool) |
| Variable | pure black only | magenta |
| GB Studio (monospace or variable) | the four shades of GB Studio's palette, on one row | magenta, if variable |

## 5. Tools and keys

- **Hand** (H): moves the view. Also while Space is held, until it is released (in the editor, whichever button was clicked last; the cursor becomes a hand once the pointer moves). The middle button and the two-finger scroll of a trackpad also move the view. It is not in the history. Space stays a space in a text field and on the controls of the page outside the editor, and a hand left on when the window loses the focus is released.
- **Brush** (B) and **Eraser** (E): a square of 1, 2, 3 or 4 pixels (four square buttons that show the size; keys 1 to 4; `[` and `]` step through them), with the pixels between two pointer events filled in. B takes the last color chosen. X switches between the brush and the eraser. Under the pointer one square of the size of the tool shows the zone that a click would touch, with the colors inverted. With Shift held, a click draws a line from the last pixel painted, with a preview. *Stay in cell* (on by default, the last option of the column) keeps a stroke in the cell where it started; the unused cells cannot be drawn on.
- **Width** (W, variable fonts only): a click in a cell sets the width of its glyph. The marker starts at the nearest border between two columns, so that the whole range can be chosen: the right half of the last column gives the whole cell, which clears the marker, and a glyph keeps one column at least. Dragging follows the pointer, even beyond the cell, the width staying in the cell where it started. A white line on that border and a badge with the new width show on the canvas, over the pink.
- **Selection** (M): a rectangle of the writing layer. Drag to select (a click that does not drag selects nothing); double-click selects a whole cell (not an unused one). Drag inside the selection, or use the arrow keys (one pixel, Shift four), to move the pixels: they are lifted off the layer and **float** over it, and are placed when something else is done (a click outside, Enter, another tool); Escape, or undo, puts them back. **Cut**, **Copy**, **Paste** and **Delete** are keys (Cmd or Ctrl+X, C, V, Delete) and buttons that show with the tool. A paste floats at the pointer (or at the center of the view) until it is placed or dropped. The clipboard is internal to the page and follows the palette (GB Studio shades become black, or the other way). Transparent pixels of what floats do not overwrite what is under them; pixels that fall in an unused cell or outside the sheet are dropped; the selection stays inside the sheet. A move or a paste is one gesture for undo and redo, and a selection put back where it was taken changes nothing. Escape goes from the float to the selection to stopping the editing.
- **Zoom**: buttons, `+` and `-`, Cmd or Ctrl and the wheel (also the pinch of a trackpad). **Fit** (0) enlarges the whole sheet to fill the window and centers it, and keeps doing so when the window changes size until the view is zoomed or moved by hand. There is no 1:1.
- **Zoom on cell** (a check box of the header, while editing): a click in a cell first fits the view on that cell, without drawing; the next clicks in it act; a click in another cell fits that one. Above 3000 % of zoom, each cell in view shows its character in its top left corner, with no margin: white on black in a square box framed by 1 pixel of the green of the page (its code, in a wider box, for a character that cannot be seen, such as a space).
- **Undo and redo**: Cmd or Ctrl+Z, Cmd or Ctrl+Shift+Z (Ctrl+Y too), and the buttons; a gesture is undone as a whole, pixels, widths and drop shadows together.
- **Delete image** (header, with undo and redo): clears every drawn pixel (the widths stay) after a warning that counts the pixels and the characters. One gesture: undo brings the drawing back.
- **Switch** (GB Studio, under the palette): a window with two palettes, "Swap" and "with". Every pixel of the first color becomes the second and the other way round, the **background color** too when it is one of the two (the downloaded drawing has it), and the **drop shadows follow** (the color to copy and the color of each one are swapped too, so a shadow keeps copying the same pixels). One gesture for undo.
- **Add shadow** (GB Studio, in the tools): opens a window with the color to copy, the color of the shadow, the thickness (1 to 4 pixels: 1 is a plain copy, more makes it thicker all around) and the offset X and Y (-4 to 4). Adding it puts a **tile** right under the button with its settings in small print; the button and the tiles are framed together, in blue; a click on the tile opens the window again, and its red trash button deletes it without a warning (undo brings it back). The shadow is a layer derived from the writing, under it: it follows what is drawn, it is cut at the edge of its cell, the writing hides it, and the oldest shadow is on top of the newer ones. **Download Drawing flattens it** into the image, over the background and under the writing and the width marker. Leaving GB Studio removes the shadows, after a question.
- Escape stops the editing. The help has a **Shortcuts** tab with all of this, and the labels of the tools carry their key (*Brush (B)*).

## 6. Screen and behavior

The preview of the page and the editor are **one component**, always there, in the place of the preview.

- **Header**: **Edit pixel font** (**Quit editing** while editing) first, then zoom out, the zoom, zoom in, **Fit**; while editing the blue **Undo** and **Redo**; **Visual guides**, and while editing **Stay in cell** and **Zoom on cell**; on the right **Delete image** (red, while editing) and full screen. The name of the application shows in full screen.
- **Edit pixel font** (in the header of the view, before the zoom) adds the tools on the left; Escape or the button again stops the editing. The *Settings* card (Guide, Cells, Spacing) folds away and can be opened again; the settings stay editable. Starting does not scroll the page. A **status bar** names the position, the cell, the character and its width.
- The drawing stays in the view when the editing stops, and **Drawing** downloads it.
- **Settings while editing**: every field can change (*Pre-fill the magenta* too: it replaces the widths of the characters with the guide font's, or with the full width when it is off, after a question that counts them; one gesture, so undo brings the widths back), and each change is applied when it is accepted (Enter or leaving the field), not on each keystroke. The drawing follows its characters: a bigger cell keeps the left and the bottom edges and adds blank pixels on the right and on top; a smaller cell cuts from the right and from the top; fewer columns re-flow the cells; a character removed from the set loses its drawing. When something would be lost the page says how much and asks; if you refuse, the field goes back. A layout change clears undo. Widths are remembered per character, so *Monospace* off and on again gives the widths back. The guide font, its padding, the baseline, the checkerboard and the baseline ticks only redraw the guides.
- **GB Studio** can be ticked from inside the editor. The layout becomes the GB Studio one and the glyphs keep their place by character. Nothing is asked when the cell is already 8 x 8 and the characters are in the GB Studio set. Otherwise the page asks first: another cell size starts the drawing again, the characters outside the GB Studio set lose their drawing, and going back from GB Studio, the darkest and the dark shade become black (what the exporter reads as ink) while the light and the palest shade are removed (what it reads as background). A layout change clears the history. In GB Studio mode *Baseline ticks* is unchecked and disabled, and the GB Studio Variable guide font is chosen (also when the GB Studio layout is chosen in the list); unticking brings the previous settings back.
- **What becomes of the drawing**: it is kept while the page stays open, even after *Done*. The same layout gives it back, undo included. When the layout changed while the editing was stopped, the view shows a blank sheet of the new layout and the drawing waits; when the editing starts, the drawings of the characters that are still there are carried over (when the cell keeps its size) and the page asks before it loses something. Automatic saving in the browser (milestone 5) will make it survive a reload.

## 7. Downloads and warnings

Two buttons of the toolbar download, **Template** and **Drawing**. Each opens a small window that **says what the download is, what it holds and what it is for**, and asks for the **name of the font** (with the last name in it), which gives the name of the file and the name the font will have.

- **Template**: the grid to draw on, with the guide characters, the baseline ticks and the settings in the PNG, to open in Aseprite. Generated again with the name that was given. In GB Studio mode an indexed PNG in GB Studio's colors.
- **Drawing**: the writing and the width layers over the background, without any guide, with the `digiface` metadata chunk so that the Aseprite extension recognizes the settings: black on white and magenta in the normal modes, an indexed PNG with GB Studio's palette in GB Studio mode (`editor/export.js`).
- **The GB Studio `.json`**: in GB Studio mode the window of the drawing offers it (ticked) and saves it with the image under the same name. GB Studio needs it only for the characters beyond the plain Latin-1 letters (the euro sign, the curly quotes, the ellipsis, oe...): typed without it they show another glyph.
- **Hidden drawing**: a cell that has drawing under its width marker (the marker hides it, so it is lost in the download) is framed in yellow in the editor, and the window of the drawing says so. The download stays possible. Later the same window can list the characters with nothing drawn, and for GB Studio the pixels of the Light shade, which the TrueType export reads as background (the Mid shade is ink).

## 8. Saving

- The drawing is kept in memory while the page is open (section 6).
- Next: automatic saving in the browser (it stays on the computer of the user and is never sent anywhere), a project file to download and open, and the import of a PNG drawn in Aseprite (the ink goes to the writing layer, the magenta to the width layer) to retouch it.

## 9. Later

- **TrueType export** from the page is done (section 10). Still to do: the full checks of `spec/CHECKS.md` in the window (for now it lists the characters without drawing and the hidden ink).
- **OpenType**: the same file with TrueType outlines is accepted by the applications under the `.otf` extension. A CFF flavored OpenType font needs a second writer (a `CFF` table and charstrings): possible, as the outlines are rectilinear, but separate.
- **Test the font**: type a text and see it set with the drawn glyphs and their widths, live, and later with the exported font loaded in the page.
- Lasso selection, rectangles and flood fill, flips, copying a glyph to another cell, onion skin of the neighbor glyph, kerning, pen pressure.

## 10. Milestones of the first version

Each one is tried by the maintainer before the next one starts, on an `editor` branch.

1. **Done.** The window, the layers, zoom and hand: `web/src/editor/` (`view.js` for the zoom and the position, `model.js` for the glyphs and the layers, `ui.js` for the screen), the template rendered as separate layers (`template.renderLayers`, `generate.layers`).
2. **Done.** Brush, eraser, colors, undo and redo: `tools.js` (strokes, the footprint of a square brush, lines between two pointer positions, staying in a cell, unused cells left alone), `history.js` (500 gestures at most), the colors by mode.
3. **Done.** The width layer and the three modes: the Width tool and its indicator, widths in the history, the cue on hidden drawing.
   Added along the way: the editor in the page and the viewer as the preview, Fit, Zoom on cell, GB Studio from inside the editor, the two downloads with their windows, the shortcuts tab.
4. **Done.** Selection and clipboard: `selection.js` (pure: the rectangle, reading, clearing, placing, lifting, floating, merging the changes of a gesture, palette conversion of a buffer), with the screen wiring in `ui.js`.
5. Automatic saving, the list of what is wrong in the download window (empty characters, GB Studio shades).
6. Adjustments of the interface.

## 11. How it is tested

- The model (glyphs, layout, relayout and impact, widths, history, tools, selection, composition, hidden drawing), the view and the export are pure modules, tested with `node --test` (`tests/web/editor-*.test.js`).
- The exported PNGs are read back with the pixel rule of GB Studio (taken from its source) and by the Aseprite extension in batch mode (the settings are recognized, the glyph widths are the expected ones).
- The screens are checked in headless Chrome with real events: view and fit, the tools and their keys, Space and the hand, the width tool and its indicator, undo, zoom on cell, the locks, the GB Studio switch and its questions, the windows and the downloads.

## 10. TrueType export from the page

The **Font (TTF)** button (next to *Drawing*, available once something is drawn) downloads the font. It asks for the name in the same window as the other downloads, which lists the characters with no drawing (left out of the font) and the drawing hidden under a width marker.

- **Writer**: `web/src/ttf.js` is a port of `aseprite-extension/digiface/outline.lua` and `ttf.lua` (outline of the pixels at 64 units per pixel, the `OS/2`, `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name` and `post` tables, the typographic aliases). `fromModel` reads the editor's glyphs the way the extension reads an image: ink is black, or the darkest and the dark shade of GB Studio; the advance of a glyph is its width plus the spacing, or the cell width in a monospace font.
- **Same bytes as the Lua writer**: `tests/fixtures/ttf/cases.json` (made by `node tools/make-ttf-cases.mjs`) holds glyphs and settings, the `*.ttf` next to it are written by the Lua writer (`sh tools/make-ttf-golden.sh`, needs Aseprite), and `tests/web/ttf.test.js` checks that the JavaScript writer gives the same bytes: monospace, variable with aliases and an astral character, without aliases, and a font large enough for a long `loca`. When the Lua writer changes, rebuild the fonts and the JavaScript one must follow.
- **In GB Studio mode** the file is available but GB Studio reads the PNG, not the TTF.
