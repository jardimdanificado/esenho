/**
 * =========================================================================
 * High-Pass Unsharp Mask Sharpening Filter Plugin (plugins/sharpen.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Sharpen (Unsharp Mask)\",\"params\":[{\"name\":\"Amount %\",\"min\":10,\"max\":200,\"default\":80},{\"name\":\"Threshold\",\"min\":0,\"max\":50,\"default\":5}]}";
}

static inline uint8_t clamp255(int v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (uint8_t)v;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int amount = (p1 >= 10 && p1 <= 200) ? p1 : 80;
    int thresh = (p2 >= 0 && p2 <= 50) ? p2 : 5;
    float weight = (float)amount * 0.01f;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            uint32_t center_p = temp[y * width + x];
            uint32_t a = (center_p >> 24) & 0xFF;
            if (a == 0) continue;

            int cr = center_p & 0xFF;
            int cg = (center_p >> 8) & 0xFF;
            int cb = (center_p >> 16) & 0xFF;

            // Box blur 3x3 of neighbors
            int sum_r = 0, sum_g = 0, sum_b = 0;
            for (int dy = -1; dy <= 1; dy++) {
                int row = (y + dy) * width;
                for (int dx = -1; dx <= 1; dx++) {
                    uint32_t np = temp[row + (x + dx)];
                    sum_r += (np & 0xFF);
                    sum_g += ((np >> 8) & 0xFF);
                    sum_b += ((np >> 16) & 0xFF);
                }
            }

            int avg_r = sum_r / 9;
            int avg_g = sum_g / 9;
            int avg_b = sum_b / 9;

            int diff_r = cr - avg_r;
            int diff_g = cg - avg_g;
            int diff_b = cb - avg_b;

            if (diff_r > thresh || diff_r < -thresh) cr = clamp255((int)((float)cr + (float)diff_r * weight));
            if (diff_g > thresh || diff_g < -thresh) cg = clamp255((int)((float)cg + (float)diff_g * weight));
            if (diff_b > thresh || diff_b < -thresh) cb = clamp255((int)((float)cb + (float)diff_b * weight));

            pixels[y * width + x] = (a << 24) | ((uint32_t)cb << 16) | ((uint32_t)cg << 8) | (uint32_t)cr;
        }
    }
}
