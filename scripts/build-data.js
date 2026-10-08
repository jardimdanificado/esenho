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

// Assemble Master Standard Schema
const dataPackage = {
  $schema: 'esenho/data/v1',
  version: '1.0.0',
  name: 'Esenho Universal Standard Resources',
  description: 'Unified single-file resource library for brush presets, textures, brush tips, materials, curves, meshes, wasm fx plugins, and palettes.',
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
  palettes
};

const outPath = path.join(__dirname, '../data.json');
const jsonString = JSON.stringify(dataPackage, null, 2);
fs.writeFileSync(outPath, jsonString, 'utf8');

console.log('Successfully generated canonical single data pack:');
console.log('  - data.json (' + Math.round(jsonString.length / 1024) + ' KB)');
console.log('Stats:', JSON.stringify(dataPackage.stats, null, 2));
