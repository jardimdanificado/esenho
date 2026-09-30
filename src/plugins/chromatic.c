/**
 * =========================================================================
 * Chromatic Aberration / RGB Split Lens Filter Plugin (plugins/chromatic.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Chromatic Aberration\",\"params\":[{\"name\":\"Shift Radius\",\"min\":1,\"max\":40,\"default\":8,\"unit\":\"px\"},{\"name\":\"Mode (0=Radial, 1=Hori)\",\"min\":0,\"max\":1,\"default\":0}]}";
}

static inline int clamp_coord(int val, int max_val) {
    if (val < 0) return 0;
    if (val >= max_val) return max_val - 1;
    return val;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int shift = (p1 > 0) ? p1 : 8;
    if (shift > 60) shift = 60;
    int mode = (p2 > 0) ? 1 : 0;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    float cx = (float)width * 0.5f;
    float cy = (float)height * 0.5f;
    float max_dist = (float)(width > height ? width : height) * 0.5f;
    if (max_dist < 1.0f) max_dist = 1.0f;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t center_p = temp[y * width + x];
            uint32_t a = (center_p >> 24) & 0xFF;
            if (a == 0) continue;

            int rx, ry, bx, by;
            if (mode == 1) {
                // Horizontal shift
                rx = clamp_coord(x + shift, width);
                ry = y;
                bx = clamp_coord(x - shift, width);
                by = y;
            } else {
                // Radial dispersion from center
                float dx = (float)x - cx;
                float dy = (float)y - cy;
                float dist_norm = ((dx * dx + dy * dy) > 0.0f) ? (1.0f / max_dist) : 0.0f;
                int off_x = (int)(dx * dist_norm * (float)shift);
                int off_y = (int)(dy * dist_norm * (float)shift);

                rx = clamp_coord(x + off_x, width);
                ry = clamp_coord(y + off_y, height);
                bx = clamp_coord(x - off_x, width);
                by = clamp_coord(y - off_y, height);
            }

            uint32_t pr = temp[ry * width + rx];
            uint32_t pg = center_p;
            uint32_t pb = temp[by * width + bx];

            uint32_t r = pr & 0xFF;
            uint32_t g = (pg >> 8) & 0xFF;
            uint32_t b = (pb >> 16) & 0xFF;

            pixels[y * width + x] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    }
}
