/**
 * =========================================================================
 * Calligraphy Brush Plugin (plugins/brushes/calligraphy/main.c)
 * Angled flat chisel/ribbon brush with directional line width variation.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 14;
static int aspect = 20;
static int tex_mode = 0;

/**
 * Pixel shader callback for 45-degree angled chisel ribbon projection.
 */
static inline uint32_t calligraphy_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    int thick = (r * aspect) / 100 + 1;
    int u = dx + dy; if (u < 0) u = -u;
    int v = dy - dx; if (v < 0) v = -v;

    if (u > r * 2 || v > thick * 2) return dst_p;

    if (s->eraser) return 0x00000000;
    uint32_t a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, (s->color >> 24) & 0xFF);
    return w_blend_fast(s->color, dst_p, a);
}

/**
 * on_message - Handles brush parameter updates and calligraphy stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &dummy, &dummy, &dummy, &dummy, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    w_stroke_interpolate(fb, &s, 0.1f, calligraphy_pixel, (void*)0);
}

int32_t update(void) { return UPDATE_OK; }

