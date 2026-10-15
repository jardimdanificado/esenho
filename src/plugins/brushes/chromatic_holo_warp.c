/**
 * =========================================================================
 * Molten Mercury & Holographic Refraction Brush (chromatic_holo_warp.c)
 *
 * Real-time liquid metal smear with multi-spectral thin-film wave interference:
 * - Samples underlying canvas pixels to compute real-time Sobel normal fields
 * - Simulates molten mercury displacement with chromatic edge refraction
 * - Evaluates trigonometric optical wave phase shifts for rainbow holographic sheen
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_smear = 70;      /* 0..100: Fluid displacement smear */
static int _param_chroma = 60;     /* 0..100: Chromatic aberration strength */
static int _param_holo = 80;       /* 0..100: Holographic thin-film iridescence */
static int _param_specular = 75;   /* 0..100: Molten metal specular highlight */

static float _last_x = 0.0f;
static float _last_y = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"chromatic_holo_warp\","
        "\"title\":\"Molten Mercury Holograph\","
        "\"category\":\"Optics & Liquid\","
        "\"spacing\":0.15,"
        "\"minRadius\":5,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Molten Smear\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Chromatic Aberration\",\"min\":0,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Holo Iridescence\",\"min\":0,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Metallic Specular\",\"min\":0,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_smear = val; break;
        case 1: _param_chroma = val; break;
        case 2: _param_holo = val; break;
        case 3: _param_specular = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _last_x = x;
    _last_y = y;
}

static inline float get_lum(uint32_t c) {
    float r = (float)(c & 0xFF);
    float g = (float)((c >> 8) & 0xFF);
    float b = (float)((c >> 16) & 0xFF);
    return (0.299f * r + 0.587f * g + 0.114f * b) * 0.0039215f; /* / 255.0 */
}

/* Fast cosine approximation for wave phase */
static inline float fast_cos_sq(float x) {
    /* wrap x to [-PI, PI] */
    const float PI = 3.14159265f;
    float n = x * (1.0f / (2.0f * PI));
    float rem = x - (float)((int)n) * (2.0f * PI);
    if (rem > PI) rem -= 2.0f * PI;
    else if (rem < -PI) rem += 2.0f * PI;

    /* Bhaskara I cosine approximation */
    float r2 = rem * rem;
    float c = (PI * PI - 4.0f * r2) / (PI * PI + r2);
    if (c < 0.0f) c = 0.0f;
    return c * c;
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

    float dx = cx - _last_x;
    float dy = cy - _last_y;
    _last_x = cx;
    _last_y = cy;

    float vel_mag = dx * dx + dy * dy;
    if (vel_mag > 0.001f) {
        float inv_len = 1.0f / (vel_mag + 0.1f);
        dx *= inv_len * 4.0f;
        dy *= inv_len * 4.0f;
    }

    int x0 = (int)(cx - radius - 2.0f); if (x0 < 1) x0 = 1;
    int y0 = (int)(cy - radius - 2.0f); if (y0 < 1) y0 = 1;
    int x1 = (int)(cx + radius + 2.0f); if (x1 >= canvas_w - 1) x1 = canvas_w - 2;
    int y1 = (int)(cy + radius + 2.0f); if (y1 >= canvas_h - 1) y1 = canvas_h - 2;

    float inv_r_sq = 1.0f / (radius * radius);
    float smear_amount = ((float)_param_smear / 100.0f) * pressure * 6.0f;
    float chroma_shift = ((float)_param_chroma / 100.0f) * 3.5f;
    float holo_strength = ((float)_param_holo / 100.0f);
    float spec_factor = ((float)_param_specular / 100.0f);

    uint32_t tint_r = color & 0xFF;
    uint32_t tint_g = (color >> 8) & 0xFF;
    uint32_t tint_b = (color >> 16) & 0xFF;
    uint32_t tint_a = (color >> 24) & 0xFF;

    for (int y = y0; y <= y1; y++) {
        float fdy = (float)y - cy;
        float dy_sq = fdy * fdy;
        uint32_t *row_m1 = pixels + ((y - 1) * canvas_w);
        uint32_t *row = pixels + (y * canvas_w);
        uint32_t *row_p1 = pixels + ((y + 1) * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float fdx = (float)x - cx;
            float dist_sq = fdx * fdx + dy_sq;
            if (dist_sq > radius * radius) continue;

            float falloff = 1.0f - (dist_sq * inv_r_sq);
            float weight = falloff * pressure;

            /* Sobel luminance normal extraction */
            float l_left  = get_lum(row[x - 1]);
            float l_right = get_lum(row[x + 1]);
            float l_up    = get_lum(row_m1[x]);
            float l_down  = get_lum(row_p1[x]);

            float nx = (l_right - l_left) * 2.0f;
            float ny = (l_down - l_up) * 2.0f;

            /* Smear displacement vector */
            float disp_x = (nx * 4.0f + dx) * smear_amount * falloff;
            float disp_y = (ny * 4.0f + dy) * smear_amount * falloff;

            /* Multi-spectral chromatic sampling with optical dispersion */
            int rx = (int)((float)x - disp_x - chroma_shift);
            int ry = (int)((float)y - disp_y - chroma_shift);
            int gx = (int)((float)x - disp_x);
            int gy = (int)((float)y - disp_y);
            int bx = (int)((float)x - disp_x + chroma_shift);
            int by = (int)((float)y - disp_y + chroma_shift);

            if (rx < 0) rx = 0; else if (rx >= canvas_w) rx = canvas_w - 1;
            if (ry < 0) ry = 0; else if (ry >= canvas_h) ry = canvas_h - 1;
            if (gx < 0) gx = 0; else if (gx >= canvas_w) gx = canvas_w - 1;
            if (gy < 0) gy = 0; else if (gy >= canvas_h) gy = canvas_h - 1;
            if (bx < 0) bx = 0; else if (bx >= canvas_w) bx = canvas_w - 1;
            if (by < 0) by = 0; else if (by >= canvas_h) by = canvas_h - 1;

            uint32_t c_red   = pixels[ry * canvas_w + rx];
            uint32_t c_green = pixels[gy * canvas_w + gx];
            uint32_t c_blue  = pixels[by * canvas_w + bx];

            uint32_t samp_r = c_red & 0xFF;
            uint32_t samp_g = (c_green >> 8) & 0xFF;
            uint32_t samp_b = (c_blue >> 16) & 0xFF;
            uint32_t samp_a = (c_green >> 24) & 0xFF;

            /* If canvas pixel is empty, use brush ink color */
            if (samp_a < 30) {
                samp_r = tint_r;
                samp_g = tint_g;
                samp_b = tint_b;
                samp_a = tint_a;
            }

            /* Thin-film holographic wave interference */
            float phase = (nx + ny) * 8.0f + falloff * 5.0f;
            float irid_r = fast_cos_sq(phase);
            float irid_g = fast_cos_sq(phase + 2.094f);
            float irid_b = fast_cos_sq(phase + 4.188f);

            float out_r = (float)samp_r * (1.0f - holo_strength) + (float)samp_r * irid_r * holo_strength * 1.5f;
            float out_g = (float)samp_g * (1.0f - holo_strength) + (float)samp_g * irid_g * holo_strength * 1.5f;
            float out_b = (float)samp_b * (1.0f - holo_strength) + (float)samp_b * irid_b * holo_strength * 1.5f;

            /* Molten liquid specular highlight */
            float spec = nx * 0.707f + ny * 0.707f;
            if (spec > 0.0f) {
                float spec_highlight = spec * spec * spec * spec * spec_factor * 255.0f * falloff;
                out_r += spec_highlight;
                out_g += spec_highlight;
                out_b += spec_highlight;
            }

            uint32_t final_r = out_r > 255.0f ? 255 : (uint32_t)out_r;
            uint32_t final_g = out_g > 255.0f ? 255 : (uint32_t)out_g;
            uint32_t final_b = out_b > 255.0f ? 255 : (uint32_t)out_b;
            uint32_t eff_alpha = (uint32_t)(weight * 240.0f);
            if (eff_alpha > 255) eff_alpha = 255;

            uint32_t out_pixel = w_color_pack(final_r, final_g, final_b, eff_alpha);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > eff_alpha) ? da - eff_alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_over(out_pixel, row[x], eff_alpha);
            }
        }
    }
}

void w_brush_stroke_end(void) {
}
