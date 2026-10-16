# Metadata embedding and resolution (v1)

Fields are defined in [metadata.schema.json](metadata.schema.json), geometry and pixel rules in [GRID.md](GRID.md). Examples are in [examples/](examples/).

## PNG chunk

- One `tEXt` chunk, keyword `asettfx`, a NUL byte, then the JSON text.
- The text is strictly ASCII (a subset of Latin-1, as `tEXt` requires). Code points appear in `map` as hex, never as characters. No compression, so it can be read without zlib.
- The chunk is inserted after `IHDR` and before the first `IDAT`, with its CRC-32 (computed over the chunk type and data, as for every PNG chunk).
- Keep it under 2 KB. Readers reject a chunk larger than 64 KB.
- Writers emit compact JSON. Readers accept any JSON whitespace.

## Reading and validation

A reader stops at the first `IDAT`. It reports the metadata as **invalid** (check `meta-invalid`, with the manual dialog pre-filled with whatever could be parsed) when any of these holds:

1. the chunk CRC does not match;
2. the text is not valid JSON, or fails the schema (including `v` other than 1);
3. the expanded `map` is longer than `cols * rows`, repeats a code point, or contains an invalid code point.

If no `asettfx` chunk exists, the metadata is **absent**. The outcome is the same: the manual dialog.

A grid that no longer matches the image size, for example after the canvas was resized, does **not** make the metadata invalid. It is reported by the geometry checks in [CHECKS.md](CHECKS.md), and the settings are kept.

## Where the settings come from in Aseprite

The exporter resolves settings in this order and takes the first valid source:

1. the PNG on disk (`sprite.filename`), when the sprite was opened from a PNG;
2. the sprite's own properties, `sprite.properties("asettfx")`, which the export command writes after it has resolved the settings from another source, so they survive saving as `.aseprite` (availability in 1.3.16 to be confirmed);
3. a sidecar file `<name>.asettfx.json` next to the sprite;
4. the manual dialog, whose result is saved into the sprite properties as well.

Aseprite does not keep PNG text chunks when it saves a `.aseprite`, so step 2 is what makes the settings survive.

## Compatibility

- `v` increases only for breaking changes. A reader that sees a higher `v` treats the metadata as invalid.
- Readers ignore unknown top-level keys. Unknown keys inside `cell`, `grid`, `metrics` and `guide` are not allowed in v1.
