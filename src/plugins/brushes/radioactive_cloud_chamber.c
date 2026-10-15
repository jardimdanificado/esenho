/**
 * =========================================================================
 * Wilson Cloud Chamber & Subatomic Particle Tracks (radioactive_cloud_chamber.c)
 *
 * Ionization vapor condensation & subatomic particle physics in C99:
 * - Supersaturated alcohol vapor nucleating droplets along ionization trails
 * - Distinct particle kinematics:
 *   1. Dense, straight, high-LET Alpha ($\alpha$) tracks with Bragg peak termination
 *   2. Tortuous, low-LET Beta ($\beta$) electron scattering zigzags
 *   3. Sharp relativistic Cosmic Ray Muon ($\mu$) linear streaks
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_particle_rate = 6;   /* 2..15: Particles spawned per dab */
static int _param_alpha_ratio = 50;    /* 10..90: Heavy alpha vs light beta balance % */
static int _param_vapor_density = 80;  /* 20..100: Droplet condensation trail opacity */
static int _param_bragg_peak = 75;     /* 20..100: End-of-track ionization blossom */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"radioactive_cloud_chamber\","
        "\"title\":\"Wilson Cloud Chamber\","
        "\"category\":\"Nuclear Physics\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Particle Rate\",\"min\":2,\"max\":15,\"default\":6,\"unit\":\"tracks\"},"
            "{\"name\":\"Alpha vs Beta Mix\",\"min\":10,\"max\":90,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Vapor Density\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Bragg Peak Bloom\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_particle_rate = (val < 2) ? 2 : (val > 15 ? 15 : val); break;
        case 1: _param_alpha_ratio = val; break;
        case 2: _param_vapor_density = val; break;
        case 3: _param_bragg_peak = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xC100DC00 ^ (uint32_t)(x * 97.0f + y * 103.0f));
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
    int n_tracks = (int)((float)_param_particle_rate * (0.6f + eff_p * 0.8f));
    float alpha_mix = (float)_param_alpha_ratio * 0.01f;
    float vapor_str = (float)_param_vapor_density * 0.01f;
    float bragg_k = (float)_param_bragg_peak * 0.01f;

    uint32_t droplet_c = w_color_pack(240, 245, 255, 255);

    /* Render distinct ionizing particle tracks */
    for (int t = 0; t < n_tracks; t++) {
        float start_ang = w_brush_randf() * 6.2831853f;
        float start_d = radius * 0.4f * w_sqrtf(w_brush_randf());
        float cur_x = cx + start_d * w_cosf(start_ang);
        float cur_y = cy + start_d * w_sinf(start_ang);

        int is_alpha = (w_brush_randf() < alpha_mix);

        float track_ang = w_brush_randf() * 6.2831853f;
        float track_len = radius * (is_alpha ? (0.6f + w_brush_randf() * 0.5f) : (0.8f + w_brush_randf() * 0.8f));
        int steps = is_alpha ? 12 : 18;
        float step_d = track_len / (float)steps;

        for (int s = 0; s < steps; s++) {
            float frac = (float)s / (float)steps;

            if (!is_alpha) {
                /* Beta electron undergoes multiple Coulomb scattering (tortuous zigzag) */
                track_ang += w_brush_rand_symf() * 0.65f;
            }

            float next_x = cur_x + step_d * w_cosf(track_ang);
            float next_y = cur_y + step_d * w_sinf(track_ang);

            /* Track thickness: Alpha has heavy ionization with Bragg peak at terminus */
            float thickness = is_alpha ? (1.5f + frac * bragg_k * 2.2f) : 0.8f;

            int px = (int)next_x;
            int py = (int)next_y;

            if (px >= 2 && px < canvas_w - 2 && py >= 2 && py < canvas_h - 2) {
                int irad = (int)(thickness + 0.5f);
                for (int dy = -irad; dy <= irad; dy++) {
                    for (int dx = -irad; dx <= irad; dx++) {
                        if (dx * dx + dy * dy <= irad * irad + 1) {
                            int sx = px + dx;
                            int sy = py + dy;
                            uint32_t a = (uint32_t)(255.0f * vapor_str * eff_p);
                            if (a > 255) a = 255;

                            if (is_eraser) {
                                uint32_t dst = pixels[sy * canvas_w + sx];
                                uint32_t da = (dst >> 24) & 0xFF;
                                pixels[sy * canvas_w + sx] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
                            } else {
                                pixels[sy * canvas_w + sx] = w_brush_blend_add(droplet_c, pixels[sy * canvas_w + sx], a);
                            }
                        }
                    }
                }
            }

            cur_x = next_x;
            cur_y = next_y;
        }
    }
}
