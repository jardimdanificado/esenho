#ifndef QUADRO_EASING_H
#define QUADRO_EASING_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifndef W_EXPORT
#define W_EXPORT __attribute__((visibility("default")))
#endif

/**
 * =========================================================================
 * Quadro Easing & Curve Dynamics Engine
 * Freestanding C99 implementation with zero libc dependencies.
 * =========================================================================
 */

#ifdef __cplusplus
extern "C" {
#endif

enum {
    W_EASE_LINEAR       = 0,
    W_EASE_QUAD_IN      = 1,
    W_EASE_QUAD_OUT     = 2,
    W_EASE_QUAD_IN_OUT  = 3,
    W_EASE_CUBIC_IN     = 4,
    W_EASE_CUBIC_OUT    = 5,
    W_EASE_CUBIC_IN_OUT = 6,
    W_EASE_QUART_IN     = 7,
    W_EASE_QUART_OUT    = 8,
    W_EASE_QUART_IN_OUT = 9,
    W_EASE_QUINT_IN     = 10,
    W_EASE_QUINT_OUT    = 11,
    W_EASE_QUINT_IN_OUT = 12,
    W_EASE_SINE_IN      = 13,
    W_EASE_SINE_OUT     = 14,
    W_EASE_SINE_IN_OUT  = 15,
    W_EASE_EXPO_IN      = 16,
    W_EASE_EXPO_OUT     = 17,
    W_EASE_EXPO_IN_OUT  = 18,
    W_EASE_CIRC_IN      = 19,
    W_EASE_CIRC_OUT     = 20,
    W_EASE_CIRC_IN_OUT  = 21,
    W_EASE_BACK_IN      = 22,
    W_EASE_BACK_OUT     = 23,
    W_EASE_BACK_IN_OUT  = 24,
    W_EASE_ELASTIC_IN   = 25,
    W_EASE_ELASTIC_OUT  = 26,
    W_EASE_ELASTIC_IN_OUT = 27,
    W_EASE_BOUNCE_IN    = 28,
    W_EASE_BOUNCE_OUT   = 29,
    W_EASE_BOUNCE_IN_OUT = 30,
    W_EASE_SPRING       = 31,
    W_EASE_CUSTOM_BEZIER = 32
};

static inline float w_ease_sinf(float x) {
    const float PI = 3.14159265358979323846f;
    const float TWO_PI = 6.28318530717958647692f;
    while (x > PI) x -= TWO_PI;
    while (x < -PI) x += TWO_PI;
    float abs_x = x < 0.0f ? -x : x;
    float num = 16.0f * x * (PI - abs_x);
    float den = 5.0f * PI * PI - 4.0f * abs_x * (PI - abs_x);
    return den != 0.0f ? num / den : 0.0f;
}

static inline float w_ease_cosf(float x) {
    return w_ease_sinf(x + 1.5707963267948966f);
}

static inline float w_ease_sqrtf(float x) {
    if (x <= 0.0f) return 0.0f;
    union { float f; uint32_t i; } conv;
    conv.f = x;
    conv.i = 0x1fbd1df5 + (conv.i >> 1);
    float y = conv.f;
    y = 0.5f * (y + x / y);
    y = 0.5f * (y + x / y);
    return y;
}

static inline float w_ease_exp2(float x) {
    /* Fast 2^x approximation: 2^(int + frac) */
    if (x < -16.0f) return 0.0f;
    if (x > 16.0f) x = 16.0f;
    int i = (int)x;
    if (x < 0.0f && (float)i != x) i--;
    float f = x - (float)i;
    /* 2^f approx for f in [0, 1] using polynomial */
    float p = 1.0f + f * (0.69300383f + f * (0.24154981f + f * 0.05174429f));
    union { float f; uint32_t i; } res;
    res.i = (uint32_t)((i + 127) << 23);
    return res.f * p;
}

static inline float w_ease_bounce_out(float t) {
    const float n1 = 7.5625f;
    const float d1 = 2.75f;
    if (t < 1.0f / d1) {
        return n1 * t * t;
    } else if (t < 2.0f / d1) {
        t -= 1.5f / d1;
        return n1 * t * t + 0.75f;
    } else if (t < 2.5f / d1) {
        t -= 2.25f / d1;
        return n1 * t * t + 0.9375f;
    } else {
        t -= 2.625f / d1;
        return n1 * t * t + 0.984375f;
    }
}

/** Evaluates standard parametric easing curves for t in [0.0, 1.0] */
static inline float w_easing_eval(int32_t ease_type, float t) {
    if (t <= 0.0f) return 0.0f;
    if (t >= 1.0f) return 1.0f;

    const float PI = 3.14159265358979323846f;
    const float c1 = 1.70158f;
    const float c2 = c1 * 1.525f;
    const float c3 = c1 + 1.0f;
    const float c4 = (2.0f * PI) / 3.0f;
    const float c5 = (2.0f * PI) / 4.5f;

    switch (ease_type) {
        case W_EASE_LINEAR:       return t;
        case W_EASE_QUAD_IN:      return t * t;
        case W_EASE_QUAD_OUT:     return 1.0f - (1.0f - t) * (1.0f - t);
        case W_EASE_QUAD_IN_OUT:  return t < 0.5f ? 2.0f * t * t : 1.0f - ((-2.0f * t + 2.0f) * (-2.0f * t + 2.0f)) / 2.0f;
        case W_EASE_CUBIC_IN:     return t * t * t;
        case W_EASE_CUBIC_OUT:    { float inv = 1.0f - t; return 1.0f - inv * inv * inv; }
        case W_EASE_CUBIC_IN_OUT: {
            if (t < 0.5f) return 4.0f * t * t * t;
            float inv = -2.0f * t + 2.0f;
            return 1.0f - (inv * inv * inv) / 2.0f;
        }
        case W_EASE_QUART_IN:     return t * t * t * t;
        case W_EASE_QUART_OUT:    { float inv = 1.0f - t; return 1.0f - inv * inv * inv * inv; }
        case W_EASE_QUART_IN_OUT: {
            if (t < 0.5f) return 8.0f * t * t * t * t;
            float inv = -2.0f * t + 2.0f;
            return 1.0f - (inv * inv * inv * inv) / 2.0f;
        }
        case W_EASE_QUINT_IN:     return t * t * t * t * t;
        case W_EASE_QUINT_OUT:    { float inv = 1.0f - t; return 1.0f - inv * inv * inv * inv * inv; }
        case W_EASE_QUINT_IN_OUT: {
            if (t < 0.5f) return 16.0f * t * t * t * t * t;
            float inv = -2.0f * t + 2.0f;
            return 1.0f - (inv * inv * inv * inv * inv) / 2.0f;
        }
        case W_EASE_SINE_IN:      return 1.0f - w_ease_cosf((t * PI) * 0.5f);
        case W_EASE_SINE_OUT:     return w_ease_sinf((t * PI) * 0.5f);
        case W_EASE_SINE_IN_OUT:  return -(w_ease_cosf(PI * t) - 1.0f) * 0.5f;
        case W_EASE_EXPO_IN:      return w_ease_exp2(10.0f * t - 10.0f);
        case W_EASE_EXPO_OUT:     return 1.0f - w_ease_exp2(-10.0f * t);
        case W_EASE_EXPO_IN_OUT:  return t < 0.5f ? w_ease_exp2(20.0f * t - 10.0f) * 0.5f : (2.0f - w_ease_exp2(-20.0f * t + 10.0f)) * 0.5f;
        case W_EASE_CIRC_IN:      return 1.0f - w_ease_sqrtf(1.0f - t * t);
        case W_EASE_CIRC_OUT:     return w_ease_sqrtf(1.0f - (t - 1.0f) * (t - 1.0f));
        case W_EASE_CIRC_IN_OUT:  return t < 0.5f ? (1.0f - w_ease_sqrtf(1.0f - (2.0f * t) * (2.0f * t))) * 0.5f : (w_ease_sqrtf(1.0f - (-2.0f * t + 2.0f) * (-2.0f * t + 2.0f)) + 1.0f) * 0.5f;
        case W_EASE_BACK_IN:      return c3 * t * t * t - c1 * t * t;
        case W_EASE_BACK_OUT:     { float inv = t - 1.0f; return 1.0f + c3 * inv * inv * inv + c1 * inv * inv; }
        case W_EASE_BACK_IN_OUT:  return t < 0.5f ? ((2.0f * t) * (2.0f * t) * ((c2 + 1.0f) * 2.0f * t - c2)) * 0.5f : (((2.0f * t - 2.0f) * (2.0f * t - 2.0f) * ((c2 + 1.0f) * (t * 2.0f - 2.0f) + c2) + 2.0f)) * 0.5f;
        case W_EASE_ELASTIC_IN:   return -w_ease_exp2(10.0f * t - 10.0f) * w_ease_sinf((t * 10.0f - 10.75f) * c4);
        case W_EASE_ELASTIC_OUT:  return w_ease_exp2(-10.0f * t) * w_ease_sinf((t * 10.0f - 0.75f) * c4) + 1.0f;
        case W_EASE_ELASTIC_IN_OUT: {
            return t < 0.5f ? -(w_ease_exp2(20.0f * t - 10.0f) * w_ease_sinf((20.0f * t - 11.125f) * c5)) * 0.5f
                            : (w_ease_exp2(-20.0f * t + 10.0f) * w_ease_sinf((20.0f * t - 11.125f) * c5)) * 0.5f + 1.0f;
        }
        case W_EASE_BOUNCE_IN:    return 1.0f - w_ease_bounce_out(1.0f - t);
        case W_EASE_BOUNCE_OUT:   return w_ease_bounce_out(t);
        case W_EASE_BOUNCE_IN_OUT: return t < 0.5f ? (1.0f - w_ease_bounce_out(1.0f - 2.0f * t)) * 0.5f : (1.0f + w_ease_bounce_out(2.0f * t - 1.0f)) * 0.5f;
        case W_EASE_SPRING:       return 1.0f - w_ease_exp2(-8.0f * t) * w_ease_cosf(12.0f * t);
        default:                  return t;
    }
}

/** Evaluates custom 4-point cubic Bézier easing curve with control points (x1, y1), (x2, y2) */
static inline float w_bezier_easing_eval(float x1, float y1, float x2, float y2, float t) {
    if (t <= 0.0f) return 0.0f;
    if (t >= 1.0f) return 1.0f;

    /* Newton-Raphson to find parameter u such that Bx(u) == t */
    float u = t;
    for (int i = 0; i < 8; i++) {
        float u_inv = 1.0f - u;
        float bx = 3.0f * u_inv * u_inv * u * x1 + 3.0f * u_inv * u * u * x2 + u * u * u;
        float err = bx - t;
        if (err < 1e-5f && err > -1e-5f) break;
        float dbx = 3.0f * u_inv * u_inv * x1 + 6.0f * u_inv * u * (x2 - x1) + 3.0f * u * u * (1.0f - x2);
        if (dbx == 0.0f) break;
        u -= err / dbx;
        if (u < 0.0f) { u = 0.0f; break; }
        if (u > 1.0f) { u = 1.0f; break; }
    }

    float u_inv = 1.0f - u;
    return 3.0f * u_inv * u_inv * u * y1 + 3.0f * u_inv * u * u * y2 + u * u * u;
}

/** Evaluates an animated property from start_val to end_val with easing */
static inline float w_anim_evaluate_property(float start_val, float end_val, float t, int32_t ease_type) {
    float eased_t = w_easing_eval(ease_type, t);
    return start_val + (end_val - start_val) * eased_t;
}

/** Evaluates an animated property with custom cubic Bézier control points */
static inline float w_anim_evaluate_property_bezier(float start_val, float end_val, float t, float x1, float y1, float x2, float y2) {
    float eased_t = w_bezier_easing_eval(x1, y1, x2, y2, t);
    return start_val + (end_val - start_val) * eased_t;
}

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_EASING_H */
