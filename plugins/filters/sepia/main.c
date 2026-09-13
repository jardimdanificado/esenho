#include "wesenho.h"

static inline uint32_t clamp255(uint32_t val) {
    return val > 255 ? 255 : val;
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_filter_msg_t)) return;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

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

        pixels[i] = (a << 24) | (nb << 16) | (ng << 8) | nr;
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
