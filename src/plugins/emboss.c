/**
 * =========================================================================
 * 3D Emboss & Relief Filter Plugin (plugins/emboss.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"3D Emboss\",\"params\":[{\"name\":\"Relief Depth\",\"min\":1,\"max\":10,\"default\":2},{\"name\":\"Light Angle (0..3)\",\"min\":0,\"max\":3,\"default\":0}]}";
}

static inline uint8_t clamp255(int v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (uint8_t)v;
}

static inline int get_lum(uint32_t p) {
    return ((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int depth = (p1 >= 1 && p1 <= 10) ? p1 : 2;
    int angle_mode = (p2 >= 0 && p2 <= 3) ? p2 : 0;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    int dx = 1, dy = 1;
    if (angle_mode == 1) { dx = -1; dy = 1; }
    else if (angle_mode == 2) { dx = -1; dy = -1; }
    else if (angle_mode == 3) { dx = 1; dy = -1; }

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            uint32_t center_p = temp[y * width + x];
            uint32_t a = (center_p >> 24) & 0xFF;
            if (a == 0) continue;

            int l1 = get_lum(temp[(y - dy) * width + (x - dx)]);
            int l2 = get_lum(temp[(y + dy) * width + (x + dx)]);

            int diff = (l1 - l2) * depth + 128;
            uint8_t val = clamp255(diff);

            pixels[y * width + x] = (a << 24) | ((uint32_t)val << 16) | ((uint32_t)val << 8) | val;
        }
    }
}
