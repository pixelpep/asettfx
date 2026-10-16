# ASETTFX for Aseprite

Exports the glyphs you draw on a template grid to a TrueType font (`.ttf`).

## Install

Double-click `asettfx-<version>.aseprite-extension`, or in Aseprite choose *Edit > Preferences > Extensions > Add Extension*. Restart Aseprite if it asks.

## Use

1. Make a template with the ASETTFX template generator and open the PNG in Aseprite.
2. Draw each glyph in black on a layer above the template, one glyph per cell. In variable-space mode, paint pure magenta (`#FF00FF`) over the unused columns on the right of a glyph.
3. Hide the template layer.
4. Choose *File > Scripts > ASETTFX > Export as TTF...*. The dialog lists problems it found (errors block the export, warnings do not). Enter the family name and press Export.

If the PNG carries no settings, the dialog asks for the grid first. *Settings...* in the export dialog edits them later. *Set grid from template settings* turns on Aseprite's grid at the cell size.

Aseprite asks you to allow the script to read and write files the first time you run it.

## What is read

Every visible layer is flattened over white. Pure magenta marks a glyph's width, black is the glyph, white is background. Pixels that are not pure black, white or magenta are thresholded and counted in a warning.

See https://github.com/pixelpep/asettfx for the template generator and the specification.

Apache-2.0, copyright pixelPep inc. Based on the code of ase2ttf by nuskey (Apache-2.0). See LICENSE and NOTICE.
