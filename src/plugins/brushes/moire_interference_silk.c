/**
 * =========================================================================
 * Woven Silk Moiré Wave Interference (moire_interference_silk.c)
 *
 * Micro-textile grid superposition & optical moiré fringes in C99:
 * - Two high-frequency periodic grating grids overlapping at slight angular rotation
 * - Macroscopic moiré beat waves shimmering with movement and stroke angle
 * - Lustrous silk fabric sheen with optical anisotropic reflection
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_grid_pitch = 4;      /* 2..10: Micro-weave pitch in pixels */
static int _param_twist_angle = 8;     /* 1..25: Grid angular rotation degrees */
static int _param_silk_luster = 85;    /* 20..100: Specular fabric sheen */
static int _param_wave_contrast = 75;  /* 20..100: Moiré fringe contrast */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"moire_interference_silk\","
        "\"title\":\"Woven Silk Moiré Waves\","
        "\"category\":\"Textiles\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Weave Pitch\",\"min\":2,\"max\":10,\"default\":4,\"unit\":\"px\"},"
            "{\"name\":\"Twist Angle\",\"min\":1,\"max\":25,\"default\":8,\"unit\":\"deg\"},"
            "{\"name\":\"Silk Luster\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Moiré Contrast\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_grid_pitch = (val < 2) ? 2 : (val > 10 ? 10 : val); break;
        case 1: _param_twist_angle = val; break;
        case 2: _param_silk_luster = val; break;
        case 3: _param_wave_contrast = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {}
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

    float pitch = (float)_param_grid_pitch;
    float inv_p = 6.2831853f / pitch;
    float theta = (float)_param_twist_angle * 0.0174532925f;
    float cos_t = w_cosf(theta);
    float sin_t = w_sinf(theta);

    float luster = (float)_param_silk_luster * 0.01f;
    float contrast = (float)_param_wave_contrast * 0.01f;
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

            /* Grid 1: Aligned to world coordinates */
            float g1_x = (float)x * inv_p;
            float g1_y = (float)y * inv_p;
            float weave1 = w_cosf(g1_x) * w_cosf(g1_y);

            /* Grid 2: Rotated by twist angle $\theta$ */
            float rx = (float)x * cos_t - (float)y * sin_t;
            float ry = (float)x * sin_t + (float)y * cos_t;
            float g2_x = rx * inv_p;
            float g2_y = ry * inv_p;
            float weave2 = w_cosf(g2_x) * w_cosf(g2_y);

            /* Optical Moiré Superposition Interference Beat */
            float moire_beat = (weave1 + weave2) * 0.5f;
            float fabric = 0.5f + moire_beat * contrast * 0.5f;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            /* Lustrous silk highlight */
            float silk_shimmer = (1.0f - fabric) * luster;
            uint32_t r = (uint32_t)((float)cr * fabric + 255.0f * silk_shimmer);
            uint32_t g = (uint32_t)((float)cg * fabric + 255.0f * silk_shimmer);
            uint32_t b = (uint32_t)((float)cb * fabric + 255.0f * silk_shimmer);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 245.0f);
            if (alpha > 255) alpha = 255;

            uint32_t silk_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(silk_c, row[x], alpha);
            }
        }
    }
}
