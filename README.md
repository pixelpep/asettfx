# Digiface

Pixel fonts from Aseprite to TTF. Turn pixel-art glyphs drawn in [Aseprite](https://www.aseprite.org/) into a valid bitmap-style TrueType font (`.ttf`), for game engines and design tools such as Figma.

> **Status: version 0.1.0.** The spec, the web template generator and the Aseprite extension (reading, checks, TTF writer, menu and dialogs) are written and tried in Aseprite 1.3.16 on macOS. Download the extension from the [Releases](https://github.com/pixelpep/digiface/releases) page. See [Roadmap](#roadmap).

Digiface has two parts:

1. **Digiface Matrix** (`web/`), the template generator: a small HTML/JS/Canvas tool that produces a PNG template for a bitmap font grid, with the settings embedded in the PNG.
2. **Digiface for Aseprite** (`aseprite-extension/`), the extension: a Lua extension that reads the template settings, lets you draw the glyphs, and exports the `.ttf`.

## Install the extension

Download `digiface-<version>.aseprite-extension` from the [Releases](https://github.com/pixelpep/digiface/releases) page and double-click it. To build it yourself: `sh tools/pack.sh` builds `dist/digiface-<version>.aseprite-extension`. While developing, `sh tools/install-dev.sh` copies the files into Aseprite's extensions folder instead (restart Aseprite after). See [aseprite-extension/README.md](aseprite-extension/README.md).

## Try the template generator

No build and no server: open `web/index.html` in a browser. Tests: `npm test` (node 18 or later, no dependencies). The Lua tests run inside Aseprite: `npm run test:aseprite` (set `ASEPRITE` to the executable if it is not at the macOS default path). To see what the exporter reads from your own file, without any UI yet: `sh tools/inspect.sh my-font.png [characters]` (or `.aseprite`). It prints the settings found, the export checks and the width of every character.

Export a font from the command line, with the same checks the dialog will show: `sh tools/export.sh my-font.aseprite my-font.ttf "My Font"`. A complete example (A to Z, variable width) is built by `sh tools/make-sample.sh some-folder`. To validate a font independently of the Lua writer: `pip install fonttools`, then `python3 tools/validate_ttf.py my-font.ttf 8` (the second argument is the cell height).

## Workflow

1. Open the web tool and choose a character set, spacing mode (monospace or variable) and cell size.
2. Download the PNG template: a grey ghost of each character to draw (in Arial, Times New Roman, one of the bundled pixel fonts, or any pixel font file from your computer, drawn at its own pixel size), blue baseline ticks, and in variable-space mode, optionally magenta width columns pre-filled from the hint font. Settings are stored in a PNG `tEXt` chunk.
3. Open the PNG in Aseprite and draw each glyph in black on a layer above it. The template is only a guide.
4. To make a variable-width font, paint pure magenta `#FF00FF` over the unused columns on the right of a glyph. To keep the pre-filled magenta, copy it from the template onto your drawing layer. The export dialog detects magenta and selects variable spacing; with no magenta the font is monospace. You can still choose monospace when magenta is present, and it is then ignored.
5. Hide the template layer, then run **File → Scripts → Digiface → Export as TTF...**. Every visible layer is flattened over white (a white or a transparent background are equivalent), and black pixels become the glyphs.

If the settings are missing or corrupted, a dialog asks for the grid parameters. Before exporting, the dialog lists any problems it found: wrong image size, empty characters, pixels that are not pure black, white or magenta, partial magenta columns and more. Warnings do not block the export; errors do. See [spec/CHECKS.md](spec/CHECKS.md).

## Grid rules

- The image is exactly `cols × cellW` by `rows × cellH` pixels, with no gutter between cells.
- Characters are laid out in reading order, mapped through the code point ranges stored in the metadata.
- Glyph pixels are pure black on white, with no antialiasing.
- Magenta `#FF00FF` marks pixels that are not part of the glyph. In variable mode, a glyph's advance is the number of non-magenta columns in its cell.
- 1 pixel = 64 font units, so the font is sharpest at multiples of the cell height.

## Repository layout (planned)

```
spec/                 metadata schema, grid rules, charsets (shared contract, written)
web/                  template generator (written)
aseprite-extension/   Lua extension: reader, checks, outlines, TTF writer, menu commands and dialogs
tools/                packaging and TTF validation scripts
tests/                round-trip and export tests
```

## Roadmap

1. ~~`spec/`: metadata schema, grid rules, charsets~~
2. ~~Web template generator with PNG chunk injection~~
3. ~~Lua: PNG metadata reader, cell extraction, width detection, export checks~~
4. ~~Lua: outline tracing and TrueType writer, plus validation tooling~~
5. ~~Aseprite UI, commands, packaging as `.aseprite-extension`~~

Next: see [docs/PROGRESS.md](docs/PROGRESS.md).

## Credits

The template generator ships a few pixel fonts, unchanged, to draw its guide characters: Alkhemikal, Digital Disco, Digital Disco Thin, Grape Soda and Kiwi Soda by [jeti](https://fontenddev.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), and Bytesized by Baltdev ([SIL OFL 1.1](web/fonts/licenses/OFL-Bytesized.txt)), GB Studio Mono and GB Studio Variable by Chris Maltby, from GB Studio ([MIT](web/fonts/licenses/MIT-GB-Studio.txt)), and Minecraft Standard and Minecraft Standard Bold by Polda18 ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)). Details and sources: [web/fonts/LICENSES.md](web/fonts/LICENSES.md). Any other pixel font can be used from a file on your computer.

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The outline extraction and TrueType table layout are derived from [ase2ttf](https://github.com/nuskey8/ase2ttf) by nuskey (Apache-2.0).
