/**
 * =========================================================================
 * High-Voltage Kirlian Electrophotography & Bio-Aura (electric_discharge_kirlian.c)
 *
 * High-frequency corona discharge & gas ionization in C99:
 * - Kirlian electro-photographic corona radiating from organic margins
 * - Ionized ozone blue-violet luminescence ($O_3$ atmospheric emission)
 * - Microscopic dendritic spark spikes branching outwards with capacitive radiance
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_corona_reach = 65;   /* 10..120: Corona aura radial reach % */
static int _param_streamer_density = 75; /* 20..100: Micro-streamer frequency */
static int _param_ozone_violet = 85;   /* 20..100: Violet-blue emission ratio */
static int _param_spark_energy = 80;   /* 20..100: Filament peak luminosity */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"electric_discharge_kirlian\","
        "\"title\":\"Kirlian Corona Bio-Aura\","
        "\"category\":\"Bio-Electrical\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Corona Reach\",\"min\":10,\"max\":120,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Streamer Density\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Ozone Violet Glow\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Spark Energy\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_corona_reach = val; break;
        case 1: _param_streamer_density = val; break;
        case 2: _param_ozone_violet = val; break;
        case 3: _param_spark_energy = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x1CE1B000 ^ (uint32_t)(x * 89.0f + y * 97.0f));
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
    float reach_r = radius * (1.0f + ((float)_param_corona_reach * 0.008f) * eff_p);

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(reach_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (reach_r * reach_r);
    float n_spikes = 12.0f + ((float)_param_streamer_density * 0.35f);
    float violet_mix = (float)_param_ozone_violet * 0.01f;
    float energy = (float)_param_spark_energy * 0.01f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > reach_r * reach_r) continue;

            float dist = w_sqrtf(dist_sq);
            if (dist < 0.001f) continue;

            /* Angular high-frequency streamers */
            float theta = w_sinf(dx / dist);
            float spike_wave = w_sinf(theta * n_spikes + dist * 0.4f);
            float spike_wave2 = w_sinf(theta * (n_spikes * 2.3f) - dist * 0.8f) * 0.5f;
            float spike = spike_wave + spike_wave2;
            if (spike < 0.0f) spike = -spike;

            /* Corona radial falloff */
            float norm_d = dist / reach_r;
            float streamer_factor = spike * (1.0f - norm_d);
            streamer_factor = streamer_factor * streamer_factor;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float aura_intensity = (streamer_factor * 0.7f + (1.0f - norm_d) * 0.3f) * falloff * energy * eff_p;
            if (aura_intensity <= 0.01f) continue;

            /* Kirlian ozone spectrum: electric ultraviolet, deep indigo, and cyan fringing */
            uint32_t r = (uint32_t)(140.0f * violet_mix * aura_intensity);
            uint32_t g = (uint32_t)(160.0f * (1.0f - violet_mix * 0.5f) * aura_intensity);
            uint32_t b = (uint32_t)(255.0f * aura_intensity);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(aura_intensity * 235.0f);
            if (alpha > 255) alpha = 255;

            uint32_t kirlian_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(kirlian_c, row[x], alpha);
            }
        }
    }
}
