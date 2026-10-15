/**
 * =========================================================================
 * Parallax Spatial Multiplexed Autostereogram (holographic_stereogram.c)
 *
 * Micro-lenticular autostereoscopy & binocular parallax encoding in C99:
 * - Vertical micro-lenticular cylindrical lens stripe multiplexing
 * - Horizontal binocular disparity shift encoding optical depth layers
 * - High-frequency autostereogram phase interleaving
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_lenticular_pitch = 6; /* 3..16: Lenticular stripe pitch in pixels */
static int _param_parallax_depth = 70;  /* 10..100: Binocular disparity offset */
static int _param_phase_contrast = 80;  /* 20..100: Interlaced channel contrast */
static int _param_depth_layer = 2;      /* 1..4: Target 3D plane depth level */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"holographic_stereogram\","
        "\"title\":\"Autostereogram Lenticular\","
        "\"category\":\"Holography\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Lenticular Pitch\",\"min\":3,\"max\":16,\"default\":6,\"unit\":\"px\"},"
            "{\"name\":\"Parallax Disparity\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Channel Contrast\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Depth Layer\",\"min\":1,\"max\":4,\"default\":2,\"unit\":\"plane\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_lenticular_pitch = (val < 3) ? 3 : (val > 16 ? 16 : val); break;
        case 1: _param_parallax_depth = val; break;
        case 2: _param_phase_contrast = val; break;
        case 3: _param_depth_layer = (val < 1) ? 1 : (val > 4 ? 4 : val); break;
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

    int pitch = _param_lenticular_pitch;
    int depth_shift = (int)(((float)_param_parallax_depth * 0.01f) * (float)_param_depth_layer * 3.0f * eff_p);
    float contrast = (float)_param_phase_contrast * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

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

            /* Lenticular vertical cylindrical lens sub-pixel index */
            int lent_phase = x % pitch;
            float lens_norm = (float)lent_phase / (float)pitch;

            /* Cylindrical lens refraction curve */
            float lens_curve = w_sinf(lens_norm * 3.14159f);

            /* Stereoscopic binocular sampling: Left-eye vs Right-eye horizontal disparity */
            int eye_offset = (lent_phase < (pitch / 2)) ? -depth_shift : depth_shift;
            int src_x = x + eye_offset;
            if (src_x < 0) src_x = 0; else if (src_x >= canvas_w) src_x = canvas_w - 1;

            uint32_t sample_px = pixels[y * canvas_w + src_x];
            uint32_t sr = w_color_get_r(sample_px);
            uint32_t sg = w_color_get_g(sample_px);
            uint32_t sb = w_color_get_b(sample_px);

            /* Modulate with lenticular specular contrast */
            float mod = 0.5f + (lens_curve - 0.5f) * contrast;
            uint32_t r = (uint32_t)(((float)cr * 0.5f + (float)sr * 0.5f) * mod);
            uint32_t g = (uint32_t)(((float)cg * 0.5f + (float)sg * 0.5f) * mod);
            uint32_t b = (uint32_t)(((float)cb * 0.5f + (float)sb * 0.5f) * mod);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            uint32_t alpha = (uint32_t)(falloff * eff_p * 245.0f);
            if (alpha > 255) alpha = 255;

            uint32_t stereo_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(stereo_c, row[x], alpha);
            }
        }
    }
}
