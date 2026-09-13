#include "wesenho.h"

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_filter_msg_t)) return;
    wesenho_filter_msg_t *msg = (wesenho_filter_msg_t*)piolho_page;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int thresh = msg->param1 > 0 ? msg->param1 : 128;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;
        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;
        uint32_t lum = (r * 299 + g * 587 + b * 114) / 1000;
        uint32_t out = (lum >= (uint32_t)thresh) ? 0xFFFFFFFF : 0xFF000000;
        pixels[i] = out;
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
