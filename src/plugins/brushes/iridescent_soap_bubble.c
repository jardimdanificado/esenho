/**
 * =========================================================================
 * Iridescent Soap Bubble Clusters & Newton Rings (iridescent_soap_bubble.c)
 *
 * Microscopic surfactant thin-film interference & bubble foam in C99:
 * - Spherical meniscus with Newton ring chromatic wave interference bands
 * - Crescent specular highlight reflections (upper-left sun glint)
 * - Translucent soap film coalescence allowing underlying artwork to show through
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_film_irid = 85;      /* 20..100: Newton ring rainbow saturation */
static int _param_translucency = 70;   /* 20..100: Membrane clarity */
static int _param_rim_specular = 80;   /* 20..100: Crescent glint brightness */
static int _param_interference_bands = 4; /* 1..8: Number of color bands */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"iridescent_soap_bubble\","
        "\"title\":\"Iridescent Soap Bubbles\","
        "\"category\":\"Optics\","
        "\"spacing\":0.06,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Film Iridescence\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Membrane Clarity\",\"min\":20,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Specular Glint\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Color Rings\",\"min\":1,\"max\":8,\"default\":4,\"unit\":\"bands\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_film_irid = val; break;
        case 1: _param_translucency = val; break;
        case 2: _param_rim_specular = val; break;
        case 3: _param_interference_bands = (val < 1) ? 1 : (val > 8 ? 8 : val); break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xB0B1E000 ^ (uint32_t)(x * 47.0f + y * 53.0f));
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

    float inv_r = 1.0f / radius;
    float inv_r_sq = inv_r * inv_r;
    float irid = (float)_param_film_irid * 0.01f;
    float clarity = (float)_param_translucency * 0.01f;
    float spec_boost = (float)_param_rim_specular * 0.01f;
    float n_bands = (float)_param_interference_bands;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float dist = w_sqrtf(dist_sq);
            float norm_d = dist * inv_r;

            /* Bubble boundary rim ring */
            float rim_factor = w_sinf(norm_d * 1.5707963f);
            rim_factor = rim_factor * rim_factor * rim_factor;

            /* Newton ring chromatic phase */
            float phase = norm_d * n_bands * 6.2831853f;
            float r_band = 0.5f + 0.5f * w_sinf(phase);
            float g_band = 0.5f + 0.5f * w_sinf(phase + 2.0943951f);
            float b_band = 0.5f + 0.5f * w_sinf(phase + 4.1887902f);

            /* Crescent specular highlight (upper left) */
            float glint_x = dx + radius * 0.35f;
            float glint_y = dy + radius * 0.35f;
            float glint_d_sq = glint_x * glint_x + glint_y * glint_y;
            float glint_r = radius * 0.22f;
            float glint = 0.0f;
            if (glint_d_sq < glint_r * glint_r) {
                glint = 1.0f - (glint_d_sq / (glint_r * glint_r));
                glint = glint * glint * spec_boost;
            }

            /* Combine film colors */
            uint32_t r = (uint32_t)((r_band * irid * 180.0f + 60.0f + glint * 200.0f));
            uint32_t g = (uint32_t)((g_band * irid * 180.0f + 60.0f + glint * 200.0f));
            uint32_t b = (uint32_t)((b_band * irid * 180.0f + 60.0f + glint * 200.0f));
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float membrane_alpha = (rim_factor * 0.8f + glint * 0.9f) * (1.0f - clarity * 0.4f) * falloff * eff_p;
            if (membrane_alpha <= 0.01f) continue;

            uint32_t alpha = (uint32_t)(membrane_alpha * 240.0f);
            if (alpha > 255) alpha = 255;

            uint32_t bubble_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(bubble_c, row[x], alpha);
            }
        }
    }
}
