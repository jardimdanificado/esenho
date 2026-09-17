#include "esenho.h"
#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#endif

/* =========================================================================
 * Surface & Layer Actor (Canvas / Drawing Engine)
 * Unified Architecture: All textures, shapes, images and canvas layers are Layers (layer_t).
 * Brush tip shapes sample the layer's alpha channel ((sp >> 24) & 0xFF).
 * Brush grain textures sample the layer's pattern.
 * Visible layers composite to out_pixels in layer index order.
 * ========================================================================= */

#define DEFAULT_WIDTH  800
#define DEFAULT_HEIGHT 1000

/** Unified Layer / Surface / Texture Buffer */
typedef struct {
    uint32_t *pixels;
    int32_t  width;
    int32_t  height;
    int32_t  x;
    int32_t  y;
    uint8_t  visible;    /**< 1 = active in composite, 0 = offscreen (shapes, textures) */
    uint8_t  opacity;    /**< 0..255 */
    uint8_t  in_use;     /**< 1 = allocated */
    uint8_t  alpha_lock; /**< 1 = lock alpha channel */
    uint8_t  clipping;   /**< 1 = clipping mask to layer below */
    uint8_t  blend_mode; /**< 0=normal, 1=multiply, 2=screen, 3=overlay, 4=dodge, 5=add */
} layer_t;

static uint32_t doc_width = DEFAULT_WIDTH;
static uint32_t doc_height = DEFAULT_HEIGHT;
static layer_t  *layers = 0;
static int      layer_capacity = 0;
static int      layer_count = 0;
static int      active_layer = 3;
static uint32_t *out_pixels = 0; /**< Flattened composite buffer */
static uint32_t out_pixels_cap = 0;

void force_composite(void);
int32_t get_width(void);
int32_t get_height(void);
static void ensure_stroke_buffers(uint32_t required_pixels);

/* =========================================================================
 * Memory Management
 * Simple bump allocator over WebAssembly linear heap.
 * ========================================================================= */
static uint8_t *heap_top = 0;

static void *canvas_alloc(uint32_t size) {
    if (!heap_top) {
        extern uint8_t __heap_base;
        heap_top = &__heap_base;
    }
    uintptr_t cur = ((uintptr_t)heap_top + 15) & ~15;
    heap_top = (uint8_t*)(cur + size);

    uint32_t cur_mem_bytes = __builtin_wasm_memory_size(0) * 65536;
    if ((uintptr_t)heap_top > cur_mem_bytes) {
        uint32_t need_pages = (((uintptr_t)heap_top - cur_mem_bytes) + 65535) / 65536;
        __builtin_wasm_memory_grow(0, need_pages);
    }
    return (void*)cur;
}

/* =========================================================================
 * Selection Clipping
 * Constrains all brush strokes, fills, shapes, and layer adjustments
 * to the active selection rect or pixel mask.
 * ========================================================================= */
static int32_t clip_active = 0;
static int32_t clip_x = 0;
static int32_t clip_y = 0;
static int32_t clip_w = 0;
static int32_t clip_h = 0;
static int32_t clip_has_mask = 0;
static uint8_t *clip_mask_ptr = 0;
static uint32_t clip_mask_cap = 0;

W_EXPORT uint8_t *w_get_clip_mask_buffer(uint32_t size) {
    if (size > clip_mask_cap) {
        clip_mask_ptr = (uint8_t*)canvas_alloc(size + 1024);
        clip_mask_cap = size + 1024;
    }
    return clip_mask_ptr;
}

W_EXPORT void w_set_clip(int32_t active, int32_t x, int32_t y, int32_t w, int32_t h, int32_t has_mask) {
    clip_active = active;
    clip_x = x;
    clip_y = y;
    clip_w = w;
    clip_h = h;
    clip_has_mask = has_mask;
}

static inline int is_pixel_clipped(int x, int y) {
    if (!clip_active) return 0;
    if (x < clip_x || x >= clip_x + clip_w || y < clip_y || y >= clip_y + clip_h) return 1;
    if (clip_has_mask && clip_mask_ptr) {
        int mx = x - clip_x;
        int my = y - clip_y;
        if (!clip_mask_ptr[my * clip_w + mx]) return 1;
    }
    return 0;
}

/* =========================================================================
 * Layer Allocation & Builtin Shapes
 * ========================================================================= */

static void ensure_layer_capacity(int min_cap) {
    if (layer_capacity >= min_cap) return;
    int new_cap = layer_capacity ? layer_capacity * 2 : 64;
    while (new_cap < min_cap) new_cap *= 2;
    layer_t *new_layers = (layer_t*)canvas_alloc(new_cap * sizeof(layer_t));
    for (int i = 0; i < layer_capacity; i++) {
        new_layers[i] = layers[i];
    }
    for (int i = layer_capacity; i < new_cap; i++) {
        new_layers[i].pixels = 0;
        new_layers[i].width = 0;
        new_layers[i].height = 0;
        new_layers[i].x = 0;
        new_layers[i].y = 0;
        new_layers[i].visible = 0;
        new_layers[i].opacity = 255;
        new_layers[i].in_use = 0;
        new_layers[i].alpha_lock = 0;
        new_layers[i].clipping = 0;
        new_layers[i].blend_mode = 0;
    }
    layers = new_layers;
    layer_capacity = new_cap;
}

#define MAX_ORDER_LAYERS 256
static int32_t layer_order[MAX_ORDER_LAYERS];
static int32_t layer_order_count = 0;

static void layer_order_add(int32_t idx) {
    for (int i = 0; i < layer_order_count; i++) {
        if (layer_order[i] == idx) return;
    }
    if (layer_order_count < MAX_ORDER_LAYERS) {
        layer_order[layer_order_count++] = idx;
    }
}

static void layer_order_insert_after(int32_t target, int32_t idx) {
    for (int i = 0; i < layer_order_count; i++) {
        if (layer_order[i] == idx) return;
    }
    if (layer_order_count >= MAX_ORDER_LAYERS) return;

    int target_pos = -1;
    if (target >= 0) {
        for (int i = 0; i < layer_order_count; i++) {
            if (layer_order[i] == target) {
                target_pos = i;
                break;
            }
        }
    }
    if (target_pos < 0 || target_pos >= layer_order_count - 1) {
        layer_order[layer_order_count++] = idx;
    } else {
        for (int i = layer_order_count; i > target_pos + 1; i--) {
            layer_order[i] = layer_order[i - 1];
        }
        layer_order[target_pos + 1] = idx;
        layer_order_count++;
    }
}

static void layer_order_remove(int32_t idx) {
    int found = -1;
    for (int i = 0; i < layer_order_count; i++) {
        if (layer_order[i] == idx) {
            found = i;
            break;
        }
    }
    if (found >= 0) {
        for (int i = found; i < layer_order_count - 1; i++) {
            layer_order[i] = layer_order[i + 1];
        }
        layer_order_count--;
    }
}

static int layer_alloc_slot(int32_t w, int32_t h, uint8_t visible) {
    if (w <= 0 || h <= 0) return -1;
    ensure_layer_capacity(layer_count + 1);

    for (int i = 0; i < layer_capacity; i++) {
        if (!layers[i].in_use) {
            layers[i].in_use = 1;
            layers[i].width = w;
            layers[i].height = h;
            layers[i].x = 0;
            layers[i].y = 0;
            layers[i].visible = visible;
            layers[i].opacity = 255;
            layers[i].alpha_lock = 0;
            layers[i].clipping = 0;
            layers[i].blend_mode = 0;
            layers[i].pixels = (uint32_t*)canvas_alloc(w * h * sizeof(uint32_t));
            for (uint32_t p = 0; p < (uint32_t)(w * h); p++) layers[i].pixels[p] = 0x00000000;
            if (i >= layer_count) layer_count = i + 1;
            layer_order_insert_after(active_layer, i);
            return i;
        }
    }
    int idx = layer_capacity;
    ensure_layer_capacity(idx + 1);
    layers[idx].in_use = 1;
    layers[idx].width = w;
    layers[idx].height = h;
    layers[idx].x = 0;
    layers[idx].y = 0;
    layers[idx].visible = visible;
    layers[idx].opacity = 255;
    layers[idx].alpha_lock = 0;
    layers[idx].clipping = 0;
    layers[idx].blend_mode = 0;
    layers[idx].pixels = (uint32_t*)canvas_alloc(w * h * sizeof(uint32_t));
    for (uint32_t p = 0; p < (uint32_t)(w * h); p++) layers[idx].pixels[p] = 0x00000000;
    layer_count = idx + 1;
    layer_order_insert_after(active_layer, idx);
    return idx;
}

static void init_builtin_shapes(void) {
    // Slot 0: Circle Shape (64x64)
    layers[0].in_use = 1;
    layers[0].width = 64;
    layers[0].height = 64;
    layers[0].visible = 0;
    layers[0].opacity = 255;
    layers[0].x = 0; layers[0].y = 0;
    layers[0].pixels = (uint32_t*)canvas_alloc(64 * 64 * sizeof(uint32_t));
    for (int y = 0; y < 64; y++) {
        int dy = y - 32;
        for (int x = 0; x < 64; x++) {
            int dx = x - 32;
            layers[0].pixels[y * 64 + x] = (dx * dx + dy * dy <= 31 * 31) ? 0xFFFFFFFF : 0x00000000;
        }
    }

    // Slot 1: Square Shape (64x64)
    layers[1].in_use = 1;
    layers[1].width = 64;
    layers[1].height = 64;
    layers[1].visible = 0;
    layers[1].opacity = 255;
    layers[1].x = 0; layers[1].y = 0;
    layers[1].pixels = (uint32_t*)canvas_alloc(64 * 64 * sizeof(uint32_t));
    for (int i = 0; i < 64 * 64; i++) layers[1].pixels[i] = 0xFFFFFFFF;

    // Slot 2: Chisel Shape (64x64 horizontal ribbon blade mask)
    layers[2].in_use = 1;
    layers[2].width = 64;
    layers[2].height = 64;
    layers[2].visible = 0;
    layers[2].opacity = 255;
    layers[2].x = 0; layers[2].y = 0;
    layers[2].pixels = (uint32_t*)canvas_alloc(64 * 64 * sizeof(uint32_t));
    for (int y = 0; y < 64; y++) {
        for (int x = 0; x < 64; x++) {
            layers[2].pixels[y * 64 + x] = (y >= 24 && y < 40) ? 0xFFFFFFFF : 0x00000000;
        }
    }
}

/* =========================================================================
 * Pixel Blending & Layer Operations
 * ========================================================================= */

static inline uint32_t blend_pixel_mode(uint32_t dst, uint32_t src, uint8_t alpha_mod, uint8_t blend_mode) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    if (blend_mode == 0 && sa == 255 && ((dst >> 24) & 0xFF) == 0) return (src & 0x00FFFFFF) | 0xFF000000;

    uint32_t blended_src = (blend_mode > 0) ? w_apply_dab_blend(blend_mode, src, dst) : src;
    uint32_t sr = blended_src & 0xFF;
    uint32_t sg = (blended_src >> 8) & 0xFF;
    uint32_t sb = (blended_src >> 16) & 0xFF;

    uint32_t dr = dst & 0xFF;
    uint32_t dg = (dst >> 8) & 0xFF;
    uint32_t db = (dst >> 16) & 0xFF;
    uint32_t da = (dst >> 24) & 0xFF;

    uint32_t inv_sa = 255 - sa;
    uint32_t out_r = (sr * sa + dr * inv_sa) / 255;
    uint32_t out_g = (sg * sa + dg * inv_sa) / 255;
    uint32_t out_b = (sb * sa + db * inv_sa) / 255;
    uint32_t out_a = sa + (da * inv_sa) / 255;

    return (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
}

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    return blend_pixel_mode(dst, src, alpha_mod, 0);
}

static void clear_layer_pixels(uint32_t *pix, uint32_t num_pixels) {
    if (!pix) return;
#if defined(__wasm_simd128__)
    v128_t zero = wasm_i32x4_const(0, 0, 0, 0);
    uint32_t i = 0;
    for (; i + 16 <= num_pixels; i += 16) {
        wasm_v128_store(pix + i, zero);
        wasm_v128_store(pix + i + 4, zero);
        wasm_v128_store(pix + i + 8, zero);
        wasm_v128_store(pix + i + 12, zero);
    }
    for (; i < num_pixels; i++) {
        pix[i] = 0x00000000;
    }
#else
    for (uint32_t i = 0; i < num_pixels; i++) {
        pix[i] = 0x00000000;
    }
#endif
}

/* =========================================================================
 * Dirty Rectangle Tracking
 * Accumulates dirty bounding box for sub-region host blits
 * ========================================================================= */
static int32_t dirty_x0 = 0;
static int32_t dirty_y0 = 0;
static int32_t dirty_x1 = -1;
static int32_t dirty_y1 = -1;

static void mark_dirty_rect(int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= (int32_t)doc_width) x1 = (int32_t)doc_width - 1;
    if (y1 >= (int32_t)doc_height) y1 = (int32_t)doc_height - 1;
    if (x0 > x1 || y0 > y1) return;

    if (dirty_x1 < dirty_x0 || dirty_y1 < dirty_y0) {
        dirty_x0 = x0;
        dirty_y0 = y0;
        dirty_x1 = x1;
        dirty_y1 = y1;
    } else {
        if (x0 < dirty_x0) dirty_x0 = x0;
        if (y0 < dirty_y0) dirty_y0 = y0;
        if (x1 > dirty_x1) dirty_x1 = x1;
        if (y1 > dirty_y1) dirty_y1 = y1;
    }
}

W_EXPORT int32_t w_has_dirty_rect(void) {
    return (dirty_x1 >= dirty_x0 && dirty_y1 >= dirty_y0) ? 1 : 0;
}

W_EXPORT int32_t w_get_dirty_x0(void) { return dirty_x0; }
W_EXPORT int32_t w_get_dirty_y0(void) { return dirty_y0; }
W_EXPORT int32_t w_get_dirty_x1(void) { return dirty_x1; }
W_EXPORT int32_t w_get_dirty_y1(void) { return dirty_y1; }

W_EXPORT void w_clear_dirty_bounds(void) {
    dirty_x0 = 0;
    dirty_y0 = 0;
    dirty_x1 = -1;
    dirty_y1 = -1;
}

static void composite_region(int rx0, int ry0, int rx1, int ry1) {
    uint32_t w = doc_width;
    uint32_t h = doc_height;

    if (active_layer >= 0 && active_layer < layer_count && layers[active_layer].in_use) {
        if (layers[active_layer].width > 0 && layers[active_layer].height > 0) {
            w = (uint32_t)layers[active_layer].width;
            h = (uint32_t)layers[active_layer].height;
            doc_width = w;
            doc_height = h;
        }
    }

    if (w < 1 || h < 1) return;

    if (!out_pixels || (w * h) > out_pixels_cap) {
        out_pixels = (uint32_t*)canvas_alloc(w * h * sizeof(uint32_t));
        out_pixels_cap = w * h;
    }

    if (rx0 < 0) rx0 = 0;
    if (ry0 < 0) ry0 = 0;
    if (rx1 >= (int)w) rx1 = (int)w - 1;
    if (ry1 >= (int)h) ry1 = (int)h - 1;
    if (rx0 > rx1 || ry0 > ry1) return;

    mark_dirty_rect(rx0, ry0, rx1, ry1);

    // Checkerboard background for dirty region only
    for (int y = ry0; y <= ry1; y++) {
        int row = y * w;
        int check_y = (y / 16);
        for (int x = rx0; x <= rx1; x++) {
            int check = ((x / 16) + check_y) & 1;
            out_pixels[row + x] = check ? 0xFF2A2A2A : 0xFF222222;
        }
    }

    int order_cnt = (layer_order_count > 0) ? layer_order_count : layer_count;
    for (int p = 0; p < order_cnt; p++) {
        int l = (layer_order_count > 0) ? layer_order[p] : p;
        if (l < 0 || l >= layer_count || !layers[l].in_use || !layers[l].visible) continue;
        uint8_t op = layers[l].opacity;
        if (op == 0) continue;
        uint32_t *src_pix = layers[l].pixels;
        if (!src_pix) continue;

        int tw = layers[l].width;
        int th = layers[l].height;
        int lx = layers[l].x;
        int ly = layers[l].y;

        int sy0 = ry0 - ly; if (sy0 < 0) sy0 = 0;
        int sy1 = ry1 - ly; if (sy1 >= th) sy1 = th - 1;
        int sx0 = rx0 - lx; if (sx0 < 0) sx0 = 0;
        int sx1 = rx1 - lx; if (sx1 >= tw) sx1 = tw - 1;

        if (sx0 > sx1 || sy0 > sy1) continue;

        // Base layer lookup if clipping mask
        int base_l = -1;
        if (layers[l].clipping) {
            for (int bp = p - 1; bp >= 0; bp--) {
                int cand = (layer_order_count > 0) ? layer_order[bp] : bp;
                if (cand >= 0 && cand < layer_count && layers[cand].in_use && layers[cand].visible && !layers[cand].clipping) {
                    base_l = cand;
                    break;
                }
            }
        }
        uint32_t *base_pix = (base_l >= 0) ? layers[base_l].pixels : 0;
        int base_w = (base_l >= 0) ? layers[base_l].width : 0;
        int base_h = (base_l >= 0) ? layers[base_l].height : 0;
        int base_lx = (base_l >= 0) ? layers[base_l].x : 0;
        int base_ly = (base_l >= 0) ? layers[base_l].y : 0;
        uint8_t blend_mode = layers[l].blend_mode;

        for (int y = sy0; y <= sy1; y++) {
            int dy = ly + y;
            int src_row = y * tw;
            int out_row = dy * w;
            for (int x = sx0; x <= sx1; x++) {
                int dx = lx + x;
                uint32_t src = src_pix[src_row + x];
                if ((src & 0xFF000000) == 0) continue;

                uint8_t eff_op = op;
                if (base_pix) {
                    int bx = dx - base_lx;
                    int by = dy - base_ly;
                    if (bx < 0 || bx >= base_w || by < 0 || by >= base_h) continue;
                    uint32_t bpix = base_pix[by * base_w + bx];
                    uint32_t ba = (bpix >> 24) & 0xFF;
                    if (ba == 0) continue;
                    eff_op = (uint8_t)((op * ba) / 255);
                    if (eff_op == 0) continue;
                }

                int out_idx = out_row + dx;
                out_pixels[out_idx] = blend_pixel_mode(out_pixels[out_idx], src, eff_op, blend_mode);
            }
        }
    }
}

static int surface_dirty = 1;

static void composite_surface(void) {
    composite_region(0, 0, (int)doc_width - 1, (int)doc_height - 1);
    surface_dirty = 0;
}

void force_composite(void) {
    composite_surface();
}

static void resize_surface(uint32_t new_w, uint32_t new_h) {
    if (new_w < 1 || new_h < 1) return;
    if (new_w == doc_width && new_h == doc_height) return;

    uint32_t old_w = doc_width;
    uint32_t old_h = doc_height;
    uint32_t new_pixels = new_w * new_h;

    out_pixels = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

    uint32_t copy_w = old_w < new_w ? old_w : new_w;
    uint32_t copy_h = old_h < new_h ? old_h : new_h;

    for (int l = 0; l < layer_count; l++) {
        if (!layers[l].in_use) continue;
        if (layers[l].width == (int32_t)old_w && layers[l].height == (int32_t)old_h) {
            uint32_t *old_buf = layers[l].pixels;
            uint32_t *new_buf = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

            clear_layer_pixels(new_buf, new_pixels);

            if (old_buf) {
                for (uint32_t y = 0; y < copy_h; y++) {
                    for (uint32_t x = 0; x < copy_w; x++) {
                        new_buf[y * new_w + x] = old_buf[y * old_w + x];
                    }
                }
            }

            layers[l].pixels = new_buf;
            layers[l].width = new_w;
            layers[l].height = new_h;
        }
    }

    doc_width = new_w;
    doc_height = new_h;
    ensure_stroke_buffers(new_pixels);
    composite_surface();
}

/* =========================================================================
 * Drawing Primitives
 * ========================================================================= */

static inline uint32_t *get_current_draw_target(int *out_w, int *out_h) {
    if (active_layer >= 0 && active_layer < layer_count && layers[active_layer].in_use) {
        if (out_w) *out_w = layers[active_layer].width;
        if (out_h) *out_h = layers[active_layer].height;
        return layers[active_layer].pixels;
    }
    return 0;
}

static inline void set_pixel_blended(uint32_t *pix, int idx, uint32_t color) {
    uint32_t ca = (color >> 24) & 0xFF;
    if (ca == 255) {
        pix[idx] = color;
    } else if (ca > 0) {
        pix[idx] = blend_pixel(pix[idx], color, ca);
    }
}

static void draw_line(int x0, int y0, int x1, int y1, uint32_t color) {
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || w <= 0 || h <= 0) return;

    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h && !is_pixel_clipped(x0, y0)) {
            set_pixel_blended(pix, y0 * w + x0, color);
        }
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

static void draw_rect(int rx, int ry, int rw, int rh, uint32_t color) {
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || w <= 0 || h <= 0) return;

    for (int dy = 0; dy < rh; dy++) {
        int py = ry + dy;
        if (py < 0 || py >= h) continue;
        for (int dx = 0; dx < rw; dx++) {
            int px = rx + dx;
            if (px < 0 || px >= w) continue;
            if (is_pixel_clipped(px, py)) continue;
            set_pixel_blended(pix, py * w + px, color);
        }
    }
}

static void draw_circle(int cx, int cy, int cr, uint32_t color) {
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || w <= 0 || h <= 0) return;

    int r2 = cr * cr;
    for (int dy = -cr; dy <= cr; dy++) {
        int py = cy + dy;
        if (py < 0 || py >= h) continue;
        for (int dx = -cr; dx <= cr; dx++) {
            int px = cx + dx;
            if (px < 0 || px >= w) continue;
            if (dx * dx + dy * dy <= r2) {
                if (!is_pixel_clipped(px, py)) set_pixel_blended(pix, py * w + px, color);
            }
        }
    }
}

static void draw_ellipse(int cx, int cy, int rx, int ry, uint32_t color) {
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || w <= 0 || h <= 0 || rx <= 0 || ry <= 0) return;

    int64_t rx2 = (int64_t)rx * rx;
    int64_t ry2 = (int64_t)ry * ry;
    int64_t limit = rx2 * ry2;

    for (int dy = -ry; dy <= ry; dy++) {
        int py = cy + dy;
        if (py < 0 || py >= h) continue;
        int64_t dy2_rx2 = (int64_t)dy * dy * rx2;
        for (int dx = -rx; dx <= rx; dx++) {
            int px = cx + dx;
            if (px < 0 || px >= w) continue;
            if ((int64_t)dx * dx * ry2 + dy2_rx2 <= limit) {
                if (!is_pixel_clipped(px, py)) set_pixel_blended(pix, py * w + px, color);
            }
        }
    }
}

static void draw_grid(int step, uint32_t color) {
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || w <= 0 || h <= 0) return;

    if (step < 4) step = 4;
    for (int y = 0; y < h; y += step) {
        for (int x = 0; x < w; x++) {
            if (!is_pixel_clipped(x, y)) pix[y * w + x] = color;
        }
    }
    for (int x = 0; x < w; x += step) {
        for (int y = 0; y < h; y++) {
            if (!is_pixel_clipped(x, y)) pix[y * w + x] = color;
        }
    }
}

static void draw_image_scaled(const uint32_t *src_pixels, int src_w, int src_h, int dst_x, int dst_y, int dst_w, int dst_h, uint32_t opacity) {
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || !src_pixels || src_w <= 0 || src_h <= 0 || dst_w <= 0 || dst_h <= 0 || w <= 0 || h <= 0) return;

    for (int dy = 0; dy < dst_h; dy++) {
        int py = dst_y + dy;
        if (py < 0 || py >= h) continue;

        int sy = (dy * src_h) / dst_h;
        if (sy >= src_h) sy = src_h - 1;

        for (int dx = 0; dx < dst_w; dx++) {
            int px = dst_x + dx;
            if (px < 0 || px >= w) continue;
            if (is_pixel_clipped(px, py)) continue;

            int sx = (dx * src_w) / dst_w;
            if (sx >= src_w) sx = src_w - 1;

            uint32_t src = src_pixels[sy * src_w + sx];
            uint32_t sa = (src >> 24) & 0xFF;
            if (sa == 0) continue;

            if (opacity < 100) {
                sa = (sa * opacity) / 100;
                src = (sa << 24) | (src & 0x00FFFFFF);
            }

            int idx = py * w + px;
            pix[idx] = w_blend_fast(src, pix[idx], 255, 255);
        }
    }
}

/* =========================================================================
 * Universal Parametric Brush Engine
 * ========================================================================= */

typedef struct {
    int32_t type;            // W_MODE_DRAW, W_MODE_SMUDGE, W_MODE_BLEND, W_MODE_FILL, W_MODE_LASSO_FILL
    int32_t shape;           // Texture ID for tip shape (0=circle, 1=square, 2=chisel, or custom texture)
    int32_t size;            // Radius in px (1..512)
    int32_t opacity;         // 0..100 %
    int32_t hardness;        // 0..100 %
    int32_t flow;            // 0..100 %
    int32_t spacing;         // 1..500 % of size
    int32_t angle;           // 0..359 deg
    int32_t roundness;       // 1..100 %
    int32_t scatter;         // 0..200 %
    int32_t smudge_strength; // 0..100 %
    int32_t wetness;         // 0..100 %
    int32_t grain;           // 0..100 %
    int32_t tolerance;       // 0..255 (for fill)
    int32_t tex_mode;        // 0=off, 1=paper, 2=canvas, 3=noise, 4=dots, 5=grid, 6=grunge, 7=hatch
    int32_t tex_angle;       // 0..359 deg
    int32_t tex_scale;       // 1..500 %
    int32_t smooth;          // 0..100 % stroke smoothing
    int32_t midpoint;        // 0..100 % bezier midpoint ratio (default 50)
    int32_t tex_contrast;    // 0..200 % grain texture contrast (default 100)
    int32_t auto_rotate;     // 0=off, 1=on (follows trajectory angle)
    int32_t velocity;        // 0..100 % velocity dynamics sensitivity
    int32_t taper_in;        // taper in distance in px (0..500)
    int32_t taper_out;       // taper out distance in px (0..500)
    int32_t fade;            // fade stroke distance in px (0=off, 1..5000)
    int32_t size_jitter;     // 0..100 %
    int32_t angle_jitter;    // 0..360 deg
    int32_t opacity_jitter;  // 0..100 %
    int32_t color_jitter;    // 0..100 %
    int32_t dab_blend;       // 0=normal, 1=multiply, 2=screen, 3=overlay, 4=dodge, 5=add
    int32_t subpixel;        // 0=off, 1=on
    int32_t depletion;       // 0..100 %
    int32_t color_pickup;    // 0..100 %
    int32_t dual_shape;      // -1=none, or layer id
    int32_t dual_size;       // 1..500 % (default 100)
    int32_t dual_spacing;    // 1..500 % (default 20)
    int32_t symmetry;        // 0=off, 1=vertical, 2=horizontal, 3=both
    int32_t pressure_size;   // 0=off, 1=on (stylus pressure scales size)
    int32_t pressure_flow;   // 0=off, 1=on (stylus pressure scales flow)
    int32_t tilt_angle;      // 0=off, 1=on (stylus tilt controls angle/roundness)
    int32_t buildup;         // 0=off (Photoshop stroke opacity ceiling), 1=on (continuous accumulation)
} w_brush_config_t;

static w_brush_config_t brush_config = {
    .type = W_MODE_DRAW,
    .shape = 0,
    .size = 16,
    .opacity = 100,
    .hardness = 100,
    .flow = 100,
    .spacing = 5,
    .angle = 0,
    .roundness = 100,
    .scatter = 0,
    .smudge_strength = 0,
    .wetness = 0,
    .grain = 0,
    .tolerance = 32,
    .tex_mode = 0,
    .tex_angle = 0,
    .tex_scale = 100,
    .smooth = 0,
    .midpoint = 50,
    .tex_contrast = 100,
    .auto_rotate = 0,
    .velocity = 0,
    .taper_in = 0,
    .taper_out = 0,
    .fade = 0,
    .size_jitter = 0,
    .angle_jitter = 0,
    .opacity_jitter = 0,
    .color_jitter = 0,
    .dab_blend = 0,
    .subpixel = 0,
    .depletion = 0,
    .color_pickup = 0,
    .dual_shape = -1,
    .dual_size = 100,
    .dual_spacing = 10,
    .symmetry = 0,
    .pressure_size = 1,
    .pressure_flow = 1,
    .tilt_angle = 1,
    .buildup = 0
};

static uint32_t stroke_generation = 0;
static uint32_t *stroke_tag = 0;
static uint8_t  *stroke_mask = 0;
static uint32_t *stroke_orig = 0;
static uint32_t stroke_buf_cap = 0;

static void ensure_stroke_buffers(uint32_t required_pixels) {
    if (required_pixels > stroke_buf_cap) {
        stroke_buf_cap = required_pixels;
        stroke_tag = (uint32_t*)canvas_alloc(required_pixels * sizeof(uint32_t));
        stroke_mask = (uint8_t*)canvas_alloc(required_pixels * sizeof(uint8_t));
        stroke_orig = (uint32_t*)canvas_alloc(required_pixels * sizeof(uint32_t));
        for (uint32_t i = 0; i < required_pixels; i++) {
            stroke_tag[i] = 0;
            stroke_mask[i] = 0;
            stroke_orig[i] = 0;
        }
        stroke_generation = 1;
    }
}

static uint32_t rng_state = 0x87654321;
static inline uint32_t next_random(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

#define MAX_QUEUE 262144
static int32_t qx[MAX_QUEUE];
static int32_t qy[MAX_QUEUE];

#define MAX_POLY 8192
static int poly_x[MAX_POLY];
static int poly_y[MAX_POLY];
static int poly_count = 0;

#define MAX_SAMPLE 8192
static uint32_t sample_buf[MAX_SAMPLE];

static inline int color_match(uint32_t c1, uint32_t c2, int tol) {
    if (c1 == c2) return 1;
    int r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
    int r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
    int dr = r1 - r2; if (dr < 0) dr = -dr;
    int dg = g1 - g2; if (dg < 0) dg = -dg;
    int db = b1 - b2; if (db < 0) db = -db;
    int da = a1 - a2; if (da < 0) da = -da;
    return (dr <= tol && dg <= tol && db <= tol && da <= tol);
}

static inline uint32_t mix_color(uint32_t c1, uint32_t c2, int rate) {
    uint32_t r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
    uint32_t r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
    uint32_t r = (r1 * rate + r2 * (100 - rate)) / 100;
    uint32_t g = (g1 * rate + g2 * (100 - rate)) / 100;
    uint32_t b = (b1 * rate + b2 * (100 - rate)) / 100;
    uint32_t a = (a1 * rate + a2 * (100 - rate)) / 100;
    if (a == 0 && a2 > 0) a = a2;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

static void fill_polygon(uint32_t *pixels, int width, int height, uint32_t fill_color, int is_eraser) {
    if (poly_count < 3) return;
    int is_alpha_locked = (active_layer >= 0 && active_layer < layer_count && layers[active_layer].alpha_lock);
    int min_y = poly_y[0], max_y = poly_y[0];
    for (int i = 1; i < poly_count; i++) {
        if (poly_y[i] < min_y) min_y = poly_y[i];
        if (poly_y[i] > max_y) max_y = poly_y[i];
    }
    if (min_y < 0) min_y = 0;
    if (max_y >= height) max_y = height - 1;

    uint32_t dab_flow_a = (255 * brush_config.flow) / 100;
    if (dab_flow_a < 1 && brush_config.flow > 0) dab_flow_a = 1;

    uint32_t max_stroke_a = (255 * brush_config.opacity) / 100;
    if (max_stroke_a < 1 && brush_config.opacity > 0) max_stroke_a = 1;

    int node_x[256];
    for (int y = min_y; y <= max_y; y++) {
        int nodes = 0;
        int j = poly_count - 1;
        for (int i = 0; i < poly_count; i++) {
            if ((poly_y[i] <= y && poly_y[j] > y) || (poly_y[j] <= y && poly_y[i] > y)) {
                if (nodes < 255) {
                    int dy = poly_y[j] - poly_y[i];
                    if (dy != 0) {
                        node_x[nodes++] = poly_x[i] + (y - poly_y[i]) * (poly_x[j] - poly_x[i]) / dy;
                    }
                }
            }
            j = i;
        }
        for (int i = 0; i < nodes - 1; i++) {
            for (int k = i + 1; k < nodes; k++) {
                if (node_x[i] > node_x[k]) {
                    int tmp = node_x[i]; node_x[i] = node_x[k]; node_x[k] = tmp;
                }
            }
        }
        for (int i = 0; i < nodes; i += 2) {
            if (i + 1 >= nodes) break;
            int x_start = node_x[i] < 0 ? 0 : node_x[i];
            int x_end = node_x[i + 1] >= width ? (width - 1) : node_x[i + 1];
            for (int x = x_start; x <= x_end; x++) {
                if (is_pixel_clipped(x, y)) continue;
                if (brush_config.grain > 0) {
                    if ((next_random() % 100) < (uint32_t)brush_config.grain) continue;
                }

                uint32_t a = (dab_flow_a * max_stroke_a) / 255;
                if (brush_config.tex_mode > 0 || (g_texture.pixels && g_texture.width > 0)) {
                    a = w_sample_texture(brush_config.tex_mode, x, y, brush_config.tex_angle, brush_config.tex_scale, brush_config.tex_contrast, a);
                }
                if (a == 0) continue;

                int idx = y * width + x;
                uint32_t dst_p = pixels[idx];
                uint32_t orig_a = (dst_p >> 24) & 0xFF;
                if (is_alpha_locked && orig_a == 0) continue;

                if (is_eraser) {
                    if (!is_alpha_locked) {
                        if (!brush_config.buildup && stroke_tag && stroke_mask && stroke_orig) {
                            if (stroke_tag[idx] != stroke_generation) {
                                stroke_tag[idx] = stroke_generation;
                                stroke_orig[idx] = dst_p;
                                stroke_mask[idx] = 0;
                            }
                            uint32_t cur_m = stroke_mask[idx];
                            uint32_t new_m = cur_m + (a * (255 - cur_m)) / 255;
                            if (new_m > 255) new_m = 255;
                            stroke_mask[idx] = (uint8_t)new_m;
                            uint32_t eff_erase_a = (new_m * max_stroke_a) / 255;
                            uint32_t init_da = (stroke_orig[idx] >> 24) & 0xFF;
                            uint32_t na = (eff_erase_a >= init_da) ? 0 : (init_da - eff_erase_a);
                            pixels[idx] = (na == 0) ? 0 : ((na << 24) | (stroke_orig[idx] & 0x00FFFFFF));
                        } else {
                            uint32_t da = orig_a;
                            uint32_t na = (a >= da) ? 0 : (da - a);
                            pixels[idx] = (na == 0) ? 0 : ((na << 24) | (dst_p & 0x00FFFFFF));
                        }
                    }
                } else {
                    if (!brush_config.buildup && stroke_tag && stroke_mask && stroke_orig) {
                        if (stroke_tag[idx] != stroke_generation) {
                            stroke_tag[idx] = stroke_generation;
                            stroke_orig[idx] = dst_p;
                            stroke_mask[idx] = 0;
                        }
                        uint32_t cur_m = stroke_mask[idx];
                        uint32_t new_m = cur_m + (a * (255 - cur_m)) / 255;
                        if (new_m > 255) new_m = 255;
                        stroke_mask[idx] = (uint8_t)new_m;
                        uint32_t eff_a = (new_m * max_stroke_a) / 255;
                        uint32_t res = w_blend_fast(fill_color, stroke_orig[idx], eff_a, 255);
                        pixels[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
                    } else {
                        uint32_t res = w_blend_fast(fill_color, dst_p, a, max_stroke_a);
                        pixels[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
                    }
                }
            }
        }
    }
}

static int32_t last_trajectory_angle = 0;

/**
 * Renders a single parametric dab at (cx, cy) onto active layer pixels.
 * Samples shape texture alpha channel for arbitrary tip geometry.
 */
static void render_parametric_dab(uint32_t *pix, int w, int h, int cx, int cy, uint32_t color, int eraser, int move_dx, int move_dy, int dab_r, int dab_angle, int dab_flow_pct, int cur_d) {
    int is_alpha_locked = (active_layer >= 0 && active_layer < layer_count && layers[active_layer].alpha_lock);
    int r = (dab_r > 0) ? dab_r : brush_config.size;
    if (r < 1) r = 1;
    int roundness = brush_config.roundness > 0 ? brush_config.roundness : 100;
    int inner_r = (r * brush_config.hardness) / 100;
    int r_sq = r * r;
    int inner_r_sq = inner_r * inner_r;
    int bound_r = (r * 142) / 100 + 1;

    int sin_val = 0, cos_val = 1024;
    int eff_angle = dab_angle;
    if (brush_config.auto_rotate) {
        eff_angle = (eff_angle + last_trajectory_angle + 360) % 360;
    }
    int is_unrotated = (eff_angle == 0);
    if (!is_unrotated) {
        w_sincos_deg(eff_angle, &sin_val, &cos_val);
    }

    int min_x = cx - bound_r; if (min_x < 0) min_x = 0;
    int max_x = cx + bound_r; if (max_x >= w) max_x = w - 1;
    int min_y = cy - bound_r; if (min_y < 0) min_y = 0;
    int max_y = cy + bound_r; if (max_y >= h) max_y = h - 1;

    int eff_flow = (brush_config.flow * dab_flow_pct) / 100;
    uint32_t dab_flow_a = (255 * eff_flow) / 100;
    if (dab_flow_a < 1 && eff_flow > 0) dab_flow_a = 1;

    uint32_t max_stroke_a = (255 * brush_config.opacity) / 100;
    if (max_stroke_a < 1 && brush_config.opacity > 0) max_stroke_a = 1;

    int shape_id = brush_config.shape;
    if (shape_id < 0 || shape_id >= layer_count || !layers[shape_id].in_use) {
        shape_id = 0;
    }
    layer_t *stex = &layers[shape_id];
    int is_builtin_circle = (shape_id == 0);
    int is_builtin_square = (shape_id == 1);
    int has_dual = (brush_config.dual_shape >= 0 && brush_config.dual_shape < layer_count && layers[brush_config.dual_shape].in_use);
    layer_t *dtex = has_dual ? &layers[brush_config.dual_shape] : 0;
    int dual_r = has_dual ? ((r * brush_config.dual_size) / 100) : 1;
    if (dual_r < 1) dual_r = 1;

    int has_tex = (brush_config.tex_mode > 0 || (g_texture.pixels && g_texture.width > 0));

    for (int y = min_y; y <= max_y; y++) {
        int dy = y - cy;
        int row_u = dy * sin_val;
        int row_v = dy * cos_val;
        int row_idx = y * w;

        for (int x = min_x; x <= max_x; x++) {
            if (is_pixel_clipped(x, y)) continue;
            int dx = x - cx;

            int u, v;
            if (is_unrotated) {
                u = dx;
                v = dy;
            } else {
                u = (dx * cos_val + row_u) >> 10;
                v = (-dx * sin_val + row_v) >> 10;
            }

            int v_scaled = (roundness == 100) ? v : ((v * 100) / roundness);
            int abs_u = u < 0 ? -u : u;
            if (abs_u > r) continue;
            int abs_v = v_scaled < 0 ? -v_scaled : v_scaled;
            if (abs_v > r) continue;

            int dist_sq = u * u + v_scaled * v_scaled;
            if (!is_builtin_square && dist_sq > r_sq) continue;

            uint32_t shape_a = 255;
            if (!is_builtin_circle && !is_builtin_square) {
                if (stex->pixels && stex->width > 0 && stex->height > 0) {
                    int sx = ((u + r) * (stex->width - 1)) / (2 * r);
                    int sy = ((v_scaled + r) * (stex->height - 1)) / (2 * r);
                    if (sx >= 0 && sx < stex->width && sy >= 0 && sy < stex->height) {
                        uint32_t sp = stex->pixels[sy * stex->width + sx];
                        shape_a = (sp >> 24) & 0xFF;
                    } else {
                        shape_a = 0;
                    }
                }
            }
            if (shape_a == 0) continue;

            // Dual brush
            if (has_dual && dtex && dtex->pixels && dtex->width > 0 && dtex->height > 0) {
                int dsx = ((u + dual_r) * (dtex->width - 1)) / (2 * dual_r);
                int dsy = ((v_scaled + dual_r) * (dtex->height - 1)) / (2 * dual_r);
                uint32_t dual_a = 0;
                if (dsx >= 0 && dsx < dtex->width && dsy >= 0 && dsy < dtex->height) {
                    dual_a = (dtex->pixels[dsy * dtex->width + dsx] >> 24) & 0xFF;
                }
                shape_a = (shape_a * dual_a) / 255;
                if (shape_a == 0) continue;
            }

            int dist = -1;
            if (brush_config.subpixel) {
                dist = w_isqrt(dist_sq);
                if (dist >= r - 1) {
                    int edge = (r * 255 - dist * 255);
                    if (edge < 0) edge = 0;
                    if (edge > 255) edge = 255;
                    shape_a = (shape_a * (uint32_t)edge) / 255;
                    if (shape_a == 0) continue;
                }
            }

            // Stochastic Grain
            if (brush_config.grain > 0) {
                if ((next_random() % 100) < (uint32_t)brush_config.grain) continue;
            }

            // Hardness / Softness falloff & Flow alpha calculation
            uint32_t a = (dab_flow_a * shape_a) / 255;
            if (brush_config.hardness < 100 && r > 0) {
                if (dist_sq > inner_r_sq) {
                    if (dist < 0) dist = w_isqrt(dist_sq);
                    if (brush_config.hardness == 0) {
                        int num = (r - dist);
                        if (num < 0) num = 0;
                        a = (a * num * num) / (r_sq > 0 ? r_sq : 1);
                    } else {
                        int num = (r - dist);
                        int den = (r - inner_r);
                        if (den > 0 && num > 0) {
                            a = (a * num) / den;
                        } else {
                            a = 0;
                        }
                    }
                }
            }

            if (has_tex) {
                a = w_sample_texture(brush_config.tex_mode, x, y, brush_config.tex_angle, brush_config.tex_scale, brush_config.tex_contrast, a);
            }
            if (a == 0) continue;

            int idx = row_idx + x;
            uint32_t dst_p = pix[idx];
            uint32_t orig_a = (dst_p >> 24) & 0xFF;
            if (is_alpha_locked && orig_a == 0) continue;

            if (eraser) {
                if (!is_alpha_locked) {
                    if (!brush_config.buildup && stroke_tag && stroke_mask && stroke_orig) {
                        if (stroke_tag[idx] != stroke_generation) {
                            stroke_tag[idx] = stroke_generation;
                            stroke_orig[idx] = dst_p;
                            stroke_mask[idx] = 0;
                        }
                        uint32_t cur_m = stroke_mask[idx];
                        uint32_t new_m = cur_m + (a * (255 - cur_m)) / 255;
                        if (new_m > 255) new_m = 255;
                        stroke_mask[idx] = (uint8_t)new_m;
                        uint32_t eff_erase_a = (new_m * max_stroke_a) / 255;
                        uint32_t init_da = (stroke_orig[idx] >> 24) & 0xFF;
                        uint32_t na = (eff_erase_a >= init_da) ? 0 : (init_da - eff_erase_a);
                        pix[idx] = (na == 0) ? 0 : ((na << 24) | (stroke_orig[idx] & 0x00FFFFFF));
                    } else {
                        uint32_t eff_erase_a = (a * max_stroke_a) / 255;
                        uint32_t da = orig_a;
                        uint32_t na = (eff_erase_a >= da) ? 0 : (da - eff_erase_a);
                        pix[idx] = (na == 0) ? 0 : ((na << 24) | (dst_p & 0x00FFFFFF));
                    }
                }
            } else if (brush_config.type == W_MODE_SMUDGE) {
                if (move_dx == 0 && move_dy == 0) continue;
                int sx = x - move_dx;
                int sy = y - move_dy;
                uint32_t src_p = 0;
                if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                    src_p = pix[sy * w + sx];
                }
                uint32_t src_a = (src_p >> 24) & 0xFF;
                if (src_a == 0 && orig_a == 0) continue;

                int strength = (brush_config.smudge_strength > 0) ? brush_config.smudge_strength : 70;
                uint32_t eff_a = (a * max_stroke_a) / 255;
                int eff_t = (strength * eff_a) / 255;
                if (eff_t <= 0) continue;
                if (eff_t > 100) eff_t = 100;

                uint32_t res = mix_color(src_p, dst_p, eff_t);
                pix[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
            } else if (brush_config.type == W_MODE_BLEND) {
                int step = (r > 6) ? (r / 4) : 1;
                uint32_t c0 = dst_p;
                uint32_t c1 = (x - step >= 0) ? pix[y * w + (x - step)] : c0;
                uint32_t c2 = (x + step < w) ? pix[y * w + (x + step)] : c0;
                uint32_t c3 = (y - step >= 0) ? pix[(y - step) * w + x] : c0;
                uint32_t c4 = (y + step < h) ? pix[(y + step) * w + x] : c0;

                uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0, count = 0;
                uint32_t samples[5] = { c0, c1, c2, c3, c4 };
                for (int s = 0; s < 5; s++) {
                    uint32_t p = samples[s];
                    uint32_t pa = (p >> 24) & 0xFF;
                    if (pa > 0) {
                        sum_r += (p & 0xFF);
                        sum_g += ((p >> 8) & 0xFF);
                        sum_b += ((p >> 16) & 0xFF);
                        sum_a += pa;
                        count++;
                    }
                }

                uint32_t local_c;
                if (count > 0) {
                    local_c = ((sum_a / count) << 24) |
                              ((sum_b / count) << 16) |
                              ((sum_g / count) << 8)  |
                              (sum_r / count);
                } else {
                    local_c = color;
                }

                // If smudge_strength > 0, pull pixels from trailing stroke vector
                if (brush_config.smudge_strength > 0 && (move_dx != 0 || move_dy != 0)) {
                    int sx = x - move_dx;
                    int sy = y - move_dy;
                    if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                        uint32_t src_p = pix[sy * w + sx];
                        if (((src_p >> 24) & 0xFF) > 0) {
                            local_c = mix_color(src_p, local_c, brush_config.smudge_strength);
                        }
                    }
                }

                uint32_t target_c;
                if ((dst_p >> 24) == 0 && count == 0) {
                    if (brush_config.depletion > 0) {
                        int dep_pct = (cur_d * brush_config.depletion) / 500;
                        if (dep_pct > 100) dep_pct = 100;
                        int fresh_rate = ((100 - brush_config.wetness) * (100 - dep_pct)) / 100;
                        if (fresh_rate <= 0) continue;
                    }
                    target_c = color;
                } else {
                    int brush_rate = 100 - brush_config.wetness;
                    if (brush_config.depletion > 0) {
                        int dep_pct = (cur_d * brush_config.depletion) / 500;
                        if (dep_pct > 100) dep_pct = 100;
                        brush_rate = (brush_rate * (100 - dep_pct)) / 100;
                    }
                    if (brush_rate < 0) brush_rate = 0;
                    if (brush_rate > 100) brush_rate = 100;
                    target_c = mix_color(color, local_c, brush_rate);
                    if ((color >> 24) != 0 || (local_c >> 24) != 0) {
                        uint32_t col_a = (color >> 24) & 0xFF;
                        uint32_t loc_a = (local_c >> 24) & 0xFF;
                        uint32_t max_a = col_a > loc_a ? col_a : loc_a;
                        if (max_a > 0) {
                            target_c = (max_a << 24) | (target_c & 0x00FFFFFF);
                        }
                    }
                }

                if (!brush_config.buildup && stroke_tag && stroke_mask && stroke_orig) {
                    if (stroke_tag[idx] != stroke_generation) {
                        stroke_tag[idx] = stroke_generation;
                        stroke_orig[idx] = dst_p;
                        stroke_mask[idx] = 0;
                    }
                    uint32_t cur_m = stroke_mask[idx];
                    uint32_t new_m = cur_m + (a * (255 - cur_m)) / 255;
                    if (new_m > 255) new_m = 255;
                    stroke_mask[idx] = (uint8_t)new_m;
                    uint32_t eff_stroke_a = (new_m * max_stroke_a) / 255;
                    uint32_t res = w_blend_fast(target_c, stroke_orig[idx], eff_stroke_a, 255);
                    pix[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
                } else {
                    uint32_t eff_dab_a = (a * max_stroke_a) / 255;
                    uint32_t res = w_blend_fast(target_c, dst_p, eff_dab_a, 255);
                    pix[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
                }
            } else {
                uint32_t target_color = color;
                if (brush_config.smudge_strength > 0 && (move_dx != 0 || move_dy != 0)) {
                    int sx = x - move_dx;
                    int sy = y - move_dy;
                    uint32_t src_p = 0;
                    if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                        src_p = pix[sy * w + sx];
                    }
                    uint32_t src_a = (src_p >> 24) & 0xFF;
                    if (src_a > 0) {
                        target_color = mix_color(src_p, target_color, brush_config.smudge_strength);
                    }
                }
                if (brush_config.dab_blend > 0) {
                    target_color = w_apply_dab_blend(brush_config.dab_blend, target_color, dst_p);
                }
                if (!brush_config.buildup && stroke_tag && stroke_mask && stroke_orig) {
                    if (stroke_tag[idx] != stroke_generation) {
                        stroke_tag[idx] = stroke_generation;
                        stroke_orig[idx] = dst_p;
                        stroke_mask[idx] = 0;
                    }
                    uint32_t cur_m = stroke_mask[idx];
                    uint32_t new_m = cur_m + (a * (255 - cur_m)) / 255;
                    if (new_m > 255) new_m = 255;
                    stroke_mask[idx] = (uint8_t)new_m;
                    uint32_t eff_stroke_a = (new_m * max_stroke_a) / 255;
                    uint32_t res = w_blend_fast(target_color, stroke_orig[idx], eff_stroke_a, 255);
                    pix[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
                } else {
                    uint32_t eff_dab_a = (a * max_stroke_a) / 255;
                    uint32_t res = w_blend_fast(target_color, dst_p, eff_dab_a, 255);
                    pix[idx] = is_alpha_locked ? ((res & 0x00FFFFFF) | (orig_a << 24)) : res;
                }
            }
        }
    }
}

/* =========================================================================
 * Native Esenho Canvas API Exports
 * ========================================================================= */

static int surface_initialized = 0;

static void init_surface_if_needed(void) {
    if (!surface_initialized) {
        surface_initialized = 1;
        ensure_layer_capacity(64);
        init_builtin_shapes();
        out_pixels = (uint32_t*)canvas_alloc(doc_width * doc_height * sizeof(uint32_t));

        // Slot 3: Initial Canvas Document Layer
        layers[3].in_use = 1;
        layers[3].width = doc_width;
        layers[3].height = doc_height;
        layers[3].visible = 1;
        layers[3].opacity = 255;
        layers[3].x = 0; layers[3].y = 0;
        layers[3].pixels = (uint32_t*)canvas_alloc(doc_width * doc_height * sizeof(uint32_t));
        for (uint32_t i = 0; i < doc_width * doc_height; i++) layers[3].pixels[i] = 0x00000000;

        layer_count = 4;
        active_layer = 3;
        for (int i = 0; i < 4; i++) layer_order_add(i);
        ensure_stroke_buffers(doc_width * doc_height);
        force_composite();
    }
}

W_EXPORT void w_init(uint32_t width, uint32_t height) {
    if (width < 1 || height < 1) return;
    if (!surface_initialized) {
        doc_width = width;
        doc_height = height;
        init_surface_if_needed();
    } else {
        resize_surface(width, height);
    }
}

W_EXPORT void w_resize(uint32_t width, uint32_t height) {
    init_surface_if_needed();
    resize_surface(width, height);
}

W_EXPORT int32_t w_layer_create(int32_t width, int32_t height) {
    init_surface_if_needed();
    return layer_alloc_slot(width, height, 1);
}

static int selection_scratch_layer = -1;

W_EXPORT int32_t w_get_selection_scratch_layer(void) {
    init_surface_if_needed();
    int w = get_width();
    int h = get_height();
    if (selection_scratch_layer >= 0 && selection_scratch_layer < layer_count && layers[selection_scratch_layer].in_use) {
        if (layers[selection_scratch_layer].width != w || layers[selection_scratch_layer].height != h) {
            w_layer_resize(selection_scratch_layer, w, h, 0);
        }
        return selection_scratch_layer;
    }
    int idx = layer_alloc_slot(w, h, 0);
    if (idx >= 0) {
        layers[idx].visible = 0;
        selection_scratch_layer = idx;
    }
    return idx;
}

W_EXPORT int32_t w_layer_add(void) {
    init_surface_if_needed();
    int w = get_width();
    int h = get_height();
    int idx = layer_alloc_slot(w, h, 1);
    if (idx >= 0) {
        active_layer = idx;
        force_composite();
    }
    return idx;
}

W_EXPORT void w_layer_select(int32_t idx) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) {
        active_layer = idx;
        force_composite();
    }
}

W_EXPORT void w_set_active_layer(int32_t idx) {
    w_layer_select(idx);
}

W_EXPORT uint32_t *w_layer_get_pixels(int32_t layer_idx) {
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) return layers[idx].pixels;
    return 0;
}

W_EXPORT int32_t w_layer_get_width(int32_t layer_idx) {
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) return layers[idx].width;
    return 0;
}

W_EXPORT int32_t w_layer_get_height(int32_t layer_idx) {
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) return layers[idx].height;
    return 0;
}

W_EXPORT uint8_t w_layer_get_visible(int32_t layer_idx) {
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) return layers[idx].visible;
    return 0;
}

W_EXPORT uint8_t w_layer_get_opacity(int32_t layer_idx) {
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) return layers[idx].opacity;
    return 0;
}

W_EXPORT void w_layer_set_pixels(int32_t layer_idx, uint32_t *pixels, int32_t width, int32_t height) {
    init_surface_if_needed();
    if (layer_idx >= 0) {
        ensure_layer_capacity(layer_idx + 1);
        layers[layer_idx].in_use = 1;
        layers[layer_idx].pixels = pixels;
        layers[layer_idx].width = width;
        layers[layer_idx].height = height;
        if (layer_idx >= layer_count) layer_count = layer_idx + 1;
        layer_order_add(layer_idx);
    }
}

W_EXPORT void w_layer_delete(int32_t idx) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) {
        clear_layer_pixels(layers[idx].pixels, layers[idx].width * layers[idx].height);
        layers[idx].in_use = 0;
        layers[idx].visible = 0;
        layer_order_remove(idx);
        if (active_layer == idx) {
            for (int l = layer_count - 1; l >= 0; l--) {
                if (layers[l].in_use && layers[l].visible) {
                    active_layer = l;
                    break;
                }
            }
        }
        force_composite();
    }
}

W_EXPORT void w_layer_toggle(int32_t idx) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) {
        layers[idx].visible = !layers[idx].visible;
        force_composite();
    }
}

W_EXPORT void w_layer_set_visible(int32_t idx, int32_t visible) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) {
        layers[idx].visible = visible ? 1 : 0;
        force_composite();
    }
}

W_EXPORT void w_layer_opacity(int32_t idx, uint32_t opacity) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) {
        if (opacity > 255) opacity = 255;
        layers[idx].opacity = (uint8_t)opacity;
        force_composite();
    }
}

W_EXPORT void w_layer_set_opacity(int32_t idx, uint32_t opacity) {
    w_layer_opacity(idx, opacity);
}

W_EXPORT void w_layer_clear(int32_t idx) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        clear_layer_pixels(layers[target].pixels, layers[target].width * layers[target].height);
        force_composite();
    }
}

W_EXPORT int32_t w_layer_resize(int32_t layer_idx, int32_t new_w, int32_t new_h, int32_t resample) {
    init_surface_if_needed();
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx < 0 || idx >= layer_count || !layers[idx].in_use) return -1;
    if (new_w <= 0 || new_h <= 0) return -1;

    int old_w = layers[idx].width;
    int old_h = layers[idx].height;
    if (new_w == old_w && new_h == old_h) return 0;

    uint32_t *old_pix = layers[idx].pixels;
    uint32_t *new_pix = (uint32_t*)canvas_alloc(new_w * new_h * sizeof(uint32_t));
    if (!new_pix) return -1;

    if (resample && old_pix && old_w > 0 && old_h > 0) {
        for (int y = 0; y < new_h; y++) {
            float src_y = ((float)y + 0.5f) * (float)old_h / (float)new_h - 0.5f;
            int y0 = (int)src_y;
            if (y0 < 0) y0 = 0;
            int y1 = y0 + 1;
            if (y1 >= old_h) y1 = old_h - 1;
            float fy = src_y - (float)y0;
            if (fy < 0.0f) fy = 0.0f;
            if (fy > 1.0f) fy = 1.0f;

            for (int x = 0; x < new_w; x++) {
                float src_x = ((float)x + 0.5f) * (float)old_w / (float)new_w - 0.5f;
                int x0 = (int)src_x;
                if (x0 < 0) x0 = 0;
                int x1 = x0 + 1;
                if (x1 >= old_w) x1 = old_w - 1;
                float fx = src_x - (float)x0;
                if (fx < 0.0f) fx = 0.0f;
                if (fx > 1.0f) fx = 1.0f;

                uint32_t c00 = old_pix[y0 * old_w + x0];
                uint32_t c10 = old_pix[y0 * old_w + x1];
                uint32_t c01 = old_pix[y1 * old_w + x0];
                uint32_t c11 = old_pix[y1 * old_w + x1];

                float w00 = (1.0f - fx) * (1.0f - fy);
                float w10 = fx * (1.0f - fy);
                float w01 = (1.0f - fx) * fy;
                float w11 = fx * fy;

                int r = (int)((c00 & 0xFF) * w00 + (c10 & 0xFF) * w10 + (c01 & 0xFF) * w01 + (c11 & 0xFF) * w11);
                int g = (int)(((c00 >> 8) & 0xFF) * w00 + (((c10 >> 8) & 0xFF) * w10) + (((c01 >> 8) & 0xFF) * w01) + (((c11 >> 8) & 0xFF) * w11));
                int b = (int)(((c00 >> 16) & 0xFF) * w00 + (((c10 >> 16) & 0xFF) * w10) + (((c01 >> 16) & 0xFF) * w01) + (((c11 >> 16) & 0xFF) * w11));
                int a = (int)(((c00 >> 24) & 0xFF) * w00 + (((c10 >> 24) & 0xFF) * w10) + (((c01 >> 24) & 0xFF) * w01) + (((c11 >> 24) & 0xFF) * w11));

                if (r < 0) r = 0; if (r > 255) r = 255;
                if (g < 0) g = 0; if (g > 255) g = 255;
                if (b < 0) b = 0; if (b > 255) b = 255;
                if (a < 0) a = 0; if (a > 255) a = 255;

                new_pix[y * new_w + x] = (uint32_t)((a << 24) | (b << 16) | (g << 8) | r);
            }
        }
    } else {
        for (int i = 0; i < new_w * new_h; i++) new_pix[i] = 0;
        if (old_pix) {
            int copy_w = old_w < new_w ? old_w : new_w;
            int copy_h = old_h < new_h ? old_h : new_h;
            for (int y = 0; y < copy_h; y++) {
                for (int x = 0; x < copy_w; x++) {
                    new_pix[y * new_w + x] = old_pix[y * old_w + x];
                }
            }
        }
    }

    layers[idx].pixels = new_pix;
    layers[idx].width = new_w;
    layers[idx].height = new_h;

    if (g_texture.pixels == old_pix) {
        g_texture.pixels = new_pix;
        g_texture.width = new_w;
        g_texture.height = new_h;
    }

    force_composite();
    return 0;
}

W_EXPORT int32_t w_layer_duplicate(int32_t layer_idx) {
    init_surface_if_needed();
    int src_idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (src_idx < 0 || src_idx >= layer_count || !layers[src_idx].in_use) return -1;

    int w = layers[src_idx].width;
    int h = layers[src_idx].height;
    int new_idx = layer_alloc_slot(w, h, layers[src_idx].visible);
    if (new_idx < 0) return -1;

    layers[new_idx].opacity = layers[src_idx].opacity;
    layers[new_idx].x = layers[src_idx].x;
    layers[new_idx].y = layers[src_idx].y;

    if (layers[src_idx].pixels && layers[new_idx].pixels) {
        for (int i = 0; i < w * h; i++) {
            layers[new_idx].pixels[i] = layers[src_idx].pixels[i];
        }
    }
    active_layer = new_idx;
    force_composite();
    return new_idx;
}

W_EXPORT int32_t w_layer_get_order_count(void) {
    init_surface_if_needed();
    return layer_order_count;
}

W_EXPORT int32_t w_layer_get_order(int32_t pos) {
    init_surface_if_needed();
    if (pos >= 0 && pos < layer_order_count) return layer_order[pos];
    return -1;
}

W_EXPORT int32_t w_layer_move_up(int32_t layer_idx) {
    init_surface_if_needed();
    int target = (layer_idx >= 0) ? layer_idx : active_layer;
    for (int i = 0; i < layer_order_count - 1; i++) {
        if (layer_order[i] == target) {
            int32_t tmp = layer_order[i];
            layer_order[i] = layer_order[i + 1];
            layer_order[i + 1] = tmp;
            force_composite();
            return 1;
        }
    }
    return 0;
}

W_EXPORT int32_t w_layer_move_down(int32_t layer_idx) {
    init_surface_if_needed();
    int target = (layer_idx >= 0) ? layer_idx : active_layer;
    for (int i = 1; i < layer_order_count; i++) {
        if (layer_order[i] == target) {
            int32_t tmp = layer_order[i];
            layer_order[i] = layer_order[i - 1];
            layer_order[i - 1] = tmp;
            force_composite();
            return 1;
        }
    }
    return 0;
}

W_EXPORT int32_t w_layer_merge_down(int32_t layer_idx) {
    init_surface_if_needed();
    int src = (layer_idx >= 0) ? layer_idx : active_layer;
    if (src < 0 || src >= layer_count || !layers[src].in_use) return -1;

    int pos = -1;
    for (int i = 0; i < layer_order_count; i++) {
        if (layer_order[i] == src) {
            pos = i;
            break;
        }
    }
    if (pos <= 0) return -1; // Cannot merge down bottom layer

    int dst = layer_order[pos - 1];
    if (dst < 0 || dst >= layer_count || !layers[dst].in_use) return -1;

    layer_t *s = &layers[src];
    layer_t *d = &layers[dst];
    if (!s->pixels || !d->pixels) return -1;

    int sw = s->width, sh = s->height;
    int dw = d->width, dh = d->height;
    uint8_t sop = s->opacity;

    for (int y = 0; y < dh; y++) {
        int sy = y + d->y - s->y;
        if (sy < 0 || sy >= sh) continue;
        int d_row = y * dw;
        int s_row = sy * sw;
        for (int x = 0; x < dw; x++) {
            int sx = x + d->x - s->x;
            if (sx < 0 || sx >= sw) continue;
            uint32_t sp = s->pixels[s_row + sx];
            if ((sp >> 24) == 0) continue;
            d->pixels[d_row + x] = blend_pixel(d->pixels[d_row + x], sp, sop);
        }
    }

    clear_layer_pixels(s->pixels, s->width * s->height);
    s->in_use = 0;
    s->visible = 0;
    layer_order_remove(src);

    active_layer = dst;
    force_composite();
    return dst;
}

// Backward-compatible Texture Aliases
W_EXPORT int32_t w_texture_create(int32_t width, int32_t height) {
    init_surface_if_needed();
    return layer_alloc_slot(width, height, 0);
}
W_EXPORT void w_texture_set_pixels(int32_t tex_id, uint32_t *pixels, int32_t width, int32_t height) {
    w_layer_set_pixels(tex_id, pixels, width, height);
}
W_EXPORT uint32_t *w_texture_get_pixels(int32_t tex_id) {
    return w_layer_get_pixels(tex_id);
}
W_EXPORT int32_t w_texture_get_width(int32_t tex_id) {
    return w_layer_get_width(tex_id);
}
W_EXPORT int32_t w_texture_get_height(int32_t tex_id) {
    return w_layer_get_height(tex_id);
}
W_EXPORT int32_t w_layer_add_texture(int32_t tex_id) {
    if (tex_id >= 0 && tex_id < layer_count && layers[tex_id].in_use) {
        layers[tex_id].visible = 1;
        active_layer = tex_id;
        force_composite();
        return tex_id;
    }
    return -1;
}
W_EXPORT int32_t w_layer_get_texture(int32_t layer_idx) {
    return (layer_idx >= 0) ? layer_idx : active_layer;
}

W_EXPORT void w_draw_line(int x0, int y0, int x1, int y1, uint32_t color) {
    init_surface_if_needed();
    draw_line(x0, y0, x1, y1, color);
    force_composite();
}

W_EXPORT void w_draw_rect(int x, int y, int w, int h, uint32_t color) {
    init_surface_if_needed();
    draw_rect(x, y, w, h, color);
    force_composite();
}

W_EXPORT void w_draw_circle(int cx, int cy, int r, uint32_t color) {
    init_surface_if_needed();
    draw_circle(cx, cy, r, color);
    force_composite();
}

W_EXPORT void w_draw_ellipse(int cx, int cy, int rx, int ry, uint32_t color) {
    init_surface_if_needed();
    draw_ellipse(cx, cy, rx, ry, color);
    force_composite();
}

W_EXPORT void w_layer_adjust_hsv(int32_t layer_idx, int32_t d_hue, int32_t d_sat, int32_t d_val) {
    init_surface_if_needed();
    int idx = (layer_idx >= 0) ? layer_idx : active_layer;
    if (idx < 0 || idx >= layer_count || !layers[idx].in_use) return;

    layer_t *l = &layers[idx];
    uint32_t count = (uint32_t)l->width * l->height;
    for (uint32_t i = 0; i < count; i++) {
        int x = i % l->width;
        int y = i / l->width;
        if (is_pixel_clipped(x, y)) continue;

        uint32_t p = l->pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        int h = 0, s = 0, v = 0;
        w_rgb_to_hsv(p, &h, &s, &v);

        h = (h + d_hue) % 360;
        if (h < 0) h += 360;

        if (d_sat != 0) {
            s = s + (s * d_sat) / 100;
            if (s < 0) s = 0;
            if (s > 255) s = 255;
        }

        if (d_val != 0) {
            v = v + (v * d_val) / 100;
            if (v < 0) v = 0;
            if (v > 255) v = 255;
        }

        l->pixels[i] = w_hsv_to_rgb(h, s, v, a);
    }
    force_composite();
}

W_EXPORT void w_draw_grid(int step, uint32_t color) {
    init_surface_if_needed();
    draw_grid(step, color);
    force_composite();
}

W_EXPORT void w_draw_layer(int32_t src_layer_id, int dst_x, int dst_y, int dst_w, int dst_h, uint32_t opacity) {
    init_surface_if_needed();
    if (src_layer_id >= 0 && src_layer_id < layer_count && layers[src_layer_id].in_use) {
        draw_image_scaled(layers[src_layer_id].pixels, layers[src_layer_id].width, layers[src_layer_id].height, dst_x, dst_y, dst_w, dst_h, opacity <= 0 ? 100 : opacity);
        force_composite();
    }
}

W_EXPORT void w_draw_texture(int dst_x, int dst_y, int dst_w, int dst_h, uint32_t opacity) {
    init_surface_if_needed();
    if (g_texture.pixels && g_texture.width > 0 && g_texture.height > 0) {
        draw_image_scaled(g_texture.pixels, g_texture.width, g_texture.height, dst_x, dst_y, dst_w, dst_h, opacity <= 0 ? 100 : opacity);
        force_composite();
    }
}

W_EXPORT void w_draw_texture_id(int32_t src_tex_id, int dst_x, int dst_y, int dst_w, int dst_h, uint32_t opacity) {
    w_draw_layer(src_tex_id, dst_x, dst_y, dst_w, dst_h, opacity);
}

W_EXPORT void w_draw_image(uint32_t *src_pixels, int src_w, int src_h, int dst_x, int dst_y, int dst_w, int dst_h, uint32_t opacity) {
    init_surface_if_needed();
    draw_image_scaled(src_pixels, src_w, src_h, dst_x, dst_y, dst_w, dst_h, opacity <= 0 ? 100 : opacity);
    force_composite();
}

/* =========================================================================
 * Universal Brush Engine Configuration Exports
 * ========================================================================= */

W_EXPORT void w_brush_set_type(int32_t type) {
    brush_config.type = type;
}

W_EXPORT void w_brush_set_shape(int32_t shape) {
    brush_config.shape = shape;
}

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_SIZE:      if (val > 0) brush_config.size = val; break;
        case W_PARAM_OPACITY:   if (val >= 0 && val <= 100) brush_config.opacity = val; break;
        case W_PARAM_HARDNESS:  if (val >= 0 && val <= 100) brush_config.hardness = val; break;
        case W_PARAM_FLOW:      if (val >= 0 && val <= 100) brush_config.flow = val; break;
        case W_PARAM_SPACING:   if (val > 0) brush_config.spacing = val; break;
        case W_PARAM_ANGLE:     brush_config.angle = val % 360; if (brush_config.angle < 0) brush_config.angle += 360; break;
        case W_PARAM_ROUNDNESS: if (val >= 1 && val <= 100) brush_config.roundness = val; break;
        case W_PARAM_SCATTER:   if (val >= 0) brush_config.scatter = val; break;
        case W_PARAM_TOLERANCE: if (val >= 0 && val <= 255) brush_config.tolerance = val; break;
        case W_PARAM_SMUDGE:    if (val >= 0 && val <= 100) brush_config.smudge_strength = val; break;
        case W_PARAM_WETNESS:   if (val >= 0 && val <= 100) brush_config.wetness = val; break;
        case W_PARAM_GRAIN:     if (val >= 0 && val <= 100) brush_config.grain = val; break;
        case W_PARAM_TEX_MODE:  brush_config.tex_mode = val; break;
        case W_PARAM_SHAPE:     brush_config.shape = val; break;
        case W_PARAM_MODE:      brush_config.type = val; break;
        case W_PARAM_TEX_ANGLE: brush_config.tex_angle = val % 360; if (brush_config.tex_angle < 0) brush_config.tex_angle += 360; break;
        case W_PARAM_TEX_SCALE: if (val > 0) brush_config.tex_scale = val; break;
        case W_PARAM_TEX_LAYER:
            /* Point g_texture at layers[val].pixels so w_sample_texture picks it up */
            if (val < 0 || val >= layer_count || !layers[val].in_use) {
                g_texture.pixels = 0;
                g_texture.width  = 0;
                g_texture.height = 0;
                brush_config.tex_mode = 0;
            } else {
                g_texture.pixels = layers[val].pixels;
                g_texture.width  = layers[val].width;
                g_texture.height = layers[val].height;
                brush_config.tex_mode = 1; /* enable custom-texture path */
            }
            break;
        case W_PARAM_SMOOTH:       if (val >= 0 && val <= 100) brush_config.smooth = val; break;
        case W_PARAM_MIDPOINT:     if (val >= 0 && val <= 100) brush_config.midpoint = val; break;
        case W_PARAM_TEX_CONTRAST: if (val >= 0 && val <= 200) brush_config.tex_contrast = val; break;
        case W_PARAM_AUTO_ROTATE:  brush_config.auto_rotate = val ? 1 : 0; break;
        case W_PARAM_VELOCITY:     if (val >= 0 && val <= 100) brush_config.velocity = val; break;
        case W_PARAM_TAPER_IN:       if (val >= 0) brush_config.taper_in = val; break;
        case W_PARAM_TAPER_OUT:      if (val >= 0) brush_config.taper_out = val; break;
        case W_PARAM_FADE:           if (val >= 0) brush_config.fade = val; break;
        case W_PARAM_SIZE_JITTER:    if (val >= 0 && val <= 100) brush_config.size_jitter = val; break;
        case W_PARAM_ANGLE_JITTER:   if (val >= 0 && val <= 360) brush_config.angle_jitter = val; break;
        case W_PARAM_OPACITY_JITTER: if (val >= 0 && val <= 100) brush_config.opacity_jitter = val; break;
        case W_PARAM_COLOR_JITTER:   if (val >= 0 && val <= 100) brush_config.color_jitter = val; break;
        case W_PARAM_DAB_BLEND:      if (val >= 0 && val <= 5) brush_config.dab_blend = val; break;
        case W_PARAM_SUBPIXEL:       brush_config.subpixel = val ? 1 : 0; break;
        case W_PARAM_DEPLETION:      if (val >= 0 && val <= 100) brush_config.depletion = val; break;
        case W_PARAM_COLOR_PICKUP:   if (val >= 0 && val <= 100) brush_config.color_pickup = val; break;
        case W_PARAM_DUAL_SHAPE:     brush_config.dual_shape = val; break;
        case W_PARAM_DUAL_SIZE:      if (val > 0) brush_config.dual_size = val; break;
        case W_PARAM_DUAL_SPACING:   if (val > 0) brush_config.dual_spacing = val; break;
        case W_PARAM_SYMMETRY:       if (val >= 0 && val <= 3) brush_config.symmetry = val; break;
        case W_PARAM_PRESSURE_SIZE:  brush_config.pressure_size = val ? 1 : 0; break;
        case W_PARAM_PRESSURE_FLOW:  brush_config.pressure_flow = val ? 1 : 0; break;
        case W_PARAM_TILT_ANGLE:     brush_config.tilt_angle = val ? 1 : 0; break;
        case W_PARAM_BUILDUP:        brush_config.buildup = val ? 1 : 0; break;
    }
}

W_EXPORT void w_brush_reset(void) {
    brush_config.type = W_MODE_DRAW;
    brush_config.shape = 0;
    brush_config.size = 16;
    brush_config.opacity = 100;
    brush_config.hardness = 100;
    brush_config.flow = 100;
    brush_config.spacing = 5;
    brush_config.angle = 0;
    brush_config.roundness = 100;
    brush_config.scatter = 0;
    brush_config.smudge_strength = 0;
    brush_config.wetness = 0;
    brush_config.grain = 0;
    brush_config.tolerance = 32;
    brush_config.tex_mode = 0;
    brush_config.tex_angle = 0;
    brush_config.tex_scale = 100;
    brush_config.smooth = 0;
    brush_config.midpoint = 50;
    brush_config.tex_contrast = 100;
    brush_config.auto_rotate = 0;
    brush_config.velocity = 0;
    brush_config.taper_in = 0;
    brush_config.taper_out = 0;
    brush_config.fade = 0;
    brush_config.size_jitter = 0;
    brush_config.angle_jitter = 0;
    brush_config.opacity_jitter = 0;
    brush_config.color_jitter = 0;
    brush_config.dab_blend = 0;
    brush_config.subpixel = 0;
    brush_config.depletion = 0;
    brush_config.color_pickup = 0;
    brush_config.dual_shape = -1;
    brush_config.dual_size = 100;
    brush_config.dual_spacing = 10;
    brush_config.symmetry = 0;
    brush_config.buildup = 0;
    g_texture.pixels = 0;
    g_texture.width = 0;
    g_texture.height = 0;
}

static int32_t stroke_cum_dist = 0;
static uint32_t stroke_pickup_color = 0;

/**
 * Universal Brush Stroke Executor (interpolates dabs, handles smudge, fill, lasso, pressure, tilt).
 */
W_EXPORT void w_brush_stroke_ext(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y) {
    init_surface_if_needed();
    int w = 0, h = 0;
    uint32_t *pix = get_current_draw_target(&w, &h);
    if (!pix || w <= 0 || h <= 0) return;

    if (state == 0) {
        stroke_generation++;
        if (stroke_generation == 0) {
            if (stroke_tag && stroke_buf_cap > 0) {
                for (uint32_t i = 0; i < stroke_buf_cap; i++) stroke_tag[i] = 0;
            }
            stroke_generation = 1;
        }
        stroke_cum_dist = 0;
        stroke_pickup_color = color;
    }

    // 1. FLOOD FILL MODE
    if (brush_config.type == W_MODE_FILL) {
        if (state == 0 && x1 >= 0 && x1 < w && y1 >= 0 && y1 < h && !is_pixel_clipped(x1, y1)) {
            uint32_t target_color = pix[y1 * w + x1];
            uint32_t fill_color = eraser ? 0x00000000 : color;
            if (target_color != fill_color) {
                int head = 0, tail = 0;
                qx[tail] = x1; qy[tail] = y1; tail++;
                pix[y1 * w + x1] = fill_color;
                while (head < tail && tail < MAX_QUEUE - 4) {
                    int cx = qx[head], cy = qy[head]; head++;
                    const int ddx[4] = { 0, 0, -1, 1 }, ddy[4] = { -1, 1, 0, 0 };
                    for (int i = 0; i < 4; i++) {
                        int nx = cx + ddx[i], ny = cy + ddy[i];
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            int nidx = ny * w + nx;
                            if (color_match(pix[nidx], target_color, brush_config.tolerance) && !is_pixel_clipped(nx, ny)) {
                                pix[nidx] = fill_color;
                                qx[tail] = nx; qy[tail] = ny; tail++;
                            }
                        }
                    }
                }
                force_composite();
            }
        }
        return;
    }

    // 2. LASSO FILL MODE
    if (brush_config.type == W_MODE_LASSO_FILL) {
        if (state == 0) {
            poly_count = 0;
            if (poly_count < MAX_POLY) {
                poly_x[poly_count] = x1; poly_y[poly_count] = y1; poly_count++;
            }
        } else if (state == 1) {
            if (poly_count < MAX_POLY) {
                poly_x[poly_count] = x1; poly_y[poly_count] = y1; poly_count++;
            }
        } else if (state == 2) {
            if (poly_count < MAX_POLY - 1 && (poly_count == 0 || poly_x[poly_count - 1] != x1 || poly_y[poly_count - 1] != y1)) {
                poly_x[poly_count] = x1; poly_y[poly_count] = y1; poly_count++;
            }
            fill_polygon(pix, w, h, color, eraser);
            force_composite();
            poly_count = 0;
        }
        return;
    }

    // 3. CONTINUOUS DAB INTERPOLATION (Draw, Smudge, Blend)
    int dx = x0 - x1;
    int dy = y0 - y1;
    int dist = w_isqrt(dx * dx + dy * dy);

    if (dist > 1) {
        last_trajectory_angle = w_atan2_deg(dy, dx);
    }

    // Spacing calculation based on brush size
    int step_size = (brush_config.size * brush_config.spacing) / 100;
    if (step_size < 1) step_size = 1;

    int steps = (dist + step_size - 1) / step_size;
    if (steps < 1) steps = 1;

    int move_dx = 0, move_dy = 0;
    if (dist > 0) {
        int sm_step = (brush_config.size > 8) ? (brush_config.size / 4) : 2;
        if (sm_step < 1) sm_step = 1;
        if (sm_step > 8) sm_step = 8;
        move_dx = (dx * sm_step) / dist;
        move_dy = (dy * sm_step) / dist;
        if (move_dx == 0 && dx != 0) move_dx = (dx > 0 ? 1 : -1);
        if (move_dy == 0 && dy != 0) move_dy = (dy > 0 ? 1 : -1);
    }

    int d_bound = (brush_config.size * 142) / 100 + 4;
    int d_x0 = (x0 < x1 ? x0 : x1) - d_bound;
    int d_y0 = (y0 < y1 ? y0 : y1) - d_bound;
    int d_x1 = (x0 > x1 ? x0 : x1) + d_bound;
    int d_y1 = (y0 > y1 ? y0 : y1) + d_bound;

    for (int i = 0; i < steps; i++) {
        int cur_d = stroke_cum_dist + (steps > 0 ? (dist * i) / steps : 0);

        // Velocity Dynamics
        int scale_factor = 100;
        if (brush_config.velocity > 0 && dist > 0) {
            int speed = dist;
            if (speed > 100) speed = 100;
            int v_mod = (speed * brush_config.velocity) / 100;
            scale_factor = 100 - v_mod / 2;
            if (scale_factor < 20) scale_factor = 20;
        }

        // Taper In
        int taper_pct = 100;
        if (brush_config.taper_in > 0 && cur_d < brush_config.taper_in) {
            taper_pct = (cur_d * 100) / brush_config.taper_in;
            if (taper_pct < 10) taper_pct = 10;
        }

        // Fade
        int fade_pct = 100;
        if (brush_config.fade > 0) {
            if (cur_d >= brush_config.fade) {
                fade_pct = 0;
            } else {
                fade_pct = ((brush_config.fade - cur_d) * 100) / brush_config.fade;
            }
        }
        if (fade_pct == 0) continue;

        scale_factor = (scale_factor * taper_pct * fade_pct) / 10000;
        if (scale_factor <= 0) continue;

        // Size with size_jitter and pressure sensitivity
        int dab_r = (brush_config.size * scale_factor) / 100;
        if (brush_config.pressure_size && pressure >= 0) {
            int p = pressure > 1000 ? 1000 : pressure;
            dab_r = (dab_r * p) / 1000;
        }
        if (brush_config.size_jitter > 0) {
            int sj = (int)(next_random() % (brush_config.size_jitter + 1));
            dab_r = (dab_r * (100 - sj)) / 100;
        }
        if (dab_r < 1) dab_r = 1;

        // Angle with angle_jitter and stylus tilt dynamics
        int dab_angle = brush_config.angle;
        if (brush_config.tilt_angle && (tilt_x != 0 || tilt_y != 0)) {
            int tilt_deg = w_atan2_deg(tilt_y, tilt_x);
            dab_angle = (dab_angle + tilt_deg + 360) % 360;
        }
        if (brush_config.angle_jitter > 0) {
            int aj = (int)(next_random() % (brush_config.angle_jitter + 1));
            dab_angle = (dab_angle + aj) % 360;
        }

        // Flow with opacity_jitter, depletion and pressure sensitivity
        int dab_flow_pct = scale_factor;
        if (brush_config.pressure_flow && pressure >= 0) {
            int p = pressure > 1000 ? 1000 : pressure;
            dab_flow_pct = (dab_flow_pct * p) / 1000;
        }
        if (brush_config.opacity_jitter > 0) {
            int oj = (int)(next_random() % (brush_config.opacity_jitter + 1));
            dab_flow_pct = (dab_flow_pct * (100 - oj)) / 100;
        }
        if (brush_config.depletion > 0 && brush_config.type != W_MODE_BLEND) {
            int dep_pct = (cur_d * brush_config.depletion) / 500;
            if (dep_pct > 100) dep_pct = 100;
            dab_flow_pct = (dab_flow_pct * (100 - dep_pct)) / 100;
        }
        if (dab_flow_pct <= 0) continue;

        int cx = (steps <= 1) ? x0 : (x1 + (dx * (i + 1)) / steps);
        int cy = (steps <= 1) ? y0 : (y1 + (dy * (i + 1)) / steps);

        // Color with color_jitter and continuous color_pickup
        uint32_t dab_color = color;
        if (brush_config.color_pickup > 0) {
            if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
                uint32_t under_p = pix[cy * w + cx];
                if (((under_p >> 24) & 0xFF) > 10) {
                    stroke_pickup_color = mix_color(under_p, stroke_pickup_color, brush_config.color_pickup);
                }
            }
            dab_color = stroke_pickup_color;
        }

        if (brush_config.color_jitter > 0) {
            int h = 0, s = 0, v = 0;
            w_rgb_to_hsv(dab_color, &h, &s, &v);
            int cj = brush_config.color_jitter;
            int h_j = ((int)(next_random() % (cj * 2 + 1))) - cj;
            int s_j = ((int)(next_random() % (cj + 1))) - (cj / 2);
            int v_j = ((int)(next_random() % (cj + 1))) - (cj / 2);
            h = (h + h_j) % 360; if (h < 0) h += 360;
            s = s + (s_j * 255) / 100; if (s < 0) s = 0; if (s > 255) s = 255;
            v = v + (v_j * 255) / 100; if (v < 0) v = 0; if (v > 255) v = 255;
            dab_color = w_hsv_to_rgb(h, s, v, (color >> 24) & 0xFF);
        }

        // Perpendicular Scatter
        if (brush_config.scatter > 0) {
            int max_j = (brush_config.size * brush_config.scatter) / 100;
            if (max_j > 0) {
                int offset = ((int)(next_random() % (2 * max_j + 1))) - max_j;
                if (dist > 0) {
                    int nx = (-dy * 1024) / dist;
                    int ny = (dx * 1024) / dist;
                    cx += (nx * offset) / 1024;
                    cy += (ny * offset) / 1024;
                } else {
                    cx += offset;
                    cy += ((int)(next_random() % (2 * max_j + 1))) - max_j;
                }
            }
        }

        render_parametric_dab(pix, w, h, cx, cy, dab_color, eraser, move_dx, move_dy, dab_r, dab_angle, dab_flow_pct, cur_d);

        if (brush_config.symmetry == 1 || brush_config.symmetry == 3) {
            int sym_x = w - 1 - cx;
            render_parametric_dab(pix, w, h, sym_x, cy, dab_color, eraser, -move_dx, move_dy, dab_r, 180 - dab_angle, dab_flow_pct, cur_d);
        }
        if (brush_config.symmetry == 2 || brush_config.symmetry == 3) {
            int sym_y = h - 1 - cy;
            render_parametric_dab(pix, w, h, cx, sym_y, dab_color, eraser, move_dx, -move_dy, dab_r, -dab_angle, dab_flow_pct, cur_d);
        }
        if (brush_config.symmetry == 3) {
            int sym_x = w - 1 - cx;
            int sym_y = h - 1 - cy;
            render_parametric_dab(pix, w, h, sym_x, sym_y, dab_color, eraser, -move_dx, -move_dy, dab_r, 180 + dab_angle, dab_flow_pct, cur_d);
        }
    }

    stroke_cum_dist += dist;
    if (brush_config.symmetry == 1 || brush_config.symmetry == 3) {
        d_x0 = 0; d_x1 = w - 1;
    }
    if (brush_config.symmetry == 2 || brush_config.symmetry == 3) {
        d_y0 = 0; d_y1 = h - 1;
    }
    composite_region(d_x0, d_y0, d_x1, d_y1);
}

W_EXPORT void w_brush_stroke(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser) {
    w_brush_stroke_ext(state, x0, y0, x1, y1, color, eraser, 1000, 0, 0);
}

W_EXPORT uint32_t w_pick_color(int32_t x, int32_t y, int32_t sample_composite) {
    init_surface_if_needed();
    if (x < 0 || y < 0 || (uint32_t)x >= doc_width || (uint32_t)y >= doc_height) return 0;
    if (sample_composite) {
        if (!out_pixels || surface_dirty) force_composite();
        if (!out_pixels) return 0;
        return out_pixels[y * doc_width + x];
    }
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].in_use || !layers[active_layer].pixels) return 0;
    layer_t *l = &layers[active_layer];
    int lx = x - l->x;
    int ly = y - l->y;
    if (lx < 0 || ly < 0 || lx >= l->width || ly >= l->height) return 0;
    return l->pixels[ly * l->width + lx];
}

W_EXPORT void w_force_composite(void) {
    init_surface_if_needed();
    force_composite();
}

W_EXPORT uint32_t* w_render(void) {
    init_surface_if_needed();
    if (surface_dirty) force_composite();
    return out_pixels;
}

/* =========================================================================
 * Surface Queries
 * ========================================================================= */

uint32_t *get_active_layer_pixels(void) {
    int w = 0, h = 0;
    return get_current_draw_target(&w, &h);
}

uint32_t *get_layer_pixels(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers[idx].in_use) {
        return layers[idx].pixels;
    }
    return 0;
}

uint32_t *get_composite_pixels(void) { return out_pixels; }
int32_t get_active_layer(void) { return active_layer; }
int32_t get_layer_count(void) { return layer_count; }
int32_t get_width(void) {
    if (active_layer >= 0 && active_layer < layer_count && layers[active_layer].in_use) {
        return layers[active_layer].width;
    }
    return doc_width;
}

int32_t get_height(void) {
    if (active_layer >= 0 && active_layer < layer_count && layers[active_layer].in_use) {
        return layers[active_layer].height;
    }
    return doc_height;
}

int32_t get_canvas_width(void) { return get_width(); }
int32_t get_canvas_height(void) { return get_height(); }
int32_t get_canvas_count(void) { return 1; }
int32_t get_active_canvas(void) { return 0; }
const char *get_canvas_name(int32_t idx) { return "main"; }

uint8_t get_layer_visible(int32_t idx) {
    if (idx >= 0 && idx < layer_count) return layers[idx].visible;
    return 0;
}

uint8_t get_layer_opacity(int32_t idx) {
    if (idx >= 0 && idx < layer_count) return layers[idx].opacity;
    return 0;
}

W_EXPORT void w_layer_set_alpha_lock(int32_t idx, int32_t locked) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        layers[target].alpha_lock = locked ? 1 : 0;
    }
}

W_EXPORT int32_t w_layer_get_alpha_lock(int32_t idx) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        return layers[target].alpha_lock;
    }
    return 0;
}

W_EXPORT void w_layer_set_clipping(int32_t idx, int32_t clipping) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        layers[target].clipping = clipping ? 1 : 0;
        force_composite();
    }
}

W_EXPORT int32_t w_layer_get_clipping(int32_t idx) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        return layers[target].clipping;
    }
    return 0;
}

W_EXPORT void w_layer_set_blend_mode(int32_t idx, int32_t mode) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        if (mode < 0) mode = 0;
        if (mode > 5) mode = 5;
        layers[target].blend_mode = (uint8_t)mode;
        force_composite();
    }
}

W_EXPORT int32_t w_layer_get_blend_mode(int32_t idx) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count && layers[target].in_use) {
        return layers[target].blend_mode;
    }
    return 0;
}
