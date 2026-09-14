/**
 * =========================================================================
 * Airbrush Plugin (plugins/brushes/airbrush/main.c)
 * Soft, low-hardness spray brush with smooth quadratic radial falloff.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 24;
static int opacity = 60;
static int hardness = 20;
static int flow = 25;
static int spacing = 8;
static int tex_mode = 0;

static inline uint32_t airbrush_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    int dist = w_isqrt(dist_sq);
    int num = (r - dist) * 255 / (r > 0 ? r : 1);
    uint32_t falloff = (num * num) / 255;

    uint32_t hard_factor = (hardness * 70 + 3000) / 100; // 30%..100%
    uint32_t brush_a = (opacity * flow * hard_factor * falloff * 4) / 1000000;
    if (brush_a > 255) brush_a = 255;
    if (brush_a == 0) return dst_p;

    brush_a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, brush_a);

    if (s->eraser) {
        uint32_t da = (dst_p >> 24) & 0xFF;
        uint32_t na = (da * (255 - brush_a)) / 255;
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

    w_stroke_interpolate(fb, &s, (float)spacing / 100.0f, airbrush_pixel, (void*)0);
}
