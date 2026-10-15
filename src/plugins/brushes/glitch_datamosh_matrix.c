/**
 * =========================================================================
 * Digital Video Compression Artifacts & Datamosh Tearing (glitch_datamosh_matrix.c)
 *
 * Real-time MPEG macroblock displacement & chromatic glitch artifacts in C99:
 * - 8x8 and 16x16 discrete cosine transform (DCT) macroblock tearing
 * - Motion vector temporal dislocation sampling from existing canvas pixels
 * - RGB channel split chromatic aberration (lateral color channel shear)
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_block_size = 8;     /* 4..24: Macroblock pixel dimension */
static int _param_mosh_drift = 60;    /* 10..100: Motion vector shift distance */
static int _param_chroma_split = 75;  /* 0..100: RGB aberration channel shear */
static int _param_bit_crush = 50;     /* 0..100: Posterization quantization */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"glitch_datamosh_matrix\","
        "\"title\":\"Datamosh Glitch Matrix\","
        "\"category\":\"Digital FX\","
        "\"spacing\":0.06,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Macroblock Size\",\"min\":4,\"max\":24,\"default\":8,\"unit\":\"px\"},"
            "{\"name\":\"Mosh Vector Drift\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Chroma Aberration\",\"min\":0,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Bit-Crush Quantize\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_block_size = (val < 4) ? 4 : (val > 24 ? 24 : val); break;
        case 1: _param_mosh_drift = val; break;
        case 2: _param_chroma_split = val; break;
        case 3: _param_bit_crush = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xDA7A3058 ^ (uint32_t)(x * 67.0f + y * 71.0f));
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
    int block = _param_block_size;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + (float)block + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    /* Snap to macroblock grid */
    x0 = (x0 / block) * block;
    y0 = (y0 / block) * block;

    float inv_r_sq = 1.0f / (radius * radius);
    float drift = ((float)_param_mosh_drift * 0.25f) * eff_p;
    int split = (int)(((float)_param_chroma_split * 0.01f) * 6.0f * eff_p);
    int quant = (_param_bit_crush > 20) ? (256 >> (8 - (_param_bit_crush / 20))) : 1;
    if (quant < 1) quant = 1;

    float rad_ang = angle_deg * 0.0174532925f;
    float mosh_vx = w_cosf(rad_ang) * drift;
    float mosh_vy = w_sinf(rad_ang) * drift;

    for (int by = y0; by < y1; by += block) {
        float dy = (float)by + (float)block * 0.5f - cy;
        float dy_sq = dy * dy;

        for (int bx = x0; bx < x1; bx += block) {
            float dx = (float)bx + (float)block * 0.5f - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > radius * radius) continue;

            /* Stochastic block selection */
            uint32_t b_hash = ((uint32_t)(bx / block) * 0x1F1F1F1F) ^ ((uint32_t)(by / block) * 0x3D3D3D3D);
            if ((b_hash & 0x7) > 5) continue;

            /* Motion vector displacement */
            int shift_x = (int)(mosh_vx + (float)((int)(b_hash & 0xF) - 8) * 0.8f);
            int shift_y = (int)(mosh_vy + (float)((int)((b_hash >> 4) & 0xF) - 8) * 0.8f);

            for (int py = 0; py < block; py++) {
                int cy2 = by + py;
                if (cy2 < 0 || cy2 >= canvas_h) continue;

                int src_y = cy2 - shift_y;
                if (src_y < 0) src_y = 0;
                if (src_y >= canvas_h) src_y = canvas_h - 1;

                uint32_t *row_dst = pixels + (cy2 * canvas_w);
                uint32_t *row_src = pixels + (src_y * canvas_w);

                for (int px = 0; px < block; px++) {
                    int cx2 = bx + px;
                    if (cx2 < 0 || cx2 >= canvas_w) continue;

                    /* Chromatic aberration sampling */
                    int src_x_r = cx2 - shift_x + split;
                    int src_x_g = cx2 - shift_x;
                    int src_x_b = cx2 - shift_x - split;

                    if (src_x_r < 0) src_x_r = 0; else if (src_x_r >= canvas_w) src_x_r = canvas_w - 1;
                    if (src_x_g < 0) src_x_g = 0; else if (src_x_g >= canvas_w) src_x_g = canvas_w - 1;
                    if (src_x_b < 0) src_x_b = 0; else if (src_x_b >= canvas_w) src_x_b = canvas_w - 1;

                    uint32_t col_r = row_src[src_x_r];
                    uint32_t col_g = row_src[src_x_g];
                    uint32_t col_b = row_src[src_x_b];

                    uint32_t r = w_color_get_r(col_r);
                    uint32_t g = w_color_get_g(col_g);
                    uint32_t b = w_color_get_b(col_b);

                    if (quant > 1) {
                        r = (r / quant) * quant;
                        g = (g / quant) * quant;
                        b = (b / quant) * quant;
                    }

                    uint32_t out_c = w_color_pack(r, g, b, 255);
                    row_dst[cx2] = out_c;
                }
            }
        }
    }
}
