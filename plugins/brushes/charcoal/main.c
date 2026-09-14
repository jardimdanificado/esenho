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

/**
 * Pixel shader callback for stochastic charcoal grain deposition.
 */
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

/**
 * on_message - Handles brush parameter updates and charcoal stroke rendering.
 */
void on_message(int32_t from_id, int32_t len) {
    int dummy = 0;
    if (w_handle_brush_set(len, &size, &opacity, &dummy, &dummy, &dummy, &tex_mode)) return;
    wframebuffer_t *fb = w_get_layer();
    if (!fb) return;

    wstroke_t s;
    if (!w_parse_stroke(len, &s, size)) return;
    w_stroke_interpolate(fb, &s, 0.2f, charcoal_pixel, (void*)0);
}

int32_t update(void) { return UPDATE_OK; }

