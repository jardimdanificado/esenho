#include "wesenho.h"

static int size = 18;
static int wetness = 50; // 0..100%

static int tex_mode = 1;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

#define MAX_SAMPLE 4096
static uint32_t sample_buf[MAX_SAMPLE];

static inline float fast_sqrt(float val) {
    if (val <= 0.0f) return 0.0f;
    float x = val;
    for (int i = 0; i < 6; i++) x = 0.5f * (x + val / x);
    return x;
}

static inline uint32_t blend_color(uint32_t c1, uint32_t c2, int rate) {
    uint32_t r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
    uint32_t r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
    uint32_t r = (r1 * rate + r2 * (100 - rate)) / 100;
    uint32_t g = (g1 * rate + g2 * (100 - rate)) / 100;
    uint32_t b = (b1 * rate + b2 * (100 - rate)) / 100;
    uint32_t a = (a1 * rate + a2 * (100 - rate)) / 100;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

static inline uint32_t sample_texture(wframebuffer_t *tex_fb, int x, int y) {
    if (!tex_fb || !tex_fb->pixels || tex_fb->width == 0 || tex_fb->height == 0) return 0xFFFFFFFF;
    int tw = tex_fb->width;
    int th = tex_fb->height;
    int scale = tex_scale > 0 ? tex_scale : 100;
    int sx = (x * 100) / scale;
    int sy = (y * 100) / scale;
    int tx = sx % tw; if (tx < 0) tx += tw;
    int ty = sy % th; if (ty < 0) ty += th;
    uint32_t *tp = (uint32_t*)(uintptr_t)tex_fb->pixels;
    return tp[ty * tw + tx];
}

static void smear(wframebuffer_t *fb, wframebuffer_t *tex_fb, int x0, int y0, int x1, int y1) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int r = size;
    int r2 = r * r;

    // Grab source patch from x0, y0
    int s_idx = 0;
    for (int dy = -r; dy <= r; dy++) {
        int py = y0 + dy;
        for (int dx = -r; dx <= r; dx++) {
            int px = x0 + dx;
            if (s_idx < MAX_SAMPLE) {
                if (px >= 0 && px < width && py >= 0 && py < height) {
                    sample_buf[s_idx++] = pixels[py * width + px];
                } else {
                    sample_buf[s_idx++] = 0;
                }
            }
        }
    }

    // Blend into x1, y1
    s_idx = 0;
    for (int dy = -r; dy <= r; dy++) {
        int py = y1 + dy;
        for (int dx = -r; dx <= r; dx++) {
            int px = x1 + dx;
            if (s_idx < MAX_SAMPLE) {
                uint32_t src = sample_buf[s_idx++];
                if (px >= 0 && px < width && py >= 0 && py < height && (dx * dx + dy * dy <= r2)) {
                    if ((src >> 24) > 0) {
                        int current_wet = wetness;
                        if (tex_fb && tex_fb->width > 0 && tex_mode > 0 && tex_strength > 0) {
                            uint32_t t_col = sample_texture(tex_fb, px, py);
                            uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
                            uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
                            current_wet = (current_wet * (lum * tex_strength + 255 * (100 - tex_strength))) / 25500;
                        }
                        pixels[py * width + px] = blend_color(src, pixels[py * width + px], current_wet);
                    }
                }
            }
        }
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < 4) return;
    uint32_t type = *(uint32_t*)piolho_page;

    if (type == MSG_BRUSH_SET_PARAM && len >= sizeof(wesenho_brush_param_msg_t)) {
        wesenho_brush_param_msg_t *pmsg = (wesenho_brush_param_msg_t*)piolho_page;
        switch (pmsg->param_id) {
            case BRUSH_PARAM_SIZE:             size = pmsg->value; break;
            case BRUSH_PARAM_WETNESS:          wetness = pmsg->value; break;
            case BRUSH_PARAM_TEXTURE_MODE:     tex_mode = pmsg->value; break;
            case BRUSH_PARAM_TEXTURE_SCALE:    tex_scale = pmsg->value; if (tex_scale < 1) tex_scale = 1; break;
            case BRUSH_PARAM_TEXTURE_STRENGTH: tex_strength = pmsg->value; if (tex_strength < 0) tex_strength = 0; if (tex_strength > 100) tex_strength = 100; break;
        }
        return;
    }

    if (type == MSG_BRUSH_STROKE && len >= sizeof(wesenho_stroke_msg_t)) {
        wesenho_stroke_msg_t *smsg = (wesenho_stroke_msg_t*)piolho_page;
        if (smsg->state != STROKE_START) {
            wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
            if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
            wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");
            smear(fb, tex_fb, smsg->prev_x, smsg->prev_y, smsg->x, smsg->y);
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
