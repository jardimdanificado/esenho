/**
 * =========================================================================
 * Sand Sim & Gravity Brush (src/plugins/brushes/sand_sim.c)
 *
 * Cellular physics / Falling sand simulation brush:
 * - Drops individual physical sand grains at the cursor.
 * - Computes microscopic gravity and tumble dynamics per grain.
 * - Multi-shade chromatic variance (golden beach sand, volcanic basalt, or terracotta).
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int g_grain_density = 50;     // grains per dab
static int g_gravity_fall = 35;      // downward tumble displacement
static int g_shade_jitter = 25;      // % lightness variation between grains
static int g_tumble_spread = 40;     // % horizontal tumble width

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"sand_sim\","
        "\"title\":\"Falling Sand Physics\","
        "\"category\":\"Special FX\","
        "\"spacing\":0.12,"
        "\"minRadius\":6,"
        "\"maxRadius\":100,"
        "\"params\":["
            "{\"name\":\"Grain Density\",\"min\":10,\"max\":100,\"default\":50,\"unit\":\"grãos\"},"
            "{\"name\":\"Gravity Tumble\",\"min\":0,\"max\":80,\"default\":35,\"unit\":\"px\"},"
            "{\"name\":\"Shade Variation\",\"min\":0,\"max\":60,\"default\":25,\"unit\":\"%\"},"
            "{\"name\":\"Tumble Spread\",\"min\":10,\"max\":100,\"default\":40,\"unit\":\"%\"}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    w_brush_srand(0x5A4D51);
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_grain_density = (value < 10) ? 10 : (value > 100 ? 100 : value); break;
        case 1: g_gravity_fall = (value < 0) ? 0 : (value > 80 ? 80 : value); break;
        case 2: g_shade_jitter = (value < 0) ? 0 : (value > 60 ? 60 : value); break;
        case 3: g_tumble_spread = (value < 10) ? 10 : (value > 100 ? 100 : value); break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    w_brush_srand((uint32_t)(x * 991.0f + y * 433.0f));
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
    int count = (int)((float)g_grain_density * eff_p * 2.0f);

    float grav = (float)g_gravity_fall * (0.5f + eff_p * 0.5f);
    float spread_factor = (float)g_tumble_spread / 100.0f;
    float jitter = (float)g_shade_jitter / 100.0f;

    uint32_t base_a = w_color_get_a(color);
    int base_r = (int)w_color_get_r(color);
    int base_g = (int)w_color_get_g(color);
    int base_b = (int)w_color_get_b(color);

    for (int i = 0; i < count; i++) {
        // Uniform circular placement
        float a = w_brush_randf() * 6.2831853f;
        float dist = w_sqrtf(w_brush_randf()) * radius;
        float gx = cx + dist * w_cosf(a);
        float gy = cy + dist * w_sinf(a);

        // Physical gravity tumble downwards with random lateral deflection
        float fall = w_brush_randf() * grav;
        float lateral = w_brush_rand_symf() * fall * spread_factor;

        int px = (int)(gx + lateral);
        int py = (int)(gy + fall);

        if (px < 0 || px >= canvas_w || py < 0 || py >= canvas_h) continue;

        // Chromatic grain variation
        float grain_lum = 1.0f + w_brush_rand_symf() * jitter;
        int r = (int)((float)base_r * grain_lum); if (r > 255) r = 255; if (r < 0) r = 0;
        int g = (int)((float)base_g * grain_lum); if (g > 255) g = 255; if (g < 0) g = 0;
        int b = (int)((float)base_b * grain_lum); if (b > 255) b = 255; if (b < 0) b = 0;

        uint32_t grain_c = w_color_pack((uint32_t)r, (uint32_t)g, (uint32_t)b, base_a);

        uint32_t *row = &pixels[py * canvas_w];
        if (is_eraser) {
            row[px] = 0;
        } else {
            row[px] = grain_c;
        }
    }
}
