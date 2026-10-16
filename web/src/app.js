// UI wiring for the template generator.
(function () {
  'use strict';
  const { charmap, charsets, generate, hintCanvas, fonts } = window.ASETTFX;
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

  const currentFont = () => fonts.resolve(
    { id: fontSelect.value, custom: { family: $('hintFont').value, bold: $('hintBold').checked } },
    $('mode').value
  );

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

  const num = (id, fallback) => {
    const v = parseInt($(id).value, 10);
    return Number.isFinite(v) ? v : fallback;
  };

  function readSettings(map) {
    return {
      name: $('name').value.trim(),
      cellW: num('cellW', 8), cellH: num('cellH', 8), cols: num('cols', 16),
      mode: $('mode').value, widthSource: $('widthSource').value,
      map, baseline: num('baseline', 0), spacing: num('spacing', 0),
      guide: {
        checker: $('checker').checked,
        baseline: $('baselineTick').checked,
        hint: $('hint').checked ? 'ghost' : 'none',
        prefill: $('prefill').checked,
        hintFont: currentFont().family
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

  function drawPreview(result) {
    const zoom = Math.max(1, Math.min(32, num('zoom', 4)));
    const src = document.createElement('canvas');
    src.width = result.width; src.height = result.height;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height), 0, 0);

    const view = $('preview');
    view.width = result.width * zoom; view.height = result.height * zoom;
    const ctx = view.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, view.width, view.height);

    if ($('gridLines').checked && zoom >= 3) {
      const { w, h } = result.meta.cell;
      ctx.fillStyle = 'rgba(40, 90, 200, 0.55)';
      for (let x = 0; x <= result.width; x += w) ctx.fillRect(Math.min(x * zoom, view.width - 1), 0, 1, view.height);
      for (let y = 0; y <= result.height; y += h) ctx.fillRect(0, Math.min(y * zoom, view.height - 1), view.width, 1);
    }
  }

  async function refresh() {
    const run = ++sequence;
    const isVar = $('mode').value === 'var';
    $('var-options').hidden = !isVar;
    $('prefill').disabled = !$('hint').checked || $('widthSource').value !== 'magenta';
    $('hint-custom').hidden = fontSelect.value !== 'custom';
    const custom = charsetSelect.value === CUSTOM_HEX || charsetSelect.value === CUSTOM_TEXT;
    $('custom-row').hidden = !custom;
    $('custom-label').textContent = charsetSelect.value === CUSTOM_HEX
      ? 'Ranges, e.g. 0020-007E 00C0-00FF 20AC (use _ for an empty cell)'
      : 'Characters, one cell each, in this order';

    const { map, errors } = currentMap();
    const messages = errors.map(e => ['error', e]);
    const cols = num('cols', 16);
    const count = charmap.expandMap(map).cells.length;
    $('count').textContent = count + ' characters, ' + (cols >= 1 ? generate.rowsFor(map, cols) : '?') + ' rows';

    let result = { ok: false, errors: [] };
    if (!errors.length && map.length) {
      const font = currentFont();
      const hint = hintCanvas.create({ fontFamily: font.family, weight: font.weight, align: font.align });
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

  function filename(result) {
    const slug = (result.meta.name || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
    return slug + '-' + result.meta.cell.w + 'x' + result.meta.cell.h + '-template.png';
  }

  $('download').addEventListener('click', () => {
    if (!last) return;
    const url = URL.createObjectURL(new Blob([last.png], { type: 'image/png' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename(last);
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
  for (const el of document.querySelectorAll('#settings input, #settings select, #settings textarea, #name, #zoom, #gridLines')) {
    el.addEventListener('input', schedule);
    el.addEventListener('change', schedule);
  }
  $('settings').addEventListener('submit', e => e.preventDefault());

  window.ASETTFX.app = { refresh, state: () => last };
  refresh();
})();
