/**
 * =========================================================================
 * Color Studio (src/color_studio.js)
 * Advanced Multi-Model Color Picker, Converter & Palette Engine for Esenho.
 * Supports RGB, HSL, HSV, HEX, Multi-Palette Management, and Eyedropper.
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ColorStudio = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 1. Color Math & Conversions ──

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function rgbToHex(r, g, b, a = 1.0) {
    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);
    const hexR = r.toString(16).padStart(2, '0');
    const hexG = g.toString(16).padStart(2, '0');
    const hexB = b.toString(16).padStart(2, '0');
    if (a !== undefined && a < 1.0 && a >= 0) {
      const hexA = clamp(Math.round(a * 255), 0, 255).toString(16).padStart(2, '0');
      return `#${hexR}${hexG}${hexB}${hexA}`;
    }
    return `#${hexR}${hexG}${hexB}`;
  }

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0, a: 1.0 };
    let clean = hex.trim();
    if (clean.startsWith('#')) clean = clean.slice(1);
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    } else if (clean.length === 4) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2] + clean[3] + clean[3];
    }

    if (clean.length === 6) {
      const r = parseInt(clean.slice(0, 2), 16) || 0;
      const g = parseInt(clean.slice(2, 4), 16) || 0;
      const b = parseInt(clean.slice(4, 6), 16) || 0;
      return { r, g, b, a: 1.0 };
    }
    if (clean.length === 8) {
      const r = parseInt(clean.slice(0, 2), 16) || 0;
      const g = parseInt(clean.slice(2, 4), 16) || 0;
      const b = parseInt(clean.slice(4, 6), 16) || 0;
      const a = (parseInt(clean.slice(6, 8), 16) || 255) / 255;
      return { r, g, b, a };
    }
    return { r: 0, g: 0, b: 0, a: 1.0 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return {
      h: Math.round(h * 360) % 360,
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;

    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return {
      h: Math.round(h * 360) % 360,
      s: Math.round(s * 100),
      v: Math.round(v * 100)
    };
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    v = clamp(v, 0, 100) / 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) { r1 = c; g1 = x; }
    else if (h < 120) { r1 = x; g1 = c; }
    else if (h < 180) { g1 = c; b1 = x; }
    else if (h < 240) { g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255)
    };
  }

  function parseColor(str) {
    if (!str || typeof str !== 'string' || str === 'none') {
      return { r: 250, g: 189, b: 47, a: 1.0, hex: '#fabd2f', h: 42, s: 95, l: 58, v: 98 };
    }
    let hex = str.trim();
    if (hex.startsWith('rgb')) {
      const nums = hex.match(/[\d.]+/g);
      if (nums) {
        const r = parseInt(nums[0], 10) || 0;
        const g = parseInt(nums[1], 10) || 0;
        const b = parseInt(nums[2], 10) || 0;
        const a = nums[3] !== undefined ? parseFloat(nums[3]) : 1.0;
        hex = rgbToHex(r, g, b);
      }
    }
    if (!hex.startsWith('#')) hex = '#' + hex;
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    return {
      r: rgb.r, g: rgb.g, b: rgb.b, a: rgb.a,
      hex: rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase(),
      h: hsl.h, s: hsl.s, l: hsl.l, v: hsv.v
    };
  }

  // ── 2. Built-in Palette Presets ──

  const BUILTIN_PALETTES = {
    gruvbox_dark: {
      name: 'Gruvbox Dark',
      colors: [
        '#1d2021', '#282828', '#3c3836', '#504945', '#665c54', '#7c6f64',
        '#928374', '#a89984', '#bdae93', '#d5c4a1', '#ebdbb2', '#fbf1c7',
        '#cc241d', '#fb4934', '#d79921', '#fabd2f', '#98971a', '#b8bb26',
        '#458588', '#83a598', '#b16286', '#d3869b', '#689d6a', '#8ec07c',
        '#d65d0e', '#fe8019'
      ]
    },
    gruvbox_light: {
      name: 'Gruvbox Light',
      colors: [
        '#fbf1c7', '#f9f5d7', '#f2e5bc', '#ebdbb2', '#d5c4a1', '#bdae93',
        '#a89984', '#928374', '#7c6f64', '#665c54', '#504945', '#3c3836',
        '#9d0006', '#cc241d', '#b57614', '#d79921', '#79740e', '#98971a',
        '#076678', '#458588', '#8f3f71', '#b16286', '#427b58', '#689d6a',
        '#af3a03', '#d65d0e'
      ]
    },
    nord: {
      name: 'Nord Arctic',
      colors: [
        '#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#e5e9f0',
        '#eceff4', '#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a',
        '#d08770', '#ebcb8b', '#a3be8c', '#b48ead'
      ]
    },
    cyberpunk: {
      name: 'Neon Cyberpunk',
      colors: [
        '#05d9e8', '#005670', '#01012b', '#d1f7ff', '#ff2a6d', '#010a43',
        '#ffc2c2', '#ffe600', '#7122fa', '#f50057', '#00e5ff', '#18ffff',
        '#ff0055', '#00ff66', '#7928ca', '#ff0080'
      ]
    },
    tokyo_night: {
      name: 'Tokyo Night',
      colors: [
        '#1a1b26', '#24283b', '#414868', '#565f89', '#7aa2f7', '#7dcfff',
        '#73daca', '#b4f9f8', '#2ac3de', '#bb9af7', '#ff9e64', '#f7768e',
        '#e0af68', '#9ece6a', '#c0caf5', '#cfc9c2'
      ]
    },
    dracula: {
      name: 'Dracula',
      colors: [
        '#282a36', '#44475a', '#6272a4', '#f8f8f2', '#8be9fd', '#50fa7b',
        '#ffb86c', '#ff79c6', '#bd93f9', '#ff5555', '#f1fa8c', '#e2e2dc'
      ]
    },
    solarized_dark: {
      name: 'Solarized Dark',
      colors: [
        '#002b36', '#073642', '#586e75', '#657b83', '#839496', '#93a1a1',
        '#eee8d5', '#fdf6e3', '#b58900', '#cb4b16', '#dc322f', '#d33682',
        '#6c71c4', '#268bd2', '#2aa198', '#859900'
      ]
    },
    pastels: {
      name: 'Pastel Dreams',
      colors: [
        '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#e8c5ff',
        '#ffd1dc', '#d4f0f0', '#ffe4e1', '#f0fff0', '#f5f5dc', '#faf0e6',
        '#ddd6fe', '#fed7aa', '#bbf7d0', '#bfdbfe'
      ]
    },
    japanese: {
      name: 'Japanese Traditional',
      colors: [
        '#c82d31', '#b7282e', '#913228', '#843900', '#d06d8c', '#e0815e',
        '#c39143', '#65ab31', '#006e54', '#2a6478', '#18425d', '#493759',
        '#8c7042', '#726250', '#3e3a39', '#e6e4a6'
      ]
    },
    retro_16bit: {
      name: 'Retro 16-Bit & CGA',
      colors: [
        '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa',
        '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff',
        '#ff5555', '#ff55ff', '#ffff55', '#ffffff'
      ]
    },
    retro_gameboy: {
      name: '4-Color Retro GameBoy',
      colors: [
        '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
      ]
    },
    grayscale: {
      name: 'Monochrome & Grayscale',
      colors: [
        '#000000', '#111111', '#222222', '#333333', '#444444', '#555555',
        '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb',
        '#cccccc', '#dddddd', '#eeeeee', '#ffffff'
      ]
    },
    warm_earth: {
      name: 'Warm Earth & Skin Tones',
      colors: [
        '#2b1d0c', '#4a3525', '#6c4f3d', '#8f6d56', '#b08d75', '#cbb09c',
        '#e4d5c7', '#f7ebe1', '#8c4626', '#b85d19', '#d97724', '#e8985e',
        '#f5c49f', '#fcd5b5', '#ffd8c9', '#ffebe3'
      ]
    }
  };

  // ── 3. Palette Storage & Management ──

  const STORAGE_KEY_PALETTES = 'esenho_custom_palettes_v2';
  const STORAGE_KEY_ACTIVE = 'esenho_active_palette_id';
  const STORAGE_KEY_CUSTOM_SWATCHES = 'esenho_custom_swatches';

  function getCustomPalettes() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_PALETTES);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
    return {
      custom: {
        name: 'My Custom Swatches',
        colors: getLegacyCustomSwatches()
      }
    };
  }

  function getLegacyCustomSwatches() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_CUSTOM_SWATCHES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return ['#fabd2f', '#fe8019', '#fb4934', '#b8bb26', '#8ec07c', '#83a598', '#d3869b', '#ebdbb2'];
  }

  function saveCustomPalettes(palettes) {
    try {
      localStorage.setItem(STORAGE_KEY_PALETTES, JSON.stringify(palettes));
      if (palettes.custom && palettes.custom.colors) {
        localStorage.setItem(STORAGE_KEY_CUSTOM_SWATCHES, JSON.stringify(palettes.custom.colors));
      }
    } catch (_) {}
  }

  function getActivePaletteId() {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE) || 'gruvbox_dark';
    } catch (_) {
      return 'gruvbox_dark';
    }
  }

  function setActivePaletteId(id) {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE, id);
    } catch (_) {}
  }

  function getAllPalettes() {
    const custom = getCustomPalettes();
    return {
      ...BUILTIN_PALETTES,
      ...custom
    };
  }

  function getPalette(id) {
    const all = getAllPalettes();
    return all[id] || BUILTIN_PALETTES.gruvbox_dark;
  }

  function createCustomPalette(name) {
    name = (name || '').trim();
    if (!name) return null;
    const id = 'custom_' + Date.now().toString(36);
    const custom = getCustomPalettes();
    custom[id] = { name, colors: [] };
    saveCustomPalettes(custom);
    return id;
  }

  function deleteCustomPalette(id) {
    if (id === 'custom' || BUILTIN_PALETTES[id]) return false;
    const custom = getCustomPalettes();
    if (custom[id]) {
      delete custom[id];
      saveCustomPalettes(custom);
      return true;
    }
    return false;
  }

  function addColorToPalette(paletteId, hex) {
    hex = (hex || '').trim().toUpperCase();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(hex)) return false;

    const custom = getCustomPalettes();
    let targetId = paletteId;
    if (BUILTIN_PALETTES[paletteId] || !custom[paletteId]) {
      targetId = 'custom';
    }
    if (!custom[targetId]) {
      custom[targetId] = { name: 'My Custom Swatches', colors: [] };
    }
    if (!custom[targetId].colors.includes(hex)) {
      custom[targetId].colors.push(hex);
      saveCustomPalettes(custom);
      return true;
    }
    return false;
  }

  function removeColorFromPalette(paletteId, hex) {
    const custom = getCustomPalettes();
    let targetId = paletteId;
    if (BUILTIN_PALETTES[paletteId] || !custom[paletteId]) targetId = 'custom';
    if (!custom[targetId] || !custom[targetId].colors) return false;
    const idx = custom[targetId].colors.indexOf(hex.toUpperCase());
    if (idx !== -1) {
      custom[targetId].colors.splice(idx, 1);
      saveCustomPalettes(custom);
      return true;
    }
    return false;
  }

  // ── 4. Advanced Interactive Modal & Popover Component ──

  let activePickerState = null;

  function ensureStylesInjected() {
    if (document.getElementById('color-studio-styles')) return;
    const style = document.createElement('style');
    style.id = 'color-studio-styles';
    style.textContent = `
      .cs-overlay {
        position: fixed;
        inset: 0;
        background: rgba(14, 16, 17, 0.72);
        backdrop-filter: blur(2px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        animation: csFadeIn 0.15s ease-out;
      }
      @keyframes csFadeIn {
        from { opacity: 0; transform: scale(0.98); }
        to { opacity: 1; transform: scale(1); }
      }
      .cs-dialog {
        background: var(--bg-panel, #1e2021);
        border: 1px solid var(--border-bright, #484d50);
        border-radius: var(--radius-lg, 6px);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
        width: 100%;
        max-width: 440px;
        display: flex;
        flex-direction: column;
        color: var(--text, #ebdbb2);
        font-family: var(--font-sans, system-ui, sans-serif);
        user-select: none;
        overflow: hidden;
      }
      .cs-header {
        padding: 10px 14px;
        background: var(--bg-panel-sub, #252829);
        border-bottom: 1px solid var(--border, #2e3234);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .cs-title {
        font-size: 12px;
        font-weight: 700;
        color: var(--primary, #fabd2f);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cs-close-btn {
        background: transparent;
        border: none;
        color: var(--text-muted, #928374);
        cursor: pointer;
        font-size: 14px;
        padding: 2px 6px;
        border-radius: 3px;
        line-height: 1;
      }
      .cs-close-btn:hover {
        background: var(--danger-dim, rgba(251, 73, 52, 0.2));
        color: var(--danger, #fb4934);
      }
      .cs-tabs {
        display: flex;
        background: var(--bg-dark, #141617);
        border-bottom: 1px solid var(--border, #2e3234);
        padding: 4px 8px 0;
        gap: 4px;
      }
      .cs-tab-btn {
        flex: 1;
        padding: 6px 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted, #928374);
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        text-align: center;
        transition: color 0.15s, border-color 0.15s;
      }
      .cs-tab-btn:hover {
        color: var(--text, #ebdbb2);
      }
      .cs-tab-btn.active {
        color: var(--primary, #fabd2f);
        border-bottom-color: var(--primary, #fabd2f);
      }
      .cs-body {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 480px;
        overflow-y: auto;
      }
      .cs-panel {
        display: none;
        flex-direction: column;
        gap: 10px;
      }
      .cs-panel.active {
        display: flex;
      }
      /* Wheel / Canvas */
      .cs-wheel-wrap {
        display: flex;
        justify-content: center;
        position: relative;
        padding: 4px;
      }
      .cs-wheel-canvas {
        cursor: crosshair;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }
      /* SV Box */
      .cs-svbox-wrap {
        position: relative;
        width: 100%;
        height: 180px;
        border-radius: var(--radius-sm, 3px);
        overflow: hidden;
        border: 1px solid var(--border-bright, #484d50);
        cursor: crosshair;
      }
      .cs-svbox-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
      .cs-svbox-cursor {
        position: absolute;
        width: 12px;
        height: 12px;
        border: 2px solid #ffffff;
        box-shadow: 0 0 3px rgba(0,0,0,0.8);
        border-radius: 50%;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }
      /* Sliders */
      .cs-slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
      }
      .cs-slider-lbl {
        width: 16px;
        font-weight: 700;
        text-align: center;
      }
      .cs-slider {
        flex: 1;
        height: 8px;
        appearance: none;
        -webkit-appearance: none;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        border-radius: 4px;
        outline: none;
        cursor: pointer;
      }
      .cs-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid var(--primary, #fabd2f);
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
      }
      .cs-slider-num {
        width: 48px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        border-radius: var(--radius-sm, 3px);
        font-size: 11px;
        font-family: var(--font-mono, monospace);
        padding: 3px 4px;
        text-align: center;
      }
      /* Palettes */
      .cs-palette-bar {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cs-palette-select {
        flex: 1;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        padding: 4px 6px;
        font-size: 11px;
        border-radius: var(--radius-sm, 3px);
        cursor: pointer;
      }
      .cs-swatches-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(26px, 1fr));
        gap: 5px;
        max-height: 160px;
        overflow-y: auto;
        padding: 6px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        border-radius: var(--radius-sm, 3px);
      }
      .cs-swatch-chip {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        cursor: pointer;
        position: relative;
        transition: transform 0.1s, border-color 0.1s;
      }
      .cs-swatch-chip:hover {
        transform: scale(1.15);
        z-index: 2;
        border-color: #ffffff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      }
      .cs-swatch-chip.active {
        outline: 2px solid var(--primary, #fabd2f);
        outline-offset: 1px;
      }
      /* Bottom Preview Bar */
      .cs-footer {
        padding: 10px 14px;
        background: var(--bg-panel-sub, #252829);
        border-top: 1px solid var(--border, #2e3234);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .cs-footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .cs-duo-preview {
        display: flex;
        width: 60px;
        height: 28px;
        border-radius: 4px;
        overflow: hidden;
        border: 1px solid var(--border-bright, #484d50);
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
      }
      .cs-prev-chip, .cs-curr-chip {
        flex: 1;
        height: 100%;
        cursor: pointer;
      }
      .cs-hex-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .cs-hex-input {
        width: 82px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--primary, #fabd2f);
        font-family: var(--font-mono, monospace);
        font-weight: 700;
        font-size: 11px;
        padding: 4px 6px;
        text-align: center;
        border-radius: 3px;
        text-transform: uppercase;
      }
      .cs-btn {
        background: var(--bg-panel, #1e2021);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .cs-btn:hover {
        background: var(--border, #2e3234);
        border-color: var(--primary, #fabd2f);
        color: var(--primary, #fabd2f);
      }
      .cs-btn.cs-btn-primary {
        background: var(--primary, #fabd2f);
        color: var(--primary-text, #141617);
        font-weight: 700;
        border-color: var(--primary, #fabd2f);
      }
      .cs-btn.cs-btn-primary:hover {
        background: var(--primary-hover, #fe8019);
        border-color: var(--primary-hover, #fe8019);
      }
      /* Quick Swatch Bar in Panels */
      .cs-quick-bar {
        display: flex;
        align-items: center;
        gap: 4px;
        overflow-x: auto;
        padding: 4px 0;
        scrollbar-width: thin;
      }
      .cs-quick-chip {
        width: 18px;
        height: 18px;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        flex-shrink: 0;
        cursor: pointer;
        transition: transform 0.1s;
      }
      .cs-quick-chip:hover {
        transform: scale(1.2);
        border-color: #ffffff;
      }
      /* Embedded Color Tab Styles */
      .cs-tab-root {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
      }
      .cs-target-bar {
        display: flex;
        gap: 6px;
        align-items: center;
        background: var(--bg-dark, #141617);
        padding: 4px;
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
      }
      .cs-target-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 5px 8px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted, #928374);
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-sm, 3px);
        cursor: pointer;
        transition: all 0.15s;
      }
      .cs-target-btn:hover {
        color: var(--text, #ebdbb2);
        background: rgba(255, 255, 255, 0.04);
      }
      .cs-target-btn.active {
        background: var(--bg-panel-sub, #26292b);
        color: var(--text-bright, #fbf1c7);
        border-color: var(--primary, #fabd2f);
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      .cs-target-swatch {
        width: 13px;
        height: 13px;
        border-radius: 3px;
        border: 1px solid rgba(255,255,255,0.25);
        display: inline-block;
        flex-shrink: 0;
      }
      .cs-target-swap-btn {
        background: transparent;
        border: 1px solid var(--border, #2e3234);
        color: var(--text-muted, #928374);
        border-radius: 3px;
        cursor: pointer;
        padding: 4px 8px;
        font-size: 13px;
        line-height: 1;
        transition: all 0.15s;
      }
      .cs-target-swap-btn:hover {
        color: var(--primary, #fabd2f);
        border-color: var(--primary, #fabd2f);
        background: rgba(250, 189, 47, 0.1);
      }
      .cs-preview-hex-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg-panel-sub, #26292b);
        padding: 6px 8px;
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
      }
    `;
    document.head.appendChild(style);
  }

  // ── 4. Advanced Color Studio Widget & Tabs ──

  function createPickerWidget(options = {}) {
    ensureStylesInjected();

    const isEmbedded = options.mode === 'embedded';
    const showTargetBar = options.showTargetBar !== undefined ? options.showTargetBar : isEmbedded;
    let activeTarget = options.target || 'fill'; // 'fill' | 'stroke'
    let fillHex = (options.fillColor || '#fabd2f').toUpperCase();
    let strokeHex = (options.strokeColor || '#1d2021').toUpperCase();

    const initialColorHex = options.color || (activeTarget === 'stroke' ? strokeHex : fillHex);
    const initialColor = parseColor(initialColorHex);
    let currentColor = { ...initialColor };
    let previousColorHex = initialColor.hex;

    const onChange = options.onChange || (() => {});
    const onCommit = options.onCommit || (() => {});
    const onTargetChange = options.onTargetChange || (() => {});
    const onSwap = options.onSwap || (() => {});

    let activeTab = options.initialTab || 'sliders'; // 'wheel' | 'box' | 'sliders' | 'palettes'
    let activePaletteId = getActivePaletteId();

    const root = document.createElement('div');
    root.className = isEmbedded ? 'cs-tab-root' : 'cs-picker-widget';

    let targetBarHtml = '';
    if (showTargetBar) {
      targetBarHtml = `
        <div class="cs-target-bar">
          <button type="button" class="cs-target-btn ${activeTarget === 'fill' ? 'active' : ''}" data-target="fill" title="Edit Fill Color">
            <span class="cs-target-swatch" id="cs-target-swatch-fill" style="background: ${fillHex};"></span>
            <span>Fill</span>
          </button>
          <button type="button" class="cs-target-btn ${activeTarget === 'stroke' ? 'active' : ''}" data-target="stroke" title="Edit Stroke Color">
            <span class="cs-target-swatch" id="cs-target-swatch-stroke" style="background: ${strokeHex};"></span>
            <span>Stroke</span>
          </button>
          <button type="button" class="cs-target-swap-btn" id="cs-target-swap" title="Swap Fill and Stroke colors">⇄</button>
        </div>
      `;
    }

    const previewHexBarHtml = `
      <div class="cs-preview-hex-bar">
        <div class="cs-duo-preview" title="Left: Previous (Click to Revert) | Right: Current">
          <div class="cs-prev-chip" id="cs-prev-chip" style="background: ${previousColorHex};" title="Revert to ${previousColorHex}"></div>
          <div class="cs-curr-chip" id="cs-curr-chip" style="background: ${currentColor.hex};"></div>
        </div>
        <div class="cs-hex-group" style="flex: 1;">
          <span style="font-size: 11px; font-weight: 700; color: var(--primary);">HEX:</span>
          <input type="text" class="cs-hex-input" id="cs-hex-input" value="${currentColor.hex}" maxlength="7" spellcheck="false" style="width: 72px;">
          <button type="button" class="cs-btn" id="cs-btn-copy-hex" title="Copy HEX">Copy</button>
        </div>
        ${typeof window !== 'undefined' && 'EyeDropper' in window ? `<button type="button" class="cs-btn" id="cs-btn-eyedropper" title="Sample color from screen (Eyedropper)">✛ Pick</button>` : ''}
      </div>
    `;

    root.innerHTML = `
      ${targetBarHtml}
      ${previewHexBarHtml}

      <div class="cs-tabs">
        <button type="button" class="cs-tab-btn ${activeTab === 'sliders' ? 'active' : ''}" data-tab="sliders">Sliders</button>
        <button type="button" class="cs-tab-btn ${activeTab === 'wheel' ? 'active' : ''}" data-tab="wheel">Wheel</button>
        <button type="button" class="cs-tab-btn ${activeTab === 'box' ? 'active' : ''}" data-tab="box">SV Box</button>
        <button type="button" class="cs-tab-btn ${activeTab === 'palettes' ? 'active' : ''}" data-tab="palettes">Palettes</button>
      </div>

      <div class="cs-body">
        <!-- TAB 1: SLIDERS (RGB & HSL) -->
        <div class="cs-panel ${activeTab === 'sliders' ? 'active' : ''}" id="cs-panel-sliders">
          <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">RGB Channels</div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: var(--danger);">R</span>
            <input type="range" class="cs-slider" id="cs-slider-r" min="0" max="255" value="${currentColor.r}">
            <input type="number" class="cs-slider-num" id="cs-num-r" min="0" max="255" value="${currentColor.r}">
          </div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: var(--success);">G</span>
            <input type="range" class="cs-slider" id="cs-slider-g" min="0" max="255" value="${currentColor.g}">
            <input type="number" class="cs-slider-num" id="cs-num-g" min="0" max="255" value="${currentColor.g}">
          </div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: var(--accent);">B</span>
            <input type="range" class="cs-slider" id="cs-slider-b" min="0" max="255" value="${currentColor.b}">
            <input type="number" class="cs-slider-num" id="cs-num-b" min="0" max="255" value="${currentColor.b}">
          </div>

          <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 4px;">HSL Channels</div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: #d3869b;">H</span>
            <input type="range" class="cs-slider" id="cs-slider-h" min="0" max="359" value="${currentColor.h}" style="background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);">
            <input type="number" class="cs-slider-num" id="cs-num-h" min="0" max="359" value="${currentColor.h}">
          </div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: var(--primary-hover);">S</span>
            <input type="range" class="cs-slider" id="cs-slider-s" min="0" max="100" value="${currentColor.s}">
            <input type="number" class="cs-slider-num" id="cs-num-s" min="0" max="100" value="${currentColor.s}">
          </div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: var(--primary);">L</span>
            <input type="range" class="cs-slider" id="cs-slider-l" min="0" max="100" value="${currentColor.l}">
            <input type="number" class="cs-slider-num" id="cs-num-l" min="0" max="100" value="${currentColor.l}">
          </div>
        </div>

        <!-- TAB 2: WHEEL -->
        <div class="cs-panel ${activeTab === 'wheel' ? 'active' : ''}" id="cs-panel-wheel">
          <div class="cs-wheel-wrap">
            <canvas class="cs-wheel-canvas" id="cs-canvas-wheel" width="190" height="190"></canvas>
          </div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: var(--primary);">V</span>
            <input type="range" class="cs-slider" id="cs-wheel-v-slider" min="0" max="100" value="${currentColor.v}">
            <input type="number" class="cs-slider-num" id="cs-wheel-v-num" min="0" max="100" value="${currentColor.v}">
          </div>
        </div>

        <!-- TAB 3: SV BOX -->
        <div class="cs-panel ${activeTab === 'box' ? 'active' : ''}" id="cs-panel-box">
          <div class="cs-svbox-wrap" id="cs-svbox-wrap">
            <canvas class="cs-svbox-canvas" id="cs-canvas-box" width="240" height="150"></canvas>
            <div class="cs-svbox-cursor" id="cs-svbox-cursor"></div>
          </div>
          <div class="cs-slider-row">
            <span class="cs-slider-lbl" style="color: #d3869b;">H</span>
            <input type="range" class="cs-slider" id="cs-box-hue-slider" min="0" max="359" value="${currentColor.h}" style="background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);">
            <input type="number" class="cs-slider-num" id="cs-box-hue-num" min="0" max="359" value="${currentColor.h}">
          </div>
        </div>

        <!-- TAB 4: PALETTES -->
        <div class="cs-panel ${activeTab === 'palettes' ? 'active' : ''}" id="cs-panel-palettes">
          <div class="cs-palette-bar">
            <select class="cs-palette-select" id="cs-palette-select"></select>
            <button type="button" class="cs-btn" id="cs-btn-add-to-pal" title="Save current color to this palette">+ Swatch</button>
            <button type="button" class="cs-btn" id="cs-btn-new-pal" title="Create a new custom palette">New...</button>
          </div>
          <div class="cs-swatches-grid" id="cs-swatches-grid"></div>
          <div style="display: flex; gap: 4px; justify-content: flex-end;">
            <button type="button" class="cs-btn" id="cs-btn-export-pal" title="Export palette to JSON" style="font-size: 10px;">Export</button>
            <button type="button" class="cs-btn" id="cs-btn-import-pal" title="Import palette from JSON" style="font-size: 10px;">Import</button>
            <button type="button" class="cs-btn" id="cs-btn-del-pal" title="Delete current custom palette" style="font-size: 10px; color: var(--danger); display: none;">Delete</button>
          </div>
        </div>
      </div>
    `;

    // Elements
    const prevChip = root.querySelector('#cs-prev-chip');
    const currChip = root.querySelector('#cs-curr-chip');
    const hexInput = root.querySelector('#cs-hex-input');
    const btnCopyHex = root.querySelector('#cs-btn-copy-hex');
    const btnEyedropper = root.querySelector('#cs-btn-eyedropper');

    // Tab buttons & panels
    const tabBtns = root.querySelectorAll('.cs-tab-btn');
    const panels = {
      sliders: root.querySelector('#cs-panel-sliders'),
      wheel: root.querySelector('#cs-panel-wheel'),
      box: root.querySelector('#cs-panel-box'),
      palettes: root.querySelector('#cs-panel-palettes')
    };

    // Sliders
    const slR = root.querySelector('#cs-slider-r');
    const numR = root.querySelector('#cs-num-r');
    const slG = root.querySelector('#cs-slider-g');
    const numG = root.querySelector('#cs-num-g');
    const slB = root.querySelector('#cs-slider-b');
    const numB = root.querySelector('#cs-num-b');

    const slH = root.querySelector('#cs-slider-h');
    const numH = root.querySelector('#cs-num-h');
    const slS = root.querySelector('#cs-slider-s');
    const numS = root.querySelector('#cs-num-s');
    const slL = root.querySelector('#cs-slider-l');
    const numL = root.querySelector('#cs-num-l');

    const slWheelV = root.querySelector('#cs-wheel-v-slider');
    const numWheelV = root.querySelector('#cs-wheel-v-num');
    const slBoxHue = root.querySelector('#cs-box-hue-slider');
    const numBoxHue = root.querySelector('#cs-box-hue-num');

    // Canvases
    const canvasWheel = root.querySelector('#cs-canvas-wheel');
    const canvasBox = root.querySelector('#cs-canvas-box');
    const svBoxWrap = root.querySelector('#cs-svbox-wrap');
    const svCursor = root.querySelector('#cs-svbox-cursor');

    // Palettes
    const palSelect = root.querySelector('#cs-palette-select');
    const swatchesGrid = root.querySelector('#cs-swatches-grid');
    const btnAddToPal = root.querySelector('#cs-btn-add-to-pal');
    const btnNewPal = root.querySelector('#cs-btn-new-pal');
    const btnDelPal = root.querySelector('#cs-btn-del-pal');
    const btnExportPal = root.querySelector('#cs-btn-export-pal');
    const btnImportPal = root.querySelector('#cs-btn-import-pal');

    function updateTargetSwatches(fHex, sHex) {
      if (fHex) fillHex = fHex.toUpperCase();
      if (sHex) strokeHex = sHex.toUpperCase();
      const fEl = root.querySelector('#cs-target-swatch-fill');
      const sEl = root.querySelector('#cs-target-swatch-stroke');
      if (fEl) fEl.style.backgroundColor = fillHex;
      if (sEl) sEl.style.backgroundColor = strokeHex;
    }

    function updateAllControls(source) {
      if (currChip) currChip.style.background = currentColor.hex;
      if (hexInput && source !== 'hex') hexInput.value = currentColor.hex;

      if (activeTarget === 'fill') {
        fillHex = currentColor.hex;
      } else {
        strokeHex = currentColor.hex;
      }
      updateTargetSwatches(fillHex, strokeHex);

      // RGB
      if (source !== 'rgb_r' && slR) slR.value = currentColor.r;
      if (source !== 'rgb_r' && numR) numR.value = currentColor.r;
      if (source !== 'rgb_g' && slG) slG.value = currentColor.g;
      if (source !== 'rgb_g' && numG) numG.value = currentColor.g;
      if (source !== 'rgb_b' && slB) slB.value = currentColor.b;
      if (source !== 'rgb_b' && numB) numB.value = currentColor.b;

      // HSL
      if (source !== 'hsl_h' && slH) slH.value = currentColor.h;
      if (source !== 'hsl_h' && numH) numH.value = currentColor.h;
      if (source !== 'hsl_s' && slS) slS.value = currentColor.s;
      if (source !== 'hsl_s' && numS) numS.value = currentColor.s;
      if (source !== 'hsl_l' && slL) slL.value = currentColor.l;
      if (source !== 'hsl_l' && numL) numL.value = currentColor.l;

      // Wheel / Box
      if (slWheelV) slWheelV.value = currentColor.v;
      if (numWheelV) numWheelV.value = currentColor.v;
      if (slBoxHue) slBoxHue.value = currentColor.h;
      if (numBoxHue) numBoxHue.value = currentColor.h;

      // Dynamic tracks
      if (slR) slR.style.background = `linear-gradient(to right, ${rgbToHex(0, currentColor.g, currentColor.b)}, ${rgbToHex(255, currentColor.g, currentColor.b)})`;
      if (slG) slG.style.background = `linear-gradient(to right, ${rgbToHex(currentColor.r, 0, currentColor.b)}, ${rgbToHex(currentColor.r, 255, currentColor.b)})`;
      if (slB) slB.style.background = `linear-gradient(to right, ${rgbToHex(currentColor.r, currentColor.g, 0)}, ${rgbToHex(currentColor.r, currentColor.g, 255)})`;
      if (slS) slS.style.background = `linear-gradient(to right, ${rgbToHex(...Object.values(hslToRgb(currentColor.h, 0, currentColor.l)))}, ${rgbToHex(...Object.values(hslToRgb(currentColor.h, 100, currentColor.l)))})`;
      if (slL) slL.style.background = `linear-gradient(to right, #000000, ${rgbToHex(...Object.values(hslToRgb(currentColor.h, currentColor.s, 50)))}, #ffffff)`;

      // Render Visual Canvases
      if (activeTab === 'wheel') drawWheel();
      if (activeTab === 'box') {
        drawSvBox();
        updateSvCursor();
      }
      if (activeTab === 'palettes') highlightActiveSwatch();

      onChange(currentColor.hex, currentColor, activeTarget);
    }

    function setColorFromRgb(r, g, b, source) {
      currentColor = parseColor(rgbToHex(r, g, b));
      updateAllControls(source);
    }

    function setColorFromHsl(h, s, l, source) {
      const rgb = hslToRgb(h, s, l);
      currentColor = parseColor(rgbToHex(rgb.r, rgb.g, rgb.b));
      currentColor.h = h;
      currentColor.s = s;
      currentColor.l = l;
      updateAllControls(source);
    }

    function setColorFromHex(hex, source) {
      currentColor = parseColor(hex);
      updateAllControls(source);
    }

    function drawWheel() {
      if (!canvasWheel) return;
      const ctx = canvasWheel.getContext('2d');
      const w = canvasWheel.width, h = canvasWheel.height;
      const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 4;
      const imgData = ctx.createImageData(w, h);
      const data = imgData.data;
      const valFrac = clamp(currentColor.v, 0, 100) / 100;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          const idx = (y * w + x) * 4;

          if (dist <= r) {
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle < 0) angle += 360;
            const sat = dist / r;
            const rgb = hsvToRgb(angle, sat * 100, valFrac * 100);
            data[idx + 0] = rgb.r;
            data[idx + 1] = rgb.g;
            data[idx + 2] = rgb.b;
            data[idx + 3] = 255;
          } else {
            data[idx + 3] = 0;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Indicator circle
      const curH = currentColor.h * (Math.PI / 180);
      const curHsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
      const curDist = (curHsv.s / 100) * r;
      const px = cx + Math.cos(curH) * curDist;
      const py = cy + Math.sin(curH) * curDist;

      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawSvBox() {
      if (!canvasBox) return;
      const ctx = canvasBox.getContext('2d');
      const w = canvasBox.width, h = canvasBox.height;

      const pureHueRgb = hslToRgb(currentColor.h, 100, 50);
      ctx.fillStyle = `rgb(${pureHueRgb.r}, ${pureHueRgb.g}, ${pureHueRgb.b})`;
      ctx.fillRect(0, 0, w, h);

      const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
      whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
      whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = whiteGrad;
      ctx.fillRect(0, 0, w, h);

      const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
      blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
      blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = blackGrad;
      ctx.fillRect(0, 0, w, h);
    }

    function updateSvCursor() {
      if (!svCursor || !svBoxWrap) return;
      const curHsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
      const sat = curHsv.s / 100;
      const val = curHsv.v / 100;
      svCursor.style.left = `${sat * 100}%`;
      svCursor.style.top = `${(1 - val) * 100}%`;
    }

    // Canvas Event Listeners
    if (canvasWheel) {
      let isTrackingWheel = false;
      const pickWheel = (clientX, clientY) => {
        const rect = canvasWheel.getBoundingClientRect();
        const cx = rect.width / 2, cy = rect.height / 2;
        const dx = clientX - rect.left - cx;
        const dy = clientY - rect.top - cy;
        const r = Math.min(cx, cy) - 4;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        const sat = clamp(Math.hypot(dx, dy) / r, 0, 1) * 100;
        const rgb = hsvToRgb(angle, sat, currentColor.v);
        setColorFromRgb(rgb.r, rgb.g, rgb.b, 'wheel');
      };
      canvasWheel.addEventListener('pointerdown', (e) => {
        isTrackingWheel = true;
        pickWheel(e.clientX, e.clientY);
      });
      window.addEventListener('pointermove', (e) => {
        if (isTrackingWheel) pickWheel(e.clientX, e.clientY);
      });
      window.addEventListener('pointerup', () => {
        if (isTrackingWheel) {
          isTrackingWheel = false;
          onCommit(currentColor.hex, currentColor, activeTarget);
        }
      });
    }

    if (svBoxWrap) {
      let isTrackingBox = false;
      const pickBox = (clientX, clientY) => {
        const rect = svBoxWrap.getBoundingClientRect();
        const s = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
        const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * 100;
        const rgb = hsvToRgb(currentColor.h, s, v);
        setColorFromRgb(rgb.r, rgb.g, rgb.b, 'box');
      };
      svBoxWrap.addEventListener('pointerdown', (e) => {
        isTrackingBox = true;
        pickBox(e.clientX, e.clientY);
      });
      window.addEventListener('pointermove', (e) => {
        if (isTrackingBox) pickBox(e.clientX, e.clientY);
      });
      window.addEventListener('pointerup', () => {
        if (isTrackingBox) {
          isTrackingBox = false;
          onCommit(currentColor.hex, currentColor, activeTarget);
        }
      });
    }

    // Target switcher
    if (showTargetBar) {
      const targetBtns = root.querySelectorAll('.cs-target-btn');
      targetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const t = btn.dataset.target;
          if (t && t !== activeTarget) {
            activeTarget = t;
            targetBtns.forEach(b => b.classList.toggle('active', b === btn));
            const newHex = (activeTarget === 'stroke' ? strokeHex : fillHex);
            setColorFromHex(newHex, 'target_switch');
            onTargetChange(activeTarget);
          }
        });
      });

      const btnSwap = root.querySelector('#cs-target-swap');
      btnSwap?.addEventListener('click', () => {
        const temp = fillHex;
        fillHex = strokeHex;
        strokeHex = temp;
        updateTargetSwatches(fillHex, strokeHex);
        const curHex = (activeTarget === 'stroke' ? strokeHex : fillHex);
        setColorFromHex(curHex, 'swap');
        onSwap(fillHex, strokeHex);
      });
    }

    // Tab Switching
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        activeTab = target;
        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        Object.entries(panels).forEach(([k, p]) => {
          if (p) p.classList.toggle('active', k === target);
        });
        if (target === 'wheel') drawWheel();
        if (target === 'box') {
          drawSvBox();
          updateSvCursor();
        }
        if (target === 'palettes') renderPalettesUI();
      });
    });

    // Slider change / commit helpers
    const handleCommit = () => onCommit(currentColor.hex, currentColor, activeTarget);

    // RGB Slider Bindings
    slR?.addEventListener('input', () => setColorFromRgb(Number(slR.value), currentColor.g, currentColor.b, 'rgb_r'));
    slR?.addEventListener('change', handleCommit);
    numR?.addEventListener('change', () => { setColorFromRgb(clamp(Number(numR.value) || 0, 0, 255), currentColor.g, currentColor.b, 'rgb_r'); handleCommit(); });
    slG?.addEventListener('input', () => setColorFromRgb(currentColor.r, Number(slG.value), currentColor.b, 'rgb_g'));
    slG?.addEventListener('change', handleCommit);
    numG?.addEventListener('change', () => { setColorFromRgb(currentColor.r, clamp(Number(numG.value) || 0, 0, 255), currentColor.b, 'rgb_g'); handleCommit(); });
    slB?.addEventListener('input', () => setColorFromRgb(currentColor.r, currentColor.g, Number(slB.value), 'rgb_b'));
    slB?.addEventListener('change', handleCommit);
    numB?.addEventListener('change', () => { setColorFromRgb(currentColor.r, currentColor.g, clamp(Number(numB.value) || 0, 0, 255), 'rgb_b'); handleCommit(); });

    // HSL Slider Bindings
    slH?.addEventListener('input', () => setColorFromHsl(Number(slH.value), currentColor.s, currentColor.l, 'hsl_h'));
    slH?.addEventListener('change', handleCommit);
    numH?.addEventListener('change', () => { setColorFromHsl(clamp(Number(numH.value) || 0, 0, 359), currentColor.s, currentColor.l, 'hsl_h'); handleCommit(); });
    slS?.addEventListener('input', () => setColorFromHsl(currentColor.h, Number(slS.value), currentColor.l, 'hsl_s'));
    slS?.addEventListener('change', handleCommit);
    numS?.addEventListener('change', () => { setColorFromHsl(currentColor.h, clamp(Number(numS.value) || 0, 0, 100), currentColor.l, 'hsl_s'); handleCommit(); });
    slL?.addEventListener('input', () => setColorFromHsl(currentColor.h, currentColor.s, Number(slL.value), 'hsl_l'));
    slL?.addEventListener('change', handleCommit);
    numL?.addEventListener('change', () => { setColorFromHsl(currentColor.h, currentColor.s, clamp(Number(numL.value) || 0, 0, 100), 'hsl_l'); handleCommit(); });

    // Wheel & Box Hue Bindings
    slWheelV?.addEventListener('input', () => {
      const rgb = hsvToRgb(currentColor.h, currentColor.s, Number(slWheelV.value));
      setColorFromRgb(rgb.r, rgb.g, rgb.b, 'wheel_v');
    });
    slWheelV?.addEventListener('change', handleCommit);
    numWheelV?.addEventListener('change', () => {
      const v = clamp(Number(numWheelV.value) || 0, 0, 100);
      const rgb = hsvToRgb(currentColor.h, currentColor.s, v);
      setColorFromRgb(rgb.r, rgb.g, rgb.b, 'wheel_v');
      handleCommit();
    });

    slBoxHue?.addEventListener('input', () => {
      currentColor.h = Number(slBoxHue.value);
      drawSvBox();
      updateSvCursor();
      const curHsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
      const rgb = hsvToRgb(currentColor.h, curHsv.s, curHsv.v);
      setColorFromRgb(rgb.r, rgb.g, rgb.b, 'box_hue');
    });
    slBoxHue?.addEventListener('change', handleCommit);
    numBoxHue?.addEventListener('change', () => {
      const h = clamp(Number(numBoxHue.value) || 0, 0, 359);
      currentColor.h = h;
      drawSvBox();
      updateSvCursor();
      const curHsv = rgbToHsv(currentColor.r, currentColor.g, currentColor.b);
      const rgb = hsvToRgb(currentColor.h, curHsv.s, curHsv.v);
      setColorFromRgb(rgb.r, rgb.g, rgb.b, 'box_hue');
      handleCommit();
    });

    // Direct Hex input
    hexInput?.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        setColorFromHex(val, 'hex');
      }
    });
    hexInput?.addEventListener('change', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        setColorFromHex(val, 'hex');
        handleCommit();
      } else {
        hexInput.value = currentColor.hex;
      }
    });

    // Copy HEX
    btnCopyHex?.addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(currentColor.hex).then(() => {
          btnCopyHex.textContent = 'Copied!';
          setTimeout(() => { btnCopyHex.textContent = 'Copy'; }, 1200);
        });
      }
    });

    // Revert to previous color
    prevChip?.addEventListener('click', () => {
      setColorFromHex(previousColorHex, 'revert');
      handleCommit();
    });

    // Eyedropper API
    if (btnEyedropper) {
      btnEyedropper.addEventListener('click', async () => {
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            setColorFromHex(result.sRGBHex, 'eyedropper');
            handleCommit();
          }
        } catch (_) {}
      });
    }

    // Palettes UI Management
    function renderPalettesUI() {
      if (!palSelect || !swatchesGrid) return;
      const all = getAllPalettes();
      palSelect.innerHTML = '';

      const optGroupCustom = document.createElement('optgroup');
      optGroupCustom.label = 'Custom & User Palettes';

      const optGroupBuiltin = document.createElement('optgroup');
      optGroupBuiltin.label = 'Built-in Palettes';

      Object.entries(all).forEach(([id, pal]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${pal.name} (${pal.colors ? pal.colors.length : 0})`;
        if (BUILTIN_PALETTES[id]) optGroupBuiltin.appendChild(opt);
        else optGroupCustom.appendChild(opt);
      });

      palSelect.appendChild(optGroupCustom);
      palSelect.appendChild(optGroupBuiltin);
      palSelect.value = activePaletteId;

      if (btnDelPal) {
        btnDelPal.style.display = (activePaletteId !== 'custom' && !BUILTIN_PALETTES[activePaletteId]) ? 'inline-flex' : 'none';
      }

      renderSwatches();
    }

    function renderSwatches() {
      if (!swatchesGrid) return;
      swatchesGrid.innerHTML = '';
      const pal = getPalette(activePaletteId);
      const colors = pal.colors || [];

      if (colors.length === 0) {
        swatchesGrid.innerHTML = '<div style="grid-column: 1/-1; font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px;">Palette is empty. Click "+ Swatch" to save current color.</div>';
        return;
      }

      colors.forEach(col => {
        const chip = document.createElement('div');
        chip.className = 'cs-swatch-chip' + (col.toUpperCase() === currentColor.hex ? ' active' : '');
        chip.style.backgroundColor = col;
        chip.title = `${col} (Click to select, Right-click to remove)`;
        chip.addEventListener('click', () => {
          setColorFromHex(col, 'swatch');
          handleCommit();
        });
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (confirm(`Remove swatch ${col} from palette?`)) {
            removeColorFromPalette(activePaletteId, col);
            renderSwatches();
          }
        });
        swatchesGrid.appendChild(chip);
      });
    }

    function highlightActiveSwatch() {
      if (!swatchesGrid) return;
      swatchesGrid.querySelectorAll('.cs-swatch-chip').forEach(chip => {
        const chipHex = chip.style.backgroundColor;
        const parsed = parseColor(chipHex);
        chip.classList.toggle('active', parsed.hex === currentColor.hex);
      });
    }

    palSelect?.addEventListener('change', () => {
      activePaletteId = palSelect.value;
      setActivePaletteId(activePaletteId);
      if (btnDelPal) {
        btnDelPal.style.display = (activePaletteId !== 'custom' && !BUILTIN_PALETTES[activePaletteId]) ? 'inline-flex' : 'none';
      }
      renderSwatches();
    });

    btnAddToPal?.addEventListener('click', () => {
      addColorToPalette(activePaletteId, currentColor.hex);
      renderSwatches();
    });

    btnNewPal?.addEventListener('click', () => {
      const name = prompt('Enter a name for the new color palette:');
      if (name && name.trim()) {
        const newId = createCustomPalette(name);
        if (newId) {
          activePaletteId = newId;
          setActivePaletteId(newId);
          renderPalettesUI();
        }
      }
    });

    btnDelPal?.addEventListener('click', () => {
      if (confirm('Delete this custom palette?')) {
        deleteCustomPalette(activePaletteId);
        activePaletteId = 'gruvbox_dark';
        setActivePaletteId('gruvbox_dark');
        renderPalettesUI();
      }
    });

    btnExportPal?.addEventListener('click', () => {
      const pal = getPalette(activePaletteId);
      const jsonStr = JSON.stringify(pal, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${pal.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_palette.json`;
      a.click();
    });

    btnImportPal?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,text/plain';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          try {
            const content = re.target.result;
            let imported;
            try {
              imported = JSON.parse(content);
            } catch (_) {
              const hexMatches = content.match(/#[0-9A-Fa-f]{6}/g);
              if (hexMatches) {
                imported = { name: file.name.replace(/\.[^/.]+$/, ''), colors: hexMatches };
              }
            }
            if (imported && imported.colors && Array.isArray(imported.colors)) {
              const newId = createCustomPalette(imported.name || 'Imported Palette');
              if (newId) {
                const custom = getCustomPalettes();
                custom[newId].colors = imported.colors;
                saveCustomPalettes(custom);
                activePaletteId = newId;
                setActivePaletteId(newId);
                renderPalettesUI();
              }
            }
          } catch (_) {
            alert('Failed to parse palette file.');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });

    // Initial render
    updateAllControls('init');
    renderPalettesUI();

    return {
      element: root,
      setColor: (c, source = 'external') => setColorFromHex(c, source),
      getColor: () => currentColor.hex,
      getColorObject: () => ({ ...currentColor }),
      setTarget: (t) => {
        if (t && t !== activeTarget) {
          activeTarget = t;
          const targetBtns = root.querySelectorAll('.cs-target-btn');
          targetBtns.forEach(b => b.classList.toggle('active', b.dataset.target === t));
          const hex = (activeTarget === 'stroke' ? strokeHex : fillHex);
          setColorFromHex(hex, 'target_switch');
        }
      },
      getTarget: () => activeTarget,
      updateTargetSwatches: (fHex, sHex) => updateTargetSwatches(fHex, sHex),
      sync: (target, hex, otherHex) => {
        if (target) {
          activeTarget = target;
          const targetBtns = root.querySelectorAll('.cs-target-btn');
          targetBtns.forEach(b => b.classList.toggle('active', b.dataset.target === target));
        }
        if (hex) {
          if (activeTarget === 'fill') fillHex = hex.toUpperCase();
          else strokeHex = hex.toUpperCase();
        }
        if (otherHex) {
          if (activeTarget === 'fill') strokeHex = otherHex.toUpperCase();
          else fillHex = otherHex.toUpperCase();
        }
        updateTargetSwatches(fillHex, strokeHex);
        const cur = (activeTarget === 'stroke' ? strokeHex : fillHex);
        previousColorHex = cur;
        if (prevChip) prevChip.style.backgroundColor = previousColorHex;
        setColorFromHex(cur, 'sync');
      },
      refresh: () => {
        updateAllControls('refresh');
        renderPalettesUI();
      }
    };
  }

  function mountColorTab(container, options = {}) {
    ensureStylesInjected();
    if (!container) return null;
    container.innerHTML = '';
    const widget = createPickerWidget({
      mode: 'embedded',
      showTargetBar: true,
      ...options
    });
    container.appendChild(widget.element);
    return widget;
  }

  function openPicker(options = {}) {
    ensureStylesInjected();
    if (activePickerState && activePickerState.close) {
      activePickerState.close();
    }
    const overlay = document.createElement('div');
    overlay.className = 'cs-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'cs-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const title = options.title || 'Color Studio';
    dialog.innerHTML = `
      <div class="cs-header">
        <div class="cs-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="4"></circle>
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          </svg>
          <span>${title}</span>
        </div>
        <button type="button" class="cs-close-btn" title="Close Color Studio">✕</button>
      </div>
      <div class="cs-dialog-content" style="padding: 10px;"></div>
      <div class="cs-footer">
        <div style="display: flex; justify-content: flex-end; gap: 6px;">
          <button type="button" class="cs-btn" id="cs-modal-cancel">Cancel</button>
          <button type="button" class="cs-btn cs-btn-primary" id="cs-modal-done">Apply Color</button>
        </div>
      </div>
    `;
    overlay.appendChild(dialog);

    const widget = createPickerWidget({
      mode: 'modal',
      showTargetBar: false,
      color: options.color,
      initialTab: options.initialTab,
      onChange: options.onChange
    });
    dialog.querySelector('.cs-dialog-content').appendChild(widget.element);
    document.body.appendChild(overlay);

    function closeDialog(confirmed = false) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      activePickerState = null;
      if (confirmed) {
        if (options.onConfirm) options.onConfirm(widget.getColor(), widget.getColorObject());
        if (options.onApply) options.onApply(widget.getColor());
      } else {
        if (options.onCancel) options.onCancel(options.color);
      }
    }

    dialog.querySelector('.cs-close-btn')?.addEventListener('click', () => closeDialog(true));
    dialog.querySelector('#cs-modal-done')?.addEventListener('click', () => closeDialog(true));
    dialog.querySelector('#cs-modal-cancel')?.addEventListener('click', () => closeDialog(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog(true);
    });

    activePickerState = {
      close: () => closeDialog(false),
      setColor: (c) => widget.setColor(c)
    };
    return activePickerState;
  }

  // ── 5. Quick Palette Swatch Strip Component ──

  function createQuickPaletteStrip(options = {}) {
    ensureStylesInjected();
    const container = document.createElement('div');
    container.className = 'cs-quick-bar';
    const onSelect = options.onSelect || (() => {});
    const count = options.count || 14;

    function renderStrip() {
      container.innerHTML = '';
      const pal = getPalette(getActivePaletteId());
      const colors = (pal.colors || []).slice(0, count);

      colors.forEach(col => {
        const chip = document.createElement('div');
        chip.className = 'cs-quick-chip';
        chip.style.backgroundColor = col;
        chip.title = `Color: ${col}`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(col);
        });
        container.appendChild(chip);
      });

      // Quick "+ Swatch" button
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'cs-btn';
      addBtn.style.padding = '1px 5px';
      addBtn.style.fontSize = '10px';
      addBtn.style.height = '18px';
      addBtn.textContent = '+';
      addBtn.title = 'Add active color to palette';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof options.getCurrentColor === 'function') {
          const cur = options.getCurrentColor();
          if (cur) {
            addColorToPalette(getActivePaletteId(), cur);
            renderStrip();
          }
        }
      });
      container.appendChild(addBtn);
    }

    renderStrip();
    container.refresh = renderStrip;
    return container;
  }

  return {
    rgbToHex,
    hexToRgb,
    rgbToHsl,
    hslToRgb,
    rgbToHsv,
    hsvToRgb,
    parseColor,
    BUILTIN_PALETTES,
    getAllPalettes,
    getPalette,
    getActivePaletteId,
    setActivePaletteId,
    createCustomPalette,
    deleteCustomPalette,
    addColorToPalette,
    removeColorFromPalette,
    createPickerWidget,
    mountColorTab,
    openPicker,
    createQuickPaletteStrip
  };
}));
