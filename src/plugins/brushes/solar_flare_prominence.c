/**
 * =========================================================================
 * Solar Coronal Loops & Chromospheric Prominence (solar_flare_prominence.c)
 *
 * Magnetohydrodynamic solar plasma & coronal magnetic arches in C99:
 * - Arching magnetic flux loops trapped above the solar photosphere
 * - Superheated ionized plasma ($10^6$ K) circulating along magnetic field lines
 * - Thermonuclear footpoint flare kernels with intense ultraviolet/extreme emission
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_loop_height = 80;    /* 20..150: Coronal loop arch altitude */
static int _param_plasma_heat = 90;    /* 20..100: Extreme UV & X-ray brilliance */
static int _param_flux_filaments = 6;  /* 2..12: Magnetic flux tube strands */
static int _param_footpoint_glow = 85; /* 20..100: Photospheric flare kernel */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"solar_flare_prominence\","
        "\"title\":\"Solar Coronal Prominence\","
        "\"category\":\"Heliophysics\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Loop Arch Height\",\"min\":20,\"max\":150,\"default\":80,\"unit\":\"px\"},"
            "{\"name\":\"Plasma Heat\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Flux Filaments\",\"min\":2,\"max\":12,\"default\":6,\"unit\":\"tubes\"},"
            "{\"name\":\"Footpoint Kernel\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_loop_height = val; break;
        case 1: _param_plasma_heat = val; break;
        case 2: _param_flux_filaments = (val < 2) ? 2 : (val > 12 ? 12 : val); break;
        case 3: _param_footpoint_glow = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x501A8000 ^ (uint32_t)(x * 83.0f + y * 89.0f));
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
    float loop_h = (float)_param_loop_height * (0.6f + eff_p * 0.7f);
    float heat = (float)_param_plasma_heat * 0.01f;
    int n_filaments = _param_flux_filaments;

    float reach_r = radius + loop_h;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(reach_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    /* Perpendicular normal for arching vertical direction */
    float norm_x = -sin_a;
    float norm_y = cos_a;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > reach_r * reach_r) continue;

            /* Project onto stroke tangent and normal */
            float proj_tang = dx * cos_a + dy * sin_a;
            float proj_norm = dx * norm_x + dy * norm_y;

            /* Parabolic magnetic loop equation: $H(u) = H_{max} (1 - (u / R)^2)$ */
            float u_norm = proj_tang / (radius + 0.1f);
            if (u_norm < -1.0f || u_norm > 1.0f) continue;

            float expected_arch = loop_h * (1.0f - u_norm * u_norm);
            if (expected_arch < 0.0f) expected_arch = 0.0f;

            /* Multi-strand filament bundle offset */
            float filament_phase = w_sinf(proj_tang * 0.25f);
            float dist_to_arch = proj_norm - (expected_arch + filament_phase * 4.0f);
            if (dist_to_arch < 0.0f) dist_to_arch = -dist_to_arch;

            float tube_w = 2.0f + eff_p * 3.5f;
            if (dist_to_arch > tube_w * 2.0f) continue;

            float plasma_factor = 1.0f - (dist_to_arch / (tube_w * 2.0f));
            plasma_factor = plasma_factor * plasma_factor;

            /* Coronal flare temperature ramp: Incandescent white-yellow core with ruby-orange edges */
            uint32_t r = 255;
            uint32_t g = (uint32_t)(80.0f + 175.0f * plasma_factor * heat);
            uint32_t b = (uint32_t)(10.0f + 140.0f * plasma_factor * heat);
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            float edge_falloff = 1.0f - (u_norm * u_norm);
            uint32_t alpha = (uint32_t)(plasma_factor * edge_falloff * 255.0f * eff_p);
            if (alpha > 255) alpha = 255;
            if (alpha <= 2) continue;

            uint32_t solar_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(solar_c, row[x], alpha);
            }
        }
    }
}
