#include "../../include/wesenho.h"
#include "../../include/font5x7.h"

#define TOOLS_WIDTH  140
#define TOOLS_HEIGHT 230

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[TOOLS_WIDTH * TOOLS_HEIGHT];
static int selected_tool = TOOL_BRUSH;
static int brush_size = 4;
static int prev_left_btn = 0;

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= TOOLS_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= TOOLS_WIDTH) continue;
            pixels[j * TOOLS_WIDTH + i] = color;
        }
    }
}

static void draw_frame(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < TOOLS_HEIGHT) pixels[y * TOOLS_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < TOOLS_HEIGHT) pixels[(y + h - 1) * TOOLS_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < TOOLS_WIDTH) pixels[j * TOOLS_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < TOOLS_WIDTH) pixels[j * TOOLS_WIDTH + (x + w - 1)] = color;
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

static void render_tools(void) {
    draw_rect(0, 0, TOOLS_WIDTH, TOOLS_HEIGHT, 0xFF222222);
    draw_frame(0, 0, TOOLS_WIDTH, TOOLS_HEIGHT, 0xFF444444);

    // Title Bar
    draw_rect(0, 0, TOOLS_WIDTH, 20, 0xFF303030);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 8, 6, "FERRAMENTAS", 0xFFE0E0E0);

    // Pincel Button
    draw_rect(8, 28, 124, 26, (selected_tool == TOOL_BRUSH) ? 0xFF3E4E3E : 0xFF2B2B2B);
    draw_frame(8, 28, 124, 26, (selected_tool == TOOL_BRUSH) ? 0xFF00FF00 : 0xFF404040);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 16, 36, "Pincel", 0xFFFFFFFF);

    // Borracha Button
    draw_rect(8, 60, 124, 26, (selected_tool == TOOL_ERASER) ? 0xFF3E4E3E : 0xFF2B2B2B);
    draw_frame(8, 60, 124, 26, (selected_tool == TOOL_ERASER) ? 0xFF00FF00 : 0xFF404040);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 16, 68, "Borracha", 0xFFFFFFFF);

    // Brush Size Panel with [+] and [-] buttons
    draw_rect(8, 94, 124, 52, 0xFF181818);
    draw_frame(8, 94, 124, 52, 0xFF353535);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 14, 100, "Tamanho:", 0xFFAAAAAA);

    // [-] Button
    draw_rect(14, 114, 24, 24, 0xFF2B2B2B);
    draw_frame(14, 114, 24, 24, 0xFF555555);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 23, 122, "-", 0xFFFFFFFF);

    // Dot Preview in Center
    int r = brush_size / 2;
    if (r < 1) r = 1;
    if (r > 12) r = 12;
    draw_rect(70 - r, 126 - r, r * 2, r * 2, 0xFF00FFFF);

    // [+] Button
    draw_rect(102, 114, 24, 24, 0xFF2B2B2B);
    draw_frame(102, 114, 24, 24, 0xFF555555);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 111, 122, "+", 0xFFFFFFFF);

    // Effects Section
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 8, 156, "EFEITOS", 0xFF888888);

    draw_rect(8, 170, 58, 22, 0xFF2B2B2B);
    draw_frame(8, 170, 58, 22, 0xFF404040);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 14, 177, "Invert", 0xFFDDDDDD);

    draw_rect(72, 170, 60, 22, 0xFF2B2B2B);
    draw_frame(72, 170, 60, 22, 0xFF404040);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 78, 177, "Grayscale", 0xFFDDDDDD);

    draw_rect(8, 198, 124, 22, 0xFF3A2222);
    draw_frame(8, 198, 124, 22, 0xFF663333);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 36, 205, "Limpar Camada", 0xFFFF8888);
}

void on_message(int32_t from_id, int32_t len) {}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = TOOLS_WIDTH;
            fb->height = TOOLS_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down && !prev_left_btn && mx >= 0 && mx < TOOLS_WIDTH) {
            if (my >= 28 && my <= 54) {
                selected_tool = TOOL_BRUSH;
                send_msg(MSG_SET_TOOL, TOOL_BRUSH);
            } else if (my >= 60 && my <= 86) {
                selected_tool = TOOL_ERASER;
                send_msg(MSG_SET_TOOL, TOOL_ERASER);
            }
            // [-] Button
            else if (my >= 114 && my <= 138 && mx >= 14 && mx <= 38) {
                if (brush_size > 1) {
                    brush_size--;
                    send_msg(MSG_SET_BRUSH_SIZE, brush_size);
                }
            }
            // [+] Button
            else if (my >= 114 && my <= 138 && mx >= 102 && mx <= 126) {
                if (brush_size < 48) {
                    brush_size++;
                    send_msg(MSG_SET_BRUSH_SIZE, brush_size);
                }
            } else if (my >= 170 && my <= 192) {
                if (mx <= 66) send_msg(MSG_EFFECT_INVERT, 0);
                else send_msg(MSG_EFFECT_GRAYSCALE, 0);
            } else if (my >= 198 && my <= 220) {
                send_msg(MSG_EFFECT_CLEAR, 0);
            }
        }
        prev_left_btn = left_down;
    }

    render_tools();
    return UPDATE_OK;
}
