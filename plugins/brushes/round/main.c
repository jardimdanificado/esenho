/**
 * =========================================================================
 * Round Brush Plugin (plugins/brushes/round/main.c)
 * Standard circular antialiased brush with hardness, flow, and texture mask.
 * =========================================================================
 */

#include "wesenho.h"

// Brush parameters
static int size = 8;
static int opacity = 100;
static int hardness = 80;
static int flow = 100;
static int spacing = 15;
static int tex_mode = 0;

static inline uint32_t round_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    uint32_t brush_a = ((s->color >> 24) & 0xFF) * opacity * flow / 10000;
    int dist = w_isqrt(dist_sq);
    int inner_r = (r * hardness) / 100;
    if (dist > inner_r && r > inner_r) {
        brush_a = brush_a * (r - dist) / (r - inner_r);
    }
    brush_a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, brush_a);

    if (s->eraser) {
        uint32_t da = (dst_p >> 24) & 0xFF;
        uint32_t na = (brush_a >= da) ? 0 : (da - brush_a);
        return (na << 24) | (dst_p & 0x00FFFFFF);
    }
    return w_blend_fast(s->color, dst_p, brush_a);
}

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_SIZE:     if (val > 0) size = val; break;
        case W_PARAM_OPACITY:  if (val >= 0 && val <= 100) opacity = val; break;
        case W_PARAM_HARDNESS: if (val >= 0 && val <= 100) hardness = val; break;
        case W_PARAM_FLOW:     if (val >= 0 && val <= 100) flow = val; break;
        case W_PARAM_SPACING:  if (val > 0) spacing = val; break;
        case W_PARAM_TEX_MODE: tex_mode = val; break;
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

    w_stroke_interpolate(fb, &s, (float)spacing / 100.0f, round_pixel, (void*)0);
}
