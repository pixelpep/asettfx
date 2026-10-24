// UI wiring for the template generator.
(function () {
  'use strict';
  const { charmap, charsets, generate, hintCanvas, fonts, pixelfont, metadata, png } = window.Digiface;
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
    showFitRows();
    if (!panel) return;
    $('fontFile').hidden = id !== fonts.FILE;
    $('fontStatus').textContent = message || fontError || (!f ? describeFont(f) : f.pixelFont ? '' : 'Not a pixel font: the characters are fitted to the cell.');

    applyLocks();

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
    if (editing) { showFitRows(); onFitChange(); } else refresh();
  }

  let last = null;       // last successful result
  let sequence = 0;      // drops results of superseded runs

  function currentMap() { return mapOf(charsetSelect.value); }

  // The map of a character set of the list (a preset, or the custom entries), and its errors.
  function mapOf(id) {
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

  // The controls that cannot change, now: the layout in GB Studio mode (and the cell size while the guide font decides it). The others can: the guides only redraw, and a change of the layout makes the drawing follow its characters.
  const GB_LOCKED = ['charset', 'cellW', 'cellH', 'cols', 'checker', 'baselineTick'];
  const EDIT_LOCKED = [];   // nothing: a change of the pre-fill asks first (onPrefillChange)
  let editing = false;
  function applyLocks() {
    const gb = $('gbstudio').checked;
    $('gbLabel').textContent = gb ? 'GB Studio Font' : 'GB Studio';
    const locked = new Set();
    if (gb) for (const id of GB_LOCKED) locked.add(id);
    if (editing) for (const id of EDIT_LOCKED) locked.add(id);
    if (fitActive()) { locked.add('cellW'); locked.add('cellH'); }   // the guide font decides the cell size
    for (const id of new Set([...GB_LOCKED, ...EDIT_LOCKED, 'cellW', 'cellH'])) $(id).disabled = locked.has(id);
    $('fitFont').disabled = gb || !fitFont();
    $('fitAccents').disabled = $('fitFont').disabled;
    $('fitRow').title = gb ? 'The cell size is fixed in GB Studio mode' : fitFont() ? 'Takes the cell size, the baseline and the bottom margin the guide font needs' : 'Only for a pixel font';
  }

  // "Use the guide font's cell size": the cell size follows the guide font (a pixel font only). The baseline and the bottom
  // margin are set when the font, the character set or the choice changes, and stay free after that.
  const fitFont = () => { const f = currentLoaded(); return f && f.pixelFont ? f : null; };
  const fitActive = () => $('fitFont').checked && !$('gbstudio').checked && !!fitFont();
  let fitSig = null;
  function showFitRows() {
    const f = fitFont();
    const dims = c => ' (' + c.width + ' x ' + c.height + ')';
    $('fitFont').disabled = $('gbstudio').checked || !f;
    $('fitAccents').disabled = $('fitFont').disabled;
    $('fitAccentsRow').hidden = true;
    if (!f) return;
    const { letters, all } = fitFor(f);
    $('fitLabel').textContent = "Use the guide font's cell size" + dims(letters);
    const differs = all.height !== letters.height || all.width !== letters.width || all.baseline !== letters.baseline;
    $('fitAccentsRow').hidden = !differs;
    $('fitAccentsLabel').textContent = 'Make room for the accents too' + dims(all);
  }
  // Applies the fit when its inputs changed; returns true when the cell size or the guides moved.
  function syncFit() {
    const f = fitFont();
    if (!$('fitFont').checked || $('gbstudio').checked || !f) { if (!$('fitFont').checked) fitSig = null; return false; }
    const { letters, all } = fitFor(f);
    const wantAll = $('fitAccents').checked && !$('fitAccentsRow').hidden;
    const c = wantAll ? all : letters;
    const sig = f.family + '|' + wantAll + '|' + c.width + 'x' + c.height + '|' + c.baseline + '|' + c.lift;
    const sizeChanged = $('cellW').value !== String(c.width) || $('cellH').value !== String(c.height);
    $('cellW').value = c.width;
    $('cellH').value = c.height;
    if (sig !== fitSig) {
      fitSig = sig;
      $('baseline').value = c.baseline;
      $('hintLift').value = c.lift;
      $('hintPadding').value = 0;
      return true;
    }
    return sizeChanged;
  }

  // GB Studio mode: the layout, the 8 x 8 cells and the 16 columns are fixed, the checkerboard is off, and the template uses
  // the colors GB Studio reads as background. Unchecking brings back what was there before. While editing, the drawing follows
  // (see model.relayout) and the page asks before it loses something.
  // The layout controls while editing: the drawing follows its characters when they change. What is accepted is remembered, so
  // that a change that would lose something can be refused and put back.
  const LAYOUT_IDS = ['charset', 'custom', 'cellW', 'cellH', 'cols', 'forceMono'];
  let layoutSnapshot = null;
  const readLayout = () => ({ charset: charsetSelect.value, custom: $('custom').value, cellW: $('cellW').value, cellH: $('cellH').value, cols: $('cols').value, mono: $('forceMono').checked,
    fit: $('fitFont').checked, fitAll: $('fitAccents').checked, baseline: $('baseline').value, lift: $('hintLift').value, padding: $('hintPadding').value, sig: fitSig });
  function writeLayout(l) {
    charsetSelect.value = l.charset; $('custom').value = l.custom; $('cellW').value = l.cellW; $('cellH').value = l.cellH; $('cols').value = l.cols; $('forceMono').checked = l.mono;
    $('fitFont').checked = l.fit; $('fitAccents').checked = l.fitAll;
    $('baseline').value = l.baseline; $('hintLift').value = l.lift; $('hintPadding').value = l.padding;
    fitSig = l.sig;
  }
  function onLayoutChange() {
    showFitRows();
    syncFit();   // the character set can change what the fit needs
    const { map, errors } = currentMap();
    const prepared = errors.length ? null : generate.prepare(readSettings(map));
    if (prepared && prepared.ok) {
      const report = window.Digiface.editor.impact(prepared.meta);
      if (window.Digiface.editorModel.risky(report) && !window.confirm(window.Digiface.editor.describe(report))) {
        writeLayout(layoutSnapshot);
        applyLocks();
        schedule();
        return;
      }
    }
    schedule();
  }

  let beforeGb = null;
  function confirmGbSwitch(on) {
    let target;
    if (on) target = { cell: { w: 8, h: 8 }, map: mapOf('gbstudio').map, target: 'gbstudio' };
    else if (beforeGb) target = { cell: { w: parseInt(beforeGb.cellW, 10) || 8, h: parseInt(beforeGb.cellH, 10) || 8 }, map: mapOf(beforeGb.charset).map };
    else return true;
    const report = window.Digiface.editor.impact(target);
    if (!window.Digiface.editorModel.risky(report)) return true;
    return window.confirm(window.Digiface.editor.describe(report));
  }

  // The guide font of GB Studio, for the GB Studio layout.
  function useGbFont() {
    const id = 'bundled:gb-studio-variable';
    if (fontSelect.value === id || !fonts.FONTS.some(f => f.id === id)) return;
    fontSelect.value = id;
    onFontChoice();
  }

  function setGbStudio(on) {
    if (editing && !confirmGbSwitch(on)) { $('gbstudio').checked = !on; return; }
    if (on) {
      beforeGb = { charset: charsetSelect.value, cellW: $('cellW').value, cellH: $('cellH').value, cols: $('cols').value,
        checker: $('checker').checked, ticks: $('baselineTick').checked, font: fontSelect.value,
        fit: $('fitFont').checked, fitAll: $('fitAccents').checked };
      $('fitFont').checked = false; $('fitAccents').checked = false; fitSig = null;
      charsetSelect.value = 'gbstudio';
      $('cellW').value = 8; $('cellH').value = 8; $('cols').value = 16;
      $('checker').checked = false;
      $('baselineTick').checked = false;                  // no baseline in a GB Studio font: it is not a guide here
      useGbFont();
    } else if (beforeGb) {
      charsetSelect.value = beforeGb.charset;
      $('cellW').value = beforeGb.cellW; $('cellH').value = beforeGb.cellH; $('cols').value = beforeGb.cols;
      $('checker').checked = beforeGb.checker;
      $('baselineTick').checked = beforeGb.ticks;
      $('fitFont').checked = beforeGb.fit; $('fitAccents').checked = beforeGb.fitAll; fitSig = null;
      if (beforeGb.font && beforeGb.font !== fontSelect.value) { fontSelect.value = beforeGb.font; onFontChoice(); }
      beforeGb = null;
    }
    applyLocks();
    $('gbNote').hidden = !on;
    refresh();
  }

  // The name of the font: asked when something is downloaded, then used for the file name and as the name of the font.
  let fontName = 'My Pixel Font';

  function readSettings(map) {
    return Object.assign($('gbstudio').checked ? { target: 'gbstudio' } : {}, {
      name: fontName,
      cellW: num('cellW', 8), cellH: num('cellH', 8), cols: num('cols', 16),
      mode: $('forceMono').checked ? 'mono' : 'var', widthSource: 'magenta',
      map, baseline: num('baseline', 0),
      guide: {
        checker: $('checker').checked,
        baseline: $('baselineTick').checked,
        hint: 'ghost',
        prefill: $('prefill').checked,
        hintFont: currentFont().hintFont,
        padding: padding(),
        marginBottom: lift()
      }
    });
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

  // The Drawing button is for something drawn: it waits until there is ink.
  function drawingButton() {
    $('downloadDrawing').disabled = !last || !window.Digiface.editor.hasInk();
    $('downloadFont').disabled = $('downloadDrawing').disabled;
  }
  document.addEventListener('digiface-drawing-changed', drawingButton);

  $('resetBtn').addEventListener('click', () => {
    if (window.confirm('Start again? The settings and the drawing go back to the beginning.')) window.location.reload();
  });

  async function refresh() {
    const run = ++sequence;
    const chosen = charsetSelect.selectedOptions[0];
    if (chosen) charsetSelect.title = chosen.text;  // the closed list may cut a long label
    const isVar = !$('forceMono').checked;
    $('var-options').hidden = !isVar;
    showFontPanel();
    if (!editing) syncFit();   // while editing, a new cell size goes through onFitChange, which asks first
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
    let hint = null;
    if (!errors.length && map.length) {
      hint = hintProvider();
      result = await generate.generate(readSettings(map), hint);
    } else if (!map.length && !errors.length) {
      messages.push(['error', 'Add at least one character']);
    }
    if (run !== sequence) return;

    if (!result.ok) {
      for (const e of result.errors) messages.push(['error', e]);
      last = null;
      $('download').disabled = true;
      $('edit').disabled = !editing;
      drawingButton();
      $('size').textContent = '';
      $('meta').textContent = '';
      showMessages(messages);
      return;
    }
    for (const w of result.warnings) messages.push(['warn', w]);
    showMessages(messages);
    last = result;
    $('download').disabled = false;
    $('edit').disabled = false;
    $('size').textContent = 'EXPORT: ' + result.width + ' x ' + result.height + ' px, ' + (result.png.length / 1024).toFixed(1) + ' KB';
    $('meta').textContent = JSON.stringify(result.meta, null, 2);
    if (editing) layoutSnapshot = readLayout();
    if (hint) {  // the viewer shows the template, and the drawing when it has this layout
      const layers = generate.layers(readSettings(map), hint);
      if (layers.ok) window.Digiface.editor.update(layers);
      drawingButton();
    }
  }

  const hintProvider = () => {
    const font = currentFont();
    return hintCanvas.create({ fontFamily: font.family, weight: font.weight, align: font.align, padding: padding(), lift: lift(), exactSize: font.exactSize });
  };

  // What each download is, what it holds and what it is for, shown in the window that asks for the name. gb: GB Studio mode.
  function describeDownload(kind, gb) {
    if (kind === 'template') {
      return '<p>The <b>template</b> is the grid to draw on: one cell per character with a faint guide letter, the baseline ticks, and the settings of the font stored in the PNG.</p>'
        + '<p>Open it in Aseprite, draw each glyph on a layer above it, hide the template layer, then use the Digiface extension: File &#9656; Scripts &#9656; Digiface &#9656; Export as TTF&hellip;</p>'
        + (gb ? '<p>For GB Studio it is an indexed PNG in the colors of GB Studio: the palest is the background, the darkest the characters, magenta the widths.</p>' : '');
    }
    if (kind === 'font') {
      return '<p>The <b>font</b> is a TrueType file (<code>.ttf</code>) made from what you drew: each pixel is a clean square, so it stays sharp at sizes that are multiples of the cell height, and it installs like any other font.</p>'
        + '<p>Characters with nothing drawn are left out of the font. The typographic quotes, dashes and the no-break space use your plain ones when you did not draw them.</p>'
        + (gb ? '<p>In GB Studio mode the darkest two shades are the letters and the two light ones are background. GB Studio itself reads the <b>drawing</b> (the PNG), not this file.</p>' : '');
    }
    return '<p>The <b>drawing</b> is what you drew here, without any guide: ' + (gb ? 'the characters in the shades of GB Studio on its palest color' : 'black on white')
      + ', magenta where a width marker is, and the settings of the font stored in the PNG.</p>'
      + (gb
        ? '<p>It is the <b>font image GB Studio reads</b>: put it in the <code>assets/fonts</code> folder of your project.</p>'
          + '<p>The <b>.json</b> next to it tells GB Studio where the characters beyond the plain Latin-1 letters are (&euro; &lsquo; &rsquo; &ldquo; &rdquo; &hellip; &oelig; &OElig;...): without it, typing them shows another glyph. If your texts only use letters, digits and the accented letters of Latin-1, you can leave it out. It must have the same name as the image.</p>'
        : '<p>Open it in Aseprite to refine it, and export a font with the Digiface extension (File &#9656; Scripts &#9656; Digiface &#9656; Export as TTF&hellip;). To get the font straight from the page, use the <b>Font (TTF)</b> button.</p>');
  }

  // Asks for the name of the font in a window before a download, with what the download is. kind: 'template', 'drawing' or 'font'.
  // Returns {name, json} (json: the .json of GB Studio is wanted too), or null when the user cancels. The name stays as it was
  // typed except for control characters, at most 64 characters.
  function askFontName(kind) {
    return new Promise(resolve => {
      const dialog = $('nameDialog');
      const form = dialog.querySelector('form');
      const gb = $('gbstudio').checked;
      const withJson = kind === 'drawing' && gb;
      $('nameTitle').textContent = kind === 'template' ? 'Download the template' : kind === 'font' ? 'Download the font' : 'Download the drawing';
      $('nameInfo').innerHTML = describeDownload(kind, gb);
      $('nameInput').value = fontName;
      $('nameOk').textContent = 'Download';
      $('nameJsonRow').hidden = !withJson;
      $('nameJson').checked = true;
      const warn = $('nameWarn');
      const hidden = kind !== 'template' ? window.Digiface.editor.warnings() : [];
      warn.hidden = !hidden.length;
      if (hidden.length) {
        const label = window.Digiface.editorModel.label;
        warn.textContent = hidden.length + (hidden.length === 1 ? ' character has' : ' characters have') + ' drawing under the width marker, which hides it: '
          + hidden.slice(0, 5).map(w => label(w.cp)).join(', ') + (hidden.length > 5 ? ' and ' + (hidden.length - 5) + ' more' : '') + '. The hidden pixels are lost in the download.';
      }
      if (kind === 'font') {
        const w = window.Digiface.ttf.fromModel(window.Digiface.editor.model()).warnings;
        if (w.empty.length) {
          const label = window.Digiface.editorModel.label;
          warn.hidden = false;
          warn.textContent = (warn.textContent ? warn.textContent + ' ' : '') + w.empty.length + (w.empty.length === 1 ? ' character has' : ' characters have') + ' no drawing and will not be in the font: '
            + w.empty.slice(0, 5).map(cp => label(cp)).join(', ') + (w.empty.length > 5 ? ' and ' + (w.empty.length - 5) + ' more' : '') + '.';
        }
      }
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        form.removeEventListener('submit', onSubmit);
        dialog.removeEventListener('close', onClose);
        dialog.removeEventListener('cancel', onClose);
        resolve(result);
      };
      // the button that submitted tells: Download or Cancel; closing it any other way (Escape) is a cancel
      const onSubmit = e => finish(e.submitter && e.submitter.value === 'ok'
        ? { name: $('nameInput').value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64).trim(), json: withJson && $('nameJson').checked } : null);
      const onClose = () => finish(null);
      form.addEventListener('submit', onSubmit);
      dialog.addEventListener('close', onClose);
      dialog.addEventListener('cancel', onClose);
      dialog.showModal();
      $('nameInput').select();
    });
  }

  function save(bytes, type, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // The template, generated again with the name that was just given.
  $('download').addEventListener('click', async () => {
    if (!last) return;
    const answer = await askFontName('template');
    if (!answer) return;
    fontName = answer.name;
    const { map, errors } = currentMap();
    if (errors.length) return;
    const result = await generate.generate(readSettings(map), hintProvider());
    if (result.ok) save(result.png, 'image/png', generate.fileName(fontName, result.meta.cell.w, result.meta.cell.h));
  });

  // The drawing as a PNG: the writing and the width markers over the background, with the metadata, so that the Aseprite
  // extension finds its settings. In GB Studio mode an indexed image with GB Studio's palette.
  $('downloadDrawing').addEventListener('click', async () => {
    const m = window.Digiface.editor.model();
    if (!m) return;
    const answer = await askFontName('drawing');
    if (!answer) return;
    const name = fontName = answer.name;
    const meta = Object.assign({}, m.meta, { name });
    if (!name) delete meta.name;
    const img = window.Digiface.editorExport.renderDrawing(m);
    const options = { text: [{ keyword: metadata.KEYWORD, text: metadata.serialize(meta) }] };
    if (img.palette) options.palette = img.palette;
    save(await png.encode(img.width, img.height, img.rgba, options), 'image/png', generate.drawingFileName(name, m.cellW, m.cellH));
    if (answer.json) {   // the mapping of GB Studio, with the name of the image
      const text = JSON.stringify({ mapping: generate.gbMapping(m.meta.map) }, null, 2) + '\n';
      save(text, 'application/json', generate.drawingFileName(name, m.cellW, m.cellH).replace(/-\d+x\d+\.png$/, '.json'));
    }
  });

  // The font itself, as a TrueType file, from the drawing (web/src/ttf.js, the same writer as the Aseprite extension).
  $('downloadFont').addEventListener('click', async () => {
    const m = window.Digiface.editor.model();
    if (!m) return;
    const answer = await askFontName('font');
    if (!answer) return;
    const name = fontName = answer.name || 'My Pixel Font';
    const read = window.Digiface.ttf.fromModel(m);
    read.settings.name = name;
    try {
      const built = window.Digiface.ttf.build(read.analysis, read.settings, { family: name });
      save(built.font, 'font/ttf', generate.fontFileName(name));
    } catch (e) {
      window.alert('The font could not be made: ' + (e && e.message === 'no glyph to export' ? 'nothing is drawn.' : (e && e.message) || 'unknown error.'));
    }
  });

  // The Edit button: the settings fold away and the editor takes the place of the preview. Stopping brings them back.
  let cardStates = [];
  function startEditing() {
    if (editing) return;
    const { map, errors } = currentMap();
    if (errors.length) return;
    const result = generate.layers(readSettings(map), hintProvider());
    if (!result.ok || !window.Digiface.editor.start(result)) return;  // start() may ask, and the user may keep the drawing
    editing = true;
    layoutSnapshot = readLayout();
    const cards = Array.from(document.querySelectorAll('details.card'));
    cardStates = cards.map(c => c.open);
    for (const c of cards) c.open = false;
    document.body.classList.add('editing');
    $('edit').classList.add('active');
    $('edit').setAttribute('aria-pressed', 'true');
    $('edit').title = 'Quit editing and show the settings (Esc)';
    $('edit').textContent = 'Quit editing';
    applyLocks();
  }

  function stopEditing() {
    if (!editing) return;
    window.Digiface.editor.stop();
    editing = false;
    document.querySelectorAll('details.card').forEach((c, i) => { c.open = cardStates[i] !== false; });
    document.body.classList.remove('editing');
    $('edit').classList.remove('active');
    $('edit').setAttribute('aria-pressed', 'false');
    $('edit').title = 'Draw the glyphs in the page';
    $('edit').textContent = 'Edit pixel font';
    applyLocks();
    refresh();
  }

  $('edit').addEventListener('click', () => (editing ? stopEditing() : startEditing()));
  document.addEventListener('digiface-editor-done', stopEditing);

  charsetSelect.addEventListener('change', () => {
    const p = charsets.presets.find(x => x.id === charsetSelect.value);
    if (p) $('cols').value = p.cols;
    if (charsetSelect.value === 'gbstudio') useGbFont();   // the GB Studio layout is drawn with the font of GB Studio
    if (editing) onLayoutChange(); else refresh();
  });

  // Pre-fill the magenta, while editing: the widths of the guide font replace the ones of the drawing (or the full width, when it is
  // off), after a question; one gesture for undo. A refusal puts the box back.
  function onPrefillChange() {
    const { map, errors } = currentMap();
    const prepared = errors.length ? null : generate.layers(readSettings(map), hintProvider());
    const editor = window.Digiface.editor;
    const changes = prepared && prepared.ok ? editor.widthChanges(prepared.advances) : [];
    if (changes.length) {
      const what = $('prefill').checked ? "the widths of the guide font" : 'the full width';
      if (!window.confirm(changes.length + ' character' + (changes.length > 1 ? 's' : '') + ' will get ' + what + ' instead of the width you set. Undo brings them back.\nContinue?')) {
        $('prefill').checked = !$('prefill').checked;
        return;
      }
      editor.applyWidths(changes);
    }
    schedule();
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 120); };
  for (const el of document.querySelectorAll('#settings input, #settings select, #settings textarea, #checker, #baselineTick')) {
    const layout = LAYOUT_IDS.includes(el.id);
    el.addEventListener('input', () => { if (!(editing && layout)) schedule(); });   // while editing a layout change waits for the end of the typing
    el.addEventListener('change', () => {
      if (el.id === 'prefill' && editing) onPrefillChange();
      else if (!(editing && layout)) schedule();
      else if (el !== charsetSelect) onLayoutChange();                              // the character set has its own handler
    });
  }
  $('settings').addEventListener('submit', e => e.preventDefault());
  // opened, the metadata sit beside the image (two thirds / one third); folded, the image has the whole width
  $('metaBox').addEventListener('toggle', () => { document.querySelector('.split').classList.toggle('meta-open', $('metaBox').open); });
  $('fontFile').addEventListener('change', () => { if ($('fontFile').files[0]) loadFontFile($('fontFile').files[0]); });
  fontSelect.addEventListener('change', onFontChoice);
  // A change of the fit while editing: the new cell size asks before it cuts something, and a refusal puts the old one back.
  function onFitChange() {
    showFitRows();
    syncFit();
    onLayoutChange();
  }
  function onFitToggle() {
    if (!$('fitFont').checked) fitSig = null;
    if (editing) { showFitRows(); syncFit(); onLayoutChange(); applyLocks(); }   // a refusal puts the whole snapshot back
    else refresh();
  }
  $('gbstudio').addEventListener('change', () => setGbStudio($('gbstudio').checked));
  $('fontInfoBtn').addEventListener('click', () => { if (!$('fontInfoBtn').hidden) $('fontDialog').showModal(); });
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  for (const tab of document.querySelectorAll('#helpDialog .tab')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('#helpDialog .tab')) {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        $(t.getAttribute('aria-controls')).hidden = !on;
      }
    });
  }
  for (const b of document.querySelectorAll('#helpDialog .scenario')) {
    b.addEventListener('click', () => {
      for (const o of document.querySelectorAll('#helpDialog .scenario')) {
        const on = o === b;
        o.classList.toggle('active', on);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
        $(o.getAttribute('aria-controls')).hidden = !on;
      }
    });
  }
  $('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) $('helpDialog').close(); });
  $('fontDialog').addEventListener('click', e => { if (e.target === $('fontDialog')) $('fontDialog').close(); });  // a click outside closes it
  $('fitFont').addEventListener('change', onFitToggle);
  $('fitAccents').addEventListener('change', () => { if (editing) { onFitChange(); applyLocks(); } else refresh(); });

  window.Digiface.app = { refresh, state: () => last, stopEditing, isEditing: () => editing };
  refresh();
})();
