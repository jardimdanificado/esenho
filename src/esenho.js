/**
 * =========================================================================
 * Esenho - Extensible Painting & Drawing Platform (Native WebAssembly)
 * Architecture:
 * - Host / Screen: Viewport, SDL window, REPL, plugin coordination, command parsing.
 * - Canvas Module (roms/canvas.wasm): Native multi-layer composition, resizing, drawing primitives.
 * - Brush Plugins (plugins/brushes/*.wasm): Pure C math & pixel dab shaders.
 * - Filter Plugins (plugins/filters/*.wasm): Pure C image processing kernels.
 * =========================================================================
 */

/* ── Platform shim ── esenho.js runs in Node.js and in the browser.
   In Node the real modules are loaded; in the browser stubs are used
   so the engine logic compiles without modification.                  */
const IS_BROWSER = typeof window !== 'undefined';

let sdl, fs, path, readline, saveImage, loadImage, EsenhoStore;

if (!IS_BROWSER) {
  sdl      = require('@kmamal/sdl');
  fs       = require('fs');
  path     = require('path');
  readline = require('readline');
  ({ saveImage, loadImage } = require('./image_io'));
  try {
    EsenhoStore = require('./project_store.js');
  } catch (_) {}
} else {
  EsenhoStore = typeof window !== 'undefined' ? window.EsenhoStore : null;
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
  if (typeof globalThis !== 'undefined' && globalThis.papagaio) {
    papagaio = globalThis.papagaio;
    return papagaio;
  }
  if (typeof window !== 'undefined' && window.papagaio) {
    papagaio = window.papagaio;
    return papagaio;
  }
  if (!IS_BROWSER) {
    try {
      papagaio = require('./papagaio.bundle.js').papagaio;
      if (papagaio) return papagaio;
    } catch (_) {}
    try {
      papagaio = require('./papagaio/index.js').papagaio;
    } catch (_) {}
  }
  return papagaio;
}

/**
 * Standard Parameter IDs matching include/esenho.h enum
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
  stabilize: 19,
  stabilization: 19,
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
  blend_mode: 31,
  subpixel: 32,
  depletion: 33,
  paint_depletion: 33,
  color_pickup: 34,
  pickup: 34,
  dual_shape: 35,
  dual_brush: 35,
  dual_size: 36,
  dual_spacing: 37,
  symmetry: 38,
  mirror: 38,
  pressure_size: 39,
  stylus_size: 39,
  pressure_flow: 40,
  stylus_flow: 40,
  tilt_angle: 41,
  stylus_tilt: 41,
  buildup: 42,
  accumulate: 42,
  build_up: 42,
  stabilizer_mode: 43,
  smooth_mode: 43,
  string_length: 44,
  lazy_radius: 44,
  pulled_string: 44
};

/**
 * Built-in native brush presets for the Universal Brush Engine
 */
const BRUSH_PRESETS = {
  // 1. Pencils & Sketching
  pencil: {
    name: 'HB Pencil',
    desc: 'Classic graphite sketch pencil with delicate paper grain & tilt response',
    category: 'sketch',
    shape: 0, size: 4, opacity: 90, hardness: 70, flow: 85, spacing: 5,
    smoothing: 15, grain: 35, texture: 'paper', texture_contrast: 25,
    pressure_size: 1, pressure_flow: 1, tilt_angle: 1, scatter: 2, subpixel: 1, mode: 0, eraser: 0
  },
  soft_pencil: {
    name: '6B Graphite',
    desc: 'Soft dark sketching pencil with rich organic tooth and pressure depth',
    category: 'sketch',
    shape: 0, size: 8, opacity: 85, hardness: 45, flow: 80, spacing: 6,
    smoothing: 15, grain: 55, texture: 'paper', texture_contrast: 40,
    pressure_size: 1, pressure_flow: 1, tilt_angle: 1, scatter: 4, subpixel: 1, mode: 0, eraser: 0
  },
  mech_pencil: {
    name: '0.5mm Mechanical',
    desc: 'Crisp technical drafting pencil with tight fixed-core feedback',
    category: 'sketch',
    shape: 0, size: 2, opacity: 95, hardness: 90, flow: 95, spacing: 4,
    smoothing: 20, grain: 20, texture: 'paper', pressure_size: 1, pressure_flow: 1,
    subpixel: 1, mode: 0, eraser: 0
  },
  blue_pencil: {
    name: 'Blue Col-Erase',
    desc: 'Classic blue animation layout pencil with multiply glaze buildup',
    category: 'sketch',
    shape: 0, size: 5, opacity: 75, hardness: 60, flow: 65, spacing: 5,
    color: '#458588', dab_blend: 1, smoothing: 15, grain: 30, texture: 'paper',
    pressure_size: 1, pressure_flow: 1, subpixel: 1, mode: 0, eraser: 0
  },
  tech_pen: {
    name: 'Technical Pen',
    desc: 'Razor-sharp precision drafting pen with fixed width and high stabilization',
    category: 'sketch',
    shape: 0, size: 2, opacity: 100, hardness: 100, flow: 100, spacing: 4,
    smoothing: 35, pressure_size: 0, pressure_flow: 0, grain: 0, mode: 0, subpixel: 1, eraser: 0
  },

  // 2. Inkers & Line Art
  inker: {
    name: 'Studio Inker',
    desc: 'Smooth comic inking brush with dynamic pressure taper & high streamline',
    category: 'ink',
    shape: 0, size: 6, opacity: 100, hardness: 100, flow: 100, spacing: 4,
    smoothing: 35, taper_in: 20, taper_out: 30, pressure_size: 1, pressure_flow: 0,
    grain: 0, mode: 0, subpixel: 1, eraser: 0
  },
  gpen: {
    name: 'Manga G-Pen',
    desc: 'Expressive dip pen with high pressure flare & velocity dynamic',
    category: 'ink',
    shape: 0, size: 8, opacity: 100, hardness: 100, flow: 100, spacing: 4,
    smoothing: 25, velocity: 30, taper_in: 15, pressure_size: 1, pressure_flow: 0,
    grain: 0, mode: 0, subpixel: 1, eraser: 0
  },
  dry_ink: {
    name: 'Dry Ink',
    desc: 'Rough dry brush with bristled tooth and dynamic direction flow',
    category: 'ink',
    shape: 0, size: 10, opacity: 95, hardness: 70, flow: 90, spacing: 7,
    grain: 50, texture: 'charcoal_tooth', size_jitter: 10, angle_jitter: 15, auto_rotate: 1,
    pressure_size: 1, pressure_flow: 1, smoothing: 15, mode: 0, subpixel: 1, eraser: 0
  },
  fountain: {
    name: 'Calligraphy Chisel',
    desc: 'Angled 45° chisel fountain pen for lettering and flourishing',
    category: 'ink',
    shape: 2, size: 7, angle: 45, roundness: 35, opacity: 100, hardness: 95, flow: 100,
    spacing: 5, smoothing: 20, pressure_size: 1, pressure_flow: 0, tilt_angle: 1, mode: 0, eraser: 0
  },
  brush_pen: {
    name: 'Brush Pen',
    desc: 'Sumi-e style flexible hair brush with rich pooling and sharp flicks',
    category: 'ink',
    shape: 0, size: 14, opacity: 100, hardness: 85, flow: 95, spacing: 4,
    smoothing: 30, velocity: 20, taper_out: 35, pressure_size: 1, pressure_flow: 1,
    subpixel: 1, mode: 0, eraser: 0
  },

  // 3. Markers & Lettering
  marker: {
    name: 'Art Marker',
    desc: 'Broad angled alcohol marker with multiply glaze layering',
    category: 'marker',
    shape: 2, size: 24, angle: 45, roundness: 35, opacity: 75, hardness: 90, flow: 85,
    spacing: 5, smoothing: 15, dab_blend: 1, pressure_size: 0, pressure_flow: 1,
    grain: 0, mode: 0, eraser: 0
  },
  brush_marker: {
    name: 'Brush Marker',
    desc: 'Flexible brush marker with smooth gradient buildup',
    category: 'marker',
    shape: 0, size: 16, opacity: 80, hardness: 80, flow: 85, spacing: 5,
    smoothing: 25, dab_blend: 1, taper_in: 10, taper_out: 15, pressure_size: 1, pressure_flow: 1,
    grain: 0, mode: 0, eraser: 0
  },
  highlighter: {
    name: 'Highlighter',
    desc: 'Translucent flat fluorescent highlighter',
    category: 'marker',
    shape: 2, size: 36, angle: 90, roundness: 20, opacity: 40, hardness: 100, flow: 70,
    spacing: 5, dab_blend: 1, pressure_size: 0, pressure_flow: 0, grain: 0, mode: 0, eraser: 0
  },

  // 4. Wet Media & Painting
  oil: {
    name: 'Oil Impasto',
    desc: 'Thick wet oil paint with live pigment pickup, canvas grain and natural depletion',
    category: 'paint',
    shape: 0, size: 26, opacity: 100, hardness: 80, flow: 95, spacing: 6,
    smoothing: 20, mode: 2, wetness: 60, color_pickup: 65, depletion: 35,
    texture: 'canvas', grain: 30, pressure_size: 1, pressure_flow: 1, eraser: 0
  },
  acrylic: {
    name: 'Wet Acrylic',
    desc: 'Smooth opaque acrylic paint with subtle edge mixing',
    category: 'paint',
    shape: 0, size: 20, opacity: 100, hardness: 85, flow: 100, spacing: 5,
    smoothing: 20, mode: 2, wetness: 40, color_pickup: 40, depletion: 20,
    pressure_size: 1, pressure_flow: 1, grain: 0, eraser: 0
  },
  watercolor: {
    name: 'Watercolor Wash',
    desc: 'Translucent watery wash with organic bleeding on wet watercolor paper',
    category: 'paint',
    shape: 0, size: 34, opacity: 35, hardness: 20, flow: 40, spacing: 6,
    smoothing: 25, mode: 2, wetness: 85, color_pickup: 30, depletion: 50,
    texture: 'watercolor', grain: 40, pressure_size: 1, pressure_flow: 1, eraser: 0
  },
  gouache: {
    name: 'Matte Gouache',
    desc: 'Opaque velvety matte gouache with clean edges and smooth blending',
    category: 'paint',
    shape: 0, size: 18, opacity: 95, hardness: 85, flow: 90, spacing: 5,
    smoothing: 20, mode: 2, wetness: 35, color_pickup: 30, depletion: 25,
    texture: 'paper', grain: 20, pressure_size: 1, pressure_flow: 1, eraser: 0
  },
  palette_knife: {
    name: 'Palette Knife',
    desc: 'Flat directional scraping knife for razor edges and impasto streaks',
    category: 'paint',
    shape: 2, size: 28, angle: 0, roundness: 25, opacity: 100, hardness: 95, flow: 100,
    smoothing: 15, auto_rotate: 1, mode: 2, wetness: 70, color_pickup: 70, depletion: 15, eraser: 0
  },

  // 5. Charcoal & Pastels
  charcoal: {
    name: 'Vine Charcoal',
    desc: 'Textured dusty charcoal stick for gesture sketch and blocking',
    category: 'charcoal',
    shape: 0, size: 22, opacity: 80, hardness: 45, flow: 75, spacing: 10,
    texture: 'charcoal_tooth', grain: 60, scatter: 18, size_jitter: 12, smoothing: 10,
    pressure_size: 1, pressure_flow: 1, tilt_angle: 1, mode: 0, eraser: 0
  },
  hard_charcoal: {
    name: 'Compressed Charcoal',
    desc: 'Deep black dense charcoal pencil with crisp tooth',
    category: 'charcoal',
    shape: 0, size: 12, opacity: 95, hardness: 75, flow: 90, spacing: 6,
    texture: 'charcoal_tooth', grain: 45, scatter: 6, smoothing: 12,
    pressure_size: 1, pressure_flow: 1, mode: 0, eraser: 0
  },
  pastel: {
    name: 'Chalk Pastel',
    desc: 'Dense powdery chalk pastel for expressive blending',
    category: 'charcoal',
    shape: 0, size: 18, opacity: 90, hardness: 60, flow: 85, spacing: 8,
    texture: 'canvas', grain: 50, scatter: 8, smoothing: 12,
    pressure_size: 1, pressure_flow: 1, tilt_angle: 1, mode: 0, eraser: 0
  },
  conte: {
    name: 'Conté Crayon',
    desc: 'Square-edged hard sketching crayon with paper tooth',
    category: 'charcoal',
    shape: 1, size: 14, angle: 30, opacity: 85, hardness: 80, flow: 80, spacing: 6,
    texture: 'paper', grain: 50, pressure_size: 1, pressure_flow: 1, mode: 0, eraser: 0
  },

  // 6. Airbrushes & Sprays
  airbrush: {
    name: 'Soft Airbrush',
    desc: 'Ultra-soft feathering airbrush for smooth gradients and shadows',
    category: 'airbrush',
    shape: 0, size: 50, opacity: 30, hardness: 0, flow: 25, spacing: 4,
    smoothing: 20, pressure_size: 0, pressure_flow: 1, grain: 0, mode: 0, eraser: 0
  },
  hard_airbrush: {
    name: 'Flow Airbrush',
    desc: 'Medium airbrush with pressure size and velocity response',
    category: 'airbrush',
    shape: 0, size: 35, opacity: 45, hardness: 20, flow: 40, spacing: 4,
    smoothing: 20, pressure_size: 1, pressure_flow: 1, velocity: 20, grain: 0, mode: 0, eraser: 0
  },
  spray: {
    name: 'Aerosol Spray',
    desc: 'Heavy particle aerosol splatter spray for street art and textures',
    category: 'airbrush',
    shape: 0, size: 45, opacity: 65, hardness: 60, flow: 50, spacing: 20,
    scatter: 55, size_jitter: 40, opacity_jitter: 30, grain: 40, texture: 'noise',
    pressure_flow: 1, mode: 0, eraser: 0
  },

  // 7. Blenders & Smudgers
  smudge: {
    name: 'Finger Smudge',
    desc: 'Soft finger blender for smoothing edges and color gradients',
    category: 'blend',
    shape: 0, size: 30, opacity: 100, hardness: 35, smudge: 80, spacing: 5,
    smoothing: 15, mode: 1, grain: 0, eraser: 0
  },
  blend: {
    name: 'Paint Blender',
    desc: 'Wet color mixer and surface pigment blender',
    category: 'blend',
    shape: 0, size: 28, opacity: 100, hardness: 50, mode: 2, wetness: 80,
    color_pickup: 60, spacing: 5, smoothing: 15, grain: 0, eraser: 0
  },
  rake_blend: {
    name: 'Bristle Smear',
    desc: 'Directional bristle smudger for hair, fur, and motion smearing',
    category: 'blend',
    shape: 2, size: 32, angle: 0, roundness: 35, auto_rotate: 1, opacity: 100, hardness: 60, smudge: 75, spacing: 5,
    smoothing: 15, mode: 1, grain: 0, eraser: 0
  },

  // 8. Erasers
  soft_eraser: {
    name: 'Kneaded Eraser',
    desc: 'Soft feathered eraser for gentle lifting and soft highlights',
    category: 'eraser',
    shape: 0, size: 32, opacity: 100, hardness: 15, flow: 45, spacing: 5,
    smoothing: 15, mode: 0, eraser: 1, grain: 0
  },
  hard_eraser: {
    name: 'Vinyl Eraser',
    desc: 'Clean razor-sharp eraser for exact cutouts',
    category: 'eraser',
    shape: 0, size: 18, opacity: 100, hardness: 100, flow: 100, spacing: 4,
    smoothing: 15, mode: 0, eraser: 1, grain: 0
  },
  textured_eraser: {
    name: 'Grunge Eraser',
    desc: 'Textured eraser for weathering and organic distressing',
    category: 'eraser',
    shape: 0, size: 26, opacity: 100, hardness: 50, flow: 80, spacing: 8,
    grain: 55, texture: 'grunge', scatter: 10, smoothing: 10, mode: 0, eraser: 1
  },

  // 9. Special, FX & Screentones
  pixel: {
    name: 'Pixel Pencil',
    desc: '1px pixel-perfect pencil without anti-aliasing',
    category: 'fx',
    shape: 1, size: 1, opacity: 100, hardness: 100, flow: 100, spacing: 100,
    subpixel: 0, smoothing: 0, pressure_size: 0, pressure_flow: 0, grain: 0,
    mode: 0, eraser: 0
  },
  halftone: {
    name: 'Manga Screentone',
    desc: 'Halftone screen dots pattern with pressure opacity',
    category: 'fx',
    shape: 0, size: 32, opacity: 100, hardness: 90, flow: 100, spacing: 8,
    texture: 'dots', texture_mode: 4, pressure_size: 0, pressure_flow: 1,
    smoothing: 10, mode: 0, eraser: 0
  },
  crosshatch: {
    name: 'Crosshatch',
    desc: 'Diagonal hatching texture screentone for comic shading',
    category: 'fx',
    shape: 0, size: 32, opacity: 100, hardness: 85, flow: 100, spacing: 8,
    texture: 'hatch', texture_mode: 4, pressure_size: 0, pressure_flow: 1,
    smoothing: 10, mode: 0, eraser: 0
  },

  // Compatibility aliases
  pen: { shape: 0, size: 4, opacity: 100, hardness: 100, flow: 100, spacing: 4, smoothing: 25, mode: 0, eraser: 0 },
  paint: { shape: 0, size: 24, opacity: 100, hardness: 75, flow: 95, spacing: 7, smoothing: 20, mode: 2, wetness: 55, color_pickup: 60, depletion: 35, eraser: 0 },
  round: { shape: 0, hardness: 80, roundness: 100, mode: 0, spacing: 15, grain: 0, scatter: 0, opacity: 100, flow: 100, angle: 0, eraser: 0 },
  square: { shape: 1, hardness: 100, roundness: 100, mode: 0, spacing: 15, grain: 0, scatter: 0, angle: 0, eraser: 0 },
  calligraphy: { shape: 2, angle: 45, roundness: 30, hardness: 100, mode: 0, spacing: 10, grain: 0, scatter: 0, eraser: 0 },
  chisel: { shape: 2, angle: 45, roundness: 30, hardness: 100, mode: 0, spacing: 10, grain: 0, scatter: 0, eraser: 0 },
  hatch: { shape: 2, angle: 45, spacing: 80, hardness: 100, roundness: 30, mode: 0, grain: 0, scatter: 0, eraser: 0 },
  scatter: { shape: 0, scatter: 50, grain: 30, hardness: 80, roundness: 100, mode: 0, spacing: 30, eraser: 0 },
  fill: { mode: 3, tolerance: 32 },
  flood_fill: { mode: 3, tolerance: 32 },
  lasso_fill: { mode: 4 },
  lasso: { mode: 4 }
};

/**
 * Native Esenho WebAssembly Module Wrapper.
 * Freestanding, libc-free WASM runner with direct ABI function exports.
 */
class EsenhoModule {
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
   * @returns {Promise<EsenhoModule>}
   */
  static async fromURL(url, options = {}) {
    const resp = await fetch(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return new EsenhoModule(bytes, options);
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

  stroke(state, x, y, prevX, prevY, color, eraser, pressure, tiltX, tiltY) {
    const press = (pressure !== undefined && pressure !== null) ? Math.round(pressure * 1000) : 1000;
    const tx = (tiltX !== undefined && tiltX !== null) ? Math.round(tiltX) : 0;
    const ty = (tiltY !== undefined && tiltY !== null) ? Math.round(tiltY) : 0;
    if (typeof this.exports.w_brush_stroke_ext === 'function') {
      this.exports.w_brush_stroke_ext(state, x, y, prevX, prevY, color >>> 0, eraser ? 1 : 0, press, tx, ty);
    } else if (typeof this.exports.w_brush_stroke === 'function') {
      this.exports.w_brush_stroke(state, x, y, prevX, prevY, color >>> 0, eraser ? 1 : 0);
    }
  }

  readCString(ptr) {
    if (!ptr || !this.memory) return '';
    const u8 = new Uint8Array(this.memory.buffer);
    let end = ptr;
    while (end < u8.length && u8[end] !== 0) end++;
    return new TextDecoder('utf-8').decode(u8.subarray(ptr, end));
  }

  getInfo() {
    if (this._info) return this._info;
    if (typeof this.exports.w_plugin_get_info === 'function') {
      try {
        const ptr = this.exports.w_plugin_get_info();
        const jsonStr = this.readCString(ptr);
        if (jsonStr) {
          this._info = JSON.parse(jsonStr);
          return this._info;
        }
      } catch (e) {
        console.warn(`[esenho] failed to parse plugin info for ${this.name}:`, e);
      }
    }
    const defaultTitle = this.name ? (this.name.charAt(0).toUpperCase() + this.name.slice(1)) : 'Plugin';
    this._info = {
      title: defaultTitle,
      params: [
        { name: 'Parameter 1', min: 0, max: 255, default: 30 }
      ]
    };
    return this._info;
  }

  applyFilter(p1 = 0, p2 = 0) {
    if (typeof this.exports.w_filter_apply === 'function') {
      this.exports.w_filter_apply(p1, p2);
    }
  }
}

// Document Dimensions (Default Proportions)
const DOC_WIDTH  = 1280;
const DOC_HEIGHT = 720;

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

  // 4. Bristle (3-strand vertical fine bristles, 64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - 32);
      const falloff = dy <= 26 ? (1 - dy / 26) : 0;
      for (let x = 0; x < w; x++) {
        const isB1 = Math.abs(x - 22) <= 3;
        const isB2 = Math.abs(x - 32) <= 3;
        const isB3 = Math.abs(x - 42) <= 3;
        const inside = (isB1 || isB2 || isB3) && falloff > 0;
        const a = inside ? Math.floor(255 * falloff) : 0;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('bristle', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 5. Rake (5-strand rake fan, 64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - 32);
      const falloff = dy <= 28 ? (1 - dy / 28) : 0;
      for (let x = 0; x < w; x++) {
        const strand = (x % 11 === 0 || (x + 1) % 11 === 0) && x >= 8 && x <= 56;
        const a = (strand && falloff > 0) ? Math.floor(255 * falloff) : 0;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('rake', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 6. Charcoal Grit Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = y - 32;
      for (let x = 0; x < w; x++) {
        const dx = x - 32;
        const d = Math.sqrt(dx * dx + dy * dy);
        let a = 0;
        if (d <= 30) {
          const edge = 1 - d / 30;
          const noise = ((x * 179 + y * 283) ^ (x * y * 7)) & 0xFF;
          a = (noise > 70) ? Math.floor(edge * 255) : 0;
        }
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('charcoal_tip', { width: w, height: h, data: buf, category: 'shape' });
    map.set('charcoal', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 7. Dagger / Teardrop Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const widthAtY = (y / 64) * 26;
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - 32);
        const inside = dx <= widthAtY && y >= 6 && y <= 58;
        const a = inside ? 0xFF : 0x00;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('dagger', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 8. Stipple Multi-Point Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    const points = [
      [32,32,4],[22,26,3],[42,24,3],[20,38,3],[44,36,3],[32,18,2],[30,46,2],[14,30,2],[50,30,2],[26,30,2],[38,32,2]
    ];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = false;
        for (const [px, py, pr] of points) {
          const dx = x - px, dy = y - py;
          if (dx * dx + dy * dy <= pr * pr) { inside = true; break; }
        }
        const a = inside ? 0xFF : 0x00;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('stipple', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 9. Splatter Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    const drops = [
      [32,32,8],[18,20,3],[46,18,4],[14,42,3],[48,46,4],[28,52,2],[36,12,3],[10,28,2],[54,32,2],[24,40,3],[40,24,3]
    ];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = false;
        for (const [px, py, pr] of drops) {
          const dx = x - px, dy = y - py;
          if (dx * dx + dy * dy <= pr * pr) { inside = true; break; }
        }
        const a = inside ? 0xFF : 0x00;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('splatter', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 10. Cloud / Foliage Cluster (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    const lobes = [[32,32,18],[22,26,12],[42,26,12],[24,38,12],[40,38,12]];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let maxA = 0;
        for (const [lx, ly, lr] of lobes) {
          const dx = x - lx, dy = y - ly;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= lr) {
            const edge = Math.floor(255 * (1 - d / lr));
            if (edge > maxA) maxA = edge;
          }
        }
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = maxA;
      }
    }
    map.set('cloud', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 11. Soft Round Airbrush (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = y - 32;
      for (let x = 0; x < w; x++) {
        const dx = x - 32;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = d <= 31 ? Math.floor(255 * Math.cos((d / 31) * (Math.PI / 2))) : 0;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('soft_round', { width: w, height: h, data: buf, category: 'shape' });
    map.set('soft', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 12. Oval / Calligraphy 45° Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    const cos45 = Math.SQRT1_2, sin45 = Math.SQRT1_2;
    for (let y = 0; y < h; y++) {
      const dy = y - 32;
      for (let x = 0; x < w; x++) {
        const dx = x - 32;
        const u = dx * cos45 + dy * sin45;
        const v = -dx * sin45 + dy * cos45;
        const inside = (u * u) / (28 * 28) + (v * v) / (9 * 9) <= 1;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = inside ? 0xFF : 0;
      }
    }
    map.set('oval', { width: w, height: h, data: buf, category: 'shape' });
    map.set('calligraphy', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 13. Sharp Triangle Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const halfW = ((y - 8) / 48) * 26;
      for (let x = 0; x < w; x++) {
        const inside = (y >= 8 && y <= 56 && Math.abs(x - 32) <= halfW);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = inside ? 0xFF : 0;
      }
    }
    map.set('triangle', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 14. Diamond / Rhombus Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - 32);
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - 32);
        const inside = (dx + dy <= 28);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = inside ? 0xFF : 0;
      }
    }
    map.set('diamond', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 15. Fan Brush Arc Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = y - 56;
      for (let x = 0; x < w; x++) {
        const dx = x - 32;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(-dy, dx);
        const inArc = dist >= 22 && dist <= 48 && ang >= Math.PI * 0.25 && ang <= Math.PI * 0.75;
        const bristle = ((x * 7 + y * 13) % 5 <= 2);
        const a = (inArc && bristle) ? 0xFF : 0x00;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('fan', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 16. Dry Brush Streaks Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - 32);
      const falloff = dy <= 24 ? (1 - dy / 24) : 0;
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - 32);
        const streak = ((x * 29 + (y >> 1) * 31) ^ (x * y)) & 0xFF;
        const inside = dx <= 26 && falloff > 0 && streak > 80;
        const a = inside ? Math.floor(falloff * 255) : 0;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = a;
      }
    }
    map.set('dry_brush', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 17. Star Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dy = y - 32;
      for (let x = 0; x < w; x++) {
        const dx = x - 32;
        const r = Math.sqrt(dx * dx + dy * dy);
        let ang = Math.atan2(dy, dx) + Math.PI / 2;
        if (ang < 0) ang += Math.PI * 2;
        const arm = Math.floor((ang / (Math.PI * 2)) * 5);
        const relAng = ang - arm * (Math.PI * 2 / 5);
        const maxR = 28 * (0.45 + 0.55 * Math.max(0, Math.cos(relAng * 2.5)));
        const inside = r <= maxR;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = inside ? 0xFF : 0;
      }
    }
    map.set('star', { width: w, height: h, data: buf, category: 'shape' });
  }

  // 18. Pixel Block Tip (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = (x >= 16 && x < 48 && y >= 16 && y < 48);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = 0xFF; buf[idx + 1] = 0xFF; buf[idx + 2] = 0xFF; buf[idx + 3] = inside ? 0xFF : 0;
      }
    }
    map.set('pixel', { width: w, height: h, data: buf, category: 'shape' });
  }

  // Procedural Textures
  // 1. Paper (256x256)
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
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('paper', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 2. Canvas (128x128)
  {
    const w = 128, h = 128;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wx = Math.sin(x * Math.PI / 4) * 40;
        const wy = Math.sin(y * Math.PI / 4) * 40;
        const v = Math.max(0, Math.min(255, Math.floor(180 + wx + wy + (Math.random() - 0.5) * 30)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('canvas', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 3. Noise (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = Math.floor(Math.random() * 256);
      buf[i * 4 + 0] = v; buf[i * 4 + 1] = v; buf[i * 4 + 2] = v; buf[i * 4 + 3] = 0xFF;
    }
    map.set('noise', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 4. Dots (32x32)
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
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('dots', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 5. Grid (32x32)
  {
    const w = 32, h = 32;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isLine = (x % 16 === 0 || y % 16 === 0);
        const v = isLine ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('grid', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 6. Grunge (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g1 = Math.sin(x * 0.05) * Math.sin(y * 0.05) * 80;
        const g2 = Math.cos(x * 0.2 + y * 0.1) * 40;
        const v = Math.max(0, Math.min(255, Math.floor(128 + g1 + g2 + (Math.random() - 0.5) * 70)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('grunge', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 7. Hatch (32x32)
  {
    const w = 32, h = 32;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isLine = ((x + y) % 8 === 0 || (x + y) % 8 === 1);
        const v = isLine ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('hatch', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 8. Watercolor Paper (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pit = (((Math.floor(x / 3)) * 11 + (Math.floor(y / 3)) * 13) % 23 < 4) ? 40 : 255;
        const n = Math.floor(190 + (Math.random() - 0.5) * 50);
        const v = Math.floor((n * pit) / 255);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('watercolor', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 9. Charcoal Tooth Paper (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tooth = Math.random() > 0.45 ? 255 : (Math.random() > 0.2 ? 120 : 30);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = tooth; buf[idx + 1] = tooth; buf[idx + 2] = tooth; buf[idx + 3] = 0xFF;
      }
    }
    map.set('charcoal_tooth', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 10. Wood Grain (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wave = Math.floor(x + (y * y / 120) % 24);
        const ring = (wave % 12 < 3) ? 245 : 75;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = ring; buf[idx + 1] = ring; buf[idx + 2] = ring; buf[idx + 3] = 0xFF;
      }
    }
    map.set('wood', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 11. Leather Pores (128x128)
  {
    const w = 128, h = 128;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = (x % 10) - 5, cy = (y % 10) - 5;
        const d = cx * cx + cy * cy;
        const v = d <= 3 ? 40 : 240;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('leather', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 12. Dense Linen (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lx = (x % 4 < 2), ly = (y % 4 < 2);
        const v = (lx ^ ly) ? 240 : 70;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('linen', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 13. Marble Veins (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const turb = Math.sin(x * 0.04 + Math.sin(y * 0.06) * 4.0) * 128 + 128;
        const v = Math.max(0, Math.min(255, Math.floor(turb)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('marble', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 14. Cloud / Perlin Noise Grain (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c1 = Math.sin(x * 0.03) * Math.cos(y * 0.03) * 60;
        const c2 = Math.sin(x * 0.08 + y * 0.06) * 35;
        const c3 = Math.cos(x * 0.15 - y * 0.12) * 20;
        const v = Math.max(0, Math.min(255, Math.floor(128 + c1 + c2 + c3)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('cloud_grain', { width: w, height: h, data: buf, category: 'texture' });
    map.set('perlin', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 15. Basket Weave (64x64)
  {
    const w = 64, h = 64;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bx = Math.floor(x / 8) % 2, by = Math.floor(y / 8) % 2;
        const stripe = (bx ^ by) ? ((x % 4 < 2) ? 230 : 60) : ((y % 4 < 2) ? 230 : 60);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = stripe; buf[idx + 1] = stripe; buf[idx + 2] = stripe; buf[idx + 3] = 0xFF;
      }
    }
    map.set('weave', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 16. Sandpaper Grit (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = ((x * 377 + y * 491) ^ (x * y * 13)) & 0xFF;
        const tooth = g > 110 ? 255 : (g > 50 ? 110 : 25);
        const idx = (y * w + x) * 4;
        buf[idx + 0] = tooth; buf[idx + 1] = tooth; buf[idx + 2] = tooth; buf[idx + 3] = 0xFF;
      }
    }
    map.set('sandpaper', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 17. Halftone Radial Screen (32x32)
  {
    const w = 32, h = 32;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x % 16) - 8, dy = (y % 16) - 8;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = Math.max(0, Math.min(255, Math.floor((1 - d / 8.5) * 255)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('halftone', { width: w, height: h, data: buf, category: 'texture' });
  }

  // 18. Crackle Fissures (256x256)
  {
    const w = 256, h = 256;
    const buf = Buf.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = Math.abs(Math.sin(x * 0.08 + Math.cos(y * 0.06) * 3) * Math.sin(y * 0.08));
        const v = c < 0.12 ? 30 : 235;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v; buf[idx + 1] = v; buf[idx + 2] = v; buf[idx + 3] = 0xFF;
      }
    }
    map.set('crackle', { width: w, height: h, data: buf, category: 'texture' });
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
function parseColorString(str, fallback = null) {
  if (!str) return fallback;
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
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16);
      return (((a << 24) | (b << 16) | (g << 8) | r) >>> 0);
    }
  }

  if (str.startsWith('0x')) {
    const hex = str.slice(2);
    if (hex.length === 8) {
      return parseInt(hex, 16) >>> 0;
    }
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

  return fallback;
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
    console.log('\x1b[1;34m=== Esenho Entities ===\x1b[0m\n');
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
    } else if (prop === 'alpha_lock' || prop === 'alphalock') {
      const lock = host.getLayerAlphaLock ? host.getLayerAlphaLock(targetId) : 0;
      console.log(lock ? 'on' : 'off');
    } else if (prop === 'clipping' || prop === 'clip') {
      const clip = host.getLayerClipping ? host.getLayerClipping(targetId) : 0;
      console.log(clip ? 'on' : 'off');
    } else if (prop === 'blend' || prop === 'blend_mode') {
      const bNames = ['normal', 'multiply', 'screen', 'overlay', 'dodge', 'add'];
      const bm = host.getLayerBlendMode ? host.getLayerBlendMode(targetId) : 0;
      console.log(bNames[bm] || bm);
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

  if (cat === 'flip' || cat === 'flip_h' || cat === 'fliph') {
    console.log(host.flipH ? 'on' : 'off');
    return;
  }

  if (cat === 'flip_v' || cat === 'flipv') {
    console.log(host.flipV ? 'on' : 'off');
    return;
  }

  if (cat === 'symmetry' || cat === 'mirror') {
    const sNames = ['off', 'vertical', 'horizontal', 'quad'];
    const sVal = host.brushParams.symmetry || 0;
    console.log(sNames[sVal] !== undefined ? sNames[sVal] : sVal);
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
    smooth: 'smoothing', stabilizer: 'smoothing', stabilize: 'smoothing', stabilization: 'smoothing',
    stabilizer_mode: 'stabilizer_mode', smooth_mode: 'stabilizer_mode',
    string_length: 'string_length', lazy_radius: 'string_length', pulled_string: 'string_length',
    bezier: 'midpoint', bezier_midpoint: 'midpoint',
    tex_contrast: 'texture_contrast', grain_contrast: 'texture_contrast',
    taper: 'taper_in', taper_start: 'taper_in', taper_end: 'taper_out',
    flow_jitter: 'opacity_jitter', dab_blend_mode: 'dab_blend', blend_mode: 'dab_blend',
    mirror: 'symmetry'
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
    if (host.canvasActor && host.canvasActor.exports && host.canvasActor.exports.w_resize) {
      host.canvasActor.exports.w_resize(w, h);
    }
    if (typeof host.resizeCanvas === 'function') {
      host.resizeCanvas(w, h);
    }
    if (typeof host.render === 'function') {
      host.render();
    }
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
    host.setActionMode('erase');
    host.sendConsoleLog('tool set to eraser');
  } else if (t === 'brush' || t === 'draw') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'brush';
    host.setBrushParam('mode', 0);
    host.sendConsoleLog('tool set to brush (draw)');
  } else if (t === 'square' || t === 'circle' || t === 'round' || t === 'chisel' || t === 'flat') {
    host.setBrushParam('shape', t);
    host.sendConsoleLog(`brush shape set to ${t}`);
  } else if (t === 'smudge') {
    host.setActionMode('smudge');
    host.currentTool = 'smudge';
    host.setBrushParam('mode', 1);
    host.sendConsoleLog('tool set to smudge');
  } else if (t === 'blend') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'blend';
    host.setBrushParam('mode', 2);
    host.sendConsoleLog('tool set to blend');
  } else if (t === 'fill' || t === 'flood_fill') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'fill';
    host.setBrushParam('mode', 3);
    host.sendConsoleLog('tool set to flood fill');
  } else if (t === 'lasso_fill' || t === 'lasso') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'lasso_fill';
    host.setBrushParam('mode', 4);
    host.sendConsoleLog('tool set to lasso fill');
  } else if (t === 'picker' || t === 'eyedropper' || t === 'pipette') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'picker';
    host.setBrushParam('mode', 5);
    host.sendConsoleLog('tool set to picker');
  } else if (t === 'line') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'line';
    host.setBrushParam('mode', 6);
    host.sendConsoleLog('tool set to line');
  } else if (t === 'rect' || t === 'rectangle') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'rect';
    host.setBrushParam('mode', 7);
    host.sendConsoleLog('tool set to rect');
  } else if (t === 'ellipse' || t === 'circle_shape') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'ellipse';
    host.setBrushParam('mode', 8);
    host.sendConsoleLog('tool set to ellipse');
  } else if (t === 'select' || t === 'marquee' || t === 'select_rect') {
    host.setActionMode('select');
    host.currentTool = 'select_rect';
    host.setBrushParam('mode', 9);
    host.sendConsoleLog('tool set to select');
  } else if (t === 'lasso_select' || t === 'lasso select') {
    host.setActionMode('select');
    host.currentTool = 'lasso_select';
    host.setBrushParam('mode', 10);
    host.sendConsoleLog('tool set to lasso select');
  } else if (t === 'wand' || t === 'magic_wand' || t === 'magic wand' || t === 'wand_select' || t === 'wand select' || t === 'magic_wand_select' || t === 'magic wand select') {
    host.setActionMode('select');
    host.currentTool = 'magic_wand';
    host.setBrushParam('mode', 11);
    host.sendConsoleLog('tool set to magic wand');
  } else {
    host.sendConsoleLog(`err: unknown tool '${rawTool}'`, 0xFFFF5555);
  }
}

function handleSetMode(host, rawMode) {
  const m = rawMode.toLowerCase();
  if (m === 'eraser' || m === 'erase') {
    host.setActionMode('erase');
    host.sendConsoleLog('action mode set to erase');
  } else if (m === 'draw') {
    host.setActionMode('draw');
    host.currentTool = 'brush';
    host.setBrushParam('mode', 0);
    host.sendConsoleLog('mode set to draw');
  } else if (m === 'brush') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'brush';
    host.setBrushParam('mode', 0);
    host.sendConsoleLog('tool set to brush');
  } else if (m === 'smudge') {
    host.setActionMode('smudge');
    host.currentTool = 'smudge';
    host.setBrushParam('mode', 1);
    host.sendConsoleLog('action mode set to smudge');
  } else if (m === 'blend') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'blend';
    host.setBrushParam('mode', 2);
    host.sendConsoleLog('tool set to blend');
  } else if (m === 'fill' || m === 'flood_fill') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'fill';
    host.setBrushParam('mode', 3);
    host.sendConsoleLog('tool set to fill');
  } else if (m === 'lasso_fill' || m === 'lasso') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'lasso_fill';
    host.setBrushParam('mode', 4);
    host.sendConsoleLog('tool set to lasso');
  } else if (m === 'picker' || m === 'eyedropper' || m === 'pipette') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'picker';
    host.setBrushParam('mode', 5);
    host.sendConsoleLog('tool set to picker');
  } else if (m === 'line') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'line';
    host.setBrushParam('mode', 6);
    host.sendConsoleLog('tool set to line');
  } else if (m === 'rect' || m === 'rectangle') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'rect';
    host.setBrushParam('mode', 7);
    host.sendConsoleLog('tool set to rect');
  } else if (m === 'ellipse' || m === 'circle_shape') {
    if (host.actionMode === 'select') host.setActionMode('draw');
    host.currentTool = 'ellipse';
    host.setBrushParam('mode', 8);
    host.sendConsoleLog('tool set to ellipse');
  } else if (m === 'select' || m === 'marquee' || m === 'select_rect') {
    host.setActionMode('select');
    host.currentTool = 'select_rect';
    host.setBrushParam('mode', 9);
    host.sendConsoleLog('mode set to select');
  } else if (m === 'lasso_select' || m === 'lasso select') {
    host.setActionMode('select');
    host.currentTool = 'lasso_select';
    host.setBrushParam('mode', 10);
    host.sendConsoleLog('mode set to lasso select');
  } else if (m === 'wand' || m === 'magic_wand' || m === 'magic wand' || m === 'wand_select' || m === 'wand select' || m === 'magic_wand_select' || m === 'magic wand select') {
    host.setActionMode('select');
    host.currentTool = 'magic_wand';
    host.setBrushParam('mode', 11);
    host.sendConsoleLog('mode set to magic wand');
  } else {
    host.sendConsoleLog(`err: unknown mode '${rawMode}'`, 0xFFFF5555);
  }
}

function handleBrushParamOrPreset(host, sub, val) {
  const s = sub.toLowerCase().trim();
  if (PARAM_IDS[s] !== undefined && val !== undefined) {
    host.setBrushParam(s, val);
    host.sendConsoleLog(`brush ${s} set to ${val}`);
  } else if (BRUSH_PRESETS[s] || (host.customBrushPresets && host.customBrushPresets[s])) {
    host.selectBrushPreset(s);
    host.sendConsoleLog(`brush preset '${s}' applied`);
  } else {
    host.sendConsoleLog(`err: unknown brush parameter or preset '${sub}'`, 0xFFFF5555);
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
 * Add custom syntax patterns here or push to EsenhoScreenHost.COMMAND_RULES!
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
  \x1b[36mModes & Brush Setup:\x1b[0m
    set mode <brush|eraser|smudge|blend|fill|lasso_fill>
    set shape <circle|square|chisel|<texture>|layer_<id>>  Tip shape (samples alpha channel)
    set texture <paper|canvas|noise|dots|grid|grunge|hatch|<name>|layer_<id>|none>
    set size <1..500>            Brush tip diameter (pixels)
    set opacity <0..100>         Brush opacity percentage
    set hardness / softness <val> 0% soft airbrush to 100% hard edge
    set flow <0..100>            Ink flow rate per dab
    set spacing <1..500>         Dab interpolation spacing percentage
    set angle / rotate <0..359>  Tip rotation angle in degrees
    set roundness <1..100>       Tip aspect ratio / roundness
    set scatter <0..500>         Perpendicular stochastic scatter
    set grain <0..100>           Stochastic pixel noise / grain
    set smudge <0..100>          Smudge pick-up intensity
    set wetness <0..100>         Color wetness mix ratio
    set tolerance <0..255>       Flood fill color tolerance
    set smooth / smoothing <0..100> Stroke stabilizer & smoothing percentage
    set bezier / midpoint <0..100> Bézier midpoint curvature ratio percentage
    set texture_rotate <0..359>  Texture pattern rotation in degrees
    set texture_scale <1..1000>  Texture pattern scale percentage
    set texture_contrast <0..200> Texture contrast multiplier
    set taper_in <0..2000>       Stroke taper-in distance (pixels)
    set fade <0..2000>           Stroke fade-out distance (pixels)
    set size_jitter <0..100>     Stochastic size jitter percentage
    set angle_jitter <0..360>    Stochastic angle jitter (degrees)
    set opacity_jitter <0..100>  Stochastic opacity jitter percentage
    set color_jitter <0..100>    Stochastic HSV color jitter percentage
    set dab_blend <normal|multiply|screen|overlay|dodge|add>
    set auto_rotate <on|off>     Auto-align tip rotation to stroke direction
    set velocity <0..100>        Speed dynamics (size modulation by speed)
    set ui_scale <val|auto>      Scale UI (e.g. 125%, 1.5, auto)
    reset tool / reset brush     Reset all tool/brush parameters to factory defaults

  \x1b[36mInspect & Query:\x1b[0m
    status / info                Show active tool, brush, surface & viewport status
    list [layers|textures|filters|all] List entities
    get [mode|shape|texture|size|opacity|hardness|flow|spacing|angle|color|layer|...]

  \x1b[36mSurface, Layer & Group Commands:\x1b[0m
    resize <w> <h>               Resize canvas dimensions
    new layer / layer add        Add new layer
    layer select <id>            Select active drawing layer
    layer move up [id]           Move layer up in stack order
    layer move down [id]         Move layer down in stack order
    layer merge down [id]        Merge layer down into layer below
    delete layer [id]            Delete layer
    toggle layer [id]            Toggle layer visibility
    opacity layer <id> <0..100>  Set layer opacity percentage
    layer alpha_lock [id] <on|off> Lock layer alpha channel
    layer clipping [id] <on|off> Clip layer to base layer below
    layer blend [id] <mode>      Set layer blend mode (normal, multiply, screen, overlay, dodge, add)
    clear layer                  Clear active layer
    group new [name]             Create layer folder/group
    group add <group> <id>       Add layer to group
    group remove <id>            Remove layer from group
    group toggle <group>         Toggle visibility of all layers in group
    group delete <group>         Delete group folder

  \x1b[36mHistory & Canvas Actions:\x1b[0m
    undo / redo                  Revert or reapply actions
    history [clear]              Show or clear undo/redo stack
    flip canvas / flip h         Mirror canvas viewport horizontally
    flip v / flip vertical       Mirror canvas viewport vertically
    set symmetry <off|v|h|quad>  Mirror brush strokes across axes

  \x1b[36mSelection & Adjustments:\x1b[0m
    select rect <x> <y> <w> <h>  Create rectangular selection
    select lasso                  Switch to freehand lasso selection mode
    select wand [tolerance]       Flood-fill select by color at clicked point
    select all / deselect         Select all or clear selection
    copy / cut / paste [x y]      Clipboard operations on selection
    transform apply               Bake floating transform into layer
    transform cancel              Cancel floating transform and discard floating layer
    adjust hsv <h> <s> <v>       Adjust layer Hue (-180..180), Sat (-100..100), Value (-100..100)
    adjust hue / sat / brightness <val>

  \x1b[36mFilter Commands:\x1b[0m
    filter <name> [p1] [p2]      Apply filter (blur [radius], brightness, contrast, dither,
                                 edge, grayscale, invert, noise, pixelate, sepia, threshold)

  \x1b[36mDrawing & I/O:\x1b[0m
    set color <#hex|r g b|name>  Set drawing color
    brush <x> <y>                Paint a dab at coordinates
    stroke <x0> <y0> <x1> <y1>   Draw a brush stroke between points
    draw line <x0> <y0> <x1> <y1> [col]
    draw rect <x> <y> <w> <h> [col]
    draw circle <cx> <cy> <r> [col]
    draw ellipse <cx> <cy> <rx> <ry> [col]
    draw image / stamp <name> [x] [y] [w] [h] [opacity]
    save [canvas|layer] <file>   Export image to disk
    load image <file> [name]     Load image file into texture storage
    reset cache / clear cache    Clear service worker cache and reload page
    reset data / clear data      Clear all storage (IndexedDB + LocalStorage) and return to launcher
    reset all / clear all        Clear both cache and all user storage and return to launcher
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
  { pat: "canvas resize $w$int $h$int", run: (m, host) => handleResize(host, m.w, m.h) },
  { pat: "canvas resize $w$int $h$int $mode", run: (m, host) => handleResize(host, m.w, m.h) },
  { pat: "resize canvas $w$int $h$int", run: (m, host) => handleResize(host, m.w, m.h) },
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
    pat: "new layer $name",
    run: (m, host) => {
      const idx = host.canvasActor.exports.w_layer_add();
      if (!host.layerNames) host.layerNames = new Map();
      host.layerNames.set(idx, m.name);
      host.sendConsoleLog(`new layer [${idx}] '${m.name}' added`);
    }
  },
  { pat: "layer add $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "new layer $name").run(m, host) },
  { pat: "layer new $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "new layer $name").run(m, host) },
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
      if (host.layerNames) host.layerNames.delete(id);
      if (typeof host.ensureTreeIntegrity === 'function') host.ensureTreeIntegrity();
      host.sendConsoleLog(`deleted layer [${id}]`);
    }
  },
  {
    pat: "delete layer",
    run: (m, host) => {
      const getActive = host.canvasActor.exports.w_layer_get_active || host.canvasActor.exports.get_active_layer;
      const id = getActive ? getActive() : 0;
      host.canvasActor.exports.w_layer_delete(id);
      if (host.layerNames) host.layerNames.delete(id);
      if (typeof host.ensureTreeIntegrity === 'function') host.ensureTreeIntegrity();
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
      if (newId >= 0) {
        if (!host.layerNames) host.layerNames = new Map();
        const srcName = host.layerNames.get(id) || `Layer ${id}`;
        host.layerNames.set(newId, `${srcName} (Copy)`);
        host.ensureTreeIntegrity();
        host.sendConsoleLog(`layer [${id}] duplicated to [${newId}]`);
      }
      else host.sendConsoleLog(`err: failed to duplicate layer [${id}]`, 0xFFFF5555);
    }
  },
  {
    pat: "duplicate layer",
    run: (m, host) => {
      const id = host.canvasActor.exports.get_active_layer();
      const newId = host.canvasActor.exports.w_layer_duplicate ? host.canvasActor.exports.w_layer_duplicate(id) : -1;
      if (newId >= 0) {
        if (!host.layerNames) host.layerNames = new Map();
        const srcName = host.layerNames.get(id) || `Layer ${id}`;
        host.layerNames.set(newId, `${srcName} (Copy)`);
        host.ensureTreeIntegrity();
        host.sendConsoleLog(`layer [${id}] duplicated to [${newId}]`);
      }
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
  { pat: "set layer_opacity $id$int $val$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "opacity layer $id$int $val$int").run(m, host) },
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
  { pat: "layer opacity $val$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set layer opacity $val$int").run(m, host) },
  { pat: "set layer_opacity $val$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set layer opacity $val$int").run(m, host) },
  { pat: "layer_opacity $val$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set layer opacity $val$int").run(m, host) },

  // Layer Alpha Lock
  {
    pat: "layer alpha_lock $id$int $val",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const v = m.val.toLowerCase();
      const lock = (v === 'on' || v === '1' || v === 'true');
      host.setLayerAlphaLock(id, lock);
      host.sendConsoleLog(`layer [${id}] alpha lock: ${lock ? 'on' : 'off'}`);
    }
  },
  {
    pat: "layer alpha_lock $val",
    run: (m, host) => {
      const id = host.canvasActor?.exports?.get_active_layer?.() ?? 0;
      const v = m.val.toLowerCase();
      const lock = (v === 'on' || v === '1' || v === 'true');
      host.setLayerAlphaLock(id, lock);
      host.sendConsoleLog(`layer [${id}] alpha lock: ${lock ? 'on' : 'off'}`);
    }
  },
  { pat: "layer alphalock $id$int $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer alpha_lock $id$int $val").run(m, host) },
  { pat: "layer alphalock $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer alpha_lock $val").run(m, host) },
  { pat: "alpha_lock $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer alpha_lock $val").run(m, host) },
  { pat: "alphalock $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer alpha_lock $val").run(m, host) },

  // Layer Clipping Mask
  {
    pat: "layer clipping $id$int $val",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      const v = m.val.toLowerCase();
      const clip = (v === 'on' || v === '1' || v === 'true');
      host.setLayerClipping(id, clip);
      host.sendConsoleLog(`layer [${id}] clipping: ${clip ? 'on' : 'off'}`);
    }
  },
  {
    pat: "layer clipping $val",
    run: (m, host) => {
      const id = host.canvasActor?.exports?.get_active_layer?.() ?? 0;
      const v = m.val.toLowerCase();
      const clip = (v === 'on' || v === '1' || v === 'true');
      host.setLayerClipping(id, clip);
      host.sendConsoleLog(`layer [${id}] clipping: ${clip ? 'on' : 'off'}`);
    }
  },
  { pat: "layer clip $id$int $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer clipping $id$int $val").run(m, host) },
  { pat: "layer clip $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer clipping $val").run(m, host) },
  { pat: "clipping $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer clipping $val").run(m, host) },
  { pat: "clip $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer clipping $val").run(m, host) },

  // Layer Blend Mode
  {
    pat: "layer blend $id$int $mode",
    run: (m, host) => {
      const id = parseInt(m.id, 10);
      host.setLayerBlendMode(id, m.mode);
      const bNames = ['normal', 'multiply', 'screen', 'overlay', 'dodge', 'add'];
      const bm = host.getLayerBlendMode(id);
      host.sendConsoleLog(`layer [${id}] blend mode: ${bNames[bm] || bm}`);
    }
  },
  {
    pat: "layer blend $mode",
    run: (m, host) => {
      const id = host.canvasActor?.exports?.get_active_layer?.() ?? 0;
      host.setLayerBlendMode(id, m.mode);
      const bNames = ['normal', 'multiply', 'screen', 'overlay', 'dodge', 'add'];
      const bm = host.getLayerBlendMode(id);
      host.sendConsoleLog(`layer [${id}] blend mode: ${bNames[bm] || bm}`);
    }
  },
  { pat: "layer blend_mode $id$int $mode", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer blend $id$int $mode").run(m, host) },
  { pat: "layer blend_mode $mode", run: (m, host) => COMMAND_RULES.find(r => r.pat === "layer blend $mode").run(m, host) },

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
    pat: "group nest $group $parent",
    run: (m, host) => {
      const ok = host.nestGroup(m.group, m.parent);
      if (ok) host.sendConsoleLog(`nested group '${m.group}' under '${m.parent}'`);
      else host.sendConsoleLog(`err: could not nest group '${m.group}'`, 0xFFFF5555);
    }
  },
  {
    pat: "group move up $group",
    run: (m, host) => {
      const ok = host.moveGroup(m.group, 'up');
      if (ok) host.sendConsoleLog(`moved group '${m.group}' up`);
      else host.sendConsoleLog(`err: could not move group '${m.group}'`, 0xFFFF5555);
    }
  },
  {
    pat: "group move down $group",
    run: (m, host) => {
      const ok = host.moveGroup(m.group, 'down');
      if (ok) host.sendConsoleLog(`moved group '${m.group}' down`);
      else host.sendConsoleLog(`err: could not move group '${m.group}'`, 0xFFFF5555);
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

  // History Inspection and Clear
  {
    pat: "history limit $limit$int",
    run: (m, host) => {
      const limit = parseInt(m.limit, 10);
      if (limit < 0 || isNaN(limit)) {
        host.sendConsoleLog("Invalid history limit (must be >= 0)", 0xFFFF5555);
        return;
      }
      host.maxUndoSteps = limit;
      if (limit > 0) {
        while (host.undoStack.length > host.maxUndoSteps) {
          host.undoStack.shift();
        }
        host.sendConsoleLog(`History limit set to ${limit} steps`);
      } else {
        host.sendConsoleLog(`History limit set to unlimited (infinite)`);
      }
    }
  },
  {
    pat: "history limit unlimited",
    run: (m, host) => {
      host.maxUndoSteps = 0;
      host.sendConsoleLog(`History limit set to unlimited (infinite)`);
    }
  },
  {
    pat: "history limit inf",
    run: (m, host) => {
      host.maxUndoSteps = 0;
      host.sendConsoleLog(`History limit set to unlimited (infinite)`);
    }
  },
  {
    pat: "set max_undo unlimited",
    run: (m, host) => {
      host.maxUndoSteps = 0;
      host.sendConsoleLog(`History limit set to unlimited (infinite)`);
    }
  },
  {
    pat: "set max_undo $limit$int",
    run: (m, host) => {
      COMMAND_RULES.find(r => r.pat === "history limit $limit$int").run(m, host);
    }
  },
  {
    pat: "set history_limit $limit$int",
    run: (m, host) => {
      COMMAND_RULES.find(r => r.pat === "history limit $limit$int").run(m, host);
    }
  },
  {
    pat: "history clear",
    run: (m, host) => {
      host.undoStack = [];
      host.redoStack = [];
      host.sendConsoleLog("History stack cleared");
    }
  },
  {
    pat: "history",
    run: (m, host) => {
      host.sendConsoleLog(`--- History Stack ---`);
      host.sendConsoleLog(`Undo stack (${host.undoStack.length} items):`);
      if (host.undoStack.length === 0) {
        host.sendConsoleLog(`  (empty)`);
      } else {
        host.undoStack.forEach((item, idx) => {
          host.sendConsoleLog(`  [${idx + 1}] ${item.action} (layer ${item.layerIdx})`);
        });
      }
      host.sendConsoleLog(`Redo stack (${host.redoStack.length} items):`);
      if (host.redoStack.length === 0) {
        host.sendConsoleLog(`  (empty)`);
      } else {
        host.redoStack.forEach((item, idx) => {
          host.sendConsoleLog(`  [${idx + 1}] ${item.action} (layer ${item.layerIdx})`);
        });
      }
    }
  },

  // Viewport / Canvas Flip Horizontal
  {
    pat: "flip canvas",
    run: (m, host) => {
      const flipped = host.toggleFlipH();
      host.sendConsoleLog(`canvas flip horizontal: ${flipped ? 'on' : 'off'}`);
    }
  },
  { pat: "flip horizontal", run: (m, host) => COMMAND_RULES.find(r => r.pat === "flip canvas").run(m, host) },
  { pat: "flip h", run: (m, host) => COMMAND_RULES.find(r => r.pat === "flip canvas").run(m, host) },
  { pat: "view flip", run: (m, host) => COMMAND_RULES.find(r => r.pat === "flip canvas").run(m, host) },
  { pat: "flip", run: (m, host) => COMMAND_RULES.find(r => r.pat === "flip canvas").run(m, host) },

  // Viewport / Canvas Flip Vertical
  {
    pat: "flip v",
    run: (m, host) => {
      const flipped = host.toggleFlipV();
      host.sendConsoleLog(`canvas flip vertical: ${flipped ? 'on' : 'off'}`);
    }
  },
  { pat: "flip vertical", run: (m, host) => COMMAND_RULES.find(r => r.pat === "flip v").run(m, host) },
  { pat: "view flip v", run: (m, host) => COMMAND_RULES.find(r => r.pat === "flip v").run(m, host) },

  // Viewport Flip Reset
  {
    pat: "flip reset",
    run: (m, host) => {
      host.setFlipH(false);
      host.setFlipV(false);
      host.sendConsoleLog('canvas flip reset: off');
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

  // Drawing Dab & Stroke by coordinates
  {
    pat: "brush $x$int $y$int",
    run: (m, host) => {
      const x = parseInt(m.x, 10), y = parseInt(m.y, 10);
      const isEraser = host.currentTool === 1 ? 1 : 0;
      host.sendStroke(x, y, x, y, 0, isEraser, host.currentColor);
      host.sendStroke(x, y, x, y, 2, isEraser, host.currentColor);
      host.sendConsoleLog(`brush dab at ${x},${y}`);
    }
  },
  {
    pat: "dab $x$int $y$int",
    run: (m, host) => {
      const x = parseInt(m.x, 10), y = parseInt(m.y, 10);
      const isEraser = host.currentTool === 1 ? 1 : 0;
      host.sendStroke(x, y, x, y, 0, isEraser, host.currentColor);
      host.sendStroke(x, y, x, y, 2, isEraser, host.currentColor);
      host.sendConsoleLog(`brush dab at ${x},${y}`);
    }
  },
  {
    pat: "stroke $x0$int $y0$int $x1$int $y1$int",
    run: (m, host) => {
      const x0 = parseInt(m.x0, 10), y0 = parseInt(m.y0, 10);
      const x1 = parseInt(m.x1, 10), y1 = parseInt(m.y1, 10);
      const isEraser = host.currentTool === 1 ? 1 : 0;
      host.sendStroke(x0, y0, x0, y0, 0, isEraser, host.currentColor);
      host.sendStroke(x1, y1, x0, y0, 1, isEraser, host.currentColor);
      host.sendStroke(x1, y1, x1, y1, 2, isEraser, host.currentColor);
      host.sendConsoleLog(`stroke from ${x0},${y0} to ${x1},${y1}`);
    }
  },

  // Eyedropper / Color Picker
  {
    pat: "pick $x$int $y$int",
    run: (m, host) => {
      const x = parseInt(m.x, 10), y = parseInt(m.y, 10);
      const hex = host.pickColor(x, y, true);
      if (hex) {
        host.sendConsoleLog(`picked color ${hex} at ${x},${y}`);
      }
    }
  },
  { pat: "picker $x$int $y$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "pick $x$int $y$int").run(m, host) },
  { pat: "eyedropper $x$int $y$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "pick $x$int $y$int").run(m, host) },

  // Modes & Shapes
  { pat: "set action_mode $mode", run: (m, host) => { host.setActionMode(m.mode); host.sendConsoleLog(`action mode set to ${host.actionMode}`); } },
  { pat: "set action mode $mode", run: (m, host) => { host.setActionMode(m.mode); host.sendConsoleLog(`action mode set to ${host.actionMode}`); } },
  { pat: "action_mode $mode", run: (m, host) => { host.setActionMode(m.mode); host.sendConsoleLog(`action mode set to ${host.actionMode}`); } },
  { pat: "action mode $mode", run: (m, host) => { host.setActionMode(m.mode); host.sendConsoleLog(`action mode set to ${host.actionMode}`); } },
  { pat: "set mode $mode", run: (m, host) => handleSetMode(host, m.mode) },
  { pat: "mode $mode", run: (m, host) => handleSetMode(host, m.mode) },
  { pat: "set tool $tool", run: (m, host) => handleSetTool(host, m.tool) },
  { pat: "tool $tool", run: (m, host) => handleSetTool(host, m.tool) },
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

  // Brush Presets, Parameters, and Dump
  {
    pat: "dump brush",
    run: (m, host) => {
      const script = host.dumpBrushScript();
      host.sendConsoleLog(script);
    }
  },
  { pat: "dump tool", run: (m, host) => COMMAND_RULES.find(r => r.pat === "dump brush").run(m, host) },
  { pat: "export brush", run: (m, host) => COMMAND_RULES.find(r => r.pat === "dump brush").run(m, host) },
  { pat: "export tool", run: (m, host) => COMMAND_RULES.find(r => r.pat === "dump brush").run(m, host) },
  { pat: "set brush $sub $val", run: (m, host) => handleBrushParamOrPreset(host, m.sub, m.val) },
  { pat: "brush $sub $val", run: (m, host) => handleBrushParamOrPreset(host, m.sub, m.val) },
  { pat: "set brush $preset", run: (m, host) => handleBrushParamOrPreset(host, m.preset, undefined) },
  { pat: "brush $preset", run: (m, host) => handleBrushParamOrPreset(host, m.preset, undefined) },
  {
    pat: "presets",
    run: (m, host) => {
      host.sendConsoleLog("--- Built-in Brush Presets ---");
      for (const [k, p] of Object.entries(BRUSH_PRESETS)) {
        if (p.name) host.sendConsoleLog(`  ${k.padEnd(14)} - ${p.name}: ${p.desc || ''}`);
      }
      if (host.customBrushPresets && Object.keys(host.customBrushPresets).length > 0) {
        host.sendConsoleLog("--- Custom Presets ---");
        for (const [k, p] of Object.entries(host.customBrushPresets)) {
          host.sendConsoleLog(`  ${k.padEnd(14)} - ${p.name || k}`);
        }
      }
    }
  },
  { pat: "list presets", run: (m, host) => COMMAND_RULES.find(r => r.pat === "presets").run(m, host) },
  {
    pat: "preset save $name",
    run: (m, host) => {
      if (!host.customBrushPresets) host.customBrushPresets = {};
      const name = m.name.toLowerCase().trim();
      host.customBrushPresets[name] = {
        name: m.name,
        ...JSON.parse(JSON.stringify(host.brushParams || {})),
        eraser: host.strokeIsEraser ? 1 : 0
      };
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('esenho_custom_brush_presets_v1', JSON.stringify(host.customBrushPresets)); } catch (_) {}
      }
      host.sendConsoleLog(`custom preset '${name}' saved`);
    }
  },
  {
    pat: "preset delete $name",
    run: (m, host) => {
      const name = m.name.toLowerCase().trim();
      if (host.customBrushPresets && host.customBrushPresets[name]) {
        delete host.customBrushPresets[name];
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('esenho_custom_brush_presets_v1', JSON.stringify(host.customBrushPresets)); } catch (_) {}
        }
        host.sendConsoleLog(`custom preset '${name}' deleted`);
      } else {
        host.sendConsoleLog(`err: custom preset '${name}' not found`, 0xFFFF5555);
      }
    }
  },
  { pat: "preset del $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "preset delete $name").run(m, host) },
  { pat: "preset $name", run: (m, host) => handleBrushParamOrPreset(host, m.name, undefined) },
  { pat: "set preset $name", run: (m, host) => handleBrushParamOrPreset(host, m.name, undefined) },
  {
    pat: "reset tool",
    run: (m, host) => {
      host.resetTool();
      host.sendConsoleLog("tool settings reset to defaults");
    }
  },
  { pat: "tool reset", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset tool").run(m, host) },
  { pat: "reset brush", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset tool").run(m, host) },
  { pat: "brush reset", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset tool").run(m, host) },

  // Direct Parameter Setters (e.g. set size 20, set hardness 100, set opacity 50, etc.)
  { pat: "midpoint $val", run: (m, host) => handleDirectParam(host, "midpoint", m.val) },
  { pat: "bezier $val", run: (m, host) => handleDirectParam(host, "bezier", m.val) },
  { pat: "bezier_midpoint $val", run: (m, host) => handleDirectParam(host, "bezier_midpoint", m.val) },
  { pat: "subpixel $val", run: (m, host) => handleDirectParam(host, "subpixel", m.val) },
  { pat: "depletion $val", run: (m, host) => handleDirectParam(host, "depletion", m.val) },
  { pat: "color_pickup $val", run: (m, host) => handleDirectParam(host, "color_pickup", m.val) },
  { pat: "pickup $val", run: (m, host) => handleDirectParam(host, "color_pickup", m.val) },
  { pat: "dual_shape $val", run: (m, host) => handleDirectParam(host, "dual_shape", m.val) },
  { pat: "dual_brush $val", run: (m, host) => handleDirectParam(host, "dual_shape", m.val) },
  { pat: "dual_size $val", run: (m, host) => handleDirectParam(host, "dual_size", m.val) },
  { pat: "dual_spacing $val", run: (m, host) => handleDirectParam(host, "dual_spacing", m.val) },
  { pat: "symmetry $val", run: (m, host) => handleDirectParam(host, "symmetry", m.val) },
  { pat: "mirror $val", run: (m, host) => handleDirectParam(host, "symmetry", m.val) },
  { pat: "stabilizer_mode $val", run: (m, host) => handleDirectParam(host, "stabilizer_mode", m.val) },
  { pat: "smooth_mode $val", run: (m, host) => handleDirectParam(host, "stabilizer_mode", m.val) },
  { pat: "string_length $val", run: (m, host) => handleDirectParam(host, "string_length", m.val) },
  { pat: "lazy_radius $val", run: (m, host) => handleDirectParam(host, "string_length", m.val) },
  { pat: "pulled_string $val", run: (m, host) => handleDirectParam(host, "string_length", m.val) },
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
  {
    pat: "set brush_outline $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      host.showBrushOutline = (v === 'on' || v === '1' || v === 'true' || v === 'yes');
      host.sendConsoleLog(`brush outline ${host.showBrushOutline ? 'enabled' : 'disabled'}`);
    }
  },
  { pat: "brush_outline $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set brush_outline $val").run(m, host) },
  { pat: "set outline $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set brush_outline $val").run(m, host) },
  { pat: "outline $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set brush_outline $val").run(m, host) },
  {
    pat: "outline",
    run: (m, host) => {
      host.showBrushOutline = !host.showBrushOutline;
      host.sendConsoleLog(`brush outline ${host.showBrushOutline ? 'enabled' : 'disabled'}`);
    }
  },
  {
    pat: "set viewport_filter $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      const on = (v === 'linear' || v === 'bilinear' || v === 'smooth' || v === 'on' || v === '1' || v === 'true');
      host.setViewportFiltering(on);
    }
  },
  { pat: "set viewport filter $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set viewport_filter $val").run(m, host) },
  { pat: "set filter_mode $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set viewport_filter $val").run(m, host) },
  { pat: "viewport_filter $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set viewport_filter $val").run(m, host) },
  { pat: "viewport filter $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set viewport_filter $val").run(m, host) },
  {
    pat: "toggle viewport_filter",
    run: (m, host) => {
      host.setViewportFiltering(!host.viewportFiltering);
    }
  },
  { pat: "toggle viewport filter", run: (m, host) => COMMAND_RULES.find(r => r.pat === "toggle viewport_filter").run(m, host) },
  {
    pat: "set touch_undo $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      host.enableTouchUndoRedo = (v === 'on' || v === '1' || v === 'true' || v === 'yes');
      host.sendConsoleLog(`touch undo/redo gestures ${host.enableTouchUndoRedo ? 'enabled' : 'disabled'}`);
    }
  },
  { pat: "touch_undo $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set touch_undo $val").run(m, host) },
  {
    pat: "set touch_eyedropper $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      host.enableTouchEyedropper = (v === 'on' || v === '1' || v === 'true' || v === 'yes');
      host.sendConsoleLog(`touch eyedropper gesture ${host.enableTouchEyedropper ? 'enabled' : 'disabled'}`);
    }
  },
  { pat: "touch_eyedropper $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set touch_eyedropper $val").run(m, host) },
  {
    pat: "set toolbar_scale $val",
    run: (m, host) => {
      let scale = parseFloat(m.val);
      if (isNaN(scale)) scale = 1.0;
      if (scale > 5) scale /= 100;
      scale = Math.max(0.4, Math.min(3.0, scale));
      if (typeof host.setFloatingToolbarScale === 'function') {
        host.setFloatingToolbarScale(scale);
      } else {
        host.floatingToolbarScale = scale;
      }
      host.sendConsoleLog(`floating toolbar scale set to ${(scale * 100).toFixed(0)}%`);
    }
  },
  { pat: "toolbar_scale $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set toolbar_scale $val").run(m, host) },
  {
    pat: "set touch_toolbar $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      const show = (v === 'on' || v === '1' || v === 'true' || v === 'yes' || v === 'show');
      if (typeof host.setFloatingToolbarVisible === 'function') {
        host.setFloatingToolbarVisible(show);
      } else {
        host.showFloatingToolbar = show;
      }
      host.sendConsoleLog(`floating toolbar ${show ? 'visible' : 'hidden'}`);
    }
  },
  { pat: "touch_toolbar $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set touch_toolbar $val").run(m, host) },
  {
    pat: "set dock_toolstrip $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      const show = (v === 'on' || v === '1' || v === 'true' || v === 'yes' || v === 'show');
      if (typeof host.setDockToolstripVisible === 'function') {
        host.setDockToolstripVisible(show);
      } else {
        host.showDockToolstrip = show;
      }
      host.sendConsoleLog(`bottom dock quick buttons ${show ? 'visible' : 'hidden'}`);
    }
  },
  { pat: "dock_toolstrip $val", run: (m, host) => COMMAND_RULES.find(r => r.pat === "set dock_toolstrip $val").run(m, host) },

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
  // Renderer Selection (GPU vs Software/CPU)
  {
    pat: "set renderer $val",
    run: (m, host) => {
      const mode = (m.val === 'cpu' || m.val === 'software' || m.val === 'canvas2d' || m.val === '2d') ? 'cpu' : 'gpu';
      host.renderMode = mode;
      if (typeof host.setRenderMode === 'function') host.setRenderMode(mode);
      host.sendConsoleLog(`renderer set to ${mode === 'cpu' ? 'software (2D CPU)' : 'gpu (WebGL 2)'}`);
    }
  },
  {
    pat: "renderer $val",
    run: (m, host) => {
      COMMAND_RULES.find(r => r.pat === "set renderer $val").run(m, host);
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

  // Image & Project I/O
  {
    pat: "save project $file",
    run: (m, host) => {
      const proj = host.exportProject(host.currentProjectName || m.file);
      if (!proj) {
        host.sendConsoleLog(`err: failed exporting project`, 0xFFFF5555);
        return;
      }
      if (typeof fs !== 'undefined' && fs.writeFileSync) {
        const name = m.file.endsWith('.esen') ? m.file : `${m.file}.esen`;
        fs.writeFileSync(name, JSON.stringify(proj, null, 2));
        host.sendConsoleLog(`project saved to '${name}'`);
      } else if (typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.exportEsenFile) {
        const res = EsenhoStore.exportEsenFile(proj, m.file);
        if (res.ok) host.sendConsoleLog(`project saved to '${res.filename}'`);
        else host.sendConsoleLog(`err: failed saving project`, 0xFFFF5555);
      }
    }
  },
  { pat: "save project", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run({ file: host.currentProjectName || "project.esen" }, host) },
  { pat: "export project $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run(m, host) },
  { pat: "export project", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run({ file: host.currentProjectName || "project.esen" }, host) },
  { pat: "save esen $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run(m, host) },
  { pat: "save esen", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run({ file: host.currentProjectName || "project.esen" }, host) },
  { pat: "export esen $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run(m, host) },
  { pat: "export esen", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save project $file").run({ file: host.currentProjectName || "project.esen" }, host) },
  { pat: "save png $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save canvas $file").run(m, host) },
  { pat: "save png", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save canvas $file").run({ file: host.currentProjectName ? `${host.currentProjectName}.png` : "drawing.png" }, host) },
  { pat: "export png $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save canvas $file").run(m, host) },
  { pat: "export png", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save canvas $file").run({ file: host.currentProjectName ? `${host.currentProjectName}.png` : "drawing.png" }, host) },
  {
    pat: "load project $file",
    run: (m, host) => {
      try {
        if (typeof fs !== 'undefined' && fs.readFileSync) {
          const raw = fs.readFileSync(m.file, 'utf-8');
          const proj = JSON.parse(raw);
          host.loadProject(proj);
          host.sendConsoleLog(`project '${proj.name || m.file}' loaded successfully`);
        } else {
          host.sendConsoleLog(`err: load project via file picker in browser`, 0xFFFF5555);
        }
      } catch (e) {
        host.sendConsoleLog(`err: failed loading project: ${e.message}`, 0xFFFF5555);
      }
    }
  },
  { pat: "open project $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "load project $file").run(m, host) },
  { pat: "import project $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "load project $file").run(m, host) },
  { pat: "import project", run: (m, host) => {
    if (typeof document !== 'undefined') {
      const fi = document.getElementById('ui-file-input');
      if (fi) { fi.click(); return; }
    }
    host.sendConsoleLog("err: specify file or use file picker", 0xFFFF5555);
  }},
  { pat: "import esen $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "load project $file").run(m, host) },
  { pat: "import esen", run: (m, host) => COMMAND_RULES.find(r => r.pat === "import project").run(m, host) },
  { pat: "import image $file $name", run: (m, host) => COMMAND_RULES.find(r => r.pat === "load image $file $name").run(m, host) },
  { pat: "import image $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "load image $file").run(m, host) },
  { pat: "import layer $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "load image $file").run(m, host) },
  { pat: "import $file", run: (m, host) => {
    if (m.file.toLowerCase().endsWith('.esen') || m.file.toLowerCase().endsWith('.json')) {
      return COMMAND_RULES.find(r => r.pat === "load project $file").run(m, host);
    }
    return COMMAND_RULES.find(r => r.pat === "load image $file").run(m, host);
  }},
  { pat: "import", run: (m, host) => {
    if (typeof document !== 'undefined') {
      const fi = document.getElementById('ui-file-input');
      if (fi) { fi.click(); return; }
    }
    host.sendConsoleLog("err: specify file or use file picker", 0xFFFF5555);
  }},

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
  { pat: "export canvas $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save canvas $file").run(m, host) },
  { pat: "export layer $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save layer $file").run(m, host) },
  { pat: "export $file", run: (m, host) => COMMAND_RULES.find(r => r.pat === "save $file").run(m, host) },
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
      if (host.brushParams) {
        const toHex = (n) => n.toString(16).padStart(2, '0');
        host.brushParams.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
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
        if (host.brushParams) host.brushParams.color = m.col;
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
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_line(parseInt(m.x0, 10), parseInt(m.y0, 10), parseInt(m.x1, 10), parseInt(m.y1, 10), host.currentColor);
      });
      host.sendConsoleLog(`drew line from (${m.x0},${m.y0}) to (${m.x1},${m.y1})`);
    }
  },
  {
    pat: "draw rect $x$int $y$int $w$int $h$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, host.currentColor);
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_rect(parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10), col);
      });
      host.sendConsoleLog(`drew rect at (${m.x},${m.y}) size ${m.w}x${m.h}`);
    }
  },
  {
    pat: "draw rect $x$int $y$int $w$int $h$int",
    run: (m, host) => {
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_rect(parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10), host.currentColor);
      });
      host.sendConsoleLog(`drew rect at (${m.x},${m.y}) size ${m.w}x${m.h}`);
    }
  },
  {
    pat: "draw circle $cx$int $cy$int $r$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, host.currentColor);
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_circle(parseInt(m.cx, 10), parseInt(m.cy, 10), parseInt(m.r, 10), col);
      });
      host.sendConsoleLog(`drew circle at (${m.cx},${m.cy}) radius ${m.r}`);
    }
  },
  {
    pat: "draw circle $cx$int $cy$int $r$int",
    run: (m, host) => {
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_circle(parseInt(m.cx, 10), parseInt(m.cy, 10), parseInt(m.r, 10), host.currentColor);
      });
      host.sendConsoleLog(`drew circle at (${m.cx},${m.cy}) radius ${m.r}`);
    }
  },
  {
    pat: "draw grid $step$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, 0x44FFFFFF);
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_grid(parseInt(m.step, 10), col);
      });
      host.sendConsoleLog(`drew grid step ${m.step}`);
    }
  },
  {
    pat: "draw grid $step$int",
    run: (m, host) => {
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_grid(parseInt(m.step, 10), 0x44FFFFFF);
      });
      host.sendConsoleLog(`drew grid step ${m.step}`);
    }
  },
  {
    pat: "draw ellipse $cx$int $cy$int $rx$int $ry$int $col",
    run: (m, host) => {
      const col = parseColorString(m.col, host.currentColor);
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_ellipse(parseInt(m.cx, 10), parseInt(m.cy, 10), parseInt(m.rx, 10), parseInt(m.ry, 10), col);
      });
      host.sendConsoleLog(`drew ellipse at (${m.cx},${m.cy}) radii ${m.rx}x${m.ry}`);
    }
  },
  {
    pat: "draw ellipse $cx$int $cy$int $rx$int $ry$int",
    run: (m, host) => {
      host.executeWithSelectionClip(() => {
        host.canvasActor.exports.w_draw_ellipse(parseInt(m.cx, 10), parseInt(m.cy, 10), parseInt(m.rx, 10), parseInt(m.ry, 10), host.currentColor);
      });
      host.sendConsoleLog(`drew ellipse at (${m.cx},${m.cy}) radii ${m.rx}x${m.ry}`);
    }
  },

  // Layer Color / HSV Adjustments
  {
    pat: "adjust hsv $h$int $s$int $v$int",
    run: (m, host) => {
      host.adjustLayerHsv(parseInt(m.h, 10), parseInt(m.s, 10), parseInt(m.v, 10));
      host.sendConsoleLog(`layer adjusted HSV: hue ${m.h}°, sat ${m.s}%, val ${m.v}%`);
    }
  },
  { pat: "adjust hsl $h$int $s$int $v$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "adjust hsv $h$int $s$int $v$int").run(m, host) },
  {
    pat: "adjust hue $h$int",
    run: (m, host) => {
      host.adjustLayerHsv(parseInt(m.h, 10), 0, 0);
      host.sendConsoleLog(`layer adjusted hue: ${m.h}°`);
    }
  },
  {
    pat: "adjust sat $s$int",
    run: (m, host) => {
      host.adjustLayerHsv(0, parseInt(m.s, 10), 0);
      host.sendConsoleLog(`layer adjusted saturation: ${m.s}%`);
    }
  },
  { pat: "adjust saturation $s$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "adjust sat $s$int").run(m, host) },
  {
    pat: "adjust val $v$int",
    run: (m, host) => {
      host.adjustLayerHsv(0, 0, parseInt(m.v, 10));
      host.sendConsoleLog(`layer adjusted brightness/value: ${m.v}%`);
    }
  },
  { pat: "adjust brightness $v$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "adjust val $v$int").run(m, host) },
  { pat: "adjust light $v$int", run: (m, host) => COMMAND_RULES.find(r => r.pat === "adjust val $v$int").run(m, host) },

  // Selection & Clipboard Commands
  {
    pat: "select rect $x$int $y$int $w$int $h$int",
    run: (m, host) => {
      const sel = host.setSelection(parseInt(m.x, 10), parseInt(m.y, 10), parseInt(m.w, 10), parseInt(m.h, 10));
      host.sendConsoleLog(`selected rect (${sel.x},${sel.y}) size ${sel.w}x${sel.h}`);
    }
  },
  {
    pat: "select all",
    run: (m, host) => {
      const sel = host.selectAll();
      host.sendConsoleLog(`selected all (${sel.w}x${sel.h})`);
    }
  },
  {
    pat: "select none",
    run: (m, host) => {
      host.clearSelection();
      host.sendConsoleLog('selection cleared');
    }
  },
  { pat: "select clear", run: (m, host) => COMMAND_RULES.find(r => r.pat === "select none").run(m, host) },
  { pat: "deselect", run: (m, host) => COMMAND_RULES.find(r => r.pat === "select none").run(m, host) },
  {
    pat: "select invert",
    run: (m, host) => {
      const sel = host.invertSelection();
      host.sendConsoleLog(`selection inverted (${sel.w}x${sel.h})`);
    }
  },
  { pat: "selection invert", run: (m, host) => COMMAND_RULES.find(r => r.pat === "select invert").run(m, host) },
  { pat: "set select_invert", run: (m, host) => COMMAND_RULES.find(r => r.pat === "select invert").run(m, host) },
  {
    pat: "copy",
    run: (m, host) => {
      const cp = host.copySelection();
      if (cp) host.sendConsoleLog(`copied ${cp.width}x${cp.height} pixels to clipboard`);
      else host.sendConsoleLog('err: nothing to copy', 0xFFFF5555);
    }
  },
  {
    pat: "cut",
    run: (m, host) => {
      const cp = host.cutSelection();
      if (cp) host.sendConsoleLog(`cut ${cp.width}x${cp.height} pixels to clipboard`);
      else host.sendConsoleLog('err: nothing to cut', 0xFFFF5555);
    }
  },
  {
    pat: "paste $x$int $y$int",
    run: (m, host) => {
      const ok = host.pasteClipboard(parseInt(m.x, 10), parseInt(m.y, 10));
      if (ok) host.sendConsoleLog(`pasted clipboard at (${m.x},${m.y})`);
      else host.sendConsoleLog('err: clipboard is empty', 0xFFFF5555);
    }
  },
  {
    pat: "paste",
    run: (m, host) => {
      const ok = host.pasteClipboard();
      if (ok) host.sendConsoleLog('pasted clipboard');
      else host.sendConsoleLog('err: clipboard is empty', 0xFFFF5555);
    }
  },

  // Lasso / Wand Select Mode Commands
  {
    pat: "select lasso",
    run: (m, host) => {
      host.currentTool = 0;
      host.setBrushParam('mode', 10);
      host.sendConsoleLog('switched to lasso selection mode');
    }
  },
  {
    pat: "select wand $tol$int",
    run: (m, host) => {
      host.wandTolerance = Math.max(0, parseInt(m.tol, 10));
      host.currentTool = 0;
      host.setBrushParam('mode', 11);
      host.sendConsoleLog(`switched to magic wand (tolerance ${host.wandTolerance})`);
    }
  },
  {
    pat: "select wand",
    run: (m, host) => {
      host.currentTool = 0;
      host.setBrushParam('mode', 11);
      host.sendConsoleLog(`switched to magic wand (tolerance ${host.wandTolerance})`);
    }
  },
  {
    pat: "wand tolerance $t$int",
    run: (m, host) => {
      host.wandTolerance = Math.max(0, parseInt(m.t, 10));
      host.sendConsoleLog(`wand tolerance set to ${host.wandTolerance}`);
    }
  },
  {
    pat: "select mode $m",
    run: (m, host) => {
      host.setSelectionMode(m.m);
      host.sendConsoleLog(`selection mode set to ${host.selectionMode}`);
    }
  },
  {
    pat: "selection mode $m",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "select mode $m").run(m, host)
  },
  {
    pat: "set select_mode $m",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "select mode $m").run(m, host)
  },
  {
    pat: "set selection_mode $m",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "select mode $m").run(m, host)
  },
  {
    pat: "wand adjacent $val",
    run: (m, host) => {
      const v = m.val.toLowerCase();
      host.wandAdjacent = (v === 'on' || v === 'true' || v === '1' || v === 'yes');
      host.sendConsoleLog(`wand adjacent set to ${host.wandAdjacent ? 'on' : 'off'}`);
    }
  },
  {
    pat: "select adjacent $val",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "wand adjacent $val").run(m, host)
  },
  {
    pat: "set wand_adjacent $val",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "wand adjacent $val").run(m, host)
  },
  {
    pat: "set adjacent $val",
    run: (m, host) => COMMAND_RULES.find(r => r.pat === "wand adjacent $val").run(m, host)
  },

  // Transform Commands (in-place selection and layer transform)
  {
    pat: "transform",
    run: (m, host) => {
      host.startTransform();
    }
  },
  {
    pat: "transform selection",
    run: (m, host) => {
      host.startTransform();
    }
  },
  {
    pat: "transform layer",
    run: (m, host) => {
      host.startTransform();
    }
  },
  {
    pat: "transform apply",
    run: (m, host) => {
      const ok = host.applyFloatTransform();
      if (!ok) host.sendConsoleLog('err: no active transform', 0xFFFF5555);
    }
  },
  {
    pat: "transform cancel",
    run: (m, host) => {
      host.cancelFloatTransform();
    }
  },
  {
    pat: "transform rotate $angle",
    run: (m, host) => {
      const deg = parseFloat(m.angle);
      if (isNaN(deg)) return;
      if (host.rotateFloatTransform(deg * Math.PI / 180)) {
        if (typeof bakeFtPreview === 'function') bakeFtPreview();
        else if (host.canvasActor?.exports?.force_composite) host.canvasActor.exports.force_composite();
        if (typeof markCanvasDirty === 'function') markCanvasDirty();
      }
    }
  },
  {
    pat: "transform flip h",
    run: (m, host) => {
      if (host.flipFloatTransformH()) {
        if (typeof bakeFtPreview === 'function') bakeFtPreview();
        else if (host.canvasActor?.exports?.force_composite) host.canvasActor.exports.force_composite();
        if (typeof markCanvasDirty === 'function') markCanvasDirty();
      }
    }
  },
  { pat: "transform flip horizontal", run: (m, host) => COMMAND_RULES.find(r => r.pat === "transform flip h").run(m, host) },
  {
    pat: "transform flip v",
    run: (m, host) => {
      if (host.flipFloatTransformV()) {
        if (typeof bakeFtPreview === 'function') bakeFtPreview();
        else if (host.canvasActor?.exports?.force_composite) host.canvasActor.exports.force_composite();
        if (typeof markCanvasDirty === 'function') markCanvasDirty();
      }
    }
  },
  { pat: "transform flip vertical", run: (m, host) => COMMAND_RULES.find(r => r.pat === "transform flip v").run(m, host) },
  {
    pat: "transform reset",
    run: (m, host) => {
      if (host.resetFloatTransform()) {
        if (typeof bakeFtPreview === 'function') bakeFtPreview();
        else if (host.canvasActor?.exports?.force_composite) host.canvasActor.exports.force_composite();
        if (typeof markCanvasDirty === 'function') markCanvasDirty();
      }
    }
  },

  // Cache Reset
  {
    pat: "reset cache",
    run: (m, host) => {
      host.sendConsoleLog('clearing cache and returning to launcher...');
      try {
        if (typeof localStorage !== 'undefined') localStorage.clear();
        if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
      } catch (_) {}
      const targetUrl = (typeof window !== 'undefined' && window.location) ? 'index.html' : null;
      if (typeof caches !== 'undefined') {
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).finally(() => {
          if (targetUrl) window.location.href = targetUrl;
        });
      } else if (targetUrl) {
        window.location.href = targetUrl;
      }
    }
  },
  { pat: "cache reset", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset cache").run(m, host) },
  { pat: "clear cache", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset cache").run(m, host) },

  // Data Reset (IndexedDB + LocalStorage + SessionStorage)
  {
    pat: "reset data",
    run: (m, host) => {
      host.sendConsoleLog('clearing all user data (IndexedDB + LocalStorage) and returning to launcher...');
      try {
        if (typeof localStorage !== 'undefined') localStorage.clear();
        if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
      } catch (_) {}
      const targetUrl = (typeof window !== 'undefined' && window.location) ? 'index.html' : null;
      if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
        try {
          const req = indexedDB.deleteDatabase('EsenhoDB');
          req.onsuccess = () => {
            if (targetUrl) window.location.href = targetUrl;
          };
          req.onerror = () => {
            if (targetUrl) window.location.href = targetUrl;
          };
          req.onblocked = () => {
            if (targetUrl) window.location.href = targetUrl;
          };
        } catch (_) {
          if (targetUrl) window.location.href = targetUrl;
        }
      } else if (targetUrl) {
        window.location.href = targetUrl;
      }
    }
  },
  { pat: "data reset", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset data").run(m, host) },
  { pat: "clear data", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset data").run(m, host) },

  // All Reset (Cache + IndexedDB + LocalStorage + SessionStorage)
  {
    pat: "reset all",
    run: (m, host) => {
      host.sendConsoleLog('clearing cache and all user data, returning to launcher...');
      try {
        if (typeof localStorage !== 'undefined') localStorage.clear();
        if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
      } catch (_) {}
      const targetUrl = (typeof window !== 'undefined' && window.location) ? 'index.html' : null;
      const doCacheDelete = () => {
        if (typeof caches !== 'undefined') {
          return caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
        }
        return Promise.resolve();
      };
      const doIdbDelete = () => {
        return new Promise((resolve) => {
          if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
            try {
              const req = indexedDB.deleteDatabase('EsenhoDB');
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            } catch (_) {
              resolve();
            }
          } else {
            resolve();
          }
        });
      };
      Promise.all([doCacheDelete(), doIdbDelete()]).finally(() => {
        if (targetUrl) window.location.href = targetUrl;
      });
    }
  },
  { pat: "all reset", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset all").run(m, host) },
  { pat: "clear all", run: (m, host) => COMMAND_RULES.find(r => r.pat === "reset all").run(m, host) }
];

/**
 * EsenhoScreenHost - Main Application State & Screen Host Actor.
 * Coordinates the SDL viewport window, user input, REPL commands,
 * Surface Canvas Actor, and dynamic WASM plugins.
 */
class EsenhoScreenHost {
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
    this.activeTexture = 'none';

    // Configurable Brush Parameters
    this.brushParams = {
      size: 16,
      opacity: 100,
      hardness: 100,
      flow: 100,
      spacing: 5,
      roundness: 100,
      angle: 0,
      scatter: 0,
      tolerance: 32,
      smudge: 0,
      wetness: 0,
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
      dab_blend: 0,
      symmetry: 0,
      subpixel: 0,
      depletion: 0,
      color_pickup: 0,
      dual_shape: -1,
      dual_size: 100,
      dual_spacing: 10,
      pressure_size: 1,
      pressure_flow: 1,
      tilt_angle: 1,
      buildup: 0,
      stabilizer_mode: 0,
      string_length: 30
    };

    // Canvas Viewport Flip
    this.flipH = false;
    this.flipV = false;

    // Selection & Clipboard
    this.selection = { active: false, type: 'rect', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
    this.clipboard = null;
    this.floatingTransform = null; // { layerId, originLayerId, pixels, width, height, originX, originY, tx, ty, scaleX, scaleY, rotation, skewX, locked }
    this.wandTolerance = 30; // default magic wand color tolerance
    this.selectionMode = 'replace'; // 'replace' | 'add' | 'sub' | 'intersect'
    this.wandAdjacent = true; // default: contiguous / adjacent pixels enabled
    this.actionMode = 'draw'; // 'draw' | 'erase' | 'select' (global action mode)
    this.viewportFiltering = false; // false = Nearest (Pixel Art / Crisp), true = Bilinear / Smooth

    // Undo / Redo History
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoSteps = 25;

    // UI Scale / DPI adaptation
    this.uiScale = 'auto';
    this.onUiScaleChange = null;

    // Layer Groups / Folders & Hierarchy Tree
    this.layerGroups = new Map(); // id -> { id, name, collapsed: boolean, visible: boolean, parentId: string|null, children: [], layerIds: [] }
    this.layerTree = [];          // root list: Array<{ type: 'layer' | 'group', id: number | string }>
    this.layerNames = new Map();  // layerId -> custom name
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
    const pixelsCopy = raw.slice();

    this.undoStack.push({
      action,
      layerIdx,
      width: w,
      height: h,
      pixels: pixelsCopy
    });

    if (this.maxUndoSteps > 0 && this.undoStack.length > this.maxUndoSteps) {
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
      const currentPixels = raw.slice();

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
      const currentPixels = raw.slice();

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
   * Sets floating toolbar scale preference.
   */
  setFloatingToolbarScale(val) {
    this.floatingToolbarScale = val;
    if (typeof this.onFloatingToolbarScaleChange === 'function') {
      this.onFloatingToolbarScaleChange(val);
    }
  }

  /**
   * Sets floating toolbar visibility.
   */
  setFloatingToolbarVisible(show) {
    this.showFloatingToolbar = show;
    if (typeof this.onFloatingToolbarVisibleChange === 'function') {
      this.onFloatingToolbarVisibleChange(show);
    }
  }

  /**
   * Sets bottom dock toolstrip visibility.
   */
  setDockToolstripVisible(show) {
    this.showDockToolstrip = show;
    if (typeof this.onDockToolstripVisibleChange === 'function') {
      this.onDockToolstripVisibleChange(show);
    }
  }

  /**
   * Moves a layer up in the stacking order.
   */
  moveLayerUp(id) {
    if (!this.canvasActor?.exports?.w_layer_move_up) return false;
    this.ensureTreeIntegrity();
    const findAndMoveUp = (list) => {
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        if (node.type === 'layer' && node.id === id) {
          if (i > 0) {
            const tmp = list[i - 1];
            list[i - 1] = list[i];
            list[i] = tmp;
            return true;
          }
          return false;
        }
        if (node.type === 'group') {
          const grp = this.layerGroups.get(node.id);
          if (grp && grp.children && findAndMoveUp(grp.children)) {
            grp.layerIds = grp.children.filter(c => c.type === 'layer').map(c => c.id);
            return true;
          }
        }
      }
      return false;
    };
    const movedInTree = findAndMoveUp(this.layerTree);
    if (movedInTree) {
      this.syncWasmLayerOrderFromTree();
      this.pushUndoSnapshot('layer move');
      return true;
    }
    this.pushUndoSnapshot('layer move');
    const res = this.canvasActor.exports.w_layer_move_up(id) === 1;
    this.ensureTreeIntegrity();
    return res;
  }

  /**
   * Moves a layer down in the stacking order.
   */
  moveLayerDown(id) {
    if (!this.canvasActor?.exports?.w_layer_move_down) return false;
    this.ensureTreeIntegrity();
    const findAndMoveDown = (list) => {
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        if (node.type === 'layer' && node.id === id) {
          if (i < list.length - 1) {
            const tmp = list[i + 1];
            list[i + 1] = list[i];
            list[i] = tmp;
            return true;
          }
          return false;
        }
        if (node.type === 'group') {
          const grp = this.layerGroups.get(node.id);
          if (grp && grp.children && findAndMoveDown(grp.children)) {
            grp.layerIds = grp.children.filter(c => c.type === 'layer').map(c => c.id);
            return true;
          }
        }
      }
      return false;
    };
    const movedInTree = findAndMoveDown(this.layerTree);
    if (movedInTree) {
      this.syncWasmLayerOrderFromTree();
      this.pushUndoSnapshot('layer move');
      return true;
    }
    this.pushUndoSnapshot('layer move');
    const res = this.canvasActor.exports.w_layer_move_down(id) === 1;
    this.ensureTreeIntegrity();
    return res;
  }

  /**
   * Merges a layer down onto the layer below it in stacking order.
   */
  mergeLayerDown(id) {
    if (!this.canvasActor?.exports?.w_layer_merge_down) return -1;
    this.pushUndoSnapshot('merge down');
    const res = this.canvasActor.exports.w_layer_merge_down(id);
    if (res >= 0) {
      this.ensureTreeIntegrity();
      this.syncWasmLayerOrderFromTree();
    }
    return res;
  }

  /**
   * Sets alpha lock for a layer (prevents modifications to transparent pixels).
   */
  setLayerAlphaLock(id, locked) {
    if (!this.canvasActor?.exports?.w_layer_set_alpha_lock) return false;
    return this.canvasActor.exports.w_layer_set_alpha_lock(id, locked ? 1 : 0) === 1;
  }

  /**
   * Gets alpha lock status of a layer.
   */
  getLayerAlphaLock(id) {
    if (!this.canvasActor?.exports?.w_layer_get_alpha_lock) return 0;
    return this.canvasActor.exports.w_layer_get_alpha_lock(id);
  }

  /**
   * Sets clipping mask status for a layer (clips visibility to base layer below).
   */
  setLayerClipping(id, clipped) {
    if (!this.canvasActor?.exports?.w_layer_set_clipping) return false;
    const ok = this.canvasActor.exports.w_layer_set_clipping(id, clipped ? 1 : 0) === 1;
    if (ok && this.canvasActor.exports.w_force_composite) this.canvasActor.exports.w_force_composite();
    return ok;
  }

  /**
   * Gets clipping mask status of a layer.
   */
  getLayerClipping(id) {
    if (!this.canvasActor?.exports?.w_layer_get_clipping) return 0;
    return this.canvasActor.exports.w_layer_get_clipping(id);
  }

  /**
   * Sets blend mode for a layer (Normal, Multiply, Screen, Overlay, Dodge, Add).
   */
  setLayerBlendMode(id, mode) {
    if (!this.canvasActor?.exports?.w_layer_set_blend_mode) return false;
    let modeVal = mode;
    if (typeof mode === 'string') {
      const m = mode.toLowerCase();
      if (m === 'normal') modeVal = 0;
      else if (m === 'multiply') modeVal = 1;
      else if (m === 'screen') modeVal = 2;
      else if (m === 'overlay') modeVal = 3;
      else if (m === 'dodge' || m === 'color_dodge') modeVal = 4;
      else if (m === 'add' || m === 'linear_dodge') modeVal = 5;
      else modeVal = parseInt(mode, 10) || 0;
    }
    const ok = this.canvasActor.exports.w_layer_set_blend_mode(id, modeVal) === 1;
    if (ok && this.canvasActor.exports.w_force_composite) this.canvasActor.exports.w_force_composite();
    return ok;
  }

  /**
   * Gets blend mode of a layer.
   */
  getLayerBlendMode(id) {
    if (!this.canvasActor?.exports?.w_layer_get_blend_mode) return 0;
    return this.canvasActor.exports.w_layer_get_blend_mode(id);
  }

  /**
   * Sets viewport horizontal flip.
   */
  setFlipH(val) {
    this.flipH = !!val;
    return this.flipH;
  }

  /**
   * Toggles viewport horizontal flip.
   */
  toggleFlipH() {
    this.flipH = !this.flipH;
    return this.flipH;
  }

  /**
   * Sets viewport vertical flip.
   */
  setFlipV(val) {
    this.flipV = !!val;
    return this.flipV;
  }

  /**
   * Toggles viewport vertical flip.
   */
  toggleFlipV() {
    this.flipV = !this.flipV;
    return this.flipV;
  }

  /**
   * Sets rectangular selection bounds.
   */
  setSelectionMode(mode) {
    const m = String(mode).toLowerCase();
    if (m === 'add' || m === 'union' || m === '+') this.selectionMode = 'add';
    else if (m === 'sub' || m === 'subtract' || m === 'diff' || m === 'difference' || m === '-') this.selectionMode = 'sub';
    else if (m === 'intersect' || m === 'intersection' || m === 'cap') this.selectionMode = 'intersect';
    else this.selectionMode = 'replace';
    return this.selectionMode;
  }

  applySelectionOp(newSel, mode) {
    const m = (mode || this.selectionMode || 'replace').toLowerCase();
    const s1 = this.selection;
    const s2 = newSel;

    if (m === 'replace' || m === 'new') {
      if (!s2 || !s2.active || s2.w <= 0 || s2.h <= 0) {
        return this.clearSelection();
      }
      this.selection = s2;
      this.syncSelectionClip();
      return this.selection;
    }

    const isInside = (sel, gx, gy) => {
      if (!sel || !sel.active) return false;
      if (gx < sel.x || gx >= sel.x + sel.w || gy < sel.y || gy >= sel.y + sel.h) return false;
      if (!sel.mask) return true;
      return sel.mask[(gy - sel.y) * sel.w + (gx - sel.x)] === 1;
    };

    if (m === 'add' || m === 'union') {
      if (!s1 || !s1.active) {
        this.selection = (s2 && s2.active) ? s2 : { active: false, type: 'rect', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
        this.syncSelectionClip();
        return this.selection;
      }
      if (!s2 || !s2.active) {
        return this.selection;
      }
      const x0 = Math.min(s1.x, s2.x);
      const y0 = Math.min(s1.y, s2.y);
      const x1 = Math.max(s1.x + s1.w, s2.x + s2.w);
      const y1 = Math.max(s1.y + s1.h, s2.y + s2.h);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw <= 0 || bh <= 0) return this.clearSelection();

      const tempMask = new Uint8Array(bw * bh);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let count = 0;
      for (let y = 0; y < bh; y++) {
        const gy = y0 + y;
        const row = y * bw;
        for (let x = 0; x < bw; x++) {
          const gx = x0 + x;
          if (isInside(s1, gx, gy) || isInside(s2, gx, gy)) {
            tempMask[row + x] = 1;
            count++;
            if (gx < minX) minX = gx;
            if (gx > maxX) maxX = gx;
            if (gy < minY) minY = gy;
            if (gy > maxY) maxY = gy;
          }
        }
      }
      if (count === 0) return this.clearSelection();
      const finalW = maxX - minX + 1;
      const finalH = maxY - minY + 1;
      if (count === finalW * finalH) {
        this.selection = { active: true, type: 'rect', x: minX, y: minY, w: finalW, h: finalH, mask: null, points: null };
      } else {
        const finalMask = new Uint8Array(finalW * finalH);
        for (let y = minY; y <= maxY; y++) {
          const srcRow = (y - y0) * bw;
          const dstRow = (y - minY) * finalW;
          for (let x = minX; x <= maxX; x++) {
            if (tempMask[srcRow + (x - x0)]) finalMask[dstRow + (x - minX)] = 1;
          }
        }
        this.selection = { active: true, type: 'lasso', x: minX, y: minY, w: finalW, h: finalH, mask: finalMask, points: null };
      }
      this.syncSelectionClip();
      return this.selection;
    }

    if (m === 'sub' || m === 'subtract' || m === 'diff' || m === 'difference') {
      if (!s1 || !s1.active) return this.clearSelection();
      if (!s2 || !s2.active) return this.selection;

      const x0 = s1.x, y0 = s1.y, bw = s1.w, bh = s1.h;
      const tempMask = new Uint8Array(bw * bh);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let count = 0;
      for (let y = 0; y < bh; y++) {
        const gy = y0 + y;
        const row = y * bw;
        for (let x = 0; x < bw; x++) {
          const gx = x0 + x;
          if (isInside(s1, gx, gy) && !isInside(s2, gx, gy)) {
            tempMask[row + x] = 1;
            count++;
            if (gx < minX) minX = gx;
            if (gx > maxX) maxX = gx;
            if (gy < minY) minY = gy;
            if (gy > maxY) maxY = gy;
          }
        }
      }
      if (count === 0) return this.clearSelection();
      const finalW = maxX - minX + 1;
      const finalH = maxY - minY + 1;
      if (count === finalW * finalH) {
        this.selection = { active: true, type: 'rect', x: minX, y: minY, w: finalW, h: finalH, mask: null, points: null };
      } else {
        const finalMask = new Uint8Array(finalW * finalH);
        for (let y = minY; y <= maxY; y++) {
          const srcRow = (y - y0) * bw;
          const dstRow = (y - minY) * finalW;
          for (let x = minX; x <= maxX; x++) {
            if (tempMask[srcRow + (x - x0)]) finalMask[dstRow + (x - minX)] = 1;
          }
        }
        this.selection = { active: true, type: 'lasso', x: minX, y: minY, w: finalW, h: finalH, mask: finalMask, points: null };
      }
      this.syncSelectionClip();
      return this.selection;
    }

    if (m === 'intersect' || m === 'intersection') {
      if (!s1 || !s1.active || !s2 || !s2.active) return this.clearSelection();

      const x0 = Math.max(s1.x, s2.x);
      const y0 = Math.max(s1.y, s2.y);
      const x1 = Math.min(s1.x + s1.w, s2.x + s2.w);
      const y1 = Math.min(s1.y + s1.h, s2.y + s2.h);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw <= 0 || bh <= 0) return this.clearSelection();

      const tempMask = new Uint8Array(bw * bh);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let count = 0;
      for (let y = 0; y < bh; y++) {
        const gy = y0 + y;
        const row = y * bw;
        for (let x = 0; x < bw; x++) {
          const gx = x0 + x;
          if (isInside(s1, gx, gy) && isInside(s2, gx, gy)) {
            tempMask[row + x] = 1;
            count++;
            if (gx < minX) minX = gx;
            if (gx > maxX) maxX = gx;
            if (gy < minY) minY = gy;
            if (gy > maxY) maxY = gy;
          }
        }
      }
      if (count === 0) return this.clearSelection();
      const finalW = maxX - minX + 1;
      const finalH = maxY - minY + 1;
      if (count === finalW * finalH) {
        this.selection = { active: true, type: 'rect', x: minX, y: minY, w: finalW, h: finalH, mask: null, points: null };
      } else {
        const finalMask = new Uint8Array(finalW * finalH);
        for (let y = minY; y <= maxY; y++) {
          const srcRow = (y - y0) * bw;
          const dstRow = (y - minY) * finalW;
          for (let x = minX; x <= maxX; x++) {
            if (tempMask[srcRow + (x - x0)]) finalMask[dstRow + (x - minX)] = 1;
          }
        }
        this.selection = { active: true, type: 'lasso', x: minX, y: minY, w: finalW, h: finalH, mask: finalMask, points: null };
      }
      this.syncSelectionClip();
      return this.selection;
    }

    this.selection = s2;
    this.syncSelectionClip();
    return this.selection;
  }

  /**
   * Sets global action mode: 'draw' | 'erase' | 'smudge' | 'select'.
   */
  setActionMode(mode) {
    const m = String(mode).toLowerCase();
    if (m === 'erase' || m === 'eraser') this.actionMode = 'erase';
    else if (m === 'smudge') this.actionMode = 'smudge';
    else if (m === 'select' || m === 'sel') this.actionMode = 'select';
    else this.actionMode = 'draw';
    return this.actionMode;
  }

  /**
   * Sets rectangular selection bounds.
   */
  setSelection(x, y, w, h, mode) {
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rw = Math.round(w);
    let rh = Math.round(h);
    if (rw < 0) { rx += rw; rw = -rw; }
    if (rh < 0) { ry += rh; rh = -rh; }
    const newSel = { active: rw > 0 && rh > 0, type: 'rect', x: rx, y: ry, w: rw, h: rh, mask: null, points: null };
    return this.applySelectionOp(newSel, mode || this.selectionMode || 'replace');
  }

  /**
   * Sets ellipse selection bounds.
   */
  setEllipseSelection(cx, cy, rx, ry, mode) {
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    const irx = Math.round(Math.abs(rx));
    const iry = Math.round(Math.abs(ry));
    if (irx <= 0 || iry <= 0) {
      const emptySel = { active: false, type: 'lasso', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
      return this.applySelectionOp(emptySel, mode || this.selectionMode || 'replace');
    }
    const cw = this.canvasActor?.exports?.get_canvas_width ? this.canvasActor.exports.get_canvas_width() : DOC_WIDTH;
    const ch = this.canvasActor?.exports?.get_canvas_height ? this.canvasActor.exports.get_canvas_height() : DOC_HEIGHT;

    const bx = Math.max(0, icx - irx);
    const by = Math.max(0, icy - iry);
    const bx2 = Math.min(cw - 1, icx + irx);
    const by2 = Math.min(ch - 1, icy + iry);
    const bw = bx2 - bx + 1;
    const bh = by2 - by + 1;
    if (bw <= 0 || bh <= 0) {
      const emptySel = { active: false, type: 'lasso', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
      return this.applySelectionOp(emptySel, mode || this.selectionMode || 'replace');
    }

    const mask = new Uint8Array(bw * bh);
    const rx2 = irx * irx;
    const ry2 = iry * iry;
    for (let py = 0; py < bh; py++) {
      const dy = (by + py) - icy;
      const dy2_rx2 = dy * dy * rx2;
      const row = py * bw;
      for (let px = 0; px < bw; px++) {
        const dx = (bx + px) - icx;
        if (dx * dx * ry2 + dy2_rx2 <= rx2 * ry2) {
          mask[row + px] = 1;
        }
      }
    }
    const newSel = { active: true, type: 'lasso', x: bx, y: by, w: bw, h: bh, mask, points: null };
    return this.applySelectionOp(newSel, mode || this.selectionMode || 'replace');
  }

  /**
   * Sets a freehand lasso selection from polygon points array [{x,y}...].
   * Builds a pixel-level bitmask using ray-cast point-in-polygon test.
   * Bounding box x/y/w/h also set for convenience.
   */
  setLassoSelection(points, mode) {
    if (!points || points.length < 3) {
      const emptySel = { active: false, type: 'lasso', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
      return this.applySelectionOp(emptySel, mode || this.selectionMode || 'replace');
    }
    const cw = this.canvasActor?.exports?.get_canvas_width ? this.canvasActor.exports.get_canvas_width() : 800;
    const ch = this.canvasActor?.exports?.get_canvas_height ? this.canvasActor.exports.get_canvas_height() : 1000;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const bx = Math.max(0, Math.floor(minX));
    const by = Math.max(0, Math.floor(minY));
    const bx2 = Math.min(cw - 1, Math.ceil(maxX));
    const by2 = Math.min(ch - 1, Math.ceil(maxY));
    const bw = bx2 - bx + 1;
    const bh = by2 - by + 1;
    if (bw <= 0 || bh <= 0) {
      const emptySel = { active: false, type: 'lasso', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
      return this.applySelectionOp(emptySel, mode || this.selectionMode || 'replace');
    }

    // Build bitmask: 1 = inside polygon (ray-cast)
    const mask = new Uint8Array(bw * bh);
    for (let py = 0; py < bh; py++) {
      const cy_p = by + py + 0.5;
      for (let px = 0; px < bw; px++) {
        const cx_p = bx + px + 0.5;
        let inside = false;
        const n = points.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = points[i].x, yi = points[i].y;
          const xj = points[j].x, yj = points[j].y;
          if (((yi > cy_p) !== (yj > cy_p)) &&
              (cx_p < (xj - xi) * (cy_p - yi) / (yj - yi) + xi)) {
            inside = !inside;
          }
        }
        if (inside) mask[py * bw + px] = 1;
      }
    }

    const newSel = { active: true, type: 'lasso', x: bx, y: by, w: bw, h: bh, mask, points: points.slice() };
    return this.applySelectionOp(newSel, mode || this.selectionMode || 'replace');
  }

  /**
   * Flood-fill (magic wand) selection from seed pixel (sx, sy) with color tolerance.
   * Supports contiguous (adjacent) and non-contiguous (global layer) modes.
   */
  wandSelect(sx, sy, tolerance, adjacent, mode) {
    if (!this.canvasActor?.exports?.w_layer_get_pixels) return this.selection;
    const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const lw = this.canvasActor.exports.w_layer_get_width(act);
    const lh = this.canvasActor.exports.w_layer_get_height(act);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
    if (!ptr || lw <= 0 || lh <= 0) return this.selection;

    const tol = (tolerance !== undefined) ? Math.max(0, tolerance) : (this.wandTolerance || 30);
    const adj = (adjacent !== undefined) ? Boolean(adjacent) : (this.wandAdjacent !== undefined ? this.wandAdjacent : true);
    const m = mode || this.selectionMode || 'replace';

    const ix = Math.round(sx), iy = Math.round(sy);
    if (ix < 0 || ix >= lw || iy < 0 || iy >= lh) return this.selection;

    const pixels = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    const seed = pixels[iy * lw + ix];
    const sr = seed & 0xFF, sg = (seed >> 8) & 0xFF, sb = (seed >> 16) & 0xFF, sa = (seed >> 24) & 0xFF;

    if (!adj) {
      // Global (non-contiguous) color selection across active layer
      let minX = lw, minY = lh, maxX = -1, maxY = -1;
      let count = 0;
      for (let y = 0; y < lh; y++) {
        const row = y * lw;
        for (let x = 0; x < lw; x++) {
          const p = pixels[row + x];
          const pr = p & 0xFF, pg = (p >> 8) & 0xFF, pb = (p >> 16) & 0xFF, pa = (p >> 24) & 0xFF;
          const dist = Math.sqrt((pr - sr) ** 2 + (pg - sg) ** 2 + (pb - sb) ** 2 + (pa - sa) ** 2);
          if (dist <= tol) {
            count++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (count === 0 || maxX < minX || maxY < minY) {
        const emptySel = { active: false, type: 'lasso', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
        return this.applySelectionOp(emptySel, m);
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const mask = new Uint8Array(bw * bh);
      for (let y = minY; y <= maxY; y++) {
        const row = y * lw;
        const maskRow = (y - minY) * bw;
        for (let x = minX; x <= maxX; x++) {
          const p = pixels[row + x];
          const pr = p & 0xFF, pg = (p >> 8) & 0xFF, pb = (p >> 16) & 0xFF, pa = (p >> 24) & 0xFF;
          const dist = Math.sqrt((pr - sr) ** 2 + (pg - sg) ** 2 + (pb - sb) ** 2 + (pa - sa) ** 2);
          if (dist <= tol) {
            mask[maskRow + (x - minX)] = 1;
          }
        }
      }
      const newSel = { active: true, type: 'lasso', x: minX, y: minY, w: bw, h: bh, mask, points: null };
      this.sendConsoleLog(`magic wand (global) selected ${count} pixels (${bw}x${bh})`);
      return this.applySelectionOp(newSel, m);
    }

    const visited = new Uint8Array(lw * lh);
    const queue = new Int32Array(lw * lh);
    queue[0] = iy * lw + ix;
    visited[iy * lw + ix] = 1;
    let head = 0, tail = 1;

    let minX = lw, minY = lh, maxX = -1, maxY = -1;
    let count = 0;

    while (head < tail) {
      const idx = queue[head++];
      const cx = idx % lw, cy = (idx / lw) | 0;

      const p = pixels[idx];
      const pr = p & 0xFF, pg = (p >> 8) & 0xFF, pb = (p >> 16) & 0xFF, pa = (p >> 24) & 0xFF;
      const dist = Math.sqrt((pr - sr) ** 2 + (pg - sg) ** 2 + (pb - sb) ** 2 + (pa - sa) ** 2);
      if (dist > tol) continue;

      count++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; queue[tail++] = idx - 1; }
      if (cx < lw - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; queue[tail++] = idx + 1; }
      if (cy > 0 && !visited[idx - lw]) { visited[idx - lw] = 1; queue[tail++] = idx - lw; }
      if (cy < lh - 1 && !visited[idx + lw]) { visited[idx + lw] = 1; queue[tail++] = idx + lw; }
    }

    if (count === 0 || maxX < minX || maxY < minY) {
      const emptySel = { active: false, type: 'lasso', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
      return this.applySelectionOp(emptySel, m);
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const mask = new Uint8Array(bw * bh);

    // Re-mark matched pixels inside tight bounding box
    for (let i = 0; i < head; i++) {
      const idx = queue[i];
      const cx = idx % lw, cy = (idx / lw) | 0;
      const p = pixels[idx];
      const pr = p & 0xFF, pg = (p >> 8) & 0xFF, pb = (p >> 16) & 0xFF, pa = (p >> 24) & 0xFF;
      const dist = Math.sqrt((pr - sr) ** 2 + (pg - sg) ** 2 + (pb - sb) ** 2 + (pa - sa) ** 2);
      if (dist <= tol) {
        mask[(cy - minY) * bw + (cx - minX)] = 1;
      }
    }

    const newSel = { active: true, type: 'lasso', x: minX, y: minY, w: bw, h: bh, mask, points: null };
    this.sendConsoleLog(`magic wand selected ${count} pixels (${bw}x${bh})`);
    return this.applySelectionOp(newSel, m);
  }

  /**
   * Clears active selection.
   */
  clearSelection() {
    this.selection = { active: false, type: 'rect', x: 0, y: 0, w: 0, h: 0, mask: null, points: null };
    this.syncSelectionClip();
    return this.selection;
  }

  /**
   * Selects the full active layer or document bounds.
   */
  selectAll() {
    const w = this.canvasActor?.exports?.get_canvas_width ? this.canvasActor.exports.get_canvas_width() : DOC_WIDTH;
    const h = this.canvasActor?.exports?.get_canvas_height ? this.canvasActor.exports.get_canvas_height() : DOC_HEIGHT;
    return this.setSelection(0, 0, w, h);
  }

  /**
   * Inverts active selection against document bounds.
   */
  invertSelection() {
    const w = this.canvasActor?.exports?.get_canvas_width ? this.canvasActor.exports.get_canvas_width() : DOC_WIDTH;
    const h = this.canvasActor?.exports?.get_canvas_height ? this.canvasActor.exports.get_canvas_height() : DOC_HEIGHT;
    if (!this.selection || !this.selection.active) {
      return this.selectAll();
    }
    const tempMask = new Uint8Array(w * h);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    const isInside = (sel, gx, gy) => {
      if (gx < sel.x || gx >= sel.x + sel.w || gy < sel.y || gy >= sel.y + sel.h) return false;
      if (!sel.mask) return true;
      return sel.mask[(gy - sel.y) * sel.w + (gx - sel.x)] === 1;
    };
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (!isInside(this.selection, x, y)) {
          tempMask[row + x] = 1;
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count === 0) return this.clearSelection();
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (count === bw * bh) {
      this.selection = { active: true, type: 'rect', x: minX, y: minY, w: bw, h: bh, mask: null, points: null };
    } else {
      const finalMask = new Uint8Array(bw * bh);
      for (let y = minY; y <= maxY; y++) {
        const srcRow = y * w;
        const dstRow = (y - minY) * bw;
        for (let x = minX; x <= maxX; x++) {
          if (tempMask[srcRow + x]) finalMask[dstRow + (x - minX)] = 1;
        }
      }
      this.selection = { active: true, type: 'lasso', x: minX, y: minY, w: bw, h: bh, mask: finalMask, points: null };
    }
    this.syncSelectionClip();
    return this.selection;
  }

  /**
   * Synchronizes active selection clipping parameters with canvas.wasm engine.
   */
  syncSelectionClip() {
    if (!this.canvasActor?.exports?.w_set_clip) return;
    if (this.selection && this.selection.active && this.selection.w > 0 && this.selection.h > 0) {
      const sel = this.selection;
      let hasMask = 0;
      if (sel.mask && this.canvasActor.exports.w_get_clip_mask_buffer) {
        const maskLen = sel.w * sel.h;
        const maskPtr = this.canvasActor.exports.w_get_clip_mask_buffer(maskLen);
        if (maskPtr) {
          new Uint8Array(this.canvasActor.memory.buffer, maskPtr, maskLen).set(sel.mask);
          hasMask = 1;
        }
      }
      this.canvasActor.exports.w_set_clip(1, sel.x, sel.y, sel.w, sel.h, hasMask);
    } else {
      this.canvasActor.exports.w_set_clip(0, 0, 0, 0, 0, 0);
    }
  }

  /**
   * Returns true if given pixel coordinate is clipped out by active selection.
   */
  isPixelClipped(x, y) {
    if (!this.selection || !this.selection.active) return false;
    const sel = this.selection;
    if (x < sel.x || x >= sel.x + sel.w || y < sel.y || y >= sel.y + sel.h) return true;
    if (sel.mask) {
      const idx = (y - sel.y) * sel.w + (x - sel.x);
      return !sel.mask[idx];
    }
    return false;
  }

  /**
   * Restores all pixels outside active selection from savedPixels back into active layer.
   * Ensures that drawing/filters/adjustments only affect pixels inside the selection.
   */
  _clipActiveLayerToSelection(savedPixels) {
    if (!this.selection?.active || !savedPixels || !this.canvasActor?.exports?.w_layer_get_pixels) return;
    const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const lw = this.canvasActor.exports.w_layer_get_width(act);
    const lh = this.canvasActor.exports.w_layer_get_height(act);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
    if (!ptr || lw <= 0 || lh <= 0) return;

    const cur = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    const sel = this.selection;
    const mask = sel.mask;
    const sx0 = Math.max(0, sel.x);
    const sy0 = Math.max(0, sel.y);
    const sx1 = Math.min(lw, sel.x + sel.w);
    const sy1 = Math.min(lh, sel.y + sel.h);

    for (let y = 0; y < lh; y++) {
      const rowOffset = y * lw;
      if (y < sy0 || y >= sy1) {
        // Entire row outside selection box
        cur.set(savedPixels.subarray(rowOffset, rowOffset + lw), rowOffset);
      } else {
        // Left margin outside selection
        if (sx0 > 0) {
          cur.set(savedPixels.subarray(rowOffset, rowOffset + sx0), rowOffset);
        }
        // Right margin outside selection
        if (sx1 < lw) {
          cur.set(savedPixels.subarray(rowOffset + sx1, rowOffset + lw), rowOffset + sx1);
        }
        // Inside selection bounding box: if lasso/wand mask present, check per-pixel bit
        if (mask) {
          const my = y - sel.y;
          const maskRow = my * sel.w;
          for (let x = sx0; x < sx1; x++) {
            const mx = x - sel.x;
            if (!mask[maskRow + mx]) {
              cur[rowOffset + x] = savedPixels[rowOffset + x];
            }
          }
        }
      }
    }
  }

  /**
   * Executes a drawing/modification action with selection clipping:
   * snapshots active layer pixels, runs action, then restores pixels outside selection.
   */
  executeWithSelectionClip(action) {
    let backup = null;
    if (this.selection?.active && this.canvasActor?.exports?.w_layer_get_pixels) {
      const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
      const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
      const lw = this.canvasActor.exports.w_layer_get_width(act);
      const lh = this.canvasActor.exports.w_layer_get_height(act);
      if (ptr && lw > 0 && lh > 0) {
        backup = new Uint32Array(new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh));
      }
    }
    action();
    if (backup) {
      this._clipActiveLayerToSelection(backup);
      if (this.canvasActor.exports.w_force_composite) this.canvasActor.exports.w_force_composite();
      else if (this.canvasActor.exports.force_composite) this.canvasActor.exports.force_composite();
    }
  }

  /**
   * Extracts pixels from active layer within selection into a JS buffer.
   * Applies lasso mask if active. Returns { pixels, width, height, originX, originY } or null.
   */
  _extractSelectionPixels() {
    if (!this.canvasActor?.exports?.w_layer_get_pixels) return null;
    const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const lw = this.canvasActor.exports.w_layer_get_width(act);
    const lh = this.canvasActor.exports.w_layer_get_height(act);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
    if (!ptr || lw <= 0 || lh <= 0) return null;

    let sx = 0, sy = 0, sw = lw, sh = lh;
    if (this.selection && this.selection.active && this.selection.w > 0 && this.selection.h > 0) {
      sx = Math.max(0, this.selection.x);
      sy = Math.max(0, this.selection.y);
      sw = Math.min(lw - sx, this.selection.w);
      sh = Math.min(lh - sy, this.selection.h);
    }
    if (sw <= 0 || sh <= 0) return null;

    const srcU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    const outPixels = new Uint32Array(sw * sh);
    const mask = (this.selection && this.selection.mask) ? this.selection.mask : null;
    for (let dy = 0; dy < sh; dy++) {
      const srcRowStart = (sy + dy) * lw + sx;
      const dstRowStart = dy * sw;
      for (let dx = 0; dx < sw; dx++) {
        const masked = mask && !mask[dy * sw + dx];
        outPixels[dstRowStart + dx] = masked ? 0 : srcU32[srcRowStart + dx];
      }
    }
    return { pixels: outPixels, width: sw, height: sh, originX: sx, originY: sy };
  }

  /**
   * Copies selection pixels directly into internal clipboard without starting floating transform.
   */
  copySelection() {
    const ex = this._extractSelectionPixels();
    if (!ex) return null;
    this.clipboard = { width: ex.width, height: ex.height, w: ex.width, h: ex.height, pixels: ex.pixels };
    return this.clipboard;
  }

  /**
   * Cuts selection pixels into internal clipboard and clears source region on active layer.
   */
  cutSelection() {
    if (!this.canvasActor?.exports?.w_layer_get_pixels) return null;
    const ex = this._extractSelectionPixels();
    if (!ex) return null;
    this.clipboard = { width: ex.width, height: ex.height, w: ex.width, h: ex.height, pixels: ex.pixels };

    this.pushUndoSnapshot('cut selection');
    const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const lw = this.canvasActor.exports.w_layer_get_width(act);
    const lh = this.canvasActor.exports.w_layer_get_height(act);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
    const srcU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);

    const sx = Math.max(0, this.selection.x);
    const sy = Math.max(0, this.selection.y);
    const sw = Math.min(lw - sx, this.selection.w);
    const sh = Math.min(lh - sy, this.selection.h);
    const mask = (this.selection && this.selection.mask) ? this.selection.mask : null;
    for (let dy = 0; dy < sh; dy++) {
      const rowStart = (sy + dy) * lw + sx;
      if (mask) {
        for (let dx = 0; dx < sw; dx++) {
          if (mask[dy * sw + dx]) srcU32[rowStart + dx] = 0;
        }
      } else {
        srcU32.fill(0, rowStart, rowStart + sw);
      }
    }
    if (this.canvasActor.exports.force_composite) this.canvasActor.exports.force_composite();
    return this.clipboard;
  }

  /**
   * Starts in-place freeform/perspective transformation on selection (or entire active layer if no selection).
   */
  startTransform() {
    if (!this.canvasActor?.exports?.w_layer_get_pixels) return false;
    const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const lw = this.canvasActor.exports.w_layer_get_width(act);
    const lh = this.canvasActor.exports.w_layer_get_height(act);

    const ex = this._extractSelectionPixels();
    if (ex) {
      this.pushUndoSnapshot('transform selection');
      const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
      const srcU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
      const sx = Math.max(0, this.selection.x);
      const sy = Math.max(0, this.selection.y);
      const sw = Math.min(lw - sx, this.selection.w);
      const sh = Math.min(lh - sy, this.selection.h);
      const mask = (this.selection && this.selection.mask) ? this.selection.mask : null;
      for (let dy = 0; dy < sh; dy++) {
        const rowStart = (sy + dy) * lw + sx;
        if (mask) {
          for (let dx = 0; dx < sw; dx++) {
            if (mask[dy * sw + dx]) srcU32[rowStart + dx] = 0;
          }
        } else {
          srcU32.fill(0, rowStart, rowStart + sw);
        }
      }
      this.clearSelection();
      this._createFloatingLayer(ex, true, true);
      return true;
    }

    const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
    if (!ptr || lw <= 0 || lh <= 0) return false;
    this.pushUndoSnapshot('transform layer');
    const srcU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    const pixCopy = new Uint32Array(srcU32);
    srcU32.fill(0);
    this._createFloatingLayer({ pixels: pixCopy, width: lw, height: lh, originX: 0, originY: 0 }, true, true);
    return true;
  }

  /**
   * Creates a temporary layer for handles/perspective preview.
   * @param {Object} ex - { pixels, width, height, originX, originY }
   * @param {boolean} fromCut - true if source was cleared
   * @param {boolean} inPlace - true if transformation bakes back into originLayerId
   */
  _createFloatingLayer(ex, fromCut = false, inPlace = false) {
    if (!this.canvasActor?.exports?.w_layer_add) return;
    const sourceLayerId = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const newId = this.canvasActor.exports.w_layer_add();
    if (newId < 0) return;

    if (this.canvasActor.exports.w_layer_move_up) {
      const orderCount = this.canvasActor.exports.w_layer_get_order_count
        ? this.canvasActor.exports.w_layer_get_order_count() : 64;
      for (let i = 0; i < orderCount; i++) {
        this.canvasActor.exports.w_layer_move_up(newId);
      }
    }

    const ptr = this.canvasActor.exports.w_layer_get_pixels(newId);
    if (ptr) {
      const lw = this.canvasActor.exports.w_layer_get_width(newId);
      const lh = this.canvasActor.exports.w_layer_get_height(newId);
      const tgtU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
      for (let dy = 0; dy < ex.height; dy++) {
        const ty = ex.originY + dy;
        if (ty < 0 || ty >= lh) continue;
        for (let dx = 0; dx < ex.width; dx++) {
          const tx = ex.originX + dx;
          if (tx < 0 || tx >= lw) continue;
          tgtU32[ty * lw + tx] = ex.pixels[dy * ex.width + dx];
        }
      }
    }

    if (this.canvasActor.exports.w_layer_select) this.canvasActor.exports.w_layer_select(newId);

    const ox2 = ex.originX, oy2 = ex.originY, ew = ex.width, eh = ex.height;
    this.floatingTransform = {
      layerId: newId,
      originLayerId: sourceLayerId,
      pixels: ex.pixels,
      width: ew,
      height: eh,
      originX: ox2,
      originY: oy2,
      corners: [
        { x: ox2,      y: oy2      }, // tl
        { x: ox2 + ew, y: oy2      }, // tr
        { x: ox2 + ew, y: oy2 + eh }, // br
        { x: ox2,      y: oy2 + eh }  // bl
      ],
      fromCut,
      inPlace
    };

    if (this.canvasActor.exports.force_composite) this.canvasActor.exports.force_composite();
    this.sendConsoleLog(`transform started on layer [${sourceLayerId}]`);
  }

  /**
   * Solves 8x8 linear system Ax = b using Gaussian elimination with partial pivoting.
   * Returns solution vector x (length 8) or null on failure.
   */
  _solveLinear8(A, b) {
    const n = 8;
    const aug = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      // Partial pivot
      let maxRow = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
      if (Math.abs(aug[col][col]) < 1e-14) return null;
      const pivot = aug[col][col];
      for (let c2 = col; c2 <= n; c2++) aug[col][c2] /= pivot;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = aug[r][col];
        for (let c2 = col; c2 <= n; c2++) aug[r][c2] -= f * aug[col][c2];
      }
    }
    return aug.map(row => row[n]);
  }

  /**
   * Computes 3x3 homography (row-major, 9 elements) mapping srcPts → dstPts.
   * Each pts array is [{x,y} × 4] in order [tl, tr, br, bl].
   * Source pts are the 4 corners of the source buffer (0,0)→(w,h).
   * Returns null if degenerate.
   */
  _computeHomography(srcPts, dstPts) {
    const n = 4;
    const A = [];
    const bv = [];
    for (let i = 0; i < n; i++) {
      const sx = srcPts[i].x, sy = srcPts[i].y;
      const dx = dstPts[i].x, dy = dstPts[i].y;
      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
      bv.push(dx);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
      bv.push(dy);
    }
    const h = this._solveLinear8(A, bv);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  /**
   * Applies a 3x3 homography matrix (9-elem row-major) to point (x,y).
   * Returns {x, y} in destination space.
   */
  _applyHomography(H, x, y) {
    const W = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / W, y: (H[3] * x + H[4] * y + H[5]) / W };
  }

  /**
   * Bakes the current floatingTransform into pixels.
   * Uses inverse perspective homography for correct per-pixel sampling.
   */
  applyFloatTransform() {
    const ft = this.floatingTransform;
    if (!ft || !this.canvasActor?.exports?.w_layer_get_pixels) return false;

    this.pushUndoSnapshot('transform apply');
    const lw = this.canvasActor.exports.w_layer_get_width(ft.layerId);
    const lh = this.canvasActor.exports.w_layer_get_height(ft.layerId);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(ft.layerId);
    if (!ptr || lw <= 0 || lh <= 0) return false;

    const tgtU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    tgtU32.fill(0);

    // Source corners (in source pixel space, 0-based)
    const srcPts = [
      { x: 0,        y: 0         }, // tl
      { x: ft.width, y: 0         }, // tr
      { x: ft.width, y: ft.height }, // br
      { x: 0,        y: ft.height }  // bl
    ];
    // Destination corners (in doc/output pixel space)
    const dstPts = ft.corners;

    // Forward H: src → dst. Inverse H: dst → src.
    const H_fwd = this._computeHomography(srcPts, dstPts);
    const H_inv = H_fwd ? this._computeHomography(dstPts, srcPts) : null;
    if (!H_inv) {
      // Fallback: direct copy at origin position
      for (let dy = 0; dy < ft.height; dy++) {
        const ty = ft.originY + dy;
        if (ty < 0 || ty >= lh) continue;
        for (let dx = 0; dx < ft.width; dx++) {
          const tx = ft.originX + dx;
          if (tx < 0 || tx >= lw) continue;
          tgtU32[ty * lw + tx] = ft.pixels[dy * ft.width + dx];
        }
      }
    } else {
      // Compute bounding box of destination quad to limit iteration
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of dstPts) {
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
      }
      const x0 = Math.max(0, Math.floor(minX)), y0 = Math.max(0, Math.floor(minY));
      const x1 = Math.min(lw - 1, Math.ceil(maxX)), y1 = Math.min(lh - 1, Math.ceil(maxY));

      for (let oy = y0; oy <= y1; oy++) {
        for (let ox = x0; ox <= x1; ox++) {
          const s = this._applyHomography(H_inv, ox + 0.5, oy + 0.5);
          const srcX = Math.round(s.x - 0.5);
          const srcY = Math.round(s.y - 0.5);
          if (srcX < 0 || srcX >= ft.width || srcY < 0 || srcY >= ft.height) continue;
          const sp = ft.pixels[srcY * ft.width + srcX];
          if (((sp >> 24) & 0xFF) === 0) continue;
          tgtU32[oy * lw + ox] = sp;
        }
      }
    }

    if (ft.inPlace && ft.originLayerId !== undefined && ft.originLayerId !== ft.layerId) {
      const origPtr = this.canvasActor.exports.w_layer_get_pixels(ft.originLayerId);
      if (origPtr) {
        const origLw = this.canvasActor.exports.w_layer_get_width(ft.originLayerId);
        const origLh = this.canvasActor.exports.w_layer_get_height(ft.originLayerId);
        const origU32 = new Uint32Array(this.canvasActor.memory.buffer, origPtr, origLw * origLh);
        for (let idx = 0; idx < origLw * origLh; idx++) {
          const sp = tgtU32[idx];
          if (((sp >> 24) & 0xFF) !== 0) {
            origU32[idx] = sp;
          }
        }
      }
      if (this.canvasActor.exports.w_layer_delete) {
        this.canvasActor.exports.w_layer_delete(ft.layerId);
      }
      if (this.canvasActor.exports.w_layer_select) {
        this.canvasActor.exports.w_layer_select(ft.originLayerId);
      }
    }

    this.floatingTransform = null;
    if (this.canvasActor.exports.force_composite) this.canvasActor.exports.force_composite();
    this.sendConsoleLog('transform applied');
    return true;
  }

  /**
   * Cancels float transform — discards temporary floating layer and restores origin layer.
   */
  cancelFloatTransform() {
    const ft = this.floatingTransform;
    if (!ft) return;
    if (ft.inPlace && ft.originLayerId !== undefined && ft.pixels) {
      const origPtr = this.canvasActor?.exports?.w_layer_get_pixels ? this.canvasActor.exports.w_layer_get_pixels(ft.originLayerId) : 0;
      if (origPtr) {
        const origLw = this.canvasActor.exports.w_layer_get_width(ft.originLayerId);
        const origLh = this.canvasActor.exports.w_layer_get_height(ft.originLayerId);
        const origU32 = new Uint32Array(this.canvasActor.memory.buffer, origPtr, origLw * origLh);
        for (let dy = 0; dy < ft.height; dy++) {
          const ty = ft.originY + dy;
          if (ty < 0 || ty >= origLh) continue;
          for (let dx = 0; dx < ft.width; dx++) {
            const tx = ft.originX + dx;
            if (tx < 0 || tx >= origLw) continue;
            origU32[ty * origLw + tx] = ft.pixels[dy * ft.width + dx];
          }
        }
      }
    }
    if (this.canvasActor?.exports?.w_layer_delete) {
      this.canvasActor.exports.w_layer_delete(ft.layerId);
    }
    if (this.canvasActor?.exports?.w_layer_select) {
      this.canvasActor.exports.w_layer_select(ft.originLayerId);
    }
    this.floatingTransform = null;
    if (this.canvasActor?.exports?.force_composite) this.canvasActor.exports.force_composite();
    this.sendConsoleLog('transform cancelled');
  }

  /**
   * Rotates active float transform quad by angleRad around its centroid.
   */
  rotateFloatTransform(angleRad) {
    const ft = this.floatingTransform;
    if (!ft || !ft.corners) return false;
    const c = ft.corners;
    const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
    const cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    for (let i = 0; i < 4; i++) {
      const dx = c[i].x - cx;
      const dy = c[i].y - cy;
      c[i].x = cx + dx * cosA - dy * sinA;
      c[i].y = cy + dx * sinA + dy * cosA;
    }
    this.sendConsoleLog(`transform rotated ${(angleRad * 180 / Math.PI).toFixed(1)}°`);
    return true;
  }

  /**
   * Flips active float transform quad horizontally.
   */
  flipFloatTransformH() {
    const ft = this.floatingTransform;
    if (!ft || !ft.corners) return false;
    const c = ft.corners;
    const orig = c.map(pt => ({ x: pt.x, y: pt.y }));
    c[0] = { x: orig[1].x, y: orig[1].y };
    c[1] = { x: orig[0].x, y: orig[0].y };
    c[2] = { x: orig[3].x, y: orig[3].y };
    c[3] = { x: orig[2].x, y: orig[2].y };
    this.sendConsoleLog('transform flipped horizontal');
    return true;
  }

  /**
   * Flips active float transform quad vertically.
   */
  flipFloatTransformV() {
    const ft = this.floatingTransform;
    if (!ft || !ft.corners) return false;
    const c = ft.corners;
    const orig = c.map(pt => ({ x: pt.x, y: pt.y }));
    c[0] = { x: orig[3].x, y: orig[3].y };
    c[1] = { x: orig[2].x, y: orig[2].y };
    c[2] = { x: orig[1].x, y: orig[1].y };
    c[3] = { x: orig[0].x, y: orig[0].y };
    this.sendConsoleLog('transform flipped vertical');
    return true;
  }

  /**
   * Resets active float transform quad to original bounding box.
   */
  resetFloatTransform() {
    const ft = this.floatingTransform;
    if (!ft || !ft.corners) return false;
    const ox = ft.originX, oy = ft.originY, w = ft.width, h = ft.height;
    ft.corners = [
      { x: ox,     y: oy     },
      { x: ox + w, y: oy     },
      { x: ox + w, y: oy + h },
      { x: ox,     y: oy + h }
    ];
    this.sendConsoleLog('transform reset');
    return true;
  }

  /**
   * Configures optional bilinear (smooth) vs nearest-neighbor (crisp) viewport filtering.
   */
  setViewportFiltering(enabled) {
    this.viewportFiltering = Boolean(enabled);
    if (this.gpuRenderer && typeof this.gpuRenderer.setFilterMode === 'function') {
      this.gpuRenderer.setFilterMode(this.viewportFiltering);
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('esenho_viewport_filter', this.viewportFiltering ? '1' : '0'); } catch (_) {}
    }
    this.sendConsoleLog(`viewport filtering: ${this.viewportFiltering ? 'bilinear (smooth)' : 'nearest (crisp)'}`);
    if (typeof this.requestRender === 'function') this.requestRender();
    else if (this.canvasActor?.exports?.force_composite) this.canvasActor.exports.force_composite();
  }

  /**
   * Pastes clipboard content onto active layer at (x, y).
   */
  pasteClipboard(dstX, dstY) {
    if (!this.clipboard || !this.clipboard.pixels || !this.canvasActor?.exports?.w_layer_get_pixels) return false;
    this.pushUndoSnapshot('paste');

    const act = this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 0;
    const lw = this.canvasActor.exports.w_layer_get_width(act);
    const lh = this.canvasActor.exports.w_layer_get_height(act);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(act);
    if (!ptr || lw <= 0 || lh <= 0) return false;

    let px = (dstX !== undefined) ? dstX : (this.selection.active ? this.selection.x : Math.round((lw - this.clipboard.width) / 2));
    let py = (dstY !== undefined) ? dstY : (this.selection.active ? this.selection.y : Math.round((lh - this.clipboard.height) / 2));

    const cw = this.clipboard.width;
    const ch = this.clipboard.height;
    const clipU32 = this.clipboard.pixels;
    const targetU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);

    for (let dy = 0; dy < ch; dy++) {
      const ty = py + dy;
      if (ty < 0 || ty >= lh) continue;
      for (let dx = 0; dx < cw; dx++) {
        const tx = px + dx;
        if (tx < 0 || tx >= lw) continue;
        const sp = clipU32[dy * cw + dx];
        const sa = (sp >> 24) & 0xFF;
        if (sa === 0) continue;
        const tidx = ty * lw + tx;
        if (sa === 255) {
          targetU32[tidx] = sp;
        } else {
          const dp = targetU32[tidx];
          const da = (dp >> 24) & 0xFF;
          const outA = sa + (da * (255 - sa)) / 255;
          const sr = sp & 0xFF, sg = (sp >> 8) & 0xFF, sb = (sp >> 16) & 0xFF;
          const dr = dp & 0xFF, dg = (dp >> 8) & 0xFF, db = (dp >> 16) & 0xFF;
          const outR = (sr * sa + dr * da * (255 - sa) / 255) / (outA || 1);
          const outG = (sg * sa + dg * da * (255 - sa) / 255) / (outA || 1);
          const outB = (sb * sa + db * da * (255 - sa) / 255) / (outA || 1);
          targetU32[tidx] = (Math.min(255, Math.round(outA)) << 24) |
                            (Math.min(255, Math.round(outB)) << 16) |
                            (Math.min(255, Math.round(outG)) << 8)  |
                            Math.min(255, Math.round(outR));
        }
      }
    }
    this.setSelection(px, py, cw, ch);
    if (this.canvasActor.exports.force_composite) this.canvasActor.exports.force_composite();
    return true;
  }

  /**
   * Adjusts active layer Hue, Saturation and Value/Lightness.
   */
  adjustLayerHsv(dHue = 0, dSat = 0, dVal = 0, layerId) {
    if (!this.canvasActor?.exports?.w_layer_adjust_hsv) return;
    this.pushUndoSnapshot('adjust hsv');
    const idx = (layerId !== undefined) ? layerId : -1;
    this.executeWithSelectionClip(() => {
      this.canvasActor.exports.w_layer_adjust_hsv(idx, Math.round(dHue), Math.round(dSat), Math.round(dVal));
    });
  }

  /**
   * Resets all tool/brush parameters to factory defaults.
   */
  resetTool() {
    this.currentTool = 0; // brush
    this.activeTexture = 'none';
    this.brushParams = {
      size: 16,
      opacity: 100,
      hardness: 100,
      flow: 100,
      spacing: 5,
      roundness: 100,
      angle: 0,
      scatter: 0,
      tolerance: 32,
      smudge: 0,
      wetness: 0,
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
      dab_blend: 0,
      symmetry: 0,
      subpixel: 0,
      depletion: 0,
      color_pickup: 0,
      dual_shape: -1,
      dual_size: 100,
      dual_spacing: 10,
      pressure_size: 1,
      pressure_flow: 1,
      tilt_angle: 1,
      buildup: 0,
      stabilizer_mode: 0,
      string_length: 30
    };
    if (this.canvasActor && this.canvasActor.exports) {
      if (typeof this.canvasActor.exports.w_brush_reset === 'function') {
        this.canvasActor.exports.w_brush_reset();
      }
      this.syncBrushParams();
      if (typeof this.canvasActor.exports.w_brush_set_param === 'function') {
        this.canvasActor.exports.w_brush_set_param(PARAM_IDS.tex_layer, -1);
        this.canvasActor.exports.w_brush_set_param(PARAM_IDS.shape, 0);
        this.canvasActor.exports.w_brush_set_param(PARAM_IDS.mode, 0);
        this.canvasActor.exports.w_brush_set_param(PARAM_IDS.texture_mode, 0);
        this.canvasActor.exports.w_brush_set_param(PARAM_IDS.dual_shape, -1);
      }
      this.setTexture('none');
      if (typeof this.canvasActor.exports.w_brush_set_symmetry === 'function') {
        this.canvasActor.exports.w_brush_set_symmetry(0);
      }
    }
  }

  /**
   * Returns a Set of all WASM IDs that belong to internal/procedural brush textures and shapes,
   * ensuring they are never swept into document layer trees or layer lists.
   */
  getTextureWasmIds() {
    const ids = new Set([0, 1, 2]); // Builtin brush tip masks
    if (this.textures) {
      for (const tex of this.textures.values()) {
        if (tex && typeof tex.wasmId === 'number' && tex.wasmId >= 0) {
          ids.add(tex.wasmId);
        }
      }
    }
    return ids;
  }

  /**
   * Synchronizes the layer tree data structure with the current WASM layers.
   * Ensures every active WASM layer is present in the tree and stale layers are removed.
   */
  ensureTreeIntegrity() {
    if (!this.layerTree) this.layerTree = [];
    if (!this.layerGroups) this.layerGroups = new Map();

    const orderCount = (this.canvasActor?.exports?.w_layer_get_order_count)
      ? this.canvasActor.exports.w_layer_get_order_count()
      : 0;

    const texIds = this.getTextureWasmIds();
    const activeWasmLayers = new Set();
    for (let p = 0; p < orderCount; p++) {
      const lid = this.canvasActor.exports.w_layer_get_order(p);
      if (lid >= 0 && !texIds.has(lid)) activeWasmLayers.add(lid);
    }

    const treeLayerIds = new Set();
    const cleanNodeList = (list, parentGroupId = null) => {
      const cleaned = [];
      for (const node of list) {
        if (node.type === 'layer') {
          if (!texIds.has(node.id) && (activeWasmLayers.size === 0 || activeWasmLayers.has(node.id))) {
            treeLayerIds.add(node.id);
            cleaned.push(node);
          }
        } else if (node.type === 'group') {
          const grp = this.layerGroups.get(node.id);
          if (grp) {
            grp.parentId = parentGroupId;
            grp.children = cleanNodeList(grp.children || [], grp.id);
            grp.layerIds = grp.children.filter(c => c.type === 'layer').map(c => c.id);
            cleaned.push(node);
          }
        }
      }
      return cleaned;
    };

    this.layerTree = cleanNodeList(this.layerTree, null);

    // If layerTree is completely empty, initialize it from WASM order top-to-bottom
    if (this.layerTree.length === 0 && orderCount > 0) {
      for (let p = orderCount - 1; p >= 0; p--) {
        const lid = this.canvasActor.exports.w_layer_get_order(p);
        if (lid >= 0 && !texIds.has(lid)) {
          this.layerTree.push({ type: 'layer', id: lid });
          treeLayerIds.add(lid);
        }
      }
      return;
    }

    // Insert any missing WASM layers at their relative stack position
    for (let p = 0; p < orderCount; p++) {
      const lid = this.canvasActor.exports.w_layer_get_order(p);
      if (lid >= 0 && !texIds.has(lid) && !treeLayerIds.has(lid)) {
        let inserted = false;
        if (p > 0) {
          const belowLid = this.canvasActor.exports.w_layer_get_order(p - 1);
          const insertBeforeInList = (list) => {
            for (let i = 0; i < list.length; i++) {
              if (list[i].type === 'layer' && list[i].id === belowLid) {
                list.splice(i, 0, { type: 'layer', id: lid });
                return true;
              }
              if (list[i].type === 'group') {
                const grp = this.layerGroups.get(list[i].id);
                if (grp && grp.children && insertBeforeInList(grp.children)) return true;
              }
            }
            return false;
          };
          inserted = insertBeforeInList(this.layerTree);
        }

        if (!inserted && p < orderCount - 1) {
          const aboveLid = this.canvasActor.exports.w_layer_get_order(p + 1);
          const insertAfterInList = (list) => {
            for (let i = 0; i < list.length; i++) {
              if (list[i].type === 'layer' && list[i].id === aboveLid) {
                list.splice(i + 1, 0, { type: 'layer', id: lid });
                return true;
              }
              if (list[i].type === 'group') {
                const grp = this.layerGroups.get(list[i].id);
                if (grp && grp.children && insertAfterInList(grp.children)) return true;
              }
            }
            return false;
          };
          inserted = insertAfterInList(this.layerTree);
        }

        if (!inserted) {
          this.layerTree.unshift({ type: 'layer', id: lid });
        }
        treeLayerIds.add(lid);
      }
    }
  }

  /**
   * Traverses the layer hierarchy from bottom to top to produce the exact WASM layer ordering array.
   */
  getFlattenedLayersFromTree() {
    this.ensureTreeIntegrity();
    const result = [];
    const traverseTopToBottom = (list) => {
      for (const node of list) {
        if (node.type === 'layer') {
          result.push(node.id);
        } else if (node.type === 'group') {
          const grp = this.layerGroups.get(node.id);
          if (grp && Array.isArray(grp.children)) {
            traverseTopToBottom(grp.children);
          }
        }
      }
    };
    traverseTopToBottom(this.layerTree);
    return result.slice().reverse();
  }

  /**
   * Synchronizes the WASM layer stack order to match the hierarchical tree.
   */
  syncWasmLayerOrderFromTree() {
    if (!this.canvasActor?.exports?.w_layer_get_order_count || !this.canvasActor?.exports?.w_layer_move_up) return;
    const targetOrder = this.getFlattenedLayersFromTree();
    const orderCount = this.canvasActor.exports.w_layer_get_order_count();
    if (targetOrder.length !== orderCount) return;

    for (let targetPos = 0; targetPos < targetOrder.length; targetPos++) {
      const targetId = targetOrder[targetPos];
      let curPos = -1;
      for (let p = 0; p < orderCount; p++) {
        if (this.canvasActor.exports.w_layer_get_order(p) === targetId) {
          curPos = p;
          break;
        }
      }
      if (curPos === -1) continue;
      while (curPos > targetPos) {
        this.canvasActor.exports.w_layer_move_down(targetId);
        curPos--;
      }
      while (curPos < targetPos) {
        this.canvasActor.exports.w_layer_move_up(targetId);
        curPos++;
      }
    }
  }

  /**
   * Reorders an item in the tree (drag-and-drop or programmatic reordering).
   * @param {'layer'|'group'} draggedType
   * @param {number|string} draggedId
   * @param {'layer'|'group'} targetType
   * @param {number|string} targetId
   * @param {'before'|'after'|'inside'} dropPos
   * @param {boolean} [pushUndo=true]
   */
  reorderTreeItem(draggedType, draggedId, targetType, targetId, dropPos, pushUndo = true) {
    this.ensureTreeIntegrity();
    if (draggedType === targetType && String(draggedId) === String(targetId)) return false;

    // Prevent nesting a group inside itself or inside any of its descendants
    if (draggedType === 'group' && targetType === 'group') {
      const isDescendant = (parentGid, searchGid) => {
        const pGrp = this.layerGroups.get(parentGid);
        if (!pGrp || !pGrp.children) return false;
        for (const child of pGrp.children) {
          if (child.type === 'group') {
            if (String(child.id) === String(searchGid)) return true;
            if (isDescendant(child.id, searchGid)) return true;
          }
        }
        return false;
      };
      if (String(draggedId) === String(targetId) || isDescendant(draggedId, targetId)) {
        return false;
      }
    }

    // 1. Remove dragged item from current location in tree
    let removedNode = null;
    const removeRecursive = (list) => {
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        if (node.type === draggedType && String(node.id) === String(draggedId)) {
          removedNode = list.splice(i, 1)[0];
          return true;
        }
        if (node.type === 'group') {
          const grp = this.layerGroups.get(node.id);
          if (grp && grp.children && removeRecursive(grp.children)) {
            grp.layerIds = grp.children.filter(c => c.type === 'layer').map(c => c.id);
            return true;
          }
        }
      }
      return false;
    };
    removeRecursive(this.layerTree);

    if (!removedNode) {
      removedNode = { type: draggedType, id: (draggedType === 'layer') ? parseInt(draggedId, 10) : String(draggedId) };
    }

    // 2. Insert into target location
    if (dropPos === 'inside' && targetType === 'group') {
      const targetGrp = this.layerGroups.get(targetId);
      if (targetGrp) {
        if (!targetGrp.children) targetGrp.children = [];
        targetGrp.children.unshift(removedNode);
        if (draggedType === 'group') {
          const dGrp = this.layerGroups.get(draggedId);
          if (dGrp) dGrp.parentId = targetGrp.id;
        }
        targetGrp.layerIds = targetGrp.children.filter(c => c.type === 'layer').map(c => c.id);
      } else {
        this.layerTree.push(removedNode);
      }
    } else {
      let inserted = false;
      const insertRecursive = (list, parentGid = null) => {
        for (let i = 0; i < list.length; i++) {
          const node = list[i];
          if (node.type === targetType && String(node.id) === String(targetId)) {
            const insertIdx = (dropPos === 'before') ? i : i + 1;
            list.splice(insertIdx, 0, removedNode);
            if (draggedType === 'group') {
              const dGrp = this.layerGroups.get(draggedId);
              if (dGrp) dGrp.parentId = parentGid;
            }
            inserted = true;
            return true;
          }
          if (node.type === 'group') {
            const grp = this.layerGroups.get(node.id);
            if (grp && grp.children && insertRecursive(grp.children, grp.id)) {
              grp.layerIds = grp.children.filter(c => c.type === 'layer').map(c => c.id);
              return true;
            }
          }
        }
        return false;
      };

      if (!insertRecursive(this.layerTree, null)) {
        this.layerTree.push(removedNode);
        if (draggedType === 'group') {
          const dGrp = this.layerGroups.get(draggedId);
          if (dGrp) dGrp.parentId = null;
        }
      }
    }

    this.ensureTreeIntegrity();
    this.syncWasmLayerOrderFromTree();
    if (pushUndo) this.pushUndoSnapshot('layer tree reorder');
    return true;
  }

  /**
   * Creates a new layer group / folder.
   */
  createGroup(name, parentGroupId = null) {
    this.ensureTreeIntegrity();
    const id = `group_${this.groupCounter++}`;
    const grp = {
      id,
      name: name || `Folder ${this.layerGroups.size + 1}`,
      collapsed: false,
      visible: true,
      parentId: parentGroupId || null,
      children: [],
      layerIds: []
    };
    this.layerGroups.set(id, grp);

    if (parentGroupId && this.layerGroups.has(parentGroupId)) {
      const parentGrp = this.layerGroups.get(parentGroupId);
      if (!parentGrp.children) parentGrp.children = [];
      parentGrp.children.unshift({ type: 'group', id });
    } else {
      this.layerTree.unshift({ type: 'group', id });
    }

    this.ensureTreeIntegrity();
    this.syncWasmLayerOrderFromTree();
    return grp;
  }

  /**
   * Adds a layer to a group / folder.
   */
  addLayerToGroup(groupIdOrName, layerId, pushUndo = true) {
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
    const lId = parseInt(layerId, 10);
    if (grp.children && grp.children.some(c => c.type === 'layer' && c.id === lId)) {
      return true;
    }
    return this.reorderTreeItem('layer', lId, 'group', grp.id, 'inside', pushUndo);
  }

  /**
   * Removes a layer from any group it belongs to.
   */
  removeLayerFromGroup(layerId) {
    this.ensureTreeIntegrity();
    const firstItem = this.layerTree[0];
    if (firstItem) {
      return this.reorderTreeItem('layer', layerId, firstItem.type, firstItem.id, 'before');
    }
    return this.reorderTreeItem('layer', layerId, 'layer', layerId, 'before');
  }

  /**
   * Moves a group up or down in its container stack.
   */
  moveGroup(groupIdOrName, direction) {
    let grp = this.layerGroups.get(groupIdOrName);
    if (!grp) {
      for (const g of this.layerGroups.values()) {
        if (g.name.toLowerCase() === groupIdOrName.toLowerCase()) { grp = g; break; }
      }
    }
    if (!grp) return false;

    const parentList = (grp.parentId && this.layerGroups.has(grp.parentId))
      ? this.layerGroups.get(grp.parentId).children
      : this.layerTree;

    const idx = parentList.findIndex(node => node.type === 'group' && node.id === grp.id);
    if (idx === -1) return false;

    if (direction === 'up' && idx > 0) {
      const prev = parentList[idx - 1];
      parentList[idx - 1] = parentList[idx];
      parentList[idx] = prev;
    } else if (direction === 'down' && idx < parentList.length - 1) {
      const next = parentList[idx + 1];
      parentList[idx + 1] = parentList[idx];
      parentList[idx] = next;
    } else {
      return false;
    }

    this.ensureTreeIntegrity();
    this.syncWasmLayerOrderFromTree();
    this.pushUndoSnapshot('group move');
    return true;
  }

  /**
   * Nests a group into a parent group, or moves it to root if parent is 'root'.
   */
  nestGroup(groupIdOrName, parentGroupIdOrName) {
    let grp = this.layerGroups.get(groupIdOrName);
    if (!grp) {
      for (const g of this.layerGroups.values()) {
        if (g.name.toLowerCase() === groupIdOrName.toLowerCase()) { grp = g; break; }
      }
    }
    if (!grp) return false;

    if (!parentGroupIdOrName || parentGroupIdOrName.toLowerCase() === 'root') {
      const firstItem = this.layerTree[0];
      if (firstItem) {
        return this.reorderTreeItem('group', grp.id, firstItem.type, firstItem.id, 'before');
      }
      return this.reorderTreeItem('group', grp.id, 'group', grp.id, 'before');
    }

    let parentGrp = this.layerGroups.get(parentGroupIdOrName);
    if (!parentGrp) {
      for (const g of this.layerGroups.values()) {
        if (g.name.toLowerCase() === parentGroupIdOrName.toLowerCase()) { parentGrp = g; break; }
      }
    }
    if (!parentGrp) return false;
    return this.reorderTreeItem('group', grp.id, 'group', parentGrp.id, 'inside');
  }

  /**
   * Toggles visibility of all layers in a group.
   */
  toggleGroup(groupIdOrName) {
    this.ensureTreeIntegrity();
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
    const setVisRecursive = (g, isVis) => {
      for (const child of (g.children || [])) {
        if (child.type === 'layer') {
          const curVis = this.canvasActor?.exports?.get_layer_visible ? this.canvasActor.exports.get_layer_visible(child.id) : 1;
          if ((isVis && !curVis) || (!isVis && curVis)) {
            this.canvasActor?.exports?.w_layer_toggle?.(child.id);
          }
        } else if (child.type === 'group') {
          const subG = this.layerGroups.get(child.id);
          if (subG) setVisRecursive(subG, isVis && subG.visible);
        }
      }
    };
    setVisRecursive(grp, grp.visible);
    return true;
  }

  /**
   * Deletes a group (does not delete child layers unless deleteLayers is true).
   */
  deleteGroup(groupIdOrName, deleteLayers = false) {
    this.ensureTreeIntegrity();
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
    const grp = this.layerGroups.get(grpKey);

    if (deleteLayers && this.canvasActor?.exports?.w_layer_delete) {
      const deleteContained = (g) => {
        for (const child of (g.children || [])) {
          if (child.type === 'layer') {
            this.canvasActor.exports.w_layer_delete(child.id);
          } else if (child.type === 'group') {
            const subG = this.layerGroups.get(child.id);
            if (subG) deleteContained(subG);
          }
        }
      };
      deleteContained(grp);
    }

    const removeGroupFromList = (list) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].type === 'group' && list[i].id === grp.id) {
          if (!deleteLayers && grp.children && grp.children.length > 0) {
            list.splice(i, 1, ...grp.children);
            for (const child of grp.children) {
              if (child.type === 'group') {
                const subG = this.layerGroups.get(child.id);
                if (subG) subG.parentId = grp.parentId;
              }
            }
          } else {
            list.splice(i, 1);
          }
          return true;
        }
        if (list[i].type === 'group') {
          const parentG = this.layerGroups.get(list[i].id);
          if (parentG && parentG.children && removeGroupFromList(parentG.children)) {
            parentG.layerIds = parentG.children.filter(c => c.type === 'layer').map(c => c.id);
            return true;
          }
        }
      }
      return false;
    };
    removeGroupFromList(this.layerTree);

    this.layerGroups.delete(grp.id);
    this.ensureTreeIntegrity();
    this.syncWasmLayerOrderFromTree();
    this.pushUndoSnapshot('delete group');
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
        else if (lower === 'picker' || lower === 'eyedropper' || lower === 'pipette') numericVal = 5;
        else numericVal = parseInt(val, 10) || 0;
      } else if (key === 'dual_shape' || key === 'dual_brush') {
        if (lower === 'none' || lower === 'off' || lower === '0' || lower === '-1') numericVal = -1;
        else if (lower === 'circle' || lower === 'round') numericVal = 0;
        else if (lower === 'square') numericVal = 1;
        else if (lower === 'chisel' || lower === 'flat') numericVal = 2;
        else numericVal = this.getTextureId(lower);
      } else if (key === 'dab_blend' || key === 'dab_blend_mode' || key === 'blend_mode') {
        const blendMap = { normal: 0, multiply: 1, screen: 2, overlay: 3, dodge: 4, color_dodge: 4, add: 5, linear_dodge: 5 };
        numericVal = blendMap[lower] !== undefined ? blendMap[lower] : (parseInt(val, 10) || 0);
      } else if (key === 'symmetry' || key === 'mirror') {
        if (lower === 'none' || lower === 'off' || lower === '0') numericVal = 0;
        else if (lower === 'v' || lower === 'vertical' || lower === '1') numericVal = 1;
        else if (lower === 'h' || lower === 'horizontal' || lower === '2') numericVal = 2;
        else if (lower === 'quad' || lower === 'both' || lower === 'quadrant' || lower === '3') numericVal = 3;
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
        grain_scale: 'texture_scale', grain_size: 'texture_scale',
        smooth: 'smoothing', stabilizer: 'smoothing', stabilize: 'smoothing', stabilization: 'smoothing',
        stabilizer_mode: 'stabilizer_mode', smooth_mode: 'stabilizer_mode',
        string_length: 'string_length', lazy_radius: 'string_length', pulled_string: 'string_length',
        bezier: 'midpoint', bezier_midpoint: 'midpoint',
        tex_contrast: 'texture_contrast', grain_contrast: 'texture_contrast',
        taper: 'taper_in', taper_start: 'taper_in', taper_end: 'taper_out',
        flow_jitter: 'opacity_jitter', dab_blend_mode: 'dab_blend', blend_mode: 'dab_blend',
        dual_brush: 'dual_shape', paint_depletion: 'depletion', pickup: 'color_pickup',
        mirror: 'symmetry', stylus_size: 'pressure_size', stylus_flow: 'pressure_flow', stylus_tilt: 'tilt_angle',
        pressure_curve: 'pressure_curve', pressure_min: 'pressure_min', pressure_max: 'pressure_max',
        accumulate: 'buildup', build_up: 'buildup'
      };
      const canonKey = canonMap[key] || key;
      if (canonKey === 'stabilizer_mode') {
        const strVal = String(val).toLowerCase().trim();
        const modeNum = (strVal === '1' || strVal === 'pulled' || strVal === 'string' || strVal === 'leash') ? 1 : 0;
        this.brushParams.stabilizer_mode = modeNum;
      } else {
        this.brushParams[canonKey] = numericVal;
      }
      if (canonKey === 'texture_angle') this.brushParams.texture_rotate = numericVal;
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
    if (this._texturesRegistered) return;
    if (!this.canvasActor || typeof this.canvasActor.exports.w_texture_create !== 'function') return;
    this._texturesRegistered = true;
    for (const [name, tex] of this.textures.entries()) {
      if (tex.wasmId !== undefined && tex.wasmId >= 0) {
        continue;
      }
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
   * Creates a custom brush tip shape directly from a layer's contents.
   */
  createTipFromLayer(layerIdOrName, customName) {
    if (!this.canvasActor?.exports?.w_layer_get_pixels) return false;
    let lid = 0;
    if (layerIdOrName !== undefined && layerIdOrName !== null) {
      lid = typeof layerIdOrName === 'number' ? layerIdOrName : (this.getLayerId(layerIdOrName) ?? 0);
    } else if (this.canvasActor.exports.get_active_layer) {
      lid = this.canvasActor.exports.get_active_layer();
    }
    const lw = this.canvasActor.exports.w_layer_get_width(lid);
    const lh = this.canvasActor.exports.w_layer_get_height(lid);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(lid);
    if (!ptr || lw <= 0 || lh <= 0) return false;
    const srcU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    const buf = Buf.alloc(lw * lh * 4);
    new Uint8Array(buf.buffer, buf.byteOffset, lw * lh * 4).set(new Uint8Array(srcU32.buffer, srcU32.byteOffset, lw * lh * 4));
    const texName = (customName || `tip_layer_${lid}`).toLowerCase().replace(/\s+/g, '_');
    
    let wasmId = -1;
    if (this.canvasActor.exports.w_texture_create) {
      wasmId = this.canvasActor.exports.w_texture_create(lw, lh);
      if (wasmId >= 0) {
        const tptr = this.canvasActor.exports.w_texture_get_pixels(wasmId);
        if (tptr) new Uint8Array(this.canvasActor.memory.buffer, tptr, lw * lh * 4).set(buf);
      }
    }
    this.textures.set(texName, { width: lw, height: lh, data: buf, wasmId, category: 'shape' });
    if (wasmId >= 0) {
      this.setBrushParam('shape', wasmId);
    }
    this.sendConsoleLog(`custom tip [${texName}] created from layer ${lid}`);
    return true;
  }

  /**
   * Creates a custom brush tip shape directly from the current selection.
   */
  createTipFromSelection(customName) {
    const ex = this._extractSelectionPixels();
    if (!ex) return false;
    const buf = Buf.alloc(ex.width * ex.height * 4);
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).set(new Uint8Array(ex.pixels.buffer, ex.pixels.byteOffset, ex.pixels.byteLength));
    const texName = (customName || `tip_sel_${Date.now()}`).toLowerCase().replace(/\s+/g, '_');
    let wasmId = -1;
    if (this.canvasActor?.exports?.w_texture_create) {
      wasmId = this.canvasActor.exports.w_texture_create(ex.width, ex.height);
      if (wasmId >= 0) {
        const tptr = this.canvasActor.exports.w_texture_get_pixels(wasmId);
        if (tptr) new Uint8Array(this.canvasActor.memory.buffer, tptr, buf.byteLength).set(buf);
      }
    }
    this.textures.set(texName, { width: ex.width, height: ex.height, data: buf, wasmId, category: 'shape' });
    if (wasmId >= 0) {
      this.setBrushParam('shape', wasmId);
    }
    this.sendConsoleLog(`custom tip [${texName}] created from selection (${ex.width}x${ex.height})`);
    return true;
  }

  /**
   * Creates a custom grain texture directly from a layer's contents.
   */
  createGrainFromLayer(layerIdOrName, customName) {
    if (!this.canvasActor?.exports?.w_layer_get_pixels) return false;
    let lid = 0;
    if (layerIdOrName !== undefined && layerIdOrName !== null) {
      lid = typeof layerIdOrName === 'number' ? layerIdOrName : (this.getLayerId(layerIdOrName) ?? 0);
    } else if (this.canvasActor.exports.get_active_layer) {
      lid = this.canvasActor.exports.get_active_layer();
    }
    const lw = this.canvasActor.exports.w_layer_get_width(lid);
    const lh = this.canvasActor.exports.w_layer_get_height(lid);
    const ptr = this.canvasActor.exports.w_layer_get_pixels(lid);
    if (!ptr || lw <= 0 || lh <= 0) return false;
    const srcU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, lw * lh);
    const buf = Buf.alloc(lw * lh * 4);
    new Uint8Array(buf.buffer, buf.byteOffset, lw * lh * 4).set(new Uint8Array(srcU32.buffer, srcU32.byteOffset, lw * lh * 4));
    const texName = (customName || `grain_layer_${lid}`).toLowerCase().replace(/\s+/g, '_');
    
    let wasmId = -1;
    if (this.canvasActor.exports.w_texture_create) {
      wasmId = this.canvasActor.exports.w_texture_create(lw, lh);
      if (wasmId >= 0) {
        const tptr = this.canvasActor.exports.w_texture_get_pixels(wasmId);
        if (tptr) new Uint8Array(this.canvasActor.memory.buffer, tptr, lw * lh * 4).set(buf);
      }
    }
    this.textures.set(texName, { width: lw, height: lh, data: buf, wasmId, category: 'texture' });
    if (wasmId >= 0) {
      this.setTexture(texName);
    }
    this.sendConsoleLog(`custom grain [${texName}] created from layer ${lid}`);
    return true;
  }

  /**
   * Creates a custom grain texture directly from the current selection.
   */
  createGrainFromSelection(customName) {
    const ex = this._extractSelectionPixels();
    if (!ex) return false;
    const buf = Buf.alloc(ex.width * ex.height * 4);
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).set(new Uint8Array(ex.pixels.buffer, ex.pixels.byteOffset, ex.pixels.byteLength));
    const texName = (customName || `grain_sel_${Date.now()}`).toLowerCase().replace(/\s+/g, '_');
    let wasmId = -1;
    if (this.canvasActor?.exports?.w_texture_create) {
      wasmId = this.canvasActor.exports.w_texture_create(ex.width, ex.height);
      if (wasmId >= 0) {
        const tptr = this.canvasActor.exports.w_texture_get_pixels(wasmId);
        if (tptr) new Uint8Array(this.canvasActor.memory.buffer, tptr, buf.byteLength).set(buf);
      }
    }
    this.textures.set(texName, { width: ex.width, height: ex.height, data: buf, wasmId, category: 'texture' });
    if (wasmId >= 0) {
      this.setTexture(texName);
    }
    this.sendConsoleLog(`custom grain [${texName}] created from selection (${ex.width}x${ex.height})`);
    return true;
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
    const key = name.toLowerCase().trim();
    const preset = BRUSH_PRESETS[key] || (this.customBrushPresets && this.customBrushPresets[key]);
    this.activeBrush = key;
    if (preset) {
      // 1. Reset all tool and brush parameters to clean defaults before applying preset
      this.resetTool();

      if (preset.eraser !== undefined) {
        this.strokeIsEraser = preset.eraser ? 1 : 0;
        this.actionMode = preset.eraser ? 'erase' : (preset.mode === 1 ? 'smudge' : 'draw');
      } else if (preset.mode === 1) {
        this.actionMode = 'smudge';
        this.strokeIsEraser = 0;
      } else {
        this.actionMode = 'draw';
        this.strokeIsEraser = 0;
      }
      for (const [k, v] of Object.entries(preset)) {
        if (k === 'name' || k === 'icon' || k === 'desc' || k === 'eraser' || k === 'category') continue;
        if (k === 'texture' && typeof v === 'string') {
          this.setTexture(v);
        } else {
          this.setBrushParam(k, v);
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Samples pixel color at (x, y) from composite canvas or active layer.
   * Updates host.currentColor and brushParams.color.
   * Returns hex color string e.g. '#fabd2f'.
   */
  pickColor(x, y, sampleComposite = true) {
    if (!this.canvasActor || !this.canvasActor.exports) return null;
    let val = 0;
    if (typeof this.canvasActor.exports.w_pick_color === 'function') {
      val = this.canvasActor.exports.w_pick_color(x, y, sampleComposite ? 1 : 0);
    } else {
      const ptr = this.canvasActor.exports.get_composite_pixels();
      const cw = this.canvasActor.exports.get_canvas_width?.() ?? 640;
      const ch = this.canvasActor.exports.get_canvas_height?.() ?? 480;
      if (x >= 0 && x < cw && y >= 0 && y < ch && this.canvasActor.memory) {
        const u32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, cw * ch);
        val = u32[y * cw + x];
      }
    }
    const r = val & 0xFF;
    const g = (val >> 8) & 0xFF;
    const b = (val >> 16) & 0xFF;
    const toHex = (n) => n.toString(16).padStart(2, '0');
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    this.currentColor = (val & 0xFF000000) ? val : (0xFF000000 | val);
    this.brushParams.color = hex;
    return hex;
  }

  /**
   * Generates a reusable REPL script representing the current brush settings.
   */
  dumpBrushScript() {
    const bp = this.brushParams || {};
    const modes = ['brush', 'smudge', 'blend', 'fill', 'lasso_fill', 'picker'];
    const modeName = (this.currentTool === 1) ? 'eraser' : (modes[bp.mode] || 'brush');
    const lines = [
      `# Esenho Brush Preset`,
      `set mode ${modeName}`,
      `set size ${bp.size || 8}`,
      `set opacity ${bp.opacity !== undefined ? bp.opacity : 100}`,
      `set hardness ${bp.hardness !== undefined ? bp.hardness : 80}`,
      `set flow ${bp.flow !== undefined ? bp.flow : 100}`,
      `set spacing ${bp.spacing || 15}`,
      `set angle ${bp.angle || 0}`,
      `set roundness ${bp.roundness || 100}`,
      `set scatter ${bp.scatter || 0}`,
      `set smudge ${bp.smudge || 50}`,
      `set wetness ${bp.wetness || 50}`,
      `set grain ${bp.grain || 0}`,
      `set smooth ${bp.smoothing || 0}`,
      `set auto_rotate ${bp.auto_rotate ? 'on' : 'off'}`,
      `set velocity ${bp.velocity || 0}`,
      `set taper_in ${bp.taper_in || 0}`,
      `set taper_out ${bp.taper_out || 0}`,
      `set fade ${bp.fade || 0}`,
      `set size_jitter ${bp.size_jitter || 0}`,
      `set angle_jitter ${bp.angle_jitter || 0}`,
      `set opacity_jitter ${bp.opacity_jitter || 0}`,
      `set color_jitter ${bp.color_jitter || 0}`,
      `set subpixel ${bp.subpixel ? 'on' : 'off'}`,
      `set depletion ${bp.depletion || 0}`,
      `set color_pickup ${bp.color_pickup || 0}`
    ];
    if (bp.color) {
      lines.push(`set color ${bp.color}`);
    }
    if (bp.dual_shape !== undefined && bp.dual_shape >= 0) {
      lines.push(`set dual_shape ${bp.dual_shape}`);
      lines.push(`set dual_size ${bp.dual_size || 100}`);
      lines.push(`set dual_spacing ${bp.dual_spacing || 20}`);
    }
    if (bp.symmetry) {
      const sNames = ['off', 'vertical', 'horizontal', 'quad'];
      lines.push(`set symmetry ${sNames[bp.symmetry] || bp.symmetry}`);
    }
    return lines.join('\n');
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
      if (pId !== undefined && typeof val === 'number') {
        mod.exports.w_brush_set_param(pId, Math.floor(val));
      }
    }
    if (mod === this.canvasActor || !target) {
      this.registerAllTexturesAsLayers();
    }
    if (this.activeTexture && this.activeTexture !== 'none') {
      this.setTexture(this.activeTexture);
    } else {
      this.setTexture('none');
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
   * applying configurable stabilizer / stroke smoothing (EMA + Bézier curvature),
   * pressure sensitivity and stylus tilt dynamics.
   */
  sendStroke(x, y, prev_x, prev_y, state, is_eraser, color, pressure, tiltX, tiltY) {
    if (this.brushParams && this.brushParams.mode === 5) {
      this.pickColor(x, y, true);
      return;
    }
    if (!this.canvasActor || (typeof this.canvasActor.exports.w_brush_stroke !== 'function' && typeof this.canvasActor.exports.w_brush_stroke_ext !== 'function')) return;

    const col = (color !== undefined) ? color : this.currentColor;
    const eraser = (is_eraser !== undefined) ? (is_eraser ? 1 : 0) : (this.actionMode === 'erase' || this.currentTool === 1 ? 1 : 0);
    const smooth = Math.max(0, Math.min(100, this.brushParams.smoothing || 0));

    let mappedPressure = (pressure !== undefined && pressure !== null) ? pressure : 1.0;
    if (this.brushParams && (this.brushParams.pressure_curve || this.brushParams.pressure_min)) {
      const minP = (this.brushParams.pressure_min !== undefined) ? (this.brushParams.pressure_min / 100.0) : 0.0;
      const maxP = (this.brushParams.pressure_max !== undefined) ? (this.brushParams.pressure_max / 100.0) : 1.0;
      if (mappedPressure < minP) mappedPressure = 0;
      else if (mappedPressure > maxP) mappedPressure = 1.0;
      else mappedPressure = (mappedPressure - minP) / Math.max(0.01, maxP - minP);

      const curve = this.brushParams.pressure_curve || 'linear';
      if (curve === 'soft') {
        mappedPressure = Math.pow(mappedPressure, 0.6);
      } else if (curve === 'hard') {
        mappedPressure = Math.pow(mappedPressure, 1.8);
      } else if (curve === 's-curve' || curve === 'sigmoid') {
        mappedPressure = mappedPressure * mappedPressure * (3 - 2 * mappedPressure);
      } else if (typeof curve === 'number' || (!isNaN(parseFloat(curve)) && parseFloat(curve) > 0)) {
        const g = typeof curve === 'number' ? curve : parseFloat(curve);
        mappedPressure = Math.pow(mappedPressure, g);
      }
    }
    const press = Math.max(0, Math.min(1000, Math.round(mappedPressure * 1000)));
    const tx = (tiltX !== undefined && tiltX !== null) ? Math.round(tiltX) : 0;
    const ty = (tiltY !== undefined && tiltY !== null) ? Math.round(tiltY) : 0;

    const invokeStroke = (s, curX, curY, pX, pY) => {
      if (typeof this.canvasActor.exports.w_brush_stroke_ext === 'function') {
        this.canvasActor.exports.w_brush_stroke_ext(s, Math.floor(curX), Math.floor(curY), Math.floor(pX), Math.floor(pY), col >>> 0, eraser, press, tx, ty);
      } else if (typeof this.canvasActor.exports.w_brush_stroke === 'function') {
        this.canvasActor.exports.w_brush_stroke(s, Math.floor(curX), Math.floor(curY), Math.floor(pX), Math.floor(pY), col >>> 0, eraser);
      }
    };

    let effMode = (this.brushParams && this.brushParams.mode !== undefined) ? this.brushParams.mode : 0;
    if (this.actionMode === 'smudge') {
      if (effMode !== 3 && effMode !== 4 && effMode !== 5) {
        effMode = 1; // W_MODE_SMUDGE
      }
    }
    if (this.canvasActor && typeof this.canvasActor.exports.w_brush_set_param === 'function') {
      this.canvasActor.exports.w_brush_set_param(15 /* W_PARAM_MODE */, effMode);
      const smStrength = (this.actionMode === 'smudge')
        ? ((this.brushParams && this.brushParams.smudge > 0) ? this.brushParams.smudge : 70)
        : ((this.brushParams && this.brushParams.smudge !== undefined) ? this.brushParams.smudge : 0);
      this.canvasActor.exports.w_brush_set_param(10 /* W_PARAM_SMUDGE */, smStrength);
    }

    if (state === 0) {
      if (this.actionMode !== 'select') {
        const actLabel = this.actionMode === 'erase' ? 'eraser' : (this.actionMode === 'smudge' ? 'smudge' : (['brush', 'smudge', 'blend', 'fill', 'lasso_fill'][this.brushParams.mode] || 'brush'));
        this.pushUndoSnapshot(actLabel);
      }
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

    const isPulledString = (this.brushParams.stabilizer_mode === 1 || this.brushParams.stabilizer_mode === 'pulled' || this.brushParams.stabilizer_mode === 'string');

    // Instant direct execution when smoothing is 0 (and not pulled string) or when using fill/lasso/shape modes
    if ((smooth === 0 && !isPulledString) || this.brushParams.mode === 3 || this.brushParams.mode === 4 || this.brushParams.mode === 6 || this.brushParams.mode === 7 || this.brushParams.mode === 8) {
      this.strokeSmoothX = x;
      this.strokeSmoothY = y;
      this.strokeHistory = null;
      this.pulledAnchor = null;
      this.pulledCursor = null;
      invokeStroke(state, x, y, prev_x, prev_y);
      return;
    }

    if (isPulledString) {
      const stringRadius = (smooth > 0)
        ? Math.max(5, smooth * 1.5)
        : ((this.brushParams.string_length !== undefined && this.brushParams.string_length > 0)
            ? this.brushParams.string_length
            : 30);

      if (state === 0) { // STROKE_START
        this.pulledAnchor = { x, y };
        this.pulledCursor = { x, y };
        this.strokeSmoothX = x;
        this.strokeSmoothY = y;
        invokeStroke(0, x, y, x, y);
        return;
      }

      if (state === 1) { // STROKE_MOVE
        if (!this.pulledAnchor) this.pulledAnchor = { x: prev_x, y: prev_y };
        this.pulledCursor = { x, y };
        const dx = x - this.pulledAnchor.x;
        const dy = y - this.pulledAnchor.y;
        const dist = Math.hypot(dx, dy);

        if (dist > stringRadius) {
          const targetX = x - (dx / dist) * stringRadius;
          const targetY = y - (dy / dist) * stringRadius;
          invokeStroke(1, targetX, targetY, this.pulledAnchor.x, this.pulledAnchor.y);
          this.pulledAnchor.x = targetX;
          this.pulledAnchor.y = targetY;
          this.strokeSmoothX = targetX;
          this.strokeSmoothY = targetY;
        }
        return;
      }

      if (state === 2) { // STROKE_END
        this.pulledCursor = null;
        this.pulledAnchor = null;
        invokeStroke(2, this.strokeSmoothX ?? x, this.strokeSmoothY ?? y, this.strokeSmoothX ?? prev_x, this.strokeSmoothY ?? prev_y);
        this.strokeSmoothX = null;
        this.strokeSmoothY = null;
        return;
      }
    }

    // Configurable stroke stabilizer / smoothing (EMA + Bézier)
    if (state === 0) { // STROKE_START
      this.strokeSmoothX = x;
      this.strokeSmoothY = y;
      this.strokeHistory = [{ x, y }];
      invokeStroke(0, x, y, x, y);
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

      // Responsive Exponential Moving Average with progressive power curve:
      // smooth 1..100 maps factor smoothly from 0.95 down to 0.015 (subtle jitter removal at 10-25%, solid stabilization at 35-60%, heavy streamline at 70-100%)
      const s = smooth / 100;
      const factor = Math.max(0.015, Math.pow(1.0 - s * 0.96, 2.2));
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

        invokeStroke(1, bx, by, lastX, lastY);
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
      // Finalize cleanly at the smoothed position without airborne snap jitter
      const finalX = (this.strokeSmoothX !== null && this.strokeSmoothX !== undefined) ? this.strokeSmoothX : x;
      const finalY = (this.strokeSmoothY !== null && this.strokeSmoothY !== undefined) ? this.strokeSmoothY : y;
      invokeStroke(2, finalX, finalY, finalX, finalY);
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
    const requiredMem = 65536 + byteLen * 2 + 65536;
    if (plugin.memory.buffer.byteLength < requiredMem) {
      const currentBytes = plugin.memory.buffer.byteLength;
      const pagesNeeded = Math.ceil((requiredMem - currentBytes) / 65536);
      if (pagesNeeded > 0) {
        plugin.memory.grow(pagesNeeded);
      }
    }
    const layerPtr = 65536;
    plugin.layerPtr = layerPtr;
    plugin.layerByteLen = byteLen;

    const beforeFilter = this.selection?.active
      ? new Uint32Array(new Uint32Array(this.canvasActor.memory.buffer, pixPtr, cw * ch))
      : null;

    new Uint8Array(plugin.memory.buffer, layerPtr, byteLen)
      .set(new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen));

    plugin.setLayer(layerPtr, cw, ch);

    plugin.exports.w_filter_apply(p1, p2);

    new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen)
      .set(new Uint8Array(plugin.memory.buffer, plugin.layerPtr, byteLen));

    if (beforeFilter) {
      this._clipActiveLayerToSelection(beforeFilter);
    }

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
      console.log(`${ansiColor}[esenho]\x1b[0m ${text}`);
      this.rl.prompt(true);
    } else {
      console.log(`${ansiColor}[esenho]\x1b[0m ${text}`);
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
   * Serializes active document, all layers, groups, brush parameters, palette,
   * and generates a project snapshot in the .esen (ESENHO v1) savefile format.
   * @param {string} [name] - Project name
   * @returns {object|null} .esen project object
   */
  exportProject(name) {
    if (!this.canvasActor || !this.canvasActor.exports) return null;
    const w = this.canvasActor.exports.get_canvas_width();
    const h = this.canvasActor.exports.get_canvas_height();
    if (w <= 0 || h <= 0) return null;

    const layerCount = this.canvasActor.exports.get_layer_count ? this.canvasActor.exports.get_layer_count() : 4;
    const orderCount = this.canvasActor.exports.w_layer_get_order_count ? this.canvasActor.exports.w_layer_get_order_count() : 0;
    
    const texIds = this.getTextureWasmIds();
    // 1. Gather only document drawing layers (id >= 3, skipping system tips 0..2 and unused textures)
    const layerOrder = [];
    const exportedLayerIds = [];
    const seen = new Set();

    for (let pos = 0; pos < orderCount; pos++) {
      const id = this.canvasActor.exports.w_layer_get_order(pos);
      if (id >= 3 && !texIds.has(id) && !seen.has(id)) {
        layerOrder.push(id);
        exportedLayerIds.push(id);
        seen.add(id);
      }
    }

    if (this.layerNames) {
      for (const id of this.layerNames.keys()) {
        if (id >= 3 && !texIds.has(id) && !seen.has(id)) {
          layerOrder.push(id);
          exportedLayerIds.push(id);
          seen.add(id);
        }
      }
    }

    if (exportedLayerIds.length === 0) {
      exportedLayerIds.push(3);
      layerOrder.push(3);
    }

    const encodeB64 = (rawU8) => {
      if (typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.bytesToBase64) {
        return EsenhoStore.bytesToBase64(rawU8);
      }
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(rawU8.buffer, rawU8.byteOffset, rawU8.byteLength).toString('base64');
      }
      let binary = '';
      const len = rawU8.byteLength;
      const chunkSize = 0x8000;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = rawU8.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    };

    const rleEncodeU32Local = (u32Array) => {
      const len = u32Array.length;
      if (len === 0) return new Uint8Array(0);
      const chunks = [];
      let curVal = u32Array[0];
      let curCount = 0;
      for (let i = 0; i < len; i++) {
        const val = u32Array[i];
        if (val === curVal && curCount < 0xFFFFFFFF) {
          curCount++;
        } else {
          chunks.push(curCount, curVal);
          curVal = val;
          curCount = 1;
        }
      }
      chunks.push(curCount, curVal);
      const out = new Uint32Array(chunks.length);
      out.set(chunks);
      return new Uint8Array(out.buffer);
    };

    const layersData = [];
    for (const i of exportedLayerIds) {
      const lw = this.canvasActor.exports.w_layer_get_width(i);
      const lh = this.canvasActor.exports.w_layer_get_height(i);
      const ptr = this.canvasActor.exports.w_layer_get_pixels(i);
      if (lw <= 0 || lh <= 0 || !ptr) continue;

      const visible = this.canvasActor.exports.w_layer_get_visible ? this.canvasActor.exports.w_layer_get_visible(i) : 1;
      const opacity = this.canvasActor.exports.w_layer_get_opacity ? this.canvasActor.exports.w_layer_get_opacity(i) : 255;
      const alphaLock = this.canvasActor.exports.w_layer_get_alpha_lock ? this.canvasActor.exports.w_layer_get_alpha_lock(i) : 0;
      const clipping = this.canvasActor.exports.w_layer_get_clipping ? this.canvasActor.exports.w_layer_get_clipping(i) : 0;
      const blendMode = this.canvasActor.exports.w_layer_get_blend_mode ? this.canvasActor.exports.w_layer_get_blend_mode(i) : 0;
      const layerName = (this.layerNames && this.layerNames.get(i)) || (i === 3 ? 'Background' : `Layer ${i}`);

      const totalPixels = lw * lh;
      const byteLen = totalPixels * 4;
      const memBuf = this.canvasActor.memory.buffer;
      if (ptr + byteLen > memBuf.byteLength) continue;

      const u32 = (ptr % 4 === 0)
        ? new Uint32Array(memBuf, ptr, totalPixels)
        : new Uint32Array(new Uint8Array(memBuf, ptr, byteLen).slice().buffer);

      // Check if layer is completely blank (all 0s) or solid uniform color
      let isUniform = true;
      const firstPixel = u32[0];
      for (let p = 1; p < totalPixels; p++) {
        if (u32[p] !== firstPixel) {
          isUniform = false;
          break;
        }
      }

      const layerObj = {
        id: i,
        name: layerName,
        width: lw,
        height: lh,
        visible,
        opacity,
        alphaLock,
        clipping,
        blendMode
      };

      if (isUniform) {
        if (firstPixel === 0) {
          layerObj.encoding = 'empty';
        } else {
          layerObj.encoding = 'solid';
          layerObj.color = firstPixel >>> 0;
        }
      } else {
        // Fast RLE compression
        const rleU8 = (typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.rleEncodeU32)
          ? EsenhoStore.rleEncodeU32(u32)
          : rleEncodeU32Local(u32);

        if (rleU8.byteLength < totalPixels * 4 * 0.9) {
          layerObj.encoding = 'rle32';
          layerObj.pixels = encodeB64(rleU8);
        } else {
          layerObj.encoding = 'raw';
          layerObj.pixels = encodeB64(new Uint8Array(this.canvasActor.memory.buffer, ptr, totalPixels * 4));
        }
      }

      layersData.push(layerObj);
    }

    // Generate thumbnail from composite buffer
    let thumbnail = '';
    const compPtr = this.canvasActor.exports.get_composite_pixels ? this.canvasActor.exports.get_composite_pixels() : 0;
    if (compPtr && typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.generateThumbnailDataUrl) {
      const compU32 = new Uint32Array(this.canvasActor.memory.buffer, compPtr, w * h);
      thumbnail = EsenhoStore.generateThumbnailDataUrl(compU32, w, h, 220);
    }

    // Layer Groups & Tree
    const groups = [];
    if (this.layerGroups) {
      for (const [gid, g] of this.layerGroups.entries()) {
        groups.push({
          id: gid,
          name: g.name,
          collapsed: !!g.collapsed,
          visible: g.visible !== undefined ? !!g.visible : true,
          parentId: g.parentId || null,
          layerIds: Array.isArray(g.layerIds) ? [...g.layerIds] : [],
          children: Array.isArray(g.children) ? JSON.parse(JSON.stringify(g.children)) : []
        });
      }
    }
    const layerTree = this.layerTree ? JSON.parse(JSON.stringify(this.layerTree)) : [];

    const projId = this.currentProjectId || ('proj_' + Date.now());
    this.currentProjectId = projId;
    this.currentProjectName = name || this.currentProjectName || 'Untitled Project';

    return {
      magic: 'ESENHO',
      version: 1,
      id: projId,
      name: this.currentProjectName,
      width: w,
      height: h,
      createdAt: this.currentProjectCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail,
      settings: {
        activeTool: this.currentTool || 0,
        actionMode: this.actionMode || 'draw',
        currentColor: this.currentColor || 0xFF000000,
        activeLayerId: this.canvasActor.exports.get_active_layer ? this.canvasActor.exports.get_active_layer() : 3,
        brushParams: { ...this.brushParams },
        uiScale: this.uiScale || 'auto'
      },
      layerOrder,
      layerTree,
      layerGroups: groups,
      layers: layersData
    };
  }

  /**
   * Deserializes and loads a .esen project structure into active engine state.
   * @param {object} projectData - Parsed .esen savefile JSON object
   * @returns {boolean} True if loaded successfully
   */
  loadProject(projectData) {
    if (!projectData || !projectData.width || !projectData.height || !Array.isArray(projectData.layers)) {
      throw new Error('Invalid project data format');
    }
    if (!this.canvasActor || !this.canvasActor.exports) {
      throw new Error('Canvas actor not initialized');
    }

    const w = projectData.width;
    const h = projectData.height;
    this.canvasActor.exports.w_init(w, h);

    const decodeB64 = (b64) => {
      if (typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.base64ToBytes) {
        return EsenhoStore.base64ToBytes(b64);
      }
      if (typeof Buffer !== 'undefined') {
        const b = Buffer.from(b64, 'base64');
        return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      }
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };

    const rleDecodeU32Local = (u8Array, totalPixels) => {
      const in32 = new Uint32Array(u8Array.buffer, u8Array.byteOffset, Math.floor(u8Array.byteLength / 4));
      const out = new Uint32Array(totalPixels);
      let outIdx = 0;
      for (let i = 0; i < in32.length; i += 2) {
        const count = in32[i];
        const val = in32[i + 1];
        out.fill(val, outIdx, Math.min(totalPixels, outIdx + count));
        outIdx += count;
      }
      return out;
    };

    // Restore layers
    if (this.layerNames) this.layerNames.clear();
    else this.layerNames = new Map();
    const layerMap = new Map(); // old id -> new id
    for (let i = 0; i < projectData.layers.length; i++) {
      const l = projectData.layers[i];
      let targetId;
      if (i === 0) {
        // Background layer (always slot 3 in wasm)
        targetId = 3;
      } else {
        targetId = this.canvasActor.exports.w_layer_create(w, h);
      }
      layerMap.set(l.id, targetId);

      if (targetId >= 0) {
        const ptr = this.canvasActor.exports.w_layer_get_pixels(targetId);
        const lw = l.width || w;
        const lh = l.height || h;
        const srcPixels = lw * lh;
        const docPixels = w * h;

        if (ptr) {
          const dstU32 = new Uint32Array(this.canvasActor.memory.buffer, ptr, docPixels);
          if (l.encoding === 'empty') {
            dstU32.fill(0);
          } else if (l.encoding === 'solid') {
            const col = (l.color !== undefined) ? (l.color >>> 0) : 0;
            dstU32.fill(col);
          } else if (l.encoding === 'rle32') {
            const raw = l.pixels || l.pixelsBase64;
            if (raw) {
              const rleBytes = decodeB64(raw);
              const decodedU32 = (typeof EsenhoStore !== 'undefined' && EsenhoStore && EsenhoStore.rleDecodeU32)
                ? EsenhoStore.rleDecodeU32(rleBytes, srcPixels)
                : rleDecodeU32Local(rleBytes, srcPixels);
              if (lw === w && lh === h) {
                dstU32.set(decodedU32);
              } else {
                dstU32.fill(0);
                const copyW = Math.min(lw, w);
                const copyH = Math.min(lh, h);
                for (let y = 0; y < copyH; y++) {
                  for (let x = 0; x < copyW; x++) {
                    dstU32[y * w + x] = decodedU32[y * lw + x];
                  }
                }
              }
            }
          } else {
            // raw or legacy format
            const raw = l.pixels || l.pixelsBase64;
            if (raw) {
              const u8 = decodeB64(raw);
              const decodedU32 = new Uint32Array(u8.buffer, u8.byteOffset, Math.min(srcPixels, Math.floor(u8.byteLength / 4)));
              if (lw === w && lh === h) {
                dstU32.set(decodedU32);
              } else {
                dstU32.fill(0);
                const copyW = Math.min(lw, w);
                const copyH = Math.min(lh, h);
                for (let y = 0; y < copyH; y++) {
                  for (let x = 0; x < copyW; x++) {
                    dstU32[y * w + x] = decodedU32[y * lw + x];
                  }
                }
              }
            }
          }
        }

        if (l.name) {
          if (!this.layerNames) this.layerNames = new Map();
          this.layerNames.set(targetId, l.name);
        }

        if (typeof this.canvasActor.exports.w_layer_set_visible === 'function') {
          this.canvasActor.exports.w_layer_set_visible(targetId, l.visible !== undefined ? (l.visible ? 1 : 0) : 1);
        }
        if (typeof this.canvasActor.exports.w_layer_set_opacity === 'function') {
          this.canvasActor.exports.w_layer_set_opacity(targetId, l.opacity !== undefined ? l.opacity : 255);
        }
        if (typeof this.canvasActor.exports.w_layer_set_alpha_lock === 'function') {
          this.canvasActor.exports.w_layer_set_alpha_lock(targetId, l.alphaLock ? 1 : 0);
        }
        if (typeof this.canvasActor.exports.w_layer_set_clipping === 'function') {
          this.canvasActor.exports.w_layer_set_clipping(targetId, l.clipping ? 1 : 0);
        }
        if (typeof this.canvasActor.exports.w_layer_set_blend_mode === 'function') {
          this.canvasActor.exports.w_layer_set_blend_mode(targetId, l.blendMode || 0);
        }
      }
    }

    // Restore groups
    if (this.layerGroups) this.layerGroups.clear();
    else this.layerGroups = new Map();
    if (Array.isArray(projectData.layerGroups)) {
      for (const g of projectData.layerGroups) {
        const remappedIds = (g.layerIds || []).map(id => layerMap.has(id) ? layerMap.get(id) : id);
        const remappedChildren = (Array.isArray(g.children) && g.children.length > 0)
          ? g.children.map(c => {
              if (c.type === 'layer') {
                return { type: 'layer', id: layerMap.has(c.id) ? layerMap.get(c.id) : c.id };
              }
              return { ...c };
            })
          : remappedIds.map(lid => ({ type: 'layer', id: lid }));

        this.layerGroups.set(g.id, {
          id: g.id,
          name: g.name,
          collapsed: !!g.collapsed,
          visible: g.visible !== undefined ? !!g.visible : true,
          parentId: g.parentId || null,
          layerIds: remappedIds,
          children: remappedChildren
        });
      }
    }

    // Restore layer tree
    if (Array.isArray(projectData.layerTree) && projectData.layerTree.length > 0) {
      this.layerTree = projectData.layerTree.map(node => {
        if (node.type === 'layer') {
          return { type: 'layer', id: layerMap.has(node.id) ? layerMap.get(node.id) : node.id };
        }
        return { ...node };
      });
    } else {
      this.layerTree = [];
    }

    this.ensureTreeIntegrity();
    this.syncWasmLayerOrderFromTree();

    // Restore settings
    if (projectData.settings) {
      const s = projectData.settings;
      if (s.activeTool !== undefined) this.currentTool = s.activeTool;
      if (s.actionMode !== undefined) this.actionMode = s.actionMode;
      if (s.currentColor !== undefined) this.currentColor = s.currentColor;
      if (s.uiScale !== undefined) this.uiScale = s.uiScale;
      if (s.brushParams) {
        for (const [k, v] of Object.entries(s.brushParams)) {
          this.setBrushParam(k, v);
        }
      }
      if (s.activeLayerId !== undefined && layerMap.has(s.activeLayerId)) {
        const mappedActive = layerMap.get(s.activeLayerId);
        if (typeof this.canvasActor.exports.w_layer_select === 'function') {
          this.canvasActor.exports.w_layer_select(mappedActive);
        }
      }
    }

    this.currentProjectId = projectData.id || ('proj_' + Date.now());
    this.currentProjectName = projectData.name || 'Untitled Project';
    this.currentProjectCreatedAt = projectData.createdAt || new Date().toISOString();

    if (this.canvasActor.exports.force_composite) {
      this.canvasActor.exports.force_composite();
    }
    return true;
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
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) return;

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
      title: 'esenho',
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
      prompt: '\x1b[36mesenho>\x1b[0m '
    });

    console.log('\x1b[1;32m=== Esenho Interactive Console Ready (Native WebAssembly) ===\x1b[0m');
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

    if (this.window && typeof this.window.render === 'function') {
      this.window.render(this.windowWidth, this.windowHeight, this.windowWidth * 4, 'rgba32', this.screenBuffer);
    }
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
 * Loads Canvas ROM and plugins via EsenhoModule and starts the render loop.
 */
async function main() {
  const host = new EsenhoScreenHost();

  // Canvas WASM Module
  const canvasWasmPath = path.resolve(__dirname, '../roms/canvas.wasm');
  host.canvasActor = new EsenhoModule(canvasWasmPath, { name: 'canvas' });
  if (host.canvasActor.exports.w_init) {
    host.canvasActor.exports.w_init(DOC_WIDTH, DOC_HEIGHT);
  }
  host.syncBrushParams(host.canvasActor);

  // Discover & Load WASM Filter Plugins
  const moduleConfigs = discoverModules(path.resolve(__dirname, '..'));
  for (const mod of moduleConfigs) {
    const fullPath = path.resolve(__dirname, '..', mod.wasmPath);
    if (!fs.existsSync(fullPath)) continue;

    const pluginModule = new EsenhoModule(fullPath, { name: mod.name });
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

EsenhoScreenHost.COMMAND_RULES = COMMAND_RULES;

const _exports = {
  EsenhoModule,
  EsenhoScreenHost,
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
