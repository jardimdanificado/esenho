#include "wesenho.h"

static int tolerance = 32;
static int tex_mode = 1;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

#define MAX_QUEUE 262144
static int32_t qx[MAX_QUEUE];
static int32_t qy[MAX_QUEUE];

static inline int color_match(uint32_t c1, uint32_t c2, int tol) {
    if (c1 == c2) return 1;
    int r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
    int r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
    int dr = r1 - r2; if (dr < 0) dr = -dr;
    int dg = g1 - g2; if (dg < 0) dg = -dg;
    int db = b1 - b2; if (db < 0) db = -db;
    int da = a1 - a2; if (da < 0) da = -da;
    return (dr <= tol && dg <= tol && db <= tol && da <= tol);
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

static inline uint32_t get_fill_pixel(wframebuffer_t *tex_fb, int px, int py, uint32_t base_color) {
    if (!tex_fb || tex_fb->width == 0 || tex_mode == 0 || tex_strength == 0) return base_color;
    uint32_t t_col = sample_texture(tex_fb, px, py);
    uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;

    if (tex_mode == 1) { // Grain/mask
        uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
        uint32_t a = (base_color >> 24) & 0xFF;
        uint32_t mod_a = (a * (lum * tex_strength + 255 * (100 - tex_strength))) / 25500;
        return (mod_a << 24) | (base_color & 0x00FFFFFF);
    } else { // Pattern
        uint32_t cr = base_color & 0xFF, cg = (base_color >> 8) & 0xFF, cb = (base_color >> 16) & 0xFF;
        uint32_t ca = base_color & 0xFF000000;
        return ca | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
    }
}

static void flood_fill(wframebuffer_t *fb, wframebuffer_t *tex_fb, int start_x, int start_y, uint32_t fill_color, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    if (start_x < 0 || start_x >= width || start_y < 0 || start_y >= height) return;

    uint32_t target_color = pixels[start_y * width + start_x];
    if (!is_eraser && target_color == fill_color && (!tex_fb || tex_mode == 0)) return;

    int q_head = 0, q_tail = 0;
    qx[q_tail] = start_x;
    qy[q_tail] = start_y;
    q_tail++;

    // Mark visited by setting directly or tracking
    pixels[start_y * width + start_x] = is_eraser ? 0x00000000 : get_fill_pixel(tex_fb, start_x, start_y, fill_color);

    while (q_head < q_tail && q_tail < MAX_QUEUE - 4) {
        int x = qx[q_head];
        int y = qy[q_head];
        q_head++;

        const int dx[4] = { 0, 0, -1, 1 };
        const int dy[4] = { -1, 1, 0, 0 };

        for (int i = 0; i < 4; i++) {
            int nx = x + dx[i];
            int ny = y + dy[i];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                int idx = ny * width + nx;
                if (color_match(pixels[idx], target_color, tolerance)) {
                    uint32_t new_col = is_eraser ? 0x00000000 : get_fill_pixel(tex_fb, nx, ny, fill_color);
                    if (pixels[idx] != new_col) {
                        pixels[idx] = new_col;
                        qx[q_tail] = nx;
                        qy[q_tail] = ny;
                        q_tail++;
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
        if (c_strcasecmp(param, "tolerance") == 0 || c_strcasecmp(param, "tol") == 0) { tolerance = val; }
        else if (c_strcasecmp(param, "tex_mode") == 0 || c_strcasecmp(param, "texture_mode") == 0) { tex_mode = val; }
        else if (c_strcasecmp(param, "tex_scale") == 0 || c_strcasecmp(param, "texture_scale") == 0) { tex_scale = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "tex_strength") == 0 || c_strcasecmp(param, "texture_strength") == 0) { tex_strength = val < 0 ? 0 : (val > 100 ? 100 : val); }
        return;
    }

    if (c_strcasecmp(tokens[0], "stroke") == 0 && ntok >= 8) {
        int state = c_atoi(tokens[1]);
        int x = c_atoi(tokens[2]);
        int y = c_atoi(tokens[3]);
        uint32_t color = c_parse_u32(tokens[6]);
        int is_eraser = c_atoi(tokens[7]);

        if (state == 0) {
            wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
            if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
            wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");
            flood_fill(fb, tex_fb, x, y, color, is_eraser);
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
