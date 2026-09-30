/**
 * =========================================================================
 * Kaleidoscope & Symmetrical Prism Lens Filter Plugin (plugins/kaleidoscope.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Kaleidoscope Lens\",\"params\":[{\"name\":\"Sectors (3..12)\",\"min\":3,\"max\":12,\"default\":6},{\"name\":\"Angle Offset °\",\"min\":0,\"max\":180,\"default\":0}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int sectors = (p1 >= 3 && p1 <= 12) ? p1 : 6;
    float offset_rad = (float)p2 * (3.14159265f / 180.0f);

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    float cx = (float)width * 0.5f;
    float cy = (float)height * 0.5f;
    float sector_angle = (2.0f * 3.14159265f) / (float)sectors;

    for (int y = 0; y < height; y++) {
        float dy = (float)y - cy;
        for (int x = 0; x < width; x++) {
            float dx = (float)x - cx;
            float r = w_sqrtf(dx * dx + dy * dy);

            if (r > 0.0f) {
                float theta = w_atan2f(dy, dx) + offset_rad;
                if (theta < 0.0f) theta += 2.0f * 3.14159265f;

                // Modulo sector
                float mod_t = theta - ((int)(theta / sector_angle)) * sector_angle;
                // Mirror reflection in every odd half-sector
                if (mod_t > sector_angle * 0.5f) {
                    mod_t = sector_angle - mod_t;
                }

                int sx = (int)(cx + r * w_cosf(mod_t));
                int sy = (int)(cy + r * w_sinf(mod_t));

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
