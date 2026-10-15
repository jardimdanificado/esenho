/**
 * =========================================================================
 * Acoustic Cymatics & Chladni Plate Resonance (soundwave_cymatics.c)
 *
 * 2D acoustic plate eigenmode resonance & standing wave patterns in C99:
 * - Solves 2D Chladni plate wave equation:
 *   $w(x, y) = a \cos(n \pi x) \cos(m \pi y) - b \cos(m \pi x) \cos(n \pi y) = 0$
 * - Fine particulate sand accumulating precisely along vibration nodal lines
 * - Velocity-driven acoustic harmonic modes shifting sacred resonant geometry
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_mode_m = 3;         /* 1..8: Modal harmonic wavenumber M */
static int _param_mode_n = 5;         /* 1..8: Modal harmonic wavenumber N */
static int _param_nodal_sharp = 80;   /* 20..100: Nodal line sharpness */
static int _param_plate_damping = 65; /* 10..100: Boundary damping */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"soundwave_cymatics\","
        "\"title\":\"Chladni Acoustic Cymatics\","
        "\"category\":\"Acoustics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Harmonic Mode M\",\"min\":1,\"max\":8,\"default\":3,\"unit\":\"mode\"},"
            "{\"name\":\"Harmonic Mode N\",\"min\":1,\"max\":8,\"default\":5,\"unit\":\"mode\"},"
            "{\"name\":\"Nodal Sharpness\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Plate Damping\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_mode_m = val; break;
        case 1: _param_mode_n = val; break;
        case 2: _param_nodal_sharp = val; break;
        case 3: _param_plate_damping = val; break;
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

    float inv_r = 1.0f / radius;
    float inv_r_sq = inv_r * inv_r;

    /* Velocity adapts harmonic mode dynamically */
    int m = _param_mode_m + (int)(speed * 0.15f);
    int n = _param_mode_n + (int)(speed * 0.25f);
    if (m > 10) m = 10;
    if (n > 10) n = 10;

    float sharp = 2.0f + ((float)_param_nodal_sharp * 0.08f);

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Rotated normalized local plate coordinates [-1, 1] */
            float lx = (dx * cos_a + dy * sin_a) * inv_r;
            float ly = (-dx * sin_a + dy * cos_a) * inv_r;

            /* Chladni 2D standing eigenmode */
            float term1 = w_cosf((float)n * 3.14159f * lx) * w_cosf((float)m * 3.14159f * ly);
            float term2 = w_cosf((float)m * 3.14159f * lx) * w_cosf((float)n * 3.14159f * ly);
            float chladni = term1 - term2;
            if (chladni < 0.0f) chladni = -chladni;

            /* Nodal lines occur where vibration is zero (sand gathers here) */
            float nodal = 1.0f - chladni;
            if (nodal < 0.0f) nodal = 0.0f;
            nodal = w_fast_powf(nodal, sharp);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float density = nodal * falloff * eff_p;
            if (density <= 0.01f) continue;

            uint32_t alpha = (uint32_t)(density * 245.0f);
            if (alpha > 255) alpha = 255;

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(color, row[x], alpha);
            }
        }
    }
}
