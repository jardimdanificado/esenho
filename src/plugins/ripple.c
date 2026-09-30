/**
 * =========================================================================
 * Water Caustic & Concentric Wave Ripple Lens Filter Plugin (plugins/ripple.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Water Ripple Lens\",\"params\":[{\"name\":\"Wave Frequency\",\"min\":5,\"max\":60,\"default\":20},{\"name\":\"Amplitude\",\"min\":1,\"max\":30,\"default\":8,\"unit\":\"px\"}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int freq = (p1 >= 5 && p1 <= 60) ? p1 : 20;
    int amp = (p2 >= 1 && p2 <= 30) ? p2 : 8;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    float cx = (float)width * 0.5f;
    float cy = (float)height * 0.5f;
    float freq_scale = (float)freq * 0.05f;
    float amp_scale = (float)amp;

    for (int y = 0; y < height; y++) {
        float dy = (float)y - cy;
        for (int x = 0; x < width; x++) {
            float dx = (float)x - cx;
            float dist = w_sqrtf(dx * dx + dy * dy);

            if (dist > 0.0f) {
                float wave = w_sinf(dist * freq_scale);
                float offset = wave * amp_scale;
                float nx = dx / dist;
                float ny = dy / dist;

                int sx = (int)((float)x + nx * offset);
                int sy = (int)((float)y + ny * offset);

                if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                    pixels[y * width + x] = temp[sy * width + sx];
                } else {
                    pixels[y * width + x] = temp[y * width + x];
                }
            } else {
                pixels[y * width + x] = temp[y * width + x];
            }
        }
    }
}
