#include "../../include/wesenho.h"

#define CANVAS_WIDTH  800
#define CANVAS_HEIGHT 1000
#define DOC_PIXELS    (CANVAS_WIDTH * CANVAS_HEIGHT)

typedef struct {
    uint32_t pixels[DOC_PIXELS];
    uint8_t  visible;
    uint8_t  opacity;
} layer_t;

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t out_pixels[DOC_PIXELS];
static layer_t  layers[MAX_LAYERS];
static int      layer_count = 1;
static int      active_layer = 0;

static int32_t last_mx = -1;
static int32_t last_my = -1;
static uint32_t current_color = 0xFF000000; // Black
static int brush_size = 4;
static int brush_type = BRUSH_HARD_ROUND;
static int brush_hardness = 80;
static int brush_opacity = 100;
static int brush_spacing = 15;
static int current_tool = TOOL_BRUSH;

static uint32_t rng_state = 0x12345678;

static inline uint32_t next_random(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
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

static void stamp_brush(int x, int y, uint32_t color, int is_eraser) {
    if (active_layer < 0 || active_layer >= layer_count) return;
    layer_t *lay = &layers[active_layer];

    if (brush_type == BRUSH_PIXEL) {
        int sz = brush_size < 1 ? 1 : brush_size;
        int half = sz / 2;
        for (int dy = 0; dy < sz; dy++) {
            int py = y + dy - half;
            if (py < 0 || py >= CANVAS_HEIGHT) continue;
            for (int dx = 0; dx < sz; dx++) {
                int px = x + dx - half;
                if (px < 0 || px >= CANVAS_WIDTH) continue;
                if (is_eraser) {
                    lay->pixels[py * CANVAS_WIDTH + px] = 0x00000000;
                } else {
                    lay->pixels[py * CANVAS_WIDTH + px] = color;
                }
            }
        }
        return;
    }

    if (brush_type == BRUSH_HARD_ROUND) {
        int r = brush_size;
        int r2 = r * r;
        uint8_t op = (uint8_t)((brush_opacity * 255) / 100);

        for (int dy = -r; dy <= r; dy++) {
            int py = y + dy;
            if (py < 0 || py >= CANVAS_HEIGHT) continue;
            for (int dx = -r; dx <= r; dx++) {
                int px = x + dx;
                if (px < 0 || px >= CANVAS_WIDTH) continue;
                if (dx * dx + dy * dy <= r2) {
                    if (is_eraser) {
                        lay->pixels[py * CANVAS_WIDTH + px] = 0x00000000;
                    } else {
                        if (op == 255) {
                            lay->pixels[py * CANVAS_WIDTH + px] = color;
                        } else {
                            lay->pixels[py * CANVAS_WIDTH + px] = blend_pixel(lay->pixels[py * CANVAS_WIDTH + px], color, op);
                        }
                    }
                }
            }
        }
        return;
    }

    if (brush_type == BRUSH_SOFT_AIRBRUSH) {
        int r = (brush_size * 3) / 2 + 2;
        float r_f = (float)r;
        float hard_factor = ((float)brush_hardness / 100.0f) * 0.7f + 0.3f;
        float base_alpha = ((float)brush_opacity / 100.0f) * hard_factor * 0.35f;

        for (int dy = -r; dy <= r; dy++) {
            int py = y + dy;
            if (py < 0 || py >= CANVAS_HEIGHT) continue;
            for (int dx = -r; dx <= r; dx++) {
                int px = x + dx;
                if (px < 0 || px >= CANVAS_WIDTH) continue;
                float d = fast_sqrt((float)(dx * dx + dy * dy));
                if (d <= r_f) {
                    float t = d / r_f;
                    float falloff = (1.0f - t) * (1.0f - t);
                    int stamp_a = (int)(255.0f * falloff * base_alpha);
                    if (stamp_a > 255) stamp_a = 255;
                    if (stamp_a <= 0) continue;

                    if (is_eraser) {
                        uint32_t p = lay->pixels[py * CANVAS_WIDTH + px];
                        uint32_t da = (p >> 24) & 0xFF;
                        if (da > 0) {
                            uint32_t new_a = (da * (255 - stamp_a)) / 255;
                            lay->pixels[py * CANVAS_WIDTH + px] = (new_a << 24) | (p & 0x00FFFFFF);
                        }
                    } else {
                        lay->pixels[py * CANVAS_WIDTH + px] = blend_pixel(lay->pixels[py * CANVAS_WIDTH + px], color, (uint8_t)stamp_a);
                    }
                }
            }
        }
        return;
    }

    if (brush_type == BRUSH_CHISEL) {
        int r = brush_size * 2 + 2;
        int thick = (brush_size / 3) + 1;
        uint8_t op = (uint8_t)((brush_opacity * 255) / 100);

        for (int dy = -r; dy <= r; dy++) {
            int py = y + dy;
            if (py < 0 || py >= CANVAS_HEIGHT) continue;
            for (int dx = -r; dx <= r; dx++) {
                int px = x + dx;
                if (px < 0 || px >= CANVAS_WIDTH) continue;

                // Rotated 45 deg coordinates
                int u = dx + dy;
                int v = dy - dx;
                if (u < 0) u = -u;
                if (v < 0) v = -v;

                if (u <= r && v <= thick * 2) {
                    if (is_eraser) {
                        lay->pixels[py * CANVAS_WIDTH + px] = 0x00000000;
                    } else {
                        lay->pixels[py * CANVAS_WIDTH + px] = blend_pixel(lay->pixels[py * CANVAS_WIDTH + px], color, op);
                    }
                }
            }
        }
        return;
    }

    if (brush_type == BRUSH_SCATTER) {
        int r = brush_size * 2 + 4;
        int count = brush_size * 5 + 10;
        uint8_t op = (uint8_t)((brush_opacity * 200) / 100);

        for (int i = 0; i < count; i++) {
            int rx = ((int)(next_random() % (2 * r + 1))) - r;
            int ry = ((int)(next_random() % (2 * r + 1))) - r;
            if (rx * rx + ry * ry <= r * r) {
                int px = x + rx;
                int py = y + ry;
                if (px >= 0 && px < CANVAS_WIDTH && py >= 0 && py < CANVAS_HEIGHT) {
                    if (is_eraser) {
                        lay->pixels[py * CANVAS_WIDTH + px] = 0x00000000;
                    } else {
                        lay->pixels[py * CANVAS_WIDTH + px] = blend_pixel(lay->pixels[py * CANVAS_WIDTH + px], color, op);
                    }
                }
            }
        }
        return;
    }
}

static void draw_stroke(int x0, int y0, int x1, int y1, uint32_t color, int is_eraser) {
    float dx = (float)(x1 - x0);
    float dy = (float)(y1 - y0);
    float dist = fast_sqrt(dx * dx + dy * dy);

    float step_size = (float)brush_size * ((float)brush_spacing / 100.0f);
    if (step_size < 1.0f) step_size = 1.0f;
    if (brush_type == BRUSH_PIXEL) step_size = 1.0f;

    int steps = (int)(dist / step_size);
    if (steps < 1) steps = 1;

    for (int i = 0; i <= steps; i++) {
        float t = (float)i / (float)steps;
        int cur_x = (int)((float)x0 + dx * t + 0.5f);
        int cur_y = (int)((float)y0 + dy * t + 0.5f);
        stamp_brush(cur_x, cur_y, color, is_eraser);
    }
}

static void clear_layer(layer_t *lay) {
    for (int i = 0; i < DOC_PIXELS; i++) {
        lay->pixels[i] = 0x00000000; // Always 100% transparent empty
    }
}

static void composite_canvas(void) {
    // Checkerboard pattern for transparency indication
    for (int y = 0; y < CANVAS_HEIGHT; y++) {
        for (int x = 0; x < CANVAS_WIDTH; x++) {
            int check = ((x / 16) + (y / 16)) & 1;
            uint32_t bg = check ? 0xFF2A2A2A : 0xFF222222;
            out_pixels[y * CANVAS_WIDTH + x] = bg;
        }
    }

    for (int l = 0; l < layer_count; l++) {
        if (!layers[l].visible) continue;
        uint8_t op = layers[l].opacity;
        if (op == 0) continue;

        for (int i = 0; i < DOC_PIXELS; i++) {
            uint32_t src = layers[l].pixels[i];
            if ((src & 0xFF000000) == 0) continue;
            out_pixels[i] = blend_pixel(out_pixels[i], src, op);
        }
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    switch (msg->type) {
        case MSG_SET_COLOR:
            current_color = msg->param1;
            break;
        case MSG_SET_BRUSH_SIZE:
            brush_size = (int)msg->param1;
            if (brush_size < 1) brush_size = 1;
            if (brush_size > 100) brush_size = 100;
            break;
        case MSG_SET_BRUSH_TYPE:
            brush_type = (int)msg->param1;
            break;
        case MSG_SET_BRUSH_PARAMS:
            brush_hardness = (int)msg->param1;
            brush_opacity = (int)msg->param2;
            brush_spacing = (int)msg->param3;
            if (brush_hardness < 0) brush_hardness = 0;
            if (brush_hardness > 100) brush_hardness = 100;
            if (brush_opacity < 1) brush_opacity = 1;
            if (brush_opacity > 100) brush_opacity = 100;
            if (brush_spacing < 1) brush_spacing = 1;
            if (brush_spacing > 100) brush_spacing = 100;
            break;
        case MSG_SET_TOOL:
            current_tool = (int)msg->param1;
            break;
        case MSG_EFFECT_INVERT:
            if (active_layer >= 0 && active_layer < layer_count) {
                layer_t *lay = &layers[active_layer];
                for (int i = 0; i < DOC_PIXELS; i++) {
                    uint32_t p = lay->pixels[i];
                    if ((p & 0xFF000000) == 0) continue;
                    uint8_t r = 255 - (p & 0xFF);
                    uint8_t g = 255 - ((p >> 8) & 0xFF);
                    uint8_t b = 255 - ((p >> 16) & 0xFF);
                    uint8_t a = (p >> 24) & 0xFF;
                    lay->pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
                }
            }
            break;
        case MSG_EFFECT_GRAYSCALE:
            if (active_layer >= 0 && active_layer < layer_count) {
                layer_t *lay = &layers[active_layer];
                for (int i = 0; i < DOC_PIXELS; i++) {
                    uint32_t p = lay->pixels[i];
                    if ((p & 0xFF000000) == 0) continue;
                    uint8_t r = p & 0xFF;
                    uint8_t g = (p >> 8) & 0xFF;
                    uint8_t b = (p >> 16) & 0xFF;
                    uint8_t a = (p >> 24) & 0xFF;
                    uint8_t gray = (uint8_t)((r * 299 + g * 587 + b * 114) / 1000);
                    lay->pixels[i] = (a << 24) | (gray << 16) | (gray << 8) | gray;
                }
            }
            break;
        case MSG_EFFECT_CLEAR:
            if (active_layer >= 0 && active_layer < layer_count) {
                clear_layer(&layers[active_layer]);
            }
            break;
        case MSG_LAYER_ADD:
            if (layer_count < MAX_LAYERS) {
                layers[layer_count].visible = 1;
                layers[layer_count].opacity = 255;
                clear_layer(&layers[layer_count]);
                active_layer = layer_count;
                layer_count++;
            }
            break;
        case MSG_LAYER_SELECT:
            if ((int)msg->param1 >= 0 && (int)msg->param1 < layer_count) {
                active_layer = (int)msg->param1;
            }
            break;
        case MSG_LAYER_TOGGLE_VIS:
            if ((int)msg->param1 >= 0 && (int)msg->param1 < layer_count) {
                layers[(int)msg->param1].visible = !layers[(int)msg->param1].visible;
            }
            break;
        case MSG_LAYER_SET_OPACITY:
            if ((int)msg->param1 >= 0 && (int)msg->param1 < layer_count) {
                int op = (int)msg->param2;
                if (op < 0) op = 0;
                if (op > 100) op = 100;
                layers[(int)msg->param1].opacity = (uint8_t)((op * 255) / 100);
            }
            break;
        case MSG_DRAW_LINE: {
            int x0 = (int16_t)(msg->param1 >> 16);
            int y0 = (int16_t)(msg->param1 & 0xFFFF);
            int x1 = (int16_t)(msg->param2 >> 16);
            int y1 = (int16_t)(msg->param2 & 0xFFFF);
            draw_stroke(x0, y0, x1, y1, current_color, 0);
            break;
        }
        case MSG_DRAW_RECT: {
            int rx = (int16_t)(msg->param1 >> 16);
            int ry = (int16_t)(msg->param1 & 0xFFFF);
            int rw = (int16_t)(msg->param2 >> 16);
            int rh = (int16_t)(msg->param2 & 0xFFFF);
            for (int dy = 0; dy < rh; dy++) {
                int py = ry + dy;
                if (py < 0 || py >= CANVAS_HEIGHT) continue;
                for (int dx = 0; dx < rw; dx++) {
                    int px = rx + dx;
                    if (px < 0 || px >= CANVAS_WIDTH) continue;
                    layers[active_layer].pixels[py * CANVAS_WIDTH + px] = current_color;
                }
            }
            break;
        }
        case MSG_DRAW_CIRCLE: {
            int cx = (int16_t)(msg->param1 >> 16);
            int cy = (int16_t)(msg->param1 & 0xFFFF);
            int cr = (int)msg->param2;
            int r2 = cr * cr;
            for (int dy = -cr; dy <= cr; dy++) {
                int py = cy + dy;
                if (py < 0 || py >= CANVAS_HEIGHT) continue;
                for (int dx = -cr; dx <= cr; dx++) {
                    int px = cx + dx;
                    if (px < 0 || px >= CANVAS_WIDTH) continue;
                    if (dx * dx + dy * dy <= r2) {
                        layers[active_layer].pixels[py * CANVAS_WIDTH + px] = current_color;
                    }
                }
            }
            break;
        }
        case MSG_DRAW_GRID: {
            int step = (int)msg->param1;
            if (step < 4) step = 4;
            for (int y = 0; y < CANVAS_HEIGHT; y += step) {
                for (int x = 0; x < CANVAS_WIDTH; x++) {
                    layers[active_layer].pixels[y * CANVAS_WIDTH + x] = current_color;
                }
            }
            for (int x = 0; x < CANVAS_WIDTH; x += step) {
                for (int y = 0; y < CANVAS_HEIGHT; y++) {
                    layers[active_layer].pixels[y * CANVAS_WIDTH + x] = current_color;
                }
            }
            break;
        }
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = CANVAS_WIDTH;
            fb->height = CANVAS_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)out_pixels;
        }
        layers[0].visible = 1;
        layers[0].opacity = 255;
        clear_layer(&layers[0]); // Layer 0 starts completely empty/transparent
        layer_count = 1;
        active_layer = 0;
    }

    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int draw_btn = (mouse->buttons & WMOUSE_BTN_LEFT);
        int erase_btn = (mouse->buttons & WMOUSE_BTN_RIGHT);

        if (draw_btn || erase_btn) {
            int is_eraser = (current_tool == TOOL_ERASER || erase_btn);
            uint32_t col = is_eraser ? 0x00000000 : current_color;

            if (last_mx != -1 && last_my != -1) {
                draw_stroke(last_mx, last_my, mx, my, col, is_eraser);
            } else {
                stamp_brush(mx, my, col, is_eraser);
            }
            last_mx = mx;
            last_my = my;
        } else {
            last_mx = -1;
            last_my = -1;
        }
    }

    composite_canvas();
    return UPDATE_OK;
}
