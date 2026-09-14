/**
 * =========================================================================
 * Charcoal Brush Plugin (plugins/brushes/charcoal/main.c)
 * Textured organic charcoal brush with stochastic grain and edge scattering.
 * =========================================================================
 */

#include "wesenho.h"

static int size = 12;
static int opacity = 85;
static int grain = 40;
static int tex_mode = 0;

static uint32_t rng_state = 0x87654321;
static inline uint32_t next_random(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

static inline uint32_t charcoal_pixel(int px, int py, int dx, int dy, int dist_sq, int r, uint32_t dst_p, const wstroke_t *s, void *ctx) {
    uint32_t rnd = next_random() % 100;
    if (rnd <= (uint32_t)grain) return dst_p;

    int r2 = r * r;
    uint32_t a = (opacity * (100 - (dist_sq * 60) / (r2 > 0 ? r2 : 1))) / 100;
    a = (a * ((s->color >> 24) & 0xFF)) / 255;
    a = w_sample_texture(s->texture_mode ? s->texture_mode : tex_mode, px, py, a);

    if (s->eraser) {
        uint32_t da = (dst_p >> 24) & 0xFF;
        uint32_t na = (a >= da) ? 0 : (da - a);
        return (na << 24) | (dst_p & 0x00FFFFFF);
    }
    return w_blend_fast(s->color, dst_p, a);
}

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_SIZE:     if (val > 0) size = val; break;
        case W_PARAM_OPACITY:  if (val >= 0 && val <= 100) opacity = val; break;
        case W_PARAM_GRAIN:    if (val >= 0 && val <= 100) grain = val; break;
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

    w_stroke_interpolate(fb, &s, 0.2f, charcoal_pixel, (void*)0);
}
