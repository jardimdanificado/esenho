/**
 * scripts/compile-js-brushes-to-c.js
 * AOT Compiler: Generates Standalone Zero-Copy C99 WASM Brush Plugins from JS Presets.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const presetsFile = path.resolve(rootDir, 'src/presets_data.js');
const brushesDir = path.resolve(rootDir, 'src/plugins/brushes');

if (!fs.existsSync(brushesDir)) {
  fs.mkdirSync(brushesDir, { recursive: true });
}

const presetsCode = fs.readFileSync(presetsFile, 'utf8');
const fn = new Function(presetsCode + '; return CURATED_BRUSH_PRESETS;');
const presets = fn();

const ignoredTools = new Set(['fill', 'flood_fill', 'lasso', 'lasso_fill']);

function sanitizeString(str) {
  return String(str || '').replace(/"/g, '\\"');
}

let generatedCount = 0;

for (const [id, preset] of Object.entries(presets)) {
  if (ignoredTools.has(id)) continue;

  const proceduralCustom = new Set([
    'aurora_borealis', 'bioluminescence_jellyfish', 'biomimetic_gecko_setae',
    'bristle_oil', 'caustic_water_sunlight', 'cellular_automata_brians_brain',
    'chromatic_holo_warp', 'crystal_birefringence_calcite', 'crystal_growth_dendrite',
    'dragon_scale_armor', 'electric_discharge_kirlian', 'ferroelectric_domain_walls',
    'ferrofluid_magnetic', 'fiber_optic_strands', 'fluid_smoke_swirl',
    'fractal_lightning', 'glitch_datamosh_matrix', 'gravitational_lens_einstein',
    'holographic_interference', 'holographic_stereogram', 'iridescent_soap_bubble',
    'lichen_symbiosis', 'liquid_mercury_chrome', 'magma_crust_tectonic',
    'magnetohydrodynamic_dynamo', 'metamaterial_invisibility', 'meteor_shower_bolide',
    'moire_interference_silk', 'mycelium_hyphae', 'nebula_stellar_birth',
    'neon_cyber_circuit', 'neon_glow', 'origami_kaleido', 'particle_spray',
    'peacock_feather_barbules', 'pixel_dither', 'plasma_ball_arc',
    'prismatic_refract_kaleidoscope', 'quantum_chroma_tunnel',
    'quantum_probability_cloud', 'radioactive_cloud_chamber', 'reaction_diffusion',
    'sand_dune_ripples', 'sand_sim', 'slime_mold_physarum', 'smoke_ring_vortex',
    'solar_flare_prominence', 'sonoluminescence_bubble', 'soundwave_cymatics',
    'superfluid_helium_vortices', 'supernova_shockwave', 'thermal_pyro',
    'topographic_contour_isolines', 'voronoi_mosaic', 'watercolor_bleed',
    'xray_radiography_bone'
  ]);
  if (proceduralCustom.has(id)) continue;

  const targetC = path.join(brushesDir, `${id}.c`);

  const flatPreset = { ...preset };
  if (preset.tip && typeof preset.tip === 'object') {
    if (preset.tip.ref) flatPreset.shape = preset.tip.ref;
    for (const [k, v] of Object.entries(preset.tip)) {
      if (typeof v !== 'object' && flatPreset[k] === undefined) flatPreset[k] = v;
    }
  }
  if (preset.dynamics && typeof preset.dynamics === 'object') {
    for (const [dk, dv] of Object.entries(preset.dynamics)) {
      if (dk === 'stabilizer' && typeof dv === 'object') {
        if (dv.smoothing !== undefined && flatPreset.smoothing === undefined) flatPreset.smoothing = dv.smoothing;
        if (dv.mode !== undefined && flatPreset.stabilizer_mode === undefined) flatPreset.stabilizer_mode = dv.mode;
      } else if (dk === 'taper' && typeof dv === 'object') {
        if (dv.in !== undefined && flatPreset.taper_in === undefined) flatPreset.taper_in = dv.in;
        if (dv.out !== undefined && flatPreset.taper_out === undefined) flatPreset.taper_out = dv.out;
      } else if (dk === 'pressureSize' && flatPreset.pressure_size === undefined) {
        flatPreset.pressure_size = dv ? 1 : 0;
      } else if (dk === 'pressureFlow' && flatPreset.pressure_flow === undefined) {
        flatPreset.pressure_flow = dv ? 1 : 0;
      } else if (dk === 'tiltAngle' && flatPreset.tilt_angle === undefined) {
        flatPreset.tilt_angle = dv ? 1 : 0;
      } else if (dk === 'velocityScaling' && flatPreset.velocity === undefined) {
        flatPreset.velocity = dv;
      } else if (typeof dv !== 'object' && flatPreset[dk] === undefined) {
        flatPreset[dk] = dv;
      }
    }
  }
  if (preset.wet && typeof preset.wet === 'object') {
    for (const [wk, wv] of Object.entries(preset.wet)) {
      if (typeof wv !== 'object' && flatPreset[wk] === undefined) flatPreset[wk] = wv;
    }
  }
  if (preset.jitter && typeof preset.jitter === 'object') {
    for (const [jk, jv] of Object.entries(preset.jitter)) {
      const mappedKey = jk === 'size' ? 'size_jitter' : (jk === 'angle' ? 'angle_jitter' : (jk === 'opacity' ? 'opacity_jitter' : (jk === 'color' ? 'color_jitter' : jk)));
      if (typeof jv !== 'object' && flatPreset[mappedKey] === undefined) flatPreset[mappedKey] = jv;
    }
  }

  const name = id;
  const title = flatPreset.name || id;
  const category = flatPreset.category || 'general';
  const spacing = ((flatPreset.spacing !== undefined ? flatPreset.spacing : 5) / 100.0).toFixed(3);
  const minRadius = Math.max(1, Math.floor((flatPreset.size || 8) * 0.25));
  const maxRadius = Math.max(100, Math.floor((flatPreset.size || 16) * 3));

  // Determine which properties this brush defines
  const propList = [];

  // Core properties
  propList.push({
    id: 'size',
    name: 'Size',
    type: 'int',
    min: minRadius,
    max: maxRadius,
    default: flatPreset.size || 16,
    unit: 'px'
  });

  if (flatPreset.opacity !== undefined) {
    propList.push({
      id: 'opacity',
      name: 'Opacity',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.opacity,
      unit: '%'
    });
  }

  if (flatPreset.hardness !== undefined) {
    propList.push({
      id: 'hardness',
      name: 'Hardness',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.hardness,
      unit: '%'
    });
  }

  if (flatPreset.flow !== undefined) {
    propList.push({
      id: 'flow',
      name: 'Flow',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.flow,
      unit: '%'
    });
  }

  if (flatPreset.grain !== undefined || flatPreset.tex_mode !== undefined) {
    propList.push({
      id: 'grain',
      name: 'Paper Grain',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.grain !== undefined ? flatPreset.grain : (flatPreset.tex_mode ? 40 : 0),
      unit: '%'
    });
  }

  if (flatPreset.spacing !== undefined) {
    propList.push({
      id: 'spacing',
      name: 'Spacing',
      type: 'int',
      min: 1,
      max: 100,
      default: flatPreset.spacing,
      unit: '%'
    });
  }

  if (flatPreset.shape !== undefined) {
    const shapeVal = typeof flatPreset.shape === 'number' ? flatPreset.shape : (flatPreset.shape === 'square' ? 1 : (flatPreset.shape === 'chisel' ? 2 : 0));
    propList.push({
      id: 'shape',
      name: 'Tip Shape',
      type: 'int',
      min: 0,
      max: 5,
      default: shapeVal
    });
  }

  if (flatPreset.dab_blend !== undefined) {
    const blendVal = typeof flatPreset.dab_blend === 'number' ? flatPreset.dab_blend : (flatPreset.dab_blend === 'multiply' ? 1 : 0);
    propList.push({
      id: 'dab_blend',
      name: 'Dab Blend Mode',
      type: 'int',
      min: 0,
      max: 5,
      default: blendVal
    });
  }

  if (flatPreset.tex_mode !== undefined) {
    propList.push({
      id: 'tex_mode',
      name: 'Texture Mode',
      type: 'int',
      min: 0,
      max: 13,
      default: flatPreset.tex_mode
    });
  }

  if (flatPreset.texture_contrast !== undefined) {
    propList.push({
      id: 'texture_contrast',
      name: 'Texture Contrast',
      type: 'int',
      min: 0,
      max: 200,
      default: flatPreset.texture_contrast,
      unit: '%'
    });
  }

  if (flatPreset.texture_scale !== undefined) {
    propList.push({
      id: 'texture_scale',
      name: 'Texture Scale',
      type: 'int',
      min: 10,
      max: 300,
      default: flatPreset.texture_scale,
      unit: '%'
    });
  }

  if (flatPreset.buildup !== undefined) {
    propList.push({
      id: 'buildup',
      name: 'Continuous Buildup',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.buildup ? 1 : 0
    });
  }

  if (flatPreset.velocity !== undefined) {
    propList.push({
      id: 'velocity',
      name: 'Velocity Scaling',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.velocity,
      unit: '%'
    });
  }

  if (flatPreset.smudge !== undefined || flatPreset.smudge_strength !== undefined) {
    propList.push({
      id: 'smudge_strength',
      name: 'Smudge Strength',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.smudge_strength !== undefined ? flatPreset.smudge_strength : (flatPreset.smudge !== undefined ? flatPreset.smudge : 50),
      unit: '%'
    });
  }

  if (flatPreset.scatter !== undefined) {
    propList.push({
      id: 'scatter',
      name: 'Scatter',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.scatter,
      unit: '%'
    });
  }

  if (flatPreset.roundness !== undefined) {
    propList.push({
      id: 'roundness',
      name: 'Roundness',
      type: 'int',
      min: 1,
      max: 100,
      default: flatPreset.roundness,
      unit: '%'
    });
  }

  if (flatPreset.angle !== undefined) {
    propList.push({
      id: 'angle',
      name: 'Angle',
      type: 'int',
      min: 0,
      max: 360,
      default: flatPreset.angle,
      unit: 'deg'
    });
  }

  if (flatPreset.auto_rotate !== undefined) {
    propList.push({
      id: 'auto_rotate',
      name: 'Follow Direction',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.auto_rotate ? 1 : 0
    });
  }

  if (flatPreset.taper_in !== undefined) {
    propList.push({
      id: 'taper_in',
      name: 'Taper In',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.taper_in,
      unit: '%'
    });
  }

  if (flatPreset.taper_out !== undefined) {
    propList.push({
      id: 'taper_out',
      name: 'Taper Out',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.taper_out,
      unit: '%'
    });
  }

  if (flatPreset.water !== undefined) {
    propList.push({
      id: 'water',
      name: 'Water Wetness',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.water,
      unit: '%'
    });
  }

  if (flatPreset.bleed !== undefined) {
    propList.push({
      id: 'bleed',
      name: 'Bleed Diffusion',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.bleed,
      unit: '%'
    });
  }

  if (flatPreset.fringe !== undefined) {
    propList.push({
      id: 'fringe',
      name: 'Edge Fringe',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.fringe,
      unit: '%'
    });
  }

  if (flatPreset.granulation !== undefined) {
    propList.push({
      id: 'granulation',
      name: 'Pigment Granulation',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.granulation,
      unit: '%'
    });
  }

  if (flatPreset.impasto !== undefined) {
    propList.push({
      id: 'impasto',
      name: '3D Impasto Relief',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.impasto,
      unit: '%'
    });
  }

  if (flatPreset.wetness !== undefined) {
    propList.push({
      id: 'wetness',
      name: 'Wet Color Mixing',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.wetness,
      unit: '%'
    });
  }

  if (flatPreset.color_pickup !== undefined) {
    propList.push({
      id: 'color_pickup',
      name: 'Color Pickup',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.color_pickup,
      unit: '%'
    });
  }

  if (flatPreset.depletion !== undefined) {
    propList.push({
      id: 'depletion',
      name: 'Paint Depletion',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.depletion,
      unit: '%'
    });
  }

  if (flatPreset.pigment_mode !== undefined) {
    propList.push({
      id: 'pigment_mode',
      name: 'Subtractive Pigment (CMY)',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.pigment_mode ? 1 : 0
    });
  }

  if (flatPreset.pressure_size !== undefined) {
    propList.push({
      id: 'pressure_size',
      name: 'Pressure Size',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.pressure_size ? 1 : 0
    });
  }

  if (flatPreset.pressure_flow !== undefined) {
    propList.push({
      id: 'pressure_flow',
      name: 'Pressure Flow',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.pressure_flow ? 1 : 0
    });
  }

  if (flatPreset.tilt_angle !== undefined) {
    propList.push({
      id: 'tilt_angle',
      name: 'Stylus Tilt Shading',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.tilt_angle ? 1 : 0
    });
  }

  if (flatPreset.smoothing !== undefined) {
    propList.push({
      id: 'smoothing',
      name: 'Streamline Smoothing',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.smoothing,
      unit: '%'
    });
  }

  if (flatPreset.stabilizer_mode !== undefined) {
    propList.push({
      id: 'stabilizer_mode',
      name: 'Stabilizer Mode',
      type: 'int',
      min: 0,
      max: 3,
      default: typeof flatPreset.stabilizer_mode === 'number' ? flatPreset.stabilizer_mode : 1
    });
  }

  if (flatPreset.string_length !== undefined) {
    propList.push({
      id: 'string_length',
      name: 'Pulled String Length',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.string_length,
      unit: 'px'
    });
  }

  if (flatPreset.tolerance !== undefined) {
    propList.push({
      id: 'tolerance',
      name: 'Fill Tolerance',
      type: 'int',
      min: 0,
      max: 255,
      default: flatPreset.tolerance
    });
  }

  if (flatPreset.size_jitter !== undefined) {
    propList.push({
      id: 'size_jitter',
      name: 'Size Jitter',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.size_jitter,
      unit: '%'
    });
  }

  if (flatPreset.angle_jitter !== undefined) {
    propList.push({
      id: 'angle_jitter',
      name: 'Angle Jitter',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.angle_jitter,
      unit: '%'
    });
  }

  if (flatPreset.opacity_jitter !== undefined) {
    propList.push({
      id: 'opacity_jitter',
      name: 'Opacity Jitter',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.opacity_jitter,
      unit: '%'
    });
  }

  if (flatPreset.drying_rate !== undefined) {
    propList.push({
      id: 'drying_rate',
      name: 'Drying Rate',
      type: 'int',
      min: 0,
      max: 100,
      default: flatPreset.drying_rate,
      unit: '%'
    });
  }

  if (flatPreset.tex_scale_with_size !== undefined) {
    propList.push({
      id: 'tex_scale_with_size',
      name: 'Scale Texture With Size',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.tex_scale_with_size ? 1 : 0
    });
  }

  if (flatPreset.subpixel !== undefined) {
    propList.push({
      id: 'subpixel',
      name: 'Subpixel Precision',
      type: 'bool',
      min: 0,
      max: 1,
      default: flatPreset.subpixel ? 1 : 0
    });
  }

  const isEraser = (flatPreset.eraser === 1 || id.includes('eraser'));
  const isSmudge = (flatPreset.mode === 1 || id.includes('smudge') || id.includes('blend'));
  const isMarker = (flatPreset.dab_blend === 1 || id.includes('marker') || id.includes('highlighter'));
  const isWatercolor = (flatPreset.water !== undefined || id.includes('watercolor') || id.includes('wash'));
  const isImpasto = (flatPreset.impasto !== undefined && flatPreset.impasto > 0);
  const isPixel = (id === 'pixel');
  const isCrosshatch = (id === 'crosshatch' || id === 'vintage_engraving');
  const isHalftone = (id === 'halftone');

  // Build JSON for w_brush_get_info
  const jsonInfo = {
    name,
    title,
    category,
    engine: 'parametric',
    spacing: parseFloat(spacing),
    minRadius,
    maxRadius,
    params: propList
  };

  const jsonStr = JSON.stringify(jsonInfo).replace(/"/g, '\\"');

  // Generate C code
  let cSrc = `/**
 * =========================================================================
 * Zero-Copy WASM Brush: ${title} (${id}.c)
 * Category: ${category}
 * AOT Compiled for Esenho Zero-Copy WebAssembly Brush Protocol
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

`;

  // Static parameter variables
  propList.forEach((p, idx) => {
    cSrc += `static int32_t g_${p.id} = ${p.default};\n`;
  });

  cSrc += `static float g_depletion_charge = 1.0f;
static float g_stroke_dist = 0.0f;

W_EXPORT const char* w_brush_get_info(void) {
    return "${jsonStr}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    (void)canvas_w;
    (void)canvas_h;
    g_depletion_charge = 1.0f;
    g_stroke_dist = 0.0f;
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
`;

  propList.forEach((p, idx) => {
    cSrc += `        case ${idx}: g_${p.id} = value; break;\n`;
  });

  cSrc += `        default: break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    (void)pressure;
    (void)tilt_x;
    (void)tilt_y;
    (void)color;
    (void)is_eraser;
    g_depletion_charge = 1.0f;
    g_stroke_dist = 0.0f;
    w_brush_srand((uint32_t)(x * 1234.5f + y * 678.9f + 1.0f));
}

W_EXPORT void w_brush_stroke_end(void) {}

W_EXPORT void w_brush_render_dab(
    uint32_t *pixels,
    int32_t canvas_w,
    int32_t canvas_h,
    float cx, float cy,
    float radius,
    float pressure,
    float angle_deg,
    float speed,
    uint32_t color,
    int32_t is_eraser
) {
    if (!pixels || canvas_w <= 0 || canvas_h <= 0) return;

    float eff_pressure = (pressure > 0.01f) ? pressure : 0.5f;
    float eff_r = radius;
`;

  // Pressure sizing
  if (propList.some(p => p.id === 'pressure_size')) {
    cSrc += `    if (g_pressure_size) {
        eff_r = radius * (0.2f + 0.8f * eff_pressure);
    }
`;
  }

  // Taper in / out
  if (propList.some(p => p.id === 'taper_in')) {
    cSrc += `    g_stroke_dist += eff_r * 0.5f;
    if (g_taper_in > 0 && g_stroke_dist < (float)g_taper_in * 3.0f) {
        float tin = g_stroke_dist / ((float)g_taper_in * 3.0f);
        if (tin < 0.2f) tin = 0.2f;
        eff_r *= tin;
    }
`;
  }

  // Depletion
  if (propList.some(p => p.id === 'depletion')) {
    cSrc += `    if (g_depletion > 0) {
        g_depletion_charge -= (float)g_depletion * 0.0008f;
        if (g_depletion_charge < 0.15f) g_depletion_charge = 0.15f;
    }
`;
  }

  // Scatter
  if (propList.some(p => p.id === 'scatter')) {
    cSrc += `    if (g_scatter > 0) {
        float sc_mag = (float)g_scatter * 0.01f * eff_r;
        cx += w_brush_rand_symf() * sc_mag;
        cy += w_brush_rand_symf() * sc_mag;
    }
`;
  }

  cSrc += `
    if (eff_r < 0.5f) eff_r = 0.5f;
    float eff_r_sq = eff_r * eff_r;

    int bound = (int)(eff_r + 3.0f);
    int x0 = (int)(cx - bound);
    int y0 = (int)(cy - bound);
    int x1 = (int)(cx + bound + 1);
    int y1 = (int)(cy + bound + 1);

    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > canvas_w) x1 = canvas_w;
    if (y1 > canvas_h) y1 = canvas_h;
    if (x0 >= x1 || y0 >= y1) return;

    float base_alpha = (float)((color >> 24) & 0xFF) / 255.0f;
    if (base_alpha <= 0.001f) base_alpha = 1.0f;
`;

  // Flow & Opacity
  if (propList.some(p => p.id === 'flow')) {
    cSrc += `    base_alpha *= ((float)g_flow / 100.0f);\n`;
  }
  if (propList.some(p => p.id === 'opacity')) {
    cSrc += `    base_alpha *= ((float)g_opacity / 100.0f);\n`;
  }
  if (propList.some(p => p.id === 'pressure_flow')) {
    cSrc += `    if (g_pressure_flow) base_alpha *= (0.3f + 0.7f * eff_pressure);\n`;
  }
  if (propList.some(p => p.id === 'depletion')) {
    cSrc += `    base_alpha *= g_depletion_charge;\n`;
  }

  // Pixel Dab Loop
  cSrc += `
    int hardness = 80;
`;
  if (propList.some(p => p.id === 'hardness')) {
    cSrc += `    hardness = g_hardness;\n`;
  }

  cSrc += `
    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = &pixels[y * canvas_w];
        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
`;

  // Rotation / Roundness
  if (propList.some(p => p.id === 'roundness') || propList.some(p => p.id === 'angle')) {
    cSrc += `            float rx = dx, ry = dy;
`;
    if (propList.some(p => p.id === 'angle')) {
      cSrc += `            w_brush_rotate_point(dx, dy, -((float)g_angle), &rx, &ry);\n`;
    }
    if (propList.some(p => p.id === 'roundness')) {
      cSrc += `            ry *= (100.0f / (float)g_roundness);\n`;
    }
    cSrc += `            float dist = w_sqrtf(rx * rx + ry * ry);
`;
  } else {
    cSrc += `            float dist = w_sqrtf(dx * dx + dy * dy);
`;
  }

  cSrc += `            if (dist > eff_r) continue;

            float falloff = w_brush_falloff_hardness(dist, eff_r, hardness);
            if (falloff <= 0.001f) continue;
`;

  // Grain / Texture
  if (propList.some(p => p.id === 'grain')) {
    cSrc += `            if (g_grain > 0) {
                float noise = w_brush_noise2df(x, y, 0x9e3779b9);
                float tooth = 1.0f - ((float)g_grain * 0.008f * (1.0f - noise));
                if (tooth < 0.0f) tooth = 0.0f;
                falloff *= tooth;
            }
`;
  }

  // Watercolor Fringe & Granulation
  if (isWatercolor) {
    if (propList.some(p => p.id === 'fringe')) {
      cSrc += `            if (g_fringe > 0) {
                float edge_dist = dist / eff_r;
                if (edge_dist > 0.65f) {
                    float fringe_boost = 1.0f + ((float)g_fringe * 0.015f * (edge_dist - 0.65f) / 0.35f);
                    falloff *= fringe_boost;
                }
            }
`;
    }
    if (propList.some(p => p.id === 'granulation')) {
      cSrc += `            if (g_granulation > 0) {
                float gn = w_brush_noise2df(x * 2, y * 2, 0x1234567);
                falloff *= (1.0f - ((float)g_granulation * 0.007f * (1.0f - gn)));
            }
`;
    }
  }

  // Special Patterns: Crosshatch, Halftone, Pixel
  if (isPixel) {
    cSrc += `            // 1-pixel hard threshold
            falloff = 1.0f;
`;
  } else if (isCrosshatch) {
    cSrc += `            // Angled crosshatch frequency
            if (((x + y) % 6 > 2) && ((x - y) % 6 > 2)) {
                falloff *= 0.15f;
            }
`;
  } else if (isHalftone) {
    cSrc += `            // Dot screen lattice
            int hx = x % 8 - 4;
            int hy = y % 8 - 4;
            if (hx * hx + hy * hy > 6) {
                falloff *= 0.1f;
            }
`;
  }

  // Pixel Blending
  cSrc += `
            uint32_t a_val = (uint32_t)(base_alpha * falloff * 255.0f);
            if (a_val > 255) a_val = 255;
            if (a_val == 0) continue;

            uint32_t cur_p = row[x];
`;

  if (isEraser) {
    cSrc += `            row[x] = w_brush_blend_erase(cur_p, a_val);\n`;
  } else if (isMarker) {
    cSrc += `            if (is_eraser) {
                row[x] = w_brush_blend_erase(cur_p, a_val);
            } else {
                row[x] = w_brush_blend_multiply(color, cur_p, a_val);
            }
`;
  } else if (propList.some(p => p.id === 'pigment_mode')) {
    cSrc += `            if (is_eraser) {
                row[x] = w_brush_blend_erase(cur_p, a_val);
            } else if (g_pigment_mode && cur_p != 0) {
                row[x] = w_brush_blend_pigment(color, cur_p, (a_val * 100) / 255);
            } else {
                row[x] = w_brush_blend_over(color, cur_p, a_val);
            }
`;
  } else if (isSmudge) {
    cSrc += `            // Smudge pickup and smear
            if (is_eraser) {
                row[x] = w_brush_blend_erase(cur_p, a_val);
            } else {
                int sm_x = x - (int)(speed * 0.5f);
                if (sm_x < 0) sm_x = 0;
                uint32_t smear = pixels[y * canvas_w + sm_x];
                row[x] = w_brush_blend_over(smear ? smear : color, cur_p, a_val);
            }
`;
  } else {
    cSrc += `            if (is_eraser) {
                row[x] = w_brush_blend_erase(cur_p, a_val);
            } else {
                row[x] = w_brush_blend_over(color, cur_p, a_val);
            }
`;
  }

  cSrc += `        }
    }
}
`;

  fs.writeFileSync(targetC, cSrc, 'utf8');
  generatedCount++;
}

console.log(`Successfully generated ${generatedCount} C brush plugins from JS presets.`);
