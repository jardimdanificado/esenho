/**
 * =========================================================================
 * Solarize / Sabattier Tone Curve Filter Plugin (plugins/solarize.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Solarize (Sabattier)\",\"params\":[{\"name\":\"Inflection Level\",\"min\":30,\"max\":220,\"default\":128},{\"name\":\"Mode (0=RGB, 1=Luma)\",\"min\":0,\"max\":1,\"default\":0}]}";
}

static inline uint8_t solarize_val(uint8_t c, int threshold) {
    return (c > threshold) ? (uint8_t)(255 - c) : c;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int thresh = (p1 >= 30 && p1 <= 220) ? p1 : 128;
    int mode = (p2 > 0) ? 1 : 0;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        uint8_t r = p & 0xFF;
        uint8_t g = (p >> 8) & 0xFF;
        uint8_t b = (p >> 16) & 0xFF;

        if (mode == 1) {
            // Luma mode
            int lum = (r * 299 + g * 587 + b * 114) / 1000;
            if (lum > thresh) {
                r = 255 - r;
                g = 255 - g;
                b = 255 - b;
            }
        } else {
            // Per-channel Sabattier fold
            r = solarize_val(r, thresh);
            g = solarize_val(g, thresh);
            b = solarize_val(b, thresh);
        }

        pixels[i] = (a << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | r;
    }
}
