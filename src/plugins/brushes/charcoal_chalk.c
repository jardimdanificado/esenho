/**
 * =========================================================================
 * Charcoal & Chalk Brush (src/plugins/brushes/charcoal_chalk.c)
 *
 * Simulates dry fine-art media on rough textured paper:
 * - Micro-grain tooth simulation (peaks vs valleys).
 * - Pressure-thresholded valley penetration: light strokes catch only
 *   the peaks of the paper; heavy pressure forces pigment into the valleys.
 * - Dry edge friction and crumbling pigment texture.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int g_paper_roughness = 65;   // % grain depth
static int g_grain_scale = 2;        // 1 to 4 pixels per grain cell
static int g_pressure_depth = 80;    // % valley penetration responsiveness
static int g_crumble_noise = 30;     // % random edge crumbling

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"charcoal_chalk\","
        "\"title\":\"Charcoal & Rough Chalk\","
        "\"category\":\"Sketch\","
        "\"spacing\":0.20,"
        "\"minRadius\":4,"
        "\"maxRadius\":120,"
        "\"params\":["
            "{\"name\":\"Paper Roughness\",\"min\":20,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Grain Cell Scale\",\"min\":1,\"max\":4,\"default\":2,\"unit\":\"px\"},"
            "{\"name\":\"Valley Penetration\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Crumble Texture\",\"min\":0,\"max\":100,\"default\":30,\"unit\":\"%\"}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_paper_roughness = (value < 20) ? 20 : (value > 100 ? 100 : value); break;
        case 1: g_grain_scale = (value < 1) ? 1 : (value > 4 ? 4 : value); break;
        case 2: g_pressure_depth = (value < 20) ? 20 : (value > 100 ? 100 : value); break;
        case 3: g_crumble_noise = (value < 0) ? 0 : (value > 100 ? 100 : value); break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {}
W_EXPORT void w_brush_stroke_end(void) {}

// Fast deterministic 2D paper tooth generator
static inline float get_paper_tooth(int x, int y, int scale) {
    int gx = x / scale;
    int gy = y / scale;
    uint32_t h = ((uint32_t)gx * 374761393) ^ ((uint32_t)gy * 668265263);
    h = (h ^ (h >> 13)) * 1274126177;
    return (float)(h & 0xFF) * (1.0f / 255.0f);
}

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
    float rad = radius * (0.8f + eff_p * 0.4f);
    float rad_sq = rad * rad;
    float inv_rad_sq = (rad_sq > 0.01f) ? (1.0f / rad_sq) : 1.0f;

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(rad + 1.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    uint32_t base_a = w_color_get_a(color);
    float roughness = (float)g_paper_roughness * 0.01f;
    float penetration = ((float)g_pressure_depth * 0.01f) * eff_p;
    float crumble = (float)g_crumble_noise * 0.01f;
    int scale = g_grain_scale;

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        float dy_sq = dy * dy;
        uint32_t *row = &pixels[y * canvas_w];

        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > rad_sq) continue;

            float dist_ratio = dist_sq * inv_rad_sq; // 0.0 to 1.0
            float radial_falloff = 1.0f - dist_ratio;

            float tooth = get_paper_tooth(x, y, scale);

            float valley_threshold = 1.0f - (penetration * 0.95f) - (radial_falloff * 0.25f);
            if (valley_threshold < 0.05f) valley_threshold = 0.05f;

            if (tooth < valley_threshold * roughness) continue;

            if (crumble > 0.01f && dist_ratio > 0.5f) {
                uint32_t edge_hash = ((uint32_t)x * 1234567) ^ ((uint32_t)y * 7654321);
                if (((edge_hash & 0x7F) * (1.0f / 128.0f)) < crumble * dist_ratio) continue;
            }

            float deposit = (tooth - valley_threshold * roughness) / (1.0f - valley_threshold * roughness + 0.001f);
            deposit *= radial_falloff * (0.5f + eff_p * 0.5f);
            if (deposit > 1.0f) deposit = 1.0f;

            uint32_t alpha_step = (uint32_t)(deposit * (float)base_a);
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
