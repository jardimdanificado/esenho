/**
 * =========================================================================
 * Calligraphy Brush Plugin (plugins/brushes/calligraphy/main.c)
 * Angled flat chisel/ribbon brush with directional line width variation.
 * =========================================================================
 */

#include "wesenho.h"

// --- Calligraphy Brush Parameters ---
static int size = 14;   // Chisel nib span length in pixels
static int angle = 45;  // Nib slant angle in degrees (45-degree rotated axis)
static int aspect = 20; // Chisel thickness ratio (1..100%)

// --- Texture Modulation Parameters ---
static int tex_mode = 1;       // 0 = Off, 1 = Grain/Luminance mask, 2 = RGB Pattern
static int tex_scale = 100;    // Texture UV scale percentage
static int tex_strength = 100; // Texture modulation strength (0..100%)

/**
 * Fast square root approximation for continuous stroke interpolation.
 */
static inline float fast_sqrt(float val) {
    if (val <= 0.0f) return 0.0f;
    float x = val;
    for (int i = 0; i < 6; i++) x = 0.5f * (x + val / x);
    return x;
}

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
 * Renders an angled flat chisel ribbon stamp at (x, y).
 * Uses rotated coordinate system (u = dx + dy, v = dy - dx) for high-performance 45-degree ribbon projection.
 */
static void stamp_ribbon(wframebuffer_t *fb, wframebuffer_t *tex_fb, int x, int y, uint32_t color, int is_eraser) {
    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    int r = size * 2 + 2;
    int thick = (size * aspect) / 100 + 1;

    for (int dy = -r; dy <= r; dy++) {
        int py = y + dy;
        if (py < 0 || py >= height) continue;
        for (int dx = -r; dx <= r; dx++) {
            int px = x + dx;
            if (px < 0 || px >= width) continue;

            // Project coordinate to rotated 45-degree chisel coordinate space
            int u = dx + dy;
            int v = dy - dx;
            if (u < 0) u = -u;
            if (v < 0) v = -v;

            // Check if within chisel ribbon bounds
            if (u <= r && v <= thick * 2) {
                if (is_eraser) {
                    pixels[py * width + px] = 0x00000000;
                } else {
                    uint32_t col = color;
                    if (tex_fb && tex_fb->width > 0 && tex_mode > 0 && tex_strength > 0) {
                        uint32_t t_col = sample_texture(tex_fb, px, py);
                        uint32_t tr = t_col & 0xFF, tg = (t_col >> 8) & 0xFF, tb = (t_col >> 16) & 0xFF;
                        if (tex_mode == 1) {
                            uint32_t lum = (tr * 77 + tg * 150 + tb * 29) >> 8;
                            uint32_t a = (color >> 24) & 0xFF;
                            uint32_t mod_a = (a * (lum * tex_strength + 255 * (100 - tex_strength))) / 25500;
                            col = (mod_a << 24) | (color & 0x00FFFFFF);
                        } else if (tex_mode == 2) {
                            uint32_t cr = color & 0xFF, cg = (color >> 8) & 0xFF, cb = (color >> 16) & 0xFF;
                            col = (color & 0xFF000000) | (((cb * tb) / 255) << 16) | (((cg * tg) / 255) << 8) | ((cr * tr) / 255);
                        }
                    }
                    pixels[py * width + px] = col;
                }
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
        if (c_strcasecmp(param, "size") == 0) { size = val < 1 ? 1 : val; }
        else if (c_strcasecmp(param, "angle") == 0) { angle = val; }
        else if (c_strcasecmp(param, "roundness") == 0 || c_strcasecmp(param, "aspect") == 0) { aspect = val; }
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
            stamp_ribbon(fb, tex_fb, x, y, color, is_eraser);
        } else {
            float dx = (float)(x - prev_x);
            float dy = (float)(y - prev_y);
            float dist = fast_sqrt(dx * dx + dy * dy);
            int steps = (int)(dist / 1.5f);
            if (steps < 1) steps = 1;
            for (int i = 0; i <= steps; i++) {
                float t = (float)i / (float)steps;
                int cx = (int)((float)prev_x + dx * t + 0.5f);
                int cy = (int)((float)prev_y + dy * t + 0.5f);
                stamp_ribbon(fb, tex_fb, cx, cy, color, is_eraser);
            }
        }
    }
}

/** Piolho frame update hook */
int32_t update(void) { return UPDATE_OK; }

