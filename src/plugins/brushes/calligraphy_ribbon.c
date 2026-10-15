/**
 * =========================================================================
 * Calligraphy Ribbon Brush (src/plugins/brushes/calligraphy_ribbon.c)
 *
 * Simulates broad-edge calligraphy nibs and Pilot Parallel pens:
 * - Flat chisel nib with configurable angle (default 45° for italic/gothic).
 * - High aspect ratio creating dynamic stroke contrast (hairlines vs broad downstrokes).
 * - Subpixel analytical edge anti-aliasing.
 * - Pressure controls ink flow and slight nib spread.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int g_nib_angle = 45;      // degrees
static int g_flatness = 85;       // % aspect ratio reduction (thickness vs width)
static int g_ink_flow = 90;       // % flow density
static int g_tilt_tracking = 1;   // 1=follow pen tilt/angle, 0=fixed angle

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"calligraphy_ribbon\","
        "\"title\":\"Calligraphy Ribbon Nib\","
        "\"category\":\"Inking\","
        "\"spacing\":0.04,"
        "\"minRadius\":4,"
        "\"maxRadius\":100,"
        "\"params\":["
            "{\"name\":\"Nib Angle\",\"min\":0,\"max\":180,\"default\":45,\"unit\":\"deg\"},"
            "{\"name\":\"Flatness\",\"min\":50,\"max\":98,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Ink Flow\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Tilt Tracking (0=off, 1=on)\",\"min\":0,\"max\":1,\"default\":1}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_nib_angle = (value % 180 + 180) % 180; break;
        case 1: g_flatness = (value < 50) ? 50 : (value > 98 ? 98 : value); break;
        case 2: g_ink_flow = (value < 20) ? 20 : (value > 100 ? 100 : value); break;
        case 3: g_tilt_tracking = (value != 0) ? 1 : 0; break;
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

    float angle_deg_eff = (float)g_nib_angle;
    if (g_tilt_tracking && (w_sinf(angle_deg * 0.01745329f) != 0.0f || w_cosf(angle_deg * 0.01745329f) != 0.0f)) {
        angle_deg_eff = (float)g_nib_angle + angle_deg * 0.25f;
    }
    float rad_angle = angle_deg_eff * 0.0174532925f;
    float cos_a = w_cosf(rad_angle);
    float sin_a = w_sinf(rad_angle);

    float major_r = radius * (0.8f + eff_p * 0.4f);
    float minor_r = major_r * (1.0f - (float)g_flatness * 0.01f);
    if (minor_r < 0.75f) minor_r = 0.75f;

    int max_dim = (int)(major_r + 1.0f);
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, max_dim, canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    uint32_t base_a = w_color_get_a(color);
    float flow_mult = (float)g_ink_flow * 0.01f;
    float inv_major_sq = 1.0f / (major_r * major_r);
    float inv_minor_sq = 1.0f / (minor_r * minor_r);

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = &pixels[y * canvas_w];

        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;

            float local_x = dx * cos_a + dy * sin_a;
            float local_y = -dx * sin_a + dy * cos_a;

            float ellipse_eq = (local_x * local_x) * inv_major_sq + (local_y * local_y) * inv_minor_sq;
            if (ellipse_eq > 1.0f) continue;

            float edge_dist = 1.0f - ellipse_eq;
            float aa = w_smoothstep(0.0f, 0.25f, edge_dist);

            uint32_t alpha_step = (uint32_t)(aa * flow_mult * 255.0f);
            if (alpha_step > 255) alpha_step = 255;
            if (alpha_step == 0) continue;

            uint32_t dst = row[x];
            if (is_eraser) {
                uint32_t da = (dst >> 24) & 0xFF;
                uint32_t na = (da > alpha_step) ? (da - alpha_step) : 0;
                row[x] = (na << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(color, dst, alpha_step);
            }
        }
    }
}
