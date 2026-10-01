#ifndef QUADRO_H
#define QUADRO_H

/**
 * =========================================================================
 * Quadro WebAssembly Header (include/quadro.h)
 * Universal Brush, Vector, Selection & Filter ABI definitions.
 * =========================================================================
 */

#include <stdint.h>
#include <stddef.h>

#define W_EXPORT __attribute__((visibility("default")))

/** Exact bitwise division by 255 for all v in [0, 65025] */
#define DIV255(v) (((uint32_t)(v) + 1 + (((uint32_t)(v) + 1) >> 8)) >> 8)

/* =========================================================================
 * Tool & Brush Enums
 * ========================================================================= */

enum {
    W_MODE_DRAW       = 0,
    W_MODE_SMUDGE     = 1,
    W_MODE_BLEND      = 2,
    W_MODE_FILL       = 3,
    W_MODE_LASSO_FILL = 4,
    W_MODE_PICKER     = 5,
    W_MODE_LINE       = 6,
    W_MODE_RECT       = 7,
    W_MODE_ELLIPSE    = 8,
    W_MODE_SELECT     = 9
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
    W_PARAM_MODE           = 15,
    W_PARAM_TEX_ANGLE      = 16,
    W_PARAM_TEX_SCALE      = 17,
    W_PARAM_TEX_LAYER      = 18, /* layer index to use as grain texture (-1 = none) */
    W_PARAM_SMOOTH         = 19, /* stroke smoothing / stabilization percentage (0..100) */
    W_PARAM_MIDPOINT       = 20, /* bezier midpoint interpolation ratio (0..100 %, default 50) */
    W_PARAM_TEX_CONTRAST   = 21, /* grain texture contrast (0..200 %, default 100) */
    W_PARAM_AUTO_ROTATE    = 22, /* auto-rotate brush tip along stroke trajectory (0=off, 1=on) */
    W_PARAM_VELOCITY       = 23, /* velocity dynamics sensitivity (0..100) */
    W_PARAM_TAPER_IN       = 24, /* taper-in length in pixels (0..500) */
    W_PARAM_TAPER_OUT      = 25, /* taper-out length in pixels (0..500) */
    W_PARAM_FADE           = 26, /* stroke fade distance in pixels (0=off, 1..5000) */
    W_PARAM_SIZE_JITTER    = 27, /* size random variation % (0..100) */
    W_PARAM_ANGLE_JITTER   = 28, /* angle random variation degrees (0..360) */
    W_PARAM_OPACITY_JITTER = 29, /* opacity/flow random variation % (0..100) */
    W_PARAM_COLOR_JITTER   = 30, /* color random variation % (0..100) */
    W_PARAM_DAB_BLEND      = 31, /* dab blend mode: 0=normal, 1=multiply, 2=screen, 3=overlay, 4=dodge, 5=add */
    W_PARAM_SUBPIXEL       = 32, /* subpixel anti-aliasing rendering: 0=off, 1=on */
    W_PARAM_DEPLETION      = 33, /* wet media paint depletion rate % (0..100) */
    W_PARAM_COLOR_PICKUP   = 34, /* continuous color pickup rate % (0..100) */
    W_PARAM_DUAL_SHAPE     = 35, /* dual brush secondary tip layer index (-1 = none) */
    W_PARAM_DUAL_SIZE      = 36, /* dual brush secondary tip size % (1..500) */
    W_PARAM_DUAL_SPACING   = 37, /* dual brush secondary tip spacing % (1..500) */
    W_PARAM_SYMMETRY       = 38, /* symmetry mode: 0=off, 1=vertical, 2=horizontal, 3=both */
    W_PARAM_PRESSURE_SIZE  = 39, /* stylus pressure controls brush size: 0=off, 1=on */
    W_PARAM_PRESSURE_FLOW  = 40, /* stylus pressure controls brush flow/opacity: 0=off, 1=on */
    W_PARAM_TILT_ANGLE     = 41, /* stylus tilt controls brush angle/roundness: 0=off, 1=on */
    W_PARAM_BUILDUP        = 42  /* continuous dab buildup mode within single stroke: 0=off (stroke opacity ceiling), 1=on */
};

enum {
    W_DAB_BLEND_NORMAL   = 0,
    W_DAB_BLEND_MULTIPLY = 1,
    W_DAB_BLEND_SCREEN   = 2,
    W_DAB_BLEND_OVERLAY  = 3,
    W_DAB_BLEND_DODGE    = 4,
    W_DAB_BLEND_ADD      = 5
};

enum {
    W_LAYER_BLEND_NORMAL   = 0,
    W_LAYER_BLEND_MULTIPLY = 1,
    W_LAYER_BLEND_SCREEN   = 2,
    W_LAYER_BLEND_OVERLAY  = 3,
    W_LAYER_BLEND_DODGE    = 4,
    W_LAYER_BLEND_ADD      = 5
};

W_EXPORT void w_layer_set_alpha_lock(int32_t idx, int32_t locked);
W_EXPORT int32_t w_layer_get_alpha_lock(int32_t idx);
W_EXPORT void w_layer_set_clipping(int32_t idx, int32_t clipping);
W_EXPORT int32_t w_layer_get_clipping(int32_t idx);
W_EXPORT void w_layer_set_blend_mode(int32_t idx, int32_t mode);
W_EXPORT int32_t w_layer_get_blend_mode(int32_t idx);
W_EXPORT int32_t w_has_dirty_rect(void);
W_EXPORT int32_t w_get_dirty_x0(void);
W_EXPORT int32_t w_get_dirty_y0(void);
W_EXPORT int32_t w_get_dirty_x1(void);
W_EXPORT int32_t w_get_dirty_y1(void);
W_EXPORT void w_clear_dirty_bounds(void);

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

#ifdef __wasm__
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
#else
static inline void w_set_layer(uint32_t *pixels, int32_t width, int32_t height) {
    g_layer.pixels = pixels;
    g_layer.width = width;
    g_layer.height = height;
}

static inline void w_set_texture(uint32_t *pixels, int32_t width, int32_t height) {
    g_texture.pixels = pixels;
    g_texture.width = width;
    g_texture.height = height;
}
#endif

W_EXPORT int32_t w_layer_resize(int32_t layer_idx, int32_t new_w, int32_t new_h, int32_t resample);
W_EXPORT int32_t w_layer_duplicate(int32_t layer_idx);
W_EXPORT uint32_t w_pick_color(int32_t x, int32_t y, int32_t sample_composite);
W_EXPORT void w_brush_stroke(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser);
W_EXPORT void w_brush_stroke_ext(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);

/* =========================================================================
 * Universal Dynamic Brush Engine API (Continuous Physics & Spline Curves)
 * ========================================================================= */
W_EXPORT void  w_brush_dyn_init(void);
W_EXPORT void  w_brush_dyn_set_base(int32_t setting, float value);
W_EXPORT float w_brush_dyn_get_base(int32_t setting);
W_EXPORT void  w_brush_dyn_set_curve(int32_t setting, int32_t input_idx, int32_t npoints, const float *x, const float *y);
W_EXPORT void  w_brush_dyn_clear_curve(int32_t setting, int32_t input_idx);
W_EXPORT void  w_brush_dyn_reset_state(void);
W_EXPORT void  w_brush_dyn_stroke_to(float x, float y, float pressure, float tilt_x, float tilt_y, float dtime, float viewzoom);


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

/** 64-bit integer square root for subpixel fixed-point precision */
static inline int w_isqrt64(uint64_t val) {
    if (val == 0) return 0;
    uint64_t x = val, c = 0, d = (uint64_t)1 << 62;
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
    return (int)c;
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

/**
 * Fast integer atan2 approximation in degrees (0..359).
 * Zero floats, zero libc, pure integer math.
 */
static inline int w_atan2_deg(int dy, int dx) {
    if (dx == 0 && dy == 0) return 0;
    int abs_y = dy < 0 ? -dy : dy;
    int abs_x = dx < 0 ? -dx : dx;
    int angle;
    if (abs_x >= abs_y) {
        int r = (abs_y * 1024) / abs_x;
        angle = (45 * r) / 1024;
    } else {
        int r = (abs_x * 1024) / abs_y;
        angle = 90 - (45 * r) / 1024;
    }
    if (dx < 0 && dy >= 0) angle = 180 - angle;
    else if (dx < 0 && dy < 0) angle = 180 + angle;
    else if (dx >= 0 && dy < 0) angle = 360 - angle;
    if (angle < 0) angle += 360;
    return angle % 360;
}

/** Freestanding float trigonometry and math (zero libc dependencies) */
static inline float w_sinf(float x) {
    const float PI = 3.14159265358979323846f;
    const float TWO_PI = 6.28318530717958647692f;
    while (x > PI) x -= TWO_PI;
    while (x < -PI) x += TWO_PI;
    float abs_x = x < 0.0f ? -x : x;
    float num = 16.0f * x * (PI - abs_x);
    float den = 5.0f * PI * PI - 4.0f * abs_x * (PI - abs_x);
    if (den == 0.0f) return 0.0f;
    return num / den;
}

static inline float w_cosf(float x) {
    return w_sinf(x + 1.5707963267948966f);
}

static inline float w_atan2f(float y, float x) {
    if (x == 0.0f && y == 0.0f) return 0.0f;
    const float PI = 3.14159265358979323846f;
    const float PI_2 = 1.5707963267948966f;
    float abs_y = y < 0.0f ? -y : y;
    float abs_x = x < 0.0f ? -x : x;
    float angle;
    if (abs_x >= abs_y) {
        float r = abs_y / (abs_x + 1e-7f);
        angle = r * (0.97239411f - 0.19194795f * r * r);
    } else {
        float r = abs_x / (abs_y + 1e-7f);
        angle = PI_2 - r * (0.97239411f - 0.19194795f * r * r);
    }
    if (x < 0.0f && y >= 0.0f) angle = PI - angle;
    else if (x < 0.0f && y < 0.0f) angle = -PI + angle;
    else if (x >= 0.0f && y < 0.0f) angle = -angle;
    return angle;
}

static inline float w_sqrtf(float x) {
    if (x <= 0.0f) return 0.0f;
    union { float f; uint32_t i; } conv;
    conv.f = x;
    conv.i = 0x1fbd1df5 + (conv.i >> 1);
    float y = conv.f;
    y = 0.5f * (y + x / y);
    y = 0.5f * (y + x / y);
    return y;
}

/** Integer RGB -> HSV (h: 0..359, s: 0..255, v: 0..255) */
static inline void w_rgb_to_hsv(uint32_t color, int *out_h, int *out_s, int *out_v) {
    int r = color & 0xFF;
    int g = (color >> 8) & 0xFF;
    int b = (color >> 16) & 0xFF;

    int max_c = (r > g) ? ((r > b) ? r : b) : ((g > b) ? g : b);
    int min_c = (r < g) ? ((r < b) ? r : b) : ((g < b) ? g : b);
    int delta = max_c - min_c;

    *out_v = max_c;
    if (max_c == 0 || delta == 0) {
        *out_s = 0;
        *out_h = 0;
        return;
    }

    *out_s = (255 * delta) / max_c;

    int h = 0;
    if (max_c == r) {
        h = (60 * (g - b)) / delta;
    } else if (max_c == g) {
        h = 120 + (60 * (b - r)) / delta;
    } else {
        h = 240 + (60 * (r - g)) / delta;
    }
    if (h < 0) h += 360;
    *out_h = h % 360;
}

/** Integer HSV -> RGB (h: 0..359, s: 0..255, v: 0..255) */
static inline uint32_t w_hsv_to_rgb(int h, int s, int v, uint32_t alpha) {
    if (s <= 0) {
        return (alpha << 24) | (v << 16) | (v << 8) | v;
    }
    h = h % 360;
    if (h < 0) h += 360;

    int region = h / 60;
    int rem = h % 60;

    int p = DIV255(v * (255 - s));
    int q = DIV255(v * (255 - (s * rem) / 60));
    int t = DIV255(v * (255 - (s * (60 - rem)) / 60));

    int r = 0, g = 0, b = 0;
    switch (region) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
    }
    return (alpha << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
}

/** Applies brush dab blend mode (Multiply, Screen, Overlay, Dodge, Add) */
static inline uint32_t w_apply_dab_blend(int mode, uint32_t src, uint32_t dst) {
    if (mode == 0) return src;
    uint32_t da = (dst >> 24) & 0xFF;
    if (da == 0) return src;
    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;
    uint32_t r, g, b;
    switch (mode) {
        case 1: // Multiply
            r = DIV255(sr * dr);
            g = DIV255(sg * dg);
            b = DIV255(sb * db);
            break;
        case 2: // Screen
            r = 255 - DIV255((255 - sr) * (255 - dr));
            g = 255 - DIV255((255 - sg) * (255 - dg));
            b = 255 - DIV255((255 - sb) * (255 - db));
            break;
        case 3: // Overlay
            r = (dr < 128) ? DIV255(2 * sr * dr) : 255 - DIV255(2 * (255 - sr) * (255 - dr));
            g = (dg < 128) ? DIV255(2 * sg * dg) : 255 - DIV255(2 * (255 - sg) * (255 - dg));
            b = (db < 128) ? DIV255(2 * sb * db) : 255 - DIV255(2 * (255 - sb) * (255 - db));
            break;
        case 4: // Color Dodge
            r = (sr >= 255) ? 255 : ((dr * 255) / (255 - sr));
            g = (sg >= 255) ? 255 : ((dg * 255) / (255 - sg));
            b = (sb >= 255) ? 255 : ((db * 255) / (255 - sb));
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;
            break;
        case 5: // Add
            r = sr + dr; if (r > 255) r = 255;
            g = sg + dg; if (g > 255) g = 255;
            b = sb + db; if (b > 255) b = 255;
            break;
        default:
            return src;
    }
    return (src & 0xFF000000) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
}

/** Standard Porter-Duff Source-Over alpha blending into layer with stroke max_alpha cap */
static inline uint32_t w_blend_fast(uint32_t src, uint32_t dst, uint32_t alpha, uint32_t max_alpha) {
    if (alpha == 0) return dst;
    uint32_t sa = (src >> 24) & 0xFF;
    uint32_t eff_sa = (alpha == 255) ? sa : DIV255(sa * alpha);
    if (eff_sa == 0) return dst;

    uint32_t da = (dst >> 24) & 0xFF;
    uint32_t inv_sa = 255 - eff_sa;

    uint32_t out_a = eff_sa + DIV255(da * inv_sa);
    if (max_alpha > 0 && out_a > max_alpha) {
        out_a = max_alpha;
    }
    if (out_a > 255) out_a = 255;
    if (out_a == 0) return dst;

    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;

    if (da == 0) {
        return (out_a << 24) | ((sb & 0xFF) << 16) | ((sg & 0xFF) << 8) | (sr & 0xFF);
    }

    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;
    uint32_t dst_factor = DIV255(da * inv_sa);
    uint32_t norm_a = eff_sa + dst_factor;
    if (norm_a == 0) norm_a = 1;

    uint32_t out_r = (sr * eff_sa + dr * dst_factor) / norm_a;
    uint32_t out_g = (sg * eff_sa + dg * dst_factor) / norm_a;
    uint32_t out_b = (sb * eff_sa + db * dst_factor) / norm_a;

    if (out_r > 255) out_r = 255;
    if (out_g > 255) out_g = 255;
    if (out_b > 255) out_b = 255;

    return (out_a << 24) | ((out_b & 0xFF) << 16) | ((out_g & 0xFF) << 8) | (out_r & 0xFF);
}

static inline int w_pos_mod(int a, int m) {
    int r = a % m;
    return r < 0 ? r + m : r;
}

static inline int w_pos_div(int a, int d) {
    int q = a / d;
    int r = a % d;
    return (r != 0 && a < 0) ? (q - 1) : q;
}

/** Texture masking: samples uploaded texture buffer or procedural grain/patterns with angle & scale */
static inline uint32_t w_sample_texture(int mode, int x, int y, int tex_angle, int tex_scale, int tex_contrast, uint32_t base_a) {
    if (base_a == 0) return 0;
    if (tex_scale <= 0) tex_scale = 100;

    int tx = x;
    int ty = y;

    if (tex_angle != 0) {
        int sin_t = 0, cos_t = 1024;
        w_sincos_deg(tex_angle, &sin_t, &cos_t);
        tx = (x * cos_t + y * sin_t) / 1024;
        ty = (-x * sin_t + y * cos_t) / 1024;
    }

    if (tex_scale != 100) {
        tx = (tx * 100) / tex_scale;
        ty = (ty * 100) / tex_scale;
    }

    if (g_texture.pixels && g_texture.width > 0 && g_texture.height > 0) {
        int gx = w_pos_mod(tx, g_texture.width);
        int gy = w_pos_mod(ty, g_texture.height);
        uint32_t p = g_texture.pixels[gy * g_texture.width + gx];
        uint32_t lum = ((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000;
        uint32_t ta = (p >> 24) & 0xFF;
        int factor = DIV255(lum * ta);
        if (tex_contrast != 100 && tex_contrast >= 0) {
            factor = 128 + ((factor - 128) * tex_contrast) / 100;
            if (factor < 0) factor = 0;
            if (factor > 255) factor = 255;
        }
        return DIV255(base_a * (uint32_t)factor);
    }
    if (mode <= 0) return base_a;
    uint32_t mod_a = base_a;
    if (mode == 1) { /* Paper grain */
        uint32_t n = (((uint32_t)tx * 1234567u + (uint32_t)ty * 7654321u) ^ ((uint32_t)tx * (uint32_t)ty * 13u)) & 0xFF;
        int fiber = (w_pos_mod(tx * 3 + ty * 5, 17) < 3) ? 50 : 255;
        mod_a = DIV255(DIV255(base_a * n) * fiber);
    } else if (mode == 2) { /* Canvas weave */
        int pat = ((w_pos_mod(tx, 6) < 3) ^ (w_pos_mod(ty, 6) < 3)) ? 255 : 40;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 3) { /* Noise */
        uint32_t n = (((uint32_t)tx * 374761393u + (uint32_t)ty * 668265263u) ^ 0x5bf03635u) & 0xFF;
        mod_a = DIV255(base_a * n);
    } else if (mode == 4) { /* Halftone dots */
        int dx = w_pos_mod(tx, 8) - 4, dy = w_pos_mod(ty, 8) - 4;
        int d2 = dx * dx + dy * dy;
        int pat = (d2 <= 5) ? 255 : 20;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 5) { /* Grid */
        int pat = (w_pos_mod(tx, 8) == 0 || w_pos_mod(ty, 8) == 0) ? 255 : 30;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 6) { /* Grunge */
        int bx = w_pos_div(tx, 4);
        int by = w_pos_div(ty, 4);
        uint32_t n = (((uint32_t)bx * 101u + (uint32_t)by * 203u) ^ ((uint32_t)tx * 17u + (uint32_t)ty * 31u)) & 0xFF;
        int pat = n > 120 ? 255 : (n * 255 / 120);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 7) { /* Hatch */
        int m = w_pos_mod(tx + ty, 6);
        int pat = (m == 0 || m == 1) ? 255 : 0;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 8) { /* Watercolor Cold Press Paper */
        uint32_t n1 = (((uint32_t)tx * 239847u + (uint32_t)ty * 983471u) ^ ((uint32_t)tx * 7u)) & 0xFF;
        int bx = w_pos_div(tx, 3);
        int by = w_pos_div(ty, 3);
        int pit = (w_pos_mod(bx * 11 + by * 13, 23) < 4) ? 40 : 255;
        mod_a = DIV255(DIV255(base_a * n1) * pit);
    } else if (mode == 9) { /* Charcoal Tooth */
        int bx = w_pos_div(tx, 2);
        int by = w_pos_div(ty, 2);
        uint32_t n = (((uint32_t)bx * 589237u + (uint32_t)by * 782391u) ^ ((uint32_t)tx * 31u + (uint32_t)ty * 19u)) & 0xFF;
        int tooth = (n > 140) ? 255 : (n > 70 ? 120 : 20);
        mod_a = DIV255(base_a * tooth);
    } else if (mode == 10) { /* Wood Grain */
        int wave = tx + w_pos_mod(w_pos_div(ty * ty, 120), 24);
        int ring = (w_pos_mod(wave, 12) < 3) ? 255 : 70;
        mod_a = DIV255(base_a * ring);
    } else if (mode == 11) { /* Leather / Cellular Pores */
        int cx = w_pos_mod(tx, 10) - 5, cy = w_pos_mod(ty, 10) - 5;
        int d = cx * cx + cy * cy;
        int pore = (d <= 3) ? 40 : 240;
        mod_a = DIV255(base_a * pore);
    } else if (mode == 12) { /* Dense Linen */
        int lx = (w_pos_mod(tx, 4) < 2), ly = (w_pos_mod(ty, 4) < 2);
        int pat = (lx ^ ly) ? 245 : 65;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 13) { /* Marble Veins */
        int v = (((uint32_t)tx * 7u + (uint32_t)w_pos_mod(ty * 13, 31)) ^ ((uint32_t)tx * (uint32_t)ty)) & 0xFF;
        int pat = (v > 180) ? 250 : (v < 60 ? 30 : 160);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 14) { /* Perlin Cloud */
        uint32_t c1 = (((uint32_t)tx * 197u + (uint32_t)ty * 311u) ^ 0x5a5a5a5au) & 0xFF;
        int pat = (c1 > 140) ? 240 : (c1 < 60 ? 40 : 130);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 15) { /* Basket Weave */
        int bx = w_pos_mod(w_pos_div(tx, 8), 2);
        int by = w_pos_mod(w_pos_div(ty, 8), 2);
        int pat = (bx ^ by) ? ((w_pos_mod(tx, 4) < 2) ? 235 : 60) : ((w_pos_mod(ty, 4) < 2) ? 235 : 60);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 16) { /* Sandpaper Grit */
        uint32_t g = (((uint32_t)tx * 377u + (uint32_t)ty * 491u) ^ ((uint32_t)tx * (uint32_t)ty * 13u)) & 0xFF;
        int tooth = g > 110 ? 255 : (g > 50 ? 110 : 25);
        mod_a = DIV255(base_a * tooth);
    } else if (mode == 17) { /* Radial Halftone */
        int dx = w_pos_mod(tx, 16) - 8, dy = w_pos_mod(ty, 16) - 8;
        int d = w_isqrt(dx * dx + dy * dy);
        int pat = (d <= 6) ? (255 - d * 35) : 30;
        if (pat < 0) pat = 0;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 18) { /* Crackle Fissures */
        int c = (((uint32_t)tx * 17u + (uint32_t)ty * 31u) ^ ((uint32_t)tx * (uint32_t)ty * 3u)) & 0xFF;
        int pat = (c < 35 || (w_pos_mod(tx + ty * 2, 37) < 3)) ? 30 : 235;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 19) { /* Washi Fiber */
        int f1 = (w_pos_mod(tx * 7 + ty * 29, 31) < 3) ? 70 : 255;
        int f2 = (w_pos_mod(tx * 19 - ty * 11, 43) < 2) ? 50 : 255;
        mod_a = DIV255(DIV255(base_a * f1) * f2);
    } else if (mode == 20) { /* Concrete Stone */
        int p1 = (((uint32_t)tx * 133u + (uint32_t)ty * 277u) ^ ((uint32_t)tx * (uint32_t)ty * 17u)) & 0xFF;
        int pat = (p1 > 130) ? 230 : (p1 < 60 ? 50 : 140);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 21) { /* Antique Parchment */
        int m1 = w_pos_mod(tx * 31 + ty * 17, 47);
        int m2 = w_pos_mod(tx * 13 - ty * 29, 37);
        int pat = 180 + m1 - m2;
        if (pat < 0) pat = 0; if (pat > 255) pat = 255;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 22) { /* Stipple Noise */
        uint32_t r = (((uint32_t)tx * 499u + (uint32_t)ty * 883u) ^ 0x3d3d3d3du) & 0xFF;
        int pat = r > 165 ? 245 : (r > 75 ? 140 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 23) { /* Spatter Drops */
        int cx = w_pos_mod(tx, 32) - 16, cy = w_pos_mod(ty, 32) - 16;
        int d2 = cx * cx + cy * cy;
        int pat = (d2 <= 9 || (w_pos_mod(tx * 97 + ty * 43, 89) < 4)) ? 30 : 240;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 24) { /* Raw Fiber Pulp */
        int bx = w_pos_div(tx, 4);
        int by = w_pos_div(ty, 4);
        int clump = (((uint32_t)bx * 31u + (uint32_t)by * 47u) ^ ((uint32_t)tx * 3u)) & 0xFF;
        int pat = (clump > 140) ? 245 : (clump < 70 ? 60 : 190);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 25) { /* Coarse Halftone */
        int dx = w_pos_mod(tx, 16) - 8, dy = w_pos_mod(ty, 16) - 8;
        int pat = (dx * dx + dy * dy <= 42) ? 255 : 20;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 26) { /* Fine Crosshatch */
        int h1 = w_pos_mod(tx + ty, 4) == 0;
        int h2 = w_pos_mod(tx - ty, 4) == 0;
        int pat = (h1 || h2) ? 250 : 30;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 27) { /* Distressed Rust */
        int g = (((uint32_t)tx * 19u + (uint32_t)ty * 43u) ^ ((uint32_t)tx * (uint32_t)ty)) & 0xFF;
        int pat = (g > 160) ? 235 : (g < 60 ? 40 : 130);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 28) { /* Dry Bristle Scrape */
        int by = w_pos_div(ty, 4);
        int streak = (((uint32_t)tx * 53u + (uint32_t)by * 97u) ^ ((uint32_t)tx * 11u)) & 0xFF;
        int pat = streak > 100 ? 245 : (streak > 40 ? 110 : 25);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 29) { /* Pastel Board (Honeycomb) */
        int u = w_pos_mod((tx * 866 + ty * 500) / 1000, 12);
        int v = w_pos_mod((-tx * 866 + ty * 500) / 1000, 12);
        int du = (u > 6) ? (12 - u) : u;
        int dv = (v > 6) ? (12 - v) : v;
        int hex = (du < dv) ? du : dv;
        int pat = 60 + hex * 30;
        if (pat > 255) pat = 255;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 30) { /* Tree Bark */
        int wave = w_pos_mod(ty * 13, 29);
        int xPerturb = w_pos_mod(tx + wave, 32);
        int fissure = (xPerturb > 16) ? (32 - xPerturb) : xPerturb;
        int fiber = (w_pos_mod(tx * 47 + ty * 13, 17) < 3) ? -35 : 20;
        int pat = fissure * 14 + fiber + 60;
        if (pat < 0) pat = 0; if (pat > 255) pat = 255;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 31) { /* Manga 60L Screen Dots */
        int u = w_pos_mod(((tx + ty) * 707) / 1000, 8);
        int v = w_pos_mod(((-tx + ty) * 707) / 1000, 8);
        int du = u - 4, dv = v - 4;
        int pat = (du * du + dv * dv <= 5) ? 255 : 30;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 32) { /* Manga Sandtone */
        uint32_t g1 = (((uint32_t)tx * 127u + (uint32_t)ty * 311u) ^ ((uint32_t)tx * 19u)) & 0xFF;
        uint32_t g2 = (((uint32_t)tx * 37u - (uint32_t)ty * 97u) ^ ((uint32_t)ty * 23u)) & 0xFF;
        int pat = (g1 > 170 || (g2 > 210 && w_pos_mod(tx + ty, 2) == 0)) ? 245 : 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 33) { /* Sea Sponge */
        int bx = w_pos_div(tx, 6);
        int by = w_pos_div(ty, 6);
        int pore = (w_pos_mod(bx * 17 + by * 29, 19) < 3) ? 40 : 230;
        uint32_t noise = (((uint32_t)tx * 43u + (uint32_t)ty * 71u) ^ ((uint32_t)tx * (uint32_t)ty)) & 0xFF;
        int pat = DIV255(pore * (160 + (noise >> 1)));
        if (pat > 255) pat = 255;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 34) { /* Stucco Plaster Wall */
        int facet = (w_pos_mod(tx * 3 + ty * 5, 64) < 32) ? 220 : 80;
        int knife = (w_pos_mod(tx * 19 - ty * 23, 41) < 4) ? 40 : 255;
        int pat = DIV255(facet * knife);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 35) { /* Denim Twill Weave */
        int twill = w_pos_mod(tx * 2 + ty, 6);
        int pat = (twill < 3) ? 240 : 60;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 36) { /* Oil Impasto Knife Peaks */
        int ridge = (w_pos_mod(tx * 11 + ty * 7, 32) < 16) ? 250 : 50;
        int gouge = (w_pos_mod(tx * 29 - ty * 13, 47) < 3) ? 30 : 240;
        int pat = DIV255(ridge * gouge);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 37) { /* Dusty Chalk Tooth */
        int grain = (((uint32_t)tx * 199u + (uint32_t)ty * 337u) ^ ((uint32_t)tx * (uint32_t)ty * 5u)) & 0xFF;
        int pat = grain > 120 ? 240 : 45;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 38) { /* Vintage Engraving Lines */
        int line = w_pos_mod(ty + w_pos_mod(tx * 7, 5), 6);
        int pat = (line < 3) ? 245 : 30;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 39) { /* Granite Rock Flecks */
        uint32_t f1 = (((uint32_t)tx * 17u + (uint32_t)ty * 73u) ^ ((uint32_t)tx * 3u)) & 0xFF;
        uint32_t f2 = (((uint32_t)tx * 89u + (uint32_t)ty * 13u) ^ ((uint32_t)ty * 5u)) & 0xFF;
        int pat = (f1 > 220) ? 250 : ((f2 > 230) ? 30 : (120 + ((f1 + f2) >> 2)));
        mod_a = DIV255(base_a * pat);
    } else if (mode == 40) { /* Watercolor Salt Bloom */
        int cx = w_pos_mod(tx, 64) - 32, cy = w_pos_mod(ty, 64) - 32;
        int d = w_isqrt(cx * cx + cy * cy);
        int pat = (d >= 24 && d <= 30) ? 40 : (d < 24 ? 245 : 180);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 41) { /* Coarse Burlap Jute */
        int tx_b = (w_pos_mod(tx, 8) < 4) ? 220 : 50;
        int ty_b = (w_pos_mod(ty, 8) < 4) ? 220 : 50;
        int block = w_pos_mod(w_pos_div(tx, 8) + w_pos_div(ty, 8), 2) == 0;
        int pat = block ? tx_b : ty_b;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 42) { /* Cracked Mud Earth */
        int c1 = (w_pos_mod(tx * 13, 47) < 4);
        int c2 = (w_pos_mod(ty * 17, 53) < 4);
        int pat = (c1 || c2) ? 30 : 235;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 43) { /* Cyber PCB Circuit Board */
        int cx = w_pos_mod(tx, 32), cy = w_pos_mod(ty, 32);
        int dx = cx - 16, dy = cy - 16;
        int d2 = dx * dx + dy * dy;
        int is_pad = (d2 <= 25);
        int is_hole = (d2 <= 4);
        int is_trace = (cx == 16 || cy == 16 || (w_pos_mod(cx + cy, 32) == 0 && cx >= 6 && cx <= 26));
        int pat = is_hole ? 35 : (is_pad || is_trace ? 250 : 55);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 44) { /* Foliage / Organic Leaves */
        int u = w_pos_mod(tx, 32) - 16, v = w_pos_mod(ty, 32) - 16;
        int lu = (u + v) * 707 / 1000, lv = (-u + v) * 707 / 1000;
        int w_max = 6 - (lu * lu) / 28;
        if (w_max < 0) w_max = 0;
        int in_leaf = (lu >= -13 && lu <= 13 && lv >= -w_max && lv <= w_max);
        int is_stem = in_leaf && (lv == 0);
        int pat = in_leaf ? (is_stem ? 45 : 230) : 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 45) { /* Grass Blades Lawn */
        int u = w_pos_mod(tx, 16) - 8, v = w_pos_mod(ty, 32);
        int curve = ((32 - v) * (32 - v)) / 160;
        int du = u - curve;
        if (du < 0) du = -du;
        int w_blade = ((32 - v) * 3) / 32;
        int pat = (du <= w_blade) ? (245 - v * 3) : 35;
        if (pat < 35) pat = 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 46) { /* Butterfly Wings Motif */
        int u = w_pos_mod(tx, 40) - 20; if (u < 0) u = -u;
        int v = w_pos_mod(ty, 40) - 20;
        int d_up = (u - 10)*(u - 10) + (v + 6)*(v + 6);
        int d_dn = (u - 7)*(u - 7) + (v - 8)*(v - 8);
        int in_wing = (d_up <= 64 || d_dn <= 36 || (u <= 2 && v >= -14 && v <= 14));
        int vein = in_wing && (w_pos_mod(u * 3 + v * 2, 7) < 2);
        int pat = in_wing ? (vein ? 65 : 240) : 30;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 47) { /* Mystic Surreal Eyes */
        int u = w_pos_mod(tx, 48) - 24, v = w_pos_mod(ty, 32) - 16;
        int v_abs = v < 0 ? -v : v;
        int v_bound = 12 - (u * u) / 48;
        if (v_bound < 0) v_bound = 0;
        int in_eye = (v_abs <= v_bound);
        int d2 = u * u + v * v;
        int is_pupil = (d2 <= 12);
        int is_iris = (d2 <= 56);
        int is_lid = (v_abs >= v_bound - 2 && v_abs <= v_bound + 1);
        int pat = is_pupil ? 25 : (is_iris ? 230 : (in_eye ? 180 : (is_lid ? 245 : 30)));
        mod_a = DIV255(base_a * pat);
    } else if (mode == 48) { /* Steampunk Gears / Cogs */
        int u = w_pos_mod(tx, 36) - 18, v = w_pos_mod(ty, 36) - 18;
        int r = w_isqrt(u * u + v * v);
        int ang = w_atan2_deg(v, u);
        int cog = (w_pos_mod((ang * 8) / 360, 2) == 0);
        int r_max = cog ? 15 : 12;
        int in_gear = (r <= r_max && r >= 5);
        int is_hole = (r <= 4);
        int pat = is_hole ? 30 : (in_gear ? 240 : 40);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 49) { /* Kitty Silhouettes & Paw Prints */
        int u = w_pos_mod(tx, 36), v = w_pos_mod(ty, 36);
        int d_main = (u - 18)*(u - 18) + (v - 22)*(v - 22);
        int d1 = (u - 11)*(u - 11) + (v - 11)*(v - 11);
        int d2 = (u - 15)*(u - 15) + (v - 8)*(v - 8);
        int d3 = (u - 21)*(u - 21) + (v - 8)*(v - 8);
        int d4 = (u - 25)*(u - 25) + (v - 11)*(v - 11);
        int is_paw = (d_main <= 49 || d1 <= 9 || d2 <= 9 || d3 <= 9 || d4 <= 9);
        int pat = is_paw ? 245 : 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 50) { /* Dragon / Reptile Armor Scales */
        int row = w_pos_div(ty, 16);
        int off = (w_pos_mod(row, 2) == 0) ? 0 : 12;
        int u = w_pos_mod(tx + off, 24) - 12, v = w_pos_mod(ty, 16);
        int d = w_isqrt(u * u + (v - 16) * (v - 16));
        int pat = (d <= 14 && d >= 11) ? 255 : (d < 11 ? (150 + v * 6) : 35);
        if (pat > 255) pat = 255;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 51) { /* Starry Cosmos & Constellations */
        int u = w_pos_mod(tx, 40) - 20; if (u < 0) u = -u;
        int v = w_pos_mod(ty, 40) - 20; if (v < 0) v = -v;
        int is_star = (u * v <= 6 && (u + v <= 16));
        int is_tiny = (u == 8 && v == 10) || (u == 12 && v == 12);
        uint32_t neb = (((uint32_t)tx * 31u + (uint32_t)ty * 67u) ^ ((uint32_t)tx * (uint32_t)ty * 7u)) & 0x3F;
        int pat = is_star ? 255 : (is_tiny ? 230 : (35 + neb));
        mod_a = DIV255(base_a * pat);
    } else if (mode == 52) { /* Sci-Fi Cyber Hex Tech */
        int u = w_pos_mod((tx * 866 + ty * 500) / 1000, 16);
        int v = w_pos_mod((-tx * 866 + ty * 500) / 1000, 16);
        int is_border = (u <= 2 || u >= 14 || v <= 2 || v >= 14);
        int is_node = (u >= 7 && u <= 9 && v >= 7 && v <= 9);
        int pat = is_node ? 255 : (is_border ? 210 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 53) { /* Bubble & Soap Foam Clusters */
        int c1x = w_pos_mod(tx, 28) - 14, c1y = w_pos_mod(ty, 28) - 14;
        int d1 = w_isqrt(c1x * c1x + c1y * c1y);
        int c2x = w_pos_mod(tx + 14, 20) - 10, c2y = w_pos_mod(ty + 10, 20) - 10;
        int d2 = w_isqrt(c2x * c2x + c2y * c2y);
        int is_wall = (d1 >= 11 && d1 <= 13) || (d2 >= 8 && d2 <= 9);
        int is_glint = (d1 < 11 && c1x <= -5 && c1y <= -5);
        int pat = is_glint ? 255 : (is_wall ? 235 : (d1 < 11 ? 120 : 35));
        mod_a = DIV255(base_a * pat);
    } else if (mode == 54) { /* Celtic Knot Interlaced Ribbons */
        int u = w_pos_mod(tx, 24), v = w_pos_mod(ty, 24);
        int b1 = w_pos_mod(u + v, 12);
        int b2 = w_pos_mod(u - v + 24, 12);
        int s1 = (b1 >= 4 && b1 <= 8);
        int s2 = (b2 >= 4 && b2 <= 8);
        int over = (w_pos_div(u, 12) ^ w_pos_div(v, 12));
        int pat = (s1 && s2) ? (over ? (b1 == 4 || b1 == 8 ? 40 : 240) : (b2 == 4 || b2 == 8 ? 40 : 240)) : ((s1 || s2) ? 230 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 55) { /* Skulls & Crossbones Motif */
        int u = w_pos_mod(tx, 36) - 18, v = w_pos_mod(ty, 36) - 18;
        int d_head = u * u + (v + 4) * (v + 4);
        int in_jaw = (u >= -5 && u <= 5 && v >= 4 && v <= 10);
        int in_head = (d_head <= 81) || in_jaw;
        int in_eye1 = (u + 4) * (u + 4) + (v + 2) * (v + 2) <= 6;
        int in_eye2 = (u - 4) * (u - 4) + (v + 2) * (v + 2) <= 6;
        int in_nose = (u * u + (v - 3) * (v - 3) <= 2);
        int pat = (in_eye1 || in_eye2 || in_nose) ? 25 : (in_head ? 245 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 56) { /* Hearts & Sweet Cupid Motif */
        int u = w_pos_mod(tx, 32) - 16, v = w_pos_mod(ty, 32) - 14;
        int u_abs = u < 0 ? -u : u;
        int top_y = w_isqrt(u_abs * 6);
        int d2 = u * u + (v - top_y) * (v - top_y);
        int in_heart = (d2 <= 64 && v <= 12);
        int glint = in_heart && (u >= -8 && u <= -4 && v >= -4 && v <= 0);
        int pat = glint ? 255 : (in_heart ? 235 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 57) { /* Traditional Japanese Waves (Seigaiha) */
        int row = w_pos_div(ty, 12);
        int off = (w_pos_mod(row, 2) == 0) ? 0 : 16;
        int u = w_pos_mod(tx + off, 32) - 16, v = w_pos_mod(ty, 12);
        int d = w_isqrt(u * u + (v - 12) * (v - 12));
        int is_arch = (d <= 20 && w_pos_mod(d, 4) < 2);
        int pat = is_arch ? 245 : 45;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 58) { /* Musical Notation & Staff */
        int u = w_pos_mod(tx, 40), v = w_pos_mod(ty, 32);
        int is_staff = (v == 8 || v == 12 || v == 16 || v == 20 || v == 24);
        int n1 = (u - 14)*(u - 14) + (v - 20)*(v - 20) <= 12;
        int s1 = (u == 17 && v >= 6 && v <= 20);
        int n2 = (u - 28)*(u - 28) + (v - 16)*(v - 16) <= 12;
        int s2 = (u == 31 && v >= 2 && v <= 16);
        int beam = (u >= 17 && u <= 31 && v >= 2 && v <= 5);
        int is_note = n1 || s1 || n2 || s2 || beam;
        int pat = (is_note || is_staff) ? 245 : 40;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 59) { /* Classic Houndstooth (Pied-de-Poule) */
        int u = w_pos_mod(tx, 16), v = w_pos_mod(ty, 16);
        int q1 = (u < 8 && v < 8);
        int q4 = (u >= 8 && v >= 8);
        int teeth = (u + v >= 8 && u + v <= 16 && ((u < 8) ^ (v < 8)));
        int is_ht = q1 || q4 || teeth;
        int pat = is_ht ? 245 : 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 60) { /* Bird Feathers & Plumage */
        int u = w_pos_mod(tx, 20) - 10, v = w_pos_mod(ty, 40);
        int u_abs = u < 0 ? -u : u;
        int spine = (u_abs == 0);
        int barb = (w_pos_mod(v - u_abs * 2, 5) < 2 && u_abs <= 9);
        int pat = spine ? 255 : (barb ? 220 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 61) { /* Interlinked Chainmail Armor */
        int row = w_pos_div(ty, 8);
        int off = (w_pos_mod(row, 2) == 0) ? 0 : 8;
        int u = w_pos_mod(tx + off, 16) - 8, v = w_pos_mod(ty, 8) - 4;
        int d = w_isqrt(u * u + v * v * 3);
        int ring = (d >= 5 && d <= 8);
        int pat = ring ? 240 : 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 62) { /* Vintage Damask & Floral Paisley */
        int u = w_pos_mod(tx, 36) - 18, v = w_pos_mod(ty, 36) - 18;
        int r = w_isqrt(u * u + v * v);
        int ang = w_atan2_deg(v, u);
        int swirl = w_pos_mod(r * 8 - ang / 15, 24) < 8;
        int pat = swirl ? 235 : 45;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 63) { /* Argyle Diamond Plaid */
        int u = w_pos_mod(tx, 32) - 16; if (u < 0) u = -u;
        int v = w_pos_mod(ty, 48) - 24; if (v < 0) v = -v;
        int d_val = u * 3 + v * 2;
        int is_diamond = (d_val <= 48);
        int is_stitch = (w_pos_mod(u * 3 + v * 2, 8) < 4 && d_val >= 46 && d_val <= 50);
        int pat = is_stitch ? 255 : (is_diamond ? 210 : 50);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 64) { /* Masonry Brick Wall & Mortar */
        int row = w_pos_div(ty, 12);
        int off = (w_pos_mod(row, 2) == 0) ? 0 : 16;
        int u = w_pos_mod(tx + off, 32), v = w_pos_mod(ty, 12);
        int is_mortar = (u < 2 || v < 2);
        uint32_t b_noise = (((uint32_t)tx * 13u + (uint32_t)ty * 29u) ^ ((uint32_t)tx * 7u)) & 0x1F;
        int pat = is_mortar ? 40 : (180 + b_noise);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 65) { /* Liquid Molten Magma / Lava */
        uint32_t n1 = (((uint32_t)tx * 179u + (uint32_t)ty * 313u) ^ ((uint32_t)tx * (uint32_t)ty * 7u)) & 0xFF;
        int w1 = w_pos_mod(tx * 3 + ty * 2 + (n1 >> 2), 48);
        int fissure = w1 - 24; if (fissure < 0) fissure = -fissure;
        int pat = (fissure <= 4) ? 255 : (fissure <= 10 ? 190 : 35);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 66) { /* Geometric Labyrinth Maze */
        int u = w_pos_mod(tx, 24), v = w_pos_mod(ty, 24);
        int wall = (u == 0 || v == 0 || (u >= 6 && u <= 18 && (v == 6 || v == 18)) || (u == 12 && v >= 6 && v <= 14));
        int pat = wall ? 245 : 35;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 67) { /* Lightning Electric Arcs */
        int jag = w_pos_mod(ty * 13, 17);
        int bolt = w_pos_mod(tx + jag - 24, 48);
        int pat = (bolt <= 2) ? 255 : (bolt <= 5 ? 140 : 25);
        mod_a = DIV255(base_a * pat);
    } else if (mode == 68) { /* Radial Spiderweb */
        int u = w_pos_mod(tx, 48) - 24, v = w_pos_mod(ty, 48) - 24;
        int r = w_isqrt(u * u + v * v);
        int u_abs = u < 0 ? -u : u, v_abs = v < 0 ? -v : v;
        int ring = (w_pos_mod(r, 8) <= 1 && r <= 24);
        int spoke = (u == 0 || v == 0 || u_abs == v_abs) && (r <= 24);
        int pat = (ring || spoke) ? 245 : 30;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 69) { /* Crystal Facets / Gemstones */
        int cx = w_pos_mod(tx, 24) - 12, cy = w_pos_mod(ty, 24) - 12;
        int cx_abs = cx < 0 ? -cx : cx, cy_abs = cy < 0 ? -cy : cy;
        int diff = cx_abs - cy_abs; if (diff < 0) diff = -diff;
        int is_edge = (diff <= 1 || cx_abs == 11 || cy_abs == 11);
        int pat = is_edge ? 30 : (175 + cx * 4 - cy * 3);
        if (pat > 255) pat = 255; if (pat < 0) pat = 0;
        mod_a = DIV255(base_a * pat);
    } else if (mode == 70) { /* 8-Bit Space Pixel Invaders */
        int bx = w_pos_div(w_pos_mod(tx, 24), 3);
        int by = w_pos_div(w_pos_mod(ty, 24), 3);
        int sym_x = bx > 3 ? (7 - bx) : bx;
        static const uint8_t sprite[8] = { 0x00, 0x04, 0x02, 0x07, 0x0D, 0x0F, 0x0A, 0x05 };
        int is_pixel = (sprite[by & 7] & (1 << sym_x)) != 0;
        int pat = is_pixel ? 245 : 30;
        mod_a = DIV255(base_a * pat);
    }
    if (tex_contrast != 100 && tex_contrast >= 0 && base_a > 0) {
        int factor = (mod_a * 255) / base_a;
        factor = 128 + ((factor - 128) * tex_contrast) / 100;
        if (factor < 0) factor = 0;
        if (factor > 255) factor = 255;
        mod_a = DIV255(base_a * (uint32_t)factor);
    }
    return mod_a;
}

/* =========================================================================
 * Vector Stroke & Path ABI definitions
 * ========================================================================= */

enum {
    W_VSHAPE_PATH    = 0,
    W_VSHAPE_RECT    = 1,
    W_VSHAPE_ELLIPSE = 2,
    W_VSHAPE_POLY    = 3
};

typedef struct {
    int32_t x;
    int32_t y;
    int32_t pressure;   /* 0..1000 */
    int16_t tilt_x;     /* -90..90 */
    int16_t tilt_y;     /* -90..90 */
} w_vpoint_t;

typedef struct {
    int32_t  id;
    int32_t  layer_idx;
    int32_t  shape_type;
    uint32_t color;
    uint32_t fill_color;
    int32_t  stroke_width;
    int32_t  eraser;
    int32_t  closed;
    w_vpoint_t *points;
    int32_t  point_count;
    int32_t  point_capacity;
    int32_t  min_x, min_y, max_x, max_y;
} w_vstroke_header_t;

/* Vector ABI Prototypes */
W_EXPORT void    w_vector_set_recording(int32_t enabled);
W_EXPORT int32_t w_vector_get_recording(void);
W_EXPORT int32_t w_vector_stroke_begin(uint32_t color, int32_t eraser);
W_EXPORT void    w_vector_stroke_add_point(int32_t x, int32_t y, int32_t pressure, int32_t tilt_x, int32_t tilt_y);
W_EXPORT void    w_vector_stroke_end(int32_t closed);
W_EXPORT int32_t w_vector_create_shape(int32_t type, int32_t x, int32_t y, int32_t w, int32_t h, uint32_t stroke_color, uint32_t fill_color);
W_EXPORT int32_t w_vector_hit_test_object(int32_t layer_idx, int32_t x, int32_t y, int32_t tolerance);
W_EXPORT int32_t w_vector_hit_test_node(int32_t layer_idx, int32_t obj_id, int32_t x, int32_t y, int32_t radius);
W_EXPORT int32_t w_vector_set_point(int32_t layer_idx, int32_t obj_id, int32_t pt_idx, int32_t x, int32_t y, int32_t pressure);
W_EXPORT int32_t w_vector_insert_point(int32_t layer_idx, int32_t obj_id, int32_t pt_idx, int32_t x, int32_t y, int32_t pressure);
W_EXPORT int32_t w_vector_delete_point(int32_t layer_idx, int32_t obj_id, int32_t pt_idx);
W_EXPORT int32_t w_vector_transform_object(int32_t layer_idx, int32_t obj_id, int32_t dx, int32_t dy, int32_t scale_pct, int32_t rot_deg);
W_EXPORT int32_t w_vector_delete_object(int32_t layer_idx, int32_t obj_id);
W_EXPORT int32_t w_vector_set_object_style(int32_t layer_idx, int32_t obj_id, uint32_t stroke_color, uint32_t fill_color, int32_t stroke_width);
W_EXPORT int32_t w_vector_get_count(int32_t layer_idx);
W_EXPORT void    w_vector_clear_layer(int32_t layer_idx);
W_EXPORT void    w_vector_clear_all(void);
W_EXPORT void    w_vector_replay_layer(int32_t layer_idx, int32_t scale_pct, int32_t off_x, int32_t off_y);
W_EXPORT void    w_vector_replay_all(int32_t scale_pct, int32_t off_x, int32_t off_y);
W_EXPORT int32_t w_vector_get_stroke_point_count(int32_t layer_idx, int32_t stroke_idx);
W_EXPORT int32_t w_vector_get_stroke_info(int32_t layer_idx, int32_t stroke_idx, int32_t *out_info);
W_EXPORT int32_t w_vector_get_stroke_point(int32_t layer_idx, int32_t stroke_idx, int32_t pt_idx, int32_t *out_pt);


/* =========================================================================
 * Selection, Masking, Layer Transform & Procedural Tip ABI
 * ========================================================================= */

enum {
    W_SEL_REPLACE   = 0,
    W_SEL_ADD       = 1,
    W_SEL_SUB       = 2,
    W_SEL_INTERSECT = 3
};

enum {
    W_TIP_CIRCLE   = 0,
    W_TIP_SQUARE   = 1,
    W_TIP_CHISEL   = 2,
    W_TIP_BRISTLE  = 3,
    W_TIP_RAKE     = 4,
    W_TIP_CHARCOAL = 5,
    W_TIP_DAGGER   = 6
};

/* Native Selection Engine */
W_EXPORT void    w_select_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t op_mode);
W_EXPORT int32_t w_select_wand(int32_t layer_idx, int32_t seed_x, int32_t seed_y, int32_t tolerance, int32_t contiguous, int32_t op_mode);
W_EXPORT void    w_select_lasso(const int32_t *points_xy, int32_t point_count, int32_t op_mode);
W_EXPORT void    w_select_all(int32_t op_mode);
W_EXPORT void    w_select_clear(void);
W_EXPORT void    w_select_invert(void);
W_EXPORT void    w_select_feather(int32_t radius);
W_EXPORT int32_t w_select_get_info(int32_t *out_5words);

/* Native Layer Free Transform & Flip Engine */
W_EXPORT int32_t w_layer_transform(int32_t src_layer_idx, int32_t dst_layer_idx, int32_t dx, int32_t dy, int32_t scale_x_pct, int32_t scale_y_pct, int32_t rot_deg, int32_t skew_x, int32_t bilinear);
W_EXPORT void    w_layer_flip_h(int32_t layer_idx);
W_EXPORT void    w_layer_flip_v(int32_t layer_idx);

/* Native Procedural Brush Tip Generator */
W_EXPORT int32_t w_generate_brush_tip(int32_t shape_type, int32_t width, int32_t height, uint8_t *out_alpha_buffer);

/* =========================================================================
 * Animation, Timeline, Bones, IK, Mesh Warp & Camera ABI
 * ========================================================================= */

W_EXPORT void    w_anim_init(int32_t total_frames, int32_t fps);
W_EXPORT int32_t w_anim_get_total_frames(void);
W_EXPORT void    w_anim_set_total_frames(int32_t total_frames);
W_EXPORT int32_t w_anim_get_fps(void);
W_EXPORT void    w_anim_set_fps(int32_t fps);
W_EXPORT int32_t w_anim_get_frame(void);
W_EXPORT void    w_anim_set_frame(int32_t frame_idx);
W_EXPORT int32_t w_anim_track_create(int32_t track_type, int32_t target_layer_idx);
W_EXPORT int32_t w_anim_track_get_count(void);
W_EXPORT int32_t w_anim_add_keyframe(int32_t track_idx, int32_t frame_idx, int32_t tween_type);
W_EXPORT int32_t w_anim_set_keyframe_transform(int32_t track_idx, int32_t kf_idx, int32_t x, int32_t y, int32_t scale_x_pct, int32_t scale_y_pct, int32_t rot_deg, int32_t opacity, int32_t z_depth);
W_EXPORT int32_t w_anim_get_keyframe_count(int32_t track_idx);
W_EXPORT int32_t w_anim_get_keyframe_info(int32_t track_idx, int32_t kf_idx, int32_t *out_10words);
W_EXPORT void    w_anim_onion_skin(int32_t enabled, int32_t prev_frames, int32_t next_frames, int32_t tint_alpha);

/* Armature & IK solver */
W_EXPORT int32_t w_anim_armature_create(void);
W_EXPORT int32_t w_anim_bone_create(int32_t arm_id, int32_t parent_id, int32_t length, int32_t angle_deg);
W_EXPORT int32_t w_anim_bone_set_angle(int32_t arm_id, int32_t bone_id, int32_t angle_deg);
W_EXPORT int32_t w_anim_bone_get_info(int32_t arm_id, int32_t bone_id, int32_t *out_9words);
W_EXPORT int32_t w_anim_bone_ik_solve(int32_t arm_id, int32_t effector_bone_id, int32_t target_x, int32_t target_y, int32_t max_iters);

/* Mesh Warp & FFD */
W_EXPORT int32_t w_anim_mesh_create(int32_t width, int32_t height, int32_t cols, int32_t rows);
W_EXPORT int32_t w_anim_mesh_set_vertex(int32_t mesh_id, int32_t v_idx, int32_t x, int32_t y);
W_EXPORT int32_t w_anim_mesh_bind_bone(int32_t mesh_id, int32_t v_idx, int32_t arm_id, int32_t bone_id, int32_t weight_pct);
W_EXPORT int32_t w_anim_mesh_render(int32_t mesh_id, int32_t src_layer_idx, int32_t dst_layer_idx);

/* Multiplane Camera */
W_EXPORT void    w_anim_camera_set(int32_t x, int32_t y, int32_t z, int32_t zoom_pct, int32_t rot_deg);
W_EXPORT void    w_anim_camera_get(int32_t *out_5words);

/* Nested Symbols */
W_EXPORT int32_t w_anim_symbol_create(int32_t total_frames, int32_t loop_mode);
W_EXPORT int32_t w_anim_symbol_instantiate(int32_t sym_id, int32_t parent_track_idx, int32_t start_frame);

/* =========================================================================
 * Audio DSP & Synthesizer Core ABI
 * ========================================================================= */

enum {
    W_WAVE_SINE     = 0,
    W_WAVE_SAW      = 1,
    W_WAVE_SQUARE   = 2,
    W_WAVE_TRIANGLE = 3,
    W_WAVE_NOISE    = 4,
    W_WAVE_PWM      = 5
};

enum {
    W_FILTER_OFF       = 0,
    W_FILTER_LOWPASS   = 1,
    W_FILTER_HIGHPASS  = 2,
    W_FILTER_BANDPASS  = 3,
    W_FILTER_NOTCH     = 4,
    W_FILTER_PEAKING   = 5
};

enum {
    W_SFXR_COIN        = 0,
    W_SFXR_LASER       = 1,
    W_SFXR_EXPLOSION   = 2,
    W_SFXR_POWERUP     = 3,
    W_SFXR_HIT         = 4,
    W_SFXR_JUMP        = 5,
    W_SFXR_SELECT      = 6,
    W_SFXR_SYNTH       = 7
};

W_EXPORT void     w_audio_init(uint32_t sample_rate);
W_EXPORT void     w_audio_set_bpm(float bpm);
W_EXPORT float    w_audio_get_bpm(void);
W_EXPORT void     w_audio_set_master_vol(float vol);
W_EXPORT float    w_audio_get_master_vol(void);
W_EXPORT void     w_audio_note_on(uint32_t track_idx, uint32_t midi_note, float velocity);
W_EXPORT void     w_audio_note_off(uint32_t track_idx, uint32_t midi_note);
W_EXPORT void     w_audio_all_notes_off(uint32_t track_idx);
W_EXPORT void     w_audio_set_track_synth(uint32_t track_idx, uint32_t wave_type, float attack_s, float decay_s, float sustain_lvl, float release_s, float pulse_width);
W_EXPORT void     w_audio_set_track_filter(uint32_t track_idx, uint32_t filter_type, float cutoff_hz, float resonance, float gain_db);
W_EXPORT void     w_audio_set_track_fx(uint32_t track_idx, float delay_s, float delay_fb, float delay_mix, float reverb_size, float reverb_mix, float crush_bits, float dist_drive);
W_EXPORT void     w_audio_set_track_vol_pan(uint32_t track_idx, float volume, float pan);
W_EXPORT void     w_audio_trigger_sfxr(uint32_t preset_type, float volume);
W_EXPORT void     w_audio_render_block(uint32_t num_frames);
W_EXPORT float*   w_audio_get_buffer_l(void);
W_EXPORT float*   w_audio_get_buffer_r(void);
W_EXPORT uint32_t w_audio_export_wav(uint8_t *out_wav_buffer, uint32_t max_bytes, uint32_t total_frames);

/* =========================================================================
 * Native Vector Path & Bézier Rasterizer ABI
 * ========================================================================= */

enum {
    W_FILL_NONZERO  = 0,
    W_FILL_EVENODD  = 1
};

enum {
    W_CAP_BUTT   = 0,
    W_CAP_ROUND  = 1,
    W_CAP_SQUARE = 2
};

enum {
    W_JOIN_MITER = 0,
    W_JOIN_ROUND = 1,
    W_JOIN_BEVEL = 2
};

W_EXPORT void    w_path_begin(void);
W_EXPORT void    w_path_move_to(float x, float y);
W_EXPORT void    w_path_line_to(float x, float y);
W_EXPORT void    w_path_quad_to(float cx, float cy, float x, float y);
W_EXPORT void    w_path_cubic_to(float c1x, float c1y, float c2x, float c2y, float x, float y);
W_EXPORT void    w_path_close(void);
W_EXPORT int32_t w_path_fill(int32_t layer_idx, uint32_t color, int32_t fill_rule);
W_EXPORT int32_t w_path_stroke(int32_t layer_idx, uint32_t color, float line_width, int32_t cap_style, int32_t join_style);
W_EXPORT int32_t w_path_stroke_brush(int32_t layer_idx, uint32_t color, float base_size);

/* =========================================================================
 * Native Font & Glyph Engine ABI
 * ========================================================================= */

W_EXPORT int32_t w_font_draw_text(int32_t layer_idx, float x, float y, const char *text, float size, uint32_t color, float tracking, float line_height);
W_EXPORT int32_t w_font_draw_text_transform(int32_t layer_idx, float x, float y, const char *text, float size, uint32_t color, float tracking, float line_height, float rotation_deg, float scale_x, float scale_y, float pivot_x, float pivot_y, int32_t alignment);
W_EXPORT void    w_font_measure_text(const char *text, float size, float tracking, float *out_w_h);

/* =========================================================================
 * Surface Lifecycle & Buffer Queries
 * ========================================================================= */

W_EXPORT void      w_init(uint32_t width, uint32_t height);
W_EXPORT void      w_resize(uint32_t width, uint32_t height);
W_EXPORT void      w_force_composite(void);
W_EXPORT uint32_t* w_render(void);
W_EXPORT void      w_brush_set_param(int32_t param, int32_t val);
W_EXPORT int32_t   w_layer_create(int32_t width, int32_t height);
W_EXPORT void      w_layer_delete(int32_t idx);
W_EXPORT int32_t   w_get_selection_scratch_layer(void);
W_EXPORT uint32_t* get_layer_pixels(int32_t idx);
W_EXPORT uint32_t* get_composite_pixels(void);
W_EXPORT int32_t   get_width(void);
W_EXPORT int32_t   get_height(void);

#endif /* QUADRO_H */



