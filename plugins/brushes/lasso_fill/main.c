#include "wesenho.h"

static int tex_mode = 1;       // 0=off, 1=grain/mask, 2=pattern
static int tex_scale = 100;    // %
static int tex_strength = 100; // 0..100%

#define MAX_POLY 8192
static int poly_x[MAX_POLY];
static int poly_y[MAX_POLY];
static int poly_count = 0;

static inline int min_val(int a, int b) { return a < b ? a : b; }
static inline int max_val(int a, int b) { return a > b ? a : b; }

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

static void fill_polygon(wframebuffer_t *fb, wframebuffer_t *tex_fb, uint32_t fill_color, int is_eraser) {
    if (poly_count < 3) return;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int min_y = poly_y[0], max_y = poly_y[0];
    for (int i = 1; i < poly_count; i++) {
        min_y = min_val(min_y, poly_y[i]);
        max_y = max_val(max_y, poly_y[i]);
    }
    min_y = max_val(0, min_y);
    max_y = min_val(height - 1, max_y);

    int node_x[256];

    for (int y = min_y; y <= max_y; y++) {
        int nodes = 0;
        int j = poly_count - 1;
        for (int i = 0; i < poly_count; i++) {
            if ((poly_y[i] < y && poly_y[j] >= y) || (poly_y[j] < y && poly_y[i] >= y)) {
                if (nodes < 255) {
                    node_x[nodes++] = (int)((float)poly_x[i] + (float)(y - poly_y[i]) / (float)(poly_y[j] - poly_y[i]) * (float)(poly_x[j] - poly_x[i]) + 0.5f);
                }
            }
            j = i;
        }

        // Sort nodes
        for (int i = 0; i < nodes - 1; i++) {
            for (int k = i + 1; k < nodes; k++) {
                if (node_x[i] > node_x[k]) {
                    int tmp = node_x[i];
                    node_x[i] = node_x[k];
                    node_x[k] = tmp;
                }
            }
        }

        // Fill spans
        for (int i = 0; i < nodes; i += 2) {
            if (i + 1 >= nodes) break;
            int x_start = max_val(0, node_x[i]);
            int x_end = min_val(width - 1, node_x[i + 1]);
            for (int x = x_start; x <= x_end; x++) {
                pixels[y * width + x] = is_eraser ? 0x00000000 : get_fill_pixel(tex_fb, x, y, fill_color);
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
            case BRUSH_PARAM_TEXTURE_MODE:     tex_mode = pmsg->value; break;
            case BRUSH_PARAM_TEXTURE_SCALE:    tex_scale = pmsg->value; if (tex_scale < 1) tex_scale = 1; break;
            case BRUSH_PARAM_TEXTURE_STRENGTH: tex_strength = pmsg->value; if (tex_strength < 0) tex_strength = 0; if (tex_strength > 100) tex_strength = 100; break;
        }
        return;
    }

    if (type == MSG_BRUSH_STROKE && len >= sizeof(wesenho_stroke_msg_t)) {
        wesenho_stroke_msg_t *smsg = (wesenho_stroke_msg_t*)piolho_page;
        if (smsg->state == STROKE_START) {
            poly_count = 0;
            if (poly_count < MAX_POLY) {
                poly_x[poly_count] = smsg->x;
                poly_y[poly_count] = smsg->y;
                poly_count++;
            }
        } else if (smsg->state == STROKE_MOVE) {
            if (poly_count < MAX_POLY - 1) {
                poly_x[poly_count] = smsg->x;
                poly_y[poly_count] = smsg->y;
                poly_count++;
            }
        } else if (smsg->state == STROKE_END) {
            wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
            if (fb && fb->pixels && fb->width > 0 && fb->height > 0) {
                wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");
                fill_polygon(fb, tex_fb, smsg->color, smsg->is_eraser);
            }
            poly_count = 0;
        }
    }
}

int32_t update(void) { return UPDATE_OK; }
