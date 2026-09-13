#include <stdint.h>

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int delta = (p1 != 0) ? p1 : 30;
    int total = width * height;
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
