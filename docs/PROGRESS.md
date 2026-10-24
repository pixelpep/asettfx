# Progress

Last updated: 2026-10-23

## Status

Version 0.3.0 is ready to publish (notes in `docs/releases/0.3.0.md`); 0.2.0 is published (the spec, the web template generator, the Lua pipeline, and the Aseprite menu commands and dialogs with packaging). What 0.3.0 adds (see the changelog): the **editor** in the page (milestones 1 to 4 of 6, `docs/EDITOR.md`), a **GB Studio mode** (layout, indexed PNGs with GB Studio's palette, the `.json` of the mapping, `target` in the metadata), the two downloads **Template** and **Drawing** with their explanation windows, the neon design with Source Sans 3, and the project docs. It is tested automatically (node tests of the web tool and the editor, Lua tests run inside Aseprite, tests of the private hosting code) and tried by hand in Aseprite 1.3.16 on macOS and in Chrome. GB Studio itself has not been tried with a PNG made here.

## First trial in Aseprite (2026-10-16)

The menu appeared at the right place. Feedback and what was done: many file permission prompts (the settings in the sprite are now read first and a sidecar file is only opened if it exists); a warning named U+005F but the cell was hard to find (warnings give the row and column, and the template now always shows a ghost, even for thin characters such as the underscore); the spacing choice was hidden in the settings form (it is now at the top of the export dialog, detected from the magenta, with monospace still selectable); the typed apostrophe came from another font (word processors type U+2019, so typographic quotes, dashes and the no-break space now reuse the plain glyphs).

## Next

1. [ ] **Editor, milestone 5**: automatic saving in the browser, and the list of what is wrong in the download window. Then milestone 6 (adjustments). See [docs/EDITOR.md](EDITOR.md).
2. [ ] **Try a font in GB Studio itself**: a PNG of the *Drawing* and its `.json` in `assets/fonts` of a project, then a text with the euro sign, the curly quotes and oe.
3. [ ] **Publish 0.3.0**: commit, tag `v0.3.0`, and create the GitHub release with `docs/releases/0.3.0.md` and `dist/digiface-0.3.0.aseprite-extension`. Then rebuild the hosted copy and the itch.io zip.
4. [ ] A bigger real font end to end, drawn in the editor: draw, download the drawing, export the TTF in Aseprite, install it, use it in a design tool. (Done with GB Studio's own `gbs-mono.png` and `gbs-var.png`: 213 characters each export to a valid TTF.)
5. [x] A TrueType export from the page, a port of the Lua writer checked byte for byte against it (`docs/EDITOR.md` section 10). OpenType (CFF) is still to do.
6. [ ] A way to open Digiface Matrix without cloning the repository: a hosted page, or GitHub Pages on `web/`, or a zip of `web/` attached to the release.
7. [ ] User documentation: a short guide with screenshots of the editor and of the export dialog, and the usual questions (variable width and magenta, why a cell needs 8 rows for accents, installing the font).
8. [ ] Try the extension on Windows or Linux and on other Aseprite versions.

## Done

- [x] Release 0.1.0 (published as ASETTFX on 2026-10-18) withdrawn on 2026-10-21 with its tag, after the rename to Digiface; 0.2.0 replaces it

- [x] Analysis of ase2ttf 0.2.0 (pipeline, table layout, known defects) and of the reference font grids (16x14 cells of 8x8 px, U+0020 to U+00FF, magenta width columns)
- [x] Repository setup: Apache-2.0 `LICENSE`, `NOTICE`, `.gitignore`, `README.md`
- [x] Step 1, `spec/`: metadata JSON Schema, `GRID.md`, `METADATA.md`, `CHECKS.md`, `TTF.md`, 4 charset presets, examples, shared conformance cases
- [x] Step 2, `web/`: template generator (checkerboard, ghost characters from a chosen font, baseline ticks, optional pre-filled magenta widths, `tEXt` metadata), smoke-tested in headless Chrome
- [x] Step 3, `aseprite-extension/digiface/`: PNG chunk reader with CRC, metadata validator shared with the web tool through `spec/conformance/`, settings resolution (PNG, sprite properties, sidecar), flatten of the visible layers over white, cell analysis (ink, magenta, advances), the export checks
- [x] Step 4: `outline.lua` and `ttf.lua` (ten tables, cmap 4 and 12, long loca when needed, checksums), `export.lua`; verified by an independent TTF reader in the tests, by fontTools, and by rendering text in Chrome
- [x] Step 5: `digiface.lua` (menu group and two commands), `package.json` manifest, `form.lua`, `report.lua`, `ui.lua`, `commands.lua`, packaging
- [x] Editor in the page, milestones 1 to 3 (`web/src/editor/`: view, model, tools, history, export, screen): viewer and editor as one component, brush, eraser, width tool, undo and redo, zoom and fit, zoom on cell, visual guides, the drawing following its characters when the layout changes, GB Studio from inside the editor
- [x] Editor, milestone 4: the rectangle selection (`editor/selection.js`): select, move, nudge, cut, copy, paste, delete, floating pixels, one gesture for undo
- [x] GB Studio mode: layout and colors fixed, indexed PNGs with GB Studio's palette checked with GB Studio's own pixel rule, the `.json` of the mapping (tested against a port of its encoder), `target: "gbstudio"` in the metadata and the conformance cases, the palette recognized by the extension
- [x] Downloads: **Template** and **Drawing** with a window that explains them and asks for the name of the font
- [x] New look (neon design system, Source Sans 3 under the OFL), signature, help with a Shortcuts tab, presentation for games and design work
- [x] Command-line tools: `tools/inspect.sh`, `tools/export.sh`, `tools/make-sample.sh`, `tools/validate_ttf.py`, `tools/pack.sh`, `tools/install-dev.sh`, `tools/check-package.sh` (unpacks the package elsewhere and exports a font from it)

## Later (not planned yet)

- What stays under "Later" in [docs/EDITOR.md](EDITOR.md): the TrueType and OpenType export from the page, the project file and the import of a PNG, testing the font with a live text, the lasso and the other tools.
- Kerning.
- More bundled pixel fonts, if their license is confirmed (DaFont's own FAQ says the license shown there is only an indication, and that a missing license does not mean a font is free). Candidates: Alagard (author's note: "Give credit if used. That's it."), Early GameBoy (CC BY-SA 3.0 in the file, a different author on DaFont). Fonts with no statement, or with a personal-use restriction, are left to *Pixel font from a file...*.

## Open questions

- Where the menu entry really appears (expected: File > Scripts > Digiface) and how the dialogs look (widths, wrapping of the check lines, the file chooser) is unknown until it is opened in the Aseprite window.
- Pre-filled magenta widths come from a system font and a simple rule (last ink column + 2). Needs a check on real glyphs; the rule is in `spec/GRID.md` 6.1. The user copies the magenta onto a visible layer (6.2); nothing in the extension edits layers.
- The `widthSource = auto` rules (an empty cell is half the cell width) and the default `spacing` are to validate visually on a real font.
- Ghost characters from a system font look different per OS and are crowded for accented characters in 8 px cells; the bundled pixel fonts do not have the problem.
- The editor is dark only (the neon design has no light mode), and its zoom works on whole steps except Fit, which is fractional.
- A drawing that is hidden under a width marker is lost in the download (it is flagged); automatic saving does not exist yet, so a reload loses the drawing.
- Known limits of the font output: no kerning, no hinting, no `gasp`; the OS/2 Unicode range bits cover only the common blocks; undrawn characters are left out of the font, so a browser falls back to another font for them.
- The metadata schema is mirrored by `web/src/metadata.js` and `aseprite-extension/digiface/meta.lua`; `spec/conformance/` keeps them in agreement, but a change to the schema must be made in all three.

## Aseprite 1.3.16 facts checked in batch mode

- `Image:drawSprite` honors layer visibility, hidden groups included, but replaces the destination instead of blending with a white fill, so the white background is applied in Lua.
- `json.decode` returns userdata objects and float numbers; `jsonutil.normalize` converts them.
- `sprite.properties("digiface")` reads and writes, and its content is saved inside the `.aseprite` file.
- `Image.bytes` gives RGBA. `app.fs.filePathAndTitle` returns one string. The documents folder is `app.fs.userDocsPath`.
- `os.exit` is not available (a script error gives exit code 255). `Dialog{}` returns `nil` in batch mode.

## Decisions

| Topic | Decision |
|---|---|
| License | Apache-2.0, copyright pixelPep inc., based on ase2ttf |
| Metadata | One `tEXt` chunk, keyword `digiface`, ASCII JSON |
| Template | Guide only. The user hides it before export; there is no layer marker and no *Prepare* command |
| Export reading | Flatten visible layers over white; `FF00FF` = marker; luminance < 128 = ink (inverted for `ink: light`); impure pixels are counted and reported as a warning, never an error |
| Width marker | Pure magenta `#FF00FF`; advance = non-magenta columns |
| Font output | Pure Lua `string.pack`, on-curve straight outlines at 64 units per pixel, rules in `spec/TTF.md`; undrawn characters are not exported, spaces are |
| Hint rendering | System font through canvas at 8x, thresholded to 1-bit, or a bundled or loaded pixel font drawn pixel for pixel |
| Web tool | Plain scripts (UMD), no build, works from `file://`; PNG encoded in JS (RGBA or indexed), `CompressionStream` with stored-block fallback |
| Editor | In the page, the preview and the editor are one component; the drawing is stored per character, so a layout change carries it along; width is a tool of its own; the name of the font is asked when something is downloaded |
| GB Studio | `target: "gbstudio"`: 8 x 8 cells, 16 columns, at most 15 rows; indexed PNGs, palest color first, darkest second; colors chosen so that GB Studio reads the guide as background (green channel 205 to 249); the `.json` only for 0x80-0x9F |
| Packaging | Zip with `package.json` at its root, built by `tools/pack.sh`; modules live under an `digiface.` namespace so they cannot collide with other extensions |
| Tests | `npm test` (node) and `npm run test:aseprite` (Lua inside Aseprite batch mode). The validators share `spec/conformance/*.json`; generated files (`charsets.js`, `charsets.lua`, `blank.lua`) are checked in sync |
| Local references | `ase2ttf-0.2.0/` and `gbstudio_style-fonts/` are gitignored and not redistributed |
