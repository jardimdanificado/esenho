/**
 * Esenho Studio — Procedural Brush Fill & Multi-Stroke Hatching Engine
 *
 * Generates rich, customizable procedural brush-stroke fills for vector geometries:
 * - Trajectory Patterns: Parallel Hatch, Crosshatch, Triple Hatch, Contour Inset, Stippling, Scribble, Zig-Zag, Wavy Flow, Spiral.
 * - Mesh & Density: Line spacing, angle(s), strokes per line, segmentation, gaps.
 * - Multi-Brush Tip Cycling: Cycle or randomly pick from custom brush tips/shapes per stroke.
 * - Multi-Color Palette: Multi-stop palette cycling, gradient mapping, or HSL jitter per stroke.
 * - Variance & Jitters: Angle, length, width, opacity, spatial position, curvature, and color jitters.
 * - Boundary Bleed & Overshoot: Loose sketch overshooting past the contour or strict clipping.
 */

(function (global) {
  'use strict';

  // ── 1. Math & Geometry Utilities ──

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function radToDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function rotatePoint(x, y, rad, cx = 0, cy = 0) {
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cosA - dy * sinA,
      y: cy + dx * sinA + dy * cosA
    };
  }

  /**
   * Deterministic Pseudo-Random Number Generator (PRNG) with optional seed
   */
  class FastRandom {
    constructor(seed = 123456789) {
      this.seed = (seed === undefined || seed === null || isNaN(seed)) ? 123456789 : seed;
    }

    next() {
      // Linear Congruential Generator (LCG)
      this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
      return this.seed / 4294967296;
    }

    range(min, max) {
      return min + this.next() * (max - min);
    }

    jitter(base, jitterAmount, isPercentage = false) {
      if (!jitterAmount || jitterAmount === 0) return base;
      const factor = (this.next() * 2 - 1);
      if (isPercentage) {
        return base * (1 + factor * (jitterAmount / 100));
      }
      return base + factor * jitterAmount;
    }
  }

  /**
   * Line Segment Intersection with Horizontal Scanline in Rotated Space
   */
  function findScanlineIntersections(poly, y) {
    const intersections = [];
    const n = poly.length;
    if (n < 2) return intersections;

    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];

      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const dy = p2.y - p1.y;
        if (Math.abs(dy) > 1e-6) {
          const t = (y - p1.y) / dy;
          const x = p1.x + t * (p2.x - p1.x);
          intersections.push(x);
        }
      }
    }
    intersections.sort((a, b) => a - b);
    return intersections;
  }

  /**
   * Check if a 2D point is inside a polygon (even-odd winding)
   */
  function isPointInPolygon(px, py, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Check if a 2D point is inside a compound polygon set (even-odd winding across holes & ribbons)
   */
  function isPointInPolygons(px, py, polygons) {
    if (!polygons || polygons.length === 0) return false;
    let inside = false;
    for (let i = 0; i < polygons.length; i++) {
      if (isPointInPolygon(px, py, polygons[i])) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Extract or compute bounding box from array of polygons
   */
  function getPolygonsBounds(polys) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of polys) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    return {
      minX, minY, maxX, maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }

  /**
   * Color helpers for color palette and jitter
   */
  function hexToRgb(hex) {
    let c = String(hex || '#000000').replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
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

  function jitterColor(hexColor, hJitter, sJitter, lJitter, rng) {
    if (!hexColor || (!hJitter && !sJitter && !lJitter)) return hexColor;
    const rgb = hexToRgb(hexColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.h = (hsl.h + (rng.next() * 2 - 1) * (hJitter || 0) + 360) % 360;
    hsl.s = clamp(hsl.s + (rng.next() * 2 - 1) * (sJitter || 0), 0, 100);
    hsl.l = clamp(hsl.l + (rng.next() * 2 - 1) * (lJitter || 0), 0, 100);
    const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
  }

  /**
   * Sample color at a 2D point from a linear or radial gradient definition.
   * @param {Object} gradient Gradient object { type: 'linear'|'radial', stops: [{offset, color}], angle?, radius?, cx?, cy? }
   * @param {{x: number, y: number}} pt Stroke coordinate point
   * @param {{minX: number, minY: number, width: number, height: number}} bounds Object bounding box
   * @returns {string} Hex color string
   */
  function sampleGradientAtPoint(gradient, pt, bounds) {
    if (!gradient) return '#fabd2f';
    const stops = Array.isArray(gradient.stops) ? gradient.stops : [];
    if (stops.length === 0) return gradient.color || '#fabd2f';
    if (stops.length === 1) return stops[0].color || '#fabd2f';

    const w = Math.max(1, bounds?.width || 100);
    const h = Math.max(1, bounds?.height || 100);
    const minX = bounds?.minX !== undefined ? bounds.minX : 0;
    const minY = bounds?.minY !== undefined ? bounds.minY : 0;
    let t = 0;

    if (gradient.type === 'radial') {
      const cx = minX + w * (gradient.cx !== undefined ? gradient.cx : 0.5);
      const cy = minY + h * (gradient.cy !== undefined ? gradient.cy : 0.5);
      const r = (parseFloat(gradient.radius || gradient.r) || 0.5) * Math.max(w, h);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      t = clamp(Math.hypot(dx, dy) / Math.max(1e-4, r), 0, 1);
    } else {
      // Linear gradient
      const nx = (pt.x - minX) / w;
      const ny = (pt.y - minY) / h;
      const rad = degToRad(gradient.angle || 0);
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      t = 0.5 + (nx - 0.5) * cosA + (ny - 0.5) * sinA;
      t = clamp(t, 0, 1);
    }

    const sortedStops = [...stops].sort((a, b) => a.offset - b.offset);
    if (t <= sortedStops[0].offset) return sortedStops[0].color;
    if (t >= sortedStops[sortedStops.length - 1].offset) return sortedStops[sortedStops.length - 1].color;

    for (let i = 0; i < sortedStops.length - 1; i++) {
      const s0 = sortedStops[i];
      const s1 = sortedStops[i + 1];
      if (t >= s0.offset && t <= s1.offset) {
        const span = s1.offset - s0.offset;
        const localT = span > 1e-6 ? (t - s0.offset) / span : 0;
        const c0 = hexToRgb(s0.color);
        const c1 = hexToRgb(s1.color);
        const r = c0.r + (c1.r - c0.r) * localT;
        const g = c0.g + (c1.g - c0.g) * localT;
        const b = c0.b + (c1.b - c0.b) * localT;
        return rgbToHex(r, g, b);
      }
    }
    return sortedStops[0].color;
  }

  function lineIntersectionDistance(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 1e-9) return null;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      return ua;
    }
    return null;
  }

  // ── 1.5. Native Brush Preset Resolution with Fast Memory Cache ──
  let _cachedNativePresets = null;
  let _lastStoredPresetsRaw = null;

  function getNativeBrushPresets() {
    // Check if localStorage has updated custom presets
    let customUpdated = false;
    let stored = null;
    try {
      if (typeof localStorage !== 'undefined') {
        stored = localStorage.getItem('esenho_custom_brush_presets_v1');
        if (stored !== _lastStoredPresetsRaw) {
          _lastStoredPresetsRaw = stored;
          customUpdated = true;
        }
      }
    } catch (_) {}

    if (_cachedNativePresets && !customUpdated) {
      return _cachedNativePresets;
    }

    let presets = {};
    if (typeof EsenhoRegistry !== 'undefined' && typeof EsenhoRegistry.getDict === 'function') {
      const dict = EsenhoRegistry.getDict('brush');
      if (dict && Object.keys(dict).length > 0) Object.assign(presets, dict);
    } else if (typeof BRUSH_PRESETS !== 'undefined') {
      Object.assign(presets, BRUSH_PRESETS);
    } else if (typeof window !== 'undefined' && window.BRUSH_PRESETS) {
      Object.assign(presets, window.BRUSH_PRESETS);
    } else if (typeof globalThis !== 'undefined' && globalThis.BRUSH_PRESETS) {
      Object.assign(presets, globalThis.BRUSH_PRESETS);
    } else if (typeof require === 'function') {
      try {
        const reg = require('./resource_registry.js');
        if (reg && reg.getDict) {
          const dict = reg.getDict('brush');
          if (dict && Object.keys(dict).length > 0) Object.assign(presets, dict);
        }
      } catch (_) {}
      if (Object.keys(presets).length === 0) {
        try {
          const es = require('./esenho.js');
          if (es && es.BRUSH_PRESETS) Object.assign(presets, es.BRUSH_PRESETS);
        } catch (_) {}
      }
    }

    if (stored) {
      try {
        const custom = JSON.parse(stored);
        Object.assign(presets, custom);
      } catch (_) {}
    }

    _cachedNativePresets = presets;
    return presets;
  }

  // ── 2. Procedural Brush Fill Generator ──

  const DEFAULT_BRUSH_FILL_CONFIG = {
    enabled: true,
    pattern: 'linear',           // 'linear' | 'crosshatch' | 'triple_hatch' | 'herringbone' | 'woven' | 'isometric' | 'cross_contour' | 'radial' | 'concentric' | 'flow_field' | 'voronoi' | 'contour' | 'stipple' | 'scribble' | 'zigzag' | 'wave' | 'spiral'
    spacing: 8,                  // Spacing / Pitch between lines or grid cells (px)
    angle: 45,                   // Primary angle in degrees (0 - 360)
    angle2: 135,                 // Secondary angle for cross-hatch (0 - 360)
    angle3: 90,                  // Tertiary angle for triple-hatch (0 - 360)

    // Extended Mesh & Trajectory Parameters
    strokeDirection: 'bidirectional', // 'bidirectional' | 'forward' | 'reverse' | 'random'
    spacingJitter: 0,                 // Jitter in spacing between scanlines/grid (0 - 100 %)
    lineAngleJitter: 0,               // Angular jitter between lines (± degrees)
    waveFrequency: 8,                 // Frequency for wave/zigzag/flow oscillations (cycles per 100px)
    waveAmplitude: 50,                // Amplitude % of spacing for wave/zigzag
    originX: 50,                      // Origin center X (0 - 100 % of bounding box)
    originY: 50,                      // Origin center Y (0 - 100 % of bounding box)
    curvatureMode: 'uniform',         // 'uniform' | 'arch' | 's_curve' | 'wave'
    meshPhase: 0,                     // Phase shift / offset (0 - 100 %)
    
    // Strokes per line & segmentation
    strokesPerLine: 1,           // Number of subdivided strokes along each line interval
    strokeLength: 0,             // 0 = full segment across boundary, >0 = explicit length in px
    strokeGap: 4,                // Gap between successive strokes along a line (px)
    strokeOverlap: 0,            // Overlap distance between strokes when segmented (px)
    gapJitter: 0,                // Random variation in gap between strokes (± %)

    // Native Brush Selection
    brush: 'pencil',             // Primary native brush preset key ('pencil', 'tech_pen', 'gpen', 'inker', 'oil', etc.)
    brushSecondary: '',          // Secondary native brush preset key (optional for dual/alternating)
    brushes: ['pencil'],         // Array of native brush keys
    brushList: ['pencil'],       // Backwards-compat alias for brushes
    brushPickMode: 'cycle',      // 'cycle' | 'random' | 'alternate'

    // Material Color & Gradient Scheme
    color: null,                 // Material solid color for brush strokes (e.g. '#fabd2f')
    gradient: null,              // Material gradient object { type, stops, angle, radius }
    fillGradient: null,          // Alias for material gradient
    colorMode: 'palette',        // 'solid' | 'palette' | 'gradient' | 'random'
    colorPaletteId: 'gruvbox',   // ID of saved color palette from PaletteManager (legacy fallback)
    colorPalette: ['#fabd2f'],   // Array of colors for strokes (legacy fallback)
    colorPickMode: 'cycle',      // 'cycle' | 'random' | 'gradient'
    hueJitter: 0,                // Fine-grained Hue variation (± degrees)
    satJitter: 0,                // Fine-grained Saturation variation (± %)
    lightnessJitter: 0,          // Fine-grained Lightness / Value variation (± %)

    // Base Stroke Properties
    strokeWidth: 2,              // Base stroke width in px
    strokeOpacity: 0.9,          // Base stroke opacity (0.0 to 1.0)
    flow: 100,                   // Flow %
    hardness: 95,                // Hardness %
    curvature: 0,                // Base curvature / bend (-100 to 100)
    wobble: 0,                   // Organic hand tremor & roughness along stroke trajectory (0 - 100 %)

    // Parameter Jitters & Variance
    angleJitter: 0,              // Max angle variation (± degrees)
    lengthJitter: 0,             // Max stroke length variation (± %)
    widthJitter: 0,              // Max stroke width variation (± %)
    opacityJitter: 0,            // Max opacity variation (± %)
    positionJitter: 0,           // Max spatial position offset (± px)
    curvatureJitter: 0,          // Max curvature variation
    colorJitter: 0,              // Max overall color Hue/Sat/Val variation (± %)

    // Boundary Bleed & Overshoot
    clipMode: 'bleed',           // 'strict' (exact clip) | 'bleed' (overshoot beyond contour)
    bleedDistance: 0,            // Max distance (px) strokes can overshoot past the contour
    bleedJitter: 50,             // Random variation in bleed distance (± %)
    bleedProbability: 100,       // % of strokes that are allowed to overshoot

    seed: 42                     // Deterministic seed for reproducible artistic generation
  };

  /**
   * Main BrushFillEngine class
   */
  class BrushFillEngine {
    /**
     * Generate procedural strokes for arbitrary 2D polygons representing a vector shape.
     * @param {Array<Array<{x: number, y: number}>>} polygons Array of closed polygon vertex loops
     * @param {Object} options Configuration overrides
     * @returns {Array<Object>} Generated brush strokes
     */
    static generateStrokes(polygons, options = {}) {
      if (!polygons || polygons.length === 0) return [];
      const config = { ...DEFAULT_BRUSH_FILL_CONFIG, ...options };
      if (!config.enabled) return [];

      // Reconcile brush options
      if (options.brushList && !options.brushes) {
        config.brushes = options.brushList;
      } else if (options.brushes && !options.brushList) {
        config.brushList = options.brushes;
      } else if (options.brush && !options.brushes && !options.brushList) {
        config.brushes = [options.brush, ...(options.brushSecondary ? [options.brushSecondary] : [])];
        config.brushList = config.brushes;
      }

      // Pre-resolve native brush tips pool once for O(1) stroke picking
      const allPresets = getNativeBrushPresets();
      let brushList = [];
      if (Array.isArray(config.brushes) && config.brushes.length > 0) {
        brushList = config.brushes;
      } else if (Array.isArray(config.brushList) && config.brushList.length > 0) {
        brushList = config.brushList;
      } else if (config.brush) {
        brushList = [config.brush, ...(config.brushSecondary ? [config.brushSecondary] : [])];
      } else {
        brushList = ['pencil'];
      }

      const userHardness = config.hardness !== undefined ? config.hardness : 95;
      const userFlow = config.flow !== undefined ? config.flow : 100;
      const preResolvedTips = brushList.map(chosenKey => {
        const preset = allPresets[chosenKey] || allPresets[chosenKey?.toLowerCase()] || {};
        const brushConfig = {
          preset: chosenKey,
          name: preset.name || chosenKey,
          shape: preset.shape || 'circle',
          spacing: preset.spacing || 5,
          roundness: preset.roundness !== undefined ? preset.roundness : 100,
          angle: preset.angle || 0,
          grain: preset.grain || 0,
          texture: preset.texture || 'none',
          texture_contrast: preset.texture_contrast || 100,
          texture_scale: preset.texture_scale || 100,
          dabBlend: preset.dab_blend || 0,
          scatter: preset.scatter || 0,
          wetness: preset.wetness || 0,
          color_pickup: preset.color_pickup || 0,
          depletion: preset.depletion || 0,
          smudge: preset.smudge || 0,
          taper_in: preset.taper_in || 0,
          taper_out: preset.taper_out || 0,
          size_jitter: preset.size_jitter || 0,
          angle_jitter: preset.angle_jitter || 0,
          opacity_jitter: preset.opacity_jitter || 0,
          auto_rotate: preset.auto_rotate || 0,
          velocity: preset.velocity || 0,
          smoothing: preset.smoothing || 0,
          ...preset,
          hardness: userHardness,
          flow: userFlow
        };
        return {
          key: chosenKey,
          brush: chosenKey,
          name: preset.name || chosenKey,
          shape: preset.shape || 'circle',
          hardness: userHardness,
          flow: userFlow,
          brushConfig
        };
      });
      config._preResolvedTips = preResolvedTips;

      // Pre-resolve Color Palette
      let palette = (config.colorPalette && config.colorPalette.length > 0) ? config.colorPalette : null;
      if (!palette || palette.length === 0) {
        if (config.colorPaletteId) {
          try {
            let pm = (typeof ColorStudio !== 'undefined' && ColorStudio.PaletteManager)
              || (typeof window !== 'undefined' && (window.ColorStudio?.PaletteManager || window.PaletteManager))
              || (typeof global !== 'undefined' && (global.ColorStudio?.PaletteManager || global.PaletteManager))
              || (typeof PaletteManager !== 'undefined' ? PaletteManager : null);
            if (!pm && typeof require === 'function') {
              try {
                const cs = require('./color_studio.js');
                if (cs && cs.PaletteManager) pm = cs.PaletteManager;
              } catch (_) {}
            }
            if (pm && typeof pm.getPalette === 'function') {
              const pal = pm.getPalette(config.colorPaletteId);
              if (pal && pal.colors && pal.colors.length > 0) {
                palette = pal.colors;
              }
            }
          } catch (_) {}
        }
      }
      if (!palette || palette.length === 0) {
        palette = ['#fabd2f'];
      }
      config._preResolvedPalette = palette;

      const hJ = (config.hueJitter || 0) + (config.colorJitter ? config.colorJitter * 1.8 : 0);
      const sJ = (config.satJitter || 0) + (config.colorJitter || 0);
      const lJ = (config.lightnessJitter || 0) + (config.colorJitter || 0);
      config._hasColorJitter = (hJ > 0 || sJ > 0 || lJ > 0);
      config._hJ = hJ;
      config._sJ = sJ;
      config._lJ = lJ;

      const rng = new FastRandom(config.seed || 42);
      const bounds = getPolygonsBounds(polygons);
      const strokes = [];

      switch (config.pattern) {
        case 'crosshatch':
          this._generateHatchLayer(polygons, bounds, config, config.angle, strokes, rng);
          this._generateHatchLayer(polygons, bounds, config, config.angle2 !== undefined ? config.angle2 : (config.angle + 90), strokes, rng);
          break;

        case 'triple_hatch':
          this._generateHatchLayer(polygons, bounds, config, config.angle, strokes, rng);
          this._generateHatchLayer(polygons, bounds, config, config.angle2 !== undefined ? config.angle2 : (config.angle + 60), strokes, rng);
          this._generateHatchLayer(polygons, bounds, config, config.angle3 !== undefined ? config.angle3 : (config.angle + 120), strokes, rng);
          break;

        case 'herringbone':
          this._generateHerringboneFills(polygons, bounds, config, strokes, rng);
          break;

        case 'woven':
          this._generateWovenMeshFills(polygons, bounds, config, strokes, rng);
          break;

        case 'isometric':
          this._generateHatchLayer(polygons, bounds, config, config.angle, strokes, rng);
          this._generateHatchLayer(polygons, bounds, config, config.angle + 60, strokes, rng);
          this._generateHatchLayer(polygons, bounds, config, config.angle + 120, strokes, rng);
          break;

        case 'cross_contour':
          this._generateCrossContourFills(polygons, bounds, config, strokes, rng);
          break;

        case 'radial':
          this._generateRadialFills(polygons, bounds, config, strokes, rng);
          break;

        case 'concentric':
          this._generateConcentricFills(polygons, bounds, config, strokes, rng);
          break;

        case 'flow_field':
          this._generateFlowFieldFills(polygons, bounds, config, strokes, rng);
          break;

        case 'voronoi':
          this._generateVoronoiFills(polygons, bounds, config, strokes, rng);
          break;

        case 'contour':
          this._generateContourFills(polygons, bounds, config, strokes, rng);
          break;

        case 'stipple':
          this._generateStippleFills(polygons, bounds, config, strokes, rng);
          break;

        case 'scribble':
          this._generateScribbleFills(polygons, bounds, config, strokes, rng);
          break;

        case 'zigzag':
          this._generateZigZagFills(polygons, bounds, config, strokes, rng);
          break;

        case 'wave':
          this._generateWaveFills(polygons, bounds, config, strokes, rng);
          break;

        case 'spiral':
          this._generateSpiralFills(polygons, bounds, config, strokes, rng);
          break;

        case 'linear':
        default:
          this._generateHatchLayer(polygons, bounds, config, config.angle, strokes, rng);
          break;
      }

      return strokes;
    }

    /**
     * Generate parallel hatching strokes at a given angle across arbitrary polygons
     */
    static _generateHatchLayer(polygons, bounds, config, angleDeg, strokes, rng) {
      let currentAngle = angleDeg;
      const spacing = Math.max(1, config.spacing || 8);
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;

      const rad = degToRad(currentAngle);
      // Rotate all polygons into scanline alignment space (where hatch lines are horizontal)
      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const phaseOffset = ((config.meshPhase || 0) / 100) * spacing;
      const yStart = rotBounds.minY - spacing / 2 + phaseOffset;
      const yEnd = rotBounds.maxY + spacing / 2;

      let lineIdx = 0;
      let y = yStart;
      while (y <= yEnd) {
        // Line angle jitter if configured
        let lineRad = rad;
        if (config.lineAngleJitter > 0) {
          lineRad += degToRad(rng.range(-config.lineAngleJitter, config.lineAngleJitter));
        }

        // Collect all intersections across all polygon contours
        let allIntersections = [];
        for (const poly of rotatedPolys) {
          const inters = findScanlineIntersections(poly, y);
          allIntersections.push(...inters);
        }
        allIntersections.sort((a, b) => a - b);

        // Group into inside intervals [x0, x1], [x2, x3], ...
        for (let i = 0; i < allIntersections.length - 1; i += 2) {
          const x0 = allIntersections[i];
          const x1 = allIntersections[i + 1];
          if (x1 - x0 < 0.5) continue;

          const p0 = rotatePoint(x0, y, lineRad, cx, cy);
          const p1 = rotatePoint(x1, y, lineRad, cx, cy);
          this._emitStrokeSegment(p0, p1, config, lineIdx, strokes, rng, bounds);
        }
        lineIdx++;

        let stepSpacing = spacing;
        if (config.spacingJitter > 0) {
          stepSpacing = spacing * (1 + rng.range(-config.spacingJitter, config.spacingJitter) / 100);
        }
        y += Math.max(1, stepSpacing);
      }
    }

    /**
     * Backwards-compatible bridge for legacy hatch subdivider
     */
    static _subdivideAndEmitStroke(x0, x1, y, rad, cx, cy, config, lineIdx, strokes, rng, bounds) {
      const p0 = rotatePoint(x0, y, rad, cx, cy);
      const p1 = rotatePoint(x1, y, rad, cx, cy);
      this._emitStrokeSegment(p0, p1, config, lineIdx, strokes, rng, bounds);
    }

    /**
     * Universal Stroke Segment Generator
     * Emits subdivided, jittered, tapered, wobbled, and textured brush strokes between any two 2D endpoints p0 and p1.
     */
    static _emitStrokeSegment(p0, p1, config, lineIdx, strokes, rng, bounds) {
      let vx = p1.x - p0.x;
      let vy = p1.y - p0.y;
      const rawLen = Math.hypot(vx, vy);
      if (rawLen < 0.2) return;

      const ux = vx / rawLen;
      const uy = vy / rawLen;
      const nx = -uy;
      const ny = ux;

      // 1. Bleed / Overshoot calculation
      let bleed0 = 0, bleed1 = 0;
      if (config.clipMode === 'bleed' && config.bleedDistance > 0) {
        if (rng.range(0, 100) <= (config.bleedProbability !== undefined ? config.bleedProbability : 100)) {
          bleed0 = rng.jitter(config.bleedDistance, config.bleedJitter || 0, true);
          bleed1 = rng.jitter(config.bleedDistance, config.bleedJitter || 0, true);
        }
      }

      const extP0 = { x: p0.x - ux * bleed0, y: p0.y - uy * bleed0 };
      const extP1 = { x: p1.x + ux * bleed1, y: p1.y + uy * bleed1 };
      const totalLen = rawLen + bleed0 + bleed1;

      // 2. Stroke Direction handling (bidirectional, forward, reverse, random)
      let shouldFlip = false;
      if (config.strokeDirection === 'bidirectional') {
        shouldFlip = (lineIdx % 2 === 1);
      } else if (config.strokeDirection === 'reverse') {
        shouldFlip = true;
      } else if (config.strokeDirection === 'random') {
        shouldFlip = (rng.next() > 0.5);
      }

      const startPt = shouldFlip ? extP1 : extP0;
      const segUx = shouldFlip ? -ux : ux;
      const segUy = shouldFlip ? -uy : uy;
      const segNx = shouldFlip ? -nx : nx;
      const segNy = shouldFlip ? -ny : ny;

      // 3. Subdivide into strokesPerLine / strokeLength
      const count = Math.max(1, config.strokesPerLine || 1);
      let gap = Math.max(0, config.strokeGap !== undefined ? config.strokeGap : 4);
      if (config.gapJitter > 0) {
        gap = Math.max(0, rng.jitter(gap, config.gapJitter, true));
      }
      const overlap = Math.max(0, config.strokeOverlap || 0);

      let segmentLen = (totalLen - gap * (count - 1)) / count + overlap;
      if (config.strokeLength > 0) {
        segmentLen = Math.min(segmentLen, config.strokeLength);
      }
      segmentLen = Math.max(0.5, segmentLen);

      const stepDist = (count === 1) ? 0 : Math.max(0.1, (totalLen - segmentLen) / (count - 1));

      for (let k = 0; k < count; k++) {
        let currentSegLen = segmentLen;
        // Length Jitter
        if (config.lengthJitter > 0) {
          currentSegLen *= (1 + rng.range(-config.lengthJitter, config.lengthJitter) / 100);
          currentSegLen = Math.max(0.5, currentSegLen);
        }

        const tStart = (count === 1) ? 0 : k * stepDist;
        let s0 = {
          x: startPt.x + segUx * tStart,
          y: startPt.y + segUy * tStart
        };
        let s1 = {
          x: s0.x + segUx * currentSegLen,
          y: s0.y + segUy * currentSegLen
        };

        // Position Jitter (lateral offset and longitudinal stagger)
        let offsetLat = 0, offsetAx = 0;
        if (config.positionJitter > 0) {
          offsetLat = rng.range(-config.positionJitter, config.positionJitter);
          offsetAx = rng.range(-config.positionJitter / 2, config.positionJitter / 2);
        }

        s0.x += segNx * offsetLat + segUx * offsetAx;
        s0.y += segNy * offsetLat + segUy * offsetAx;
        s1.x += segNx * offsetLat + segUx * offsetAx;
        s1.y += segNy * offsetLat + segUy * offsetAx;

        // Angle Jitter (rotates segment around its OWN midpoint so strokes tilt in place)
        let midX = (s0.x + s1.x) / 2;
        let midY = (s0.y + s1.y) / 2;
        if (config.angleJitter > 0) {
          const tiltRad = degToRad(rng.range(-config.angleJitter, config.angleJitter));
          s0 = rotatePoint(s0.x, s0.y, tiltRad, midX, midY);
          s1 = rotatePoint(s1.x, s1.y, tiltRad, midX, midY);
        }

        // Curvature & Organic Wobble
        const baseCurv = rng.jitter(config.curvature || 0, config.curvatureJitter || 0);
        const wobbleFactor = config.wobble || 0;
        const curvMode = config.curvatureMode || 'uniform';
        const hasCurv = Math.abs(baseCurv) > 0.5;
        const hasWobble = wobbleFactor > 0;

        let strokeType = 'line';
        let cp = null;
        let cp1 = null, cp2 = null;
        let polyPoints = null;

        if (hasWobble || curvMode === 'wave') {
          // Multi-point wavy / wobbled polyline with authentic organic tremor
          strokeType = 'poly';
          const steps = Math.max(4, Math.min(16, Math.round(currentSegLen / 6)));
          polyPoints = [];
          const curvHeight = baseCurv * currentSegLen * 0.02;
          const wobbleAmp = (wobbleFactor / 100) * Math.min(14, currentSegLen * 0.4);

          for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            let px = s0.x + (s1.x - s0.x) * t;
            let py = s0.y + (s1.y - s0.y) * t;

            let lateralDisplacement = 0;
            if (curvMode === 'wave') {
              const freq = (config.waveFrequency || 8) * 0.1;
              lateralDisplacement += Math.sin(t * Math.PI * 2 * freq) * (curvHeight || (wobbleAmp || 5));
            } else if (hasCurv) {
              if (curvMode === 's_curve') {
                lateralDisplacement += Math.sin(t * Math.PI * 2) * curvHeight;
              } else {
                // Parabolic arch
                lateralDisplacement += Math.sin(t * Math.PI) * curvHeight * (curvMode === 'arch' ? 1.5 : 1.0);
              }
            }

            if (hasWobble && step > 0 && step < steps) {
              const noiseDisp = Math.sin(t * Math.PI * 5 + lineIdx * 1.7) * 0.6 + rng.range(-0.4, 0.4);
              lateralDisplacement += noiseDisp * wobbleAmp;
            }

            px += segNx * lateralDisplacement;
            py += segNy * lateralDisplacement;
            polyPoints.push({ x: px, y: py });
          }
        } else if (hasCurv) {
          const curvHeight = baseCurv * currentSegLen * 0.02;
          if (curvMode === 's_curve') {
            strokeType = 'cubic';
            cp1 = {
              x: s0.x + (s1.x - s0.x) * 0.33 + segNx * curvHeight,
              y: s0.y + (s1.y - s0.y) * 0.33 + segNy * curvHeight
            };
            cp2 = {
              x: s0.x + (s1.x - s0.x) * 0.66 - segNx * curvHeight,
              y: s0.y + (s1.y - s0.y) * 0.66 - segNy * curvHeight
            };
          } else {
            strokeType = 'curve';
            const h = (curvMode === 'arch') ? curvHeight * 1.5 : curvHeight;
            cp = {
              x: midX + segNx * h,
              y: midY + segNy * h
            };
          }
        }

        // Multi-Brush & Multi-Color picking
        const strokeIdx = strokes.length;
        const brushTip = this._pickBrushTip(config, strokeIdx, rng);
        const color = this._pickColor(config, strokeIdx, s0, bounds, rng);
        const width = Math.max(0.5, rng.jitter(config.strokeWidth !== undefined ? config.strokeWidth : 2, config.widthJitter || 0, true));
        const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);
        const flow = clamp(config.flow !== undefined ? config.flow : 100, 1, 100);
        const hardness = clamp(config.hardness !== undefined ? config.hardness : 95, 0, 100);

        strokes.push({
          type: strokeType,
          p0: s0,
          p1: s1,
          cp: cp,
          cp1: cp1,
          cp2: cp2,
          points: polyPoints,
          width,
          opacity,
          color,
          brushTip,
          flow,
          hardness,
          lineIdx,
          segmentIdx: k
        });
      }
    }

    /**
     * Pick native brush for the current stroke from native brush engine
     */
    static _pickBrushTip(config, strokeIdx, rng) {
      if (config._preResolvedTips && config._preResolvedTips.length > 0) {
        const list = config._preResolvedTips;
        if (config.brushPickMode === 'random') {
          return list[Math.floor(rng.next() * list.length)];
        } else if (config.brushPickMode === 'alternate') {
          return list[strokeIdx % Math.min(2, list.length)];
        } else {
          return list[strokeIdx % list.length];
        }
      }

      let list = [];
      if (Array.isArray(config.brushes) && config.brushes.length > 0) {
        list = config.brushes;
      } else if (Array.isArray(config.brushList) && config.brushList.length > 0) {
        list = config.brushList;
      } else if (config.brush) {
        list = [config.brush];
        if (config.brushSecondary) list.push(config.brushSecondary);
      } else {
        list = ['pencil'];
      }

      let chosenKey = list[0];
      if (config.brushPickMode === 'random') {
        chosenKey = list[Math.floor(rng.next() * list.length)];
      } else if (config.brushPickMode === 'alternate') {
        chosenKey = list[strokeIdx % Math.min(2, list.length)];
      } else {
        chosenKey = list[strokeIdx % list.length];
      }

      const allPresets = getNativeBrushPresets();
      const preset = allPresets[chosenKey] || allPresets[chosenKey?.toLowerCase()] || {};
      const userHardness = config.hardness !== undefined ? config.hardness : 95;
      const userFlow = config.flow !== undefined ? config.flow : 100;

      const brushConfig = {
        preset: chosenKey,
        name: preset.name || chosenKey,
        shape: preset.shape || 'circle',
        spacing: preset.spacing || 5,
        roundness: preset.roundness !== undefined ? preset.roundness : 100,
        angle: preset.angle || 0,
        grain: preset.grain || 0,
        texture: preset.texture || 'none',
        texture_contrast: preset.texture_contrast || 100,
        texture_scale: preset.texture_scale || 100,
        dabBlend: preset.dab_blend || 0,
        scatter: preset.scatter || 0,
        wetness: preset.wetness || 0,
        color_pickup: preset.color_pickup || 0,
        depletion: preset.depletion || 0,
        smudge: preset.smudge || 0,
        taper_in: preset.taper_in || 0,
        taper_out: preset.taper_out || 0,
        size_jitter: preset.size_jitter || 0,
        angle_jitter: preset.angle_jitter || 0,
        opacity_jitter: preset.opacity_jitter || 0,
        auto_rotate: preset.auto_rotate || 0,
        velocity: preset.velocity || 0,
        smoothing: preset.smoothing || 0,
        ...preset,
        hardness: userHardness,
        flow: userFlow
      };

      return {
        key: chosenKey,
        brush: chosenKey,
        name: preset.name || chosenKey,
        shape: preset.shape || 'circle',
        hardness: userHardness,
        flow: userFlow,
        brushConfig
      };
    }

    /**
     * Pick color for the stroke based on material gradient, material solid color, or legacy palette with HSL jitter
     */
    static _pickColor(config, strokeIdx, pt, bounds, rng) {
      let baseColor = null;

      // 1. Direct Material Gradient (Linear / Radial stops across bounding box)
      const grad = config.gradient || config.fillGradient;
      if (grad && Array.isArray(grad.stops) && grad.stops.length > 0) {
        baseColor = sampleGradientAtPoint(grad, pt, bounds);
      }
      // 2. Direct Material Solid Color
      else if (config.color && typeof config.color === 'string' && config.color !== 'none') {
        baseColor = config.color;
      } else if (config.fill && typeof config.fill === 'string' && config.fill !== 'none') {
        baseColor = config.fill;
      }
      // 3. Fallback / Legacy Palette (if passed)
      else {
        const palette = config._preResolvedPalette || (config.colorPalette && config.colorPalette.length > 0 ? config.colorPalette : ['#fabd2f']);
        if (config.colorMode === 'solid') {
          baseColor = palette[0] || '#fabd2f';
        } else if (config.colorMode === 'gradient') {
          const t = clamp((pt.x - (bounds ? bounds.minX : 0)) / Math.max(1, (bounds ? bounds.width : 100)), 0, 1);
          const palIdx = Math.min(palette.length - 1, Math.floor(t * palette.length));
          baseColor = palette[palIdx];
        } else if (config.colorPickMode === 'random') {
          baseColor = palette[Math.floor(rng.next() * palette.length)];
        } else {
          baseColor = palette[strokeIdx % palette.length];
        }
      }

      if (!baseColor || baseColor === 'none') {
        baseColor = '#fabd2f';
      }

      if (config._hasColorJitter) {
        return jitterColor(baseColor, config._hJ, config._sJ, config._lJ, rng);
      } else if (!config._preResolvedPalette) {
        const hJ = (config.hueJitter || 0) + (config.colorJitter ? config.colorJitter * 1.8 : 0);
        const sJ = (config.satJitter || 0) + (config.colorJitter || 0);
        const lJ = (config.lightnessJitter || 0) + (config.colorJitter || 0);
        if (hJ > 0 || sJ > 0 || lJ > 0) {
          return jitterColor(baseColor, hJ, sJ, lJ, rng);
        }
      }
      return baseColor;
    }

    /**
     * Concentric Contour / Inward Loops Pattern
     */
    static _generateContourFills(polygons, bounds, config, strokes, rng) {
      const spacing = Math.max(2, config.spacing || 8);
      const maxDist = Math.max(bounds.width, bounds.height) / 2;

      let loopIdx = 0;
      for (let dist = spacing / 2; dist < maxDist; dist += spacing) {
        for (const poly of polygons) {
          if (poly.length < 3) continue;
          const insetPoly = this._insetPolygon(poly, dist);
          if (!insetPoly || insetPoly.length < 3) continue;

          for (let i = 0; i < insetPoly.length; i++) {
            const p0 = insetPoly[i];
            const p1 = insetPoly[(i + 1) % insetPoly.length];
            this._emitStrokeSegment(p0, p1, config, loopIdx + i, strokes, rng, bounds);
          }
        }
        loopIdx++;
      }
    }

    /**
     * Inset a polygon along vertex normal bisectors
     */
    static _insetPolygon(poly, dist) {
      const n = poly.length;
      const result = [];
      for (let i = 0; i < n; i++) {
        const prev = poly[(i - 1 + n) % n];
        const curr = poly[i];
        const next = poly[(i + 1) % n];

        const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
        const v2 = { x: next.x - curr.x, y: next.y - curr.y };
        const len1 = Math.hypot(v1.x, v1.y) || 1;
        const len2 = Math.hypot(v2.x, v2.y) || 1;

        // Inward normals
        const n1 = { x: -v1.y / len1, y: v1.x / len1 };
        const n2 = { x: -v2.y / len2, y: v2.x / len2 };

        const bisector = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
        const bLen = Math.hypot(bisector.x, bisector.y) || 1;

        result.push({
          x: curr.x + (bisector.x / bLen) * dist,
          y: curr.y + (bisector.y / bLen) * dist
        });
      }
      return result;
    }

    /**
     * Stipple / Pointillism Pattern
     */
    static _generateStippleFills(polygons, bounds, config, strokes, rng) {
      const spacing = Math.max(3, config.spacing || 6);
      const dotCount = Math.floor((bounds.width * bounds.height) / (spacing * spacing));
      const maxSamples = Math.min(2500, dotCount * 2);

      for (let s = 0; s < maxSamples; s++) {
        const x = rng.range(bounds.minX, bounds.maxX);
        const y = rng.range(bounds.minY, bounds.maxY);

        if (!isPointInPolygons(x, y, polygons)) continue;

        const strokeIdx = strokes.length;
        const brushTip = this._pickBrushTip(config, strokeIdx, rng);
        const color = this._pickColor(config, strokeIdx, { x, y }, bounds, rng);
        const width = Math.max(0.5, rng.jitter(config.strokeWidth || 3, config.widthJitter || 0, true));
        const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

        strokes.push({
          type: 'dot',
          p0: { x, y },
          cx: x,
          cy: y,
          width,
          opacity,
          color,
          brushTip,
          flow: config.flow || 100,
          hardness: config.hardness || 95
        });
      }
    }

    /**
     * Scribble / Wandering Continuous Gesture Drawing Pattern
     */
    static _generateScribbleFills(polygons, bounds, config, strokes, rng) {
      const step = Math.max(4, config.spacing || 8);
      let currX = bounds.minX + bounds.width / 2;
      let currY = bounds.minY + bounds.height / 2;
      if (!isPointInPolygons(currX, currY, polygons)) {
        for (let attempt = 0; attempt < 100; attempt++) {
          const rx = rng.range(bounds.minX, bounds.maxX);
          const ry = rng.range(bounds.minY, bounds.maxY);
          if (isPointInPolygons(rx, ry, polygons)) {
            currX = rx;
            currY = ry;
            break;
          }
        }
      }
      let angle = rng.range(0, Math.PI * 2);

      const maxSteps = Math.min(3000, Math.floor((bounds.width * bounds.height) / (step * 2)));

      for (let s = 0; s < maxSteps; s++) {
        angle += rng.range(-Math.PI / 3, Math.PI / 3);
        const nextX = currX + Math.cos(angle) * step;
        const nextY = currY + Math.sin(angle) * step;

        if (!isPointInPolygons(nextX, nextY, polygons)) {
          angle += Math.PI * 0.75;
          continue;
        }

        const p0 = { x: currX, y: currY };
        const p1 = { x: nextX, y: nextY };
        this._emitStrokeSegment(p0, p1, config, s, strokes, rng, bounds);

        currX = nextX;
        currY = nextY;
      }
    }

    /**
     * Zig-Zag Oscillating Hatch Pattern
     */
    static _generateZigZagFills(polygons, bounds, config, strokes, rng) {
      const rad = degToRad(config.angle || 0);
      const spacing = Math.max(2, config.spacing || 10);
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;

      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const yStart = rotBounds.minY - spacing / 2;
      const yEnd = rotBounds.maxY + spacing / 2;
      const ampPct = config.waveAmplitude !== undefined ? config.waveAmplitude : 50;
      const amp = spacing * (ampPct / 100);
      const freq = config.waveFrequency || 8;
      const zigStep = Math.max(3, 100 / Math.max(1, freq));

      let lineIdx = 0;
      for (let y = yStart; y <= yEnd; y += spacing) {
        let allIntersections = [];
        for (const poly of rotatedPolys) {
          const inters = findScanlineIntersections(poly, y);
          allIntersections.push(...inters);
        }
        allIntersections.sort((a, b) => a - b);

        for (let i = 0; i < allIntersections.length - 1; i += 2) {
          const x0 = allIntersections[i];
          const x1 = allIntersections[i + 1];
          let dir = 1;

          for (let x = x0; x < x1; x += zigStep) {
            const nextX = Math.min(x1, x + zigStep);
            const sy0 = y + dir * (amp / 2);
            const sy1 = y - dir * (amp / 2);
            dir = -dir;

            const pt0 = rotatePoint(x, sy0, rad, cx, cy);
            const pt1 = rotatePoint(nextX, sy1, rad, cx, cy);
            this._emitStrokeSegment(pt0, pt1, config, lineIdx, strokes, rng, bounds);
          }
        }
        lineIdx++;
      }
    }

    /**
     * Sinusoidal Wavy Flow Pattern
     */
    static _generateWaveFills(polygons, bounds, config, strokes, rng) {
      const rad = degToRad(config.angle || 0);
      const spacing = Math.max(3, config.spacing || 10);
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;

      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const yStart = rotBounds.minY - spacing / 2;
      const yEnd = rotBounds.maxY + spacing / 2;
      const waveFreq = (config.waveFrequency || 8) * 0.01;
      const ampPct = config.waveAmplitude !== undefined ? config.waveAmplitude : 50;
      const waveAmp = spacing * (ampPct / 100);
      const step = 4;

      let lineIdx = 0;
      for (let y = yStart; y <= yEnd; y += spacing) {
        let allIntersections = [];
        for (const poly of rotatedPolys) {
          const inters = findScanlineIntersections(poly, y);
          allIntersections.push(...inters);
        }
        allIntersections.sort((a, b) => a - b);

        for (let i = 0; i < allIntersections.length - 1; i += 2) {
          const x0 = allIntersections[i];
          const x1 = allIntersections[i + 1];

          for (let x = x0; x < x1; x += step) {
            const nextX = Math.min(x1, x + step);
            const sy0 = y + Math.sin(x * waveFreq) * waveAmp;
            const sy1 = y + Math.sin(nextX * waveFreq) * waveAmp;

            const pt0 = rotatePoint(x, sy0, rad, cx, cy);
            const pt1 = rotatePoint(nextX, sy1, rad, cx, cy);
            this._emitStrokeSegment(pt0, pt1, config, lineIdx, strokes, rng, bounds);
          }
        }
        lineIdx++;
      }
    }

    /**
     * Herringbone / Chevron Interlocking Weave Pattern
     */
    static _generateHerringboneFills(polygons, bounds, config, strokes, rng) {
      const rad = degToRad(config.angle || 0);
      const spacing = Math.max(2, config.spacing || 10);
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;

      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const yStart = rotBounds.minY - spacing;
      const yEnd = rotBounds.maxY + spacing;
      const toothPitch = spacing * 1.5;

      for (let y = yStart; y <= yEnd; y += spacing) {
        let allIntersections = [];
        for (const poly of rotatedPolys) {
          const inters = findScanlineIntersections(poly, y);
          allIntersections.push(...inters);
        }
        allIntersections.sort((a, b) => a - b);

        for (let i = 0; i < allIntersections.length - 1; i += 2) {
          const x0 = allIntersections[i];
          const x1 = allIntersections[i + 1];

          for (let x = x0; x < x1; x += toothPitch) {
            const nextX = Math.min(x1, x + toothPitch);
            const rowIdx = Math.floor(y / spacing);
            const colIdx = Math.floor(x / toothPitch);
            const slant = ((rowIdx + colIdx) % 2 === 0) ? 1 : -1;

            const sy0 = y - slant * (spacing * 0.4);
            const sy1 = y + slant * (spacing * 0.4);

            const pt0 = rotatePoint(x, sy0, rad, cx, cy);
            const pt1 = rotatePoint(nextX, sy1, rad, cx, cy);
            this._emitStrokeSegment(pt0, pt1, config, rowIdx + colIdx, strokes, rng, bounds);
          }
        }
      }
    }

    /**
     * Woven Basketweave Interlocking Blocks Pattern
     */
    static _generateWovenMeshFills(polygons, bounds, config, strokes, rng) {
      const rad = degToRad(config.angle || 0);
      const spacing = Math.max(3, config.spacing || 10);
      const blockSize = spacing * 2.5;
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;

      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const threads = 3;
      const threadStep = blockSize / (threads + 1);

      for (let bx = rotBounds.minX; bx <= rotBounds.maxX; bx += blockSize) {
        for (let by = rotBounds.minY; by <= rotBounds.maxY; by += blockSize) {
          const blockCol = Math.floor(bx / blockSize);
          const blockRow = Math.floor(by / blockSize);
          const isHorizontal = ((blockCol + blockRow) % 2 === 0);

          for (let t = 1; t <= threads; t++) {
            let sx0, sy0, sx1, sy1;
            if (isHorizontal) {
              sx0 = bx;
              sx1 = bx + blockSize;
              sy0 = by + t * threadStep;
              sy1 = sy0;
            } else {
              sx0 = bx + t * threadStep;
              sx1 = sx0;
              sy0 = by;
              sy1 = by + blockSize;
            }

            const midX = (sx0 + sx1) / 2;
            const midY = (sy0 + sy1) / 2;
            const testPt = rotatePoint(midX, midY, rad, cx, cy);

            if (!isPointInPolygons(testPt.x, testPt.y, polygons)) continue;

            const pt0 = rotatePoint(sx0, sy0, rad, cx, cy);
            const pt1 = rotatePoint(sx1, sy1, rad, cx, cy);
            this._emitStrokeSegment(pt0, pt1, config, blockCol + blockRow + t, strokes, rng, bounds);
          }
        }
      }
    }

    /**
     * Radial Rays / Sunburst Pattern
     */
    static _generateRadialFills(polygons, bounds, config, strokes, rng) {
      const origX = config.originX !== undefined ? (config.originX / 100) : 0.5;
      const origY = config.originY !== undefined ? (config.originY / 100) : 0.5;
      const cx = bounds.minX + bounds.width * origX;
      const cy = bounds.minY + bounds.height * origY;

      const maxR = Math.hypot(bounds.width, bounds.height) * 1.5;
      const spacing = Math.max(3, config.spacing || 10);
      const rayCount = Math.max(12, Math.floor((Math.PI * 2 * (maxR / 3)) / spacing));
      const dTheta = (Math.PI * 2) / rayCount;

      const centerInside = isPointInPolygons(cx, cy, polygons);

      for (let rIdx = 0; rIdx < rayCount; rIdx++) {
        let theta = rIdx * dTheta + degToRad(config.angle || 0);
        if (config.lineAngleJitter > 0) {
          theta += degToRad(rng.range(-config.lineAngleJitter, config.lineAngleJitter));
        }

        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const rayP1 = { x: cx + cos * maxR, y: cy + sin * maxR };

        let interDists = [];
        if (centerInside) {
          interDists.push(0);
        }

        for (const poly of polygons) {
          const n = poly.length;
          for (let i = 0; i < n; i++) {
            const v0 = poly[i];
            const v1 = poly[(i + 1) % n];
            const d = lineIntersectionDistance(cx, cy, rayP1.x, rayP1.y, v0.x, v0.y, v1.x, v1.y);
            if (d !== null && d >= 0.0001 && d <= 1) {
              interDists.push(d * maxR);
            }
          }
        }
        interDists.sort((a, b) => a - b);

        for (let i = 0; i < interDists.length - 1; i += 2) {
          const d0 = interDists[i];
          const d1 = interDists[i + 1];
          if (d1 - d0 < 0.5) continue;

          const p0 = { x: cx + cos * d0, y: cy + sin * d0 };
          const p1 = { x: cx + cos * d1, y: cy + sin * d1 };
          this._emitStrokeSegment(p0, p1, config, rIdx, strokes, rng, bounds);
        }
      }
    }

    /**
     * Concentric Rings / Arcs Pattern
     */
    static _generateConcentricFills(polygons, bounds, config, strokes, rng) {
      const origX = config.originX !== undefined ? (config.originX / 100) : 0.5;
      const origY = config.originY !== undefined ? (config.originY / 100) : 0.5;
      const cx = bounds.minX + bounds.width * origX;
      const cy = bounds.minY + bounds.height * origY;

      const maxR = Math.hypot(bounds.width, bounds.height);
      const spacing = Math.max(3, config.spacing || 8);

      let ringIdx = 0;
      for (let r = spacing / 2; r <= maxR; r += spacing) {
        const perimeter = 2 * Math.PI * r;
        const segments = Math.max(12, Math.floor(perimeter / 10));
        const dTheta = (Math.PI * 2) / segments;

        let prevPt = null;
        for (let s = 0; s <= segments; s++) {
          const theta = s * dTheta;
          const x = cx + r * Math.cos(theta);
          const y = cy + r * Math.sin(theta);

          const inside = isPointInPolygons(x, y, polygons);

          if (inside && prevPt) {
            this._emitStrokeSegment(prevPt, { x, y }, config, ringIdx + s, strokes, rng, bounds);
          }

          prevPt = inside ? { x, y } : null;
        }
        ringIdx++;
      }
    }

    /**
     * Cross-Contour 3D Surface Pattern
     */
    static _generateCrossContourFills(polygons, bounds, config, strokes, rng) {
      const origX = config.originX !== undefined ? (config.originX / 100) : 0.5;
      const origY = config.originY !== undefined ? (config.originY / 100) : 0.5;
      const cx = bounds.minX + bounds.width * origX;
      const cy = bounds.minY + bounds.height * origY;
      const spacing = Math.max(3, config.spacing || 10);
      const rad = degToRad(config.angle || 0);

      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const yStart = rotBounds.minY - spacing / 2;
      const yEnd = rotBounds.maxY + spacing / 2;
      const baseCurv = config.curvature !== 0 ? config.curvature : 25;

      let lineIdx = 0;
      for (let y = yStart; y <= yEnd; y += spacing) {
        let allIntersections = [];
        for (const poly of rotatedPolys) {
          const inters = findScanlineIntersections(poly, y);
          allIntersections.push(...inters);
        }
        allIntersections.sort((a, b) => a - b);

        for (let i = 0; i < allIntersections.length - 1; i += 2) {
          const x0 = allIntersections[i];
          const x1 = allIntersections[i + 1];
          const span = x1 - x0;
          if (span < 1) continue;

          const p0 = rotatePoint(x0, y, rad, cx, cy);
          const p1 = rotatePoint(x1, y, rad, cx, cy);
          this._emitStrokeSegment(p0, p1, { ...config, curvature: baseCurv }, lineIdx, strokes, rng, bounds);
        }
        lineIdx++;
      }
    }

    /**
     * Fluid Flow Field / Streamline Curve Pattern
     */
    static _generateFlowFieldFills(polygons, bounds, config, strokes, rng) {
      const spacing = Math.max(4, config.spacing || 10);
      const baseRad = degToRad(config.angle || 0);
      const freq = ((config.waveFrequency || 8) * 0.005);
      const stepLen = spacing * 0.8;
      const numSteps = 8;
      const seed = config.seed || 42;

      let streamIdx = 0;
      for (let gx = bounds.minX + spacing / 2; gx <= bounds.maxX; gx += spacing) {
        for (let gy = bounds.minY + spacing / 2; gy <= bounds.maxY; gy += spacing) {
          let currX = gx + rng.range(-spacing / 3, spacing / 3);
          let currY = gy + rng.range(-spacing / 3, spacing / 3);

          if (!isPointInPolygons(currX, currY, polygons)) continue;

          let prevPt = { x: currX, y: currY };
          for (let step = 0; step < numSteps; step++) {
            const flowAngle = baseRad + (Math.sin(currX * freq + seed) * Math.cos(currY * freq + seed * 0.7)) * Math.PI * 1.5;
            const nextX = currX + Math.cos(flowAngle) * stepLen;
            const nextY = currY + Math.sin(flowAngle) * stepLen;

            if (!isPointInPolygons(nextX, nextY, polygons)) break;

            const p0 = prevPt;
            const p1 = { x: nextX, y: nextY };
            this._emitStrokeSegment(p0, p1, config, streamIdx + step, strokes, rng, bounds);

            currX = nextX;
            currY = nextY;
            prevPt = { x: currX, y: currY };
          }
          streamIdx++;
        }
      }
    }

    /**
     * Voronoi Cellular Facet Pattern
     */
    static _generateVoronoiFills(polygons, bounds, config, strokes, rng) {
      const spacing = Math.max(6, config.spacing || 12);
      const cellSize = spacing * 2.2;
      const seeds = [];

      for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
        for (let y = bounds.minY; y <= bounds.maxY; y += cellSize) {
          const sx = x + rng.range(cellSize * 0.2, cellSize * 0.8);
          const sy = y + rng.range(cellSize * 0.2, cellSize * 0.8);
          seeds.push({ x: sx, y: sy });
        }
      }

      for (let i = 0; i < seeds.length; i++) {
        const s1 = seeds[i];
        for (let j = i + 1; j < seeds.length; j++) {
          const s2 = seeds[j];
          const dist = Math.hypot(s2.x - s1.x, s2.y - s1.y);
          if (dist > cellSize * 1.5) continue;

          const midX = (s1.x + s2.x) / 2;
          const midY = (s1.y + s2.y) / 2;
          const dx = s2.x - s1.x;
          const dy = s2.y - s1.y;
          const ridgeLen = cellSize * 0.6;
          const nx = -dy / dist;
          const ny = dx / dist;

          const p0 = { x: midX - nx * (ridgeLen / 2), y: midY - ny * (ridgeLen / 2) };
          const p1 = { x: midX + nx * (ridgeLen / 2), y: midY + ny * (ridgeLen / 2) };

          if (!isPointInPolygons(midX, midY, polygons)) continue;

          this._emitStrokeSegment(p0, p1, config, i + j, strokes, rng, bounds);
        }
      }
    }

    /**
     * Archimedean Spiral Pattern
     */
    static _generateSpiralFills(polygons, bounds, config, strokes, rng) {
      const origX = config.originX !== undefined ? (config.originX / 100) : 0.5;
      const origY = config.originY !== undefined ? (config.originY / 100) : 0.5;
      const cx = bounds.minX + bounds.width * origX;
      const cy = bounds.minY + bounds.height * origY;
      const spacing = Math.max(3, config.spacing || 8);
      const b = spacing / (2 * Math.PI);
      const maxR = Math.hypot(bounds.width, bounds.height) / 2;
      const maxTheta = maxR / b;
      const thetaStep = 0.15;

      let prevPt = null;

      for (let theta = 0; theta < maxTheta; theta += thetaStep) {
        const r = b * theta;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);

        const inside = isPointInPolygons(x, y, polygons);

        if (inside && prevPt) {
          this._emitStrokeSegment(prevPt, { x, y }, config, Math.floor(theta), strokes, rng, bounds);
        }

        prevPt = inside ? { x, y } : null;
      }
    }

    /**
     * Render generated strokes into an SVG group `<g>` element string
     */
    static toSVGGroup(strokes, clipPathId = null, clipMode = 'bleed') {
      if (!strokes || strokes.length === 0) return '';
      const linesXml = strokes.map(s => {
        let d = '';
        if (s.type === 'cubic' && s.cp1 && s.cp2) {
          d = `M ${s.p0.x.toFixed(1)} ${s.p0.y.toFixed(1)} C ${s.cp1.x.toFixed(1)} ${s.cp1.y.toFixed(1)}, ${s.cp2.x.toFixed(1)} ${s.cp2.y.toFixed(1)}, ${s.p1.x.toFixed(1)} ${s.p1.y.toFixed(1)}`;
        } else if (s.type === 'poly' && s.points && s.points.length > 0) {
          d = `M ${s.points[0].x.toFixed(1)} ${s.points[0].y.toFixed(1)} ` + s.points.slice(1).map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        } else if (s.type === 'curve' && s.cp) {
          d = `M ${s.p0.x.toFixed(1)} ${s.p0.y.toFixed(1)} Q ${s.cp.x.toFixed(1)} ${s.cp.y.toFixed(1)} ${s.p1.x.toFixed(1)} ${s.p1.y.toFixed(1)}`;
        } else if (s.type === 'dot') {
          return `<circle cx="${s.p0.x.toFixed(1)}" cy="${s.p0.y.toFixed(1)}" r="${(s.width / 2).toFixed(1)}" fill="${s.color}" fill-opacity="${s.opacity.toFixed(2)}" />`;
        } else {
          d = `M ${s.p0.x.toFixed(1)} ${s.p0.y.toFixed(1)} L ${s.p1.x.toFixed(1)} ${s.p1.y.toFixed(1)}`;
        }
        return `<path d="${d}" stroke="${s.color}" stroke-width="${s.width.toFixed(1)}" stroke-opacity="${s.opacity.toFixed(2)}" stroke-linecap="round" fill="none" />`;
      }).join('\n      ');

      const clipAttr = (clipPathId && clipMode === 'strict') ? ` clip-path="url(#${clipPathId})"` : '';
      return `<g class="esenho-brush-fill"${clipAttr}>\n      ${linesXml}\n    </g>`;
    }

    /**
     * Retrieves all available brush fill presets from registry.
     * @returns {Array<Object>}
     */
    static getPresets(category = null) {
      const reg = getRegistry();
      if (!reg || typeof reg.list !== 'function') return [];
      let list = reg.list('brush_fill');
      if (!list || list.length === 0) {
        list = reg.list('material').filter(m => m.category === 'brushfills' || m.mode === 'brushfill');
      }
      if (category) {
        list = list.filter(p => p.category === category);
      }
      return list;
    }

    /**
     * Retrieves a brush fill preset by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    static getPreset(id) {
      if (!id) return null;
      const reg = getRegistry();
      if (!reg) return null;
      return reg.get('brush_fill', id) || reg.get('material', id) || null;
    }

    /**
     * Registers a custom brush fill preset.
     * @param {Object} preset
     * @returns {Object} registered preset
     */
    static registerPreset(preset) {
      if (!preset || !preset.id) throw new Error('Preset must contain a valid id');
      const reg = getRegistry();
      if (!reg || typeof reg.register !== 'function') return preset;
      return reg.register('brush_fill', preset);
    }

    /**
     * Resolves a brush fill configuration with all defaults applied.
     * @param {string|Object} cfgOrId
     * @param {Object} [overrides]
     * @returns {Object}
     */
    static resolveConfig(cfgOrId, overrides = {}) {
      if (typeof cfgOrId === 'string') {
        const preset = this.getPreset(cfgOrId);
        const base = preset ? (preset.brushFill || preset) : {};
        return { ...DEFAULT_BRUSH_FILL_CONFIG, ...base, ...overrides };
      }
      return { ...DEFAULT_BRUSH_FILL_CONFIG, ...cfgOrId, ...overrides };
    }
  }

  // ── 3. Preset Library for Brush / Hatch Fills ──

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

  const BUILTIN_BRUSH_FILL_PRESETS = new Proxy([], {
    get(target, prop) {
      const reg = getRegistry();
      let list = (reg && typeof reg.list === 'function') ? reg.list('brush_fill') : [];
      if (!list || list.length === 0) {
        list = (reg && typeof reg.list === 'function')
          ? reg.list('material').filter(m => m.category === 'brushfills' || m.mode === 'brushfill')
          : [];
      }
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

  // ── 4. Export & Environment Bindings ──

  const exportsObj = {
    BrushFillEngine,
    DEFAULT_BRUSH_FILL_CONFIG,
    BUILTIN_BRUSH_FILL_PRESETS,
    getNativeBrushPresets,
    FastRandom,
    sampleGradientAtPoint,
    isPointInPolygon,
    isPointInPolygons,
    findScanlineIntersections,
    getPolygonsBounds
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  if (typeof window !== 'undefined') {
    window.BrushFillEngine = BrushFillEngine;
    window.DEFAULT_BRUSH_FILL_CONFIG = DEFAULT_BRUSH_FILL_CONFIG;
    window.BUILTIN_BRUSH_FILL_PRESETS = BUILTIN_BRUSH_FILL_PRESETS;
    window.getNativeBrushPresets = getNativeBrushPresets;
    window.sampleGradientAtPoint = sampleGradientAtPoint;
    if (!window.esenho) window.esenho = {};
    window.esenho.BrushFillEngine = BrushFillEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
