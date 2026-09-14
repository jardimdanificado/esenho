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

/**
 * Pixel shader callback for round brush circular dab.
 */
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

/**
 * on_message - Handles brush parameter updates and stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    if (w_handle_brush_set(len, &size, &opacity, &hardness, &flow, &spacing, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    w_stroke_interpolate(fb, &s, (float)spacing / 100.0f, round_pixel, (void*)0);
}

int32_t update(void) { return UPDATE_OK; }

