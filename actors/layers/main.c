#include "../../include/wesenho.h"
#include "../../include/font5x7.h"

#define LAYERS_WIDTH  160
#define LAYERS_HEIGHT 280

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[LAYERS_WIDTH * LAYERS_HEIGHT];
static int active_layer = 0;
static int layer_count = 1;
static uint8_t layer_vis[MAX_LAYERS] = {1, 1, 1, 1, 1, 1, 1, 1};
static int prev_left_btn = 0;

static const char *layer_names[MAX_LAYERS] = {
    "Fundo",
    "Lineart",
    "Cores",
    "Sombras",
    "Luzes",
    "Detalhes",
    "Layer 7",
    "Layer 8"
};

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= LAYERS_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= LAYERS_WIDTH) continue;
            pixels[j * LAYERS_WIDTH + i] = color;
        }
    }
}

static void draw_frame(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < LAYERS_HEIGHT) pixels[y * LAYERS_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < LAYERS_HEIGHT) pixels[(y + h - 1) * LAYERS_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < LAYERS_WIDTH) pixels[j * LAYERS_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < LAYERS_WIDTH) pixels[j * LAYERS_WIDTH + (x + w - 1)] = color;
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

static void render_layers(void) {
    draw_rect(0, 0, LAYERS_WIDTH, LAYERS_HEIGHT, 0xFF222222);
    draw_frame(0, 0, LAYERS_WIDTH, LAYERS_HEIGHT, 0xFF444444);

    // Title Bar
    draw_rect(0, 0, LAYERS_WIDTH, 20, 0xFF303030);
    draw_string(pixels, LAYERS_WIDTH, LAYERS_HEIGHT, 8, 6, "CAMADAS", 0xFFE0E0E0);

    // New Layer Button (+ Nova)
    draw_rect(8, 26, 144, 24, 0xFF284828);
    draw_frame(8, 26, 144, 24, 0xFF3D7A3D);
    draw_string(pixels, LAYERS_WIDTH, LAYERS_HEIGHT, 42, 34, "+ Nova Camada", 0xFFFFFFFF);

    // Layer List Stack
    for (int l = 0; l < layer_count && l < MAX_LAYERS; l++) {
        int ly = 56 + l * 26;
        int is_act = (l == active_layer);

        // Row background
        draw_rect(8, ly, 144, 22, is_act ? 0xFF3D4D5D : 0xFF2A2A2A);
        draw_frame(8, ly, 144, 22, is_act ? 0xFF5D8DB8 : 0xFF3A3A3A);

        // Visibility Eye Icon
        uint32_t eye_col = layer_vis[l] ? 0xFF00FF00 : 0xFF555555;
        draw_rect(14, ly + 6, 10, 10, eye_col);

        // Layer Name string
        draw_string(pixels, LAYERS_WIDTH, LAYERS_HEIGHT, 32, ly + 7, layer_names[l], is_act ? 0xFFFFFFFF : 0xFFAAAAAA);
    }
}

void on_message(int32_t from_id, int32_t len) {}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = LAYERS_WIDTH;
            fb->height = LAYERS_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down && !prev_left_btn && mx >= 0 && mx < LAYERS_WIDTH) {
            // New Layer Button
            if (my >= 26 && my <= 50 && mx >= 8 && mx <= 152) {
                if (layer_count < MAX_LAYERS) {
                    active_layer = layer_count;
                    layer_vis[layer_count] = 1;
                    layer_count++;
                    send_msg(MSG_LAYER_ADD, 0);
                }
            }
            // Click on Layer row
            else if (my >= 56 && my < 56 + layer_count * 26) {
                int l = (my - 56) / 26;
                if (l >= 0 && l < layer_count) {
                    // Click Eye
                    if (mx >= 8 && mx <= 28) {
                        layer_vis[l] = !layer_vis[l];
                        send_msg(MSG_LAYER_TOGGLE_VIS, l);
                    } else {
                        active_layer = l;
                        send_msg(MSG_LAYER_SELECT, l);
                    }
                }
            }
        }
        prev_left_btn = left_down;
    }

    render_layers();
    return UPDATE_OK;
}
