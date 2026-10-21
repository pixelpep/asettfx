// UI wiring for the template generator.
(function () {
  'use strict';
  const { charmap, charsets, generate, hintCanvas, fonts, pixelfont } = window.Digiface;
  const $ = id => document.getElementById(id);

  const CUSTOM_HEX = 'custom-hex';
  const CUSTOM_TEXT = 'custom-text';

  const charsetSelect = $('charset');
  for (const p of charsets.presets) charsetSelect.add(new Option(p.label, p.id));
  charsetSelect.add(new Option('Custom: code point ranges (hex)', CUSTOM_HEX));
  charsetSelect.add(new Option('Custom: type the characters', CUSTOM_TEXT));
  charsetSelect.value = 'ascii';

  const fontSelect = $('hintFontChoice');
  for (const f of fonts.FONTS) fontSelect.add(new Option(f.label, f.id));

  // Pixel fonts, read from a file on the user's computer or taken from the bundled ones:
  // {family, label, pixelFont, em, ascent, descent, width}.
  let fileFont = null;
  let fontError = '';  // why the last font could not be used, until another one is chosen
  const bundledCache = {};
  let faceCounter = 0;
  const faces = {};  // the FontFace in use for 'file', so that a new file replaces the old one
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  const isBundled = id => id.indexOf(fonts.BUNDLED) === 0;
  const currentLoaded = () => fontSelect.value === fonts.FILE ? fileFont
    : isBundled(fontSelect.value) ? (bundledCache[fontSelect.value] || null) : null;
  const currentFont = () => fonts.resolve({ id: fontSelect.value, loaded: currentLoaded() });
  const currentEntry = () => fonts.FONTS.find(f => f.id === fontSelect.value);

  const trim = v => String(Math.round(v * 1000) / 1000);

  // The cell a pixel font needs. "letters" is for the plain characters of the font (ASCII): the letters stand on the
  // baseline, one row below it at least. "all" also holds the accents and cedillas of the chosen character set, which can
  // reach much further (Bytesized: 4 x 5 for the letters, 4 x 8 for Latin Extended-A).
  const ASCII = []; for (let cp = 0x21; cp <= 0x7E; cp++) ASCII.push(cp);
  const fitCache = new Map();
  function fitFor(f) {
    const cps = charmap.expandMap(currentMap().map).cells.filter(c => c !== null);
    const key = f.family + '|' + cps.length + '|' + cps[0] + '|' + cps[cps.length - 1];
    if (!fitCache.has(key)) {
      const lift = pixelfont.baseLift(f.family, f.em, makeCanvas);
      const measure = list => {
        const x = pixelfont.extents(f.family, f.em, list, makeCanvas);
        return Object.assign({ width: Math.max(1, x.width), missing: x.missing, total: x.total }, pixelfont.cellFor(x.ascent, x.descent, lift),
          { empty: x.ascent + x.descent === 0 });
      };
      fitCache.set(key, { letters: measure(ASCII), all: measure(cps) });
    }
    return fitCache.get(key);
  }

  function describeFont(f) {
    if (!f) {
      return fontSelect.value === fonts.FILE
        ? 'Choose a .ttf or .otf file. The font stays on your computer; only the grey shapes go into the template.'
        : 'Loading the font...';
    }
    if (!f.pixelFont) return f.label + ' is not a pixel font (its shapes are not made of square pixels), so the characters are fitted to the cell.';
    const { letters, all } = fitFor(f);
    const size = c => c.width + ' x ' + c.height + ' pixels, ' + c.baseline + ' below the baseline' + (c.lift ? ', bottom margin ' + c.lift : '');
    let text = f.label + ' is a pixel font of ' + trim(f.em) + ' px. Its letters fit a cell of ' + size(letters) + '.';
    if (all.height !== letters.height || all.width !== letters.width || all.baseline !== letters.baseline) {
      text += ' With the accents and cedillas of this set: ' + size(all) + '.';
    }
    if (all.missing) text += ' ' + all.missing + ' of the ' + all.total + ' characters have no shape in this font.';
    return text;
  }

  // The panel under the font list: the file chooser, the two buttons that size the cell, and a status line. What is known
  // about the font (sizes, credit) is in the window the "i" button opens.
  function showFontPanel(message) {
    const id = fontSelect.value;
    const panel = id === fonts.FILE || isBundled(id);
    $('hint-font').hidden = !panel;
    const f = panel ? currentLoaded() : null;
    $('fontInfoBtn').hidden = !f;
    if (!panel) return;
    $('fontFile').hidden = id !== fonts.FILE;
    $('fontStatus').textContent = message || fontError || (!f ? describeFont(f) : f.pixelFont ? '' : 'Not a pixel font: the characters are fitted to the cell.');

    const pixel = !!(f && f.pixelFont);
    $('applyFont').hidden = !pixel;
    $('applyFontAll').hidden = true;
    if (pixel) {
      const { letters, all } = fitFor(f);
      const dims = c => ' (' + c.width + ' x ' + c.height + ')';
      $('applyFont').textContent = "Use this font's cell size" + dims(letters);
      $('applyFontAll').hidden = all.height === letters.height && all.width === letters.width && all.baseline === letters.baseline;
      $('applyFontAll').textContent = 'Make room for the accents too' + dims(all);
    }

    // the window of the "i" button
    $('fontDialogTitle').textContent = f ? f.label : '';
    $('fontInfo').textContent = f ? describeFont(f) : '';
    const credit = $('fontCredit');
    credit.textContent = '';
    const entry = currentEntry();
    if (f && entry && entry.bundled) {
      const b = entry.bundled;
      const link = document.createElement('a');
      link.href = b.licenseUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = b.license;
      credit.append(b.label + ' by ' + b.author + ', licensed ', link, '. Included unchanged, see web/fonts/LICENSES.md.');
    }
  }

  // Loads the font bytes into the page and finds out whether it is a pixel font.
  async function makeFont(bytes, label, slot) {
    const family = 'digiface-font-' + (++faceCounter);
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
    if (slot && faces[slot]) document.fonts.delete(faces[slot]);
    if (slot) faces[slot] = face;
    const quoted = '"' + family + '"';
    return Object.assign({ family: quoted, label }, pixelfont.analyze(quoted, makeCanvas));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Cannot load ' + src));
      document.head.appendChild(el);
    });
  }

  async function ensureBundled(id) {
    if (bundledCache[id]) return;
    const entry = fonts.FONTS.find(f => f.id === id).bundled;
    const store = window.Digiface.fontData || {};
    if (!store[entry.id]) await loadScript('fonts/data/' + entry.id + '.js');
    const binary = atob(window.Digiface.fontData[entry.id]);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    bundledCache[id] = await makeFont(bytes, entry.label);
  }

  async function loadFontFile(file) {
    try {
      fileFont = await makeFont(await file.arrayBuffer(), file.name.replace(/\.[^.]*$/, ''), 'file');
      fontError = '';
      showFontPanel();
    } catch (e) {
      fileFont = null;
      fontError = 'This file could not be read as a font.';
      showFontPanel();
    }
    refresh();
  }

  async function onFontChoice() {
    fontError = '';
    showFontPanel();
    const id = fontSelect.value;
    if (isBundled(id) && !bundledCache[id]) {
      try { await ensureBundled(id); showFontPanel(); }
      catch (e) { fontError = 'This font could not be loaded.'; showFontPanel(); }
    }
    refresh();
  }

  let last = null;       // last successful result
  let sequence = 0;      // drops results of superseded runs

  function currentMap() {
    const id = charsetSelect.value;
    if (id === CUSTOM_HEX) {
      const r = charmap.fromHexList($('custom').value);
      return { map: r.tokens, errors: r.errors };
    }
    if (id === CUSTOM_TEXT) return { map: charmap.compress(charmap.fromText($('custom').value)), errors: [] };
    return { map: charsets.presets.find(p => p.id === id).map.slice(), errors: [] };
  }

  // Left padding of the ghost characters, never more than the cell leaves room for.
  const padding = () => Math.max(0, Math.min(num('hintPadding', 0), num('cellW', 8) - 1));
  // Bottom margin of the ghost characters: how far above (negative: below) the baseline they stand.
  const lift = () => Math.max(-64, Math.min(64, num('hintLift', 0)));

  const num = (id, fallback) => {
    const v = parseInt($(id).value, 10);
    return Number.isFinite(v) ? v : fallback;
  };

  function readSettings(map) {
    return {
      name: $('name').value.trim(),
      cellW: num('cellW', 8), cellH: num('cellH', 8), cols: num('cols', 16),
      mode: $('forceMono').checked ? 'mono' : 'var', widthSource: 'magenta',
      map, baseline: num('baseline', 0),
      guide: {
        checker: $('checker').checked,
        baseline: $('baselineTick').checked,
        hint: $('hint').checked ? 'ghost' : 'none',
        prefill: $('prefill').checked,
        hintFont: currentFont().hintFont,
        padding: padding(),
        marginBottom: lift()
      }
    };
  }

  function showMessages(items) {
    const ul = $('messages');
    ul.textContent = '';
    for (const [kind, text] of items) {
      const li = document.createElement('li');
      li.className = kind;
      li.textContent = text;
      ul.appendChild(li);
    }
  }

  // Zoom steps of the + and - buttons beside the preview options.
  const ZOOMS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];
  let zoom = 4;

  function showZoom() {
    $('zoomOut').disabled = zoom <= ZOOMS[0];
    $('zoomIn').disabled = zoom >= ZOOMS[ZOOMS.length - 1];
    $('zoomOut').title = 'Zoom out (now x' + zoom + ')';
    $('zoomIn').title = 'Zoom in (now x' + zoom + ')';
  }

  function stepZoom(direction) {
    const next = direction > 0 ? ZOOMS.find(z => z > zoom) : ZOOMS.slice().reverse().find(z => z < zoom);
    if (next) zoom = next;
    showZoom();
    if (last) drawPreview(last);
  }

  function drawPreview(result) {
    const src = document.createElement('canvas');
    src.width = result.width; src.height = result.height;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height), 0, 0);

    const view = $('preview');
    view.width = result.width * zoom; view.height = result.height * zoom;
    const ctx = view.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, view.width, view.height);
  }

  async function refresh() {
    const run = ++sequence;
    showFileName();
    const chosen = charsetSelect.selectedOptions[0];
    if (chosen) charsetSelect.title = chosen.text;  // the closed list may cut a long label
    const isVar = !$('forceMono').checked;
    $('var-options').hidden = !isVar;
    $('spacing-note').textContent = isVar ? 'Variable spacing: magenta columns mark the unused width of each character.' : '';
    $('spacing-note').hidden = !isVar;
    $('hint-options').hidden = !$('hint').checked;
    $('prefill').disabled = !$('hint').checked;
    $('hintPadding').disabled = !$('hint').checked;  // these two place the ghost characters
    $('hintLift').disabled = !$('hint').checked;
    showFontPanel();
    const custom = charsetSelect.value === CUSTOM_HEX || charsetSelect.value === CUSTOM_TEXT;
    $('custom-row').hidden = !custom;
    $('custom-label').textContent = charsetSelect.value === CUSTOM_HEX
      ? 'Ranges, e.g. 0020-007E 00C0-00FF 20AC (use _ for an empty cell)'
      : 'Characters, one cell each, in this order';

    const { map, errors } = currentMap();
    const messages = errors.map(e => ['error', e]);
    const cols = num('cols', 16);
    const cells = charmap.expandMap(map).cells;
    const count = cells.filter(c => c !== null).length;
    const unused = cells.length - count;
    $('count').textContent = count + ' characters' + (unused ? ' and ' + unused + ' unused cells' : '') + ', ' + (cols >= 1 ? generate.rowsFor(map, cols) : '?') + ' rows';

    let result = { ok: false, errors: [] };
    if (!errors.length && map.length) {
      const font = currentFont();
      const hint = hintCanvas.create({ fontFamily: font.family, weight: font.weight, align: font.align, padding: padding(), lift: lift(), exactSize: font.exactSize });
      result = await generate.generate(readSettings(map), hint);
    } else if (!map.length && !errors.length) {
      messages.push(['error', 'Add at least one character']);
    }
    if (run !== sequence) return;

    if (!result.ok) {
      for (const e of result.errors) messages.push(['error', e]);
      last = null;
      $('download').disabled = true;
      $('size').textContent = '';
      $('meta').textContent = '';
      showMessages(messages);
      return;
    }
    for (const w of result.warnings) messages.push(['warn', w]);
    showMessages(messages);
    last = result;
    $('download').disabled = false;
    $('size').textContent = result.width + ' x ' + result.height + ' px, ' + (result.png.length / 1024).toFixed(1) + ' KB';
    $('meta').textContent = JSON.stringify(result.meta, null, 2);
    drawPreview(result);
  }

  // Shows, right after the name field, the name the file will really be saved under.
  function showFileName() {
    const saved = generate.fileName($('name').value, num('cellW', 8), num('cellH', 8));
    $('filename').textContent = '\u2192 ' + saved;
    $('filename').title = 'Saved as ' + saved;
  }

  $('download').addEventListener('click', () => {
    if (!last) return;
    const url = URL.createObjectURL(new Blob([last.png], { type: 'image/png' }));
    const a = document.createElement('a');
    a.href = url; a.download = generate.fileName(last.meta.name, last.meta.cell.w, last.meta.cell.h);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  charsetSelect.addEventListener('change', () => {
    const p = charsets.presets.find(x => x.id === charsetSelect.value);
    if (p) $('cols').value = p.cols;
    refresh();
  });

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 120); };
  for (const el of document.querySelectorAll('#settings input, #settings select, #settings textarea, #name, #checker, #baselineTick')) {
    el.addEventListener('input', schedule);
    el.addEventListener('change', schedule);
  }
  $('settings').addEventListener('submit', e => e.preventDefault());
  // opened, the metadata sit beside the image (two thirds / one third); folded, the image has the whole width
  $('metaBox').addEventListener('toggle', () => { document.querySelector('.split').classList.toggle('meta-open', $('metaBox').open); });
  $('zoomOut').addEventListener('click', () => stepZoom(-1));
  $('zoomIn').addEventListener('click', () => stepZoom(1));
  showZoom();
  $('fontFile').addEventListener('change', () => { if ($('fontFile').files[0]) loadFontFile($('fontFile').files[0]); });
  fontSelect.addEventListener('change', onFontChoice);
  function applyFit(which) {
    const f = currentLoaded();
    if (!f || !f.pixelFont) return;
    const c = fitFor(f)[which];
    $('cellW').value = c.width;
    $('cellH').value = c.height;
    $('baseline').value = c.baseline;
    $('hintLift').value = c.lift;
    $('hintPadding').value = 0;
    refresh();
  }
  $('fontInfoBtn').addEventListener('click', () => { if (!$('fontInfoBtn').hidden) $('fontDialog').showModal(); });
  $('fontDialog').addEventListener('click', e => { if (e.target === $('fontDialog')) $('fontDialog').close(); });  // a click outside closes it
  $('applyFont').addEventListener('click', () => applyFit('letters'));
  $('applyFontAll').addEventListener('click', () => applyFit('all'));
  $('name').addEventListener('input', showFileName);  // immediately, without waiting for the preview

  window.Digiface.app = { refresh, state: () => last };
  refresh();
})();
