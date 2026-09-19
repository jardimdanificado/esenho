/**
 * =========================================================================
 * Sobel Edge Detection Filter Plugin (plugins/filters/edge/main.c)
 * =========================================================================
 */

#include "esenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Edge Detect\",\"params\":[{\"name\":\"Sensitivity\",\"min\":5,\"max\":150,\"default\":30},{\"name\":\"Paper Sketch\",\"min\":0,\"max\":1,\"default\":0}]}";
}

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

static inline uint8_t get_lum(uint32_t p) {
    uint32_t a = (p >> 24) & 0xFF;
    if (a == 0) return 0;
    return (uint8_t)(((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000);
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int threshold = (p1 > 0) ? p1 : 30;
    if (threshold > 255) threshold = 255;
    int invert_sketch = (p2 != 0) ? 1 : 0; // 0 = black bg, 1 = white paper sketch

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            int tl = get_lum(temp[(y - 1) * width + (x - 1)]);
            int tc = get_lum(temp[(y - 1) * width + x]);
            int tr = get_lum(temp[(y - 1) * width + (x + 1)]);
            int ml = get_lum(temp[y * width + (x - 1)]);
            int mr = get_lum(temp[y * width + (x + 1)]);
            int bl = get_lum(temp[(y + 1) * width + (x - 1)]);
            int bc = get_lum(temp[(y + 1) * width + x]);
            int br = get_lum(temp[(y + 1) * width + (x + 1)]);

            int gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
            int gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
            int mag = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
            uint8_t out = clamp255(mag);

            if (out > threshold) {
                if (invert_sketch) {
                    uint8_t inv = 255 - out;
                    pixels[y * width + x] = 0xFF000000 | (inv << 16) | (inv << 8) | inv;
                } else {
                    pixels[y * width + x] = 0xFF000000 | (out << 16) | (out << 8) | out;
                }
            } else {
                pixels[y * width + x] = invert_sketch ? 0xFFFFFFFF : 0x00000000;
            }
        }
    }
}
