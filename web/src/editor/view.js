// The view of the editor: zoom and position of the image in the stage. Pure functions, no DOM. docs/EDITOR.md section 5.
// A view is {zoom, x, y}: x and y are the position, in pixels of the stage, of the top-left corner of the image.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.editorView = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Whole steps keep every pixel of the image the same size on the screen; 0.25 and 0.5 are for very large sheets.
  const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
  // However far the image is pushed aside, at least this many screen pixels of it stay in the stage.
  const MIN_VISIBLE = 48;

  const nearest = zoom => ZOOMS.reduce((best, z) => Math.abs(z - zoom) < Math.abs(best - zoom) ? z : best, ZOOMS[0]);

  // image: {width, height}, stage: {width, height}
  function centered(zoom, image, stage) {
    return { zoom, x: Math.round((stage.width - image.width * zoom) / 2), y: Math.round((stage.height - image.height * zoom) / 2) };
  }

  // The largest zoom at which the whole image fits in the stage, with a small margin around it, centered. It is not limited to
  // the steps of the list: the image fills the stage as much as it can (a tiny image is enlarged up to the greatest step).
  function fit(image, stage, margin) {
    const m = margin === undefined ? 12 : margin;
    const room = { width: Math.max(1, stage.width - 2 * m), height: Math.max(1, stage.height - 2 * m) };
    const zoom = Math.max(ZOOMS[0] / 2, Math.min(ZOOMS[ZOOMS.length - 1], room.width / image.width, room.height / image.height));
    return centered(zoom, image, stage);
  }

  // Another zoom, with the point (px, py) of the stage staying on the same pixel of the image.
  function zoomAt(view, zoom, px, py) {
    const ix = (px - view.x) / view.zoom;
    const iy = (py - view.y) / view.zoom;
    return { zoom, x: Math.round(px - ix * zoom), y: Math.round(py - iy * zoom) };
  }

  // The next zoom of the list above (direction > 0) or below (direction < 0) the current one.
  function stepZoom(view, direction) {
    const current = nearest(view.zoom);
    const i = ZOOMS.indexOf(current);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (direction > 0 ? 1 : -1)))];
    return next;
  }

  function pan(view, dx, dy) { return { zoom: view.zoom, x: view.x + dx, y: view.y + dy }; }

  // Keeps at least MIN_VISIBLE pixels of the image in the stage (less when the image itself is smaller than that).
  function clamp(view, image, stage) {
    const w = image.width * view.zoom;
    const h = image.height * view.zoom;
    const keepX = Math.min(MIN_VISIBLE, w);
    const keepY = Math.min(MIN_VISIBLE, h);
    return {
      zoom: view.zoom,
      x: Math.round(Math.max(keepX - w, Math.min(stage.width - keepX, view.x))),
      y: Math.round(Math.max(keepY - h, Math.min(stage.height - keepY, view.y)))
    };
  }

  // A point of the stage as a point of the image (not rounded), and back.
  function toImage(view, sx, sy) { return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom }; }
  function toStage(view, ix, iy) { return { x: view.x + ix * view.zoom, y: view.y + iy * view.zoom }; }

  return { ZOOMS, MIN_VISIBLE, fit, zoomAt, stepZoom, pan, clamp, toImage, toStage, nearest };
});
