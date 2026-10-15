/**
 * =========================================================================
 * Superfluid Helium-4 Quantized Vortex Lattice (superfluid_helium_vortices.c)
 *
 * Quantum macroscopic hydrodynamics & circulation quanta ($\kappa = h/m$) in C99:
 * - Rotating Bose-Einstein condensate forming an Abrikosov-type triangular vortex array
 * - Singularity vortex cores with zero fluid viscosity and quantized phase phase-windings
 * - Quantum hydrodynamic circulation phase halos around microscopic vortex filaments
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_lattice_pitch = 12;  /* 6..28: Distance between quantum vortices */
static int _param_core_sharpness = 85; /* 20..100: Vortex singularity sharpness */
static int _param_phase_wind = 70;     /* 10..100: Quantum phase spiral halo */
static int _param_bose_glow = 80;      /* 20..100: Condensate macroscopic coherence glow */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"superfluid_helium_vortices\","
        "\"title\":\"Superfluid Quantum Vortices\","
        "\"category\":\"Quantum Fluid\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Vortex Lattice Pitch\",\"min\":6,\"max\":28,\"default\":12,\"unit\":\"px\"},"
            "{\"name\":\"Singularity Sharpness\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Quantum Circulation\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Condensate Coherence\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_lattice_pitch = (val < 6) ? 6 : (val > 28 ? 28 : val); break;
        case 1: _param_core_sharpness = val; break;
        case 2: _param_phase_wind = val; break;
        case 3: _param_bose_glow = val; break;
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

    float pitch = (float)_param_lattice_pitch;
    float inv_pitch = 1.0f / pitch;
    float row_h = pitch * 0.8660254f; /* sqrt(3)/2 for triangular lattice */
    float inv_row_h = 1.0f / row_h;

    float circ_k = (float)_param_phase_wind * 0.01f;
    float coherence = (float)_param_bose_glow * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Map to triangular hexagonal vortex lattice in world coordinates */
            float row_idx = w_floorf((float)y * inv_row_h);
            float row_offset = ((int)row_idx & 1) ? (pitch * 0.5f) : 0.0f;
            float col_idx = w_floorf(((float)x + row_offset) * inv_pitch);

            float center_x = col_idx * pitch - row_offset + pitch * 0.5f;
            float center_y = row_idx * row_h + row_h * 0.5f;

            float v_dx = (float)x - center_x;
            float v_dy = (float)y - center_y;
            float v_dist_sq = v_dx * v_dx + v_dy * v_dy;
            float v_dist = w_sqrtf(v_dist_sq);

            /* Vortex core hollow singularity ($r \to 0$, density drops to 0) */
            float healing_len = 1.8f; /* Condensate healing length $\xi$ */
            float density_profile = v_dist / w_sqrtf(v_dist_sq + healing_len * healing_len);

            /* Quantum Phase Circulation $\theta = \arctan(y, x)$ */
            float phase_ang = (v_dist > 0.001f) ? w_sinf(v_dx / v_dist) : 0.0f;
            float circulation_spiral = 0.5f + 0.5f * w_sinf(phase_ang * 2.0f + v_dist * 0.35f);

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            /* Condensate quantum fluid coloring: liquid neon cyan/sapphire with dark hollow vortex cores */
            float fluid_lum = density_profile * (0.75f + 0.25f * circulation_spiral * circ_k);
            uint32_t r = (uint32_t)(40.0f * fluid_lum);
            uint32_t g = (uint32_t)(210.0f * fluid_lum);
            uint32_t b = (uint32_t)(255.0f * fluid_lum);
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * density_profile * 240.0f * coherence * eff_p);
            if (alpha > 255) alpha = 255;

            uint32_t vortex_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(vortex_c, row[x], alpha);
            }
        }
    }
}
