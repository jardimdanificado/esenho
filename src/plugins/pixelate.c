/**
 * =========================================================================
 * Pixelate Filter Plugin (plugins/filters/pixelate/main.c)
 * =========================================================================
 */

#include "esenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Pixelate\",\"params\":[{\"name\":\"Block Size\",\"min\":2,\"max\":64,\"default\":8,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    int size = (p1 > 1) ? p1 : 8;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    for (int by = 0; by < height; by += size) {
        for (int bx = 0; bx < width; bx += size) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;

            for (int dy = 0; dy < size && by + dy < height; dy++) {
                for (int dx = 0; dx < size && bx + dx < width; dx++) {
                    uint32_t p = pixels[(by + dy) * width + (bx + dx)];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }

            if (count > 0) {
                uint32_t avg = ((sum_a / count) << 24) |
                               ((sum_b / count) << 16) |
                               ((sum_g / count) << 8)  |
                               (sum_r / count);

                for (int dy = 0; dy < size && by + dy < height; dy++) {
                    for (int dx = 0; dx < size && bx + dx < width; dx++) {
                        pixels[(by + dy) * width + (bx + dx)] = avg;
                    }
                }
            }
        }
    }
}
