/**
 * =========================================================================
 * Medical Radiography & Skeletal X-Ray Absorption (xray_radiography_bone.c)
 *
 * Penetrative Beer-Lambert attenuation ($I = I_0 e^{-\mu x}$) in C99:
 * - High-density skeletal bone core with dense radiopaque absorption (bright white)
 * - Translucent soft-tissue envelope with gradual linear attenuation gradient
 * - Photographic radiographic silver-halide film grain noise
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_bone_density = 85;   /* 20..100: Skeletal core radiopacity */
static int _param_tissue_envelope = 60;/* 10..100: Soft tissue absorption thickness */
static int _param_film_grain = 45;     /* 0..100: Silver-halide emulsion grain */
static int _param_inverse_film = 0;    /* 0=Standard film (white bone), 1=Fluoroscopy */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"xray_radiography_bone\","
        "\"title\":\"Skeletal X-Ray Radiography\","
        "\"category\":\"Medical FX\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Bone Radiopacity\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Soft Tissue Envelope\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Emulsion Grain\",\"min\":0,\"max\":100,\"default\":45,\"unit\":\"%\"},"
            "{\"name\":\"Fluoroscopy Invert\",\"min\":0,\"max\":1,\"default\":0}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_bone_density = val; break;
        case 1: _param_tissue_envelope = val; break;
        case 2: _param_film_grain = val; break;
        case 3: _param_inverse_film = (val != 0) ? 1 : 0; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x1A2B3C4D ^ (uint32_t)(x * 71.0f + y * 73.0f));
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
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float bone_r = radius * 0.45f * (0.8f + eff_p * 0.4f);
    float bone_r_sq = bone_r * bone_r;
    float inv_r_sq = 1.0f / (radius * radius);

    float bone_k = (float)_param_bone_density * 0.01f;
    float grain_k = (float)_param_film_grain * 0.01f;
    int invert = _param_inverse_film;

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float r = w_sqrtf(dist_sq);

            /* Beer-Lambert penetrative attenuation */
            float tissue_atten = 1.0f - (r / radius);
            tissue_atten = tissue_atten * tissue_atten; /* soft curve */

            /* Dense cortical bone core */
            float bone_atten = 0.0f;
            if (dist_sq <= bone_r_sq) {
                bone_atten = w_sqrtf(1.0f - (dist_sq / bone_r_sq));
            }

            float radiopacity = (tissue_atten * 0.35f + bone_atten * 0.85f * bone_k);
            if (radiopacity > 1.0f) radiopacity = 1.0f;

            /* Film emulsion silver-halide grain noise */
            uint32_t g_hash = ((uint32_t)x * 0x7F4A7C15) ^ ((uint32_t)y * 0x9E3779B9);
            float grain = ((float)(g_hash & 0x7F) / 128.0f - 0.5f) * grain_k * 0.15f;
            radiopacity += grain;
            if (radiopacity < 0.0f) radiopacity = 0.0f;
            if (radiopacity > 1.0f) radiopacity = 1.0f;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            uint32_t lum = (uint32_t)(radiopacity * 255.0f);
            if (invert) lum = 255 - lum;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 245.0f);
            if (alpha > 255) alpha = 255;

            /* Radiographic cyan-tinted monochrome film emulsion */
            uint32_t r_val = (uint32_t)((float)lum * 0.92f);
            uint32_t g_val = (uint32_t)((float)lum * 0.98f);
            uint32_t b_val = (uint32_t)(lum);
            uint32_t xray_c = w_color_pack(r_val, g_val, b_val, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(xray_c, row[x], alpha);
            }
        }
    }
}
