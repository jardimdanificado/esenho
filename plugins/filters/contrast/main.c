#include "wesenho.h"

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    char buf[128];
    int clen = (len < 127) ? len : 127;
    for (int i = 0; i < clen; i++) buf[i] = (char)piolho_page[i];
    buf[clen] = '\0';

    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int factor = 30;
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v != 0) factor = v;
    }

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

int32_t update(void) {
    return UPDATE_OK;
}
