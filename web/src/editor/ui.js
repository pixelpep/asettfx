// The viewer and the editor, one component: in the page, in the place of the preview, with a header (zoom, fit, full screen) that
// is always there, the view in the middle and the view options on the right. While editing, the tools are added on the left and
// undo, redo and Done in the header. The page gives it the layers (generate.layers) after every change of its settings, and
// starts and stops the editing. The drawing stays visible when the editing stops.
// Browser only. Milestones 1 to 4: the layers, the view (zoom, hand), the brush and the eraser with the palette and the history,
// the width layer, and the rectangle selection with its clipboard.
// docs/EDITOR.md sections 5, 6 and 10.
(function () {
  'use strict';
  const { editorView: view, editorModel: model, editorTools: tools, editorHistory: historyModule, editorSelection: selection } = window.Digiface;
  const $ = id => document.getElementById(id);

  const editorEl = $('editor');
  const stage = $('edStage');
  const canvas = $('edCanvas');
  const SIZES = [1, 2, 3, 4];     // the sizes of the brush and of the eraser offered
  const WHEEL_STEP = 40;  // wheel distance (in pixels) for one step of zoom

  let m = null;                  // the model of the drawing
  let layers = null;             // one canvas per layer, as big as the sheet
  let v = { zoom: 1, x: 0, y: 0 };
  let tool = 'hand';
  let spaceDown = false;         // the space bar is held: the hand, whatever the tool
  let panning = null;            // {id, x, y, view} while the view is dragged
  let wheelSum = 0;
  let pointer = null;            // last position of the pointer in the stage, or null
  let observer = null;
  let writing = null;            // {image: ImageData, ctx}: the writing layer, updated pixel by pixel while drawing
  let history = null;
  let stroke = null;             // {id, stroke}: the gesture of the brush or the eraser in progress
  let color = 1;                 // the number of the color of the palette
  let shownLayout = null;        // the layout the view was fitted for
  let fitted = true;             // the view is the fitted one, so it follows the size of the stage; zooming or moving it by hand ends that
  let size = 1;                  // the size of the brush and of the eraser, in pixels
  let clip = true;               // a stroke stays in the cell where it started
  let zoomOnCell = false;        // a click in a cell first zooms on that cell
  let focusedCell = null;        // the index of the cell the view was zoomed on, until the view is moved by hand
  let guides = true;             // the visual guides: the guide characters, the checkerboard, the baseline ticks, the limits of the cells
  let lastPoint = null;          // the last pixel painted: the start of a line drawn with Shift
  let shiftDown = false;
  let session = null;            // {layout, model, history}: the drawing kept while the page stays open
  let editing = false;
  let selRect = null;            // the selection, {x, y, w, h} in pixels of the sheet, or null
  let floating = null;           // the selection lifted off the layer, moving (see selection.js), with its canvas
  let clipboard = null;          // the buffer copied or cut, kept for the pastes of this page
  let selDrag = null;            // {id, mode: 'new' | 'move', ...} while the pointer defines or moves the selection

  const stageSize = () => ({ width: stage.clientWidth, height: stage.clientHeight });
  const imageSize = () => ({ width: m.width, height: m.height });

  function toCanvas(rgba, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    return c;
  }

  function stagePoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function typing(target) {
    return !!target && target.matches && target.matches('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=""], [contenteditable=true]');
  }

  // ---- drawing of the view
  function draw() {
    if (!m) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const dx = Math.round(v.x * dpr), dy = Math.round(v.y * dpr);
    const dw = Math.round(m.width * v.zoom * dpr), dh = Math.round(m.height * v.zoom * dpr);
    // from the bottom: the background (plain when the guides are off), the guide characters, the drop shadows, the writing, the widths
    const order = guides ? [layers.background, layers.template, layers.shadow, layers.writing, layers.width] : [layers.plain, layers.shadow, layers.writing, layers.width];
    const swapped = m.gb && m.background !== 4;   // Switch changed the background: a plain sheet of that color replaces the first layer
    if (swapped) {
      ctx.fillStyle = 'rgb(' + m.palette[m.background - 1].join(',') + ')';
      ctx.fillRect(dx, dy, dw, dh);
      order.shift();
    }
    for (const layer of order) ctx.drawImage(layer, 0, 0, m.width, m.height, dx, dy, dw, dh);
    ctx.strokeStyle = 'rgba(0,255,0,.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx - 0.5, dy - 0.5, dw + 1, dh + 1);
    if (guides && m.cellW * v.zoom >= 6) {
      // "difference" keeps the lines visible on a pale background as well as on a dark one
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < m.cols; c++) { const x = dx + Math.round(c * m.cellW * v.zoom * dpr) + 0.5; ctx.moveTo(x, dy); ctx.lineTo(x, dy + dh); }
      for (let r = 1; r < m.rows; r++) { const y = dy + Math.round(r * m.cellH * v.zoom * dpr) + 0.5; ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y); }
      ctx.stroke();
      ctx.restore();
    }
    drawHiddenInkCue(ctx, dpr);
    drawCellLabels(ctx, dpr);
    drawSelection(ctx, dpr);
    drawBrushOutline(ctx, dpr);
    $('edZoomLabel').textContent = Math.round(v.zoom * 100) + '%';
    showStatus();
  }

  // Above 3000 % of zoom, the character of each cell in view, in a small square box set in its top left corner, with no margin:
  // white on black, framed by 1 pixel of the green of the page (a character that cannot be seen, such as a space, shows its code,
  // in a wider box).
  const LABEL_ZOOM = 30;
  function drawCellLabels(ctx, dpr) {
    if (v.zoom <= LABEL_ZOOM) return;
    const s = stageSize();
    const cw = m.cellW * v.zoom, ch = m.cellH * v.zoom;
    const col0 = Math.max(0, Math.floor(-v.x / cw)), col1 = Math.min(m.cols - 1, Math.floor((s.width - v.x) / cw));
    const row0 = Math.max(0, Math.floor(-v.y / ch)), row1 = Math.min(m.rows - 1, Math.floor((s.height - v.y) / ch));
    const size = Math.round(24 * dpr);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = row0; row <= row1; row++) for (let col = col0; col <= col1; col++) {
      const cp = m.cells[row * m.cols + col];
      if (cp === null || cp === undefined) continue;
      const char = String.fromCodePoint(cp);
      const blank = /^[\p{Cc}\p{Zs}\p{Cf}]$/u.test(char);
      const text = blank ? 'U+' + cp.toString(16).toUpperCase().padStart(4, '0') : char;
      ctx.font = '600 ' + Math.round((blank ? 9 : 15) * dpr) + 'px "Source Sans 3", system-ui, sans-serif';
      const w = blank ? Math.max(size, Math.round(ctx.measureText(text).width + 10 * dpr)) : size;
      const a = view.toStage(v, col * m.cellW, row * m.cellH);
      const x = Math.round(a.x * dpr), y = Math.round(a.y * dpr);
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, size);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, size - 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + w / 2, y + size / 2 + Math.round(dpr));
    }
    ctx.restore();
  }

  // A yellow frame on each cell that has drawing under its width marker: the marker hides it, so it could not be seen otherwise.
  function drawHiddenInkCue(ctx, dpr) {
    if (!editing || !m.variable) return;
    const list = m.warnings();
    if (!list.length) return;
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
    for (const w of list) {
      const a = view.toStage(v, w.col * m.cellW, w.row * m.cellH);
      const inset = ctx.lineWidth / 2;
      ctx.strokeRect(Math.round(a.x * dpr) + inset, Math.round(a.y * dpr) + inset, Math.round(m.cellW * v.zoom * dpr) - ctx.lineWidth, Math.round(m.cellH * v.zoom * dpr) - ctx.lineWidth);
    }
  }

  // The square the brush or the eraser would cover under the pointer, with the colors partly inverted under it (45%), so that the
  // zone shows on any background without hiding the pixels; with Shift held, the line it would draw from the last pixel painted.
  function drawBrushOutline(ctx, dpr) {
    if (!editing || !pointer || panning || handActive()) return;
    const p = view.toImage(v, pointer.x, pointer.y);
    if (tool === 'width') { drawWidthIndicator(ctx, dpr, p.x, p.y); return; }
    if (tool !== 'brush' && tool !== 'eraser') return;
    const px = Math.floor(p.x), py = Math.floor(p.y);
    const n = tools.clampSize(size);
    const o = Math.floor((n - 1) / 2);
    const rect = (x, y) => {
      const a = view.toStage(v, x - o, y - o);
      return [Math.round(a.x * dpr), Math.round(a.y * dpr), Math.round(n * v.zoom * dpr), Math.round(n * v.zoom * dpr)];
    };
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = 0.45;                       // part of the inversion only, so that the pixels under it stay readable
    ctx.fillStyle = '#fff';
    if (shiftDown && lastPoint) {
      ctx.beginPath();
      for (const [x, y] of tools.line(lastPoint.x, lastPoint.y, px, py)) ctx.rect(...rect(x, y));
      ctx.fill();
    } else {
      ctx.fillRect(...rect(px, py));
    }
    ctx.restore();
  }

  // What the Width tool would do in the cell under the pointer (or in the cell it started in, while it is down): the new marker
  // from the border the pointer is nearest to, over the marker that is there, a bright line on that border and the new width
  // in a badge, so that the value shows on the canvas.
  function drawWidthIndicator(ctx, dpr, ix, iy) {
    if (!m.variable) return;
    const cell = stroke && stroke.onWidth ? stroke.cell : m.cellAt(ix, iy);
    if (!cell || !cell.assigned) return;
    const width = tools.widthAt(m, cell, ix);
    const top = view.toStage(v, cell.x0 + width, cell.y0);
    const hPx = Math.round(m.cellH * v.zoom * dpr), wPx = Math.round((m.cellW - width) * v.zoom * dpr);
    const x = Math.round(top.x * dpr), y = Math.round(top.y * dpr);
    if (wPx > 0) {  // the new marker, over the old one
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(x, y, wPx, hPx);
    }
    const line = Math.max(2, Math.round(dpr * 2));
    ctx.fillStyle = '#000';
    ctx.fillRect(x - line, y, line * 3, hPx);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - Math.floor(line / 2), y, line, hPx);
    // the badge with the new width, above the cell (inside it when the cell is at the top of the view)
    const text = String(width);
    const size = Math.max(11, Math.round(12 * dpr));
    ctx.font = '700 ' + size + 'px system-ui, sans-serif';
    const tw = Math.ceil(ctx.measureText(text).width) + Math.round(10 * dpr);
    const th = size + Math.round(6 * dpr);
    const bx = Math.max(0, Math.min(canvas.width - tw, x - Math.round(tw / 2)));
    const by = y - th - Math.round(3 * dpr) >= 0 ? y - th - Math.round(3 * dpr) : y + Math.round(3 * dpr);
    ctx.fillStyle = '#000';
    ctx.fillRect(bx, by, tw, th);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, bx + tw / 2, by + th / 2 + 1);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = stageSize();
    canvas.width = Math.max(1, Math.round(s.width * dpr));
    canvas.height = Math.max(1, Math.round(s.height * dpr));
    canvas.style.width = s.width + 'px';
    canvas.style.height = s.height + 'px';
    if (m) { v = fitted ? view.fit(imageSize(), s) : view.clamp(v, imageSize(), s); draw(); }
  }

  function showStatus() {
    const el = $('edStatus');
    if (!pointer) { el.textContent = m.cols + ' x ' + m.rows + ' cells of ' + m.cellW + ' x ' + m.cellH + ' px'; return; }
    const p = view.toImage(v, pointer.x, pointer.y);
    const cell = m.cellAt(p.x, p.y);
    if (!cell) { el.textContent = 'Outside the sheet'; return; }
    const what = cell.assigned ? model.describe(cell.cp) + (m.variable ? ', width ' + cell.glyph.width : '') : 'unused cell';
    const chosen = floating ? floatRect() : selRect;
    el.textContent = 'x ' + Math.floor(p.x) + ', y ' + Math.floor(p.y) + '  |  row ' + (cell.row + 1) + ', column ' + (cell.col + 1) + '  |  ' + what
      + (chosen ? '  |  selection ' + chosen.w + ' x ' + chosen.h : '');
  }

  // ---- the writing layer
  // What changed, as the model gives it: pixels of the writing layer ({x, y, value}) and widths ({kind: 'width', cp, width}).
  function applyUpdates(list) {
    if (!list || !list.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    let widths = false, shadows = false, pixels = false, background = false;
    const data = writing.image.data;
    for (const p of list) {
      if (p.kind === 'width') { widths = true; continue; }
      if (p.kind === 'shadows') { shadows = true; continue; }
      if (p.kind === 'background') { background = true; continue; }
      pixels = true;
      const rgba = m.rgbaOf(p.value);
      const o = (p.y * m.width + p.x) * 4;
      data[o] = rgba[0]; data[o + 1] = rgba[1]; data[o + 2] = rgba[2]; data[o + 3] = rgba[3];
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
    if (x1 >= 0) writing.ctx.putImageData(writing.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    if (pixels || background) announce();
    if (shadows || (pixels && m.shadows.length)) {   // a shadow follows the pixels it copies
      layers.shadow.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.renderShadow()), m.width, m.height), 0, 0);
      if (shadows) showShadows();
    }
    if (widths) layers.width.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.renderWidth()), m.width, m.height), 0, 0);
    draw();
  }

  // Tells the page that what is drawn changed (the Drawing button needs to know whether there is anything to download).
  const hasInk = () => !!m && Array.from(m.glyphs.values()).some(g => g.pixels.some(Boolean));
  function announce() { document.dispatchEvent(new CustomEvent('digiface-drawing-changed')); }

  function showHistory() {
    announce();
    $('edUndo').disabled = !history.canUndo() || !!stroke;
    $('edRedo').disabled = !history.canRedo() || !!stroke;
  }
  // ---- the selection
  const floatRect = () => floating && { x: floating.x, y: floating.y, w: floating.buffer.w, h: floating.buffer.h };

  function bufferCanvas(buffer) {
    const rgba = new Uint8Array(buffer.w * buffer.h * 4);
    buffer.pixels.forEach((value, i) => { if (value) rgba.set(m.rgbaOf(value), i * 4); });
    return toCanvas(rgba, buffer.w, buffer.h);
  }

  function showSelection() {
    const has = !!(selRect || floating);
    $('edSelection').hidden = tool !== 'select';
    $('edSelCut').disabled = !has;
    $('edSelCopy').disabled = !has;
    $('edSelDelete').disabled = !has;
    $('edSelPaste').disabled = !clipboard;
  }

  // Places the floating selection where it is, as one gesture for the history; the selection stays on what was placed.
  function commitFloat() {
    if (!floating) return;
    const done = selection.commit(m, floating);
    selRect = floatRect();
    floating = null;
    applyUpdates(done.updates);
    history.push(done.changes);
    showHistory();
    showSelection();
  }

  // Puts back what was lifted and forgets the float; the selection returns to where it was taken.
  function cancelFloat() {
    if (!floating) return;
    const updates = selection.cancel(m, floating);
    selRect = floating.from ? { x: floating.from.x, y: floating.from.y, w: floating.buffer.w, h: floating.buffer.h } : null;
    floating = null;
    applyUpdates(updates);
    showSelection();
    draw();
  }

  // Lifts the selected pixels off the layer so that they can move.
  function liftSelection() {
    if (floating || !selRect) return;
    const lifted = selection.lift(m, selRect);
    floating = lifted.float;
    floating.canvas = bufferCanvas(floating.buffer);
    selRect = null;
    applyUpdates(lifted.updates);
    showSelection();
  }

  function copySelection() {
    const rect = floating ? floatRect() : selRect;
    if (!rect) return false;
    clipboard = floating ? floating.buffer : selection.readBuffer(m, rect);
    showSelection();
    return true;
  }

  // Clears the selected pixels, as one gesture; the selection stays on the place.
  function deleteSelection() {
    if (floating) {   // what was lifted is gone: the clearing is the gesture
      const changes = selection.merge(floating.restore);
      selRect = floatRect();
      floating = null;
      history.push(changes);
      showHistory();
    } else if (selRect) {
      const cleared = selection.clearRect(m, selRect);
      applyUpdates(cleared.updates);
      history.push(cleared.changes);
      showHistory();
    }
    showSelection();
    draw();
  }

  // Clears the whole drawing (the widths stay), after a warning, as one gesture: undo brings everything back.
  function deleteImage() {
    if (stroke || selDrag) return;
    if (floating) cancelFloat();
    let pixels = 0, chars = 0;
    for (const g of m.glyphs.values()) {
      const n = g.pixels.reduce((k, v) => k + (v ? 1 : 0), 0);
      pixels += n; if (n) chars++;
    }
    if (!pixels) return;
    if (!window.confirm('Delete the whole image? ' + pixels + ' drawn pixel' + (pixels === 1 ? '' : 's') + ' in ' + chars + ' character' + (chars === 1 ? '' : 's') + ' will be cleared. Undo brings them back.')) return;
    selRect = null;
    const cleared = selection.clearRect(m, { x: 0, y: 0, w: m.width, h: m.height });
    applyUpdates(cleared.updates);
    history.push(cleared.changes);
    showHistory();
    showSelection();
    draw();
  }

  function cutSelection() { if (copySelection()) deleteSelection(); }

  // A paste floats at the pointer when it is over the sheet, else at the center of the view; it is placed when something else is done.
  function pasteClipboard() {
    if (!clipboard) return;
    commitFloat();
    selectTool('select');
    const s = stageSize();
    const at = pointer ? view.toImage(v, pointer.x, pointer.y) : view.toImage(v, s.width / 2, s.height / 2);
    const x = Math.floor(at.x), y = Math.floor(at.y);
    const inSheet = x >= 0 && y >= 0 && x < m.width && y < m.height;
    const center = view.toImage(v, s.width / 2, s.height / 2);
    floating = selection.pasteFloat(m, clipboard, inSheet ? x : Math.floor(center.x), inSheet ? y : Math.floor(center.y));
    floating.canvas = bufferCanvas(floating.buffer);
    selRect = null;
    showSelection();
    draw();
  }

  function nudge(dx, dy) {
    if (!selRect && !floating) return;
    liftSelection();
    selection.moveTo(m, floating, floating.x + dx, floating.y + dy);
    draw();
  }

  function selectAllOfCell(x, y) {
    const rect = selection.cellRect(m, x, y);
    if (!rect) return;
    commitFloat();
    selRect = rect;
    showSelection();
    draw();
  }

  // A dotted line of 2 screen pixels with the colors inverted at 50%, so that it shows on any background without hiding the pixels.
  function outline(ctx, dpr, r) {
    const a = view.toStage(v, r.x, r.y);
    const width = Math.max(1, Math.round(2 * dpr));
    const x = Math.round(a.x * dpr), y = Math.round(a.y * dpr);
    const w = Math.round(r.w * v.zoom * dpr), h = Math.round(r.h * v.zoom * dpr);
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = width;
    ctx.setLineDash([Math.round(3 * dpr), Math.round(3 * dpr)]);
    ctx.strokeRect(x + width / 2, y + width / 2, Math.max(1, w - width), Math.max(1, h - width));
    ctx.restore();
  }

  function drawSelection(ctx, dpr) {
    if (!editing) return;
    if (floating) {
      const b = floating.buffer;
      const a = view.toStage(v, floating.x, floating.y);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(floating.canvas, 0, 0, b.w, b.h, Math.round(a.x * dpr), Math.round(a.y * dpr), Math.round(b.w * v.zoom * dpr), Math.round(b.h * v.zoom * dpr));
      outline(ctx, dpr, floatRect());
    } else if (selRect) {
      outline(ctx, dpr, selRect);
    }
  }

  function undo() { if (stroke || selDrag) return; if (floating) { cancelFloat(); return; } selRect = null; showSelection(); applyUpdates(history.undo(m)); showHistory(); }
  function redo() { if (stroke || selDrag || floating) return; selRect = null; showSelection(); applyUpdates(history.redo(m)); showHistory(); }

  function strokeAt(e) {
    const p = stagePoint(e);
    const i = view.toImage(v, p.x, p.y);
    const x = Math.floor(i.x), y = Math.floor(i.y);
    if (stroke.onWidth) { applyUpdates(stroke.stroke.add(i.x, i.y)); return; }   // the Width tool takes the position as it is
    lastPoint = { x, y };
    applyUpdates(stroke.stroke.add(x, y));
  }

  function endStroke() {
    if (!stroke) return;
    history.push(stroke.stroke.end());
    stroke = null;
    showHistory();
  }

  // ---- view
  function setView(next) { fitted = false; focusedCell = null; v = view.clamp(next, imageSize(), stageSize()); draw(); }

  function zoomTo(zoom, px, py) {
    const s = stageSize();
    setView(view.zoomAt(v, zoom, px === undefined ? s.width / 2 : px, py === undefined ? s.height / 2 : py));
  }
  const zoomStep = (direction, px, py) => zoomTo(view.stepZoom(v, direction), px, py);
  // The view fitted on one cell, centered, with a small margin.
  function fitToCell(cell) {
    const s = stageSize(), margin = 24;
    const zoom = Math.min(view.ZOOMS[view.ZOOMS.length - 1], Math.max(1, (s.width - 2 * margin) / m.cellW), Math.max(1, (s.height - 2 * margin) / m.cellH));
    fitted = false;
    v = view.clamp({ zoom, x: Math.round(s.width / 2 - (cell.x0 + m.cellW / 2) * zoom), y: Math.round(s.height / 2 - (cell.y0 + m.cellH / 2) * zoom) }, imageSize(), s);
    focusedCell = cell.index;
    draw();
  }

  function fit() { focusedCell = null; fitted = true; v = view.fit(imageSize(), stageSize()); draw(); }

  // ---- tools
  function handActive() { return !editing || tool === 'hand' || spaceDown; }

  function showCursor() {
    stage.classList.toggle('hand', handActive());
    stage.classList.toggle('panning', !!panning);
  }

  function selectTool(name) {
    if (name === 'width' && !(m && m.variable)) return;
    if (tool === 'select' && name !== 'select') { commitFloat(); selRect = null; }
    tool = name;
    const opts = document.querySelector('#editor .ed-options');
    if (opts) opts.classList.toggle('width-mode', name === 'width');
    for (const b of document.querySelectorAll('#editor .tool')) {
      const on = b.dataset.tool === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    showCursor();
    if (m) showSelection();
    draw();
  }

  function setSpace(on) {
    if (spaceDown === on) return;
    spaceDown = on;
    showCursor();
  }

  function endPan() {
    if (!panning) return;
    panning = null;
    showCursor();
  }

  // ---- events of the view
  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });  // no autoscroll with the middle button
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (!m) return;
    if (e.button === 1 || (e.button === 0 && handActive())) {
      e.preventDefault();
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY, view: v };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer may be gone already */ }
      showCursor();
    } else if (e.button === 0 && tool === 'select') {
      e.preventDefault();
      const i = view.toImage(v, stagePoint(e).x, stagePoint(e).y);
      const x = Math.floor(i.x), y = Math.floor(i.y);
      const target = floating ? floatRect() : selRect;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer may be gone already */ }
      if (target && selection.inside(target, x, y)) {          // inside the selection: it moves with the pointer
        liftSelection();
        selDrag = { id: e.pointerId, mode: 'move', dx: x - floating.x, dy: y - floating.y };
      } else {                                                 // elsewhere: what floats is placed, and a new selection starts
        commitFloat();
        selRect = null;
        const ax = Math.max(0, Math.min(m.width - 1, x)), ay = Math.max(0, Math.min(m.height - 1, y));
        selDrag = { id: e.pointerId, mode: 'new', ax, ay, moved: false };
      }
      showSelection();
      draw();
    } else if (e.button === 0 && (tool === 'brush' || tool === 'eraser' || tool === 'width')) {
      e.preventDefault();
      const onWidth = tool === 'width';
      const p0 = view.toImage(v, stagePoint(e).x, stagePoint(e).y);
      if (zoomOnCell) {                                 // the first click in a cell zooms on it; the next ones, in it, act
        const target = m.cellAt(p0.x, p0.y);
        if (target && target.assigned && target.index !== focusedCell) { fitToCell(target); return; }
      }
      stroke = { id: e.pointerId, onWidth, cell: onWidth ? m.cellAt(p0.x, p0.y) : null, stroke: onWidth ? tools.beginWidthStroke(m) : tools.beginStroke(m, { tool, size, color, clip }) };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer may be gone already */ }
      if (!onWidth && e.shiftKey && lastPoint) applyUpdates(stroke.stroke.add(lastPoint.x, lastPoint.y));  // Shift: a line from the last pixel painted
      strokeAt(e);
      showHistory();
    }
  });
  canvas.addEventListener('pointermove', e => {
    pointer = stagePoint(e);
    shiftDown = e.shiftKey;
    if (panning && e.pointerId === panning.id) {
      setView(view.pan(panning.view, e.clientX - panning.x, e.clientY - panning.y));
    } else if (stroke && e.pointerId === stroke.id) {
      strokeAt(e);
      showStatus();
    } else if (selDrag && e.pointerId === selDrag.id) {
      const i = view.toImage(v, pointer.x, pointer.y);
      const x = Math.floor(i.x), y = Math.floor(i.y);
      if (selDrag.mode === 'move') selection.moveTo(m, floating, x - selDrag.dx, y - selDrag.dy);
      else {
        selDrag.moved = selDrag.moved || x !== selDrag.ax || y !== selDrag.ay;
        selRect = selection.normalize(m, selDrag.ax, selDrag.ay, Math.max(0, Math.min(m.width - 1, x)), Math.max(0, Math.min(m.height - 1, y)));
      }
      draw();
    } else {
      draw();
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (panning && e.pointerId === panning.id) endPan();
    if (stroke && e.pointerId === stroke.id) endStroke();
    if (selDrag && e.pointerId === selDrag.id) {
      if (selDrag.mode === 'new' && !selDrag.moved) selRect = null;   // a click that does not drag selects nothing
      selDrag = null;
      showSelection();
      draw();
    }
  });
  canvas.addEventListener('dblclick', e => {   // a double click selects the whole cell
    if (!editing || tool !== 'select') return;
    const i = view.toImage(v, stagePoint(e).x, stagePoint(e).y);
    selectAllOfCell(Math.floor(i.x), Math.floor(i.y));
  });
  canvas.addEventListener('pointercancel', () => { endPan(); endStroke(); selDrag = null; });
  canvas.addEventListener('pointerleave', () => { if (!panning && !stroke) { pointer = null; draw(); } });

  stage.addEventListener('wheel', e => {
    if (!m) return;
    e.preventDefault();
    const p = stagePoint(e);
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {  // also the pinch of a trackpad
      wheelSum += e.deltaY * unit;
      if (Math.abs(wheelSum) >= WHEEL_STEP) {
        zoomStep(wheelSum < 0 ? 1 : -1, p.x, p.y);
        wheelSum = 0;
      }
    } else {
      setView(view.pan(v, -e.deltaX * unit, -e.deltaY * unit));
    }
  }, { passive: false });

  // ---- keyboard, while the editor is open
  function onKeyDown(e) {
    if (e.key === 'Shift' && !shiftDown) { shiftDown = true; draw(); }
    if (e.code === 'Space') {
      // a space in a field, or on a control of the page outside the editor that has the focus, keeps its meaning; in the editor,
      // whatever button was clicked last, it is the hand
      const inside = e.target && e.target.closest && e.target.closest('#editor');
      if (!inside && e.target && e.target.matches && e.target.matches('input, textarea, select, button, summary, [contenteditable=""], [contenteditable=true]')) return;
      e.preventDefault();
      if (!e.repeat) setSpace(true);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !typing(e.target)) {  // undo and redo
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y' && e.ctrlKey) { e.preventDefault(); redo(); }
      else if (k === 'c') { if (copySelection()) e.preventDefault(); }
      else if (k === 'x') { if (selRect || floating) { e.preventDefault(); cutSelection(); } }
      else if (k === 'v') { if (clipboard) { e.preventDefault(); pasteClipboard(); } }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    switch (e.key) {
      case 'h': case 'H': selectTool('hand'); break;
      case 'b': case 'B': selectTool('brush'); break;
      case 'e': case 'E': selectTool('eraser'); break;
      case 'x': case 'X': selectTool(tool === 'brush' ? 'eraser' : 'brush'); break;
      case '[': setSize(SIZES[Math.max(0, SIZES.indexOf(size) - 1)]); break;
      case ']': setSize(SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(size) + 1)]); break;
      case '0': fit(); break;
      case 'w': case 'W': selectTool('width'); break;
      case 'm': case 'M': selectTool('select'); break;
      case 'Enter': if (floating) commitFloat(); else return; break;
      case 'Delete': case 'Backspace': if (selRect || floating) deleteSelection(); else return; break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        if (tool !== 'select' || !(selRect || floating)) return;
        { const n = e.shiftKey ? 4 : 1; nudge(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0); }
        break;
      case '1': case '2': case '3': case '4': setSize(Number(e.key)); break;
      case '+': case '=': zoomStep(1); break;
      case '-': case '_': zoomStep(-1); break;
      case 'Escape':
        if (floating) cancelFloat();
        else if (selRect) { selRect = null; showSelection(); draw(); }
        else if (!document.fullscreenElement) document.dispatchEvent(new CustomEvent('digiface-editor-done'));
        break;
      default: return;
    }
    e.preventDefault();
  }
  function onKeyUp(e) {
    if (e.code === 'Space') { setSpace(false); if (e.target && e.target.closest && e.target.closest('#editor')) e.preventDefault(); }
    if (e.key === 'Shift') { shiftDown = false; draw(); }
  }
  function onBlur() { setSpace(false); endPan(); shiftDown = false; }

  // ---- tool options
  function setSize(value) {
    size = SIZES.includes(value) ? value : 1;
    for (const b of document.querySelectorAll('#edSizes .size')) {
      const on = Number(b.dataset.size) === size;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    draw();
  }

  function showColors() {
    const names = model.COLOR_NAMES[m.gb ? 'gbstudio' : 'plain'];
    const box = $('edColors');
    box.textContent = '';
    m.palette.forEach((rgb, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (i + 1 === color ? ' active' : '');
      b.style.background = 'rgb(' + rgb.join(',') + ')';
      b.title = names[i] + (m.palette.length > 1 ? ' (' + (i + 1) + ' of ' + m.palette.length + ')' : '');
      b.setAttribute('aria-label', names[i]);
      b.setAttribute('aria-pressed', i + 1 === color ? 'true' : 'false');
      b.addEventListener('click', () => {  // choosing a color is going back to the writing
        color = i + 1;
        if (tool !== 'brush') selectTool('brush');
        showColors();
      });
      box.appendChild(b);
    });
    $('edSwitch').hidden = !m.gb;                                // swapping colors needs more than one
    $('edToolWidth').hidden = !m.variable;                       // only a variable font has widths
    if (!m.variable && tool === 'width') selectTool('brush');
  }

  // ---- switching two colors
  let switchPick = [1, 2];
  function showSwitch() {
    const names = model.COLOR_NAMES.gbstudio;
    ['switchA', 'switchB'].forEach((id, k) => {
      const box = $(id);
      box.textContent = '';
      m.palette.forEach((rgb, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch' + (switchPick[k] === i + 1 ? ' active' : '');
        b.style.background = 'rgb(' + rgb.join(',') + ')';
        b.title = names[i];
        b.setAttribute('aria-label', names[i]);
        b.setAttribute('aria-pressed', switchPick[k] === i + 1 ? 'true' : 'false');
        b.addEventListener('click', () => { switchPick[k] = i + 1; showSwitch(); });
        box.appendChild(b);
      });
    });
    $('switchOk').disabled = switchPick[0] === switchPick[1];
  }
  function openSwitch() {
    if (!m.gb || stroke || selDrag) return;
    if (floating) commitFloat();
    switchPick = [color, color === 1 ? 2 : 1];
    showSwitch();
    $('switchDialog').showModal();
  }
  function doSwitch() {
    const done = selection.swapColors(m, switchPick[0], switchPick[1]);
    if (!done.changes.length) return;
    applyUpdates(done.updates);
    history.push(done.changes);
    showHistory();
    draw();
  }
  $('edSwitch').addEventListener('click', openSwitch);
  $('switchForm').addEventListener('submit', e => {
    if (e.submitter && e.submitter.value === 'ok' && switchPick[0] !== switchPick[1]) doSwitch();
  });

  // ---- drop shadows (GB Studio)
  // A shadow is a copy of the pixels of one color, under the writing; the tiles at the end of the tool bar list them.
  const swatchStyle = i => 'rgb(' + m.palette[i - 1].join(',') + ')';
  const sameShadows = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function showShadows() {
    const box = $('edShadows');
    const on = !!(m && m.gb);
    $('edShadow').hidden = !on;
    box.hidden = !on || !m.shadows.length;
    box.textContent = '';
    if (!on) return;
    const names = model.COLOR_NAMES.gbstudio;
    for (const s of m.shadows) {
      const tile = document.createElement('div');
      tile.className = 'shadow-tile';
      const open = document.createElement('button');
      open.type = 'button'; open.className = 'open';
      open.title = 'Drop shadow of ' + names[s.source - 1] + ' in ' + names[s.color - 1] + ': click to change its settings';
      const chips = document.createElement('span');
      chips.className = 'chips';
      for (const [k, i] of [[0, s.source], [1, s.color]]) {
        if (k) chips.append('\u203a');
        const c = document.createElement('i');
        c.className = 'chip'; c.style.background = swatchStyle(i);
        chips.appendChild(c);
      }
      const text = document.createElement('span');
      text.textContent = 'x' + (s.dx > 0 ? '+' : '') + s.dx + ' y' + (s.dy > 0 ? '+' : '') + s.dy + ' t' + s.thickness;
      open.append(chips, text);
      open.addEventListener('click', () => openShadow(s.id));
      const trash = document.createElement('button');
      trash.type = 'button'; trash.className = 'trash';
      trash.setAttribute('aria-label', 'Delete this drop shadow'); trash.title = 'Delete this drop shadow';
      trash.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5"/></svg>';
      trash.addEventListener('click', () => changeShadows(m.shadows.filter(o => o.id !== s.id)));
      tile.append(open, trash);
      box.appendChild(tile);
    }
  }

  // One gesture for the history: the list of shadows before and after.
  function changeShadows(list) {
    if (sameShadows(list, m.shadows)) return;
    const before = m.shadows.map(s => Object.assign({}, s));
    const after = list.map(s => Object.assign({}, s));
    applyUpdates([m.setShadows(after)]);
    history.push([{ kind: 'shadows', before, after }]);
    showHistory();
  }

  let shadowDraft = null, shadowEditing = null;
  function showShadowPickers() {
    const names = model.COLOR_NAMES.gbstudio;
    for (const [id, key] of [['shadowSource', 'source'], ['shadowColor', 'color']]) {
      const box = $(id);
      box.textContent = '';
      m.palette.forEach((rgb, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch' + (shadowDraft[key] === i + 1 ? ' active' : '');
        b.style.background = 'rgb(' + rgb.join(',') + ')';
        b.title = names[i]; b.setAttribute('aria-label', names[i]);
        b.setAttribute('aria-pressed', shadowDraft[key] === i + 1 ? 'true' : 'false');
        b.addEventListener('click', () => { shadowDraft[key] = i + 1; showShadowPickers(); });
        box.appendChild(b);
      });
    }
  }
  function openShadow(id) {
    if (!m.gb || stroke || selDrag) return;
    if (floating) commitFloat();
    const found = id ? m.shadows.find(s => s.id === id) : null;
    shadowEditing = found ? found.id : null;
    shadowDraft = found ? Object.assign({}, found) : { source: color, color: color <= 2 ? 3 : 1, thickness: 1, dx: 1, dy: 1 };
    $('shadowThickness').value = shadowDraft.thickness; $('shadowX').value = shadowDraft.dx; $('shadowY').value = shadowDraft.dy;
    $('shadowTitle').textContent = found ? 'Change the drop shadow' : 'Drop shadow';
    $('shadowOk').textContent = found ? 'Apply' : 'Add';
    showShadowPickers();
    $('shadowDialog').showModal();
  }
  const clampInt = (v, lo, hi, fallback) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
  $('edShadow').addEventListener('click', () => openShadow(null));
  $('shadowForm').addEventListener('submit', e => {
    if (!e.submitter || e.submitter.value !== 'ok') return;
    const s = Object.assign({}, shadowDraft, {
      thickness: clampInt($('shadowThickness').value, 1, 4, 1), dx: clampInt($('shadowX').value, -4, 4, 1), dy: clampInt($('shadowY').value, -4, 4, 1)
    });
    if (shadowEditing) changeShadows(m.shadows.map(o => o.id === shadowEditing ? Object.assign({}, s, { id: o.id }) : o));
    else changeShadows(m.shadows.concat([Object.assign(s, { id: m.shadows.reduce((k, o) => Math.max(k, o.id), 0) + 1 })]));
  });

  // ---- buttons and panels
  $('edSelCut').addEventListener('click', cutSelection);
  $('edSelCopy').addEventListener('click', copySelection);
  $('edSelPaste').addEventListener('click', pasteClipboard);
  $('edSelDelete').addEventListener('click', deleteSelection);
  $('edDeleteImage').addEventListener('click', deleteImage);
  $('edUndo').addEventListener('click', undo);
  $('edRedo').addEventListener('click', redo);
  for (const b of document.querySelectorAll('#edSizes .size')) b.addEventListener('click', () => setSize(Number(b.dataset.size)));
  $('edClip').addEventListener('change', e => { clip = e.target.checked; });
  $('edZoomIn').addEventListener('click', () => zoomStep(1));
  $('edZoomOut').addEventListener('click', () => zoomStep(-1));
  $('edFit').addEventListener('click', fit);
  for (const b of document.querySelectorAll('#editor .tool:not([disabled])')) b.addEventListener('click', () => selectTool(b.dataset.tool));
  $('edGuides').addEventListener('change', e => { guides = e.target.checked; draw(); });
  $('edZoomCell').addEventListener('change', e => { zoomOnCell = e.target.checked; focusedCell = null; });

  const canFullscreen = typeof editorEl.requestFullscreen === 'function';
  $('edFullscreen').hidden = !canFullscreen;
  $('edFullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else editorEl.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    $('edFullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  });

  // ---- open and close
  // result: what generate.layers gives (the metadata, the background, the ghost and the advances).
  const draftLayers = result => ({
    background: toCanvas(result.background, m.width, m.height),
    plain: toCanvas(result.plainBackground, m.width, m.height),
    template: toCanvas(result.ghost, m.width, m.height),
    shadow: toCanvas(m.renderShadow(), m.width, m.height),
    writing: toCanvas(m.renderWriting(), m.width, m.height),
    width: toCanvas(m.renderWidth(), m.width, m.height)
  });

  function useModel(next) {
    m = next;
    stroke = null;
    showColors();
    showShadows();
    showHistory();
  }

  function describeImpact(report) {
    const lines = [];
    if (report.lostGlyphs) lines.push(report.lostGlyphs + ' drawn character' + (report.lostGlyphs > 1 ? 's are' : ' is') + ' not in the new layout and will lose ' + (report.lostGlyphs > 1 ? 'their drawing.' : 'its drawing.'));
    if (report.croppedPixels) lines.push(report.croppedPixels + ' drawn pixel' + (report.croppedPixels > 1 ? 's' : '') + ' of ' + report.croppedGlyphs + ' character' + (report.croppedGlyphs > 1 ? 's' : '') + ' fall outside the new cell size and will be cut (the left and the bottom edges stay in place).');
    if (report.lostShadows) lines.push(report.lostShadows + ' drop shadow' + (report.lostShadows > 1 ? 's' : '') + ' will be removed (they are for GB Studio).');
    if (report.lossyColors) lines.push("GB Studio's two light shades will be removed and the two dark ones become black.");
    return lines.join('\n') + '\nContinue?';
  }

  // What a layout change (a metadata: {cell, map, target...}) would do to the drawing in hand; see model.impact.
  function impact(meta) {
    return session ? model.impact(session.model, meta) : { hasWork: false, lostGlyphs: 0, croppedPixels: 0, croppedGlyphs: 0, lossyColors: false, lostShadows: 0 };
  }

  // Shows the layers of generate.layers, with the drawing when it has this layout (the session of the editor), and a blank sheet
  // of the layout otherwise: the drawing of another layout is kept for when the layout comes back, or for the next editing.
  function showLayers(result) {
    const layout = model.layoutKey(result.meta);
    if (session && session.layout === layout) {
      m = session.model;
      m.meta = result.meta;
      history = session.history;
    } else {
      m = model.create(result.meta, result.advances);
      history = historyModule.create();
    }
    layers = draftLayers(result);
    writing = { image: new ImageData(new Uint8ClampedArray(m.renderWriting()), m.width, m.height), ctx: layers.writing.getContext('2d') };
    color = Math.min(color, m.palette.length);
    useModel(m);
    editorEl.hidden = false;
    resize();
    if (shownLayout !== layout) { fitted = true; v = view.fit(imageSize(), stageSize()); shownLayout = layout; }
    draw();
  }

  // Starts the editing, with the layers of generate.layers. The drawing is kept while the page stays open: the same layout gives
  // it back, another layout carries the drawings of the characters over when the cell keeps its size (and asks before it loses
  // something). Returns false when the user keeps the drawing instead.
  function start(result) {
    const layout = model.layoutKey(result.meta);
    let next = null;
    if (session && session.layout === layout) {
      next = session.model;
    } else {
      if (session) {
        const report = model.impact(session.model, result.meta);
        if (model.risky(report) && !window.confirm(describeImpact(report))) return false;
        next = model.relayout(session.model, result.meta, result.advances).model;
      } else if (m && model.layoutKey(m.meta) === layout) {
        next = m;                                   // what the viewer shows is the sheet to draw on
      } else {
        next = model.create(result.meta, result.advances);
      }
      session = { layout, model: next, history: historyModule.create() };
    }
    editing = true;
    editorEl.classList.add('editing');
    selectTool('hand');
    panning = null; spaceDown = false; shiftDown = false; pointer = null; wheelSum = 0;
    showLayers(result);
    fitted = true; resize();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return true;
  }

  // The settings of the page changed: new guide layers. While editing, and when the layout changed (GB Studio), the drawing
  // follows its characters (the page asked about the loss before, with impact()); when the editing is stopped, a changed
  // layout shows a blank sheet and the drawing waits.
  function update(result) {
    const layout = model.layoutKey(result.meta);
    if (editing && session && session.layout !== layout) {
      commitFloat();
      selRect = null;
      const next = model.relayout(session.model, result.meta, result.advances).model;
      session = { layout, model: next, history: historyModule.create() };
      m = next;
      shownLayout = null;
    }
    showLayers(result);
  }

  function stop() {
    if (!editing) return;
    commitFloat();
    selRect = null; selDrag = null;
    editing = false;
    editorEl.classList.remove('editing');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    panning = null; stroke = null; spaceDown = false; shiftDown = false;
    resize();
    draw();
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(stage);

  // The widths the guide font gives (one per cell, as generate.layers: advances), against the ones of the drawing: the glyphs that
  // would change, [{kind: 'width', cp, before, after}]. Empty unless the font is variable.
  function widthChanges(advances) {
    const list = [];
    if (!m || !m.variable || !advances) return list;
    m.cells.forEach((cp, i) => {
      if (cp === null) return;
      const g = m.glyphs.get(cp), after = Math.max(1, Math.min(m.cellW, advances[i]));
      if (g.width !== after) list.push({ kind: 'width', cp, before: g.width, after });
    });
    return list;
  }

  // Gives these widths to the glyphs, as one gesture for the history.
  function applyWidths(changes) {
    if (!changes.length) return;
    applyUpdates(changes.map(c => m.setWidth(c.cp, c.after)));
    history.push(changes);
    showHistory();
  }

  window.Digiface.editor = {
    hasInk, widthChanges, applyWidths, start, update, stop, impact, describe: describeImpact, isOpen: () => editing, model: () => m,
    warnings: () => (m ? m.warnings() : []),
    state: () => ({ selection: selRect, floating: floating && { x: floating.x, y: floating.y, w: floating.buffer.w, h: floating.buffer.h }, hasClipboard: !!clipboard, tool, spaceDown, view: v, guides, handActive: handActive(), color, size, clip, shiftDown, lastPoint, canUndo: history.canUndo(), canRedo: history.canRedo() })
  };
})();
