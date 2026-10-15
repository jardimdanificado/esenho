/**
 * =========================================================================
 * Fluid Dynamics Smoke & Liquid Swirl Brush (fluid_smoke_swirl.c)
 *
 * Real-time 2D Eulerian incompressible Navier-Stokes fluid grid solver:
 * - Solves momentum advection, vorticity confinement, and pressure projection
 * - Generates authentic turbulent swirls, eddies, and smoke plumes from pen motion
 * - Operates directly on active layer pixel buffer with zero-copy shared memory
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define GRID_SIZE 48
#define GRID_CELLS (GRID_SIZE * GRID_SIZE)

static float _u[GRID_CELLS];
static float _v[GRID_CELLS];
static float _u_prev[GRID_CELLS];
static float _v_prev[GRID_CELLS];
static float _dens_r[GRID_CELLS];
static float _dens_g[GRID_CELLS];
static float _dens_b[GRID_CELLS];
static float _dens_a[GRID_CELLS];

static int _param_vorticity = 65;   /* 0..100: Vorticity confinement / swirl curl */
static int _param_viscosity = 20;   /* 0..100: Fluid viscosity / diffusion */
static int _param_turbulence = 50;  /* 0..100: Turbulence jitter injection */
static int _param_dye_density = 80; /* 10..100: Dye opacity / concentration */

static float _last_x = 0.0f;
static float _last_y = 0.0f;

static inline int IX(int i, int j) {
    if (i < 0) i = 0; else if (i >= GRID_SIZE) i = GRID_SIZE - 1;
    if (j < 0) j = 0; else if (j >= GRID_SIZE) j = GRID_SIZE - 1;
    return i + j * GRID_SIZE;
}

static void set_bnd(int b, float *x) {
    for (int i = 1; i < GRID_SIZE - 1; i++) {
        x[IX(0, i)] = b == 1 ? -x[IX(1, i)] : x[IX(1, i)];
        x[IX(GRID_SIZE - 1, i)] = b == 1 ? -x[IX(GRID_SIZE - 2, i)] : x[IX(GRID_SIZE - 2, i)];
        x[IX(i, 0)] = b == 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
        x[IX(i, GRID_SIZE - 1)] = b == 2 ? -x[IX(i, GRID_SIZE - 2)] : x[IX(i, GRID_SIZE - 2)];
    }
    x[IX(0, 0)] = 0.5f * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, GRID_SIZE - 1)] = 0.5f * (x[IX(1, GRID_SIZE - 1)] + x[IX(0, GRID_SIZE - 2)]);
    x[IX(GRID_SIZE - 1, 0)] = 0.5f * (x[IX(GRID_SIZE - 2, 0)] + x[IX(GRID_SIZE - 1, 1)]);
    x[IX(GRID_SIZE - 1, GRID_SIZE - 1)] = 0.5f * (x[IX(GRID_SIZE - 2, GRID_SIZE - 1)] + x[IX(GRID_SIZE - 1, GRID_SIZE - 2)]);
}

static void lin_solve(int b, float *x, const float *x0, float a, float c) {
    float inv_c = 1.0f / c;
    for (int k = 0; k < 4; k++) {
        for (int j = 1; j < GRID_SIZE - 1; j++) {
            for (int i = 1; i < GRID_SIZE - 1; i++) {
                x[IX(i, j)] = (x0[IX(i, j)] + a * (x[IX(i - 1, j)] + x[IX(i + 1, j)] + x[IX(i, j - 1)] + x[IX(i, j + 1)])) * inv_c;
            }
        }
        set_bnd(b, x);
    }
}

static void diffuse(int b, float *x, const float *x0, float diff, float dt) {
    float a = dt * diff * (float)((GRID_SIZE - 2) * (GRID_SIZE - 2));
    lin_solve(b, x, x0, a, 1.0f + 4.0f * a);
}

static void advect(int b, float *d, const float *d0, const float *u, const float *v, float dt) {
    float dt0 = dt * (float)(GRID_SIZE - 2);
    float n_float = (float)(GRID_SIZE - 2);

    for (int j = 1; j < GRID_SIZE - 1; j++) {
        for (int i = 1; i < GRID_SIZE - 1; i++) {
            float x = (float)i - dt0 * u[IX(i, j)];
            float y = (float)j - dt0 * v[IX(i, j)];

            if (x < 0.5f) x = 0.5f;
            if (x > n_float + 0.5f) x = n_float + 0.5f;
            int i0 = (int)x;
            int i1 = i0 + 1;

            if (y < 0.5f) y = 0.5f;
            if (y > n_float + 0.5f) y = n_float + 0.5f;
            int j0 = (int)y;
            int j1 = j0 + 1;

            float s1 = x - (float)i0;
            float s0 = 1.0f - s1;
            float t1 = y - (float)j0;
            float t0 = 1.0f - t1;

            d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                          s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
        }
    }
    set_bnd(b, d);
}

static void project(float *u, float *v, float *p, float *div) {
    float h = 1.0f / (float)(GRID_SIZE - 2);
    for (int j = 1; j < GRID_SIZE - 1; j++) {
        for (int i = 1; i < GRID_SIZE - 1; i++) {
            div[IX(i, j)] = -0.5f * h * (u[IX(i + 1, j)] - u[IX(i - 1, j)] + v[IX(i, j + 1)] - v[IX(i, j - 1)]);
            p[IX(i, j)] = 0.0f;
        }
    }
    set_bnd(0, div);
    set_bnd(0, p);

    lin_solve(0, p, div, 1.0f, 4.0f);

    for (int j = 1; j < GRID_SIZE - 1; j++) {
        for (int i = 1; i < GRID_SIZE - 1; i++) {
            u[IX(i, j)] -= 0.5f * (p[IX(i + 1, j)] - p[IX(i - 1, j)]) / h;
            v[IX(i, j)] -= 0.5f * (p[IX(i, j + 1)] - p[IX(i, j - 1)]) / h;
        }
    }
    set_bnd(1, u);
    set_bnd(2, v);
}

/* ── Vorticity Confinement Step ── */
static void apply_vorticity(float *u, float *v, float strength, float dt) {
    if (strength <= 0.001f) return;
    static float curl[GRID_CELLS];

    for (int j = 1; j < GRID_SIZE - 1; j++) {
        for (int i = 1; i < GRID_SIZE - 1; i++) {
            float dw_dx = (v[IX(i + 1, j)] - v[IX(i - 1, j)]) * 0.5f;
            float dw_dy = (u[IX(i, j + 1)] - u[IX(i, j - 1)]) * 0.5f;
            curl[IX(i, j)] = dw_dx - dw_dy;
        }
    }

    for (int j = 2; j < GRID_SIZE - 2; j++) {
        for (int i = 2; i < GRID_SIZE - 2; i++) {
            float c_left = curl[IX(i - 1, j)]; if (c_left < 0) c_left = -c_left;
            float c_right = curl[IX(i + 1, j)]; if (c_right < 0) c_right = -c_right;
            float c_down = curl[IX(i, j - 1)]; if (c_down < 0) c_down = -c_down;
            float c_up = curl[IX(i, j + 1)]; if (c_up < 0) c_up = -c_up;

            float dx = (c_right - c_left) * 0.5f;
            float dy = (c_up - c_down) * 0.5f;
            float len_sq = dx * dx + dy * dy;
            if (len_sq > 0.0001f) {
                float inv_len = 1.0f / (len_sq + 0.001f);
                dx *= inv_len;
                dy *= inv_len;
                float c = curl[IX(i, j)];
                u[IX(i, j)] += (dy * c) * strength * dt;
                v[IX(i, j)] += (-dx * c) * strength * dt;
            }
        }
    }
}

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"fluid_smoke_swirl\","
        "\"title\":\"Navier-Stokes Fluid Swirl\","
        "\"category\":\"Fluid Dynamics\","
        "\"spacing\":0.05,"
        "\"minRadius\":4,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Vorticity Swirl\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Fluid Viscosity\",\"min\":0,\"max\":100,\"default\":20,\"unit\":\"%\"},"
            "{\"name\":\"Turbulence\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Dye Density\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    for (int i = 0; i < GRID_CELLS; i++) {
        _u[i] = _v[i] = _u_prev[i] = _v_prev[i] = 0.0f;
        _dens_r[i] = _dens_g[i] = _dens_b[i] = _dens_a[i] = 0.0f;
    }
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_vorticity = val; break;
        case 1: _param_viscosity = val; break;
        case 2: _param_turbulence = val; break;
        case 3: _param_dye_density = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _last_x = x;
    _last_y = y;
    w_brush_srand(0xA9C25E17 ^ (uint32_t)(x * 13.0f + y * 7.0f));
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
    if (radius < 1.0f) radius = 1.0f;
    float dt = 0.15f;

    float dx = cx - _last_x;
    float dy = cy - _last_y;
    _last_x = cx;
    _last_y = cy;

    float col_r = (float)(color & 0xFF) / 255.0f;
    float col_g = (float)((color >> 8) & 0xFF) / 255.0f;
    float col_b = (float)((color >> 16) & 0xFF) / 255.0f;
    float col_a = ((float)((color >> 24) & 0xFF) / 255.0f) * pressure * ((float)_param_dye_density / 100.0f);

    /* Inject force and dye at the center */
    int mid = GRID_SIZE / 2;
    float force_x = dx * 1.8f;
    float force_y = dy * 1.8f;

    if (_param_turbulence > 0) {
        float turb = ((float)_param_turbulence / 100.0f) * 1.5f;
        force_x += w_brush_rand_symf() * turb;
        force_y += w_brush_rand_symf() * turb;
    }

    for (int j = -3; j <= 3; j++) {
        for (int i = -3; i <= 3; i++) {
            int d_sq = i * i + j * j;
            if (d_sq <= 9) {
                float falloff = 1.0f - (float)d_sq / 10.0f;
                int idx = IX(mid + i, mid + j);
                _u[idx] += force_x * falloff;
                _v[idx] += force_y * falloff;
                _dens_r[idx] += col_r * col_a * falloff;
                _dens_g[idx] += col_g * col_a * falloff;
                _dens_b[idx] += col_b * col_a * falloff;
                _dens_a[idx] += col_a * falloff;
            }
        }
    }

    /* Vorticity confinement */
    apply_vorticity(_u, _v, ((float)_param_vorticity / 100.0f) * 4.0f, dt);

    /* Viscous velocity diffusion & advection */
    float visc = ((float)_param_viscosity / 100.0f) * 0.005f;
    diffuse(1, _u_prev, _u, visc, dt);
    diffuse(2, _v_prev, _v, visc, dt);
    project(_u_prev, _v_prev, _u, _v);

    advect(1, _u, _u_prev, _u_prev, _v_prev, dt);
    advect(2, _v, _v_prev, _u_prev, _v_prev, dt);
    project(_u, _v, _u_prev, _v_prev);

    /* Advect dye density */
    advect(0, _dens_r, _dens_r, _u, _v, dt);
    advect(0, _dens_g, _dens_g, _u, _v, dt);
    advect(0, _dens_b, _dens_b, _u, _v, dt);
    advect(0, _dens_a, _dens_a, _u, _v, dt);

    /* Render fluid grid onto canvas active layer */
    float r_bound = radius * 1.5f;
    int x0 = (int)(cx - r_bound); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - r_bound); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + r_bound); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + r_bound); if (y1 >= canvas_h) y1 = canvas_h - 1;

    float inv_rad_scale = (float)(GRID_SIZE - 2) / (r_bound * 2.0f);

    for (int y = y0; y <= y1; y++) {
        float gy = ((float)y - (cy - r_bound)) * inv_rad_scale + 1.0f;
        int gj = (int)gy;
        if (gj < 1 || gj >= GRID_SIZE - 1) continue;

        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float gx = ((float)x - (cx - r_bound)) * inv_rad_scale + 1.0f;
            int gi = (int)gx;
            if (gi < 1 || gi >= GRID_SIZE - 1) continue;

            int g_idx = IX(gi, gj);
            float a = _dens_a[g_idx];
            if (a < 0.01f) continue;
            if (a > 1.0f) a = 1.0f;

            uint32_t alpha_u8 = (uint32_t)(a * 255.0f);
            uint32_t r_u8 = (uint32_t)(_dens_r[g_idx] * 255.0f); if (r_u8 > 255) r_u8 = 255;
            uint32_t g_u8 = (uint32_t)(_dens_g[g_idx] * 255.0f); if (g_u8 > 255) g_u8 = 255;
            uint32_t b_u8 = (uint32_t)(_dens_b[g_idx] * 255.0f); if (b_u8 > 255) b_u8 = 255;

            uint32_t stamp_col = w_color_pack(r_u8, g_u8, b_u8, alpha_u8);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > alpha_u8) ? da - alpha_u8 : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_over(stamp_col, row[x], 255);
            }
        }
    }
}

void w_brush_stroke_end(void) {
    /* Gradual dissipation between strokes */
    for (int i = 0; i < GRID_CELLS; i++) {
        _dens_a[i] *= 0.85f;
        _u[i] *= 0.80f;
        _v[i] *= 0.80f;
    }
}
