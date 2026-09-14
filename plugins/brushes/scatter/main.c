/**
 * =========================================================================
 * Scatter Brush Plugin (plugins/brushes/scatter/main.c)
 * Stochastic particle spray brush with configurable density distribution.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 20;
static int density = 30;
static int opacity = 80;
static int tex_mode = 0;

static uint32_t rng_state = 0x12345678;
static inline uint32_t next_random(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

static void spray(wframebuffer_t *fb, int x, int y, uint32_t color, int is_eraser, int tex) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int w = fb->width, h = fb->height;
    int r = size, r2 = r * r;

    for (int i = 0; i < density; i++) {
        int rx = ((int)(next_random() % (2 * r + 1))) - r;
        int ry = ((int)(next_random() % (2 * r + 1))) - r;
        if (rx * rx + ry * ry <= r2) {
            int px = x + rx, py = y + ry;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                if (is_eraser) {
                    pixels[py * w + px] = 0x00000000;
                } else {
                    uint32_t a = (opacity * ((color >> 24) & 0xFF)) / 100;
                    a = w_sample_texture(tex, px, py, a);
                    pixels[py * w + px] = w_blend_fast(color, pixels[py * w + px], a);
                }
            }
        }
    }
}

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_SIZE:     if (val > 0) size = val; break;
        case W_PARAM_DENSITY:  if (val > 0) density = val; break;
        case W_PARAM_OPACITY:  if (val >= 0 && val <= 100) opacity = val; break;
        case W_PARAM_TEX_MODE: tex_mode = val; break;
    }
}

W_EXPORT void w_brush_stroke(int32_t state, int32_t x, int32_t y, int32_t prev_x, int32_t prev_y, uint32_t color, int32_t eraser) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;
    spray(fb, x, y, color, eraser, tex_mode);
}
