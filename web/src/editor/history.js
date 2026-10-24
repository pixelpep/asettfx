// Undo and redo of the editor. An entry is the list of what a gesture changed: pixels, [{cp, i, before, after}], and widths,
// [{kind: 'width', cp, before, after}], the list of drop shadows, [{kind: 'shadows', before, after}], and the background color, [{kind: 'background', before, after}].
// Pure, no DOM. docs/EDITOR.md section 5.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Digiface = root.Digiface || {}; root.Digiface.editorHistory = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function create(limit) {
    const max = limit || 500;
    let undoStack = [];
    let redoStack = [];

    function apply(model, changes, key, reverse) {
      const updated = [];
      const list = reverse ? changes.slice().reverse() : changes;
      for (const c of list) updated.push(c.kind === 'width' ? model.setWidth(c.cp, c[key]) : c.kind === 'shadows' ? model.setShadows(c[key]) : c.kind === 'background' ? model.setBackground(c[key]) : model.setPixel(c.cp, c.i, c[key]));
      return updated;
    }

    return {
      // A new gesture. An empty one is ignored, and a new one ends the redo.
      push(changes) {
        if (!changes || !changes.length) return;
        undoStack.push(changes);
        if (undoStack.length > max) undoStack.shift();
        redoStack = [];
      },
      // Each of these returns what changed, as the model gives it (setPixel: {x, y, value}, setWidth: {kind: 'width', cp, width}),
      // or null when there is nothing to do.
      undo(model) {
        const changes = undoStack.pop();
        if (!changes) return null;
        redoStack.push(changes);
        return apply(model, changes, 'before', true);
      },
      redo(model) {
        const changes = redoStack.pop();
        if (!changes) return null;
        undoStack.push(changes);
        return apply(model, changes, 'after', false);
      },
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      clear() { undoStack = []; redoStack = []; },
      size: () => undoStack.length
    };
  }

  return { create };
});
