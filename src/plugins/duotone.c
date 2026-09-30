/**
 * =========================================================================
 * Duotone / Cinematic Color Grading Filter Plugin (plugins/duotone.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Duotone Gradient\",\"params\":[{\"name\":\"Palette (0=Cyber, 1=Synth, 2=Matrix, 3=Gold)\",\"min\":0,\"max\":3,\"default\":0},{\"name\":\"Contrast\",\"min\":50,\"max\":200,\"default\":110}]}";
}

struct Palette {
    uint32_t dark_r, dark_g, dark_b;
    uint32_t light_r, light_g, light_b;
};

static const struct Palette palettes[4] = {
    { 15, 12, 45,    255, 60, 180 },  // 0: Cyberpunk (Navy Blue -> Neon Magenta)
    { 25, 0, 50,     0, 240, 255 },   // 1: Synthwave (Deep Violet -> Electric Cyan)
    { 5, 20, 10,     80, 255, 120 },  // 2: Matrix (Dark Olive -> Phosphor Green)
    { 40, 15, 5,     255, 200, 70 }   // 3: Sunset Gold (Deep Wine -> Warm Amber)
};

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int pal_idx = (p1 >= 0 && p1 <= 3) ? p1 : 0;
    int contrast = (p2 >= 50 && p2 <= 200) ? p2 : 110;
    float contrast_factor = (float)contrast * 0.01f;

    struct Palette pal = palettes[pal_idx];
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

        float t = (float)lum / 255.0f;
        uint32_t out_r = (uint32_t)((float)pal.dark_r + ((float)pal.light_r - (float)pal.dark_r) * t);
        uint32_t out_g = (uint32_t)((float)pal.dark_g + ((float)pal.light_g - (float)pal.dark_g) * t);
        uint32_t out_b = (uint32_t)((float)pal.dark_b + ((float)pal.light_b - (float)pal.dark_b) * t);

        if (out_r > 255) out_r = 255;
        if (out_g > 255) out_g = 255;
        if (out_b > 255) out_b = 255;

        pixels[i] = (a << 24) | (out_b << 16) | (out_g << 8) | out_r;
    }
}
