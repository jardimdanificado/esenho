#include "../../include/wesenho.h"
#include "../../include/font5x7.h"

#define PALETTE_WIDTH  140
#define PALETTE_HEIGHT 150

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[PALETTE_WIDTH * PALETTE_HEIGHT];

static const uint32_t COLORS[12] = {
    0xFF000000, /* Preto */
    0xFFFFFFFF, /* Branco */
    0xFF808080, /* Cinza */
    0xFF0000FF, /* Vermelho */
    0xFF0080FF, /* Laranja */
    0xFF00FFFF, /* Amarelo */
    0xFF00FF00, /* Verde */
    0xFFFFFF00, /* Ciano */
    0xFFFF0000, /* Azul */
    0xFFFF00FF, /* Magenta */
    0xFF400080, /* Roxo */
    0xFF2A52BE  /* Azul Cobalto */
};

static uint32_t selected_color = 0xFF000000;
static int prev_left_btn = 0;

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= PALETTE_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= PALETTE_WIDTH) continue;
            pixels[j * PALETTE_WIDTH + i] = color;
        }
    }
}

static void draw_frame(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < PALETTE_HEIGHT) pixels[y * PALETTE_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < PALETTE_HEIGHT) pixels[(y + h - 1) * PALETTE_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < PALETTE_WIDTH) pixels[j * PALETTE_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < PALETTE_WIDTH) pixels[j * PALETTE_WIDTH + (x + w - 1)] = color;
    }
}

static void send_msg(uint32_t type, uint32_t param1) {
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    msg->type = type;
    msg->param1 = param1;
    msg->param2 = 0;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static void render_palette(void) {
    draw_rect(0, 0, PALETTE_WIDTH, PALETTE_HEIGHT, 0xFF222222);
    draw_frame(0, 0, PALETTE_WIDTH, PALETTE_HEIGHT, 0xFF444444);

    // Title Bar
    draw_rect(0, 0, PALETTE_WIDTH, 20, 0xFF303030);
    draw_string(pixels, PALETTE_WIDTH, PALETTE_HEIGHT, 8, 6, "CORES", 0xFFE0E0E0);

    // Grid 4x3
    for (int i = 0; i < 12; i++) {
        int col = i % 4;
        int row = i / 4;
        int bx = 10 + col * 30;
        int by = 30 + row * 30;

        draw_rect(bx, by, 26, 26, COLORS[i]);
        if (selected_color == COLORS[i]) {
            draw_frame(bx - 2, by - 2, 30, 30, 0xFF00FFFF);
            draw_frame(bx - 1, by - 1, 28, 28, 0xFFFFFFFF);
        } else {
            draw_frame(bx, by, 26, 26, 0xFF111111);
        }
    }

    // Active color preview
    draw_rect(10, 122, 120, 20, selected_color);
    draw_frame(10, 122, 120, 20, 0xFF666666);
}

void on_message(int32_t from_id, int32_t len) {}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = PALETTE_WIDTH;
            fb->height = PALETTE_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down && !prev_left_btn && mx >= 0 && mx < PALETTE_WIDTH) {
            if (my >= 30 && my < 30 + 3 * 30) {
                int row = (my - 30) / 30;
                int col = (mx - 10) / 30;
                if (col >= 0 && col < 4 && row >= 0 && row < 3) {
                    int idx = row * 4 + col;
                    if (idx < 12) {
                        selected_color = COLORS[idx];
                        send_msg(MSG_SET_COLOR, selected_color);
                    }
                }
            }
        }
        prev_left_btn = left_down;
    }

    render_palette();
    return UPDATE_OK;
}
