/**
 * =========================================================================
 * Invert Filter Plugin (plugins/filters/invert/main.c)
 * =========================================================================
 */

#include "esenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Invert\",\"params\":[{\"name\":\"Intensity\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"},{\"name\":\"Channel (0=All,1=R,2=G,3=B)\",\"min\":0,\"max\":3,\"default\":0}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int amount = (p1 > 0) ? p1 : 100;
    if (amount > 100) amount = 100;
    int channel = p2; // 0=RGB, 1=R, 2=G, 3=B

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;

        uint32_t inv_r = (channel == 0 || channel == 1) ? (255 - r) : r;
        uint32_t inv_g = (channel == 0 || channel == 2) ? (255 - g) : g;
        uint32_t inv_b = (channel == 0 || channel == 3) ? (255 - b) : b;

        if (amount < 100) {
            r = (inv_r * amount + r * (100 - amount)) / 100;
            g = (inv_g * amount + g * (100 - amount)) / 100;
            b = (inv_b * amount + b * (100 - amount)) / 100;
        } else {
            r = inv_r; g = inv_g; b = inv_b;
        }

        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}
