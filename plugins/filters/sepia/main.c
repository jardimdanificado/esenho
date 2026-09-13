#include <stdint.h>

static inline uint32_t clamp255(uint32_t val) {
    return val > 255 ? 255 : val;
}

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int total = width * height;
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
