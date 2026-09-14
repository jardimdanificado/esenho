/**
 * =========================================================================
 * Blend Brush Plugin (plugins/brushes/blend/main.c)
 * Wet-media brush that dynamically samples and mixes paint with canvas pixels.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 16;
static int wetness = 60;
static int tex_mode = 0;

static inline uint32_t mix_color(uint32_t c1, uint32_t c2, int rate) {
    uint32_t r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
    uint32_t r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
    uint32_t r = (r1 * rate + r2 * (100 - rate)) / 100;
    uint32_t g = (g1 * rate + g2 * (100 - rate)) / 100;
    uint32_t b = (b1 * rate + b2 * (100 - rate)) / 100;
    uint32_t a = (a1 * rate + a2 * (100 - rate)) / 100;
    if (a == 0 && a2 > 0) a = a2;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

/**
 * Pixel shader callback for wet blending with canvas background.
 */
static inline uint32_t blend_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    if (s->eraser) return 0x00000000;
    uint32_t col = s->color;
    if ((dst_p >> 24) == 0) return col;
    return mix_color(col, dst_p, 100 - wetness);
}

/**
 * on_message - Handles brush parameter updates and blend stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &dummy, &dummy, &dummy, &dummy, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    w_stroke_interpolate(fb, &s, 0.2f, blend_pixel, (void*)0);
}

int32_t update(void) { return UPDATE_OK; }

