/**
 * =========================================================================
 * Thermodynamic Heat Conduction & Blackbody Pyrotechnics (thermal_pyro.c)
 *
 * Real-time heat transfer PDE & blackbody combustion simulation in C99:
 * - Solves 2D thermal diffusion with radiative cooling (Fourier heat law)
 * - Planck blackbody spectral radiation (Infrared -> Ruby -> Orange -> White Heat)
 * - Charred carbon paper perimeter with stochastic burning pyrotechnic embers
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define THERMAL_SIZE 48
#define THERMAL_CELLS (THERMAL_SIZE * THERMAL_SIZE)

static float _temp[THERMAL_CELLS];
static float _temp_next[THERMAL_CELLS];

static int _param_heat = 80;        /* 20..100: Peak ignition temperature */
static int _param_diffusion = 60;   /* 10..100: Thermal conductivity */
static int _param_char = 70;        /* 10..100: Ash & charcoal charring */
static int _param_sparks = 75;      /* 0..100: Combustion spark rate */

static float _last_x = 0.0f;
static float _last_y = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"thermal_pyro\","
        "\"title\":\"Blackbody Pyro Heat\","
        "\"category\":\"Thermodynamics\","
        "\"spacing\":0.05,"
        "\"minRadius\":5,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Ignition Heat\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Heat Diffusion\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Carbon Charring\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Ember Sparks\",\"min\":0,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    for (int i = 0; i < THERMAL_CELLS; i++) {
        _temp[i] = 0.0f;
        _temp_next[i] = 0.0f;
    }
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_heat = val; break;
        case 1: _param_diffusion = val; break;
        case 2: _param_char = val; break;
        case 3: _param_sparks = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _last_x = x;
    _last_y = y;
    w_brush_srand(0xFEEDF00D ^ (uint32_t)(x * 89.0f + y * 97.0f));
}

static inline int T_IX(int x, int y) {
    if (x < 0) x = 0; else if (x >= THERMAL_SIZE) x = THERMAL_SIZE - 1;
    if (y < 0) y = 0; else if (y >= THERMAL_SIZE) y = THERMAL_SIZE - 1;
    return x + y * THERMAL_SIZE;
}

/* Planck Blackbody Color Mapping: Temperature in [0.0, 1.0] */
static inline uint32_t blackbody_color(float t, uint32_t char_factor) {
    if (t < 0.05f) {
        /* Carbonized Ash Perimeter */
        uint32_t ash = (uint32_t)(20.0f * (1.0f - t * 20.0f));
        return w_color_pack(ash + 8, ash + 4, ash + 4, 255);
    }

    float r = 0.0f, g = 0.0f, b = 0.0f;

    if (t < 0.35f) {
        /* Ruby Smoldering Embers */
        float f = (t - 0.05f) / 0.30f;
        r = 80.0f + f * 175.0f;
        g = f * 35.0f;
        b = f * 8.0f;
    } else if (t < 0.70f) {
        /* Molten Orange / Golden Flame */
        float f = (t - 0.35f) / 0.35f;
        r = 255.0f;
        g = 35.0f + f * 190.0f;
        b = 8.0f + f * 50.0f;
    } else {
        /* Incandescent White Heat */
        float f = (t - 0.70f) / 0.30f;
        r = 255.0f;
        g = 225.0f + f * 30.0f;
        b = 58.0f + f * 197.0f;
    }

    uint32_t ur = (uint32_t)r; if (ur > 255) ur = 255;
    uint32_t ug = (uint32_t)g; if (ug > 255) ug = 255;
    uint32_t ub = (uint32_t)b; if (ub > 255) ub = 255;
    return w_color_pack(ur, ug, ub, 255);
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
    if (radius < 2.0f) radius = 2.0f;

    float heat_injection = ((float)_param_heat / 100.0f) * pressure * 1.4f;
    float alpha_diff = ((float)_param_diffusion / 100.0f) * 0.22f;
    float char_amount = ((float)_param_char / 100.0f);
    int spark_count = (int)(((float)_param_sparks / 100.0f) * 8.0f);

    /* 1. Deposit thermal energy at center */
    int mid = THERMAL_SIZE / 2;
    int inject_r = (int)(radius * 0.35f);
    if (inject_r < 2) inject_r = 2;
    if (inject_r > 8) inject_r = 8;

    for (int j = -inject_r; j <= inject_r; j++) {
        for (int i = -inject_r; i <= inject_r; i++) {
            int d_sq = i * i + j * j;
            if (d_sq <= inject_r * inject_r) {
                float f = 1.0f - (float)d_sq / (float)(inject_r * inject_r + 1);
                int idx = T_IX(mid + i, mid + j);
                _temp[idx] += heat_injection * f;
                if (_temp[idx] > 1.0f) _temp[idx] = 1.0f;
            }
        }
    }

    /* 2. Solve 2D Heat Diffusion PDE with cooling */
    for (int sub = 0; sub < 3; sub++) {
        for (int y = 1; y < THERMAL_SIZE - 1; y++) {
            for (int x = 1; x < THERMAL_SIZE - 1; x++) {
                int idx = x + y * THERMAL_SIZE;
                float t = _temp[idx];
                float lap = _temp[idx - 1] + _temp[idx + 1] + _temp[idx - THERMAL_SIZE] + _temp[idx + THERMAL_SIZE] - 4.0f * t;
                _temp_next[idx] = (t + alpha_diff * lap) * 0.985f; /* radiative cooling */
            }
        }
        for (int i = 0; i < THERMAL_CELLS; i++) {
            _temp[i] = _temp_next[i];
        }
    }

    /* 3. Render thermal heat field onto canvas active layer */
    float r_bound = radius * 1.5f;
    int x0 = (int)(cx - r_bound); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - r_bound); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + r_bound); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + r_bound); if (y1 >= canvas_h) y1 = canvas_h - 1;

    float inv_rad_scale = (float)(THERMAL_SIZE - 2) / (r_bound * 2.0f);
    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float fdy = (float)y - cy;
        float dy_sq = fdy * fdy;
        float gy = (fdy + r_bound) * inv_rad_scale + 1.0f;
        int gj = (int)gy;
        if (gj < 1 || gj >= THERMAL_SIZE - 1) continue;

        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float fdx = (float)x - cx;
            float dist_sq = fdx * fdx + dy_sq;
            if (dist_sq > radius * radius) continue;

            float gx = (fdx + r_bound) * inv_rad_scale + 1.0f;
            int gi = (int)gx;
            if (gi < 1 || gi >= THERMAL_SIZE - 1) continue;

            float t = _temp[T_IX(gi, gj)];
            if (t < 0.02f) continue;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            uint32_t py_color = blackbody_color(t, (uint32_t)(char_amount * 100.0f));

            uint32_t alpha = (uint32_t)(t * falloff * pressure * 255.0f);
            if (alpha > 255) alpha = 255;
            if (alpha == 0) continue;

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > alpha) ? da - alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                if (t > 0.45f) {
                    /* Incandescent core glows with additive radiance */
                    row[x] = w_brush_blend_add(py_color, row[x], alpha);
                } else {
                    /* Outer soot/charcoal blends naturally */
                    row[x] = w_brush_blend_over(py_color, row[x], alpha);
                }
            }
        }
    }

    /* 4. Stochastic burning pyrotechnic sparks */
    for (int s = 0; s < spark_count; s++) {
        float spark_dist = radius * (0.4f + w_brush_randf() * 0.9f);
        float spark_ang = w_brush_randf() * 6.283185f;
        int sx = (int)(cx + spark_dist * w_cosf(spark_ang));
        int sy = (int)(cy + spark_dist * w_sinf(spark_ang));

        if (sx >= 1 && sx < canvas_w - 1 && sy >= 1 && sy < canvas_h - 1) {
            uint32_t spark_col = w_color_pack(255, 230 + (uint32_t)(w_brush_randf() * 25.0f), 120, 255);
            pixels[sy * canvas_w + sx] = w_brush_blend_add(spark_col, pixels[sy * canvas_w + sx], 240);
        }
    }
}

void w_brush_stroke_end(void) {
    for (int i = 0; i < THERMAL_CELLS; i++) {
        _temp[i] *= 0.88f;
    }
}
