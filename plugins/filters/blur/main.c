#include "wesenho.h"

#define MAX_DOC (800 * 1000)
static uint32_t temp[MAX_DOC];

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_filter_msg_t)) return;
    wesenho_filter_msg_t *msg = (wesenho_filter_msg_t*)piolho_page;

    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int r = msg->param1 > 0 ? msg->param1 : 3;
    if (r > 25) r = 25;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;
            for (int dx = -r; dx <= r; dx++) {
                int nx = x + dx;
                if (nx >= 0 && nx < width) {
                    uint32_t p = pixels[y * width + nx];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }
            if (count > 0) {
                temp[y * width + x] = ((sum_a / count) << 24) |
                                      ((sum_b / count) << 16) |
                                      ((sum_g / count) << 8)  |
                                      (sum_r / count);
            }
        }
    }

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;
            for (int dy = -r; dy <= r; dy++) {
                int ny = y + dy;
                if (ny >= 0 && ny < height) {
                    uint32_t p = temp[ny * width + x];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }
            if (count > 0) {
                pixels[y * width + x] = ((sum_a / count) << 24) |
                                        ((sum_b / count) << 16) |
                                        ((sum_g / count) << 8)  |
                                        (sum_r / count);
            }
        }
    }
}

int32_t update(void) {
    return UPDATE_OK;
}
