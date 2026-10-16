#ifndef QUADRO_BRUSH_PLUGIN_H
#define QUADRO_BRUSH_PLUGIN_H

/**
 * =========================================================================
 * Quadro WASM Brush Plugin SDK Header (src/include/quadro_brush_plugin.h)
 *
 * Defines the Zero-Copy WebAssembly Brush Protocol ABI.
 * WASM Brush plugins share linear memory directly with plugins/canvas.wasm,
 * giving the brush kernel direct pointer read/write access to every pixel of
 * the active layer with zero serialization or buffer copying overhead.
 * =========================================================================
 */

#include "quadro.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ── WASM Brush Protocol Input Capabilities Bitmask & Constants ── */
#define W_BRUSH_INPUT_SIZE         (1 << 0)  /* Radius / brush size range */
#define W_BRUSH_INPUT_PRESSURE     (1 << 1)  /* Stylus pressure dynamics */
#define W_BRUSH_INPUT_TILT         (1 << 2)  /* Stylus tilt */
#define W_BRUSH_INPUT_ANGLE        (1 << 3)  /* Stroke direction / angle / autorotate */
#define W_BRUSH_INPUT_SPEED        (1 << 4)  /* Stroke velocity / speed */
#define W_BRUSH_INPUT_COLOR        (1 << 5)  /* Stroke color / palette */
#define W_BRUSH_INPUT_OPACITY      (1 << 6)  /* Flow / Opacity */
#define W_BRUSH_INPUT_SPACING      (1 << 7)  /* Dab spacing */
#define W_BRUSH_INPUT_HARDNESS     (1 << 8)  /* Tip hardness */
#define W_BRUSH_INPUT_ROUNDNESS    (1 << 9)  /* Tip roundness / aspect */
#define W_BRUSH_INPUT_STABILIZER   (1 << 10) /* Streamline / smoothing / leash */
#define W_BRUSH_INPUT_JITTER       (1 << 11) /* Jitter / scatter */
#define W_BRUSH_INPUT_WET          (1 << 12) /* Wet / mix / paint physics / smudge */
#define W_BRUSH_INPUT_TEXTURE      (1 << 13) /* Texture / grain */
#define W_BRUSH_INPUT_DUAL         (1 << 14) /* Dual brush */
#define W_BRUSH_INPUT_TIP          (1 << 15) /* Tip shape / custom layer tip */
#define W_BRUSH_INPUT_PARAMS       (1 << 16) /* Plugin custom tunable parameters */

/* Default inputs accepted by standard zero-copy kernels if not explicitly defined */
#define W_BRUSH_INPUTS_DEFAULT     (W_BRUSH_INPUT_SIZE | W_BRUSH_INPUT_PRESSURE | W_BRUSH_INPUT_ANGLE | W_BRUSH_INPUT_SPEED | W_BRUSH_INPUT_COLOR | W_BRUSH_INPUT_SPACING | W_BRUSH_INPUT_PARAMS)

/* ── Fast Xorshift32 Pseudo-Random Number Generator ── */
static uint32_t _w_brush_rng_state = 0x8a5b3c1d;

static inline void w_brush_srand(uint32_t seed) {
    _w_brush_rng_state = (seed != 0) ? seed : 0x8a5b3c1d;
}

static inline uint32_t w_brush_rand(void) {
    uint32_t x = _w_brush_rng_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    _w_brush_rng_state = x;
    return x;
}

/** Uniform float in [0.0, 1.0) */
static inline float w_brush_randf(void) {
    return (float)(w_brush_rand() & 0x7FFFFFFF) / 2147483648.0f;
}

/** Uniform float in [-1.0, 1.0) */
static inline float w_brush_rand_symf(void) {
    return w_brush_randf() * 2.0f - 1.0f;
}

/** Fast freestanding power function for smooth curve shaping */
static inline float w_fast_powf(float base, float exp) {
    if (base <= 0.0f) return 0.0f;
    if (base >= 1.0f) return 1.0f;
    int iexp = (int)exp;
    if (iexp < 0) return 0.0f;
    float res = 1.0f;
    float cur = base;
    while (iexp > 0) {
        if (iexp & 1) res *= cur;
        cur *= cur;
        iexp >>= 1;
    }
    float frac = exp - (float)((int)exp);
    if (frac > 0.01f) {
        res *= (1.0f - frac + frac * base);
    }
    return res;
}

static inline float w_floorf(float x) {
    int i = (int)x;
    return (x < 0.0f && x != (float)i) ? (float)(i - 1) : (float)i;
}

/* ── Color Component Extraction & Packing (32-bit ARGB/ABGR) ── */
static inline uint32_t w_color_get_a(uint32_t c) { return (c >> 24) & 0xFF; }
static inline uint32_t w_color_get_b(uint32_t c) { return (c >> 16) & 0xFF; }
static inline uint32_t w_color_get_g(uint32_t c) { return (c >> 8) & 0xFF; }
static inline uint32_t w_color_get_r(uint32_t c) { return c & 0xFF; }

static inline uint32_t w_color_pack(uint32_t r, uint32_t g, uint32_t b, uint32_t a) {
    return ((a & 0xFF) << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
}

/* ── High-Performance Pixel Blending Primitives ── */

/**
 * Standard Source-Over Alpha Blend (Porter-Duff) with exact DIV255.
 */
static inline uint32_t w_brush_blend_over(uint32_t src, uint32_t dst, uint32_t alpha) {
    if (alpha <= 0) return dst;
    if (alpha >= 255 && ((src >> 24) & 0xFF) == 255) return src;

    uint32_t sa = (src >> 24) & 0xFF;
    uint32_t eff_a = DIV255(sa * alpha);
    if (eff_a == 0) return dst;

    uint32_t da = (dst >> 24) & 0xFF;
    if (da == 0) {
        return (eff_a << 24) | (src & 0x00FFFFFF);
    }

    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;

    uint32_t inv_a = 255 - eff_a;
    uint32_t out_a = eff_a + DIV255(da * inv_a);

    uint32_t r = DIV255(sr * eff_a + dr * inv_a);
    uint32_t g = DIV255(sg * eff_a + dg * inv_a);
    uint32_t b = DIV255(sb * eff_a + db * inv_a);

    return (out_a << 24) | (b << 16) | (g << 8) | r;
}

/**
 * Additive Color Blend (Linear Dodge) for neon, energy, and particle effects.
 */
static inline uint32_t w_brush_blend_add(uint32_t src, uint32_t dst, uint32_t alpha) {
    if (alpha <= 0) return dst;
    uint32_t eff_a = DIV255(((src >> 24) & 0xFF) * alpha);
    if (eff_a == 0) return dst;

    uint32_t sr = DIV255((src & 0xFF) * eff_a);
    uint32_t sg = DIV255(((src >> 8) & 0xFF) * eff_a);
    uint32_t sb = DIV255(((src >> 16) & 0xFF) * eff_a);

    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;
    uint32_t da = (dst >> 24) & 0xFF;

    uint32_t r = dr + sr; if (r > 255) r = 255;
    uint32_t g = dg + sg; if (g > 255) g = 255;
    uint32_t b = db + sb; if (b > 255) b = 255;
    uint32_t a = da + eff_a; if (a > 255) a = 255;

    return (a << 24) | (b << 16) | (g << 8) | r;
}

/**
 * Subtractive / Physical Pigment Mixture Approximation (CMYK-like response).
 */
static inline uint32_t w_brush_blend_pigment(uint32_t src, uint32_t dst, uint32_t mix_pct) {
    if (mix_pct <= 0) return dst;
    if (mix_pct >= 100) return src;

    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;

    /* Invert to subtractive absorption space */
    uint32_t c1 = 255 - sr, m1 = 255 - sg, y1 = 255 - sb;
    uint32_t c2 = 255 - dr, m2 = 255 - dg, y2 = 255 - db;

    uint32_t c = (c1 * mix_pct + c2 * (100 - mix_pct)) / 100;
    uint32_t m = (m1 * mix_pct + m2 * (100 - mix_pct)) / 100;
    uint32_t y = (y1 * mix_pct + y2 * (100 - mix_pct)) / 100;

    uint32_t out_r = (c > 255) ? 0 : (255 - c);
    uint32_t out_g = (m > 255) ? 0 : (255 - m);
    uint32_t out_b = (y > 255) ? 0 : (255 - y);
    uint32_t out_a = ((src >> 24) & 0xFF) > ((dst >> 24) & 0xFF) ? ((src >> 24) & 0xFF) : ((dst >> 24) & 0xFF);

    return (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
}

/**
 * Smooth Hermite Falloff (zero derivative at edge, eliminating visible circular contours).
 */
static inline float w_brush_falloff_smooth(float dist_sq, float inv_rad_sq) {
    float u = 1.0f - (dist_sq * inv_rad_sq);
    if (u <= 0.0f) return 0.0f;
    return u * u * (3.0f - 2.0f * u);
}

static inline float w_smoothstep(float edge0, float edge1, float x) {
    float t = (x - edge0) / (edge1 - edge0);
    if (t < 0.0f) return 0.0f;
    if (t > 1.0f) return 1.0f;
    return t * t * (3.0f - 2.0f * t);
}

/**
 * Bounds clamping for dab bounding-box calculations.
 */
static inline void w_brush_compute_bounds(int cx, int cy, int radius, int w, int h,
                                         int *out_x0, int *out_y0, int *out_x1, int *out_y1) {
    int x0 = cx - radius;
    int y0 = cy - radius;
    int x1 = cx + radius + 1;
    int y1 = cy + radius + 1;

    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > w) x1 = w;
    if (y1 > h) y1 = h;

    *out_x0 = x0;
    *out_y0 = y0;
    *out_x1 = x1;
    *out_y1 = y1;
}

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_BRUSH_PLUGIN_H */
