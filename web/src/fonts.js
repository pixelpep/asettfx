// Fonts offered for the ghost characters. Family strings are stored in the metadata (guide.hintFont, 64 characters max).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ASETTFX = root.ASETTFX || {}; root.ASETTFX.fonts = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONO = "Menlo, Consolas, 'DejaVu Sans Mono', monospace";
  const SANS = 'Helvetica, Arial, sans-serif';
  const SANS_BOLD = 'Arial, Helvetica, sans-serif';
  const VERDANA = 'Verdana, Geneva, sans-serif';
  const GEORGIA = "Georgia, 'Times New Roman', serif";
  const TIMES = "'Times New Roman', Times, serif";
  const COURIER = "'Courier New', Courier, monospace";

  const FONTS = [
    { id: 'auto', label: 'Automatic (monospace font, or Verdana for variable space)' },
    { id: 'mono', label: 'Monospace (Menlo, Consolas)', family: MONO, weight: 'normal' },
    { id: 'verdana', label: 'Verdana', family: VERDANA, weight: 'normal' },
    { id: 'sans', label: 'Sans-serif (Helvetica, Arial)', family: SANS, weight: 'normal' },
    { id: 'sans-bold', label: 'Sans-serif bold (Arial)', family: SANS_BOLD, weight: 'bold' },
    { id: 'georgia', label: 'Serif (Georgia)', family: GEORGIA, weight: 'normal' },
    { id: 'times', label: 'Serif (Times New Roman)', family: TIMES, weight: 'normal' },
    { id: 'courier', label: 'Typewriter (Courier New)', family: COURIER, weight: 'bold' },
    { id: 'custom', label: 'Custom font name...' }
  ];

  // choice: {id, custom: {family, bold}}, mode: 'mono' | 'var'.
  // Returns {family, weight, align}. Variable-space glyphs are left-aligned so their natural width shows where the magenta starts.
  function resolve(choice, mode) {
    const align = mode === 'var' ? 'left' : 'center';
    let id = choice.id;
    if (id === 'auto') id = mode === 'var' ? 'verdana' : 'mono';
    if (id === 'custom') {
      const family = ((choice.custom && choice.custom.family) || '').trim().slice(0, 64) || MONO;
      return { family, weight: choice.custom && choice.custom.bold ? 'bold' : 'normal', align };
    }
    const f = FONTS.find(x => x.id === id) || FONTS[1];
    return { family: f.family, weight: f.weight, align };
  }

  return { FONTS, resolve };
});
