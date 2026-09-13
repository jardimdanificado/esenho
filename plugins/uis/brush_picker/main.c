#include "../../../include/wesenho.h"
#include "../../../include/font5x7.h"

#define PANEL_WIDTH  160
#define PANEL_HEIGHT 255

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[PANEL_WIDTH * PANEL_HEIGHT];

static int selected_brush = BRUSH_HARD_ROUND;
static int brush_size = 6;
static int brush_hardness = 80;
static int brush_opacity = 100;
static int brush_spacing = 15;
static uint32_t current_color = 0xFF000000;

static int prev_left_btn = 0;

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= PANEL_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= PANEL_WIDTH) continue;
            pixels[j * PANEL_WIDTH + i] = color;
        }
    }
}

static void draw_frame_border(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < PANEL_HEIGHT) pixels[y * PANEL_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < PANEL_HEIGHT) pixels[(y + h - 1) * PANEL_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < PANEL_WIDTH) pixels[j * PANEL_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < PANEL_WIDTH) pixels[j * PANEL_WIDTH + (x + w - 1)] = color;
    }
}

static inline float fast_sqrt(float val) {
    if (val <= 0.0f) return 0.0f;
    float x = val;
    for (int i = 0; i < 6; i++) {
        x = 0.5f * (x + val / x);
    }
    return x;
}

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    if (sa == 255) return (src & 0x00FFFFFF) | 0xFF000000;

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

static void send_brush_config(void) {
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    
    // Send Brush Type
    msg->type = MSG_SET_BRUSH_TYPE;
    msg->param1 = selected_brush;
    msg->param2 = 0;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));

    // Send Brush Size
    msg->type = MSG_SET_BRUSH_SIZE;
    msg->param1 = brush_size;
    msg->param2 = 0;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));

    // Send Brush Params
    msg->type = MSG_SET_BRUSH_PARAMS;
    msg->param1 = brush_hardness;
    msg->param2 = brush_opacity;
    msg->param3 = brush_spacing;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static void render_preview_stroke(int bx, int by, int bw, int bh) {
    // Checkerboard inside preview box
    for (int j = 0; j < bh; j++) {
        for (int i = 0; i < bw; i++) {
            int check = ((i / 8) + (j / 8)) & 1;
            pixels[(by + j) * PANEL_WIDTH + (bx + i)] = check ? 0xFF353535 : 0xFF282828;
        }
    }

    // Render S-curve stroke preview
    int cy = by + bh / 2;
    int prev_sx = -1, prev_sy = -1;
    
    for (int t_i = 10; t_i < bw - 10; t_i += 2) {
        float rel = (float)(t_i - 10) / (float)(bw - 20);
        // Simple sine wave preview curve
        float angle = rel * 6.28318f;
        int sx = bx + t_i;
        int sy = cy + (int)(10.0f * (angle < 3.14159f ? (angle - 1.57f) : (4.71f - angle)) / 1.57f);
        if (sy < by + 4) sy = by + 4;
        if (sy > by + bh - 5) sy = by + bh - 5;

        // Stamp in preview
        if (selected_brush == BRUSH_PIXEL) {
            int sz = brush_size < 1 ? 1 : brush_size;
            int half = sz / 2;
            for (int dy = 0; dy < sz; dy++) {
                int py = sy + dy - half;
                if (py < by || py >= by + bh) continue;
                for (int dx = 0; dx < sz; dx++) {
                    int px = sx + dx - half;
                    if (px < bx || px >= bx + bw) continue;
                    pixels[py * PANEL_WIDTH + px] = current_color;
                }
            }
        } else if (selected_brush == BRUSH_HARD_ROUND) {
            int r = brush_size;
            int r2 = r * r;
            uint8_t op = (uint8_t)((brush_opacity * 255) / 100);
            for (int dy = -r; dy <= r; dy++) {
                int py = sy + dy;
                if (py < by || py >= by + bh) continue;
                for (int dx = -r; dx <= r; dx++) {
                    int px = sx + dx;
                    if (px < bx || px >= bx + bw) continue;
                    if (dx * dx + dy * dy <= r2) {
                        pixels[py * PANEL_WIDTH + px] = blend_pixel(pixels[py * PANEL_WIDTH + px], current_color, op);
                    }
                }
            }
        } else if (selected_brush == BRUSH_SOFT_AIRBRUSH) {
            int r = (brush_size * 3) / 2 + 2;
            float r_f = (float)r;
            float hard_factor = ((float)brush_hardness / 100.0f) * 0.7f + 0.3f;
            float base_alpha = ((float)brush_opacity / 100.0f) * hard_factor * 0.35f;
            for (int dy = -r; dy <= r; dy++) {
                int py = sy + dy;
                if (py < by || py >= by + bh) continue;
                for (int dx = -r; dx <= r; dx++) {
                    int px = sx + dx;
                    if (px < bx || px >= bx + bw) continue;
                    float d = fast_sqrt((float)(dx * dx + dy * dy));
                    if (d <= r_f) {
                        float t = d / r_f;
                        float falloff = (1.0f - t) * (1.0f - t);
                        int stamp_a = (int)(255.0f * falloff * base_alpha);
                        if (stamp_a > 255) stamp_a = 255;
                        if (stamp_a > 0) {
                            pixels[py * PANEL_WIDTH + px] = blend_pixel(pixels[py * PANEL_WIDTH + px], current_color, (uint8_t)stamp_a);
                        }
                    }
                }
            }
        } else if (selected_brush == BRUSH_CHISEL) {
            int r = brush_size * 2 + 2;
            int thick = (brush_size / 3) + 1;
            uint8_t op = (uint8_t)((brush_opacity * 255) / 100);
            for (int dy = -r; dy <= r; dy++) {
                int py = sy + dy;
                if (py < by || py >= by + bh) continue;
                for (int dx = -r; dx <= r; dx++) {
                    int px = sx + dx;
                    if (px < bx || px >= bx + bw) continue;
                    int u = dx + dy;
                    int v = dy - dx;
                    if (u < 0) u = -u;
                    if (v < 0) v = -v;
                    if (u <= r && v <= thick * 2) {
                        pixels[py * PANEL_WIDTH + px] = blend_pixel(pixels[py * PANEL_WIDTH + px], current_color, op);
                    }
                }
            }
        } else if (selected_brush == BRUSH_SCATTER) {
            int r = brush_size * 2 + 4;
            int count = brush_size * 2 + 4;
            uint8_t op = (uint8_t)((brush_opacity * 200) / 100);
            static uint32_t pr_seed = 0x87654321;
            for (int i = 0; i < count; i++) {
                pr_seed ^= (pr_seed << 13);
                pr_seed ^= (pr_seed >> 17);
                pr_seed ^= (pr_seed << 5);
                int rx = ((int)(pr_seed % (2 * r + 1))) - r;
                pr_seed ^= (pr_seed << 13);
                pr_seed ^= (pr_seed >> 17);
                pr_seed ^= (pr_seed << 5);
                int ry = ((int)(pr_seed % (2 * r + 1))) - r;
                if (rx * rx + ry * ry <= r * r) {
                    int px = sx + rx;
                    int py = sy + ry;
                    if (px >= bx && px < bx + bw && py >= by && py < by + bh) {
                        pixels[py * PANEL_WIDTH + px] = blend_pixel(pixels[py * PANEL_WIDTH + px], current_color, op);
                    }
                }
            }
        }
    }

    draw_frame_border(bx, by, bw, bh, 0xFF555555);
}

static void render_panel(void) {
    draw_rect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 0xFF1F1F1F);
    draw_frame_border(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 0xFF3D3D3D);

    // Title Bar
    draw_rect(0, 0, PANEL_WIDTH, 18, 0xFF2A2A2A);
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 8, 5, "PINCEIS & DINAMICA", 0xFFD0D0D0);

    // Brush Selection Buttons (Grid 2 columns or stacked)
    // Row 1: Redondo | Macio
    draw_rect(8, 24, 68, 18, (selected_brush == BRUSH_HARD_ROUND) ? 0xFF3A4E3A : 0xFF282828);
    draw_frame_border(8, 24, 68, 18, (selected_brush == BRUSH_HARD_ROUND) ? 0xFF44FF44 : 0xFF404040);
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 14, 29, "Redondo", 0xFFFFFFFF);

    draw_rect(82, 24, 70, 18, (selected_brush == BRUSH_SOFT_AIRBRUSH) ? 0xFF3A4E3A : 0xFF282828);
    draw_frame_border(82, 24, 70, 18, (selected_brush == BRUSH_SOFT_AIRBRUSH) ? 0xFF44FF44 : 0xFF404040);
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 94, 29, "Macio", 0xFFFFFFFF);

    // Row 2: Pixel | Chanfrado
    draw_rect(8, 46, 68, 18, (selected_brush == BRUSH_PIXEL) ? 0xFF3A4E3A : 0xFF282828);
    draw_frame_border(8, 46, 68, 18, (selected_brush == BRUSH_PIXEL) ? 0xFF44FF44 : 0xFF404040);
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 22, 51, "Pixel", 0xFFFFFFFF);

    draw_rect(82, 46, 70, 18, (selected_brush == BRUSH_CHISEL) ? 0xFF3A4E3A : 0xFF282828);
    draw_frame_border(82, 46, 70, 18, (selected_brush == BRUSH_CHISEL) ? 0xFF44FF44 : 0xFF404040);
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 86, 51, "Chanfrad", 0xFFFFFFFF);

    // Row 3: Spray (Full width)
    draw_rect(8, 68, 144, 18, (selected_brush == BRUSH_SCATTER) ? 0xFF3A4E3A : 0xFF282828);
    draw_frame_border(8, 68, 144, 18, (selected_brush == BRUSH_SCATTER) ? 0xFF44FF44 : 0xFF404040);
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 54, 73, "Spray / Noise", 0xFFFFFFFF);

    // Sliders
    const int sx = 10;
    const int sw = 140;

    // 1. Tamanho (Size: 1..50)
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 10, 94, "Tamanho", 0xFFAAAAAA);
    draw_rect(sx, 106, sw, 10, 0xFF141414);
    int sz_fill = (brush_size * sw) / 50;
    if (sz_fill > sw) sz_fill = sw;
    draw_rect(sx, 106, sz_fill, 10, 0xFF3F82C6);
    draw_frame_border(sx, 106, sw, 10, 0xFF555555);

    // 2. Dureza (Hardness: 0..100)
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 10, 122, "Dureza", 0xFFAAAAAA);
    draw_rect(sx, 134, sw, 10, 0xFF141414);
    int hd_fill = (brush_hardness * sw) / 100;
    if (hd_fill > sw) hd_fill = sw;
    draw_rect(sx, 134, hd_fill, 10, 0xFFC65A3F);
    draw_frame_border(sx, 134, sw, 10, 0xFF555555);

    // 3. Opacidade (Opacity: 1..100)
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 10, 150, "Opacidade", 0xFFAAAAAA);
    draw_rect(sx, 162, sw, 10, 0xFF141414);
    int op_fill = (brush_opacity * sw) / 100;
    if (op_fill > sw) op_fill = sw;
    draw_rect(sx, 162, op_fill, 10, 0xFF3FC682);
    draw_frame_border(sx, 162, sw, 10, 0xFF555555);

    // Live Preview Header & Box
    draw_string(pixels, PANEL_WIDTH, PANEL_HEIGHT, 10, 180, "PREVIA DO TRACO", 0xFF888888);
    render_preview_stroke(10, 194, 140, 50);
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    if (msg->type == MSG_SET_COLOR) {
        current_color = msg->param1;
    } else if (msg->type == MSG_SET_BRUSH_SIZE) {
        brush_size = (int)msg->param1;
        if (brush_size < 1) brush_size = 1;
        if (brush_size > 50) brush_size = 50;
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = PANEL_WIDTH;
            fb->height = PANEL_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down) {
            // Check button clicks
            if (!prev_left_btn) {
                if (my >= 24 && my <= 42) {
                    if (mx >= 8 && mx <= 76) { selected_brush = BRUSH_HARD_ROUND; send_brush_config(); }
                    else if (mx >= 82 && mx <= 152) { selected_brush = BRUSH_SOFT_AIRBRUSH; send_brush_config(); }
                } else if (my >= 46 && my <= 64) {
                    if (mx >= 8 && mx <= 76) { selected_brush = BRUSH_PIXEL; send_brush_config(); }
                    else if (mx >= 82 && mx <= 152) { selected_brush = BRUSH_CHISEL; send_brush_config(); }
                } else if (my >= 68 && my <= 86) {
                    if (mx >= 8 && mx <= 152) { selected_brush = BRUSH_SCATTER; send_brush_config(); }
                }
            }

            // Check Sliders
            const int sx = 10;
            const int sw = 140;
            int rel_x = mx - sx;
            if (rel_x < 0) rel_x = 0;
            if (rel_x > sw) rel_x = sw;

            if (my >= 102 && my <= 118) {
                brush_size = (rel_x * 49) / sw + 1;
                send_brush_config();
            } else if (my >= 130 && my <= 146) {
                brush_hardness = (rel_x * 100) / sw;
                send_brush_config();
            } else if (my >= 158 && my <= 174) {
                brush_opacity = (rel_x * 99) / sw + 1;
                send_brush_config();
            }
        }
        prev_left_btn = left_down;
    }

    render_panel();
    return UPDATE_OK;
}
