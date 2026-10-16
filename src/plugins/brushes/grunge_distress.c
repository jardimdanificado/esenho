/**
 * =========================================================================
 * Zero-Copy WASM Brush: Grunge Distress (grunge_distress.c)
 * Category: texture
 * AOT Compiled for Esenho Zero-Copy WebAssembly Brush Protocol
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int32_t g_size = 45;
static int32_t g_opacity = 85;
static int32_t g_hardness = 60;
static int32_t g_flow = 80;
static int32_t g_grain = 8;
static int32_t g_spacing = 10;
static int32_t g_shape = 0;
static int32_t g_tex_mode = 6;
static int32_t g_texture_contrast = 75;
static int32_t g_texture_scale = 120;
static int32_t g_scatter = 20;
static int32_t g_auto_rotate = 1;
static int32_t g_pressure_flow = 1;
static int32_t g_smoothing = 10;
static int32_t g_size_jitter = 15;
static int32_t g_angle_jitter = 25;
static int32_t g_tex_scale_with_size = 1;
static float g_depletion_charge = 1.0f;
static float g_stroke_dist = 0.0f;

W_EXPORT const char* w_brush_get_info(void) {
    return "{\"name\":\"grunge_distress\",\"title\":\"Grunge Distress\",\"category\":\"texture\",\"engine\":\"parametric\",\"spacing\":0.1,\"minRadius\":11,\"maxRadius\":135,\"params\":[{\"id\":\"size\",\"name\":\"Size\",\"type\":\"int\",\"min\":11,\"max\":135,\"default\":45,\"unit\":\"px\"},{\"id\":\"opacity\",\"name\":\"Opacity\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":85,\"unit\":\"%\"},{\"id\":\"hardness\",\"name\":\"Hardness\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":60,\"unit\":\"%\"},{\"id\":\"flow\",\"name\":\"Flow\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":80,\"unit\":\"%\"},{\"id\":\"grain\",\"name\":\"Paper Grain\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":8,\"unit\":\"%\"},{\"id\":\"spacing\",\"name\":\"Spacing\",\"type\":\"int\",\"min\":1,\"max\":100,\"default\":10,\"unit\":\"%\"},{\"id\":\"shape\",\"name\":\"Tip Shape\",\"type\":\"int\",\"min\":0,\"max\":5,\"default\":0},{\"id\":\"tex_mode\",\"name\":\"Texture Mode\",\"type\":\"int\",\"min\":0,\"max\":13,\"default\":6},{\"id\":\"texture_contrast\",\"name\":\"Texture Contrast\",\"type\":\"int\",\"min\":0,\"max\":200,\"default\":75,\"unit\":\"%\"},{\"id\":\"texture_scale\",\"name\":\"Texture Scale\",\"type\":\"int\",\"min\":10,\"max\":300,\"default\":120,\"unit\":\"%\"},{\"id\":\"scatter\",\"name\":\"Scatter\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":20,\"unit\":\"%\"},{\"id\":\"auto_rotate\",\"name\":\"Follow Direction\",\"type\":\"bool\",\"min\":0,\"max\":1,\"default\":1},{\"id\":\"pressure_flow\",\"name\":\"Pressure Flow\",\"type\":\"bool\",\"min\":0,\"max\":1,\"default\":1},{\"id\":\"smoothing\",\"name\":\"Streamline Smoothing\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":10,\"unit\":\"%\"},{\"id\":\"size_jitter\",\"name\":\"Size Jitter\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":15,\"unit\":\"%\"},{\"id\":\"angle_jitter\",\"name\":\"Angle Jitter\",\"type\":\"int\",\"min\":0,\"max\":100,\"default\":25,\"unit\":\"%\"},{\"id\":\"tex_scale_with_size\",\"name\":\"Scale Texture With Size\",\"type\":\"bool\",\"min\":0,\"max\":1,\"default\":1}]}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    (void)canvas_w;
    (void)canvas_h;
    g_depletion_charge = 1.0f;
    g_stroke_dist = 0.0f;
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_size = value; break;
        case 1: g_opacity = value; break;
        case 2: g_hardness = value; break;
        case 3: g_flow = value; break;
        case 4: g_grain = value; break;
        case 5: g_spacing = value; break;
        case 6: g_shape = value; break;
        case 7: g_tex_mode = value; break;
        case 8: g_texture_contrast = value; break;
        case 9: g_texture_scale = value; break;
        case 10: g_scatter = value; break;
        case 11: g_auto_rotate = value; break;
        case 12: g_pressure_flow = value; break;
        case 13: g_smoothing = value; break;
        case 14: g_size_jitter = value; break;
        case 15: g_angle_jitter = value; break;
        case 16: g_tex_scale_with_size = value; break;
        default: break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    (void)pressure;
    (void)tilt_x;
    (void)tilt_y;
    (void)color;
    (void)is_eraser;
    g_depletion_charge = 1.0f;
    g_stroke_dist = 0.0f;
    w_brush_srand((uint32_t)(x * 1234.5f + y * 678.9f + 1.0f));
}

W_EXPORT void w_brush_stroke_end(void) {}

W_EXPORT void w_brush_render_dab(
    uint32_t *pixels,
    int32_t canvas_w,
    int32_t canvas_h,
    float cx, float cy,
    float radius,
    float pressure,
    float angle_deg,
    float speed,
    uint32_t color,
    int32_t is_eraser
) {
    if (!pixels || canvas_w <= 0 || canvas_h <= 0) return;

    float eff_pressure = (pressure > 0.01f) ? pressure : 0.5f;
    float eff_r = radius;
    if (g_scatter > 0) {
        float sc_mag = (float)g_scatter * 0.01f * eff_r;
        cx += w_brush_rand_symf() * sc_mag;
        cy += w_brush_rand_symf() * sc_mag;
    }

    if (eff_r < 0.5f) eff_r = 0.5f;
    float eff_r_sq = eff_r * eff_r;

    int bound = (int)(eff_r + 3.0f);
    int x0 = (int)(cx - bound);
    int y0 = (int)(cy - bound);
    int x1 = (int)(cx + bound + 1);
    int y1 = (int)(cy + bound + 1);

    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > canvas_w) x1 = canvas_w;
    if (y1 > canvas_h) y1 = canvas_h;
    if (x0 >= x1 || y0 >= y1) return;

    float base_alpha = (float)((color >> 24) & 0xFF) / 255.0f;
    if (base_alpha <= 0.001f) base_alpha = 1.0f;
    base_alpha *= ((float)g_flow / 100.0f);
    base_alpha *= ((float)g_opacity / 100.0f);
    if (g_pressure_flow) base_alpha *= (0.3f + 0.7f * eff_pressure);

    int hardness = 80;
    hardness = g_hardness;

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = &pixels[y * canvas_w];
        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
            float dist = w_sqrtf(dx * dx + dy * dy);
            if (dist > eff_r) continue;

            float falloff = w_brush_falloff_hardness(dist, eff_r, hardness);
            if (falloff <= 0.001f) continue;
            if (g_grain > 0) {
                float noise = w_brush_noise2df(x, y, 0x9e3779b9);
                float tooth = 1.0f - ((float)g_grain * 0.008f * (1.0f - noise));
                if (tooth < 0.0f) tooth = 0.0f;
                falloff *= tooth;
            }

            uint32_t a_val = (uint32_t)(base_alpha * falloff * 255.0f);
            if (a_val > 255) a_val = 255;
            if (a_val == 0) continue;

            uint32_t cur_p = row[x];
            if (is_eraser) {
                row[x] = w_brush_blend_erase(cur_p, a_val);
            } else {
                row[x] = w_brush_blend_over(color, cur_p, a_val);
            }
        }
    }
}
