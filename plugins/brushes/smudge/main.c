/**
 * =========================================================================
 * Smudge Brush Plugin (plugins/brushes/smudge/main.c)
 * Smear/finger-painting tool that copies pixels from previous position (x0,y0)
 * and blends them into destination position (x1,y1) along the stroke direction.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 18;
static int wetness = 50;
static int tex_mode = 0;

#define MAX_SAMPLE 4096
static uint32_t sample_buf[MAX_SAMPLE];

static inline uint32_t blend_color(uint32_t c1, uint32_t c2, int rate) {
    uint32_t r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
    uint32_t r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
    uint32_t r = (r1 * rate + r2 * (100 - rate)) / 100;
    uint32_t g = (g1 * rate + g2 * (100 - rate)) / 100;
    uint32_t b = (b1 * rate + b2 * (100 - rate)) / 100;
    uint32_t a = (a1 * rate + a2 * (100 - rate)) / 100;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

static void smear(wframebuffer_t *fb, int x0, int y0, int x1, int y1, int tex) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int r = size, r2 = r * r;

    // Capture source patch
    int s_idx = 0;
    for (int dy = -r; dy <= r; dy++) {
        int py = y0 + dy;
        for (int dx = -r; dx <= r; dx++) {
            int px = x0 + dx;
            if (s_idx < MAX_SAMPLE) {
                sample_buf[s_idx++] = (px >= 0 && px < width && py >= 0 && py < height) ? pixels[py * width + px] : 0;
            }
        }
    }

    // Smudge into destination
    s_idx = 0;
    for (int dy = -r; dy <= r; dy++) {
        int py = y1 + dy;
        for (int dx = -r; dx <= r; dx++) {
            int px = x1 + dx;
            if (s_idx < MAX_SAMPLE) {
                uint32_t src = sample_buf[s_idx++];
                if (px >= 0 && px < width && py >= 0 && py < height && (dx * dx + dy * dy <= r2)) {
                    if ((src >> 24) > 0) {
                        pixels[py * width + px] = blend_color(src, pixels[py * width + px], wetness);
                    }
                }
            }
        }
    }
}

/**
 * on_message - Handles brush parameter updates and smudge stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &dummy, &dummy, &dummy, &dummy, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    if (s.x0 != s.x1 || s.y0 != s.y1) {
        smear(fb, s.x0, s.y0, s.x1, s.y1, s.texture_mode ? s.texture_mode : tex_mode);
    }
}

int32_t update(void) { return UPDATE_OK; }

