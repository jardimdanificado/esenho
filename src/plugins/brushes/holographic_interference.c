/**
 * =========================================================================
 * Optical Thin-Film Holographic Interference (holographic_interference.c)
 *
 * Microscopic diffraction grating & thin-film wave interference in C99:
 * - Solves constructive / destructive wave phase: $2 \pi d / \lambda$
 * - Dynamic angle-resolved chromatic iridescence (rainbow sheen)
 * - Prismatic foil specular reflections responding to stroke direction
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_film_thick = 65;     /* 20..150: Nanometer film thickness */
static int _param_grating_freq = 70;   /* 20..120: Micro-grating line density */
static int _param_iridescence = 85;    /* 20..100: Rainbow color saturation */
static int _param_metallic_foil = 60;  /* 0..100: Specular silver/gold reflectivity */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"holographic_interference\","
        "\"title\":\"Diffraction Rainbow Foil\","
        "\"category\":\"Optics\","
        "\"spacing\":0.05,"
        "\"minRadius\":5,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Film Thickness\",\"min\":20,\"max\":150,\"default\":65,\"unit\":\"nm\"},"
            "{\"name\":\"Grating Frequency\",\"min\":20,\"max\":120,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Iridescence Saturation\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Foil Reflectivity\",\"min\":0,\"max\":100,\"default\":60,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_film_thick = val; break;
        case 1: _param_grating_freq = val; break;
        case 2: _param_iridescence = val; break;
        case 3: _param_metallic_foil = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x13374010 ^ (uint32_t)(x * 59.0f + y * 67.0f));
}

void w_brush_stroke_end(void) {}

/* Fast continuous rainbow spectrum approximation */
static inline void spectral_rainbow(float phase, float sat, float foil, uint32_t *out_r, uint32_t *out_g, uint32_t *out_b) {
    float r = w_sinf(phase);
    float g = w_sinf(phase + 2.0943951f); /* + 120 deg */
    float b = w_sinf(phase + 4.1887902f); /* + 240 deg */

    /* Map to [0, 1] */
    r = 0.5f + 0.5f * r;
    g = 0.5f + 0.5f * g;
    b = 0.5f + 0.5f * b;

    /* Blend with metallic silver/chrome base */
    float base_lum = 0.85f * foil;
    r = (r * sat + (1.0f - sat) * 0.5f) * (1.0f - foil * 0.4f) + base_lum;
    g = (g * sat + (1.0f - sat) * 0.5f) * (1.0f - foil * 0.4f) + base_lum;
    b = (b * sat + (1.0f - sat) * 0.5f) * (1.0f - foil * 0.4f) + base_lum;

    if (r > 1.0f) r = 1.0f;
    if (g > 1.0f) g = 1.0f;
    if (b > 1.0f) b = 1.0f;

    *out_r = (uint32_t)(r * 255.0f);
    *out_g = (uint32_t)(g * 255.0f);
    *out_b = (uint32_t)(b * 255.0f);
}

void w_brush_render_dab(
    uint32_t *pixels,
    int canvas_w,
    int canvas_h,
    float cx,
    float cy,
    float radius,
    float pressure,
    float angle_deg,
    float speed,
    uint32_t color,
    int is_eraser
) {
    if (!pixels || canvas_w <= 0 || canvas_h <= 0 || radius <= 0.5f) return;

    float eff_p = (pressure > 0.02f) ? pressure : 0.5f;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (radius * radius);
    float grating_scale = 0.08f + ((float)_param_grating_freq * 0.002f);
    float film_d = (float)_param_film_thick * 0.04f;
    float sat = (float)_param_iridescence * 0.01f;
    float foil = (float)_param_metallic_foil * 0.01f;

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Continuous space coordinates for micro-grating */
            float proj_t = (float)x * cos_a + (float)y * sin_a;
            float proj_n = -(float)x * sin_a + (float)y * cos_a;

            /* Optical phase calculation */
            float opt_phase = (proj_t * grating_scale) + (proj_n * 0.03f) + film_d;

            uint32_t r, g, b;
            spectral_rainbow(opt_phase, sat, foil, &r, &g, &b);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float intensity = falloff * eff_p;
            if (intensity <= 0.01f) continue;

            uint32_t alpha = (uint32_t)(intensity * 235.0f);
            if (alpha > 255) alpha = 255;

            uint32_t holo_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(holo_c, row[x], alpha);
            }
        }
    }
}
