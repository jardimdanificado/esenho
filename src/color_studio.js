/**
 * =========================================================================
 * Color Studio (src/color_studio.js)
 * Ultra-High-Performance, Zero-Lag Color Picker & Palette Studio for Esenho.
 * Pure GPU/CSS-accelerated visual picker, RGB/HSL sliders, document palettes.
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
    const hexG = (g < 16 ? '0' : '') + g.toString(16);
    const hexB = (b < 16 ? '0' : '') + b.toString(16);
    if (a !== undefined && a < 1.0 && a >= 0) {
      const alphaVal = clamp(Math.round(a * 255), 0, 255);
      const hexA = (alphaVal < 16 ? '0' : '') + alphaVal.toString(16);
      return `#${hexR}${hexG}${hexB}${hexA}`;
    }
    return `#${hexR}${hexG}${hexB}`;
  }

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

  function parseColor(val) {
    if (!val || val === 'none' || val === 'transparent') {
      return { r: 250, g: 189, b: 47, a: 1.0, hex: '#fabd2f', isNone: true };
    }
    if (typeof val === 'string' && val.startsWith('#')) {
      const rgb = hexToRgb(val);
      return { ...rgb, hex: rgbToHex(rgb.r, rgb.g, rgb.b), isNone: false };
    }
    return { r: 250, g: 189, b: 47, a: 1.0, hex: '#fabd2f', isNone: false };
  }

  // ── 2. Built-in Palettes ──

  const PALETTES = {
    gruvbox: {
      name: 'Gruvbox',
      colors: [
        '#282828', '#3c3836', '#504945', '#7c6f64', '#928374', '#a89984', '#ebdbb2', '#fbf1c7',
        '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#d65d0e',
        '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#fe8019'
      ]
    },
    material: {
      name: 'Material Design',
      colors: [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
        '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722',
        '#795548', '#9e9e9e', '#607d8b', '#212121'
      ]
    },
    nord: {
      name: 'Nord',
      colors: [
        '#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#e5e9f0', '#eceff4',
        '#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a', '#d08770', '#ebcb8b',
        '#a3be8c', '#b48ead'
      ]
    },
    cyberpunk: {
      name: 'Cyberpunk',
      colors: [
        '#050505', '#1a0033', '#710193', '#d9006c', '#ff0055', '#ff5400', '#ffb703',
        '#00f0ff', '#00ff66', '#39ff14', '#ffe600', '#ffffff'
      ]
    },
    monochrome: {
      name: 'Monochrome',
      colors: [
        '#000000', '#151515', '#2a2a2a', '#404040', '#555555', '#6b6b6b', '#808080',
        '#969696', '#ababab', '#c1c1c1', '#d6d6d6', '#ececec', '#ffffff'
      ]
    }
  };

  const CUSTOM_PALETTE_KEY = 'esenho_color_studio_custom_swatches';

  function getCustomSwatches() {
    try {
      const raw = localStorage.getItem(CUSTOM_PALETTE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return ['#fabd2f', '#fe8019', '#fb4934', '#b8bb26', '#83a598', '#d3869b', '#ebdbb2', '#141617'];
  }

  function saveCustomSwatches(arr) {
    try {
      localStorage.setItem(CUSTOM_PALETTE_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  // ── 3. High Performance Color Studio Component ──

  class ColorStudioWidget {
    constructor() {
      this.initialized = false;
      this.container = null;
      this.activeTarget = 'fill'; // 'fill' | 'stroke'
      this.activeMode = 'picker'; // 'picker' | 'sliders' | 'palettes'

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

      // Caches for zero-lag diffing
      this._lastFillVal = null;
      this._lastStrokeVal = null;
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
            <button type="button" class="cs-target-btn active" id="cs-target-fill" title="Active Target: Fill">
              <span class="cs-chip" id="cs-target-fill-chip"></span>
              <span class="cs-target-lbl">Fill</span>
            </button>
            <button type="button" class="cs-target-btn" id="cs-target-stroke" title="Active Target: Stroke">
              <span class="cs-chip" id="cs-target-stroke-chip"></span>
              <span class="cs-target-lbl">Stroke</span>
            </button>
            <button type="button" class="cs-icon-btn" id="cs-btn-swap" title="Swap Fill and Stroke (⇄)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4"/>
              </svg>
            </button>
            <button type="button" class="cs-icon-btn" id="cs-btn-none" title="Set to None (Transparent)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </button>
          </div>

          <!-- Mode Navigation Pills -->
          <div class="cs-mode-tabs">
            <button type="button" class="cs-mode-btn active" data-mode="picker">Visual</button>
            <button type="button" class="cs-mode-btn" data-mode="sliders">Sliders</button>
            <button type="button" class="cs-mode-btn" data-mode="palettes">Palettes</button>
          </div>

          <!-- Section 1: Visual Picker (100% GPU / CSS Accelerated) -->
          <div class="cs-panel cs-panel-picker active" id="cs-panel-picker">
            <div class="cs-sv-box" id="cs-sv-box" style="--cs-hue: 42;">
              <div class="cs-sv-cursor" id="cs-sv-cursor" style="left: 81%; top: 2%;"></div>
            </div>

            <!-- Hue Rainbow Slider -->
            <div class="cs-slider-row">
              <input type="range" min="0" max="360" step="1" value="42" class="cs-hue-slider" id="cs-slider-hue">
            </div>

            <!-- Opacity Slider -->
            <div class="cs-slider-row cs-alpha-row">
              <input type="range" min="0" max="100" step="1" value="100" class="cs-alpha-slider" id="cs-slider-alpha">
            </div>
          </div>

          <!-- Section 2: Numerical Sliders (RGB & HSL) -->
          <div class="cs-panel cs-panel-sliders" id="cs-panel-sliders">
            <!-- RGB Group -->
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

            <!-- HSL Group -->
            <div class="cs-slider-group" style="margin-top: 6px;">
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

          <!-- Section 3: Palettes & Document Colors -->
          <div class="cs-panel cs-panel-palettes" id="cs-panel-palettes">
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

          <!-- Bottom Utility & Hex Bar -->
          <div class="cs-hex-bar">
            <div class="cs-current-swatch-box" id="cs-current-preview"></div>
            <input type="text" class="cs-hex-input" id="cs-hex-input" value="#FABD2F" maxlength="9" spellcheck="false">
            <button type="button" class="cs-icon-btn" id="cs-btn-copy" title="Copy HEX to Clipboard">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button type="button" class="cs-icon-btn" id="cs-btn-eyedropper" title="Pick color from screen (Eyedropper)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2l4 4L7 17H3v-4L14 2z"/>
                <path d="M19 8l-2-2"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Cache DOM references
      this.dom = {
        targetFill: this.container.querySelector('#cs-target-fill'),
        targetStroke: this.container.querySelector('#cs-target-stroke'),
        targetFillChip: this.container.querySelector('#cs-target-fill-chip'),
        targetStrokeChip: this.container.querySelector('#cs-target-stroke-chip'),
        btnSwap: this.container.querySelector('#cs-btn-swap'),
        btnNone: this.container.querySelector('#cs-btn-none'),
        modeBtns: this.container.querySelectorAll('.cs-mode-btn'),
        panelPicker: this.container.querySelector('#cs-panel-picker'),
        panelSliders: this.container.querySelector('#cs-panel-sliders'),
        panelPalettes: this.container.querySelector('#cs-panel-palettes'),
        svBox: this.container.querySelector('#cs-sv-box'),
        svCursor: this.container.querySelector('#cs-sv-cursor'),
        sliderHue: this.container.querySelector('#cs-slider-hue'),
        sliderAlpha: this.container.querySelector('#cs-slider-alpha'),
        // RGB
        slR: this.container.querySelector('#cs-sl-r'),
        numR: this.container.querySelector('#cs-num-r'),
        slG: this.container.querySelector('#cs-sl-g'),
        numG: this.container.querySelector('#cs-num-g'),
        slB: this.container.querySelector('#cs-sl-b'),
        numB: this.container.querySelector('#cs-num-b'),
        // HSL
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
        // Hex & Utility
        currentPreview: this.container.querySelector('#cs-current-preview'),
        hexInput: this.container.querySelector('#cs-hex-input'),
        btnCopy: this.container.querySelector('#cs-btn-copy'),
        btnEyedropper: this.container.querySelector('#cs-btn-eyedropper')
      };
    }

    bindEvents() {
      const d = this.dom;

      // 1. Target Switcher (Fill vs Stroke)
      d.targetFill?.addEventListener('click', () => this.setTarget('fill'));
      d.targetStroke?.addEventListener('click', () => this.setTarget('stroke'));

      // 2. Swap Target Colors
      d.btnSwap?.addEventListener('click', () => this.swapColors());

      // 3. Set None
      d.btnNone?.addEventListener('click', () => this.setNone());

      // 4. Mode Tabs
      d.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          this.switchMode(mode);
        });
      });

      // 5. Visual Picker: SV Box Dragging (Pointer Events)
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

      // 6. Hue Slider
      d.sliderHue?.addEventListener('input', (e) => {
        this.currentH = Number(e.target.value);
        this.recomputeFromHsv(false);
      });
      d.sliderHue?.addEventListener('change', () => this.commitToHistory());

      // 7. Alpha Slider
      d.sliderAlpha?.addEventListener('input', (e) => {
        this.currentA = Number(e.target.value) / 100;
        this.updateAlphaDisplay();
        this.applyToSelected(false);
      });
      d.sliderAlpha?.addEventListener('change', () => this.commitToHistory());

      // 8. RGB Sliders & Numbers
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

      // 9. HSL Sliders & Numbers
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

      // 10. Palettes
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

      // 11. Hex Input
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

      // 12. Copy Hex
      d.btnCopy?.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(this.currentHex).then(() => {
            if (typeof showNotification === 'function') {
              showNotification(`Copied ${this.currentHex} to clipboard`);
            }
          });
        }
      });

      // 13. Eyedropper API
      d.btnEyedropper?.addEventListener('click', async () => {
        if (window.EyeDropper) {
          try {
            const eye = new window.EyeDropper();
            const res = await eye.open();
            if (res && res.sRGBHex) {
              this.setColorFromExternal(res.sRGBHex);
              this.applyToSelected(true);
            }
          } catch (_) {}
        } else {
          if (typeof showNotification === 'function') {
            showNotification('Native Eyedropper not supported in this browser');
          }
        }
      });
    }

    setTarget(target) {
      if (this.activeTarget === target) return;
      this.activeTarget = target;
      this.dom.targetFill?.classList.toggle('active', target === 'fill');
      this.dom.targetStroke?.classList.toggle('active', target === 'stroke');
      this.syncFromSelection(true);
    }

    switchMode(mode) {
      this.activeMode = mode;
      this.dom.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      this.dom.panelPicker?.classList.toggle('active', mode === 'picker');
      this.dom.panelSliders?.classList.toggle('active', mode === 'sliders');
      this.dom.panelPalettes?.classList.toggle('active', mode === 'palettes');

      if (mode === 'palettes') {
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
      // 1. SV Box (Pure CSS Property)
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

      // 2. Hex input & preview chip
      if (d.hexInput && (typeof document === 'undefined' || document.activeElement !== d.hexInput)) {
        d.hexInput.value = this.isTargetNone ? 'NONE' : this.currentHex;
      }
      if (d.currentPreview) {
        d.currentPreview.style.background = this.isTargetNone ? 'transparent' : this.currentHex;
        d.currentPreview.classList.toggle('is-none', this.isTargetNone);
      }

      // 3. Target Chips
      this.updateTargetChips();

      // 4. Sliders (Only if Sliders panel is active to avoid useless work)
      if (this.activeMode === 'sliders') {
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
      const fillEl = getDomEl('prop-fill-text');
      const strokeEl = getDomEl('prop-stroke-text');
      const fVal = fillEl ? fillEl.value : '#fabd2f';
      const sVal = strokeEl ? strokeEl.value : '#1d2021';

      if (this.dom.targetFillChip) {
        this.dom.targetFillChip.style.background = (fVal && fVal !== 'none') ? fVal : 'transparent';
        this.dom.targetFillChip.classList.toggle('is-none', !fVal || fVal === 'none');
      }
      if (this.dom.targetStrokeChip) {
        this.dom.targetStrokeChip.style.background = (sVal && sVal !== 'none') ? sVal : 'transparent';
        this.dom.targetStrokeChip.classList.toggle('is-none', !sVal || sVal === 'none');
      }
    }

    updateAlphaDisplay() {
      if (this.dom.sliderAlpha) {
        this.dom.sliderAlpha.value = Math.round(this.currentA * 100);
      }
    }

    // ── Application to Document / Selected Objects ──

    applyToSelected(commit = false) {
      if (this._isSyncing) return; // STRICT SAFETY: Never apply when syncing from selection!

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

        // 1. Delegate to window.applyFillToSelected if available
        if (typeof window !== 'undefined' && typeof window.applyFillToSelected === 'function') {
          window.applyFillToSelected(val);
        } else if (typeof applyFillToSelected === 'function') {
          applyFillToSelected(val);
        }

        // 2. Direct fallback application if objects are selected
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
      } else {
        const textEl = getDomEl('prop-stroke-text');
        const colorEl = getDomEl('prop-stroke-color');
        if (textEl) textEl.value = val;
        if (colorEl && !this.isTargetNone && val.startsWith('#') && val.length === 7) colorEl.value = val;

        // 1. Delegate to window.applyStrokeToSelected if available
        if (typeof window !== 'undefined' && typeof window.applyStrokeToSelected === 'function') {
          window.applyStrokeToSelected(val);
        } else if (typeof applyStrokeToSelected === 'function') {
          applyStrokeToSelected(val);
        }

        // 2. Direct fallback application if objects are selected
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
        const tmpF = ft.value;
        ft.value = st.value;
        st.value = tmpF;
        if (fc && ft.value.startsWith('#') && ft.value.length === 7) fc.value = ft.value;
        if (sc && st.value.startsWith('#') && st.value.length === 7) sc.value = st.value;
      }
      if (activeDoc.pushHistory) activeDoc.pushHistory('Swap Fill and Stroke');
      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
      if (typeof window !== 'undefined' && typeof window.updateInspector === 'function') window.updateInspector();
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
      this.updateAlphaDisplay();
    }

    // ── Palettes Renderer ──

    renderPalettes() {
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
      if (colors.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 11px; text-align: center; padding: 12px;">No colors found in document.</div>';
        return;
      }

      colors.forEach((hex) => {
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
          if (o.fill && o.fill !== 'none' && o.fill.startsWith('#')) set.add(o.fill.toUpperCase());
          if (o.stroke && o.stroke !== 'none' && o.stroke.startsWith('#')) set.add(o.stroke.toUpperCase());
          if (o.children && Array.isArray(o.children)) traverse(o.children);
        }
      };
      traverse(activeDoc.objects);
      return Array.from(set);
    }

    // ── ZERO-LAG SYNC FROM SELECTION (Called by updateInspector) ──

    syncFromSelection(force = false) {
      if (!this.initialized) return;

      // 1. FAST PATH: Check if Color Panel is actually visible in Dockview
      if (!force && window.dockviewApi) {
        const panel = window.dockviewApi.getPanel('color');
        if (!panel || !panel.api.isVisible) {
          this._needsSyncWhenVisible = true;
          return; // ZERO overhead if color tab is hidden!
        }
      }

      // 2. Read values from selected object or DOM inputs
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      const selected = (activeDoc && activeDoc.getSelectedObjects) ? activeDoc.getSelectedObjects() : [];

      let fillVal = '#fabd2f';
      let strokeVal = '#1d2021';
      let fillOp = 1.0;
      let strokeOp = 1.0;

      if (selected.length > 0) {
        fillVal = selected[0].fill || 'none';
        strokeVal = selected[0].stroke || 'none';
        fillOp = selected[0].fillOpacity !== undefined ? selected[0].fillOpacity : 1.0;
        strokeOp = selected[0].strokeOpacity !== undefined ? selected[0].strokeOpacity : 1.0;
      } else {
        const fillEl = getDomEl('prop-fill-text');
        const strokeEl = getDomEl('prop-stroke-text');
        fillVal = fillEl ? fillEl.value : '#fabd2f';
        strokeVal = strokeEl ? strokeEl.value : '#1d2021';
        const opEl = getDomEl('prop-fill-opacity');
        fillOp = opEl ? Number(opEl.value) || 1.0 : 1.0;
      }

      // 3. FAST PATH: If values have not changed at all, DO NOTHING (0ms)
      if (!force && this._lastFillVal === fillVal && this._lastStrokeVal === strokeVal) {
        return;
      }
      this._lastFillVal = fillVal;
      this._lastStrokeVal = strokeVal;

      // 4. Update the widget UI under a strict guard
      this._isSyncing = true;
      try {
        const activeColorVal = (this.activeTarget === 'stroke' ? strokeVal : fillVal);
        this.currentA = (this.activeTarget === 'stroke' ? strokeOp : fillOp);

        this.setColorFromExternal(activeColorVal);
        this.updateTargetChips();
        if (this.activeMode === 'palettes' && this.dom.palSelect?.value === 'document') {
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

  // ── 4. Inject CSS Styles ──

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('cs-styles')) return;
    const style = document.createElement('style');
    style.id = 'cs-styles';
    style.textContent = `
      .cs-root {
        display: flex;
        flex-direction: column;
        gap: 8px;
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
        padding: 4px 8px;
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
        padding: 4px;
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
      .cs-panel {
        display: none;
        flex-direction: column;
        gap: 8px;
      }
      .cs-panel.active {
        display: flex;
      }
      /* SV Box (100% GPU / CSS Gradients) */
      .cs-sv-box {
        position: relative;
        width: 100%;
        height: 140px;
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
        box-shadow: 0 0 2px rgba(0,0,0,0.8), inset 0 0 2px rgba(0,0,0,0.8);
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
        height: 12px;
        border-radius: 6px;
        outline: none;
        background: linear-gradient(to right,
          #ff0000 0%, #ffff00 17%, #00ff00 33%,
          #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
        border: 1px solid var(--border, #2e3234);
        cursor: pointer;
      }
      .cs-hue-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #141617;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        cursor: pointer;
      }
      .cs-alpha-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 12px;
        border-radius: 6px;
        outline: none;
        background: linear-gradient(to right, transparent, var(--primary, #fabd2f)),
                    repeating-conic-gradient(#3c3836 0% 25%, #282828 0% 50%) 50% / 8px 8px;
        border: 1px solid var(--border, #2e3234);
        cursor: pointer;
      }
      .cs-alpha-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #141617;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        cursor: pointer;
      }
      .cs-slider-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: var(--bg-panel-sub, #1e2021);
        padding: 6px;
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
      .cs-select {
        flex: 1;
        padding: 4px 6px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text, #ebdbb2);
        border-radius: var(--radius-sm, 3px);
        font-size: 11px;
      }
      .cs-swatches-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(20px, 1fr));
        gap: 4px;
        max-height: 140px;
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
    syncFromSelection,
    onPanelActivated,
    getInstance: () => instance
  };
}));
