/**
 * =========================================================================
 * Swirl / Vortex Lens Filter Plugin (plugins/swirl.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Swirl Vortex\",\"params\":[{\"name\":\"Twist Angle °\",\"min\":-360,\"max\":360,\"default\":90},{\"name\":\"Radius %\",\"min\":10,\"max\":100,\"default\":80}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int angle_deg = (p1 != 0) ? p1 : 90;
    int radius_pct = (p2 >= 10 && p2 <= 100) ? p2 : 80;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    float cx = (float)width * 0.5f;
    float cy = (float)height * 0.5f;
    float max_dim = (float)(width < height ? width : height) * 0.5f;
    float radius = max_dim * ((float)radius_pct * 0.01f);
    if (radius < 1.0f) radius = 1.0f;
    float max_angle_rad = (float)angle_deg * (3.14159265f / 180.0f);

    for (int y = 0; y < height; y++) {
        float dy = (float)y - cy;
        for (int x = 0; x < width; x++) {
            float dx = (float)x - cx;
            float r = w_sqrtf(dx * dx + dy * dy);

            if (r < radius) {
                float factor = 1.0f - (r / radius);
                float twist = max_angle_rad * factor * factor;
                float sin_t = w_sinf(twist);
                float cos_t = w_cosf(twist);

                int sx = (int)(cx + dx * cos_t - dy * sin_t);
                int sy = (int)(cy + dx * sin_t + dy * cos_t);

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
