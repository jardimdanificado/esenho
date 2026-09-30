/**
 * =========================================================================
 * Kuwahara Oil Painting Filter Plugin (plugins/kuwahara.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Oil Painting (Kuwahara)\",\"params\":[{\"name\":\"Brush Size\",\"min\":2,\"max\":8,\"default\":3,\"unit\":\"px\"},{\"name\":\"Variance Bias\",\"min\":0,\"max\":10,\"default\":0}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int r = (p1 >= 1 && p1 <= 8) ? p1 : 3;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t center_p = temp[y * width + x];
            uint32_t a = (center_p >> 24) & 0xFF;
            if (a == 0) continue;

            // Kuwahara 4 quadrants: Top-Left, Top-Right, Bottom-Left, Bottom-Right
            int min_var = 0x7FFFFFFF;
            uint32_t best_r = 0, best_g = 0, best_b = 0;

            int qx[4][2] = { {-r, 0}, {0, r}, {-r, 0}, {0, r} };
            int qy[4][2] = { {-r, 0}, {-r, 0}, {0, r}, {0, r} };

            for (int q = 0; q < 4; q++) {
                int sum_r = 0, sum_g = 0, sum_b = 0, sum_sq = 0;
                int count = 0;

                for (int dy = qy[q][0]; dy <= qy[q][1]; dy++) {
                    int py = y + dy;
                    if (py < 0 || py >= height) continue;
                    int row = py * width;

                    for (int dx = qx[q][0]; dx <= qx[q][1]; dx++) {
                        int px = x + dx;
                        if (px < 0 || px >= width) continue;

                        uint32_t cp = temp[row + px];
                        int cr = cp & 0xFF;
                        int cg = (cp >> 8) & 0xFF;
                        int cb = (cp >> 16) & 0xFF;
                        int lum = (cr * 299 + cg * 587 + cb * 114) / 1000;

                        sum_r += cr;
                        sum_g += cg;
                        sum_b += cb;
                        sum_sq += lum * lum;
                        count++;
                    }
                }

                if (count > 0) {
                    int mean_r = sum_r / count;
                    int mean_g = sum_g / count;
                    int mean_b = sum_b / count;
                    int mean_lum = (mean_r * 299 + mean_g * 587 + mean_b * 114) / 1000;
                    int variance = (sum_sq / count) - (mean_lum * mean_lum);

                    if (variance < min_var) {
                        min_var = variance;
                        best_r = (uint32_t)mean_r;
                        best_g = (uint32_t)mean_g;
                        best_b = (uint32_t)mean_b;
                    }
                }
            }

            pixels[y * width + x] = (a << 24) | (best_b << 16) | (best_g << 8) | best_r;
        }
    }
}
