/**
 * =========================================================================
 * Bloom / Glow Lens Filter Plugin (plugins/bloom.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Bloom Glow\",\"params\":[{\"name\":\"Luma Threshold\",\"min\":80,\"max\":240,\"default\":160},{\"name\":\"Glow Radius\",\"min\":2,\"max\":30,\"default\":8,\"unit\":\"px\"}]}";
}

static inline uint8_t clamp255(int v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (uint8_t)v;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int thresh = (p1 >= 50 && p1 <= 245) ? p1 : 160;
    int r = (p2 >= 2 && p2 <= 30) ? p2 : 8;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *bright_buf = pixels + total;
    uint32_t *blur_buf = bright_buf + total;

    // 1. Extract bright highlights
    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) {
            bright_buf[i] = 0;
            continue;
        }
        uint32_t r_c = p & 0xFF;
        uint32_t g_c = (p >> 8) & 0xFF;
        uint32_t b_c = (p >> 16) & 0xFF;
        int luma = (int)((r_c * 299 + g_c * 587 + b_c * 114) / 1000);

        if (luma >= thresh) {
            int over = luma - thresh;
            float scale = (float)over / (float)(256 - thresh);
            bright_buf[i] = (a << 24) |
                            ((uint32_t)((float)b_c * scale) << 16) |
                            ((uint32_t)((float)g_c * scale) << 8)  |
                            (uint32_t)((float)r_c * scale);
        } else {
            bright_buf[i] = 0;
        }
    }

    // 2. Horizontal blur of bright pass -> blur_buf
    for (int y = 0; y < height; y++) {
        int row = y * width;
        for (int x = 0; x < width; x++) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0;
            int count = 0;
            int min_x = (x - r < 0) ? 0 : (x - r);
            int max_x = (x + r >= width) ? (width - 1) : (x + r);

            for (int kx = min_x; kx <= max_x; kx++) {
                uint32_t bp = bright_buf[row + kx];
                sum_r += (bp & 0xFF);
                sum_g += ((bp >> 8) & 0xFF);
                sum_b += ((bp >> 16) & 0xFF);
                count++;
            }
            blur_buf[row + x] = (count > 0) ? (((sum_b / count) << 16) | ((sum_g / count) << 8) | (sum_r / count)) : 0;
        }
    }

    // 3. Vertical blur of blur_buf and Screen blend onto pixels
    for (int x = 0; x < width; x++) {
        for (int y = 0; y < height; y++) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0;
            int count = 0;
            int min_y = (y - r < 0) ? 0 : (y - r);
            int max_y = (y + r >= height) ? (height - 1) : (y + r);

            for (int ky = min_y; ky <= max_y; ky++) {
                uint32_t bp = blur_buf[ky * width + x];
                sum_r += (bp & 0xFF);
                sum_g += ((bp >> 8) & 0xFF);
                sum_b += ((bp >> 16) & 0xFF);
                count++;
            }

            if (count > 0) {
                uint32_t glow_r = sum_r / count;
                uint32_t glow_g = sum_g / count;
                uint32_t glow_b = sum_b / count;

                uint32_t orig = pixels[y * width + x];
                uint32_t a = (orig >> 24) & 0xFF;
                if (a == 0 && (glow_r | glow_g | glow_b) == 0) continue;

                uint32_t or_r = orig & 0xFF;
                uint32_t or_g = (orig >> 8) & 0xFF;
                uint32_t or_b = (orig >> 16) & 0xFF;

                // Screen blend: 255 - (255 - base)*(255 - glow)/255
                uint8_t out_r = 255 - ((255 - or_r) * (255 - glow_r) / 255);
                uint8_t out_g = 255 - ((255 - or_g) * (255 - glow_g) / 255);
                uint8_t out_b = 255 - ((255 - or_b) * (255 - glow_b) / 255);
                uint8_t out_a = a > 0 ? a : clamp255(glow_r + glow_g + glow_b);

                pixels[y * width + x] = ((uint32_t)out_a << 24) | ((uint32_t)out_b << 16) | ((uint32_t)out_g << 8) | out_r;
            }
        }
    }
}
