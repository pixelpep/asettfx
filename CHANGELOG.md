# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/) once a first release exists.

## [Unreleased]

### Added

- **An editor in the page** (milestones 1 to 3 of 6 of `docs/EDITOR.md`): draw the glyphs in Digiface Matrix instead of only downloading a template.
  - **Edit** (the first button of the toolbar) folds the three settings cards and adds the tools; *Done*, Escape or the button again brings the settings back as they were. The preview of the page is the same component before, during and after the editing, with the same header (zoom, **Fit**, *Visual guides*, full screen), so what is drawn stays in view.
  - **Tools**: Hand (H, or hold Space), Brush (B) and Eraser (E) of 1, 2, 3 or 4 pixels (keys 1 to 4, `[` and `]`), X to switch between them, Shift and click for a line from the last pixel, *Stay in cell* (a stroke does not spill into the next cell), and the **Width** tool (W). The brush and the eraser show one square of their size with the colors inverted under it. The unused cells cannot be drawn on. Undo and redo (Cmd or Ctrl+Z, Cmd or Ctrl+Shift+Z, Ctrl+Y) cover pixels and widths in the same gesture.
  - **Colors by mode**: black in a normal font, the four shades of GB Studio in GB Studio mode, shown on one row.
  - **Width** (variable fonts only): a click in a cell sets the width of its glyph, the marker starting at the nearest border between two columns, so the whole range is available and the whole cell clears the marker; a glyph keeps one column; dragging follows the pointer. A line on the border and a badge with the new width show on the canvas, over the pink.
  - **View**: zoom (buttons, + and -, Cmd or Ctrl and the wheel, trackpad pinch), **Fit** enlarges the whole sheet to the window and keeps doing so when the window changes size until the view is moved by hand, hand tool, middle button and two-finger scroll, a status bar naming the cell under the pointer. **Visual guides** (guide characters, checkerboard, baseline ticks and the limits of the cells) in the header; **Zoom on cell**, where a click in a cell first fits the view on it without drawing.
  - **Hidden drawing**: a cell with drawing under its width marker is framed in yellow, and the download window says so.
  - **The drawing follows its characters** when the layout changes (`model.impact`, `model.relayout`), so a layout that is changed while the editor is stopped, or GB Studio ticked from inside the editor, keeps the glyphs: the page asks before it loses something (another cell size, characters outside the new set, GB Studio's two light shades going back to black while the two dark ones become black). The drawing is kept while the page stays open, and a layout change shows a blank sheet until it comes back.
  - `web/src/editor/` (`view.js`, `model.js`, `tools.js`, `history.js`, `export.js`, `ui.js`) is pure code with tests apart from `ui.js`, and the screen was driven in Chrome with real events.
- **Two downloads**: **Template** (the grid to draw on, as before) and **Drawing** (what is drawn, without any guide, with the `digiface` metadata so that the Aseprite extension finds its settings; in GB Studio mode an indexed PNG with GB Studio's palette). A window asks for the **name of the font** (the field of the toolbar is gone), with the last name in it, and **explains the download**: what it is, what it holds, what it is for.
- **GB Studio mode** (a check box of the toolbar, and part of the editor): the GB Studio layout, 8 x 8 cells and 16 columns are fixed (and the cell size buttons), the checkerboard and the baseline ticks are off and disabled, the GB Studio Variable guide font is chosen (also when the GB Studio layout is chosen in the list), and unticking brings the previous settings back. The choice is stored as `target: "gbstudio"` in the metadata, a new optional key validated by both readers (8 x 8 cells, 16 columns, at most 15 rows) and by shared conformance cases.
  - The template and the drawing are **indexed PNGs** like GB Studio's own font sheets: palest color first (the background), darkest second (the characters), then the magenta and the two middle shades. Checked with GB Studio's own pixel rule (its `fontData.ts`) and in Aseprite, template visible or hidden; a hidden layer is written with the background color, not black. `png.encode` takes a `palette` option for it. `spec/GRID.md` describes how GB Studio reads a font image.
  - The drawing window offers the **`.json`** of GB Studio (ticked) and saves it with the image: a `mapping` of the 27 characters of the Windows-1252 block 0x80-0x9F (euro sign, curly quotes, ellipsis, oe...) to their cell, which GB Studio needs only for those characters. A test ports GB Studio's `encodeString` to check that each lands on its cell.
  - The Aseprite extension counts the palette of a GB Studio template as pure colors (no *impure pixels* warning on a drawing made with it) and its guide greens as guide colors.
- The **help** has a **Shortcuts** tab; the labels of the tools carry their key (*Brush (B)*).
- **New look**: the neon terminal design system (black, phosphor green, glows, square corners, one color per zone), dark only. The page is set in Source Sans 3 by Adobe (SIL OFL 1.1), included unchanged in `web/fonts/ui/` with its license and credited in `NOTICE`; nothing is requested from Google Fonts.
- A **"Made by pixelPep"** line at the bottom of the page.

### Changed

- The README and the help window present Digiface for games (GB Studio) and for design work, without naming a design tool, and say that it is not affiliated with Aseprite or GB Studio.
- The toolbar buttons are **Template** and **Drawing**; in *Spacing* the check box reads **Monospace**.
- The "Source code" zip that GitHub makes for a release leaves out `tests/`, `tools/` and the project notes (`.gitattributes`); they stay in the repository.

## [0.2.0] - 2026-10-21

First published version under the name Digiface (the earlier 0.1.0, published as ASETTFX, was withdrawn: nobody used it, and its internal names changed). It includes everything of 0.1.0 below.

### Changed

- Left padding, Bottom margin and Baseline sit side by side on one line, with shorter labels; the variable spacing note is removed (the help popup explains the magenta).
- The project is renamed from ASETTFX to **Digiface**: the template generator is **Digiface Matrix** and the extension is **Digiface for Aseprite** (menu *File > Scripts > Digiface*). The rename covers the internal names too, since nobody used them yet: the PNG chunk keyword and the sprite property are `digiface`, the sidecar file is `<name>.digiface.json`, the Lua modules are in `digiface/`, the extension file is `digiface-<version>.aseprite-extension`. Templates and sprites made with the old name are not read. The fonts written by the exporter and the bundled GB Studio fonts carry "Digiface" in their unique identifier.

### Added

- A "?" button at the top right of the template generator opens a popup with the steps to follow and a link to the Aseprite extension.

- Two more bundled pixel fonts: GB Studio Mono and GB Studio Variable, the default fonts of GB Studio (Chris Maltby, MIT License), made from the PNG files of the GB Studio repository by this project's exporter (`sh tools/make-gbs-fonts.sh`, reproducible); the sources and the license text are in `web/fonts/source/` and `web/fonts/licenses/`.
- Eight pixel fonts shipped with the template generator, chosen from the font list: Bytesized (Baltdev, SIL OFL 1.1), Alkhemikal, Digital Disco, Digital Disco Thin, Grape Soda, Kiwi Soda (jeti, CC BY 4.0) and Minecraft Standard, Minecraft Standard Bold (Polda18, CC0). They are included unchanged in `web/fonts/original/`, credited in `web/fonts/LICENSES.md`, `NOTICE` and the README, and loaded only when chosen. Only fonts with a license that allows redistribution are bundled; others can be used with *Pixel font from a file...*. `npm run gen:fonts` rebuilds the font data; a test keeps it in sync.

- *Pixel font from a file...* in the template generator: choose a `.ttf` or `.otf` on your computer. The generator detects whether it is a pixel font and at which size one font pixel is one pixel, draws the ghost characters at that size (identical to the font's outlines, pixel for pixel; checked on 10 fonts and 920 characters), and offers a button that sets the cell size and baseline the font needs. The font file stays in the browser.

### Changed

- *Bottom margin of the characters* and *Baseline: rows below the letters* are now in *Spacing*, next to the left padding; the line that explained monospace is gone.

- The zoom buttons - and + are now first on the left of the line above the image.
- What is known about a pixel font (its size, the cells it needs, how many characters have no shape in it, its credit and license) is no longer written under the font list: a square *i* button to the right of the list opens it in a window. The two buttons that size the cell stay under the list, with the size in their label. A file that is not a font now keeps its error message on screen.

- *Use this font's cell size* now stands the letters of a pixel font on the baseline and keeps at least one row below it: for Bytesized, whose letters all hang one row below the font's own baseline, it gives 4 x 5 with a baseline of 1 and a bottom margin of 1 (it also sets the bottom margin, and Kiwi Soda gets the same treatment). When the characters of the chosen set need more room (accents and cedillas: 4 x 8 for Bytesized in Latin-1 or Latin Extended-A), a second button, *Make room for the accents too*, applies that size, and the description of the font gives both. Characters the font does not have are left out of the measure and their number is shown. Checked against the outlines of the eight bundled fonts for four character sets.

- A *Bottom margin of the characters* setting in *Guide* raises (or, negative, lowers) the ghost characters above the baseline, without moving the baseline itself (which also sets the descent of the font). It is recorded as `guide.marginBottom`. The *Use this font's cell size* button resets it to 0.
- The *Grid lines in preview* option is gone: the preview shows exactly the pixels of the PNG.

- The *Extra spacing* field is gone from the template generator: it only wrote a number into the metadata, so the template looked the same whatever it held. Extra spacing still exists where it acts, in the *Settings...* form of the Aseprite export, and adds that many pixels to the width of every character.

- Template generator layout: the settings (*Guide*, *Cells*, *Spacing*) are cards side by side (as many per row as fit) and each can be collapsed. The character set list is at the top of *Guide* (its custom entry opens under it), the number of columns is in *Cells* and the left padding in *Spacing*. Under the cards, one line right above the image has *Checkerboard*, *Baseline ticks* and the square zoom buttons - and + on the left, and on the right the font name, the saved file name followed by the image size, and *Download PNG*. Below it the image has the whole width; the metadata stored in the PNG are folded by default, and opened they sit to the right of the image, which then takes two thirds of the width (they stack on a narrow window). The preview starts at zoom 4, with - and + buttons for the zoom (steps 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32).
- Spacing is variable by default, with the magenta pre-filled; a single *Force monospace* check box replaces the mode list. The *Width from* list is gone: the generator only offers magenta widths, as the Aseprite dialogs do. The options of *Show the character in each cell* (font, padding, pre-fill) fold away when it is off.

- The hint font list is now Arial, Times New Roman and the pixel font file (it had Menlo, Verdana, Helvetica, Georgia, Courier and a free font name). Arial is the default.

- The baseline ticks of the template are drawn under the ghost character, so a pixel of the character is never hidden by a tick (in a 4 x 4 cell the ticks are a large share of the pixels).
- The ghost characters of the template are always at the left of their cell, in monospace as well (they were centered), instead of centered or one pixel in. A new *Left padding (px)* setting (0 by default, recorded as `guide.padding` in the metadata) sets the distance between the left edge of the cell and the left edge of the drawn character; the placement ignores the side bearing of the hint font, so the ink really starts at that padding.
- The template generator shows, right after the font name field, the file name the template will be saved under, for example `→ my-pixel-font-8x8-template.png`. Accents are removed from it (`Café` becomes `cafe`).

### Fixed

- The *GB Studio layout* character set followed Latin-1, but the grid of GB Studio's own fonts (`gbs-mono.png`, `gbs-var.png`) follows Windows-1252: where Latin-1 has control characters (positions 0x80 to 0x9F), GB Studio draws the euro sign, the typographic quotes, the ellipsis, the dashes, the trademark sign, `Œ œ Š š Ž ž Ÿ ƒ ˆ ˜ † ‡ ‰ ‹ ›` and so on, and 11 cells are unused (0x7F, 0x81, 0x8D, 0x8F, 0x90, 0x9D, 0xA0, 0xAD, 0xBC, 0xBD, 0xBE). The preset now maps those 213 characters and leaves the 11 cells unassigned; a test checks it against the Windows-1252 table. The generator counts "213 characters and 11 unused cells" instead of 224 characters.

- The Lua reader turned `1.5` into `1` (Aseprite's `math.tointeger` truncates), so a fractional cell width or baseline in the settings was accepted. Fractional numbers are now kept and rejected; the shared conformance cases cover it.
- A font name with accents or other non-ASCII characters was refused by the generator (the download button was disabled with a cryptic message) and by the metadata validators. It is accepted now, up to 64 characters, stored with `\u` escapes so the PNG chunk stays ASCII, and read back correctly by the Aseprite extension.

## [0.1.0] - 2026-10-16

First version, published as ASETTFX and withdrawn on 2026-10-21 (no tag any more).

### Added

- Template generator (`web/`): open `web/index.html`. Character presets or custom sets, cell size, baseline, monospace or variable-space mode, checkerboard, ghost characters, baseline ticks, preview with grid lines, PNG download with the `digiface` metadata chunk. The hint font is chosen from a list (automatic: Menlo for monospace, Verdana left-aligned for variable space; sans-serif, serif and typewriter choices; custom name allowed). In variable mode the template can pre-fill the magenta width columns from the hint font.
- Aseprite extension (`aseprite-extension/`): menu *File > Scripts > Digiface* with *Export as TTF...* (checks listed, family name, copyright, version, file chooser, *Settings...* to edit the grid) and *Set grid from template settings*. When the PNG has no settings, a form asks for the grid.
- Reading: PNG metadata reader with CRC check, settings found in the PNG, the sprite properties or a sidecar file `<name>.digiface.json`, flattening of the visible layers over white (hidden layers and groups are not read), cell and width analysis, and the export checks of `spec/CHECKS.md` (errors block the export, warnings and notes are listed).
- TrueType export in pure Lua (`outline.lua`, `ttf.lua`, `export.lua`, rules in `spec/TTF.md`): crisp pixel outlines at 64 units per pixel, with the `OS/2`, `cmap` (formats 4 and 12), `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name` and `post` tables.
- `spec/`: metadata JSON Schema v1, grid and pixel rules (`GRID.md`), embedding and resolution rules (`METADATA.md`), export checks (`CHECKS.md`), font output (`TTF.md`), charset presets, examples, and conformance cases shared by the JavaScript and Lua code.
- Command-line tools: `tools/inspect.sh` (what the exporter reads from a file), `tools/export.sh`, `tools/make-sample.sh` (an A to Z example font), `tools/validate_ttf.py` (independent check with fontTools), `tools/pack.sh` (`dist/digiface-0.1.0.aseprite-extension`), `tools/install-dev.sh`, `tools/check-package.sh`.
- Tests: `npm test` (47 tests) and `npm run test:aseprite` (106 tests run inside Aseprite's batch mode; the dialogs are tested with a stand-in for `Dialog`, since batch mode has no UI).
- Project documentation: `README.md`, `docs/PROGRESS.md`; Apache-2.0 `LICENSE` and `NOTICE` (copyright pixelPep inc., based on the code of [ase2ttf](https://github.com/nuskey8/ase2ttf)).

### Changed after the first trial in Aseprite

- The spacing is chosen at the top of the export dialog and follows the image: magenta found means variable spacing, none means monospace; monospace can be chosen anyway and the magenta is then ignored. The Settings form no longer asks for it.
- Warnings name the characters with their row and column in the grid, for example `U+005F "_" (row 4, column 16)`.
- The template shows a ghost for every printable character, including thin ones such as the underscore.
- Typographic quotes, dashes and the no-break space reuse the plain glyphs when they are not drawn (check box *Typography*, on by default).
- Fewer file permission prompts: the sprite's own settings are read first, and a sidecar file is only opened when it exists.

### Known limits

- No kerning, no hinting. Characters that were not drawn are left out of the font.
- Tried in Aseprite 1.3.16 on macOS only. Other versions and systems have not been tested.

[Unreleased]: https://github.com/pixelpep/digiface/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pixelpep/digiface/releases/tag/v0.2.0
