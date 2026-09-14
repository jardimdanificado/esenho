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
        else if (c_strcasecmp(param, "wetness") == 0 || c_strcasecmp(param, "wet") == 0) { wetness = val; }
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

        if (state != 0) {
            wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
            if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
            wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");
            smear(fb, tex_fb, prev_x, prev_y, x, y);
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
