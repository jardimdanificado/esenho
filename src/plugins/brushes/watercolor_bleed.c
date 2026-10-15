/**
 * =========================================================================
 * Watercolor Bleed Brush (src/plugins/brushes/watercolor_bleed.c)
 *
 * Simulates traditional wet watercolor behavior:
 * - Fluid diffusion pushing pigment outwards to create a darkened fringe
 *   (the natural "coffee-ring effect" of evaporating washes).
 * - Stochastic pigment granulation settling across textured paper valleys.
 * - Soft, luminous translucent glazing that builds depth with layered strokes.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int g_water_load = 70;      // % water charge
static int g_fringe_darken = 55;   // % darkening at stroke perimeter
static int g_granulation = 40;     // % stochastic pigment texture
static int g_bleed_radius = 25;    // % outward wash spread

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"watercolor_bleed\","
        "\"title\":\"Watercolor Bleed Wash\","
        "\"category\":\"Watercolor\","
        "\"spacing\":0.12,"
        "\"minRadius\":6,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Water Load\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Coffee-Ring Fringe\",\"min\":0,\"max\":100,\"default\":55,\"unit\":\"%\"},"
            "{\"name\":\"Granulation\",\"min\":0,\"max\":100,\"default\":40,\"unit\":\"%\"},"
            "{\"name\":\"Bleed Spread\",\"min\":0,\"max\":50,\"default\":25,\"unit\":\"%\"}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    w_brush_srand(0x42DEAD);
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_water_load = (value < 10) ? 10 : (value > 100 ? 100 : value); break;
        case 1: g_fringe_darken = (value < 0) ? 0 : (value > 100 ? 100 : value); break;
        case 2: g_granulation = (value < 0) ? 0 : (value > 100 ? 100 : value); break;
        case 3: g_bleed_radius = (value < 0) ? 0 : (value > 50 ? 50 : value); break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    w_brush_srand((uint32_t)(x * 543.0f + y * 911.0f));
}

W_EXPORT void w_brush_stroke_end(void) {}

W_EXPORT void w_brush_render_dab(
    uint32_t *pixels,
    int32_t canvas_w,
    int32_t canvas_h,
    float cx, float cy,
    float radius,
    float pressure,
    float angle_deg,
    float speed,
    uint32_t color,
    int32_t is_eraser
) {
    if (!pixels || canvas_w <= 0 || canvas_h <= 0 || radius <= 0.5f) return;

    float eff_p = (pressure > 0.01f) ? pressure : 0.5f;
    float spread_mult = 1.0f + (g_bleed_radius * 0.01f);
    float r = radius * spread_mult;
    float r_sq = r * r;

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    uint32_t base_a = w_color_get_a(color);
    uint32_t base_r = w_color_get_r(color);
    uint32_t base_g = w_color_get_g(color);
    uint32_t base_b = w_color_get_b(color);

    // Subtle paper noise lookup
    float gran_amount = (float)g_granulation / 100.0f;
    float fringe_strength = (float)g_fringe_darken / 100.0f;
    float water_flow = ((float)g_water_load / 100.0f) * 0.15f * eff_p;

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        float dy_sq = dy * dy;
        uint32_t *row = &pixels[y * canvas_w];

        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > r_sq) continue;

            float norm_dist = w_sqrtf(dist_sq) / r; // 0.0 (center) to 1.0 (perimeter)

            // Coffee-ring profile: density drops towards mid-radius, then spikes sharply at the edge!
            float edge_fringe = 0.0f;
            if (norm_dist > 0.70f) {
                float t = (norm_dist - 0.70f) / 0.30f;
                edge_fringe = t * t * fringe_strength * 1.6f;
            }

            // Interior wash profile
            float wash_density = 0.35f + (1.0f - norm_dist) * 0.25f + edge_fringe;

            // Micro-granulation noise (deterministic per canvas position)
            uint32_t hash = ((uint32_t)x * 73856093) ^ ((uint32_t)y * 19349663);
            float noise = (float)(hash & 0xFF) / 255.0f;
            float gran_factor = 1.0f + (noise - 0.5f) * gran_amount;

            float final_flow = wash_density * gran_factor * water_flow;
            if (final_flow > 1.0f) final_flow = 1.0f;
            if (final_flow < 0.0f) final_flow = 0.0f;

            uint32_t alpha_step = (uint32_t)(final_flow * (float)base_a);
            if (alpha_step == 0) continue;

            uint32_t dst = row[x];

            // Darken pigment slightly at the fringe
            uint32_t cur_r = base_r;
            uint32_t cur_g = base_g;
            uint32_t cur_b = base_b;
            if (edge_fringe > 0.2f) {
                float darken = 1.0f - (edge_fringe * 0.25f);
                cur_r = (uint32_t)((float)cur_r * darken);
                cur_g = (uint32_t)((float)cur_g * darken);
                cur_b = (uint32_t)((float)cur_b * darken);
            }
            uint32_t dab_c = w_color_pack(cur_r, cur_g, cur_b, base_a);

            if (is_eraser) {
                uint32_t da = (dst >> 24) & 0xFF;
                uint32_t na = (da > alpha_step) ? (da - alpha_step) : 0;
                row[x] = (na << 24) | (dst & 0x00FFFFFF);
            } else {
                // Subtractive / glazed wash blend
                row[x] = w_brush_blend_over(dab_c, dst, alpha_step);
            }
        }
    }
}
