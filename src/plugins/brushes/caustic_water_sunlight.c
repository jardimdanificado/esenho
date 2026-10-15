/**
 * =========================================================================
 * Underwater Shallow Pool Caustics & Refraction (caustic_water_sunlight.c)
 *
 * Real-time wave refraction & optical caustic focusing in C99:
 * - Computes surface wave normal derivatives & Snell's refraction focusing
 * - Interlocking bright caustic web network projected onto canvas
 * - Chromatic dispersion along caustic borders (aquamarine/cyan fringe)
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_wave_freq = 60;     /* 20..120: Water ripple frequency */
static int _param_focus_sharp = 75;   /* 20..100: Caustic beam concentration */
static int _param_dispersion = 65;    /* 0..100: Chromatic prism fringe */
static int _param_depth_atten = 70;   /* 10..100: Deep water blue absorption */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"caustic_water_sunlight\","
        "\"title\":\"Underwater Sun Caustics\","
        "\"category\":\"Aquatic\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Wave Frequency\",\"min\":20,\"max\":120,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Focus Sharpness\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Prism Dispersion\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Deep Water Attenuation\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_wave_freq = val; break;
        case 1: _param_focus_sharp = val; break;
        case 2: _param_dispersion = val; break;
        case 3: _param_depth_atten = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xCA0571C0 ^ (uint32_t)(x * 61.0f + y * 73.0f));
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
    float freq = (float)_param_wave_freq * 0.0025f;
    float sharp = 2.0f + ((float)_param_focus_sharp * 0.04f);
    float disp = (float)_param_dispersion * 0.01f;

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Continuous wave interference pattern in world space */
            float wx = (float)x * freq;
            float wy = (float)y * freq;

            /* 3 overlapping directional sinusoidal wave trains */
            float w1 = w_sinf(wx * 1.0f + wy * 0.3f);
            float w2 = w_sinf(wx * -0.6f + wy * 0.8f);
            float w3 = w_sinf(wx * 0.4f + wy * -0.9f);
            float wave_height = (w1 + w2 + w3) * 0.3333f;

            /* Approximate surface curvature (Laplacian focusing) */
            float dwx = w_cosf(wx * 1.0f + wy * 0.3f) - 0.6f * w_cosf(wx * -0.6f + wy * 0.8f);
            float dwy = 0.3f * w_cosf(wx * 1.0f + wy * 0.3f) + 0.8f * w_cosf(wx * -0.6f + wy * 0.8f);
            float focus = 1.0f - (dwx * dwx + dwy * dwy) * 0.45f;
            if (focus < 0.0f) focus = 0.0f;

            /* Concentrated caustic energy power response */
            float caustic = w_fast_powf(focus, sharp);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float intensity = caustic * falloff * eff_p;
            if (intensity <= 0.01f) continue;

            /* Chromatic refraction dispersion: Red deflected slightly less than Blue */
            float disp_offset = w_sinf(wx * 2.0f + wy * 2.0f) * disp * 0.2f;
            uint32_t r = (uint32_t)((180.0f + 75.0f * (intensity - disp_offset)));
            uint32_t g = (uint32_t)((230.0f + 25.0f * intensity));
            uint32_t b = (uint32_t)((255.0f));
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(intensity * 210.0f);
            if (alpha > 255) alpha = 255;

            uint32_t caustic_col = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(caustic_col, row[x], alpha);
            }
        }
    }
}
