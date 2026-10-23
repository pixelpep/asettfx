// From user settings to a template PNG with embedded metadata.
(function (root, factory) {
  const dep = name => (typeof require === 'function' && typeof module === 'object')
    ? require('./' + name + '.js') : root.Digiface[name];
  const api = factory(dep('charmap'), dep('metadata'), dep('template'), dep('png'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.generate = api; }
})(typeof self !== 'undefined' ? self : this, function (charmap, metadata, template, png) {
  'use strict';

  const TOOL = 'digiface-matrix/0.1';
  const MAX_DIMENSION = 4096;

  // Rows needed to hold the map at the given column count.
  function rowsFor(map, cols) {
    return Math.max(1, Math.ceil(charmap.expandMap(map).cells.length / cols));
  }

  // settings: {name, cellW, cellH, cols, mode, widthSource, map, baseline, spacing, xHeight, capHeight, guide}
  // Returns {ok: false, errors} or {ok: true, config, meta, width, height}.
  function prepare(settings) {
    const guide = Object.assign({}, settings.guide);
    const prefill = !!guide.prefill && settings.mode === 'var' && (settings.widthSource || 'magenta') === 'magenta' && guide.hint === 'ghost';
    if (prefill) guide.prefill = true; else delete guide.prefill;
    const config = Object.assign({ tool: TOOL }, settings, { guide, prefillWidths: prefill, rows: rowsFor(settings.map, settings.cols) });
    const meta = metadata.build(config);
    const errors = metadata.validate(meta);
    if (errors.length) return { ok: false, errors };

    const width = config.cols * config.cellW;
    const height = config.rows * config.cellH;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      return { ok: false, errors: ['Image would be ' + width + 'x' + height + ', the limit is ' + MAX_DIMENSION + 'x' + MAX_DIMENSION] };
    }
    return { ok: true, config, meta, width, height };
  }

  // Returns {ok: false, errors} or {ok: true, png, meta, metaText, width, height, rgba, warnings}.
  async function generate(settings, maskProvider) {
    const prepared = prepare(settings);
    if (!prepared.ok) return prepared;
    const { config, meta } = prepared;

    const warnings = [];
    const metaText = metadata.serialize(meta);
    if (metaText.length > metadata.SOFT_LIMIT) warnings.push('Metadata is ' + metaText.length + ' bytes, over the recommended ' + metadata.SOFT_LIMIT);

    const img = template.render(config, maskProvider);
    // A GB Studio template is an indexed PNG (palest color first, darkest second): in Aseprite it can only be drawn with
    // these colors, and a hidden template layer leaves the background color, not black, where it was transparent.
    const options = { text: [{ keyword: metadata.KEYWORD, text: metaText }] };
    if (config.target === 'gbstudio') options.palette = template.GB_PALETTE;
    const bytes = await png.encode(img.width, img.height, img.rgba, options);
    return { ok: true, png: bytes, meta, metaText, width: img.width, height: img.height, rgba: img.rgba, warnings };
  }

  // The template as separate layers, for the editor: {ok: true, meta, config, width, height, background, ghost, advances}
  // (see template.renderLayers).
  function layers(settings, maskProvider) {
    const prepared = prepare(settings);
    if (!prepared.ok) return prepared;
    const parts = template.renderLayers(prepared.config, maskProvider);
    return Object.assign({ ok: true, meta: prepared.meta, config: prepared.config }, parts);
  }

  // The name of the downloaded file: the font name in lowercase with hyphens, then the cell size and "template".
  function fileName(name, cellW, cellH) {
    const slug = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
    return slug + '-' + cellW + 'x' + cellH + '-template.png';
  }

  // The .json that goes next to a font image in GB Studio. GB Studio turns a typed character into its code point, cut to one
  // byte, and shows the cell of that code (the first cell is code 32). Characters that are not in the cell of their own code
  // (the euro sign, the curly quotes, oe... of the Windows-1252 block 0x80-0x9F) need "mapping": {character: code}.
  function gbMapping(map) {
    const mapping = {};
    charmap.expandMap(map).cells.forEach((cp, i) => {
      const code = 32 + i;
      if (cp !== null && cp !== code) mapping[String.fromCodePoint(cp)] = code;
    });
    return mapping;
  }

  return { TOOL, MAX_DIMENSION, rowsFor, fileName, prepare, generate, layers, gbMapping };
});
