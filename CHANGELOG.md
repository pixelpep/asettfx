# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/) once a first release exists.

## [Unreleased]

First version, planned as 0.1.0. Not released yet.

### Added

- Template generator (`web/`): open `web/index.html`. Character presets or custom sets, cell size, baseline, monospace or variable-space mode, checkerboard, ghost characters, baseline ticks, preview with grid lines, PNG download with the `asettfx` metadata chunk. The hint font is chosen from a list (automatic: Menlo for monospace, Verdana left-aligned for variable space; sans-serif, serif and typewriter choices; custom name allowed). In variable mode the template can pre-fill the magenta width columns from the hint font.
- Aseprite extension (`aseprite-extension/`): menu *File > Scripts > ASETTFX* with *Export as TTF...* (checks listed, family name, copyright, version, file chooser, *Settings...* to edit the grid) and *Set grid from template settings*. When the PNG has no settings, a form asks for the grid.
- Reading: PNG metadata reader with CRC check, settings found in the PNG, the sprite properties or a sidecar file `<name>.asettfx.json`, flattening of the visible layers over white (hidden layers and groups are not read), cell and width analysis, and the export checks of `spec/CHECKS.md` (errors block the export, warnings and notes are listed).
- TrueType export in pure Lua (`outline.lua`, `ttf.lua`, `export.lua`, rules in `spec/TTF.md`): crisp pixel outlines at 64 units per pixel, with the `OS/2`, `cmap` (formats 4 and 12), `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name` and `post` tables.
- `spec/`: metadata JSON Schema v1, grid and pixel rules (`GRID.md`), embedding and resolution rules (`METADATA.md`), export checks (`CHECKS.md`), font output (`TTF.md`), charset presets, examples, and conformance cases shared by the JavaScript and Lua code.
- Command-line tools: `tools/inspect.sh` (what the exporter reads from a file), `tools/export.sh`, `tools/make-sample.sh` (an A to Z example font), `tools/validate_ttf.py` (independent check with fontTools), `tools/pack.sh` (`dist/asettfx-0.1.0.aseprite-extension`), `tools/install-dev.sh`, `tools/check-package.sh`.
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
- The dialogs have not been tried in the Aseprite window yet.
