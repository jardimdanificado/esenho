#ifndef QUADRO_COLOR_OKLAB_H
#define QUADRO_COLOR_OKLAB_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifndef W_EXPORT
#define W_EXPORT __attribute__((visibility("default")))
#endif

/**
 * =========================================================================
 * Quadro Oklab & Oklch Perceptual Color Engine
 * Freestanding C99 implementation with zero libc dependencies.
 * =========================================================================
 */

#ifdef __cplusplus
extern "C" {
#endif

/** Freestanding float absolute value */
static inline float w_fabsf(float x) {
    return x < 0.0f ? -x : x;
}

/** Freestanding cube root approximation using Halley's method */
static inline float w_cbrtf(float x) {
    if (x == 0.0f) return 0.0f;
    float s = (x < 0.0f) ? -1.0f : 1.0f;
    float a = w_fabsf(x);

    /* Initial bit-hack guess for float cube root */
    union { float f; uint32_t i; } u;
    u.f = a;
    u.i = u.i / 3 + 0x2a514067;
    float y = u.f;

    /* Two Halley iterations for cubic convergence to ~24-bit float precision */
    float y3 = y * y * y;
    y = y * (y3 + 2.0f * a) / (2.0f * y3 + a);
    y3 = y * y * y;
    y = y * (y3 + 2.0f * a) / (2.0f * y3 + a);

    return s * y;
}

/** Linear sRGB gamma transfer approximation */
static inline float w_srgb_to_linear(float c) {
    if (c <= 0.04045f) {
        return c / 12.92f;
    }
    float v = (c + 0.055f) / 1.055f;
    /* v^2.4 approx: v^2 * sqrt(v * sqrt(v)) */
    return v * v * (0.83f + 0.17f * v);
}

static inline float w_linear_to_srgb(float c) {
    if (c <= 0.0031308f) {
        return c * 12.92f;
    }
    /* c^(1/2.4) approx: c^(5/12) */
    float r = w_cbrtf(c);
    float s = r > 0.0f ? 1.055f * r - 0.055f : 0.0f;
    return s < 0.0f ? 0.0f : (s > 1.0f ? 1.0f : s);
}

/** Converts 32-bit ARGB (0xAARRGGBB) to Oklab (L: 0..1, a: -0.4..0.4, b: -0.4..0.4) */
static inline void w_color_rgb_to_oklab(uint32_t argb, float *out_lab) {
    float r = w_srgb_to_linear(((argb >> 16) & 0xFF) / 255.0f);
    float g = w_srgb_to_linear(((argb >> 8) & 0xFF) / 255.0f);
    float b = w_srgb_to_linear((argb & 0xFF) / 255.0f);

    float l = w_cbrtf(0.4122214708f * r + 0.5363325363f * g + 0.0514459929f * b);
    float m = w_cbrtf(0.2119034982f * r + 0.6806995451f * g + 0.1073969566f * b);
    float s = w_cbrtf(0.0883024619f * r + 0.2817188376f * g + 0.6299787005f * b);

    out_lab[0] = 0.2104542553f * l + 0.7936177850f * m - 0.0040720468f * s;
    out_lab[1] = 1.9779984951f * l - 2.4285922050f * m + 0.4505937099f * s;
    out_lab[2] = 0.0259040371f * l + 0.7827717662f * m - 0.8086757660f * s;
}

/** Converts Oklab (L, a, b) to 32-bit ARGB (0xAARRGGBB) */
static inline uint32_t w_color_oklab_to_rgb(float L, float a, float b, uint32_t alpha) {
    float l = L + 0.3963377774f * a + 0.2158037573f * b;
    float m = L - 0.1055613458f * a - 0.0638541728f * b;
    float s = L - 0.0894841775f * a - 1.2914855480f * b;

    float l3 = l * l * l;
    float m3 = m * m * m;
    float s3 = s * s * s;

    float r = +4.0767434770f * l3 - 3.3077115913f * m3 + 0.2309699292f * s3;
    float g = -1.2684380046f * l3 + 2.6097574011f * m3 - 0.3413193965f * s3;
    float bl = -0.0041960863f * l3 - 0.7034186147f * m3 + 1.7076147010f * s3;

    if (r < 0.0f) r = 0.0f; else if (r > 1.0f) r = 1.0f;
    if (g < 0.0f) g = 0.0f; else if (g > 1.0f) g = 1.0f;
    if (bl < 0.0f) bl = 0.0f; else if (bl > 1.0f) bl = 1.0f;

    uint32_t ir = (uint32_t)(w_linear_to_srgb(r) * 255.0f + 0.5f);
    uint32_t ig = (uint32_t)(w_linear_to_srgb(g) * 255.0f + 0.5f);
    uint32_t ib = (uint32_t)(w_linear_to_srgb(bl) * 255.0f + 0.5f);

    if (ir > 255) ir = 255;
    if (ig > 255) ig = 255;
    if (ib > 255) ib = 255;
    if (alpha > 255) alpha = 255;

    return (alpha << 24) | (ir << 16) | (ig << 8) | ib;
}

/** Converts 32-bit ARGB to Oklch (L: 0..1, C: 0..0.4, h_deg: 0..360) */
static inline void w_color_rgb_to_oklch(uint32_t argb, float *out_lch) {
    float lab[3];
    w_color_rgb_to_oklab(argb, lab);
    float L = lab[0];
    float a = lab[1];
    float b = lab[2];

    /* C = sqrt(a^2 + b^2) */
    float c2 = a * a + b * b;
    union { float f; uint32_t i; } conv;
    conv.f = c2;
    conv.i = 0x1fbd1df5 + (conv.i >> 1);
    float C = conv.f;
    if (C > 0.0f) {
        C = 0.5f * (C + c2 / C);
        C = 0.5f * (C + c2 / C);
    }

    /* Fast angle in degrees */
    float h = 0.0f;
    if (C > 1e-6f) {
        /* Approximate atan2 in radians then to deg */
        const float PI = 3.14159265358979323846f;
        float abs_b = b < 0.0f ? -b : b;
        float abs_a = a < 0.0f ? -a : a;
        float angle;
        if (abs_a >= abs_b) {
            float r = abs_b / (abs_a + 1e-7f);
            angle = r * (0.97239411f - 0.19194795f * r * r);
        } else {
            float r = abs_a / (abs_b + 1e-7f);
            angle = (PI * 0.5f) - r * (0.97239411f - 0.19194795f * r * r);
        }
        if (a < 0.0f && b >= 0.0f) angle = PI - angle;
        else if (a < 0.0f && b < 0.0f) angle = -PI + angle;
        else if (a >= 0.0f && b < 0.0f) angle = -angle;

        h = (angle * 180.0f) / PI;
        if (h < 0.0f) h += 360.0f;
    }

    out_lch[0] = L;
    out_lch[1] = C;
    out_lch[2] = h;
}

/** Converts Oklch (L, C, h_deg) to 32-bit ARGB */
static inline uint32_t w_color_oklch_to_rgb(float L, float C, float h_deg, uint32_t alpha) {
    const float PI = 3.14159265358979323846f;
    while (h_deg < 0.0f) h_deg += 360.0f;
    while (h_deg >= 360.0f) h_deg -= 360.0f;
    float rad = (h_deg * PI) / 180.0f;

    /* Freestanding sin & cos */
    float abs_x = rad < 0.0f ? -rad : rad;
    float num_s = 16.0f * rad * (PI - abs_x);
    float den_s = 5.0f * PI * PI - 4.0f * abs_x * (PI - abs_x);
    float sin_h = den_s != 0.0f ? num_s / den_s : 0.0f;

    float rad_c = rad + 1.5707963267948966f;
    if (rad_c > PI) rad_c -= 2.0f * PI;
    float abs_xc = rad_c < 0.0f ? -rad_c : rad_c;
    float num_c = 16.0f * rad_c * (PI - abs_xc);
    float den_c = 5.0f * PI * PI - 4.0f * abs_xc * (PI - abs_xc);
    float cos_h = den_c != 0.0f ? num_c / den_c : 0.0f;

    float a = C * cos_h;
    float b = C * sin_h;

    return w_color_oklab_to_rgb(L, a, b, alpha);
}

/** Perceptually uniform gradient interpolation in Oklab color space */
static inline uint32_t w_color_oklab_lerp(uint32_t col_a, uint32_t col_b, float t) {
    if (t <= 0.0f) return col_a;
    if (t >= 1.0f) return col_b;

    float lab_a[3], lab_b[3];
    w_color_rgb_to_oklab(col_a, lab_a);
    w_color_rgb_to_oklab(col_b, lab_b);

    float L = lab_a[0] + (lab_b[0] - lab_a[0]) * t;
    float a = lab_a[1] + (lab_b[1] - lab_a[1]) * t;
    float b = lab_a[2] + (lab_b[2] - lab_a[2]) * t;

    uint32_t aa = (col_a >> 24) & 0xFF;
    uint32_t ba = (col_b >> 24) & 0xFF;
    uint32_t alpha = (uint32_t)(aa + (ba - aa) * t + 0.5f);

    return w_color_oklab_to_rgb(L, a, b, alpha);
}

/** Harmony types */
enum {
    W_HARMONY_COMPLEMENTARY       = 0,
    W_HARMONY_ANALOGOUS           = 1,
    W_HARMONY_TRIADIC             = 2,
    W_HARMONY_TETRADIC            = 3,
    W_HARMONY_SPLIT_COMPLEMENTARY = 4,
    W_HARMONY_MONOCHROMATIC       = 5
};

/** Generates harmonious color palette from a base color in Oklch space */
static inline int32_t w_color_generate_harmony(uint32_t base_color, int32_t harmony_type, uint32_t *out_palette, int32_t max_count) {
    if (!out_palette || max_count <= 0) return 0;

    float lch[3];
    w_color_rgb_to_oklch(base_color, lch);
    float L = lch[0];
    float C = lch[1];
    float H = lch[2];
    uint32_t alpha = (base_color >> 24) & 0xFF;

    out_palette[0] = base_color;
    int count = 1;

    switch (harmony_type) {
        case W_HARMONY_COMPLEMENTARY:
            if (max_count > 1) {
                out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 180.0f, alpha);
            }
            break;

        case W_HARMONY_ANALOGOUS:
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H - 30.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 30.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H - 60.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 60.0f, alpha);
            break;

        case W_HARMONY_TRIADIC:
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 120.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 240.0f, alpha);
            break;

        case W_HARMONY_TETRADIC:
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 90.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 180.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 270.0f, alpha);
            break;

        case W_HARMONY_SPLIT_COMPLEMENTARY:
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 150.0f, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L, C, H + 210.0f, alpha);
            break;

        case W_HARMONY_MONOCHROMATIC:
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L > 0.8f ? L - 0.2f : L + 0.2f, C * 0.7f, H, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L < 0.3f ? L + 0.3f : L - 0.3f, C * 1.2f, H, alpha);
            if (count < max_count) out_palette[count++] = w_color_oklch_to_rgb(L > 0.5f ? L - 0.4f : L + 0.4f, C * 0.4f, H, alpha);
            break;

        default:
            break;
    }

    return count;
}

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_COLOR_OKLAB_H */
