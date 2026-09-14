#include "wesenho.h"

/* =========================================================================
 * Surface Actor (Canvas / Drawing Engine)
 * Manages document surface dimensions, multi-layer stack, blending,
 * geometric drawing primitives, and universal parametric brush engine.
 * ========================================================================= */

#define DEFAULT_WIDTH  800
#define DEFAULT_HEIGHT 1000

/** Representation of an individual layer in the surface stack */
typedef struct {
    uint32_t *pixels;  /**< Pointer to RGBA32 raw pixel array */
    uint8_t  visible;  /**< 1 = visible, 0 = hidden */
    uint8_t  opacity;  /**< Layer opacity from 0 (transparent) to 255 (opaque) */
} layer_t;

static uint32_t       doc_width = DEFAULT_WIDTH;
static uint32_t       doc_height = DEFAULT_HEIGHT;
static layer_t        *layers = 0;
static int            layer_count = 0;
static int            layer_capacity = 0;
static int            active_layer = 0;
static uint32_t       *out_pixels = 0;         /**< Flattened/composited final pixel buffer */

void force_composite(void);

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
 * Pixel Blending & Layer Operations
 * ========================================================================= */

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    if (sa == 255 && ((dst >> 24) & 0xFF) == 0) return (src & 0x00FFFFFF) | 0xFF000000;

    uint32_t sr = src & 0xFF;
    uint32_t sg = (src >> 8) & 0xFF;
    uint32_t sb = (src >> 16) & 0xFF;

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

static void clear_layer(layer_t *lay, uint32_t num_pixels) {
    if (!lay || !lay->pixels) return;
    for (uint32_t i = 0; i < num_pixels; i++) {
        lay->pixels[i] = 0x00000000;
    }
}

static int add_new_layer_internal(void) {
    uint32_t num_pixels = doc_width * doc_height;

    if (layer_count >= layer_capacity) {
        int new_cap = layer_capacity == 0 ? 16 : (layer_capacity * 2);
        layer_t *new_layers = (layer_t*)canvas_alloc(new_cap * sizeof(layer_t));
        for (int i = 0; i < layer_count; i++) {
            new_layers[i] = layers[i];
        }
        layers = new_layers;
        layer_capacity = new_cap;
    }

    int idx = layer_count;
    layers[idx].pixels = (uint32_t*)canvas_alloc(num_pixels * sizeof(uint32_t));
    layers[idx].visible = 1;
    layers[idx].opacity = 255;
    clear_layer(&layers[idx], num_pixels);
    layer_count++;
    active_layer = idx;
    return idx;
}

static void composite_surface(void) {
    if (!out_pixels) return;
    uint32_t w = doc_width;
    uint32_t h = doc_height;
    uint32_t num_pixels = w * h;

    for (uint32_t y = 0; y < h; y++) {
        for (uint32_t x = 0; x < w; x++) {
            int check = ((x / 16) + (y / 16)) & 1;
            out_pixels[y * w + x] = check ? 0xFF2A2A2A : 0xFF222222;
        }
    }

    for (int l = 0; l < layer_count; l++) {
        if (!layers[l].visible || !layers[l].pixels) continue;
        uint8_t op = layers[l].opacity;
        if (op == 0) continue;

        for (uint32_t i = 0; i < num_pixels; i++) {
            uint32_t src = layers[l].pixels[i];
            if ((src & 0xFF000000) == 0) continue;
            out_pixels[i] = blend_pixel(out_pixels[i], src, op);
        }
    }
}

static int surface_dirty = 1;

void force_composite(void) {
    composite_surface();
    surface_dirty = 0;
}

static void resize_surface(uint32_t new_w, uint32_t new_h) {
    if (new_w < 16 || new_h < 16 || new_w > 4096 || new_h > 4096) return;
    if (new_w == doc_width && new_h == doc_height) return;

    uint32_t old_w = doc_width;
    uint32_t old_h = doc_height;
    uint32_t new_pixels = new_w * new_h;

    out_pixels = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

    uint32_t copy_w = old_w < new_w ? old_w : new_w;
    uint32_t copy_h = old_h < new_h ? old_h : new_h;

    for (int l = 0; l < layer_count; l++) {
        uint32_t *old_buf = layers[l].pixels;
        uint32_t *new_buf = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

        for (uint32_t i = 0; i < new_pixels; i++) new_buf[i] = 0x00000000;

        if (old_buf) {
            for (uint32_t y = 0; y < copy_h; y++) {
                for (uint32_t x = 0; x < copy_w; x++) {
                    new_buf[y * new_w + x] = old_buf[y * old_w + x];
                }
            }
        }

        layers[l].pixels = new_buf;
    }

    doc_width = new_w;
    doc_height = new_h;
    composite_surface();
}

/* =========================================================================
 * Drawing Primitives
 * ========================================================================= */

static void draw_line(int x0, int y0, int x1, int y1, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    int w = doc_width, h = doc_height;
    uint32_t *pix = layers[active_layer].pixels;

    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) pix[y0 * w + x0] = color;
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

static void draw_rect(int rx, int ry, int rw, int rh, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    uint32_t *pix = layers[active_layer].pixels;
    for (int dy = 0; dy < rh; dy++) {
        int py = ry + dy;
        if (py < 0 || py >= (int)doc_height) continue;
        for (int dx = 0; dx < rw; dx++) {
            int px = rx + dx;
            if (px < 0 || px >= (int)doc_width) continue;
            pix[py * doc_width + px] = color;
        }
    }
}

static void draw_circle(int cx, int cy, int cr, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    int r2 = cr * cr;
    uint32_t *pix = layers[active_layer].pixels;
    for (int dy = -cr; dy <= cr; dy++) {
        int py = cy + dy;
        if (py < 0 || py >= (int)doc_height) continue;
        for (int dx = -cr; dx <= cr; dx++) {
            int px = cx + dx;
            if (px < 0 || px >= (int)doc_width) continue;
            if (dx * dx + dy * dy <= r2) {
                pix[py * doc_width + px] = color;
            }
        }
    }
}

static void draw_grid(int step, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    if (step < 4) step = 4;
    uint32_t *pix = layers[active_layer].pixels;
    for (uint32_t y = 0; y < doc_height; y += step) {
        for (uint32_t x = 0; x < doc_width; x++) pix[y * doc_width + x] = color;
    }
    for (uint32_t x = 0; x < doc_width; x += step) {
        for (uint32_t y = 0; y < doc_height; y++) pix[y * doc_width + x] = color;
    }
}

/* =========================================================================
 * Universal Parametric Brush Engine
 * ========================================================================= */

typedef struct {
    int32_t type;            // W_MODE_DRAW, W_MODE_SMUDGE, W_MODE_BLEND, W_MODE_FILL, W_MODE_LASSO_FILL
    int32_t shape;           // W_SHAPE_CIRCLE, W_SHAPE_SQUARE, W_SHAPE_CHISEL
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
} w_brush_config_t;

static w_brush_config_t brush_config = {
    .type = W_MODE_DRAW,
    .shape = W_SHAPE_CIRCLE,
    .size = 8,
    .opacity = 100,
    .hardness = 80,
    .flow = 100,
    .spacing = 15,
    .angle = 0,
    .roundness = 100,
    .scatter = 0,
    .smudge_strength = 50,
    .wetness = 50,
    .grain = 0,
    .tolerance = 32,
    .tex_mode = 0
};

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
    int min_y = poly_y[0], max_y = poly_y[0];
    for (int i = 1; i < poly_count; i++) {
        if (poly_y[i] < min_y) min_y = poly_y[i];
        if (poly_y[i] > max_y) max_y = poly_y[i];
    }
    if (min_y < 0) min_y = 0;
    if (max_y >= height) max_y = height - 1;

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
                pixels[y * width + x] = is_eraser ? 0x00000000 : fill_color;
            }
        }
    }
}

/**
 * Renders a single parametric dab at (cx, cy) onto active layer pixels.
 */
static void render_parametric_dab(uint32_t *pix, int w, int h, int cx, int cy, uint32_t color, int eraser, uint32_t *src_patch) {
    int r = brush_config.size;
    if (r < 1) r = 1;
    int r_sq = r * r;
    int roundness = brush_config.roundness > 0 ? brush_config.roundness : 100;
    int inner_r = (r * brush_config.hardness) / 100;

    // Bounding radius accounts for diagonal corner extent when rotated
    int bound_r = (r * 142) / 100 + 1;

    int sin_val = 0, cos_val = 1024;
    if (brush_config.angle != 0) {
        w_sincos_deg(brush_config.angle, &sin_val, &cos_val);
    }

    int min_x = cx - bound_r < 0 ? 0 : cx - bound_r;
    int max_x = cx + bound_r >= w ? w - 1 : cx + bound_r;
    int min_y = cy - bound_r < 0 ? 0 : cy - bound_r;
    int max_y = cy + bound_r >= h ? h - 1 : cy + bound_r;

    uint32_t base_a = (((color >> 24) & 0xFF) * brush_config.opacity * brush_config.flow) / 10000;

    int patch_idx = 0;

    for (int y = min_y; y <= max_y; y++) {
        int dy = y - cy;
        for (int x = min_x; x <= max_x; x++) {
            int dx = x - cx;

            // Rotate coordinates by angle
            int u = (dx * cos_val + dy * sin_val) / 1024;
            int v = (-dx * sin_val + dy * cos_val) / 1024;
            int v_scaled = (v * 100) / roundness;

            int inside = 0;
            int dist = 0;

            if (brush_config.shape == W_SHAPE_CIRCLE) {
                int dist_sq = u * u + v_scaled * v_scaled;
                if (dist_sq <= r_sq) {
                    inside = 1;
                    dist = w_isqrt(dist_sq);
                }
            } else if (brush_config.shape == W_SHAPE_SQUARE) {
                int abs_u = u < 0 ? -u : u;
                int abs_v = v_scaled < 0 ? -v_scaled : v_scaled;
                if (abs_u <= r && abs_v <= r) {
                    inside = 1;
                    dist = abs_u > abs_v ? abs_u : abs_v;
                }
            } else if (brush_config.shape == W_SHAPE_CHISEL) {
                int abs_u = u < 0 ? -u : u;
                int abs_v = v_scaled < 0 ? -v_scaled : v_scaled;
                if (abs_u <= r && abs_v <= r) {
                    inside = 1;
                    dist = abs_u;
                }
            }

            if (!inside) continue;

            // Stochastic Grain
            if (brush_config.grain > 0) {
                if ((next_random() % 100) < (uint32_t)brush_config.grain) continue;
            }

            // Hardness falloff
            uint32_t a = base_a;
            if (brush_config.hardness < 100 && r > 0) {
                if (dist > inner_r && r > inner_r) {
                    a = a * (r - dist) / (r - inner_r);
                } else if (brush_config.hardness == 0) {
                    int num = (r - dist) * 255 / r;
                    a = (a * num * num) / (255 * 255);
                }
            }

            if (brush_config.tex_mode > 0 || (g_texture.pixels && g_texture.width > 0)) {
                a = w_sample_texture(brush_config.tex_mode, x, y, a);
            }
            if (a == 0) continue;

            int idx = y * w + x;
            uint32_t dst_p = pix[idx];

            if (eraser) {
                uint32_t da = (dst_p >> 24) & 0xFF;
                uint32_t na = (a >= da) ? 0 : (da - a);
                pix[idx] = (na == 0) ? 0 : ((na << 24) | (dst_p & 0x00FFFFFF));
            } else if (brush_config.type == W_MODE_SMUDGE && src_patch) {
                uint32_t src = src_patch[patch_idx++];
                if ((src >> 24) > 0) {
                    pix[idx] = mix_color(src, dst_p, brush_config.smudge_strength);
                }
            } else if (brush_config.type == W_MODE_BLEND) {
                if ((dst_p >> 24) == 0) pix[idx] = color;
                else pix[idx] = mix_color(color, dst_p, 100 - brush_config.wetness);
            } else {
                pix[idx] = w_blend_fast(color, dst_p, a);
            }
        }
    }
}

/* =========================================================================
 * Native Wesenho Canvas API Exports
 * ========================================================================= */

static int surface_initialized = 0;

static void init_surface_if_needed(void) {
    if (!surface_initialized) {
        surface_initialized = 1;
        out_pixels = (uint32_t*)canvas_alloc(doc_width * doc_height * sizeof(uint32_t));
        add_new_layer_internal();
        force_composite();
    }
}

W_EXPORT void w_init(uint32_t width, uint32_t height) {
    if (width < 16 || height < 16 || width > 4096 || height > 4096) return;
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

W_EXPORT int32_t w_layer_add(void) {
    init_surface_if_needed();
    int idx = add_new_layer_internal();
    force_composite();
    return idx;
}

W_EXPORT void w_layer_select(int32_t idx) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count) active_layer = idx;
}

W_EXPORT void w_layer_delete(int32_t idx) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count) {
        if (layer_count > 1) {
            uint32_t *recycled = layers[idx].pixels;
            for (int l = idx; l < layer_count - 1; l++) layers[l] = layers[l + 1];
            layers[layer_count - 1].pixels = recycled;
            clear_layer(&layers[layer_count - 1], doc_width * doc_height);
            layer_count--;
            if (active_layer >= layer_count) active_layer = layer_count - 1;
        } else {
            clear_layer(&layers[0], doc_width * doc_height);
        }
        force_composite();
    }
}

W_EXPORT void w_layer_toggle(int32_t idx) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count) {
        layers[idx].visible = !layers[idx].visible;
        force_composite();
    }
}

W_EXPORT void w_layer_opacity(int32_t idx, uint32_t opacity) {
    init_surface_if_needed();
    if (idx >= 0 && idx < layer_count) {
        if (opacity > 255) opacity = 255;
        layers[idx].opacity = (uint8_t)opacity;
        force_composite();
    }
}

W_EXPORT void w_layer_clear(int32_t idx) {
    init_surface_if_needed();
    int target = (idx >= 0) ? idx : active_layer;
    if (target >= 0 && target < layer_count) {
        clear_layer(&layers[target], doc_width * doc_height);
        force_composite();
    }
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

W_EXPORT void w_draw_grid(int step, uint32_t color) {
    init_surface_if_needed();
    draw_grid(step, color);
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
    }
}

/**
 * Universal Brush Stroke Executor (interpolates dabs, handles smudge, fill, lasso).
 */
W_EXPORT void w_brush_stroke(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser) {
    init_surface_if_needed();
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;

    uint32_t *pix = layers[active_layer].pixels;
    int w = doc_width, h = doc_height;

    // 1. FLOOD FILL MODE
    if (brush_config.type == W_MODE_FILL) {
        if (state == 0 && x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
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
                            int idx = ny * w + nx;
                            if (color_match(pix[idx], target_color, brush_config.tolerance)) {
                                pix[idx] = fill_color;
                                qx[tail] = nx; qy[tail] = ny; tail++;
                            }
                        }
                    }
                }
            }
        }
        force_composite();
        return;
    }

    // 2. LASSO FILL MODE
    if (brush_config.type == W_MODE_LASSO_FILL) {
        if (state == 0) {
            poly_count = 0;
            poly_x[poly_count] = x1; poly_y[poly_count] = y1; poly_count++;
        } else if (state == 1) {
            if (poly_count < MAX_POLY - 1) {
                poly_x[poly_count] = x1; poly_y[poly_count] = y1; poly_count++;
            }
        } else if (state == 2) {
            if (poly_count < MAX_POLY - 1 && (poly_count == 0 || poly_x[poly_count - 1] != x1 || poly_y[poly_count - 1] != y1)) {
                poly_x[poly_count] = x1; poly_y[poly_count] = y1; poly_count++;
            }
            fill_polygon(pix, w, h, color, eraser);
        }
        force_composite();
        return;
    }

    // 3. SMUDGE SAMPLING
    uint32_t *patch = 0;
    if (brush_config.type == W_MODE_SMUDGE) {
        int r = brush_config.size;
        int s_idx = 0;
        for (int dy = -r; dy <= r; dy++) {
            int py = y0 + dy;
            for (int dx = -r; dx <= r; dx++) {
                int px = x0 + dx;
                if (s_idx < MAX_SAMPLE) {
                    sample_buf[s_idx++] = (px >= 0 && px < w && py >= 0 && py < h) ? pix[py * w + px] : 0;
                }
            }
        }
        patch = sample_buf;
    }

    // 4. DAB INTERPOLATION ALONG VECTOR (x0, y0) -> (x1, y1)
    int dx = x1 - x0;
    int dy = y1 - y0;
    int dist = w_isqrt(dx * dx + dy * dy);

    int r = brush_config.size; if (r < 1) r = 1;
    int step_size = (r * brush_config.spacing) / 100;
    if (step_size < 1) step_size = 1;
    int steps = (dist / step_size) + 1;

    for (int i = 0; i <= steps; i++) {
        int cx = (steps == 0) ? x0 : (x0 + (dx * i) / steps);
        int cy = (steps == 0) ? y0 : (y0 + (dy * i) / steps);

        // Apply scatter jitter
        if (brush_config.scatter > 0) {
            int max_j = (r * brush_config.scatter) / 100;
            if (max_j > 0) {
                cx += ((int)(next_random() % (2 * max_j + 1))) - max_j;
                cy += ((int)(next_random() % (2 * max_j + 1))) - max_j;
            }
        }

        render_parametric_dab(pix, w, h, cx, cy, color, eraser, patch);
    }

    force_composite();
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
    if (active_layer >= 0 && active_layer < layer_count && layers) return layers[active_layer].pixels;
    return 0;
}

uint32_t *get_layer_pixels(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers) return layers[idx].pixels;
    return 0;
}

uint32_t *get_composite_pixels(void) { return out_pixels; }
int32_t get_active_layer(void) { return active_layer; }
int32_t get_layer_count(void) { return layer_count; }
int32_t get_width(void) { return doc_width; }
int32_t get_height(void) { return doc_height; }
int32_t get_canvas_width(void) { return doc_width; }
int32_t get_canvas_height(void) { return doc_height; }
int32_t get_canvas_count(void) { return 1; }
int32_t get_active_canvas(void) { return 0; }
const char *get_canvas_name(int32_t idx) { return "main"; }

uint8_t get_layer_visible(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers) return layers[idx].visible;
    return 0;
}

uint8_t get_layer_opacity(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers) return layers[idx].opacity;
    return 0;
}
