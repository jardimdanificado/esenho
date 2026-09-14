#include "wesenho.h"

static int size = 12;
static int opacity = 85;
static int grain = 40;

static int tex_mode = 1;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

static uint32_t rng_state = 0x87654321;
static inline uint32_t next_random(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

static inline float fast_sqrt(float val) {
    if (val <= 0.0f) return 0.0f;
    float x = val;
    for (int i = 0; i < 6; i++) x = 0.5f * (x + val / x);
    return x;
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

static void stamp_charcoal(wframebuffer_t *fb, wframebuffer_t *tex_fb, int x, int y, uint32_t color, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int r = size;
    int r2 = r * r;

    for (int dy = -r; dy <= r; dy++) {
        int py = y + dy;
        if (py < 0 || py >= height) continue;
        for (int dx = -r; dx <= r; dx++) {
            int px = x + dx;
            if (px < 0 || px >= width) continue;

            int d2 = dx * dx + dy * dy;
            if (d2 <= r2) {
                uint32_t rnd = next_random() % 100;
                int current_grain = grain;

                uint32_t col = color;
                if (tex_fb && tex_fb->width > 0 && tex_mode > 0 && tex_strength > 0) {
                    uint32_t t_col = sample_texture(tex_fb, px, py);
                    uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
                    uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
                    current_grain = (current_grain * (255 - lum)) / 255;
                    if (tex_mode == 2) {
                        uint32_t cr = color & 0xFF, cg = (color >> 8) & 0xFF, cb = (color >> 16) & 0xFF;
                        col = (color & 0xFF000000) | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
                    }
                }

                if (rnd > (uint32_t)current_grain) {
                    uint8_t a = (uint8_t)((opacity * (100 - (d2 * 60) / r2)) / 100);
                    if (is_eraser) {
                        pixels[py * width + px] = 0x00000000;
                    } else {
                        pixels[py * width + px] = blend_pixel(pixels[py * width + px], col, a);
                    }
                }
            }
        }
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;
    char buf[256];
    int clen = (len < 255) ? len : 255;
    for (int i = 0; i < clen; i++) buf[i] = (char)piolho_page[i];
    buf[clen] = '\0';

    char *tokens[10];
    int ntok = c_tokenize(buf, tokens, 10);
    if (ntok == 0) return;

    if (c_strcasecmp(tokens[0], "set") == 0 && ntok >= 3) {
        const char *param = tokens[1];
        int val = c_atoi(tokens[2]);
        if (c_strcasecmp(param, "size") == 0) { size = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "opacity") == 0) { opacity = val < 0 ? 0 : (val > 100 ? 100 : val); }
        else if (c_strcasecmp(param, "grain") == 0) { grain = val; }
        else if (c_strcasecmp(param, "tex_mode") == 0 || c_strcasecmp(param, "texture_mode") == 0) { tex_mode = val; }
        else if (c_strcasecmp(param, "tex_scale") == 0 || c_strcasecmp(param, "texture_scale") == 0) { tex_scale = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "tex_strength") == 0 || c_strcasecmp(param, "texture_strength") == 0) { tex_strength = val < 0 ? 0 : (val > 100 ? 100 : val); }
        return;
    }

    if (c_strcasecmp(tokens[0], "stroke") == 0 && ntok >= 8) {
        int state = c_atoi(tokens[1]);
        int x = c_atoi(tokens[2]);
        int y = c_atoi(tokens[3]);
        int prev_x = c_atoi(tokens[4]);
        int prev_y = c_atoi(tokens[5]);
        uint32_t color = c_parse_u32(tokens[6]);
        int is_eraser = c_atoi(tokens[7]);

        wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
        if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
        wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");

        if (state == 0) {
            stamp_charcoal(fb, tex_fb, x, y, color, is_eraser);
        } else {
            float dx = (float)(x - prev_x);
            float dy = (float)(y - prev_y);
            float dist = fast_sqrt(dx * dx + dy * dy);
            int steps = (int)(dist / 2.0f);
            if (steps < 1) steps = 1;
            for (int i = 0; i <= steps; i++) {
                float t = (float)i / (float)steps;
                int cx = (int)((float)prev_x + dx * t + 0.5f);
                int cy = (int)((float)prev_y + dy * t + 0.5f);
                stamp_charcoal(fb, tex_fb, cx, cy, color, is_eraser);
            }
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
