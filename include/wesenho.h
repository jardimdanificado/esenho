#ifndef WESENHO_H
#define WESENHO_H

/**
 * =========================================================================
 * Wesenho WebAssembly Header (include/wesenho.h)
 * Universal Brush Engine & Filter ABI definitions.
 * =========================================================================
 */

#include <stdint.h>
#include <stddef.h>

#define W_EXPORT __attribute__((visibility("default")))

/* =========================================================================
 * Tool & Brush Enums
 * ========================================================================= */

enum {
    W_MODE_DRAW       = 0,
    W_MODE_SMUDGE     = 1,
    W_MODE_BLEND      = 2,
    W_MODE_FILL       = 3,
    W_MODE_LASSO_FILL = 4
};

enum {
    W_SHAPE_CIRCLE    = 0,
    W_SHAPE_SQUARE    = 1,
    W_SHAPE_CHISEL    = 2
};

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
    W_PARAM_SMUDGE         = 10,
    W_PARAM_WETNESS        = 11,
    W_PARAM_GRAIN          = 12,
    W_PARAM_TEX_MODE       = 13,
    W_PARAM_SHAPE          = 14,
    W_PARAM_MODE           = 15
};

/* =========================================================================
 * Layer & Framebuffer ABI
 * ========================================================================= */

typedef struct {
    uint32_t *pixels;
    int32_t width;
    int32_t height;
} wframebuffer_t;

static wframebuffer_t g_layer = {0};
static wframebuffer_t g_texture = {0};

static inline wframebuffer_t *w_get_layer(void) {
    return &g_layer;
}

static inline wframebuffer_t *w_get_texture(void) {
    return &g_texture;
}

W_EXPORT void w_set_layer(uint32_t *pixels, int32_t width, int32_t height) {
    g_layer.pixels = pixels;
    g_layer.width = width;
    g_layer.height = height;
}

W_EXPORT void w_set_texture(uint32_t *pixels, int32_t width, int32_t height) {
    g_texture.pixels = pixels;
    g_texture.width = width;
    g_texture.height = height;
}

/* =========================================================================
 * Fast Math Helpers
 * ========================================================================= */

/** Fast integer square root */
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
 * Fixed-point sine/cosine approximation (scaled by 1024)
 * Angle is in degrees (0..359)
 */
static inline void w_sincos_deg(int deg, int *out_sin, int *out_cos) {
    deg = deg % 360;
    if (deg < 0) deg += 360;

    // Simple lookup table for quadrant 0..90 degrees in steps of 15 deg
    // [0, 15, 30, 45, 60, 75, 90] -> sin * 1024
    static const int sin_table[7] = { 0, 265, 512, 724, 887, 989, 1024 };

    int quad = deg / 90;
    int rem = deg % 90;

    int idx = rem / 15;
    if (idx > 5) idx = 5;
    int frac = rem % 15;
    int s0 = sin_table[idx];
    int s1 = sin_table[idx + 1];
    int s = s0 + ((s1 - s0) * frac) / 15;

    int c_idx = (90 - rem) / 15;
    if (c_idx > 5) c_idx = 5;
    int c_frac = (90 - rem) % 15;
    int c0 = sin_table[c_idx];
    int c1 = sin_table[c_idx + 1];
    int c = c0 + ((c1 - c0) * c_frac) / 15;

    switch (quad) {
        case 0: *out_sin = s;  *out_cos = c;  break;
        case 1: *out_sin = c;  *out_cos = -s; break;
        case 2: *out_sin = -s; *out_cos = -c; break;
        case 3: *out_sin = -c; *out_cos = s;  break;
    }
}

/** Standard Porter-Duff Source-Over alpha blending */
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

/** Texture masking: samples uploaded texture buffer or procedural grain/patterns */
static inline uint32_t w_sample_texture(int mode, int x, int y, uint32_t base_a) {
    if (base_a == 0) return 0;
    if (g_texture.pixels && g_texture.width > 0 && g_texture.height > 0) {
        int tx = (x % g_texture.width + g_texture.width) % g_texture.width;
        int ty = (y % g_texture.height + g_texture.height) % g_texture.height;
        uint32_t p = g_texture.pixels[ty * g_texture.width + tx];
        uint32_t lum = ((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000;
        uint32_t ta = (p >> 24) & 0xFF;
        uint32_t factor = (lum * ta) / 255;
        return (base_a * factor) / 255;
    }
    if (mode <= 0) return base_a;
    uint32_t mod_a = base_a;
    if (mode == 1) { /* Paper grain */
        uint32_t n = ((x * 1234567 + y * 7654321) ^ (x * y * 13)) & 0xFF;
        int fiber = ((x * 3 + y * 5) % 17 < 3) ? 50 : 255;
        mod_a = (base_a * n * fiber) / (255 * 255);
    } else if (mode == 2) { /* Canvas weave */
        int pat = ((x % 6 < 3) ^ (y % 6 < 3)) ? 255 : 40;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 3) { /* Noise */
        uint32_t n = ((x * 374761393 + y * 668265263) ^ 0x5bf03635) & 0xFF;
        mod_a = (base_a * n) / 255;
    } else if (mode == 4) { /* Halftone dots */
        int dx = (x % 8) - 4, dy = (y % 8) - 4;
        int d2 = dx * dx + dy * dy;
        int pat = (d2 <= 5) ? 255 : 20;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 5) { /* Grid */
        int pat = (x % 8 == 0 || y % 8 == 0) ? 255 : 30;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 6) { /* Grunge */
        uint32_t n = ((x / 4 * 101 + y / 4 * 203) ^ (x * 17 + y * 31)) & 0xFF;
        int pat = n > 120 ? 255 : (n * 255 / 120);
        mod_a = (base_a * pat) / 255;
    } else if (mode == 7) { /* Hatch */
        int pat = ((x + y) % 6 == 0 || (x + y) % 6 == 1) ? 255 : 0;
        mod_a = (base_a * pat) / 255;
    }
    return mod_a;
}

#endif /* WESENHO_H */
