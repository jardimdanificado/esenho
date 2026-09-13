#include "../../include/wesenho.h"
#include "../../include/font5x7.h"

#define LAYERS_WIDTH  150
#define LAYERS_HEIGHT 190

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[LAYERS_WIDTH * LAYERS_HEIGHT];
static int active_layer = 0;
static int layer_count = 1;
static uint8_t layer_vis[MAX_LAYERS] = {1, 1, 1, 1, 1, 1, 1, 1};
static uint8_t layer_op[MAX_LAYERS] = {100, 100, 100, 100, 100, 100, 100, 100};
static char layer_names[MAX_LAYERS][10] = {
    "Layer 0", "Layer 1", "Layer 2", "Layer 3",
    "Layer 4", "Layer 5", "Layer 6", "Layer 7"
};
static int prev_left_btn = 0;

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

static void str_copy(char *dst, const char *src, int max_len) {
    int i = 0;
    while (src[i] && i < max_len - 1) {
        dst[i] = src[i];
        i++;
    }
    dst[i] = '\0';
}

static void send_msg(uint32_t type, uint32_t param1) {
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    msg->type = type;
    msg->param1 = param1;
    msg->param2 = 0;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static void render_layers_hud(void) {
    draw_rect(0, 0, LAYERS_WIDTH, LAYERS_HEIGHT, 0xFF14181C);
    draw_frame(0, 0, LAYERS_WIDTH, LAYERS_HEIGHT, 0xFF2A3642);

    // Layer List Stack
    for (int l = 0; l < layer_count && l < MAX_LAYERS; l++) {
        int ly = 8 + l * 22;
        int is_act = (l == active_layer);

        draw_rect(6, ly, LAYERS_WIDTH - 12, 20, is_act ? 0xFF203545 : 0xFF181F26);
        draw_frame(6, ly, LAYERS_WIDTH - 12, 20, is_act ? 0xFF00FFCC : 0xFF2E3D4D);

        // Eye indicator
        uint32_t eye_col = layer_vis[l] ? 0xFF00FF88 : 0xFF556677;
        draw_rect(12, ly + 5, 10, 10, eye_col);

        // Layer Name
        draw_string(pixels, LAYERS_WIDTH, LAYERS_HEIGHT, 28, ly + 6, layer_names[l], is_act ? 0xFFFFFFFF : 0xFFAABBCC);

        // Opacity %
        char op_buf[8];
        int_to_str(layer_op[l], op_buf);
        draw_string(pixels, LAYERS_WIDTH, LAYERS_HEIGHT, 105, ly + 6, op_buf, 0xFF00FFFF);
        draw_string(pixels, LAYERS_WIDTH, LAYERS_HEIGHT, 126, ly + 6, "%", 0xFF667788);
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    switch (msg->type) {
        case MSG_LAYER_ADD:
            if (layer_count < MAX_LAYERS) {
                layer_vis[layer_count] = 1;
                layer_op[layer_count] = 100;
                char def_name[10] = "Layer ";
                def_name[6] = '0' + layer_count;
                def_name[7] = '\0';
                str_copy(layer_names[layer_count], def_name, 10);
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
                layer_vis[(int)msg->param1] = !layer_vis[(int)msg->param1];
            }
            break;
        case MSG_LAYER_SET_OPACITY:
            if ((int)msg->param1 >= 0 && (int)msg->param1 < layer_count) {
                layer_op[(int)msg->param1] = (uint8_t)msg->param2;
            }
            break;
        case MSG_LAYER_DELETE: {
            int del_idx = (int)msg->param1;
            if (del_idx >= 0 && del_idx < layer_count) {
                if (layer_count > 1) {
                    for (int l = del_idx; l < layer_count - 1; l++) {
                        layer_vis[l] = layer_vis[l + 1];
                        layer_op[l] = layer_op[l + 1];
                        str_copy(layer_names[l], layer_names[l + 1], 10);
                    }
                    layer_count--;
                    if (active_layer >= layer_count) active_layer = layer_count - 1;
                }
            }
            break;
        }
        case MSG_LAYER_RENAME: {
            int idx = (int)msg->param1;
            if (idx >= 0 && idx < layer_count) {
                char new_name[10];
                new_name[0] = (char)(msg->param2 & 0xFF);
                new_name[1] = (char)((msg->param2 >> 8) & 0xFF);
                new_name[2] = (char)((msg->param2 >> 16) & 0xFF);
                new_name[3] = (char)((msg->param2 >> 24) & 0xFF);
                new_name[4] = (char)(msg->param3 & 0xFF);
                new_name[5] = (char)((msg->param3 >> 8) & 0xFF);
                new_name[6] = (char)((msg->param3 >> 16) & 0xFF);
                new_name[7] = (char)((msg->param3 >> 24) & 0xFF);
                new_name[8] = '\0';
                str_copy(layer_names[idx], new_name, 10);
            }
            break;
        }
    }
}

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
            if (my >= 8 && my < 8 + layer_count * 22) {
                int l = (my - 8) / 22;
                if (l >= 0 && l < layer_count) {
                    if (mx >= 8 && mx <= 24) {
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

    render_layers_hud();
    return UPDATE_OK;
}
