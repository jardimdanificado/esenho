/**
 * =========================================================================
 * Round Brush Plugin (plugins/brushes/round/main.c)
 * Standard circular antialiased brush with hardness, flow, and texture mask.
 * =========================================================================
 */

#include "wesenho.h"

// --- Brush Configurable Parameters ---
static int size = 8;        // Radius in pixels
static int opacity = 100;   // Overall stroke opacity (0..100%)
static int hardness = 80;   // Edge hardness (0..100%)
static int flow = 100;      // Paint buildup rate per stamp (0..100%)
static int spacing = 15;    // Stamp spacing relative to brush radius (percentage)
static int roundness = 100; // Aspect ratio compression (1..100%)
static int angle = 0;       // Orientation angle (-180..180 deg)

// --- Texture Modulation Parameters ---
static int tex_mode = 1;       // 0 = Off, 1 = Grain/Luminance mask, 2 = RGB Pattern
static int tex_scale = 100;    // Texture UV scale percentage
static int tex_strength = 100; // Texture modulation strength (0..100%)

/**
 * Fast square root approximation using 6 iterations of Newton-Raphson.
 * Avoids libm dependency in freestanding WebAssembly target.
 */
static inline float fast_sqrt(float val) {
    if (val <= 0.0f) return 0.0f;
    float x = val;
    for (int i = 0; i < 6; i++) x = 0.5f * (x + val / x);
    return x;
}

/**
 * Performs Porter-Duff Source-Over alpha blending of two 32-bit RGBA pixels.
 * @param dst        Destination pixel currently on the canvas layer
 * @param src        Source brush color to paint
 * @param alpha_mod  Opacity modifier (0..255)
 * @returns Blended packed 32-bit pixel (0xAABBGGRR)
 */
static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    // Calculate effective source alpha scaled by brush opacity
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    // Opaque paint directly replaces fully transparent canvas background
    if (sa == 255 && ((dst >> 24) & 0xFF) == 0) return (src & 0x00FFFFFF) | 0xFF000000;

    // Unpack source components
    uint32_t sr = src & 0xFF;
    uint32_t sg = (src >> 8) & 0xFF;
    uint32_t sb = (src >> 16) & 0xFF;

    // Unpack destination components
    uint32_t dr = dst & 0xFF;
    uint32_t dg = (dst >> 8) & 0xFF;
    uint32_t db = (dst >> 16) & 0xFF;
    uint32_t da = (dst >> 24) & 0xFF;

    // Standard alpha blending: out = (src * sa + dst * (1 - sa))
    uint32_t inv_sa = 255 - sa;
    uint32_t out_r = (sr * sa + dr * inv_sa) / 255;
    uint32_t out_g = (sg * sa + dg * inv_sa) / 255;
    uint32_t out_b = (sb * sa + db * inv_sa) / 255;
    uint32_t out_a = sa + (da * inv_sa) / 255;

    return (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
}

/**
 * Samples a pixel from the active texture framebuffer with tiling (modulo wrapping) and scaling.
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
 * Renders a single circular dab/stamp onto the active layer.
 * Applies radial boundary test, eraser mode, texture grain/pattern, and alpha blending.
 */
static void stamp(wframebuffer_t *fb, wframebuffer_t *tex_fb, int x, int y, uint32_t color, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int r = size < 1 ? 1 : size;
    int r2 = r * r;
    // Base stamp opacity computed from opacity and flow (0..255)
    uint8_t base_op = (uint8_t)((opacity * flow * 255) / 10000);
    if (base_op == 0) base_op = 1;

    // Rasterize bounding box around stamp center
    for (int dy = -r; dy <= r; dy++) {
        int py = y + dy;
        if (py < 0 || py >= height) continue; // Y clip
        for (int dx = -r; dx <= r; dx++) {
            int px = x + dx;
            if (px < 0 || px >= width) continue; // X clip

            int dist2 = dx * dx + dy * dy;
            if (dist2 <= r2) {
                if (is_eraser) {
                    // Eraser zeroes out pixel alpha and color
                    pixels[py * width + px] = 0x00000000;
                } else {
                    uint8_t op = base_op;
                    uint32_t col = color;

                    // Apply texture modulation if enabled
                    if (tex_fb && tex_fb->width > 0 && tex_mode > 0 && tex_strength > 0) {
                        uint32_t t_col = sample_texture(tex_fb, px, py);
                        if (tex_mode == 1) {
                            // Mode 1: Grain Mask - modulates stamp opacity using texture luminance
                            uint32_t tr = t_col & 0xFF;
                            uint32_t tg = (t_col >> 8) & 0xFF;
                            uint32_t tb = (t_col >> 16) & 0xFF;
                            uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
                            uint32_t mod = (lum * tex_strength + 255 * (100 - tex_strength)) / 100;
                            op = (uint8_t)((op * mod) / 255);
                        } else if (tex_mode == 2) {
                            // Mode 2: RGB Pattern - multiplies brush RGB with texture RGB
                            uint32_t tr = t_col & 0xFF;
                            uint32_t tg = (t_col >> 8) & 0xFF;
                            uint32_t tb = (t_col >> 16) & 0xFF;
                            uint32_t cr = color & 0xFF;
                            uint32_t cg = (color >> 8) & 0xFF;
                            uint32_t cb = (color >> 16) & 0xFF;
                            uint32_t out_r = (cr * tr) / 255;
                            uint32_t out_g = (cg * tg) / 255;
                            uint32_t out_b = (cb * tb) / 255;
                            col = (color & 0xFF000000) | (out_b << 16) | (out_g << 8) | out_r;
                        }
                    }

                    // Direct write if fully opaque, else blend with destination
                    if (op == 255 && col == color) {
                        pixels[py * width + px] = col;
                    } else {
                        pixels[py * width + px] = blend_pixel(pixels[py * width + px], col, op);
                    }
                }
            }
        }
    }
}

/**
 * Interpolates continuous stroke dabs between previous point (x0, y0) and current point (x1, y1)
 * based on spacing parameter to prevent gap artifacts during fast mouse movement.
 */
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

/**
 * Message Handler: Parses UTF-8 text commands from Piolho page buffer.
 * Handles:
 * - "set <param> <value>": Adjusts brush size, opacity, hardness, texture settings, etc.
 * - "stroke <state> <x> <y> <px> <py> <color> <is_eraser>": Performs drawing dab / line.
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

    // Parameter configuration command
    if (c_strcasecmp(tokens[0], "set") == 0 && ntok >= 3) {
        const char *param = tokens[1];
        int val = c_atoi(tokens[2]);
        if (c_strcasecmp(param, "size") == 0) { size = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "opacity") == 0) { opacity = val < 0 ? 0 : (val > 100 ? 100 : val); }
        else if (c_strcasecmp(param, "hardness") == 0) { hardness = val; }
        else if (c_strcasecmp(param, "flow") == 0) { flow = val; }
        else if (c_strcasecmp(param, "spacing") == 0) { spacing = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "roundness") == 0) { roundness = val; }
        else if (c_strcasecmp(param, "angle") == 0) { angle = val; }
        else if (c_strcasecmp(param, "tex_mode") == 0 || c_strcasecmp(param, "texture_mode") == 0) { tex_mode = val; }
        else if (c_strcasecmp(param, "tex_scale") == 0 || c_strcasecmp(param, "texture_scale") == 0) { tex_scale = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "tex_strength") == 0 || c_strcasecmp(param, "texture_strength") == 0) { tex_strength = val < 0 ? 0 : (val > 100 ? 100 : val); }
        return;
    }

    // Stroke execution command
    if (c_strcasecmp(tokens[0], "stroke") == 0 && ntok >= 8) {
        int state = c_atoi(tokens[1]);
        int x = c_atoi(tokens[2]);
        int y = c_atoi(tokens[3]);
        int prev_x = c_atoi(tokens[4]);
        int prev_y = c_atoi(tokens[5]);
        uint32_t color = c_parse_u32(tokens[6]);
        int is_eraser = c_atoi(tokens[7]);

        // Request shared active layer and texture framebuffers from host environment
        wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
        if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;
        wframebuffer_t *tex_fb = (wframebuffer_t*)ask("brush:texture");

        if (state == 0) {
            // STROKE_START: initial dab
            stamp(fb, tex_fb, x, y, color, is_eraser);
        } else {
            // STROKE_MOVE: interpolate from previous point
            draw_line(fb, tex_fb, (float)prev_x, (float)prev_y, (float)x, (float)y, color, is_eraser);
        }
    }
}

/** Piolho frame update hook */
int32_t update(void) { return UPDATE_OK; }

