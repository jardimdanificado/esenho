/**
 * =========================================================================
 * Invert Filter Plugin (plugins/filters/invert/main.c)
 * =========================================================================
 */

#include "wesenho.h"

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        uint32_t r = 255 - (p & 0xFF);
        uint32_t g = 255 - ((p >> 8) & 0xFF);
        uint32_t b = 255 - ((p >> 16) & 0xFF);

        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}
