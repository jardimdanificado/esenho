/**
 * scripts/build-builtin-textures.js
 *
 * Extracts exact procedural textures and tip shapes from src/esenho.js
 * and generates src/include/builtin_textures.h with 100% bit-exact pixel parity.
 */

const fs = require('fs');
const path = require('path');
const { createProceduralTextures } = require('../src/esenho.js');
const { CURATED_BRUSH_PRESETS } = require('../src/presets_data.js');

const textures = createProceduralTextures();

// Collect all shapes and textures used by curated presets
const used = new Set();
// Material masks remain available as explicit user choices, even though
// ordinary drawing/blending presets no longer stamp them onto the canvas.
for (const name of ['paper', 'canvas', 'linen', 'washi', 'watercolor',
  'charcoal_tooth', 'pastel_board', 'dry_scrape', 'stipple_noise', 'spatter_drops', 'grunge']) {
  used.add(name);
}
// Always include all 21 tip shapes
for (const [name, item] of textures.entries()) {
  if (item.category === 'shape') {
    used.add(name);
  }
}
// Add all textures referenced by curated presets
for (const p of Object.values(CURATED_BRUSH_PRESETS)) {
  const t = typeof p.texture === 'string' ? p.texture : p.texture?.ref;
  if (t && t !== 'none') used.add(t);
  const s = p.shape || p.tip?.ref;
  if (s) used.add(s);
}

console.log(`Processing ${used.size} essential procedural assets...`);

// Group by unique data buffer to avoid duplicating byte arrays
const dataBufferMap = new Map();
let arrayCounter = 0;

const entries = [];

for (const name of Array.from(used).sort()) {
  const item = textures.get(name);
  if (!item) continue;

  let arrInfo = dataBufferMap.get(item.data);
  let arrVar = arrInfo ? arrInfo.varName : null;
  if (!arrVar) {
    arrVar = `s_tex_data_${arrayCounter++}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const single = Buffer.alloc(item.width * item.height);
    for (let i = 0; i < item.width * item.height; i++) {
      single[i] = item.category === 'shape' ? item.data[i * 4 + 3] : item.data[i * 4];
    }
    arrInfo = {
      varName: arrVar,
      width: item.width,
      height: item.height,
      category: item.category,
      bytes: single
    };
    dataBufferMap.set(item.data, arrInfo);
  }

  entries.push({
    name,
    category: item.category,
    width: item.width,
    height: item.height,
    varName: arrVar
  });
}

console.log(`Created ${dataBufferMap.size} unique pixel buffers for ${entries.length} assets.`);

let cCode = `/* Auto-generated Bit-Exact Procedural Textures & Shapes for Esenho Quadro */
#ifndef ESENHO_BUILTIN_TEXTURES_H
#define ESENHO_BUILTIN_TEXTURES_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

static inline int w_str_case_eq(const char *a, const char *b) {
    if (!a || !b) return 0;
    while (*a && *b) {
        char ca = *a >= 'A' && *a <= 'Z' ? *a + 32 : *a;
        char cb = *b >= 'A' && *b <= 'Z' ? *b + 32 : *b;
        if (ca != cb) return 0;
        a++; b++;
    }
    return (*a == 0 && *b == 0);
}

/* ── Embedded Bit-Exact 1-Byte-Per-Pixel Data Tables ── */
`;

for (const [dataBuf, info] of dataBufferMap.entries()) {
  const byteVals = [];
  const b = info.bytes;
  for (let i = 0; i < b.length; i++) {
    byteVals.push(b[i]);
  }
  cCode += `static const uint8_t ${info.varName}[${b.length}] = {\n`;
  // Wrap lines of 32 bytes for clean formatting
  for (let i = 0; i < byteVals.length; i += 32) {
    const chunk = byteVals.slice(i, i + 32);
    cCode += `    ${chunk.join(',')},\n`;
  }
  cCode += `};\n\n`;
}

cCode += `typedef struct {
    const char *name;
    const char *category;
    int32_t width;
    int32_t height;
    const uint8_t *data;
    int32_t layer_slot;
} builtin_item_entry_t;

static builtin_item_entry_t g_builtin_items[] = {
${entries.map(e => `    { "${e.name}", "${e.category}", ${e.width}, ${e.height}, ${e.varName}, -1 }`).join(',\n')}
};
static const int g_builtin_item_count = sizeof(g_builtin_items) / sizeof(g_builtin_items[0]);

/* External layer allocation from quadro.c */
extern int layer_alloc_slot(int32_t w, int32_t h, uint8_t visible);
extern uint32_t *w_layer_get_pixels(int32_t layer_idx);
extern void w_brush_set_param(int32_t param_id, int32_t val);

#ifndef W_PARAM_SHAPE
#define W_PARAM_SHAPE 14
#endif
#ifndef W_PARAM_TEX_LAYER
#define W_PARAM_TEX_LAYER 18
#endif

static inline int32_t w_shape_get_by_name(const char *name) {
    if (!name || !name[0] || w_str_case_eq(name, "circle") || w_str_case_eq(name, "round")) return 0;
    if (w_str_case_eq(name, "square")) return 1;
    if (w_str_case_eq(name, "chisel") || w_str_case_eq(name, "flat")) return 2;

    for (int i = 0; i < g_builtin_item_count; i++) {
        builtin_item_entry_t *item = &g_builtin_items[i];
        if (item->category[0] == 's' && w_str_case_eq(name, item->name)) {
            if (item->layer_slot >= 0) return item->layer_slot;
            int slot = layer_alloc_slot(item->width, item->height, 0);
            if (slot >= 0) {
                uint32_t *pix = w_layer_get_pixels(slot);
                if (pix) {
                    int total = item->width * item->height;
                    const uint8_t *d = item->data;
                    for (int p = 0; p < total; p++) {
                        pix[p] = ((uint32_t)d[p] << 24) | 0x00FFFFFF;
                    }
                }
                item->layer_slot = slot;
                // Cache alias slots
                for (int j = 0; j < g_builtin_item_count; j++) {
                    if (g_builtin_items[j].data == item->data) {
                        g_builtin_items[j].layer_slot = slot;
                    }
                }
                return slot;
            }
            return 0;
        }
    }
    return 0;
}

static inline int32_t w_texture_get_by_name(const char *name) {
    if (!name || !name[0] || w_str_case_eq(name, "none") || w_str_case_eq(name, "0") || w_str_case_eq(name, "off")) {
        return -1;
    }

    for (int i = 0; i < g_builtin_item_count; i++) {
        builtin_item_entry_t *item = &g_builtin_items[i];
        if (item->category[0] == 't' && w_str_case_eq(name, item->name)) {
            if (item->layer_slot >= 0) return item->layer_slot;
            int slot = layer_alloc_slot(item->width, item->height, 0);
            if (slot >= 0) {
                uint32_t *pix = w_layer_get_pixels(slot);
                if (pix) {
                    int total = item->width * item->height;
                    const uint8_t *d = item->data;
                    for (int p = 0; p < total; p++) {
                        uint32_t v = (uint32_t)d[p];
                        pix[p] = 0xFF000000 | (v << 16) | (v << 8) | v;
                    }
                }
                item->layer_slot = slot;
                // Cache alias slots
                for (int j = 0; j < g_builtin_item_count; j++) {
                    if (g_builtin_items[j].data == item->data) {
                        g_builtin_items[j].layer_slot = slot;
                    }
                }
                return slot;
            }
            return -1;
        }
    }
    return -1;
}

static inline void w_brush_select_texture(const char *name) {
    int32_t slot = w_texture_get_by_name(name);
    w_brush_set_param(W_PARAM_TEX_LAYER, slot);
}

static inline void w_brush_select_shape(const char *name) {
    int32_t slot = w_shape_get_by_name(name);
    w_brush_set_param(W_PARAM_SHAPE, slot);
}

#ifdef __cplusplus
}
#endif

#endif /* ESENHO_BUILTIN_TEXTURES_H */
`;

const outPath = path.resolve(__dirname, '../src/include/builtin_textures.h');
fs.writeFileSync(outPath, cCode);
console.log(`✔ Generated bit-exact builtin textures header at: ${outPath} (${(cCode.length / 1024).toFixed(1)} KB)`);
