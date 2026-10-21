#!/usr/bin/env python3
"""Checks a font written by Digiface with fontTools (pip install fonttools), an implementation independent of the Lua writer.

Usage: python3 tools/validate_ttf.py font.ttf [cell_height]
Exit code 0 when every check passes. Pass the cell height to also check the 64 units per pixel grid.
"""
import io
import sys

from fontTools.pens.areaPen import AreaPen
from fontTools.ttLib import TTFont

problems = []


def check(condition, message):
    if not condition:
        problems.append(message)


def main(path, cell_height):
    # checkChecksums=2 raises on any wrong table checksum or head.checkSumAdjustment
    font = TTFont(path, checkChecksums=2, lazy=False)
    expected = {"OS/2", "cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "post"}
    check(set(font.keys()) - {"GlyphOrder"} == expected, "tables are %s" % sorted(set(font.keys()) - {"GlyphOrder"}))

    head, hhea, maxp, hmtx, glyf = font["head"], font["hhea"], font["maxp"], font["hmtx"], font["glyf"]
    check(head.magicNumber == 0x5F0F3CF5, "head magic")
    check(maxp.numGlyphs == len(glyf.keys()) == hhea.numberOfHMetrics, "glyph counts disagree")
    if cell_height:
        check(head.unitsPerEm == cell_height * 64, "unitsPerEm %d, expected %d" % (head.unitsPerEm, cell_height * 64))

    cmap = font.getBestCmap()
    check(len(cmap) > 0, "empty cmap")
    check(all(name in glyf.keys() for name in cmap.values()), "cmap points to a missing glyph")
    check(font.getGlyphOrder()[0] == ".notdef", "glyph 0 is not .notdef")

    glyph_set = font.getGlyphSet()
    max_points = max_contours = 0
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        advance, lsb = hmtx[name]
        check(advance >= 0 and advance % 64 == 0, "%s: advance %d is not a whole pixel" % (name, advance))
        if glyph.numberOfContours == 0:
            continue
        glyph.recalcBounds(glyf)
        stored = (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax)
        check(lsb == glyph.xMin, "%s: lsb %d, xMin %d" % (name, lsb, glyph.xMin))
        coords, ends, flags = glyph.getCoordinates(glyf)
        check(all(f & 1 for f in flags), "%s: off-curve point" % name)
        check(all(x % 64 == 0 and y % 64 == 0 for x, y in coords), "%s: point off the pixel grid" % name)
        max_points, max_contours = max(max_points, len(coords)), max(max_contours, len(ends))
        pen = AreaPen(glyph_set)
        glyph_set[name].draw(pen)
        check(pen.value != 0, "%s: zero area" % name)
    check(maxp.maxPoints >= max_points and maxp.maxContours >= max_contours, "maxp is smaller than the glyphs")

    xs = [glyf[n].xMax for n in glyf.keys() if glyf[n].numberOfContours]
    ys = [glyf[n].yMax for n in glyf.keys() if glyf[n].numberOfContours]
    check(max(xs) == head.xMax and max(ys) == head.yMax, "head bounding box does not match the glyphs")

    os2 = font["OS/2"]
    check(os2.version == 4 and os2.usWeightClass == 400, "OS/2 version or weight")
    check(os2.sTypoAscender == hhea.ascent and os2.sTypoDescender == hhea.descent, "typo and hhea metrics differ")
    check(os2.usWinAscent >= hhea.ascent and os2.usWinDescent >= -hhea.descent, "win metrics do not cover the line")
    check(font["post"].formatType == 3.0, "post is not format 3")

    names = {r.nameID: r.toUnicode() for r in font["name"].names if r.platformID == 3}
    for name_id in (1, 2, 4, 5, 6):
        check(name_id in names and names[name_id], "missing name %d" % name_id)
    check(" " not in names.get(6, ""), "PostScript name contains a space")

    # a second, independent round trip: fontTools can compile what it just read
    out = io.BytesIO()
    font.save(out)
    TTFont(io.BytesIO(out.getvalue()), lazy=False)

    print("%s: %d glyphs, %d characters, unitsPerEm %d, family %s" % (
        path, maxp.numGlyphs, len(cmap), head.unitsPerEm, names.get(1)))
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None))
