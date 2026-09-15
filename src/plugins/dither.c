/**
 * =========================================================================
 * Ordered Dither Filter Plugin (plugins/filters/dither/main.c)
 * =========================================================================
 */

#include "esenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Dither\",\"params\":[{\"name\":\"Luma Bias\",\"min\":-64,\"max\":64,\"default\":0},{\"name\":\"Invert\",\"min\":0,\"max\":1,\"default\":0}]}";
}

static const uint8_t bayer4[4][4] = {
    {  0,  8,  2, 10 },
    { 12,  4, 14,  6 },
    {  3, 11,  1,  9 },
    { 15,  7, 13,  5 }
};

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int bias = p1; // luminance offset/bias (-64..64)
    int invert = (p2 != 0) ? 1 : 0;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t p = pixels[y * width + x];
            uint32_t a = (p >> 24) & 0xFF;
            if (a == 0) continue;

            uint32_t r = p & 0xFF;
            uint32_t g = (p >> 8) & 0xFF;
            uint32_t b = (p >> 16) & 0xFF;

            int lum = (int)((r * 299 + g * 587 + b * 114) / 1000) + bias;
            if (lum < 0) lum = 0;
            if (lum > 255) lum = 255;

            uint8_t threshold = bayer4[y % 4][x % 4] * 16 + 8;
            int on = (lum >= threshold);
            if (invert) on = !on;

            uint32_t col = on ? 0xFFFFFFFF : 0xFF000000;
            pixels[y * width + x] = col;
        }
    }
}
