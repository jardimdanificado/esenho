/**
 * =========================================================================
 * Negative-Index Metamaterial Invisibility Cloak (metamaterial_invisibility.c)
 *
 * Transformation optics & negative refractive index ($n < 0$) in C99:
 * - Veselago-Pendry negative index of refraction: reverse wavefront curvature
 * - Smooth cloaking boundary wrapping ambient canvas pixels seamlessly around core
 * - Evanescent wave amplification and phase-reversed photonic boundary
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_cloak_radius = 65;   /* 20..100: Cloaking core radius % */
static int _param_negative_n = 75;     /* 10..100: Negative index bending strength */
static int _param_evanescent_glow = 80;/* 10..100: Photonic crystal boundary glow */
static int _param_transparency = 90;   /* 30..100: Transmittance fidelity */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"metamaterial_invisibility\","
        "\"title\":\"Metamaterial Invisibility Cloak\","
        "\"category\":\"Metamaterials\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Cloaking Radius\",\"min\":20,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Negative Index N\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Evanescent Glow\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Transmittance\",\"min\":30,\"max\":100,\"default\":90,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_cloak_radius = val; break;
        case 1: _param_negative_n = val; break;
        case 2: _param_evanescent_glow = val; break;
        case 3: _param_transparency = val; break;
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

    float r_cloak = radius * ((float)_param_cloak_radius * 0.01f);
    float r_outer = radius;
    float neg_n = (float)_param_negative_n * 0.01f;
    float glow = (float)_param_evanescent_glow * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > r_outer * r_outer) continue;

            float r = w_sqrtf(dist_sq);
            if (r < 0.001f) continue;

            /* Transformation Optics coordinate mapping: compresses $r \in [r_{cloak}, r_{outer}]$ to wrap light */
            float r_mapped;
            if (r <= r_cloak) {
                /* Inside core: light is routed around, revealing shifted ambient background */
                r_mapped = r_cloak + (r / r_cloak) * (r_outer - r_cloak) * 0.5f;
            } else {
                /* Cloaking shell: Snell's law with negative refraction $n < 0$ */
                float t = (r - r_cloak) / (r_outer - r_cloak);
                r_mapped = r_cloak + (r_outer - r_cloak) * (t * (1.0f - neg_n * 0.35f) + neg_n * 0.35f);
            }

            float scale = r_mapped / r;
            int src_x = (int)(cx + dx * scale);
            int src_y = (int)(cy + dy * scale);

            if (src_x < 0) src_x = 0; else if (src_x >= canvas_w) src_x = canvas_w - 1;
            if (src_y < 0) src_y = 0; else if (src_y >= canvas_h) src_y = canvas_h - 1;

            uint32_t bg_col = pixels[src_y * canvas_w + src_x];
            uint32_t sr = w_color_get_r(bg_col);
            uint32_t sg = w_color_get_g(bg_col);
            uint32_t sb = w_color_get_b(bg_col);

            /* Evanescent boundary wave: subtle cyan-violet refraction fringe */
            float dist_to_boundary = (r > r_cloak) ? (r - r_cloak) : (r_cloak - r);
            float ev_band = r_cloak * 0.2f;
            float ev_glow = 0.0f;
            if (dist_to_boundary < ev_band) {
                ev_glow = 1.0f - (dist_to_boundary / ev_band);
                ev_glow = ev_glow * ev_glow * glow;
            }

            sr = (uint32_t)((float)sr + 30.0f * ev_glow);
            sg = (uint32_t)((float)sg + 180.0f * ev_glow);
            sb = (uint32_t)((float)sb + 255.0f * ev_glow);
            if (sr > 255) sr = 255;
            if (sg > 255) sg = 255;
            if (sb > 255) sb = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            uint32_t alpha = (uint32_t)(falloff * eff_p * 255.0f);
            if (alpha > 255) alpha = 255;

            uint32_t cloaked_c = w_color_pack(sr, sg, sb, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(cloaked_c, row[x], alpha);
            }
        }
    }
}
