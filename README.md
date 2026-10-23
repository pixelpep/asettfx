# Digiface

Pixel fonts from Aseprite to TTF. Draw your pixel-art letters in [Aseprite](https://www.aseprite.org/) and turn them into a real TrueType font (`.ttf`) for your game, your interface or your posters. Made for [GB Studio](https://www.gbstudio.dev/) projects (it has the GB Studio character layout and ships its two default fonts) and for any design work that needs a crisp pixel typeface: the font installs like any other and stays sharp at sizes that are multiples of the cell height.

> **Status: version 0.2.0 is released**, with the spec, the web tool and the Aseprite extension (reading, checks, TTF writer, menu and dialogs), tried in Aseprite 1.3.16 on macOS. Since then the web tool has gained an **editor** to draw in the page, a GB Studio mode and a new look (see the [changelog](CHANGELOG.md)), not released yet. Download the extension from the [Releases](https://github.com/pixelpep/digiface/releases) page. See [Roadmap](#roadmap).

Digiface has two parts:

1. **Digiface Matrix** (`web/`), a small HTML/JS/Canvas tool, with no install: it makes a PNG template for a bitmap font grid, with the settings embedded in the PNG, and it has an **editor** to draw the glyphs right in the page (brush, eraser, width of each character, GB Studio palette).
2. **Digiface for Aseprite** (`aseprite-extension/`), the extension: a Lua extension that reads the template settings (or a drawing downloaded from the page) and exports the `.ttf`.

## Install the extension

Download `digiface-<version>.aseprite-extension` from the [Releases](https://github.com/pixelpep/digiface/releases) page and double-click it. To build it yourself: `sh tools/pack.sh` builds `dist/digiface-<version>.aseprite-extension`. While developing, `sh tools/install-dev.sh` copies the files into Aseprite's extensions folder instead (restart Aseprite after). See [aseprite-extension/README.md](aseprite-extension/README.md).

## Try Digiface Matrix

No build and no server: open `web/index.html` in a browser. Tests: `npm test` (node 18 or later, no dependencies). The Lua tests run inside Aseprite: `npm run test:aseprite` (set `ASEPRITE` to the executable if it is not at the macOS default path). To see what the exporter reads from your own file: `sh tools/inspect.sh my-font.png [characters]` (or `.aseprite`). It prints the settings found, the export checks and the width of every character.

Export a font from the command line, with the same checks the dialog shows: `sh tools/export.sh my-font.aseprite my-font.ttf "My Font"`. A complete example (A to Z, variable width) is built by `sh tools/make-sample.sh some-folder`. To validate a font independently of the Lua writer: `pip install fonttools`, then `python3 tools/validate_ttf.py my-font.ttf 8` (the second argument is the cell height).

## Workflow

1. Open Digiface Matrix and choose a character set, the spacing (variable by default, or *Monospace*) and the cell size. A guide font (Arial, Times New Roman, one of the bundled pixel fonts, or any pixel font file from your computer, drawn at its own pixel size) shows the character to draw in each cell.
2. **Draw in the page** (press **Edit**, see below), or download the **Template** and draw on it in Aseprite: glyphs in black on a layer above it, the template layer being only a guide.
3. Download the **Drawing**: a PNG with what you drew, without any guide, and the settings of the font inside. (Drawn in Aseprite, hide the template layer instead.)
4. To make a variable-width font, the unused columns on the right of a glyph are pure magenta `#FF00FF` (the **Width** tool does it in the page). The export dialog of the extension detects magenta and selects variable spacing; with no magenta the font is monospace. You can still choose monospace when magenta is present, and it is then ignored.
5. In Aseprite, run **File → Scripts → Digiface → Export as TTF...**. Every visible layer is flattened over white (a white or a transparent background are equivalent), and black pixels become the glyphs.

If the settings are missing or corrupted, a dialog asks for the grid parameters. Before exporting, the dialog lists any problems it found: wrong image size, empty characters, pixels that are not pure black, white or magenta, partial magenta columns and more. Warnings do not block the export; errors do. See [spec/CHECKS.md](spec/CHECKS.md).

## Draw in the page

**Edit** (the first button of the toolbar) folds the settings and adds the tools; **Done**, Escape or the same button brings the settings back, and what is drawn stays in the view. The view has a header with the zoom, **Fit** (enlarges the whole sheet to the window), **Visual guides** (the guide characters, the checkerboard, the baseline ticks and the limits of the cells), **Zoom on cell** and a full screen button.

| Key | Does |
|---|---|
| `H`, or hold `Space` | Hand: move the view |
| `B` | Brush, with the last color chosen |
| `E` | Eraser (`X` switches between the brush and the eraser) |
| `W` | Width: click in a cell to set the width of its glyph (variable fonts) |
| `1` `2` `3` `4` | Size of the brush and of the eraser |
| `Shift` + click | A line from the last pixel painted |
| `+` `-`, `0` | Zoom, fit |
| `Cmd` or `Ctrl` + `Z`, with `Shift` | Undo, redo |
| `Esc` | Stop editing |

The help (the **?** button) lists them in its *Shortcuts* tab. Colors are black, or the four shades of GB Studio in GB Studio mode. A stroke stays in the cell where it started (*Stay in cell*). The **Width** tool puts the width marker at the nearest border between two columns, shows the new width over the pink, and a click that gives the whole cell clears the marker. A cell with drawing under its width marker (which hides it) is framed in yellow.

While editing, what would move the drawing is locked (the character set, the cell size, the columns, *Monospace*); the guide font, its padding, the baseline and the other guides stay free. If the layout changes, the drawing follows its characters, and the page asks before it loses anything. The drawing is kept while the page stays open; saving in the browser and a TrueType export from the page are planned (see [docs/EDITOR.md](docs/EDITOR.md)).

The buttons **Template** and **Drawing** each open a window that explains what is downloaded and asks for the name of the font.

## GB Studio fonts

Tick **GB Studio** in the toolbar. The layout (GB Studio's own, Windows-1252 order), the 8 x 8 cells and the 16 columns are then fixed, *Baseline ticks* is off, the GB Studio Variable font guides you, and the template and the drawing are **indexed PNGs** with the palette of GB Studio's font sheets: the palest color (`#E0F8CF`) first, for the background, the darkest (`#071821`) second, for the characters, then the magenta for the widths and the two middle shades. Draw in the page, or in Aseprite, where the template stays an indexed image so the glyphs can only use these colors (hide the template layer and save the image as a PNG with *File > Export As...*).

GB Studio classes pixels by their green channel, and ignores their transparency: the darkest shade is the character, the palest opaque shade the background, and magenta (like pure white) is transparent, which trims the columns of each cell and gives the width of each character. Because the palette starts with the background color, the pixels that are transparent in Aseprite (a hidden template layer) are written with that color, not as black.

Put the PNG of the **Drawing** and a `.json` file with the same name in the `assets/fonts` folder of your GB Studio project. The window of the drawing offers the `.json` (ticked) and saves it with the image: GB Studio turns a typed character into its code point, cut to one byte, so characters such as the euro sign, the curly quotes, the ellipsis and the French oe would show the wrong cell without it. It is only needed for these characters. The export to a TrueType font works on the same drawing, without any warning about the colors.

How GB Studio reads a font image is described, from its source code, in [spec/GRID.md](spec/GRID.md).

## Grid rules

- The image is exactly `cols × cellW` by `rows × cellH` pixels, with no gutter between cells.
- Characters are laid out in reading order, mapped through the code point ranges stored in the metadata.
- Glyph pixels are pure black on white, with no antialiasing.
- Magenta `#FF00FF` marks pixels that are not part of the glyph. In variable mode, a glyph's advance is the number of non-magenta columns in its cell.
- 1 pixel = 64 font units, so the font is sharpest at multiples of the cell height.

## Repository layout

```
spec/                 metadata schema, grid rules, charsets (shared contract)
web/                  Digiface Matrix: the template generator and the editor (web/src/editor)
aseprite-extension/   Lua extension: reader, checks, outlines, TTF writer, menu commands and dialogs
tools/                packaging and TTF validation scripts
tests/                tests of the web tool, of the extension (inside Aseprite) and fixtures
docs/                 the editor design (EDITOR.md), progress notes, release notes
```

## Roadmap

1. ~~`spec/`: metadata schema, grid rules, charsets~~
2. ~~Web template generator with PNG chunk injection~~
3. ~~Lua: PNG metadata reader, cell extraction, width detection, export checks~~
4. ~~Lua: outline tracing and TrueType writer, plus validation tooling~~
5. ~~Aseprite UI, commands, packaging as `.aseprite-extension`~~
6. Web editor, in six milestones ([docs/EDITOR.md](docs/EDITOR.md)): the viewer, the brush and the eraser, the width tool and GB Studio are done; selection and clipboard, saving in the browser and a TrueType export from the page are next.

Next: see [docs/PROGRESS.md](docs/PROGRESS.md).

## Credits

The template generator ships a few pixel fonts, unchanged, to draw its guide characters: Alkhemikal, Digital Disco, Digital Disco Thin, Grape Soda and Kiwi Soda by [jeti](https://fontenddev.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), and Bytesized by Baltdev ([SIL OFL 1.1](web/fonts/licenses/OFL-Bytesized.txt)), GB Studio Mono and GB Studio Variable by Chris Maltby, from GB Studio ([MIT](web/fonts/licenses/MIT-GB-Studio.txt)), and Minecraft Standard and Minecraft Standard Bold by Polda18 ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)). Details and sources: [web/fonts/LICENSES.md](web/fonts/LICENSES.md). Any other pixel font can be used from a file on your computer.

## About

Made by [pixelPep](https://pixelpep.com). Digiface is not affiliated with Aseprite or GB Studio; the names are used to say what it works with.

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The outline extraction and TrueType table layout are derived from [ase2ttf](https://github.com/nuskey8/ase2ttf) by nuskey (Apache-2.0).
