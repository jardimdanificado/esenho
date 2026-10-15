/**
 * =========================================================================
 * Bristle Oil Brush (src/plugins/brushes/bristle_oil.c)
 *
 * Simulates physical oil paint bristles:
 * - Bundle of distinct flexible bristles tracked along stroke trajectory.
 * - Progressive paint depletion (dry brush effect over stroke distance).
 * - Wet-in-wet color pickup and mixing with existing canvas pixels.
 * - Pressure sensitivity spreads bristles wider and increases paint flow.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define MAX_BRISTLES 32

typedef struct {
    float offset_x;
    float offset_y;
    float thickness;
    float wetness;
} bristle_t;

static bristle_t g_bristles[MAX_BRISTLES];
static int g_bristle_count = 18;
static int g_depletion_rate = 35; // % per 100px traveled
static int g_wet_mix = 40;       // % pickup from existing canvas
static int g_stiffness = 60;     // % resistance to spreading
static float g_paint_charge = 1.0f;

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"bristle_oil\","
        "\"title\":\"Bristle Oil Paint\","
        "\"category\":\"Paint\","
        "\"spacing\":0.05,"
        "\"minRadius\":4,"
        "\"maxRadius\":120,"
        "\"params\":["
            "{\"name\":\"Bristle Count\",\"min\":6,\"max\":32,\"default\":18,\"unit\":\"bristles\"},"
            "{\"name\":\"Depletion Rate\",\"min\":0,\"max\":100,\"default\":35,\"unit\":\"%\"},"
            "{\"name\":\"Wet Color Mix\",\"min\":0,\"max\":100,\"default\":40,\"unit\":\"%\"},"
            "{\"name\":\"Stiffness\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"}"
        "]"
    "}";
}

static void init_bristle_bundle(void) {
    w_brush_srand(0x1337BEEF);
    for (int i = 0; i < MAX_BRISTLES; i++) {
        float angle = w_brush_randf() * 6.2831853f;
        float r = w_sqrtf(w_brush_randf()); // Uniform disk distribution
        g_bristles[i].offset_x = r * w_cosf(angle);
        g_bristles[i].offset_y = r * w_sinf(angle);
        g_bristles[i].thickness = 0.8f + w_brush_randf() * 1.0f;
        g_bristles[i].wetness = 0.8f + w_brush_randf() * 0.4f;
    }
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    init_bristle_bundle();
    g_paint_charge = 1.0f;
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0:
            g_bristle_count = (value < 6) ? 6 : (value > MAX_BRISTLES ? MAX_BRISTLES : value);
            break;
        case 1:
            g_depletion_rate = (value < 0) ? 0 : (value > 100 ? 100 : value);
            break;
        case 2:
            g_wet_mix = (value < 0) ? 0 : (value > 100 ? 100 : value);
            break;
        case 3:
            g_stiffness = (value < 10) ? 10 : (value > 100 ? 100 : value);
            break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    g_paint_charge = 1.0f;
    w_brush_srand((uint32_t)(x * 1000.0f + y * 7.0f));
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

    float depletion_factor = (g_depletion_rate / 100.0f) * 0.003f;
    g_paint_charge -= depletion_factor;
    if (g_paint_charge < 0.08f) g_paint_charge = 0.08f;

    float eff_p = (pressure > 0.01f) ? pressure : 0.5f;
    float spread_factor = 1.0f + (100 - g_stiffness) * 0.01f * eff_p;
    float rad = radius * spread_factor;

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(rad + 4.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    uint32_t base_a = w_color_get_a(color);

    for (int b_idx = 0; b_idx < g_bristle_count; b_idx++) {
        bristle_t *b = &g_bristles[b_idx];

        float bx = cx + b->offset_x * rad;
        float by = cy + b->offset_y * rad;

        float b_rad = b->thickness * (0.8f + eff_p * 1.0f);
        int bx0 = (int)(bx - b_rad);
        int by0 = (int)(by - b_rad);
        int bx1 = (int)(bx + b_rad + 1.0f);
        int by1 = (int)(by + b_rad + 1.0f);

        if (bx0 < x0) bx0 = x0;
        if (by0 < y0) by0 = y0;
        if (bx1 > x1) bx1 = x1;
        if (by1 > y1) by1 = y1;

        float b_rad_sq = b_rad * b_rad;
        if (b_rad_sq <= 0.01f) continue;
        float inv_b_rad_sq = 1.0f / b_rad_sq;

        for (int py = by0; py < by1; py++) {
            float dy = (float)py - by;
            float dy_sq = dy * dy;
            uint32_t *row = &pixels[py * canvas_w];

            for (int px = bx0; px < bx1; px++) {
                float dx = (float)px - bx;
                float dist_sq = dx * dx + dy_sq;
                if (dist_sq > b_rad_sq) continue;

                float falloff = w_brush_falloff_smooth(dist_sq, inv_b_rad_sq);
                float bristle_flow = falloff * g_paint_charge * b->wetness * eff_p;
                uint32_t alpha_step = (uint32_t)(bristle_flow * 255.0f);
                if (alpha_step > 255) alpha_step = 255;
                if (alpha_step == 0) continue;

                uint32_t dst = row[px];
                uint32_t final_c = color;

                if (g_wet_mix > 0 && ((dst >> 24) & 0xFF) > 10) {
                    final_c = w_brush_blend_pigment(color, dst, 100 - (g_wet_mix / 2));
                }

                if (is_eraser) {
                    uint32_t da = (dst >> 24) & 0xFF;
                    uint32_t na = (da > alpha_step) ? (da - alpha_step) : 0;
                    row[px] = (na << 24) | (dst & 0x00FFFFFF);
                } else {
                    row[px] = w_brush_blend_over(final_c, dst, alpha_step);
                }
            }
        }
    }
}
