# Progress

Last updated: 2026-10-16

## Status

All five steps are written: the spec, the web template generator, the Lua pipeline, and the Aseprite menu commands and dialogs with packaging. The pipeline is tested automatically (47 node tests, 106 Lua tests run inside Aseprite). What remains is trying it for real: Aseprite's batch mode has no UI, so the dialogs are covered by tests with a stand-in for `Dialog`, not by the real window.

## Next

1. [ ] Try the packaged extension in Aseprite: menu entry, dialogs, the file-access permission prompt, a real export. Fix what the real window shows.
2. [ ] Try a real font end to end: generate a template, draw, export, install the TTF (Font Book, Figma).
3. [ ] Decide on a first release: version, release notes from `CHANGELOG.md`, a GitHub release carrying the `.aseprite-extension` file.

## Done

- [x] Analysis of ase2ttf 0.2.0 (pipeline, table layout, known defects) and of the reference font grids (16x14 cells of 8x8 px, U+0020 to U+00FF, magenta width columns)
- [x] Repository setup: Apache-2.0 `LICENSE`, `NOTICE`, `.gitignore`, `README.md`
- [x] Step 1, `spec/`: metadata JSON Schema, `GRID.md`, `METADATA.md`, `CHECKS.md`, `TTF.md`, 4 charset presets, examples, shared conformance cases
- [x] Step 2, `web/`: template generator (checkerboard, ghost characters from a chosen font, baseline ticks, optional pre-filled magenta widths, `tEXt` metadata), smoke-tested in headless Chrome
- [x] Step 3, `aseprite-extension/asettfx/`: PNG chunk reader with CRC, metadata validator shared with the web tool through `spec/conformance/`, settings resolution (PNG, sprite properties, sidecar), flatten of the visible layers over white, cell analysis (ink, magenta, advances), the export checks
- [x] Step 4: `outline.lua` and `ttf.lua` (ten tables, cmap 4 and 12, long loca when needed, checksums), `export.lua`; verified by an independent TTF reader in the tests, by fontTools, and by rendering text in Chrome
- [x] Step 5: `asettfx.lua` (menu group and two commands), `package.json` manifest, `form.lua`, `report.lua`, `ui.lua`, `commands.lua`, packaging
- [x] Command-line tools: `tools/inspect.sh`, `tools/export.sh`, `tools/make-sample.sh`, `tools/validate_ttf.py`, `tools/pack.sh`, `tools/install-dev.sh`, `tools/check-package.sh` (unpacks the package elsewhere and exports a font from it)

## Later (not planned yet)

- Web glyph editor: click a character, draw it, copy and paste glyphs, live text preview, TTF export. Would be saved as a `.asettfx` archive (glyph PNG plus the metadata JSON). Implies a JavaScript TTF writer next to the Lua one, kept in agreement by shared test fixtures.
- Live text preview in the existing web tool from an imported glyph PNG, without a full editor.
- Kerning, and a bundled pixel font for the template's ghost characters.

## Open questions

- Where the menu entry really appears (expected: File > Scripts > ASETTFX) and how the dialogs look (widths, wrapping of the check lines, the file chooser) is unknown until it is opened in the Aseprite window.
- Pre-filled magenta widths come from a system font and a simple rule (last ink column + 2). Needs a check on real glyphs; the rule is in `spec/GRID.md` 6.1. The user copies the magenta onto a visible layer (6.2); nothing in the extension edits layers.
- The `widthSource = auto` rules (an empty cell is half the cell width) and the default `spacing` are to validate visually on a real font.
- Ghost characters use a system font, so they look different per OS and are crowded for accented characters in 8 px cells. Serif fonts are hard to read at that size.
- Known limits of the font output: no kerning, no hinting, no `gasp`; the OS/2 Unicode range bits cover only the common blocks; undrawn characters are left out of the font, so a browser falls back to another font for them.
- The metadata schema is mirrored by `web/src/metadata.js` and `aseprite-extension/asettfx/meta.lua`; `spec/conformance/` keeps them in agreement, but a change to the schema must be made in all three.

## Aseprite 1.3.16 facts checked in batch mode

- `Image:drawSprite` honors layer visibility, hidden groups included, but replaces the destination instead of blending with a white fill, so the white background is applied in Lua.
- `json.decode` returns userdata objects and float numbers; `jsonutil.normalize` converts them.
- `sprite.properties("asettfx")` reads and writes, and its content is saved inside the `.aseprite` file.
- `Image.bytes` gives RGBA. `app.fs.filePathAndTitle` returns one string. The documents folder is `app.fs.userDocsPath`.
- `os.exit` is not available (a script error gives exit code 255). `Dialog{}` returns `nil` in batch mode.

## Decisions

| Topic | Decision |
|---|---|
| License | Apache-2.0, copyright pixelPep inc., based on ase2ttf |
| Metadata | One `tEXt` chunk, keyword `asettfx`, ASCII JSON |
| Template | Guide only. The user hides it before export; there is no layer marker and no *Prepare* command |
| Export reading | Flatten visible layers over white; `FF00FF` = marker; luminance < 128 = ink (inverted for `ink: light`); impure pixels are counted and reported as a warning, never an error |
| Width marker | Pure magenta `#FF00FF`; advance = non-magenta columns |
| Font output | Pure Lua `string.pack`, on-curve straight outlines at 64 units per pixel, rules in `spec/TTF.md`; undrawn characters are not exported, spaces are |
| Hint rendering | System font through canvas at 8x, thresholded to 1-bit; no bundled font for now |
| Web tool | Plain scripts (UMD), no build, works from `file://`; PNG encoded in JS, `CompressionStream` with stored-block fallback |
| Packaging | Zip with `package.json` at its root, built by `tools/pack.sh`; modules live under an `asettfx.` namespace so they cannot collide with other extensions |
| Tests | `npm test` (node) and `npm run test:aseprite` (Lua inside Aseprite batch mode). The validators share `spec/conformance/*.json`; generated files (`charsets.js`, `charsets.lua`, `blank.lua`) are checked in sync |
| Local references | `ase2ttf-0.2.0/` and `gbstudio_style-fonts/` are gitignored and not redistributed |
