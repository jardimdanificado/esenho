#include "../../include/wesenho.h"

#define CANVAS_WIDTH  640
#define CANVAS_HEIGHT 480

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;
static wkeyboard_t    *kb = 0;

static uint32_t pixels[CANVAS_WIDTH * CANVAS_HEIGHT];
static int32_t last_mx = -1;
static int32_t last_my = -1;
static uint32_t current_color = 0xFFFFFFFF; /* White RGBA */
static int brush_size = 4;

static void draw_point(int x, int y, uint32_t color, int radius) {
    for (int dy = -radius; dy <= radius; dy++) {
        int py = y + dy;
        if (py < 0 || py >= CANVAS_HEIGHT) continue;
        for (int dx = -radius; dx <= radius; dx++) {
            int px = x + dx;
            if (px < 0 || px >= CANVAS_WIDTH) continue;
            if (dx*dx + dy*dy <= radius*radius) {
                pixels[py * CANVAS_WIDTH + px] = color;
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

static void clear_canvas(uint32_t color) {
    for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
        pixels[i] = color;
    }
}

/* Receives Piolho messages */
void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    if (msg->type == MSG_EFFECT_INVERT) {
        for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
            uint32_t p = pixels[i];
            uint8_t r = 255 - (p & 0xFF);
            uint8_t g = 255 - ((p >> 8) & 0xFF);
            uint8_t b = 255 - ((p >> 16) & 0xFF);
            uint8_t a = (p >> 24) & 0xFF;
            pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
        }
    } else if (msg->type == MSG_EFFECT_GRAYSCALE) {
        for (int i = 0; i < CANVAS_WIDTH * CANVAS_HEIGHT; i++) {
            uint32_t p = pixels[i];
            uint8_t r = p & 0xFF;
            uint8_t g = (p >> 8) & 0xFF;
            uint8_t b = (p >> 16) & 0xFF;
            uint8_t a = (p >> 24) & 0xFF;
            uint8_t gray = (uint8_t)((r * 299 + g * 587 + b * 114) / 1000);
            pixels[i] = (a << 24) | (gray << 16) | (gray << 8) | gray;
        }
    } else if (msg->type == MSG_EFFECT_CLEAR) {
        clear_canvas(msg->color);
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = CANVAS_WIDTH;
            fb->height = CANVAS_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
        clear_canvas(0xFF1E1E1E); /* Dark canvas background */
    }

    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");
    if (!kb)    kb = (wkeyboard_t*)ask("std:keyboard");

    /* Keyboard shortcuts */
    if (kb) {
        /* Key 1: Red */
        if (kb->keys[0x1E]) current_color = 0xFF0000FF;
        /* Key 2: Green */
        if (kb->keys[0x1F]) current_color = 0xFF00FF00;
        /* Key 3: Blue */
        if (kb->keys[0x20]) current_color = 0xFFFF0000;
        /* Key 4: Yellow */
        if (kb->keys[0x21]) current_color = 0xFF00FFFF;
        /* Key 5: White */
        if (kb->keys[0x22]) current_color = 0xFFFFFFFF;
        /* Key C: Clear canvas */
        if (kb->keys[0x06]) clear_canvas(0xFF1E1E1E);
    }

    /* Mouse drawing */
    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;

        /* Adjust brush size with wheel */
        if (mouse->wheel_y > 0 && brush_size < 32) brush_size++;
        if (mouse->wheel_y < 0 && brush_size > 1) brush_size--;

        if (mouse->buttons & WMOUSE_BTN_LEFT) {
            /* Draw stroke */
            if (last_mx >= 0 && last_my >= 0) {
                draw_line(last_mx, last_my, mx, my, current_color, brush_size);
            } else {
                draw_point(mx, my, current_color, brush_size);
            }
            last_mx = mx;
            last_my = my;
        } else if (mouse->buttons & WMOUSE_BTN_RIGHT) {
            /* Eraser */
            if (last_mx >= 0 && last_my >= 0) {
                draw_line(last_mx, last_my, mx, my, 0xFF1E1E1E, brush_size * 2);
            } else {
                draw_point(mx, my, 0xFF1E1E1E, brush_size * 2);
            }
            last_mx = mx;
            last_my = my;
        } else {
            last_mx = -1;
            last_my = -1;
        }
    }

    return UPDATE_OK;
}
