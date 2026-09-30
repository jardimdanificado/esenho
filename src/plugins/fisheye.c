/**
 * =========================================================================
 * Fisheye & Barrel Distortion Lens Filter Plugin (plugins/fisheye.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Fisheye Lens\",\"params\":[{\"name\":\"Lens Power (-50..50)\",\"min\":-50,\"max\":50,\"default\":25},{\"name\":\"Zoom %\",\"min\":50,\"max\":200,\"default\":100}]}";
}

static inline int clamp_coord(int val, int max_val) {
    if (val < 0) return 0;
    if (val >= max_val) return max_val - 1;
    return val;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int power = (p1 != 0) ? p1 : 25;
    if (power < -50) power = -50;
    if (power > 50) power = 50;

    int zoom = (p2 >= 50 && p2 <= 200) ? p2 : 100;
    float zoom_factor = (float)zoom * 0.01f;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    float cx = (float)width * 0.5f;
    float cy = (float)height * 0.5f;
    float max_r = w_sqrtf(cx * cx + cy * cy);
    if (max_r < 1.0f) max_r = 1.0f;
    float k = (float)power * 0.02f;

    for (int y = 0; y < height; y++) {
        float ny = ((float)y - cy) / max_r;
        for (int x = 0; x < width; x++) {
            float nx = ((float)x - cx) / max_r;
            float r = w_sqrtf(nx * nx + ny * ny);

            if (r > 0.0f) {
                float theta = w_atan2f(ny, nx);
                float nr = (r + k * r * r * r) / zoom_factor;
                int sx = (int)(cx + nr * max_r * w_cosf(theta));
                int sy = (int)(cy + nr * max_r * w_sinf(theta));

                if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                    pixels[y * width + x] = temp[sy * width + sx];
                } else {
                    pixels[y * width + x] = 0x00000000;
                }
            } else {
                pixels[y * width + x] = temp[y * width + x];
            }
        }
    }
}
