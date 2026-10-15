/**
 * =========================================================================
 * Gecko Fibrillar Van der Waals Adhesion Setae (biomimetic_gecko_setae.c)
 *
 * Micro-fibrillar dry adhesion & shear-induced nanostructures in C99:
 * - Millions of microscopic keratin setae branching into flexible spatula pads
 * - Frictional adhesion shear alignment oriented along the pen movement vector
 * - Van der Waals contact area footprint modulation with stylus pressure
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_setae_density = 75;  /* 20..100: Micro-fibril hair density */
static int _param_spatula_spread = 60; /* 10..100: Branching spatula fanning */
static int _param_adhesion_grip = 85;  /* 20..100: Van der Waals contact saturation */
static int _param_shear_angle = 30;    /* 0..60: Fibril drag rake angle */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"biomimetic_gecko_setae\","
        "\"title\":\"Gecko Adhesion Setae\","
        "\"category\":\"Biomimetics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Setae Density\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Spatula Spread\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Adhesion Grip\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Shear Rake Angle\",\"min\":0,\"max\":60,\"default\":30,\"unit\":\"deg\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_setae_density = val; break;
        case 1: _param_spatula_spread = val; break;
        case 2: _param_adhesion_grip = val; break;
        case 3: _param_shear_angle = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x6EC00000 ^ (uint32_t)(x * 67.0f + y * 71.0f));
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
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    float shear_rake = (float)_param_shear_angle * 0.0174532925f;
    float cos_rake = w_cosf(rad_ang + shear_rake);
    float sin_rake = w_sinf(rad_ang + shear_rake);

    float setae_freq = 0.25f + ((float)_param_setae_density * 0.005f);
    float grip_k = (float)_param_adhesion_grip * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    uint32_t cr = w_color_get_r(color);
    uint32_t cg = w_color_get_g(color);
    uint32_t cb = w_color_get_b(color);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Continuous coordinates along the shear rake direction */
            float proj_para = dx * cos_rake + dy * sin_rake;
            float proj_perp = -dx * sin_rake + dy * cos_rake;

            /* Microscopic fibril filament lines */
            float fibril_wave = w_sinf(proj_perp * setae_freq * 6.2831853f);
            float fibril_line = fibril_wave * fibril_wave * fibril_wave * fibril_wave;

            /* Spatular adhesion tip footprint */
            float spatula_tip = w_sinf(proj_para * (setae_freq * 0.5f) * 6.2831853f);
            spatula_tip = (spatula_tip > 0.0f) ? (spatula_tip * spatula_tip) : 0.0f;

            float adhesion_density = fibril_line * (0.6f + 0.4f * spatula_tip) * grip_k;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float total_alpha = adhesion_density * falloff * eff_p;
            if (total_alpha <= 0.01f) continue;

            uint32_t alpha = (uint32_t)(total_alpha * 240.0f);
            if (alpha > 255) alpha = 255;

            /* Organic keratin shading */
            uint32_t r = (uint32_t)((float)cr * (0.8f + 0.3f * spatula_tip));
            uint32_t g = (uint32_t)((float)cg * (0.8f + 0.3f * spatula_tip));
            uint32_t b = (uint32_t)((float)cb * (0.8f + 0.3f * spatula_tip));
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t gecko_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(gecko_c, row[x], alpha);
            }
        }
    }
}
