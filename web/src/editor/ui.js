// The viewer and the editor, one component: in the page, in the place of the preview, with a header (zoom, fit, full screen) that
// is always there, the view in the middle and the view options on the right. While editing, the tools are added on the left and
// undo, redo and Done in the header. The page gives it the layers (generate.layers) after every change of its settings, and
// starts and stops the editing. The drawing stays visible when the editing stops.
// Browser only. Milestones 1 to 3: the layers, the view (zoom, hand), the brush and the eraser with the palette and the history,
// the width layer and the warnings.
// docs/EDITOR.md sections 5, 6 and 10.
(function () {
  'use strict';
  const { editorView: view, editorModel: model, editorTools: tools, editorHistory: historyModule } = window.Digiface;
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
    // from the bottom: the background (plain when the guides are off), the guide characters, the writing, the widths
    const order = guides ? [layers.background, layers.template, layers.writing, layers.width] : [layers.plain, layers.writing, layers.width];
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
    drawBrushOutline(ctx, dpr);
    $('edZoomLabel').textContent = Math.round(v.zoom * 100) + '%';
    showStatus();
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

  // The square the brush or the eraser would cover under the pointer, with the colors inverted under it, so that the zone shows
  // on any background; with Shift held, the line it would draw from the last pixel painted.
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
    el.textContent = 'x ' + Math.floor(p.x) + ', y ' + Math.floor(p.y) + '  |  row ' + (cell.row + 1) + ', column ' + (cell.col + 1) + '  |  ' + what;
  }

  // ---- the writing layer
  // What changed, as the model gives it: pixels of the writing layer ({x, y, value}) and widths ({kind: 'width', cp, width}).
  function applyUpdates(list) {
    if (!list || !list.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    let widths = false;
    const data = writing.image.data;
    for (const p of list) {
      if (p.kind === 'width') { widths = true; continue; }
      const rgba = m.rgbaOf(p.value);
      const o = (p.y * m.width + p.x) * 4;
      data[o] = rgba[0]; data[o + 1] = rgba[1]; data[o + 2] = rgba[2]; data[o + 3] = rgba[3];
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
    if (x1 >= 0) writing.ctx.putImageData(writing.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    if (widths) layers.width.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.renderWidth()), m.width, m.height), 0, 0);
    draw();
  }

  function showHistory() {
    $('edUndo').disabled = !history.canUndo() || !!stroke;
    $('edRedo').disabled = !history.canRedo() || !!stroke;
  }
  function undo() { if (stroke) return; applyUpdates(history.undo(m)); showHistory(); }
  function redo() { if (stroke) return; applyUpdates(history.redo(m)); showHistory(); }

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
    tool = name;
    const opts = document.querySelector('#editor .ed-options');
    if (opts) opts.classList.toggle('width-mode', name === 'width');
    for (const b of document.querySelectorAll('#editor .tool')) {
      const on = b.dataset.tool === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    showCursor();
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
    } else {
      draw();
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (panning && e.pointerId === panning.id) endPan();
    if (stroke && e.pointerId === stroke.id) endStroke();
  });
  canvas.addEventListener('pointercancel', () => { endPan(); endStroke(); });
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
      case '1': case '2': case '3': case '4': setSize(Number(e.key)); break;
      case '+': case '=': zoomStep(1); break;
      case '-': case '_': zoomStep(-1); break;
      case 'Escape': if (!document.fullscreenElement) document.dispatchEvent(new CustomEvent('digiface-editor-done')); break;
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
    $('edToolWidth').hidden = !m.variable;                       // only a variable font has widths
    if (!m.variable && tool === 'width') selectTool('brush');
  }

  // ---- buttons and panels
  $('edUndo').addEventListener('click', undo);
  $('edRedo').addEventListener('click', redo);
  for (const b of document.querySelectorAll('#edSizes .size')) b.addEventListener('click', () => setSize(Number(b.dataset.size)));
  $('edClip').addEventListener('change', e => { clip = e.target.checked; });
  $('edZoomIn').addEventListener('click', () => zoomStep(1));
  $('edZoomOut').addEventListener('click', () => zoomStep(-1));
  $('edFit').addEventListener('click', fit);
  $('edDone').addEventListener('click', () => document.dispatchEvent(new CustomEvent('digiface-editor-done')));
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
    writing: toCanvas(m.renderWriting(), m.width, m.height),
    width: toCanvas(m.renderWidth(), m.width, m.height)
  });

  function useModel(next) {
    m = next;
    stroke = null;
    showColors();
    showHistory();
  }

  function describeImpact(report) {
    const lines = [];
    if (!report.sameCell) lines.push('The cell size changed: the drawing starts again.');
    else if (report.lostGlyphs) lines.push(report.lostGlyphs + ' drawn character' + (report.lostGlyphs > 1 ? 's are' : ' is') + ' not in the new layout and will be lost.');
    if (report.lossyColors) lines.push("GB Studio's two light shades will be removed and the two dark ones become black.");
    return lines.join('\n') + '\nContinue?';
  }

  // What a layout change (a metadata: {cell, map, target...}) would do to the drawing in hand; see model.impact.
  function impact(meta) {
    return session ? model.impact(session.model, meta) : { hasWork: false, sameCell: true, lostGlyphs: 0, lossyColors: false };
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
        if (report.hasWork && (report.lostGlyphs || report.lossyColors) && !window.confirm(describeImpact(report))) return false;
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
      const next = model.relayout(session.model, result.meta, result.advances).model;
      session = { layout, model: next, history: historyModule.create() };
      m = next;
      shownLayout = null;
    }
    showLayers(result);
  }

  function stop() {
    if (!editing) return;
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

  window.Digiface.editor = {
    start, update, stop, impact, describe: describeImpact, isOpen: () => editing, model: () => m,
    warnings: () => (m ? m.warnings() : []),
    state: () => ({ tool, spaceDown, view: v, guides, handActive: handActive(), color, size, clip, shiftDown, lastPoint, canUndo: history.canUndo(), canRedo: history.canRedo() })
  };
})();
