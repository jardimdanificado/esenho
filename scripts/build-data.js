const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Load WASM Plugins from src/plugins/*.c
const pluginFiles = fs.readdirSync(path.join(__dirname, '../src/plugins')).filter(f => f.endsWith('.c'));
const wasmFx = {};
for (const pf of pluginFiles) {
  const content = fs.readFileSync(path.join(__dirname, '../src/plugins', pf), 'utf8');
  const id = pf.replace('.c', '');
  
  const match = content.match(/w_plugin_get_info\(void\)\s*\{[\s\S]*?return\s+([\s\S]*?);/);
  let info = {};
  if (match) {
    try {
      const raw = match[1].trim();
      const stringParts = [];
      const strRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let m;
      while ((m = strRegex.exec(raw)) !== null) {
        stringParts.push(JSON.parse('"' + m[1] + '"'));
      }
      const combined = stringParts.join('');
      info = JSON.parse(combined);
    } catch (e) {
      console.warn('Could not parse json for', id, e.message);
    }
  }

  const isLens = ['fisheye', 'swirl', 'ripple', 'kaleidoscope', 'frosted_glass', 'scanline', 'glitch', 'duotone', 'thermal', 'solarize', 'bloom', 'chromatic', 'water_foam', 'vignette'].includes(id);
  const wasmPath = path.join(__dirname, '../plugins', id + '.wasm');
  let wasmBase64 = '';
  let byteLength = 0;
  if (fs.existsSync(wasmPath)) {
    const wasmBuf = fs.readFileSync(wasmPath);
    wasmBase64 = wasmBuf.toString('base64');
    byteLength = wasmBuf.length;
  }

  wasmFx[id] = {
    $schema: 'esenho/wasm_fx/v1',
    id: id,
    name: info.title || id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' '),
    wasmFile: id + '.wasm',
    wasmBase64: wasmBase64,
    byteLength: byteLength,
    mimeType: 'application/wasm',
    target: isLens ? 'backdrop' : 'fill',
    isLens: isLens,
    params: info.params || []
  };
}

// 1.5. Quadro Core WASM (canvas.wasm)
let wasmCore = null;
const canvasWasmPath = path.join(__dirname, '../plugins/canvas.wasm');
if (fs.existsSync(canvasWasmPath)) {
  const cBuf = fs.readFileSync(canvasWasmPath);
  wasmCore = {
    $schema: 'esenho/wasm_core/v1',
    id: 'quadro_canvas',
    name: 'Quadro Canvas Engine Core',
    wasmFile: 'canvas.wasm',
    wasmBase64: cBuf.toString('base64'),
    byteLength: cBuf.length,
    mimeType: 'application/wasm'
  };
}

// 2. Load Existing Resource Definitions from data.json or fallback
let existingData = {};
const existingDataPath = path.join(__dirname, '../data.json');
if (fs.existsSync(existingDataPath)) {
  try {
    existingData = JSON.parse(fs.readFileSync(existingDataPath, 'utf8'));
  } catch (e) {
    console.warn('Could not read existing data.json:', e.message);
  }
}

const palettes = existingData.palettes || {};
if (palettes.gruvbox) {
  palettes.gruvbox.gradients = [
    { id: 'gold_fire', type: 'linear', stops: [{ offset: 0, color: '#fabd2f' }, { offset: 1, color: '#fb4934' }] },
    { id: 'cyber_teal', type: 'linear', stops: [{ offset: 0, color: '#83a598' }, { offset: 1, color: '#b8bb26' }] }
  ];
}
if (palettes.nord) {
  palettes.nord.gradients = [
    { id: 'aurora', type: 'linear', stops: [{ offset: 0, color: '#88c0d0' }, { offset: 1, color: '#5e81ac' }] }
  ];
}

const materials = existingData.materials || {};
if (!materials.solid_gold) {
  materials.solid_gold = {
    $schema: 'esenho/material/v1',
    id: 'solid_gold',
    name: 'Solid Gold',
    category: 'metal',
    builtin: true,
    color: '#fabd2f',
    opacity: 1.0,
    texture: { ref: 'none' }
  };
}
if (!materials.vintage_paper) {
  materials.vintage_paper = {
    $schema: 'esenho/material/v1',
    id: 'vintage_paper',
    name: 'Vintage Canvas Paper',
    category: 'artistic',
    builtin: true,
    color: '#ebdbb2',
    opacity: 1.0,
    texture: { ref: 'paper', scale: 100, depth: 60 }
  };
}

// 3. Load Brush Presets
const brushPresets = existingData.brushPresets || {};

// Add universal aliases / standard presets
if (!brushPresets.studio_inker && brushPresets.inker) {
  brushPresets.studio_inker = {
    $schema: 'esenho/brush/v1',
    id: 'studio_inker',
    name: 'Studio Inker',
    category: 'ink',
    builtin: true,
    tip: { ref: 'round', size: 6, hardness: 100, roundness: 100, angle: 0 },
    dynamics: {
      spacing: 3,
      stabilizer: { mode: 'streamline', smoothing: 25 },
      pressureSize: true,
      pressureFlow: false,
      velocityScaling: 15,
      taper: { in: 5, out: 15 }
    },
    texture: { ref: 'none' },
    wet: { wetness: 0, smudge: 0, colorPickup: 0, depletion: 0 },
    jitter: { size: 0, angle: 0, opacity: 0, scatter: 0 }
  };
}
if (!brushPresets.solid_vector) {
  brushPresets.solid_vector = {
    $schema: 'esenho/brush/v1',
    id: 'solid_vector',
    name: 'Solid Vector (Clean Line)',
    category: 'ink',
    builtin: true,
    isVectorPure: true,
    tip: { ref: 'round', size: 3, hardness: 100, roundness: 100, angle: 0 },
    dynamics: {
      spacing: 1,
      stabilizer: { mode: 'streamline', smoothing: 0 },
      pressureSize: false,
      pressureFlow: false,
      velocityScaling: 0
    },
    texture: { ref: 'none' },
    wet: { wetness: 0, smudge: 0, colorPickup: 0, depletion: 0 },
    jitter: { size: 0, angle: 0, opacity: 0, scatter: 0 }
  };
}
if (!brushPresets.charcoal_soft) {
  brushPresets.charcoal_soft = {
    $schema: 'esenho/brush/v1',
    id: 'charcoal_soft',
    name: 'Soft Charcoal Grit',
    category: 'charcoal',
    builtin: true,
    tip: { ref: 'charcoal', size: 28, hardness: 80, roundness: 85, angle: 30 },
    dynamics: {
      spacing: 8,
      stabilizer: { mode: 'streamline', smoothing: 10 },
      pressureSize: true,
      pressureFlow: true,
      tiltAngle: true
    },
    texture: { ref: 'charcoal_tooth', scale: 100, depth: 70 },
    wet: { wetness: 0, smudge: 10, colorPickup: 0, depletion: 0 },
    jitter: { size: 10, angle: 35, opacity: 15, scatter: 4 }
  };
}
if (!brushPresets.soft_airbrush) {
  brushPresets.soft_airbrush = {
    $schema: 'esenho/brush/v1',
    id: 'soft_airbrush',
    name: 'Radial Airbrush',
    category: 'airbrush',
    builtin: true,
    tip: { ref: 'soft_round', size: 60, hardness: 0, roundness: 100, angle: 0 },
    dynamics: {
      spacing: 4,
      stabilizer: { mode: 'streamline', smoothing: 15 },
      pressureSize: false,
      pressureFlow: true,
      buildup: true
    },
    texture: { ref: 'none' },
    wet: { wetness: 0, smudge: 0, colorPickup: 0, depletion: 0 },
    jitter: { size: 0, angle: 0, opacity: 0, scatter: 0 }
  };
}
if (!brushPresets.wet_acrylic) {
  brushPresets.wet_acrylic = {
    $schema: 'esenho/brush/v1',
    id: 'wet_acrylic',
    name: 'Wet Acrylic Paint',
    category: 'paint',
    builtin: true,
    tip: { ref: 'bristle', size: 32, hardness: 90, roundness: 80, angle: 0 },
    dynamics: {
      spacing: 4,
      stabilizer: { mode: 'streamline', smoothing: 20 },
      pressureSize: true,
      pressureFlow: true
    },
    texture: { ref: 'canvas', scale: 100, depth: 50 },
    wet: { wetness: 65, smudge: 45, colorPickup: 40, depletion: 15 },
    jitter: { size: 0, angle: 10, opacity: 0, scatter: 0 }
  };
}

// 4. Brush Tips
const brushTips = {
  round: { $schema: 'esenho/tip/v1', id: 'round', name: 'Circle / Round', builtin: true, type: 'procedural', hardness: 100, aspectRatio: 1.0, angle: 0 },
  soft_round: { $schema: 'esenho/tip/v1', id: 'soft_round', name: 'Soft Airbrush', builtin: true, type: 'procedural', hardness: 0, aspectRatio: 1.0, angle: 0 },
  square: { $schema: 'esenho/tip/v1', id: 'square', name: 'Square Block', builtin: true, type: 'procedural', hardness: 100, aspectRatio: 1.0, angle: 0 },
  chisel: { $schema: 'esenho/tip/v1', id: 'chisel', name: 'Chisel Flat', builtin: true, type: 'procedural', hardness: 100, aspectRatio: 0.35, angle: 45 },
  bristle: { $schema: 'esenho/tip/v1', id: 'bristle', name: '3-Strand Bristle', builtin: true, type: 'procedural', hardness: 85, aspectRatio: 0.9, angle: 0 },
  rake: { $schema: 'esenho/tip/v1', id: 'rake', name: '5-Strand Rake', builtin: true, type: 'procedural', hardness: 90, aspectRatio: 0.8, angle: 0 },
  charcoal: { $schema: 'esenho/tip/v1', id: 'charcoal', name: 'Charcoal Grit', builtin: true, type: 'procedural', hardness: 80, aspectRatio: 0.85, angle: 30 },
  dagger: { $schema: 'esenho/tip/v1', id: 'dagger', name: 'Dagger / Teardrop', builtin: true, type: 'procedural', hardness: 95, aspectRatio: 0.4, angle: 90 },
  splatter: { $schema: 'esenho/tip/v1', id: 'splatter', name: 'Splatter Drops', builtin: true, type: 'procedural', hardness: 95, aspectRatio: 1.0, angle: 0 },
  oval: { $schema: 'esenho/tip/v1', id: 'oval', name: 'Oval Calligraphy', builtin: true, type: 'procedural', hardness: 95, aspectRatio: 0.5, angle: 45 },
  star: { $schema: 'esenho/tip/v1', id: 'star', name: '5-Point Star', builtin: true, type: 'procedural', hardness: 100, aspectRatio: 1.0, angle: 0 },
  fan: { $schema: 'esenho/tip/v1', id: 'fan', name: 'Fan Brush', builtin: true, type: 'procedural', hardness: 85, aspectRatio: 0.75, angle: 0 },
  dry_brush: { $schema: 'esenho/tip/v1', id: 'dry_brush', name: 'Dry Brush Tooth', builtin: true, type: 'procedural', hardness: 70, aspectRatio: 0.8, angle: 0 },
  stipple: { $schema: 'esenho/tip/v1', id: 'stipple', name: 'Stipple Point', builtin: true, type: 'procedural', hardness: 90, aspectRatio: 1.0, angle: 0 }
};

// 5. Textures
const textures = {
  none: { $schema: 'esenho/texture/v1', id: 'none', name: 'None (Smooth)', builtin: true, generator: 'none', scale: 100, contrast: 100, brightness: 100, depth: 0, mode: 'multiply' },
  paper: { $schema: 'esenho/texture/v1', id: 'paper', name: 'Paper Grain', builtin: true, generator: 'paper', scale: 100, contrast: 100, brightness: 100, depth: 50, mode: 'multiply' },
  canvas: { $schema: 'esenho/texture/v1', id: 'canvas', name: 'Canvas Weave', builtin: true, generator: 'canvas', scale: 100, contrast: 120, brightness: 100, depth: 60, mode: 'multiply' },
  noise: { $schema: 'esenho/texture/v1', id: 'noise', name: 'Fine Noise', builtin: true, generator: 'noise', scale: 80, contrast: 90, brightness: 100, depth: 40, mode: 'multiply' },
  watercolor: { $schema: 'esenho/texture/v1', id: 'watercolor', name: 'Watercolor Coldpress', builtin: true, generator: 'watercolor', scale: 120, contrast: 110, brightness: 100, depth: 70, mode: 'multiply' },
  grunge: { $schema: 'esenho/texture/v1', id: 'grunge', name: 'Rough Grunge', builtin: true, generator: 'grunge', scale: 150, contrast: 130, brightness: 95, depth: 80, mode: 'multiply' },
  charcoal_tooth: { $schema: 'esenho/texture/v1', id: 'charcoal_tooth', name: 'Charcoal Tooth', builtin: true, generator: 'charcoal_tooth', scale: 100, contrast: 140, brightness: 100, depth: 75, mode: 'multiply' },
  linen: { $schema: 'esenho/texture/v1', id: 'linen', name: 'Linen Weave', builtin: true, generator: 'linen', scale: 90, contrast: 115, brightness: 100, depth: 55, mode: 'multiply' },
  washi: { $schema: 'esenho/texture/v1', id: 'washi', name: 'Washi Japanese Fiber', builtin: true, generator: 'washi', scale: 100, contrast: 110, brightness: 100, depth: 60, mode: 'multiply' },
  sandpaper: { $schema: 'esenho/texture/v1', id: 'sandpaper', name: 'Sandpaper Grit', builtin: true, generator: 'sandpaper', scale: 80, contrast: 130, brightness: 100, depth: 70, mode: 'multiply' },
  wood: { $schema: 'esenho/texture/v1', id: 'wood', name: 'Wood Grain', builtin: true, generator: 'wood', scale: 110, contrast: 125, brightness: 100, depth: 65, mode: 'multiply' },
  crackle: { $schema: 'esenho/texture/v1', id: 'crackle', name: 'Crackle Ceramic', builtin: true, generator: 'crackle', scale: 140, contrast: 150, brightness: 95, depth: 80, mode: 'multiply' },
  marble: { $schema: 'esenho/texture/v1', id: 'marble', name: 'Polished Marble', builtin: true, generator: 'marble', scale: 130, contrast: 120, brightness: 100, depth: 60, mode: 'multiply' },
  sponge: { $schema: 'esenho/texture/v1', id: 'sponge', name: 'Sea Sponge', builtin: true, generator: 'sponge', scale: 100, contrast: 135, brightness: 100, depth: 75, mode: 'multiply' },
  bark: { $schema: 'esenho/texture/v1', id: 'bark', name: 'Tree Bark', builtin: true, generator: 'bark', scale: 100, contrast: 140, brightness: 100, depth: 75, mode: 'multiply' },
  granite: { $schema: 'esenho/texture/v1', id: 'granite', name: 'Granite Rock', builtin: true, generator: 'granite', scale: 100, contrast: 130, brightness: 100, depth: 70, mode: 'multiply' },
  burlap: { $schema: 'esenho/texture/v1', id: 'burlap', name: 'Coarse Burlap Jute', builtin: true, generator: 'burlap', scale: 100, contrast: 125, brightness: 100, depth: 65, mode: 'multiply' },
  denim: { $schema: 'esenho/texture/v1', id: 'denim', name: 'Denim Twill', builtin: true, generator: 'denim', scale: 100, contrast: 120, brightness: 100, depth: 60, mode: 'multiply' }
};

// 6. Curves (Stylus Pressure, Velocity, Dynamics, Easing)
const curves = {
  linear: {
    $schema: 'esenho/curve/v1',
    id: 'linear',
    name: 'Linear 1:1',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.333, 0.333], [0.667, 0.667], [1, 1]]
  },
  stylus_pressure_soft: {
    $schema: 'esenho/curve/v1',
    id: 'stylus_pressure_soft',
    name: 'Soft Stylus Response',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.15, 0.45], [0.4, 0.85], [1, 1]]
  },
  stylus_pressure_hard: {
    $schema: 'esenho/curve/v1',
    id: 'stylus_pressure_hard',
    name: 'Hard Stylus Response',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.65, 0.15], [0.85, 0.55], [1, 1]]
  },
  ease_in_out: {
    $schema: 'esenho/curve/v1',
    id: 'ease_in_out',
    name: 'Smooth Sigmoid S-Curve',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.42, 0.0], [0.58, 1.0], [1, 1]]
  },
  taper_sharp: {
    $schema: 'esenho/curve/v1',
    id: 'taper_sharp',
    name: 'Sharp Taper',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.05, 0.8], [0.2, 1.0], [1, 1]]
  },
  sigmoid_gain: {
    $schema: 'esenho/curve/v1',
    id: 'sigmoid_gain',
    name: 'High Dynamic Gain Sigmoid',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.25, 0.05], [0.75, 0.95], [1, 1]]
  },
  ease_out_back: {
    $schema: 'esenho/curve/v1',
    id: 'ease_out_back',
    name: 'Overshoot Spring Back',
    builtin: true,
    type: 'cubic_bezier',
    points: [[0, 0], [0.175, 0.885], [0.32, 1.275], [1, 1]]
  }
};

// 7. Meshes (Brush Fill Trajectory & Hatching Layouts)
const meshes = {
  linear: { $schema: 'esenho/mesh/v1', id: 'linear', name: 'Parallel Hatch', builtin: true, pattern: 'linear', spacing: 6, angle: 45, curvature: 0, density: 100, direction: 'bidirectional' },
  crosshatch: { $schema: 'esenho/mesh/v1', id: 'crosshatch', name: 'Crosshatch', builtin: true, pattern: 'crosshatch', spacing: 8, angle: 45, angle2: 135, curvature: 0, density: 100, direction: 'bidirectional' },
  triple_hatch: { $schema: 'esenho/mesh/v1', id: 'triple_hatch', name: 'Triple Hatch', builtin: true, pattern: 'triple_hatch', spacing: 8, angle: 30, angle2: 90, angle3: 150, curvature: 0, density: 100, direction: 'bidirectional' },
  herringbone: { $schema: 'esenho/mesh/v1', id: 'herringbone', name: 'Herringbone Tweed', builtin: true, pattern: 'herringbone', spacing: 8, angle: 45, curvature: 0, density: 100, direction: 'bidirectional' },
  woven: { $schema: 'esenho/mesh/v1', id: 'woven', name: 'Woven Basketweave', builtin: true, pattern: 'woven', spacing: 8, angle: 0, curvature: 0, density: 100, direction: 'bidirectional' },
  isometric: { $schema: 'esenho/mesh/v1', id: 'isometric', name: 'Isometric Grid', builtin: true, pattern: 'isometric', spacing: 10, angle: 30, curvature: 0, density: 100, direction: 'bidirectional' },
  cross_contour: { $schema: 'esenho/mesh/v1', id: 'cross_contour', name: 'Cross-Contour 3D', builtin: true, pattern: 'cross_contour', spacing: 8, angle: 45, curvature: 35, density: 100, direction: 'bidirectional' },
  radial: { $schema: 'esenho/mesh/v1', id: 'radial', name: 'Radial Sunburst', builtin: true, pattern: 'radial', spacing: 10, angle: 0, curvature: 0, density: 100, direction: 'forward' },
  concentric: { $schema: 'esenho/mesh/v1', id: 'concentric', name: 'Concentric Rings', builtin: true, pattern: 'concentric', spacing: 8, angle: 0, curvature: 0, density: 100, direction: 'forward' },
  flow_field: { $schema: 'esenho/mesh/v1', id: 'flow_field', name: 'Fluid Flow Field', builtin: true, pattern: 'flow_field', spacing: 6, angle: 0, curvature: 25, density: 100, direction: 'forward' },
  voronoi: { $schema: 'esenho/mesh/v1', id: 'voronoi', name: 'Voronoi Crystals', builtin: true, pattern: 'voronoi', spacing: 12, angle: 0, curvature: 0, density: 90, direction: 'bidirectional' },
  stipple: { $schema: 'esenho/mesh/v1', id: 'stipple', name: 'Pointillist Stipple', builtin: true, pattern: 'stipple', spacing: 4, angle: 0, curvature: 0, density: 80, direction: 'forward' },
  scribble: { $schema: 'esenho/mesh/v1', id: 'scribble', name: 'Wandering Scribble', builtin: true, pattern: 'scribble', spacing: 8, angle: 0, curvature: 40, density: 100, direction: 'forward' },
  zigzag: { $schema: 'esenho/mesh/v1', id: 'zigzag', name: 'Zig-Zag Chevron', builtin: true, pattern: 'zigzag', spacing: 7, angle: 45, curvature: 0, density: 100, direction: 'bidirectional' },
  wave: { $schema: 'esenho/mesh/v1', id: 'wave', name: 'Harmonic Sine Wave', builtin: true, pattern: 'wave', spacing: 7, angle: 0, curvature: 30, density: 100, direction: 'bidirectional' },
  spiral: { $schema: 'esenho/mesh/v1', id: 'spiral', name: 'Archimedean Spiral', builtin: true, pattern: 'spiral', spacing: 7, angle: 0, curvature: 50, density: 100, direction: 'forward' },
  contour: { $schema: 'esenho/mesh/v1', id: 'contour', name: 'Topographic Contour Inset', builtin: true, pattern: 'contour', spacing: 6, angle: 0, curvature: 0, density: 100, direction: 'forward' }
};

// 8. Brush Fill Presets (.ebfill) - Standard Procedural Brush Fill Library
const brushFillPresets = existingData.brushFillPresets || {};

const standardBrushFills = {
  // ── Fine Art & Traditional Media ──
  bf_pencil_hatch: {
    id: "bf_pencil_hatch",
    name: "HB Pencil — Linear Hatch",
    category: "sketch",
    desc: "Natural graphite hatching with paper grain and loose bleed",
    color: "#282828",
    brushFill: {
      enabled: true,
      brush: "pencil",
      brushes: ["pencil"],
      pattern: "linear",
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
      clipMode: "bleed",
      bleedDistance: 8,
      bleedJitter: 50,
      colorPalette: ["#282828"]
    }
  },
  bf_charcoal_cross: {
    id: "bf_charcoal_cross",
    name: "Charcoal — Cross Shading",
    category: "charcoal",
    desc: "Rough charcoal tooth with pressure depth and bleed",
    color: "#1d2021",
    brushFill: {
      enabled: true,
      brush: "charcoal",
      brushSecondary: "soft_pencil",
      brushes: ["charcoal", "soft_pencil"],
      brushPickMode: "alternate",
      pattern: "crosshatch",
      spacing: 7,
      angle: 30,
      angle2: 120,
      strokeWidth: 2.8,
      strokeOpacity: 0.85,
      colorPalette: ["#1d2021", "#3c3836"],
      angleJitter: 4,
      widthJitter: 25,
      lengthJitter: 15,
      clipMode: "bleed",
      bleedDistance: 5
    }
  },
  bf_cross_contour_3d: {
    id: "bf_cross_contour_3d",
    name: "6B Graphite — Cross-Contour 3D",
    category: "sketch",
    desc: "Michelangelo style cross-contour volume shading",
    color: "#282828",
    brushFill: {
      enabled: true,
      brush: "soft_pencil",
      brushes: ["soft_pencil"],
      pattern: "cross_contour",
      spacing: 8,
      angle: 30,
      curvature: 30,
      curvatureMode: "arch",
      strokeWidth: 2.2,
      strokeOpacity: 0.8,
      colorPalette: ["#282828", "#3c3836"],
      clipMode: "strict"
    }
  },
  bf_sanguine_sketch: {
    id: "bf_sanguine_sketch",
    name: "Renaissance Sanguine — Da Vinci Sketch",
    category: "sketch",
    desc: "Classical terracotta chalk sketch cross-hatching",
    color: "#8c2d19",
    brushFill: {
      enabled: true,
      brush: "soft_pencil",
      brushes: ["soft_pencil", "soft_pastel"],
      brushPickMode: "alternate",
      pattern: "crosshatch",
      spacing: 7,
      angle: 38,
      angle2: 118,
      strokeWidth: 2.0,
      strokeOpacity: 0.82,
      colorPalette: ["#8c2d19", "#b85d38", "#d65d0e"],
      colorPickMode: "cycle",
      angleJitter: 4,
      widthJitter: 20,
      clipMode: "bleed",
      bleedDistance: 4
    }
  },
  bf_watercolor_wash: {
    id: "bf_watercolor_wash",
    name: "Watercolor — Fluid Wash",
    category: "paint",
    desc: "Fluid watercolor wash flow with soft bleeding edges",
    color: "#83a598",
    brushFill: {
      enabled: true,
      brush: "watercolor",
      brushes: ["watercolor"],
      pattern: "wave",
      spacing: 9,
      angle: 25,
      strokeWidth: 4,
      strokeOpacity: 0.65,
      colorMode: "palette",
      colorPalette: ["#83a598", "#458588", "#8ec07c"],
      colorPickMode: "cycle",
      widthJitter: 30,
      opacityJitter: 25,
      clipMode: "bleed",
      bleedDistance: 6
    }
  },
  bf_wet_watercolor: {
    id: "bf_wet_watercolor",
    name: "Wet-on-Wet — Watercolor Bloom",
    category: "paint",
    desc: "Translucent wet pigments diffusing in organic sine waves",
    color: "#458588",
    brushFill: {
      enabled: true,
      brush: "watercolor",
      brushes: ["watercolor"],
      pattern: "wave",
      spacing: 11,
      angle: 15,
      waveFrequency: 6,
      waveAmplitude: 60,
      strokeWidth: 5.5,
      strokeOpacity: 0.48,
      colorMode: "palette",
      colorPalette: ["#458588", "#83a598", "#b16286", "#689d6a"],
      colorPickMode: "cycle",
      widthJitter: 35,
      opacityJitter: 30,
      clipMode: "bleed",
      bleedDistance: 10
    }
  },
  bf_oil_spiral: {
    id: "bf_oil_spiral",
    name: "Oil Impasto — Spiral Vortex",
    category: "paint",
    desc: "Thick wet impasto paint swirling in Archimedean spiral",
    color: "#d79921",
    brushFill: {
      enabled: true,
      brush: "oil",
      brushes: ["oil"],
      pattern: "spiral",
      spacing: 6,
      strokeWidth: 2.5,
      strokeOpacity: 0.9,
      colorPalette: ["#d79921", "#b57614"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },
  bf_oil_impasto_knife: {
    id: "bf_oil_impasto_knife",
    name: "Oil Impasto — Palette Knife Strokes",
    category: "paint",
    desc: "Heavy, expressive palette knife zig-zag directional strokes",
    color: "#fabd2f",
    brushFill: {
      enabled: true,
      brush: "oil",
      brushes: ["oil", "acrylic"],
      brushPickMode: "alternate",
      pattern: "zigzag",
      spacing: 9,
      angle: 60,
      strokeWidth: 4.2,
      strokeOpacity: 0.92,
      colorPalette: ["#fabd2f", "#d79921", "#fe8019", "#cc241d"],
      colorPickMode: "cycle",
      widthJitter: 40,
      clipMode: "strict"
    }
  },
  bf_flow_stream: {
    id: "bf_flow_stream",
    name: "Wet Acrylic — Van Gogh Flow Field",
    category: "paint",
    desc: "Expressive swirling streamline curves following curl vector noise",
    color: "#458588",
    brushFill: {
      enabled: true,
      brush: "acrylic",
      brushSecondary: "oil",
      brushes: ["acrylic", "oil"],
      brushPickMode: "alternate",
      pattern: "flow_field",
      spacing: 9,
      waveFrequency: 10,
      strokeWidth: 3.5,
      strokeOpacity: 0.88,
      colorPalette: ["#458588", "#fabd2f", "#fe8019", "#b8bb26"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },
  bf_pastel_scribble: {
    id: "bf_pastel_scribble",
    name: "Soft Pastel — Wandering Scribble",
    category: "charcoal",
    desc: "Chalk scribble wandering flow across vector contours",
    color: "#d79921",
    brushFill: {
      enabled: true,
      brush: "soft_pastel",
      brushes: ["soft_pastel"],
      pattern: "scribble",
      spacing: 6,
      strokeWidth: 2.2,
      strokeOpacity: 0.75,
      colorPalette: ["#d79921", "#fe8019"],
      colorPickMode: "cycle",
      widthJitter: 25,
      clipMode: "bleed",
      bleedDistance: 4
    }
  },
  bf_crayon_rough: {
    id: "bf_crayon_rough",
    name: "Wax Crayon — Rough Bleed Scribble",
    category: "sketch",
    desc: "Energetic wax crayon scribbling breaking past boundaries",
    color: "#fb4934",
    brushFill: {
      enabled: true,
      brush: "soft_pastel",
      brushes: ["soft_pastel"],
      pattern: "scribble",
      spacing: 5,
      strokeWidth: 3.0,
      strokeOpacity: 0.88,
      colorPalette: ["#fb4934", "#fe8019", "#fabd2f"],
      colorPickMode: "cycle",
      widthJitter: 35,
      clipMode: "bleed",
      bleedDistance: 9,
      bleedJitter: 60
    }
  },

  // ── Manga, Comics & Ink ──
  bf_inker_cross: {
    id: "bf_inker_cross",
    name: "Studio Inker — Crosshatch",
    category: "ink",
    desc: "Comic cross-hatching with dynamic inker line weight",
    color: "#1d2021",
    brushFill: {
      enabled: true,
      brush: "inker",
      brushes: ["inker"],
      pattern: "crosshatch",
      spacing: 6,
      angle: 45,
      angle2: 135,
      strokeWidth: 1.5,
      strokeOpacity: 0.9,
      colorPalette: ["#1d2021"],
      clipMode: "strict"
    }
  },
  bf_gpen_woodcut: {
    id: "bf_gpen_woodcut",
    name: "Manga G-Pen — Woodcut Wave",
    category: "ink",
    desc: "Expressive dip pen undulating timber engraving",
    color: "#282828",
    brushFill: {
      enabled: true,
      brush: "gpen",
      brushes: ["gpen"],
      pattern: "wave",
      spacing: 7,
      angle: 15,
      strokeWidth: 2.4,
      strokeOpacity: 0.95,
      widthJitter: 35,
      colorPalette: ["#282828"],
      clipMode: "strict"
    }
  },
  bf_vintage_engraving: {
    id: "bf_vintage_engraving",
    name: "Copperplate — Vintage Engraving",
    category: "ink",
    desc: "Intaglio copperplate etching with triple fine-line crosshatch",
    color: "#1d2021",
    brushFill: {
      enabled: true,
      brush: "gpen",
      brushes: ["gpen", "tech_pen"],
      brushPickMode: "alternate",
      pattern: "triple_hatch",
      spacing: 5,
      angle: 15,
      angle2: 75,
      angle3: 135,
      strokeWidth: 1.1,
      strokeOpacity: 0.96,
      colorPalette: ["#1d2021"],
      clipMode: "strict"
    }
  },
  bf_manga_speedlines: {
    id: "bf_manga_speedlines",
    name: "Manga Action — Radial Speedlines",
    category: "ink",
    desc: "High-impact radial burst lines focusing inward",
    color: "#1d2021",
    brushFill: {
      enabled: true,
      brush: "gpen",
      brushes: ["gpen"],
      pattern: "radial",
      spacing: 5,
      originX: 50,
      originY: 50,
      strokeWidth: 1.8,
      strokeOpacity: 0.98,
      widthJitter: 40,
      lengthJitter: 25,
      colorPalette: ["#1d2021"],
      clipMode: "strict"
    }
  },
  bf_screentone_stipple: {
    id: "bf_screentone_stipple",
    name: "Manga Screentone — Uniform Dot Tone",
    category: "ink",
    desc: "Evenly dispersed mechanical stippling for comic tone shading",
    color: "#3c3836",
    brushFill: {
      enabled: true,
      brush: "tech_pen",
      brushes: ["tech_pen"],
      pattern: "stipple",
      spacing: 4,
      strokeWidth: 1.6,
      strokeOpacity: 0.95,
      colorPalette: ["#3c3836"],
      clipMode: "strict"
    }
  },
  bf_fountain_contour: {
    id: "bf_fountain_contour",
    name: "Calligraphy Chisel — Topographic Contour",
    category: "ink",
    desc: "Angled chisel fountain pen following concentric contour insets",
    color: "#458588",
    brushFill: {
      enabled: true,
      brush: "fountain",
      brushes: ["fountain"],
      pattern: "contour",
      spacing: 6,
      strokeWidth: 2,
      strokeOpacity: 0.9,
      colorPalette: ["#458588", "#83a598"],
      clipMode: "strict"
    }
  },
  bf_moebius_linework: {
    id: "bf_moebius_linework",
    name: "Moebius Sci-Fi — Concentric Linework",
    category: "ink",
    desc: "Clean European sci-fi comic organic contour hatching",
    color: "#076678",
    brushFill: {
      enabled: true,
      brush: "inker",
      brushes: ["inker"],
      pattern: "contour",
      spacing: 5,
      strokeWidth: 1.4,
      strokeOpacity: 0.95,
      colorPalette: ["#076678", "#458588", "#83a598"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },
  bf_voronoi_facets: {
    id: "bf_voronoi_facets",
    name: "Dry Ink — Voronoi Cellular Mesh",
    category: "ink",
    desc: "Organic cellular crystal partitions with rough dry brush edges",
    color: "#1d2021",
    brushFill: {
      enabled: true,
      brush: "dry_ink",
      brushes: ["dry_ink"],
      pattern: "voronoi",
      spacing: 12,
      strokeWidth: 2.2,
      strokeOpacity: 0.9,
      colorPalette: ["#1d2021", "#282828"],
      clipMode: "strict"
    }
  },

  // ── Architecture & Technical Drafting ──
  bf_techpen_triple: {
    id: "bf_techpen_triple",
    name: "Technical Pen — Triple Hatch",
    category: "drafting",
    desc: "Crisp drafting pen with mechanical triple-hatch angle grid",
    color: "#1d2021",
    brushFill: {
      enabled: true,
      brush: "tech_pen",
      brushes: ["tech_pen"],
      pattern: "triple_hatch",
      spacing: 7,
      angle: 0,
      angle2: 60,
      angle3: 120,
      strokeWidth: 1.2,
      strokeOpacity: 0.95,
      colorPalette: ["#1d2021"],
      clipMode: "strict"
    }
  },
  bf_herringbone_tweed: {
    id: "bf_herringbone_tweed",
    name: "Mechanical Pencil — Herringbone Tweed",
    category: "drafting",
    desc: "Classic architectural herringbone chevron hatching",
    color: "#504945",
    brushFill: {
      enabled: true,
      brush: "mech_pencil",
      brushes: ["mech_pencil"],
      pattern: "herringbone",
      spacing: 8,
      angle: 45,
      strokeWidth: 1.5,
      strokeOpacity: 0.9,
      colorPalette: ["#504945", "#3c3836"],
      clipMode: "strict"
    }
  },
  bf_woven_basket: {
    id: "bf_woven_basket",
    name: "Washi Graphite — Woven Basketweave",
    category: "drafting",
    desc: "Interlocking woven perpendicular fiber strokes",
    color: "#665c54",
    brushFill: {
      enabled: true,
      brush: "washi_sketch",
      brushes: ["washi_sketch"],
      pattern: "woven",
      spacing: 8,
      angle: 0,
      strokeWidth: 1.8,
      strokeOpacity: 0.85,
      colorPalette: ["#665c54", "#7c6f64"],
      clipMode: "strict"
    }
  },
  bf_radial_sunburst: {
    id: "bf_radial_sunburst",
    name: "Technical Pen — Radial Sunburst",
    category: "drafting",
    desc: "Precision drafting rays radiating outward from center",
    color: "#d65d0e",
    brushFill: {
      enabled: true,
      brush: "tech_pen",
      brushes: ["tech_pen"],
      pattern: "radial",
      spacing: 6,
      originX: 50,
      originY: 50,
      strokeWidth: 1.2,
      strokeOpacity: 0.95,
      colorPalette: ["#d65d0e", "#fabd2f", "#fe8019"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },
  bf_concentric_zen: {
    id: "bf_concentric_zen",
    name: "Studio Inker — Concentric Zen Rings",
    category: "drafting",
    desc: "Harmonic concentric circular ripple arcs",
    color: "#076678",
    brushFill: {
      enabled: true,
      brush: "inker",
      brushes: ["inker"],
      pattern: "concentric",
      spacing: 7,
      originX: 50,
      originY: 50,
      strokeWidth: 2,
      strokeOpacity: 0.9,
      colorPalette: ["#076678", "#458588", "#83a598"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },
  bf_arch_concrete: {
    id: "bf_arch_concrete",
    name: "Architectural — Porous Concrete Stipple",
    category: "drafting",
    desc: "Stochastic micro-stippling simulating porous architectural concrete",
    color: "#7c6f64",
    brushFill: {
      enabled: true,
      brush: "pencil",
      brushes: ["pencil", "dry_ink"],
      brushPickMode: "alternate",
      pattern: "stipple",
      spacing: 5,
      strokeWidth: 2.2,
      strokeOpacity: 0.85,
      colorPalette: ["#7c6f64", "#928374", "#504945"],
      colorPickMode: "random",
      widthJitter: 35,
      opacityJitter: 25,
      clipMode: "strict"
    }
  },
  bf_topo_elevation: {
    id: "bf_topo_elevation",
    name: "Cartography — Topographic Elevation Map",
    category: "drafting",
    desc: "Smooth elevation contour curves in cartographic terrain palette",
    color: "#689d6a",
    brushFill: {
      enabled: true,
      brush: "tech_pen",
      brushes: ["tech_pen"],
      pattern: "contour",
      spacing: 7,
      strokeWidth: 1.4,
      strokeOpacity: 0.92,
      colorPalette: ["#689d6a", "#8ec07c", "#d79921", "#b57614"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },

  // ── Modern, Pop Art & Graphic ──
  bf_spray_stipple: {
    id: "bf_spray_stipple",
    name: "Spray Can — Pointillist Stipple",
    category: "graphic",
    desc: "Multi-color dispersed paint splatter and aerosol dabs",
    color: "#fabd2f",
    brushFill: {
      enabled: true,
      brush: "spray",
      brushes: ["spray"],
      pattern: "stipple",
      spacing: 5,
      strokeWidth: 3,
      strokeOpacity: 0.9,
      colorMode: "palette",
      colorPalette: ["#fe8019", "#fabd2f", "#b8bb26", "#8ec07c", "#83a598", "#d3869b"],
      colorPickMode: "random",
      colorJitter: 10,
      widthJitter: 30,
      opacityJitter: 20,
      clipMode: "strict"
    }
  },
  bf_marker_flow: {
    id: "bf_marker_flow",
    name: "Art Marker — Cyber Flow",
    category: "graphic",
    desc: "Broad chisel marker flow field with palette cycling",
    color: "#00ffcc",
    brushFill: {
      enabled: true,
      brush: "marker",
      brushes: ["marker"],
      pattern: "zigzag",
      spacing: 10,
      angle: 90,
      strokeWidth: 2.2,
      strokeOpacity: 0.9,
      colorMode: "palette",
      colorPalette: ["#00ffcc", "#ff0055", "#7928ca"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  },
  bf_cyberpunk_glitch: {
    id: "bf_cyberpunk_glitch",
    name: "Cyberpunk Neon — Glitch Scanlines",
    category: "graphic",
    desc: "High-contrast neon zigzag scanlines with chromatic offsets",
    color: "#00f5d4",
    brushFill: {
      enabled: true,
      brush: "marker",
      brushes: ["marker", "tech_pen"],
      brushPickMode: "alternate",
      pattern: "zigzag",
      spacing: 8,
      angle: 0,
      strokeWidth: 2.5,
      strokeOpacity: 0.95,
      colorPalette: ["#00f5d4", "#7b2cbf", "#f72585", "#4361ee"],
      colorPickMode: "cycle",
      positionJitter: 4,
      widthJitter: 25,
      clipMode: "strict"
    }
  },
  bf_vaporwave_sunset: {
    id: "bf_vaporwave_sunset",
    name: "Vaporwave Sunset — Harmonic Wave Flow",
    category: "graphic",
    desc: "Harmonic undulating sine waves in retro sunset synth palette",
    color: "#ff007f",
    brushFill: {
      enabled: true,
      brush: "marker",
      brushes: ["marker"],
      pattern: "wave",
      spacing: 9,
      angle: 0,
      waveFrequency: 6,
      waveAmplitude: 45,
      strokeWidth: 2.8,
      strokeOpacity: 0.9,
      colorPalette: ["#ff007f", "#ff7700", "#ffdd00", "#7928ca", "#00f0ff"],
      colorPickMode: "cycle",
      clipMode: "strict"
    }
  }
};

for (const [id, item] of Object.entries(standardBrushFills)) {
  brushFillPresets[id] = {
    $schema: 'esenho/brush_fill/v1',
    id: id,
    name: item.name,
    category: item.category || 'brushfills',
    desc: item.desc || '',
    color: item.color || '#282828',
    brushFill: item.brushFill,
    builtin: true
  };

  // Keep materials synchronized for complete backwards compatibility
  materials[id] = {
    $schema: 'esenho/material/v1',
    id: id,
    name: item.name,
    category: 'brushfills',
    desc: item.desc || '',
    color: item.color || '#282828',
    mode: 'brushfill',
    brushFill: item.brushFill,
    builtin: true
  };
}

// Ensure all materials have explicit mutually exclusive mode ('standard' vs 'brushfill')
for (const [mId, mObj] of Object.entries(materials)) {
  if (!mObj.mode) {
    mObj.mode = (mObj.category === 'brushfills' || (mObj.brushFill && mObj.brushFill.enabled)) ? 'brushfill' : 'standard';
  }
}

// Assemble Master Standard Schema
const dataPackage = {
  $schema: 'esenho/data/v1',
  version: '1.0.0',
  name: 'Esenho Universal Standard Resources',
  description: 'Unified single-file resource library for brush presets, textures, brush tips, materials, curves, meshes, wasm fx plugins, palettes, and brush fill presets.',
  exportedAt: new Date().toISOString(),
  stats: {
    brushPresets: Object.keys(brushPresets).length,
    textures: Object.keys(textures).length,
    brushTips: Object.keys(brushTips).length,
    materials: Object.keys(materials).length,
    curves: Object.keys(curves).length,
    meshes: Object.keys(meshes).length,
    wasmFx: Object.keys(wasmFx).length,
    palettes: Object.keys(palettes).length,
    brushFillPresets: Object.keys(brushFillPresets).length,
    hasWasmCore: Boolean(wasmCore)
  },
  wasmCore,
  brushPresets,
  textures,
  brushTips,
  materials,
  curves,
  meshes,
  wasmFx,
  palettes,
  brushFillPresets
};

const outPath = path.join(__dirname, '../data.json');
const jsonString = JSON.stringify(dataPackage, null, 2);
fs.writeFileSync(outPath, jsonString, 'utf8');

console.log('Successfully generated canonical single data pack:');
console.log('  - data.json (' + Math.round(jsonString.length / 1024) + ' KB)');
console.log('Stats:', JSON.stringify(dataPackage.stats, null, 2));
