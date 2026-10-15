/**
 * =========================================================================
 * Planetary Geodynamo & Magnetohydrodynamic Helices (magnetohydrodynamic_dynamo.c)
 *
 * Magnetohydrodynamic fluid dynamo & Coriolis helical convection in C99:
 * - Parker helical convection columns in liquid outer core generating dipole magnetic field
 * - Dual toroidal (azimuthal ring) and poloidal (dipolar loop) magnetic flux lines
 * - Lorentz force magnetic tension with self-sustaining dynamo induction
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_helix_coils = 4;     /* 1..8: Helical convection column turns */
static int _param_flux_density = 75;   /* 20..100: Magnetic flux line density */
static int _param_toroidal_ratio = 60; /* 10..90: Toroidal vs Poloidal field balance % */
static int _param_induction_glow = 85; /* 20..100: Ohmic heating & induction radiance */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"magnetohydrodynamic_dynamo\","
        "\"title\":\"Planetary Geodynamo Plasma\","
        "\"category\":\"Geophysics\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Helical Columns\",\"min\":1,\"max\":8,\"default\":4,\"unit\":\"coils\"},"
            "{\"name\":\"Magnetic Flux Density\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Toroidal Field Mix\",\"min\":10,\"max\":90,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Induction Radiance\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_helix_coils = (val < 1) ? 1 : (val > 8 ? 8 : val); break;
        case 1: _param_flux_density = val; break;
        case 2: _param_toroidal_ratio = val; break;
        case 3: _param_induction_glow = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xDF1A0000 ^ (uint32_t)(x * 83.0f + y * 97.0f));
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

    float coils = (float)_param_helix_coils;
    float flux_freq = 0.15f + ((float)_param_flux_density * 0.003f);
    float tor_ratio = (float)_param_toroidal_ratio * 0.01f;
    float glow_boost = (float)_param_induction_glow * 0.01f;
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

            /* Helical convection column coordinates */
            float proj_u = dx * cos_a + dy * sin_a;
            float proj_v = -dx * sin_a + dy * cos_a;

            /* Toroidal magnetic rings (azimuthal concentric rings) */
            float toroidal = w_sinf(r * flux_freq * 6.2831853f);
            toroidal = toroidal * toroidal;

            /* Poloidal magnetic dipole loops (helical twisted streamlines) */
            float helix_phase = proj_u * 0.15f + w_sinf(proj_v * 0.2f) * coils;
            float poloidal = w_sinf(helix_phase * 6.2831853f);
            poloidal = poloidal * poloidal;

            /* Combined MHD dynamo induction field */
            float mhd_flux = toroidal * tor_ratio + poloidal * (1.0f - tor_ratio);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float intensity = mhd_flux * falloff * eff_p;
            if (intensity <= 0.01f) continue;

            /* Liquid iron outer core & electromagnetic flux coloring */
            uint32_t r_val = (uint32_t)(255.0f * (0.4f + 0.6f * toroidal));
            uint32_t g_val = (uint32_t)(140.0f + 115.0f * poloidal);
            uint32_t b_val = (uint32_t)(50.0f + 205.0f * poloidal);
            if (r_val > 255) r_val = 255;
            if (g_val > 255) g_val = 255;
            if (b_val > 255) b_val = 255;

            uint32_t alpha = (uint32_t)(intensity * 235.0f * glow_boost);
            if (alpha > 255) alpha = 255;

            uint32_t dynamo_c = w_color_pack(r_val, g_val, b_val, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(dynamo_c, row[x], alpha);
            }
        }
    }
}
