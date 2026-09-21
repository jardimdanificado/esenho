/**
 * =========================================================================
 * Grayscale Filter Plugin (plugins/filters/grayscale/main.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Grayscale\",\"params\":[{\"name\":\"Intensity\",\"min\":0,\"max\":100,\"default\":100,\"unit\":\"%\"},{\"name\":\"Mode (0=Luma,1=Avg,2=Light)\",\"min\":0,\"max\":2,\"default\":0}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int amount = (p1 > 0) ? p1 : 100;
    if (amount > 100) amount = 100;
    int mode = p2; // 0=luma, 1=average, 2=lightness

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;

        uint32_t gray;
        if (mode == 1) {
            gray = (r + g + b) / 3;
        } else if (mode == 2) {
            uint32_t max_c = (r > g ? (r > b ? r : b) : (g > b ? g : b));
            uint32_t min_c = (r < g ? (r < b ? r : b) : (g < b ? g : b));
            gray = (max_c + min_c) / 2;
        } else {
            gray = (r * 299 + g * 587 + b * 114) / 1000;
        }

        if (amount < 100) {
            r = (gray * amount + r * (100 - amount)) / 100;
            g = (gray * amount + g * (100 - amount)) / 100;
            b = (gray * amount + b * (100 - amount)) / 100;
        } else {
            r = g = b = gray;
        }

        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}
