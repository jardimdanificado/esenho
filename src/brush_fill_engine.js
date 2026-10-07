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

  // ── 1.5. Native Brush Preset Resolution ──
  function getNativeBrushPresets() {
    let presets = {};
    if (typeof BRUSH_PRESETS !== 'undefined') {
      presets = { ...BRUSH_PRESETS };
    } else if (typeof window !== 'undefined' && window.BRUSH_PRESETS) {
      presets = { ...window.BRUSH_PRESETS };
    } else if (typeof globalThis !== 'undefined' && globalThis.BRUSH_PRESETS) {
      presets = { ...globalThis.BRUSH_PRESETS };
    } else if (typeof require === 'function') {
      try {
        const es = require('./esenho.js');
        if (es && es.BRUSH_PRESETS) presets = { ...es.BRUSH_PRESETS };
      } catch (_) {}
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('esenho_custom_brush_presets_v1');
        if (stored) {
          const custom = JSON.parse(stored);
          Object.assign(presets, custom);
        }
      }
    } catch (_) {}
    return presets;
  }

  // ── 2. Procedural Brush Fill Generator ──

  const DEFAULT_BRUSH_FILL_CONFIG = {
    enabled: true,
    pattern: 'linear',           // 'linear' | 'crosshatch' | 'triple_hatch' | 'contour' | 'stipple' | 'scribble' | 'zigzag' | 'wave' | 'spiral'
    spacing: 8,                  // Spacing / Pitch between lines or grid cells (px)
    angle: 45,                   // Primary angle in degrees (0 - 360)
    angle2: 135,                 // Secondary angle for cross-hatch (0 - 360)
    angle3: 90,                  // Tertiary angle for triple-hatch (0 - 360)
    
    // Strokes per line & segmentation
    strokesPerLine: 1,           // Number of subdivided strokes along each line interval
    strokeLength: 0,             // 0 = full segment across boundary, >0 = explicit length in px
    strokeGap: 4,                // Gap between successive strokes along a line (px)

    // Multi-Brush Tip Cycling from Native Brush Engine
    brushList: ['pencil'],       // Array of real native brush presets: ['pencil', 'soft_pencil', 'tech_pen', 'gpen', 'dry_ink', 'oil', 'acrylic', 'watercolor', 'charcoal', 'marker', etc.]
    brushPickMode: 'cycle',      // 'cycle' | 'random' | 'alternate'

    // Multi-Color Palette
    colorMode: 'palette',        // 'solid' | 'palette' | 'gradient' | 'random'
    colorPalette: ['#fabd2f'],   // Array of colors for strokes
    colorPickMode: 'cycle',      // 'cycle' | 'random' | 'gradient'

    // Base Stroke Properties
    strokeWidth: 2,              // Base stroke width in px
    strokeOpacity: 0.9,          // Base stroke opacity (0.0 to 1.0)
    flow: 100,                   // Flow %
    hardness: 95,                // Hardness %
    curvature: 0,                // Base curvature / bend (-100 to 100)

    // Parameter Jitters & Variance (o quanto cada traço pode variar)
    angleJitter: 0,              // Max angle variation (± degrees)
    lengthJitter: 0,             // Max stroke length variation (± %)
    widthJitter: 0,              // Max stroke width variation (± %)
    opacityJitter: 0,            // Max opacity variation (± %)
    positionJitter: 0,           // Max spatial position offset (± px)
    curvatureJitter: 0,          // Max curvature variation
    colorJitter: 0,              // Max color Hue/Sat/Val variation (± %)

    // Boundary Bleed & Overshoot (o quanto pode ir além das delimitações)
    clipMode: 'bleed',           // 'strict' (exact clip) | 'bleed' (overshoot beyond contour) | 'soft_clip'
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
      const rad = degToRad(angleDeg);
      const spacing = Math.max(1, config.spacing || 8);
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;

      // Rotate all polygons into scanline alignment space (where hatch lines are horizontal)
      const rotatedPolys = polygons.map(poly =>
        poly.map(p => rotatePoint(p.x, p.y, -rad, cx, cy))
      );
      const rotBounds = getPolygonsBounds(rotatedPolys);

      const yStart = rotBounds.minY - spacing / 2;
      const yEnd = rotBounds.maxY + spacing / 2;

      let lineIdx = 0;
      for (let y = yStart; y <= yEnd; y += spacing) {
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

          this._subdivideAndEmitStroke(x0, x1, y, rad, cx, cy, config, lineIdx, strokes, rng, bounds);
        }
        lineIdx++;
      }
    }

    /**
     * Subdivide horizontal interval [x0, x1] into individual brush strokes with jitters & bleed
     */
    static _subdivideAndEmitStroke(x0, x1, y, rad, cx, cy, config, lineIdx, strokes, rng, bounds) {
      const fullSpan = x1 - x0;
      const count = Math.max(1, config.strokesPerLine || 1);
      const gap = Math.max(0, config.strokeGap || 0);

      // Bleed / Overshoot calculation
      let bleed0 = 0, bleed1 = 0;
      if (config.clipMode === 'bleed' && config.bleedDistance > 0) {
        if (rng.range(0, 100) <= (config.bleedProbability !== undefined ? config.bleedProbability : 100)) {
          bleed0 = rng.jitter(config.bleedDistance, config.bleedJitter || 0, true);
          bleed1 = rng.jitter(config.bleedDistance, config.bleedJitter || 0, true);
        }
      }

      const totalX0 = x0 - Math.max(0, bleed0);
      const totalX1 = x1 + Math.max(0, bleed1);
      const totalLen = totalX1 - totalX0;

      let segmentLen = (totalLen - gap * (count - 1)) / count;
      if (config.strokeLength > 0) {
        segmentLen = Math.min(segmentLen, config.strokeLength);
      }

      for (let k = 0; k < count; k++) {
        let sx0 = totalX0 + k * (segmentLen + gap);
        let sx1 = sx0 + segmentLen;
        if (sx0 >= totalX1) break;
        if (sx1 > totalX1) sx1 = totalX1;

        // Length jitter
        if (config.lengthJitter > 0) {
          const lFactor = rng.jitter(1.0, config.lengthJitter, true);
          const midX = (sx0 + sx1) / 2;
          const halfL = ((sx1 - sx0) * lFactor) / 2;
          sx0 = midX - halfL;
          sx1 = midX + halfL;
        }

        // Position jitter (perpendicular & parallel offset in rotated space)
        let offsetY = 0, offsetX = 0;
        if (config.positionJitter > 0) {
          offsetY = rng.range(-config.positionJitter, config.positionJitter);
          offsetX = rng.range(-config.positionJitter / 2, config.positionJitter / 2);
        }

        const sy0 = y + offsetY;
        const sy1 = y + offsetY;
        sx0 += offsetX;
        sx1 += offsetX;

        // Angle Jitter
        let strokeRad = rad;
        if (config.angleJitter > 0) {
          strokeRad += degToRad(rng.range(-config.angleJitter, config.angleJitter));
        }

        // Transform stroke back to world coordinates
        const pt0 = rotatePoint(sx0, sy0, strokeRad, cx, cy);
        const pt1 = rotatePoint(sx1, sy1, strokeRad, cx, cy);

        // Curvature / Midpoint bend
        let cp = null;
        const baseCurv = rng.jitter(config.curvature || 0, config.curvatureJitter || 0);
        if (Math.abs(baseCurv) > 0.5) {
          const midX = (sx0 + sx1) / 2;
          const midY = (sy0 + sy1) / 2 + (baseCurv * (sx1 - sx0) * 0.01);
          cp = rotatePoint(midX, midY, strokeRad, cx, cy);
        }

        // Multi-Brush & Multi-Color picking
        const strokeIdx = strokes.length;
        const brushTip = this._pickBrushTip(config, strokeIdx, rng);
        const color = this._pickColor(config, strokeIdx, pt0, bounds, rng);
        const width = Math.max(0.5, rng.jitter(config.strokeWidth || 2, config.widthJitter || 0, true));
        const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

        strokes.push({
          type: cp ? 'curve' : 'line',
          p0: pt0,
          p1: pt1,
          cp: cp,
          width,
          opacity,
          color,
          brushTip,
          flow: config.flow !== undefined ? config.flow : 100,
          hardness: config.hardness !== undefined ? config.hardness : 95,
          lineIdx,
          segmentIdx: k
        });
      }
    }

    /**
     * Pick brush tip shape and properties for the current stroke from native brush engine
     */
    static _pickBrushTip(config, strokeIdx, rng) {
      const list = (config.brushList && config.brushList.length > 0) ? config.brushList : ['pencil'];
      let chosenKey = list[0];

      if (config.brushPickMode === 'random') {
        chosenKey = list[Math.floor(rng.next() * list.length)];
      } else if (config.brushPickMode === 'alternate') {
        chosenKey = list[strokeIdx % 2];
      } else {
        // 'cycle'
        chosenKey = list[strokeIdx % list.length];
      }

      const allPresets = getNativeBrushPresets();
      const preset = allPresets[chosenKey] || allPresets[chosenKey?.toLowerCase()] || {};

      const brushConfig = {
        preset: chosenKey,
        name: preset.name || chosenKey,
        shape: preset.shape || 'circle',
        hardness: preset.hardness !== undefined ? preset.hardness : (config.hardness !== undefined ? config.hardness : 95),
        flow: preset.flow !== undefined ? preset.flow : (config.flow !== undefined ? config.flow : 100),
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
        ...preset
      };

      return {
        key: chosenKey,
        name: preset.name || chosenKey,
        shape: preset.shape || 'circle',
        hardness: brushConfig.hardness,
        flow: brushConfig.flow,
        brushConfig
      };
    }

    /**
     * Pick color for the stroke based on palette, gradient map, or HSL jitter
     */
    static _pickColor(config, strokeIdx, pt, bounds, rng) {
      const palette = (config.colorPalette && config.colorPalette.length > 0) ? config.colorPalette : ['#fabd2f'];
      let baseColor = palette[0];

      if (config.colorMode === 'solid') {
        baseColor = palette[0] || '#fabd2f';
      } else if (config.colorMode === 'gradient') {
        // Map stroke position normalized along bounding box width/height
        const t = clamp((pt.x - bounds.minX) / bounds.width, 0, 1);
        const palIdx = Math.min(palette.length - 1, Math.floor(t * palette.length));
        baseColor = palette[palIdx];
      } else if (config.colorPickMode === 'random') {
        baseColor = palette[Math.floor(rng.next() * palette.length)];
      } else {
        // 'cycle'
        baseColor = palette[strokeIdx % palette.length];
      }

      if (config.colorJitter > 0) {
        return jitterColor(baseColor, config.colorJitter * 1.8, config.colorJitter, config.colorJitter, rng);
      }
      return baseColor;
    }

    /**
     * Concentric Contour / Inward Loops Pattern
     */
    static _generateContourFills(polygons, bounds, config, strokes, rng) {
      const spacing = Math.max(2, config.spacing || 8);
      const maxDist = Math.max(bounds.width, bounds.height) / 2;

      for (let dist = spacing / 2; dist < maxDist; dist += spacing) {
        // Offset polygons inward by distance `dist`
        for (const poly of polygons) {
          if (poly.length < 3) continue;
          const insetPoly = this._insetPolygon(poly, dist);
          if (!insetPoly || insetPoly.length < 3) continue;

          for (let i = 0; i < insetPoly.length; i++) {
            const p0 = insetPoly[i];
            const p1 = insetPoly[(i + 1) % insetPoly.length];

            const strokeIdx = strokes.length;
            const brushTip = this._pickBrushTip(config, strokeIdx, rng);
            const color = this._pickColor(config, strokeIdx, p0, bounds, rng);
            const width = Math.max(0.5, rng.jitter(config.strokeWidth || 2, config.widthJitter || 0, true));
            const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

            strokes.push({
              type: 'line',
              p0,
              p1,
              width,
              opacity,
              color,
              brushTip,
              flow: config.flow || 100,
              hardness: config.hardness || 95
            });
          }
        }
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
     * Stippling / Particle Point Dabs Pattern
     */
    static _generateStippleFills(polygons, bounds, config, strokes, rng) {
      const spacing = Math.max(3, config.spacing || 6);
      const dotCount = Math.floor((bounds.width * bounds.height) / (spacing * spacing));
      const maxSamples = Math.min(2500, dotCount * 2);

      for (let s = 0; s < maxSamples; s++) {
        const x = rng.range(bounds.minX, bounds.maxX);
        const y = rng.range(bounds.minY, bounds.maxY);

        let inside = false;
        for (const poly of polygons) {
          if (isPointInPolygon(x, y, poly)) {
            inside = true;
            break;
          }
        }
        if (!inside) continue;

        const strokeIdx = strokes.length;
        const brushTip = this._pickBrushTip(config, strokeIdx, rng);
        const color = this._pickColor(config, strokeIdx, { x, y }, bounds, rng);
        const width = Math.max(0.5, rng.jitter(config.strokeWidth || 3, config.widthJitter || 0, true));
        const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

        strokes.push({
          type: 'dot',
          p0: { x, y },
          p1: { x: x + 0.1, y: y + 0.1 },
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
     * Scribble / Meandering Random-Walk Pattern
     */
    static _generateScribbleFills(polygons, bounds, config, strokes, rng) {
      const step = Math.max(4, config.spacing || 8);
      let currX = bounds.minX + bounds.width / 2;
      let currY = bounds.minY + bounds.height / 2;
      let angle = rng.range(0, Math.PI * 2);

      const maxSteps = Math.min(3000, Math.floor((bounds.width * bounds.height) / (step * 2)));

      for (let s = 0; s < maxSteps; s++) {
        angle += rng.range(-Math.PI / 3, Math.PI / 3);
        const nextX = currX + Math.cos(angle) * step;
        const nextY = currY + Math.sin(angle) * step;

        let inside = false;
        for (const poly of polygons) {
          if (isPointInPolygon(nextX, nextY, poly)) {
            inside = true;
            break;
          }
        }

        if (!inside) {
          // Bounce or steer toward center
          angle += Math.PI * 0.75;
          continue;
        }

        const strokeIdx = strokes.length;
        const brushTip = this._pickBrushTip(config, strokeIdx, rng);
        const color = this._pickColor(config, strokeIdx, { x: currX, y: currY }, bounds, rng);
        const width = Math.max(0.5, rng.jitter(config.strokeWidth || 2, config.widthJitter || 0, true));
        const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

        strokes.push({
          type: 'line',
          p0: { x: currX, y: currY },
          p1: { x: nextX, y: nextY },
          width,
          opacity,
          color,
          brushTip,
          flow: config.flow || 100,
          hardness: config.hardness || 95
        });

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
      const amp = spacing * 0.8;
      const zigStep = Math.max(4, spacing / 2);

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

            const strokeIdx = strokes.length;
            const brushTip = this._pickBrushTip(config, strokeIdx, rng);
            const color = this._pickColor(config, strokeIdx, pt0, bounds, rng);
            const width = Math.max(0.5, rng.jitter(config.strokeWidth || 2, config.widthJitter || 0, true));
            const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

            strokes.push({
              type: 'line',
              p0: pt0,
              p1: pt1,
              width,
              opacity,
              color,
              brushTip,
              flow: config.flow || 100,
              hardness: config.hardness || 95
            });
          }
        }
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
      const waveFreq = 0.08;
      const waveAmp = spacing * 0.45;
      const step = 4;

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

            const strokeIdx = strokes.length;
            const brushTip = this._pickBrushTip(config, strokeIdx, rng);
            const color = this._pickColor(config, strokeIdx, pt0, bounds, rng);
            const width = Math.max(0.5, rng.jitter(config.strokeWidth || 2, config.widthJitter || 0, true));
            const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

            strokes.push({
              type: 'line',
              p0: pt0,
              p1: pt1,
              width,
              opacity,
              color,
              brushTip,
              flow: config.flow || 100,
              hardness: config.hardness || 95
            });
          }
        }
      }
    }

    /**
     * Archimedean Spiral Pattern
     */
    static _generateSpiralFills(polygons, bounds, config, strokes, rng) {
      const cx = bounds.minX + bounds.width / 2;
      const cy = bounds.minY + bounds.height / 2;
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

        let inside = false;
        for (const poly of polygons) {
          if (isPointInPolygon(x, y, poly)) {
            inside = true;
            break;
          }
        }

        if (inside && prevPt) {
          const strokeIdx = strokes.length;
          const brushTip = this._pickBrushTip(config, strokeIdx, rng);
          const color = this._pickColor(config, strokeIdx, prevPt, bounds, rng);
          const width = Math.max(0.5, rng.jitter(config.strokeWidth || 2, config.widthJitter || 0, true));
          const opacity = clamp(rng.jitter(config.strokeOpacity !== undefined ? config.strokeOpacity : 0.9, config.opacityJitter || 0, true), 0.01, 1.0);

          strokes.push({
            type: 'line',
            p0: prevPt,
            p1: { x, y },
            width,
            opacity,
            color,
            brushTip,
            flow: config.flow || 100,
            hardness: config.hardness || 95
          });
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
        if (s.type === 'curve' && s.cp) {
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
  }

  // ── 3. Preset Library for Brush / Hatch Fills ──

  const BUILTIN_BRUSH_FILL_PRESETS = [
    {
      id: 'hatch_classic_pen',
      name: 'Classic Ink Crosshatch',
      desc: 'Fine mechanical cross-hatching for drafting and engraving',
      config: {
        enabled: true,
        pattern: 'crosshatch',
        spacing: 6,
        angle: 45,
        angle2: 135,
        strokeWidth: 1.2,
        strokeOpacity: 0.85,
        colorPalette: ['#1d2021'],
        brushList: ['tech_pen'],
        clipMode: 'strict'
      }
    },
    {
      id: 'hatch_loose_sketch',
      name: 'Loose Sketch Overshoot',
      desc: 'Hand-drawn artist hatching with natural bleed beyond contour',
      config: {
        enabled: true,
        pattern: 'linear',
        spacing: 8,
        angle: 35,
        strokesPerLine: 2,
        strokeGap: 3,
        strokeWidth: 2,
        strokeOpacity: 0.8,
        angleJitter: 6,
        lengthJitter: 20,
        widthJitter: 15,
        positionJitter: 2,
        clipMode: 'bleed',
        bleedDistance: 8,
        bleedJitter: 50,
        colorPalette: ['#282828'],
        brushList: ['pencil', 'soft_pencil']
      }
    },
    {
      id: 'hatch_color_stipple',
      name: 'Pointillist Color Stippling',
      desc: 'Multi-color dispersed particle dabs inspired by Seurat',
      config: {
        enabled: true,
        pattern: 'stipple',
        spacing: 5,
        strokeWidth: 3,
        strokeOpacity: 0.9,
        colorMode: 'palette',
        colorPalette: ['#fe8019', '#fabd2f', '#b8bb26', '#8ec07c', '#83a598', '#d3869b'],
        colorPickMode: 'random',
        colorJitter: 10,
        widthJitter: 30,
        opacityJitter: 20,
        brushList: ['spray', 'dry_ink'],
        clipMode: 'strict'
      }
    },
    {
      id: 'hatch_woodcut',
      name: 'Woodcut Vintage Engraving',
      desc: 'Dense wavy timber lines with expressive weight jitters',
      config: {
        enabled: true,
        pattern: 'wave',
        spacing: 7,
        angle: 15,
        strokeWidth: 2.5,
        strokeOpacity: 0.95,
        widthJitter: 40,
        colorPalette: ['#282828'],
        brushList: ['gpen', 'dry_ink'],
        clipMode: 'strict'
      }
    },
    {
      id: 'hatch_pastel_scribble',
      name: 'Pastel Chalk Scribble',
      desc: 'Energetic continuous wandering scribble fill',
      config: {
        enabled: true,
        pattern: 'scribble',
        spacing: 6,
        strokeWidth: 2.2,
        strokeOpacity: 0.75,
        colorPalette: ['#d79921', '#fe8019'],
        colorPickMode: 'cycle',
        widthJitter: 25,
        brushList: ['soft_pastel', 'charcoal'],
        clipMode: 'bleed',
        bleedDistance: 4
      }
    },
    {
      id: 'hatch_sci_flow',
      name: 'Cyber Flow Vector Grid',
      desc: 'Neon-pulsed zig-zag flow field with color cycling',
      config: {
        enabled: true,
        pattern: 'zigzag',
        spacing: 10,
        angle: 90,
        strokeWidth: 1.8,
        strokeOpacity: 0.95,
        colorMode: 'palette',
        colorPalette: ['#00ffcc', '#ff0055', '#7928ca'],
        colorPickMode: 'cycle',
        brushList: ['marker', 'tech_pen'],
        clipMode: 'strict'
      }
    },
    {
      id: 'hatch_watercolor_wash',
      name: 'Watercolor Wet Flow',
      desc: 'Gentle undulating fluid wash lines with watercolor edge bleeding',
      config: {
        enabled: true,
        pattern: 'wave',
        spacing: 9,
        angle: 25,
        strokeWidth: 4,
        strokeOpacity: 0.65,
        colorMode: 'palette',
        colorPalette: ['#83a598', '#458588', '#8ec07c'],
        colorPickMode: 'cycle',
        brushList: ['watercolor', 'gouache'],
        widthJitter: 30,
        opacityJitter: 25,
        clipMode: 'bleed',
        bleedDistance: 6
      }
    },
    {
      id: 'hatch_charcoal_cross',
      name: 'Charcoal Rough Shading',
      desc: 'Crosshatched grainy charcoal strokes for academic drawing',
      config: {
        enabled: true,
        pattern: 'crosshatch',
        spacing: 7,
        angle: 30,
        angle2: 120,
        strokeWidth: 2.8,
        strokeOpacity: 0.85,
        colorPalette: ['#1d2021', '#3c3836'],
        brushList: ['charcoal', 'soft_pencil'],
        angleJitter: 4,
        widthJitter: 25,
        lengthJitter: 15,
        clipMode: 'bleed',
        bleedDistance: 5
      }
    }
  ];

  // ── 4. Export & Environment Bindings ──

  const exportsObj = {
    BrushFillEngine,
    DEFAULT_BRUSH_FILL_CONFIG,
    BUILTIN_BRUSH_FILL_PRESETS,
    getNativeBrushPresets,
    FastRandom,
    isPointInPolygon,
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
    if (!window.esenho) window.esenho = {};
    window.esenho.BrushFillEngine = BrushFillEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
