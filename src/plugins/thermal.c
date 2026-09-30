/**
 * =========================================================================
 * Thermal Vision / Heatmap Color Grading Filter Plugin (plugins/thermal.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Thermal Vision\",\"params\":[{\"name\":\"Contrast Boost\",\"min\":50,\"max\":200,\"default\":100},{\"name\":\"Palette (0=Ironbow, 1=Neon)\",\"min\":0,\"max\":1,\"default\":0}]}";
}

static inline uint32_t sample_thermal_ironbow(int lum) {
    // Ironbow gradient: Black -> Deep Blue -> Purple -> Red -> Orange -> Yellow -> White
    int r, g, b;
    if (lum < 40) {
        r = 0; g = 0; b = lum * 4;
    } else if (lum < 90) {
        int t = (lum - 40) * 5;
        r = t; g = 0; b = 160 + t / 3;
    } else if (lum < 160) {
        int t = (lum - 90) * 3;
        r = 255; g = t; b = 0;
    } else if (lum < 220) {
        int t = (lum - 160) * 4;
        r = 255; g = 210 + t / 6; b = t / 3;
    } else {
        int t = (lum - 220) * 7;
        if (t > 255) t = 255;
        r = 255; g = 255; b = t;
    }
    if (r > 255) r = 255;
    if (g > 255) g = 255;
    if (b > 255) b = 255;
    return (uint32_t)((b << 16) | (g << 8) | r);
}

static inline uint32_t sample_thermal_neon(int lum) {
    // Neon Cyberpunk: Deep Violet -> Cyan -> Electric Green -> Hot Pink -> White
    int r, g, b;
    if (lum < 64) {
        r = lum * 2; g = 0; b = 120 + lum * 2;
    } else if (lum < 128) {
        int t = (lum - 64) * 4;
        r = 0; g = t; b = 255;
    } else if (lum < 192) {
        int t = (lum - 128) * 4;
        r = t; g = 255 - t / 2; b = 255 - t;
    } else {
        int t = (lum - 192) * 4;
        r = 255; g = 128 + t * 2; b = t * 4;
    }
    if (r > 255) r = 255;
    if (g > 255) g = 255;
    if (b > 255) b = 255;
    return (uint32_t)((b << 16) | (g << 8) | r);
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int contrast = (p1 >= 50 && p1 <= 200) ? p1 : 100;
    int palette = (p2 > 0) ? 1 : 0;
    float contrast_factor = (float)contrast * 0.01f;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        int r = p & 0xFF;
        int g = (p >> 8) & 0xFF;
        int b = (p >> 16) & 0xFF;
        int lum = (r * 299 + g * 587 + b * 114) / 1000;

        if (contrast != 100) {
            lum = (int)(((float)lum - 128.0f) * contrast_factor + 128.0f);
            if (lum < 0) lum = 0;
            if (lum > 255) lum = 255;
        }

        uint32_t rgb = palette ? sample_thermal_neon(lum) : sample_thermal_ironbow(lum);
        pixels[i] = (a << 24) | rgb;
    }
}
