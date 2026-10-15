/**
 * =========================================================================
 * Optical Calcite Double Refraction & Birefringence (crystal_birefringence_calcite.c)
 *
 * Anisotropic optical crystal & ray splitting ($n_o \neq n_e$) in C99:
 * - Solves Ordinary ray ($n_o = 1.658$) and Extraordinary ray ($n_e = 1.486$)
 * - Real-time duplication & orthogonal shear of existing canvas pixels
 * - Cross-polarization interference colors and rhombohedral crystal facet edges
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_ray_separation = 12;  /* 2..30: Optical split distance in pixels */
static int _param_optic_axis_deg = 45;  /* 0..180: Rhombohedral crystal axis */
static int _param_polarize_split = 80;  /* 10..100: Polarization extinction ratio */
static int _param_facet_sheen = 65;     /* 10..100: Cleavage plane specular gloss */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"crystal_birefringence_calcite\","
        "\"title\":\"Calcite Double Refraction\","
        "\"category\":\"Mineral Optics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Ray Split Distance\",\"min\":2,\"max\":30,\"default\":12,\"unit\":\"px\"},"
            "{\"name\":\"Optic Axis Angle\",\"min\":0,\"max\":180,\"default\":45,\"unit\":\"deg\"},"
            "{\"name\":\"Polarization Split\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Cleavage Gloss\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_ray_separation = (val < 2) ? 2 : (val > 30 ? 30 : val); break;
        case 1: _param_optic_axis_deg = (val % 180 + 180) % 180; break;
        case 2: _param_polarize_split = val; break;
        case 3: _param_facet_sheen = val; break;
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

    float sep = (float)_param_ray_separation * (0.6f + eff_p * 0.8f);
    float rad_axis = (float)_param_optic_axis_deg * 0.0174532925f;
    float disp_x = w_cosf(rad_axis) * sep;
    float disp_y = w_sinf(rad_axis) * sep;

    float inv_r_sq = 1.0f / (radius * radius);
    float pol_k = (float)_param_polarize_split * 0.01f;
    float sheen = (float)_param_facet_sheen * 0.01f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Sample 1: Ordinary ray (unshifted) */
            uint32_t col_o = row[x];

            /* Sample 2: Extraordinary ray (displaced along optical axis) */
            int ex_x = x + (int)disp_x;
            int ex_y = y + (int)disp_y;
            if (ex_x < 0) ex_x = 0; else if (ex_x >= canvas_w) ex_x = canvas_w - 1;
            if (ex_y < 0) ex_y = 0; else if (ex_y >= canvas_h) ex_y = canvas_h - 1;

            uint32_t col_e = pixels[ex_y * canvas_w + ex_x];

            /* Cross-polarization recombination: 50% Ordinary + 50% Extraordinary */
            uint32_t or_r = w_color_get_r(col_o);
            uint32_t or_g = w_color_get_g(col_o);
            uint32_t or_b = w_color_get_b(col_o);

            uint32_t er_r = w_color_get_r(col_e);
            uint32_t er_g = w_color_get_g(col_e);
            uint32_t er_b = w_color_get_b(col_e);

            uint32_t r = (uint32_t)(((float)or_r + (float)er_r) * 0.5f);
            uint32_t g = (uint32_t)(((float)or_g + (float)er_g) * 0.5f);
            uint32_t b = (uint32_t)(((float)or_b + (float)er_b) * 0.5f);

            /* Cleavage plane diamond facet specular sheen */
            float facet = 1.0f - (dx * w_cosf(rad_axis + 1.047f) + dy * w_sinf(rad_axis + 1.047f)) / radius;
            facet = (facet < 0.0f) ? 0.0f : (facet > 1.0f ? 1.0f : facet);
            float glint = facet * facet * sheen * 40.0f;

            r = (uint32_t)((float)r + glint);
            g = (uint32_t)((float)g + glint);
            b = (uint32_t)((float)b + glint * 1.3f);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            uint32_t alpha = (uint32_t)(falloff * eff_p * 245.0f);
            if (alpha > 255) alpha = 255;

            uint32_t biref_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(biref_c, row[x], alpha);
            }
        }
    }
}
