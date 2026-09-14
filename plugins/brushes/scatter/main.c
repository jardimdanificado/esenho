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

/**
 * on_message - Handles brush parameter updates and particle spray rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &opacity, &dummy, &dummy, &dummy, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    spray(fb, s.x1, s.y1, s.color, s.eraser, s.texture_mode ? s.texture_mode : tex_mode);
}

int32_t update(void) { return UPDATE_OK; }

