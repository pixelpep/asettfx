# Pixel fonts shipped with the template generator

These fonts are included **unchanged** (`original/`), so that the template generator can draw its guide characters with them.
Only grey, one-bit shapes taken from them end up in the templates it makes; the font files themselves are not copied there.
Each font is provided as is, without warranty of any kind, as the license of each says (see the disclaimer in the license text).

Facts below were read on 2026-10-18 from the pages cited, and from the font files.

## jeti: Alkhemikal, Digital Disco, Digital Disco Thin, Grape Soda, Kiwi Soda

- **Author:** jeti (https://fontenddev.com/, https://www.dafont.com/jeti.d1589). Copyright notice in the font files: `jeti`.
- **License: Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/
- The author's pages say: "You are free to use this font for personal or commercial projects, all I ask is that you include credit." and "Licensed under CC BY 4.0".
- Sources: https://www.dafont.com/alkhemikal.font, https://www.dafont.com/digital-disco.font, https://www.dafont.com/grapesoda-2.font, https://www.dafont.com/kiwisoda.font; the author's pages https://fontenddev.com/fonts/alkhemikal/ and https://fontenddev.com/fonts/digital-disco/ repeat the same terms.
- The DaFont listing also shows the label "Public domain / GPL / OFL" for these fonts. The author's own text, CC BY 4.0 with credit, is the stricter one and is the one followed here.
- Changes: none.

## Bytesized

- **Author:** Baltdev (https://www.dafont.com/bytesized.font), project https://github.com/balt-dev/bytesized-gf .
- **Copyright:** Copyright 2024 The Bytesized Project Authors (https://github.com/balt-dev/bytesized-gf)
- **License: SIL Open Font License, Version 1.1**, https://openfontlicense.org/ . The font file says: "This Font Software is licensed under the SIL Open Font License, Version 1.1." The full text, with the copyright line above, is in [licenses/OFL-Bytesized.txt](licenses/OFL-Bytesized.txt). It is the file the project ships on Google Fonts (https://github.com/google/fonts/tree/main/ofl/bytesized), retrieved on 2026-10-18; no Reserved Font Name is declared in it.
- The font file included here is version 1.010 as downloaded from DaFont. It is not the Google Fonts build (version 1.000): the shapes of nine ASCII characters differ (`* , ; b i j l p q`), the rest is the same design. The font file carries no copyright line of its own, so the project's notice above accompanies it.
- Changes: none. As the license asks, the font is not sold by itself and keeps its license notice with every copy.

## GB Studio Mono and GB Studio Variable

- **Author and copyright:** Chris Maltby, Copyright (c) 2019-2026 Chris Maltby. These are the default fonts of GB Studio (https://github.com/chrismaltby/gb-studio).
- **License: MIT.** The GB Studio repository is under the MIT License, and the font files are part of it; they carry no separate license or credit. The full text, as the repository gives it, is in [licenses/MIT-GB-Studio.txt](licenses/MIT-GB-Studio.txt).
- **Where they come from:** `gbs-mono.png` and `gbs-var.png` of https://github.com/chrismaltby/gb-studio/tree/a227e7dbe5eef9186afabc1b4e27cf873438b4c4/appData/templates/gbs2/assets/fonts , kept unchanged in [source/](source/). The first commit of these files in that repository is by Chris Maltby (2021-12-02).
- **Changes:** the PNG files were converted to TrueType fonts by this project's own exporter (`sh tools/make-gbs-fonts.sh`, reproducible), with the grid of GB Studio (16 x 14 cells of 8 x 8 pixels, Windows-1252 order, `spec/charsets/gbstudio.json`) and a baseline of 1; the width columns of `gbs-var.png` give the advances of GB Studio Variable. The font is the same drawing in another format. Typographic quotes, dashes and the no-break space also use the plain glyphs (see `spec/TTF.md`).
- The repository does not say who drew the glyphs, or whether they come from another work; the MIT License of the repository is the only statement.

## Minecraft Standard and Minecraft Standard Bold

- **Author:** Polda18. Copyright notice in the font files: `Copyright Polda18 2023`.
- **License: Creative Commons CC0 1.0 Universal (public domain dedication)**, https://creativecommons.org/publicdomain/zero/1.0/ . It is written in the name table of both font files ("Creative Commons CC0 Public Domain Dedication").
- "Minecraft" is a trademark of its owner; this is an independent font with that name in its title, and nothing here is affiliated with or endorsed by it.
- Changes: none.

## Source Sans 3 (the font of the page itself)

- **Author:** Adobe (https://github.com/adobe-fonts/source-sans), Copyright 2010-2020 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. Source Sans 3 is the current name of Source Sans Pro.
- **License: SIL Open Font License, Version 1.1.** Full text in [licenses/OFL-SourceSans3.txt](licenses/OFL-SourceSans3.txt), as shipped on Google Fonts (https://github.com/google/fonts/tree/main/ofl/sourcesans3), retrieved on 2026-10-22.
- **File:** `ui/SourceSans3-VF.ttf`, the variable font (weights 200 to 900), included unchanged: it is not subset or converted, because the license reserves the name 'Source' for unmodified copies. It is the lettering of the interface, not a guide font, and is loaded by `style.css`.

## Fonts that are not shipped

Fonts without a license statement, with a "free for personal use" restriction, or whose terms forbid redistribution are not included. DaFont's own FAQ says that "the licence mentioned above the download button is just an indication" and that "if no author/licence is indicated ... that doesn't mean it's free". They can still be used by choosing *Pixel font from a file...* in the generator, which keeps the file on the user's computer.
