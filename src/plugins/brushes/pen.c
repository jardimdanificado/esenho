/**
 * =========================================================================
 * Zero-Copy WASM Brush: pen (pen.c)
 * Category: general
 * AOT Compiled for Esenho Zero-Copy WebAssembly Brush Protocol
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int32_t g_size = 4;
static int32_t g_opacity = 100;
static int32_t g_hardness = 100;
static int32_t g_flow = 100;
static int32_t g_spacing = 4;
static int32_t g_shape = 0;
static int32_t g_smoothing = 25;
static float g_depletion_charge = 1.0f;
static float g_stroke_dist = 0.0f;

W_EXPORT const char* w_brush_get_info(void) {
    return "{\"name\":\"pen\",\"title\":\"pen\",\"category\":\"general\",\"engine\":\"parametric\",\"spacing\":0.04,\"minRadius\":1,\"maxRadius\":100,\"params\":[{\"id\":\"size\",\"name\":\"Size\",\"type\":\"int\",\"min\":1,\"max\":100,\"default\":4,\"unit\":\"px\"},{\"id\":\"opacity\",\"name\":\"Opacity\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"},{\"id\":\"hardness\",\"name\":\"Hardness\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"},{\"id\":\"flow\",\"name\":\"Flow\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"},{\"id\":\"spacing\",\"name\":\"Spacing\",\"type\":\"int\",\"min\":1,\"max\":100,\"default\":4,\"unit\":\"%\"},{\"id\":\"shape\",\"name\":\"Tip Shape\",\"type\":\"int\",\"min\":0,\"max\":5,\"default\":0},{\"id\":\"smoothing\",\"name\":\"Streamline Smoothing\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":25,\"unit\":\"%\"}]}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    (void)canvas_w;
    (void)canvas_h;
    g_depletion_charge = 1.0f;
    g_stroke_dist = 0.0f;
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_size = value; break;
        case 1: g_opacity = value; break;
        case 2: g_hardness = value; break;
        case 3: g_flow = value; break;
        case 4: g_spacing = value; break;
        case 5: g_shape = value; break;
        case 6: g_smoothing = value; break;
        default: break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    (void)pressure;
    (void)tilt_x;
    (void)tilt_y;
    (void)color;
    (void)is_eraser;
    g_depletion_charge = 1.0f;
    g_stroke_dist = 0.0f;
    w_brush_srand((uint32_t)(x * 1234.5f + y * 678.9f + 1.0f));
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
    if (!pixels || canvas_w <= 0 || canvas_h <= 0) return;

    float eff_pressure = (pressure > 0.01f) ? pressure : 0.5f;
    float eff_r = radius;

    if (eff_r < 0.5f) eff_r = 0.5f;
    float eff_r_sq = eff_r * eff_r;

    int bound = (int)(eff_r + 3.0f);
    int x0 = (int)(cx - bound);
    int y0 = (int)(cy - bound);
    int x1 = (int)(cx + bound + 1);
    int y1 = (int)(cy + bound + 1);

    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > canvas_w) x1 = canvas_w;
    if (y1 > canvas_h) y1 = canvas_h;
    if (x0 >= x1 || y0 >= y1) return;

    float base_alpha = (float)((color >> 24) & 0xFF) / 255.0f;
    if (base_alpha <= 0.001f) base_alpha = 1.0f;
    base_alpha *= ((float)g_flow / 100.0f);
    base_alpha *= ((float)g_opacity / 100.0f);

    int hardness = 80;
    hardness = g_hardness;

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = &pixels[y * canvas_w];
        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
            float dist = w_sqrtf(dx * dx + dy * dy);
            if (dist > eff_r) continue;

            float falloff = w_brush_falloff_hardness(dist, eff_r, hardness);
            if (falloff <= 0.001f) continue;

            uint32_t a_val = (uint32_t)(base_alpha * falloff * 255.0f);
            if (a_val > 255) a_val = 255;
            if (a_val == 0) continue;

            uint32_t cur_p = row[x];
            if (is_eraser) {
                row[x] = w_brush_blend_erase(cur_p, a_val);
            } else {
                row[x] = w_brush_blend_over(color, cur_p, a_val);
            }
        }
    }
}
