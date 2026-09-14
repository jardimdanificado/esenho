/**
 * =========================================================================
 * Pixel Brush Plugin (plugins/brushes/pixel/main.c)
 * Hard pixel-art pencil with integer Bresenham line rasterization.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 1;
static int tex_mode = 0;

static inline void put_pixel_block(wframebuffer_t *fb, int cx, int cy, uint32_t col, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int w = fb->width;
    int h = fb->height;
    int half = size / 2;

    for (int dy = 0; dy < size; dy++) {
        int py = cy + dy - half;
        if (py < 0 || py >= h) continue;
        for (int dx = 0; dx < size; dx++) {
            int px = cx + dx - half;
            if (px < 0 || px >= w) continue;
            if (is_eraser) {
                pixels[py * w + px] = 0x00000000;
            } else {
                uint32_t a = w_sample_texture(tex_mode, px, py, (col >> 24) & 0xFF);
                pixels[py * w + px] = w_blend_fast(col, pixels[py * w + px], a);
            }
        }
    }
}

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_SIZE:     if (val > 0) size = val; break;
        case W_PARAM_TEX_MODE: tex_mode = val; break;
    }
}

W_EXPORT void w_brush_stroke(int32_t state, int32_t x, int32_t y, int32_t prev_x, int32_t prev_y, uint32_t color, int32_t eraser) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    int x0 = (state == 0) ? x : prev_x;
    int y0 = (state == 0) ? y : prev_y;
    int x1 = x;
    int y1 = y;

    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        put_pixel_block(fb, x0, y0, color, eraser);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}
