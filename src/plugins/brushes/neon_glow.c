/**
 * =========================================================================
 * Neon Glow & Plasma Brush (src/plugins/brushes/neon_glow.c)
 *
 * Produces luminous electric neon, plasma trails, and energy:
 * - Intense, pure-white energy core.
 * - Spectral corona radiating outwards with additive linear dodge.
 * - Pressure dynamically drives core brightness and expands the plasma corona.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int g_core_intensity = 80;    // % pure white core sharpness
static int g_glow_spread = 50;       // % outer corona radius expansion
static int g_additive_boost = 75;    // % luminosity boost
static int g_color_saturation = 90;  // % spectral vibrance

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"neon_glow\","
        "\"title\":\"Neon Glow & Plasma\","
        "\"category\":\"Special FX\","
        "\"spacing\":0.20,"
        "\"minRadius\":4,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Core Intensity\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Glow Spread\",\"min\":10,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Additive Luminosity\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Color Saturation\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_core_intensity = (value < 20) ? 20 : (value > 100 ? 100 : value); break;
        case 1: g_glow_spread = (value < 10) ? 10 : (value > 100 ? 100 : value); break;
        case 2: g_additive_boost = (value < 20) ? 20 : (value > 100 ? 100 : value); break;
        case 3: g_color_saturation = (value < 20) ? 20 : (value > 100 ? 100 : value); break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {}
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
    float spread_factor = 1.0f + ((float)g_glow_spread * 0.01f);
    float rad = radius * spread_factor;
    float rad_sq = rad * rad;
    float inv_rad_sq = 1.0f / rad_sq;

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(rad + 1.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    uint32_t base_r = w_color_get_r(color);
    uint32_t base_g = w_color_get_g(color);
    uint32_t base_b = w_color_get_b(color);

    float core_sharpness = ((float)g_core_intensity * 0.01f) * 0.35f;
    float core_radius = radius * core_sharpness * eff_p;
    float core_radius_sq = core_radius * core_radius;
    float inv_core_sq = (core_radius_sq > 0.01f) ? (1.0f / core_radius_sq) : 0.0f;

    float boost = ((float)g_additive_boost * 0.01f) * eff_p;

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        float dy_sq = dy * dy;
        uint32_t *row = &pixels[y * canvas_w];

        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > rad_sq) continue;

            float norm_sq = dist_sq * inv_rad_sq; // 0.0 at center to 1.0 at edge
            float glow_falloff = 1.0f - norm_sq;
            glow_falloff = glow_falloff * glow_falloff;

            float core_factor = 0.0f;
            if (dist_sq <= core_radius_sq && inv_core_sq > 0.0f) {
                float ct = 1.0f - (dist_sq * inv_core_sq);
                core_factor = ct * ct;
            }

            uint32_t r = (uint32_t)((float)base_r + (255.0f - (float)base_r) * core_factor);
            uint32_t g = (uint32_t)((float)base_g + (255.0f - (float)base_g) * core_factor);
            uint32_t b = (uint32_t)((float)base_b + (255.0f - (float)base_b) * core_factor);

            float total_flow = (glow_falloff * 0.35f + core_factor * 0.75f) * boost;
            if (total_flow > 1.0f) total_flow = 1.0f;

            uint32_t alpha_step = (uint32_t)(total_flow * 255.0f);
            if (alpha_step == 0) continue;

            uint32_t dab_c = w_color_pack(r, g, b, 255);
            uint32_t dst = row[x];

            if (is_eraser) {
                uint32_t da = (dst >> 24) & 0xFF;
                uint32_t na = (da > alpha_step) ? (da - alpha_step) : 0;
                row[x] = (na << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(dab_c, dst, alpha_step);
            }
        }
    }
}
