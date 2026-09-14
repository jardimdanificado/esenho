#include "wesenho.h"

void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    char buf[128];
    int clen = (len < 127) ? len : 127;
    for (int i = 0; i < clen; i++) buf[i] = (char)piolho_page[i];
    buf[clen] = '\0';

    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int size = 8;
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v > 1) size = v;
    }

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    for (int by = 0; by < height; by += size) {
        for (int bx = 0; bx < width; bx += size) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;
            for (int dy = 0; dy < size && by + dy < height; dy++) {
                for (int dx = 0; dx < size && bx + dx < width; dx++) {
                    uint32_t p = pixels[(by + dy) * width + (bx + dx)];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }
            if (count > 0) {
                uint32_t avg = ((sum_a / count) << 24) |
                               ((sum_b / count) << 16) |
                               ((sum_g / count) << 8)  |
                               (sum_r / count);
                for (int dy = 0; dy < size && by + dy < height; dy++) {
                    for (int dx = 0; dx < size && bx + dx < width; dx++) {
                        pixels[(by + dy) * width + (bx + dx)] = avg;
                    }
                }
            }
        }
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
