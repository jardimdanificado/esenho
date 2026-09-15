#ifndef ESENHO_H
#define ESENHO_H

/**
 * =========================================================================
 * Esenho WebAssembly Header (include/esenho.h)
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
    W_PARAM_TILT_ANGLE     = 41  /* stylus tilt controls brush angle/roundness: 0=off, 1=on */
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

W_EXPORT int32_t w_layer_resize(int32_t layer_idx, int32_t new_w, int32_t new_h, int32_t resample);
W_EXPORT int32_t w_layer_duplicate(int32_t layer_idx);
W_EXPORT uint32_t w_pick_color(int32_t x, int32_t y, int32_t sample_composite);
W_EXPORT void w_brush_stroke(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser);
W_EXPORT void w_brush_stroke_ext(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);

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

    int p = (v * (255 - s)) / 255;
    int q = (v * (255 - (s * rem) / 60)) / 255;
    int t = (v * (255 - (s * (60 - rem)) / 60)) / 255;

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
    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;
    uint32_t r, g, b;
    switch (mode) {
        case 1: // Multiply
            r = (sr * dr) / 255;
            g = (sg * dg) / 255;
            b = (sb * db) / 255;
            break;
        case 2: // Screen
            r = 255 - ((255 - sr) * (255 - dr)) / 255;
            g = 255 - ((255 - sg) * (255 - dg)) / 255;
            b = 255 - ((255 - sb) * (255 - db)) / 255;
            break;
        case 3: // Overlay
            r = (dr < 128) ? (2 * sr * dr) / 255 : 255 - (2 * (255 - sr) * (255 - dr)) / 255;
            g = (dg < 128) ? (2 * sg * dg) / 255 : 255 - (2 * (255 - sg) * (255 - dg)) / 255;
            b = (db < 128) ? (2 * sb * db) / 255 : 255 - (2 * (255 - sb) * (255 - db)) / 255;
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
    uint32_t eff_sa = (sa * alpha) / 255;
    if (eff_sa == 0) return dst;

    uint32_t da = (dst >> 24) & 0xFF;
    uint32_t inv_sa = 255 - eff_sa;

    uint32_t out_a = eff_sa + (da * inv_sa) / 255;
    if (max_alpha > 0 && out_a > max_alpha && da < max_alpha) {
        out_a = max_alpha;
    } else if (max_alpha > 0 && out_a > max_alpha && da >= max_alpha) {
        out_a = da;
    }
    if (out_a > 255) out_a = 255;
    if (out_a == 0) return dst;

    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;

    if (da == 0) {
        return (out_a << 24) | ((sb & 0xFF) << 16) | ((sg & 0xFF) << 8) | (sr & 0xFF);
    }

    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;
    uint32_t dst_factor = (da * inv_sa) / 255;

    uint32_t out_r = (sr * eff_sa + dr * dst_factor) / out_a;
    uint32_t out_g = (sg * eff_sa + dg * dst_factor) / out_a;
    uint32_t out_b = (sb * eff_sa + db * dst_factor) / out_a;

    if (out_r > 255) out_r = 255;
    if (out_g > 255) out_g = 255;
    if (out_b > 255) out_b = 255;

    return (out_a << 24) | ((out_b & 0xFF) << 16) | ((out_g & 0xFF) << 8) | (out_r & 0xFF);
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
        int gx = (tx % g_texture.width + g_texture.width) % g_texture.width;
        int gy = (ty % g_texture.height + g_texture.height) % g_texture.height;
        uint32_t p = g_texture.pixels[gy * g_texture.width + gx];
        uint32_t lum = ((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000;
        uint32_t ta = (p >> 24) & 0xFF;
        int factor = (lum * ta) / 255;
        if (tex_contrast != 100 && tex_contrast >= 0) {
            factor = 128 + ((factor - 128) * tex_contrast) / 100;
            if (factor < 0) factor = 0;
            if (factor > 255) factor = 255;
        }
        return (base_a * (uint32_t)factor) / 255;
    }
    if (mode <= 0) return base_a;
    uint32_t mod_a = base_a;
    if (mode == 1) { /* Paper grain */
        uint32_t n = ((tx * 1234567 + ty * 7654321) ^ (tx * ty * 13)) & 0xFF;
        int fiber = ((tx * 3 + ty * 5) % 17 < 3) ? 50 : 255;
        mod_a = (base_a * n * fiber) / (255 * 255);
    } else if (mode == 2) { /* Canvas weave */
        int pat = ((tx % 6 < 3) ^ (ty % 6 < 3)) ? 255 : 40;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 3) { /* Noise */
        uint32_t n = ((tx * 374761393 + ty * 668265263) ^ 0x5bf03635) & 0xFF;
        mod_a = (base_a * n) / 255;
    } else if (mode == 4) { /* Halftone dots */
        int dx = (tx % 8) - 4, dy = (ty % 8) - 4;
        int d2 = dx * dx + dy * dy;
        int pat = (d2 <= 5) ? 255 : 20;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 5) { /* Grid */
        int pat = (tx % 8 == 0 || ty % 8 == 0) ? 255 : 30;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 6) { /* Grunge */
        uint32_t n = ((tx / 4 * 101 + ty / 4 * 203) ^ (tx * 17 + ty * 31)) & 0xFF;
        int pat = n > 120 ? 255 : (n * 255 / 120);
        mod_a = (base_a * pat) / 255;
    } else if (mode == 7) { /* Hatch */
        int pat = ((tx + ty) % 6 == 0 || (tx + ty) % 6 == 1) ? 255 : 0;
        mod_a = (base_a * pat) / 255;
    }
    if (tex_contrast != 100 && tex_contrast >= 0 && base_a > 0) {
        int factor = (mod_a * 255) / base_a;
        factor = 128 + ((factor - 128) * tex_contrast) / 100;
        if (factor < 0) factor = 0;
        if (factor > 255) factor = 255;
        mod_a = (base_a * (uint32_t)factor) / 255;
    }
    return mod_a;
}

#endif /* ESENHO_H */
