/**
 * =========================================================================
 * Contrast Filter Plugin (plugins/filters/contrast/main.c)
 * =========================================================================
 */

#include "esenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Contrast\",\"params\":[{\"name\":\"Factor\",\"min\":-80,\"max\":80,\"default\":30}]}";
}

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    int factor = (p1 != 0) ? p1 : 30;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;

    int numerator = 259 * (factor + 255);
    int denominator = 255 * (259 - factor);
    if (denominator == 0) denominator = 1;

    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        int r = (int)(p & 0xFF) - 128;
        int g = (int)((p >> 8) & 0xFF) - 128;
        int b = (int)((p >> 16) & 0xFF) - 128;

        r = clamp255((r * numerator) / denominator + 128);
        g = clamp255((g * numerator) / denominator + 128);
        b = clamp255((b * numerator) / denominator + 128);

        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}
