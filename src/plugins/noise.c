/**
 * =========================================================================
 * Noise Filter Plugin (plugins/filters/noise/main.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Noise\",\"params\":[{\"name\":\"Amount\",\"min\":1,\"max\":100,\"default\":25},{\"name\":\"Monochrome\",\"min\":0,\"max\":1,\"default\":0}]}";
}

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

static uint32_t rng_state = 0x9E3779B9;

static inline uint32_t next_rnd(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int amount = (p1 > 0) ? p1 : 25;
    int monochrome = (p2 != 0) ? 1 : 0;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        int nr = ((int)(next_rnd() % (amount * 2 + 1))) - amount;
        int ng = monochrome ? nr : (((int)(next_rnd() % (amount * 2 + 1))) - amount);
        int nb = monochrome ? nr : (((int)(next_rnd() % (amount * 2 + 1))) - amount);

        int r = clamp255((int)(p & 0xFF) + nr);
        int g = clamp255((int)((p >> 8) & 0xFF) + ng);
        int b = clamp255((int)((p >> 16) & 0xFF) + nb);

        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}
