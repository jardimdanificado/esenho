#include "wesenho.h"

static int size = 24;
static int opacity = 60;
static int hardness = 20;
static int flow = 25;
static int spacing = 8;

static int tex_mode = 1;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

static inline float fast_sqrt(float val) {
    if (val <= 0.0f) return 0.0f;
    float x = val;
    for (int i = 0; i < 6; i++) x = 0.5f * (x + val / x);
    return x;
}

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    if (sa == 255 && ((dst >> 24) & 0xFF) == 0) return (src & 0x00FFFFFF) | 0xFF000000;

    uint32_t sr = src & 0xFF;
    uint32_t sg = (src >> 8) & 0xFF;
    uint32_t sb = (src >> 16) & 0xFF;

    uint32_t dr = dst & 0xFF;
    uint32_t dg = (dst >> 8) & 0xFF;
    uint32_t db = (dst >> 16) & 0xFF;
    uint32_t da = (dst >> 24) & 0xFF;

    uint32_t inv_sa = 255 - sa;
    uint32_t out_r = (sr * sa + dr * inv_sa) / 255;
    uint32_t out_g = (sg * sa + dg * inv_sa) / 255;
    uint32_t out_b = (sb * sa + db * inv_sa) / 255;
    uint32_t out_a = sa + (da * inv_sa) / 255;

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

static void stamp(wframebuffer_t *fb, wframebuffer_t *tex_fb, int x, int y, uint32_t color, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int r = (size * 3) / 2 + 2;
    float r_f = (float)r;
    float hard_factor = ((float)hardness / 100.0f) * 0.7f + 0.3f;
    float base_alpha = ((float)opacity / 100.0f) * ((float)flow / 100.0f) * hard_factor * 0.4f;

    for (int dy = -r; dy <= r; dy++) {
        int py = y + dy;
        if (py < 0 || py >= height) continue;
        for (int dx = -r; dx <= r; dx++) {
            int px = x + dx;
            if (px < 0 || px >= width) continue;

            float d = fast_sqrt((float)(dx * dx + dy * dy));
            if (d <= r_f) {
                float t = d / r_f;
                float falloff = (1.0f - t) * (1.0f - t);
                int stamp_a = (int)(255.0f * falloff * base_alpha);
                if (stamp_a > 255) stamp_a = 255;
                if (stamp_a <= 0) continue;

                uint32_t col = color;
                if (tex_fb && tex_fb->width > 0 && tex_mode > 0 && tex_strength > 0) {
                    uint32_t t_col = sample_texture(tex_fb, px, py);
                    if (tex_mode == 1) {
                        uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
                        uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
                        uint32_t mod = (lum * tex_strength + 255 * (100 - tex_strength)) / 100;
                        stamp_a = (stamp_a * mod) / 255;
                    } else if (tex_mode == 2) {
                        uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
                        uint32_t cr = color & 0xFF, cg = (color >> 8) & 0xFF, cb = (color >> 16) & 0xFF;
                        col = (color & 0xFF000000) | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
                    }
                }

                if (stamp_a <= 0) continue;

                if (is_eraser) {
                    uint32_t p = pixels[py * width + px];
                    uint32_t da = (p >> 24) & 0xFF;
                    if (da > 0) {
                        uint32_t new_a = (da * (255 - stamp_a)) / 255;
                        pixels[py * width + px] = (new_a << 24) | (p & 0x00FFFFFF);
                    }
                } else {
                    pixels[py * width + px] = blend_pixel(pixels[py * width + px], col, (uint8_t)stamp_a);
                }
            }
        }
    }
}

static void draw_line(wframebuffer_t *fb, wframebuffer_t *tex_fb, float x0, float y0, float x1, float y1, uint32_t color, int is_eraser) {
    float dx = x1 - x0;
    float dy = y1 - y0;
    float dist = fast_sqrt(dx * dx + dy * dy);

    float step_size = (float)size * ((float)spacing / 100.0f);
    if (step_size < 0.5f) step_size = 0.5f;

    int steps = (int)(dist / step_size);
    if (steps < 1) steps = 1;

    for (int i = 0; i <= steps; i++) {
        float t = (float)i / (float)steps;
        int cur_x = (int)(x0 + dx * t + 0.5f);
        int cur_y = (int)(y0 + dy * t + 0.5f);
        stamp(fb, tex_fb, cur_x, cur_y, color, is_eraser);
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < 4) return;
    uint32_t type = *(uint32_t*)piolho_page;

    if (type == MSG_BRUSH_SET_PARAM && len >= sizeof(wesenho_brush_param_msg_t)) {
        wesenho_brush_param_msg_t *pmsg = (wesenho_brush_param_msg_t*)piolho_page;
        switch (pmsg->param_id) {
            case BRUSH_PARAM_SIZE:             size = pmsg->value; if (size < 1) size = 1; break;
            case BRUSH_PARAM_OPACITY:          opacity = pmsg->value; break;
            case BRUSH_PARAM_HARDNESS:         hardness = pmsg->value; break;
            case BRUSH_PARAM_FLOW:             flow = pmsg->value; break;
            case BRUSH_PARAM_SPACING:          spacing = pmsg->value; if (spacing < 1) spacing = 1; break;
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

        if (smsg->state == STROKE_START) {
            stamp(fb, tex_fb, smsg->x, smsg->y, smsg->color, smsg->is_eraser);
        } else {
            draw_line(fb, tex_fb, (float)smsg->prev_x, (float)smsg->prev_y, (float)smsg->x, (float)smsg->y, smsg->color, smsg->is_eraser);
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
