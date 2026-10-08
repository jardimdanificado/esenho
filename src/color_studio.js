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

  // ── 2. Comprehensive Color Palette Manager & Presets ──

  function getRegistry() {
    if (typeof EsenhoRegistry !== 'undefined' && EsenhoRegistry) return EsenhoRegistry;
    if (typeof globalThis !== 'undefined' && globalThis.EsenhoRegistry) return globalThis.EsenhoRegistry;
    if (typeof require === 'function') {
      try {
        return require('./resource_registry.js');
      } catch (_) {}
    }
    return null;
  }

  /**
   * Dynamic Color Palette Catalog — Sourced exclusively from active Data Pack (EsenhoRegistry).
   * Zero hardcoded palettes in runtime code.
   */
  const DEFAULT_FACTORY_PALETTES = new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      const reg = getRegistry();
      if (reg && typeof reg.get === 'function') {
        const p = reg.get('palette', prop);
        if (p) return p;
      }
      return target[prop];
    },
    has(target, prop) {
      const reg = getRegistry();
      if (reg && typeof reg.has === 'function') {
        if (reg.has('palette', prop)) return true;
      }
      return prop in target;
    },
    ownKeys(target) {
      const reg = getRegistry();
      if (reg && typeof reg.list === 'function') {
        return reg.list('palette').map(p => p.id);
      }
      return Object.keys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (this.has(target, prop)) {
        return { value: this.get(target, prop), writable: true, enumerable: true, configurable: true };
      }
      return undefined;
    }
  });

  const PALETTE_STORE_KEY = 'esenho_color_palettes_v2';
  const LEGACY_CUSTOM_PALETTE_KEY = 'esenho_color_studio_custom_swatches';
  const LEGACY_PAINTER_PALETTES_KEY = 'esenho_custom_palettes_v1';
  const CUSTOM_MATERIALS_KEY = 'esenho_materials_custom_presets';

  class PaletteManagerClass {
    constructor() {
      this.palettes = {};
      this.activePaletteId = 'gruvbox';
      this.listeners = new Set();
      this.load();
    }

    load() {
      const reg = getRegistry();
      let factoryPalettes = {};
      if (reg && typeof reg.getDict === 'function') {
        const dict = reg.getDict('palette');
        if (dict && Object.keys(dict).length > 0) factoryPalettes = dict;
      }
      this.palettes = JSON.parse(JSON.stringify(factoryPalettes));
      try {
        if (typeof localStorage !== 'undefined') {
          const rawV2 = localStorage.getItem(PALETTE_STORE_KEY);
          if (rawV2) {
            const data = JSON.parse(rawV2);
            if (data && data.palettes && typeof data.palettes === 'object') {
              for (const [id, pal] of Object.entries(data.palettes)) {
                if (pal && typeof pal === 'object' && pal.name) {
                  this.palettes[id] = {
                    id: pal.id || id,
                    name: String(pal.name || id).trim(),
                    colors: this.sanitizeColors(pal.colors),
                    isBuiltIn: Boolean(pal.isBuiltIn && DEFAULT_FACTORY_PALETTES[id])
                  };
                }
              }
            }
            if (data && data.activePaletteId && (this.palettes[data.activePaletteId] || data.activePaletteId === 'document')) {
              this.activePaletteId = data.activePaletteId;
            }
          } else {
            this.migrateLegacy();
          }
        }
      } catch (e) {
        console.warn('[PaletteManager] Load error, using defaults:', e);
      }
    }

    migrateLegacy() {
      try {
        if (typeof localStorage === 'undefined') return;
        const rawCustom = localStorage.getItem(LEGACY_CUSTOM_PALETTE_KEY);
        if (rawCustom) {
          const parsed = JSON.parse(rawCustom);
          const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.colors) ? parsed.colors : []);
          const sanitized = this.sanitizeColors(list);
          if (sanitized.length > 0) {
            this.palettes.custom = {
              id: 'custom',
              name: 'Custom Swatches',
              colors: sanitized,
              isBuiltIn: true
            };
          }
        }
        const rawPainter = localStorage.getItem(LEGACY_PAINTER_PALETTES_KEY);
        if (rawPainter) {
          const parsed = JSON.parse(rawPainter);
          if (parsed && typeof parsed === 'object') {
            for (const [name, colors] of Object.entries(parsed)) {
              const palId = 'pal_' + name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
              this.palettes[palId] = {
                id: palId,
                name: String(name).trim(),
                colors: this.sanitizeColors(colors),
                isBuiltIn: false
              };
            }
          }
        }
        this.save();
      } catch (_) {}
    }

    save() {
      try {
        if (typeof localStorage !== 'undefined') {
          const serialized = {
            activePaletteId: this.activePaletteId,
            palettes: this.palettes
          };
          localStorage.setItem(PALETTE_STORE_KEY, JSON.stringify(serialized));
          if (this.palettes.custom) {
            localStorage.setItem(LEGACY_CUSTOM_PALETTE_KEY, JSON.stringify(this.palettes.custom.colors));
          }
        }
      } catch (e) {
        console.warn('[PaletteManager] Save error:', e);
      }
      this.notify();
    }

    notify() {
      for (const cb of this.listeners) {
        try { cb(this); } catch (_) {}
      }
    }

    subscribe(cb) {
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
    }

    sanitizeColors(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') return (item.hex || item.color || item.value || '').trim();
        return String(item || '').trim();
      }).filter(c => typeof c === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(c));
    }

    getAllPalettes() {
      return Object.values(this.palettes);
    }

    getPalette(id) {
      return this.palettes[id] || null;
    }

    getActivePalette() {
      return this.palettes[this.activePaletteId] || this.palettes.gruvbox;
    }

    setActivePalette(id) {
      if (this.palettes[id] || id === 'document') {
        this.activePaletteId = id;
        this.save();
      }
    }

    createPalette(name, colors = [], id = null) {
      const palName = String(name || 'New Palette').trim();
      const palId = id || ('pal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      const sanitized = this.sanitizeColors(colors);
      this.palettes[palId] = {
        id: palId,
        name: palName,
        colors: sanitized,
        isBuiltIn: false
      };
      this.activePaletteId = palId;
      this.save();
      return this.palettes[palId];
    }

    renamePalette(id, newName) {
      if (!this.palettes[id]) return false;
      const cleanName = String(newName || '').trim();
      if (!cleanName) return false;
      this.palettes[id].name = cleanName;
      this.save();
      return true;
    }

    deletePalette(id) {
      if (!this.palettes[id]) return false;
      delete this.palettes[id];
      if (this.activePaletteId === id) {
        this.activePaletteId = Object.keys(this.palettes)[0] || 'gruvbox';
      }
      this.save();
      return true;
    }

    clonePalette(id, newName = null) {
      const src = this.getPalette(id);
      if (!src) return null;
      const name = newName || `${src.name} (Copy)`;
      return this.createPalette(name, [...src.colors]);
    }

    setColors(id, colors) {
      if (!this.palettes[id]) {
        if (id === 'custom') {
          this.palettes.custom = { id: 'custom', name: 'Custom Swatches', colors: [], isBuiltIn: true };
        } else {
          return false;
        }
      }
      this.palettes[id].colors = this.sanitizeColors(colors);
      this.save();
      return true;
    }

    addColor(id, color, index = -1) {
      if (!this.palettes[id]) {
        if (id === 'custom' || !this.palettes.custom) {
          this.palettes.custom = { id: 'custom', name: 'Custom Swatches', colors: [], isBuiltIn: true };
          id = 'custom';
        } else {
          return false;
        }
      }
      let clean = String(color || '').trim();
      if (!clean.startsWith('#')) clean = '#' + clean;
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(clean)) return false;

      const pal = this.palettes[id];
      if (index >= 0 && index < pal.colors.length) {
        pal.colors.splice(index, 0, clean);
      } else {
        pal.colors.push(clean);
      }
      this.save();
      return true;
    }

    removeColor(id, index) {
      if (!this.palettes[id]) return false;
      const pal = this.palettes[id];
      if (index >= 0 && index < pal.colors.length) {
        pal.colors.splice(index, 1);
        this.save();
        return true;
      }
      return false;
    }

    editColor(id, index, newColor) {
      if (!this.palettes[id]) return false;
      let clean = String(newColor || '').trim();
      if (!clean.startsWith('#')) clean = '#' + clean;
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(clean)) return false;

      const pal = this.palettes[id];
      if (index >= 0 && index < pal.colors.length) {
        pal.colors[index] = clean;
        this.save();
        return true;
      }
      return false;
    }

    moveColor(id, fromIdx, toIdx) {
      if (!this.palettes[id]) return false;
      const pal = this.palettes[id];
      if (fromIdx < 0 || fromIdx >= pal.colors.length || toIdx < 0 || toIdx >= pal.colors.length) return false;
      const [item] = pal.colors.splice(fromIdx, 1);
      pal.colors.splice(toIdx, 0, item);
      this.save();
      return true;
    }

    clearPalette(id) {
      if (!this.palettes[id]) return false;
      this.palettes[id].colors = [];
      this.save();
      return true;
    }

    sortPalette(id, criterion = 'hue') {
      if (!this.palettes[id]) return false;
      const pal = this.palettes[id];
      pal.colors.sort((a, b) => {
        const rgbA = hexToRgb(a);
        const rgbB = hexToRgb(b);
        const hsvA = rgbToHsv(rgbA.r, rgbA.g, rgbA.b);
        const hsvB = rgbToHsv(rgbB.r, rgbB.g, rgbB.b);
        const hslA = rgbToHsl(rgbA.r, rgbA.g, rgbA.b);
        const hslB = rgbToHsl(rgbB.r, rgbB.g, rgbB.b);
        const lumA = 0.299 * rgbA.r + 0.587 * rgbA.g + 0.114 * rgbA.b;
        const lumB = 0.299 * rgbB.r + 0.587 * rgbB.g + 0.114 * rgbB.b;

        if (criterion === 'hue') return hsvA.h - hsvB.h || hsvA.s - hsvB.s || hsvA.v - hsvB.v;
        if (criterion === 'saturation') return hsvA.s - hsvB.s || hsvA.v - hsvB.v;
        if (criterion === 'lightness') return hslA.l - hslB.l;
        if (criterion === 'luminance') return lumA - lumB;
        return a.localeCompare(b);
      });
      this.save();
      return true;
    }

    reversePalette(id) {
      if (!this.palettes[id]) return false;
      this.palettes[id].colors.reverse();
      this.save();
      return true;
    }

    resetPalette(id) {
      const reg = getRegistry();
      const p = (reg && typeof reg.get === 'function') ? reg.get('palette', id) : DEFAULT_FACTORY_PALETTES[id];
      if (p) {
        this.palettes[id] = JSON.parse(JSON.stringify(p));
        this.save();
        return true;
      }
      return false;
    }

    resetAllToFactory() {
      const reg = getRegistry();
      const factoryPalettes = (reg && typeof reg.getDict === 'function') ? reg.getDict('palette') : {};
      this.palettes = JSON.parse(JSON.stringify(factoryPalettes));
      this.activePaletteId = 'gruvbox';
      this.save();
    }

    generateHarmony(baseHex, type = 'analogous') {
      const rgb = hexToRgb(baseHex);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      const results = [];

      const makeColor = (h, s, v) => {
        const normH = ((h % 360) + 360) % 360;
        const normS = clamp(s, 0, 100);
        const normV = clamp(v, 0, 100);
        const rgbVal = hsvToRgb(normH, normS, normV);
        return rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
      };

      if (type === 'analogous') {
        [-30, -15, 0, 15, 30].forEach(deg => {
          results.push(makeColor(hsv.h + deg, hsv.s, hsv.v));
        });
      } else if (type === 'complementary') {
        results.push(makeColor(hsv.h, hsv.s, hsv.v));
        results.push(makeColor(hsv.h, hsv.s * 0.6, hsv.v * 1.1));
        results.push(makeColor(hsv.h + 180, hsv.s, hsv.v));
        results.push(makeColor(hsv.h + 180, hsv.s * 0.6, hsv.v * 1.1));
        results.push(makeColor(hsv.h + 180, hsv.s * 0.8, hsv.v * 0.7));
      } else if (type === 'split_complementary') {
        results.push(makeColor(hsv.h, hsv.s, hsv.v));
        results.push(makeColor(hsv.h + 150, hsv.s, hsv.v));
        results.push(makeColor(hsv.h + 210, hsv.s, hsv.v));
        results.push(makeColor(hsv.h + 150, hsv.s * 0.7, hsv.v * 0.8));
        results.push(makeColor(hsv.h + 210, hsv.s * 0.7, hsv.v * 0.8));
      } else if (type === 'triadic') {
        [0, 120, 240].forEach(deg => {
          results.push(makeColor(hsv.h + deg, hsv.s, hsv.v));
          results.push(makeColor(hsv.h + deg, hsv.s * 0.7, hsv.v * 0.85));
        });
      } else if (type === 'tetradic') {
        [0, 90, 180, 270].forEach(deg => {
          results.push(makeColor(hsv.h + deg, hsv.s, hsv.v));
        });
      } else if (type === 'monochromatic') {
        [20, 35, 50, 65, 80, 95].forEach(val => {
          results.push(makeColor(hsv.h, hsv.s * (val > 50 ? 0.9 : 1.0), val));
        });
      }
      return results;
    }

    exportPalette(id, format = 'json') {
      const pal = this.getPalette(id);
      if (!pal) return null;

      if (format === 'json') {
        return JSON.stringify({
          name: pal.name,
          colors: pal.colors,
          version: '1.0'
        }, null, 2);
      } else if (format === 'hex') {
        return pal.colors.join('\n');
      } else if (format === 'gpl') {
        let lines = [
          'GIMP Palette',
          `Name: ${pal.name}`,
          'Columns: 8',
          '#'
        ];
        pal.colors.forEach((hex, i) => {
          const rgb = hexToRgb(hex);
          const r = String(rgb.r).padStart(3, ' ');
          const g = String(rgb.g).padStart(3, ' ');
          const b = String(rgb.b).padStart(3, ' ');
          lines.push(`${r} ${g} ${b} Swatch ${i + 1}`);
        });
        return lines.join('\n');
      }
      return pal.colors.join('\n');
    }

    importPalette(content, format = 'auto') {
      if (!content || typeof content !== 'string') return null;
      const str = content.trim();

      if (str.startsWith('{') || str.startsWith('[')) {
        try {
          const parsed = JSON.parse(str);
          if (Array.isArray(parsed)) {
            return this.createPalette('Imported Palette', parsed);
          } else if (parsed && typeof parsed === 'object') {
            const name = parsed.name || 'Imported Palette';
            const colors = parsed.colors || [];
            return this.createPalette(name, colors);
          }
        } catch (_) {}
      }

      if (str.includes('GIMP Palette')) {
        const lines = str.split('\n');
        let name = 'Imported GPL';
        const colors = [];
        let inData = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Name:')) {
            name = trimmed.slice(5).trim();
          } else if (trimmed === '#') {
            inData = true;
          } else if (inData && trimmed) {
            const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+)/);
            if (match) {
              const r = parseInt(match[1], 10);
              const g = parseInt(match[2], 10);
              const b = parseInt(match[3], 10);
              colors.push(rgbToHex(r, g, b));
            }
          }
        }
        if (colors.length > 0) {
          return this.createPalette(name, colors);
        }
      }

      const hexMatches = str.match(/#?[0-9A-Fa-f]{6}/g);
      if (hexMatches && hexMatches.length > 0) {
        const normalized = hexMatches.map(h => h.startsWith('#') ? h : '#' + h);
        return this.createPalette('Imported Hex Palette', normalized);
      }

      return null;
    }
  }

  const PaletteManager = new PaletteManagerClass();

  // Legacy accessor proxies
  const PALETTES = new Proxy({}, {
    get: (_, prop) => PaletteManager.getPalette(prop) || DEFAULT_FACTORY_PALETTES[prop] || null,
    set: (_, prop, val) => {
      if (val && val.colors) {
        PaletteManager.setColors(prop, val.colors);
      }
      return true;
    },
    has: (_, prop) => Boolean(PaletteManager.getPalette(prop) || DEFAULT_FACTORY_PALETTES[prop]),
    ownKeys: () => Object.keys(PaletteManager.palettes),
    getOwnPropertyDescriptor: (target, prop) => ({
      value: PaletteManager.getPalette(prop),
      writable: true,
      enumerable: true,
      configurable: true
    })
  });

  function getCustomSwatches() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LEGACY_CUSTOM_PALETTE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.colors) ? parsed.colors : []);
          const normalized = list.map(item => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') return (item.hex || item.color || item.value || '').trim();
            return String(item || '').trim();
          }).filter(c => typeof c === 'string' && c.length > 0 && c !== '[object Object]');
          if (normalized.length > 0) return normalized;
        }
      }
    } catch (_) {}
    const pal = PaletteManager.getPalette('custom');
    if (pal && Array.isArray(pal.colors) && pal.colors.length > 0) {
      return pal.colors;
    }
    return ['#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598', '#d3869b'];
  }

  function saveCustomSwatches(arr) {
    try {
      if (typeof localStorage !== 'undefined') {
        const sanitized = Array.isArray(arr) ? arr.map(item => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') return (item.hex || item.color || item.value || '').trim();
          return String(item || '').trim();
        }).filter(c => typeof c === 'string' && c.length > 0 && c !== '[object Object]') : [];
        localStorage.setItem(LEGACY_CUSTOM_PALETTE_KEY, JSON.stringify(sanitized));
      }
    } catch (_) {}
    PaletteManager.setColors('custom', arr);
  }

  // ── 2.1. Dynamic WASM Filter Plugin Metadata ──

  /**
   * Dynamic WASM Filter Metadata Proxy — Sourced exclusively from active Data Pack (EsenhoRegistry).
   * Zero hardcoded filters in runtime code.
   */
  const BUILTIN_FILTER_METADATA = new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      const reg = getRegistry();
      if (reg && typeof reg.get === 'function') {
        const fx = reg.get('wasm_fx', prop);
        if (fx) {
          return {
            title: fx.name,
            params: fx.params || [],
            target: fx.target,
            isLens: fx.isLens
          };
        }
      }
      return target[prop];
    },
    has(target, prop) {
      const reg = getRegistry();
      if (reg && typeof reg.has === 'function') {
        if (reg.has('wasm_fx', prop)) return true;
      }
      return prop in target;
    },
    ownKeys(target) {
      const reg = getRegistry();
      if (reg && typeof reg.list === 'function') {
        return reg.list('wasm_fx').map(fx => fx.id);
      }
      return Object.keys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (this.has(target, prop)) {
        return { value: this.get(target, prop), writable: true, enumerable: true, configurable: true };
      }
      return undefined;
    }
  });

  // ── 2.15. Procedural Brush Fill & Hatching Configurations ──
  const CUSTOM_BRUSH_FILL_PRESETS_KEY = 'esenho_custom_brush_fill_presets';

  const DEFAULT_BRUSH_FILL_CONFIG = {
    enabled: true,
    pattern: 'linear',
    spacing: 8,
    angle: 45,
    angle2: 135,
    angle3: 90,
    strokesPerLine: 1,
    strokeLength: 0,
    strokeGap: 4,
    brush: 'pencil',
    brushSecondary: '',
    brushes: ['pencil'],
    brushList: ['pencil'],
    brushPickMode: 'cycle',
    colorMode: 'palette',
    colorPaletteId: 'gruvbox',
    colorPalette: ['#fabd2f'],
    colorPickMode: 'cycle',
    strokeWidth: 2,
    strokeOpacity: 0.9,
    flow: 100,
    hardness: 95,
    curvature: 0,
    angleJitter: 0,
    lengthJitter: 0,
    widthJitter: 0,
    opacityJitter: 0,
    positionJitter: 0,
    curvatureJitter: 0,
    colorJitter: 0,
    clipMode: 'bleed',
    bleedDistance: 0,
    bleedJitter: 50,
    bleedProbability: 100,
    seed: 42
  };

    /**
   * Dynamic Brush Fill & Materials Catalog — Sourced exclusively from active Data Pack (EsenhoRegistry).
   * Zero hardcoded materials in runtime code.
   */
  function getBuiltinBfPresets() {
    const reg = getRegistry();
    if (reg && typeof reg.list === 'function') {
      const mats = reg.list('material');
      return mats.filter(m => m.category === 'brushfills' || m.mode === 'brushfill');
    }
    return [];
  }

  const BUILTIN_BF_PRESETS = new Proxy([], {
    get(target, prop) {
      const list = getBuiltinBfPresets();
      if (prop === 'length') return list.length;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return list[Number(prop)];
      }
      if (typeof list[prop] === 'function') {
        return list[prop].bind(list);
      }
      return list[prop] || target[prop];
    }
  });

  function getBuiltinMaterials() {
    const reg = getRegistry();
    if (reg && typeof reg.list === 'function') {
      return reg.list('material');
    }
    return [];
  }

  const BUILTIN_MATERIALS = new Proxy([], {
    get(target, prop) {
      const list = getBuiltinMaterials();
      if (prop === 'length') return list.length;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return list[Number(prop)];
      }
      if (typeof list[prop] === 'function') {
        return list[prop].bind(list);
      }
      return list[prop] || target[prop];
    }
  });

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
      this.filterIsLens = false;
      this.filterTarget = 'fill';
      this.filterPlugin = 'bloom';
      this.filterP1 = 0;
      this.filterP2 = 0;
      this.filterParams = [];
      this.filterOpacity = 1.0;

      // Caches for zero-lag diffing
      this._lastFillVal = null;
      this._lastStrokeVal = null;
      this._lastBgVal = null;
      this._isSyncing = false;
      this._needsSyncWhenVisible = false;
      this._isDragging = false;

      // Procedural Brush Fill State
      this.brushFillConfig = { ...DEFAULT_BRUSH_FILL_CONFIG };

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

          <!-- Preset Selector Bar directly below target switcher -->
          <div class="cs-preset-bar" style="display: flex; gap: 4px; align-items: center; margin-bottom: 6px;">
            <select id="cs-material-preset-select" class="cs-select" style="flex: 1;">
              <option value="" disabled selected>Preset: Select Material</option>
            </select>
            <button type="button" id="cs-btn-save-material-preset" class="cs-btn-mini" style="padding: 3px 8px; flex-shrink: 0;" title="Save current appearance as preset">Save</button>
          </div>

          <!-- Main Material Section Pills -->
          <div class="cs-mode-tabs">
            <button type="button" class="cs-mode-btn active" data-mode="color" title="Flat Static Color & Transparency">Color</button>
            <button type="button" class="cs-mode-btn" data-mode="gradient" title="Linear & Radial Multi-Stop Gradients">Gradient</button>
            <button type="button" class="cs-mode-btn" data-mode="texture" title="70+ Procedural Surface Textures & Distortion">Texture</button>
            <button type="button" class="cs-mode-btn" data-mode="brushfill" title="Procedural Brush Hatching & Multi-Stroke Fills">Brush Fill</button>
            <button type="button" class="cs-mode-btn" data-mode="filter" title="WASM Image Processing & Optical Lenses">WASM FX</button>
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

            <!-- Palettes Picker & Manager -->
            <div class="cs-subpanel cs-subpanel-palettes" id="cs-subpanel-palettes">
              <div class="cs-palette-toolbar">
                <select id="cs-palette-select" class="cs-select" style="flex: 1;" title="Select Palette"></select>
                <button type="button" class="cs-icon-btn" id="cs-btn-add-swatch" title="Add active color to palette" style="font-weight: bold; font-size: 13px;">+</button>
                <button type="button" class="cs-icon-btn" id="cs-btn-new-palette" title="Create new palette" style="font-size: 11px;">★</button>
                <button type="button" class="cs-icon-btn" id="cs-btn-palette-menu" title="Palette options, harmony & export/import" style="font-weight: bold; font-size: 13px;">⋮</button>
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
                <input type="number" id="cs-grad-stop-opacity" min="0" max="1" step="any" value="1.0" class="cs-text-input">
              </div>

              <div class="cs-form-row">
                <label>Intensity</label>
                <input type="number" id="cs-grad-stop-intensity" min="0.1" max="10" step="any" value="1.0" title="HDR / Bloom Multiplier" class="cs-text-input">
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
                <input type="number" id="cs-grad-radius" min="0.01" max="10" step="any" value="0.5" class="cs-text-input">
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
                <label>Backdrop Lens</label>
                <input type="checkbox" id="cs-filter-is-lens" style="accent-color: var(--primary, #fabd2f);">
              </div>

              <div class="cs-form-row">
                <label>Plugin</label>
                <select id="cs-filter-plugin" class="cs-select"></select>
              </div>

              <!-- Dynamic Plugin Parameters Container -->
              <div id="cs-filter-params-container" style="display: flex; flex-direction: column; gap: 5px;"></div>

              <div class="cs-form-row">
                <label>FX Opacity</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-filter-opacity-slider" min="0" max="1" step="0.01" value="1.0" class="cs-mini-range">
                  <input type="number" id="cs-filter-opacity" min="0" max="1" step="any" value="1.0" class="cs-mini-num">
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 5: BRUSH FILL & PROCEDURAL HATCHING -->
          <div class="cs-panel cs-panel-brushfill" id="cs-panel-brushfill">
            <div class="cs-card">
              <div class="cs-card-title">Brush Fill Mode</div>
              <div class="cs-form-row">
                <label>Enable Fill</label>
                <input type="checkbox" id="cs-bf-enabled" style="accent-color: var(--primary, #fabd2f);">
              </div>
            </div>

            <!-- Native Brush Pool Selection -->
            <div class="cs-card">
              <div class="cs-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <div class="cs-card-title" style="margin: 0;">Brush Pool</div>
                <span id="cs-bf-brush-count-label" style="font-size: 9.5px; color: var(--text-muted, #928374); font-weight: 600;">1 brush</span>
              </div>
              <div id="cs-bf-brush-pool-container" style="display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: var(--bg-input, #121314); border-radius: var(--radius-sm, 3px); border: 1px solid var(--border, #2e3234); min-height: 28px; align-items: center;"></div>
              <div class="cs-form-row" style="gap: 4px;">
                <select id="cs-bf-brush-add-select" class="cs-select" style="flex: 1;"></select>
                <button type="button" id="cs-btn-add-bf-brush" class="cs-btn-mini" style="white-space: nowrap; padding: 3px 8px;">+ Add</button>
              </div>
              <div class="cs-form-row" id="cs-bf-brush-pick-row">
                <label>Brush Pick</label>
                <select id="cs-bf-brush-pick-mode" class="cs-select">
                  <option value="cycle">Cycle in Sequence</option>
                  <option value="random">Random Selection</option>
                  <option value="alternate">Alternate (1 &amp; 2)</option>
                </select>
              </div>
            </div>

            <!-- Pattern & Mesh Layout Card -->
            <div class="cs-card">
              <div class="cs-card-title">Mesh & Trajectory</div>
              <div class="cs-form-row">
                <label>Pattern</label>
                <select id="cs-bf-pattern" class="cs-select">
                  <optgroup label="Linear & Grid Meshes">
                    <option value="linear">Parallel Hatch</option>
                    <option value="crosshatch">Crosshatch</option>
                    <option value="triple_hatch">Triple Hatch</option>
                    <option value="herringbone">Herringbone / Chevron</option>
                    <option value="woven">Woven Basketweave</option>
                    <option value="isometric">Isometric Tri-Mesh</option>
                  </optgroup>
                  <optgroup label="Curvature & 3D Forms">
                    <option value="cross_contour">Cross-Contour 3D</option>
                    <option value="radial">Radial Rays / Sunburst</option>
                    <option value="concentric">Concentric Rings</option>
                    <option value="spiral">Archimedean Spiral</option>
                    <option value="contour">Concentric Inset</option>
                  </optgroup>
                  <optgroup label="Flow, Waves & Organic">
                    <option value="flow_field">Fluid Flow Field</option>
                    <option value="wave">Sinusoidal Waves</option>
                    <option value="zigzag">Zig-Zag Mesh</option>
                    <option value="voronoi">Voronoi Crystals</option>
                    <option value="scribble">Wandering Scribble</option>
                    <option value="stipple">Pointillist Stipple</option>
                  </optgroup>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Direction</label>
                <select id="cs-bf-stroke-direction" class="cs-select">
                  <option value="bidirectional">Bidirectional (Alternating Hand)</option>
                  <option value="forward">Forward (Unidirectional)</option>
                  <option value="reverse">Reverse Direction</option>
                  <option value="random">Random Flip</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Spacing</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-spacing-slider" min="1" max="80" step="1" value="8" class="cs-mini-range">
                  <input type="number" id="cs-bf-spacing" min="1" max="200" step="1" value="8" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Spacing Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-spacing-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-spacing-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Non-uniform line pitch (0-100%)">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Angle</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-angle-slider" min="0" max="360" step="1" value="45" class="cs-mini-range">
                  <input type="number" id="cs-bf-angle" min="0" max="360" step="1" value="45" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Line Tilt Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-line-angle-jitter-slider" min="0" max="45" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-line-angle-jitter" min="0" max="45" step="1" value="0" class="cs-mini-num" title="Line-by-line tilt variation (± degrees)">
                </div>
              </div>

              <div class="cs-form-row" id="cs-bf-row-angle2">
                <label>Cross Angle</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-angle2-slider" min="0" max="360" step="1" value="135" class="cs-mini-range">
                  <input type="number" id="cs-bf-angle2" min="0" max="360" step="1" value="135" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row" id="cs-bf-row-angle3">
                <label>Triple Angle</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-angle3-slider" min="0" max="360" step="1" value="90" class="cs-mini-range">
                  <input type="number" id="cs-bf-angle3" min="0" max="360" step="1" value="90" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row" id="cs-bf-row-wave-freq">
                <label>Wave Freq</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-wave-freq-slider" min="1" max="40" step="1" value="8" class="cs-mini-range">
                  <input type="number" id="cs-bf-wave-freq" min="1" max="100" step="1" value="8" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row" id="cs-bf-row-wave-amp">
                <label>Wave Amp</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-wave-amp-slider" min="0" max="100" step="1" value="50" class="cs-mini-range">
                  <input type="number" id="cs-bf-wave-amp" min="0" max="200" step="1" value="50" class="cs-mini-num" title="Wave height % of spacing">
                </div>
              </div>

              <div class="cs-form-row" id="cs-bf-row-origin-x">
                <label>Center X %</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-origin-x-slider" min="0" max="100" step="1" value="50" class="cs-mini-range">
                  <input type="number" id="cs-bf-origin-x" min="0" max="100" step="1" value="50" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row" id="cs-bf-row-origin-y">
                <label>Center Y %</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-origin-y-slider" min="0" max="100" step="1" value="50" class="cs-mini-range">
                  <input type="number" id="cs-bf-origin-y" min="0" max="100" step="1" value="50" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Mesh Phase</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-mesh-phase-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-mesh-phase" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Grid alignment phase shift %">
                </div>
              </div>
            </div>

            <!-- Strokes Per Line & Density -->
            <div class="cs-card">
              <div class="cs-card-title">Strokes Per Line & Segmentation</div>
              <div class="cs-form-row">
                <label>Per Line</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-strokes-per-line-slider" min="1" max="20" step="1" value="1" class="cs-mini-range">
                  <input type="number" id="cs-bf-strokes-per-line" min="1" max="50" step="1" value="1" class="cs-mini-num" title="Number of strokes per line">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Max Length</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-stroke-length-slider" min="0" max="300" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-stroke-length" min="0" max="1000" step="1" value="0" class="cs-mini-num" title="0 = Full span">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Stroke Gap</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-stroke-gap-slider" min="0" max="50" step="1" value="4" class="cs-mini-range">
                  <input type="number" id="cs-bf-stroke-gap" min="0" max="200" step="1" value="4" class="cs-mini-num" title="Gap between strokes (px)">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Overlap</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-stroke-overlap-slider" min="0" max="50" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-stroke-overlap" min="0" max="200" step="1" value="0" class="cs-mini-num" title="Overlap between strokes (px)">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Gap Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-gap-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-gap-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± % gap variation">
                </div>
              </div>
            </div>

            <!-- Multi-Color Palette -->
            <div class="cs-card">
              <div class="cs-card-title">Multi-Color Palette</div>
              <div class="cs-form-row">
                <label>Color Mode</label>
                <select id="cs-bf-color-mode" class="cs-select">
                  <option value="palette">Multi-Color Palette</option>
                  <option value="solid">Single Solid</option>
                  <option value="gradient">Gradient Projection</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Saved Palette</label>
                <select id="cs-bf-palette-select" class="cs-select" title="Choose a saved color palette for brush fills"></select>
              </div>

              <div class="cs-form-row">
                <label>Color Pick</label>
                <select id="cs-bf-color-pick-mode" class="cs-select">
                  <option value="cycle">Cycle Colors</option>
                  <option value="random">Random Color</option>
                  <option value="gradient">Spatial Gradient</option>
                </select>
              </div>

              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
                <span style="font-size: 10px; color: var(--text-muted, #928374);">Palette Swatches:</span>
                <div style="display: flex; gap: 4px;">
                  <button type="button" id="cs-btn-add-bf-color" class="cs-btn-mini" style="padding: 1px 6px; font-size: 9.5px;" title="Add current studio color to palette">+ Add Color</button>
                  <button type="button" id="cs-btn-save-bf-palette" class="cs-btn-mini" style="padding: 1px 6px; font-size: 9.5px;" title="Save current swatches as a new palette">Save Palette</button>
                </div>
              </div>
              <div id="cs-bf-palette-container" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; min-height: 24px; align-items: center;"></div>
            </div>

            <!-- Stroke Geometry & Properties -->
            <div class="cs-card">
              <div class="cs-card-title">Stroke Dynamics</div>
              <div class="cs-form-row">
                <label>Width</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-stroke-width-slider" min="0.5" max="30" step="0.5" value="2" class="cs-mini-range">
                  <input type="number" id="cs-bf-stroke-width" min="0.5" max="100" step="0.5" value="2" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Opacity</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-stroke-opacity-slider" min="0" max="1" step="0.02" value="0.9" class="cs-mini-range">
                  <input type="number" id="cs-bf-stroke-opacity" min="0" max="1" step="0.01" value="0.9" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Flow</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-flow-slider" min="1" max="100" step="1" value="100" class="cs-mini-range">
                  <input type="number" id="cs-bf-flow" min="1" max="100" step="1" value="100" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Hardness</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-hardness-slider" min="0" max="100" step="1" value="95" class="cs-mini-range">
                  <input type="number" id="cs-bf-hardness" min="0" max="100" step="1" value="95" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Curvature</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-curvature-slider" min="-100" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-curvature" min="-100" max="100" step="1" value="0" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Curve Mode</label>
                <select id="cs-bf-curvature-mode" class="cs-select">
                  <option value="uniform">Uniform Arc</option>
                  <option value="arch">Parabolic Arch</option>
                  <option value="s_curve">Sigmoid S-Curve</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Hand Wobble</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-wobble-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-wobble" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Natural hand tremor & roughness %">
                </div>
              </div>
            </div>

            <!-- Variance & Jitters -->
            <div class="cs-card">
              <div class="cs-card-title">Variance & Parameter Jitters</div>
              <div class="cs-form-row">
                <label>Angle Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-angle-jitter-slider" min="0" max="90" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-angle-jitter" min="0" max="90" step="1" value="0" class="cs-mini-num" title="Max ± degrees">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Length Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-length-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-length-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± %">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Width Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-width-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-width-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± %">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Opacity Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-opacity-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-opacity-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± %">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Position Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-position-jitter-slider" min="0" max="50" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-position-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± px">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Curve Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-curvature-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-curvature-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Hue Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-hue-jitter-slider" min="0" max="180" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-hue-jitter" min="0" max="180" step="1" value="0" class="cs-mini-num" title="Max ± degrees hue shift">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Sat Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-sat-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-sat-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± % saturation shift">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Light Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-lightness-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-lightness-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Max ± % lightness/value shift">
                </div>
              </div>

              <div class="cs-form-row">
                <label>All Color Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-color-jitter-slider" min="0" max="100" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-color-jitter" min="0" max="100" step="1" value="0" class="cs-mini-num" title="Overall random color variance">
                </div>
              </div>
            </div>

            <!-- Boundary Bleed & Overshoot -->
            <div class="cs-card">
              <div class="cs-card-title">Boundary Bleed & Overshoot</div>
              <div class="cs-form-row">
                <label>Clip Mode</label>
                <select id="cs-bf-clip-mode" class="cs-select">
                  <option value="bleed">Bleed Overshoot (Loose Sketch)</option>
                  <option value="strict">Strict Contour Boundary</option>
                </select>
              </div>

              <div class="cs-form-row">
                <label>Bleed Dist</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-bleed-distance-slider" min="0" max="60" step="1" value="0" class="cs-mini-range">
                  <input type="number" id="cs-bf-bleed-distance" min="0" max="200" step="1" value="0" class="cs-mini-num" title="Max px beyond border">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Bleed Jitter</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-bleed-jitter-slider" min="0" max="100" step="1" value="50" class="cs-mini-range">
                  <input type="number" id="cs-bf-bleed-jitter" min="0" max="100" step="1" value="50" class="cs-mini-num" title="Max ± %">
                </div>
              </div>

              <div class="cs-form-row">
                <label>Bleed Prob</label>
                <div style="display: flex; gap: 6px; flex: 1; align-items: center;">
                  <input type="range" id="cs-bf-bleed-probability-slider" min="0" max="100" step="1" value="100" class="cs-mini-range">
                  <input type="number" id="cs-bf-bleed-probability" min="0" max="100" step="1" value="100" class="cs-mini-num" title="% of strokes that bleed">
                </div>
              </div>
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
        panelBrushFill: this.container.querySelector('#cs-panel-brushfill'),
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
        btnNewPalette: this.container.querySelector('#cs-btn-new-palette'),
        btnPaletteMenu: this.container.querySelector('#cs-btn-palette-menu'),
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
        filterIsLens: this.container.querySelector('#cs-filter-is-lens'),
        filterPlugin: this.container.querySelector('#cs-filter-plugin'),
        filterParamsContainer: this.container.querySelector('#cs-filter-params-container'),
        filterOpacitySlider: this.container.querySelector('#cs-filter-opacity-slider'),
        filterOpacity: this.container.querySelector('#cs-filter-opacity'),
        // Presets Select
        materialPresetSelect: this.container.querySelector('#cs-material-preset-select'),
        btnSaveMaterialPreset: this.container.querySelector('#cs-btn-save-material-preset'),
        // Brush Fill Controls
        bfEnabled: this.container.querySelector('#cs-bf-enabled'),
        bfBrushAddSelect: this.container.querySelector('#cs-bf-brush-add-select'),
        btnAddBfBrush: this.container.querySelector('#cs-btn-add-bf-brush'),
        bfBrushPoolContainer: this.container.querySelector('#cs-bf-brush-pool-container'),
        bfBrushCountLabel: this.container.querySelector('#cs-bf-brush-count-label'),
        bfBrushPickRow: this.container.querySelector('#cs-bf-brush-pick-row'),
        bfBrushPickMode: this.container.querySelector('#cs-bf-brush-pick-mode'),
        bfPattern: this.container.querySelector('#cs-bf-pattern'),
        bfStrokeDirection: this.container.querySelector('#cs-bf-stroke-direction'),
        bfSpacingSlider: this.container.querySelector('#cs-bf-spacing-slider'),
        bfSpacing: this.container.querySelector('#cs-bf-spacing'),
        bfSpacingJitterSlider: this.container.querySelector('#cs-bf-spacing-jitter-slider'),
        bfSpacingJitter: this.container.querySelector('#cs-bf-spacing-jitter'),
        bfAngleSlider: this.container.querySelector('#cs-bf-angle-slider'),
        bfAngle: this.container.querySelector('#cs-bf-angle'),
        bfLineAngleJitterSlider: this.container.querySelector('#cs-bf-line-angle-jitter-slider'),
        bfLineAngleJitter: this.container.querySelector('#cs-bf-line-angle-jitter'),
        bfRowAngle2: this.container.querySelector('#cs-bf-row-angle2'),
        bfAngle2Slider: this.container.querySelector('#cs-bf-angle2-slider'),
        bfAngle2: this.container.querySelector('#cs-bf-angle2'),
        bfRowAngle3: this.container.querySelector('#cs-bf-row-angle3'),
        bfAngle3Slider: this.container.querySelector('#cs-bf-angle3-slider'),
        bfAngle3: this.container.querySelector('#cs-bf-angle3'),
        bfRowWaveFreq: this.container.querySelector('#cs-bf-row-wave-freq'),
        bfWaveFreqSlider: this.container.querySelector('#cs-bf-wave-freq-slider'),
        bfWaveFreq: this.container.querySelector('#cs-bf-wave-freq'),
        bfRowWaveAmp: this.container.querySelector('#cs-bf-row-wave-amp'),
        bfWaveAmpSlider: this.container.querySelector('#cs-bf-wave-amp-slider'),
        bfWaveAmp: this.container.querySelector('#cs-bf-wave-amp'),
        bfRowOriginX: this.container.querySelector('#cs-bf-row-origin-x'),
        bfOriginXSlider: this.container.querySelector('#cs-bf-origin-x-slider'),
        bfOriginX: this.container.querySelector('#cs-bf-origin-x'),
        bfRowOriginY: this.container.querySelector('#cs-bf-row-origin-y'),
        bfOriginYSlider: this.container.querySelector('#cs-bf-origin-y-slider'),
        bfOriginY: this.container.querySelector('#cs-bf-origin-y'),
        bfMeshPhaseSlider: this.container.querySelector('#cs-bf-mesh-phase-slider'),
        bfMeshPhase: this.container.querySelector('#cs-bf-mesh-phase'),
        bfStrokesPerLineSlider: this.container.querySelector('#cs-bf-strokes-per-line-slider'),
        bfStrokesPerLine: this.container.querySelector('#cs-bf-strokes-per-line'),
        bfStrokeLengthSlider: this.container.querySelector('#cs-bf-stroke-length-slider'),
        bfStrokeLength: this.container.querySelector('#cs-bf-stroke-length'),
        bfStrokeGapSlider: this.container.querySelector('#cs-bf-stroke-gap-slider'),
        bfStrokeGap: this.container.querySelector('#cs-bf-stroke-gap'),
        bfStrokeOverlapSlider: this.container.querySelector('#cs-bf-stroke-overlap-slider'),
        bfStrokeOverlap: this.container.querySelector('#cs-bf-stroke-overlap'),
        bfGapJitterSlider: this.container.querySelector('#cs-bf-gap-jitter-slider'),
        bfGapJitter: this.container.querySelector('#cs-bf-gap-jitter'),
        bfColorMode: this.container.querySelector('#cs-bf-color-mode'),
        bfPaletteSelect: this.container.querySelector('#cs-bf-palette-select'),
        bfColorPickMode: this.container.querySelector('#cs-bf-color-pick-mode'),
        btnAddBfColor: this.container.querySelector('#cs-btn-add-bf-color'),
        btnSaveBfPalette: this.container.querySelector('#cs-btn-save-bf-palette'),
        bfPaletteContainer: this.container.querySelector('#cs-bf-palette-container'),
        bfStrokeWidthSlider: this.container.querySelector('#cs-bf-stroke-width-slider'),
        bfStrokeWidth: this.container.querySelector('#cs-bf-stroke-width'),
        bfStrokeOpacitySlider: this.container.querySelector('#cs-bf-stroke-opacity-slider'),
        bfStrokeOpacity: this.container.querySelector('#cs-bf-stroke-opacity'),
        bfFlowSlider: this.container.querySelector('#cs-bf-flow-slider'),
        bfFlow: this.container.querySelector('#cs-bf-flow'),
        bfHardnessSlider: this.container.querySelector('#cs-bf-hardness-slider'),
        bfHardness: this.container.querySelector('#cs-bf-hardness'),
        bfCurvatureSlider: this.container.querySelector('#cs-bf-curvature-slider'),
        bfCurvature: this.container.querySelector('#cs-bf-curvature'),
        bfCurvatureMode: this.container.querySelector('#cs-bf-curvature-mode'),
        bfWobbleSlider: this.container.querySelector('#cs-bf-wobble-slider'),
        bfWobble: this.container.querySelector('#cs-bf-wobble'),
        bfAngleJitterSlider: this.container.querySelector('#cs-bf-angle-jitter-slider'),
        bfAngleJitter: this.container.querySelector('#cs-bf-angle-jitter'),
        bfLengthJitterSlider: this.container.querySelector('#cs-bf-length-jitter-slider'),
        bfLengthJitter: this.container.querySelector('#cs-bf-length-jitter'),
        bfWidthJitterSlider: this.container.querySelector('#cs-bf-width-jitter-slider'),
        bfWidthJitter: this.container.querySelector('#cs-bf-width-jitter'),
        bfOpacityJitterSlider: this.container.querySelector('#cs-bf-opacity-jitter-slider'),
        bfOpacityJitter: this.container.querySelector('#cs-bf-opacity-jitter'),
        bfPositionJitterSlider: this.container.querySelector('#cs-bf-position-jitter-slider'),
        bfPositionJitter: this.container.querySelector('#cs-bf-position-jitter'),
        bfCurvatureJitterSlider: this.container.querySelector('#cs-bf-curvature-jitter-slider'),
        bfCurvatureJitter: this.container.querySelector('#cs-bf-curvature-jitter'),
        bfHueJitterSlider: this.container.querySelector('#cs-bf-hue-jitter-slider'),
        bfHueJitter: this.container.querySelector('#cs-bf-hue-jitter'),
        bfSatJitterSlider: this.container.querySelector('#cs-bf-sat-jitter-slider'),
        bfSatJitter: this.container.querySelector('#cs-bf-sat-jitter'),
        bfLightnessJitterSlider: this.container.querySelector('#cs-bf-lightness-jitter-slider'),
        bfLightnessJitter: this.container.querySelector('#cs-bf-lightness-jitter'),
        bfColorJitterSlider: this.container.querySelector('#cs-bf-color-jitter-slider'),
        bfColorJitter: this.container.querySelector('#cs-bf-color-jitter'),
        bfClipMode: this.container.querySelector('#cs-bf-clip-mode'),
        bfBleedDistanceSlider: this.container.querySelector('#cs-bf-bleed-distance-slider'),
        bfBleedDistance: this.container.querySelector('#cs-bf-bleed-distance'),
        bfBleedJitterSlider: this.container.querySelector('#cs-bf-bleed-jitter-slider'),
        bfBleedJitter: this.container.querySelector('#cs-bf-bleed-jitter'),
        bfBleedProbabilitySlider: this.container.querySelector('#cs-bf-bleed-probability-slider'),
        bfBleedProbability: this.container.querySelector('#cs-bf-bleed-probability')
      };

      this.populateFilterPluginSelect();
      this.renderFilterParams();
      this.renderGradientPresets();
      this.renderMaterialPresetsList();
      this.populateBrushSelects();
      this.populateBrushFillPaletteSelect();
      this.renderBrushFillPalette();
      this.syncBrushFillInputs();

      if (typeof PaletteManager !== 'undefined' && typeof PaletteManager.subscribe === 'function') {
        PaletteManager.subscribe(() => {
          this.populatePalettesSelect();
          this.populateBrushFillPaletteSelect();
        });
      }
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

      d.sliderAlpha?.addEventListener('pointerdown', () => { this._isDragging = true; });
      d.sliderAlpha?.addEventListener('input', (e) => {
        this._isDragging = true;
        this.currentA = Number(e.target.value) / 100;
        this.applyToSelected(false);
      });
      d.sliderAlpha?.addEventListener('change', () => {
        this._isDragging = false;
        this.commitToHistory();
      });
      d.sliderAlpha?.addEventListener('pointerup', () => { this._isDragging = false; });
      d.sliderAlpha?.addEventListener('pointercancel', () => { this._isDragging = false; });

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

      // 10. Palette Swatches & Manager
      d.palSelect?.addEventListener('change', () => {
        if (d.palSelect?.value) {
          PaletteManager.setActivePalette(d.palSelect.value);
        }
        this.renderPalettes();
      });

      d.btnAddSwatch?.addEventListener('click', () => {
        const palType = d.palSelect?.value || PaletteManager.activePaletteId || 'gruvbox';
        const targetId = palType === 'document' ? 'custom' : palType;
        const currentHex = (this.currentHex || '#fabd2f').toLowerCase();
        PaletteManager.addColor(targetId, currentHex);
        if (palType === 'document' && d.palSelect) {
          d.palSelect.value = 'custom';
          PaletteManager.setActivePalette('custom');
        }
        this.renderPalettes();
        if (typeof showNotification === 'function') {
          showNotification(`Added ${currentHex} to palette!`);
        }
      });

      d.btnNewPalette?.addEventListener('click', () => {
        this.promptCreatePalette();
      });

      d.btnPaletteMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPaletteMenu(d.btnPaletteMenu);
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

      d.filterIsLens?.addEventListener('change', (e) => {
        this.filterIsLens = e.target.checked;
        this.applyFilterToSelected(true);
      });

      d.filterPlugin?.addEventListener('change', (e) => {
        this.filterPlugin = e.target.value;
        const info = this.getPluginInfo(this.filterPlugin);
        const params = (info && Array.isArray(info.params)) ? info.params : [];
        this.filterP1 = params[0]?.default !== undefined ? params[0].default : (params[0]?.min || 0);
        this.filterP2 = params[1]?.default !== undefined ? params[1].default : (params[1]?.min || 0);
        this.filterParams = params.map(p => p.default !== undefined ? p.default : (p.min || 0));
        this.renderFilterParams();
        this.applyFilterToSelected(true);
      });

      d.filterOpacitySlider?.addEventListener('input', (e) => {
        this.filterOpacity = Number(e.target.value);
        if (d.filterOpacity) d.filterOpacity.value = String(this.filterOpacity);
        this.applyFilterToSelected(false);
      });
      d.filterOpacitySlider?.addEventListener('change', (e) => {
        this.filterOpacity = Number(e.target.value);
        if (d.filterOpacity) d.filterOpacity.value = String(this.filterOpacity);
        this.applyFilterToSelected(true);
      });

      d.filterOpacity?.addEventListener('input', (e) => {
        this.filterOpacity = Number(e.target.value);
        if (d.filterOpacitySlider) d.filterOpacitySlider.value = String(this.filterOpacity);
        this.applyFilterToSelected(false);
      });
      d.filterOpacity?.addEventListener('change', (e) => {
        this.filterOpacity = Number(e.target.value);
        if (d.filterOpacitySlider) d.filterOpacitySlider.value = String(this.filterOpacity);
        this.applyFilterToSelected(true);
      });

      // ── Material Presets Events ──
      d.materialPresetSelect?.addEventListener('change', (e) => {
        const val = e.target.value;
        const preset = this.findMaterialPreset(val);
        if (preset) {
          this.applyMaterialPreset(preset);
        }
      });

      d.btnSaveMaterialPreset?.addEventListener('click', () => {
        this.saveCurrentAsMaterialPreset();
      });

      // ── Brush Fill Controls & Presets Events ──
      d.bfEnabled?.addEventListener('change', () => this.applyBrushFillToSelected(true));

      d.bfPresetSelect?.addEventListener('change', (e) => {
        const val = e.target.value;
        const preset = this.findBrushFillPreset(val);
        if (preset) {
          this.applyBrushFillPreset(preset);
        }
      });

      d.btnSaveBfPreset?.addEventListener('click', () => {
        this.saveCurrentAsBrushFillPreset();
      });

      d.bfPattern?.addEventListener('change', () => {
        this.updateBrushFillPatternVisibility();
        this.applyBrushFillToSelected(true);
      });

      const bindBfPair = (sliderEl, numEl) => {
        if (!sliderEl || !numEl) return;
        sliderEl.addEventListener('input', (e) => {
          numEl.value = e.target.value;
          this.applyBrushFillToSelected(false);
        });
        sliderEl.addEventListener('change', (e) => {
          numEl.value = e.target.value;
          this.applyBrushFillToSelected(true);
        });
        numEl.addEventListener('input', (e) => {
          sliderEl.value = e.target.value;
          this.applyBrushFillToSelected(false);
        });
        numEl.addEventListener('change', (e) => {
          sliderEl.value = e.target.value;
          this.applyBrushFillToSelected(true);
        });
      };

      bindBfPair(d.bfSpacingSlider, d.bfSpacing);
      bindBfPair(d.bfSpacingJitterSlider, d.bfSpacingJitter);
      bindBfPair(d.bfAngleSlider, d.bfAngle);
      bindBfPair(d.bfLineAngleJitterSlider, d.bfLineAngleJitter);
      bindBfPair(d.bfAngle2Slider, d.bfAngle2);
      bindBfPair(d.bfAngle3Slider, d.bfAngle3);
      bindBfPair(d.bfWaveFreqSlider, d.bfWaveFreq);
      bindBfPair(d.bfWaveAmpSlider, d.bfWaveAmp);
      bindBfPair(d.bfOriginXSlider, d.bfOriginX);
      bindBfPair(d.bfOriginYSlider, d.bfOriginY);
      bindBfPair(d.bfMeshPhaseSlider, d.bfMeshPhase);
      bindBfPair(d.bfStrokesPerLineSlider, d.bfStrokesPerLine);
      bindBfPair(d.bfStrokeLengthSlider, d.bfStrokeLength);
      bindBfPair(d.bfStrokeGapSlider, d.bfStrokeGap);
      bindBfPair(d.bfStrokeOverlapSlider, d.bfStrokeOverlap);
      bindBfPair(d.bfGapJitterSlider, d.bfGapJitter);
      bindBfPair(d.bfStrokeWidthSlider, d.bfStrokeWidth);
      bindBfPair(d.bfStrokeOpacitySlider, d.bfStrokeOpacity);
      bindBfPair(d.bfFlowSlider, d.bfFlow);
      bindBfPair(d.bfHardnessSlider, d.bfHardness);
      bindBfPair(d.bfCurvatureSlider, d.bfCurvature);
      bindBfPair(d.bfWobbleSlider, d.bfWobble);
      bindBfPair(d.bfAngleJitterSlider, d.bfAngleJitter);
      bindBfPair(d.bfLengthJitterSlider, d.bfLengthJitter);
      bindBfPair(d.bfWidthJitterSlider, d.bfWidthJitter);
      bindBfPair(d.bfOpacityJitterSlider, d.bfOpacityJitter);
      bindBfPair(d.bfPositionJitterSlider, d.bfPositionJitter);
      bindBfPair(d.bfCurvatureJitterSlider, d.bfCurvatureJitter);
      bindBfPair(d.bfHueJitterSlider, d.bfHueJitter);
      bindBfPair(d.bfSatJitterSlider, d.bfSatJitter);
      bindBfPair(d.bfLightnessJitterSlider, d.bfLightnessJitter);
      bindBfPair(d.bfColorJitterSlider, d.bfColorJitter);
      bindBfPair(d.bfBleedDistanceSlider, d.bfBleedDistance);
      bindBfPair(d.bfBleedJitterSlider, d.bfBleedJitter);
      bindBfPair(d.bfBleedProbabilitySlider, d.bfBleedProbability);

      // Brush Pool Add Button
      d.btnAddBfBrush?.addEventListener('click', () => {
        const selectedBrush = d.bfBrushAddSelect?.value || 'pencil';
        if (!Array.isArray(this.brushFillConfig.brushes)) {
          this.brushFillConfig.brushes = [this.brushFillConfig.brush || 'pencil'];
        }
        this.brushFillConfig.brushes.push(selectedBrush);
        this.brushFillConfig.brushList = [...this.brushFillConfig.brushes];
        this.brushFillConfig.brush = this.brushFillConfig.brushes[0];
        this.brushFillConfig.brushSecondary = this.brushFillConfig.brushes[1] || '';
        this.renderBrushPool();
        this.applyBrushFillToSelected(true);
      });

      d.bfBrushPickMode?.addEventListener('change', () => this.applyBrushFillToSelected(true));
      d.bfStrokeDirection?.addEventListener('change', () => this.applyBrushFillToSelected(true));
      d.bfCurvatureMode?.addEventListener('change', () => this.applyBrushFillToSelected(true));
      d.bfColorMode?.addEventListener('change', () => this.applyBrushFillToSelected(true));
      d.bfColorPickMode?.addEventListener('change', () => this.applyBrushFillToSelected(true));
      d.bfClipMode?.addEventListener('change', () => this.applyBrushFillToSelected(true));

      // Saved Palette selection
      d.bfPaletteSelect?.addEventListener('change', () => {
        const palId = d.bfPaletteSelect.value;
        let colors = [];
        if (palId === 'document') {
          colors = this.extractDocumentColors();
        } else {
          const pal = PaletteManager.getPalette(palId);
          if (pal && pal.colors && pal.colors.length > 0) {
            colors = [...pal.colors];
          }
        }
        if (colors.length > 0) {
          this.brushFillConfig.colorPalette = colors;
          this.brushFillConfig.colorPaletteId = palId;
          this.renderBrushFillPalette();
          this.applyBrushFillToSelected(true);
        }
      });

      // Add Color to Palette
      d.btnAddBfColor?.addEventListener('click', () => {
        const col = this.currentHex || '#fabd2f';
        if (!Array.isArray(this.brushFillConfig.colorPalette)) {
          this.brushFillConfig.colorPalette = ['#fabd2f'];
        }
        this.brushFillConfig.colorPalette.push(col);
        this.renderBrushFillPalette();
        this.applyBrushFillToSelected(true);
      });

      // Save Palette
      d.btnSaveBfPalette?.addEventListener('click', () => {
        const swatches = this.brushFillConfig.colorPalette || [];
        if (swatches.length === 0) {
          if (typeof showNotification === 'function') {
            showNotification('No colors in brush fill palette to save.');
          }
          return;
        }
        const name = prompt('Enter a name for this new color palette:', 'Brush Palette');
        if (name && name.trim()) {
          const newPal = PaletteManager.createPalette(name.trim(), swatches);
          if (newPal) {
            this.brushFillConfig.colorPaletteId = newPal.id;
            this.populateBrushFillPaletteSelect();
            this.populatePalettesSelect();
            if (d.bfPaletteSelect) d.bfPaletteSelect.value = newPal.id;
            this.renderPalettes();
            if (typeof showNotification === 'function') {
              showNotification(`Saved palette "${newPal.name}"!`);
            }
          }
        }
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
      this.dom.panelBrushFill?.classList.toggle('active', mode === 'brushfill');

      if (mode === 'gradient') {
        this.updateGradientUI();
      } else if (mode === 'brushfill') {
        this.updateBrushFillUI();
      } else if (mode === 'color' && this.colorSubMode === 'palettes') {
        this.renderPalettes();
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
        const aVal = (this.currentA !== undefined) ? this.currentA : 1.0;
        d.sliderAlpha.value = Math.round(aVal * 100);
        d.sliderAlpha.style.background = `linear-gradient(to right, transparent, ${this.currentHex || '#fabd2f'}), repeating-conic-gradient(#3c3836 0% 25%, #282828 0% 50%) 50% / 8px 8px`;
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
      this._isApplying = true;
      try {
        const val = this.isTargetNone ? 'none' : this.currentHex;
        const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
        const activeDoc = getDoc();

        if (this.activeTarget === 'fill') {
          const textEl = getDomEl('prop-fill-text');
          const colorEl = getDomEl('prop-fill-color');
          const opEl = getDomEl('prop-fill-opacity');
          if (textEl) textEl.value = val;
          if (colorEl && !this.isTargetNone && val.startsWith('#') && val.length === 7) colorEl.value = val;
          if (opEl && this.currentA !== undefined) opEl.value = this.currentA;

          if (activeDoc && typeof activeDoc.getSelectedObjects === 'function') {
            const selected = activeDoc.getSelectedObjects();
            if (selected.length > 0) {
              for (const obj of selected) {
                obj.fill = val;
                if (val !== 'none' && obj.fillType && obj.fillType !== 'solid') obj.fillType = 'solid';
                if (this.currentA !== undefined) obj.fillOpacity = this.currentA;
                if (obj.type === 'group' && Array.isArray(obj.children)) {
                  for (const child of obj.children) {
                    child.fill = val;
                    if (val !== 'none' && child.fillType && child.fillType !== 'solid') child.fillType = 'solid';
                    if (this.currentA !== undefined) child.fillOpacity = this.currentA;
                  }
                }
              }
            } else {
              activeDoc.defaultFill = val;
              if (this.currentA !== undefined) activeDoc.defaultFillOpacity = this.currentA;
            }
            if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
            if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
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
            if (this.currentA !== undefined) {
              activeDoc.backgroundOpacity = this.currentA;
            }
            if (activeDoc.backgroundType !== 'linear' && activeDoc.backgroundType !== 'radial' && activeDoc.backgroundType !== 'brush') {
              activeDoc.backgroundType = 'solid';
            }
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
          const opEl = getDomEl('prop-stroke-opacity');
          if (textEl) textEl.value = val;
          if (colorEl && !this.isTargetNone && val.startsWith('#') && val.length === 7) colorEl.value = val;
          if (opEl && this.currentA !== undefined) opEl.value = this.currentA;

          if (activeDoc && typeof activeDoc.getSelectedObjects === 'function') {
            const selected = activeDoc.getSelectedObjects();
            if (selected.length > 0) {
              for (const obj of selected) {
                obj.stroke = val;
                if (this.currentA !== undefined) {
                  obj.strokeOpacity = this.currentA;
                  if (obj.brushConfig) obj.brushConfig.opacity = this.currentA;
                }
                if (obj.type === 'group' && Array.isArray(obj.children)) {
                  for (const child of obj.children) {
                    child.stroke = val;
                    if (this.currentA !== undefined) {
                      child.strokeOpacity = this.currentA;
                      if (child.brushConfig) child.brushConfig.opacity = this.currentA;
                    }
                  }
                }
              }
            } else {
              activeDoc.defaultStroke = val;
              if (this.currentA !== undefined) activeDoc.defaultStrokeOpacity = this.currentA;
            }
            if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
            if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
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
      } finally {
        this._isApplying = false;
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

    setColorFromExternal(hex, alpha = undefined) {
      if (!hex || hex === 'none' || hex === 'transparent') {
        this.isTargetNone = true;
        if (alpha !== undefined) {
          this.currentA = Number(alpha);
        }
        this.updateVisualControls();
        return;
      }
      this.isTargetNone = false;
      const rgb = hexToRgb(hex);
      this.currentR = rgb.r;
      this.currentG = rgb.g;
      this.currentB = rgb.b;
      if (alpha !== undefined) {
        this.currentA = Number(alpha);
      } else if (rgb.a !== undefined && (hex.trim().startsWith('#') && (hex.trim().length === 5 || hex.trim().length === 9))) {
        this.currentA = rgb.a;
      }
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
      if (!activeDoc) return;

      const SvgLinearGrad = (typeof window !== 'undefined' && window.SvgLinearGradient) || (typeof SvgLinearGradient !== 'undefined' ? SvgLinearGradient : null);
      const SvgRadialGrad = (typeof window !== 'undefined' && window.SvgRadialGradient) || (typeof SvgRadialGradient !== 'undefined' ? SvgRadialGradient : null);

      const stopsCopy = this.gradientStops.map(s => ({
        offset: s.offset,
        color: s.color,
        opacity: s.opacity !== undefined ? s.opacity : 1.0,
        intensity: s.intensity !== undefined ? s.intensity : 1.0
      }));

      if (this.activeTarget === 'bg') {
        activeDoc.backgroundType = this.gradientType;
        if (this.gradientType === 'linear') {
          if (SvgLinearGrad) {
            activeDoc.backgroundGradient = new SvgLinearGrad({ stops: stopsCopy });
            activeDoc.backgroundGradient.angle = this.gradientAngle;
          } else {
            activeDoc.backgroundGradient = { type: 'linear', stops: stopsCopy, angle: this.gradientAngle };
          }
        } else {
          if (SvgRadialGrad) {
            activeDoc.backgroundGradient = new SvgRadialGrad({ stops: stopsCopy, r: `${(this.gradientRadius * 100).toFixed(1)}%` });
          } else {
            activeDoc.backgroundGradient = { type: 'radial', stops: stopsCopy, r: `${(this.gradientRadius * 100).toFixed(1)}%` };
          }
        }

        if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
        if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
        if (commit) {
          if (activeDoc.pushHistory) activeDoc.pushHistory('Change Background Gradient');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
        return;
      }

      const selected = activeDoc.getSelectedObjects ? activeDoc.getSelectedObjects() : [];
      if (selected.length === 0) {
        activeDoc.defaultFillType = this.gradientType;
        if (this.gradientType === 'linear') {
          if (SvgLinearGrad) {
            activeDoc.defaultFillGradient = new SvgLinearGrad({ stops: stopsCopy });
            activeDoc.defaultFillGradient.angle = this.gradientAngle;
          } else {
            activeDoc.defaultFillGradient = { type: 'linear', stops: stopsCopy, angle: this.gradientAngle };
          }
        } else {
          if (SvgRadialGrad) {
            activeDoc.defaultFillGradient = new SvgRadialGrad({ stops: stopsCopy, r: `${(this.gradientRadius * 100).toFixed(1)}%` });
          } else {
            activeDoc.defaultFillGradient = { type: 'radial', stops: stopsCopy, r: `${(this.gradientRadius * 100).toFixed(1)}%` };
          }
        }
      }

      for (const obj of selected) {
        obj.fillType = this.gradientType;
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

      if (commit && selected.length > 0) {
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
      if (!activeDoc) return;

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

      const texConfig = {
        enabled: isEnabled,
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
      };

      if (this.activeTarget === 'bg') {
        activeDoc.backgroundTexture = { ...texConfig };
        if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
        if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
        if (commit) {
          if (activeDoc.pushHistory) activeDoc.pushHistory('Change Background Texture');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
        return;
      }

      const selected = activeDoc.getSelectedObjects ? activeDoc.getSelectedObjects() : [];
      if (selected.length === 0) {
        if (this.activeTarget === 'stroke') {
          activeDoc.defaultStrokeTexture = { ...texConfig };
        } else {
          activeDoc.defaultFillTexture = { ...texConfig };
        }
      }

      for (const obj of selected) {
        if (this.activeTarget === 'stroke') {
          if (!obj.strokeTexture) obj.strokeTexture = {};
          Object.assign(obj.strokeTexture, texConfig);
          if (obj.brushConfig) {
            if (!obj.brushConfig.texture) obj.brushConfig.texture = {};
            Object.assign(obj.brushConfig.texture, texConfig);
          }
        } else {
          if (!obj.fillTexture) obj.fillTexture = {};
          Object.assign(obj.fillTexture, texConfig);
        }
      }

      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();

      if (commit && selected.length > 0) {
        if (activeDoc.pushHistory) activeDoc.pushHistory('Change Material Texture');
        if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      }
    }

    // ── WASM FX Engine & Metadata Helpers ──

    getPluginInfo(pluginName) {
      if (!pluginName) return null;
      if (typeof window !== 'undefined') {
        if (window.host && window.host.plugins) {
          const p = window.host.plugins.get(pluginName);
          if (p && p.module && typeof p.module.getInfo === 'function') {
            try {
              const info = p.module.getInfo();
              if (info) return info;
            } catch (_) {}
          }
        }
        if (window.esenho && window.esenho.plugins) {
          const p = window.esenho.plugins.get(pluginName);
          if (p && typeof p.getInfo === 'function') {
            try {
              const info = p.getInfo();
              if (info) return info;
            } catch (_) {}
          }
        }
      }
      if (typeof BUILTIN_FILTER_METADATA !== 'undefined' && BUILTIN_FILTER_METADATA[pluginName]) {
        return BUILTIN_FILTER_METADATA[pluginName];
      }
      return {
        title: pluginName.charAt(0).toUpperCase() + pluginName.slice(1),
        params: [
          { name: 'Parameter 1', min: 0, max: 255, default: 0 },
          { name: 'Parameter 2', min: 0, max: 255, default: 0 }
        ]
      };
    }

    populateFilterPluginSelect() {
      if (typeof document === 'undefined' || !this.dom.filterPlugin) return;
      const currentVal = this.dom.filterPlugin.value || this.filterPlugin || 'bloom';
      this.dom.filterPlugin.innerHTML = '';

      const pluginMap = new Map();

      // 1. Built-in plugins
      if (typeof BUILTIN_FILTER_METADATA !== 'undefined') {
        for (const [key, meta] of Object.entries(BUILTIN_FILTER_METADATA)) {
          pluginMap.set(key, meta.title || key);
        }
      }

      // 2. Runtime loaded plugins
      if (typeof window !== 'undefined') {
        if (window.host && window.host.plugins) {
          for (const [name, p] of window.host.plugins.entries()) {
            if (p.type !== 'filter' && typeof p.module?.exports?.w_filter_apply !== 'function' && typeof p.module?.exports?.w_plugin_filter !== 'function') continue;
            let label = name.charAt(0).toUpperCase() + name.slice(1);
            try {
              const info = p.module?.getInfo ? p.module.getInfo() : null;
              if (info && (info.title || info.name)) label = info.title || info.name;
            } catch (_) {}
            pluginMap.set(name, label);
          }
        }
        if (window.esenho && window.esenho.plugins) {
          for (const [name, p] of window.esenho.plugins.entries()) {
            if (typeof p.exports?.w_filter_apply !== 'function') continue;
            let label = name.charAt(0).toUpperCase() + name.slice(1);
            try {
              const info = p.getInfo ? p.getInfo() : null;
              if (info && (info.title || info.name)) label = info.title || info.name;
            } catch (_) {}
            pluginMap.set(name, label);
          }
        }
      }

      const entries = Array.from(pluginMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
      for (const [key, label] of entries) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        this.dom.filterPlugin.appendChild(opt);
      }

      if (pluginMap.has(currentVal)) {
        this.dom.filterPlugin.value = currentVal;
      } else if (entries.length > 0) {
        this.dom.filterPlugin.value = entries[0][0];
      }
    }

    renderFilterParams() {
      if (typeof document === 'undefined' || !this.dom.filterParamsContainer) return;
      this.dom.filterParamsContainer.innerHTML = '';

      const pluginName = this.filterPlugin || 'bloom';
      const info = this.getPluginInfo(pluginName);
      const params = (info && Array.isArray(info.params)) ? info.params : [];

      if (params.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.fontSize = '10.5px';
        emptyDiv.style.color = 'var(--text-muted, #928374)';
        emptyDiv.style.fontStyle = 'italic';
        emptyDiv.style.padding = '4px 2px';
        emptyDiv.textContent = 'No dynamic parameters needed for this optical lens.';
        this.dom.filterParamsContainer.appendChild(emptyDiv);
        return;
      }

      params.forEach((param, idx) => {
        const row = document.createElement('div');
        row.className = 'cs-form-row';

        const label = document.createElement('label');
        const unit = param.unit ? ` (${param.unit})` : '';
        const paramLabel = (param.name || `Param ${idx + 1}`) + unit;
        label.textContent = paramLabel;
        label.title = paramLabel;

        const valWrap = document.createElement('div');
        valWrap.style.display = 'flex';
        valWrap.style.gap = '6px';
        valWrap.style.flex = '1';
        valWrap.style.alignItems = 'center';

        let currentVal = idx === 0 ? this.filterP1 : (idx === 1 ? this.filterP2 : (this.filterParams ? this.filterParams[idx] : undefined));
        if (currentVal === undefined || isNaN(currentVal)) {
          currentVal = param.default !== undefined ? param.default : (param.min || 0);
          if (idx === 0) this.filterP1 = currentVal;
          if (idx === 1) this.filterP2 = currentVal;
        }

        const min = param.min !== undefined ? param.min : 0;
        const max = param.max !== undefined ? param.max : 100;
        const step = param.step !== undefined ? param.step : (max - min > 20 ? 1 : 'any');

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'cs-mini-range';
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(currentVal);

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.className = 'cs-mini-num';
        numInput.min = String(min);
        numInput.max = String(max);
        numInput.step = 'any';
        numInput.value = String(currentVal);

        const updateParam = (val, commit) => {
          const numVal = Number(val);
          if (idx === 0) this.filterP1 = numVal;
          else if (idx === 1) this.filterP2 = numVal;
          else {
            if (!this.filterParams) this.filterParams = [];
            this.filterParams[idx] = numVal;
          }
          slider.value = String(numVal);
          numInput.value = String(numVal);
          this.applyFilterToSelected(commit);
        };

        slider.addEventListener('input', (e) => updateParam(e.target.value, false));
        slider.addEventListener('change', (e) => updateParam(e.target.value, true));
        numInput.addEventListener('input', (e) => updateParam(e.target.value, false));
        numInput.addEventListener('change', (e) => updateParam(e.target.value, true));

        valWrap.appendChild(slider);
        valWrap.appendChild(numInput);
        row.appendChild(label);
        row.appendChild(valWrap);
        this.dom.filterParamsContainer.appendChild(row);
      });
    }

    // ── WASM FX Application ──

    applyFilterToSelected(commit = false) {
      if (this._isSyncing) return;
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc) return;

      const target = (this.activeTarget === 'stroke')
        ? 'stroke'
        : (this.activeTarget === 'bg' ? 'bg' : (this.filterIsLens ? 'backdrop' : 'fill'));

      const filterConfig = {
        enabled: this.filterEnabled,
        target: target,
        isLens: this.filterIsLens,
        plugin: this.filterPlugin,
        p1: this.filterP1,
        p2: this.filterP2,
        params: this.filterParams || [this.filterP1, this.filterP2],
        opacity: this.filterOpacity
      };

      if (this.activeTarget === 'bg') {
        activeDoc.backgroundFilter = { ...filterConfig };
        if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
        if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
        if (commit) {
          if (activeDoc.pushHistory) activeDoc.pushHistory('Change Background Filter');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
        return;
      }

      const selected = activeDoc.getSelectedObjects ? activeDoc.getSelectedObjects() : [];
      if (selected.length === 0) {
        if (this.activeTarget === 'stroke') {
          activeDoc.defaultStrokeFilter = { ...filterConfig };
        } else {
          activeDoc.defaultFillFilter = { ...filterConfig };
        }
      }

      for (const obj of selected) {
        if (this.activeTarget === 'stroke') {
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

      if (commit && selected.length > 0) {
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
        brushFill: { ...this.brushFillConfig },
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
          target: this.activeTarget === 'stroke' ? 'stroke' : (this.filterIsLens ? 'backdrop' : 'fill'),
          isLens: this.filterIsLens,
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
        this.filterIsLens = (preset.filter.target === 'backdrop' || !!preset.filter.isLens);
        this.filterTarget = preset.filter.target || (this.filterIsLens ? 'backdrop' : 'fill');
        this.filterPlugin = preset.filter.plugin || 'bloom';
        this.filterP1 = preset.filter.p1 || 0;
        this.filterP2 = preset.filter.p2 || 0;
        this.filterOpacity = preset.filter.opacity !== undefined ? preset.filter.opacity : 1.0;
      }

      if (preset.brushFill) {
        this.brushFillConfig = { ...DEFAULT_BRUSH_FILL_CONFIG, ...preset.brushFill, enabled: true };
        this.syncBrushFillInputs();
      }

      if (preset.mode) {
        this.switchMode(preset.mode);
      } else if (preset.brushFill && preset.brushFill.enabled) {
        this.switchMode('brushfill');
      }

      this.applyToSelected(false);
      if (preset.gradientStops && preset.gradientStops.length >= 2) {
        this.applyGradientToSelected(false);
      }
      this.applyTextureToSelected(false);
      this.applyFilterToSelected(false);
      if (preset.brushFill) {
        this.applyBrushFillToSelected(true);
      }
      this.syncFromSelection(true);
    }

    populateMaterialPresetsSelect() {
      if (typeof document === 'undefined' || !this.dom.materialPresetSelect) return;
      const sel = this.dom.materialPresetSelect;
      const currentVal = sel.value;
      sel.innerHTML = '';

      const defOption = document.createElement('option');
      defOption.value = '';
      defOption.disabled = true;
      defOption.selected = !currentVal;
      defOption.textContent = 'Preset: Select Material';
      sel.appendChild(defOption);

      // 1. Custom presets
      let customMaterials = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(CUSTOM_MATERIALS_KEY);
          if (raw) customMaterials = JSON.parse(raw);
        }
      } catch (_) {}

      if (customMaterials.length > 0) {
        const grp = document.createElement('optgroup');
        grp.label = 'Custom Materials';
        customMaterials.forEach((mat, idx) => {
          const opt = document.createElement('option');
          opt.value = `custom_${idx}`;
          opt.textContent = mat.name;
          if (currentVal === opt.value) opt.selected = true;
          grp.appendChild(opt);
        });
        sel.appendChild(grp);
      }

      // 2. Categorized Built-in Materials
      const categories = [
        { id: 'brushfills', label: 'Procedural Brush Fills' },
        { id: 'artistic', label: 'Artistic & Traditional' },
        { id: 'lenses', label: 'Optical Lenses (WASM FX)' },
        { id: 'nature', label: 'Nature & Textures' },
        { id: 'scifi', label: 'Sci-Fi & Metals' },
        { id: 'gradients', label: 'Gradients & Lighting' }
      ];

      const allMaterials = (typeof EsenhoRegistry !== 'undefined' && typeof EsenhoRegistry.list === 'function')
        ? EsenhoRegistry.list('material')
        : BUILTIN_MATERIALS;

      categories.forEach(cat => {
        const items = allMaterials.filter(m => m.category === cat.id);
        if (items.length > 0) {
          const grp = document.createElement('optgroup');
          grp.label = cat.label;
          items.forEach(mat => {
            const opt = document.createElement('option');
            opt.value = mat.id || mat.name;
            opt.textContent = mat.name;
            if (currentVal === opt.value) opt.selected = true;
            grp.appendChild(opt);
          });
          sel.appendChild(grp);
        }
      });
    }

    findMaterialPreset(idOrName) {
      if (!idOrName) return null;
      if (typeof idOrName === 'string' && idOrName.startsWith('custom_')) {
        const idx = parseInt(idOrName.replace('custom_', ''), 10);
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(CUSTOM_MATERIALS_KEY);
            if (raw) {
              const list = JSON.parse(raw);
              return list[idx];
            }
          }
        } catch (_) {}
      }
      if (typeof EsenhoRegistry !== 'undefined' && typeof EsenhoRegistry.get === 'function') {
        const res = EsenhoRegistry.get('material', idOrName);
        if (res) return res;
      }
      return BUILTIN_MATERIALS.find(m => m.id === idOrName || m.name === idOrName) || null;
    }

    renderMaterialPresetsList() {
      this.populateMaterialPresetsSelect();
    }

    populatePalettesSelect() {
      if (!this.dom.palSelect || typeof document === 'undefined' || typeof this.dom.palSelect.appendChild !== 'function') return;
      const curVal = this.dom.palSelect.value || PaletteManager.activePaletteId || 'gruvbox';
      this.dom.palSelect.innerHTML = '';

      // 1. Live Document Colors
      const optDoc = document.createElement('option');
      optDoc.value = 'document';
      optDoc.textContent = '📄 Document Colors (Live)';
      this.dom.palSelect.appendChild(optDoc);

      // 2. Palettes
      const allPalettes = PaletteManager.getAllPalettes();
      const grpBuiltIn = document.createElement('optgroup');
      grpBuiltIn.label = 'Built-in Presets';
      const grpCustom = document.createElement('optgroup');
      grpCustom.label = 'Custom & User Palettes';

      allPalettes.forEach(pal => {
        const opt = document.createElement('option');
        opt.value = pal.id;
        opt.textContent = `${pal.name} (${pal.colors ? pal.colors.length : 0})`;
        if (pal.isBuiltIn && pal.id !== 'custom') {
          grpBuiltIn.appendChild(opt);
        } else {
          grpCustom.appendChild(opt);
        }
      });

      if (grpCustom.children && grpCustom.children.length > 0) {
        this.dom.palSelect.appendChild(grpCustom);
      }
      if (grpBuiltIn.children && grpBuiltIn.children.length > 0) {
        this.dom.palSelect.appendChild(grpBuiltIn);
      }

      if (curVal) {
        this.dom.palSelect.value = curVal;
      }
    }

    renderPalettes() {
      if (typeof document === 'undefined') return;
      this.populatePalettesSelect();
      const grid = this.dom.swatchesGrid;
      if (!grid) return;
      const palType = this.dom.palSelect?.value || PaletteManager.activePaletteId || 'gruvbox';
      PaletteManager.activePaletteId = palType;

      let colors = [];
      let currentPal = null;

      if (palType === 'document') {
        colors = this.extractDocumentColors();
      } else if (palType === 'custom') {
        colors = getCustomSwatches();
        currentPal = PaletteManager.getPalette('custom');
        if (currentPal) currentPal.colors = colors;
      } else {
        currentPal = PaletteManager.getPalette(palType);
        if (currentPal) {
          colors = currentPal.colors;
        } else if (DEFAULT_FACTORY_PALETTES[palType]) {
          colors = DEFAULT_FACTORY_PALETTES[palType].colors;
        }
      }

      grid.innerHTML = '';

      if (!colors || colors.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.style.cssText = 'grid-column: 1 / -1; padding: 12px; text-align: center; color: var(--text-dim, #a89984); font-size: 10px; font-style: italic; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center;';
        if (palType === 'document') {
          emptyEl.innerHTML = '<span>No colors found in document objects.</span>';
        } else {
          emptyEl.innerHTML = `<span>Palette "${currentPal ? currentPal.name : palType}" is empty.</span>
            <button type="button" class="cs-btn-mini" style="font-size: 10px; padding: 2px 8px;">+ Add Current Color</button>`;
          emptyEl.querySelector('button')?.addEventListener('click', () => {
            PaletteManager.addColor(palType, this.currentHex);
            this.renderPalettes();
          });
        }
        grid.appendChild(emptyEl);
        return;
      }

      colors.forEach((hex, idx) => {
        const colorStr = (typeof hex === 'object' && hex !== null)
          ? (hex.hex || hex.color || hex.value || '#ffffff')
          : String(hex || '#ffffff').trim();

        if (!colorStr || colorStr === '[object Object]') return;

        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'cs-swatch-item';
        swatch.style.setProperty('background', colorStr, 'important');
        swatch.style.setProperty('background-color', colorStr, 'important');
        swatch.style.setProperty('background-image', 'none', 'important');
        swatch.title = `${colorStr} (Click to apply, right-click for options)`;
        if (this.currentHex && this.currentHex.toLowerCase() === colorStr.toLowerCase()) {
          swatch.style.borderColor = '#fabd2f';
          swatch.style.outline = '1px solid #fabd2f';
        }

        // Left click: set active color
        swatch.addEventListener('click', () => {
          this.setColorFromExternal(colorStr);
          this.applyToSelected(true);
          this.renderPalettes();
        });

        // Double click: prompt edit
        swatch.addEventListener('dblclick', (e) => {
          e.preventDefault();
          this.promptEditSwatchColor(palType, idx, colorStr);
        });

        // Context menu (right-click)
        swatch.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showSwatchContextMenu(e.clientX, e.clientY, palType, idx, colorStr);
        });

        grid.appendChild(swatch);
      });
    }

    showSwatchContextMenu(x, y, palId, swatchIdx, currentColor) {
      this.closeAnyPopup();
      if (typeof document === 'undefined') return;
      const popup = document.createElement('div');
      popup.className = 'cs-menu-popup';
      popup.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000; background: var(--bg-panel, #282828); border: 1px solid var(--border, #504945); border-radius: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.6); padding: 4px 0; min-width: 170px; font-size: 11px; font-family: var(--font-main, sans-serif); color: var(--text-bright, #ebdbb2);`;

      const createItem = (label, icon, onClick, isDanger = false) => {
        const item = document.createElement('div');
        item.className = 'cs-menu-popup-item';
        item.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 5px 10px; cursor: pointer; color: ${isDanger ? '#fb4934' : 'inherit'}; user-select: none; transition: background 0.08s;`;
        item.innerHTML = `<span style="width: 14px; text-align: center; opacity: 0.8;">${icon}</span><span>${label}</span>`;
        item.addEventListener('mouseenter', () => { item.style.background = isDanger ? 'rgba(251,73,52,0.15)' : 'var(--bg-hover, #3c3836)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeAnyPopup();
          onClick();
        });
        popup.appendChild(item);
      };

      const createDivider = () => {
        const div = document.createElement('div');
        div.style.cssText = 'height: 1px; background: var(--border, #3c3836); margin: 3px 0;';
        popup.appendChild(div);
      };

      createItem('Apply Color', '🎨', () => {
        this.setColorFromExternal(currentColor);
        this.applyToSelected(true);
      });

      createItem(`Replace with Active (${this.currentHex})`, '🔄', () => {
        if (palId === 'document') {
          PaletteManager.addColor('custom', this.currentHex);
          if (this.dom.palSelect) this.dom.palSelect.value = 'custom';
        } else {
          PaletteManager.editColor(palId, swatchIdx, this.currentHex);
        }
        this.renderPalettes();
      });

      createItem('Edit Color...', '✏️', () => {
        this.promptEditSwatchColor(palId, swatchIdx, currentColor);
      });

      createDivider();

      if (palId !== 'document') {
        createItem('Move Left', '←', () => {
          PaletteManager.moveColor(palId, swatchIdx, Math.max(0, swatchIdx - 1));
          this.renderPalettes();
        });

        createItem('Move Right', '→', () => {
          PaletteManager.moveColor(palId, swatchIdx, swatchIdx + 1);
          this.renderPalettes();
        });

        createDivider();

        createItem('Delete Swatch', '🗑️', () => {
          PaletteManager.removeColor(palId, swatchIdx);
          this.renderPalettes();
        }, true);
      }

      document.body.appendChild(popup);
      this._activePopup = popup;

      if (typeof window !== 'undefined') {
        const rect = popup.getBoundingClientRect ? popup.getBoundingClientRect() : null;
        if (rect && rect.right > window.innerWidth) popup.style.left = `${window.innerWidth - rect.width - 8}px`;
        if (rect && rect.bottom > window.innerHeight) popup.style.top = `${window.innerHeight - rect.height - 8}px`;

        const closeHandler = (e) => {
          if (!popup.contains(e.target)) {
            this.closeAnyPopup();
            window.removeEventListener('pointerdown', closeHandler);
          }
        };
        setTimeout(() => window.addEventListener('pointerdown', closeHandler), 10);
      }
    }

    showPaletteMenu(buttonEl) {
      this.closeAnyPopup();
      if (typeof document === 'undefined') return;
      const rect = buttonEl && buttonEl.getBoundingClientRect ? buttonEl.getBoundingClientRect() : { left: 100, bottom: 100, top: 80, height: 20 };
      const popup = document.createElement('div');
      popup.className = 'cs-menu-popup';
      popup.style.cssText = `position: fixed; left: ${Math.max(8, (rect.left || 100) - 120)}px; top: ${(rect.bottom || 100) + 4}px; z-index: 10000; background: var(--bg-panel, #282828); border: 1px solid var(--border, #504945); border-radius: 4px; box-shadow: 0 4px 20px rgba(0,0,0,0.65); padding: 4px 0; min-width: 190px; font-size: 11px; font-family: var(--font-main, sans-serif); color: var(--text-bright, #ebdbb2);`;

      const palId = this.dom.palSelect?.value || PaletteManager.activePaletteId || 'gruvbox';
      const pal = PaletteManager.getPalette(palId);
      const isDoc = palId === 'document';

      const createItem = (label, icon, onClick, isDanger = false) => {
        const item = document.createElement('div');
        item.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 5px 10px; cursor: pointer; color: ${isDanger ? '#fb4934' : 'inherit'}; user-select: none; transition: background 0.08s;`;
        item.innerHTML = `<span style="width: 14px; text-align: center; opacity: 0.85;">${icon}</span><span>${label}</span>`;
        item.addEventListener('mouseenter', () => { item.style.background = isDanger ? 'rgba(251,73,52,0.15)' : 'var(--bg-hover, #3c3836)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeAnyPopup();
          onClick();
        });
        popup.appendChild(item);
      };

      const createDivider = () => {
        const div = document.createElement('div');
        div.style.cssText = 'height: 1px; background: var(--border, #3c3836); margin: 3px 0;';
        popup.appendChild(div);
      };

      createItem('New Palette...', '★', () => this.promptCreatePalette());
      createItem('Clone / Duplicate Palette', '📑', () => {
        const cloned = PaletteManager.clonePalette(palId);
        if (cloned) {
          if (this.dom.palSelect) this.dom.palSelect.value = cloned.id;
          this.renderPalettes();
          if (typeof showNotification === 'function') showNotification(`Palette "${cloned.name}" created!`);
        }
      });

      if (!isDoc && pal) {
        createItem(`Rename "${pal.name}"...`, '✏️', () => this.promptRenamePalette(palId));
      }

      createDivider();

      createItem(`Add Active Color (${this.currentHex})`, '➕', () => {
        const targetId = isDoc ? 'custom' : palId;
        PaletteManager.addColor(targetId, this.currentHex);
        if (isDoc && this.dom.palSelect) this.dom.palSelect.value = 'custom';
        this.renderPalettes();
        if (typeof showNotification === 'function') showNotification(`Color ${this.currentHex} added to palette!`);
      });

      createItem('Extract Colors from Document', '📄', () => {
        const extracted = this.extractDocumentColors();
        const targetId = isDoc ? 'custom' : palId;
        if (extracted.length === 0) {
          if (typeof showNotification === 'function') showNotification('No colors found in document objects.');
          return;
        }
        let added = 0;
        const currentColors = new Set((PaletteManager.getPalette(targetId)?.colors || []).map(c => c.toLowerCase()));
        extracted.forEach(col => {
          if (!currentColors.has(col.toLowerCase())) {
            PaletteManager.addColor(targetId, col);
            added++;
          }
        });
        if (isDoc && this.dom.palSelect) this.dom.palSelect.value = 'custom';
        this.renderPalettes();
        if (typeof showNotification === 'function') showNotification(`${added} unique colors extracted from document!`);
      });

      createItem('Generate Harmony Scheme...', '🌈', () => this.promptGenerateHarmony(palId));

      createDivider();

      if (!isDoc) {
        createItem('Sort by Hue', '🔀', () => { PaletteManager.sortPalette(palId, 'hue'); this.renderPalettes(); });
        createItem('Sort by Saturation', '🔀', () => { PaletteManager.sortPalette(palId, 'saturation'); this.renderPalettes(); });
        createItem('Sort by Lightness', '🔀', () => { PaletteManager.sortPalette(palId, 'lightness'); this.renderPalettes(); });
        createItem('Sort by Luminance', '🔀', () => { PaletteManager.sortPalette(palId, 'luminance'); this.renderPalettes(); });
        createItem('Reverse Swatches', '↔️', () => { PaletteManager.reversePalette(palId); this.renderPalettes(); });
        createDivider();
      }

      createItem('Import Palette File...', '📥', () => this.triggerImportPaletteFile());
      if (!isDoc) {
        createItem('Export as JSON...', '📤', () => this.exportPaletteFile(palId, 'json'));
        createItem('Export as GPL (GIMP)...', '📤', () => this.exportPaletteFile(palId, 'gpl'));
        createItem('Export as Hex List...', '📤', () => this.exportPaletteFile(palId, 'hex'));
        createDivider();
      }

      if (!isDoc && pal) {
        createItem('Clear All Swatches', '🗑️', () => {
          if (typeof window !== 'undefined' && window.confirm && !window.confirm(`Clear all swatches in palette "${pal.name}"?`)) return;
          PaletteManager.clearPalette(palId);
          this.renderPalettes();
        });

        createItem('Delete Palette', '❌', () => {
          if (typeof window !== 'undefined' && window.confirm && !window.confirm(`Delete palette "${pal.name}"?`)) return;
          PaletteManager.deletePalette(palId);
          this.renderPalettes();
          if (typeof showNotification === 'function') showNotification(`Palette "${pal.name}" deleted.`);
        }, true);
      }

      createItem('Restore Factory Defaults', '🔄', () => {
        if (typeof window !== 'undefined' && window.confirm && !window.confirm('Restore all default palettes to factory swatches?')) return;
        PaletteManager.resetAllToFactory();
        this.renderPalettes();
        if (typeof showNotification === 'function') showNotification('Palettes reset to factory defaults.');
      });

      document.body.appendChild(popup);
      this._activePopup = popup;

      if (typeof window !== 'undefined') {
        const pRect = popup.getBoundingClientRect ? popup.getBoundingClientRect() : null;
        if (pRect && pRect.right > window.innerWidth) popup.style.left = `${window.innerWidth - pRect.width - 8}px`;
        if (pRect && pRect.bottom > window.innerHeight) popup.style.top = `${(rect.top || 80) - pRect.height - 4}px`;

        const closeHandler = (e) => {
          if (!popup.contains(e.target) && (!buttonEl || !buttonEl.contains(e.target))) {
            this.closeAnyPopup();
            window.removeEventListener('pointerdown', closeHandler);
          }
        };
        setTimeout(() => window.addEventListener('pointerdown', closeHandler), 10);
      }
    }

    promptEditSwatchColor(palId, idx, initialColor) {
      if (palId === 'document') {
        if (typeof showNotification === 'function') showNotification('Cannot edit live document color directly.');
        return;
      }
      const val = typeof window !== 'undefined' && window.prompt
        ? window.prompt(`Edit color for swatch #${idx + 1} (HEX):`, initialColor)
        : null;
      if (val) {
        let clean = val.trim();
        if (!clean.startsWith('#')) clean = '#' + clean;
        if (/^#[0-9A-Fa-f]{3,8}$/.test(clean)) {
          PaletteManager.editColor(palId, idx, clean);
          this.renderPalettes();
        } else {
          if (typeof showNotification === 'function') showNotification('Invalid HEX color code.');
        }
      }
    }

    promptCreatePalette() {
      const name = typeof window !== 'undefined' && window.prompt
        ? window.prompt('Enter name for new Palette:', 'My Palette')
        : 'New Palette';
      if (!name || !name.trim()) return;
      const created = PaletteManager.createPalette(name.trim(), [this.currentHex || '#fabd2f']);
      if (this.dom.palSelect) this.dom.palSelect.value = created.id;
      this.renderPalettes();
      if (typeof showNotification === 'function') showNotification(`Palette "${created.name}" created!`);
    }

    promptRenamePalette(palId) {
      const pal = PaletteManager.getPalette(palId);
      if (!pal) return;
      const newName = typeof window !== 'undefined' && window.prompt
        ? window.prompt(`Rename palette "${pal.name}":`, pal.name)
        : null;
      if (newName && newName.trim()) {
        PaletteManager.renamePalette(palId, newName.trim());
        this.renderPalettes();
        if (typeof showNotification === 'function') showNotification(`Palette renamed to "${newName.trim()}".`);
      }
    }

    promptGenerateHarmony(palId) {
      const chosen = typeof window !== 'undefined' && window.prompt
        ? window.prompt(`Choose Color Harmony type based on ${this.currentHex}:\n1 = Analogous\n2 = Complementary\n3 = Split-Complementary\n4 = Triadic\n5 = Tetradic\n6 = Monochromatic`, '1')
        : '1';

      if (!chosen) return;
      const map = { '1': 'analogous', '2': 'complementary', '3': 'split_complementary', '4': 'triadic', '5': 'tetradic', '6': 'monochromatic' };
      const type = map[chosen.trim()] || 'analogous';
      const colors = PaletteManager.generateHarmony(this.currentHex, type);

      const targetId = palId === 'document' ? 'custom' : palId;
      colors.forEach(c => PaletteManager.addColor(targetId, c));
      if (palId === 'document' && this.dom.palSelect) this.dom.palSelect.value = 'custom';
      this.renderPalettes();
      if (typeof showNotification === 'function') showNotification(`${colors.length} ${type} colors added to palette!`);
    }

    triggerImportPaletteFile() {
      if (typeof document === 'undefined') return;
      let input = document.getElementById('cs-palette-file-importer');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'cs-palette-file-importer';
        input.accept = '.json,.gpl,.hex,.txt,.ase';
        input.style.display = 'none';
        document.body.appendChild(input);
      }
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = evt.target.result;
          const created = PaletteManager.importPalette(content);
          if (created) {
            if (this.dom.palSelect) this.dom.palSelect.value = created.id;
            this.renderPalettes();
            if (typeof showNotification === 'function') showNotification(`Imported palette "${created.name}" with ${created.colors.length} colors!`);
          } else {
            if (typeof showNotification === 'function') showNotification('Could not parse palette file.');
          }
        };
        reader.readAsText(file);
        input.value = '';
      };
      input.click();
    }

    exportPaletteFile(palId, format = 'json') {
      const pal = PaletteManager.getPalette(palId);
      if (!pal) return;
      const data = PaletteManager.exportPalette(palId, format);
      if (!data) return;

      const ext = format === 'gpl' ? 'gpl' : (format === 'hex' ? 'hex.txt' : 'json');
      const mime = format === 'json' ? 'application/json' : 'text/plain';
      if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pal.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_')}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof showNotification === 'function') showNotification(`Palette "${pal.name}" exported!`);
      }
    }

    closeAnyPopup() {
      if (this._activePopup && this._activePopup.parentNode) {
        this._activePopup.parentNode.removeChild(this._activePopup);
      }
      this._activePopup = null;
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

    // ── Brush Fill Application & Management ──

    updateBrushFillUI() {
      this.updateBrushFillPatternVisibility();
      this.populateBrushSelects();
      this.populateBrushFillPaletteSelect();
      this.syncBrushFillInputs();
      this.renderBrushPool();
      this.renderBrushFillPalette();
    }

    updateBrushFillPatternVisibility() {
      const d = this.dom;
      const pattern = d.bfPattern ? d.bfPattern.value : 'linear';
      if (d.bfRowAngle2) {
        d.bfRowAngle2.style.display = (pattern === 'crosshatch' || pattern === 'triple_hatch') ? 'flex' : 'none';
      }
      if (d.bfRowAngle3) {
        d.bfRowAngle3.style.display = (pattern === 'triple_hatch') ? 'flex' : 'none';
      }
      if (d.bfRowWaveFreq) {
        d.bfRowWaveFreq.style.display = (pattern === 'wave' || pattern === 'zigzag' || pattern === 'flow_field') ? 'flex' : 'none';
      }
      if (d.bfRowWaveAmp) {
        d.bfRowWaveAmp.style.display = (pattern === 'wave' || pattern === 'zigzag') ? 'flex' : 'none';
      }
      if (d.bfRowOriginX) {
        d.bfRowOriginX.style.display = (pattern === 'radial' || pattern === 'concentric' || pattern === 'spiral' || pattern === 'cross_contour') ? 'flex' : 'none';
      }
      if (d.bfRowOriginY) {
        d.bfRowOriginY.style.display = (pattern === 'radial' || pattern === 'concentric' || pattern === 'spiral' || pattern === 'cross_contour') ? 'flex' : 'none';
      }
    }

    populateBrushSelects() {
      if (typeof document === 'undefined') return;
      const addSel = this.dom.bfBrushAddSelect;
      if (!addSel) return;

      let allPresets = {};
      if (typeof BrushFillEngine !== 'undefined' && typeof BrushFillEngine.getNativeBrushPresets === 'function') {
        allPresets = BrushFillEngine.getNativeBrushPresets();
      } else if (typeof BRUSH_PRESETS !== 'undefined') {
        allPresets = { ...BRUSH_PRESETS };
      } else if (typeof window !== 'undefined' && window.BRUSH_PRESETS) {
        allPresets = { ...window.BRUSH_PRESETS };
      } else if (typeof globalThis !== 'undefined' && globalThis.BRUSH_PRESETS) {
        allPresets = { ...globalThis.BRUSH_PRESETS };
      }

      if (!allPresets || Object.keys(allPresets).length === 0) {
        allPresets = {
          pencil: { name: 'HB Pencil', category: 'sketch' },
          soft_pencil: { name: '6B Graphite', category: 'sketch' },
          tech_pen: { name: 'Technical Pen', category: 'sketch' },
          gpen: { name: 'Manga G-Pen', category: 'ink' },
          inker: { name: 'Studio Inker', category: 'ink' },
          dry_ink: { name: 'Dry Ink', category: 'ink' },
          fountain: { name: 'Calligraphy Chisel', category: 'ink' },
          marker: { name: 'Art Marker', category: 'marker' },
          oil: { name: 'Oil Impasto', category: 'paint' },
          acrylic: { name: 'Wet Acrylic', category: 'paint' },
          watercolor: { name: 'Watercolor', category: 'paint' },
          charcoal: { name: 'Charcoal', category: 'charcoal' },
          soft_pastel: { name: 'Soft Pastel', category: 'charcoal' },
          spray: { name: 'Spray Can', category: 'airbrush' }
        };
      }

      const categoryLabels = {
        sketch: 'Sketch & Pencils',
        ink: 'Inkers & Line Art',
        marker: 'Markers & Lettering',
        paint: 'Wet Media & Paint',
        charcoal: 'Dry Media & Charcoal',
        airbrush: 'Airbrush & Spray',
        special: 'Special FX',
        custom: 'Custom Brushes'
      };

      const grouped = {};
      Object.entries(allPresets).forEach(([key, preset]) => {
        const cat = preset.category || 'sketch';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ key, name: preset.name || key, desc: preset.desc || '' });
      });

      const fragment = document.createDocumentFragment();
      Object.entries(grouped).forEach(([catKey, brushes]) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = categoryLabels[catKey] || catKey;
        brushes.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.key;
          opt.textContent = b.name;
          optgroup.appendChild(opt);
        });
        fragment.appendChild(optgroup);
      });

      addSel.innerHTML = '';
      addSel.appendChild(fragment);
      if (addSel.options.length > 0 && !addSel.value) {
        addSel.selectedIndex = 0;
      }
    }

    renderBrushPool() {
      if (typeof document === 'undefined' || !this.dom.bfBrushPoolContainer) return;
      const container = this.dom.bfBrushPoolContainer;
      container.innerHTML = '';

      let brushes = [];
      if (Array.isArray(this.brushFillConfig.brushes) && this.brushFillConfig.brushes.length > 0) {
        brushes = this.brushFillConfig.brushes;
      } else if (Array.isArray(this.brushFillConfig.brushList) && this.brushFillConfig.brushList.length > 0) {
        brushes = this.brushFillConfig.brushList;
      } else if (this.brushFillConfig.brush) {
        brushes = [this.brushFillConfig.brush];
        if (this.brushFillConfig.brushSecondary) brushes.push(this.brushFillConfig.brushSecondary);
      } else {
        brushes = ['pencil'];
      }
      this.brushFillConfig.brushes = brushes;
      this.brushFillConfig.brushList = brushes;
      this.brushFillConfig.brush = brushes[0];
      this.brushFillConfig.brushSecondary = brushes[1] || '';

      if (this.dom.bfBrushCountLabel) {
        this.dom.bfBrushCountLabel.textContent = `${brushes.length} ${brushes.length === 1 ? 'brush' : 'brushes'}`;
      }

      let allPresets = {};
      if (typeof BrushFillEngine !== 'undefined' && typeof BrushFillEngine.getNativeBrushPresets === 'function') {
        allPresets = BrushFillEngine.getNativeBrushPresets();
      } else if (typeof BRUSH_PRESETS !== 'undefined') {
        allPresets = { ...BRUSH_PRESETS };
      } else if (typeof window !== 'undefined' && window.BRUSH_PRESETS) {
        allPresets = { ...window.BRUSH_PRESETS };
      }

      brushes.forEach((brushKey, idx) => {
        const preset = allPresets[brushKey] || allPresets[brushKey?.toLowerCase()] || {};
        const tag = document.createElement('div');
        tag.className = 'cs-bf-brush-tag';

        const num = document.createElement('span');
        num.className = 'cs-bf-brush-num';
        num.textContent = `${idx + 1}.`;
        tag.appendChild(num);

        const name = document.createElement('span');
        name.className = 'cs-bf-brush-name';
        name.textContent = preset.name || brushKey;
        name.title = `${idx + 1}. ${preset.name || brushKey} (${brushKey})`;
        tag.appendChild(name);

        if (brushes.length > 1) {
          const delBtn = document.createElement('span');
          delBtn.className = 'cs-bf-brush-del';
          delBtn.textContent = '×';
          delBtn.title = `Remove ${preset.name || brushKey} from pool`;
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.brushFillConfig.brushes.splice(idx, 1);
            this.brushFillConfig.brushList = [...this.brushFillConfig.brushes];
            this.brushFillConfig.brush = this.brushFillConfig.brushes[0] || 'pencil';
            this.brushFillConfig.brushSecondary = this.brushFillConfig.brushes[1] || '';
            this.renderBrushPool();
            this.applyBrushFillToSelected(true);
          });
          tag.appendChild(delBtn);
        }

        container.appendChild(tag);
      });
    }

    populateBrushFillPaletteSelect() {
      if (!this.dom.bfPaletteSelect || typeof document === 'undefined') return;
      const curVal = this.dom.bfPaletteSelect.value || this.brushFillConfig.colorPaletteId || PaletteManager.activePaletteId || 'gruvbox';
      this.dom.bfPaletteSelect.innerHTML = '';

      // 1. Live Document Colors
      const optDoc = document.createElement('option');
      optDoc.value = 'document';
      optDoc.textContent = 'Document Colors (Live)';
      this.dom.bfPaletteSelect.appendChild(optDoc);

      // 2. Custom & Built-in optgroups
      const allPalettes = PaletteManager.getAllPalettes();
      const grpCustom = document.createElement('optgroup');
      grpCustom.label = 'Custom & User Palettes';
      const grpBuiltIn = document.createElement('optgroup');
      grpBuiltIn.label = 'Built-in Presets';

      allPalettes.forEach(pal => {
        const opt = document.createElement('option');
        opt.value = pal.id;
        opt.textContent = `${pal.name} (${pal.colors ? pal.colors.length : 0})`;
        if (pal.isBuiltIn && pal.id !== 'custom') {
          grpBuiltIn.appendChild(opt);
        } else {
          grpCustom.appendChild(opt);
        }
      });

      if (grpCustom.children && grpCustom.children.length > 0) {
        this.dom.bfPaletteSelect.appendChild(grpCustom);
      }
      if (grpBuiltIn.children && grpBuiltIn.children.length > 0) {
        this.dom.bfPaletteSelect.appendChild(grpBuiltIn);
      }

      if (curVal && Array.from(this.dom.bfPaletteSelect.options).some(o => o.value === curVal)) {
        this.dom.bfPaletteSelect.value = curVal;
      }
    }

    getBrushFillConfigFromInputs() {
      const d = this.dom;
      const brushes = (Array.isArray(this.brushFillConfig.brushes) && this.brushFillConfig.brushes.length > 0)
        ? [...this.brushFillConfig.brushes]
        : [this.brushFillConfig.brush || 'pencil'];
      const brushPrimary = brushes[0] || 'pencil';
      const brushSecondary = brushes[1] || '';

      return {
        enabled: d.bfEnabled ? d.bfEnabled.checked : true,
        pattern: d.bfPattern ? d.bfPattern.value : 'linear',
        strokeDirection: d.bfStrokeDirection ? d.bfStrokeDirection.value : 'bidirectional',
        spacing: d.bfSpacing ? Number(d.bfSpacing.value) || 8 : 8,
        spacingJitter: d.bfSpacingJitter ? Number(d.bfSpacingJitter.value) || 0 : 0,
        angle: d.bfAngle ? Number(d.bfAngle.value) || 0 : 45,
        lineAngleJitter: d.bfLineAngleJitter ? Number(d.bfLineAngleJitter.value) || 0 : 0,
        angle2: d.bfAngle2 ? Number(d.bfAngle2.value) || 0 : 135,
        angle3: d.bfAngle3 ? Number(d.bfAngle3.value) || 0 : 90,
        waveFrequency: d.bfWaveFreq ? Number(d.bfWaveFreq.value) || 8 : 8,
        waveAmplitude: d.bfWaveAmp ? Number(d.bfWaveAmp.value) || 50 : 50,
        originX: d.bfOriginX ? Number(d.bfOriginX.value) || 50 : 50,
        originY: d.bfOriginY ? Number(d.bfOriginY.value) || 50 : 50,
        meshPhase: d.bfMeshPhase ? Number(d.bfMeshPhase.value) || 0 : 0,
        strokesPerLine: d.bfStrokesPerLine ? Number(d.bfStrokesPerLine.value) || 1 : 1,
        strokeLength: d.bfStrokeLength ? Number(d.bfStrokeLength.value) || 0 : 0,
        strokeGap: d.bfStrokeGap ? Number(d.bfStrokeGap.value) || 0 : 4,
        strokeOverlap: d.bfStrokeOverlap ? Number(d.bfStrokeOverlap.value) || 0 : 0,
        gapJitter: d.bfGapJitter ? Number(d.bfGapJitter.value) || 0 : 0,
        brush: brushPrimary,
        brushSecondary: brushSecondary,
        brushes: brushes,
        brushList: brushes,
        brushPickMode: d.bfBrushPickMode ? d.bfBrushPickMode.value : 'cycle',
        colorMode: d.bfColorMode ? d.bfColorMode.value : 'palette',
        colorPaletteId: d.bfPaletteSelect ? d.bfPaletteSelect.value : (this.brushFillConfig.colorPaletteId || 'gruvbox'),
        colorPalette: (this.brushFillConfig.colorPalette && this.brushFillConfig.colorPalette.length > 0) ? [...this.brushFillConfig.colorPalette] : ['#fabd2f'],
        colorPickMode: d.bfColorPickMode ? d.bfColorPickMode.value : 'cycle',
        hueJitter: d.bfHueJitter ? Number(d.bfHueJitter.value) || 0 : 0,
        satJitter: d.bfSatJitter ? Number(d.bfSatJitter.value) || 0 : 0,
        lightnessJitter: d.bfLightnessJitter ? Number(d.bfLightnessJitter.value) || 0 : 0,
        strokeWidth: d.bfStrokeWidth ? Number(d.bfStrokeWidth.value) || 2 : 2,
        strokeOpacity: d.bfStrokeOpacity ? Number(d.bfStrokeOpacity.value) || 0.9 : 0.9,
        flow: d.bfFlow ? Number(d.bfFlow.value) || 100 : 100,
        hardness: d.bfHardness ? Number(d.bfHardness.value) || 95 : 95,
        curvature: d.bfCurvature ? Number(d.bfCurvature.value) || 0 : 0,
        curvatureMode: d.bfCurvatureMode ? d.bfCurvatureMode.value : 'uniform',
        wobble: d.bfWobble ? Number(d.bfWobble.value) || 0 : 0,
        angleJitter: d.bfAngleJitter ? Number(d.bfAngleJitter.value) || 0 : 0,
        lengthJitter: d.bfLengthJitter ? Number(d.bfLengthJitter.value) || 0 : 0,
        widthJitter: d.bfWidthJitter ? Number(d.bfWidthJitter.value) || 0 : 0,
        opacityJitter: d.bfOpacityJitter ? Number(d.bfOpacityJitter.value) || 0 : 0,
        positionJitter: d.bfPositionJitter ? Number(d.bfPositionJitter.value) || 0 : 0,
        curvatureJitter: d.bfCurvatureJitter ? Number(d.bfCurvatureJitter.value) || 0 : 0,
        colorJitter: d.bfColorJitter ? Number(d.bfColorJitter.value) || 0 : 0,
        clipMode: d.bfClipMode ? d.bfClipMode.value : 'bleed',
        bleedDistance: d.bfBleedDistance ? Number(d.bfBleedDistance.value) || 0 : 0,
        bleedJitter: d.bfBleedJitter ? Number(d.bfBleedJitter.value) || 0 : 50,
        bleedProbability: d.bfBleedProbability ? Number(d.bfBleedProbability.value) || 0 : 100,
        seed: this.brushFillConfig.seed || 42
      };
    }

    syncBrushFillInputs() {
      const d = this.dom;
      const c = this.brushFillConfig || DEFAULT_BRUSH_FILL_CONFIG;

      if (d.bfEnabled) d.bfEnabled.checked = (c.enabled !== undefined ? c.enabled : true);
      if (d.bfPattern) d.bfPattern.value = c.pattern || 'linear';
      if (d.bfStrokeDirection) d.bfStrokeDirection.value = c.strokeDirection || 'bidirectional';
      if (d.bfSpacing) d.bfSpacing.value = c.spacing !== undefined ? c.spacing : 8;
      if (d.bfSpacingSlider) d.bfSpacingSlider.value = c.spacing !== undefined ? c.spacing : 8;
      if (d.bfSpacingJitter) d.bfSpacingJitter.value = c.spacingJitter !== undefined ? c.spacingJitter : 0;
      if (d.bfSpacingJitterSlider) d.bfSpacingJitterSlider.value = c.spacingJitter !== undefined ? c.spacingJitter : 0;
      if (d.bfAngle) d.bfAngle.value = c.angle !== undefined ? c.angle : 45;
      if (d.bfAngleSlider) d.bfAngleSlider.value = c.angle !== undefined ? c.angle : 45;
      if (d.bfLineAngleJitter) d.bfLineAngleJitter.value = c.lineAngleJitter !== undefined ? c.lineAngleJitter : 0;
      if (d.bfLineAngleJitterSlider) d.bfLineAngleJitterSlider.value = c.lineAngleJitter !== undefined ? c.lineAngleJitter : 0;
      if (d.bfAngle2) d.bfAngle2.value = c.angle2 !== undefined ? c.angle2 : 135;
      if (d.bfAngle2Slider) d.bfAngle2Slider.value = c.angle2 !== undefined ? c.angle2 : 135;
      if (d.bfAngle3) d.bfAngle3.value = c.angle3 !== undefined ? c.angle3 : 90;
      if (d.bfAngle3Slider) d.bfAngle3Slider.value = c.angle3 !== undefined ? c.angle3 : 90;

      if (d.bfWaveFreq) d.bfWaveFreq.value = c.waveFrequency !== undefined ? c.waveFrequency : 8;
      if (d.bfWaveFreqSlider) d.bfWaveFreqSlider.value = c.waveFrequency !== undefined ? c.waveFrequency : 8;
      if (d.bfWaveAmp) d.bfWaveAmp.value = c.waveAmplitude !== undefined ? c.waveAmplitude : 50;
      if (d.bfWaveAmpSlider) d.bfWaveAmpSlider.value = c.waveAmplitude !== undefined ? c.waveAmplitude : 50;
      if (d.bfOriginX) d.bfOriginX.value = c.originX !== undefined ? c.originX : 50;
      if (d.bfOriginXSlider) d.bfOriginXSlider.value = c.originX !== undefined ? c.originX : 50;
      if (d.bfOriginY) d.bfOriginY.value = c.originY !== undefined ? c.originY : 50;
      if (d.bfOriginYSlider) d.bfOriginYSlider.value = c.originY !== undefined ? c.originY : 50;
      if (d.bfMeshPhase) d.bfMeshPhase.value = c.meshPhase !== undefined ? c.meshPhase : 0;
      if (d.bfMeshPhaseSlider) d.bfMeshPhaseSlider.value = c.meshPhase !== undefined ? c.meshPhase : 0;

      if (d.bfStrokesPerLine) d.bfStrokesPerLine.value = c.strokesPerLine !== undefined ? c.strokesPerLine : 1;
      if (d.bfStrokesPerLineSlider) d.bfStrokesPerLineSlider.value = c.strokesPerLine !== undefined ? c.strokesPerLine : 1;
      if (d.bfStrokeLength) d.bfStrokeLength.value = c.strokeLength !== undefined ? c.strokeLength : 0;
      if (d.bfStrokeLengthSlider) d.bfStrokeLengthSlider.value = c.strokeLength !== undefined ? c.strokeLength : 0;
      if (d.bfStrokeGap) d.bfStrokeGap.value = c.strokeGap !== undefined ? c.strokeGap : 4;
      if (d.bfStrokeGapSlider) d.bfStrokeGapSlider.value = c.strokeGap !== undefined ? c.strokeGap : 4;
      if (d.bfStrokeOverlap) d.bfStrokeOverlap.value = c.strokeOverlap !== undefined ? c.strokeOverlap : 0;
      if (d.bfStrokeOverlapSlider) d.bfStrokeOverlapSlider.value = c.strokeOverlap !== undefined ? c.strokeOverlap : 0;
      if (d.bfGapJitter) d.bfGapJitter.value = c.gapJitter !== undefined ? c.gapJitter : 0;
      if (d.bfGapJitterSlider) d.bfGapJitterSlider.value = c.gapJitter !== undefined ? c.gapJitter : 0;

      const brushes = Array.isArray(c.brushes) && c.brushes.length > 0
        ? [...c.brushes]
        : (Array.isArray(c.brushList) && c.brushList.length > 0
          ? [...c.brushList]
          : [c.brush || 'pencil']);
      this.brushFillConfig.brushes = brushes;
      this.brushFillConfig.brushList = brushes;
      this.brushFillConfig.brush = brushes[0] || 'pencil';
      this.brushFillConfig.brushSecondary = brushes[1] || '';

      if (d.bfBrushPickMode) d.bfBrushPickMode.value = c.brushPickMode || 'cycle';

      this.populateBrushFillPaletteSelect();
      if (d.bfPaletteSelect && c.colorPaletteId) {
        d.bfPaletteSelect.value = c.colorPaletteId;
      }

      if (d.bfColorMode) d.bfColorMode.value = c.colorMode || 'palette';
      if (d.bfColorPickMode) d.bfColorPickMode.value = c.colorPickMode || 'cycle';
      if (d.bfHueJitter) d.bfHueJitter.value = c.hueJitter !== undefined ? c.hueJitter : 0;
      if (d.bfHueJitterSlider) d.bfHueJitterSlider.value = c.hueJitter !== undefined ? c.hueJitter : 0;
      if (d.bfSatJitter) d.bfSatJitter.value = c.satJitter !== undefined ? c.satJitter : 0;
      if (d.bfSatJitterSlider) d.bfSatJitterSlider.value = c.satJitter !== undefined ? c.satJitter : 0;
      if (d.bfLightnessJitter) d.bfLightnessJitter.value = c.lightnessJitter !== undefined ? c.lightnessJitter : 0;
      if (d.bfLightnessJitterSlider) d.bfLightnessJitterSlider.value = c.lightnessJitter !== undefined ? c.lightnessJitter : 0;

      if (d.bfStrokeWidth) d.bfStrokeWidth.value = c.strokeWidth !== undefined ? c.strokeWidth : 2;
      if (d.bfStrokeWidthSlider) d.bfStrokeWidthSlider.value = c.strokeWidth !== undefined ? c.strokeWidth : 2;
      if (d.bfStrokeOpacity) d.bfStrokeOpacity.value = c.strokeOpacity !== undefined ? c.strokeOpacity : 0.9;
      if (d.bfStrokeOpacitySlider) d.bfStrokeOpacitySlider.value = c.strokeOpacity !== undefined ? c.strokeOpacity : 0.9;
      if (d.bfFlow) d.bfFlow.value = c.flow !== undefined ? c.flow : 100;
      if (d.bfFlowSlider) d.bfFlowSlider.value = c.flow !== undefined ? c.flow : 100;
      if (d.bfHardness) d.bfHardness.value = c.hardness !== undefined ? c.hardness : 95;
      if (d.bfHardnessSlider) d.bfHardnessSlider.value = c.hardness !== undefined ? c.hardness : 95;
      if (d.bfCurvature) d.bfCurvature.value = c.curvature !== undefined ? c.curvature : 0;
      if (d.bfCurvatureSlider) d.bfCurvatureSlider.value = c.curvature !== undefined ? c.curvature : 0;
      if (d.bfCurvatureMode) d.bfCurvatureMode.value = c.curvatureMode || 'uniform';
      if (d.bfWobble) d.bfWobble.value = c.wobble !== undefined ? c.wobble : 0;
      if (d.bfWobbleSlider) d.bfWobbleSlider.value = c.wobble !== undefined ? c.wobble : 0;
      if (d.bfAngleJitter) d.bfAngleJitter.value = c.angleJitter !== undefined ? c.angleJitter : 0;
      if (d.bfAngleJitterSlider) d.bfAngleJitterSlider.value = c.angleJitter !== undefined ? c.angleJitter : 0;
      if (d.bfLengthJitter) d.bfLengthJitter.value = c.lengthJitter !== undefined ? c.lengthJitter : 0;
      if (d.bfLengthJitterSlider) d.bfLengthJitterSlider.value = c.lengthJitter !== undefined ? c.lengthJitter : 0;
      if (d.bfWidthJitter) d.bfWidthJitter.value = c.widthJitter !== undefined ? c.widthJitter : 0;
      if (d.bfWidthJitterSlider) d.bfWidthJitterSlider.value = c.widthJitter !== undefined ? c.widthJitter : 0;
      if (d.bfOpacityJitter) d.bfOpacityJitter.value = c.opacityJitter !== undefined ? c.opacityJitter : 0;
      if (d.bfOpacityJitterSlider) d.bfOpacityJitterSlider.value = c.opacityJitter !== undefined ? c.opacityJitter : 0;
      if (d.bfPositionJitter) d.bfPositionJitter.value = c.positionJitter !== undefined ? c.positionJitter : 0;
      if (d.bfPositionJitterSlider) d.bfPositionJitterSlider.value = c.positionJitter !== undefined ? c.positionJitter : 0;
      if (d.bfCurvatureJitter) d.bfCurvatureJitter.value = c.curvatureJitter !== undefined ? c.curvatureJitter : 0;
      if (d.bfCurvatureJitterSlider) d.bfCurvatureJitterSlider.value = c.curvatureJitter !== undefined ? c.curvatureJitter : 0;
      if (d.bfColorJitter) d.bfColorJitter.value = c.colorJitter !== undefined ? c.colorJitter : 0;
      if (d.bfColorJitterSlider) d.bfColorJitterSlider.value = c.colorJitter !== undefined ? c.colorJitter : 0;
      if (d.bfClipMode) d.bfClipMode.value = c.clipMode || 'bleed';
      if (d.bfBleedDistance) d.bfBleedDistance.value = c.bleedDistance !== undefined ? c.bleedDistance : 0;
      if (d.bfBleedDistanceSlider) d.bfBleedDistanceSlider.value = c.bleedDistance !== undefined ? c.bleedDistance : 0;
      if (d.bfBleedJitter) d.bfBleedJitter.value = c.bleedJitter !== undefined ? c.bleedJitter : 50;
      if (d.bfBleedJitterSlider) d.bfBleedJitterSlider.value = c.bleedJitter !== undefined ? c.bleedJitter : 50;
      if (d.bfBleedProbability) d.bfBleedProbability.value = c.bleedProbability !== undefined ? c.bleedProbability : 100;
      if (d.bfBleedProbabilitySlider) d.bfBleedProbabilitySlider.value = c.bleedProbability !== undefined ? c.bleedProbability : 100;

      this.updateBrushFillPatternVisibility();
      this.renderBrushPool();
      this.renderBrushFillPalette();
    }

    renderBrushFillPalette() {
      if (typeof document === 'undefined' || !this.dom.bfPaletteContainer) return;
      const container = this.dom.bfPaletteContainer;
      container.innerHTML = '';
      const colors = (this.brushFillConfig.colorPalette && this.brushFillConfig.colorPalette.length > 0)
        ? this.brushFillConfig.colorPalette
        : ['#fabd2f'];

      colors.forEach((col, idx) => {
        const chip = document.createElement('div');
        chip.className = 'cs-palette-chip';
        chip.style.backgroundColor = col;
        chip.title = `Color #${idx + 1}: ${col} (Click to edit, Double-click to remove)`;

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const newColor = prompt(`Edit color #${idx + 1}:`, col);
          if (newColor && /^#[0-9a-fA-F]{3,8}$/.test(newColor.trim())) {
            this.brushFillConfig.colorPalette[idx] = newColor.trim();
            this.renderBrushFillPalette();
            this.applyBrushFillToSelected(true);
          }
        });

        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (this.brushFillConfig.colorPalette.length > 1) {
            this.brushFillConfig.colorPalette.splice(idx, 1);
            this.renderBrushFillPalette();
            this.applyBrushFillToSelected(true);
          }
        });

        chip.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (this.brushFillConfig.colorPalette.length > 1) {
            this.brushFillConfig.colorPalette.splice(idx, 1);
            this.renderBrushFillPalette();
            this.applyBrushFillToSelected(true);
          }
        });

        container.appendChild(chip);
      });
    }

    applyBrushFillToSelected(commit = false) {
      if (this._isSyncing) return;
      const getDoc = () => (typeof window !== 'undefined' && window.doc) || (typeof doc !== 'undefined' ? doc : null);
      const activeDoc = getDoc();
      if (!activeDoc) return;

      const cfg = this.getBrushFillConfigFromInputs();
      this.brushFillConfig = { ...cfg };

      if (this.activeTarget === 'bg') {
        activeDoc.backgroundBrushFill = { ...cfg };
        if (cfg.enabled) {
          activeDoc.backgroundType = 'brush';
        } else if (activeDoc.backgroundType === 'brush') {
          activeDoc.backgroundType = 'solid';
        }
        if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
        if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();
        if (commit) {
          if (activeDoc.pushHistory) activeDoc.pushHistory('Change Background Brush Fill');
          if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
        }
        return;
      }

      const selected = activeDoc.getSelectedObjects ? activeDoc.getSelectedObjects() : [];
      if (selected.length === 0) {
        activeDoc.defaultBrushFill = { ...cfg };
      }

      for (const obj of selected) {
        obj.brushFill = { ...cfg };
        if (cfg.enabled) {
          obj.fillType = 'brush';
        } else if (obj.fillType === 'brush') {
          obj.fillType = 'solid';
        }
      }

      if (typeof window !== 'undefined' && typeof window.render === 'function') window.render();
      if (typeof window !== 'undefined' && typeof window.drawOverlay === 'function') window.drawOverlay();

      if (commit && selected.length > 0) {
        if (activeDoc.pushHistory) activeDoc.pushHistory('Apply Brush Fill');
        if (typeof window !== 'undefined' && typeof window.scheduleAutosave === 'function') window.scheduleAutosave();
      }
    }

    // ── Zero-Lag Sync from Viewport Selection ──

    syncFromSelection(force = false) {
      if (!this.initialized) return;
      if (this._isSyncing || this._isApplying || this._isDragging) return;

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
        fillOp = primary.fillOpacity !== undefined ? Number(primary.fillOpacity) : (primary.opacity !== undefined ? Number(primary.opacity) : 1.0);
        strokeOp = primary.strokeOpacity !== undefined ? Number(primary.strokeOpacity) : (primary.brushConfig?.opacity !== undefined ? Number(primary.brushConfig.opacity) : (primary.opacity !== undefined ? Number(primary.opacity) : 1.0));
      } else {
        const fillEl = getDomEl('prop-fill-text');
        const strokeEl = getDomEl('prop-stroke-text');
        fillVal = fillEl ? fillEl.value : '#fabd2f';
        strokeVal = strokeEl ? strokeEl.value : '#1d2021';
        const opEl = getDomEl('prop-fill-opacity');
        fillOp = opEl ? Number(opEl.value) || 1.0 : 1.0;
        const strokeOpEl = getDomEl('prop-stroke-opacity');
        strokeOp = strokeOpEl ? Number(strokeOpEl.value) || 1.0 : 1.0;
      }

      let bgVal = (activeDoc && activeDoc.backgroundColor) ? activeDoc.backgroundColor : (getDomEl('prop-doc-bg')?.value || '#1d2021');

      if (!force && this._lastFillVal === fillVal && this._lastStrokeVal === strokeVal && this._lastBgVal === bgVal && !primary && this._lastTarget === this.activeTarget) {
        return;
      }

      this._lastFillVal = fillVal;
      this._lastStrokeVal = strokeVal;
      this._lastBgVal = bgVal;
      this._lastTarget = this.activeTarget;

      this._isSyncing = true;
      try {
        let activeColorVal = fillVal;
        let activeAlpha = fillOp;
        if (this.activeTarget === 'stroke') {
          activeColorVal = strokeVal;
          activeAlpha = strokeOp;
        } else if (this.activeTarget === 'bg') {
          activeColorVal = bgVal;
          activeAlpha = 1.0;
        } else {
          activeColorVal = fillVal;
          activeAlpha = fillOp;
        }

        this.currentA = (activeAlpha !== undefined) ? Number(activeAlpha) : 1.0;
        this.setColorFromExternal(activeColorVal, this.currentA);

        // Sync Gradients
        if (this.activeTarget === 'bg') {
          if (activeDoc && activeDoc.backgroundType && activeDoc.backgroundType !== 'solid' && activeDoc.backgroundGradient) {
            this.gradientType = activeDoc.backgroundType;
            if (Array.isArray(activeDoc.backgroundGradient.stops) && activeDoc.backgroundGradient.stops.length > 0) {
              this.gradientStops = activeDoc.backgroundGradient.stops.map(s => ({
                offset: s.offset,
                color: s.color,
                opacity: s.opacity !== undefined ? s.opacity : 1.0,
                intensity: s.intensity !== undefined ? s.intensity : 1.0
              }));
            }
            this.gradientAngle = activeDoc.backgroundGradient.angle !== undefined ? activeDoc.backgroundGradient.angle : 0;
            this.gradientRadius = parseFloat(activeDoc.backgroundGradient.r) || 0.5;
            this.updateGradientUI();
          }
        } else if (primary && primary.fillType && primary.fillType !== 'solid' && primary.fillGradient) {
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
        } else if (!primary && activeDoc && activeDoc.defaultFillType && activeDoc.defaultFillType !== 'solid' && activeDoc.defaultFillGradient) {
          this.gradientType = activeDoc.defaultFillType;
          if (Array.isArray(activeDoc.defaultFillGradient.stops) && activeDoc.defaultFillGradient.stops.length > 0) {
            this.gradientStops = activeDoc.defaultFillGradient.stops.map(s => ({
              offset: s.offset,
              color: s.color,
              opacity: s.opacity !== undefined ? s.opacity : 1.0,
              intensity: s.intensity !== undefined ? s.intensity : 1.0
            }));
          }
          this.gradientAngle = activeDoc.defaultFillGradient.angle !== undefined ? activeDoc.defaultFillGradient.angle : 0;
          this.gradientRadius = parseFloat(activeDoc.defaultFillGradient.r) || 0.5;
          this.updateGradientUI();
        }

        // Sync Texture
        const texObj = this.activeTarget === 'bg'
          ? (activeDoc?.backgroundTexture || {})
          : (this.activeTarget === 'stroke'
              ? (primary?.strokeTexture || activeDoc?.defaultStrokeTexture || {})
              : (primary?.fillTexture || activeDoc?.defaultFillTexture || {}));
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
        const filterObj = this.activeTarget === 'bg'
          ? (activeDoc?.backgroundFilter || {})
          : (this.activeTarget === 'stroke'
              ? (primary?.strokeFilter || primary?.brushConfig?.wasmFilter || activeDoc?.defaultStrokeFilter)
              : (primary?.fillFilter || primary?.fillTexture?.wasmFilter || primary?.wasmFilter || activeDoc?.defaultFillFilter));
        if (filterObj) {
          this.filterEnabled = !!filterObj.enabled;
          this.filterIsLens = (filterObj.target === 'backdrop' || !!filterObj.isLens);
          this.filterPlugin = filterObj.plugin || 'bloom';
          this.filterP1 = filterObj.p1 !== undefined ? filterObj.p1 : 0;
          this.filterP2 = filterObj.p2 !== undefined ? filterObj.p2 : 0;
          this.filterParams = filterObj.params || [this.filterP1, this.filterP2];
          this.filterOpacity = filterObj.opacity !== undefined ? Number(filterObj.opacity) : 1.0;

          if (this.dom.filterEnabled) this.dom.filterEnabled.checked = this.filterEnabled;
          if (this.dom.filterIsLens) this.dom.filterIsLens.checked = this.filterIsLens;
          if (this.dom.filterPlugin) {
            this.populateFilterPluginSelect();
            this.dom.filterPlugin.value = this.filterPlugin;
          }
          if (this.dom.filterOpacity) this.dom.filterOpacity.value = String(this.filterOpacity);
          if (this.dom.filterOpacitySlider) this.dom.filterOpacitySlider.value = String(this.filterOpacity);
          this.renderFilterParams();
        }

        // Sync Brush Fill
        const bfObj = this.activeTarget === 'bg'
          ? (activeDoc?.backgroundBrushFill || DEFAULT_BRUSH_FILL_CONFIG)
          : (primary?.brushFill || activeDoc?.defaultBrushFill || DEFAULT_BRUSH_FILL_CONFIG);
        if (bfObj) {
          this.brushFillConfig = { ...DEFAULT_BRUSH_FILL_CONFIG, ...bfObj };
          if (primary && primary.fillType === 'brush') {
            this.brushFillConfig.enabled = true;
          }
          this.syncBrushFillInputs();
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
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-width: thin;
      }
      .cs-target-bar::-webkit-scrollbar {
        height: 3px;
      }
      .cs-target-bar::-webkit-scrollbar-thumb {
        background: var(--border, #2e3234);
        border-radius: 2px;
      }
      .cs-target-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1 0 auto;
        min-width: max-content;
        padding: 4px 6px;
        border-radius: var(--radius-sm, 3px);
        background: transparent;
        border: 1px solid transparent;
        color: var(--text-dim, #d5c4a1);
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.12s ease;
        white-space: nowrap;
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
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
      }
      .cs-mode-tabs::-webkit-scrollbar {
        height: 3px;
      }
      .cs-mode-tabs::-webkit-scrollbar-thumb {
        background: var(--border, #2e3234);
        border-radius: 2px;
      }
      .cs-mode-btn {
        flex: 1 0 auto;
        min-width: max-content;
        padding: 4px 6px;
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
        white-space: nowrap;
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
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
      }
      .cs-submode-tabs::-webkit-scrollbar {
        height: 3px;
      }
      .cs-submode-tabs::-webkit-scrollbar-thumb {
        background: var(--border, #2e3234);
        border-radius: 2px;
      }
      .cs-submode-btn {
        flex: 1 0 auto;
        min-width: max-content;
        padding: 3px 6px;
        text-align: center;
        font-size: 9.5px;
        font-weight: 600;
        text-transform: uppercase;
        background: transparent;
        border: none;
        color: var(--text-muted, #928374);
        border-radius: 2px;
        cursor: pointer;
        white-space: nowrap;
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
        width: 84px;
        flex-shrink: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
      .cs-chip-btn {
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        font-size: 9.5px;
        background: var(--bg-input, #121314);
        border: 1px solid var(--border, #2e3234);
        color: var(--text-dim, #d5c4a1);
        border-radius: 3px;
        cursor: pointer;
        user-select: none;
        transition: all 0.12s ease;
      }
      .cs-chip-btn:hover {
        border-color: var(--border-bright, #484d50);
        color: var(--text-bright, #fbf1c7);
      }
      .cs-chip-btn.active {
        background: var(--primary-dim, rgba(250, 189, 47, 0.16));
        border-color: var(--primary, #fabd2f);
        color: var(--primary, #fabd2f);
        font-weight: 600;
      }
      .cs-palette-chip {
        width: 18px;
        height: 18px;
        border-radius: 3px;
        border: 1px solid var(--border, #2e3234);
        cursor: pointer;
        position: relative;
        flex-shrink: 0;
        transition: transform 0.1s ease, border-color 0.1s ease;
      }
      .cs-palette-chip:hover {
        border-color: #ffffff;
        transform: scale(1.15);
      }
      /* Brush Pool Tags */
      .cs-bf-brush-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        font-size: 10.5px;
        background: var(--bg-surface, #282828);
        border: 1px solid var(--border, #3c3836);
        border-radius: var(--radius-sm, 3px);
        color: var(--text, #ebdbb2);
        user-select: none;
        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        max-width: 100%;
        box-sizing: border-box;
      }
      .cs-bf-brush-tag .cs-bf-brush-num {
        color: var(--primary, #fabd2f);
        font-weight: 600;
        font-size: 9.5px;
      }
      .cs-bf-brush-tag .cs-bf-brush-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
      }
      .cs-bf-brush-tag .cs-bf-brush-del {
        cursor: pointer;
        color: var(--text-muted, #928374);
        padding: 0 2px;
        font-size: 13px;
        font-weight: bold;
        line-height: 1;
        transition: color 0.12s ease;
      }
      .cs-bf-brush-tag .cs-bf-brush-del:hover {
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
        border: 1px solid rgba(255,255,255,0.2) !important;
        cursor: pointer;
        padding: 0 !important;
        transition: transform 0.08s ease, border-color 0.08s ease;
        background-image: none !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
        box-sizing: border-box;
      }
      .cs-swatch-item:hover {
        transform: scale(1.18);
        z-index: 3;
        border-color: #ffffff !important;
        box-shadow: 0 2px 6px rgba(0,0,0,0.6) !important;
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
      .cs-preset-bar {
        display: flex;
        gap: 4px;
        align-items: center;
        margin-bottom: 6px;
      }
      .cs-menu-popup {
        font-family: var(--font-main, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        user-select: none;
      }
      .cs-menu-popup-item:hover {
        background: var(--bg-hover, #3c3836) !important;
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
    PaletteManager,
    PALETTES,
    getCustomSwatches,
    saveCustomSwatches,
    mountColorTab,
    mountMaterialsTab: mountColorTab,
    mountMaterialTab: mountColorTab,
    syncFromSelection,
    onPanelActivated,
    getInstance: () => instance
  };
}));
