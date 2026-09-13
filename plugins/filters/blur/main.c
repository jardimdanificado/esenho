#include <stdint.h>

#define MAX_DOC (800 * 1000)
static uint32_t temp[MAX_DOC];

void filter(uint32_t *pixels, int32_t width, int32_t height, int32_t p1, int32_t p2) {
    int r = p1 > 0 ? p1 : 3;
    if (r > 25) r = 25;
    int total = width * height;
    if (total > MAX_DOC) total = MAX_DOC;

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
