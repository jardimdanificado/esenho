#include <stdint.h>

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int factor = (p1 != 0) ? p1 : 30;
    int numerator = 259 * (factor + 255);
    int denominator = 255 * (259 - factor);
    if (denominator == 0) denominator = 1;

    int total = width * height;
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
