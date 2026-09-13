#include "wesenho.h"

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_filter_msg_t)) return;
    wesenho_filter_msg_t *msg = (wesenho_filter_msg_t*)piolho_page;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int delta = (msg->param1 != 0) ? msg->param1 : 30;
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

int32_t update(void) {
    return UPDATE_OK;
}
