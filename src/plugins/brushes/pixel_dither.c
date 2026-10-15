/**
 * =========================================================================
 * Pixel Dither Brush (src/plugins/brushes/pixel_dither.c)
 *
 * Ordered Bayer Dithering & Pixel Art Grid Brush:
 * - Real-time Bayer Matrix (2x2, 4x4, 8x8) thresholding.
 * - Pressure sensitivity modulates dither density smoothly across the stroke.
 * - Configurable pixel-grid stepping (1x, 2x, 4x, 8x) for authentic retro shading.
 * - Clean binary pixel stamping with zero fuzzy anti-aliasing artifacts.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static const uint8_t BAYER_4X4[16] = {
     0,  8,  2, 10,
    12,  4, 14,  6,
     3, 11,  1,  9,
    15,  7, 13,  5
};

static const uint8_t BAYER_8X8[64] = {
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
};

static int g_grid_size = 1;     // 1, 2, 4, 8 pixels
static int g_matrix_mode = 1;   // 0=2x2, 1=4x4, 2=8x8
static int g_pattern_contrast = 100;
static int g_fill_density = 50;

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"pixel_dither\","
        "\"title\":\"Pixel Dither Shading\","
        "\"category\":\"Pixel Art\","
        "\"spacing\":0.05,"
        "\"minRadius\":2,"
        "\"maxRadius\":80,"
        "\"params\":["
            "{\"name\":\"Pixel Grid Size\",\"min\":1,\"max\":8,\"default\":1,\"unit\":\"px\"},"
            "{\"name\":\"Bayer Matrix (0=2x2,1=4x4,2=8x8)\",\"min\":0,\"max\":2,\"default\":1},"
            "{\"name\":\"Density Bias\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Contrast\",\"min\":20,\"max\":150,\"default\":100,\"unit\":\"%\"}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_grid_size = (value < 1) ? 1 : (value > 8 ? 8 : value); break;
        case 1: g_matrix_mode = (value < 0) ? 0 : (value > 2 ? 2 : value); break;
        case 2: g_fill_density = (value < 0) ? 0 : (value > 100 ? 100 : value); break;
        case 3: g_pattern_contrast = (value < 20) ? 20 : (value > 150 ? 150 : value); break;
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

    int grid = g_grid_size;
    int rad = (int)radius;
    int snap_cx = ((int)cx / grid) * grid;
    int snap_cy = ((int)cy / grid) * grid;

    int x0, y0, x1, y1;
    w_brush_compute_bounds(snap_cx, snap_cy, rad + grid, canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    // Snap bounds to grid
    x0 = (x0 / grid) * grid;
    y0 = (y0 / grid) * grid;

    float eff_p = (pressure > 0.01f) ? pressure : 0.5f;
    float base_threshold = (float)g_fill_density / 100.0f;
    // Pressure modulates density threshold
    float target_density = base_threshold * eff_p * 2.0f;
    if (target_density > 1.0f) target_density = 1.0f;

    float rad_sq = (float)(rad * rad);

    for (int y = y0; y < y1; y += grid) {
        float dy = (float)(y - snap_cy);
        float dy_sq = dy * dy;

        for (int x = x0; x < x1; x += grid) {
            float dx = (float)(x - snap_cx);
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > rad_sq) continue;

            // Compute distance falloff factor from center
            float smooth_falloff = w_brush_falloff_smooth(dist_sq, 1.0f / rad_sq);
            float local_density = target_density * (0.25f + 0.75f * smooth_falloff);

            // Bayer threshold lookup
            float bayer_val = 0.0f;
            if (g_matrix_mode == 0) {
                // 2x2 matrix
                int mx = (x / grid) & 1;
                int my = (y / grid) & 1;
                static const uint8_t b2[4] = { 0, 2, 3, 1 };
                bayer_val = (float)b2[my * 2 + mx] / 4.0f;
            } else if (g_matrix_mode == 1) {
                // 4x4 matrix
                int mx = (x / grid) & 3;
                int my = (y / grid) & 3;
                bayer_val = (float)BAYER_4X4[my * 4 + mx] / 16.0f;
            } else {
                // 8x8 matrix
                int mx = (x / grid) & 7;
                int my = (y / grid) & 7;
                bayer_val = (float)BAYER_8X8[my * 8 + mx] / 64.0f;
            }

            // Contrast adjustment
            float contrast = (float)g_pattern_contrast / 100.0f;
            float adjusted_density = (local_density - 0.5f) * contrast + 0.5f;

            if (adjusted_density < bayer_val) continue;

            // Stamp solid pixel or grid block
            for (int gy = 0; gy < grid; gy++) {
                int py = y + gy;
                if (py >= canvas_h) break;
                uint32_t *row = &pixels[py * canvas_w];

                for (int gx = 0; gx < grid; gx++) {
                    int px = x + gx;
                    if (px >= canvas_w) break;

                    if (is_eraser) {
                        row[px] = 0;
                    } else {
                        row[px] = color;
                    }
                }
            }
        }
    }
}
