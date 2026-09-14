#include "wesenho.h"

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
    int amount = 25;
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v > 0) amount = v;
    }

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;
        int noise = ((int)(next_rnd() % (amount * 2 + 1))) - amount;
        int r = clamp255((int)(p & 0xFF) + noise);
        int g = clamp255((int)((p >> 8) & 0xFF) + noise);
        int b = clamp255((int)((p >> 16) & 0xFF) + noise);
        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
