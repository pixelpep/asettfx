// The drawing as an image to download: the shadow, the writing and the width layers over the background, without any guide. Pure, no DOM.
// docs/EDITOR.md section 7.
(function (root, factory) {
  const model = (typeof require === 'function' && typeof module === 'object') ? require('./model.js') : root.Digiface.editorModel;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.editorExport = api; }
})(typeof self !== 'undefined' ? self : this, function (model) {
  'use strict';

  const WHITE = [0xFF, 0xFF, 0xFF];
  // The palette of a GB Studio drawing, like the one of its template (spec/GRID.md): the palest color first, the background; the
  // darkest second; then the marker and the two middle shades. Written as an indexed PNG, as GB Studio's own sheets are.
  const GB_PALETTE = [model.GB_SHADES[3], model.GB_SHADES[0], model.MARKER, model.GB_SHADES[1], model.GB_SHADES[2]];

  // m: a model. Returns {width, height, rgba, palette}: palette is null for a plain image (black on white), and the list of
  // colors for GB Studio. The cells that are not used are background; the marker is magenta, over the writing.
  function renderDrawing(m) {
    const background = m.gb ? model.GB_SHADES[m.background - 1] : WHITE;
    const rgba = new Uint8Array(m.width * m.height * 4);
    for (let o = 0; o < rgba.length; o += 4) { rgba[o] = background[0]; rgba[o + 1] = background[1]; rgba[o + 2] = background[2]; rgba[o + 3] = 255; }
    const shadow = m.renderShadow();
    const writing = m.renderWriting();
    const marker = m.renderWidth();
    for (let o = 0; o < rgba.length; o += 4) {
      if (shadow[o + 3]) { rgba[o] = shadow[o]; rgba[o + 1] = shadow[o + 1]; rgba[o + 2] = shadow[o + 2]; }
      if (writing[o + 3]) { rgba[o] = writing[o]; rgba[o + 1] = writing[o + 1]; rgba[o + 2] = writing[o + 2]; }
      if (marker[o + 3]) { rgba[o] = marker[o]; rgba[o + 1] = marker[o + 1]; rgba[o + 2] = marker[o + 2]; }
    }
    return { width: m.width, height: m.height, rgba, palette: m.gb ? GB_PALETTE : null };
  }

  return { GB_PALETTE, renderDrawing };
});
