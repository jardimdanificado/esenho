/**
 * =========================================================================
 * Physarum Polycephalum Slime Mold Foraging Network (slime_mold_physarum.c)
 *
 * Bio-computational cytoplasmic vein & foraging agent dynamics in C99:
 * - Tubular plasmodial network connecting food and pigment sources
 * - Peristaltic actin-myosin rhythmic shuttle stream
 * - Fractal vein thickening along high-traffic flow paths
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_vein_density = 70;   /* 20..100: Branching vein count */
static int _param_peristalsis = 65;    /* 10..100: Cytoplasmic shuttle pulse */
static int _param_chemotaxis = 80;     /* 10..100: Foraging exploration width */
static int _param_vein_viscosity = 60; /* 10..100: Slime viscosity & thickness */

static float _stream_time = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"slime_mold_physarum\","
        "\"title\":\"Physarum Slime Bio-Network\","
        "\"category\":\"Bio-Simulation\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":130,"
        "\"params\":["
            "{\"name\":\"Vein Density\",\"min\":20,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Peristaltic Pulse\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Chemotactic Reach\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Vein Viscosity\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    _stream_time = 0.0f;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_vein_density = val; break;
        case 1: _param_peristalsis = val; break;
        case 2: _param_chemotaxis = val; break;
        case 3: _param_vein_viscosity = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _stream_time = 0.0f;
    w_brush_srand(0x715E0000 ^ (uint32_t)(x * 71.0f + y * 73.0f));
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
    _stream_time += 0.12f * (1.0f + speed * 0.02f);

    float reach_r = radius * (1.0f + ((float)_param_chemotaxis * 0.005f));
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(reach_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (reach_r * reach_r);
    float pulse_rate = (float)_param_peristalsis * 0.03f;
    float vein_scale = 0.12f + ((float)_param_vein_density * 0.002f);
    float visc = (float)_param_vein_viscosity * 0.01f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > reach_r * reach_r) continue;

            /* Continuous space Voronoi-like vein ridge network */
            float sx = (float)x * vein_scale;
            float sy = (float)y * vein_scale;

            float v1 = w_sinf(sx * 1.0f + sy * 0.4f + _stream_time);
            float v2 = w_cosf(sx * -0.7f + sy * 0.9f - _stream_time * 0.8f);
            float v3 = w_sinf(sx * 0.3f - sy * 1.1f + _stream_time * 0.5f);
            float vein_raw = v1 * v2 + v3 * 0.5f;
            if (vein_raw < 0.0f) vein_raw = -vein_raw;

            /* Cytoplasmic tube tubular profile: thin intense ridges */
            float tube = 1.0f - (vein_raw * 1.8f);
            if (tube < 0.0f) tube = 0.0f;
            tube = tube * tube * (3.0f - 2.0f * tube);

            /* Peristaltic flow swell */
            float peristaltic = 0.8f + 0.2f * w_sinf(sx * 0.5f + sy * 0.5f + _stream_time * pulse_rate);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float slime_density = tube * peristaltic * falloff * eff_p;
            if (slime_density <= 0.01f) continue;

            /* Plasmodial biological pigmentation: bright vivid sulfur yellow to warm ochre */
            uint32_t r = (uint32_t)(230.0f + 25.0f * tube);
            uint32_t g = (uint32_t)(210.0f + 35.0f * (1.0f - visc) * tube);
            uint32_t b = (uint32_t)(15.0f + 50.0f * visc);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(slime_density * 240.0f);
            if (alpha > 255) alpha = 255;

            uint32_t phys_col = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(phys_col, row[x], alpha);
            }
        }
    }
}
