# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/) once a first release exists.

## [Unreleased]

### Added

- Editor, after trying milestone 2: the **Edit** button is the first of the toolbar (before the zoom buttons); the header of the editor reads *Digiface Matrix* then *Editor*; the brush has **four sizes** (1 to 4 pixels) as square buttons that show the size; a **semi-transparent preview** of the brush (red for the eraser) follows the pointer; **Shift** with the brush or the eraser draws a line from the last pixel painted, with a preview; **X** switches between the brush and the eraser; the *Cell grid* option is now visible on any background (it used to disappear on the pale green of GB Studio); the layer check boxes are replaced by one *Visual guides* check box (the guide characters, the checkerboard, the baseline ticks) and the writing and the width are always shown; closing the editor keeps the drawing while the page stays open (the same settings give it back, other settings ask before starting a new drawing); the left panel is wider so that the four sizes fit.
- **Editor, milestone 2** (`docs/EDITOR.md`): the **Brush** (B) and the **Eraser** (E), a square of 1 to 16 pixels (`[` and `]`), with the pixels between two pointer positions filled in, an outline of the brush under the pointer, and the option *Stay in cell* (on by default) so that a stroke does not spill into the next cell; the unused cells cannot be drawn on. The palette by mode: black, or the four shades of GB Studio. **Undo and redo** (the buttons, Cmd or Ctrl+Z, Cmd or Ctrl+Shift+Z) of whole gestures. The header of the editor keeps the name of the application. The model (glyphs, tools, history) is pure code with tests; the screen was driven in Chrome with real events.
- First part of the **editor** (milestone 1 of `docs/EDITOR.md`): an **Edit** button next to *Download PNG* opens a full window with the template as layers (width, writing, template, background, each with an eye), a cell grid option, a status bar naming the cell under the pointer, and the view: the **Hand** tool (H, or hold the space bar; the middle button and the two-finger scroll also move the view), zoom with the buttons, + and -, Cmd or Ctrl and the wheel, fit (0) and actual size (1). The drawing tools come next. The template is now rendered in layers (`template.renderLayers`, `generate.layers`); the flattened image is unchanged.

### Added

- A **GB Studio .json** button (shown in GB Studio mode) writes the file GB Studio reads next to a font image: a `mapping` of the 27 characters of the Windows-1252 block 0x80-0x9F (euro sign, curly quotes, ellipsis, oe...) to their cell, because GB Studio turns a typed character into its code point cut to one byte. A test ports GB Studio's `encodeString` to check that each of them lands on its cell. The README and the help window explain the Aseprite side.
- The template of a GB Studio font is an **indexed PNG**, like GB Studio's own font sheets: palest color first (the background), darkest second (the characters), then the magenta and the three guide greens. Opened in Aseprite it is an indexed image, so only these colors can be used, and a hidden template layer leaves the background color where it was transparent (a hidden layer of an RGB image would be exported as black, which GB Studio reads as ink). Checked end to end in Aseprite: the exported PNG read with GB Studio's own pixel rule has background, ink and transparent pixels only, with the template visible or hidden. `png.encode` takes a `palette` option for it.
- The Aseprite extension counts the palette of a GB Studio template as pure colors (no *impure pixels* warning on a drawing made with it) and its guide greens as guide colors.
- A **GB Studio** check box after *Baseline ticks* in the template generator. Ticked, it fixes the GB Studio layout, the 8 x 8 cells and the 16 columns (the controls are disabled and the cell size buttons too), unticks the checkerboard and the baseline ticks, and draws the template in the colors GB Studio reads as background (`#E0F8CF` with light-green guides, magenta for the widths), so that nothing of the guide can be read as ink by GB Studio. Unticking brings back the previous settings. The choice is stored as `target: "gbstudio"` in the metadata (new optional key, validated by both readers and by shared conformance cases: 8 x 8 cells, 16 columns, at most 15 rows). `spec/GRID.md` describes how GB Studio reads a font image.

### Changed

- The README and the help window now present Digiface for games (GB Studio) and for design work, without naming a design tool, and say that it is not affiliated with Aseprite or GB Studio. The page has a "Made by pixelPep" line at the bottom.

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
