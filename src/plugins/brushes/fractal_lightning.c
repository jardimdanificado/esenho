/**
 * =========================================================================
 * Dielectric Breakdown & Lichtenberg Fractal Arcs (fractal_lightning.c)
 *
 * Physical high-voltage electrical breakdown simulation in C99:
 * - Recursive midpoint displacement fractal lightning generator
 * - Stochastic dendritic branching with electrostatic ground attraction
 * - Dual-layer rendering: ultra-bright plasma core with ionized corona bloom
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_voltage = 5;      /* 1..10: Branching depth */
static int _param_chaos = 65;       /* 10..100: Arc jitter roughness */
static int _param_intensity = 90;   /* 20..100: Plasma core brightness */
static int _param_ground = 70;      /* 0..100: Ground attraction to painted pixels */

static float _prev_x = 0.0f;
static float _prev_y = 0.0f;
static int _has_prev = 0;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"fractal_lightning\","
        "\"title\":\"Lichtenberg Lightning Bolt\","
        "\"category\":\"Physical Simulation\","
        "\"spacing\":0.25,"
        "\"minRadius\":4,"
        "\"maxRadius\":120,"
        "\"params\":["
            "{\"name\":\"Voltage Branching\",\"min\":1,\"max\":10,\"default\":5,\"unit\":\"depth\"},"
            "{\"name\":\"Arc Jitter / Chaos\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Core Intensity\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Ground Attraction\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    _has_prev = 0;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_voltage = val; break;
        case 1: _param_chaos = val; break;
        case 2: _param_intensity = val; break;
        case 3: _param_ground = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _prev_x = x;
    _prev_y = y;
    _has_prev = 1;
    w_brush_srand(0xDEADBEEF ^ (uint32_t)(x * 31.0f + y * 37.0f));
}

/* Fast antialiased line segment rasterizer with glow */
static void draw_glow_segment(
    uint32_t *pixels,
    int canvas_w,
    int canvas_h,
    float x0, float y0,
    float x1, float y1,
    float core_thickness,
    float glow_radius,
    uint32_t glow_color,
    uint32_t core_color,
    float alpha_scale,
    int is_eraser
) {
    float dx = x1 - x0;
    float dy = y1 - y0;
    float len = dx * dx + dy * dy;
    if (len < 0.0001f) return;

    int min_x = (int)(x0 < x1 ? x0 : x1) - (int)glow_radius - 2;
    int max_x = (int)(x0 > x1 ? x0 : x1) + (int)glow_radius + 2;
    int min_y = (int)(y0 < y1 ? y0 : y1) - (int)glow_radius - 2;
    int max_y = (int)(y0 > y1 ? y0 : y1) + (int)glow_radius + 2;

    if (min_x < 0) min_x = 0;
    if (min_y < 0) min_y = 0;
    if (max_x >= canvas_w) max_x = canvas_w - 1;
    if (max_y >= canvas_h) max_y = canvas_h - 1;

    float inv_len = 1.0f / len;
    float inv_glow_sq = 1.0f / (glow_radius * glow_radius + 0.1f);
    float core_sq = core_thickness * core_thickness;

    for (int y = min_y; y <= max_y; y++) {
        float py = (float)y - y0;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = min_x; x <= max_x; x++) {
            float px = (float)x - x0;

            /* Project point onto line segment */
            float t = (px * dx + py * dy) * inv_len;
            if (t < 0.0f) t = 0.0f;
            else if (t > 1.0f) t = 1.0f;

            float nearest_x = x0 + t * dx;
            float nearest_y = y0 + t * dy;

            float dist_x = (float)x - nearest_x;
            float dist_y = (float)y - nearest_y;
            float dist_sq = dist_x * dist_x + dist_y * dist_y;

            if (dist_sq > glow_radius * glow_radius) continue;

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    float er_falloff = 1.0f - (dist_sq * inv_glow_sq);
                    uint32_t ea = (uint32_t)(er_falloff * alpha_scale * 255.0f);
                    row[x] = ((da > ea ? da - ea : 0) << 24) | (dst & 0x00FFFFFF);
                }
                continue;
            }

            /* Two-tier rendering: White-hot plasma core + outer ionized corona */
            if (dist_sq <= core_sq) {
                float core_alpha = (1.0f - dist_sq / core_sq) * alpha_scale;
                uint32_t ca = (uint32_t)(core_alpha * 255.0f);
                row[x] = w_brush_blend_add(core_color, row[x], ca);
            } else {
                float glow_falloff = (1.0f - (dist_sq * inv_glow_sq));
                glow_falloff = glow_falloff * glow_falloff; /* quadratic falloff */
                uint32_t ga = (uint32_t)(glow_falloff * alpha_scale * 160.0f);
                row[x] = w_brush_blend_add(glow_color, row[x], ga);
            }
        }
    }
}

/* Recursive fractal lightning arc subdivider */
static void subdivide_arc(
    uint32_t *pixels,
    int canvas_w,
    int canvas_h,
    float x0, float y0,
    float x1, float y1,
    float displacement,
    int depth,
    int max_depth,
    float thickness,
    float glow_r,
    uint32_t glow_col,
    uint32_t core_col,
    int is_eraser
) {
    if (depth >= max_depth) {
        draw_glow_segment(
            pixels, canvas_w, canvas_h,
            x0, y0, x1, y1,
            thickness, glow_r,
            glow_col, core_col,
            1.0f, is_eraser
        );
        return;
    }

    float mid_x = (x0 + x1) * 0.5f;
    float mid_y = (y0 + y1) * 0.5f;

    /* Perpendicular normal vector */
    float nx = -(y1 - y0);
    float ny = (x1 - x0);
    float n_len = nx * nx + ny * ny;
    if (n_len > 0.0001f) {
        float inv_nl = 1.0f / (n_len + 0.1f);
        nx *= inv_nl * 3.0f;
        ny *= inv_nl * 3.0f;
    }

    float jitter = w_brush_rand_symf() * displacement;
    mid_x += nx * jitter;
    mid_y += ny * jitter;

    float next_disp = displacement * 0.55f;

    /* Recurse left and right branches */
    subdivide_arc(
        pixels, canvas_w, canvas_h,
        x0, y0, mid_x, mid_y,
        next_disp, depth + 1, max_depth,
        thickness, glow_r, glow_col, core_col, is_eraser
    );
    subdivide_arc(
        pixels, canvas_w, canvas_h,
        mid_x, mid_y, x1, y1,
        next_disp, depth + 1, max_depth,
        thickness, glow_r, glow_col, core_col, is_eraser
    );

    /* Chance to fork a secondary dendritic side branch */
    if (depth < max_depth - 1 && w_brush_randf() < 0.35f) {
        float branch_angle = (w_brush_randf() * 0.6f + 0.4f) * (w_brush_randf() > 0.5f ? 1.0f : -1.0f);
        float bx = (x1 - mid_x) * 0.6f;
        float by = (y1 - mid_y) * 0.6f;
        float rotated_x = bx * 0.866f - by * 0.5f;
        float rotated_y = bx * 0.5f + by * 0.866f;

        subdivide_arc(
            pixels, canvas_w, canvas_h,
            mid_x, mid_y, mid_x + rotated_x, mid_y + rotated_y,
            next_disp * 0.6f, depth + 1, max_depth,
            thickness * 0.7f, glow_r * 0.7f,
            glow_col, core_col, is_eraser
        );
    }
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
    if (!_has_prev) {
        _prev_x = cx;
        _prev_y = cy;
        _has_prev = 1;
        return;
    }

    float target_x = cx;
    float target_y = cy;

    /* Ground attraction: check nearby pixels for electrostatic attraction */
    if (_param_ground > 0) {
        float ground_radius = radius * 1.5f;
        int check_steps = 8;
        for (int i = 0; i < check_steps; i++) {
            float ang = ((float)i / (float)check_steps) * 6.283185f;
            int sx = (int)(cx + ground_radius * 0.8f * (float)i / 8.0f);
            int sy = (int)(cy + ground_radius * 0.8f * (float)i / 8.0f);
            if (sx >= 0 && sx < canvas_w && sy >= 0 && sy < canvas_h) {
                uint32_t p = pixels[sy * canvas_w + sx];
                if (((p >> 24) & 0xFF) > 40) {
                    float pull = ((float)_param_ground / 100.0f) * 0.4f;
                    target_x += ((float)sx - target_x) * pull;
                    target_y += ((float)sy - target_y) * pull;
                    break;
                }
            }
        }
    }

    float base_disp = radius * ((float)_param_chaos / 100.0f);
    int max_depth = _param_voltage;
    if (max_depth < 2) max_depth = 2;
    if (max_depth > 6) max_depth = 6;

    float thickness = radius * 0.20f * pressure;
    if (thickness < 1.0f) thickness = 1.0f;
    float glow_r = radius * 1.2f;

    /* Outer corona color derived from brush tint, core is white-hot plasma */
    uint32_t cr = color & 0xFF;
    uint32_t cg = (color >> 8) & 0xFF;
    uint32_t cb = (color >> 16) & 0xFF;
    uint32_t glow_color = w_color_pack(cr, cg, cb, 255);

    /* Superheated core is bright cyan-white */
    uint32_t core_r = cr + 180 > 255 ? 255 : cr + 180;
    uint32_t core_g = cg + 180 > 255 ? 255 : cg + 180;
    uint32_t core_b = cb + 180 > 255 ? 255 : cb + 180;
    uint32_t core_color = w_color_pack(core_r, core_g, core_b, 255);

    subdivide_arc(
        pixels, canvas_w, canvas_h,
        _prev_x, _prev_y, target_x, target_y,
        base_disp, 0, max_depth,
        thickness, glow_r,
        glow_color, core_color,
        is_eraser
    );

    _prev_x = target_x;
    _prev_y = target_y;
}

void w_brush_stroke_end(void) {
    _has_prev = 0;
}
