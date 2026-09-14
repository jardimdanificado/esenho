#ifndef WESENHO_H
#define WESENHO_H

/**
 * =========================================================================
 * Wesenho Native WebAssembly Core Header (include/wesenho.h)
 * =========================================================================
 * 
 * Native freestanding ABI and helper library for Wesenho Canvas and Plugins.
 * Eliminates external runtime dependencies, providing zero-overhead text
 * command execution, layer framebuffer binding, and high-level brush SDK.
 * =========================================================================
 */

#include <stdint.h>
#include <stddef.h>

#define W_EXPORT __attribute__((visibility("default")))

/* =========================================================================
 * Wesenho Standard Types & Structures
 * ========================================================================= */

/** Framebuffer descriptor containing dimensions and linear pixel buffer pointer */
typedef struct {
    uint32_t width;
    uint32_t height;
    uint32_t pixels; /**< Pointer to uint32_t RGBA32 pixel buffer in linear memory */
} wframebuffer_t;

/** Standard stroke parameters received by brush plugins */
typedef struct {
    int32_t  x0;
    int32_t  y0;
    int32_t  x1;
    int32_t  y1;
    int32_t  radius;
    uint32_t color;
    int32_t  texture_mode;
    int32_t  eraser;
} wstroke_t;

/* =========================================================================
 * Native Wesenho Target State & Framebuffers
 * ========================================================================= */

/** Active target layer framebuffer pointer set by host for brushes/filters */
static wframebuffer_t w_target_layer = {0, 0, 0};

/** Exported hook for host to set the target framebuffer directly */
W_EXPORT void w_set_layer(uint32_t pixels_ptr, uint32_t width, uint32_t height) {
    w_target_layer.pixels = pixels_ptr;
    w_target_layer.width = width;
    w_target_layer.height = height;
}

/** Internal accessor for current target layer */
static inline wframebuffer_t* w_get_layer(void) {
    if (!w_target_layer.pixels || w_target_layer.width == 0 || w_target_layer.height == 0) {
        return (wframebuffer_t*)0;
    }
    return &w_target_layer;
}

/** Active target texture framebuffer pointer set by host */
static wframebuffer_t w_target_texture = {0, 0, 0};

/** Exported hook for host to set the target texture framebuffer */
W_EXPORT void w_set_texture(uint32_t pixels_ptr, uint32_t width, uint32_t height) {
    w_target_texture.pixels = pixels_ptr;
    w_target_texture.width = width;
    w_target_texture.height = height;
}

/** Internal accessor for current target texture */
static inline wframebuffer_t* w_get_texture(void) {
    if (!w_target_texture.pixels || w_target_texture.width == 0 || w_target_texture.height == 0) {
        return (wframebuffer_t*)0;
    }
    return &w_target_texture;
}

/* =========================================================================
 * Standard Parameter IDs for Brush Configuration
 * ========================================================================= */

enum {
    W_PARAM_SIZE           = 1,
    W_PARAM_OPACITY        = 2,
    W_PARAM_HARDNESS       = 3,
    W_PARAM_FLOW           = 4,
    W_PARAM_SPACING        = 5,
    W_PARAM_ANGLE          = 6,
    W_PARAM_ROUNDNESS      = 7,
    W_PARAM_SCATTER        = 8,
    W_PARAM_TOLERANCE      = 9,
    W_PARAM_DENSITY        = 10,
    W_PARAM_WETNESS        = 11,
    W_PARAM_GRAIN          = 12,
    W_PARAM_TEX_MODE       = 13,
    W_PARAM_TEX_SCALE      = 14,
    W_PARAM_TEX_STRENGTH   = 15
};

/**
 * Fast integer square root.
 */
static inline int w_isqrt(int val) {
    if (val <= 0) return 0;
    int x = val, c = 0, d = 1 << 30;
    while (d > x) d >>= 2;
    while (d != 0) {
        if (x >= c + d) {
            x -= c + d;
            c = (c >> 1) + d;
        } else {
            c >>= 1;
        }
        d >>= 2;
    }
    return c;
}

/**
 * Standard Porter-Duff Source-Over alpha blending of two 32-bit RGBA colors.
 */
static inline uint32_t w_blend_fast(uint32_t src, uint32_t dst, uint32_t alpha) {
    if (alpha == 0) return dst;
    if (alpha >= 255) return src;
    uint32_t inv_a = 255 - alpha;
    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF, sa = (src >> 24) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF, da = (dst >> 24) & 0xFF;
    uint32_t r = (sr * alpha + dr * inv_a) / 255;
    uint32_t g = (sg * alpha + dg * inv_a) / 255;
    uint32_t b = (sb * alpha + db * inv_a) / 255;
    uint32_t a = sa + (da * inv_a) / 255;
    if (a > 255) a = 255;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

/**
 * Procedural texture masking for brush strokes (paper, canvas, noise, dots, grid, grunge).
 */
static inline uint32_t w_sample_texture(int mode, int x, int y, uint32_t base_a) {
    if (mode <= 0 || base_a == 0) return base_a;
    uint32_t mod_a = base_a;
    if (mode == 1) { /* Paper grain */
        uint32_t n = ((x * 1234567 + y * 7654321) ^ (x * y)) & 0xFF;
        mod_a = (base_a * (180 + (n * 75 / 255))) / 255;
    } else if (mode == 2) { /* Canvas weave */
        int pat = ((x % 4 < 2) ^ (y % 4 < 2)) ? 255 : 170;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 3) { /* Noise */
        uint32_t n = ((x * 374761393 + y * 668265263) ^ 0x5bf03635) & 0xFF;
        mod_a = (base_a * (150 + (n * 105 / 255))) / 255;
    } else if (mode == 4) { /* Halftone dots */
        int dx = (x % 6) - 3, dy = (y % 6) - 3;
        int d2 = dx * dx + dy * dy;
        int pat = (d2 <= 4) ? 255 : 120;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 5) { /* Grid */
        int pat = (x % 8 == 0 || y % 8 == 0) ? 255 : 160;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 6) { /* Grunge */
        uint32_t n = ((x / 3 * 101 + y / 3 * 203) ^ (x * 17 + y * 31)) & 0xFF;
        mod_a = (base_a * (140 + (n * 115 / 255))) / 255;
    }
    return mod_a;
}

/**
 * Pixel dab shader callback signature.
 * Returns the new packed 32-bit RGBA pixel value.
 */
typedef uint32_t (*w_dab_pixel_fn)(int px, int py, int dx, int dy, int dist_sq, int radius, uint32_t dst_p, const wstroke_t *stroke, void *ctx);

/**
 * Renders a circular dab at `(cx, cy)` clipped to framebuffer dimensions.
 */
static inline void w_draw_dab(wframebuffer_t *fb, int cx, int cy, const wstroke_t *stroke, w_dab_pixel_fn dab_fn, void *ctx) {
    if (!fb || !stroke || !dab_fn) return;
    int r = stroke->radius;
    int r_sq = r * r;
    int min_x = cx - r; if (min_x < 0) min_x = 0;
    int max_x = cx + r; if (max_x >= (int)fb->width) max_x = fb->width - 1;
    int min_y = cy - r; if (min_y < 0) min_y = 0;
    int max_y = cy + r; if (max_y >= (int)fb->height) max_y = fb->height - 1;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;

    for (int y = min_y; y <= max_y; y++) {
        int dy = y - cy;
        int dy_sq = dy * dy;
        for (int x = min_x; x <= max_x; x++) {
            int dx = x - cx;
            int dist_sq = dx * dx + dy_sq;
            if (dist_sq <= r_sq) {
                int idx = y * width + x;
                pixels[idx] = dab_fn(x, y, dx, dy, dist_sq, r, pixels[idx], stroke, ctx);
            }
        }
    }
}

/**
 * Interpolates dabs along the stroke vector `(x0, y0) -> (x1, y1)`.
 * `spacing_factor`: spacing as fraction of radius (e.g., 0.25f for smooth strokes).
 */
static inline void w_stroke_interpolate(wframebuffer_t *fb, const wstroke_t *stroke, float spacing_factor, w_dab_pixel_fn dab_fn, void *ctx) {
    if (!fb || !stroke || !dab_fn) return;
    int dx = stroke->x1 - stroke->x0;
    int dy = stroke->y1 - stroke->y0;
    int dist = w_isqrt(dx * dx + dy * dy);

    int step_size = (int)(stroke->radius * spacing_factor);
    if (step_size < 1) step_size = 1;
    int steps = (dist / step_size) + 1;

    for (int i = 0; i <= steps; i++) {
        int cx = (steps == 0) ? stroke->x0 : (stroke->x0 + (dx * i) / steps);
        int cy = (steps == 0) ? stroke->y0 : (stroke->y0 + (dy * i) / steps);
        w_draw_dab(fb, cx, cy, stroke, dab_fn, ctx);
    }
}

#endif /* WESENHO_H */

