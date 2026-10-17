/**
 * scripts/generate-native-plugins.js
 * Generates native C wrappers, dispatch registry, and metadata
 * for all 58 brushes and 29 filters in Esenho.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
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
  brushes: brushEntries,
  filters: filterEntries
};

fs.writeFileSync(
  path.join(rootDir, 'android/app/src/main/assets/esenho_native_metadata.json'),
  JSON.stringify(metadata, null, 2)
);

console.log('Plugin code generation complete!');
