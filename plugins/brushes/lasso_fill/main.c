/**
 * =========================================================================
 * Lasso Fill Plugin (plugins/brushes/lasso_fill/main.c)
 * Freehand polygonal selection fill using scanline rasterization.
 * Accumulates polygon vertices while mouse is pressed, then fills polygon on release.
 * =========================================================================
 */

#include "wesenho.h"

// --- Texture Modulation Parameters ---
static int tex_mode = 1;       // 0 = Off, 1 = Grain/Luminance mask, 2 = RGB Pattern
static int tex_scale = 100;    // Texture UV scale percentage
static int tex_strength = 100; // Texture modulation strength (0..100%)

// Fixed buffer storing polygon vertex coordinates collected during stroke
#define MAX_POLY 8192
static int poly_x[MAX_POLY];
static int poly_y[MAX_POLY];
static int poly_count = 0;

static inline int min_val(int a, int b) { return a < b ? a : b; }
static inline int max_val(int a, int b) { return a > b ? a : b; }

/**
 * Samples texture color from host shared buffer with UV scaling and wrapping.
 */
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

/**
 * Computes destination pixel color with texture grain/pattern modulation.
 */
static inline uint32_t get_fill_pixel(wframebuffer_t *tex_fb, int px, int py, uint32_t base_color) {
    if (!tex_fb || tex_fb->width == 0 || tex_mode == 0 || tex_strength == 0) return base_color;
    uint32_t t_col = sample_texture(tex_fb, px, py);
    uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;

    if (tex_mode == 1) {
        // Mode 1: Grain Mask - modulates alpha using texture luminance
        uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
        uint32_t a = (base_color >> 24) & 0xFF;
        uint32_t mod_a = (a * (lum * tex_strength + 255 * (100 - tex_strength))) / 25500;
        return (mod_a << 24) | (base_color & 0x00FFFFFF);
    } else {
        // Mode 2: RGB Pattern - multiplies color components with texture RGB
        uint32_t cr = base_color & 0xFF, cg = (base_color >> 8) & 0xFF, cb = (base_color >> 16) & 0xFF;
        uint32_t ca = base_color & 0xFF000000;
        return ca | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
    }
}

/**
 * Scanline Polygon Rasterizer:
 * 1. Computes bounding vertical range [min_y, max_y] of polygon.
 * 2. For each scanline y, calculates X intersections with all polygon edges.
 * 3. Sorts intersection points from left to right.
 * 4. Fills horizontal spans between pairs of edge intersections (Even-Odd rule).
 */
static void fill_polygon(wframebuffer_t *fb, wframebuffer_t *tex_fb, uint32_t fill_color, int is_eraser) {
    if (poly_count < 3) return;
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    // Find bounding vertical extent
    int min_y = poly_y[0], max_y = poly_y[0];
    for (int i = 1; i < poly_count; i++) {
        min_y = min_val(min_y, poly_y[i]);
        max_y = max_val(max_y, poly_y[i]);
    }
    min_y = max_val(0, min_y);
    max_y = min_val(height - 1, max_y);

    int node_x[256];

    // Scanline rasterization
    for (int y = min_y; y <= max_y; y++) {
        int nodes = 0;
        int j = poly_count - 1;
        for (int i = 0; i < poly_count; i++) {
            if ((poly_y[i] < y && poly_y[j] >= y) || (poly_y[j] < y && poly_y[i] >= y)) {
                if (nodes < 255) {
                    // Linear interpolation of edge intersection with scanline y
                    node_x[nodes++] = (int)((float)poly_x[i] + (float)(y - poly_y[i]) / (float)(poly_y[j] - poly_y[i]) * (float)(poly_x[j] - poly_x[i]) + 0.5f);
                }
            }
            j = i;
        }

        // Sort intersection nodes along scanline (Bubble sort for small N)
        for (int i = 0; i < nodes - 1; i++) {
            for (int k = i + 1; k < nodes; k++) {
                if (node_x[i] > node_x[k]) {
                    int tmp = node_x[i];
                    node_x[i] = node_x[k];
                    node_x[k] = tmp;
                }
            }
        }

        // Fill horizontal spans between node pairs
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

/**
 * Message Handler: Processes text protocol commands ("set", "stroke") from Piolho page.
 */
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
        if (c_strcasecmp(param, "tex_mode") == 0 || c_strcasecmp(param, "texture_mode") == 0) { tex_mode = val; }
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
            // STROKE_START: reset polygon vertex buffer and add first vertex
            poly_count = 0;
            if (poly_count < MAX_POLY) {
                poly_x[poly_count] = x;
                poly_y[poly_count] = y;
                poly_count++;
            }
        } else if (state == 1) {
            // STROKE_MOVE: accumulate vertices along freehand trajectory
            if (poly_count < MAX_POLY - 1) {
                poly_x[poly_count] = x;
                poly_y[poly_count] = y;
                poly_count++;
            }
        } else if (state == 2) {
            // STROKE_END: mouse released, rasterize and fill enclosed polygon
            wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
            if (fb && fb->pixels && fb->width > 0 && fb->height > 0) {
                wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");
                fill_polygon(fb, tex_fb, color, is_eraser);
            }
        }
    }
}

/** Piolho frame update hook */
int32_t update(void) { return UPDATE_OK; }

