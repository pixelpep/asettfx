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
  // Returns {ok: false, errors} or {ok: true, png, meta, metaText, width, height, warnings}.
  async function generate(settings, maskProvider) {
    const guide = Object.assign({}, settings.guide);
    const prefill = !!guide.prefill && settings.mode === 'var' && (settings.widthSource || 'magenta') === 'magenta' && guide.hint === 'ghost';
    if (prefill) guide.prefill = true; else delete guide.prefill;
    const config = Object.assign({ tool: TOOL }, settings, { guide, prefillWidths: prefill, rows: rowsFor(settings.map, settings.cols) });
    const meta = metadata.build(config);
    const errors = metadata.validate(meta);
    if (errors.length) return { ok: false, errors };

    const warnings = [];
    const width = config.cols * config.cellW;
    const height = config.rows * config.cellH;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      return { ok: false, errors: ['Image would be ' + width + 'x' + height + ', the limit is ' + MAX_DIMENSION + 'x' + MAX_DIMENSION] };
    }

    const metaText = metadata.serialize(meta);
    if (metaText.length > metadata.SOFT_LIMIT) warnings.push('Metadata is ' + metaText.length + ' bytes, over the recommended ' + metadata.SOFT_LIMIT);

    const img = template.render(config, maskProvider);
    const bytes = await png.encode(img.width, img.height, img.rgba, { text: [{ keyword: metadata.KEYWORD, text: metaText }] });
    return { ok: true, png: bytes, meta, metaText, width: img.width, height: img.height, rgba: img.rgba, warnings };
  }

  // The name of the downloaded file: the font name in lowercase with hyphens, then the cell size and "template".
  function fileName(name, cellW, cellH) {
    const slug = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
    return slug + '-' + cellW + 'x' + cellH + '-template.png';
  }

  return { TOOL, MAX_DIMENSION, rowsFor, fileName, generate };
});
