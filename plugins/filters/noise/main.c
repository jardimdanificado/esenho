#include <stdint.h>

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

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int amount = p1 > 0 ? p1 : 25;
    int total = width * height;
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
