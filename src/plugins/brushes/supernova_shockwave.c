/**
 * =========================================================================
 * Supernova Blast Wave & Hydrodynamic Remnant (supernova_shockwave.c)
 *
 * Relativistic stellar explosion & Rayleigh-Taylor hydrodynamic instability:
 * - Expanding supersonic blast front with turbulent ejecta fingers
 * - Shocked interstellar medium compression ring
 * - Synchrotron high-energy radiation with incandescent core
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_shock_sharp = 80;    /* 20..100: Shock front edge sharpness */
static int _param_fingers = 12;        /* 4..24: Rayleigh-Taylor instability fingers */
static int _param_ejecta_turb = 65;    /* 10..100: Ejecta turbulence */
static int _param_synchrotron = 75;    /* 10..100: Blue synchrotron radiation */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"supernova_shockwave\","
        "\"title\":\"Supernova Shockwave\","
        "\"category\":\"Astrophysics\","
        "\"spacing\":0.06,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Shock Sharpness\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"RT Instability Fingers\",\"min\":4,\"max\":24,\"default\":12,\"unit\":\"lobes\"},"
            "{\"name\":\"Ejecta Turbulence\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Synchrotron Glow\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_shock_sharp = val; break;
        case 1: _param_fingers = val; break;
        case 2: _param_ejecta_turb = val; break;
        case 3: _param_synchrotron = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x50FE8000 ^ (uint32_t)(x * 89.0f + y * 97.0f));
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
    float shock_r = radius * (0.9f + eff_p * 0.3f);

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(shock_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (shock_r * shock_r);
    float n_fingers = (float)_param_fingers;
    float turb_amt = (float)_param_ejecta_turb * 0.01f;
    float synch = (float)_param_synchrotron * 0.01f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > shock_r * shock_r) continue;

            float dist = w_sqrtf(dist_sq);
            if (dist < 0.001f) continue;

            /* Polar angle for Rayleigh-Taylor hydrodynamic fingers */
            float theta = w_sinf(dx / dist);
            float rt_wave = w_sinf(theta * n_fingers + dist * 0.15f);
            float rt_offset = rt_wave * shock_r * 0.18f * turb_amt;

            /* Relativistic spherical blast compression shell */
            float shell_pos = dist + rt_offset;
            float shell_dist = shell_pos - (shock_r * 0.82f);
            if (shell_dist < 0.0f) shell_dist = -shell_dist;

            float shell_thick = shock_r * 0.14f;
            float shell_factor = 1.0f - (shell_dist / (shell_thick + 0.1f));
            if (shell_factor < 0.0f) shell_factor = 0.0f;
            shell_factor = shell_factor * shell_factor;

            /* Dense incandescent core */
            float core_factor = 1.0f - (dist / (shock_r * 0.45f));
            if (core_factor < 0.0f) core_factor = 0.0f;
            core_factor = core_factor * core_factor;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float energy = (shell_factor * 0.85f + core_factor * 1.1f) * falloff * eff_p;
            if (energy <= 0.01f) continue;

            /* Spectral color: Outer shell cyan synchrotron shock, inner gold-ruby ejecta */
            uint32_t r, g, b;
            if (dist > shock_r * 0.65f) {
                /* Synchrotron shock front: ultra-violet / cyan plasma */
                r = (uint32_t)(80.0f * (1.0f - synch) + 120.0f * synch);
                g = (uint32_t)(210.0f + 45.0f * energy);
                b = (uint32_t)(255.0f);
            } else {
                /* Explosive core: orange, ruby & incandescent white */
                r = (uint32_t)(255.0f);
                g = (uint32_t)(90.0f + 165.0f * core_factor);
                b = (uint32_t)(30.0f + 225.0f * core_factor);
            }
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(energy * 230.0f);
            if (alpha > 255) alpha = 255;

            uint32_t blast_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(blast_c, row[x], alpha);
            }
        }
    }
}
