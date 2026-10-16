# Export checks (v1)

Before writing the font, the extension runs these checks and lists the results in the export dialog. They apply to the flattened visible layers (see [GRID.md](GRID.md) section 3) and to the resolved settings ([METADATA.md](METADATA.md)).

## Severity

| Level | Effect |
|---|---|
| **error** | Nothing meaningful can be exported. The Export button is disabled until the cause is fixed (often in the dialog itself). |
| **warning** | The export goes ahead. The dialog shows the message in orange, so the user can cancel and fix the drawing. |
| **info** | Shown in grey, for context. |

Messages are listed errors first, then warnings, then info. At most 8 characters are named per message, followed by "and N more". A character is named with its code point, the character itself when it is printable ASCII, and where its cell is in the grid, counted from 1: `U+005F "_" (row 4, column 16)`; the entries are separated by semicolons.

## Checks

Check ids are stable and are used by the tests.

### Settings

| Id | Level | Condition | Message |
|---|---|---|---|
| `meta-absent` | info | no `asettfx` chunk, sprite properties or sidecar found | Template settings not found. Using the values entered in this dialog. |
| `meta-invalid` | warning | CRC mismatch, bad JSON, schema failure or bad map | Template settings are damaged (reason). Using the values entered in this dialog. |
| `settings-invalid` | error | the settings in the dialog fail validation (`metadata.validate`): cell size, grid, `baseline >= cell.h`, bad map | The reason, as returned by the validator. |

### Geometry

The image is compared with `cols * cell.w` by `rows * cell.h`. A resized canvas does **not** make the settings invalid: the settings are kept and the geometry is reported.

| Id | Level | Condition | Message |
|---|---|---|---|
| `size-mismatch` | warning | image size differs from the grid size | Image is 128x120 but the grid expects 128x112. |
| `cells-outside` | warning | some mapped cells are not entirely inside the image; they are skipped | 6 cells are outside the image and were skipped: U+0041 "A" (row 3, column 1); ... |
| `extra-area` | warning | the image extends past the grid; the extra pixels are ignored | 8 pixel rows below the grid are ignored. |
| `no-cells` | error | no mapped cell is entirely inside the image | The image does not contain any cell of the grid. |
| `cell-size-unusual` | info | `cell.w` or `cell.h` is not a multiple of 8 | Cell size 7x9 is not a multiple of 8. |

### Layers and frames

| Id | Level | Condition | Message |
|---|---|---|---|
| `no-visible-layer` | error | every layer is hidden | No visible layer. Show the layer with your glyphs. |
| `frames-ignored` | info | the sprite has several frames; only the active frame is read | Only frame N is exported. |

### Pixels

| Id | Level | Condition | Message |
|---|---|---|---|
| `no-ink` | error | no ink pixel in any mapped cell | No glyph found. Draw in black, with the template layer hidden. |
| `impure-pixels` | warning | pixels that are not exactly black, white or magenta after flattening | 12 pixels are not pure black, white or magenta and were thresholded. |
| `empty-glyphs` | warning | mapped, non-blank characters (blank = space, control, format) with no ink | 14 characters are empty: U+0041 "A" (row 2, column 2); ... |
| `marker-mixed` | warning | a column mixes marker and non-marker pixels (`var` mode, `widthSource = magenta`) | 3 characters have a partial magenta column: U+0041 "A" (row 2, column 2); ... |
| `ink-beyond-width` | warning | ink at or beyond the first marker column (clipped) | Ink beyond the magenta in 2 characters: U+0041 "A" (row 2, column 2); ... |
| `mode-detected` | info | the spacing was chosen from the image | Magenta found: variable spacing selected. / No magenta found: monospace spacing. |
| `marker-ignored` | info | magenta is present and the user chose monospace | Magenta found but ignored: monospace spacing selected. |
| `template-visible` | warning | at least one pixel equals a guide color of the template (grey, blue) | The template layer looks visible. It is read as background, but hide it to be safe. |

## Behavior details

- The export dialog shows `mode-detected` and `marker-ignored` on its spacing line instead of in the list of checks.
- `empty-glyphs` is only reported when some ink exists. A sprite with no drawing at all gets `no-ink` instead, not a long list of empty characters.
- `impure-pixels` and `template-visible` are still reported when there is no ink: a visible template with nothing drawn on it is exactly the case they explain.
- `meta-invalid` is reported only when no valid source was found. A damaged PNG chunk followed by valid sprite properties is silent.
- Pixel checks use the cells that lie entirely inside the image and carry a mapped character.

## Notes for implementers

- Checks produce `{id, level, message, items?}` records. The same table drives the dialog and the tests, so the Lua module and the fixtures must agree on the ids.
- `size-mismatch` also appears in the web tool tests (`metadata.validate(meta, size)`), as a sanity check on generated templates. In the exporter it never invalidates the settings.
- `template-visible` looks for exact guide colors only; it is a hint and may miss an edited template.
