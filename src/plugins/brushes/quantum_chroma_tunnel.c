/**
 * =========================================================================
 * Quantum Gravitational Lensing & Event Horizon Vortex (quantum_chroma_tunnel.c)
 *
 * Real-time relativistic astrophysics simulation in C99:
 * - Schwarzschild metric geodesic gravitational light deflection
 * - Kerr metric frame-dragging spacetime vortex around spinning singularity
 * - Relativistic Doppler spectral beaming and accretion disk photon sphere
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_mass = 60;        /* 10..100: Singularity mass / lensing strength */
static int _param_accretion = 80;   /* 0..100: Accretion disk plasma emission */
static int _param_frame_drag = 70;  /* 0..100: Kerr frame-dragging angular twist */
static int _param_doppler = 50;     /* 0..100: Relativistic Doppler color shift */

static float _last_x = 0.0f;
static float _last_y = 0.0f;
static float _accum_spin = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"quantum_chroma_tunnel\","
        "\"title\":\"Quantum Event Horizon Lensing\","
        "\"category\":\"Astrophysics VFX\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Singularity Mass\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Accretion Plasma\",\"min\":0,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Spacetime Vortex\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Doppler Beaming\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    _accum_spin = 0.0f;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_mass = val; break;
        case 1: _param_accretion = val; break;
        case 2: _param_frame_drag = val; break;
        case 3: _param_doppler = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _last_x = x;
    _last_y = y;
    _accum_spin = 0.0f;
    w_brush_srand(0x1337BEEF ^ (uint32_t)(x * 53.0f + y * 59.0f));
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
    if (radius < 3.0f) radius = 3.0f;

    float dx = cx - _last_x;
    float dy = cy - _last_y;
    _last_x = cx;
    _last_y = cy;

    float move_dist = w_sqrtf(dx * dx + dy * dy);
    _accum_spin += (move_dist * 0.12f) + 0.08f;

    float rs = radius * 0.22f * ((float)_param_mass / 50.0f); /* Schwarzschild event horizon radius */
    float r_photon = rs * 1.5f;                                /* Unstable circular photon orbit */
    float r_bound = radius * 1.6f;

    int x0 = (int)(cx - r_bound); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - r_bound); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + r_bound); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + r_bound); if (y1 >= canvas_h) y1 = canvas_h - 1;

    float frame_drag_coeff = ((float)_param_frame_drag / 100.0f) * 3.5f;
    float accretion_factor = ((float)_param_accretion / 100.0f);
    float doppler_factor = ((float)_param_doppler / 100.0f);

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
            if (r_sq > r_bound * r_bound) continue;

            float r = w_sqrtf(r_sq);
            if (r < 0.001f) r = 0.001f;

            /* 1. Inside Schwarzschild event horizon -> Total light absorption */
            if (r <= rs) {
                if (is_eraser) continue;
                /* Pitch black singularity with subtle quantum Hawking boundary */
                float edge_fade = r / (rs + 0.001f);
                uint32_t hole_alpha = (uint32_t)((1.0f - edge_fade * edge_fade) * 255.0f * pressure);
                uint32_t black_pix = w_color_pack(2, 2, 6, hole_alpha);
                row[x] = w_brush_blend_over(black_pix, row[x], hole_alpha);
                continue;
            }

            /* 2. Kerr Spacetime Frame-Dragging Angle & Geodesic Deflection */
            float theta = w_atan2f(fdy, fdx);
            float twist = (rs * rs / (r_sq + 1.0f)) * frame_drag_coeff + _accum_spin * (rs / r);
            float theta_prime = theta + twist;

            /* Gravitational ray bending (Einstein lensing deflection) */
            float r_lens = r + (rs * rs * 2.0f) / (r - rs + 0.5f);
            float sample_x = cx + r_lens * w_cosf(theta_prime);
            float sample_y = cy + r_lens * w_sinf(theta_prime);

            int sx = (int)sample_x; if (sx < 0) sx = 0; else if (sx >= canvas_w) sx = canvas_w - 1;
            int sy = (int)sample_y; if (sy < 0) sy = 0; else if (sy >= canvas_h) sy = canvas_h - 1;

            uint32_t lensed_color = pixels[sy * canvas_w + sx];
            uint32_t lr = lensed_color & 0xFF;
            uint32_t lg = (lensed_color >> 8) & 0xFF;
            uint32_t lb = (lensed_color >> 16) & 0xFF;
            uint32_t la = (lensed_color >> 24) & 0xFF;

            /* 3. Relativistic Doppler Beaming Shift */
            if (doppler_factor > 0.01f) {
                float v_rot = w_sinf(theta_prime); /* velocity toward/away from viewer */
                float beta = v_rot * doppler_factor * (rs / r);
                if (beta > 0.0f) {
                    /* Approaching side: blueshifted + amplified */
                    float amp = 1.0f + beta * 1.5f;
                    lb = (uint32_t)((float)lb * amp + beta * 60.0f); if (lb > 255) lb = 255;
                    lg = (uint32_t)((float)lg * amp); if (lg > 255) lg = 255;
                    lr = (uint32_t)((float)lr * (1.0f - beta * 0.4f));
                } else {
                    /* Receding side: redshifted + dimmed */
                    float red_shift = -beta;
                    lr = (uint32_t)((float)lr * (1.0f + red_shift * 1.2f) + red_shift * 50.0f); if (lr > 255) lr = 255;
                    lb = (uint32_t)((float)lb * (1.0f - red_shift * 0.5f));
                }
            }

            /* 4. Accretion Disk Plasma & Photon Ring Emission */
            float dist_to_photon_ring = w_fabsf(r - r_photon);
            float ring_glow = 0.0f;
            if (dist_to_photon_ring < radius * 0.35f) {
                float ring_w = radius * 0.35f;
                ring_glow = (1.0f - dist_to_photon_ring / ring_w);
                ring_glow = ring_glow * ring_glow * accretion_factor * 255.0f;
            }

            uint32_t out_r = lr + (uint32_t)(ring_glow * (float)tint_r * 0.00392f); if (out_r > 255) out_r = 255;
            uint32_t out_g = lg + (uint32_t)(ring_glow * (float)tint_g * 0.00392f); if (out_g > 255) out_g = 255;
            uint32_t out_b = lb + (uint32_t)(ring_glow * (float)tint_b * 0.00392f + ring_glow * 0.3f); if (out_b > 255) out_b = 255;

            float u = 1.0f - (r / r_bound);
            float spatial_falloff = (u > 0.0f) ? (u * u * (3.0f - 2.0f * u)) : 0.0f;
            uint32_t blend_alpha = (uint32_t)(spatial_falloff * pressure * 230.0f);
            if (blend_alpha > 255) blend_alpha = 255;

            uint32_t final_pix = w_color_pack(out_r, out_g, out_b, blend_alpha);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > blend_alpha) ? da - blend_alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_over(final_pix, row[x], 255);
            }
        }
    }
}

void w_brush_stroke_end(void) {
}
