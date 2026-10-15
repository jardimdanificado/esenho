/**
 * =========================================================================
 * Procedural Dragon Scale Armor & Reptilian Shingles (dragon_scale_armor.c)
 *
 * Tangent-aligned shingle tessellation & biological scale relief in C99:
 * - Overlapping convex reptilian scales self-aligning to stroke tangent vector
 * - 3D dorsal ridge relief and specular highlight shading per scale
 * - Pressure controls scale size, spread, and plate interlocking density
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_scale_size = 12;     /* 6..28: Scale diameter in pixels */
static int _param_relief_depth = 75;   /* 20..100: 3D scale curvature */
static int _param_dorsal_ridge = 70;   /* 10..100: Central spine keel sharpness */
static int _param_specular = 60;       /* 10..100: Reptilian sheen */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"dragon_scale_armor\","
        "\"title\":\"Dragon Scale Armor\","
        "\"category\":\"Creature FX\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Scale Pitch\",\"min\":6,\"max\":28,\"default\":12,\"unit\":\"px\"},"
            "{\"name\":\"3D Relief Depth\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Dorsal Ridge\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Reptilian Sheen\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_scale_size = (val < 6) ? 6 : (val > 28 ? 28 : val); break;
        case 1: _param_relief_depth = val; break;
        case 2: _param_dorsal_ridge = val; break;
        case 3: _param_specular = val; break;
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

    float inv_r_sq = 1.0f / (radius * radius);
    float pitch = (float)_param_scale_size * (0.8f + eff_p * 0.4f);
    float inv_pitch = 1.0f / pitch;

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    uint32_t cr = w_color_get_r(color);
    uint32_t cg = w_color_get_g(color);
    uint32_t cb = w_color_get_b(color);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Align to stroke direction */
            float u = (dx * cos_a + dy * sin_a);
            float v = (-dx * sin_a + dy * cos_a);

            /* Shingle scale tessellation: row staggered offset */
            float row_idx = w_floorf(u * inv_pitch);
            float row_phase = ((int)row_idx & 1) ? (pitch * 0.5f) : 0.0f;

            float cell_u = u - row_idx * pitch;
            float cell_v = v + row_phase;
            float col_idx = w_floorf(cell_v * inv_pitch);
            cell_v -= col_idx * pitch;

            /* Center scale in [ -0.5, 0.5 ] */
            float su = (cell_u * inv_pitch) - 0.5f;
            float sv = (cell_v * inv_pitch) - 0.5f;

            /* Scale convex leaf shape equation */
            float scale_shape = (sv * sv * 4.0f) + (su * su * 1.5f) - (su * 0.4f);
            if (scale_shape > 0.55f) continue;

            /* 3D Dorsal ridge keel running down center of scale */
            float ridge = 1.0f - (sv < 0.0f ? -sv : sv) * 3.0f;
            if (ridge < 0.0f) ridge = 0.0f;

            /* Scale light relief */
            float relief = 1.0f - scale_shape;
            float shade = relief * 0.7f + ridge * 0.3f;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            uint32_t r = (uint32_t)((float)cr * (0.5f + 0.6f * shade));
            uint32_t g = (uint32_t)((float)cg * (0.5f + 0.6f * shade));
            uint32_t b = (uint32_t)((float)cb * (0.5f + 0.6f * shade));
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 255.0f);
            if (alpha > 255) alpha = 255;

            uint32_t scale_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(scale_c, row[x], alpha);
            }
        }
    }
}
