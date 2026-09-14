/**
 * =========================================================================
 * Hatch Brush Plugin (plugins/brushes/hatch/main.c)
 * Parallel line cross-hatching shader brush with configurable spacing.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 20;
static int spacing = 6;
static int tex_mode = 0;

/**
 * Pixel shader callback for periodic diagonal hatching.
 */
static inline uint32_t hatch_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    if ((px + py) % (spacing > 0 ? spacing : 1) != 0) return dst_p;

    if (s->eraser) return 0x00000000;
    uint32_t a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, (s->color >> 24) & 0xFF);
    return w_blend_fast(s->color, dst_p, a);
}

/**
 * on_message - Handles brush parameter updates and hatch stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &dummy, &dummy, &dummy, &spacing, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    w_stroke_interpolate(fb, &s, 0.15f, hatch_pixel, (void*)0);
}

int32_t update(void) { return UPDATE_OK; }

