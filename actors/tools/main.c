#include "../../include/wesenho.h"
#include "../../include/font5x7.h"

#define TOOLS_WIDTH  150
#define TOOLS_HEIGHT 100

static wframebuffer_t *fb = 0;

static uint32_t pixels[TOOLS_WIDTH * TOOLS_HEIGHT];
static int current_tool = TOOL_BRUSH;
static int brush_type = BRUSH_HARD_ROUND;
static int brush_size = 4;
static int brush_hardness = 80;
static int brush_opacity = 100;
static int brush_spacing = 15;
static uint32_t current_color = 0xFF000000;

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

static const char* get_brush_name(int type) {
    switch (type) {
        case BRUSH_HARD_ROUND:    return "Round";
        case BRUSH_SOFT_AIRBRUSH: return "Soft (Air)";
        case BRUSH_PIXEL:         return "Pixel Art";
        case BRUSH_CHISEL:        return "Chisel";
        case BRUSH_SCATTER:       return "Spray/Noise";
        default:                  return "Custom";
    }
}

static void render_tools_hud(void) {
    draw_rect(0, 0, TOOLS_WIDTH, TOOLS_HEIGHT, 0xFF14181C);
    draw_frame(0, 0, TOOLS_WIDTH, TOOLS_HEIGHT, 0xFF2A3642);

    // Tool Name
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 10, 10, "Mode:", 0xFF8899A6);
    if (current_tool == TOOL_ERASER) {
        draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 50, 10, "ERASER", 0xFFFF5555);
    } else {
        draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 50, 10, "BRUSH", 0xFF00FF88);
    }

    // Brush Type
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 10, 28, "Type:", 0xFF8899A6);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 50, 28, get_brush_name(brush_type), 0xFFFFFFFF);

    // Size
    char buf[16];
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 10, 46, "Size:", 0xFF8899A6);
    int_to_str(brush_size, buf);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 50, 46, buf, 0xFF00FFFF);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 70, 46, "px", 0xFF888888);

    // Opacity
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 10, 64, "Opac:", 0xFF8899A6);
    int_to_str(brush_opacity, buf);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 50, 64, buf, 0xFF00FFFF);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 75, 64, "%", 0xFF888888);

    // Hardness
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 10, 82, "Hard:", 0xFF8899A6);
    int_to_str(brush_hardness, buf);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 50, 82, buf, 0xFF00FFFF);
    draw_string(pixels, TOOLS_WIDTH, TOOLS_HEIGHT, 75, 82, "%", 0xFF888888);

    // Mini Glyph Stamp Preview
    draw_rect(102, 38, 38, 50, 0xFF0B0D0F);
    draw_frame(102, 38, 38, 50, 0xFF354452);

    int r = brush_size / 2;
    if (r < 1) r = 1;
    if (r > 14) r = 14;
    int cx = 121;
    int cy = 63;

    if (brush_type == BRUSH_PIXEL) {
        draw_rect(cx - r, cy - r, r * 2, r * 2, current_color);
    } else {
        for (int dy = -r; dy <= r; dy++) {
            for (int dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                    pixels[(cy + dy) * TOOLS_WIDTH + (cx + dx)] = current_color;
                }
            }
        }
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    switch (msg->type) {
        case MSG_SET_TOOL:
            current_tool = (int)msg->param1;
            break;
        case MSG_SET_BRUSH_SIZE:
            brush_size = (int)msg->param1;
            break;
        case MSG_SET_BRUSH_TYPE:
            brush_type = (int)msg->param1;
            break;
        case MSG_SET_BRUSH_PARAMS:
            brush_hardness = (int)msg->param1;
            brush_opacity = (int)msg->param2;
            brush_spacing = (int)msg->param3;
            break;
        case MSG_SET_COLOR:
            current_color = msg->param1;
            break;
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = TOOLS_WIDTH;
            fb->height = TOOLS_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
    }

    render_tools_hud();
    return UPDATE_OK;
}
