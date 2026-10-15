/**
 * =========================================================================
 * Cybernetic Motherboard Circuit Traces & Vias (neon_cyber_circuit.c)
 *
 * Procedural PCB bus routing & cybernetic logic tracks in C99:
 * - Strict 45-degree and 90-degree printed circuit trace lines
 * - Circular connection solder pads & micro-via test points
 * - High-luminosity neon bus glow with integrated data pulse signals
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_trace_width = 2;    /* 1..5: Bus trace width in pixels */
static int _param_via_density = 65;   /* 10..100: Solder via pads density */
static int _param_glow_radiance = 85; /* 20..100: Neon data trace radiance */
static int _param_grid_pitch = 8;     /* 4..16: Routing grid cell pitch */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"neon_cyber_circuit\","
        "\"title\":\"Cybernetic PCB Traces\","
        "\"category\":\"Cyberpunk\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Trace Width\",\"min\":1,\"max\":5,\"default\":2,\"unit\":\"px\"},"
            "{\"name\":\"Via Pad Density\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Neon Radiance\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Grid Pitch\",\"min\":4,\"max\":16,\"default\":8,\"unit\":\"px\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_trace_width = (val < 1) ? 1 : (val > 5 ? 5 : val); break;
        case 1: _param_via_density = val; break;
        case 2: _param_glow_radiance = val; break;
        case 3: _param_grid_pitch = (val < 4) ? 4 : (val > 16 ? 16 : val); break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xC18C0170 ^ (uint32_t)(x * 51.0f + y * 57.0f));
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

    int pitch = _param_grid_pitch;
    int trace_w = _param_trace_width;
    float glow_boost = (float)_param_glow_radiance * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

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

            /* Snap to global world coordinates for 45/90 degree traces */
            int gx = x % pitch;
            int gy = y % pitch;
            int g_cell_x = x / pitch;
            int g_cell_y = y / pitch;

            /* Deterministic pseudo-random routing per cell */
            uint32_t cell_hash = ((uint32_t)g_cell_x * 0x9E3779B9) ^ ((uint32_t)g_cell_y * 0x85EBCA6B);
            int route_dir = cell_hash & 3; /* 0=horizontal, 1=vertical, 2=45-diagonal, 3=junction */

            int on_trace = 0;
            int on_via = 0;

            if (route_dir == 0 && gy < trace_w) {
                on_trace = 1;
            } else if (route_dir == 1 && gx < trace_w) {
                on_trace = 1;
            } else if (route_dir == 2 && (gx == gy || gx == (pitch - 1 - gy))) {
                on_trace = 1;
            } else if (route_dir == 3) {
                /* Via solder pad at cell center */
                int c_dx = gx - (pitch / 2);
                int c_dy = gy - (pitch / 2);
                if (c_dx * c_dx + c_dy * c_dy <= (trace_w + 1) * (trace_w + 1)) {
                    on_via = 1;
                }
            }

            if (!on_trace && !on_via) continue;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.02f) continue;

            uint32_t r, g, b;
            if (on_via) {
                /* Solder via: golden/amber micro-pad */
                r = 255; g = 210; b = 80;
            } else {
                /* Neon circuit trace */
                r = cr; g = cg; b = cb;
            }

            uint32_t alpha = (uint32_t)(falloff * 255.0f * glow_boost * eff_p);
            if (alpha > 255) alpha = 255;

            uint32_t trace_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(trace_c, row[x], alpha);
            }
        }
    }
}
