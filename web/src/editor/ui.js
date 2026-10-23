// The editor screen: a full window with the tools on the left, the layers on the right, the view in the middle.
// Browser only. Milestones 1 and 2: the layers, the view (zoom, hand), the brush and the eraser with the palette and the history.
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
  let size = 1;                  // the size of the brush and of the eraser, in pixels
  let clip = true;               // a stroke stays in the cell where it started
  let guides = true;             // the visual guides: the guide characters, the checkerboard, the baseline ticks
  let showGrid = false;
  let lastPoint = null;          // the last pixel painted: the start of a line drawn with Shift
  let shiftDown = false;
  let session = null;            // {key, model, history}: the drawing kept while the page stays open

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
    if (showGrid && m.cellW * v.zoom >= 6) {
      // "difference" keeps the lines visible on a pale background as well as on a dark one
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < m.cols; c++) { const x = dx + Math.round(c * m.cellW * v.zoom * dpr) + 0.5; ctx.moveTo(x, dy); ctx.lineTo(x, dy + dh); }
      for (let r = 1; r < m.rows; r++) { const y = dy + Math.round(r * m.cellH * v.zoom * dpr) + 0.5; ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y); }
      ctx.stroke();
      ctx.restore();
    }
    drawBrushOutline(ctx, dpr);
    $('edZoomLabel').textContent = Math.round(v.zoom * 100) + '%';
    showStatus();
  }

  // The square the brush or the eraser would cover under the pointer, semi-transparent in the color of the brush (red for the
  // eraser); with Shift held, the line it would draw from the last pixel painted.
  function drawBrushOutline(ctx, dpr) {
    if (!pointer || panning || handActive() || (tool !== 'brush' && tool !== 'eraser')) return;
    const p = view.toImage(v, pointer.x, pointer.y);
    const px = Math.floor(p.x), py = Math.floor(p.y);
    const n = tools.clampSize(size);
    const o = Math.floor((n - 1) / 2);
    const rgb = tool === 'eraser' ? [255, 0, 102] : m.palette[color - 1];
    const fill = 'rgba(' + rgb.join(',') + ',' + (tool === 'eraser' ? .4 : .55) + ')';
    const rect = (x, y) => {
      const a = view.toStage(v, x - o, y - o);
      return [Math.round(a.x * dpr), Math.round(a.y * dpr), Math.round(n * v.zoom * dpr), Math.round(n * v.zoom * dpr)];
    };
    ctx.fillStyle = fill;
    if (shiftDown && lastPoint) {
      ctx.beginPath();
      for (const [x, y] of tools.line(lastPoint.x, lastPoint.y, px, py)) ctx.rect(...rect(x, y));
      ctx.fill();
    } else {
      ctx.fillRect(...rect(px, py));
    }
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(255,0,102,.95)' : 'rgba(0,255,0,.95)';
    ctx.lineWidth = 1;
    const r = rect(px, py);
    ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = stageSize();
    canvas.width = Math.max(1, Math.round(s.width * dpr));
    canvas.height = Math.max(1, Math.round(s.height * dpr));
    canvas.style.width = s.width + 'px';
    canvas.style.height = s.height + 'px';
    if (m) { v = view.clamp(v, imageSize(), s); draw(); }
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
  function applyPixels(list) {
    if (!list || !list.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const data = writing.image.data;
    for (const p of list) {
      const rgba = m.rgbaOf(p.value);
      const o = (p.y * m.width + p.x) * 4;
      data[o] = rgba[0]; data[o + 1] = rgba[1]; data[o + 2] = rgba[2]; data[o + 3] = rgba[3];
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
    writing.ctx.putImageData(writing.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    draw();
  }

  function showHistory() {
    $('edUndo').disabled = !history.canUndo() || !!stroke;
    $('edRedo').disabled = !history.canRedo() || !!stroke;
  }
  function undo() { if (stroke) return; applyPixels(history.undo(m)); showHistory(); }
  function redo() { if (stroke) return; applyPixels(history.redo(m)); showHistory(); }

  function strokeAt(e) {
    const p = stagePoint(e);
    const i = view.toImage(v, p.x, p.y);
    const x = Math.floor(i.x), y = Math.floor(i.y);
    lastPoint = { x, y };
    applyPixels(stroke.stroke.add(x, y));
  }

  function endStroke() {
    if (!stroke) return;
    history.push(stroke.stroke.end());
    stroke = null;
    showHistory();
  }

  // ---- view
  function setView(next) { v = view.clamp(next, imageSize(), stageSize()); draw(); }

  function zoomTo(zoom, px, py) {
    const s = stageSize();
    setView(view.zoomAt(v, zoom, px === undefined ? s.width / 2 : px, py === undefined ? s.height / 2 : py));
  }
  const zoomStep = (direction, px, py) => zoomTo(view.stepZoom(v, direction), px, py);
  const fit = () => setView(view.fit(imageSize(), stageSize()));
  const actual = () => setView(view.actual(imageSize(), stageSize()));

  // ---- tools
  function handActive() { return tool === 'hand' || spaceDown; }

  function showCursor() {
    stage.classList.toggle('hand', handActive());
    stage.classList.toggle('panning', !!panning);
  }

  function selectTool(name) {
    tool = name;
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
    } else if (e.button === 0 && (tool === 'brush' || tool === 'eraser')) {
      e.preventDefault();
      stroke = { id: e.pointerId, stroke: tools.beginStroke(m, { tool, size, color, clip }) };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer may be gone already */ }
      if (e.shiftKey && lastPoint) applyPixels(stroke.stroke.add(lastPoint.x, lastPoint.y));  // Shift: a line from the last pixel painted
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
      if (typing(e.target)) return;  // a space in a text field stays a space
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
      case '1': actual(); break;
      case '+': case '=': zoomStep(1); break;
      case '-': case '_': zoomStep(-1); break;
      case 'Escape': close(); break;
      default: return;
    }
    e.preventDefault();
  }
  function onKeyUp(e) {
    if (e.code === 'Space') setSpace(false);
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
      b.addEventListener('click', () => {
        color = i + 1;
        if (tool !== 'brush') selectTool('brush');
        showColors();
      });
      box.appendChild(b);
    });
  }

  // ---- buttons and panels
  $('edUndo').addEventListener('click', undo);
  $('edRedo').addEventListener('click', redo);
  for (const b of document.querySelectorAll('#edSizes .size')) b.addEventListener('click', () => setSize(Number(b.dataset.size)));
  $('edClip').addEventListener('change', e => { clip = e.target.checked; });
  $('edZoomIn').addEventListener('click', () => zoomStep(1));
  $('edZoomOut').addEventListener('click', () => zoomStep(-1));
  $('edFit').addEventListener('click', fit);
  $('edActual').addEventListener('click', actual);
  $('edClose').addEventListener('click', () => close());
  for (const b of document.querySelectorAll('#editor .tool:not([disabled])')) b.addEventListener('click', () => selectTool(b.dataset.tool));
  $('edGuides').addEventListener('change', e => { guides = e.target.checked; draw(); });
  $('edGrid').addEventListener('change', e => { showGrid = e.target.checked; draw(); });

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
  const hasWork = model_ => { for (const g of model_.glyphs.values()) if (g.pixels.some(Boolean)) return true; return false; };

  // result: what generate.layers gives (the metadata, the background, the ghost and the advances). The drawing is kept while the
  // page stays open: opening again with the same settings gives it back; with other settings it asks before starting over.
  // Returns false when the user keeps the drawing instead.
  function open(result) {
    const key = JSON.stringify({ meta: result.meta, advances: result.advances });
    if (session && session.key === key) {
      m = session.model; history = session.history;
    } else {
      if (session && hasWork(session.model) &&
          !window.confirm('The settings changed since your drawing. Start a new drawing? The current one will be lost.')) return false;
      m = model.create(result.meta, result.advances);
      history = historyModule.create();
      session = { key, model: m, history };
      lastPoint = null;
    }
    layers = {
      background: toCanvas(result.background, m.width, m.height),
      plain: toCanvas(result.plainBackground, m.width, m.height),
      template: toCanvas(result.ghost, m.width, m.height),
      writing: toCanvas(m.renderWriting(), m.width, m.height),
      width: toCanvas(m.renderWidth(), m.width, m.height)
    };
    writing = { image: new ImageData(new Uint8ClampedArray(m.renderWriting()), m.width, m.height), ctx: layers.writing.getContext('2d') };
    stroke = null; color = 1;
    $('edClip').checked = clip;
    $('edGuides').checked = guides;
    $('edGrid').checked = showGrid;
    setSize(size);
    showColors();
    showHistory();
    selectTool('hand');
    panning = null; spaceDown = false; shiftDown = false; pointer = null; wheelSum = 0;
    editorEl.hidden = false;
    document.body.classList.add('editing');
    resize();
    v = view.fit(imageSize(), stageSize());
    draw();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    if (typeof ResizeObserver === 'function') { observer = new ResizeObserver(resize); observer.observe(stage); }
    editorEl.focus();
    return true;
  }

  function close() {
    if (editorEl.hidden) return;
    editorEl.hidden = true;
    document.body.classList.remove('editing');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    if (observer) { observer.disconnect(); observer = null; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    panning = null; spaceDown = false;
    const button = $('edit');
    if (button) button.focus();
  }

  window.Digiface.editor = {
    open, close, isOpen: () => !editorEl.hidden, model: () => m,
    state: () => ({ tool, spaceDown, view: v, guides, showGrid, handActive: handActive(), color, size, clip, shiftDown, lastPoint, canUndo: history.canUndo(), canRedo: history.canRedo() })
  };
})();
