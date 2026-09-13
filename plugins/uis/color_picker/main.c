#include "../../../include/wesenho.h"
#include "../../../include/font5x7.h"

#define PICKER_WIDTH  160
#define PICKER_HEIGHT 190

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;

static uint32_t pixels[PICKER_WIDTH * PICKER_HEIGHT];

static int mode = 0; // 0: RGB, 1: HSL
static int val_r = 255;
static int val_g = 0;
static int val_b = 0;

static int val_h = 0;
static int val_s = 100;
static int val_l = 50;

static int prev_left_btn = 0;

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= PICKER_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= PICKER_WIDTH) continue;
            pixels[j * PICKER_WIDTH + i] = color;
        }
    }
}

static void draw_frame_border(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < PICKER_HEIGHT) pixels[y * PICKER_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < PICKER_HEIGHT) pixels[(y + h - 1) * PICKER_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < PICKER_WIDTH) pixels[j * PICKER_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < PICKER_WIDTH) pixels[j * PICKER_WIDTH + (x + w - 1)] = color;
    }
}

static void hsl_to_rgb(int h, int s, int l, int *r, int *g, int *b) {
    float h_f = (float)h / 360.0f;
    float s_f = (float)s / 100.0f;
    float l_f = (float)l / 100.0f;

    if (s == 0) {
        *r = *g = *b = (int)(l_f * 255.0f);
        return;
    }

    float q = l_f < 0.5f ? l_f * (1.0f + s_f) : l_f + s_f - l_f * s_f;
    float p = 2.0f * l_f - q;

    float t[3] = { h_f + 1.0f / 3.0f, h_f, h_f - 1.0f / 3.0f };
    for (int i = 0; i < 3; i++) {
        if (t[i] < 0.0f) t[i] += 1.0f;
        if (t[i] > 1.0f) t[i] -= 1.0f;

        float c;
        if (t[i] < 1.0f / 6.0f) c = p + (q - p) * 6.0f * t[i];
        else if (t[i] < 0.5f)   c = q;
        else if (t[i] < 2.0f / 3.0f) c = p + (q - p) * (2.0f / 3.0f - t[i]) * 6.0f;
        else c = p;

        if (i == 0) *r = (int)(c * 255.0f);
        if (i == 1) *g = (int)(c * 255.0f);
        if (i == 2) *b = (int)(c * 255.0f);
    }
}

static uint32_t get_current_color_u32(void) {
    int r, g, b;
    if (mode == 0) {
        r = val_r; g = val_g; b = val_b;
    } else {
        hsl_to_rgb(val_h, val_s, val_l, &r, &g, &b);
    }
    return (0xFF << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
}

static void send_color_to_canvas(void) {
    uint32_t color = get_current_color_u32();
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    msg->type = MSG_SET_COLOR;
    msg->param1 = color;
    msg->param2 = 0;
    msg->param3 = 0;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static void render_picker(void) {
    draw_rect(0, 0, PICKER_WIDTH, PICKER_HEIGHT, 0xFF222222);
    draw_frame_border(0, 0, PICKER_WIDTH, PICKER_HEIGHT, 0xFF444444);

    // Title bar
    draw_rect(0, 0, PICKER_WIDTH, 20, 0xFF303030);
    draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 8, 6, "COLOR PICKER", 0xFFE0E0E0);

    // Tab buttons: RGB / HSL
    draw_rect(10, 26, 65, 20, (mode == 0) ? 0xFF4A4A4A : 0xFF2A2A2A);
    draw_frame_border(10, 26, 65, 20, (mode == 0) ? 0xFF00FFFF : 0xFF3A3A3A);
    draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 30, 32, "RGB", (mode == 0) ? 0xFFFFFFFF : 0xFFAAAAAA);

    draw_rect(85, 26, 65, 20, (mode == 1) ? 0xFF4A4A4A : 0xFF2A2A2A);
    draw_frame_border(85, 26, 65, 20, (mode == 1) ? 0xFF00FFFF : 0xFF3A3A3A);
    draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 105, 32, "HSL", (mode == 1) ? 0xFFFFFFFF : 0xFFAAAAAA);

    // Color Preview
    uint32_t cur_col = get_current_color_u32();
    draw_rect(10, 52, 140, 36, cur_col);
    draw_frame_border(10, 52, 140, 36, 0xFF666666);

    const int slider_x = 28;
    const int slider_w = 118;
    const int slider_h = 14;

    if (mode == 0) {
        // R
        draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 10, 100, "R", 0xFFFF5555);
        for (int i = 0; i < slider_w; i++) {
            uint8_t c = (i * 255) / slider_w;
            for (int j = 0; j < slider_h; j++) pixels[(98 + j) * PICKER_WIDTH + (slider_x + i)] = (0xFF << 24) | c;
        }
        draw_frame_border(slider_x, 98, slider_w, slider_h, 0xFF555555);
        int h_r = slider_x + (val_r * (slider_w - 4)) / 255;
        draw_rect(h_r, 96, 4, slider_h + 4, 0xFFFFFFFF);

        // G
        draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 10, 130, "G", 0xFF55FF55);
        for (int i = 0; i < slider_w; i++) {
            uint8_t c = (i * 255) / slider_w;
            for (int j = 0; j < slider_h; j++) pixels[(128 + j) * PICKER_WIDTH + (slider_x + i)] = (0xFF << 24) | (c << 8);
        }
        draw_frame_border(slider_x, 128, slider_w, slider_h, 0xFF555555);
        int h_g = slider_x + (val_g * (slider_w - 4)) / 255;
        draw_rect(h_g, 126, 4, slider_h + 4, 0xFFFFFFFF);

        // B
        draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 10, 160, "B", 0xFF5555FF);
        for (int i = 0; i < slider_w; i++) {
            uint8_t c = (i * 255) / slider_w;
            for (int j = 0; j < slider_h; j++) pixels[(158 + j) * PICKER_WIDTH + (slider_x + i)] = (0xFF << 24) | (c << 16);
        }
        draw_frame_border(slider_x, 158, slider_w, slider_h, 0xFF555555);
        int h_b = slider_x + (val_b * (slider_w - 4)) / 255;
        draw_rect(h_b, 156, 4, slider_h + 4, 0xFFFFFFFF);

    } else {
        // H
        draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 10, 100, "H", 0xFFFFFFFF);
        for (int i = 0; i < slider_w; i++) {
            int r, g, b;
            hsl_to_rgb((i * 360) / slider_w, 100, 50, &r, &g, &b);
            uint32_t rgb = (0xFF << 24) | (b << 16) | (g << 8) | r;
            for (int j = 0; j < slider_h; j++) pixels[(98 + j) * PICKER_WIDTH + (slider_x + i)] = rgb;
        }
        draw_frame_border(slider_x, 98, slider_w, slider_h, 0xFF555555);
        int h_h = slider_x + (val_h * (slider_w - 4)) / 360;
        draw_rect(h_h, 96, 4, slider_h + 4, 0xFFFFFFFF);

        // S
        draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 10, 130, "S", 0xFFFFFFFF);
        for (int i = 0; i < slider_w; i++) {
            int r, g, b;
            hsl_to_rgb(val_h, (i * 100) / slider_w, val_l, &r, &g, &b);
            uint32_t rgb = (0xFF << 24) | (b << 16) | (g << 8) | r;
            for (int j = 0; j < slider_h; j++) pixels[(128 + j) * PICKER_WIDTH + (slider_x + i)] = rgb;
        }
        draw_frame_border(slider_x, 128, slider_w, slider_h, 0xFF555555);
        int h_s = slider_x + (val_s * (slider_w - 4)) / 100;
        draw_rect(h_s, 126, 4, slider_h + 4, 0xFFFFFFFF);

        // L
        draw_string(pixels, PICKER_WIDTH, PICKER_HEIGHT, 10, 160, "L", 0xFFFFFFFF);
        for (int i = 0; i < slider_w; i++) {
            int r, g, b;
            hsl_to_rgb(val_h, val_s, (i * 100) / slider_w, &r, &g, &b);
            uint32_t rgb = (0xFF << 24) | (b << 16) | (g << 8) | r;
            for (int j = 0; j < slider_h; j++) pixels[(158 + j) * PICKER_WIDTH + (slider_x + i)] = rgb;
        }
        draw_frame_border(slider_x, 158, slider_w, slider_h, 0xFF555555);
        int h_l = slider_x + (val_l * (slider_w - 4)) / 100;
        draw_rect(h_l, 156, 4, slider_h + 4, 0xFFFFFFFF);
    }
}

void on_message(int32_t from_id, int32_t len) {}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = PICKER_WIDTH;
            fb->height = PICKER_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");

    if (mouse) {
        int mx = mouse->x;
        int my = mouse->y;
        int left_down = (mouse->buttons & WMOUSE_BTN_LEFT) != 0;

        if (left_down) {
            if (!prev_left_btn && my >= 26 && my <= 46) {
                if (mx >= 10 && mx <= 75) mode = 0;
                else if (mx >= 85 && mx <= 150) mode = 1;
                send_color_to_canvas();
            }

            const int slider_x = 28;
            const int slider_w = 118;
            int rel_x = mx - slider_x;
            if (rel_x < 0) rel_x = 0;
            if (rel_x > slider_w) rel_x = slider_w;

            if (my >= 94 && my <= 116) {
                if (mode == 0) val_r = (rel_x * 255) / slider_w;
                else val_h = (rel_x * 360) / slider_w;
                send_color_to_canvas();
            } else if (my >= 124 && my <= 146) {
                if (mode == 0) val_g = (rel_x * 255) / slider_w;
                else val_s = (rel_x * 100) / slider_w;
                send_color_to_canvas();
            } else if (my >= 154 && my <= 176) {
                if (mode == 0) val_b = (rel_x * 255) / slider_w;
                else val_l = (rel_x * 100) / slider_w;
                send_color_to_canvas();
            }
        }
        prev_left_btn = left_down;
    }

    render_picker();
    return UPDATE_OK;
}
