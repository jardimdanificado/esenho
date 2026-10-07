/**
 * =========================================================================
 * Material & Color Studio (src/color_studio.js)
 * Ultra-High-Performance, Zero-Lag Material & Color Studio for Esenho.
 * Unified visual Material system supporting:
 * - Static Flat Colors & Alpha Transparency (HSV GPU Box, RGB/HSL, Palettes)
 * - Multi-stop Linear & Radial Gradients with HDR Intensity & Angle/Radius
 * - 70+ Procedural Textures & Custom Surface Dynamics (Grain, Warp, Swirl, Posterize)
 * - 28+ WASM Optical Lenses & Image Processing Kernels (Bloom, Kuwahara, Glitch, etc.)
 * - Rich 1-Click Material Presets & Custom Material Library
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exportsObj = factory();
    root.ColorStudio = exportsObj;
    root.MaterialsStudio = exportsObj;
    root.MaterialStudio = exportsObj;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 1. Color Math & Conversions (Zero allocations & branch-optimized) ──

  function getDomEl(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  function rgbToHex(r, g, b, a = 1.0) {
    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);
    const hexR = (r < 16 ? '0' : '') + r.toString(16);
    const hexG = (g < 16 ? '0' : '') + hexGToString(g);
    const hexB = (b < 16 ? '0' : '') + hexBToString(b);
    if (a !== undefined && a < 1.0 && a >= 0) {
      const alphaVal = clamp(Math.round(a * 255), 0, 255);
      const hexA = (alphaVal < 16 ? '0' : '') + alphaVal.toString(16);
      return `#${hexR}${hexG}${hexB}${hexA}`;
    }
    return `#${hexR}${hexG}${hexB}`;
  }

  function hexGToString(g) { return g.toString(16); }
  function hexBToString(b) { return b.toString(16); }

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return { r: 250, g: 189, b: 47, a: 1.0 };
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
    return { r: 250, g: 189, b: 47, a: 1.0 };
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
    h = ((h % 360) + 360) % 360 / 60;
    s = clamp(s, 0, 100) / 100;
    v = clamp(v, 0, 100) / 100;

    const i = Math.floor(h);
    const f = h - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));

    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
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

  function parseColor(input) {
    if (!input || input === 'none' || input === 'transparent') {
      return { isNone: true, hex: 'none', r: 0, g: 0, b: 0, a: 0 };
    }
    const clean = String(input).trim();
    if (clean.startsWith('#')) {
      const rgb = hexToRgb(clean);
      return { isNone: false, hex: clean, ...rgb };
    }
    return { isNone: false, hex: '#fabd2f', r: 250, g: 189, b: 47, a: 1.0 };
  }

  // ── 2. Built-in Palette Presets ──

  const PALETTES = {
    gruvbox: {
      name: 'Gruvbox',
      colors: [
        '#282828', '#928374', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984',
        '#1d2021', '#ebdbb2', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#fbf1c7'
      ]
    },
    material: {
      name: 'Material Design',
      colors: [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
        '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722',
        '#795548', '#9e9e9e', '#607d8b', '#000000', '#ffffff'
      ]
    },
    nord: {
      name: 'Nord',
      colors: [
        '#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#e5e9f0', '#eceff4',
        '#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a', '#d08770', '#ebcb8b', '#a3be8c', '#b48ead'
      ]
    },
    cyberpunk: {
      name: 'Cyberpunk',
      colors: [
        '#0d0221', '#0f084b', '#26408b', '#a6cfd5', '#c2e7d9', '#ff0055', '#00ffcc', '#ffe600',
        '#7928ca', '#ff0080', '#0070f3', '#50e3c2', '#f5a623', '#bd10e0', '#4a90e2', '#50e3c2'
      ]
    },
    monochrome: {
      name: 'Monochrome',
      colors: [
        '#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777',
        '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#ffffff'
      ]
    }
  };

  const CUSTOM_PALETTE_KEY = 'esenho_color_studio_custom_swatches';
  const CUSTOM_MATERIALS_KEY = 'esenho_materials_custom_presets';

  function getCustomSwatches() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CUSTOM_PALETTE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (_) {}
    return ['#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598', '#d3869b'];
  }

  function saveCustomSwatches(arr) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CUSTOM_PALETTE_KEY, JSON.stringify(arr));
      }
    } catch (_) {}
  }

  // ── 3. High-Performance Materials Studio Component ──

  class ColorStudioWidget {
    constructor() {
      this.initialized = false;
      this.container = null;
      this.activeTarget = 'fill'; // 'fill' | 'stroke' | 'bg'
      this.activeMode = 'color'; // 'color' | 'gradient' | 'texture' | 'filter' | 'presets'
      this.colorSubMode = 'picker'; // 'picker' | 'sliders' | 'palettes'

      // Color State
      this.currentR = 250;
      this.currentG = 189;
      this.currentB = 47;
      this.currentA = 1.0;
      this.currentH = 42;
      this.currentS = 81;
      this.currentV = 98;
      this.currentHex = '#fabd2f';
      this.isTargetNone = false;

      // Gradient State
      this.gradientType = 'linear'; // 'linear' | 'radial'
      this.gradientStops = [
        { offset: 0, color: '#fe8019', opacity: 1.0, intensity: 1.0 },
        { offset: 1, color: '#fabd2f', opacity: 1.0, intensity: 1.0 }
      ];
      this.activeGradientStopIdx = 0;
      this.gradientAngle = 0;
      this.gradientRadius = 0.5;

      // Texture State
      this.textureMode = 0;
      this.textureScale = 100;
      this.textureAngle = 0;
      this.textureContrast = 100;
      this.textureGrain = 0;
      this.textureRelative = false;
      this.textureOffsetX = 0;
      this.textureOffsetY = 0;
      this.textureHardness = 100;
      this.textureHardnessIntensity = 50;
      this.textureWarpStrength = 0;
      this.textureWarpFreq = 20;
      this.textureNoiseDistort = 0;
      this.texturePinchSwirl = 0;
      this.texturePosterize = 0;
      this.textureInvert = false;

      // WASM FX State
      this.filterEnabled = false;
      this.filterTarget = 'fill';
      this.filterPlugin = 'bloom';
      this.filterP1 = 0;
      this.filterP2 = 0;
      this.filterOpacity = 1.0;

      // Caches for zero-lag diffing
      this._lastFillVal = null;
      this._lastStrokeVal = null;
      this._lastBgVal = null;
      this._isSyncing = false;
      this._needsSyncWhenVisible = false;
      this._isDragging = false;

      // DOM Elements Cache
      this.dom = {};
    }

    init(mountEl) {
      if (this.initialized || !mountEl) return;
      this.container = mountEl;
      this.buildDOM();
      this.bindEvents();
      this.initialized = true;

      // Initial read
      this.syncFromSelection(true);
    }

    buildDOM() {
      this.container.innerHTML = `
        <div class="cs-root">
          <!-- Top Target Header -->
          <div class="cs-target-bar">
            <button type="button" class="cs-target-btn active" id="cs-target-fill" title="Active Target: Shape Fill">
              <span class="cs-chip" id="cs-target-fill-chip"></span>
              <span class="cs-target-lbl">Fill</span>
            </button>
            <button type="button" class="cs-target-btn" id="cs-target-stroke" title="Active Target: Shape Stroke">
              <span class="cs-chip" id="cs-target-stroke-chip"></span>
              <span class="cs-target-lbl">Stroke</span>
            </button>
            <button type="button" class="cs-target-btn" id="cs-target-bg" title="Active Target: Canvas Backdrop">
              <span class="cs-chip" id="cs-target-bg-chip"></span>
              <span class="cs-target-lbl">Back</span>
            </button>
            <button type="button" class="cs-icon-btn" id="cs-btn-swap" title="Swap Fill and Stroke (⇄)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4"/>
              </svg>
            </button>
            <button type="button" class="cs-icon-btn" id="cs-btn-none" title="Set to None (Transparent)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </button>
          </div>

          <!-- Main Material Section Pills -->
          <div class="cs-mode-tabs">
            <button type="button" class="cs-mode-btn active" data-mode="color" title="Flat Static Color & Transparency">Color</button>
            <button type="button" class="cs-mode-btn" data-mode="gradient" title="Linear & Radial Multi-Stop Gradients">Gradient</button>
            <button type="button" class="cs-mode-btn" data-mode="texture" title="70+ Procedural Surface Textures & Distortion">Texture</button>
            <button type="button" class="cs-mode-btn" data-mode="filter" title="WASM Image Processing & Optical Lenses">WASM FX</button>
            <button type="button" class="cs-mode-btn" data-mode="presets" title="Pre-made Material Styles">Presets</button>
          </div>

          <!-- SECTION 1: COLOR (Static Solid Color + Sub-modes) -->
          <div class="cs-panel cs-panel-color active" id="cs-panel-color">
            <div class="cs-submode-tabs">
              <button type="button" class="cs-submode-btn active" data-submode="picker">Visual</button>
              <button type="button" class="cs-submode-btn" data-submode="sliders">Sliders</button>
              <button type="button" class="cs-submode-btn" data-submode="palettes">Palettes</button>
            </div>

            <!-- Visual Picker -->
            <div class="cs-subpanel cs-subpanel-picker active" id="cs-subpanel-picker">
              <div class="cs-sv-box" id="cs-sv-box" style="--cs-hue: 42;">
                <div class="cs-sv-cursor" id="cs-sv-cursor" style="left: 81%; top: 2%;"></div>
              </div>
              <div class="cs-slider-row">
                <input type="range" min="0" max="360" step="1" value="42" class="cs-hue-slider" id="cs-slider-hue">
              </div>
              <div class="cs-slider-row cs-alpha-row">
                <input type="range" min="0" max="100" step="1" value="100" class="cs-alpha-slider" id="cs-slider-alpha" title="Material Alpha">
              </div>
            </div>

            <!-- Sliders Picker -->
            <div class="cs-subpanel cs-subpanel-sliders" id="cs-subpanel-sliders">
              <div class="cs-slider-group">
                <div class="cs-slider-item">
                  <span class="cs-sl-label" style="color: #ea6962;">R</span>
                  <input type="range" min="0" max="255" step="1" id="cs-sl-r" class="cs-mini-range">
                  <input type="number" min="0" max="255" id="cs-num-r" class="cs-mini-num">
                </div>
                <div class="cs-slider-item">
                  <span class="cs-sl-label" style="color: #b8bb26;">G</span>
                  <input type="range" min="0" max="255" step="1" id="cs-sl-g" class="cs-mini-range">
                  <input type="number" min="0" max="255" id="cs-num-g" class="cs-mini-num">
                </div>
                <div class="cs-slider-item">
                  <span class="cs-sl-label" style="color: #83a598;">B</span>
                  <input type="range" min="0" max="255" step="1" id="cs-sl-b" class="cs-mini-range">
                  <input type="number" min="0" max="255" id="cs-num-b" class="cs-mini-num">
                </div>
              </div>
              <div class="cs-slider-group" style="margin-top: 4px;">
                <div class="cs-slider-item">
                  <span class="cs-sl-label">H</span>
                  <input type="range" min="0" max="360" step="1" id="cs-sl-h" class="cs-mini-range">
                  <input type="number" min="0" max="360" id="cs-num-h" class="cs-mini-num">
                </div>
                <div class="cs-slider-item">
                  <span class="cs-sl-label">S%</span>
                  <input type="range" min="0" max="100" step="1" id="cs-sl-s" class="cs-mini-range">
                  <input type="number" min="0" max="100" id="cs-num-s" class="cs-mini-num">
                </div>
                <div class="cs-slider-item">
                  <span class="cs-sl-label">L%</span>
                  <input type="range" min="0" max="100" step="1" id="cs-sl-l" class="cs-mini-range">
                  <input type="number" min="0" max="100" id="cs-num-l" class="cs-mini-num">
                </div>
              </div>
            </div>

            <!-- Palettes Picker -->
            <div class="cs-subpanel cs-subpanel-palettes" id="cs-subpanel-palettes">
              <div class="cs-palette-toolbar">
                <select id="cs-palette-select" class="cs-select">
                  <option value="document">Document Colors</option>
                  <option value="gruvbox" selected>Gruvbox</option>
                  <option value="material">Material Design</option>
                  <option value="nord">Nord</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="monochrome">Monochrome</option>
                  <option value="custom">Custom Swatches</option>
                </select>
                <button type="button" class="cs-icon-btn" id="cs-btn-add-swatch" title="Add current color to palette">+</button>
              </div>
              <div class="cs-swatches-grid" id="cs-swatches-grid"></div>
            </div>

            <!-- Hex Bar -->
            <div class="cs-hex-bar">
              <div class="cs-current-swatch-box" id="cs-current-preview"></div>
              <input type="text" class="cs-hex-input" id="cs-hex-input" value="#FABD2F" maxlength="9" spellcheck="false">
              <button type="button" class="cs-icon-btn" id="cs-btn-copy" title="Copy HEX">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button type="button" class="cs-icon-btn" id="cs-btn-eyedropper" title="Pick color from screen">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2l4 4L7 17H3v-4L14 2z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- SECTION 2: GRADIENT (Linear / Radial Multi-Stop Editor) -->
          <div class="cs-panel cs-panel-gradient" id="cs-panel-gradient">
            <div class="cs-card">
              <div class="cs-form-row">
                <label>Type</label>
                <select id="cs-grad-type" class="cs-select">
                  <option value="linear">Linear Gradient</option>
                  <option value="radial">Radial Gradient</option>
                </select>
              </div>
              <!-- Interactive Gradient Preview & Stop Track -->
              <div id="cs-grad-preview-bar" class="cs-grad-bar" title="Click anywhere on bar to add color stop"></div>

              <div class="cs-form-row" style="margin-top: 4px;">
                <label>Stop</label>
                <div style="display: flex; gap: 4px; flex: 1;">
                  <select id="cs-grad-stop-select" class="cs-select" style="flex: 1;"></select>
                  <button type="button" class="cs-btn-mini" id="cs-btn-grad-add-stop" title="Add Stop">+</button>
                  <button type="button" class="cs-btn-mini danger" id="cs-btn-grad-del-stop" title="Remove Stop">✕</button>
                </div>
              </div>

              <div class="cs-form-row">
                <label>Color</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="color" id="cs-grad-stop-color" value="#fe8019" class="cs-color-input">
                  <input type="text" id="cs-grad-stop-color-text" value="#fe8019" class="cs-text-input">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Pos %</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-grad-stop-pos-slider" min="0" max="100" step="any" value="0" class="cs-mini-range">
                  <input type="number" id="cs-grad-stop-pos" min="0" max="100" step="any" value="0" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Opacity</label>
                <input type="number" id="cs-grad-stop-opacity" min="0" max="1" step="0.05" value="1.0" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Intensity</label>
                <input type="number" id="cs-grad-stop-intensity" min="0.1" max="10" step="0.1" value="1.0" title="HDR / Bloom Multiplier" class="cs-text-input">
              </div>

              <div class="cs-form-row" id="cs-grad-angle-row">
                <label>Angle °</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-grad-angle-slider" min="0" max="360" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-grad-angle" min="0" max="360" step="any" value="0" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row" id="cs-grad-radius-row" style="display: none;">
                <label>Radius</label>
                <input type="number" id="cs-grad-radius" min="0.01" max="10" step="0.05" value="0.5" class="cs-text-input">
              </div>
            </div>

            <!-- Gradient Presets -->
            <div class="cs-card">
              <div class="cs-card-title">Gradient Ramps</div>
              <div class="cs-gradient-presets-grid" id="cs-grad-presets-grid"></div>
            </div>
          </div>

          <!-- SECTION 3: TEXTURE (Procedural Textures & Dynamics) -->
          <div class="cs-panel cs-panel-texture" id="cs-panel-texture">
            <div class="cs-card">
              <div class="cs-form-row">
                <label>Pattern</label>
                <select id="cs-tex-mode" class="cs-select">
                  <option value="0">0: None / Solid</option>
                  <option value="1">1: Paper Grain</option>
                  <option value="2">2: Canvas Weave</option>
                  <option value="3">3: Noise Scatter</option>
                  <option value="4">4: Halftone Dots</option>
                  <option value="5">5: Grid Pattern</option>
                  <option value="6">6: Grunge / Distress</option>
                  <option value="7">7: Hatch Lines</option>
                  <option value="8">8: Watercolor Cold Press</option>
                  <option value="9">9: Charcoal Tooth</option>
                  <option value="10">10: Wood Grain</option>
                  <option value="11">11: Leather Pores</option>
                  <option value="12">12: Dense Linen</option>
                  <option value="13">13: Marble Veins</option>
                  <option value="14">14: Perlin Cloud</option>
                  <option value="15">15: Basket Weave</option>
                  <option value="16">16: Sandpaper Grit</option>
                  <option value="17">17: Radial Halftone</option>
                  <option value="18">18: Crackle Fissures</option>
                  <option value="19">19: Washi Fiber</option>
                  <option value="20">20: Concrete Stone</option>
                  <option value="21">21: Antique Parchment</option>
                  <option value="22">22: Stipple Noise</option>
                  <option value="23">23: Spatter Drops</option>
                  <option value="24">24: Raw Fiber Pulp</option>
                  <option value="25">25: Coarse Halftone</option>
                  <option value="26">26: Fine Crosshatch</option>
                  <option value="27">27: Distressed Rust</option>
                  <option value="28">28: Dry Bristle Scrape</option>
                  <option value="29">29: Pastel Honeycomb</option>
                  <option value="30">30: Tree Bark</option>
                  <option value="31">31: Manga Screen Dots</option>
                  <option value="32">32: Manga Sandtone</option>
                  <option value="33">33: Sea Sponge</option>
                  <option value="34">34: Stucco Plaster</option>
                  <option value="35">35: Denim Twill</option>
                  <option value="36">36: Impasto Knife Peaks</option>
                  <option value="37">37: Dusty Chalk Tooth</option>
                  <option value="38">38: Engraving Lines</option>
                  <option value="39">39: Granite Mineral</option>
                  <option value="40">40: Salt Bloom</option>
                  <option value="41">41: Coarse Burlap</option>
                  <option value="42">42: Cracked Earth</option>
                  <option value="43">43: Cyber Circuit Board</option>
                  <option value="44">44: Foliage & Leaves</option>
                  <option value="45">45: Grass Blades Lawn</option>
                  <option value="46">46: Butterfly Wings Motif</option>
                  <option value="47">47: Mystic Surreal Eyes</option>
                  <option value="48">48: Steampunk Gears & Cogs</option>
                  <option value="49">49: Kitty Paw Prints</option>
                  <option value="50">50: Dragon Armor Scales</option>
                  <option value="51">51: Starry Cosmos & Galaxies</option>
                  <option value="52">52: Sci-Fi Hex Tech</option>
                  <option value="53">53: Bubble Soap Foam</option>
                  <option value="54">54: Celtic Knot Braids</option>
                  <option value="55">55: Skulls & Crossbones</option>
                  <option value="56">56: Sweet Hearts Motif</option>
                  <option value="57">57: Seigaiha Ocean Waves</option>
                  <option value="58">58: Musical Staff & Notes</option>
                  <option value="59">59: Classic Houndstooth</option>
                  <option value="60">60: Bird Feathers Plumage</option>
                  <option value="61">61: Chainmail Ringmesh</option>
                  <option value="62">62: Damask Floral Paisley</option>
                  <option value="63">63: Argyle Diamond Plaid</option>
                  <option value="64">64: Masonry Brick Wall</option>
                  <option value="65">65: Molten Magma Lava</option>
                  <option value="66">66: Labyrinth Geometric Maze</option>
                  <option value="67">67: Lightning Electric Arcs</option>
                  <option value="68">68: Radial Spiderweb</option>
                  <option value="69">69: Crystal Gemstone Facets</option>
                  <option value="70">70: 8-Bit Space Invaders</option>
                  <optgroup id="cs-grp-custom-textures" label="Custom Textures"></optgroup>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Scale %</label>
                <input type="number" id="cs-tex-scale" min="0.01" max="1000" step="any" value="100" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Angle °</label>
                <input type="number" id="cs-tex-angle" min="-360" max="360" step="any" value="0" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Contrast %</label>
                <input type="number" id="cs-tex-contrast" min="0" max="500" step="any" value="100" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Grain / Grit</label>
                <input type="number" id="cs-tex-grain" min="0" max="100" step="any" value="0" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Origin</label>
                <select id="cs-tex-relative" class="cs-select">
                  <option value="0">Fixed / World</option>
                  <option value="1">Relative / Object</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Offset X/Y</label>
                <div style="display: flex; gap: 4px; flex: 1;">
                  <input type="number" id="cs-tex-offsetX" placeholder="X" step="any" value="0" class="cs-text-input" style="width: 50%;">
                  <input type="number" id="cs-tex-offsetY" placeholder="Y" step="any" value="0" class="cs-text-input" style="width: 50%;">
                </div>
              </div>
            </div>

            <!-- Surface Distortion & Edge Dynamics -->
            <div class="cs-card">
              <div class="cs-card-title">Surface Dynamics & Warp</div>
              <div class="cs-form-row">
                <label>Hardness %</label>
                <input type="number" id="cs-tex-hardness" min="0" max="100" step="any" value="100" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Soft Reach</label>
                <input type="number" id="cs-tex-hardnessIntensity" min="0.1" max="1000" step="any" value="50" title="Feather Softness (px)" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Warp Wave</label>
                <div style="display: flex; gap: 4px; flex: 1;">
                  <input type="number" id="cs-tex-warpStrength" placeholder="Str" min="0" max="500" step="any" value="0" class="cs-text-input" style="width: 50%;">
                  <input type="number" id="cs-tex-warpFreq" placeholder="Freq" min="0.01" max="500" step="any" value="20" class="cs-text-input" style="width: 50%;">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Noise Jitter</label>
                <input type="number" id="cs-tex-noiseDistort" min="0" max="500" step="any" value="0" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Swirl Vortex</label>
                <input type="number" id="cs-tex-pinchSwirl" min="-500" max="500" step="any" value="0" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Posterize</label>
                <select id="cs-tex-posterize" class="cs-select">
                  <option value="0">0: Smooth / Off</option>
                  <option value="2">2 Levels (B&W)</option>
                  <option value="3">3 Levels</option>
                  <option value="4">4 Levels (Cel)</option>
                  <option value="6">6 Levels</option>
                  <option value="8">8 Levels</option>
                  <option value="12">12 Levels</option>
                  <option value="16">16 Levels</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Invert Mask</label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" id="cs-tex-invert">
                  <span style="font-size: 10px; color: var(--text-dim);">Invert Texture</span>
                </label>
              </div>
            </div>
          </div>

          <!-- SECTION 4: WASM FX & OPTICAL LENSES -->
          <div class="cs-panel cs-panel-filter" id="cs-panel-filter">
            <div class="cs-card">
              <div class="cs-form-row">
                <label>Enable FX</label>
                <input type="checkbox" id="cs-filter-enabled" style="accent-color: var(--primary, #fabd2f);">
              </div>

              <div class="cs-form-row">
                <label>Target</label>
                <select id="cs-filter-target" class="cs-select">
                  <option value="fill">Fill Surface</option>
                  <option value="stroke">Stroke Outline</option>
                  <option value="backdrop">Backdrop Lens</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Plugin</label>
                <select id="cs-filter-plugin" class="cs-select">
                  <option value="bloom">Bloom Glow</option>
                  <option value="blur">Box Blur</option>
                  <option value="brightness">Brightness</option>
                  <option value="chromatic">Chromatic Aberration</option>
                  <option value="contrast">Contrast</option>
                  <option value="dither">Ordered Dither</option>
                  <option value="duotone">Duotone Gradient</option>
                  <option value="edge">Edge Detection</option>
                  <option value="emboss">3D Emboss</option>
                  <option value="fisheye">Fisheye Lens</option>
                  <option value="frosted_glass">Frosted Glass</option>
                  <option value="glitch">VHS Glitch</option>
                  <option value="grayscale">Grayscale</option>
                  <option value="halftone_dot">Halftone Screen Dots</option>
                  <option value="invert">Invert</option>
                  <option value="kaleidoscope">Kaleidoscope Lens</option>
                  <option value="kuwahara">Oil Painting (Kuwahara)</option>
                  <option value="noise">Film Grain / Noise</option>
                  <option value="pixelate">Pixelate Mosaic</option>
                  <option value="ripple">Water Ripple Lens</option>
                  <option value="scanline">CRT Scanlines</option>
                  <option value="sepia">Sepia Vintage</option>
                  <option value="sharpen">Sharpen (Unsharp Mask)</option>
                  <option value="solarize">Solarize (Sabattier)</option>
                  <option value="swirl">Swirl Vortex</option>
                  <option value="thermal">Thermal Vision</option>
                  <option value="threshold">Binary Threshold</option>
                  <option value="vignette">Vignette Lens</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>P1 / P2</label>
                <div style="display: flex; gap: 4px; flex: 1;">
                  <input type="number" id="cs-filter-p1" placeholder="P1" step="any" value="0" class="cs-text-input" style="width: 50%;">
                  <input type="number" id="cs-filter-p2" placeholder="P2" step="any" value="0" class="cs-text-input" style="width: 50%;">
                </div>
              </div>

              <div class="cs-form-row">
                <label>FX Opacity</label>
                <input type="number" id="cs-filter-opacity" min="0" max="1" step="0.05" value="1.0" class="cs-text-input">
              </div>
            </div>
          </div>

          <!-- SECTION 5: READY-TO-USE MATERIAL PRESETS -->
          <div class="cs-panel cs-panel-presets" id="cs-panel-presets">
            <div class="cs-card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span class="cs-card-title" style="margin: 0;">Material Presets</span>
                <button type="button" id="cs-btn-save-material-preset" class="cs-btn-mini" style="padding: 2px 8px;" title="Save current appearance as reusable material">+ Save</button>
              </div>
              <div class="cs-material-presets-list" id="cs-material-presets-list"></div>
            </div>
          </div>
        </div>
      `;

      // Cache DOM references
      this.dom = {
        targetFill: this.container.querySelector('#cs-target-fill'),
        targetStroke: this.container.querySelector('#cs-target-stroke'),
        targetBg: this.container.querySelector('#cs-target-bg'),
        targetFillChip: this.container.querySelector('#cs-target-fill-chip'),
        targetStrokeChip: this.container.querySelector('#cs-target-stroke-chip'),
        targetBgChip: this.container.querySelector('#cs-target-bg-chip'),
        btnSwap: this.container.querySelector('#cs-btn-swap'),
        btnNone: this.container.querySelector('#cs-btn-none'),
        modeBtns: this.container.querySelectorAll('.cs-mode-btn'),
        // Panels
        panelColor: this.container.querySelector('#cs-panel-color'),
        panelGradient: this.container.querySelector('#cs-panel-gradient'),
        panelTexture: this.container.querySelector('#cs-panel-texture'),
        panelFilter: this.container.querySelector('#cs-panel-filter'),
        panelPresets: this.container.querySelector('#cs-panel-presets'),
        // Submode tabs in Color
        submodeBtns: this.container.querySelectorAll('.cs-submode-btn'),
        subpanelPicker: this.container.querySelector('#cs-subpanel-picker'),
        subpanelSliders: this.container.querySelector('#cs-subpanel-sliders'),
        subpanelPalettes: this.container.querySelector('#cs-subpanel-palettes'),
        // Color visual
        svBox: this.container.querySelector('#cs-sv-box'),
        svCursor: this.container.querySelector('#cs-sv-cursor'),
        sliderHue: this.container.querySelector('#cs-slider-hue'),
        sliderAlpha: this.container.querySelector('#cs-slider-alpha'),
        // RGB Sliders
        slR: this.container.querySelector('#cs-sl-r'),
        numR: this.container.querySelector('#cs-num-r'),
        slG: this.container.querySelector('#cs-sl-g'),
        numG: this.container.querySelector('#cs-num-g'),
        slB: this.container.querySelector('#cs-sl-b'),
        numB: this.container.querySelector('#cs-num-b'),
        // HSL Sliders
        slH: this.container.querySelector('#cs-sl-h'),
        numH: this.container.querySelector('#cs-num-h'),
        slS: this.container.querySelector('#cs-sl-s'),
        numS: this.container.querySelector('#cs-num-s'),
        slL: this.container.querySelector('#cs-sl-l'),
        numL: this.container.querySelector('#cs-num-l'),
        // Palettes
        palSelect: this.container.querySelector('#cs-palette-select'),
        swatchesGrid: this.container.querySelector('#cs-swatches-grid'),
        btnAddSwatch: this.container.querySelector('#cs-btn-add-swatch'),
        // Hex Bar
        currentPreview: this.container.querySelector('#cs-current-preview'),
        hexInput: this.container.querySelector('#cs-hex-input'),
        btnCopy: this.container.querySelector('#cs-btn-copy'),
        btnEyedropper: this.container.querySelector('#cs-btn-eyedropper'),
        // Gradient Controls
        gradType: this.container.querySelector('#cs-grad-type'),
        gradPreviewBar: this.container.querySelector('#cs-grad-preview-bar'),
        gradStopSelect: this.container.querySelector('#cs-grad-stop-select'),
        btnGradAddStop: this.container.querySelector('#cs-btn-grad-add-stop'),
        btnGradDelStop: this.container.querySelector('#cs-btn-grad-del-stop'),
        gradStopColor: this.container.querySelector('#cs-grad-stop-color'),
        gradStopColorText: this.container.querySelector('#cs-grad-stop-color-text'),
        gradStopPosSlider: this.container.querySelector('#cs-grad-stop-pos-slider'),
        gradStopPos: this.container.querySelector('#cs-grad-stop-pos'),
        gradStopOpacity: this.container.querySelector('#cs-grad-stop-opacity'),
        gradStopIntensity: this.container.querySelector('#cs-grad-stop-intensity'),
        gradAngleRow: this.container.querySelector('#cs-grad-angle-row'),
        gradAngleSlider: this.container.querySelector('#cs-grad-angle-slider'),
        gradAngle: this.container.querySelector('#cs-grad-angle'),
        gradRadiusRow: this.container.querySelector('#cs-grad-radius-row'),
        gradRadius: this.container.querySelector('#cs-grad-radius'),
        gradPresetsGrid: this.container.querySelector('#cs-grad-presets-grid'),
        // Texture Controls
        texMode: this.container.querySelector('#cs-tex-mode'),
        grpCustomTextures: this.container.querySelector('#cs-grp-custom-textures'),
        texScale: this.container.querySelector('#cs-tex-scale'),
        texAngle: this.container.querySelector('#cs-tex-angle'),
        texContrast: this.container.querySelector('#cs-tex-contrast'),
        texGrain: this.container.querySelector('#cs-tex-grain'),
        texRelative: this.container.querySelector('#cs-tex-relative'),
        texOffsetX: this.container.querySelector('#cs-tex-offsetX'),
        texOffsetY: this.container.querySelector('#cs-tex-offsetY'),
        texHardness: this.container.querySelector('#cs-tex-hardness'),
        texHardnessIntensity: this.container.querySelector('#cs-tex-hardnessIntensity'),
        texWarpStrength: this.container.querySelector('#cs-tex-warpStrength'),
        texWarpFreq: this.container.querySelector('#cs-tex-warpFreq'),
        texNoiseDistort: this.container.querySelector('#cs-tex-noiseDistort'),
        texPinchSwirl: this.container.querySelector('#cs-tex-pinchSwirl'),
        texPosterize: this.container.querySelector('#cs-tex-posterize'),
        texInvert: this.container.querySelector('#cs-tex-invert'),
        // Filter Controls
        filterEnabled: this.container.querySelector('#cs-filter-enabled'),
        filterTarget: this.container.querySelector('#cs-filter-target'),
        filterPlugin: this.container.querySelector('#cs-filter-plugin'),
        filterP1: this.container.querySelector('#cs-filter-p1'),
        filterP2: this.container.querySelector('#cs-filter-p2'),
        filterOpacity: this.container.querySelector('#cs-filter-opacity'),
        // Presets List
        materialPresetsList: this.container.querySelector('#cs-material-presets-list'),
        btnSaveMaterialPreset: this.container.querySelector('#cs-btn-save-material-preset')
      };

      this.renderGradientPresets();
      this.renderMaterialPresetsList();
    }

    bindEvents() {
      const d = this.dom;

      // 1. Target Switcher (Fill vs Stroke vs Background)
      d.targetFill?.addEventListener('click', () => this.setTarget('fill'));
      d.targetStroke?.addEventListener('click', () => this.setTarget('stroke'));
      d.targetBg?.addEventListener('click', () => this.setTarget('bg'));

      // 2. Swap Target Colors
      d.btnSwap?.addEventListener('click', () => this.swapColors());

      // 3. Set None
      d.btnNone?.addEventListener('click', () => this.setNone());

      // 4. Main Mode Navigation
      d.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchMode(btn.dataset.mode);
        });
      });

      // 5. Color Submode Navigation
      d.submodeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchColorSubmode(btn.dataset.submode);
        });
      });

      // 6. Visual SV Box Dragging
      if (d.svBox) {
        const handleBoxPointer = (e) => {
          const rect = d.svBox.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
          const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
          this.currentS = Math.round(x * 100);
          this.currentV = Math.round((1 - y) * 100);
          this.recomputeFromHsv(false);
        };

        d.svBox.addEventListener('pointerdown', (e) => {
          this._isDragging = true;
          d.svBox.setPointerCapture(e.pointerId);
          handleBoxPointer(e);
        });

        d.svBox.addEventListener('pointermove', (e) => {
          if (this._isDragging) handleBoxPointer(e);
        });

        const endBoxDrag = (e) => {
          if (this._isDragging) {
            this._isDragging = false;
            try { d.svBox.releasePointerCapture(e.pointerId); } catch (_) {}
            this.commitToHistory();
          }
        };
        d.svBox.addEventListener('pointerup', endBoxDrag);
        d.svBox.addEventListener('pointercancel', endBoxDrag);
      }

      // 7. Hue & Alpha Sliders
      d.sliderHue?.addEventListener('input', (e) => {
        this.currentH = Number(e.target.value);
        this.recomputeFromHsv(false);
      });
      d.sliderHue?.addEventListener('change', () => this.commitToHistory());

      d.sliderAlpha?.addEventListener('input', (e) => {
        this.currentA = Number(e.target.value) / 100;
        this.applyToSelected(false);
      });
      d.sliderAlpha?.addEventListener('change', () => this.commitToHistory());

      // 8. RGB Sliders
      const bindRgb = (sl, num, channel) => {
        sl?.addEventListener('input', (e) => {
          this[channel] = Number(e.target.value);
          if (num) num.value = this[channel];
          this.recomputeFromRgb(false);
        });
        sl?.addEventListener('change', () => this.commitToHistory());
        num?.addEventListener('change', (e) => {
          this[channel] = clamp(Number(e.target.value) || 0, 0, 255);
          if (sl) sl.value = this[channel];
          this.recomputeFromRgb(true);
        });
      };
      bindRgb(d.slR, d.numR, 'currentR');
      bindRgb(d.slG, d.numG, 'currentG');
      bindRgb(d.slB, d.numB, 'currentB');

      // 9. HSL Sliders
      const bindHsl = () => {
        const handleHsl = (commit) => {
          const h = Number(d.slH?.value || 0);
          const s = Number(d.slS?.value || 0);
          const l = Number(d.slL?.value || 0);
          const rgb = hslToRgb(h, s, l);
          this.currentR = rgb.r;
          this.currentG = rgb.g;
          this.currentB = rgb.b;
          this.currentH = h;
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.currentS = hsv.s;
          this.currentV = hsv.v;
          this.currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
          this.updateVisualControls();
          this.applyToSelected(commit);
        };

        [d.slH, d.slS, d.slL].forEach(sl => {
          sl?.addEventListener('input', () => {
            if (d.numH) d.numH.value = d.slH.value;
            if (d.numS) d.numS.value = d.slS.value;
            if (d.numL) d.numL.value = d.slL.value;
            handleHsl(false);
          });
          sl?.addEventListener('change', () => this.commitToHistory());
        });

        [d.numH, d.numS, d.numL].forEach(num => {
          num?.addEventListener('change', () => {
            if (d.slH) d.slH.value = clamp(Number(d.numH?.value || 0), 0, 360);
            if (d.slS) d.slS.value = clamp(Number(d.numS?.value || 0), 0, 100);
            if (d.slL) d.slL.value = clamp(Number(d.numL?.value || 0), 0, 100);
            handleHsl(true);
          });
        });
      };
      bindHsl();

      // 10. Palette Swatches
      d.palSelect?.addEventListener('change', () => this.renderPalettes());
      d.btnAddSwatch?.addEventListener('click', () => {
        const list = getCustomSwatches();
        if (!list.includes(this.currentHex)) {
          list.push(this.currentHex);
          saveCustomSwatches(list);
          if (d.palSelect) d.palSelect.value = 'custom';
          this.renderPalettes();
        }
      });

      // 11. Hex Input Bar
      d.hexInput?.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          const rgb = hexToRgb(val);
          this.currentR = rgb.r;
          this.currentG = rgb.g;
          this.currentB = rgb.b;
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.currentH = hsv.h;
          this.currentS = hsv.s;
          this.currentV = hsv.v;
          this.currentHex = val.toUpperCase();
          this.updateVisualControls();
          this.applyToSelected(false);
        }
      });
      d.hexInput?.addEventListener('change', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          this.commitToHistory();
        } else {
          e.target.value = this.currentHex;
        }
      });

      d.btnCopy?.addEventListener('click', () => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(this.currentHex).then(() => {
            if (typeof showNotification === 'function') showNotification(`Copied ${this.currentHex}`);
          });
        }
      });

      d.btnEyedropper?.addEventListener('click', async () => {
        if (typeof window !== 'undefined' && window.EyeDropper) {
          try {
            const eye = new window.EyeDropper();
            const res = await eye.open();
            if (res && res.sRGBHex) {
              this.setColorFromExternal(res.sRGBHex);
              this.applyToSelected(true);
            }
          } catch (_) {}
        }
      });

      // ── Gradient Events ──
      d.gradType?.addEventListener('change', (e) => {
        this.gradientType = e.target.value;
        this.applyGradientToSelected(true);
        this.updateGradientUI();
      });

      d.gradPreviewBar?.addEventListener('click', (e) => {
        const rect = d.gradPreviewBar.getBoundingClientRect();
        if (rect.width === 0) return;
        const offset = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        this.addGradientStop(offset, this.currentHex);
      });

      d.gradStopSelect?.addEventListener('change', (e) => {
        this.activeGradientStopIdx = Number(e.target.value);
        this.updateGradientStopFields();
      });

      d.btnGradAddStop?.addEventListener('click', () => {
        this.addGradientStop(0.5, this.currentHex);
      });

      d.btnGradDelStop?.addEventListener('click', () => {
        if (this.gradientStops.length <= 2) {
          if (typeof showNotification === 'function') showNotification('Gradient requires at least 2 stops');
          return;
        }
        this.gradientStops.splice(this.activeGradientStopIdx, 1);
        if (this.activeGradientStopIdx >= this.gradientStops.length) {
          this.activeGradientStopIdx = this.gradientStops.length - 1;
        }
        this.applyGradientToSelected(true);
        this.updateGradientUI();
      });

      d.gradStopColor?.addEventListener('input', (e) => {
        const stop = this.gradientStops[this.activeGradientStopIdx];
        if (stop) {
          stop.color = e.target.value;
          if (d.gradStopColorText) d.gradStopColorText.value = e.target.value;
          this.applyGradientToSelected(false);
          this.updateGradientPreviewBar();
        }
      });
      d.gradStopColor?.addEventListener('change', () => this.applyGradientToSelected(true));

      d.gradStopColorText?.addEventListener('change', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        const stop = this.gradientStops[this.activeGradientStopIdx];
        if (stop && /^#[0-9A-Fa-f]{6}$/.test(val)) {
          stop.color = val;
          if (d.gradStopColor) d.gradStopColor.value = val;
          this.applyGradientToSelected(true);
          this.updateGradientPreviewBar();
        }
      });

      const handlePosChange = (val, commit) => {
        const stop = this.gradientStops[this.activeGradientStopIdx];
        if (stop) {
          stop.offset = clamp(Number(val) / 100, 0, 1);
          this.gradientStops.sort((a, b) => a.offset - b.offset);
          this.activeGradientStopIdx = this.gradientStops.indexOf(stop);
          if (d.gradStopPos) d.gradStopPos.value = Math.round(stop.offset * 100);
          if (d.gradStopPosSlider) d.gradStopPosSlider.value = Math.round(stop.offset * 100);
          this.applyGradientToSelected(commit);
          this.updateGradientUI();
        }
      };

      d.gradStopPosSlider?.addEventListener('input', (e) => handlePosChange(e.target.value, false));
      d.gradStopPosSlider?.addEventListener('change', (e) => handlePosChange(e.target.value, true));
      d.gradStopPos?.addEventListener('change', (e) => handlePosChange(e.target.value, true));

      d.gradStopOpacity?.addEventListener('input', (e) => {
        const stop = this.gradientStops[this.activeGradientStopIdx];
        if (stop) {
          stop.opacity = clamp(Number(e.target.value) || 1.0, 0, 1);
          this.applyGradientToSelected(false);
          this.updateGradientPreviewBar();
        }
      });
      d.gradStopOpacity?.addEventListener('change', () => this.applyGradientToSelected(true));

      d.gradStopIntensity?.addEventListener('input', (e) => {
        const stop = this.gradientStops[this.activeGradientStopIdx];
        if (stop) {
          stop.intensity = clamp(Number(e.target.value) || 1.0, 0.1, 10);
          this.applyGradientToSelected(false);
          this.updateGradientPreviewBar();
        }
      });
      d.gradStopIntensity?.addEventListener('change', () => this.applyGradientToSelected(true));

      const handleAngleChange = (val, commit) => {
        this.gradientAngle = Number(val) || 0;
        if (d.gradAngle) d.gradAngle.value = this.gradientAngle;
        if (d.gradAngleSlider) d.gradAngleSlider.value = this.gradientAngle;
        this.applyGradientToSelected(commit);
      };
      d.gradAngleSlider?.addEventListener('input', (e) => handleAngleChange(e.target.value, false));
      d.gradAngleSlider?.addEventListener('change', (e) => handleAngleChange(e.target.value, true));
      d.gradAngle?.addEventListener('change', (e) => handleAngleChange(e.target.value, true));

      d.gradRadius?.addEventListener('input', (e) => {
        this.gradientRadius = Number(e.target.value) || 0.5;
        this.applyGradientToSelected(false);
      });
      d.gradRadius?.addEventListener('change', () => this.applyGradientToSelected(true));

      // ── Texture Events ──
      d.texMode?.addEventListener('change', (e) => {
        const val = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
        this.textureMode = val;
        this.applyTextureToSelected(true);
      });

      ['Scale', 'Angle', 'Contrast', 'Grain', 'OffsetX', 'OffsetY', 'Hardness', 'HardnessIntensity', 'WarpStrength', 'WarpFreq', 'NoiseDistort', 'PinchSwirl', 'Posterize'].forEach(prop => {
        const lower = prop.charAt(0).toLowerCase() + prop.slice(1);
        const el = d[`tex${prop}`];
        if (el) {
          el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
            this[`texture${prop}`] = Number(e.target.value);
            this.applyTextureToSelected(false);
          });
          if (el.tagName !== 'SELECT') {
            el.addEventListener('change', () => this.applyTextureToSelected(true));
          }
        }
      });

      d.texRelative?.addEventListener('change', (e) => {
        this.textureRelative = (e.target.value === '1');
        this.applyTextureToSelected(true);
      });

      d.texInvert?.addEventListener('change', (e) => {
        this.textureInvert = e.target.checked;
        this.applyTextureToSelected(true);
      });

      // ── WASM FX Events ──
      d.filterEnabled?.addEventListener('change', (e) => {
        this.filterEnabled = e.target.checked;
        this.applyFilterToSelected(true);
      });

      d.filterTarget?.addEventListener('change', (e) => {
        this.filterTarget = e.target.value;
        this.applyFilterToSelected(true);
      });

      d.filterPlugin?.addEventListener('change', (e) => {
        this.filterPlugin = e.target.value;
        this.applyFilterToSelected(true);
      });

      ['P1', 'P2'].forEach(param => {
        const el = d[`filter${param}`];
        el?.addEventListener('input', (e) => {
          this[`filter${param}`] = Number(e.target.value);
          this.applyFilterToSelected(false);
        });
        el?.addEventListener('change', () => this.applyFilterToSelected(true));
      });

      d.filterOpacity?.addEventListener('input', (e) => {
        this.filterOpacity = Number(e.target.value);
        this.applyFilterToSelected(false);
      });
      d.filterOpacity?.addEventListener('change', () => this.applyFilterToSelected(true));

      // ── Material Presets Events ──
      d.btnSaveMaterialPreset?.addEventListener('click', () => {
        this.saveCurrentAsMaterialPreset();
      });
    }

    setTarget(target) {
      if (this.activeTarget === target) return;
      this.activeTarget = target;
      this.dom.targetFill?.classList.toggle('active', target === 'fill');
      this.dom.targetStroke?.classList.toggle('active', target === 'stroke');
      this.dom.targetBg?.classList.toggle('active', target === 'bg');
      this.syncFromSelection(true);
    }

    switchMode(mode) {
      this.activeMode = mode;
      this.dom.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      this.dom.panelColor?.classList.toggle('active', mode === 'color');
      this.dom.panelGradient?.classList.toggle('active', mode === 'gradient');
      this.dom.panelTexture?.classList.toggle('active', mode === 'texture');
      this.dom.panelFilter?.classList.toggle('active', mode === 'filter');
      this.dom.panelPresets?.classList.toggle('active', mode === 'presets');

      if (mode === 'gradient') {
        this.updateGradientUI();
      } else if (mode === 'color' && this.colorSubMode === 'palettes') {
        this.renderPalettes();
      } else if (mode === 'presets') {
        this.renderMaterialPresetsList();
      }
    }

    switchColorSubmode(submode) {
      this.colorSubMode = submode;
      this.dom.submodeBtns.forEach(b => b.classList.toggle('active', b.dataset.submode === submode));
      this.dom.subpanelPicker?.classList.toggle('active', submode === 'picker');
      this.dom.subpanelSliders?.classList.toggle('active', submode === 'sliders');
      this.dom.subpanelPalettes?.classList.toggle('active', submode === 'palettes');

      if (submode === 'palettes') {
        this.renderPalettes();
      }
    }

    // ── Ultra-Fast State & Recomputation ──

    recomputeFromHsv(commit = false) {
      const rgb = hsvToRgb(this.currentH, this.currentS, this.currentV);
      this.currentR = rgb.r;
      this.currentG = rgb.g;
      this.currentB = rgb.b;
      this.currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
      this.isTargetNone = false;
      this.updateVisualControls();
      this.applyToSelected(commit);
    }

    recomputeFromRgb(commit = false) {
      const hsv = rgbToHsv(this.currentR, this.currentG, this.currentB);
      this.currentH = hsv.h;
      this.currentS = hsv.s;
      this.currentV = hsv.v;
      this.currentHex = rgbToHex(this.currentR, this.currentG, this.currentB);
      this.isTargetNone = false;
      this.updateVisualControls();
      this.applyToSelected(commit);
    }

    updateVisualControls() {
      const d = this.dom;
      if (d.svBox) {
        d.svBox.style.setProperty('--cs-hue', this.currentH);
      }
      if (d.svCursor) {
        d.svCursor.style.left = `${this.currentS}%`;
        d.svCursor.style.top = `${100 - this.currentV}%`;
      }
      if (d.sliderHue && !this._isDragging) {
        d.sliderHue.value = this.currentH;
      }
      if (d.sliderAlpha) {
        d.sliderAlpha.value = Math.round(this.currentA * 100);
      }
      if (d.hexInput && (typeof document === 'undefined' || document.activeElement !== d.hexInput)) {
        d.hexInput.value = this.isTargetNone ? 'NONE' : this.currentHex;
      }
      if (d.currentPreview) {
        d.currentPreview.style.background = this.isTargetNone ? 'transparent' : this.currentHex;
        d.currentPreview.classList.toggle('is-none', this.isTargetNone);
      }

      this.updateTargetChips();

      if (this.colorSubMode === 'sliders') {
        if (d.slR) d.slR.value = this.currentR;
        if (d.numR) d.numR.value = this.currentR;
        if (d.slG) d.slG.value = this.currentG;
        if (d.numG) d.numG.value = this.currentG;
        if (d.slB) d.slB.value = this.currentB;
        if (d.numB) d.numB.value = this.currentB;

        const hsl = rgbToHsl(this.currentR, this.currentG, this.currentB);
        if (d.slH) d.slH.value = hsl.h;
        if (d.numH) d.numH.value = hsl.h;
        if (d.slS) d.slS.value = hsl.s;
        if (d.numS) d.numS.value = hsl.s;
        if (d.slL) d.slL.value = hsl.l;
        if (d.numL) d.numL.value = hsl.l;
      }
    }

    updateTargetChips() {
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      const fillEl = getDomEl('prop-fill-text');
      const strokeEl = getDomEl('prop-stroke-text');
      const bgEl = getDomEl('prop-doc-bg');
      const fVal = fillEl ? fillEl.value : '#fabd2f';
      const sVal = strokeEl ? strokeEl.value : '#1d2021';
      const bVal = bgEl ? bgEl.value : (activeDoc?.backgroundColor || '#1d2021');

      if (this.dom.targetFillChip) {
        this.dom.targetFillChip.style.background = (fVal && fVal !== 'none') ? fVal : 'transparent';
        this.dom.targetFillChip.classList.toggle('is-none', !fVal || fVal === 'none');
      }
      if (this.dom.targetStrokeChip) {
        this.dom.targetStrokeChip.style.background = (sVal && sVal !== 'none') ? sVal : 'transparent';
        this.dom.targetStrokeChip.classList.toggle('is-none', !sVal || sVal === 'none');
      }
      if (this.dom.targetBgChip) {
        this.dom.targetBgChip.style.background = (bVal && bVal !== 'none') ? bVal : 'transparent';
        this.dom.targetBgChip.classList.toggle('is-none', !bVal || bVal === 'none');
      }
    }

    // ── Application to Document / Selected Objects ──

    applyToSelected(commit = false) {
      if (this._isSyncing) return;
      const val = this.isTargetNone ? 'none' : this.currentHex;
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();

      if (this.activeTarget === 'fill') {
        const textEl = getDomEl('prop-fill-text');
        const colorEl = getDomEl('prop-fill-color');
        const opEl = getDomEl('prop-fill-opacity');
        if (textEl) textEl.value = val;
        if (colorEl && !this.isTargetNone && val.startsWith('#') && val.length === 7) colorEl.value = val;
        if (opEl) opEl.value = this.currentA;

        if (typeof window !== 'undefined' && typeof window.applyFillToSelected === 'function') {
          window.applyFillToSelected(val);
        } else if (typeof applyFillToSelected === 'function') {
          applyFillToSelected(val);
        }

        if (activeDoc && typeof activeDoc.getSelectedObjects === 'function') {
          const selected = activeDoc.getSelectedObjects();
          if (selected.length > 0) {
            for (const obj of selected) {
              obj.fill = val;
              if (val !== 'none' && obj.fillType && obj.fillType !== 'solid') obj.fillType = 'solid';
              if (this.currentA !== undefined && this.currentA < 1.0) obj.fillOpacity = this.currentA;
              if (obj.type === 'group' && Array.isArray(obj.children)) {
                for (const child of obj.children) {
                  child.fill = val;
                  if (val !== 'none' && child.fillType && child.fillType !== 'solid') child.fillType = 'solid';
                }
              }
            }
            if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
            if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
          }
        }

        if (commit) {
          if (activeDoc && activeDoc.pushHistory) activeDoc.pushHistory('Change Fill Color');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
      } else if (this.activeTarget === 'bg') {
        const bgTextEl = getDomEl('prop-doc-bg');
        const bgPickerEl = getDomEl('prop-doc-bg-picker');
        if (bgTextEl) bgTextEl.value = val;
        if (bgPickerEl && !this.isTargetNone && val.startsWith('#') && val.length === 7) bgPickerEl.value = val;

        if (activeDoc) {
          activeDoc.backgroundColor = val;
          if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
          if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
        }
        if (commit) {
          if (activeDoc && activeDoc.pushHistory) activeDoc.pushHistory('Change Background Color');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
      } else {
        const textEl = getDomEl('prop-stroke-text');
        const colorEl = getDomEl('prop-stroke-color');
        if (textEl) textEl.value = val;
        if (colorEl && !this.isTargetNone && val.startsWith('#') && val.length === 7) colorEl.value = val;

        if (typeof window !== 'undefined' && typeof window.applyStrokeToSelected === 'function') {
          window.applyStrokeToSelected(val);
        } else if (typeof applyStrokeToSelected === 'function') {
          applyStrokeToSelected(val);
        }

        if (activeDoc && typeof activeDoc.getSelectedObjects === 'function') {
          const selected = activeDoc.getSelectedObjects();
          if (selected.length > 0) {
            for (const obj of selected) {
              obj.stroke = val;
              if (obj.type === 'group' && Array.isArray(obj.children)) {
                for (const child of obj.children) child.stroke = val;
              }
            }
            if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
            if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
          }
        }

        if (commit) {
          if (activeDoc && activeDoc.pushHistory) activeDoc.pushHistory('Change Stroke Color');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
      }

      this.updateTargetChips();
      if (typeof window !== 'undefined' && typeof window.updateSwatches === 'function') {
        window.updateSwatches();
      }
    }

    commitToHistory() {
      this.applyToSelected(true);
    }

    swapColors() {
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc || !activeDoc.getSelectedObjects) return;
      const selected = activeDoc.getSelectedObjects();
      for (const obj of selected) {
        const tmp = obj.fill || '#fabd2f';
        obj.fill = obj.stroke || '#1d2021';
        obj.stroke = tmp;
        if (obj.type === 'group' && Array.isArray(obj.children)) {
          for (const child of obj.children) {
            const childTmp = child.fill || '#fabd2f';
            child.fill = child.stroke || '#1d2021';
            child.stroke = childTmp;
          }
        }
      }

      const ft = getDomEl('prop-fill-text');
      const fc = getDomEl('prop-fill-color');
      const st = getDomEl('prop-stroke-text');
      const sc = getDomEl('prop-stroke-color');
      if (ft && st) {
        const tmpT = ft.value;
        ft.value = st.value;
        st.value = tmpT;
        if (fc && sc) {
          const tmpC = fc.value;
          fc.value = sc.value;
          sc.value = tmpC;
        }
      }

      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
      if (activeDoc.pushHistory) activeDoc.pushHistory('Swap Fill and Stroke');
      if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      this.syncFromSelection(true);
    }

    setNone() {
      this.isTargetNone = true;
      this.applyToSelected(true);
      this.updateVisualControls();
    }

    setColorFromExternal(hex) {
      if (!hex || hex === 'none' || hex === 'transparent') {
        this.isTargetNone = true;
        this.updateVisualControls();
        return;
      }
      this.isTargetNone = false;
      const rgb = hexToRgb(hex);
      this.currentR = rgb.r;
      this.currentG = rgb.g;
      this.currentB = rgb.b;
      this.currentA = rgb.a !== undefined ? rgb.a : 1.0;
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.currentH = hsv.h;
      this.currentS = hsv.s;
      this.currentV = hsv.v;
      this.currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
      this.updateVisualControls();
    }

    // ── Gradient Engine ──

    addGradientStop(offset, color) {
      const newStop = {
        offset: clamp(offset, 0, 1),
        color: color || '#fabd2f',
        opacity: 1.0,
        intensity: 1.0
      };
      this.gradientStops.push(newStop);
      this.gradientStops.sort((a, b) => a.offset - b.offset);
      this.activeGradientStopIdx = this.gradientStops.indexOf(newStop);
      this.applyGradientToSelected(true);
      this.updateGradientUI();
    }

    updateGradientPreviewBar() {
      if (!this.dom.gradPreviewBar) return;
      const stopsCss = this.gradientStops.map(s => {
        return `${s.color} ${Math.round(s.offset * 100)}%`;
      }).join(', ');
      this.dom.gradPreviewBar.style.background = `linear-gradient(90deg, ${stopsCss})`;
    }

    updateGradientStopFields() {
      const d = this.dom;
      const stop = this.gradientStops[this.activeGradientStopIdx] || this.gradientStops[0];
      if (!stop) return;

      if (d.gradStopColor) d.gradStopColor.value = stop.color;
      if (d.gradStopColorText) d.gradStopColorText.value = stop.color;
      const posVal = Math.round(stop.offset * 100);
      if (d.gradStopPosSlider) d.gradStopPosSlider.value = posVal;
      if (d.gradStopPos) d.gradStopPos.value = posVal;
      if (d.gradStopOpacity) d.gradStopOpacity.value = stop.opacity !== undefined ? stop.opacity : 1.0;
      if (d.gradStopIntensity) d.gradStopIntensity.value = stop.intensity !== undefined ? stop.intensity : 1.0;
    }

    updateGradientUI() {
      if (typeof document === 'undefined') return;
      const d = this.dom;
      if (!d || !d.gradPreviewBar) return;

      this.updateGradientPreviewBar();

      // Populate Stop select
      if (d.gradStopSelect) {
        d.gradStopSelect.innerHTML = '';
        this.gradientStops.forEach((s, idx) => {
          const opt = document.createElement('option');
          opt.value = String(idx);
          opt.textContent = `Stop ${idx + 1} (${Math.round(s.offset * 100)}%) - ${s.color}`;
          if (idx === this.activeGradientStopIdx) opt.selected = true;
          d.gradStopSelect.appendChild(opt);
        });
      }

      this.updateGradientStopFields();

      // Angle vs Radius visibility
      if (d.gradType) d.gradType.value = this.gradientType;
      if (this.gradientType === 'radial') {
        if (d.gradAngleRow) d.gradAngleRow.style.display = 'none';
        if (d.gradRadiusRow) d.gradRadiusRow.style.display = 'flex';
        if (d.gradRadius) d.gradRadius.value = this.gradientRadius;
      } else {
        if (d.gradAngleRow) d.gradAngleRow.style.display = 'flex';
        if (d.gradRadiusRow) d.gradRadiusRow.style.display = 'none';
        if (d.gradAngle) d.gradAngle.value = this.gradientAngle;
        if (d.gradAngleSlider) d.gradAngleSlider.value = this.gradientAngle;
      }
    }

    applyGradientToSelected(commit = false) {
      if (this._isSyncing) return;
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc || !activeDoc.getSelectedObjects) return;

      const selected = activeDoc.getSelectedObjects();
      for (const obj of selected) {
        obj.fillType = this.gradientType;
        const SvgLinearGrad = (typeof window !== 'undefined' && window.SvgLinearGradient) || (typeof SvgLinearGradient !== 'undefined' ? SvgLinearGradient : null);
        const SvgRadialGrad = (typeof window !== 'undefined' && window.SvgRadialGradient) || (typeof SvgRadialGradient !== 'undefined' ? SvgRadialGradient : null);

        const stopsCopy = this.gradientStops.map(s => ({
          offset: s.offset,
          color: s.color,
          opacity: s.opacity !== undefined ? s.opacity : 1.0,
          intensity: s.intensity !== undefined ? s.intensity : 1.0
        }));

        if (this.gradientType === 'linear') {
          if (SvgLinearGrad) {
            obj.fillGradient = new SvgLinearGrad({ stops: stopsCopy });
            obj.fillGradient.angle = this.gradientAngle;
          } else {
            obj.fillGradient = { type: 'linear', stops: stopsCopy, angle: this.gradientAngle };
          }
        } else {
          if (SvgRadialGrad) {
            obj.fillGradient = new SvgRadialGrad({ stops: stopsCopy, r: `${(this.gradientRadius * 100).toFixed(1)}%` });
          } else {
            obj.fillGradient = { type: 'radial', stops: stopsCopy, r: `${(this.gradientRadius * 100).toFixed(1)}%` };
          }
        }
      }

      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();

      if (commit) {
        if (activeDoc.pushHistory) activeDoc.pushHistory('Change Material Gradient');
        if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      }
    }

    renderGradientPresets() {
      if (typeof document === 'undefined') return;
      const grid = this.dom.gradPresetsGrid;
      if (!grid) return;

      const presets = [
        { name: 'Sunset Amber', stops: [{ offset: 0, color: '#fe8019' }, { offset: 1, color: '#fabd2f' }] },
        { name: 'Cyber Neon', stops: [{ offset: 0, color: '#ff0055' }, { offset: 1, color: '#00ffcc' }] },
        { name: 'Deep Ocean', stops: [{ offset: 0, color: '#0f084b' }, { offset: 1, color: '#83a598' }] },
        { name: 'Gold Metallic', stops: [{ offset: 0, color: '#d79921' }, { offset: 0.5, color: '#fbf1c7' }, { offset: 1, color: '#b57614' }] },
        { name: 'Emerald Glow', stops: [{ offset: 0, color: '#98971a' }, { offset: 1, color: '#8ec07c' }] },
        { name: 'Holographic', stops: [{ offset: 0, color: '#7928ca' }, { offset: 0.5, color: '#ff0080' }, { offset: 1, color: '#00ffcc' }] },
        { name: 'Fire Flame', stops: [{ offset: 0, color: '#cc241d' }, { offset: 0.6, color: '#fe8019' }, { offset: 1, color: '#fabd2f' }] },
        { name: 'Monochrome Smoke', stops: [{ offset: 0, color: '#1d2021' }, { offset: 1, color: '#a89984' }] }
      ];

      grid.innerHTML = '';
      presets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'cs-grad-preset-item';
        const stopsCss = p.stops.map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
        item.style.background = `linear-gradient(90deg, ${stopsCss})`;
        item.title = p.name;
        item.addEventListener('click', () => {
          this.gradientStops = p.stops.map(s => ({ offset: s.offset, color: s.color, opacity: 1.0, intensity: 1.0 }));
          this.activeGradientStopIdx = 0;
          this.applyGradientToSelected(true);
          this.updateGradientUI();
        });
        grid.appendChild(item);
      });
    }

    // ── Texture Application ──

    applyTextureToSelected(commit = false) {
      if (this._isSyncing) return;
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc || !activeDoc.getSelectedObjects) return;

      const selected = activeDoc.getSelectedObjects();
      const isEnabled = (
        (this.textureMode !== 0 && this.textureMode !== '0') ||
        (this.textureHardness < 100) ||
        (this.textureWarpStrength > 0) ||
        (this.textureNoiseDistort > 0) ||
        (this.texturePinchSwirl !== 0) ||
        (this.texturePosterize > 0) ||
        (this.textureGrain > 0) ||
        (this.textureInvert)
      );

      for (const obj of selected) {
        if (this.activeTarget === 'stroke') {
          if (!obj.strokeTexture) obj.strokeTexture = {};
          obj.strokeTexture.enabled = isEnabled;
          obj.strokeTexture.mode = this.textureMode;
          obj.strokeTexture.scale = this.textureScale;
          obj.strokeTexture.angle = this.textureAngle;
          obj.strokeTexture.contrast = this.textureContrast;
          obj.strokeTexture.grain = this.textureGrain;
        } else {
          if (!obj.fillTexture) obj.fillTexture = {};
          obj.fillTexture.enabled = isEnabled;
          obj.fillTexture.mode = this.textureMode;
          obj.fillTexture.scale = this.textureScale;
          obj.fillTexture.angle = this.textureAngle;
          obj.fillTexture.contrast = this.textureContrast;
          obj.fillTexture.grain = this.textureGrain;
          obj.fillTexture.relative = this.textureRelative;
          obj.fillTexture.offsetX = this.textureOffsetX;
          obj.fillTexture.offsetY = this.textureOffsetY;
          obj.fillTexture.hardness = this.textureHardness;
          obj.fillTexture.hardnessIntensity = this.textureHardnessIntensity;
          obj.fillTexture.warpStrength = this.textureWarpStrength;
          obj.fillTexture.warpFreq = this.textureWarpFreq;
          obj.fillTexture.noiseDistort = this.textureNoiseDistort;
          obj.fillTexture.pinchSwirl = this.texturePinchSwirl;
          obj.fillTexture.posterize = this.texturePosterize;
          obj.fillTexture.invert = this.textureInvert;
        }
      }

      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();

      if (commit) {
        if (activeDoc.pushHistory) activeDoc.pushHistory('Change Material Texture');
        if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      }
    }

    // ── WASM FX Application ──

    applyFilterToSelected(commit = false) {
      if (this._isSyncing) return;
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc || !activeDoc.getSelectedObjects) return;

      const selected = activeDoc.getSelectedObjects();
      const filterConfig = {
        enabled: this.filterEnabled,
        target: this.filterTarget,
        plugin: this.filterPlugin,
        p1: this.filterP1,
        p2: this.filterP2,
        opacity: this.filterOpacity
      };

      for (const obj of selected) {
        if (this.filterTarget === 'stroke') {
          obj.strokeFilter = { ...filterConfig };
          if (obj.brushConfig) {
            obj.brushConfig.wasmFilter = { ...filterConfig };
          }
        } else {
          obj.fillFilter = { ...filterConfig };
          if (!obj.fillTexture) obj.fillTexture = { enabled: true };
          obj.fillTexture.wasmFilter = { ...filterConfig };
          obj.wasmFilter = { ...filterConfig };
        }
      }

      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();

      if (commit) {
        if (activeDoc.pushHistory) activeDoc.pushHistory('Change WASM Filter');
        if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      }
    }

    // ── Material Presets System ──

    saveCurrentAsMaterialPreset() {
      const name = typeof window !== 'undefined' && window.prompt ? window.prompt('Enter name for new Material preset:') : 'Custom Material';
      if (!name || !name.trim()) return;

      const presetData = {
        name: name.trim(),
        color: this.currentHex,
        alpha: this.currentA,
        mode: this.activeMode,
        gradientType: this.gradientType,
        gradientStops: this.gradientStops,
        gradientAngle: this.gradientAngle,
        gradientRadius: this.gradientRadius,
        texture: {
          mode: this.textureMode,
          scale: this.textureScale,
          angle: this.textureAngle,
          contrast: this.textureContrast,
          grain: this.textureGrain,
          relative: this.textureRelative,
          offsetX: this.textureOffsetX,
          offsetY: this.textureOffsetY,
          hardness: this.textureHardness,
          hardnessIntensity: this.textureHardnessIntensity,
          warpStrength: this.textureWarpStrength,
          warpFreq: this.textureWarpFreq,
          noiseDistort: this.textureNoiseDistort,
          pinchSwirl: this.texturePinchSwirl,
          posterize: this.texturePosterize,
          invert: this.textureInvert
        },
        filter: {
          enabled: this.filterEnabled,
          target: this.filterTarget,
          plugin: this.filterPlugin,
          p1: this.filterP1,
          p2: this.filterP2,
          opacity: this.filterOpacity
        }
      };

      try {
        let list = [];
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(CUSTOM_MATERIALS_KEY);
          if (raw) list = JSON.parse(raw);
        }
        list.push(presetData);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CUSTOM_MATERIALS_KEY, JSON.stringify(list));
        }
      } catch (_) {}

      this.renderMaterialPresetsList();
      if (typeof showNotification === 'function') showNotification(`Material preset "${name.trim()}" saved!`);
    }

    applyMaterialPreset(preset) {
      if (!preset) return;
      if (preset.color) this.setColorFromExternal(preset.color);
      if (preset.alpha !== undefined) this.currentA = preset.alpha;
      if (preset.gradientStops) this.gradientStops = JSON.parse(JSON.stringify(preset.gradientStops));
      if (preset.gradientType) this.gradientType = preset.gradientType;
      if (preset.gradientAngle !== undefined) this.gradientAngle = preset.gradientAngle;
      if (preset.gradientRadius !== undefined) this.gradientRadius = preset.gradientRadius;

      if (preset.texture) {
        this.textureMode = preset.texture.mode !== undefined ? preset.texture.mode : 0;
        this.textureScale = preset.texture.scale !== undefined ? preset.texture.scale : 100;
        this.textureAngle = preset.texture.angle !== undefined ? preset.texture.angle : 0;
        this.textureContrast = preset.texture.contrast !== undefined ? preset.texture.contrast : 100;
        this.textureGrain = preset.texture.grain !== undefined ? preset.texture.grain : 0;
        this.textureRelative = !!preset.texture.relative;
        this.textureOffsetX = preset.texture.offsetX || 0;
        this.textureOffsetY = preset.texture.offsetY || 0;
        this.textureHardness = preset.texture.hardness !== undefined ? preset.texture.hardness : 100;
        this.textureHardnessIntensity = preset.texture.hardnessIntensity !== undefined ? preset.texture.hardnessIntensity : 50;
        this.textureWarpStrength = preset.texture.warpStrength || 0;
        this.textureWarpFreq = preset.texture.warpFreq !== undefined ? preset.texture.warpFreq : 20;
        this.textureNoiseDistort = preset.texture.noiseDistort || 0;
        this.texturePinchSwirl = preset.texture.pinchSwirl || 0;
        this.texturePosterize = preset.texture.posterize || 0;
        this.textureInvert = !!preset.texture.invert;
      }

      if (preset.filter) {
        this.filterEnabled = !!preset.filter.enabled;
        this.filterTarget = preset.filter.target || 'fill';
        this.filterPlugin = preset.filter.plugin || 'bloom';
        this.filterP1 = preset.filter.p1 || 0;
        this.filterP2 = preset.filter.p2 || 0;
        this.filterOpacity = preset.filter.opacity !== undefined ? preset.filter.opacity : 1.0;
      }

      this.applyToSelected(false);
      if (preset.gradientStops && preset.gradientStops.length >= 2) {
        this.applyGradientToSelected(false);
      }
      this.applyTextureToSelected(false);
      this.applyFilterToSelected(true);
      this.syncFromSelection(true);
    }

    renderMaterialPresetsList() {
      if (typeof document === 'undefined') return;
      const listContainer = this.dom.materialPresetsList;
      if (!listContainer) return;
      listContainer.innerHTML = '';

      const builtInMaterials = [
        {
          name: 'Solid Gruvbox Gold',
          desc: 'Clean flat vector fill',
          color: '#fabd2f',
          texture: { mode: 0, hardness: 100 },
          filter: { enabled: false }
        },
        {
          name: 'Kuwahara Oil Canvas',
          desc: 'Rich painterly oil texture with Kuwahara filter',
          color: '#fabd2f',
          texture: { mode: 36, scale: 100, contrast: 120, grain: 45 },
          filter: { enabled: true, plugin: 'kuwahara', target: 'fill', p1: 3, p2: 0, opacity: 1.0 }
        },
        {
          name: 'Cyberpunk Neon Hologram',
          desc: 'Chromatic aberration scanlines with bloom',
          color: '#00ffcc',
          gradientStops: [{ offset: 0, color: '#ff0080' }, { offset: 1, color: '#00ffcc' }],
          gradientType: 'linear',
          texture: { mode: 43, scale: 120, contrast: 150 },
          filter: { enabled: true, plugin: 'bloom', target: 'fill', p1: 25, p2: 120, opacity: 1.0 }
        },
        {
          name: 'Manga Halftone Cel',
          desc: '4-level posterized screentone dots',
          color: '#ebdbb2',
          texture: { mode: 4, scale: 85, contrast: 180, posterize: 4, grain: 60 },
          filter: { enabled: false }
        },
        {
          name: 'Vintage Engraved Parchment',
          desc: 'Fine hatched antique parchment with sepia filter',
          color: '#ebdbb2',
          texture: { mode: 38, scale: 90, contrast: 130, grain: 40 },
          filter: { enabled: true, plugin: 'sepia', target: 'fill', p1: 80, p2: 0, opacity: 0.9 }
        },
        {
          name: 'Frosted Glass Diffuse',
          desc: 'Soft feathering and optical frosted glass lens',
          color: '#83a598',
          texture: { mode: 12, hardness: 40, hardnessIntensity: 80 },
          filter: { enabled: true, plugin: 'frosted_glass', target: 'fill', p1: 30, p2: 50, opacity: 1.0 }
        },
        {
          name: 'Molten Magma Lava',
          desc: 'Vortex liquid marble with amber glow',
          color: '#fe8019',
          gradientStops: [{ offset: 0, color: '#cc241d' }, { offset: 0.7, color: '#fe8019' }, { offset: 1, color: '#fabd2f' }],
          gradientType: 'linear',
          texture: { mode: 65, scale: 120, warpStrength: 45, warpFreq: 25 },
          filter: { enabled: true, plugin: 'bloom', target: 'fill', p1: 20, p2: 100, opacity: 1.0 }
        },
        {
          name: 'Dragon Armor Scales',
          desc: 'Mythic scales with metallic specular grain',
          color: '#8ec07c',
          texture: { mode: 50, scale: 100, contrast: 140, grain: 35 },
          filter: { enabled: false }
        },
        {
          name: 'Retro CRT Monitor',
          desc: 'Horizontal scanlines with VHS glitch distortion',
          color: '#83a598',
          texture: { mode: 5, scale: 50, contrast: 100 },
          filter: { enabled: true, plugin: 'scanline', target: 'fill', p1: 50, p2: 1, opacity: 1.0 }
        }
      ];

      // Read custom saved presets
      let customMaterials = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(CUSTOM_MATERIALS_KEY);
          if (raw) customMaterials = JSON.parse(raw);
        }
      } catch (_) {}

      const all = [...customMaterials, ...builtInMaterials];
      all.forEach(mat => {
        const row = document.createElement('div');
        row.className = 'cs-mat-preset-row';
        row.innerHTML = `
          <div class="cs-mat-chip" style="background: ${mat.color || '#fabd2f'};"></div>
          <div class="cs-mat-info">
            <div class="cs-mat-name">${mat.name}</div>
            <div class="cs-mat-desc">${mat.desc || 'Custom material'}</div>
          </div>
        `;
        row.addEventListener('click', () => {
          this.applyMaterialPreset(mat);
        });
        listContainer.appendChild(row);
      });
    }

    renderPalettes() {
      if (typeof document === 'undefined') return;
      const grid = this.dom.swatchesGrid;
      if (!grid) return;
      const palType = this.dom.palSelect?.value || 'gruvbox';
      let colors = [];

      if (palType === 'document') {
        colors = this.extractDocumentColors();
      } else if (palType === 'custom') {
        colors = getCustomSwatches();
      } else if (PALETTES[palType]) {
        colors = PALETTES[palType].colors;
      }

      grid.innerHTML = '';
      colors.forEach(hex => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'cs-swatch-item';
        swatch.style.background = hex;
        swatch.title = hex;
        swatch.addEventListener('click', () => {
          this.setColorFromExternal(hex);
          this.applyToSelected(true);
        });
        if (palType === 'custom') {
          swatch.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const list = getCustomSwatches().filter(c => c !== hex);
            saveCustomSwatches(list);
            this.renderPalettes();
          });
        }
        grid.appendChild(swatch);
      });
    }

    extractDocumentColors() {
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc || !activeDoc.objects) return [];
      const set = new Set();
      const traverse = (objs) => {
        for (const o of objs) {
          if (o.fill && o.fill.startsWith('#')) set.add(o.fill);
          if (o.stroke && o.stroke.startsWith('#')) set.add(o.stroke);
          if (o.children && Array.isArray(o.children)) traverse(o.children);
        }
      };
      traverse(activeDoc.objects);
      return Array.from(set);
    }

    // ── Zero-Lag Sync from Viewport Selection ──

    syncFromSelection(force = false) {
      if (!this.initialized) return;

      if (!force && typeof window !== 'undefined' && window.dockviewApi) {
        const panel = window.dockviewApi.getPanel('color') || window.dockviewApi.getPanel('materials');
        if (!panel || !panel.api.isVisible) {
          this._needsSyncWhenVisible = true;
          return;
        }
      }

      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      let fillVal = '#fabd2f';
      let strokeVal = '#1d2021';
      let fillOp = 1.0;
      let strokeOp = 1.0;

      const selected = activeDoc?.getSelectedObjects ? activeDoc.getSelectedObjects() : [];
      const primary = selected[0];

      if (primary) {
        fillVal = primary.fill || 'none';
        strokeVal = primary.stroke || 'none';
        fillOp = primary.fillOpacity !== undefined ? primary.fillOpacity : 1.0;
      } else {
        const fillEl = getDomEl('prop-fill-text');
        const strokeEl = getDomEl('prop-stroke-text');
        fillVal = fillEl ? fillEl.value : '#fabd2f';
        strokeVal = strokeEl ? strokeEl.value : '#1d2021';
        const opEl = getDomEl('prop-fill-opacity');
        fillOp = opEl ? Number(opEl.value) || 1.0 : 1.0;
      }

      let bgVal = (activeDoc && activeDoc.backgroundColor) ? activeDoc.backgroundColor : (getDomEl('prop-doc-bg')?.value || '#1d2021');

      if (!force && this._lastFillVal === fillVal && this._lastStrokeVal === strokeVal && this._lastBgVal === bgVal && !primary) {
        return;
      }

      this._lastFillVal = fillVal;
      this._lastStrokeVal = strokeVal;
      this._lastBgVal = bgVal;

      this._isSyncing = true;
      try {
        let activeColorVal = fillVal;
        if (this.activeTarget === 'stroke') {
          activeColorVal = strokeVal;
          this.currentA = strokeOp;
        } else if (this.activeTarget === 'bg') {
          activeColorVal = bgVal;
          this.currentA = 1.0;
        } else {
          activeColorVal = fillVal;
          this.currentA = fillOp;
        }

        this.setColorFromExternal(activeColorVal);

        // Sync Gradients if object has gradient
        if (primary && primary.fillType && primary.fillType !== 'solid' && primary.fillGradient) {
          this.gradientType = primary.fillType;
          if (Array.isArray(primary.fillGradient.stops) && primary.fillGradient.stops.length > 0) {
            this.gradientStops = primary.fillGradient.stops.map(s => ({
              offset: s.offset,
              color: s.color,
              opacity: s.opacity !== undefined ? s.opacity : 1.0,
              intensity: s.intensity !== undefined ? s.intensity : 1.0
            }));
          }
          this.gradientAngle = primary.fillGradient.angle !== undefined ? primary.fillGradient.angle : 0;
          this.gradientRadius = parseFloat(primary.fillGradient.r) || 0.5;
          this.updateGradientUI();
        }

        // Sync Texture
        const texObj = this.activeTarget === 'stroke' ? (primary?.strokeTexture || {}) : (primary?.fillTexture || {});
        this.textureMode = texObj.mode !== undefined ? texObj.mode : 0;
        this.textureScale = texObj.scale !== undefined ? texObj.scale : 100;
        this.textureAngle = texObj.angle !== undefined ? texObj.angle : 0;
        this.textureContrast = texObj.contrast !== undefined ? texObj.contrast : 100;
        this.textureGrain = texObj.grain !== undefined ? texObj.grain : 0;
        this.textureRelative = !!(texObj.relative || texObj.is_relative);
        this.textureOffsetX = texObj.offsetX || 0;
        this.textureOffsetY = texObj.offsetY || 0;
        this.textureHardness = texObj.hardness !== undefined ? texObj.hardness : 100;
        this.textureHardnessIntensity = texObj.hardnessIntensity !== undefined ? texObj.hardnessIntensity : 50;
        this.textureWarpStrength = texObj.warpStrength || 0;
        this.textureWarpFreq = texObj.warpFreq !== undefined ? texObj.warpFreq : 20;
        this.textureNoiseDistort = texObj.noiseDistort || 0;
        this.texturePinchSwirl = texObj.pinchSwirl || 0;
        this.texturePosterize = texObj.posterize || 0;
        this.textureInvert = !!texObj.invert;

        if (this.dom.texMode) this.dom.texMode.value = this.textureMode;
        if (this.dom.texScale) this.dom.texScale.value = this.textureScale;
        if (this.dom.texAngle) this.dom.texAngle.value = this.textureAngle;
        if (this.dom.texContrast) this.dom.texContrast.value = this.textureContrast;
        if (this.dom.texGrain) this.dom.texGrain.value = this.textureGrain;
        if (this.dom.texRelative) this.dom.texRelative.value = this.textureRelative ? '1' : '0';
        if (this.dom.texOffsetX) this.dom.texOffsetX.value = this.textureOffsetX;
        if (this.dom.texOffsetY) this.dom.texOffsetY.value = this.textureOffsetY;
        if (this.dom.texHardness) this.dom.texHardness.value = this.textureHardness;
        if (this.dom.texHardnessIntensity) this.dom.texHardnessIntensity.value = this.textureHardnessIntensity;
        if (this.dom.texWarpStrength) this.dom.texWarpStrength.value = this.textureWarpStrength;
        if (this.dom.texWarpFreq) this.dom.texWarpFreq.value = this.textureWarpFreq;
        if (this.dom.texNoiseDistort) this.dom.texNoiseDistort.value = this.textureNoiseDistort;
        if (this.dom.texPinchSwirl) this.dom.texPinchSwirl.value = this.texturePinchSwirl;
        if (this.dom.texPosterize) this.dom.texPosterize.value = this.texturePosterize;
        if (this.dom.texInvert) this.dom.texInvert.checked = this.textureInvert;

        // Sync WASM Filter
        const filterObj = this.activeTarget === 'stroke' ? (primary?.strokeFilter || primary?.brushConfig?.wasmFilter) : (primary?.fillFilter || primary?.fillTexture?.wasmFilter || primary?.wasmFilter);
        if (filterObj) {
          this.filterEnabled = !!filterObj.enabled;
          this.filterTarget = filterObj.target || (this.activeTarget === 'stroke' ? 'stroke' : 'fill');
          this.filterPlugin = filterObj.plugin || 'bloom';
          this.filterP1 = filterObj.p1 !== undefined ? filterObj.p1 : 0;
          this.filterP2 = filterObj.p2 !== undefined ? filterObj.p2 : 0;
          this.filterOpacity = filterObj.opacity !== undefined ? filterObj.opacity : 1.0;

          if (this.dom.filterEnabled) this.dom.filterEnabled.checked = this.filterEnabled;
          if (this.dom.filterTarget) this.dom.filterTarget.value = this.filterTarget;
          if (this.dom.filterPlugin) this.dom.filterPlugin.value = this.filterPlugin;
          if (this.dom.filterP1) this.dom.filterP1.value = this.filterP1;
          if (this.dom.filterP2) this.dom.filterP2.value = this.filterP2;
          if (this.dom.filterOpacity) this.dom.filterOpacity.value = this.filterOpacity;
        }

        this.updateTargetChips();
        if (this.activeMode === 'color' && this.colorSubMode === 'palettes' && this.dom.palSelect?.value === 'document') {
          this.renderPalettes();
        }
      } finally {
        this._isSyncing = false;
      }
    }

    onPanelActivated() {
      if (this._needsSyncWhenVisible) {
        this._needsSyncWhenVisible = false;
        this.syncFromSelection(true);
      }
    }
  }

  // ── 4. CSS Injections for Material & Color Studio ──

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('esenho-color-studio-styles')) return;

    const style = document.createElement('style');
    style.id = 'esenho-color-studio-styles';
    style.textContent = `
      .cs-root {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        color: var(--text, #ebdbb2);
        font-family: var(--font-sans, system-ui, sans-serif);
        font-size: 11px;
        box-sizing: border-box;
      }
      .cs-target-bar {
        display: flex;
        gap: 4px;
        align-items: center;
        background: var(--bg-panel-sub, #1e2021);
        padding: 4px;
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
      }
      .cs-target-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        padding: 4px 6px;
        border-radius: var(--radius-sm, 3px);
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-dim, #d5c4a1);
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.12s ease;
      }
      .cs-target-btn:hover {
        background: rgba(255,255,255,0.04);
        color: var(--text-bright, #fbf1c7);
      }
      .cs-target-btn.active {
        background: var(--bg-input, #121314);
        border-color: var(--primary, #fabd2f);
        color: var(--primary, #fabd2f);
      }
      .cs-chip {
        width: 14px;
        height: 14px;
        border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.2);
        box-shadow: inset 0 0 1px rgba(0,0,0,0.5);
      }
      .cs-chip.is-none, .cs-current-swatch-box.is-none {
        background-color: transparent !important;
        background-image: linear-gradient(135deg, transparent 40%, #fb4934 45%, #fb4934 55%, transparent 60%) !important;
      }
      .cs-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: transparent;
        border: 1px solid var(--border, #2e3234);
        border-radius: var(--radius-sm, 3px);
        color: var(--text-dim, #d5c4a1);
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .cs-icon-btn:hover {
        color: var(--text-bright, #fbf1c7);
        border-color: var(--border-bright, #484d50);
        background: rgba(255,255,255,0.05);
      }
      .cs-mode-tabs {
        display: flex;
        background: var(--bg-panel-sub, #1e2021);
        border-radius: var(--radius-sm, 3px);
        padding: 2px;
        gap: 2px;
        border: 1px solid var(--border, #2e3234);
      }
      .cs-mode-btn {
        flex: 1;
        padding: 4px 2px;
        text-align: center;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        background: transparent;
        border: none;
        color: var(--text-muted, #928374);
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .cs-mode-btn:hover {
        color: var(--text-bright, #fbf1c7);
      }
      .cs-mode-btn.active {
        background: var(--bg-input, #121314);
        color: var(--primary, #fabd2f);
      }
      .cs-submode-tabs {
        display: flex;
        background: var(--bg-panel-sub, #1e2021);
        border-radius: var(--radius-sm, 3px);
        padding: 2px;
        gap: 2px;
        border: 1px solid var(--border, #2e3234);
      }
      .cs-submode-btn {
        flex: 1;
        padding: 3px;
        text-align: center;
        font-size: 9.5px;
        font-weight: 600;
        text-transform: uppercase;
        background: transparent;
        border: none;
        color: var(--text-muted, #928374);
        border-radius: 2px;
        cursor: pointer;
      }
      .cs-submode-btn.active {
        background: var(--bg-input, #121314);
        color: var(--text-bright, #fbf1c7);
      }
      .cs-panel {
        display: none;
        flex-direction: column;
        gap: 6px;
      }
      .cs-panel.active {
        display: flex;
      }
      .cs-subpanel {
        display: none;
        flex-direction: column;
        gap: 6px;
      }
      .cs-subpanel.active {
        display: flex;
      }
      .cs-card {
        background: var(--bg-panel-sub, #1e2021);
        border: 1px solid var(--border, #2e3234);
        border-radius: var(--radius-sm, 3px);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .cs-card-title {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted, #928374);
        margin-bottom: 2px;
      }
      .cs-form-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .cs-form-row label {
        font-size: 10.5px;
        color: var(--text-dim, #d5c4a1);
        width: 72px;
        flex-shrink: 0;
      }
      .cs-select, .cs-text-input {
        flex: 1;
        padding: 3px 6px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        border-radius: var(--radius-sm, 3px);
        font-size: 10.5px;
      }
      .cs-color-input {
        width: 24px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--border, #2e3234);
        border-radius: 2px;
        cursor: pointer;
        background: transparent;
      }
      .cs-btn-mini {
        padding: 3px 6px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        border-radius: 2px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
      }
      .cs-btn-mini:hover {
        border-color: var(--primary, #fabd2f);
        color: var(--primary, #fabd2f);
      }
      .cs-btn-mini.danger:hover {
        border-color: #fb4934;
        color: #fb4934;
      }
      /* SV Box */
      .cs-sv-box {
        position: relative;
        width: 100%;
        height: 130px;
        background-color: hsl(var(--cs-hue, 0), 100%, 50%);
        background-image:
          linear-gradient(to top, #000 0%, transparent 100%),
          linear-gradient(to right, #fff 0%, transparent 100%);
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
        cursor: crosshair;
        user-select: none;
        touch-action: none;
        overflow: hidden;
      }
      .cs-sv-cursor {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 2px rgba(0,0,0,0.8);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      .cs-slider-row {
        display: flex;
        align-items: center;
        width: 100%;
      }
      .cs-hue-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 11px;
        border-radius: 5px;
        outline: none;
        background: linear-gradient(to right,
          #ff0000 0%, #ffff00 17%, #00ff00 33%,
          #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
        border: 1px solid var(--border, #2e3234);
        cursor: pointer;
      }
      .cs-hue-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #141617;
        cursor: pointer;
      }
      .cs-alpha-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 11px;
        border-radius: 5px;
        outline: none;
        background: linear-gradient(to right, transparent, var(--primary, #fabd2f)),
                    repeating-conic-gradient(#3c3836 0% 25%, #282828 0% 50%) 50% / 8px 8px;
        border: 1px solid var(--border, #2e3234);
        cursor: pointer;
      }
      .cs-alpha-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #141617;
        cursor: pointer;
      }
      .cs-slider-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: var(--bg-panel-sub, #1e2021);
        padding: 5px;
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
      }
      .cs-slider-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cs-sl-label {
        width: 20px;
        font-weight: 600;
        font-size: 10px;
      }
      .cs-mini-range {
        flex: 1;
        accent-color: var(--primary, #fabd2f);
      }
      .cs-mini-num {
        width: 44px;
        padding: 2px 4px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        border-radius: 2px;
        font-size: 10px;
        text-align: right;
      }
      .cs-palette-toolbar {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .cs-swatches-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18px, 1fr));
        gap: 4px;
        max-height: 120px;
        overflow-y: auto;
        padding: 4px;
        background: var(--bg-panel-sub, #1e2021);
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
      }
      .cs-swatch-item {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.15);
        cursor: pointer;
        padding: 0;
        transition: transform 0.08s ease;
      }
      .cs-swatch-item:hover {
        transform: scale(1.15);
        z-index: 2;
        border-color: #ffffff;
      }
      .cs-hex-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--bg-panel-sub, #1e2021);
        padding: 4px;
        border-radius: var(--radius-sm, 3px);
        border: 1px solid var(--border, #2e3234);
      }
      .cs-current-swatch-box {
        width: 22px;
        height: 22px;
        border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .cs-hex-input {
        flex: 1;
        padding: 3px 6px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text-bright, #fbf1c7);
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        font-weight: 600;
        border-radius: 2px;
        text-transform: uppercase;
      }
      .cs-grad-bar {
        height: 20px;
        border-radius: 3px;
        border: 1px solid var(--border, #2e3234);
        cursor: pointer;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
      }
      .cs-gradient-presets-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
      }
      .cs-grad-preset-item {
        height: 20px;
        border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.15);
        cursor: pointer;
        transition: transform 0.1s;
      }
      .cs-grad-preset-item:hover {
        transform: scale(1.05);
        border-color: #ffffff;
      }
      .cs-material-presets-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 220px;
        overflow-y: auto;
      }
      .cs-mat-preset-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 6px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.1s;
      }
      .cs-mat-preset-row:hover {
        border-color: var(--primary, #fabd2f);
        background: rgba(250, 189, 47, 0.08);
      }
      .cs-mat-chip {
        width: 18px;
        height: 18px;
        border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.2);
        flex-shrink: 0;
      }
      .cs-mat-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .cs-mat-name {
        font-weight: 600;
        font-size: 10.5px;
        color: var(--text-bright, #fbf1c7);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }
      .cs-mat-desc {
        font-size: 9px;
        color: var(--text-muted, #928374);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }
    `;
    document.head.appendChild(style);
  }

  // ── 5. Public API & Lifecycle ──

  let instance = null;

  function mountColorTab(containerEl) {
    injectStyles();
    if (!instance) {
      instance = new ColorStudioWidget();
    }
    instance.init(containerEl);
    return instance;
  }

  function syncFromSelection(force = false) {
    if (instance) {
      instance.syncFromSelection(force);
    }
  }

  function onPanelActivated() {
    if (instance) {
      instance.onPanelActivated();
    }
  }

  return {
    rgbToHex,
    hexToRgb,
    rgbToHsv,
    hsvToRgb,
    rgbToHsl,
    hslToRgb,
    parseColor,
    mountColorTab,
    mountMaterialsTab: mountColorTab,
    syncFromSelection,
    onPanelActivated,
    getInstance: () => instance
  };
}));
