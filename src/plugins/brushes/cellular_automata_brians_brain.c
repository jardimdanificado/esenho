/**
 * =========================================================================
 * Brian's Brain 3-State Excitable Cellular Automaton (cellular_automata_brians_brain.c)
 *
 * 3-state neural excitation dynamics & oscillator wavefronts in C99:
 * - State 0: Ready / Off (Dark)
 * - State 1: Firing / Excitation (Electric Cyan / White)
 * - State 2: Refractory / Dying (Amber / Ruby)
 * - Evolves complex gliders, spark waves, and oscillating neural structures
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define GRID_DIM 48
#define TOTAL_CELLS (GRID_DIM * GRID_DIM)

static uint8_t _cells[TOTAL_CELLS];
static uint8_t _cells_next[TOTAL_CELLS];

static int _param_speed_steps = 2;    /* 1..5: Automaton simulation generations per dab */
static int _param_spawn_rate = 75;    /* 10..100: Excitation spark density */
static int _param_firing_glow = 90;   /* 20..100: Electric cyan radiance */
static int _param_refractory_hue = 50;/* 0..100: Refractory amber vs violet tint */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"cellular_automata_brians_brain\","
        "\"title\":\"Brian's Brain Automaton\","
        "\"category\":\"Complexity\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Simulation Steps\",\"min\":1,\"max\":5,\"default\":2,\"unit\":\"gen\"},"
            "{\"name\":\"Spark Injection\",\"min\":10,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Firing Glow\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Refractory Hue\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    for (int i = 0; i < TOTAL_CELLS; i++) {
        _cells[i] = 0;
        _cells_next[i] = 0;
    }
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_speed_steps = (val < 1) ? 1 : (val > 5 ? 5 : val); break;
        case 1: _param_spawn_rate = val; break;
        case 2: _param_firing_glow = val; break;
        case 3: _param_refractory_hue = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xB81A4500 ^ (uint32_t)(x * 67.0f + y * 73.0f));
}

void w_brush_stroke_end(void) {}

static inline int C_IX(int x, int y) {
    if (x < 0) x += GRID_DIM; else if (x >= GRID_DIM) x -= GRID_DIM;
    if (y < 0) y += GRID_DIM; else if (y >= GRID_DIM) y -= GRID_DIM;
    return x + y * GRID_DIM;
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
    if (!pixels || canvas_w <= 0 || canvas_h <= 0 || radius <= 0.5f) return;

    float eff_p = (pressure > 0.02f) ? pressure : 0.5f;

    /* 1. Stochastic spark injection in center core */
    int mid = GRID_DIM / 2;
    int inject_r = (int)(radius * 0.25f);
    if (inject_r < 2) inject_r = 2;
    if (inject_r > 8) inject_r = 8;

    float spawn_prob = ((float)_param_spawn_rate * 0.01f) * eff_p;
    for (int dy = -inject_r; dy <= inject_r; dy++) {
        for (int dx = -inject_r; dx <= inject_r; dx++) {
            if (dx * dx + dy * dy <= inject_r * inject_r) {
                if (w_brush_randf() < spawn_prob) {
                    _cells[C_IX(mid + dx, mid + dy)] = 1; /* Firing */
                }
            }
        }
    }

    /* 2. Step Brian's Brain Automaton Rules */
    int steps = _param_speed_steps;
    for (int s = 0; s < steps; s++) {
        for (int y = 0; y < GRID_DIM; y++) {
            for (int x = 0; x < GRID_DIM; x++) {
                uint8_t state = _cells[C_IX(x, y)];
                if (state == 1) {
                    /* Firing -> Refractory */
                    _cells_next[C_IX(x, y)] = 2;
                } else if (state == 2) {
                    /* Refractory -> Ready */
                    _cells_next[C_IX(x, y)] = 0;
                } else {
                    /* Ready -> Firing iff exactly 2 Moore neighbors are Firing */
                    int firing_count = 0;
                    for (int ny = -1; ny <= 1; ny++) {
                        for (int nx = -1; nx <= 1; nx++) {
                            if (nx == 0 && ny == 0) continue;
                            if (_cells[C_IX(x + nx, y + ny)] == 1) firing_count++;
                        }
                    }
                    _cells_next[C_IX(x, y)] = (firing_count == 2) ? 1 : 0;
                }
            }
        }
        for (int i = 0; i < TOTAL_CELLS; i++) {
            _cells[i] = _cells_next[i];
        }
    }

    /* 3. Render Automaton grid onto canvas */
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float inv_r_scale = (float)(GRID_DIM - 2) / (radius * 2.0f);
    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float fdy = (float)y - cy;
        float dy_sq = fdy * fdy;
        float gy = (fdy + radius) * inv_r_scale + 1.0f;
        int gj = (int)gy;
        if (gj < 0 || gj >= GRID_DIM) continue;

        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float fdx = (float)x - cx;
            float dist_sq = fdx * fdx + dy_sq;
            if (dist_sq > radius * radius) continue;

            float gx = (fdx + radius) * inv_r_scale + 1.0f;
            int gi = (int)gx;
            if (gi < 0 || gi >= GRID_DIM) continue;

            uint8_t cell_state = _cells[C_IX(gi, gj)];
            if (cell_state == 0) continue;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            uint32_t r, g, b;
            uint32_t a;

            if (cell_state == 1) {
                /* Firing: Electric incandescent cyan/white */
                r = 210; g = 250; b = 255;
                a = (uint32_t)(falloff * 255.0f * eff_p);
            } else {
                /* Refractory: Warm amber/magenta */
                r = 255; g = 80; b = 130;
                a = (uint32_t)(falloff * 170.0f * eff_p);
            }
            if (a > 255) a = 255;

            uint32_t cell_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(cell_c, row[x], a);
            }
        }
    }
}
