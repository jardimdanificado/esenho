#include "wesenho.h"

static int size = 1;
static int tex_mode = 0;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

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

static inline uint32_t get_pixel_color(wframebuffer_t *tex_fb, int px, int py, uint32_t color) {
    if (!tex_fb || tex_fb->width == 0 || tex_mode == 0 || tex_strength == 0) return color;
    uint32_t t_col = sample_texture(tex_fb, px, py);
    uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
    if (tex_mode == 1) {
        uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
        uint32_t a = (color >> 24) & 0xFF;
        uint32_t mod_a = (a * (lum * tex_strength + 255 * (100 - tex_strength))) / 25500;
        return (mod_a << 24) | (color & 0x00FFFFFF);
    } else {
        uint32_t cr = color & 0xFF, cg = (color >> 8) & 0xFF, cb = (color >> 16) & 0xFF;
        return (color & 0xFF000000) | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < 4) return;
    uint32_t type = *(uint32_t*)piolho_page;

    if (type == MSG_BRUSH_SET_PARAM && len >= sizeof(wesenho_brush_param_msg_t)) {
        wesenho_brush_param_msg_t *pmsg = (wesenho_brush_param_msg_t*)piolho_page;
        switch (pmsg->param_id) {
            case BRUSH_PARAM_SIZE:             size = pmsg->value; if (size < 1) size = 1; break;
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

        uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
        int width = fb->width;
        int height = fb->height;

        int x0 = (smsg->state == STROKE_START) ? smsg->x : smsg->prev_x;
        int y0 = (smsg->state == STROKE_START) ? smsg->y : smsg->prev_y;
        int x1 = smsg->x;
        int y1 = smsg->y;

        int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
        int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
        int sx = (x0 < x1) ? 1 : -1;
        int sy = (y0 < y1) ? 1 : -1;
        int err = dx - dy;

        int half = size / 2;

        while (1) {
            for (int sy_off = 0; sy_off < size; sy_off++) {
                int py = y0 + sy_off - half;
                if (py < 0 || py >= height) continue;
                for (int sx_off = 0; sx_off < size; sx_off++) {
                    int px = x0 + sx_off - half;
                    if (px < 0 || px >= width) continue;
                    pixels[py * width + px] = smsg->is_eraser ? 0x00000000 : get_pixel_color(tex_fb, px, py, smsg->color);
                }
            }

            if (x0 == x1 && y0 == y1) break;
            int e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx)  { err += dx; y0 += sy; }
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
