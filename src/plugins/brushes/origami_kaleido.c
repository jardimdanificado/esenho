/**
 * =========================================================================
 * Hyperbolic Poincaré & Fractal Origami Kaleidoscope (origami_kaleido.c)
 *
 * Real-time non-Euclidean hyperbolic geometry & kaleidoscopic folding in C99:
 * - Poincaré disk conformal mapping and Möbius transformation
 * - N-fold dihedral kaleidoscopic reflection mirrors (D4 to D16)
 * - Renders intricate fractal origami rosettes and sacred geometry in real time
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_order = 8;        /* 4..16: N-fold dihedral symmetry order */
static int _param_curvature = 65;   /* 0..100: Hyperbolic disk curvature */
static int _param_crease = 45;      /* 0..90: Origami crease facet angle */
static int _param_bloom = 70;       /* 0..100: Kaleido crystal bloom */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"origami_kaleido\","
        "\"title\":\"Poincare Origami Kaleidoscope\","
        "\"category\":\"Sacred Geometry\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":180,"
        "\"params\":["
            "{\"name\":\"Symmetry Fold (N)\",\"min\":4,\"max\":16,\"default\":8,\"unit\":\"folds\"},"
            "{\"name\":\"Hyperbolic Warp\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Origami Crease\",\"min\":0,\"max\":90,\"default\":45,\"unit\":\"deg\"},"
            "{\"name\":\"Crystal Bloom\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_order = (val < 4) ? 4 : (val > 16 ? 16 : val); break;
        case 1: _param_curvature = val; break;
        case 2: _param_crease = val; break;
        case 3: _param_bloom = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xCAFEBA1E ^ (uint32_t)(x * 79.0f + y * 83.0f));
}

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
    if (radius < 4.0f) radius = 4.0f;

    int n_fold = _param_order;
    float sector_angle = 6.2831853f / (float)n_fold;
    float half_sector = sector_angle * 0.5f;

    float curv = ((float)_param_curvature / 100.0f) * 1.8f;
    float crease_rad = (float)_param_crease * 0.017453f;
    float bloom_factor = ((float)_param_bloom / 100.0f);

    int x0 = (int)(cx - radius); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - radius); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + radius); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + radius); if (y1 >= canvas_h) y1 = canvas_h - 1;

    float inv_r = 1.0f / radius;

    uint32_t tint_r = color & 0xFF;
    uint32_t tint_g = (color >> 8) & 0xFF;
    uint32_t tint_b = (color >> 16) & 0xFF;

    for (int y = y0; y <= y1; y++) {
        float fdy = (float)y - cy;
        float dy_sq = fdy * fdy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float fdx = (float)x - cx;
            float r_sq = fdx * fdx + dy_sq;
            if (r_sq > radius * radius) continue;

            float r = w_sqrtf(r_sq);
            if (r < 0.001f) r = 0.001f;

            /* 1. Dihedral Kaleidoscope Polar Folding */
            float theta = w_atan2f(fdy, fdx);
            if (theta < 0.0f) theta += 6.2831853f;

            /* Fold into principal fundamental domain [0, half_sector] */
            float sector_idx = theta / sector_angle;
            float local_theta = theta - (float)((int)sector_idx) * sector_angle;
            if (local_theta > half_sector) {
                local_theta = sector_angle - local_theta;
            }

            /* 2. Hyperbolic Poincaré Conformal Mapping */
            float norm_r = r * inv_r; /* in [0, 1] */
            if (curv > 0.01f) {
                /* Radial dilation approaching Poincaré disk horizon */
                norm_r = (2.0f * norm_r) / (1.0f + norm_r * norm_r * curv);
                if (norm_r > 1.0f) norm_r = 1.0f;
            }

            /* 3. Origami Crease & Facet Lighting */
            float fold_dist = local_theta / half_sector; /* 0 at center, 1 at mirror fold */
            float crease_line = w_fabsf(fold_dist - 0.5f) * 2.0f;
            float facet_shadow = w_cosf(crease_rad * crease_line);

            /* Radial ring resonance (standing harmonic mandalas) */
            float ring_freq = (float)n_fold * 1.5f;
            float ring_pattern = w_cosf(norm_r * ring_freq * 3.14159f);
            float intensity = (ring_pattern * 0.5f + 0.5f) * facet_shadow;

            /* Edge bloom with smooth Hermite falloff */
            float u = 1.0f - norm_r;
            float edge_falloff = (u > 0.0f) ? (u * u * (3.0f - 2.0f * u)) : 0.0f;
            float alpha_f = intensity * edge_falloff * pressure * 255.0f;
            if (alpha_f <= 0.0f) continue;
            uint32_t alpha = (uint32_t)alpha_f;
            if (alpha > 255) alpha = 255;

            /* Iridescent color rotation across origami folds */
            float phase_shift = fold_dist * 2.094f;
            uint32_t cr = (uint32_t)((float)tint_r * (0.6f + 0.4f * w_cosf(phase_shift)));
            uint32_t cg = (uint32_t)((float)tint_g * (0.6f + 0.4f * w_cosf(phase_shift + 2.094f)));
            uint32_t cb = (uint32_t)((float)tint_b * (0.6f + 0.4f * w_cosf(phase_shift + 4.188f)));

            if (cr > 255) cr = 255;
            if (cg > 255) cg = 255;
            if (cb > 255) cb = 255;

            /* Bright central crystal core */
            if (crease_line < 0.15f) {
                cr = (cr + 120 > 255) ? 255 : cr + 120;
                cg = (cg + 120 > 255) ? 255 : cg + 120;
                cb = (cb + 120 > 255) ? 255 : cb + 120;
            }

            uint32_t final_pix = w_color_pack(cr, cg, cb, alpha);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > alpha) ? da - alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                if (bloom_factor > 0.5f) {
                    row[x] = w_brush_blend_add(final_pix, row[x], (uint32_t)(bloom_factor * 255.0f));
                } else {
                    row[x] = w_brush_blend_over(final_pix, row[x], 255);
                }
            }
        }
    }
}

void w_brush_stroke_end(void) {
}
