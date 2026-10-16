/**
 * =========================================================================
 * Aurora Borealis & Geomagnetic Curtains (aurora_borealis.c)
 *
 * Atmospheric geomagnetic ribbon & ionospheric emission simulation in C99:
 * - Multi-layered waving auroral curtains folded by solar wind turbulence
 * - Spectral atmospheric altitude transitions:
 *   Atomic oxygen emerald green (557.7 nm) -> Nitrogen violet/magenta (427.8 nm) -> High crimson
 * - Longitudinal ray folds with additive plasma radiance
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_curtain_height = 80; /* 20..150: Curtain altitude extension */
static int _param_wave_speed = 60;     /* 10..100: Solar wind turbulence */
static int _param_violet_tint = 50;    /* 0..100: Nitrogen magenta glow */
static int _param_ray_density = 75;    /* 10..100: Fine vertical ray filaments */

static float _phase = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"aurora_borealis\","
        "\"title\":\"Aurora Borealis Curtains\","
        "\"category\":\"Atmospheric\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"inputs\":[\"size\",\"pressure\",\"angle\",\"speed\",\"color\",\"spacing\",\"params\"],"
        "\"params\":["
            "{\"name\":\"Curtain Height\",\"min\":20,\"max\":150,\"default\":80,\"unit\":\"px\"},"
            "{\"name\":\"Solar Wind Flutter\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Nitrogen Violet\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Ray Density\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

uint32_t w_brush_get_inputs(void) {
    return W_BRUSH_INPUT_SIZE | W_BRUSH_INPUT_PRESSURE | W_BRUSH_INPUT_ANGLE | W_BRUSH_INPUT_SPEED | W_BRUSH_INPUT_COLOR | W_BRUSH_INPUT_SPACING | W_BRUSH_INPUT_PARAMS;
}

void w_brush_init(int canvas_w, int canvas_h) {
    _phase = 0.0f;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_curtain_height = val; break;
        case 1: _param_wave_speed = val; break;
        case 2: _param_violet_tint = val; break;
        case 3: _param_ray_density = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _phase = (x * 0.02f) + (y * 0.03f);
    w_brush_srand(0xA0B0C0D0 ^ (uint32_t)(x * 53.0f + y * 71.0f));
}

void w_brush_stroke_end(void) {}

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
    float curtain_h = (float)_param_curtain_height * eff_p;
    float flutter = (float)_param_wave_speed * 0.015f;
    float violet_mix = (float)_param_violet_tint * 0.01f;
    float ray_freq = 0.15f + ((float)_param_ray_density * 0.003f);

    _phase += 0.08f * (1.0f + speed * 0.02f);

    float reach_r = radius + curtain_h;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(reach_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (reach_r * reach_r);
    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    /* Normal perpendicular to stroke */
    float norm_x = -sin_a;
    float norm_y = cos_a;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > reach_r * reach_r) continue;

            /* Project onto stroke tangent and normal directions */
            float proj_tang = dx * cos_a + dy * sin_a;
            float proj_norm = dx * norm_x + dy * norm_y;

            /* Upward curtain displacement */
            float height_ratio = (proj_norm + radius * 0.5f) / (curtain_h + radius);
            if (height_ratio < 0.0f) height_ratio = 0.0f;
            if (height_ratio > 1.0f) height_ratio = 1.0f;

            /* Harmonic waving curtain ripple */
            float wave1 = w_sinf(proj_tang * 0.08f + _phase);
            float wave2 = w_sinf(proj_tang * 0.22f - _phase * 1.4f) * 0.4f;
            float curtain_offset = (wave1 + wave2) * radius * 0.4f * flutter;

            float dist_to_ribbon = proj_norm - curtain_offset;
            float ribbon_thick = radius * (0.35f + height_ratio * 0.8f);
            float rib_factor = 1.0f - (dist_to_ribbon * dist_to_ribbon) / (ribbon_thick * ribbon_thick + 1.0f);
            if (rib_factor <= 0.0f) continue;

            /* Vertical ray filaments */
            float ray = 0.7f + 0.3f * w_sinf((proj_tang + (float)x * 0.3f) * ray_freq);

            /* Cubic Hermite falloff at boundary */
            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float intensity = rib_factor * ray * falloff * eff_p;
            if (intensity <= 0.01f) continue;

            /* Spectral color ramp: Bottom emerald green, mid teal, top violet/magenta */
            uint32_t r, g, b;
            if (height_ratio < 0.45f) {
                float t = height_ratio / 0.45f;
                r = (uint32_t)(10.0f + t * 40.0f);
                g = (uint32_t)(230.0f + t * 25.0f);
                b = (uint32_t)(120.0f + t * 110.0f);
            } else {
                float t = (height_ratio - 0.45f) / 0.55f;
                r = (uint32_t)(50.0f + t * (160.0f + violet_mix * 45.0f));
                g = (uint32_t)(255.0f * (1.0f - t * 0.65f));
                b = (uint32_t)(230.0f + t * 25.0f);
            }
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(intensity * 240.0f);
            if (alpha > 255) alpha = 255;

            uint32_t aur_col = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > alpha) ? da - alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_add(aur_col, row[x], alpha);
            }
        }
    }
}
