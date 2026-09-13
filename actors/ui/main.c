#include "../../include/wesenho.h"

#define UI_WIDTH  160
#define UI_HEIGHT 720

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t ui_pixels[UI_WIDTH * UI_HEIGHT];

static const uint32_t PALETTE[12] = {
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
static int selected_tool = TOOL_BRUSH;
static int brush_size = 4;
static int prev_left_btn = 0;

/* UI State for Layers Panel */
static int ui_active_layer = 0;
static int ui_layer_count = 1;
static uint8_t ui_layer_vis[MAX_LAYERS] = {1, 1, 1, 1, 1, 1, 1, 1};

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= UI_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= UI_WIDTH) continue;
            ui_pixels[j * UI_WIDTH + i] = color;
        }
    }
}

static void draw_frame(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < UI_HEIGHT) ui_pixels[y * UI_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < UI_HEIGHT) ui_pixels[(y + h - 1) * UI_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < UI_WIDTH) ui_pixels[j * UI_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < UI_WIDTH) ui_pixels[j * UI_WIDTH + (x + w - 1)] = color;
    }
}

static void send_msg(uint32_t type, uint32_t param1, uint32_t param2) {
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    msg->type = type;
    msg->param1 = param1;
    msg->param2 = param2;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static void render_ui(void) {
    /* Main Dark Theme Sidebar background */
    draw_rect(0, 0, UI_WIDTH, UI_HEIGHT, 0xFF1E1E1E);
    /* Right separator line */
    for (int j = 0; j < UI_HEIGHT; j++) {
        ui_pixels[j * UI_WIDTH + (UI_WIDTH - 1)] = 0xFF383838;
    }

    /* SECTION 1: TOOLS (Pincel, Borracha) */
    draw_rect(0, 0, UI_WIDTH, 24, 0xFF2A2A2A); // Header bar
    draw_frame(0, 0, UI_WIDTH, 24, 0xFF383838);

    // Pincel
    draw_rect(10, 32, 65, 28, (selected_tool == TOOL_BRUSH) ? 0xFF3F3F3F : 0xFF282828);
    draw_frame(10, 32, 65, 28, (selected_tool == TOOL_BRUSH) ? 0xFF00FF00 : 0xFF444444);
    draw_rect(36, 42, 12, 8, selected_color);

    // Borracha
    draw_rect(85, 32, 65, 28, (selected_tool == TOOL_ERASER) ? 0xFF3F3F3F : 0xFF282828);
    draw_frame(85, 32, 65, 28, (selected_tool == TOOL_ERASER) ? 0xFF00FF00 : 0xFF444444);
    draw_rect(105, 42, 24, 8, 0xFFE0E0E0);

    /* SECTION 2: PALETTE (4x3 Grid) */
    draw_rect(0, 68, UI_WIDTH, 20, 0xFF252525);
    for (int i = 0; i < 12; i++) {
        int col = i % 4;
        int row = i / 4;
        int bx = 12 + col * 34;
        int by = 96 + row * 34;
        draw_rect(bx, by, 30, 30, PALETTE[i]);
        if (selected_color == PALETTE[i]) {
            draw_frame(bx - 2, by - 2, 34, 34, 0xFF00FFFF);
            draw_frame(bx - 1, by - 1, 32, 32, 0xFFFFFFFF);
        } else {
            draw_frame(bx, by, 30, 30, 0xFF111111);
        }
    }

    /* SECTION 3: BRUSH SIZE / PREVIEW */
    draw_rect(0, 204, UI_WIDTH, 20, 0xFF252525);
    draw_rect(10, 230, 140, 40, 0xFF141414);
    draw_frame(10, 230, 140, 40, 0xFF383838);

    int dot_r = brush_size / 2;
    if (dot_r < 1) dot_r = 1;
    if (dot_r > 18) dot_r = 18;
    draw_rect(80 - dot_r, 250 - dot_r, dot_r * 2, dot_r * 2, selected_color);

    /* SECTION 4: ACTIONS (Clear, Invert, Gray) */
    draw_rect(0, 278, UI_WIDTH, 20, 0xFF252525);

    draw_rect(10, 304, 42, 24, 0xFF282828); // Invert
    draw_frame(10, 304, 42, 24, 0xFF444444);
    draw_rect(26, 312, 10, 8, 0xFF888888);

    draw_rect(58, 304, 42, 24, 0xFF282828); // Grayscale
    draw_frame(58, 304, 42, 24, 0xFF444444);
    draw_rect(74, 312, 10, 8, 0xFFAAAAAA);

    draw_rect(106, 304, 44, 24, 0xFF282828); // Clear
    draw_frame(106, 304, 44, 24, 0xFF444444);
    draw_rect(122, 314, 12, 4, 0xFF4444FF);

    /* SECTION 5: LAYERS MANAGER */
    draw_rect(0, 338, UI_WIDTH, 22, 0xFF2A2A2A);
    draw_frame(0, 338, UI_WIDTH, 22, 0xFF383838);

    // + New Layer Button
    draw_rect(10, 366, 140, 24, 0xFF2D5A27);
    draw_frame(10, 366, 140, 24, 0xFF44AA33);
    // Plus cross
    draw_rect(78, 372, 4, 12, 0xFFFFFFFF);
    draw_rect(74, 376, 12, 4, 0xFFFFFFFF);

    // Layer List Stack
    for (int l = 0; l < ui_layer_count && l < MAX_LAYERS; l++) {
        int ly = 398 + l * 34;
        int is_act = (l == ui_active_layer);

        // Layer Row
        draw_rect(10, ly, 140, 30, is_act ? 0xFF3A4A5A : 0xFF252525);
        draw_frame(10, ly, 140, 30, is_act ? 0xFF4A80C0 : 0xFF353535);

        // Eye icon (visibility)
        uint32_t eye_col = ui_layer_vis[l] ? 0xFF00FF00 : 0xFF555555;
        draw_rect(18, ly + 9, 14, 12, eye_col);

        // Layer thumbnail/badge
        draw_rect(38, ly + 6, 24, 18, 0xFF141414);
        draw_frame(38, ly + 6, 24, 18, 0xFF555555);

        // Layer indicator bar
        draw_rect(68, ly + 12, 70, 6, is_act ? 0xFF00FFFF : 0xFF666666);
    }
}

void on_message(int32_t from_id, int32_t len) {
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = UI_WIDTH;
            fb->height = UI_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)ui_pixels;
        }
    }

    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down && !prev_left_btn && mx >= 0 && mx < UI_WIDTH) {
            // 1. Tools
            if (my >= 32 && my <= 60) {
                if (mx >= 10 && mx <= 75) {
                    selected_tool = TOOL_BRUSH;
                    send_msg(MSG_SET_TOOL, TOOL_BRUSH, 0);
                } else if (mx >= 85 && mx <= 150) {
                    selected_tool = TOOL_ERASER;
                    send_msg(MSG_SET_TOOL, TOOL_ERASER, 0);
                }
            }
            // 2. Palette (Grid 4x3)
            else if (my >= 96 && my < 96 + 3 * 34) {
                int row = (my - 96) / 34;
                int col = (mx - 12) / 34;
                if (col >= 0 && col < 4 && row >= 0 && row < 3) {
                    int idx = row * 4 + col;
                    if (idx < 12) {
                        selected_color = PALETTE[idx];
                        send_msg(MSG_SET_COLOR, selected_color, 0);
                        if (selected_tool == TOOL_ERASER) {
                            selected_tool = TOOL_BRUSH;
                            send_msg(MSG_SET_TOOL, TOOL_BRUSH, 0);
                        }
                    }
                }
            }
            // 3. Actions (Invert, Gray, Clear)
            else if (my >= 304 && my <= 328) {
                if (mx >= 10 && mx <= 52) {
                    send_msg(MSG_EFFECT_INVERT, 0, 0);
                } else if (mx >= 58 && mx <= 100) {
                    send_msg(MSG_EFFECT_GRAYSCALE, 0, 0);
                } else if (mx >= 106 && mx <= 150) {
                    send_msg(MSG_EFFECT_CLEAR, 0, 0);
                }
            }
            // 4. New Layer Button (+ button)
            else if (my >= 366 && my <= 390 && mx >= 10 && mx <= 150) {
                if (ui_layer_count < MAX_LAYERS) {
                    ui_active_layer = ui_layer_count;
                    ui_layer_vis[ui_layer_count] = 1;
                    ui_layer_count++;
                    send_msg(MSG_LAYER_ADD, 0, 0);
                }
            }
            // 5. Layer Rows (Click row to select, click eye to toggle visibility)
            else if (my >= 398 && my < 398 + ui_layer_count * 34) {
                int l = (my - 398) / 34;
                if (l >= 0 && l < ui_layer_count) {
                    // Click eye (mx 10..34)
                    if (mx >= 10 && mx <= 34) {
                        ui_layer_vis[l] = !ui_layer_vis[l];
                        send_msg(MSG_LAYER_TOGGLE_VIS, l, 0);
                    } else {
                        ui_active_layer = l;
                        send_msg(MSG_LAYER_SELECT, l, 0);
                    }
                }
            }
        }

        // Wheel over UI changes brush size
        if (mx >= 0 && mx < UI_WIDTH) {
            if (mouse->wheel_y > 0 && brush_size < 48) {
                brush_size++;
                send_msg(MSG_SET_BRUSH_SIZE, brush_size, 0);
            } else if (mouse->wheel_y < 0 && brush_size > 1) {
                brush_size--;
                send_msg(MSG_SET_BRUSH_SIZE, brush_size, 0);
            }
        }

        prev_left_btn = left_down;
    }

    render_ui();
    return UPDATE_OK;
}
