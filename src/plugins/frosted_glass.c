/**
 * =========================================================================
 * Frosted Glass & Sandblasted Lens Filter Plugin (plugins/frosted_glass.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Frosted Glass\",\"params\":[{\"name\":\"Refraction Jitter\",\"min\":2,\"max\":25,\"default\":8,\"unit\":\"px\"},{\"name\":\"Dispersion Softness\",\"min\":1,\"max\":5,\"default\":2}]}";
}

static inline int clamp_coord(int v, int max_v) {
    if (v < 0) return 0;
    if (v >= max_v) return max_v - 1;
    return v;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int jitter = (p1 >= 2 && p1 <= 25) ? p1 : 8;
    int blur_r = (p2 >= 1 && p2 <= 5) ? p2 : 2;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t center_p = temp[y * width + x];
            uint32_t a = (center_p >> 24) & 0xFF;
            if (a == 0) continue;

            // Pseudo-random frosted refraction noise
            uint32_t h = (((x * 374761393 + y * 668265263) ^ 0x5bf03635) & 0xFFFF);
            int jx = (int)((h & 0xFF) % (jitter * 2 + 1)) - jitter;
            int jy = (int)(((h >> 8) & 0xFF) % (jitter * 2 + 1)) - jitter;

            int sx = clamp_coord(x + jx, width);
            int sy = clamp_coord(y + jy, height);

            // Soft box sample around refraction target
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0;
            int count = 0;

            for (int dy = -blur_r; dy <= blur_r; dy++) {
                int py = clamp_coord(sy + dy, height);
                int row = py * width;
                for (int dx = -blur_r; dx <= blur_r; dx++) {
                    int px = clamp_coord(sx + dx, width);
                    uint32_t p = temp[row + px];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    count++;
                }
            }

            if (count > 0) {
                pixels[y * width + x] = (a << 24) |
                                        (((sum_b / count) & 0xFF) << 16) |
                                        (((sum_g / count) & 0xFF) << 8)  |
                                        ((sum_r / count) & 0xFF);
            }
        }
    }
}
