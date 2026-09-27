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
 * Defines metadata, group, value type, default values, and display units.
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

  // ── Brush Dynamics Group (Quadro Engine w_brush_config_t) ──
  brushSize: { label: 'Brush Size', group: 'Brush Dynamics', type: 'number', default: 20, min: 1, max: 1000, unit: 'px', step: 1 },
  brushOpacity: { label: 'Brush Opacity', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 100, unit: '%', step: 1 },
  brushHardness: { label: 'Brush Hardness', group: 'Brush Dynamics', type: 'number', default: 100, min: 0, max: 100, unit: '%', step: 1 },
  brushFlow: { label: 'Brush Flow', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 100, unit: '%', step: 1 },
  brushSpacing: { label: 'Brush Spacing', group: 'Brush Dynamics', type: 'number', default: 15, min: 1, max: 500, unit: '%', step: 1 },
  brushAngle: { label: 'Brush Angle', group: 'Brush Dynamics', type: 'angle', default: 0, unit: '°', step: 1 },
  brushRoundness: { label: 'Brush Roundness', group: 'Brush Dynamics', type: 'number', default: 100, min: 1, max: 100, unit: '%', step: 1 },
  brushScatter: { label: 'Brush Scatter', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 500, unit: '%', step: 1 },
  brushSmudge: { label: 'Smudge Strength', group: 'Brush Dynamics', type: 'number', default: 70, min: 0, max: 100, unit: '%', step: 1 },
  brushWetness: { label: 'Wet Media Wetness', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushGrain: { label: 'Grain / Noise', group: 'Brush Dynamics', type: 'number', default: 0, min: 0, max: 100, unit: '%', step: 1 },
  brushColor: { label: 'Brush Color', group: 'Brush Dynamics', type: 'color', default: '#fabd2f' },

  // ── Material & Fill Group ──
  fillColor: { label: 'Fill Color', group: 'Material & Fill', type: 'color', default: '#fabd2f' },
  fillOpacity: { label: 'Fill Opacity', group: 'Material & Fill', type: 'number', default: 1.0, min: 0, max: 1, step: 0.01 },
  strokeColor: { label: 'Stroke Color', group: 'Material & Fill', type: 'color', default: '#1d2021' },
  strokeWidth: { label: 'Stroke Width', group: 'Material & Fill', type: 'number', default: 2, min: 0, max: 500, unit: 'px', step: 1 },
  strokeOpacity: { label: 'Stroke Opacity', group: 'Material & Fill', type: 'number', default: 1.0, min: 0, max: 1, step: 0.01 },
  gradientAngle: { label: 'Gradient Angle', group: 'Material & Fill', type: 'angle', default: 0, unit: '°', step: 1 },
  gradientScale: { label: 'Gradient Scale', group: 'Material & Fill', type: 'number', default: 100, min: 1, max: 1000, unit: '%', step: 1 },
  texScale: { label: 'Texture Scale', group: 'Material & Fill', type: 'number', default: 100, min: 1, max: 1000, unit: '%', step: 1 },
  texContrast: { label: 'Texture Contrast', group: 'Material & Fill', type: 'number', default: 100, min: 0, max: 500, unit: '%', step: 1 },
  texAngle: { label: 'Texture Angle', group: 'Material & Fill', type: 'angle', default: 0, unit: '°', step: 1 },

  // ── Multiplane Camera Group ──
  camX: { label: 'Camera X', group: 'Camera', type: 'number', default: 0, unit: 'px', step: 1 },
  camY: { label: 'Camera Y', group: 'Camera', type: 'number', default: 0, unit: 'px', step: 1 },
  camZ: { label: 'Camera Z', group: 'Camera', type: 'number', default: 1000, unit: 'px', step: 1 },
  camZoom: { label: 'Camera Zoom', group: 'Camera', type: 'number', default: 100, min: 1, max: 10000, unit: '%', step: 1 },
  camRot: { label: 'Camera Roll', group: 'Camera', type: 'angle', default: 0, unit: '°', step: 1 },

  // ── Layer FX & Filters Group ──
  fxBlur: { label: 'Blur Filter', group: 'Layer FX', type: 'number', default: 0, min: 0, max: 100, unit: 'px', step: 1 },
  fxBrightness: { label: 'Brightness', group: 'Layer FX', type: 'number', default: 100, min: 0, max: 300, unit: '%', step: 1 },
  fxContrast: { label: 'Contrast', group: 'Layer FX', type: 'number', default: 100, min: 0, max: 300, unit: '%', step: 1 },
  fxHue: { label: 'Hue Shift', group: 'Layer FX', type: 'angle', default: 0, min: -180, max: 180, unit: '°', step: 1 },
  fxSat: { label: 'Saturation', group: 'Layer FX', type: 'number', default: 100, min: 0, max: 300, unit: '%', step: 1 }
};

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
    this.collapsed = false;
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
