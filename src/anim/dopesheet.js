/**
 * =========================================================================
 * Wesenho DopeSheet & Universal Parameter Animation System (src/anim/dopesheet.js)
 * Full keyframe interpolation for all Quadro Engine parameters:
 * Transform, Brush Dynamics, Material/Fill, Multiplane Camera & FX.
 * =========================================================================
 */

import { Easing } from './animator_engine.js';

/** Color helper: parses Hex (#RRGGBB / #RRGGBBAA / #RGB), rgba(), or integer 0xAABBGGRR into {r,g,b,a} */
export function parseColor(c) {
  if (typeof c === 'object' && c !== null && 'r' in c) {
    return { r: c.r, g: c.g, b: c.b, a: c.a !== undefined ? c.a : 1.0 };
  }
  if (typeof c === 'number') {
    return {
      r: c & 0xFF,
      g: (c >> 8) & 0xFF,
      b: (c >> 16) & 0xFF,
      a: ((c >> 24) & 0xFF) / 255
    };
  }
  if (typeof c === 'string') {
    c = c.trim();
    if (c.startsWith('#')) {
      let hex = c.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: 1.0
        };
      }
      if (hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: parseInt(hex.slice(6, 8), 16) / 255
        };
      }
    }
    const rgbaMatch = c.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (rgbaMatch) {
      return {
        r: parseFloat(rgbaMatch[1]),
        g: parseFloat(rgbaMatch[2]),
        b: parseFloat(rgbaMatch[3]),
        a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0
      };
    }
  }
  return { r: 255, g: 255, b: 255, a: 1.0 };
}

/** Color helper: formats {r,g,b,a} into CSS hex or rgba string */
export function formatColor(c, format = 'hex') {
  const r = Math.max(0, Math.min(255, Math.round(c.r)));
  const g = Math.max(0, Math.min(255, Math.round(c.g)));
  const b = Math.max(0, Math.min(255, Math.round(c.b)));
  const a = Math.max(0, Math.min(1, c.a !== undefined ? c.a : 1.0));
  if (format === 'hex' && a >= 0.999) {
    const toHex = v => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

/** Interpolates two colors smoothly */
export function lerpColor(c1, c2, t, format = 'hex') {
  const p1 = parseColor(c1);
  const p2 = parseColor(c2);
  const res = {
    r: p1.r + (p2.r - p1.r) * t,
    g: p1.g + (p2.g - p1.g) * t,
    b: p1.b + (p2.b - p1.b) * t,
    a: p1.a + (p2.a - p1.a) * t
  };
  return formatColor(res, format);
}

/** Shortest-path angle interpolation in degrees */
export function lerpAngle(a1, a2, t) {
  let diff = (a2 - a1) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return a1 + diff * t;
}

/**
 * Parameter Definitions Registry
 * Exhaustive coverage of all Quadro Engine parameters:
 * Transform, Geometry, Stroke, Fill, Gradients, Brush Dynamics & Physics (quadro.c),
 * Filters/Layer FX, Multiplane Camera, Armatures & Audio DSP.
 */
export const PARAMETER_REGISTRY = {
  // ── Transform Group ──
  x: { label: 'Position X', group: 'Transform', type: 'number', default: 0, unit: 'px', step: 1 },
  y: { label: 'Position Y', group: 'Transform', type: 'number', default: 0, unit: 'px', step: 1 },
  zDepth: { label: 'Z Depth', group: 'Transform', type: 'number', default: 0, unit: 'px', step: 1 },
  scaleX: { label: 'Scale X', group: 'Transform', type: 'number', default: 1.0, min: 0.001, max: 50, step: 0.01 },
  scaleY: { label: 'Scale Y', group: 'Transform', type: 'number', default: 1.0, min: 0.001, max: 50, step: 0.01 },
  rotation: { label: 'Rotation', group: 'Transform', type: 'angle', default: 0, unit: '°', step: 1 },
  skewX: { label: 'Skew X', group: 'Transform', type: 'angle', default: 0, unit: '°', step: 1 },
  skewY: { label: 'Skew Y', group: 'Transform', type: 'angle', default: 0, unit: '°', step: 1 },
  opacity: { label: 'Opacity', group: 'Transform', type: 'number', default: 1.0, min: 0, max: 1, step: 0.01 },
  originX: { label: 'Pivot X', group: 'Transform', type: 'number', default: 0, unit: 'px', step: 1 },
  originY: { label: 'Pivot Y', group: 'Transform', type: 'number', default: 0, unit: 'px', step: 1 },

  // ── Geometry & Dimensions Group ──
  width: { label: 'Width', group: 'Geometry', type: 'number', default: 100, min: 1, max: 10000, unit: 'px', step: 1 },
  height: { label: 'Height', group: 'Geometry', type: 'number', default: 100, min: 1, max: 10000, unit: 'px', step: 1 },
  radius: { label: 'Radius', group: 'Geometry', type: 'number', default: 50, min: 1, max: 5000, unit: 'px', step: 1 },
  rx: { label: 'Radius X', group: 'Geometry', type: 'number', default: 50, min: 1, max: 5000, unit: 'px', step: 1 },
  ry: { label: 'Radius Y', group: 'Geometry', type: 'number', default: 50, min: 1, max: 5000, unit: 'px', step: 1 },
  cornerRadius: { label: 'Corner Radius', group: 'Geometry', type: 'number', default: 0, min: 0, max: 500, unit: 'px', step: 1 },
  polygonSides: { label: 'Polygon Sides', group: 'Geometry', type: 'number', default: 5, min: 3, max: 64, step: 1 },
  starPoints: { label: 'Star Points', group: 'Geometry', type: 'number', default: 5, min: 3, max: 64, step: 1 },
  innerRadius: { label: 'Inner Radius', group: 'Geometry', type: 'number', default: 25, min: 1, max: 1000, unit: 'px', step: 1 },

  // ── Typography & Text Group ──
  text: { label: 'Text Content', group: 'Typography', type: 'step', default: 'Wesenho Text' },
  fontSize: { label: 'Font Size', group: 'Typography', type: 'number', default: 36, min: 6, max: 500, unit: 'px', step: 1 },
  fontFamily: { label: 'Font Family', group: 'Typography', type: 'step', default: 'sans-serif' },
  fontWeight: { label: 'Font Weight', group: 'Typography', type: 'step', default: 'normal' },
  fontStyle: { label: 'Font Style', group: 'Typography', type: 'step', default: 'normal' },
  textAlign: { label: 'Text Alignment', group: 'Typography', type: 'step', default: 'left' },
  letterSpacing: { label: 'Letter Spacing', group: 'Typography', type: 'number', default: 0, min: -20, max: 100, unit: 'px', step: 1 },
  lineHeight: { label: 'Line Height', group: 'Typography', type: 'number', default: 1.2, min: 0.5, max: 4.0, step: 0.1 },
  textPathOffset: { label: 'Text Path Offset', group: 'Typography', type: 'number', default: 0, min: 0, max: 1000, unit: 'px', step: 1 },

  // ── Drop Shadow & Glow Group ──
  shadowEnable: { label: 'Shadow Enable', group: 'Drop Shadow', type: 'step', default: 1 },
  shadowColor: { label: 'Shadow Color', group: 'Drop Shadow', type: 'color', default: '#000000' },
  shadowBlur: { label: 'Shadow Blur', group: 'Drop Shadow', type: 'number', default: 4, min: 0, max: 100, unit: 'px', step: 1 },
  shadowOffsetX: { label: 'Shadow Offset X', group: 'Drop Shadow', type: 'number', default: 2, min: -500, max: 500, unit: 'px', step: 1 },
  shadowOffsetY: { label: 'Shadow Offset Y', group: 'Drop Shadow', type: 'number', default: 2, min: -500, max: 500, unit: 'px', step: 1 },
  shadowOpacity: { label: 'Shadow Opacity', group: 'Drop Shadow', type: 'number', default: 0.6, min: 0, max: 1.0, step: 0.05 },

  // ── Stroke & Outline Group ──
  strokeColor: { label: 'Stroke Color', group: 'Stroke', type: 'color', default: '#1d2021' },
  strokeWidth: { label: 'Stroke Width', group: 'Stroke', type: 'number', default: 2, min: 0, max: 500, unit: 'px', step: 1 },
  strokeOpacity: { label: 'Stroke Opacity', group: 'Stroke', type: 'number', default: 1.0, min: 0, max: 1, step: 0.01 },
  strokeDashOffset: { label: 'Dash Offset', group: 'Stroke', type: 'number', default: 0, min: 0, max: 1000, unit: 'px', step: 1 },
  strokeMiterLimit: { label: 'Miter Limit', group: 'Stroke', type: 'number', default: 4, min: 1, max: 100, step: 1 },
  strokeCap: { label: 'Line Cap Style', group: 'Stroke', type: 'step', default: 'round' },
  strokeJoin: { label: 'Line Join Style', group: 'Stroke', type: 'step', default: 'round' },

  // ── Fill & Material Group ──
  fillColor: { label: 'Fill Color', group: 'Fill & Material', type: 'color', default: '#fabd2f' },
  fillOpacity: { label: 'Fill Opacity', group: 'Fill & Material', type: 'number', default: 1.0, min: 0, max: 1, step: 0.01 },
  gradientAngle: { label: 'Gradient Angle', group: 'Fill & Material', type: 'angle', default: 0, unit: '°', step: 1 },
  gradientScale: { label: 'Gradient Scale', group: 'Fill & Material', type: 'number', default: 100, min: 1, max: 1000, unit: '%', step: 1 },
  gradientCenterX: { label: 'Grad Center X', group: 'Fill & Material', type: 'number', default: 50, min: 0, max: 100, unit: '%', step: 1 },
  gradientCenterY: { label: 'Grad Center Y', group: 'Fill & Material', type: 'number', default: 50, min: 0, max: 100, unit: '%', step: 1 },
  texMode: { label: 'Texture Mode', group: 'Fill & Material', type: 'number', default: 0, min: 0, max: 12, step: 1 },
  texScale: { label: 'Texture Scale', group: 'Fill & Material', type: 'number', default: 100, min: 1, max: 1000, unit: '%', step: 1 },
  texContrast: { label: 'Texture Contrast', group: 'Fill & Material', type: 'number', default: 100, min: 0, max: 500, unit: '%', step: 1 },
  texAngle: { label: 'Texture Angle', group: 'Fill & Material', type: 'angle', default: 0, unit: '°', step: 1 },

  // ── Brush Dynamics & Physics (Quadro.c Engine w_brush_config_t) ──
  brushSize: { label: 'Brush Size', group: 'Brush Dynamics', type: 'number', default: 20, min: 1, max: 1000, unit: 'px', step: 1 },
  brushOpacity: { label: 'Brush Opacity', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 100, unit: '%', step: 1 },
  brushHardness: { label: 'Brush Hardness', group: 'Brush Dynamics', type: 'number', default: 100, min: 0, max: 100, unit: '%', step: 1 },
  brushFlow: { label: 'Brush Flow', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 100, unit: '%', step: 1 },
  brushSpacing: { label: 'Brush Spacing', group: 'Brush Dynamics', type: 'number', default: 15, min: 1, max: 500, unit: '%', step: 1 },
  brushAngle: { label: 'Brush Angle', group: 'Brush Dynamics', type: 'angle', default: 0, unit: '°', step: 1 },
  brushRoundness: { label: 'Brush Roundness', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 100, unit: '%', step: 1 },
  brushScatter: { label: 'Brush Scatter', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 500, unit: '%', step: 1 },
  brushTolerance: { label: 'Flood Tolerance', group: 'Brush Dynamics', type: 'number', default: 32, min: 0, max: 255, step: 1 },
  brushSmudge: { label: 'Smudge Strength', group: 'Brush Dynamics', type: 'number', default: 70, min: 0, max: 100, unit: '%', step: 1 },
  brushWetness: { label: 'Wet Media Wetness', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushGrain: { label: 'Grain Intensity', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushColor: { label: 'Brush Color', group: 'Brush Dynamics', type: 'color', default: '#fabd2f' },
  brushSmooth: { label: 'Stabilizer Smoothing', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushMidpoint: { label: 'Bézier Midpoint', group: 'Brush Dynamics', type: 'number', default: 50, min: 0, max: 100, unit: '%', step: 1 },
  brushVelocity: { label: 'Velocity Dynamics', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushTaperIn: { label: 'Taper-In Length', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 500, unit: 'px', step: 1 },
  brushTaperOut: { label: 'Taper-Out Length', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 500, unit: 'px', step: 1 },
  brushFade: { label: 'Stroke Fade', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 5000, unit: 'px', step: 1 },
  brushSizeJitter: { label: 'Size Jitter', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushAngleJitter: { label: 'Angle Jitter', group: 'Brush Dynamics', type: 'angle', default: 0, unit: '°', step: 1 },
  brushOpacityJitter: { label: 'Opacity Jitter', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushColorJitter: { label: 'Color Jitter', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushDabBlend: { label: 'Dab Blend Mode', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 5, step: 1 },
  brushDepletion: { label: 'Paint Depletion', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushColorPickup: { label: 'Color Pickup Rate', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushDualSize: { label: 'Dual Tip Size', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 500, unit: '%', step: 1 },
  brushDualSpacing: { label: 'Dual Tip Spacing', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 500, unit: '%', step: 1 },
  brushSymmetry: { label: 'Symmetry Axis', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 3, step: 1 },

  // ── Layer FX & Filters Group (Quadro Filter ABI) ──
  fxBlur: { label: 'Blur Filter', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: 'px', step: 1 },
  fxBrightness: { label: 'Brightness', group: 'Layer FX', type: 'number', default: 100, min: 0, max: 300, unit: '%', step: 1 },
  fxContrast: { label: 'Contrast', group: 'Layer FX', type: 'number', default: 100, min: 0, max: 300, unit: '%', step: 1 },
  fxHue: { label: 'Hue Shift', group: 'Layer FX', type: 'angle', default: 0, min: -180, max: 180, unit: '°', step: 1 },
  fxSat: { label: 'Saturation', group: 'Layer FX', type: 'number', default: 100, min: 0, max: 300, unit: '%', step: 1 },
  fxGrayscale: { label: 'Grayscale', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  fxSepia: { label: 'Sepia', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  fxInvert: { label: 'Invert', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  fxNoise: { label: 'Noise Filter', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  fxPixelate: { label: 'Pixelate Size', group: 'Layer FX', type: 'number', default: 1, min: 1, max: 100, unit: 'px', step: 1 },
  fxThreshold: { label: 'Threshold Cutoff', group: 'Layer FX', type: 'number', default: 128, min: 0, max: 255, step: 1 },
  fxDither: { label: 'Bayer Dither', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  fxEdge: { label: 'Edge Detection', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  layerBlendMode: { label: 'Layer Blend Mode', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 5, step: 1 },

  // ── Multiplane Camera Group ──
  camX: { label: 'Camera X', group: 'Camera', type: 'number', default: 0, unit: 'px', step: 1 },
  camY: { label: 'Camera Y', group: 'Camera', type: 'number', default: 0, unit: 'px', step: 1 },
  camZ: { label: 'Camera Z', group: 'Camera', type: 'number', default: 1000, unit: 'px', step: 1 },
  camZoom: { label: 'Camera Zoom', group: 'Camera', type: 'number', default: 100, min: 1, max: 10000, unit: '%', step: 1 },
  camRot: { label: 'Camera Roll', group: 'Camera', type: 'angle', default: 0, unit: '°', step: 1 },

  // ── Armature & Mesh Warp Group ──
  boneAngle: { label: 'Bone Angle', group: 'Armature', type: 'angle', default: 0, unit: '°', step: 1 },
  boneLength: { label: 'Bone Length', group: 'Armature', type: 'number', default: 50, min: 1, max: 1000, unit: 'px', step: 1 },
  meshWarpWeight: { label: 'Mesh Warp Weight', group: 'Armature', type: 'number', default: 100, min: 0, max: 100, unit: '%', step: 1 },

  // ── Audio Synthesizer & DAW Group ──
  bpm: { label: 'DAW BPM', group: 'Audio DSP', type: 'number', default: 120, min: 20, max: 999, step: 1 },
  masterVol: { label: 'Master Volume', group: 'Audio DSP', type: 'number', default: 1.0, min: 0, max: 2.0, step: 0.01 },
  trackVol: { label: 'Track Volume', group: 'Audio DSP', type: 'number', default: 1.0, min: 0, max: 2.0, step: 0.01 },
  trackPan: { label: 'Track Pan', group: 'Audio DSP', type: 'number', default: 0, min: -1.0, max: 1.0, step: 0.01 },
  filterCutoff: { label: 'Filter Cutoff', group: 'Audio DSP', type: 'number', default: 2000, min: 20, max: 20000, unit: 'Hz', step: 10 },
  filterResonance: { label: 'Filter Resonance', group: 'Audio DSP', type: 'number', default: 1.0, min: 0.1, max: 20, step: 0.1 },
  fxDelay: { label: 'Delay Mix', group: 'Audio DSP', type: 'number', default: 0, min: 0, max: 1.0, step: 0.01 },
  fxReverb: { label: 'Reverb Mix', group: 'Audio DSP', type: 'number', default: 0, min: 0, max: 1.0, step: 0.01 },
  fxDistortion: { label: 'Distortion Drive', group: 'Audio DSP', type: 'number', default: 0, min: 0, max: 1.0, step: 0.01 }
};

/** Returns parameter registry organized by group for easy UI presentation */
export function getParameterGroups() {
  const groups = {};
  for (const [key, def] of Object.entries(PARAMETER_REGISTRY)) {
    if (!groups[def.group]) groups[def.group] = [];
    groups[def.group].push({ key, ...def });
  }
  return groups;
}

/**
 * Systematically extracts all animatable properties from a live engine / SVG / canvas object.
 * Maps object attributes (cx, cy, r, rx, ry, sides, points, text, font*, shadow, filter*, stroke*, fill*, etc.)
 * to the corresponding PARAMETER_REGISTRY keys.
 */
export function extractLiveObjectProperties(liveObj) {
  if (!liveObj) return {};
  const props = {};

  // Transform
  if (liveObj.cx !== undefined) props.x = liveObj.cx;
  else if (liveObj.x !== undefined) props.x = liveObj.x;
  if (liveObj.cy !== undefined) props.y = liveObj.cy;
  else if (liveObj.y !== undefined) props.y = liveObj.y;
  if (liveObj.zDepth !== undefined) props.zDepth = liveObj.zDepth;
  if (liveObj.rotation !== undefined) props.rotation = liveObj.rotation;
  if (liveObj.scaleX !== undefined) props.scaleX = liveObj.scaleX;
  if (liveObj.scaleY !== undefined) props.scaleY = liveObj.scaleY;
  if (liveObj.skewX !== undefined) props.skewX = liveObj.skewX;
  if (liveObj.skewY !== undefined) props.skewY = liveObj.skewY;
  if (liveObj.opacity !== undefined) props.opacity = liveObj.opacity;
  if (liveObj.originX !== undefined) props.originX = liveObj.originX;
  if (liveObj.originY !== undefined) props.originY = liveObj.originY;

  // Geometry
  if (liveObj.width !== undefined) props.width = liveObj.width;
  if (liveObj.height !== undefined) props.height = liveObj.height;
  if (liveObj.radius !== undefined) props.radius = liveObj.radius;
  else if (liveObj.r !== undefined) props.radius = liveObj.r;
  if (liveObj.rx !== undefined) props.rx = liveObj.rx;
  if (liveObj.ry !== undefined) props.ry = liveObj.ry;
  if (liveObj.cornerRadius !== undefined) props.cornerRadius = liveObj.cornerRadius;
  if (liveObj.polygonSides !== undefined) props.polygonSides = liveObj.polygonSides;
  else if (liveObj.sides !== undefined) props.polygonSides = liveObj.sides;
  if (liveObj.starPoints !== undefined) props.starPoints = liveObj.starPoints;
  else if (liveObj.points !== undefined && typeof liveObj.points === 'number') props.starPoints = liveObj.points;
  if (liveObj.innerRadius !== undefined) props.innerRadius = liveObj.innerRadius;

  // Typography
  if (liveObj.text !== undefined) props.text = liveObj.text;
  if (liveObj.fontSize !== undefined) props.fontSize = liveObj.fontSize;
  if (liveObj.fontFamily !== undefined) props.fontFamily = liveObj.fontFamily;
  if (liveObj.fontWeight !== undefined) props.fontWeight = liveObj.fontWeight;
  if (liveObj.fontStyle !== undefined) props.fontStyle = liveObj.fontStyle;
  if (liveObj.textAlign !== undefined) props.textAlign = liveObj.textAlign;
  if (liveObj.letterSpacing !== undefined) props.letterSpacing = liveObj.letterSpacing;
  if (liveObj.lineHeight !== undefined) props.lineHeight = liveObj.lineHeight;
  if (liveObj.textPathOffset !== undefined) props.textPathOffset = liveObj.textPathOffset;

  // Drop Shadow / Glow
  if (liveObj.shadow) {
    if (liveObj.shadow.enabled !== undefined) props.shadowEnable = liveObj.shadow.enabled ? 1 : 0;
    if (liveObj.shadow.color !== undefined) props.shadowColor = liveObj.shadow.color;
    if (liveObj.shadow.blur !== undefined) props.shadowBlur = liveObj.shadow.blur;
    if (liveObj.shadow.offsetX !== undefined) props.shadowOffsetX = liveObj.shadow.offsetX;
    else if (liveObj.shadow.x !== undefined) props.shadowOffsetX = liveObj.shadow.x;
    if (liveObj.shadow.offsetY !== undefined) props.shadowOffsetY = liveObj.shadow.offsetY;
    else if (liveObj.shadow.y !== undefined) props.shadowOffsetY = liveObj.shadow.y;
    if (liveObj.shadow.opacity !== undefined) props.shadowOpacity = liveObj.shadow.opacity;
  }
  if (liveObj.shadowEnable !== undefined) props.shadowEnable = liveObj.shadowEnable ? 1 : 0;
  if (liveObj.shadowColor !== undefined) props.shadowColor = liveObj.shadowColor;
  if (liveObj.shadowBlur !== undefined) props.shadowBlur = liveObj.shadowBlur;
  if (liveObj.shadowOffsetX !== undefined) props.shadowOffsetX = liveObj.shadowOffsetX;
  if (liveObj.shadowOffsetY !== undefined) props.shadowOffsetY = liveObj.shadowOffsetY;
  if (liveObj.shadowOpacity !== undefined) props.shadowOpacity = liveObj.shadowOpacity;

  // Stroke
  if (liveObj.strokeColor !== undefined) props.strokeColor = liveObj.strokeColor;
  else if (liveObj.stroke && liveObj.stroke !== 'none') props.strokeColor = liveObj.stroke;
  if (liveObj.strokeWidth !== undefined) props.strokeWidth = liveObj.strokeWidth;
  if (liveObj.strokeOpacity !== undefined) props.strokeOpacity = liveObj.strokeOpacity;
  if (liveObj.strokeDashOffset !== undefined) props.strokeDashOffset = liveObj.strokeDashOffset;
  else if (liveObj.strokeDashoffset !== undefined) props.strokeDashOffset = liveObj.strokeDashoffset;
  if (liveObj.strokeMiterLimit !== undefined) props.strokeMiterLimit = liveObj.strokeMiterLimit;
  else if (liveObj.strokeMiterlimit !== undefined) props.strokeMiterLimit = liveObj.strokeMiterlimit;
  if (liveObj.strokeCap !== undefined) props.strokeCap = liveObj.strokeCap;
  else if (liveObj.strokeLinecap !== undefined) props.strokeCap = liveObj.strokeLinecap;
  if (liveObj.strokeJoin !== undefined) props.strokeJoin = liveObj.strokeJoin;
  else if (liveObj.strokeLinejoin !== undefined) props.strokeJoin = liveObj.strokeLinejoin;

  // Fill & Material
  if (liveObj.fillColor !== undefined) props.fillColor = liveObj.fillColor;
  else if (liveObj.fill && liveObj.fill !== 'none') props.fillColor = liveObj.fill;
  if (liveObj.fillOpacity !== undefined) props.fillOpacity = liveObj.fillOpacity;
  if (liveObj.gradientAngle !== undefined) props.gradientAngle = liveObj.gradientAngle;
  if (liveObj.gradientScale !== undefined) props.gradientScale = liveObj.gradientScale;
  if (liveObj.gradientCenterX !== undefined) props.gradientCenterX = liveObj.gradientCenterX;
  if (liveObj.gradientCenterY !== undefined) props.gradientCenterY = liveObj.gradientCenterY;
  if (liveObj.texMode !== undefined) props.texMode = liveObj.texMode;
  if (liveObj.texScale !== undefined) props.texScale = liveObj.texScale;
  if (liveObj.texContrast !== undefined) props.texContrast = liveObj.texContrast;
  if (liveObj.texAngle !== undefined) props.texAngle = liveObj.texAngle;

  // Layer FX & Filters
  if (liveObj.fxBlur !== undefined) props.fxBlur = liveObj.fxBlur;
  else if (liveObj.filterBlur !== undefined) props.fxBlur = liveObj.filterBlur;
  if (liveObj.fxBrightness !== undefined) props.fxBrightness = liveObj.fxBrightness;
  else if (liveObj.filterBrightness !== undefined) props.fxBrightness = liveObj.filterBrightness;
  if (liveObj.fxContrast !== undefined) props.fxContrast = liveObj.fxContrast;
  else if (liveObj.filterContrast !== undefined) props.fxContrast = liveObj.filterContrast;
  if (liveObj.fxHue !== undefined) props.fxHue = liveObj.fxHue;
  else if (liveObj.filterHue !== undefined) props.fxHue = liveObj.filterHue;
  if (liveObj.fxSat !== undefined) props.fxSat = liveObj.fxSat;
  else if (liveObj.filterSat !== undefined) props.fxSat = liveObj.filterSat;
  if (liveObj.fxGrayscale !== undefined) props.fxGrayscale = liveObj.fxGrayscale;
  if (liveObj.fxSepia !== undefined) props.fxSepia = liveObj.fxSepia;
  if (liveObj.fxInvert !== undefined) props.fxInvert = liveObj.fxInvert;
  if (liveObj.fxNoise !== undefined) props.fxNoise = liveObj.fxNoise;
  if (liveObj.fxPixelate !== undefined) props.fxPixelate = liveObj.fxPixelate;
  if (liveObj.fxThreshold !== undefined) props.fxThreshold = liveObj.fxThreshold;
  if (liveObj.fxDither !== undefined) props.fxDither = liveObj.fxDither;
  if (liveObj.fxEdge !== undefined) props.fxEdge = liveObj.fxEdge;
  if (liveObj.layerBlendMode !== undefined) props.layerBlendMode = liveObj.layerBlendMode;

  // Brush Dynamics
  const brushKeys = [
    'brushSize', 'brushOpacity', 'brushHardness', 'brushFlow', 'brushSpacing',
    'brushAngle', 'brushRoundness', 'brushScatter', 'brushTolerance', 'brushSmudge',
    'brushWetness', 'brushGrain', 'brushColor', 'brushSmooth', 'brushMidpoint',
    'brushVelocity', 'brushTaperIn', 'brushTaperOut', 'brushFade', 'brushSizeJitter',
    'brushAngleJitter', 'brushOpacityJitter', 'brushColorJitter', 'brushDabBlend',
    'brushDepletion', 'brushColorPickup', 'brushDualSize', 'brushDualSpacing', 'brushSymmetry'
  ];
  for (const k of brushKeys) {
    if (liveObj[k] !== undefined) props[k] = liveObj[k];
  }

  // Camera & Armatures & DSP
  const otherKeys = [
    'camX', 'camY', 'camZ', 'camZoom', 'camRot',
    'boneAngle', 'boneLength', 'meshWarpWeight',
    'bpm', 'masterVol', 'trackVol', 'trackPan', 'filterCutoff', 'filterResonance', 'fxDelay', 'fxReverb', 'fxDistortion'
  ];
  for (const k of otherKeys) {
    if (liveObj[k] !== undefined) props[k] = liveObj[k];
  }

  return props;
}

/** Single Keyframe on a Parameter Channel */
export class DopeSheetKeyframe {
  constructor(frame = 1, value = 0, tweenType = 'linear') {
    this.frame = frame;
    this.value = value;
    this.tweenType = tweenType; // 'none', 'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInElastic', 'easeOutBounce', etc.
    this.selected = false;
  }

  clone(newFrame = this.frame) {
    const k = new DopeSheetKeyframe(newFrame, this.value, this.tweenType);
    k.selected = this.selected;
    return k;
  }

  toJSON() {
    return {
      frame: this.frame,
      value: this.value,
      tweenType: this.tweenType
    };
  }

  static fromJSON(data) {
    return new DopeSheetKeyframe(data.frame, data.value, data.tweenType || 'linear');
  }
}

/** Single Parameter Track / Channel (e.g., 'Position X' or 'Brush Size') */
export class DopeSheetChannel {
  constructor(paramKey, initialValue = undefined) {
    this.paramKey = paramKey;
    const def = PARAMETER_REGISTRY[paramKey] || { label: paramKey, type: 'number', default: 0 };
    this.label = def.label;
    this.type = def.type;
    this.defaultValue = initialValue !== undefined ? initialValue : def.default;
    this.keyframes = [];
    this.muted = false;
    this.visible = true;
  }

  addKeyframe(frame, value, tweenType = 'linear') {
    const existing = this.getKeyframeAt(frame);
    if (existing) {
      existing.value = value;
      existing.tweenType = tweenType;
      return existing;
    }
    const kf = new DopeSheetKeyframe(frame, value, tweenType);
    this.keyframes.push(kf);
    this.keyframes.sort((a, b) => a.frame - b.frame);
    return kf;
  }

  removeKeyframe(frame) {
    const idx = this.keyframes.findIndex(k => k.frame === frame);
    if (idx !== -1) {
      return this.keyframes.splice(idx, 1)[0];
    }
    return null;
  }

  getKeyframeAt(frame) {
    return this.keyframes.find(k => k.frame === frame) || null;
  }

  hasKeyframeAt(frame) {
    return this.keyframes.some(k => k.frame === frame);
  }

  getSpan(frame) {
    if (this.keyframes.length === 0) return null;
    let prev = null;
    let next = null;
    for (let i = 0; i < this.keyframes.length; i++) {
      const k = this.keyframes[i];
      if (k.frame <= frame) {
        prev = k;
        next = this.keyframes[i + 1] || null;
      } else {
        if (!next) next = k;
        break;
      }
    }
    return { prev, next };
  }

  sample(frame) {
    if (this.keyframes.length === 0) {
      return this.defaultValue;
    }
    const span = this.getSpan(frame);
    if (!span || !span.prev) {
      return this.keyframes[0].value;
    }
    const { prev, next } = span;
    if (!next || prev.tweenType === 'none' || prev.frame === next.frame || frame >= next.frame) {
      return (frame >= (next ? next.frame : prev.frame)) ? (next ? next.value : prev.value) : prev.value;
    }

    const totalSpan = next.frame - prev.frame;
    let t = Math.max(0, Math.min(1, (frame - prev.frame) / totalSpan));
    const easeFn = Easing[prev.tweenType] || Easing.linear;
    t = easeFn(t);

    if (this.type === 'color') {
      return lerpColor(prev.value, next.value, t);
    }
    if (this.type === 'angle') {
      return lerpAngle(Number(prev.value), Number(next.value), t);
    }
    if (this.type === 'step') {
      return t >= 1 ? next.value : prev.value;
    }
    const numPrev = Number(prev.value);
    const numNext = Number(next.value);
    return numPrev + (numNext - numPrev) * t;
  }

  toJSON() {
    return {
      paramKey: this.paramKey,
      defaultValue: this.defaultValue,
      keyframes: this.keyframes.map(k => k.toJSON())
    };
  }

  static fromJSON(data) {
    const ch = new DopeSheetChannel(data.paramKey, data.defaultValue);
    if (Array.isArray(data.keyframes)) {
      ch.keyframes = data.keyframes.map(k => DopeSheetKeyframe.fromJSON(k));
      ch.keyframes.sort((a, b) => a.frame - b.frame);
    }
    return ch;
  }
}

/** Animated Object / Layer Container inside the DopeSheet */
export class DopeSheetObject {
  constructor(id, name, targetType = 'vector') {
    this.id = id;
    this.name = name;
    this.targetType = targetType; // 'vector', 'raster', 'camera', 'brush_preset'
    this.collapsed = true;
    this.channels = new Map(); // paramKey -> DopeSheetChannel
  }

  getOrCreateChannel(paramKey, initialValue = undefined) {
    if (!this.channels.has(paramKey)) {
      const ch = new DopeSheetChannel(paramKey, initialValue);
      this.channels.set(paramKey, ch);
    }
    return this.channels.get(paramKey);
  }

  setKeyframe(paramKey, frame, value, tweenType = 'linear') {
    const ch = this.getOrCreateChannel(paramKey, value);
    return ch.addKeyframe(frame, value, tweenType);
  }

  hasAnyKeyframeAt(frame) {
    for (const ch of this.channels.values()) {
      if (ch.hasKeyframeAt(frame)) return true;
    }
    return false;
  }

  sample(frame) {
    const state = {};
    for (const [key, ch] of this.channels.entries()) {
      if (!ch.muted) {
        state[key] = ch.sample(frame);
      }
    }
    return state;
  }

  applyState(targetObj, state) {
    if (!targetObj || !state) return;
    for (const [key, val] of Object.entries(state)) {
      if (val === undefined) continue;
      if (key in targetObj) {
        targetObj[key] = val;
      }
    }
  }

  toJSON() {
    const channelsArr = [];
    for (const ch of this.channels.values()) {
      channelsArr.push(ch.toJSON());
    }
    return {
      id: this.id,
      name: this.name,
      targetType: this.targetType,
      collapsed: this.collapsed,
      channels: channelsArr
    };
  }

  static fromJSON(data) {
    const obj = new DopeSheetObject(data.id, data.name, data.targetType);
    obj.collapsed = !!data.collapsed;
    if (Array.isArray(data.channels)) {
      for (const chData of data.channels) {
        const ch = DopeSheetChannel.fromJSON(chData);
        obj.channels.set(ch.paramKey, ch);
      }
    }
    return obj;
  }
}

/**
 * Universal DopeSheet Multi-Track Animation Director
 * Manages timeline, all animated objects, keyframe selections, and real-time evaluation.
 */
export class DopeSheet {
  constructor(totalFrames = 60, fps = 24) {
    this.totalFrames = totalFrames;
    this.fps = fps;
    this.currentFrame = 1;
    this.isPlaying = false;
    this.loop = true;
    this.autoKeyframe = false;
    this.objects = new Map(); // id -> DopeSheetObject
    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  notify(event, payload = {}) {
    for (const fn of this._listeners) {
      try {
        fn(event, payload);
      } catch (err) {
        console.error('DopeSheet listener error:', err);
      }
    }
  }

  getOrCreateObject(id, name = `Object ${id}`, targetType = 'vector') {
    if (!this.objects.has(id)) {
      const obj = new DopeSheetObject(id, name, targetType);
      this.objects.set(id, obj);
      this.notify('objectAdded', { id, name });
    }
    return this.objects.get(id);
  }

  removeObject(id) {
    if (this.objects.delete(id)) {
      this.notify('objectRemoved', { id });
    }
  }

  setKeyframe(objectId, paramKey, frame, value, tweenType = 'linear') {
    const obj = this.getOrCreateObject(objectId);
    const kf = obj.setKeyframe(paramKey, frame, value, tweenType);
    this.notify('keyframeSet', { objectId, paramKey, frame, value, tweenType });
    return kf;
  }

  removeKeyframe(objectId, paramKey, frame) {
    const obj = this.objects.get(objectId);
    if (obj && obj.channels.has(paramKey)) {
      const removed = obj.channels.get(paramKey).removeKeyframe(frame);
      if (removed) {
        this.notify('keyframeRemoved', { objectId, paramKey, frame });
      }
      return removed;
    }
    return null;
  }

  setFrame(frame) {
    this.currentFrame = Math.max(1, Math.min(this.totalFrames, Math.round(frame)));
    this.notify('frameChanged', { frame: this.currentFrame });
    return this.currentFrame;
  }

  nextFrame() {
    let next = this.currentFrame + 1;
    if (next > this.totalFrames) {
      next = this.loop ? 1 : this.totalFrames;
    }
    return this.setFrame(next);
  }

  prevFrame() {
    let prev = this.currentFrame - 1;
    if (prev < 1) {
      prev = this.loop ? this.totalFrames : 1;
    }
    return this.setFrame(prev);
  }

  play() {
    this.isPlaying = true;
    this.notify('playStateChanged', { isPlaying: true });
  }

  pause() {
    this.isPlaying = false;
    this.notify('playStateChanged', { isPlaying: false });
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  sampleAll(frame = this.currentFrame) {
    const results = {};
    for (const [id, obj] of this.objects.entries()) {
      results[id] = obj.sample(frame);
    }
    return results;
  }

  getSelectedKeyframes() {
    const selected = [];
    for (const [objId, obj] of this.objects.entries()) {
      for (const [paramKey, ch] of obj.channels.entries()) {
        for (const kf of ch.keyframes) {
          if (kf.selected) {
            selected.push({ objectId: objId, paramKey, keyframe: kf });
          }
        }
      }
    }
    return selected;
  }

  deselectAllKeyframes() {
    for (const obj of this.objects.values()) {
      for (const ch of obj.channels.values()) {
        for (const kf of ch.keyframes) {
          kf.selected = false;
        }
      }
    }
    this.notify('selectionChanged');
  }

  moveSelectedKeyframes(deltaFrames) {
    if (!deltaFrames) return;
    const selected = this.getSelectedKeyframes();
    if (selected.length === 0) return;

    // Apply movement
    for (const item of selected) {
      item.keyframe.frame = Math.max(1, Math.min(this.totalFrames, item.keyframe.frame + deltaFrames));
    }
    // Re-sort all channels
    for (const obj of this.objects.values()) {
      for (const ch of obj.channels.values()) {
        ch.keyframes.sort((a, b) => a.frame - b.frame);
      }
    }
    this.notify('keyframesMoved', { deltaFrames });
  }

  toJSON() {
    const objsArr = [];
    for (const obj of this.objects.values()) {
      objsArr.push(obj.toJSON());
    }
    return {
      version: 1,
      totalFrames: this.totalFrames,
      fps: this.fps,
      loop: this.loop,
      objects: objsArr
    };
  }

  static fromJSON(data) {
    const ds = new DopeSheet(data.totalFrames || 60, data.fps || 24);
    ds.loop = data.loop !== undefined ? data.loop : true;
    if (Array.isArray(data.objects)) {
      for (const objData of data.objects) {
        const obj = DopeSheetObject.fromJSON(objData);
        ds.objects.set(obj.id, obj);
      }
    }
    return ds;
  }
}
