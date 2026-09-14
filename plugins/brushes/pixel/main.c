/**
 * =========================================================================
 * Pixel Brush Plugin (plugins/brushes/pixel/main.c)
 * Hard pixel-art pencil with integer Bresenham line rasterization.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 1;
static int tex_mode = 0;

static inline void put_pixel_block(wframebuffer_t *fb, int cx, int cy, uint32_t col, int is_eraser, const wstroke_t *s) {
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
                uint32_t a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, (col >> 24) & 0xFF);
                pixels[py * w + px] = w_blend_fast(col, pixels[py * w + px], a);
            }
        }
    }
}

/**
 * on_message - Handles brush parameter updates and pixel-art Bresenham drawing.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &dummy, &dummy, &dummy, &dummy, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;

    int x0 = s.x0, y0 = s.y0, x1 = s.x1, y1 = s.y1;
    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        put_pixel_block(fb, x0, y0, s.color, s.eraser, &s);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

int32_t update(void) { return UPDATE_OK; }

