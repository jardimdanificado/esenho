/**
 * =========================================================================
 * Quantum Orbital Probability Cloud & Wavefunction (quantum_probability_cloud.c)
 *
 * Quantum mechanical electron probability density $|\psi(r, \theta)|^2$ in C99:
 * - Spherical harmonic orbitals ($s, p, d$ nodal orbital lobes)
 * - Born rule stochastic particle collapse (electron position eigenstates)
 * - Phase interference fringes with quantum wave luminescence
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_orbital_type = 2;    /* 0=s-orbital, 1=p-orbital (dipole), 2=d-orbital (clover), 3=hybrid */
static int _param_cloud_density = 75;  /* 20..100: Quantum cloud opacity */
static int _param_collapsed_dots = 40; /* 0..100: Stochastic electron eigenstate hits */
static int _param_phase_glow = 80;     /* 10..100: Wavefunction phase glow */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"quantum_probability_cloud\","
        "\"title\":\"Quantum Probability Orbital\","
        "\"category\":\"Quantum Physics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Orbital Type (0=s,1=p,2=d,3=hyb)\",\"min\":0,\"max\":3,\"default\":2},"
            "{\"name\":\"Cloud Density\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Stochastic Hits\",\"min\":0,\"max\":100,\"default\":40,\"unit\":\"dots\"},"
            "{\"name\":\"Phase Glow\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_orbital_type = (val < 0) ? 0 : (val > 3 ? 3 : val); break;
        case 1: _param_cloud_density = val; break;
        case 2: _param_collapsed_dots = val; break;
        case 3: _param_phase_glow = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x751A0B17 ^ (uint32_t)(x * 97.0f + y * 101.0f));
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
    float glow_boost = (float)_param_phase_glow * 0.01f;

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    int orb = _param_orbital_type;

    /* 1. Continuous Wavefunction $|\psi|^2$ Cloud */
    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float lx = (dx * cos_a + dy * sin_a) * inv_r;
            float ly = (-dx * sin_a + dy * cos_a) * inv_r;
            float r_norm = w_sqrtf(lx * lx + ly * ly);

            /* Radial probability decay */
            float r_decay = w_sinf(r_norm * 3.14159f);
            if (r_decay < 0.0f) r_decay = 0.0f;

            /* Angular spherical harmonic lobes */
            float angular = 1.0f;
            if (orb == 1) {
                /* p-orbital: dipole along x-axis */
                angular = lx;
            } else if (orb == 2) {
                /* d-orbital: 4-leaf clover lx * ly */
                angular = lx * ly * 2.0f;
            } else if (orb == 3) {
                /* sp2 hybrid orbital */
                angular = (lx * 1.5f + (lx * lx - ly * ly) * 0.5f);
            }

            float psi_sq = angular * angular * r_decay;
            if (psi_sq > 1.0f) psi_sq = 1.0f;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float prob = psi_sq * falloff * eff_p;
            if (prob <= 0.01f) continue;

            /* Quantum phase chromatic glow: positive phase cyan, negative phase violet */
            uint32_t r, g, b;
            if (angular >= 0.0f) {
                r = (uint32_t)(40.0f + 120.0f * prob);
                g = (uint32_t)(220.0f + 35.0f * prob);
                b = (uint32_t)(255.0f);
            } else {
                r = (uint32_t)(200.0f + 55.0f * prob);
                g = (uint32_t)(50.0f + 80.0f * prob);
                b = (uint32_t)(255.0f);
            }
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(prob * 230.0f * glow_boost);
            if (alpha > 255) alpha = 255;

            uint32_t quant_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(quant_c, row[x], alpha);
            }
        }
    }

    /* 2. Born rule stochastic eigenstate hits */
    int hits = (int)(((float)_param_collapsed_dots * 0.01f) * 12.0f * eff_p);
    for (int i = 0; i < hits; i++) {
        float hx = w_brush_rand_symf();
        float hy = w_brush_rand_symf();
        if (hx * hx + hy * hy > 0.85f) continue;

        int px = (int)(cx + hx * radius);
        int py = (int)(cy + hy * radius);
        if (px >= 0 && px < canvas_w && py >= 0 && py < canvas_h) {
            uint32_t hit_c = w_color_pack(255, 255, 255, 255);
            pixels[py * canvas_w + px] = w_brush_blend_add(hit_c, pixels[py * canvas_w + px], 240);
        }
    }
}
