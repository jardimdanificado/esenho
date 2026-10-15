/**
 * =========================================================================
 * Relativistic Gravitational Lensing & Einstein Rings (gravitational_lens_einstein.c)
 *
 * General relativistic Schwarzschild spacetime curvature in C99:
 * - Gravitational deflection angle $\hat{\alpha}(\theta) = \theta_E^2 / \theta$
 * - Real-time distortion of existing canvas pixels into Einstein rings and arcs
 * - Event horizon shadow & gravitational redshift energy dissipation
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_einstein_radius = 55; /* 10..100: Einstein ring radius % of brush */
static int _param_mass_compact = 75;    /* 20..100: Gravitational mass concentration */
static int _param_photon_ring = 80;     /* 10..100: Luminous photon sphere brilliance */
static int _param_redshift = 65;        /* 0..100: Gravitational redshift darkening */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"gravitational_lens_einstein\","
        "\"title\":\"Einstein Gravitational Lens\","
        "\"category\":\"Relativity\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Einstein Radius\",\"min\":10,\"max\":100,\"default\":55,\"unit\":\"%\"},"
            "{\"name\":\"Mass Compactness\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Photon Sphere Glow\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Gravitational Redshift\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_einstein_radius = val; break;
        case 1: _param_mass_compact = val; break;
        case 2: _param_photon_ring = val; break;
        case 3: _param_redshift = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {}
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

    float theta_e = radius * ((float)_param_einstein_radius * 0.01f) * (0.8f + eff_p * 0.4f);
    float theta_e_sq = theta_e * theta_e;
    float r_horizon = theta_e * 0.28f;
    float r_photon = theta_e * 0.52f;
    float inv_r_sq = 1.0f / (radius * radius);

    float photon_glow = (float)_param_photon_ring * 0.01f;
    float redshift = (float)_param_redshift * 0.01f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float r = w_sqrtf(dist_sq);
            if (r < 0.001f) continue;

            /* Event Horizon shadow core: total absorption */
            if (r <= r_horizon) {
                if (is_eraser) {
                    row[x] = 0;
                } else {
                    row[x] = w_color_pack(0, 0, 0, 255);
                }
                continue;
            }

            /* Relativistic lens deflection: $\beta = \theta - \theta_E^2 / \theta$ */
            float defl_factor = theta_e_sq / (dist_sq + 1.0f);
            float src_x = cx + dx * (1.0f - defl_factor);
            float src_y = cy + dy * (1.0f - defl_factor);

            int isrc_x = (int)src_x;
            int isrc_y = (int)src_y;
            if (isrc_x < 0) isrc_x = 0; else if (isrc_x >= canvas_w) isrc_x = canvas_w - 1;
            if (isrc_y < 0) isrc_y = 0; else if (isrc_y >= canvas_h) isrc_y = canvas_h - 1;

            uint32_t sampled_px = pixels[isrc_y * canvas_w + isrc_x];

            /* Gravitational Redshift near horizon: shift RGB towards deep amber/red */
            float red_factor = (r - r_horizon) / (theta_e - r_horizon + 0.1f);
            if (red_factor > 1.0f) red_factor = 1.0f;
            if (red_factor < 0.0f) red_factor = 0.0f;

            uint32_t sr = w_color_get_r(sampled_px);
            uint32_t sg = w_color_get_g(sampled_px);
            uint32_t sb = w_color_get_b(sampled_px);

            float r_atten = 1.0f - (1.0f - red_factor) * redshift * 0.7f;
            sr = (uint32_t)((float)sr * r_atten);
            sg = (uint32_t)((float)sg * r_atten * (0.6f + 0.4f * red_factor));
            sb = (uint32_t)((float)sb * r_atten * red_factor * red_factor);

            /* Luminous photon sphere sub-ring glow */
            float dist_to_photon = (r > r_photon) ? (r - r_photon) : (r_photon - r);
            float photon_width = theta_e * 0.15f;
            float p_glow = 0.0f;
            if (dist_to_photon < photon_width) {
                p_glow = 1.0f - (dist_to_photon / photon_width);
                p_glow = p_glow * p_glow * photon_glow;
            }

            sr = (uint32_t)((float)sr + 255.0f * p_glow);
            sg = (uint32_t)((float)sg + 220.0f * p_glow);
            sb = (uint32_t)((float)sb + 140.0f * p_glow);
            if (sr > 255) sr = 255;
            if (sg > 255) sg = 255;
            if (sb > 255) sb = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            uint32_t alpha = (uint32_t)(falloff * eff_p * 255.0f);
            if (alpha > 255) alpha = 255;

            uint32_t lensed_c = w_color_pack(sr, sg, sb, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(lensed_c, row[x], alpha);
            }
        }
    }
}
