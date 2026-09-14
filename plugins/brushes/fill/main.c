/**
 * =========================================================================
 * Flood Fill Plugin (plugins/brushes/fill/main.c)
 * Breadth-first search (BFS) flood fill with Manhattan color tolerance and texture support.
 * =========================================================================
 */

#include "wesenho.h"

// --- Fill Configurable Parameters ---
static int tolerance = 32; // Per-channel Manhattan color distance tolerance (0..255)

// --- Texture Modulation Parameters ---
static int tex_mode = 1;       // 0 = Off, 1 = Grain/Luminance mask, 2 = RGB Pattern
static int tex_scale = 100;    // Texture UV scale percentage
static int tex_strength = 100; // Texture modulation strength (0..100%)

// Fixed-size FIFO queue for non-recursive 4-way BFS flood fill (avoids WASM call-stack overflow)
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

    if (tex_mode == 1) {
        uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
        uint32_t a = (base_color >> 24) & 0xFF;
        uint32_t mod_a = (a * (lum * tex_strength + 255 * (100 - tex_strength))) / 25500;
        return (mod_a << 24) | (base_color & 0x00FFFFFF);
    } else {
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

W_EXPORT void w_brush_set_param(int32_t param_id, int32_t val) {
    switch (param_id) {
        case W_PARAM_TOLERANCE:    tolerance = (val < 0) ? 0 : (val > 255 ? 255 : val); break;
        case W_PARAM_TEX_MODE:     tex_mode = val; break;
        case W_PARAM_TEX_SCALE:    tex_scale = val < 1 ? 1 : val; break;
        case W_PARAM_TEX_STRENGTH: tex_strength = val < 0 ? 0 : (val > 100 ? 100 : val); break;
    }
}

W_EXPORT void w_brush_stroke(int32_t state, int32_t x, int32_t y, int32_t prev_x, int32_t prev_y, uint32_t color, int32_t eraser) {
    if (state == 0) { // STROKE_START
        wframebuffer_t *fb = w_get_layer();
        if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
        wframebuffer_t *tex_fb = w_get_texture();
        flood_fill(fb, tex_fb, x, y, color, eraser);
    }
}
