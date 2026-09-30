/**
 * =========================================================================
 * CRT Monitor & Scanlines FX Filter Plugin (plugins/scanline.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"CRT Scanlines\",\"params\":[{\"name\":\"Scanline Darkness %\",\"min\":10,\"max\":80,\"default\":40},{\"name\":\"RGB Phosphor Mask\",\"min\":0,\"max\":1,\"default\":1}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int darkness = (p1 >= 10 && p1 <= 80) ? p1 : 40;
    int mask_mode = (p2 > 0) ? 1 : 0;
    float dark_factor = 1.0f - ((float)darkness * 0.01f);

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    for (int y = 0; y < height; y++) {
        int is_scanline = (y % 2 == 1);
        for (int x = 0; x < width; x++) {
            uint32_t p = pixels[y * width + x];
            uint32_t a = (p >> 24) & 0xFF;
            if (a == 0) continue;

            uint32_t r = p & 0xFF;
            uint32_t g = (p >> 8) & 0xFF;
            uint32_t b = (p >> 16) & 0xFF;

            if (is_scanline) {
                r = (uint32_t)((float)r * dark_factor);
                g = (uint32_t)((float)g * dark_factor);
                b = (uint32_t)((float)b * dark_factor);
            }

            if (mask_mode) {
                int col_sub = x % 3;
                if (col_sub == 0) {
                    // Red phosphor peak
                    g = (uint32_t)((float)g * 0.85f);
                    b = (uint32_t)((float)b * 0.85f);
                } else if (col_sub == 1) {
                    // Green phosphor peak
                    r = (uint32_t)((float)r * 0.85f);
                    b = (uint32_t)((float)b * 0.85f);
                } else {
                    // Blue phosphor peak
                    r = (uint32_t)((float)r * 0.85f);
                    g = (uint32_t)((float)g * 0.85f);
                }
            }

            pixels[y * width + x] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    }
}
