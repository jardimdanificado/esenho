/**
 * =========================================================================
 * Wesenho - Extensible Painting & Drawing Platform (Native WebAssembly)
 * Architecture:
 * - Host / Screen: Viewport, SDL window, REPL, plugin coordination, command parsing.
 * - Canvas Module (roms/canvas.wasm): Native multi-layer composition, resizing, drawing primitives.
 * - Brush Plugins (plugins/brushes/*.wasm): Pure C math & pixel dab shaders.
 * - Filter Plugins (plugins/filters/*.wasm): Pure C image processing kernels.
 * =========================================================================
 */

/* ── Platform shim ── wesenho.js runs in Node.js and in the browser.
   In Node the real modules are loaded; in the browser stubs are used
   so the engine logic compiles without modification.                  */
const IS_BROWSER = typeof window !== 'undefined';

let sdl, fs, path, readline, saveImage, loadImage;

if (!IS_BROWSER) {
  sdl      = require('@kmamal/sdl');
  fs       = require('fs');
  path     = require('path');
  readline = require('readline');
  ({ saveImage, loadImage } = require('./image_io'));
} else {
  /* Browser stubs — only used by Node-only methods (initWindow, setupRepl, etc.)
     which are replaced by host-browser.js.  The engine core never calls these.  */
  fs   = { readFileSync: () => { throw new Error('fs not available in browser'); },
            existsSync: () => false, readdirSync: () => [] };
  path = { basename: (p, ext) => p.split('/').pop().replace(ext || '', ''),
            extname: p => { const d = p.lastIndexOf('.'); return d >= 0 ? p.slice(d) : ''; },
            resolve: (...a) => a.join('/'), join: (...a) => a.join('/'),
            relative: (_, p) => p };
  readline   = null;
  saveImage  = () => { throw new Error('image_io not available in browser'); };
  loadImage  = () => { throw new Error('image_io not available in browser'); };
}

/* Browser-compatible Buffer shim (Buffer extends Uint8Array in Node, so
   new Uint8Array() works on both sides for pixel data).                */
const Buf = IS_BROWSER
  ? { alloc: (n) => new Uint8Array(n), from: (a, o, l) => new Uint8Array(a, o, l) }
  : Buffer;

/* ── Papagaio Parser Loader ── */
let papagaio = null;
function getPapagaio() {
  if (papagaio) return papagaio;
  if (!IS_BROWSER) {
    try {
      papagaio = require('./papagaio/index.js').papagaio;
    } catch (_) {}
  } else if (typeof globalThis !== 'undefined' && globalThis.papagaio) {
    papagaio = globalThis.papagaio;
  }
  return papagaio;
}

/**
 * Standard Parameter IDs matching include/wesenho.h enum
 */
const PARAM_IDS = {
  size: 1,
  radius: 1,
  rad: 1,
  opacity: 2,
  op: 2,
  alpha: 2,
  hardness: 3,
  hard: 3,
  softness: 3,
  soft: 3,
  flow: 4,
  spacing: 5,
  step: 5,
  angle: 6,
  rot: 6,
  rotation: 6,
  rotate: 6,
  shape_angle: 6,
  shape_rotate: 6,
  roundness: 7,
  aspect: 7,
  scatter: 8,
  jitter: 8,
  tolerance: 9,
  tol: 9,
  smudge: 10,
  smudge_strength: 10,
  wetness: 11,
  wet: 11,
  grain: 12,
  noise: 12,
  texture_mode: 13,
  tex_mode: 13,
  shape: 14,
  mode: 15,
  type: 15,
  tex_angle: 16,
  tex_rotate: 16,
  tex_rot: 16,
  texture_angle: 16,
  texture_rotate: 16,
  texture_rot: 16,
  tex_scale: 17,
  texture_scale: 17,
  grain_scale: 17,
  grain_size: 17,
  tex_layer: 18,
  texture_layer: 18,
  smooth: 19,
  smoothing: 19,
  stabilizer: 19,
  midpoint: 20,
  bezier_midpoint: 20,
  bezier: 20,
  texture_contrast: 21,
  tex_contrast: 21,
  grain_contrast: 21,
  auto_rotate: 22,
  autorotate: 22,
  direction_angle: 22,
  follow_direction: 22,
  velocity: 23,
  speed: 23,
  taper_in: 24,
  taper: 24,
  taper_start: 24,
  taper_out: 25,
  taper_end: 25,
  fade: 26,
  size_jitter: 27,
  angle_jitter: 28,
  opacity_jitter: 29,
  flow_jitter: 29,
  color_jitter: 30,
  dab_blend: 31,
  dab_blend_mode: 31,
  blend_mode: 31
};

/**
 * Built-in native brush presets for the Universal Brush Engine
 */
const BRUSH_PRESETS = {
  round: { shape: 0, hardness: 80, roundness: 100, mode: 0, spacing: 15, grain: 0, scatter: 0, opacity: 100, flow: 100, angle: 0 },
  airbrush: { shape: 0, hardness: 0, opacity: 40, flow: 40, roundness: 100, mode: 0, spacing: 10, grain: 0, scatter: 0, angle: 0 },
  pixel: { shape: 1, hardness: 100, roundness: 100, size: 1, spacing: 10, mode: 0, grain: 0, scatter: 0, opacity: 100, flow: 100, angle: 0 },
  square: { shape: 1, hardness: 100, roundness: 100, mode: 0, spacing: 15, grain: 0, scatter: 0, angle: 0 },
  calligraphy: { shape: 2, angle: 45, roundness: 30, hardness: 100, mode: 0, spacing: 10, grain: 0, scatter: 0 },
  chisel: { shape: 2, angle: 45, roundness: 30, hardness: 100, mode: 0, spacing: 10, grain: 0, scatter: 0 },
  charcoal: { shape: 0, grain: 40, hardness: 60, scatter: 10, roundness: 100, mode: 0, spacing: 20 },
  hatch: { shape: 2, angle: 45, spacing: 80, hardness: 100, roundness: 30, mode: 0, grain: 0, scatter: 0 },
  scatter: { shape: 0, scatter: 50, grain: 30, hardness: 80, roundness: 100, mode: 0, spacing: 30 },
  smudge: { mode: 1, smudge: 60, shape: 0, hardness: 80, roundness: 100, grain: 0, scatter: 0 },
  blend: { mode: 2, wetness: 50, shape: 0, hardness: 80, roundness: 100, grain: 0, scatter: 0 },
  fill: { mode: 3, tolerance: 32 },
  flood_fill: { mode: 3, tolerance: 32 },
  lasso_fill: { mode: 4 },
  lasso: { mode: 4 }
};

/**
 * Native Wesenho WebAssembly Module Wrapper.
 * Freestanding, libc-free WASM runner with direct ABI function exports.
 */
class WesenhoModule {
  /**
   * @param {string|Uint8Array|ArrayBuffer} wasmPathOrBytes - File path (Node) or WASM bytes (browser/any)
   */
  constructor(wasmPathOrBytes, options = {}) {
    const isBytes = wasmPathOrBytes instanceof Uint8Array
                 || wasmPathOrBytes instanceof ArrayBuffer;
    this.wasmPath = isBytes ? (options.name || 'module') : wasmPathOrBytes;
    this.name = options.name || path.basename(String(this.wasmPath), '.wasm');
    const wasmBytes = isBytes ? wasmPathOrBytes : fs.readFileSync(wasmPathOrBytes);
    this.wasmModule = new WebAssembly.Module(wasmBytes);
    this.instance = new WebAssembly.Instance(this.wasmModule, { env: {} });
    this.exports = this.instance.exports;
    this.memory = this.exports.memory;
    this.layerPtr = 0;
    this.layerByteLen = 0;
    this.texPtr = 0;
    this.texByteLen = 0;
  }

  /**
   * Async factory — fetches WASM from URL, works in browser and Node (via fetch polyfill).
   * @param {string} url
   * @param {object} [options]
   * @returns {Promise<WesenhoModule>}
   */
  static async fromURL(url, options = {}) {
    const resp = await fetch(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return new WesenhoModule(bytes, options);
  }

  setLayer(pixelsPtr, width, height) {
    if (typeof this.exports.w_set_layer === 'function') {
      this.exports.w_set_layer(pixelsPtr, width, height);
    }
  }

  setTexture(pixelsPtr, width, height) {
    if (typeof this.exports.w_set_texture === 'function') {
      this.exports.w_set_texture(pixelsPtr, width, height);
    }
  }

  setParam(paramId, val) {
    if (typeof this.exports.w_brush_set_param === 'function') {
      this.exports.w_brush_set_param(paramId, val);
    }
  }

  stroke(state, x, y, prevX, prevY, color, eraser) {
    if (typeof this.exports.w_brush_stroke === 'function') {
      this.exports.w_brush_stroke(state, x, y, prevX, prevY, color >>> 0, eraser ? 1 : 0);
    }
  }

  applyFilter(p1 = 0, p2 = 0) {
    if (typeof this.exports.w_filter_apply === 'function') {
      this.exports.w_filter_apply(p1, p2);
    }
  }
}

// Document Dimensions (Default Vertical Proportions)
const DOC_WIDTH  = 800;
const DOC_HEIGHT = 1000;

/**
 * Generates default procedural textures (paper, canvas, noise, dots, grid, grunge).
 * Used by brush plugins with texture grain/pattern mode enabled.
 */
function createProceduralTextures() {
  const map = new Map();

  // Builtin Shapes (64x64 Alpha Masks)
  // 1. Circle
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = y - 32;
      for (let x = 0; x < w; x++) {
        const dx = x - 32;
        const inside = (dx * dx + dy * dy <= 31 * 31);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF;
        buf[idx + 1] = 0xFF;
        buf[idx + 2] = 0xFF;
        buf[idx + 3] = inside ? 0xFF : 0x00;
      }
    }
    map.set('circle', { width: w, height: h, data: buf, wasmId: 0, category: 'shape' });
  }

  // 2. Square
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    buf.fill(0xFF);
    map.set('square', { width: w, height: h, data: buf, wasmId: 1, category: 'shape' });
  }

  // 3. Chisel
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const inside = (y >= 24 && y < 40);
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF;
        buf[idx + 1] = 0xFF;
        buf[idx + 2] = 0xFF;
        buf[idx + 3] = inside ? 0xFF : 0x00;
      }
    }
    map.set('chisel', { width: w, height: h, data: buf, wasmId: 2, category: 'shape' });
  }

  // Procedural Textures
  // 4. Paper (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n1 = Math.sin(x * 0.15) * Math.cos(y * 0.15) * 15;
        const n2 = Math.sin(x * 0.6 + y * 0.4) * 10;
        const noise = (Math.random() - 0.5) * 45;
        const v = Math.max(0, Math.min(255, Math.floor(210 + n1 + n2 + noise)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('paper', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 5. Canvas (128x128)
  {
    const w = 128, h = 128;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wx = Math.sin(x * Math.PI / 4) * 40;
        const wy = Math.sin(y * Math.PI / 4) * 40;
        const v = Math.max(0, Math.min(255, Math.floor(180 + wx + wy + (Math.random() - 0.5) * 30)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('canvas', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 6. Noise (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = Math.floor(Math.random() * 256);
      buf[i * 4 + 0] = v;
      buf[i * 4 + 1] = v;
      buf[i * 4 + 2] = v;
      buf[i * 4 + 3] = 0xFF;
    }
    map.set('noise', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 7. Dots (32x32)
  {
    const w = 32, h = 32;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x % 16) - 8;
        const dy = (y % 16) - 8;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = d < 5 ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('dots', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 8. Grid (32x32)
  {
    const w = 32, h = 32;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isLine = (x % 16 === 0 || y % 16 === 0);
        const v = isLine ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('grid', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 9. Grunge (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g1 = Math.sin(x * 0.05) * Math.sin(y * 0.05) * 80;
        const g2 = Math.cos(x * 0.2 + y * 0.1) * 40;
        const v = Math.max(0, Math.min(255, Math.floor(128 + g1 + g2 + (Math.random() - 0.5) * 70)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('grunge', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 10. Hatch (32x32)
  {
    const w = 32, h = 32;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isLine = ((x + y) % 8 === 0 || (x + y) % 8 === 1);
        const v = isLine ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('hatch', { width: w, height: h, data: buf, category: 'texture' });
  }

  return map;
}

/**
 * Evaluates basic mathematical expressions in Lisp-style prefix format `(+ 1 2)`
 * or standard arithmetic infix strings.
 * @param {string} expr - Expression string to evaluate
 * @returns {number} Evaluated number or NaN
 */
function evaluateMath(expr) {
  expr = expr.trim();
  if (expr.startsWith('(') && expr.endsWith(')')) {
    const inner = expr.slice(1, -1).trim();
    const tokens = [];
    let cur = '';
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '(') { depth++; cur += ch; }
      else if (ch === ')') { depth--; cur += ch; }
      else if (/\s/.test(ch) && depth === 0) {
        if (cur.length > 0) { tokens.push(cur); cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur.length > 0) tokens.push(cur);
    if (tokens.length === 0) return 0;

    const op = tokens[0];
    const args = tokens.slice(1).map(evaluateMath);

    switch (op) {
      case '+': return args.reduce((a, b) => a + b, 0);
      case '-': return args.length === 1 ? -args[0] : args.slice(1).reduce((a, b) => a - b, args[0]);
      case '*': return args.reduce((a, b) => a * b, 1);
      case '/': return args.slice(1).reduce((a, b) => (b === 0 ? 0 : a / b), args[0]);
      case '%': return args.slice(1).reduce((a, b) => a % b, args[0]);
      case '^': case '**': return Math.pow(args[0], args[1]);
      case 'min': return Math.min(...args);
      case 'max': return Math.max(...args);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'abs': return Math.abs(args[0]);
      default: break;
    }
  }

  const num = Number(expr);
  if (!isNaN(num)) return num;

  try {
    if (/^[0-9+\-*/().\s%^Math.sqrtabscosinfelx]+$/.test(expr)) {
      return Function(`"use strict"; return (${expr});`)();
    }
  } catch (e) {
    // ignore invalid formula syntax
  }
  return NaN;
}

/**
 * Parses user color string input (named color, #RRGGBB, or 'R G B [A]' numbers)
 * into a packed 32-bit integer in 0xAABBGGRR byte order.
 * @param {string} str - Color input string
 * @returns {number|null} Packed 32-bit color integer or null if invalid
 */
function parseColorString(str) {
  str = str.trim().toLowerCase();
  const named = {
    black: 0xFF000000, white: 0xFFFFFFFF, red: 0xFF0000FF, green: 0xFF00FF00,
    blue: 0xFFFF0000, yellow: 0xFF00FFFF, cyan: 0xFFFFFF00, magenta: 0xFFFF00FF,
    orange: 0xFF0080FF, gray: 0xFF808080, purple: 0xFF800080, pink: 0xFFCBC0FF
  };
  if (named[str] !== undefined) return named[str];

  if (str.startsWith('#') || str.startsWith('$')) {
    const hex = str.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }

  const parts = str.split(/[\s,]+/);
  if (parts.length >= 3) {
    const r = Math.min(255, Math.max(0, parseInt(parts[0], 10) || 0));
    const g = Math.min(255, Math.max(0, parseInt(parts[1], 10) || 0));
    const b = Math.min(255, Math.max(0, parseInt(parts[2], 10) || 0));
    const a = (parts.length >= 4) ? Math.min(255, Math.max(0, parseInt(parts[3], 10) || 255)) : 255;
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  return null;
}

/** Formats the flat layer list for CLI output. All layers are layers — no categories. */
function formatLayersList(screenActor) {
  const canvasActor = screenActor.canvasActor || screenActor;
  if (!canvasActor || !canvasActor.exports || typeof canvasActor.exports.get_layer_count !== 'function') {
    return 'Canvas not initialized\n';
  }
  const count = canvasActor.exports.get_layer_count();
  const active = canvasActor.exports.get_active_layer();
  const cw = canvasActor.exports.get_width ? canvasActor.exports.get_width() : canvasActor.exports.get_canvas_width();
  const ch = canvasActor.exports.get_height ? canvasActor.exports.get_height() : canvasActor.exports.get_canvas_height();

  let out = `\x1b[1mLayers (${count}) - canvas ${cw}x${ch}:\x1b[0m\n`;
  for (let i = 0; i < count; i++) {
    const vis = canvasActor.exports.get_layer_visible ? canvasActor.exports.get_layer_visible(i) : 1;
    const op  = canvasActor.exports.get_layer_opacity ? canvasActor.exports.get_layer_opacity(i) : 255;
    const w   = canvasActor.exports.w_layer_get_width  ? canvasActor.exports.w_layer_get_width(i)  : cw;
    const h   = canvasActor.exports.w_layer_get_height ? canvasActor.exports.w_layer_get_height(i) : ch;
    const opPct = Math.round((op / 255) * 100);

    // Resolve a human-readable name from the JS textures map
    let name = `layer_${i}`;
    if (screenActor.textures) {
      for (const [k, v] of screenActor.textures.entries()) {
        if (v.wasmId === i) { name = k; break; }
      }
    }

    const isDrawActive  = (i === active);
    const shapeId       = screenActor.brushParams ? screenActor.brushParams.shape : 0;
    const isShapeActive = (i === shapeId);
    const isTexActive   = (name === (screenActor.activeTexture || ''));

    const markers = [];
    if (isDrawActive)  markers.push('draw');
    if (isShapeActive) markers.push('shape');
    if (isTexActive)   markers.push('tex');

    const flag   = vis ? 'on ' : 'off';
    const mark   = markers.length > 0 ? ` \x1b[32m[${markers.join(',')}]\x1b[0m` : '';
    out += `  [${i}] "${name}" ${flag} ${w}x${h} ${opPct}%${mark}\n`;
  }
  return out;
}

/** Formats tool and brush properties for CLI output */
function formatBrushesList(screenActor) {
  let out = `\x1b[1mBrush & Tool:\x1b[0m
  Tools/modes  : brush, eraser, smudge, blend, fill, lasso_fill
  Shapes       : circle [0], square [1], chisel [2], or any layer by id/name
  Parameters   : size, opacity, hardness/softness, flow, spacing, angle, roundness, scatter, grain, smudge, wetness, tolerance, smooth/smoothing, bezier/midpoint
  Grain tex    : set texture <name|layer_id|none>  — rotated/scaled via texture_rotate, texture_scale
`;
  return out;
}

/** Formats available texture list for CLI output */
function formatTexturesList(screenActor) {
  const host = screenActor.textures ? screenActor : (screenActor.host || screenActor);
  if (!host.textures || host.textures.size === 0) {
    return '\x1b[1mTextures (0):\x1b[0m none\n';
  }
  let out = `\x1b[1mTextures (${host.textures.size}):\x1b[0m\n`;
  for (const [name, tex] of host.textures.entries()) {
    const isAct = (name === host.activeTexture) ? ' \x1b[32m[active]\x1b[0m' : '';
    const wasm = tex.wasmId !== undefined ? ` (layer: ${tex.wasmId})` : '';
    out += `  - "${name}" ${tex.width}x${tex.height}${wasm}${isAct}\n`;
  }
  return out;
}

/** Formats filter plugin list for CLI output */
function formatFiltersList(screenActor) {
  const host = screenActor.plugins ? screenActor : (screenActor.host || screenActor);
  let out = `\x1b[1mFilters:\x1b[0m\n`;
  if (host.plugins && host.plugins.size > 0) {
    for (const [name, actor] of host.plugins.entries()) {
      if (actor.type === 'filter') {
        out += `  - ${name}\n`;
      }
    }
  } else {
    out += '  (none loaded)\n';
  }
  return out;
}

/**
 * Command helper functions for Papagaio command rules
 */
function handleList(host, target) {
  const t = (target || 'all').toLowerCase();
  if (t === 'layer' || t === 'layers') {
    console.log(formatLayersList(host).trimEnd());
  } else if (t === 'brush' || t === 'brushes' || t === 'tools') {
    console.log(formatBrushesList(host).trimEnd());
  } else if (t === 'texture' || t === 'textures') {
    console.log(formatTexturesList(host).trimEnd());
  } else if (t === 'filter' || t === 'filters') {
    console.log(formatFiltersList(host).trimEnd());
  } else if (t === 'all' || t === '' || t === '*') {
    console.log('\x1b[1;34m=== Wesenho Entities ===\x1b[0m\n');
    console.log(formatLayersList(host).trimEnd() + '\n');
    console.log(formatBrushesList(host).trimEnd() + '\n');
    console.log(formatTexturesList(host).trimEnd() + '\n');
    console.log(formatFiltersList(host).trimEnd());
  } else {
    console.log(`\x1b[31merr: unknown list category '${target}'. Options: layers, brushes, textures, filters, all\x1b[0m`);
  }
}

function handleGet(host, rawCat, rawProp) {
  const cat = (rawCat || '').toLowerCase();
  const prop = (rawProp || '').toLowerCase();

  const cw = host.canvasActor.exports.get_canvas_width();
  const ch = host.canvasActor.exports.get_canvas_height();
  const activeL = host.canvasActor.exports.get_active_layer();
  const lCount = host.canvasActor.exports.get_layer_count();

  if (cat === 'surface' || cat === 'size' || cat === 'canvas' || cat === 'resolution') {
    if (prop === 'width' || prop === 'w' || cat === 'width') {
      console.log(cw);
    } else if (prop === 'height' || prop === 'h' || cat === 'height') {
      console.log(ch);
    } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions' || cat === 'size' || cat === 'resolution') {
      console.log(`${cw}x${ch}`);
    } else {
      console.log(`surface ${cw}x${ch} (layers: ${lCount})`);
    }
    return;
  }

  if (cat === 'layer' || cat === 'layers') {
    const targetId = !isNaN(parseInt(rawProp, 10)) ? parseInt(rawProp, 10) : activeL;
    const vis = host.canvasActor.exports.get_layer_visible ? host.canvasActor.exports.get_layer_visible(targetId) : 1;
    const op = host.canvasActor.exports.get_layer_opacity ? host.canvasActor.exports.get_layer_opacity(targetId) : 255;
    const opPct = Math.round((op / 255) * 100);

    if (prop === 'id' || prop === 'idx' || prop === 'active') {
      console.log(activeL);
    } else if (prop === 'count' || prop === 'total') {
      console.log(lCount);
    } else if (prop === 'opacity' || prop === 'op') {
      console.log(`${opPct}%`);
    } else if (prop === 'visible' || prop === 'visibility' || prop === 'vis') {
      console.log(vis ? 'visible' : 'hidden');
    } else {
      console.log(`layer [${targetId}] ${vis ? 'visible' : 'hidden'} opacity: ${opPct}% (active: ${activeL}, total: ${lCount})`);
    }
    return;
  }

  if (cat === 'tool') {
    if (host.currentTool === 1) {
      console.log('eraser');
    } else {
      const modes = ['brush', 'smudge', 'blend', 'fill', 'lasso_fill'];
      console.log(modes[host.brushParams.mode] || 'brush');
    }
    return;
  }

  if (cat === 'mode') {
    const modes = ['draw', 'smudge', 'blend', 'fill', 'lasso_fill'];
    console.log(modes[host.brushParams.mode] || 'draw');
    return;
  }

  if (cat === 'shape') {
    const shapes = ['circle', 'square', 'chisel'];
    const sId = host.brushParams.shape;
    if (shapes[sId]) {
      console.log(shapes[sId]);
    } else {
      let foundName = null;
      for (const [k, v] of host.textures.entries()) {
        if (v.wasmId === sId) {
          foundName = k;
          break;
        }
      }
      if (!foundName && host.canvasActor && typeof host.canvasActor.exports.get_layer_count === 'function') {
        const count = host.canvasActor.exports.get_layer_count();
        for (let i = 0; i < count; i++) {
          const tid = host.canvasActor.exports.w_layer_get_texture ? host.canvasActor.exports.w_layer_get_texture(i) : i;
          if (tid === sId) {
            foundName = `layer_${i}`;
            break;
          }
        }
      }
      console.log(foundName || `texture_${sId}`);
    }
    return;
  }

  if (cat === 'brush') {
    if (prop === 'params' || prop === 'all' || prop === '') {
      console.log(JSON.stringify(host.brushParams, null, 2));
    } else if (host.brushParams[prop] !== undefined) {
      console.log(host.brushParams[prop]);
    } else {
      const shapes = ['circle', 'square', 'chisel'];
      const sName = shapes[host.brushParams.shape] || `texture_${host.brushParams.shape}`;
      console.log(`brush: shape=${sName}, mode=${['draw', 'smudge', 'blend', 'fill', 'lasso_fill'][host.brushParams.mode]}, size=${host.brushParams.size}, opacity=${host.brushParams.opacity}%, hardness=${host.brushParams.hardness}%`);
    }
    return;
  }

  if (cat === 'texture' || cat === 'tex') {
    const tex = host.getActiveTexture();
    if (prop === 'name' || prop === '') {
      console.log(host.activeTexture);
    } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions') {
      console.log(tex ? `${tex.width}x${tex.height}` : 'none');
    } else if (prop === 'count' || prop === 'total') {
      console.log(host.textures.size);
    } else {
      console.log(`texture: "${host.activeTexture}" (${tex ? `${tex.width}x${tex.height}` : 'none'}, total: ${host.textures.size})`);
    }
    return;
  }

  if (cat === 'color') {
    const c = host.currentColor;
    const r = c & 0xFF;
    const g = (c >> 8) & 0xFF;
    const b = (c >> 16) & 0xFF;
    const a = (c >> 24) & 0xFF;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    if (prop === 'rgb') {
      console.log(`${r} ${g} ${b}`);
    } else if (prop === 'hex') {
      console.log(hex);
    } else {
      console.log(`color: ${hex} (rgba: ${r}, ${g}, ${b}, ${a})`);
    }
    return;
  }

  if (cat === 'grid' || cat === 'pixel_grid') {
    console.log(host.showPixelGrid ? 'on' : 'off');
    return;
  }

  if (cat === 'zoom') {
    console.log(`${(host.zoom * 100).toFixed(0)}%`);
    return;
  }

  if (cat === 'pan') {
    console.log(`(${Math.round(host.panX)}, ${Math.round(host.panY)})`);
    return;
  }

  if (cat === 'ui_scale' || cat === 'scale') {
    console.log(host.uiScale);
    return;
  }

  const canonGet = {
    radius: 'size', rad: 'size', op: 'opacity', alpha: 'opacity', hard: 'hardness',
    step: 'spacing', rot: 'angle', rotation: 'angle', rotate: 'angle',
    shape_angle: 'angle', shape_rotate: 'angle', aspect: 'roundness',
    jitter: 'scatter', noise: 'grain', wet: 'wetness', tol: 'tolerance',
    smudge_strength: 'smudge', tex_mode: 'texture_mode', type: 'mode',
    tex_angle: 'texture_angle', tex_rotate: 'texture_angle', tex_rot: 'texture_angle',
    texture_angle: 'texture_angle', texture_rotate: 'texture_angle', texture_rot: 'texture_angle',
    tex_scale: 'texture_scale', texture_scale: 'texture_scale', tex_size: 'texture_scale', texture_size: 'texture_scale',
    grain_scale: 'texture_scale', grain_size: 'texture_scale',
    smooth: 'smoothing', stabilizer: 'smoothing',
    bezier: 'midpoint', bezier_midpoint: 'midpoint',
    tex_contrast: 'texture_contrast', grain_contrast: 'texture_contrast',
    taper: 'taper_in', taper_start: 'taper_in', taper_end: 'taper_out',
    flow_jitter: 'opacity_jitter', dab_blend_mode: 'dab_blend', blend_mode: 'dab_blend'
  };
  const resolvedCat = canonGet[cat] || cat;
  if (host.brushParams[resolvedCat] !== undefined) {
    console.log(host.brushParams[resolvedCat]);
    return;
  }

  console.log(`err: unknown get property '${rawCat}'`);
}

function handleShowStatus(host) {
  const activeL = host.canvasActor.exports.get_active_layer();
  const lCount = host.canvasActor.exports.get_layer_count();
  const cw = host.canvasActor.exports.get_width ? host.canvasActor.exports.get_width() : host.canvasActor.exports.get_canvas_width();
  const ch = host.canvasActor.exports.get_height ? host.canvasActor.exports.get_height() : host.canvasActor.exports.get_canvas_height();
  const shapes = ['circle', 'square', 'chisel'];
  const modes = ['draw', 'smudge', 'blend', 'fill', 'lasso_fill'];

  console.log(`\x1b[1mStatus:\x1b[0m
  Surface: ${cw}x${ch} | Layer: [${activeL}] of ${lCount}
  Tool:    ${host.currentTool === 1 ? 'eraser' : (modes[host.brushParams.mode] || 'brush')}
  Mode:    ${modes[host.brushParams.mode] || 'draw'}
  Shape:   ${shapes[host.brushParams.shape] || 'circle'}
  Texture: "${host.activeTexture}" (mode: ${host.brushParams.texture_mode})
  Brush:   size=${host.brushParams.size}, opacity=${host.brushParams.opacity}%, hardness=${host.brushParams.hardness}%, flow=${host.brushParams.flow}%, spacing=${host.brushParams.spacing}%, smooth=${host.brushParams.smoothing || 0}%, midpoint=${host.brushParams.midpoint ?? 50}%
  Angle:   ${host.brushParams.angle}°, roundness=${host.brushParams.roundness}%, grain=${host.brushParams.grain}%, scatter=${host.brushParams.scatter}%
  Color:   0x${host.currentColor.toString(16).padStart(8, '0')}
  Zoom:    ${(host.zoom * 100).toFixed(0)}% | Pan: (${Math.round(host.panX)}, ${Math.round(host.panY)})
`);
}

function handleResize(host, w, h) {
  w = parseInt(w, 10);
  h = parseInt(h, 10);
  if (w >= 1 && h >= 1) {
    host.canvasActor.exports.w_resize(w, h);
    host.sendConsoleLog(`surface resized to ${w}x${h}`);
  } else {
    host.sendConsoleLog('err: invalid dimensions (must be >= 1x1)', 0xFFFF5555);
  }
}

function handleLayerResize(host, id, w, h, resample = 1) {
  w = parseInt(w, 10);
  h = parseInt(h, 10);
  id = parseInt(id, 10);
  if (isNaN(w) || isNaN(h) || w < 1 || h < 1) {
    host.sendConsoleLog('err: layer dimensions must be >= 1x1', 0xFFFF5555);
    return;
  }
  if (!host.canvasActor || !host.canvasActor.exports || !host.canvasActor.exports.w_layer_resize) {
    host.sendConsoleLog('err: w_layer_resize export not available', 0xFFFF5555);
    return;
  }
  const ret = host.canvasActor.exports.w_layer_resize(id, w, h, resample ? 1 : 0);
  if (ret < 0) {
    host.sendConsoleLog(`err: cannot resize layer [${id}]`, 0xFFFF5555);
    return;
  }
  if (host.textures) {
    for (const [k, v] of host.textures.entries()) {
      if (v.wasmId === id) {
        v.width = w;
        v.height = h;
      }
    }
  }
  host.sendConsoleLog(`layer [${id}] resized to ${w}x${h} (${resample ? 'resampled' : 'cropped'})`);
}

function handleSetTool(host, rawTool) {
  const t = rawTool.toLowerCase();
  if (t === 'eraser' || t === 'erase') {
    host.currentTool = 1;
    host.sendConsoleLog('tool set to eraser');
  } else if (t === 'brush' || t === 'draw') {
    host.currentTool = 0;
    host.setBrushParam('mode', 0);
    host.sendConsoleLog('tool set to brush (draw)');
  } else if (t === 'square' || t === 'circle' || t === 'round' || t === 'chisel' || t === 'flat') {
    host.setBrushParam('shape', t);
    host.sendConsoleLog(`brush shape set to ${t}`);
  } else if (t === 'smudge') {
    host.currentTool = 0;
    host.setBrushParam('mode', 1);
    host.sendConsoleLog('tool set to smudge');
  } else if (t === 'blend') {
    host.currentTool = 0;
    host.setBrushParam('mode', 2);
    host.sendConsoleLog('tool set to blend');
  } else if (t === 'fill' || t === 'flood_fill') {
    host.currentTool = 0;
    host.setBrushParam('mode', 3);
    host.sendConsoleLog('tool set to flood fill');
  } else if (t === 'lasso_fill' || t === 'lasso') {
    host.currentTool = 0;
    host.setBrushParam('mode', 4);
    host.sendConsoleLog('tool set to lasso fill');
  } else {
    host.sendConsoleLog(`err: unknown tool '${rawTool}'`, 0xFFFF5555);
  }
}

function handleSetMode(host, rawMode) {
  const m = rawMode.toLowerCase();
  if (m === 'eraser' || m === 'erase') {
    host.currentTool = 1;
    host.sendConsoleLog('mode set to eraser');
  } else if (m === 'draw' || m === 'brush') {
    host.currentTool = 0;
    host.setBrushParam('mode', 0);
    host.sendConsoleLog('mode set to draw');
  } else if (m === 'smudge') {
    host.currentTool = 0;
    host.setBrushParam('mode', 1);
    host.sendConsoleLog('mode set to smudge');
  } else if (m === 'blend') {
    host.currentTool = 0;
    host.setBrushParam('mode', 2);
    host.sendConsoleLog('mode set to blend');
  } else if (m === 'fill' || m === 'flood_fill') {
    host.currentTool = 0;
    host.setBrushParam('mode', 3);
    host.sendConsoleLog('mode set to fill');
  } else if (m === 'lasso_fill' || m === 'lasso') {
    host.currentTool = 0;
    host.setBrushParam('mode', 4);
    host.sendConsoleLog('mode set to lasso fill');
  } else {
    host.sendConsoleLog(`err: unknown mode '${rawMode}'`, 0xFFFF5555);
  }
}

function handleBrushParamOrPreset(host, sub, val) {
  const s = sub.toLowerCase();
  if (PARAM_IDS[s] !== undefined && val !== undefined) {
    host.setBrushParam(s, val);
    host.sendConsoleLog(`brush ${s} set to ${val}`);
  } else if (BRUSH_PRESETS[s]) {
    host.selectBrushPreset(s);
    host.sendConsoleLog(`brush preset '${s}' applied`);
  } else {
    host.sendConsoleLog(`err: unknown brush parameter '${sub}'`, 0xFFFF5555);
  }
}

function handleDirectParam(host, rawParam, val) {
  const p = rawParam.toLowerCase();
  if (PARAM_IDS[p] !== undefined && val !== undefined) {
    host.setBrushParam(p, val);
    host.sendConsoleLog(`brush ${p} set to ${val}`);
    return true;
  }
  return false;
}

/**
 * Extensible command pattern table powered 100% by Papagaio.
 * Add custom syntax patterns here or push to WesenhoScreenHost.COMMAND_RULES!
 */
const COMMAND_RULES = [
  // Math expressions in parens or eval
  {
    pat: "$expr$block{(}{)}",
    run: (m, host, raw) => {
      const val = evaluateMath(raw);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
        return true;
      }
      return false;
    }
  },
  {
    pat: "eval $expr",
    run: (m) => {
      const val = evaluateMath(m.expr);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
      } else {
        console.log('\x1b[31merr: invalid expression\x1b[0m');
      }
    }
  },

  // Log message
  {
    pat: "log $msg",
    run: (m, host) => {
      host.sendConsoleLog(m.msg);
    }
  },

  // Help
  {
    pat: "help",
    run: () => {
      console.log(`
\x1b[1mAvailable Commands:\x1b[0m
  \x1b[36mTool & Brush Setup (Build Your Own Custom Brush):\x1b[0m
    set tool <brush|eraser|square|circle|chisel|smudge|blend|fill|lasso_fill>
    set mode <draw|eraser|smudge|blend|fill|lasso_fill>
    set shape <circle|square|chisel|<texture>|layer_<id>>  Tip shape (samples alpha channel)
    set texture <paper|canvas|noise|dots|grid|grunge|hatch|<name>|layer_<id>|none>
    set size <val>               Brush tip radius/size (1..500)
    set opacity <0..100>         Brush opacity percentage
    set hardness / softness <val> 0% soft airbrush to 100% hard edge
    set flow <0..100>            Ink flow rate per dab
    set spacing <1..500>         Dab interpolation spacing
    set angle / rotate <0..359>  Tip rotation angle in degrees
    set roundness <1..100>       Tip aspect ratio / roundness
    set scatter <0..500>         Stochastic position jitter
    set grain <0..100>           Stochastic pixel noise / grain
    set smudge <0..100>          Smudge pick-up intensity
    set wetness <0..100>         Color wetness mix ratio
    set tolerance <0..255>       Flood fill color tolerance
    set texture_rotate <0..359>  Texture pattern rotation in degrees
    set texture_scale <1..1000>  Texture pattern scale percentage
    set smooth / smoothing <0..100> Stroke stabilizer & smoothing percentage
    set bezier / midpoint <0..100> Bézier midpoint ratio percentage (default 50)

  \x1b[36mInspect & Query (list / get / status):\x1b[0m
    status / info                Show active tool, brush, surface & viewport status
    list [layers|textures|filters|all] List entities
    get [tool|mode|shape|texture|size|opacity|hardness|flow|spacing|angle|roundness|scatter|grain|color|layer|surface]

  \x1b[36mSurface & Layer Commands (Layers are Textures):\x1b[0m
    resize <w> <h>               Resize canvas dimensions
    new layer / layer add        Add new layer
    set layer / layer select <id> Select active layer
    delete layer [id]            Delete layer
    toggle layer [id]            Toggle layer visibility
    opacity layer <id> <0..100>  Set layer opacity percentage
    clear layer                  Clear active layer
    layer to texture [name]      Register active layer as named texture

  \x1b[36mFilter Commands:\x1b[0m
    filter <name> [p1] [p2]      Apply filter (blur, brightness, contrast, dither,
                                 edge, grayscale, invert, noise, pixelate, sepia, threshold)

  \x1b[36mImage I/O & Drawing:\x1b[0m
    save [canvas|layer] <file>   Export image to disk (PNG, BMP, PPM)
    load image <file> [name]     Load image file into texture storage
    draw image / stamp <name> [x] [y] [w] [h] [opacity] Draw texture/image with optional size
    set color <#hex|r g b|name>  Set active drawing color
    draw line <x0> <y0> <x1> <y1> [col]
    draw rect <x> <y> <w> <h> [col]
    draw circle <cx> <cy> <r> [col]
    draw grid <step> [col]
    exit / quit                  Quit application
`);
    }
  },

  // Exit / Quit
  { pat: "exit", run: () => { console.log('Goodbye.'); process.exit(0); } },
  { pat: "quit", run: () => { console.log('Goodbye.'); process.exit(0); } },

  // Status & Info
  { pat: "status", run: (m, host) => handleShowStatus(host) },
  { pat: "info", run: (m, host) => handleShowStatus(host) },

  // List entities
  { pat: "list $target", run: (m, host) => handleList(host, m.target) },
  { pat: "list", run: (m, host) => handleList(host, 'all') },
  { pat: "layers", run: (m, host) => handleList(host, 'layers') },
  { pat: "brushes", run: (m, host) => handleList(host, 'brushes') },
  { pat: "textures", run: (m, host) => handleList(host, 'textures') },
  { pat: "filters", run: (m, host) => handleList(host, 'filters') },

  // Get queries
  { pat: "get $cat $prop", run: (m, host) => handleGet(host, m.cat, m.prop) },
  { pat: "get $cat", run: (m, host) => handleGet(host, m.cat, '') },

  // Resize & Surface Dimensions
  { pat: "resize $w$int $h$int", run: (m, host) => handleResize(host, m.w, m.h) },
  { pat: "set resolution $w$int $h$int", run: (m, host) => handleResize(host, m.w, m.h) },
  { pat: "set canvas size $w$int $h$int", run: (m, host) => handleResize(host, m.w, m.h) },
  { pat: "set size $w$int $h$int", run: (m, host) => handleResize(host, m.w, m.h) },
  {
    pat: "set width $w$int",
    run: (m, host) => {
      const h = host.canvasActor.exports.get_height ? host.canvasActor.exports.get_height() : host.canvasActor.exports.get_canvas_height();
      handleResize(host, m.w, h);
    }
  },
  {
    pat: "set w $w$int",
    run: (m, host) => {
      const h = host.canvasActor.exports.get_height ? host.canvasActor.exports.get_height() : host.canvasActor.exports.get_canvas_height();
      handleResize(host, m.w, h);
    }
  },
  {
    pat: "set height $h$int",
    run: (m, host) => {
      const w = host.canvasActor.exports.get_width ? host.canvasActor.exports.get_width() : host.canvasActor.exports.get_canvas_width();
      handleResize(host, w, m.h);
    }
  },
  {
    pat: "set h $h$int",
    run: (m, host) => {
      const w = host.canvasActor.exports.get_width ? host.canvasActor.exports.get_width() : host.canvasActor.exports.get_canvas_width();
      handleResize(host, w, m.h);
    }
  },

  // Layer Commands
  {
    pat: "new layer",
    run: (m, host) => {
      const idx = host.canvasActor.exports.w_layer_add();
      host.sendConsoleLog(`new layer [${idx}] added`);
    }
  },
  { pat: "layer add", run: (m, host) => COMMAND_RULES.find(r => r.pat === "new layer").run(m, host) },
  { pat: "layer new", run: (m, host) => COMMAND_RULES.find(r => r.pat === "new layer").run(m, host) },

  {
    pat: "layer select $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      host.canvasActor.exports.w_layer_select(id);
      host.sendConsoleLog(`selected layer [${id}]`);
    }
  },
  { pat: "select layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer select $id$int").run(m, host) },
  { pat: "set layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer select $id$int").run(m, host) },
  { pat: "layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer select $id$int").run(m, host) },

  {
    pat: "delete layer $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      host.canvasActor.exports.w_layer_delete(id);
      host.sendConsoleLog(`deleted layer [${id}]`);
    }
  },
  {
    pat: "delete layer",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      host.canvasActor.exports.w_layer_delete(id);
      host.sendConsoleLog(`deleted layer [${id}]`);
    }
  },
  { pat: "remove layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "delete layer $id$int").run(m, host) },
  { pat: "remove layer", run: (m, host) => COMMAND_RULES.find(r => r.pat === "delete layer").run(m, host) },
  { pat: "layer delete $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "delete layer $id$int").run(m, host) },
  { pat: "layer delete", run: (m, host) => COMMAND_RULES.find(r => r.pat === "delete layer").run(m, host) },

  {
    pat: "duplicate layer $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const newId = host.canvasActor.exports.w_layer_duplicate ? host.canvasActor.exports.w_layer_duplicate(id) : -1;
      if (newId >= 0) host.sendConsoleLog(`layer [${id}] duplicated to [${newId}]`);
      else host.sendConsoleLog(`err: failed to duplicate layer [${id}]`, 0xFFFF5555);
    }
  },
  {
    pat: "duplicate layer",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      const newId = host.canvasActor.exports.w_layer_duplicate ? host.canvasActor.exports.w_layer_duplicate(id) : -1;
      if (newId >= 0) host.sendConsoleLog(`layer [${id}] duplicated to [${newId}]`);
      else host.sendConsoleLog(`err: failed to duplicate layer [${id}]`, 0xFFFF5555);
    }
  },
  { pat: "layer duplicate $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "duplicate layer $id$int").run(m, host) },
  { pat: "layer duplicate", run: (m, host) => COMMAND_RULES.find(r => r.pat === "duplicate layer").run(m, host) },
  { pat: "layer dup $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "duplicate layer $id$int").run(m, host) },
  { pat: "layer dup", run: (m, host) => COMMAND_RULES.find(r => r.pat === "duplicate layer").run(m, host) },
  { pat: "dup layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "duplicate layer $id$int").run(m, host) },
  { pat: "dup layer", run: (m, host) => COMMAND_RULES.find(r => r.pat === "duplicate layer").run(m, host) },

  {
    pat: "toggle layer $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      host.canvasActor.exports.w_layer_toggle(id);
      host.sendConsoleLog(`toggled layer [${id}] visibility`);
    }
  },
  {
    pat: "toggle layer",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      host.canvasActor.exports.w_layer_toggle(id);
      host.sendConsoleLog(`toggled layer [${id}] visibility`);
    }
  },
  { pat: "hide layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle layer $id$int").run(m, host) },
  { pat: "hide layer", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle layer").run(m, host) },
  { pat: "show layer $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle layer $id$int").run(m, host) },
  { pat: "show layer", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle layer").run(m, host) },
  { pat: "layer toggle $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle layer $id$int").run(m, host) },
  { pat: "layer toggle", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle layer").run(m, host) },

  {
    pat: "opacity layer $id$int $val$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const val = parseInt(m.val, 10);
      const op255 = Math.min(255, Math.max(0, Math.round(val * 255 / 100)));
      host.canvasActor.exports.w_layer_opacity(id, op255);
      host.sendConsoleLog(`set layer [${id}] opacity to ${val}%`);
    }
  },
  { pat: "layer opacity $id$int $val$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "opacity layer $id$int $val$int").run(m, host) },
  { pat: "set layer $id$int opacity $val$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "opacity layer $id$int $val$int").run(m, host) },
  {
    pat: "set layer opacity $val$int",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      const val = parseInt(m.val, 10);
      const op255 = Math.min(255, Math.max(0, Math.round(val * 255 / 100)));
      host.canvasActor.exports.w_layer_opacity(id, op255);
      host.sendConsoleLog(`set layer [${id}] opacity to ${val}%`);
    }
  },

  // Layer Resize Commands
  {
    pat: "layer resize $id$int $w$int $h$int $mode",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const w = parseInt(m.w, 10);
      const h = parseInt(m.h, 10);
      const resample = (m.mode && m.mode.toLowerCase().includes('crop')) ? 0 : 1;
      handleLayerResize(host, id, w, h, resample);
    }
  },
  {
    pat: "layer resize $id$int $w$int $h$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const w = parseInt(m.w, 10);
      const h = parseInt(m.h, 10);
      handleLayerResize(host, id, w, h, 1);
    }
  },
  {
    pat: "layer resize $w$int $h$int $mode",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      const w = parseInt(m.w, 10);
      const h = parseInt(m.h, 10);
      const resample = (m.mode && m.mode.toLowerCase().includes('crop')) ? 0 : 1;
      handleLayerResize(host, id, w, h, resample);
    }
  },
  {
    pat: "layer resize $w$int $h$int",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      const w = parseInt(m.w, 10);
      const h = parseInt(m.h, 10);
      handleLayerResize(host, id, w, h, 1);
    }
  },
  {
    pat: "resize layer $id$int $w$int $h$int $mode",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer resize $id$int $w$int $h$int $mode").run(m, host)
  },
  {
    pat: "resize layer $id$int $w$int $h$int",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer resize $id$int $w$int $h$int").run(m, host)
  },
  {
    pat: "resize layer $w$int $h$int $mode",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer resize $w$int $h$int $mode").run(m, host)
  },
  {
    pat: "resize layer $w$int $h$int",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer resize $w$int $h$int").run(m, host)
  },

  // Layer Reordering & Merge Down
  {
    pat: "layer move up $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const ok = host.moveLayerUp(id);
      if (ok) host.sendConsoleLog(`layer [${id}] moved up`);
      else host.sendConsoleLog(`err: cannot move layer [${id}] up`, 0xFFFF5555);
    }
  },
  {
    pat: "layer move up",
    run: (m, host) => {
      const id = host.canvasActor?.exports?.get_active_layer?.() ?? -1;
      const ok = host.moveLayerUp(id);
      if (ok) host.sendConsoleLog(`layer [${id}] moved up`);
      else host.sendConsoleLog(`err: cannot move layer [${id}] up`, 0xFFFF5555);
    }
  },
  { pat: "layer up $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer move up $id$int").run(m, host) },
  { pat: "layer up", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer move up").run(m, host) },
  {
    pat: "layer move down $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const ok = host.moveLayerDown(id);
      if (ok) host.sendConsoleLog(`layer [${id}] moved down`);
      else host.sendConsoleLog(`err: cannot move layer [${id}] down`, 0xFFFF5555);
    }
  },
  {
    pat: "layer move down",
    run: (m, host) => {
      const id = host.canvasActor?.exports?.get_active_layer?.() ?? -1;
      const ok = host.moveLayerDown(id);
      if (ok) host.sendConsoleLog(`layer [${id}] moved down`);
      else host.sendConsoleLog(`err: cannot move layer [${id}] down`, 0xFFFF5555);
    }
  },
  { pat: "layer down $id$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer move down $id$int").run(m, host) },
  { pat: "layer down", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer move down").run(m, host) },

  {
    pat: "layer merge down $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const res = host.mergeLayerDown(id);
      if (res >= 0) host.sendConsoleLog(`layer [${id}] merged into [${res}]`);
      else host.sendConsoleLog(`err: cannot merge down layer [${id}]`, 0xFFFF5555);
    }
  },
  {
    pat: "layer merge down",
    run: (m, host) => {
      const id = host.canvasActor?.exports?.get_active_layer?.() ?? -1;
      const res = host.mergeLayerDown(id);
      if (res >= 0) host.sendConsoleLog(`layer [${id}] merged into [${res}]`);
      else host.sendConsoleLog(`err: cannot merge down layer [${id}]`, 0xFFFF5555);
    }
  },
  { pat: "merge down", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer merge down").run(m, host) },
  { pat: "layer merge", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer merge down").run(m, host) },

  // Layer Groups / Folders
  {
    pat: "group new $name",
    run: (m, host) => {
      const grp = host.createGroup(m.name);
      host.sendConsoleLog(`group '${grp.name}' created`);
    }
  },
  {
    pat: "group new",
    run: (m, host) => {
      const grp = host.createGroup();
      host.sendConsoleLog(`group '${grp.name}' created`);
    }
  },
  { pat: "new group $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "group new $name").run(m, host) },
  { pat: "new group", run: (m, host) => COMMAND_RULES.find(r => r.pat === "group new").run(m, host) },
  { pat: "folder new $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "group new $name").run(m, host) },
  { pat: "folder new", run: (m, host) => COMMAND_RULES.find(r => r.pat === "group new").run(m, host) },
  {
    pat: "group add $group $id$int",
    run: (m, host) => {
      const ok = host.addLayerToGroup(m.group, parseInt(m.id, 10));
      if (ok) host.sendConsoleLog(`added layer [${m.id}] to group '${m.group}'`);
      else host.sendConsoleLog(`err: group '${m.group}' not found`, 0xFFFF5555);
    }
  },
  {
    pat: "group remove $id$int",
    run: (m, host) => {
      const ok = host.removeLayerFromGroup(parseInt(m.id, 10));
      if (ok) host.sendConsoleLog(`removed layer [${m.id}] from group`);
      else host.sendConsoleLog(`layer [${m.id}] was not in any group`, 0xFFFF5555);
    }
  },
  {
    pat: "group toggle $group",
    run: (m, host) => {
      const ok = host.toggleGroup(m.group);
      if (ok) host.sendConsoleLog(`toggled group '${m.group}' visibility`);
      else host.sendConsoleLog(`err: group '${m.group}' not found`, 0xFFFF5555);
    }
  },
  {
    pat: "group delete $group",
    run: (m, host) => {
      const ok = host.deleteGroup(m.group);
      if (ok) host.sendConsoleLog(`deleted group '${m.group}'`);
      else host.sendConsoleLog(`err: group '${m.group}' not found`, 0xFFFF5555);
    }
  },

  // Undo / Redo History
  {
    pat: "undo",
    run: (m, host) => {
      const res = host.undo();
      if (!res.ok) host.sendConsoleLog(res.msg || 'Nothing to undo', 0xFFFF5555);
    }
  },
  {
    pat: "redo",
    run: (m, host) => {
      const res = host.redo();
      if (!res.ok) host.sendConsoleLog(res.msg || 'Nothing to redo', 0xFFFF5555);
    }
  },

  {
    pat: "clear layer $id$int",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      host.pushUndoSnapshot(`clear layer ${id}`);
      host.canvasActor.exports.w_layer_clear(id);
      host.sendConsoleLog(`layer [${id}] cleared`);
    }
  },
  {
    pat: "clear layer",
    run: (m, host) => {
      host.pushUndoSnapshot('clear active layer');
      host.canvasActor.exports.w_layer_clear(-1);
      host.sendConsoleLog('active layer cleared');
    }
  },
  { pat: "clear active layer", run: (m, host) => COMMAND_RULES.find(r => r.pat === "clear layer").run(m, host) },
  { pat: "layer clear", run: (m, host) => COMMAND_RULES.find(r => r.pat === "clear layer").run(m, host) },
  { pat: "clear", run: (m, host) => COMMAND_RULES.find(r => r.pat === "clear layer").run(m, host) },

  // Layer to Texture
  {
    pat: "layer to texture $name",
    run: (m, host) => {
      const tname = m.name || `layer_${Date.now() % 1000}`;
      const ok = host.convertLayerToTexture(-1, tname);
      if (ok) host.sendConsoleLog(`layer converted to texture '${tname}'`);
      else host.sendConsoleLog('err: failed converting layer to texture', 0xFFFF5555);
    }
  },
  {
    pat: "layer to texture",
    run: (m, host) => {
      const tname = `layer_${Date.now() % 1000}`;
      const ok = host.convertLayerToTexture(-1, tname);
      if (ok) host.sendConsoleLog(`layer converted to texture '${tname}'`);
      else host.sendConsoleLog('err: failed converting layer to texture', 0xFFFF5555);
    }
  },
  { pat: "layer-to-texture $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer to texture $name").run(m, host) },
  { pat: "layer-to-texture", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer to texture").run(m, host) },
  { pat: "layertotexture $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer to texture $name").run(m, host) },
  { pat: "layertotexture", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer to texture").run(m, host) },

  // Tools, Modes & Shapes
  { pat: "set tool $tool", run: (m, host) => handleSetTool(host, m.tool) },
  { pat: "tool $tool", run: (m, host) => handleSetTool(host, m.tool) },
  { pat: "set mode $mode", run: (m, host) => handleSetMode(host, m.mode) },
  { pat: "mode $mode", run: (m, host) => handleSetMode(host, m.mode) },
  {
    pat: "set shape $shape",
    run: (m, host) => {
      host.setBrushParam('shape', m.shape);
      host.sendConsoleLog(`brush shape set to ${m.shape}`);
    }
  },
  { pat: "shape $shape", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set shape $shape").run(m, host) },

  // Textures
  {
    pat: "set texture $tex",
    run: (m, host) => {
      const tname = m.tex.toLowerCase();
      const ok = host.setTexture(tname);
      if (ok) {
        host.sendConsoleLog(`texture set to '${tname}'`);
      } else {
        host.sendConsoleLog(`err: texture '${tname}' not found. Options: paper, canvas, noise, dots, grid, grunge, hatch, none`, 0xFFFF5555);
      }
    }
  },
  { pat: "set tex $tex", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set texture $tex").run(m, host) },
  { pat: "texture $tex", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set texture $tex").run(m, host) },
  { pat: "tex $tex", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set texture $tex").run(m, host) },

  // Brush Presets and Parameters
  { pat: "set brush $sub $val", run: (m, host) => handleBrushParamOrPreset(host, m.sub, m.val) },
  { pat: "brush $sub $val", run: (m, host) => handleBrushParamOrPreset(host, m.sub, m.val) },
  { pat: "set brush $preset", run: (m, host) => handleBrushParamOrPreset(host, m.preset, undefined) },
  { pat: "brush $preset", run: (m, host) => handleBrushParamOrPreset(host, m.preset, undefined) },

  // Direct Parameter Setters (e.g. set size 20, set hardness 100, set opacity 50, etc.)
  { pat: "midpoint $val", run: (m, host) => handleDirectParam(host, "midpoint", m.val) },
  { pat: "bezier $val", run: (m, host) => handleDirectParam(host, "bezier", m.val) },
  { pat: "bezier_midpoint $val", run: (m, host) => handleDirectParam(host, "bezier_midpoint", m.val) },
  {
    pat: "set grid $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      host.showPixelGrid = (v === 'on' || v === '1' || v === 'true' || v === 'yes');
      host.sendConsoleLog(`pixel grid ${host.showPixelGrid ? 'enabled' : 'disabled'}`);
    }
  },
  { pat: "grid $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set grid $val").run(m, host) },
  { pat: "set pixel_grid $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set grid $val").run(m, host) },
  { pat: "pixel_grid $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set grid $val").run(m, host) },
  {
    pat: "grid",
    run: (m, host) => {
      host.showPixelGrid = !host.showPixelGrid;
      host.sendConsoleLog(`pixel grid ${host.showPixelGrid ? 'enabled' : 'disabled'}`);
    }
  },

  // View Navigation
  {
    pat: "zoom fit",
    run: (m, host) => {
      const cw = host.canvasActor?.exports?.get_canvas_width?.() ?? 640;
      const ch = host.canvasActor?.exports?.get_canvas_height?.() ?? 480;
      const ww = host.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
      const wh = host.windowHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
      const padding = 40;
      const scale = Math.min(Math.max(10, ww - padding) / cw, Math.max(10, wh - padding) / ch, 10);
      host.zoom = Math.max(0.05, Math.min(20, scale));
      host.panX = (ww - cw * host.zoom) / 2;
      host.panY = (wh - ch * host.zoom) / 2;
      host.sendConsoleLog(`zoom fit: ${(host.zoom * 100).toFixed(0)}%`);
    }
  },
  { pat: "fit", run: (m, host) => COMMAND_RULES.find(r => r.pat === "zoom fit").run(m, host) },
  {
    pat: "zoom reset",
    run: (m, host) => {
      host.zoom = 1.0;
      const cw = host.canvasActor?.exports?.get_canvas_width?.() ?? 640;
      const ch = host.canvasActor?.exports?.get_canvas_height?.() ?? 480;
      const ww = host.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
      const wh = host.windowHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
      host.panX = (ww - cw) / 2;
      host.panY = (wh - ch) / 2;
      host.sendConsoleLog('zoom reset to 100%');
    }
  },
  { pat: "zoom 100", run: (m, host) => COMMAND_RULES.find(r => r.pat === "zoom reset").run(m, host) },
  { pat: "zoom 100%", run: (m, host) => COMMAND_RULES.find(r => r.pat === "zoom reset").run(m, host) },
  { pat: "zoom 1", run: (m, host) => COMMAND_RULES.find(r => r.pat === "zoom reset").run(m, host) },
  {
    pat: "zoom in",
    run: (m, host) => {
      host.zoom = Math.min(20, host.zoom * 1.25);
      host.sendConsoleLog(`zoom: ${(host.zoom * 100).toFixed(0)}%`);
    }
  },
  {
    pat: "zoom out",
    run: (m, host) => {
      host.zoom = Math.max(0.05, host.zoom * 0.8);
      host.sendConsoleLog(`zoom: ${(host.zoom * 100).toFixed(0)}%`);
    }
  },
  {
    pat: "zoom $val$int",
    run: (m, host) => {
      const v = parseInt(m.val, 10);
      if (v > 0) {
        host.zoom = Math.max(0.05, Math.min(20, v / 100));
        host.sendConsoleLog(`zoom: ${(host.zoom * 100).toFixed(0)}%`);
      }
    }
  },
  {
    pat: "pan reset",
    run: (m, host) => {
      const cw = host.canvasActor?.exports?.get_canvas_width?.() ?? 640;
      const ch = host.canvasActor?.exports?.get_canvas_height?.() ?? 480;
      const ww = host.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
      const wh = host.windowHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
      host.panX = (ww - cw * host.zoom) / 2;
      host.panY = (wh - ch * host.zoom) / 2;
      host.sendConsoleLog('pan reset to center');
    }
  },
  { pat: "pan center", run: (m, host) => COMMAND_RULES.find(r => r.pat === "pan reset").run(m, host) },
  {
    pat: "rotate reset",
    run: (m, host) => {
      host.canvasRotation = 0;
      host.sendConsoleLog('canvas rotation reset to 0°');
    }
  },
  { pat: "rot reset", run: (m, host) => COMMAND_RULES.find(r => r.pat === "rotate reset").run(m, host) },
  { pat: "rot 0", run: (m, host) => COMMAND_RULES.find(r => r.pat === "rotate reset").run(m, host) },
  { pat: "rotate 0", run: (m, host) => COMMAND_RULES.find(r => r.pat === "rotate reset").run(m, host) },

  // UI Scale / DPI adaptation
  {
    pat: "set ui_scale $val",
    run: (m, host) => {
      host.setUiScale(m.val);
      host.sendConsoleLog(`ui_scale set to ${m.val}`);
    }
  },
  {
    pat: "ui_scale $val",
    run: (m, host) => {
      host.setUiScale(m.val);
      host.sendConsoleLog(`ui_scale set to ${m.val}`);
    }
  },
  {
    pat: "set ui scale $val",
    run: (m, host) => {
      host.setUiScale(m.val);
      host.sendConsoleLog(`ui_scale set to ${m.val}`);
    }
  },
  {
    pat: "ui scale $val",
    run: (m, host) => {
      host.setUiScale(m.val);
      host.sendConsoleLog(`ui_scale set to ${m.val}`);
    }
  },
  {
    pat: "set $param $val",
    run: (m, host) => handleDirectParam(host, m.param, m.val)
  },

  // Filters
  {
    pat: "filter $name $p1$int $p2$int",
    run: (m, host) => {
      const ok = host.applyFilter(m.name.toLowerCase(), parseInt(m.p1, 10), parseInt(m.p2, 10));
      if (ok) host.sendConsoleLog(`filter '${m.name}' applied`);
      else host.sendConsoleLog(`err: filter '${m.name}' not found`, 0xFFFF5555);
    }
  },
  {
    pat: "filter $name $p1$int",
    run: (m, host) => {
      const ok = host.applyFilter(m.name.toLowerCase(), parseInt(m.p1, 10), 0);
      if (ok) host.sendConsoleLog(`filter '${m.name}' applied`);
      else host.sendConsoleLog(`err: filter '${m.name}' not found`, 0xFFFF5555);
    }
  },
  {
    pat: "filter $name",
    run: (m, host) => {
      const ok = host.applyFilter(m.name.toLowerCase(), 0, 0);
      if (ok) host.sendConsoleLog(`filter '${m.name}' applied`);
      else host.sendConsoleLog(`err: filter '${m.name}' not found`, 0xFFFF5555);
    }
  },

  // Image I/O
  {
    pat: "save canvas $file",
    run: (m, host) => {
      const res = host.saveCanvasOrLayer(m.file, 0);
      if (res.ok) host.sendConsoleLog(`image saved to '${res.path}'`);
      else host.sendConsoleLog(`err: failed saving image: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "save layer $file",
    run: (m, host) => {
      const res = host.saveCanvasOrLayer(m.file, 1);
      if (res.ok) host.sendConsoleLog(`image saved to '${res.path}'`);
      else host.sendConsoleLog(`err: failed saving image: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "save $file",
    run: (m, host) => {
      const res = host.saveCanvasOrLayer(m.file, 0);
      if (res.ok) host.sendConsoleLog(`image saved to '${res.path}'`);
      else host.sendConsoleLog(`err: failed saving image: ${res.error}`, 0xFFFF5555);
    }
  },
  { pat: "export $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save $file").run(m, host) },
  { pat: "export canvas $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save canvas $file").run(m, host) },
  { pat: "export layer $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save layer $file").run(m, host) },
  { pat: "export", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save $file").run({ file: "drawing.png" }, host) },
  {
    pat: "load image $file $name",
    run: (m, host) => {
      const res = host.loadImageFromFile(m.file, m.name);
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "load image $file",
    run: (m, host) => {
      const res = host.loadImageFromFile(m.file);
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "load $file $name",
    run: (m, host) => {
      const res = host.loadImageFromFile(m.file, m.name);
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "load $file",
    run: (m, host) => {
      const res = host.loadImageFromFile(m.file);
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },

  // Color
  {
    pat: "set color $r$int $g$int $b$int",
    run: (m, host) => {
      const r = Math.min(255, Math.max(0, parseInt(m.r, 10)));
      const g = Math.min(255, Math.max(0, parseInt(m.g, 10)));
      const b = Math.min(255, Math.max(0, parseInt(m.b, 10)));
      host.currentColor = (0xFF << 24) | (b << 16) | (g << 8) | r;
      host.sendConsoleLog(`color set to 0x${host.currentColor.toString(16).padStart(8, '0')}`);
    }
  },
  {
    pat: "color $r$int $g$int $b$int",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "set color $r$int $g$int $b$int").run(m, host)
  },
  {
    pat: "set color $col",
    run: (m, host) => {
      const parsed = parseColorString(m.col, host.currentColor);
      if (parsed !== null) {
        host.currentColor = parsed;
        host.sendConsoleLog(`color set to 0x${host.currentColor.toString(16).padStart(8, '0')}`);
      } else {
        host.sendConsoleLog(`err: unknown color '${m.col}'`, 0xFFFF5555);
      }
    }
  },
  {
    pat: "color $col",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "set color $col").run(m, host)
  },

  // Draw Image / Stamp
  {
    pat: "draw image $name $x$int $y$int $w$int $h$int $op$int",
    run: (m, host) => {
      const res = host.drawImage(m.name, parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10), parseInt(m.op, 10));
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "draw image $name $x$int $y$int $w$int $h$int",
    run: (m, host) => {
      const res = host.drawImage(m.name, parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10));
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "draw image $name $x$int $y$int",
    run: (m, host) => {
      const res = host.drawImage(m.name, parseInt(m.x, 10), parseInt(m.y, 10));
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },
  {
    pat: "draw image $name",
    run: (m, host) => {
      const res = host.drawImage(m.name, 0, 0);
      if (res.ok) host.sendConsoleLog(res.msg);
      else host.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
    }
  },

  // Stamp aliases
  { pat: "stamp $name $x$int $y$int $w$int $h$int $op$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name $x$int $y$int $w$int $h$int $op$int").run(m, host) },
  { pat: "stamp $name $x$int $y$int $w$int $h$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name $x$int $y$int $w$int $h$int").run(m, host) },
  { pat: "stamp $name $x$int $y$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name $x$int $y$int").run(m, host) },
  { pat: "stamp $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name").run(m, host) },
  { pat: "image $name $x$int $y$int $w$int $h$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name $x$int $y$int $w$int $h$int").run(m, host) },
  { pat: "image $name $x$int $y$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name $x$int $y$int").run(m, host) },
  { pat: "image $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "draw image $name").run(m, host) },

  // Primitive Draw Commands
  {
    pat: "draw line $x0$int $y0$int $x1$int $y1$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, host.currentColor);
      host.canvasActor.exports.w_draw_line(parseInt(m.x0, 10), parseInt(m.y0, 10), parseInt(m.x1, 10), parseInt(m.y1, 10), col);
      host.sendConsoleLog(`drew line from (${m.x0},${m.y0}) to (${m.x1},${m.y1})`);
    }
  },
  {
    pat: "draw line $x0$int $y0$int $x1$int $y1$int",
    run: (m, host) => {
      host.canvasActor.exports.w_draw_line(parseInt(m.x0, 10), parseInt(m.y0, 10), parseInt(m.x1, 10), parseInt(m.y1, 10), host.currentColor);
      host.sendConsoleLog(`drew line from (${m.x0},${m.y0}) to (${m.x1},${m.y1})`);
    }
  },
  {
    pat: "draw rect $x$int $y$int $w$int $h$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, host.currentColor);
      host.canvasActor.exports.w_draw_rect(parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10), col);
      host.sendConsoleLog(`drew rect at (${m.x},${m.y}) size ${m.w}x${m.h}`);
    }
  },
  {
    pat: "draw rect $x$int $y$int $w$int $h$int",
    run: (m, host) => {
      host.canvasActor.exports.w_draw_rect(parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10), host.currentColor);
      host.sendConsoleLog(`drew rect at (${m.x},${m.y}) size ${m.w}x${m.h}`);
    }
  },
  {
    pat: "draw circle $cx$int $cy$int $r$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, host.currentColor);
      host.canvasActor.exports.w_draw_circle(parseInt(m.cx, 10), parseInt(m.cy, 10), parseInt(m.r, 10), col);
      host.sendConsoleLog(`drew circle at (${m.cx},${m.cy}) radius ${m.r}`);
    }
  },
  {
    pat: "draw circle $cx$int $cy$int $r$int",
    run: (m, host) => {
      host.canvasActor.exports.w_draw_circle(parseInt(m.cx, 10), parseInt(m.cy, 10), parseInt(m.r, 10), host.currentColor);
      host.sendConsoleLog(`drew circle at (${m.cx},${m.cy}) radius ${m.r}`);
    }
  },
  {
    pat: "draw grid $step$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, 0x44FFFFFF);
      host.canvasActor.exports.w_draw_grid(parseInt(m.step, 10), col);
      host.sendConsoleLog(`drew grid step ${m.step}`);
    }
  },
  {
    pat: "draw grid $step$int",
    run: (m, host) => {
      host.canvasActor.exports.w_draw_grid(parseInt(m.step, 10), 0x44FFFFFF);
      host.sendConsoleLog(`drew grid step ${m.step}`);
    }
  }
];

/**
 * WesenhoScreenHost - Main Application State & Screen Host Actor.
 * Coordinates the SDL viewport window, user input, REPL commands,
 * Surface Canvas Actor, and dynamic WASM plugins.
 */
class WesenhoScreenHost {
  constructor() {
    // Viewport & Pan/Zoom State
    this.windowWidth = 1000;
    this.windowHeight = 900;
    this.zoom = 0.72;
    this.panX = (this.windowWidth - DOC_WIDTH * this.zoom) / 2;
    this.panY = (this.windowHeight - DOC_HEIGHT * this.zoom) / 2;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Mouse Tracking & Stroke State
    this.mouseState = { x: 0, y: 0, buttons: 0 };
    this.isDrawingOnCanvas = false;
    this.strokePrevX = -1;
    this.strokePrevY = -1;
    this.strokeIsEraser = 0;

    // Active Tool, Brush & Color State
    this.activeBrush = 'custom';
    this.currentColor = 0xFF000000; // Opaque Black (0xAABBGGRR)
    this.currentTool = 0;           // 0 = Brush, 1 = Eraser

    // Configurable Brush Parameters
    this.brushParams = {
      size: 8,
      opacity: 100,
      hardness: 80,
      flow: 100,
      spacing: 15,
      roundness: 100,
      angle: 0,
      scatter: 0,
      tolerance: 32,
      smudge: 60,
      wetness: 50,
      grain: 0,
      texture_mode: 0,
      texture_angle: 0,
      texture_scale: 100,
      shape: 0,
      mode: 0,
      smoothing: 0,
      midpoint: 50,
      texture_contrast: 100,
      auto_rotate: 0,
      velocity: 0,
      taper_in: 0,
      taper_out: 0,
      fade: 0,
      size_jitter: 0,
      angle_jitter: 0,
      opacity_jitter: 0,
      color_jitter: 0,
      dab_blend: 0
    };

    // Undo / Redo History
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoSteps = 25;

    // UI Scale / DPI adaptation
    this.uiScale = 'auto';
    this.onUiScaleChange = null;

    // Layer Groups / Folders
    this.layerGroups = new Map(); // id -> { id, name, collapsed: false, visible: true, layerIds: [] }
    this.groupCounter = 1;

    // Textures & Actors
    this.textures = createProceduralTextures();
    this.activeTexture = 'none';
    this.canvasTexPtr = 0;
    this.canvasTexByteLen = 0;

    this.canvasActor = null;
    this.plugins = new Map(); // name -> { type, module }

    this.window = null;
    this.screenBuffer = Buf.alloc(this.windowWidth * this.windowHeight * 4);
    this.rl = null;
  }

  /**
   * Captures the active layer's current pixel buffer for the undo stack.
   */
  pushUndoSnapshot(action = 'draw') {
    if (!this.canvasActor || !this.canvasActor.exports) return;
    const exports = this.canvasActor.exports;
    const layerIdx = (typeof exports.get_active_layer === 'function') ? exports.get_active_layer() : 3;
    const ptr = (typeof exports.get_layer_pixels === 'function') ? exports.get_layer_pixels(layerIdx) : 0;
    const w = (typeof exports.get_width === 'function') ? exports.get_width() : 0;
    const h = (typeof exports.get_height === 'function') ? exports.get_height() : 0;
    if (!ptr || w <= 0 || h <= 0) return;

    const byteLen = w * h * 4;
    const raw = new Uint8Array(this.canvasActor.memory.buffer, ptr, byteLen);
    const pixelsCopy = new Uint8Array(byteLen);
    pixelsCopy.set(raw);

    this.undoStack.push({
      action,
      layerIdx,
      width: w,
      height: h,
      pixels: pixelsCopy
    });

    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Reverts the active layer to the most recent undo snapshot.
   */
  undo() {
    if (!this.canvasActor || !this.canvasActor.exports) return { ok: false, msg: 'canvas not ready' };
    if (this.undoStack.length === 0) return { ok: false, msg: 'Nothing to undo' };

    const exports = this.canvasActor.exports;
    const snapshot = this.undoStack.pop();

    const layerIdx = snapshot.layerIdx;
    const ptr = (typeof exports.get_layer_pixels === 'function') ? exports.get_layer_pixels(layerIdx) : 0;
    const w = (typeof exports.get_width === 'function') ? exports.get_width() : 0;
    const h = (typeof exports.get_height === 'function') ? exports.get_height() : 0;

    if (ptr && w === snapshot.width && h === snapshot.height) {
      const raw = new Uint8Array(this.canvasActor.memory.buffer, ptr, w * h * 4);
      const currentPixels = new Uint8Array(w * h * 4);
      currentPixels.set(raw);

      this.redoStack.push({
        action: snapshot.action,
        layerIdx,
        width: w,
        height: h,
        pixels: currentPixels
      });

      raw.set(snapshot.pixels);
      if (typeof exports.w_force_composite === 'function') exports.w_force_composite();
      this.sendConsoleLog(`undo: ${snapshot.action}`);
      return { ok: true, action: snapshot.action };
    }
    return { ok: false, msg: 'layer dimension mismatch' };
  }

  /**
   * Re-applies an undone action from the redo stack.
   */
  redo() {
    if (!this.canvasActor || !this.canvasActor.exports) return { ok: false, msg: 'canvas not ready' };
    if (this.redoStack.length === 0) return { ok: false, msg: 'Nothing to redo' };

    const exports = this.canvasActor.exports;
    const snapshot = this.redoStack.pop();

    const layerIdx = snapshot.layerIdx;
    const ptr = (typeof exports.get_layer_pixels === 'function') ? exports.get_layer_pixels(layerIdx) : 0;
    const w = (typeof exports.get_width === 'function') ? exports.get_width() : 0;
    const h = (typeof exports.get_height === 'function') ? exports.get_height() : 0;

    if (ptr && w === snapshot.width && h === snapshot.height) {
      const raw = new Uint8Array(this.canvasActor.memory.buffer, ptr, w * h * 4);
      const currentPixels = new Uint8Array(w * h * 4);
      currentPixels.set(raw);

      this.undoStack.push({
        action: snapshot.action,
        layerIdx,
        width: w,
        height: h,
        pixels: currentPixels
      });

      raw.set(snapshot.pixels);
      if (typeof exports.w_force_composite === 'function') exports.w_force_composite();
      this.sendConsoleLog(`redo: ${snapshot.action}`);
      return { ok: true, action: snapshot.action };
    }
    return { ok: false, msg: 'layer dimension mismatch' };
  }

  /**
   * Resolves a texture name, shape name, or layer identifier to a WASM layer ID.
   * Registers texture as a WASM layer slot if not already done.
   * @param {string|number} name - Texture name, shape name, layer id/name, or numeric ID
   * @returns {number} WASM layer ID
   */
  getTextureId(name) {
    if (typeof name === 'number') return name;
    if (!name) return 0;
    const lower = String(name).toLowerCase();
    if (lower === 'circle' || lower === 'round') return 0;
    if (lower === 'square') return 1;
    if (lower === 'chisel' || lower === 'flat') return 2;

    const layerMatch = lower.match(/^layer_?(\d+)$/);
    if (layerMatch && this.canvasActor && typeof this.canvasActor.exports.w_layer_get_texture === 'function') {
      const lIdx = parseInt(layerMatch[1], 10);
      const tid = this.canvasActor.exports.w_layer_get_texture(lIdx);
      if (tid >= 0) return tid;
    }

    if (this.textures && this.textures.has(lower)) {
      const tex = this.textures.get(lower);
      if (tex.wasmId !== undefined && tex.wasmId >= 0) {
        return tex.wasmId;
      }
      if (this.canvasActor && typeof this.canvasActor.exports.w_texture_create === 'function') {
        const id = this.canvasActor.exports.w_texture_create(tex.width, tex.height);
        if (id >= 0) {
          tex.wasmId = id;
          const ptr = this.canvasActor.exports.w_texture_get_pixels(id);
          if (ptr && tex.data) {
            new Uint8Array(this.canvasActor.memory.buffer, ptr, tex.width * tex.height * 4).set(tex.data);
          }
          return id;
        }
      }
    }

    const parsed = parseInt(name, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Sets UI scale / DPI preference and triggers change handler if registered.
   */
  setUiScale(val) {
    this.uiScale = val;
    if (typeof this.onUiScaleChange === 'function') {
      this.onUiScaleChange(val);
    }
  }

  /**
   * Moves a layer up in the stacking order.
   */
  moveLayerUp(id) {
    if (!this.canvasActor?.exports?.w_layer_move_up) return false;
    this.pushUndoSnapshot('layer move');
    return this.canvasActor.exports.w_layer_move_up(id) === 1;
  }

  /**
   * Moves a layer down in the stacking order.
   */
  moveLayerDown(id) {
    if (!this.canvasActor?.exports?.w_layer_move_down) return false;
    this.pushUndoSnapshot('layer move');
    return this.canvasActor.exports.w_layer_move_down(id) === 1;
  }

  /**
   * Merges a layer down onto the layer below it in stacking order.
   */
  mergeLayerDown(id) {
    if (!this.canvasActor?.exports?.w_layer_merge_down) return -1;
    this.pushUndoSnapshot('merge down');
    const res = this.canvasActor.exports.w_layer_merge_down(id);
    if (res >= 0) {
      for (const grp of this.layerGroups.values()) {
        grp.layerIds = grp.layerIds.filter(lid => lid !== id);
      }
    }
    return res;
  }

  /**
   * Creates a new layer group / folder.
   */
  createGroup(name) {
    const id = `group_${this.groupCounter++}`;
    const grp = {
      id,
      name: name || `Folder ${this.layerGroups.size + 1}`,
      collapsed: false,
      visible: true,
      layerIds: []
    };
    this.layerGroups.set(id, grp);
    return grp;
  }

  /**
   * Adds a layer to a group / folder.
   */
  addLayerToGroup(groupIdOrName, layerId) {
    let grp = this.layerGroups.get(groupIdOrName);
    if (!grp) {
      for (const g of this.layerGroups.values()) {
        if (g.name.toLowerCase() === groupIdOrName.toLowerCase()) {
          grp = g;
          break;
        }
      }
    }
    if (!grp) return false;
    for (const g of this.layerGroups.values()) {
      g.layerIds = g.layerIds.filter(lid => lid !== layerId);
    }
    grp.layerIds.push(layerId);
    return true;
  }

  /**
   * Removes a layer from any group it belongs to.
   */
  removeLayerFromGroup(layerId) {
    let changed = false;
    for (const g of this.layerGroups.values()) {
      const origLen = g.layerIds.length;
      g.layerIds = g.layerIds.filter(lid => lid !== layerId);
      if (g.layerIds.length !== origLen) changed = true;
    }
    return changed;
  }

  /**
   * Toggles visibility of all layers in a group.
   */
  toggleGroup(groupIdOrName) {
    let grp = this.layerGroups.get(groupIdOrName);
    if (!grp) {
      for (const g of this.layerGroups.values()) {
        if (g.name.toLowerCase() === groupIdOrName.toLowerCase()) {
          grp = g;
          break;
        }
      }
    }
    if (!grp) return false;
    grp.visible = !grp.visible;
    if (this.canvasActor?.exports?.w_layer_toggle) {
      for (const lid of grp.layerIds) {
        const curVis = this.canvasActor.exports.get_layer_visible?.(lid) ?? 1;
        if ((grp.visible && !curVis) || (!grp.visible && curVis)) {
          this.canvasActor.exports.w_layer_toggle(lid);
        }
      }
    }
    return true;
  }

  /**
   * Deletes a group (does not delete child layers).
   */
  deleteGroup(groupIdOrName) {
    let grpKey = this.layerGroups.has(groupIdOrName) ? groupIdOrName : null;
    if (!grpKey) {
      for (const [k, g] of this.layerGroups.entries()) {
        if (g.name.toLowerCase() === groupIdOrName.toLowerCase()) {
          grpKey = k;
          break;
        }
      }
    }
    if (!grpKey) return false;
    this.layerGroups.delete(grpKey);
    return true;
  }

  /**
   * Sets a brush parameter and forwards it directly to canvas.wasm.
   */
  setBrushParam(paramName, val) {
    const key = paramName.toLowerCase();
    const pId = PARAM_IDS[key];
    if (pId === undefined) return;
    let numericVal = val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'on' || lower === 'true' || lower === 'yes') {
        numericVal = 1;
      } else if (lower === 'off' || lower === 'false' || lower === 'no') {
        numericVal = 0;
      } else if (key === 'shape') {
        if (lower === 'circle' || lower === 'round') numericVal = 0;
        else if (lower === 'square') numericVal = 1;
        else if (lower === 'chisel' || lower === 'flat') numericVal = 2;
        else numericVal = this.getTextureId(lower);
      } else if (key === 'mode' || key === 'type') {
        if (lower === 'draw' || lower === 'brush') numericVal = 0;
        else if (lower === 'smudge') numericVal = 1;
        else if (lower === 'blend') numericVal = 2;
        else if (lower === 'fill' || lower === 'flood_fill') numericVal = 3;
        else if (lower === 'lasso_fill' || lower === 'lasso') numericVal = 4;
        else numericVal = parseInt(val, 10) || 0;
      } else if (key === 'dab_blend' || key === 'dab_blend_mode' || key === 'blend_mode') {
        const blendMap = { normal: 0, multiply: 1, screen: 2, overlay: 3, dodge: 4, color_dodge: 4, add: 5, linear_dodge: 5 };
        numericVal = blendMap[lower] !== undefined ? blendMap[lower] : (parseInt(val, 10) || 0);
      } else {
        numericVal = parseFloat(val);
      }
    }

    if (key === 'softness' || key === 'soft') {
      numericVal = 100 - numericVal;
      if (numericVal < 0) numericVal = 0;
      if (numericVal > 100) numericVal = 100;
      this.brushParams.hardness = numericVal;
    } else {
      const canonMap = {
        radius: 'size', rad: 'size', op: 'opacity', alpha: 'opacity', hard: 'hardness',
        step: 'spacing', rot: 'angle', rotation: 'angle', rotate: 'angle',
        shape_angle: 'angle', shape_rotate: 'angle', aspect: 'roundness',
        jitter: 'scatter', noise: 'grain', wet: 'wetness', tol: 'tolerance',
        smudge_strength: 'smudge', tex_mode: 'texture_mode', type: 'mode',
        tex_angle: 'texture_angle', tex_rotate: 'texture_angle', tex_rot: 'texture_angle',
        texture_angle: 'texture_angle', texture_rotate: 'texture_angle', texture_rot: 'texture_angle',
        tex_scale: 'texture_scale', texture_scale: 'texture_scale', tex_size: 'texture_scale', texture_size: 'texture_scale',
        grain_scale: 'texture_scale', grain_size: 'texture_scale',
        smooth: 'smoothing', stabilizer: 'smoothing',
        bezier: 'midpoint', bezier_midpoint: 'midpoint',
        tex_contrast: 'texture_contrast', grain_contrast: 'texture_contrast',
        taper: 'taper_in', taper_start: 'taper_in', taper_end: 'taper_out',
        flow_jitter: 'opacity_jitter', dab_blend_mode: 'dab_blend', blend_mode: 'dab_blend'
      };
      const canonKey = canonMap[key] || key;
      this.brushParams[canonKey] = numericVal;
    }

    if (this.canvasActor && typeof this.canvasActor.exports.w_brush_set_param === 'function') {
      this.canvasActor.exports.w_brush_set_param(pId, Math.floor(numericVal));
    }
  }

  /**
   * Ensures all JS-side textures have a WASM layer slot allocated and pixels uploaded.
   * Call once after canvasActor is initialized.
   */
  registerAllTexturesAsLayers() {
    if (!this.canvasActor || typeof this.canvasActor.exports.w_texture_create !== 'function') return;
    for (const [name, tex] of this.textures.entries()) {
      if (tex.wasmId !== undefined && tex.wasmId >= 0) continue; // already registered
      const id = this.canvasActor.exports.w_texture_create(tex.width, tex.height);
      if (id < 0) continue;
      tex.wasmId = id;
      const ptr = this.canvasActor.exports.w_texture_get_pixels(id);
      if (ptr && tex.data) {
        new Uint8Array(this.canvasActor.memory.buffer, ptr, tex.width * tex.height * 4).set(tex.data);
      }
    }
  }

  /**
   * Selects active grain texture by name.
   * Registers the texture as a WASM layer if needed, then points the brush engine at that layer.
   */
  setTexture(name) {
    if (!name || name === 'none' || name === '0' || name === 'off') {
      this.activeTexture = 'none';
      // disable grain texture: set tex_layer to -1 (clears g_texture in WASM)
      if (this.canvasActor && typeof this.canvasActor.exports.w_brush_set_param === 'function') {
        this.canvasActor.exports.w_brush_set_param(18 /* W_PARAM_TEX_LAYER */, -1);
      }
      return true;
    }
    const lower = name.toLowerCase();
    // Ensure texture registered as layer
    const layerId = this.getTextureId(lower);
    this.activeTexture = lower;
    // Point brush engine at this layer for grain sampling
    if (this.canvasActor && typeof this.canvasActor.exports.w_brush_set_param === 'function') {
      this.canvasActor.exports.w_brush_set_param(18 /* W_PARAM_TEX_LAYER */, layerId);
    }
    return true;
  }

  /**
   * Activates a predefined brush preset and sends all its parameters to canvas.wasm.
   */
  selectBrushPreset(name) {
    const preset = BRUSH_PRESETS[name.toLowerCase()];
    this.activeBrush = name.toLowerCase();
    if (preset) {
      for (const [k, v] of Object.entries(preset)) {
        this.setBrushParam(k, v);
      }
      return true;
    }
    return false;
  }

  /**
   * Syncs all brush parameters to canvas.wasm or a plugin.
   * Also registers all JS textures as WASM layers on first call.
   */
  syncBrushParams(target) {
    const mod = target || this.canvasActor;
    if (!mod || typeof mod.exports.w_brush_set_param !== 'function') return;
    for (const [key, val] of Object.entries(this.brushParams)) {
      const pId = PARAM_IDS[key];
      if (pId !== undefined) {
        mod.exports.w_brush_set_param(pId, Math.floor(val));
      }
    }
    // Register all textures as layers in WASM so they appear in list layers
    if (mod === this.canvasActor || !target) {
      this.registerAllTexturesAsLayers();
    }
    if (this.activeTexture && this.activeTexture !== 'none') {
      this.setTexture(this.activeTexture);
    }
  }

  /**
   * Helper to ensure WASM linear memory has enough pages allocated.
   */
  ensureMemory(plugin, requiredBytes) {
    if (!plugin || !plugin.memory) return;
    if (plugin.memory.buffer.byteLength < requiredBytes) {
      const neededPages = Math.ceil((requiredBytes - plugin.memory.buffer.byteLength) / 65536);
      plugin.memory.grow(neededPages);
    }
  }

  /**
   * Dispatches a stroke to the native Universal Brush Engine inside canvas.wasm,
   * applying configurable stabilizer / stroke smoothing (EMA + Bézier curvature).
   */
  sendStroke(x, y, prev_x, prev_y, state, is_eraser, color) {
    if (!this.canvasActor || typeof this.canvasActor.exports.w_brush_stroke !== 'function') return;

    const col = (color !== undefined) ? color : this.currentColor;
    const eraser = (is_eraser !== undefined) ? (is_eraser ? 1 : 0) : (this.currentTool === 1 ? 1 : 0);
    const smooth = Math.max(0, Math.min(100, this.brushParams.smoothing || 0));

    if (state === 0) {
      this.pushUndoSnapshot(this.currentTool === 1 ? 'eraser' : (['brush', 'smudge', 'blend', 'fill', 'lasso_fill'][this.brushParams.mode] || 'brush'));
      this.lastStrokeTime = Date.now();
      this.strokeSpeed = 0;
    } else if (state === 1 && this.brushParams.velocity > 0) {
      const velStrength = Math.min(100, Math.max(0, this.brushParams.velocity)) / 100;
      const now = Date.now();
      const dt = Math.max(1, Math.min(100, now - (this.lastStrokeTime || now)));
      this.lastStrokeTime = now;

      const dist = Math.hypot(x - prev_x, y - prev_y);
      const rawSpeed = dist / dt;

      this.strokeSpeed = (this.strokeSpeed !== undefined)
        ? (this.strokeSpeed * 0.7 + rawSpeed * 0.3)
        : rawSpeed;

      const speedFactor = Math.max(0.2, 1.0 - (this.strokeSpeed / 3.0) * (velStrength * 0.75));
      const baseSize = this.brushParams.size || 8;
      const dynamicSize = Math.max(1, Math.round(baseSize * speedFactor));
      const baseFlow = this.brushParams.flow || 100;
      const dynamicFlow = Math.max(5, Math.round(baseFlow * (0.5 + 0.5 * speedFactor)));

      if (this.canvasActor && typeof this.canvasActor.exports.w_brush_set_param === 'function') {
        this.canvasActor.exports.w_brush_set_param(1 /* W_PARAM_SIZE */, dynamicSize);
        this.canvasActor.exports.w_brush_set_param(4 /* W_PARAM_FLOW */, dynamicFlow);
      }
    } else if (state === 2 && this.brushParams.velocity > 0) {
      if (this.canvasActor && typeof this.canvasActor.exports.w_brush_set_param === 'function') {
        this.canvasActor.exports.w_brush_set_param(1, this.brushParams.size || 8);
        this.canvasActor.exports.w_brush_set_param(4, this.brushParams.flow || 100);
      }
    }

    // Instant direct execution when smoothing is 0 or when using fill/lasso modes
    if (smooth === 0 || this.brushParams.mode === 3 || this.brushParams.mode === 4) {
      this.strokeSmoothX = x;
      this.strokeSmoothY = y;
      this.strokeHistory = null;
      this.canvasActor.exports.w_brush_stroke(
        state,
        Math.floor(x),
        Math.floor(y),
        Math.floor(prev_x),
        Math.floor(prev_y),
        col >>> 0,
        eraser
      );
      return;
    }

    // Configurable stroke stabilizer / smoothing
    if (state === 0) { // STROKE_START
      this.strokeSmoothX = x;
      this.strokeSmoothY = y;
      this.strokeHistory = [{ x, y }];
      this.canvasActor.exports.w_brush_stroke(
        0,
        Math.floor(x),
        Math.floor(y),
        Math.floor(x),
        Math.floor(y),
        col >>> 0,
        eraser
      );
      return;
    }

    if (state === 1) { // STROKE_MOVE
      if (this.strokeSmoothX === undefined || this.strokeSmoothX === null) {
        this.strokeSmoothX = prev_x;
        this.strokeSmoothY = prev_y;
      }
      if (!this.strokeHistory || this.strokeHistory.length === 0) {
        this.strokeHistory = [{ x: prev_x, y: prev_y }];
      }

      // Responsive Exponential Moving Average: smooth 1..100 maps factor from 0.90 down to 0.08
      const factor = 1.0 - (smooth / 100) * 0.92;
      const targetX = this.strokeSmoothX + (x - this.strokeSmoothX) * factor;
      const targetY = this.strokeSmoothY + (y - this.strokeSmoothY) * factor;

      const pPrev = { x: this.strokeSmoothX, y: this.strokeSmoothY };
      const pCurr = { x: targetX, y: targetY };
      const pOld = this.strokeHistory[0] || pPrev;

      // Quadratic Bézier curve through midpoints for smooth corner rounding
      const midpoint = (this.brushParams.midpoint !== undefined) ? this.brushParams.midpoint : 50;
      const ratio = Math.max(0, Math.min(100, midpoint)) / 100;
      const midPrev = {
        x: pOld.x + (pPrev.x - pOld.x) * ratio,
        y: pOld.y + (pPrev.y - pOld.y) * ratio
      };
      const midCurr = {
        x: pPrev.x + (pCurr.x - pPrev.x) * ratio,
        y: pPrev.y + (pCurr.y - pPrev.y) * ratio
      };

      const dist = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
      const steps = Math.max(1, Math.min(4, Math.floor(dist / 3)));
      let lastX = midPrev.x;
      let lastY = midPrev.y;

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const invT = 1 - t;
        const bx = invT * invT * midPrev.x + 2 * invT * t * pPrev.x + t * t * midCurr.x;
        const by = invT * invT * midPrev.y + 2 * invT * t * pPrev.y + t * t * midCurr.y;

        this.canvasActor.exports.w_brush_stroke(
          1,
          Math.floor(bx),
          Math.floor(by),
          Math.floor(lastX),
          Math.floor(lastY),
          col >>> 0,
          eraser
        );
        lastX = bx;
        lastY = by;
      }

      this.strokeSmoothX = targetX;
      this.strokeSmoothY = targetY;
      this.strokeHistory.unshift(pPrev);
      if (this.strokeHistory.length > 4) this.strokeHistory.pop();
      return;
    }

    if (state === 2) { // STROKE_END
      // Catch up to final release coordinate
      if (this.strokeSmoothX !== null && this.strokeSmoothX !== undefined) {
        if (Math.hypot(x - this.strokeSmoothX, y - this.strokeSmoothY) >= 1) {
          this.canvasActor.exports.w_brush_stroke(
            1,
            Math.floor(x),
            Math.floor(y),
            Math.floor(this.strokeSmoothX),
            Math.floor(this.strokeSmoothY),
            col >>> 0,
            eraser
          );
        }
      }
      this.canvasActor.exports.w_brush_stroke(
        2,
        Math.floor(x),
        Math.floor(y),
        Math.floor(x),
        Math.floor(y),
        col >>> 0,
        eraser
      );
      this.strokeSmoothX = null;
      this.strokeSmoothY = null;
      this.strokeHistory = null;
      return;
    }
  }

  /**
   * Applies a filter plugin directly to the canvas active layer.
   */
  applyFilter(fname, p1 = 0, p2 = 0) {
    const filterEntry = this.plugins.get(fname);
    if (!filterEntry || !this.canvasActor) return false;
    const plugin = filterEntry.module || filterEntry.actor;
    if (!plugin || typeof plugin.exports.w_filter_apply !== 'function') return false;

    const cw = this.canvasActor.exports.get_canvas_width();
    const ch = this.canvasActor.exports.get_canvas_height();
    const pixPtr = this.canvasActor.exports.get_active_layer_pixels();
    if (!pixPtr || cw === 0 || ch === 0) return false;

    this.pushUndoSnapshot(`filter ${fname}`);

    const byteLen = cw * ch * 4;
    if (!plugin.layerPtr || plugin.layerByteLen < byteLen) {
      plugin.layerPtr = 1048576; // 1MB
      plugin.layerByteLen = byteLen;
    }

    this.ensureMemory(plugin, plugin.layerPtr + byteLen);

    new Uint8Array(plugin.memory.buffer, plugin.layerPtr, byteLen)
      .set(new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen));

    plugin.setLayer(plugin.layerPtr, cw, ch);

    plugin.exports.w_filter_apply(p1, p2);

    new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen)
      .set(new Uint8Array(plugin.memory.buffer, plugin.layerPtr, byteLen));

    if (this.canvasActor.exports.w_force_composite) {
      this.canvasActor.exports.w_force_composite();
    } else if (this.canvasActor.exports.force_composite) {
      this.canvasActor.exports.force_composite();
    }
    return true;
  }

  /**
   * Retrieves the currently active procedural or imported texture object.
   * @returns {{width: number, height: number, data: Buffer}|null}
   */
  getActiveTexture() {
    return this.textures.get(this.activeTexture) || null;
  }

  /**
   * Prints formatted logs to REPL stdout without corrupting the current readline prompt.
   * @param {string} text - Message text
   * @param {number} color - Status color (0xFFFF5555 for error, 0xFF00FF88 for success)
   */
  sendConsoleLog(text, color = 0xFF00FF88) {
    const ansiColor = (color === 0xFFFF5555) ? '\x1b[31m' : '\x1b[32m';
    if (this.rl) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(`${ansiColor}[wesenho]\x1b[0m ${text}`);
      this.rl.prompt(true);
    } else {
      console.log(`${ansiColor}[wesenho]\x1b[0m ${text}`);
    }
  }

  /**
   * Copies the raw pixel buffer from a canvas layer and registers it as a reusable brush texture.
   * @param {number} layerIdx - Source layer index (-1 for active layer)
   * @param {string} name - Name for the new texture
   * @returns {boolean} True if converted successfully
   */
  convertLayerToTexture(layerIdx, name) {
    if (!this.canvasActor || !this.canvasActor.instance) return false;
    const w = this.canvasActor.exports.get_canvas_width();
    const h = this.canvasActor.exports.get_canvas_height();
    const targetIdx = (layerIdx >= 0) ? layerIdx : this.canvasActor.exports.get_active_layer();
    const pixPtr = this.canvasActor.exports.get_layer_pixels(targetIdx);
    if (!pixPtr || w === 0 || h === 0) return false;

    let tid = -1;
    if (this.canvasActor.exports.w_layer_get_texture) {
      tid = this.canvasActor.exports.w_layer_get_texture(targetIdx);
    }

    const byteLen = w * h * 4;
    const rawBytes = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen);
    const texBuf = Buf.alloc(byteLen);
    texBuf.set(rawBytes);

    this.textures.set(name.toLowerCase(), { width: w, height: h, data: texBuf, wasmId: tid });
    this.activeTexture = name.toLowerCase();
    return true;
  }

  /**
   * Exports the composite canvas or a single layer to disk (PNG, BMP, or PPM format).
   * @param {string} filePath - Output path on disk
   * @param {number} target - 0 = composite canvas, 1 = active layer
   * @returns {{ok: boolean, error?: string, path?: string, format?: string, size?: number}}
   */
  saveCanvasOrLayer(filePath, target) {
    if (!this.canvasActor || !this.canvasActor.instance) return { ok: false, error: 'Canvas not found' };
    const w = this.canvasActor.exports.get_canvas_width();
    const h = this.canvasActor.exports.get_canvas_height();
    const pixPtr = (target === 1)
      ? this.canvasActor.exports.get_active_layer_pixels()
      : this.canvasActor.exports.get_composite_pixels();

    if (!pixPtr || w === 0 || h === 0) return { ok: false, error: 'Empty canvas' };

    const byteLen = w * h * 4;
    const rawBytes = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen);

    if (IS_BROWSER) {
      try {
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d');
        const idata = octx.createImageData(w, h);
        idata.data.set(rawBytes);
        octx.putImageData(idata, 0, 0);
        const dlName = filePath.endsWith('.png') ? filePath : `${filePath}.png`;
        const dataUrl = off.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = dlName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return { ok: true, path: filePath, format: 'png', size: byteLen };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    const buf = Buf.from(rawBytes);

    try {
      const res = saveImage(filePath, w, h, buf);
      return { ok: true, path: filePath, format: res.format, size: res.bytes };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Loads an image file into texture storage.
   * All loaded images are stored as reusable textures instead of dumping directly onto layers.
   * @param {string} filePath - Path to image file (PNG, BMP, PPM)
   * @param {string} [name] - Optional custom texture name
   * @returns {{ok: boolean, name?: string, width?: number, height?: number, msg?: string, error?: string}}
   */
  loadImageFromFile(filePath, name) {
    try {
      const img = loadImage(filePath);
      const texName = (name || path.basename(filePath, path.extname(filePath))).toLowerCase();
      let wasmId = -1;
      if (this.canvasActor && typeof this.canvasActor.exports.w_texture_create === 'function') {
        wasmId = this.canvasActor.exports.w_texture_create(img.width, img.height);
        if (wasmId >= 0) {
          const ptr = this.canvasActor.exports.w_texture_get_pixels(wasmId);
          if (ptr) {
            new Uint8Array(this.canvasActor.memory.buffer, ptr, img.width * img.height * 4).set(img.data);
          }
        }
      }
      this.textures.set(texName, { width: img.width, height: img.height, data: img.data, wasmId });
      this.activeTexture = texName;
      return {
        ok: true,
        name: texName,
        wasmId,
        width: img.width,
        height: img.height,
        msg: `image '${filePath}' stored as texture '${texName}' (${img.width}x${img.height})`
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Draws/stamps a texture or image file onto the active canvas layer with optional size and coordinates.
   * If width or height are omitted, natural dimensions of texture are preserved.
   * @param {string} nameOrPath - Texture name or image file path
   * @param {number} [x=0] - Destination X coordinate (default 0)
   * @param {number} [y=0] - Destination Y coordinate (default 0)
   * @param {number} [width] - Destination width (optional, default texture width)
   * @param {number} [height] - Destination height (optional, default texture height or aspect-preserving)
   * @param {number} [opacity=100] - Blending opacity 0..100%
   * @returns {{ok: boolean, msg?: string, error?: string}}
   */
  drawImage(nameOrPath, x = 0, y = 0, width, height, opacity = 100) {
    if (!this.canvasActor || !this.canvasActor.instance) {
      return { ok: false, error: 'Canvas not initialized' };
    }

    let lower = (typeof nameOrPath === 'string') ? nameOrPath.toLowerCase() : String(nameOrPath);
    let tex = this.textures.get(lower);
    if (!tex) {
      if (fs.existsSync(nameOrPath)) {
        const loadRes = this.loadImageFromFile(nameOrPath);
        if (!loadRes.ok) return loadRes;
        lower = loadRes.name.toLowerCase();
        tex = this.textures.get(lower);
      } else {
        const layerMatch = lower.match(/^layer_?(\d+)$/);
        if (!layerMatch) {
          return { ok: false, error: `Texture or image '${nameOrPath}' not found` };
        }
      }
    }

    const texId = this.getTextureId(lower);
    let srcW = 0, srcH = 0;
    if (this.canvasActor.exports.w_texture_get_width) {
      srcW = this.canvasActor.exports.w_texture_get_width(texId);
      srcH = this.canvasActor.exports.w_texture_get_height(texId);
    }
    if (srcW <= 0 || srcH <= 0) {
      if (tex && tex.width > 0 && tex.height > 0) {
        srcW = tex.width;
        srcH = tex.height;
      } else {
        return { ok: false, error: `Invalid texture data for '${nameOrPath}'` };
      }
    }

    const dstX = (x !== undefined && x !== null && !isNaN(Number(x))) ? parseInt(x, 10) : 0;
    const dstY = (y !== undefined && y !== null && !isNaN(Number(y))) ? parseInt(y, 10) : 0;

    let dstW = srcW;
    let dstH = srcH;

    if (width !== undefined && width !== null && !isNaN(Number(width)) && Number(width) > 0) {
      dstW = parseInt(width, 10);
      if (height !== undefined && height !== null && !isNaN(Number(height)) && Number(height) > 0) {
        dstH = parseInt(height, 10);
      } else {
        dstH = Math.max(1, Math.round(dstW * (srcH / srcW)));
      }
    } else if (height !== undefined && height !== null && !isNaN(Number(height)) && Number(height) > 0) {
      dstH = parseInt(height, 10);
      dstW = Math.max(1, Math.round(dstH * (srcW / srcH)));
    }

    const op = (opacity !== undefined && opacity !== null && !isNaN(Number(opacity)))
      ? Math.min(100, Math.max(0, parseInt(opacity, 10)))
      : 100;

    if (typeof this.canvasActor.exports.w_draw_texture_id === 'function') {
      this.canvasActor.exports.w_draw_texture_id(texId, dstX, dstY, dstW, dstH, op);
    } else if (typeof this.canvasActor.exports.w_draw_texture === 'function') {
      this.canvasActor.exports.w_draw_texture(dstX, dstY, dstW, dstH, op);
    }

    return { ok: true, msg: `drew image '${nameOrPath}' at (${dstX},${dstY}) size ${dstW}x${dstH}` };
  }

  /**
   * Main text command interpreter for interactive terminal REPL and script invocation.
   * Powered 100% by Papagaio pattern matching engine.
   * @param {string} raw - Command line string
   * @param {string|number} [from='repl'] - Sender identifier
   */
  executeCommand(raw, from = 'repl') {
    raw = raw.trim();
    if (!raw) return;

    const p = getPapagaio();
    if (!p || typeof p.match !== 'function') {
      this.sendConsoleLog("err: papagaio parser unavailable", 0xFFFF5555);
      return;
    }

    for (const rule of COMMAND_RULES) {
      const m = p.match(rule.pat, raw, { exact: true, caseInsensitive: true });
      if (m) {
        const res = rule.run(m, this, raw);
        if (res !== false) return res;
      }
    }

    this.sendConsoleLog(`err: unknown command '${raw}'. Type 'help' for commands.`, 0xFFFF5555);
  }

  /**
   * Initializes the native SDL window, event listeners for mouse drag drawing,
   * middle-click panning, scroll wheel zooming, and resize.
   */
  initWindow() {
    this.window = sdl.video.createWindow({
      title: 'wesenho',
      width: this.windowWidth,
      height: this.windowHeight,
      resizable: true
    });

    this.window.on('resize', (e) => {
      this.windowWidth = e.width;
      this.windowHeight = e.height;
      this.screenBuffer = Buf.alloc(this.windowWidth * this.windowHeight * 4);
    });

    this.window.on('mouseMove', (e) => {
      this.mouseState.x = e.x;
      this.mouseState.y = e.y;

      if (this.isPanning) {
        this.panX += (e.x - this.panStartX);
        this.panY += (e.y - this.panStartY);
        this.panStartX = e.x;
        this.panStartY = e.y;
      } else if (this.isDrawingOnCanvas && (this.mouseState.buttons & 3)) {
        const docX = (this.mouseState.x - this.panX) / this.zoom;
        const docY = (this.mouseState.y - this.panY) / this.zoom;
        this.sendStroke(docX, docY, this.strokePrevX, this.strokePrevY, 1 /* STROKE_MOVE */, this.strokeIsEraser, this.currentColor);
        this.strokePrevX = docX;
        this.strokePrevY = docY;
      }
    });

    this.window.on('mouseButtonDown', (e) => {
      if (e.button === 1) this.mouseState.buttons |= 1;
      else if (e.button === 3) this.mouseState.buttons |= 2;
      else if (e.button === 2) this.mouseState.buttons |= 4;

      if (e.button === 2) {
        this.isPanning = true;
        this.panStartX = this.mouseState.x;
        this.panStartY = this.mouseState.y;
      } else if ((e.button === 1 || e.button === 3) && !this.isPanning) {
        this.isDrawingOnCanvas = true;
        const docX = (this.mouseState.x - this.panX) / this.zoom;
        const docY = (this.mouseState.y - this.panY) / this.zoom;
        this.strokePrevX = docX;
        this.strokePrevY = docY;
        this.strokeIsEraser = (e.button === 3) ? 1 : (this.currentTool === 1 ? 1 : 0);
        this.sendStroke(docX, docY, docX, docY, 0 /* STROKE_START */, this.strokeIsEraser, this.currentColor);
      }
    });

    this.window.on('mouseButtonUp', (e) => {
      if (e.button === 1) this.mouseState.buttons &= ~1;
      else if (e.button === 3) this.mouseState.buttons &= ~2;
      else if (e.button === 2) {
        this.mouseState.buttons &= ~4;
        this.isPanning = false;
      }

      if ((this.mouseState.buttons & 3) === 0) {
        if (this.isDrawingOnCanvas) {
          this.sendStroke(this.strokePrevX, this.strokePrevY, this.strokePrevX, this.strokePrevY, 2 /* STROKE_END */, this.strokeIsEraser, this.currentColor);
        }
        this.isDrawingOnCanvas = false;
        this.strokePrevX = -1;
        this.strokePrevY = -1;
        this.strokeIsEraser = 0;
      }
    });

    this.window.on('mouseWheel', (e) => {
      const oldZoom = this.zoom;
      const factor = e.dy > 0 ? 1.15 : 0.85;
      this.zoom = Math.max(0.1, Math.min(10.0, this.zoom * factor));

      const mx = this.mouseState.x;
      const my = this.mouseState.y;
      this.panX = mx - (mx - this.panX) * (this.zoom / oldZoom);
      this.panY = my - (my - this.panY) * (this.zoom / oldZoom);
    });

    this.window.on('close', () => process.exit(0));
  }

  /**
   * Sets up the interactive readline REPL on process.stdin.
   */
  setupRepl() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[36mwesenho>\x1b[0m '
    });

    console.log('\x1b[1;32m=== Wesenho Interactive Console Ready (Native WebAssembly) ===\x1b[0m');
    console.log('Type \x1b[33mhelp\x1b[0m for command list. Mouse: Left=Draw, Right=Erase, Middle=Pan, Wheel=Zoom\n');
    this.rl.prompt();

    this.rl.on('line', (line) => {
      this.executeCommand(line);
      this.rl.prompt();
    });
  }

  /**
   * Main render pass:
   * 1. Renders composite surface pixels via w_render().
   * 2. Clears the host window framebuffer with dark background (0x18).
   * 3. Projects composite surface pixels to screen using current pan offset and zoom scale.
   * 4. Renders output buffer to SDL window.
   */
  renderFrame() {
    if (!this.canvasActor || !this.canvasActor.instance) return;
    if (this.canvasActor.exports && this.canvasActor.exports.w_render) {
      this.canvasActor.exports.w_render();
    }

    this.screenBuffer.fill(0x18);

    const cw = this.canvasActor.exports.get_canvas_width();
    const ch = this.canvasActor.exports.get_canvas_height();
    const pixPtr = this.canvasActor.exports.get_composite_pixels();

    if (pixPtr && cw > 0 && ch > 0) {
      const canvasPixels = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, cw * ch * 4);
      const screenStartX = Math.max(0, Math.floor(this.panX));
      const screenStartY = Math.max(0, Math.floor(this.panY));
      const screenEndX = Math.min(this.windowWidth, Math.ceil(this.panX + cw * this.zoom));
      const screenEndY = Math.min(this.windowHeight, Math.ceil(this.panY + ch * this.zoom));

      const invZoom = 1 / this.zoom;

      for (let sy = screenStartY; sy < screenEndY; sy++) {
        const dy = Math.floor((sy - this.panY) * invZoom);
        if (dy < 0 || dy >= ch) continue;

        const docRowOffset = dy * cw * 4;
        const screenRowOffset = sy * this.windowWidth * 4;

        for (let sx = screenStartX; sx < screenEndX; sx++) {
          const dx = Math.floor((sx - this.panX) * invZoom);
          if (dx < 0 || dx >= cw) continue;

          const docPixelOffset = docRowOffset + dx * 4;
          const screenPixelOffset = screenRowOffset + sx * 4;

          this.screenBuffer[screenPixelOffset + 0] = canvasPixels[docPixelOffset + 0];
          this.screenBuffer[screenPixelOffset + 1] = canvasPixels[docPixelOffset + 1];
          this.screenBuffer[screenPixelOffset + 2] = canvasPixels[docPixelOffset + 2];
          this.screenBuffer[screenPixelOffset + 3] = 0xFF;
        }
      }
    }

    this.window.render(this.windowWidth, this.windowHeight, this.windowWidth * 4, 'rgba32', this.screenBuffer);
  }
}

/**
 * Discovers compiled WASM filter plugins from `plugins/filters`.
 * @param {string} baseDir - Root directory path
 * @returns {Array<{id: number, name: string, type: string, wasmPath: string}>}
 */
function discoverModules(baseDir) {
  const modules = [];
  let nextId = 11;

  const pluginsDir = path.resolve(baseDir, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    const files = fs.readdirSync(pluginsDir).sort();
    for (const f of files) {
      if (f.endsWith('.wasm')) {
        const modPath = path.relative(baseDir, path.join(pluginsDir, f));
        modules.push({
          id: nextId++,
          name: path.basename(f, '.wasm'),
          type: 'filter',
          wasmPath: modPath
        });
      }
    }
  }

  return modules;
}

/**
 * Application Entry Point:
 * Loads Canvas ROM and plugins via WesenhoModule and starts the render loop.
 */
async function main() {
  const host = new WesenhoScreenHost();

  // Canvas WASM Module
  const canvasWasmPath = path.resolve(__dirname, '../roms/canvas.wasm');
  host.canvasActor = new WesenhoModule(canvasWasmPath, { name: 'canvas' });
  if (host.canvasActor.exports.w_init) {
    host.canvasActor.exports.w_init(DOC_WIDTH, DOC_HEIGHT);
  }
  host.syncBrushParams(host.canvasActor);

  // Discover & Load WASM Filter Plugins
  const moduleConfigs = discoverModules(path.resolve(__dirname, '..'));
  for (const mod of moduleConfigs) {
    const fullPath = path.resolve(__dirname, '..', mod.wasmPath);
    if (!fs.existsSync(fullPath)) continue;

    const pluginModule = new WesenhoModule(fullPath, { name: mod.name });
    host.plugins.set(mod.name, { type: mod.type, module: pluginModule, actor: pluginModule });
  }

  // Initialize SDL window & REPL
  host.initWindow();
  host.setupRepl();

  // Render loop (~60 FPS)
  const frameLoop = () => {
    host.renderFrame();
    setTimeout(frameLoop, 16);
  };

  frameLoop();
}

if (!IS_BROWSER && typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

WesenhoScreenHost.COMMAND_RULES = COMMAND_RULES;

const _exports = {
  WesenhoModule,
  WesenhoScreenHost,
  PARAM_IDS,
  COMMAND_RULES,
  getPapagaio,
  evaluateMath,
  parseColorString,
  createProceduralTextures
};

/* Node.js CommonJS export */
if (typeof module !== 'undefined') module.exports = _exports;
/* Browser global export (used by host-browser.js loaded as a plain <script>) */
if (IS_BROWSER) Object.assign(globalThis, _exports);
