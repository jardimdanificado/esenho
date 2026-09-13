#include "../../include/wesenho.h"
#include "../../include/font5x7.h"

#define COLOR_HUD_WIDTH  150
#define COLOR_HUD_HEIGHT 140
#define MAX_HISTORY 8

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[COLOR_HUD_WIDTH * COLOR_HUD_HEIGHT];
static uint32_t current_color = 0xFF000000;
static uint32_t history[MAX_HISTORY] = {
    0xFF000000, 0xFFFFFFFF, 0xFFFF0055, 0xFF00FF88,
    0xFF00CCFF, 0xFFFFCC00, 0xFFAA00FF, 0xFF445566
};
static int history_count = 8;
static int prev_left_btn = 0;

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= COLOR_HUD_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= COLOR_HUD_WIDTH) continue;
            pixels[j * COLOR_HUD_WIDTH + i] = color;
        }
    }
}

static void draw_frame(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < COLOR_HUD_HEIGHT) pixels[y * COLOR_HUD_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < COLOR_HUD_HEIGHT) pixels[(y + h - 1) * COLOR_HUD_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < COLOR_HUD_WIDTH) pixels[j * COLOR_HUD_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < COLOR_HUD_WIDTH) pixels[j * COLOR_HUD_WIDTH + (x + w - 1)] = color;
    }
}

static void int_to_str(int val, char *buf) {
    if (val == 0) { buf[0] = '0'; buf[1] = '\0'; return; }
    char tmp[16];
    int idx = 0;
    while (val > 0) {
        tmp[idx++] = '0' + (val % 10);
        val /= 10;
    }
    int out = 0;
    for (int i = idx - 1; i >= 0; i--) buf[out++] = tmp[i];
    buf[out] = '\0';
}

static char hex_digit(int v) {
    return (v < 10) ? ('0' + v) : ('A' + (v - 10));
}

static void color_to_hex(uint32_t col, char *buf) {
    uint8_t r = col & 0xFF;
    uint8_t g = (col >> 8) & 0xFF;
    uint8_t b = (col >> 16) & 0xFF;

    buf[0] = '#';
    buf[1] = hex_digit((r >> 4) & 0xF);
    buf[2] = hex_digit(r & 0xF);
    buf[3] = hex_digit((g >> 4) & 0xF);
    buf[4] = hex_digit(g & 0xF);
    buf[5] = hex_digit((b >> 4) & 0xF);
    buf[6] = hex_digit(b & 0xF);
    buf[7] = '\0';
}

static void add_to_history(uint32_t col) {
    if (history_count > 0 && history[0] == col) return;
    for (int i = MAX_HISTORY - 1; i > 0; i--) {
        history[i] = history[i - 1];
    }
    history[0] = col;
    if (history_count < MAX_HISTORY) history_count++;
}

static void send_color(uint32_t col) {
    current_color = col;
    add_to_history(col);

    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    msg->type = MSG_SET_COLOR;
    msg->param1 = col;
    msg->param2 = 0;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static void render_color_hud(void) {
    draw_rect(0, 0, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 0xFF14181C);
    draw_frame(0, 0, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 0xFF2A3642);

    // Title Bar
    draw_rect(0, 0, COLOR_HUD_WIDTH, 18, 0xFF1F2933);
    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 8, 5, "COR ATIVA (HUD)", 0xFF00FFCC);

    // Current Swatch
    draw_rect(10, 26, 36, 36, current_color);
    draw_frame(10, 26, 36, 36, 0xFF667788);

    // Hex String
    char hex_str[16];
    color_to_hex(current_color, hex_str);
    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 54, 28, hex_str, 0xFFFFFFFF);

    // RGB String
    uint8_t r = current_color & 0xFF;
    uint8_t g = (current_color >> 8) & 0xFF;
    uint8_t b = (current_color >> 16) & 0xFF;

    char r_buf[8], g_buf[8], b_buf[8];
    int_to_str(r, r_buf);
    int_to_str(g, g_buf);
    int_to_str(b, b_buf);

    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 54, 42, "R:", 0xFFFF5555);
    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 66, 42, r_buf, 0xFFCCCCCC);

    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 54, 52, "G:", 0xFF55FF55);
    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 66, 52, g_buf, 0xFFCCCCCC);

    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 100, 52, "B:", 0xFF5599FF);
    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 112, 52, b_buf, 0xFFCCCCCC);

    // History Header
    draw_string(pixels, COLOR_HUD_WIDTH, COLOR_HUD_HEIGHT, 10, 72, "HISTORICO:", 0xFF8899A6);

    // History Chips Grid (4x2)
    for (int i = 0; i < MAX_HISTORY; i++) {
        int gx = 10 + (i % 4) * 32;
        int gy = 86 + (i / 4) * 22;
        draw_rect(gx, gy, 28, 18, history[i]);
        draw_frame(gx, gy, 28, 18, 0xFF354452);
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    if (msg->type == MSG_SET_COLOR) {
        current_color = msg->param1;
        add_to_history(current_color);
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = COLOR_HUD_WIDTH;
            fb->height = COLOR_HUD_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down && !prev_left_btn) {
            // Click history swatch to re-select
            if (my >= 86 && my < 86 + 44) {
                int row = (my - 86) / 22;
                int col = (mx - 10) / 32;
                int idx = row * 4 + col;
                if (idx >= 0 && idx < MAX_HISTORY && mx >= 10 && mx < 10 + 4 * 32) {
                    send_color(history[idx]);
                }
            }
        }
        prev_left_btn = left_down;
    }

    render_color_hud();
    return UPDATE_OK;
}
