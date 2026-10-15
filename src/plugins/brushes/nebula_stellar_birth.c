/**
 * =========================================================================
 * Interstellar Stellar Cradle & H II Nebula (nebula_stellar_birth.c)
 *
 * Cosmic star-forming molecular cloud & protostellar nursery in C99:
 * - Turbulent interstellar gas filaments with dark absorption dust lanes
 * - Hydrogen-alpha (656.3 nm crimson) & Oxygen-III (500.7 nm teal) emission
 * - Embedded protostars with optical diffraction cross-spikes
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_gas_density = 75;    /* 20..100: Molecular cloud density */
static int _param_dust_lanes = 60;     /* 10..100: Dark absorption silhouettes */
static int _param_star_density = 50;   /* 0..100: Protostar ignition rate */
static int _param_color_blend = 70;    /* 10..100: O-III teal vs H-alpha pink balance */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"nebula_stellar_birth\","
        "\"title\":\"Cosmic Stellar Cradle\","
        "\"category\":\"Cosmic\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Gas Cloud Density\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Dark Dust Lanes\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Protostar Sparks\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"stars\"},"
            "{\"name\":\"O-III Teal vs H-Alpha\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_gas_density = val; break;
        case 1: _param_dust_lanes = val; break;
        case 2: _param_star_density = val; break;
        case 3: _param_color_blend = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xCA5CA500 ^ (uint32_t)(x * 103.0f + y * 109.0f));
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
    float gas_mult = (float)_param_gas_density * 0.01f;
    float dust_str = (float)_param_dust_lanes * 0.01f;
    float o3_ratio = (float)_param_color_blend * 0.01f;

    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_sq = 1.0f / (radius * radius);

    /* 1. Turbulent Cosmic Gas Filaments */
    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Continuous space turbulence coordinates */
            float sx = (float)x * 0.08f;
            float sy = (float)y * 0.08f;
            float turb = w_sinf(sx + w_cosf(sy * 1.5f)) * w_cosf(sy + w_sinf(sx * 1.3f));
            float turb2 = w_sinf(sx * 2.3f - sy * 1.7f) * 0.35f;
            float gas = 0.5f + 0.5f * (turb + turb2);

            /* Dark absorption dust lanes */
            float dust_cut = w_sinf(sx * 0.5f + sy * 0.8f);
            if (dust_cut > 0.35f && dust_str > 0.2f) {
                gas *= (1.0f - (dust_cut - 0.35f) * 1.8f * dust_str);
                if (gas < 0.0f) gas = 0.0f;
            }

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float intensity = gas * falloff * gas_mult * eff_p;
            if (intensity <= 0.01f) continue;

            /* Dual emission spectra: H-alpha pink/magenta and O-III turquoise */
            float spec_mix = 0.5f + 0.5f * w_sinf(sx * 1.2f + sy * 0.9f);
            uint32_t r, g, b;
            if (spec_mix < o3_ratio) {
                /* Oxygen-III teal/cyan */
                r = (uint32_t)(20.0f + 60.0f * intensity);
                g = (uint32_t)(190.0f + 65.0f * intensity);
                b = (uint32_t)(220.0f + 35.0f * intensity);
            } else {
                /* Hydrogen-alpha magenta/ruby */
                r = (uint32_t)(235.0f + 20.0f * intensity);
                g = (uint32_t)(45.0f + 80.0f * intensity);
                b = (uint32_t)(160.0f + 85.0f * intensity);
            }
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(intensity * 180.0f);
            if (alpha > 255) alpha = 255;

            uint32_t gas_col = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(gas_col, row[x], alpha);
            }
        }
    }

    /* 2. Embedded Protostars with 4-Point Optical Diffraction Spikes */
    int star_rate = (int)(((float)_param_star_density * 0.01f) * 3.0f * eff_p);
    for (int s = 0; s < star_rate; s++) {
        if (w_brush_randf() > 0.45f) continue;

        float star_d = radius * 0.75f * w_sqrtf(w_brush_randf());
        float star_a = w_brush_randf() * 6.2831853f;
        int sx = (int)(cx + star_d * w_cosf(star_a));
        int sy = (int)(cy + star_d * w_sinf(star_a));

        if (sx < 4 || sx >= canvas_w - 4 || sy < 4 || sy >= canvas_h - 4) continue;

        uint32_t star_core = w_color_pack(255, 255, 255, 255);
        uint32_t star_tint = w_color_pack(180, 230, 255, 255);

        /* Center point */
        pixels[sy * canvas_w + sx] = star_core;

        /* Cross diffraction spikes */
        int spike_len = 3 + (int)(w_brush_randf() * 4.0f);
        for (int k = 1; k <= spike_len; k++) {
            uint32_t a = (uint32_t)(255.0f * (1.0f - (float)k / (float)(spike_len + 1)));
            pixels[sy * canvas_w + (sx + k)] = w_brush_blend_add(star_tint, pixels[sy * canvas_w + (sx + k)], a);
            pixels[sy * canvas_w + (sx - k)] = w_brush_blend_add(star_tint, pixels[sy * canvas_w + (sx - k)], a);
            pixels[(sy + k) * canvas_w + sx] = w_brush_blend_add(star_tint, pixels[(sy + k) * canvas_w + sx], a);
            pixels[(sy - k) * canvas_w + sx] = w_brush_blend_add(star_tint, pixels[(sy - k) * canvas_w + sx], a);
        }
    }
}
