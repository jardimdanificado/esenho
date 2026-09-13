#include "../../include/wesenho.h"

#define CANVAS_WIDTH  800
#define CANVAS_HEIGHT 1000

typedef struct {
    uint32_t pixels[CANVAS_WIDTH * CANVAS_HEIGHT];
    uint8_t  visible;
    uint8_t  opacity; // 0..255
} layer_t;

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t out_pixels[CANVAS_WIDTH * CANVAS_HEIGHT];
static layer_t  layers[MAX_LAYERS];
static int      layer_count = 1;
static int      active_layer = 0;

static int32_t last_mx = -1;
static int32_t last_my = -1;
static uint32_t current_color = 0xFFFFFFFF; /* White */
static int brush_size = 4;
static int current_tool = TOOL_BRUSH;

/* Fast Alpha blending: blend Src over Dst with alpha */
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

static void draw_point(int x, int y, uint32_t color, int radius) {
    if (active_layer < 0 || active_layer >= layer_count) return;
    layer_t *lay = &layers[active_layer];

    for (int dy = -radius; dy <= radius; dy++) {
        int py = y + dy;
        if (py < 0 || py >= CANVAS_HEIGHT) continue;
        for (int dx = -radius; dx <= radius; dx++) {
            int px = x + dx;
            if (px < 0 || px >= CANVAS_WIDTH) continue;
            if (dx*dx + dy*dy <= radius*radius) {
                if (current_tool == TOOL_ERASER) {
                    lay->pixels[py * CANVAS_WIDTH + px] = 0x00000000; // Transparent
                } else {
                    lay->pixels[py * CANVAS_WIDTH + px] = color;
                }
            }
        }
    }
}

static void draw_line(int x0, int y0, int x1, int y1, uint32_t color, int radius) {
    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        draw_point(x0, y0, color, radius);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
}

static void clear_layer(int l_idx, uint32_t color) {
    if (l_idx < 0 || l_idx >= layer_count) return;
    for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
        layers[l_idx].pixels[i] = color;
    }
}

static void composite_layers(void) {
    /* Base background: dark grey / subtle checkerboard pattern */
    for (int y = 0; y < CANVAS_HEIGHT; y++) {
        for (int x = 0; x < CANVAS_WIDTH; x++) {
            int check = ((x / 16) + (y / 16)) & 1;
            uint32_t bg = check ? 0xFF2A2A2A : 0xFF222222;
            out_pixels[y * CANVAS_WIDTH + x] = bg;
        }
    }

    /* Composite each visible layer from bottom (0) to top */
    for (int l = 0; l < layer_count; l++) {
        if (!layers[l].visible) continue;
        uint8_t op = layers[l].opacity;
        if (op == 0) continue;

        for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
            uint32_t src = layers[l].pixels[i];
            if ((src & 0xFF000000) == 0) continue; // fully transparent
            out_pixels[i] = blend_pixel(out_pixels[i], src, op);
        }
    }
}

/* Receives Piolho messages */
void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    switch (msg->type) {
        case MSG_SET_COLOR:
            current_color = msg->param1;
            break;
        case MSG_SET_BRUSH_SIZE:
            brush_size = (int)msg->param1;
            break;
        case MSG_SET_TOOL:
            current_tool = (int)msg->param1;
            break;
        case MSG_EFFECT_INVERT:
            if (active_layer >= 0 && active_layer < layer_count) {
                layer_t *lay = &layers[active_layer];
                for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
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
                for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
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
            clear_layer(active_layer, 0x00000000);
            break;
        case MSG_LAYER_ADD:
            if (layer_count < MAX_LAYERS) {
                layers[layer_count].visible = 1;
                layers[layer_count].opacity = 255;
                clear_layer(layer_count, 0x00000000);
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
                layers[(int)msg->param1].opacity = (uint8_t)msg->param2;
            }
            break;
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
        /* Init layer 0 as white opaque background, or transparent */
        layers[0].visible = 1;
        layers[0].opacity = 255;
        clear_layer(0, 0xFFFFFFFF); // Layer 0 = solid white background by default
        layer_count = 1;
        active_layer = 0;
    }

    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;

        /* Wheel no canvas ajusta tamanho */
        if (mouse->wheel_y > 0 && brush_size < 48) brush_size++;
        if (mouse->wheel_y < 0 && brush_size > 1) brush_size--;

        if (mx >= 0 && mx < CANVAS_WIDTH && my >= 0 && my < CANVAS_HEIGHT) {
            int draw_btn = (mouse->buttons & WMOUSE_BTN_LEFT);
            int erase_btn = (mouse->buttons & WMOUSE_BTN_RIGHT);

            if (draw_btn) {
                uint32_t col = (current_tool == TOOL_ERASER) ? 0x00000000 : current_color;
                int sz = (current_tool == TOOL_ERASER) ? (brush_size * 2) : brush_size;

                if (last_mx >= 0 && last_my >= 0) {
                    draw_line(last_mx, last_my, mx, my, col, sz);
                } else {
                    draw_point(mx, my, col, sz);
                }
                last_mx = mx;
                last_my = my;
            } else if (erase_btn) {
                if (last_mx >= 0 && last_my >= 0) {
                    draw_line(last_mx, last_my, mx, my, 0x00000000, brush_size * 2);
                } else {
                    draw_point(mx, my, 0x00000000, brush_size * 2);
                }
                last_mx = mx;
                last_my = my;
            } else {
                last_mx = -1;
                last_my = -1;
            }
        } else {
            last_mx = -1;
            last_my = -1;
        }
    }

    composite_layers();
    return UPDATE_OK;
}
