/**
 * =========================================================================
 * Vignette / Dark Falloff Lens Filter Plugin (plugins/vignette.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Vignette Lens\",\"params\":[{\"name\":\"Inner Radius %\",\"min\":10,\"max\":90,\"default\":50},{\"name\":\"Darkness %\",\"min\":10,\"max\":100,\"default\":70}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int radius_pct = (p1 >= 10 && p1 <= 95) ? p1 : 50;
    int darkness_pct = (p2 >= 10 && p2 <= 100) ? p2 : 70;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    float cx = (float)width * 0.5f;
    float cy = (float)height * 0.5f;
    float max_r = (cx < cy ? cx : cy);
    if (max_r < 1.0f) max_r = 1.0f;

    float r_inner = max_r * ((float)radius_pct * 0.01f);
    float r_outer = max_r * 1.35f;
    float range = r_outer - r_inner;
    if (range < 1.0f) range = 1.0f;
    float max_dark = (float)darkness_pct * 0.01f;

    for (int y = 0; y < height; y++) {
        float dy = (float)y - cy;
        for (int x = 0; x < width; x++) {
            uint32_t p = pixels[y * width + x];
            uint32_t a = (p >> 24) & 0xFF;
            if (a == 0) continue;

            float dx = (float)x - cx;
            float dist = __builtin_sqrtf(dx * dx + dy * dy);

            if (dist > r_inner) {
                float t = (dist - r_inner) / range;
                if (t > 1.0f) t = 1.0f;
                // Smooth cosine curve
                float factor = 1.0f - (t * t * max_dark);
                if (factor < 0.0f) factor = 0.0f;

                uint32_t r = (uint32_t)((float)(p & 0xFF) * factor);
                uint32_t g = (uint32_t)((float)((p >> 8) & 0xFF) * factor);
                uint32_t b = (uint32_t)((float)((p >> 16) & 0xFF) * factor);

                pixels[y * width + x] = (a << 24) | (b << 16) | (g << 8) | r;
            }
        }
    }
}
