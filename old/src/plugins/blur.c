/**
 * =========================================================================
 * Box Blur Filter Plugin (plugins/filters/blur/main.c)
 * =========================================================================
 */

#include "esenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Blur\",\"params\":[{\"name\":\"Radius\",\"min\":1,\"max\":40,\"default\":5,\"unit\":\"px\"},{\"name\":\"Passes\",\"min\":1,\"max\":5,\"default\":1}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int r = (p1 > 0) ? p1 : 3;
    if (r > 50) r = 50;

    int passes = (p2 > 0) ? p2 : 1;
    if (passes > 5) passes = 5;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    // Dynamic scratch buffer located right after the layer pixels in memory
    uint32_t *temp = pixels + (width * height);

    for (int pass = 0; pass < passes; pass++) {
        // Horizontal pass: pixels -> temp
        for (int y = 0; y < height; y++) {
            int row = y * width;
            for (int x = 0; x < width; x++) {
                uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
                int count = 0;

                int min_x = (x - r < 0) ? 0 : (x - r);
                int max_x = (x + r >= width) ? (width - 1) : (x + r);

                for (int kx = min_x; kx <= max_x; kx++) {
                    uint32_t p = pixels[row + kx];
                    uint32_t a = (p >> 24) & 0xFF;
                    if (a == 0) continue;

                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += a;
                    count++;
                }

                if (count == 0) {
                    temp[row + x] = pixels[row + x];
                } else {
                    temp[row + x] = ((sum_a / count) << 24) |
                                    ((sum_b / count) << 16) |
                                    ((sum_g / count) << 8)  |
                                    (sum_r / count);
                }
            }
        }

        // Vertical pass: temp -> pixels
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
                int count = 0;

                int min_y = (y - r < 0) ? 0 : (y - r);
                int max_y = (y + r >= height) ? (height - 1) : (y + r);

                for (int ky = min_y; ky <= max_y; ky++) {
                    uint32_t p = temp[ky * width + x];
                    uint32_t a = (p >> 24) & 0xFF;
                    if (a == 0) continue;

                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += a;
                    count++;
                }

                if (count > 0) {
                    pixels[y * width + x] = ((sum_a / count) << 24) |
                                            ((sum_b / count) << 16) |
                                            ((sum_g / count) << 8)  |
                                            (sum_r / count);
                } else {
                    pixels[y * width + x] = temp[y * width + x];
                }
            }
        }
    }
}
