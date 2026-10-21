// Fonts offered for the ghost characters. The text recorded in the metadata (guide.hintFont) is 64 characters at most.
(function (root, factory) {
  const bundled = (typeof require === 'function' && typeof module === 'object')
    ? require('./bundled-fonts.js') : root.Digiface.bundledFonts;
  const api = factory(bundled);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.fonts = api; }
})(typeof self !== 'undefined' ? self : this, function (bundled) {
  'use strict';

  const ARIAL = 'Arial, Helvetica, sans-serif';
  const TIMES = "'Times New Roman', Times, serif";
  const FILE = 'file';
  const BUNDLED = 'bundled:';

  const FONTS = [
    { id: 'arial', label: 'Arial', family: ARIAL },
    { id: 'times', label: 'Times New Roman', family: TIMES },
  ].concat(bundled.fonts.map(b => ({ id: BUNDLED + b.id, label: b.label + ' (pixel font)', bundled: b })))
    .concat([{ id: FILE, label: 'Pixel font from a file...' }]);

  const cut = text => Array.from(text).slice(0, 64).join('');

  // choice: {id, loaded}. loaded is a pixel font read from a file or from the bundled ones:
  // {family, label, pixelFont, em}. Returns {family, weight, align, exactSize, hintFont}.
  // The ghost is always left-aligned (the padding is a separate setting): the glyphs of a pixel font sit at the left
  // of the cell, and in variable-space mode their natural width shows where the magenta starts.
  // exactSize is the size in pixels at which one pixel of a pixel font is one pixel (0 for other fonts, which are
  // fitted to the cell). hintFont is the text recorded in the metadata.
  function resolve(choice) {
    const entry = FONTS.find(x => x.id === choice.id);
    if (entry && choice.loaded && (entry.id === FILE || entry.bundled)) {
      const f = choice.loaded;
      const hintFont = entry.bundled ? cut(entry.bundled.label + ' (' + entry.bundled.author + ', ' + entry.bundled.license + ')')
        : cut('File: ' + f.label);
      return { family: f.family, weight: 'normal', align: 'left', exactSize: f.pixelFont ? f.em : 0, hintFont };
    }
    const found = entry && entry.family ? entry : FONTS[0];
    return { family: found.family, weight: 'normal', align: 'left', exactSize: 0, hintFont: found.family };
  }

  return { FONTS, BUNDLED, FILE, resolve };
});
