/**
 * =========================================================================
 * Cartographic Topographic Contour Isolines (topographic_contour_isolines.c)
 *
 * Real-time continuous elevation fields & mathematical isolines in C99:
 * - Solves height scalar field $h(x, y)$ with continuous spatial octaves
 * - Mathematical contour extraction: sharp isolines where $h \pmod{\Delta h} < \epsilon$
 * - Index contours (bold every 5 lines) and slope shading for terrain mapping
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_contour_interval = 8; /* 3..20: Elevation line step in pixels */
static int _param_terrain_rough = 60;   /* 10..100: Topographic terrain frequency */
static int _param_line_sharpness = 85;  /* 20..100: Vector isoline crispness */
static int _param_slope_shading = 50;   /* 0..100: Terrain hillshade relief */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"topographic_contour_isolines\","
        "\"title\":\"Topographic Contour Isolines\","
        "\"category\":\"Cartography\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Contour Interval\",\"min\":3,\"max\":20,\"default\":8,\"unit\":\"px\"},"
            "{\"name\":\"Terrain Roughness\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Line Sharpness\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Slope Shading\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_contour_interval = (val < 3) ? 3 : (val > 20 ? 20 : val); break;
        case 1: _param_terrain_rough = val; break;
        case 2: _param_line_sharpness = val; break;
        case 3: _param_slope_shading = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x7090C000 ^ (uint32_t)(x * 61.0f + y * 67.0f));
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

    float interval = (float)_param_contour_interval;
    float inv_interval = 1.0f / interval;
    float freq = 0.015f + ((float)_param_terrain_rough * 0.0005f);
    float sharp = (float)_param_line_sharpness * 0.01f;
    float hillshade = (float)_param_slope_shading * 0.01f;
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

            /* Continuous elevation scalar in world coordinates */
            float wx = (float)x * freq;
            float wy = (float)y * freq;

            float h1 = w_sinf(wx * 1.0f + wy * 0.4f);
            float h2 = w_cosf(wx * -0.6f + wy * 0.8f);
            float h3 = w_sinf(wx * 2.1f - wy * 1.7f) * 0.35f;
            float elev = (h1 + h2 + h3 + 2.5f) * 40.0f;

            /* Modulo elevation interval */
            float norm_val = elev * inv_interval;
            float line_phase = norm_val - w_floorf(norm_val);
            float dist_to_isoline = line_phase - 0.5f;
            if (dist_to_isoline < 0.0f) dist_to_isoline = -dist_to_isoline;

            /* Index contour check (every 5th line is thicker and bolder) */
            int line_idx = (int)norm_val;
            int is_index_line = (line_idx % 5 == 0);
            float target_width = is_index_line ? 0.12f : 0.06f;

            if (dist_to_isoline > target_width * 2.0f) {
                if (hillshade <= 0.05f) continue;
            }

            float line_factor = 1.0f - (dist_to_isoline / (target_width * 2.0f));
            if (line_factor < 0.0f) line_factor = 0.0f;
            line_factor = line_factor * line_factor * sharp;

            /* Slope hillshade gradient */
            float slope_light = 1.0f;
            if (hillshade > 0.05f) {
                float dhx = w_cosf(wx * 1.0f + wy * 0.4f) * freq;
                float dhy = -w_sinf(wx * -0.6f + wy * 0.8f) * freq;
                slope_light = 0.85f + (dhx - dhy) * 8.0f * hillshade;
            }

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            float total_alpha = (line_factor * 0.85f + (1.0f - line_factor) * hillshade * 0.25f) * falloff * eff_p;
            if (total_alpha <= 0.01f) continue;

            uint32_t r = (uint32_t)((float)cr * slope_light);
            uint32_t g = (uint32_t)((float)cg * slope_light);
            uint32_t b = (uint32_t)((float)cb * slope_light);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(total_alpha * 250.0f);
            if (alpha > 255) alpha = 255;

            uint32_t topo_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(topo_c, row[x], alpha);
            }
        }
    }
}
