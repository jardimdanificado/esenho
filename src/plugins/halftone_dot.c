/**
 * =========================================================================
 * Halftone Dot Screen Filter Plugin (plugins/halftone_dot.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Halftone Screen Dots\",\"params\":[{\"name\":\"Dot Cell Size\",\"min\":3,\"max\":24,\"default\":6,\"unit\":\"px\"},{\"name\":\"Invert (0=Dark, 1=Light)\",\"min\":0,\"max\":1,\"default\":0}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int cell = (p1 >= 3 && p1 <= 24) ? p1 : 6;
    int invert = (p2 > 0) ? 1 : 0;
    float max_r = (float)cell * 0.707f;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    for (int by = 0; by < height; by += cell) {
        int bh = (by + cell <= height) ? cell : (height - by);
        for (int bx = 0; bx < width; bx += cell) {
            int bw = (bx + cell <= width) ? cell : (width - bx);

            // Compute average luma in cell
            int sum_lum = 0, count = 0;
            for (int y = 0; y < bh; y++) {
                int row = (by + y) * width;
                for (int x = 0; x < bw; x++) {
                    uint32_t p = pixels[row + (bx + x)];
                    uint32_t a = (p >> 24) & 0xFF;
                    if (a == 0) continue;

                    int r = p & 0xFF;
                    int g = (p >> 8) & 0xFF;
                    int b = (p >> 16) & 0xFF;
                    sum_lum += (r * 299 + g * 587 + b * 114) / 1000;
                    count++;
                }
            }

            if (count == 0) continue;

            int avg_lum = sum_lum / count;
            float luma_ratio = (float)avg_lum / 255.0f;
            if (invert) luma_ratio = 1.0f - luma_ratio;

            float dot_radius = (1.0f - luma_ratio) * max_r;
            float dot_r2 = dot_radius * dot_radius;
            float center_x = (float)bx + (float)bw * 0.5f;
            float center_y = (float)by + (float)bh * 0.5f;

            for (int y = 0; y < bh; y++) {
                int py = by + y;
                float dy = (float)py - center_y;
                int row = py * width;

                for (int x = 0; x < bw; x++) {
                    int px = bx + x;
                    uint32_t orig = pixels[row + px];
                    uint32_t a = (orig >> 24) & 0xFF;
                    if (a == 0) continue;

                    float dx = (float)px - center_x;
                    float dist2 = dx * dx + dy * dy;

                    uint32_t col;
                    if (dist2 <= dot_r2) {
                        col = invert ? 0xFFFFFFFF : 0xFF000000;
                    } else {
                        col = invert ? 0xFF000000 : 0xFFFFFFFF;
                    }
                    pixels[row + px] = (a << 24) | (col & 0x00FFFFFF);
                }
            }
        }
    }
}
