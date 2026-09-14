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

/**
 * Pixel shader callback for soft quadratic airbrush falloff.
 */
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

/**
 * on_message - Handles brush parameter updates and airbrush stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    if (w_handle_brush_set(len, &size, &opacity, &hardness, &flow, &spacing, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    w_stroke_interpolate(fb, &s, (float)spacing / 100.0f, airbrush_pixel, (void*)0);
}

int32_t update(void) { return UPDATE_OK; }

