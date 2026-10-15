/**
 * =========================================================================
 * Flexible Fiber Optic Strands & Total Internal Reflection (fiber_optic_strands.c)
 *
 * Micro-optical glass fiber wave-guiding & total internal reflection in C99:
 * - Bundle of distinct flexible silica fibers tracking along brush stroke
 * - Total internal reflection (TIR) with intense illuminated core end-facets
 * - Chromatic cladding light leakage & halo bloom at fiber tips
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define MAX_FIBERS 36

typedef struct {
    float offset_x;
    float offset_y;
    float length_mult;
    float phase;
} fiber_t;

static fiber_t _fibers[MAX_FIBERS];
static int _param_fiber_count = 24;    /* 8..36: Number of glass fiber strands */
static int _param_core_glow = 90;      /* 20..100: Fiber tip luminescent brightness */
static int _param_dispersion = 65;     /* 0..100: Chromatic prism leakage */
static int _param_spread = 70;         /* 10..100: Fiber bundle fanning spread */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"fiber_optic_strands\","
        "\"title\":\"Illuminated Fiber Optics\","
        "\"category\":\"Optics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Fiber Count\",\"min\":8,\"max\":36,\"default\":24,\"unit\":\"fibers\"},"
            "{\"name\":\"Core Brightness\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Chromatic Leakage\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Bundle Spread\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    w_brush_srand(0xF1BE8000);
    for (int i = 0; i < MAX_FIBERS; i++) {
        float a = w_brush_randf() * 6.2831853f;
        float r = w_sqrtf(w_brush_randf());
        _fibers[i].offset_x = r * w_cosf(a);
        _fibers[i].offset_y = r * w_sinf(a);
        _fibers[i].length_mult = 0.7f + w_brush_randf() * 0.6f;
        _fibers[i].phase = w_brush_randf() * 6.2831853f;
    }
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_fiber_count = (val < 8) ? 8 : (val > MAX_FIBERS ? MAX_FIBERS : val); break;
        case 1: _param_core_glow = val; break;
        case 2: _param_dispersion = val; break;
        case 3: _param_spread = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xF1B30000 ^ (uint32_t)(x * 53.0f + y * 59.0f));
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
    float spread_k = ((float)_param_spread * 0.01f) * (0.8f + eff_p * 0.5f);
    float glow_k = (float)_param_core_glow * 0.01f;
    float disp_k = (float)_param_dispersion * 0.01f;

    int n_fibers = _param_fiber_count;
    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    uint32_t base_r = w_color_get_r(color);
    uint32_t base_g = w_color_get_g(color);
    uint32_t base_b = w_color_get_b(color);

    /* Render each flexible glass fiber strand */
    for (int i = 0; i < n_fibers; i++) {
        fiber_t *fib = &_fibers[i];

        /* Flexible trailing lag along stroke direction */
        float lag = (1.0f - fib->length_mult) * radius * 0.8f;
        float fx = cx + (fib->offset_x * cos_a - fib->offset_y * sin_a) * radius * spread_k - cos_a * lag;
        float fy = cy + (fib->offset_x * sin_a + fib->offset_y * cos_a) * radius * spread_k - sin_a * lag;

        /* Fiber tip luminous core */
        float tip_r = 1.5f + eff_p * 1.5f;
        int bx0 = (int)(fx - tip_r - 1.0f);
        int by0 = (int)(fy - tip_r - 1.0f);
        int bx1 = (int)(fx + tip_r + 2.0f);
        int by1 = (int)(fy + tip_r + 2.0f);

        if (bx0 < 0) bx0 = 0; if (by0 < 0) by0 = 0;
        if (bx1 >= canvas_w) bx1 = canvas_w - 1;
        if (by1 >= canvas_h) by1 = canvas_h - 1;

        float inv_tip_sq = 1.0f / (tip_r * tip_r);

        /* Chromatic dispersion per fiber */
        float phase = fib->phase;
        uint32_t r = (uint32_t)((float)base_r * 0.4f + (180.0f + 75.0f * w_sinf(phase)) * 0.6f * disp_k);
        uint32_t g = (uint32_t)((float)base_g * 0.4f + (180.0f + 75.0f * w_sinf(phase + 2.09f)) * 0.6f * disp_k);
        uint32_t b = (uint32_t)((float)base_b * 0.4f + (180.0f + 75.0f * w_sinf(phase + 4.18f)) * 0.6f * disp_k);
        if (r > 255) r = 255;
        if (g > 255) g = 255;
        if (b > 255) b = 255;

        uint32_t tip_color = w_color_pack(r, g, b, 255);
        uint32_t core_white = w_color_pack(255, 255, 255, 255);

        for (int py = by0; py <= by1; py++) {
            float dy = (float)py - fy;
            uint32_t *row = pixels + (py * canvas_w);

            for (int px = bx0; px <= bx1; px++) {
                float dx = (float)px - fx;
                float d_sq = dx * dx + dy * dy;
                if (d_sq > tip_r * tip_r) continue;

                float falloff = w_brush_falloff_smooth(d_sq, inv_tip_sq);
                uint32_t alpha = (uint32_t)(falloff * 240.0f * glow_k * eff_p);
                if (alpha > 255) alpha = 255;

                if (is_eraser) {
                    uint32_t dst = row[px];
                    uint32_t da = (dst >> 24) & 0xFF;
                    row[px] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
                } else {
                    if (d_sq < (tip_r * 0.4f) * (tip_r * 0.4f)) {
                        /* Incandescent white glass core */
                        row[px] = w_brush_blend_add(core_white, row[px], alpha);
                    } else {
                        /* Chromatic fiber cladding emission */
                        row[px] = w_brush_blend_add(tip_color, row[px], alpha);
                    }
                }
            }
        }
    }
}
