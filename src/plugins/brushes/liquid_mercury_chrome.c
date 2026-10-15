/**
 * =========================================================================
 * Molten Liquid Mercury & Chrome Metaballs (liquid_mercury_chrome.c)
 *
 * Fluid metal surface tension & specular environment reflection in C99:
 * - Fluid droplet coalescence and high-reflectance meniscus curves
 * - Analytical 3D normal vector reconstruction: $\vec{N} = (\frac{-dx}{R}, \frac{-dy}{R}, N_z)$
 * - High-contrast chrome Fresnel rim reflection with specular sun glare
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_reflectivity = 90;  /* 30..100: Specular chrome shine */
static int _param_viscosity = 65;     /* 10..100: Meniscus bulge stiffness */
static int _param_fresnel = 80;       /* 10..100: Glancing rim highlight */
static int _param_env_contrast = 75;  /* 10..100: Studio horizon reflection contrast */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"liquid_mercury_chrome\","
        "\"title\":\"Molten Liquid Mercury\","
        "\"category\":\"Fluid Metal\","
        "\"spacing\":0.05,"
        "\"minRadius\":5,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Reflectivity\",\"min\":30,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Meniscus Bulge\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Fresnel Rim\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Horizon Contrast\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_reflectivity = val; break;
        case 1: _param_viscosity = val; break;
        case 2: _param_fresnel = val; break;
        case 3: _param_env_contrast = val; break;
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
    float rad = radius * (0.85f + eff_p * 0.35f);

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(rad + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r = 1.0f / rad;
    float inv_r_sq = inv_r * inv_r;
    float refl = (float)_param_reflectivity * 0.01f;
    float fres = (float)_param_fresnel * 0.01f;
    float horizon_k = (float)_param_env_contrast * 0.02f;

    /* Virtual directional studio light vector (upper left) */
    float lx = -0.577f;
    float ly = -0.577f;
    float lz = 0.577f;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > rad * rad) continue;

            float dist_ratio = dist_sq * inv_r_sq;
            /* Hemisphere 3D normal vector */
            float nz = w_sqrtf(1.0f - dist_ratio);
            float nx = dx * inv_r;
            float ny = dy * inv_r;

            /* Fresnel glancing incidence: high reflectance at perimeter */
            float rim = (1.0f - nz);
            float fresnel_factor = rim * rim * fres;

            /* Environmental horizon line reflection */
            float env_y = ny * 3.0f + nz * 1.5f;
            float horizon = (env_y > 0.0f) ? 0.95f : (0.25f + 0.35f * (1.0f + env_y));
            horizon *= horizon_k;

            /* Specular highlight: dot(N, L) */
            float ndotl = nx * lx + ny * ly + nz * lz;
            if (ndotl < 0.0f) ndotl = 0.0f;
            float spec = ndotl * ndotl;
            spec = spec * spec;
            spec = spec * spec; /* spec^8 */

            /* Combine chrome metallic response */
            float chrome = (horizon * 0.5f + fresnel_factor * 0.4f + spec * 0.9f) * refl;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            uint32_t val = (uint32_t)(chrome * 255.0f);
            if (val > 255) val = 255;

            /* Tint with input color while preserving metallic chrome sheen */
            uint32_t cr = w_color_get_r(color);
            uint32_t cg = w_color_get_g(color);
            uint32_t cb = w_color_get_b(color);

            uint32_t r = (uint32_t)((float)cr * 0.3f + (float)val * 0.7f);
            uint32_t g = (uint32_t)((float)cg * 0.3f + (float)val * 0.7f);
            uint32_t b = (uint32_t)((float)cb * 0.3f + (float)val * 0.7f);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 250.0f);
            if (alpha > 255) alpha = 255;

            uint32_t merc_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(merc_c, row[x], alpha);
            }
        }
    }
}
