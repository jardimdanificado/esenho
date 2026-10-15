/**
 * =========================================================================
 * Volcanic Basalt Crust & Molten Magma Fissures (magma_crust_tectonic.c)
 *
 * Thermal tectonic stress & glowing magma crack network in C99:
 * - Cooling basalt crust plates (black obsidian / dark porous lava stone)
 * - Deep tectonic fissures revealing incandescent liquid magma (yellow-orange-ruby)
 * - Stylus pressure widens thermal stress fractures, increasing magma radiation
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_fissure_width = 60;  /* 20..100: Lava fissure width */
static int _param_magma_heat = 85;     /* 20..100: Incandescent core brilliance */
static int _param_crust_rough = 70;    /* 10..100: Basalt rock tooth roughness */
static int _param_glow_radiance = 75;  /* 10..100: Fissure bloom glow */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"magma_crust_tectonic\","
        "\"title\":\"Volcanic Magma Fissures\","
        "\"category\":\"Geology\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Fissure Width\",\"min\":20,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Magma Heat\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Crust Roughness\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Glow Radiance\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_fissure_width = val; break;
        case 1: _param_magma_heat = val; break;
        case 2: _param_crust_rough = val; break;
        case 3: _param_glow_radiance = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xBA5A1700 ^ (uint32_t)(x * 83.0f + y * 89.0f));
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

    float inv_r_sq = 1.0f / (radius * radius);
    float fissure_k = ((float)_param_fissure_width * 0.01f) * eff_p;
    float heat = (float)_param_magma_heat * 0.01f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Continuous space procedural crack cellular network */
            float sx = (float)x * 0.12f;
            float sy = (float)y * 0.12f;

            float c1 = w_sinf(sx * 1.0f + sy * 0.35f);
            float c2 = w_cosf(sx * -0.6f + sy * 0.85f);
            float crack = c1 * c2;
            if (crack < 0.0f) crack = -crack;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            /* Crack threshold: inside fissure vs on cooling crust plate */
            float crack_threshold = 0.08f + fissure_k * 0.14f;

            uint32_t r, g, b;
            uint32_t alpha;

            if (crack < crack_threshold) {
                /* Molten incandescent magma fissure */
                float core_t = 1.0f - (crack / crack_threshold);
                core_t = core_t * core_t;

                r = 255;
                g = (uint32_t)(80.0f + 175.0f * core_t * heat);
                b = (uint32_t)(10.0f + 120.0f * core_t * heat);
                if (g > 255) g = 255;
                if (b > 255) b = 255;

                alpha = (uint32_t)(falloff * 255.0f);
            } else {
                /* Dark cooling basalt stone crust */
                float rock_lum = 25.0f + 15.0f * w_sinf(sx * 2.5f + sy * 3.1f);
                r = (uint32_t)(rock_lum + 8.0f);
                g = (uint32_t)(rock_lum);
                b = (uint32_t)(rock_lum);
                alpha = (uint32_t)(falloff * eff_p * 240.0f);
            }

            uint32_t magma_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(magma_c, row[x], alpha);
            }
        }
    }
}
