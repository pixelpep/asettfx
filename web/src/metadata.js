// Build, validate and serialize the template metadata, see spec/metadata.schema.json and spec/METADATA.md.
(function (root, factory) {
  const dep = name => (typeof require === 'function' && typeof module === 'object')
    ? require('./' + name + '.js') : root.ASETTFX[name];
  const api = factory(dep('charmap'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ASETTFX = root.ASETTFX || {}; root.ASETTFX.metadata = api; }
})(typeof self !== 'undefined' ? self : this, function (charmap) {
  'use strict';

  const KEYWORD = 'asettfx';
  const SOFT_LIMIT = 2048;
  const HARD_LIMIT = 65536;

  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  function checkKeys(obj, allowed, path, errors) {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(path + '.' + k + ' is not allowed');
  }

  // Returns a list of error strings, empty when valid.
  // size is optional: {width, height} of the PNG, for the geometry check.
  function validate(meta, size) {
    const errors = [];
    if (!isObject(meta)) return ['metadata must be an object'];

    for (const k of ['v', 'cell', 'grid', 'mode', 'map']) if (!(k in meta)) errors.push('Missing ' + k);
    if ('v' in meta && meta.v !== 1) errors.push('Unsupported version ' + meta.v);
    if ('tool' in meta && !(typeof meta.tool === 'string' && meta.tool.length <= 64)) errors.push('tool must be a string of at most 64 characters');
    if ('name' in meta && !(typeof meta.name === 'string' && meta.name.length <= 64 && /^[\x20-\x7E]*$/.test(meta.name))) {
      errors.push('name must be printable ASCII of at most 64 characters');
    }

    for (const [key, a, b, max] of [['cell', 'w', 'h', 256], ['grid', 'cols', 'rows', 256]]) {
      const o = meta[key];
      if (o === undefined) continue;
      if (!isObject(o)) { errors.push(key + ' must be an object'); continue; }
      checkKeys(o, [a, b], key, errors);
      for (const f of [a, b]) if (!isInt(o[f], 1, max)) errors.push(key + '.' + f + ' must be an integer from 1 to ' + max);
    }

    if ('mode' in meta && !['mono', 'var'].includes(meta.mode)) errors.push('mode must be mono or var');
    if ('widthSource' in meta && !['magenta', 'auto'].includes(meta.widthSource)) errors.push('widthSource must be magenta or auto');
    if ('ink' in meta && !['dark', 'light'].includes(meta.ink)) errors.push('ink must be dark or light');
    if ('marker' in meta && meta.marker !== '#FF00FF') errors.push('marker must be #FF00FF');

    if ('metrics' in meta) {
      const m = meta.metrics;
      if (!isObject(m)) errors.push('metrics must be an object');
      else {
        checkKeys(m, ['baseline', 'spacing', 'xHeight', 'capHeight'], 'metrics', errors);
        for (const f of Object.keys(m)) {
          if (['baseline', 'spacing', 'xHeight', 'capHeight'].includes(f) && !isInt(m[f], 0, 0x7FFFFFFF)) {
            errors.push('metrics.' + f + ' must be a non-negative integer');
          }
        }
        if (isObject(meta.cell) && isInt(meta.cell.h, 1, 256) && isInt(m.baseline, 0, 0x7FFFFFFF) && m.baseline >= meta.cell.h) {
          errors.push('metrics.baseline must be smaller than cell.h');
        }
      }
    }

    if ('guide' in meta) {
      const g = meta.guide;
      if (!isObject(g)) errors.push('guide must be an object');
      else {
        checkKeys(g, ['checker', 'baseline', 'hint', 'hintFont', 'prefill'], 'guide', errors);
        for (const f of ['checker', 'baseline', 'prefill']) if (f in g && typeof g[f] !== 'boolean') errors.push('guide.' + f + ' must be a boolean');
        if ('hint' in g && !['ghost', 'none'].includes(g.hint)) errors.push('guide.hint must be ghost or none');
        if ('hintFont' in g && !(typeof g.hintFont === 'string' && g.hintFont.length <= 64)) errors.push('guide.hintFont must be a string of at most 64 characters');
      }
    }

    if ('map' in meta) {
      const cells = isObject(meta.grid) && isInt(meta.grid.cols, 1, 256) && isInt(meta.grid.rows, 1, 256)
        ? meta.grid.cols * meta.grid.rows : Infinity;
      for (const e of charmap.validateMap(meta.map, cells)) errors.push(e);
    }

    if (size && isObject(meta.cell) && isObject(meta.grid)) {
      const w = meta.grid.cols * meta.cell.w;
      const h = meta.grid.rows * meta.cell.h;
      if (w !== size.width || h !== size.height) {
        errors.push('Grid is ' + w + 'x' + h + ' but the image is ' + size.width + 'x' + size.height);
      }
    }
    return errors;
  }

  // config: {tool, name, cellW, cellH, cols, rows, mode, widthSource, map, baseline, spacing, xHeight, capHeight, guide}
  function build(config) {
    const meta = { v: 1 };
    if (config.tool) meta.tool = config.tool;
    if (config.name) meta.name = config.name;
    meta.cell = { w: config.cellW, h: config.cellH };
    meta.grid = { cols: config.cols, rows: config.rows };
    meta.mode = config.mode;
    if (config.mode === 'var') meta.widthSource = config.widthSource || 'magenta';
    meta.ink = 'dark';
    meta.marker = '#FF00FF';
    meta.map = config.map.slice();
    meta.metrics = { baseline: config.baseline || 0, spacing: config.spacing || 0 };
    if (config.xHeight) meta.metrics.xHeight = config.xHeight;
    if (config.capHeight) meta.metrics.capHeight = config.capHeight;
    if (config.guide) meta.guide = Object.assign({}, config.guide);
    return meta;
  }

  // Compact JSON, ASCII only (non-ASCII is escaped), as required for a tEXt chunk.
  function serialize(meta) {
    const text = JSON.stringify(meta).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    if (text.length > HARD_LIMIT) throw new Error('Metadata is larger than ' + HARD_LIMIT + ' bytes');
    return text;
  }

  return { KEYWORD, SOFT_LIMIT, HARD_LIMIT, validate, build, serialize };
});
