/**
 * =========================================================================
 * Toroidal Vortex Cannon & Smoke Rings (smoke_ring_vortex.c)
 *
 * Toroidal vortex dynamics & fluid air entrainment in C99:
 * - Rolling torus smoke ring with azimuthal vorticity
 * - Outer boundary turbulent shear & ambient air entrainment
 * - Hollow ring eye with dense circulating toroidal vortex core
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_ring_radius = 60;   /* 20..100: Donut core radius % */
static int _param_core_thick = 35;    /* 10..80: Torus tube thickness */
static int _param_vorticity = 75;     /* 10..100: Azimuthal swirl velocity */
static int _param_dissipation = 50;   /* 10..100: Smoke dissipation rate */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"smoke_ring_vortex\","
        "\"title\":\"Toroidal Vortex Smoke Ring\","
        "\"category\":\"Fluid Dynamics\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Ring Diameter\",\"min\":20,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Torus Thickness\",\"min\":10,\"max\":80,\"default\":35,\"unit\":\"%\"},"
            "{\"name\":\"Vortex Swirl\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Dissipation\",\"min\":10,\"max\":100,\"default\":50,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_ring_radius = val; break;
        case 1: _param_core_thick = val; break;
        case 2: _param_vorticity = val; break;
        case 3: _param_dissipation = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x534F4B45 ^ (uint32_t)(x * 37.0f + y * 43.0f));
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

    float ring_r = radius * ((float)_param_ring_radius * 0.01f);
    float tube_r = radius * ((float)_param_core_thick * 0.01f);
    if (tube_r < 1.0f) tube_r = 1.0f;
    float inv_tube_sq = 1.0f / (tube_r * tube_r);

    float swirl = (float)_param_vorticity * 0.02f;

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

            float dist = w_sqrtf(dist_sq);

            /* Distance to circular torus core spine */
            float dist_to_ring = dist - ring_r;
            float tube_dist_sq = dist_to_ring * dist_to_ring;
            if (tube_dist_sq > tube_r * tube_r) continue;

            /* Torus azimuthal rolling vorticity */
            float theta = (dist > 0.001f) ? w_sinf(dx / dist) : 0.0f;
            float curl = w_sinf(theta * 8.0f + dist * swirl);

            float tube_falloff = w_brush_falloff_smooth(tube_dist_sq, inv_tube_sq);
            float smoke_density = tube_falloff * (0.75f + 0.25f * curl) * eff_p;
            if (smoke_density <= 0.01f) continue;

            uint32_t alpha = (uint32_t)(smoke_density * 220.0f);
            if (alpha > 255) alpha = 255;

            /* Ambient wispy color shading */
            uint32_t r = (uint32_t)((float)cr * (0.8f + 0.2f * tube_falloff));
            uint32_t g = (uint32_t)((float)cg * (0.8f + 0.2f * tube_falloff));
            uint32_t b = (uint32_t)((float)cb * (0.8f + 0.2f * tube_falloff));
            uint32_t smoke_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(smoke_c, row[x], alpha);
            }
        }
    }
}
