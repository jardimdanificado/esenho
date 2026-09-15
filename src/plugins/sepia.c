/**
 * =========================================================================
 * Sepia Filter Plugin (plugins/filters/sepia/main.c)
 * =========================================================================
 */

#include "wesenho.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Sepia\",\"params\":[{\"name\":\"Intensity\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"}]}";
}

static inline uint32_t clamp255(uint32_t val) {
    return val > 255 ? 255 : val;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int amount = (p1 > 0) ? p1 : 100;
    if (amount > 100) amount = 100;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;

        uint32_t nr = clamp255((r * 393 + g * 769 + b * 189) / 1000);
        uint32_t ng = clamp255((r * 349 + g * 686 + b * 168) / 1000);
        uint32_t nb = clamp255((r * 272 + g * 534 + b * 131) / 1000);

        if (amount < 100) {
            nr = (nr * amount + r * (100 - amount)) / 100;
            ng = (ng * amount + g * (100 - amount)) / 100;
            nb = (nb * amount + b * (100 - amount)) / 100;
        }

        pixels[i] = (a << 24) | (nb << 16) | (ng << 8) | nr;
    }
}
