#include <stdint.h>

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int total = width * height;
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
