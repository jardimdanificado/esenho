#include "wesenho.h"

#define MAX_DOC (800 * 1000)
static uint32_t temp[MAX_DOC];

static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

static inline uint8_t get_lum(uint32_t p) {
    uint32_t a = (p >> 24) & 0xFF;
    if (a == 0) return 0;
    return (uint8_t)(((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000);
}

void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;
    if (total > MAX_DOC) total = MAX_DOC;

    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            int tl = get_lum(temp[(y - 1) * width + (x - 1)]);
            int tc = get_lum(temp[(y - 1) * width + x]);
            int tr = get_lum(temp[(y - 1) * width + (x + 1)]);
            int ml = get_lum(temp[y * width + (x - 1)]);
            int mr = get_lum(temp[y * width + (x + 1)]);
            int bl = get_lum(temp[(y + 1) * width + (x - 1)]);
            int bc = get_lum(temp[(y + 1) * width + x]);
            int br = get_lum(temp[(y + 1) * width + (x + 1)]);

            int gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
            int gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
            int mag = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
            uint8_t out = clamp255(mag);

            if (out > 30) {
                pixels[y * width + x] = 0xFF000000 | (out << 16) | (out << 8) | out;
            } else {
                pixels[y * width + x] = 0x00000000;
            }
        }
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
