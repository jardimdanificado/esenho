/**
 * =========================================================================
 * Ferroelectric Crystal Domains & Piezoelectric Walls (ferroelectric_domain_walls.c)
 *
 * Solid-state ferroelectric spontaneous polarization in C99:
 * - 90-degree and 180-degree twin polarization domain wall structures
 * - Stress-induced Barkhausen avalanche domain switching
 * - High-contrast crystalline birefringence polarization contrast
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_domain_scale = 10;   /* 4..24: Domain stripe cell pitch in pixels */
static int _param_twin_angle = 90;     /* 45, 90, 180: Domain wall orientation degrees */
static int _param_barkhausen = 65;     /* 10..100: Acoustic emission avalanche jitter */
static int _param_contrast = 80;       /* 20..100: Piezoelectric birefringence contrast */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"ferroelectric_domain_walls\","
        "\"title\":\"Ferroelectric Domain Walls\","
        "\"category\":\"Solid State\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Domain Pitch\",\"min\":4,\"max\":24,\"default\":10,\"unit\":\"px\"},"
            "{\"name\":\"Wall Angle\",\"min\":45,\"max\":180,\"default\":90,\"unit\":\"deg\"},"
            "{\"name\":\"Barkhausen Jitter\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Polarization Contrast\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_domain_scale = (val < 4) ? 4 : (val > 24 ? 24 : val); break;
        case 1: _param_twin_angle = val; break;
        case 2: _param_barkhausen = val; break;
        case 3: _param_contrast = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xFE550000 ^ (uint32_t)(x * 73.0f + y * 79.0f));
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

    float pitch = (float)_param_domain_scale;
    float inv_pitch = 1.0f / pitch;
    float jitter = ((float)_param_barkhausen * 0.01f) * eff_p;
    float contrast = (float)_param_contrast * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    float rad_ang = (float)_param_twin_angle * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

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

            /* Continuous space crystal domain coordinates */
            float u = (float)x * cos_a + (float)y * sin_a;
            float v = -(float)x * sin_a + (float)y * cos_a;

            /* Microscopic Barkhausen avalanche displacement */
            uint32_t cell_h = ((uint32_t)(x / 16) * 0x85EBCA6B) ^ ((uint32_t)(y / 16) * 0xC2B2AE35);
            float aval = ((float)(cell_h & 0xF) - 7.5f) * jitter * 0.5f;

            float norm_stripe = (u + aval) * inv_pitch;
            int stripe_idx = (int)w_floorf(norm_stripe);
            float frac_stripe = norm_stripe - (float)stripe_idx;

            /* 90-degree twin domains alternate polarization vectors */
            int polarity = (stripe_idx & 1);

            /* Domain wall boundary transition line */
            float dist_to_wall = (frac_stripe < 0.5f) ? frac_stripe : (1.0f - frac_stripe);
            float wall_factor = 1.0f - (dist_to_wall * 8.0f);
            if (wall_factor < 0.0f) wall_factor = 0.0f;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            /* Shading based on electric polarization orientation */
            float pol_shade = polarity ? (0.6f + 0.4f * contrast) : (0.6f - 0.35f * contrast);
            uint32_t r = (uint32_t)((float)cr * pol_shade + wall_factor * 120.0f);
            uint32_t g = (uint32_t)((float)cg * pol_shade + wall_factor * 150.0f);
            uint32_t b = (uint32_t)((float)cb * pol_shade + wall_factor * 255.0f);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 250.0f);
            if (alpha > 255) alpha = 255;

            uint32_t domain_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(domain_c, row[x], alpha);
            }
        }
    }
}
