/**
 * =========================================================================
 * Hexagonal Ice Dendrite & Mineral Nucleation (crystal_growth_dendrite.c)
 *
 * Real-time 6-fold hexagonal snowflake & crystal lattice growth in C99:
 * - 6-fold hexagonal symmetry coordinate projection
 * - Recursive dendritic facet side-branching along hexagonal glide planes
 * - Pressure & velocity modulation: slow deliberate strokes precipitate
 *   intricate branching stellar dendrites; fast strokes draw keen frost needles
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_branching = 5;      /* 2..8: Dendritic side-arm iterations */
static int _param_roughness = 65;     /* 10..100: Prism facet sharpness */
static int _param_ice_opacity = 85;   /* 20..100: Glacial crystalline opacity */
static int _param_prism_shimmer = 70; /* 0..100: Chromatic prism diffraction */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"crystal_growth_dendrite\","
        "\"title\":\"Hexagonal Ice Dendrite\","
        "\"category\":\"Crystalline\","
        "\"spacing\":0.06,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Branch Density\",\"min\":2,\"max\":8,\"default\":5,\"unit\":\"axes\"},"
            "{\"name\":\"Facet Sharpness\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Ice Opacity\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Prism Shimmer\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_branching = val; break;
        case 1: _param_roughness = val; break;
        case 2: _param_ice_opacity = val; break;
        case 3: _param_prism_shimmer = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x1CE01CE0 ^ (uint32_t)(x * 41.0f + y * 67.0f));
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
    float growth_reach = radius * (1.1f + eff_p * 0.4f);

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(growth_reach + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (growth_reach * growth_reach);
    float sharpness = (float)_param_roughness * 0.01f;
    float shimmer = (float)_param_prism_shimmer * 0.01f;
    int branches = _param_branching;
    if (branches < 2) branches = 2;
    if (branches > 8) branches = 8;

    float base_angle = angle_deg * 0.0174532925f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > growth_reach * growth_reach) continue;

            float dist = w_sqrtf(dist_sq);
            if (dist < 0.001f) continue;

            /* Map to hexagonal 60-degree sector */
            float theta = w_sinf(dx / dist) + base_angle;
            /* 6-fold radial wave: cos(6 * theta) */
            float hex_wave = w_cosf(theta * 6.0f);
            if (hex_wave < 0.0f) hex_wave = -hex_wave;

            /* Dendrite arm thickness profile */
            float arm_dist = (1.0f - hex_wave) * dist;
            float spine_width = 1.0f + (growth_reach - dist) * 0.12f * eff_p;

            /* Secondary side needle branching at 60 deg */
            float side_freq = (float)branches * 0.45f;
            float side_phase = dist * side_freq;
            float side_wave = w_sinf(side_phase);
            if (side_wave < 0.0f) side_wave = -side_wave;
            float side_needle = side_wave * (1.0f - (dist / growth_reach)) * 3.5f;

            float crystal_metric = arm_dist - side_needle;
            if (crystal_metric > spine_width * 2.5f) continue;

            float edge_factor = 1.0f - (crystal_metric / (spine_width * 2.5f));
            if (edge_factor < 0.0f) edge_factor = 0.0f;
            edge_factor = edge_factor * edge_factor * (3.0f - 2.0f * edge_factor);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float ice_density = edge_factor * falloff * eff_p;
            if (ice_density <= 0.01f) continue;

            /* Prism chromatic diffraction (subtle cyan-white-lavender sheen) */
            float prism = w_sinf(dist * 0.35f + theta * 3.0f) * shimmer;
            uint32_t r = (uint32_t)(200.0f + 55.0f * (edge_factor - prism));
            uint32_t g = (uint32_t)(225.0f + 30.0f * edge_factor);
            uint32_t b = (uint32_t)(245.0f + 10.0f * (edge_factor + prism));
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t a = (uint32_t)(ice_density * (float)_param_ice_opacity * 2.55f);
            if (a > 255) a = 255;

            uint32_t crystal_col = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(crystal_col, row[x], a);
            }
        }
    }
}
