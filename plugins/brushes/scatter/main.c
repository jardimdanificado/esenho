#include "wesenho.h"

static int size = 20;
static int density = 30;
static int opacity = 80;

static int tex_mode = 1;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

static uint32_t rng_state = 0x12345678;
static inline uint32_t next_random(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF, da = (dst >> 24) & 0xFF;
    uint32_t inv = 255 - sa;
    uint32_t out_r = (sr * sa + dr * inv) / 255;
    uint32_t out_g = (sg * sa + dg * inv) / 255;
    uint32_t out_b = (sb * sa + db * inv) / 255;
    uint32_t out_a = sa + (da * inv) / 255;
    return (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
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

static void spray(wframebuffer_t *fb, wframebuffer_t *tex_fb, int x, int y, uint32_t color, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int r = size;
    int r2 = r * r;
    uint8_t base_op = (uint8_t)((opacity * 255) / 100);

    for (int i = 0; i < density; i++) {
        int rx = ((int)(next_random() % (2 * r + 1))) - r;
        int ry = ((int)(next_random() % (2 * r + 1))) - r;
        if (rx * rx + ry * ry <= r2) {
            int px = x + rx;
            int py = y + ry;
            if (px >= 0 && px < width && py >= 0 && py < height) {
                if (is_eraser) {
                    pixels[py * width + px] = 0x00000000;
                } else {
                    uint8_t op = base_op;
                    uint32_t col = color;
                    if (tex_fb && tex_fb->width > 0 && tex_mode > 0 && tex_strength > 0) {
                        uint32_t t_col = sample_texture(tex_fb, px, py);
                        uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
                        if (tex_mode == 1) {
                            uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
                            uint32_t mod = (lum * tex_strength + 255 * (100 - tex_strength)) / 100;
                            op = (uint8_t)((op * mod) / 255);
                        } else if (tex_mode == 2) {
                            uint32_t cr = color & 0xFF, cg = (color >> 8) & 0xFF, cb = (color >> 16) & 0xFF;
                            col = (color & 0xFF000000) | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
                        }
                    }
                    if (op > 0) {
                        pixels[py * width + px] = blend_pixel(pixels[py * width + px], col, op);
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
            case BRUSH_PARAM_DENSITY:          density = pmsg->value; break;
            case BRUSH_PARAM_OPACITY:          opacity = pmsg->value; break;
            case BRUSH_PARAM_TEXTURE_MODE:     tex_mode = pmsg->value; break;
            case BRUSH_PARAM_TEXTURE_SCALE:    tex_scale = pmsg->value; if (tex_scale < 1) tex_scale = 1; break;
            case BRUSH_PARAM_TEXTURE_STRENGTH: tex_strength = pmsg->value; if (tex_strength < 0) tex_strength = 0; if (tex_strength > 100) tex_strength = 100; break;
        }
        return;
    }

    if (type == MSG_BRUSH_STROKE && len >= sizeof(wesenho_stroke_msg_t)) {
        wesenho_stroke_msg_t *smsg = (wesenho_stroke_msg_t*)piolho_page;
        wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
        if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
        wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");
        spray(fb, tex_fb, smsg->x, smsg->y, smsg->color, smsg->is_eraser);
    }
}

int32_t update(void) { return UPDATE_OK; }
