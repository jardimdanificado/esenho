#include "wesenho.h"

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
        uint32_t r = 255 - (p & 0xFF);
        uint32_t g = 255 - ((p >> 8) & 0xFF);
        uint32_t b = 255 - ((p >> 16) & 0xFF);
        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
