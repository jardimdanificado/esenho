/**
 * =========================================================================
 * Threshold Filter Plugin (plugins/filters/threshold/main.c)
 * =========================================================================
 */

#include "wesenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Threshold\",\"params\":[{\"name\":\"Cutoff Level\",\"min\":1,\"max\":255,\"default\":128},{\"name\":\"Invert\",\"min\":0,\"max\":1,\"default\":0}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int thresh = (p1 > 0) ? p1 : 128;
    int invert = (p2 != 0) ? 1 : 0;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;

        uint32_t lum = (r * 299 + g * 587 + b * 114) / 1000;
        int on = (lum >= (uint32_t)thresh);
        if (invert) on = !on;
        uint32_t out = on ? 0xFFFFFFFF : 0xFF000000;
        pixels[i] = out;
    }
}
