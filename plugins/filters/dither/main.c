#include <stdint.h>

static const uint8_t bayer4[4][4] = {
    {  0,  8,  2, 10 },
    { 12,  4, 14,  6 },
    {  3, 11,  1,  9 },
    { 15,  7, 13,  5 }
};

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t p = pixels[y * width + x];
            uint32_t a = (p >> 24) & 0xFF;
            if (a == 0) continue;
            uint32_t r = p & 0xFF;
            uint32_t g = (p >> 8) & 0xFF;
            uint32_t b = (p >> 16) & 0xFF;
            uint32_t lum = (r * 299 + g * 587 + b * 114) / 1000;

            uint8_t threshold = bayer4[y % 4][x % 4] * 16 + 8;
            uint32_t col = (lum >= threshold) ? 0xFFFFFFFF : 0xFF000000;
            pixels[y * width + x] = col;
        }
    }
}
