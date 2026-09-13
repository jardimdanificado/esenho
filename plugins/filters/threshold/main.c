#include <stdint.h>

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int thresh = p1 > 0 ? p1 : 128;
    int total = width * height;
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
