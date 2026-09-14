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
  tex_layer: 18,
  texture_layer: 18,
  smooth: 19,
  smoothing: 19,
  stabilizer: 19
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
      default: return NaN;
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
  Parameters   : size, opacity, hardness/softness, flow, spacing, angle, roundness, scatter, grain, smudge, wetness, tolerance, smooth/smoothing
  Grain tex    : set texture <name|layer_id|none>  — rotated/scaled via texture_rotate, texture_scale
`;
  return out;
}

/** Formats available texture list for CLI output (same as layers) */
function formatTexturesList(screenActor) {
  return formatLayersList(screenActor);
}

/** Formats filter plugin list for CLI output */
function formatFiltersList(screenActor) {
  let out = `\x1b[1mFilters:\x1b[0m\n`;
  for (const [name, actor] of screenActor.plugins.entries()) {
    if (actor.type === 'filter') {
      out += `  - ${name}\n`;
    }
  }
  return out;
}

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
      smoothing: 0
    };

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
   * Sets a brush parameter and forwards it directly to canvas.wasm.
   */
  setBrushParam(paramName, val) {
    const key = paramName.toLowerCase();
    const pId = PARAM_IDS[key];
    if (pId === undefined) return;
    let numericVal = val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (key === 'shape') {
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
        smooth: 'smoothing', stabilizer: 'smoothing'
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
      const midPrev = {
        x: (pPrev.x + pOld.x) / 2,
        y: (pPrev.y + pOld.y) / 2
      };
      const midCurr = {
        x: (pPrev.x + pCurr.x) / 2,
        y: (pPrev.y + pCurr.y) / 2
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
        off.toBlob(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filePath.endsWith('.png') ? filePath : `${filePath}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/png');
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
   * Parses text input into direct WASM function calls on canvas, brushes, and filters.
   * @param {string} raw - Command line string
   * @param {string|number} [from='repl'] - Sender identifier
   */
  executeCommand(raw, from = 'repl') {
    raw = raw.trim();
    if (!raw) return;

    if (raw.startsWith('(') || (/^[\d+\-*/]/.test(raw) && (raw.includes('+') || raw.includes('*') || raw.includes('/')))) {
      const val = evaluateMath(raw);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
        return;
      }
    }

    const tokens = [];
    const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      tokens.push(match[1] || match[2] || match[0]);
    }

    if (tokens.length === 0) return;
    const cmd = tokens[0].toLowerCase();

    if (cmd === 'log') {
      const msg = raw.slice(3).trim();
      this.sendConsoleLog(msg);
      return;
    }

    // 1. HELP
    if (cmd === 'help') {
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
      return;
    }

    // 2. UNIFIED LIST COMMANDS
    if (cmd === 'list' || cmd === 'layers' || cmd === 'brushes' || cmd === 'textures' || cmd === 'filters') {
      const target = (cmd === 'list') ? (tokens[1] ? tokens[1].toLowerCase() : 'all') : cmd;

      if (target === 'layer' || target === 'layers') {
        process.stdout.write(formatLayersList(this.canvasActor));
      } else if (target === 'brush' || target === 'brushes' || target === 'tools') {
        process.stdout.write(formatBrushesList(this));
      } else if (target === 'texture' || target === 'textures') {
        process.stdout.write(formatTexturesList(this));
      } else if (target === 'filter' || target === 'filters') {
        process.stdout.write(formatFiltersList(this));
      } else if (target === 'all' || target === '') {
        process.stdout.write('\x1b[1;34m=== Wesenho Entities ===\x1b[0m\n\n');
        process.stdout.write(formatLayersList(this.canvasActor) + '\n');
        process.stdout.write(formatBrushesList(this) + '\n');
        process.stdout.write(formatTexturesList(this) + '\n');
        process.stdout.write(formatFiltersList(this));
      } else {
        console.log(`\x1b[31merr: unknown list category '${tokens[1]}'. Options: layers, brushes, textures, filters, all\x1b[0m`);
      }
      return;
    }

    // 3. GET COMMANDS
    if (cmd === 'get') {
      const cat = (tokens[1] || '').toLowerCase();
      const prop = (tokens[2] || '').toLowerCase();

      const cw = this.canvasActor.exports.get_canvas_width();
      const ch = this.canvasActor.exports.get_canvas_height();
      const activeL = this.canvasActor.exports.get_active_layer();
      const lCount = this.canvasActor.exports.get_layer_count();

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
        const targetId = !isNaN(parseInt(tokens[3] || tokens[2], 10)) ? parseInt(tokens[3] || tokens[2], 10) : activeL;
        const vis = this.canvasActor.exports.get_layer_visible ? this.canvasActor.exports.get_layer_visible(targetId) : 1;
        const op = this.canvasActor.exports.get_layer_opacity ? this.canvasActor.exports.get_layer_opacity(targetId) : 255;
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
        if (this.currentTool === 1) {
          console.log('eraser');
        } else {
          const modes = ['brush', 'smudge', 'blend', 'fill', 'lasso_fill'];
          console.log(modes[this.brushParams.mode] || 'brush');
        }
        return;
      }

      if (cat === 'mode') {
        const modes = ['draw', 'smudge', 'blend', 'fill', 'lasso_fill'];
        console.log(modes[this.brushParams.mode] || 'draw');
        return;
      }

      if (cat === 'shape') {
        const shapes = ['circle', 'square', 'chisel'];
        const sId = this.brushParams.shape;
        if (shapes[sId]) {
          console.log(shapes[sId]);
        } else {
          let foundName = null;
          for (const [k, v] of this.textures.entries()) {
            if (v.wasmId === sId) {
              foundName = k;
              break;
            }
          }
          if (!foundName && this.canvasActor && typeof this.canvasActor.exports.get_layer_count === 'function') {
            const count = this.canvasActor.exports.get_layer_count();
            for (let i = 0; i < count; i++) {
              const tid = this.canvasActor.exports.w_layer_get_texture ? this.canvasActor.exports.w_layer_get_texture(i) : i;
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
          console.log(JSON.stringify(this.brushParams, null, 2));
        } else if (this.brushParams[prop] !== undefined) {
          console.log(this.brushParams[prop]);
        } else {
          const shapes = ['circle', 'square', 'chisel'];
          const sName = shapes[this.brushParams.shape] || `texture_${this.brushParams.shape}`;
          console.log(`brush: shape=${sName}, mode=${['draw', 'smudge', 'blend', 'fill', 'lasso_fill'][this.brushParams.mode]}, size=${this.brushParams.size}, opacity=${this.brushParams.opacity}%, hardness=${this.brushParams.hardness}%`);
        }
        return;
      }

      if (cat === 'texture' || cat === 'tex') {
        const tex = this.getActiveTexture();
        if (prop === 'name' || prop === '') {
          console.log(this.activeTexture);
        } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions') {
          console.log(tex ? `${tex.width}x${tex.height}` : 'none');
        } else if (prop === 'count' || prop === 'total') {
          console.log(this.textures.size);
        } else {
          console.log(`texture: "${this.activeTexture}" (${tex ? `${tex.width}x${tex.height}` : 'none'}, total: ${this.textures.size})`);
        }
        return;
      }

      if (cat === 'color') {
        const c = this.currentColor;
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

      if (cat === 'zoom') {
        console.log(`${(this.zoom * 100).toFixed(0)}%`);
        return;
      }

      if (cat === 'pan') {
        console.log(`(${Math.round(this.panX)}, ${Math.round(this.panY)})`);
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
        smooth: 'smoothing', stabilizer: 'smoothing'
      };
      const resolvedCat = canonGet[cat] || cat;
      if (this.brushParams[resolvedCat] !== undefined) {
        console.log(this.brushParams[resolvedCat]);
        return;
      }

      console.log(`err: unknown get property '${tokens[1]}'`);
      return;
    }

    // 4. STATUS / INFO
    if (cmd === 'status' || cmd === 'info') {
      const activeL = this.canvasActor.exports.get_active_layer();
      const lCount = this.canvasActor.exports.get_layer_count();
      const cw = this.canvasActor.exports.get_width ? this.canvasActor.exports.get_width() : this.canvasActor.exports.get_canvas_width();
      const ch = this.canvasActor.exports.get_height ? this.canvasActor.exports.get_height() : this.canvasActor.exports.get_canvas_height();
      const shapes = ['circle', 'square', 'chisel'];
      const modes = ['draw', 'smudge', 'blend', 'fill', 'lasso_fill'];

      console.log(`\x1b[1mStatus:\x1b[0m
  Surface: ${cw}x${ch} | Layer: [${activeL}] of ${lCount}
  Tool:    ${this.currentTool === 1 ? 'eraser' : (modes[this.brushParams.mode] || 'brush')}
  Mode:    ${modes[this.brushParams.mode] || 'draw'}
  Shape:   ${shapes[this.brushParams.shape] || 'circle'}
  Texture: "${this.activeTexture}" (mode: ${this.brushParams.texture_mode})
  Brush:   size=${this.brushParams.size}, opacity=${this.brushParams.opacity}%, hardness=${this.brushParams.hardness}%, flow=${this.brushParams.flow}%, spacing=${this.brushParams.spacing}%, smooth=${this.brushParams.smoothing || 0}%
  Angle:   ${this.brushParams.angle}°, roundness=${this.brushParams.roundness}%, grain=${this.brushParams.grain}%, scatter=${this.brushParams.scatter}%
  Color:   0x${this.currentColor.toString(16).padStart(8, '0')}
  Zoom:    ${(this.zoom * 100).toFixed(0)}% | Pan: (${Math.round(this.panX)}, ${Math.round(this.panY)})
`);
      return;
    }

    // 5. EXIT / QUIT
    if (cmd === 'exit' || cmd === 'quit') {
      console.log('Goodbye.');
      process.exit(0);
    }

    // 6. RESIZE / SURFACE COMMANDS
    if (cmd === 'resize' || (cmd === 'set' && tokens[1] && ((tokens[1].toLowerCase() === 'resolution' && tokens[2] && tokens[3]) || (tokens[1].toLowerCase() === 'size' && tokens[2] && tokens[3]) || (tokens[1].toLowerCase() === 'canvas' && tokens[2] && tokens[2].toLowerCase() === 'size' && tokens[3] && tokens[4])))) {
      const w = parseInt(cmd === 'resize' ? tokens[1] : (tokens[1].toLowerCase() === 'canvas' ? tokens[3] : tokens[2]), 10);
      const h = parseInt(cmd === 'resize' ? tokens[2] : (tokens[1].toLowerCase() === 'canvas' ? tokens[4] : tokens[3]), 10);
      if (w >= 16 && h >= 16 && w <= 4096 && h <= 4096) {
        this.canvasActor.exports.w_resize(w, h);
        this.sendConsoleLog(`surface resized to ${w}x${h}`);
      } else {
        this.sendConsoleLog('err: invalid dimensions (min 16x16, max 4096x4096)', 0xFFFF5555);
      }
      return;
    }

    if (cmd === 'set' && tokens[1]) {
      const sub = tokens[1].toLowerCase();
      if ((sub === 'width' || sub === 'w') && tokens[2]) {
        const w = parseInt(tokens[2], 10);
        const h = this.canvasActor.exports.get_height ? this.canvasActor.exports.get_height() : this.canvasActor.exports.get_canvas_height();
        if (w >= 16 && w <= 4096) {
          this.canvasActor.exports.w_resize(w, h);
          this.sendConsoleLog(`width updated to ${w}`);
        }
        return;
      } else if ((sub === 'height' || sub === 'h') && tokens[2]) {
        const w = this.canvasActor.exports.get_width ? this.canvasActor.exports.get_width() : this.canvasActor.exports.get_canvas_width();
        const h = parseInt(tokens[2], 10);
        if (h >= 16 && h <= 4096) {
          this.canvasActor.exports.w_resize(w, h);
          this.sendConsoleLog(`height updated to ${h}`);
        }
        return;
      }
    }

    // 7. LAYER COMMANDS
    if ((cmd === 'new' && tokens[1] && tokens[1].toLowerCase() === 'layer') || (cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'add')) {
      const idx = this.canvasActor.exports.w_layer_add();
      this.sendConsoleLog(`new layer [${idx}] added`);
      return;
    }

    if (((cmd === 'select' || cmd === 'set') && tokens[1] && tokens[1].toLowerCase() === 'layer' && tokens[2]) ||
        (cmd === 'layer' && (tokens[1] && (tokens[1].toLowerCase() === 'select' || !isNaN(parseInt(tokens[1], 10)))))) {
      const id = parseInt((cmd === 'layer' && tokens[1].toLowerCase() === 'select') ? tokens[2] : (cmd === 'layer' ? tokens[1] : tokens[2]), 10);
      this.canvasActor.exports.w_layer_select(id);
      this.sendConsoleLog(`selected layer [${id}]`);
      return;
    }

    if (((cmd === 'delete' || cmd === 'remove') && tokens[1] && tokens[1].toLowerCase() === 'layer') ||
        (cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'delete')) {
      const id = tokens[2] ? parseInt(tokens[2], 10) : this.canvasActor.exports.get_active_layer();
      this.canvasActor.exports.w_layer_delete(id);
      this.sendConsoleLog(`deleted layer [${id}]`);
      return;
    }

    if (((cmd === 'toggle' || cmd === 'hide' || cmd === 'show') && tokens[1] && tokens[1].toLowerCase() === 'layer') ||
        (cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'toggle')) {
      const id = tokens[2] ? parseInt(tokens[2], 10) : this.canvasActor.exports.get_active_layer();
      this.canvasActor.exports.w_layer_toggle(id);
      this.sendConsoleLog(`toggled layer [${id}] visibility`);
      return;
    }

    if ((cmd === 'opacity' && tokens[1] && tokens[1].toLowerCase() === 'layer') ||
        (cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'opacity') ||
        (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'layer' && tokens[2] && tokens[2].toLowerCase() === 'opacity')) {
      const id = (cmd === 'opacity' || (cmd === 'layer' && tokens[1] === 'opacity')) ? parseInt(tokens[2], 10) : this.canvasActor.exports.get_active_layer();
      const val = parseInt((cmd === 'opacity' || (cmd === 'layer' && tokens[1] === 'opacity')) ? tokens[3] : tokens[3], 10);
      if (!isNaN(val)) {
        const op255 = Math.min(255, Math.max(0, Math.round(val * 255 / 100)));
        this.canvasActor.exports.w_layer_opacity(id, op255);
        this.sendConsoleLog(`set layer [${id}] opacity to ${val}%`);
      }
      return;
    }

    if (cmd === 'clear' || (cmd === 'clear' && tokens[1] && tokens[1].toLowerCase() === 'layer') || (cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'clear')) {
      this.canvasActor.exports.w_layer_clear(-1);
      this.sendConsoleLog('active layer cleared');
      return;
    }

    // 8. TOOL & MODE COMMANDS
    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'tool' && tokens[2]) ||
        (cmd === 'tool' && tokens[1])) {
      const t = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      if (t === 'eraser' || t === 'erase') {
        this.currentTool = 1;
        this.sendConsoleLog('tool set to eraser');
      } else if (t === 'brush' || t === 'draw') {
        this.currentTool = 0;
        this.setBrushParam('mode', 0);
        this.sendConsoleLog('tool set to brush (draw)');
      } else if (t === 'square' || t === 'circle' || t === 'round' || t === 'chisel' || t === 'flat') {
        this.setBrushParam('shape', t);
        this.sendConsoleLog(`brush shape set to ${t}`);
      } else if (t === 'smudge') {
        this.currentTool = 0;
        this.setBrushParam('mode', 1);
        this.sendConsoleLog('tool set to smudge');
      } else if (t === 'blend') {
        this.currentTool = 0;
        this.setBrushParam('mode', 2);
        this.sendConsoleLog('tool set to blend');
      } else if (t === 'fill' || t === 'flood_fill') {
        this.currentTool = 0;
        this.setBrushParam('mode', 3);
        this.sendConsoleLog('tool set to flood fill');
      } else if (t === 'lasso_fill' || t === 'lasso') {
        this.currentTool = 0;
        this.setBrushParam('mode', 4);
        this.sendConsoleLog('tool set to lasso fill');
      } else {
        this.sendConsoleLog(`err: unknown tool '${tokens[2]}'`, 0xFFFF5555);
      }
      return;
    }

    if (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'mode' && tokens[2]) {
      const m = tokens[2].toLowerCase();
      if (m === 'eraser' || m === 'erase') {
        this.currentTool = 1;
        this.sendConsoleLog('mode set to eraser');
      } else if (m === 'draw' || m === 'brush') {
        this.currentTool = 0;
        this.setBrushParam('mode', 0);
        this.sendConsoleLog('mode set to draw');
      } else if (m === 'smudge') {
        this.currentTool = 0;
        this.setBrushParam('mode', 1);
        this.sendConsoleLog('mode set to smudge');
      } else if (m === 'blend') {
        this.currentTool = 0;
        this.setBrushParam('mode', 2);
        this.sendConsoleLog('mode set to blend');
      } else if (m === 'fill' || m === 'flood_fill') {
        this.currentTool = 0;
        this.setBrushParam('mode', 3);
        this.sendConsoleLog('mode set to fill');
      } else if (m === 'lasso_fill' || m === 'lasso') {
        this.currentTool = 0;
        this.setBrushParam('mode', 4);
        this.sendConsoleLog('mode set to lasso fill');
      } else {
        this.sendConsoleLog(`err: unknown mode '${tokens[2]}'`, 0xFFFF5555);
      }
      return;
    }

    if (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'shape' && tokens[2]) {
      this.setBrushParam('shape', tokens[2]);
      this.sendConsoleLog(`brush shape set to ${tokens[2]}`);
      return;
    }

    // 9. TEXTURE COMMANDS
    if ((cmd === 'set' && tokens[1] && (tokens[1].toLowerCase() === 'texture' || tokens[1].toLowerCase() === 'tex') && tokens[2]) ||
        ((cmd === 'texture' || cmd === 'tex') && tokens[1])) {
      const tname = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      const ok = this.setTexture(tname);
      if (ok) {
        this.sendConsoleLog(`texture set to '${tname}'`);
      } else {
        this.sendConsoleLog(`err: texture '${tname}' not found. Options: paper, canvas, noise, dots, grid, grunge, hatch, none`, 0xFFFF5555);
      }
      return;
    }

    if ((cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'to' && tokens[2] && tokens[2].toLowerCase() === 'texture') ||
        cmd === 'layer-to-texture' || cmd === 'layertotexture') {
      const tname = (cmd === 'layer' ? tokens[3] : tokens[1]) || `layer_${Date.now() % 1000}`;
      const ok = this.convertLayerToTexture(-1, tname);
      if (ok) {
        this.sendConsoleLog(`layer converted to texture '${tname}'`);
      } else {
        this.sendConsoleLog(`err: failed converting layer to texture`, 0xFFFF5555);
      }
      return;
    }

    // 10. BRUSH / PARAMETER COMMANDS
    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'brush') || (cmd === 'brush' && tokens[1])) {
      const sub = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      const val = (cmd === 'set' ? tokens[3] : tokens[2]);

      if (PARAM_IDS[sub] !== undefined && val !== undefined) {
        this.setBrushParam(sub, val);
        this.sendConsoleLog(`brush ${sub} set to ${val}`);
        return;
      } else if (BRUSH_PRESETS[sub]) {
        this.selectBrushPreset(sub);
        this.sendConsoleLog(`brush preset '${sub}' applied`);
        return;
      } else {
        this.sendConsoleLog(`err: unknown brush parameter '${sub}'`, 0xFFFF5555);
        return;
      }
    }

    // Direct parameter setters: set size 20, set hardness 50, set angle 45, set roundness 30, set grain 20, set scatter 15, etc.
    if (cmd === 'set' && tokens[1] && PARAM_IDS[tokens[1].toLowerCase()] !== undefined && tokens[2] !== undefined) {
      const sub = tokens[1].toLowerCase();
      this.setBrushParam(sub, tokens[2]);
      this.sendConsoleLog(`brush ${sub} set to ${tokens[2]}`);
      return;
    }

    // 10. FILTER COMMANDS
    if (cmd === 'filter' && tokens[1]) {
      const fname = tokens[1].toLowerCase();
      const p1 = parseInt(tokens[2], 10) || 0;
      const p2 = parseInt(tokens[3], 10) || 0;

      const ok = this.applyFilter(fname, p1, p2);
      if (ok) {
        this.sendConsoleLog(`filter '${fname}' applied`);
      } else {
        this.sendConsoleLog(`err: filter '${fname}' not found`, 0xFFFF5555);
      }
      return;
    }

    // 11. IMAGE I/O COMMANDS
    if (cmd === 'save' && tokens[1]) {
      let target = 0;
      let filePath = tokens[1];
      if (tokens[1].toLowerCase() === 'canvas' && tokens[2]) {
        target = 0;
        filePath = tokens[2];
      } else if (tokens[1].toLowerCase() === 'layer' && tokens[2]) {
        target = 1;
        filePath = tokens[2];
      }

      const res = this.saveCanvasOrLayer(filePath, target);
      if (res.ok) {
        this.sendConsoleLog(`image saved to '${res.path}'`);
      } else {
        this.sendConsoleLog(`err: failed saving image: ${res.error}`, 0xFFFF5555);
      }
      return;
    }

    if ((cmd === 'load' && tokens[1] && tokens[1].toLowerCase() === 'image' && tokens[2]) ||
        (cmd === 'load' && tokens[1] && tokens[1].toLowerCase() !== 'image')) {
      const filePath = (tokens[1].toLowerCase() === 'image') ? tokens[2] : tokens[1];
      const texName = (tokens[1].toLowerCase() === 'image') ? tokens[3] : tokens[2];

      const res = this.loadImageFromFile(filePath, texName);
      if (res.ok) {
        this.sendConsoleLog(res.msg);
      } else {
        this.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
      }
      return;
    }

    // 12. COLOR & TOOL COMMANDS
    if (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'color' && tokens[2]) {
      const colStr = tokens.slice(2).join(' ');
      const parsed = parseColorString(colStr);
      if (parsed !== null) {
        this.currentColor = parsed;
        this.sendConsoleLog(`color set to 0x${parsed.toString(16).padStart(8, '0')}`);
      } else {
        this.sendConsoleLog(`err: unknown color '${colStr}'`, 0xFFFF5555);
      }
      return;
    }

    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'tool' && tokens[2]) ||
        (cmd === 'tool' && tokens[1])) {
      const t = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      this.currentTool = (t === 'eraser' || t === 'erase') ? 1 : 0;
      this.sendConsoleLog(`tool set to ${this.currentTool === 1 ? 'eraser' : 'brush'}`);
      return;
    }

    // 13. IMAGE STAMP / DRAW COMMANDS
    if ((cmd === 'stamp' || cmd === 'image' || cmd === 'draw-image' || cmd === 'drawimage') && tokens[1]) {
      const texName = tokens[1];
      const x = tokens[2] !== undefined ? tokens[2] : 0;
      const y = tokens[3] !== undefined ? tokens[3] : 0;
      const w = tokens[4] !== undefined ? tokens[4] : undefined;
      const h = tokens[5] !== undefined ? tokens[5] : undefined;
      const res = this.drawImage(texName, x, y, w, h);
      if (res.ok) {
        this.sendConsoleLog(res.msg);
      } else {
        this.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
      }
      return;
    }

    // 14. PRIMITIVE DRAW COMMANDS
    if (cmd === 'draw' && tokens[1]) {
      const shape = tokens[1].toLowerCase();
      if ((shape === 'image' || shape === 'img' || shape === 'texture' || shape === 'tex') && tokens[2]) {
        const texName = tokens[2];
        const x = tokens[3] !== undefined ? tokens[3] : 0;
        const y = tokens[4] !== undefined ? tokens[4] : 0;
        const w = tokens[5] !== undefined ? tokens[5] : undefined;
        const h = tokens[6] !== undefined ? tokens[6] : undefined;
        const res = this.drawImage(texName, x, y, w, h);
        if (res.ok) {
          this.sendConsoleLog(res.msg);
        } else {
          this.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
        }
        return;
      }
      if (shape === 'line' && tokens.length >= 6) {
        const x0 = parseInt(tokens[2], 10);
        const y0 = parseInt(tokens[3], 10);
        const x1 = parseInt(tokens[4], 10);
        const y1 = parseInt(tokens[5], 10);
        const col = tokens[6] ? parseColorString(tokens[6]) : this.currentColor;
        this.canvasActor.exports.w_draw_line(x0, y0, x1, y1, col !== null ? col : this.currentColor);
        this.sendConsoleLog(`drew line from (${x0},${y0}) to (${x1},${y1})`);
        return;
      }
      if (shape === 'rect' && tokens.length >= 6) {
        const x = parseInt(tokens[2], 10);
        const y = parseInt(tokens[3], 10);
        const w = parseInt(tokens[4], 10);
        const h = parseInt(tokens[5], 10);
        const col = tokens[6] ? parseColorString(tokens[6]) : this.currentColor;
        this.canvasActor.exports.w_draw_rect(x, y, w, h, col !== null ? col : this.currentColor);
        this.sendConsoleLog(`drew rect at (${x},${y}) size ${w}x${h}`);
        return;
      }
      if (shape === 'circle' && tokens.length >= 5) {
        const cx = parseInt(tokens[2], 10);
        const cy = parseInt(tokens[3], 10);
        const r = parseInt(tokens[4], 10);
        const col = tokens[5] ? parseColorString(tokens[5]) : this.currentColor;
        this.canvasActor.exports.w_draw_circle(cx, cy, r, col !== null ? col : this.currentColor);
        this.sendConsoleLog(`drew circle at (${cx},${cy}) radius ${r}`);
        return;
      }
      if (shape === 'grid' && tokens.length >= 3) {
        const step = parseInt(tokens[2], 10);
        const col = tokens[3] ? parseColorString(tokens[3]) : this.currentColor;
        this.canvasActor.exports.w_draw_grid(step, col !== null ? col : this.currentColor);
        this.sendConsoleLog(`drew grid with step ${step}`);
        return;
      }
    }

    // 14. EVAL COMMAND
    if (cmd === 'eval') {
      const expr = tokens.slice(1).join(' ');
      const val = evaluateMath(expr);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
      } else {
        console.log('\x1b[31merr: invalid expression\x1b[0m');
      }
      return;
    }

    console.log(`\x1b[31merr: unknown command '${raw}'. Type 'help' for commands.\x1b[0m`);
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
    const subdirs = [
      { dir: 'filters', type: 'filter' }
    ];
    for (const { dir: sub, type } of subdirs) {
      const dir = path.join(pluginsDir, sub);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).sort();
      for (const f of files) {
        if (f.endsWith('.wasm')) {
          const modPath = path.relative(baseDir, path.join(dir, f));
          modules.push({
            id: nextId++,
            name: path.basename(f, '.wasm'),
            type,
            wasmPath: modPath
          });
        }
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

const _exports = {
  WesenhoModule,
  WesenhoScreenHost,
  PARAM_IDS,
  evaluateMath,
  parseColorString,
  createProceduralTextures
};

/* Node.js CommonJS export */
if (typeof module !== 'undefined') module.exports = _exports;
/* Browser global export (used by host-browser.js loaded as a plain <script>) */
if (IS_BROWSER) Object.assign(globalThis, _exports);
