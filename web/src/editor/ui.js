// The editor screen: a full window with the tools on the left, the layers on the right, the view in the middle.
// Browser only. Milestone 1: the layers are shown, the view can be zoomed and moved. docs/EDITOR.md sections 5, 6 and 10.
(function () {
  'use strict';
  const { editorView: view, editorModel: model } = window.Digiface;
  const $ = id => document.getElementById(id);

  const editorEl = $('editor');
  const stage = $('edStage');
  const canvas = $('edCanvas');
  const LAYERS = ['background', 'template', 'writing', 'width'];  // from the bottom
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
  const visible = { background: true, template: true, writing: true, width: true };
  let showGrid = false;

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
    for (const name of LAYERS) if (visible[name]) ctx.drawImage(layers[name], 0, 0, m.width, m.height, dx, dy, dw, dh);
    ctx.strokeStyle = 'rgba(0,255,0,.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx - 0.5, dy - 0.5, dw + 1, dh + 1);
    if (showGrid && m.cellW * v.zoom >= 6) {
      ctx.strokeStyle = 'rgba(0,255,0,.35)';
      ctx.beginPath();
      for (let c = 1; c < m.cols; c++) { const x = dx + Math.round(c * m.cellW * v.zoom * dpr) + 0.5; ctx.moveTo(x, dy); ctx.lineTo(x, dy + dh); }
      for (let r = 1; r < m.rows; r++) { const y = dy + Math.round(r * m.cellH * v.zoom * dpr) + 0.5; ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y); }
      ctx.stroke();
    }
    $('edZoomLabel').textContent = Math.round(v.zoom * 100) + '%';
    showStatus();
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
    }
  });
  canvas.addEventListener('pointermove', e => {
    pointer = stagePoint(e);
    if (panning && e.pointerId === panning.id) {
      setView(view.pan(panning.view, e.clientX - panning.x, e.clientY - panning.y));
    } else {
      showStatus();
    }
  });
  canvas.addEventListener('pointerup', e => { if (panning && e.pointerId === panning.id) endPan(); });
  canvas.addEventListener('pointercancel', endPan);
  canvas.addEventListener('pointerleave', () => { if (!panning) { pointer = null; showStatus(); } });

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
    if (e.code === 'Space') {
      if (typing(e.target)) return;  // a space in a text field stays a space
      e.preventDefault();
      if (!e.repeat) setSpace(true);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    switch (e.key) {
      case 'h': case 'H': selectTool('hand'); break;
      case '0': fit(); break;
      case '1': actual(); break;
      case '+': case '=': zoomStep(1); break;
      case '-': case '_': zoomStep(-1); break;
      case 'Escape': close(); break;
      default: return;
    }
    e.preventDefault();
  }
  function onKeyUp(e) { if (e.code === 'Space') { setSpace(false); } }
  function onBlur() { setSpace(false); endPan(); }

  // ---- buttons and panels
  $('edZoomIn').addEventListener('click', () => zoomStep(1));
  $('edZoomOut').addEventListener('click', () => zoomStep(-1));
  $('edFit').addEventListener('click', fit);
  $('edActual').addEventListener('click', actual);
  $('edClose').addEventListener('click', () => close());
  for (const b of document.querySelectorAll('#editor .tool:not([disabled])')) b.addEventListener('click', () => selectTool(b.dataset.tool));
  for (const name of LAYERS) {
    $('edLayer' + name[0].toUpperCase() + name.slice(1)).addEventListener('change', e => { visible[name] = e.target.checked; draw(); });
  }
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
  function open(result) {
    m = model.create(result.meta, result.advances);
    layers = {
      background: toCanvas(result.background, m.width, m.height),
      template: toCanvas(result.ghost, m.width, m.height),
      writing: toCanvas(m.renderWriting(), m.width, m.height),
      width: toCanvas(m.renderWidth(), m.width, m.height)
    };
    $('edRowWidth').hidden = !m.variable;
    visible.width = true; $('edLayerWidth').checked = true;
    selectTool('hand');
    panning = null; spaceDown = false; pointer = null; wheelSum = 0;
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

  window.Digiface.editor = { open, close, isOpen: () => !editorEl.hidden, state: () => ({ tool, spaceDown, view: v, visible: Object.assign({}, visible), showGrid, handActive: handActive() }) };
})();
