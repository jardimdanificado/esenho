/**
 * scripts/generate-native-plugins.js
 * Generates native C wrappers, dispatch registry, and metadata
 * for all 58 brushes and 29 filters in Esenho.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const realismParameters = require('../src/brush_realism_params.json');
const cppGenDir = path.resolve(rootDir, 'android/app/src/main/cpp/gen');

fs.mkdirSync(path.join(cppGenDir, 'brushes'), { recursive: true });
fs.mkdirSync(path.join(cppGenDir, 'filters'), { recursive: true });

// 1. Process Brushes
const brushFiles = fs.readdirSync(path.join(rootDir, 'src/plugins/brushes')).filter(f => f.endsWith('.c')).sort();
console.log(`Processing ${brushFiles.length} brushes...`);

const brushEntries = [];

for (const bfile of brushFiles) {
  const name = bfile.replace('.c', '');
  const cPath = path.join(rootDir, 'src/plugins/brushes', bfile);
  const content = fs.readFileSync(cPath, 'utf8');

  // Extract info JSON string
  const infoMatch = content.match(/w_brush_get_info\s*\([^)]*\)\s*\{[\s\S]*?return\s*("[\s\S]*?");\s*\}/);
  let info = { name, title: name, category: 'Effects', params: [] };
  if (infoMatch) {
    try {
      const jsonStr = JSON.parse(infoMatch[1]);
      info = JSON.parse(jsonStr);
    } catch (e) {
      // Fallback eval / cleanup
      try {
        const raw = infoMatch[1].replace(/"\s*"/g, '').replace(/\\"/g, '"');
        info = JSON.parse(raw.slice(1, -1));
      } catch (err) {}
    }
  }

  // Wrapper file
  const wrapperContent = `/* Auto-generated wrapper for ${name} */
#define w_brush_get_info brush_${name}_get_info
#define w_brush_get_inputs brush_${name}_get_inputs
#define w_brush_init brush_${name}_init
#define w_brush_set_param brush_${name}_set_param
#define w_brush_stroke_begin brush_${name}_stroke_begin
#define w_brush_stroke_end brush_${name}_stroke_end
#define w_brush_render_dab brush_${name}_render_dab

#include "${bfile}"
`;

  fs.writeFileSync(path.join(cppGenDir, 'brushes', `brush_${name}.c`), wrapperContent);

  brushEntries.push({
    id: name,
    cId: name,
    title: info.title || name,
    category: info.category || 'Procedural',
    spacing: info.spacing || 0.1,
    minRadius: info.minRadius || 2,
    maxRadius: info.maxRadius || 120,
    params: info.params || []
  });
}

// 2. Process Filters
const filterFiles = fs.readdirSync(path.join(rootDir, 'src/plugins')).filter(f => f.endsWith('.c')).sort();
console.log(`Processing ${filterFiles.length} filters...`);

const filterEntries = [];

for (const ffile of filterFiles) {
  const name = ffile.replace('.c', '');
  const cPath = path.join(rootDir, 'src/plugins', ffile);
  const content = fs.readFileSync(cPath, 'utf8');

  let title = name.charAt(0).toUpperCase() + name.slice(1);
  let params = [];
  const infoMatch = content.match(/w_plugin_get_info\s*\([^)]*\)\s*\{[\s\S]*?return\s*("[\s\S]*?");\s*\}/);
  if (infoMatch) {
    try {
      const jsonStr = JSON.parse(infoMatch[1]);
      const parsed = JSON.parse(jsonStr);
      title = parsed.title || title;
      params = parsed.params || [];
    } catch (e) {
      try {
        const raw = infoMatch[1].replace(/"\s*"/g, '').replace(/\\"/g, '"');
        const parsed = JSON.parse(raw.slice(1, -1));
        title = parsed.title || title;
        params = parsed.params || [];
      } catch (err) {}
    }
  }

  const wrapperContent = `/* Auto-generated wrapper for filter ${name} */
#define w_plugin_get_info filter_${name}_get_info
#define w_filter_apply filter_${name}_apply

#include "${ffile}"
`;

  fs.writeFileSync(path.join(cppGenDir, 'filters', `filter_${name}.c`), wrapperContent);

  filterEntries.push({
    id: name,
    title,
    params
  });
}

// 3. Process Curated Brush Presets from src/presets_data.js
const presetsPath = path.join(rootDir, 'src/presets_data.js');
let presetEntries = [];
if (fs.existsSync(presetsPath)) {
  const presetsContent = fs.readFileSync(presetsPath, 'utf8');
  const vm = require('vm');
  const sandbox = {};
  try {
    vm.runInNewContext(presetsContent + '; presets = CURATED_BRUSH_PRESETS;', sandbox);
    if (sandbox.presets) {
      for (const [k, v] of Object.entries(sandbox.presets)) {
        if (!v || !v.name || !v.category) continue;

        // Unpack nested tip/dynamics/wet/jitter objects if present
        let shape = v.shape || 'circle';
        let size = v.size || 10;
        let hardness = v.hardness != null ? v.hardness : 70;
        let roundness = v.roundness != null ? v.roundness : 100;
        let angle = v.angle || 0;
        let spacing = v.spacing != null ? v.spacing : 5;
        let smoothing = v.smoothing != null ? v.smoothing : 15;
        let pressure_size = v.pressure_size != null ? (v.pressure_size ? 1 : 0) : 1;
        let pressure_flow = v.pressure_flow != null ? (v.pressure_flow ? 1 : 0) : 1;
        let tilt_angle = v.tilt_angle ? 1 : 0;
        let velocity = v.velocity || 0;
        let taper_in = v.taper_in || 0;
        let taper_out = v.taper_out || 0;
        let buildup = v.buildup ? 1 : 0;
        let wetness = v.wetness || 0;
        let smudge = v.smudge || 0;
        let color_pickup = v.color_pickup || 0;
        let depletion = v.depletion || 0;
        let size_jitter = v.size_jitter || 0;
        let angle_jitter = v.angle_jitter || 0;
        let opacity_jitter = v.opacity_jitter || 0;
        let color_jitter = v.color_jitter || 0;

        if (v.tip && typeof v.tip === 'object') {
          if (v.tip.ref) shape = v.tip.ref;
          if (v.tip.size != null) size = v.tip.size;
          if (v.tip.hardness != null) hardness = v.tip.hardness;
          if (v.tip.roundness != null) roundness = v.tip.roundness;
          if (v.tip.angle != null) angle = v.tip.angle;
        }

        if (v.dynamics && typeof v.dynamics === 'object') {
          if (v.dynamics.spacing != null) spacing = v.dynamics.spacing;
          if (v.dynamics.stabilizer && v.dynamics.stabilizer.smoothing != null) smoothing = v.dynamics.stabilizer.smoothing;
          if (v.dynamics.pressureSize != null) pressure_size = v.dynamics.pressureSize ? 1 : 0;
          if (v.dynamics.pressureFlow != null) pressure_flow = v.dynamics.pressureFlow ? 1 : 0;
          if (v.dynamics.tiltAngle != null) tilt_angle = v.dynamics.tiltAngle ? 1 : 0;
          if (v.dynamics.velocityScaling != null) velocity = v.dynamics.velocityScaling;
          if (v.dynamics.taper) {
            if (v.dynamics.taper.in != null) taper_in = v.dynamics.taper.in;
            if (v.dynamics.taper.out != null) taper_out = v.dynamics.taper.out;
          }
          if (v.dynamics.buildup != null) buildup = v.dynamics.buildup ? 1 : 0;
        }

        if (v.wet && typeof v.wet === 'object') {
          if (v.wet.wetness != null) wetness = v.wet.wetness;
          if (v.wet.smudge != null) smudge = v.wet.smudge;
          if (v.wet.colorPickup != null) color_pickup = v.wet.colorPickup;
          if (v.wet.color_pickup != null) color_pickup = v.wet.color_pickup;
          if (v.wet.depletion != null) depletion = v.wet.depletion;
        }

        if (v.jitter && typeof v.jitter === 'object') {
          if (v.jitter.size != null) size_jitter = v.jitter.size;
          if (v.jitter.angle != null) angle_jitter = v.jitter.angle;
          if (v.jitter.opacity != null) opacity_jitter = v.jitter.opacity;
          if (v.jitter.color != null) color_jitter = v.jitter.color;
        }

        let shape_id = 0;
        const shLower = String(shape).toLowerCase();
        if (shLower === 'square' || shape === 1) shape_id = 1;
        else if (shLower === 'chisel' || shLower === 'flat' || shLower === 'dagger' || shLower === 'rake' || shape === 2) shape_id = 2;

        let water = v.water != null ? v.water : (v.wet && v.wet.water != null ? v.wet.water : 0);
        let bleed = v.bleed != null ? v.bleed : (v.wet && v.wet.bleed != null ? v.wet.bleed : 0);
        let granulation = v.granulation != null ? v.granulation : (v.wet && v.wet.granulation != null ? v.wet.granulation : 0);
        let fringe = v.fringe != null ? v.fringe : (v.wet && v.wet.fringe != null ? v.wet.fringe : 0);
        let pigment_mode = (v.pigment_mode || (v.wet && v.wet.pigment_mode)) ? 1 : 0;
        let impasto = v.impasto != null ? v.impasto : (v.wet && v.wet.impasto != null ? v.wet.impasto : 0);
        let drying_rate = v.drying_rate != null ? v.drying_rate : (v.wet && v.wet.drying_rate != null ? v.wet.drying_rate : 0);
        let grain = v.grain != null ? v.grain : (v.texture && typeof v.texture === 'object' && v.texture.grain != null ? v.texture.grain : 0);
        let texture_scale = v.texture_scale != null ? v.texture_scale : (v.texture && typeof v.texture === 'object' && v.texture.scale != null ? v.texture.scale : 100);
        let texture_contrast = v.texture_contrast != null ? v.texture_contrast : (v.texture && typeof v.texture === 'object' && v.texture.contrast != null ? v.texture.contrast : 100);
        let tex_angle = v.texture_angle != null ? v.texture_angle : (v.tex_angle != null ? v.tex_angle : (v.texture && typeof v.texture === 'object' && v.texture.angle != null ? v.texture.angle : 0));
        let tex_mode = v.tex_mode != null ? v.tex_mode : (v.texture && typeof v.texture === 'object' && v.texture.mode != null ? v.texture.mode : 0);
        let subpixel = (v.subpixel != null) ? (v.subpixel ? 1 : 0) : 1;
        let dab_blend = v.dab_blend != null ? v.dab_blend : 0;

        presetEntries.push({
          id: k,
          name: v.name,
          desc: v.desc || '',
          category: v.category || 'general',
          shape: String(shape),
          shape_id: shape_id,
          size: size,
          opacity: v.opacity != null ? v.opacity : 100,
          hardness: hardness,
          flow: v.flow != null ? v.flow : 100,
          spacing: spacing,
          roundness: roundness,
          angle: angle,
          smoothing: smoothing,
          midpoint: v.midpoint != null ? v.midpoint : 50,
          scatter: v.scatter || 0,
          grain: grain,
          tex_mode: tex_mode,
          texture: typeof v.texture === 'string' ? v.texture : (v.texture?.ref || ''),
          texture_scale: texture_scale,
          texture_contrast: texture_contrast,
          tex_scale_with_size: v.tex_scale_with_size ? 1 : 0,
          tex_angle: tex_angle,
          auto_rotate: v.auto_rotate ? 1 : 0,
          velocity: velocity,
          taper_in: taper_in,
          taper_out: taper_out,
          fade: v.fade || 0,
          size_jitter: size_jitter,
          angle_jitter: angle_jitter,
          opacity_jitter: opacity_jitter,
          color_jitter: color_jitter,
          dab_blend: dab_blend,
          subpixel: subpixel,
          smudge: smudge,
          wetness: wetness,
          depletion: depletion,
          color_pickup: color_pickup,
          pressure_size: pressure_size,
          pressure_flow: pressure_flow,
          tilt_angle: tilt_angle,
          buildup: buildup,
          water: water,
          bleed: bleed,
          granulation: granulation,
          fringe: fringe,
          pigment_mode: pigment_mode,
          impasto: impasto,
          drying_rate: drying_rate,
          mode: v.mode || 0,
          eraser: v.eraser ? 1 : 0,
          color: v.color || '',
          engine: v.engine || 'classic',
          ...(v.curve_bindings ? {curve_bindings: v.curve_bindings} : {}),
          ...Object.fromEntries(realismParameters.filter(param => v[param.key] != null).map(param => [param.key, v[param.key]])),
          ...Object.fromEntries(Object.entries(v).filter(([key]) => key.startsWith('dyn_') || key.startsWith('mypaint_') || key.startsWith('pressure_')))
        });
      }
    }
  } catch (err) {
    console.error('Error parsing presets_data.js:', err);
  }
}
console.log(`Processing ${presetEntries.length} curated presets...`);

// 3. Generate Header & Registry C
let headerContent = `/* Auto-generated Plugin Registry Header */
#ifndef ESENHO_PLUGINS_REGISTRY_H
#define ESENHO_PLUGINS_REGISTRY_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    const char *id;
    const char *title;
    const char *category;
    float default_spacing;
    float min_radius;
    float max_radius;
    const char *(*get_info)(void);
    void (*init)(int32_t w, int32_t h);
    void (*set_param)(int32_t idx, int32_t val);
    void (*stroke_begin)(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
    void (*render_dab)(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
    void (*stroke_end)(void);
} native_brush_t;

typedef struct {
    const char *id;
    const char *title;
    const char *(*get_info)(void);
    void (*apply)(int32_t p1, int32_t p2);
} native_filter_t;

int native_get_brush_count(void);
const native_brush_t *native_get_brush(int idx);
const native_brush_t *native_find_brush(const char *id);

int native_get_filter_count(void);
const native_filter_t *native_get_filter(int idx);
const native_filter_t *native_find_filter(const char *id);

#endif
`;

fs.writeFileSync(path.join(cppGenDir, 'esenho_plugins_registry.h'), headerContent);

// Registry C
let regC = `/* Auto-generated Plugin Registry Implementation */
#include "esenho_plugins_registry.h"
#include <string.h>

// Forward declarations for brushes
${brushEntries.map(b => `
extern const char* brush_${b.cId}_get_info(void);
extern void brush_${b.cId}_init(int32_t w, int32_t h);
extern void brush_${b.cId}_set_param(int32_t idx, int32_t val);
extern void brush_${b.cId}_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_${b.cId}_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_${b.cId}_stroke_end(void);
`).join('')}

// Forward declarations for filters
${filterEntries.map(f => `
extern const char* filter_${f.id}_get_info(void);
extern void filter_${f.id}_apply(int32_t p1, int32_t p2);
`).join('')}

static const native_brush_t s_brushes[] = {
${brushEntries.map(b => `    {
        "${b.id}",
        "${b.title}",
        "${b.category}",
        ${Number(b.spacing).toFixed(4)}f,
        ${Number(b.minRadius).toFixed(2)}f,
        ${Number(b.maxRadius).toFixed(2)}f,
        brush_${b.cId}_get_info,
        brush_${b.cId}_init,
        brush_${b.cId}_set_param,
        brush_${b.cId}_stroke_begin,
        brush_${b.cId}_render_dab,
        brush_${b.cId}_stroke_end
    },`).join('\n')}
};

static const native_filter_t s_filters[] = {
${filterEntries.map(f => `    {
        "${f.id}",
        "${f.title}",
        filter_${f.id}_get_info,
        filter_${f.id}_apply
    },`).join('\n')}
};

int native_get_brush_count(void) {
    return (int)(sizeof(s_brushes) / sizeof(s_brushes[0]));
}

const native_brush_t *native_get_brush(int idx) {
    if (idx < 0 || idx >= native_get_brush_count()) return 0;
    return &s_brushes[idx];
}

const native_brush_t *native_find_brush(const char *id) {
    if (!id) return 0;
    for (int i = 0; i < native_get_brush_count(); i++) {
        if (strcmp(s_brushes[i].id, id) == 0) return &s_brushes[i];
    }
    return 0;
}

int native_get_filter_count(void) {
    return (int)(sizeof(s_filters) / sizeof(s_filters[0]));
}

const native_filter_t *native_get_filter(int idx) {
    if (idx < 0 || idx >= native_get_filter_count()) return 0;
    return &s_filters[idx];
}

const native_filter_t *native_find_filter(const char *id) {
    if (!id) return 0;
    for (int i = 0; i < native_get_filter_count(); i++) {
        if (strcmp(s_filters[i].id, id) == 0) return &s_filters[i];
    }
    return 0;
}
`;

fs.writeFileSync(path.join(cppGenDir, 'esenho_plugins_registry.c'), regC);

// Save JSON metadata for Kotlin to load
const metadata = {
  responseCurves: require('../src/brush_curves_data.json'),
  proceduralCurveBindings: require('../src/brush_curve_brushes.json'),
  realismParameters,
  presets: presetEntries,
  brushes: brushEntries,
  filters: filterEntries
};

const metaJson = JSON.stringify(metadata, null, 2);

const rawDir = path.join(rootDir, 'android/app/src/main/res/raw');
if (!fs.existsSync(rawDir)) {
  fs.mkdirSync(rawDir, { recursive: true });
}
fs.writeFileSync(
  path.join(rawDir, 'esenho_native_metadata.json'),
  metaJson
);

console.log(`Plugin code generation complete! (${presetEntries.length} presets, ${brushEntries.length} brushes, ${filterEntries.length} filters)`);
