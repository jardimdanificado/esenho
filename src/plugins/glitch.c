/**
 * =========================================================================
 * Glitch & VHS Tape Tear Filter Plugin (plugins/glitch.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"VHS Glitch\",\"params\":[{\"name\":\"Jitter Intensity\",\"min\":5,\"max\":50,\"default\":20},{\"name\":\"Chroma Split\",\"min\":1,\"max\":30,\"default\":10,\"unit\":\"px\"}]}";
}

static inline int clamp_coord(int v, int max_v) {
    if (v < 0) return 0;
    if (v >= max_v) return max_v - 1;
    return v;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int intensity = (p1 >= 5 && p1 <= 50) ? p1 : 20;
    int chroma = (p2 >= 1 && p2 <= 30) ? p2 : 10;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    for (int y = 0; y < height; y++) {
        // Pseudo-random glitch horizontal displacement slice per line block
        int block = y / 8;
        uint32_t h = (uint32_t)(block * 2654435761u);
        int shift = 0;
        if ((h & 0xF) < 5) {
            shift = (int)((h >> 4) % (intensity * 2 + 1)) - intensity;
        }

        int row = y * width;
        for (int x = 0; x < width; x++) {
            int src_x = clamp_coord(x + shift, width);
            uint32_t center = temp[row + src_x];
            uint32_t a = (center >> 24) & 0xFF;
            if (a == 0) continue;

            int rx = clamp_coord(src_x + chroma, width);
            int bx = clamp_coord(src_x - chroma, width);

            uint32_t pr = temp[row + rx];
            uint32_t pb = temp[row + bx];

            uint32_t r = pr & 0xFF;
            uint32_t g = (center >> 8) & 0xFF;
            uint32_t b = (pb >> 16) & 0xFF;

            pixels[row + x] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    }
}
