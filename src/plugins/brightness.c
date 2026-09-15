/**
 * =========================================================================
 * Brightness Filter Plugin (plugins/filters/brightness/main.c)
 * =========================================================================
 */

#include "wesenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Brightness\",\"params\":[{\"name\":\"Delta\",\"min\":-100,\"max\":100,\"default\":30}]}";
}

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    int delta = (p1 != 0) ? p1 : 30;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        int r = clamp255((int)(p & 0xFF) + delta);
        int g = clamp255((int)((p >> 8) & 0xFF) + delta);
        int b = clamp255((int)((p >> 16) & 0xFF) + delta);

        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}
