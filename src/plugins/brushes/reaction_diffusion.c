/**
 * =========================================================================
 * Turing Reaction-Diffusion Morphogenesis Brush (reaction_diffusion.c)
 *
 * Real-time biological pattern formation solving Gray-Scott PDEs in C99:
 * - Generates emergent organic leopard spots, brain coral, and dividing cells
 * - 9-point discrete 2D Laplacian operator with forward Euler integration
 * - Zero-copy in-place memory rendering directly to canvas active layer
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define RD_SIZE 56
#define RD_CELLS (RD_SIZE * RD_SIZE)

static float _U[RD_CELLS];
static float _V[RD_CELLS];
static float _next_U[RD_CELLS];
static float _next_V[RD_CELLS];

static int _param_preset = 0;      /* 0=Coral, 1=Leopard, 2=Mitosis, 3=Chaos */
static int _param_speed = 6;       /* 1..10: Euler simulation steps per dab */
static int _param_scale = 50;      /* 10..100: Spatial pattern scale */
static int _param_deposition = 75; /* 10..100: Chemical seed deposition */

static inline int RD_IX(int x, int y) {
    if (x < 0) x = 0; else if (x >= RD_SIZE) x = RD_SIZE - 1;
    if (y < 0) y = 0; else if (y >= RD_SIZE) y = RD_SIZE - 1;
    return x + y * RD_SIZE;
}

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"reaction_diffusion\","
        "\"title\":\"Turing Reaction-Diffusion\","
        "\"category\":\"Organic Simulation\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Pattern Type (0=Coral 1=Spots 2=Mitosis 3=Waves)\",\"min\":0,\"max\":3,\"default\":0,\"unit\":\"mode\"},"
            "{\"name\":\"Simulation Speed\",\"min\":1,\"max\":10,\"default\":6,\"unit\":\"iter\"},"
            "{\"name\":\"Pattern Scale\",\"min\":10,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Seed Deposition\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    for (int i = 0; i < RD_CELLS; i++) {
        _U[i] = 1.0f;
        _V[i] = 0.0f;
        _next_U[i] = 1.0f;
        _next_V[i] = 0.0f;
    }
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_preset = (val < 0) ? 0 : (val > 3 ? 3 : val); break;
        case 1: _param_speed = val; break;
        case 2: _param_scale = val; break;
        case 3: _param_deposition = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x13579BDF ^ (uint32_t)(x * 19.0f + y * 23.0f));
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

    /* Gray-Scott PDE parameters based on preset */
    float F = 0.0545f;
    float k = 0.0620f;
    if (_param_preset == 1) { /* Leopard spots */
        F = 0.0350f;
        k = 0.0650f;
    } else if (_param_preset == 2) { /* Mitosis / dividing cells */
        F = 0.0300f;
        k = 0.0620f;
    } else if (_param_preset == 3) { /* Chaos / wave turbulence */
        F = 0.0260f;
        k = 0.0550f;
    }

    float Du = 0.2097f * ((float)_param_scale / 50.0f);
    float Dv = 0.1050f * ((float)_param_scale / 50.0f);
    float dt = 1.0f;

    /* Inject chemical seed V at center */
    int mid = RD_SIZE / 2;
    int inject_r = (int)(radius * 0.25f);
    if (inject_r < 2) inject_r = 2;
    if (inject_r > 8) inject_r = 8;

    float dep_strength = ((float)_param_deposition / 100.0f) * pressure;

    for (int j = -inject_r; j <= inject_r; j++) {
        for (int i = -inject_r; i <= inject_r; i++) {
            if (i * i + j * j <= inject_r * inject_r) {
                int idx = RD_IX(mid + i, mid + j);
                _V[idx] += dep_strength * 0.6f;
                if (_V[idx] > 1.0f) _V[idx] = 1.0f;
                _U[idx] -= dep_strength * 0.3f;
                if (_U[idx] < 0.0f) _U[idx] = 0.0f;
            }
        }
    }

    /* Run numerical Euler integration PDE steps */
    int steps = _param_speed;
    if (steps < 1) steps = 1;
    if (steps > 10) steps = 10;

    for (int s = 0; s < steps; s++) {
        for (int y = 1; y < RD_SIZE - 1; y++) {
            for (int x = 1; x < RD_SIZE - 1; x++) {
                int idx = x + y * RD_SIZE;
                float u = _U[idx];
                float v = _V[idx];

                /* 9-point discrete 2D Laplacian operator */
                float lap_u = (
                    0.20f * (_U[idx - 1] + _U[idx + 1] + _U[idx - RD_SIZE] + _U[idx + RD_SIZE]) +
                    0.05f * (_U[idx - RD_SIZE - 1] + _U[idx - RD_SIZE + 1] + _U[idx + RD_SIZE - 1] + _U[idx + RD_SIZE + 1]) -
                    u
                );
                float lap_v = (
                    0.20f * (_V[idx - 1] + _V[idx + 1] + _V[idx - RD_SIZE] + _V[idx + RD_SIZE]) +
                    0.05f * (_V[idx - RD_SIZE - 1] + _V[idx - RD_SIZE + 1] + _V[idx + RD_SIZE - 1] + _V[idx + RD_SIZE + 1]) -
                    v
                );

                float uvv = u * v * v;
                _next_U[idx] = u + (Du * lap_u - uvv + F * (1.0f - u)) * dt;
                _next_V[idx] = v + (Dv * lap_v + uvv - (F + k) * v) * dt;

                if (_next_U[idx] < 0.0f) _next_U[idx] = 0.0f; else if (_next_U[idx] > 1.0f) _next_U[idx] = 1.0f;
                if (_next_V[idx] < 0.0f) _next_V[idx] = 0.0f; else if (_next_V[idx] > 1.0f) _next_V[idx] = 1.0f;
            }
        }

        /* Swap double-buffered grids */
        for (int i = 0; i < RD_CELLS; i++) {
            _U[i] = _next_U[i];
            _V[i] = _next_V[i];
        }
    }

    /* Render emergent morphogenesis pattern onto active layer */
    float r_bound = radius * 1.5f;
    int x0 = (int)(cx - r_bound); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - r_bound); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + r_bound); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + r_bound); if (y1 >= canvas_h) y1 = canvas_h - 1;

    float inv_rad_scale = (float)(RD_SIZE - 2) / (r_bound * 2.0f);
    float inv_r_sq = 1.0f / (radius * radius);

    uint32_t cr = color & 0xFF;
    uint32_t cg = (color >> 8) & 0xFF;
    uint32_t cb = (color >> 16) & 0xFF;
    uint32_t ca = (color >> 24) & 0xFF;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        float dy_sq = dy * dy;

        float gy = ((float)y - (cy - r_bound)) * inv_rad_scale + 1.0f;
        int gj = (int)gy;
        if (gj < 1 || gj >= RD_SIZE - 1) continue;

        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > radius * radius) continue;

            float gx = ((float)x - (cx - r_bound)) * inv_rad_scale + 1.0f;
            int gi = (int)gx;
            if (gi < 1 || gi >= RD_SIZE - 1) continue;

            float v = _V[RD_IX(gi, gj)];
            if (v < 0.15f) continue;

            /* Smooth Hermite edge falloff */
            float circular_falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float pattern_intensity = (v - 0.15f) * 1.4f;
            if (pattern_intensity > 1.0f) pattern_intensity = 1.0f;

            uint32_t alpha = (uint32_t)(pattern_intensity * circular_falloff * pressure * (float)ca);
            if (alpha == 0) continue;

            uint32_t stamp_col = w_color_pack(cr, cg, cb, alpha);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > alpha) ? da - alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_over(stamp_col, row[x], 255);
            }
        }
    }
}

void w_brush_stroke_end(void) {
    /* Slight natural decay after stroke ends */
    for (int i = 0; i < RD_CELLS; i++) {
        _V[i] *= 0.92f;
        _U[i] += (1.0f - _U[i]) * 0.08f;
    }
}
