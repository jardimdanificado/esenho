/**
 * =========================================================================
 * Avian Peacock Feather Eyespot & Photonic Barbules (peacock_feather_barbules.c)
 *
 * Biological 2D photonic crystal nanostructures & structural color in C99:
 * - Melanin rod periodic lattice producing angle-dependent Bragg interference
 * - Concentric structural ocellus eyespot zones:
 *   1. Deep velvet indigo/ultramarine pupil core
 *   2. Brilliant cyan/turquoise structural ring
 *   3. Warm iridescent bronze/gold specular halo
 *   4. Radiant emerald green outer barbule fringe rays
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_ocellus_size = 65;   /* 20..100: Central eyespot diameter % */
static int _param_barbule_density = 75;/* 20..100: Radial feather barbule frequency */
static int _param_photonic_bragg = 85; /* 20..100: Structural color saturation */
static int _param_bronze_halo = 70;    /* 10..100: Golden-bronze transition ring */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"peacock_feather_barbules\","
        "\"title\":\"Peacock Feather Eyespot\","
        "\"category\":\"Photonic Bio\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Eyespot Diameter\",\"min\":20,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Barbule Density\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Photonic Vibrance\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Bronze Halo\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_ocellus_size = val; break;
        case 1: _param_barbule_density = val; break;
        case 2: _param_photonic_bragg = val; break;
        case 3: _param_bronze_halo = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xFEA70000 ^ (uint32_t)(x * 53.0f + y * 59.0f));
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

    float eye_r = radius * ((float)_param_ocellus_size * 0.01f);
    float n_barbs = 18.0f + ((float)_param_barbule_density * 0.4f);
    float bragg_k = (float)_param_photonic_bragg * 0.01f;
    float bronze_k = (float)_param_bronze_halo * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

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

            float r = w_sqrtf(dist_sq);
            if (r < 0.001f) continue;

            /* Radial feather barbule rays */
            float theta = w_sinf(dx / r);
            float barb_wave = w_sinf(theta * n_barbs);
            float barb_ray = 0.75f + 0.25f * (barb_wave * barb_wave);

            /* Concentric structural eyespot color zoning */
            float norm_r = r / (eye_r + 0.1f);

            uint32_t r_val, g_val, b_val;

            if (norm_r < 0.35f) {
                /* Zone 1: Deep velvet indigo / ultramarine pupil core */
                float t = norm_r / 0.35f;
                r_val = (uint32_t)(15.0f + 25.0f * t);
                g_val = (uint32_t)(10.0f + 40.0f * t);
                b_val = (uint32_t)(90.0f + 140.0f * t);
            } else if (norm_r < 0.65f) {
                /* Zone 2: Brilliant cyan / turquoise structural ring */
                float t = (norm_r - 0.35f) / 0.30f;
                r_val = (uint32_t)(40.0f * (1.0f - t));
                g_val = (uint32_t)(180.0f + 70.0f * t);
                b_val = (uint32_t)(230.0f + 25.0f * (1.0f - t));
            } else if (norm_r < 0.95f) {
                /* Zone 3: Golden-bronze transition halo */
                float t = (norm_r - 0.65f) / 0.30f;
                r_val = (uint32_t)((180.0f + 70.0f * t) * bronze_k);
                g_val = (uint32_t)((130.0f + 40.0f * t) * bronze_k);
                b_val = (uint32_t)(30.0f * (1.0f - t));
            } else {
                /* Zone 4: Emerald green outer barbule rays */
                float t = (r - eye_r) / (radius - eye_r + 0.1f);
                r_val = (uint32_t)(20.0f + 40.0f * (1.0f - t));
                g_val = (uint32_t)(190.0f + 65.0f * (1.0f - t));
                b_val = (uint32_t)(60.0f + 50.0f * (1.0f - t));
            }

            r_val = (uint32_t)((float)r_val * barb_ray * bragg_k);
            g_val = (uint32_t)((float)g_val * barb_ray * bragg_k);
            b_val = (uint32_t)((float)b_val * barb_ray * bragg_k);
            if (r_val > 255) r_val = 255;
            if (g_val > 255) g_val = 255;
            if (b_val > 255) b_val = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 250.0f);
            if (alpha > 255) alpha = 255;

            uint32_t peacock_c = w_color_pack(r_val, g_val, b_val, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(peacock_c, row[x], alpha);
            }
        }
    }
}
