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

static inline uint32_t calligraphy_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    int thick = (r * aspect) / 100 + 1;
    int u = dx + dy; if (u < 0) u = -u;
    int v = dy - dx; if (v < 0) v = -v;

    if (u > r * 2 || v > thick * 2) return dst_p;

    if (s->eraser) return 0x00000000;
    uint32_t a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, (s->color >> 24) & 0xFF);
    return w_blend_fast(s->color, dst_p, a);
}

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_SIZE:      if (val > 0) size = val; break;
        case W_PARAM_ROUNDNESS: if (val >= 0 && val <= 100) aspect = val; break;
        case W_PARAM_TEX_MODE:  tex_mode = val; break;
    }
}

W_EXPORT void w_brush_stroke(int32_t state, int32_t x, int32_t y, int32_t prev_x, int32_t prev_y, uint32_t color, int32_t eraser) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    s.x0 = (state == 0) ? x : prev_x;
    s.y0 = (state == 0) ? y : prev_y;
    s.x1 = x;
    s.y1 = y;
    s.radius = size;
    s.color = color;
    s.texture_mode = tex_mode;
    s.eraser = eraser;

    w_stroke_interpolate(fb, &s, 0.1f, calligraphy_pixel, (void*)0);
}
