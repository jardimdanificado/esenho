#include "wesenho.h"

#define DEFAULT_WIDTH  800
#define DEFAULT_HEIGHT 1000

typedef struct {
    uint32_t *pixels;
    uint8_t  visible;
    uint8_t  opacity;
} layer_t;

static wframebuffer_t *fb = 0;
static uint32_t       doc_width = DEFAULT_WIDTH;
static uint32_t       doc_height = DEFAULT_HEIGHT;
static layer_t        *layers = 0;
static int            layer_count = 0;
static int            layer_capacity = 0;
static int            active_layer = 0;
static uint32_t       *out_pixels = 0;
static uint32_t       current_color = 0xFF000000;

void force_composite(void);

// Simple bump allocator for dynamic wasm memory
static uint8_t *heap_top = 0;

static void *canvas_alloc(uint32_t size) {
    if (!heap_top) {
        extern uint8_t __heap_base;
        heap_top = &__heap_base;
    }
    uintptr_t cur = ((uintptr_t)heap_top + 15) & ~15;
    heap_top = (uint8_t*)(cur + size);

    uint32_t cur_mem_bytes = __builtin_wasm_memory_size(0) * 65536;
    if ((uintptr_t)heap_top > cur_mem_bytes) {
        uint32_t need_pages = (((uintptr_t)heap_top - cur_mem_bytes) + 65535) / 65536;
        __builtin_wasm_memory_grow(0, need_pages);
    }
    return (void*)cur;
}

static inline uint32_t blend_pixel(uint32_t dst, uint32_t src, uint8_t alpha_mod) {
    uint32_t sa = ((src >> 24) & 0xFF) * alpha_mod / 255;
    if (sa == 0) return dst;
    if (sa == 255 && ((dst >> 24) & 0xFF) == 0) return (src & 0x00FFFFFF) | 0xFF000000;

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

static void clear_layer(layer_t *lay, uint32_t num_pixels) {
    if (!lay || !lay->pixels) return;
    for (uint32_t i = 0; i < num_pixels; i++) {
        lay->pixels[i] = 0x00000000;
    }
}

static int add_new_layer_internal(void) {
    uint32_t num_pixels = doc_width * doc_height;

    if (layer_count >= layer_capacity) {
        int new_cap = layer_capacity == 0 ? 16 : (layer_capacity * 2);
        layer_t *new_layers = (layer_t*)canvas_alloc(new_cap * sizeof(layer_t));
        for (int i = 0; i < layer_count; i++) {
            new_layers[i] = layers[i];
        }
        layers = new_layers;
        layer_capacity = new_cap;
    }

    int idx = layer_count;
    layers[idx].pixels = (uint32_t*)canvas_alloc(num_pixels * sizeof(uint32_t));
    layers[idx].visible = 1;
    layers[idx].opacity = 255;
    clear_layer(&layers[idx], num_pixels);
    layer_count++;
    active_layer = idx;
    return idx;
}

static void composite_surface(void) {
    if (!out_pixels) return;
    uint32_t w = doc_width;
    uint32_t h = doc_height;
    uint32_t num_pixels = w * h;

    // Checkerboard pattern
    for (uint32_t y = 0; y < h; y++) {
        for (uint32_t x = 0; x < w; x++) {
            int check = ((x / 16) + (y / 16)) & 1;
            out_pixels[y * w + x] = check ? 0xFF2A2A2A : 0xFF222222;
        }
    }

    for (int l = 0; l < layer_count; l++) {
        if (!layers[l].visible || !layers[l].pixels) continue;
        uint8_t op = layers[l].opacity;
        if (op == 0) continue;

        for (uint32_t i = 0; i < num_pixels; i++) {
            uint32_t src = layers[l].pixels[i];
            if ((src & 0xFF000000) == 0) continue;
            out_pixels[i] = blend_pixel(out_pixels[i], src, op);
        }
    }
}

static void sync_fb(void) {
    if (!fb) return;
    fb->width = doc_width;
    fb->height = doc_height;
    fb->pixels = (uint32_t)(uintptr_t)out_pixels;
}

void force_composite(void) {
    composite_surface();
    sync_fb();
}

static void resize_surface(uint32_t new_w, uint32_t new_h) {
    if (new_w < 16 || new_h < 16 || new_w > 4096 || new_h > 4096) return;
    if (new_w == doc_width && new_h == doc_height) return;

    uint32_t old_w = doc_width;
    uint32_t old_h = doc_height;
    uint32_t new_pixels = new_w * new_h;

    out_pixels = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

    uint32_t copy_w = old_w < new_w ? old_w : new_w;
    uint32_t copy_h = old_h < new_h ? old_h : new_h;

    for (int l = 0; l < layer_count; l++) {
        uint32_t *old_buf = layers[l].pixels;
        uint32_t *new_buf = (uint32_t*)canvas_alloc(new_pixels * sizeof(uint32_t));

        for (uint32_t i = 0; i < new_pixels; i++) new_buf[i] = 0x00000000;

        if (old_buf) {
            for (uint32_t y = 0; y < copy_h; y++) {
                for (uint32_t x = 0; x < copy_w; x++) {
                    new_buf[y * new_w + x] = old_buf[y * old_w + x];
                }
            }
        }

        layers[l].pixels = new_buf;
    }

    doc_width = new_w;
    doc_height = new_h;
    composite_surface();
    sync_fb();
}

static void draw_line(int x0, int y0, int x1, int y1, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    int w = doc_width;
    int h = doc_height;
    uint32_t *pix = layers[active_layer].pixels;

    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
            pix[y0 * w + x0] = color;
        }
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

static void draw_rect(int rx, int ry, int rw, int rh, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    uint32_t *pix = layers[active_layer].pixels;
    for (int dy = 0; dy < rh; dy++) {
        int py = ry + dy;
        if (py < 0 || py >= (int)doc_height) continue;
        for (int dx = 0; dx < rw; dx++) {
            int px = rx + dx;
            if (px < 0 || px >= (int)doc_width) continue;
            pix[py * doc_width + px] = color;
        }
    }
}

static void draw_circle(int cx, int cy, int cr, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    int r2 = cr * cr;
    uint32_t *pix = layers[active_layer].pixels;
    for (int dy = -cr; dy <= cr; dy++) {
        int py = cy + dy;
        if (py < 0 || py >= (int)doc_height) continue;
        for (int dx = -cr; dx <= cr; dx++) {
            int px = cx + dx;
            if (px < 0 || px >= (int)doc_width) continue;
            if (dx * dx + dy * dy <= r2) {
                pix[py * doc_width + px] = color;
            }
        }
    }
}

static void draw_grid(int step, uint32_t color) {
    if (active_layer < 0 || active_layer >= layer_count || !layers[active_layer].pixels) return;
    if (step < 4) step = 4;
    uint32_t *pix = layers[active_layer].pixels;
    for (uint32_t y = 0; y < doc_height; y += step) {
        for (uint32_t x = 0; x < doc_width; x++) {
            pix[y * doc_width + x] = color;
        }
    }
    for (uint32_t x = 0; x < doc_width; x += step) {
        for (uint32_t y = 0; y < doc_height; y++) {
            pix[y * doc_width + x] = color;
        }
    }
}

static int c_isspace(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r';
}

static int c_tolower(char c) {
    return (c >= 'A' && c <= 'Z') ? (c + 32) : c;
}

static int c_strcasecmp(const char *a, const char *b) {
    while (*a && *b) {
        int diff = c_tolower(*a) - c_tolower(*b);
        if (diff != 0) return diff;
        a++;
        b++;
    }
    return c_tolower(*a) - c_tolower(*b);
}

static int c_atoi(const char *s) {
    if (!s) return 0;
    while (c_isspace(*s)) s++;
    int sign = 1;
    if (*s == '-') { sign = -1; s++; }
    else if (*s == '+') { s++; }
    int res = 0;
    while (*s >= '0' && *s <= '9') {
        res = res * 10 + (*s - '0');
        s++;
    }
    return res * sign;
}

static uint32_t c_parse_hex(const char *s) {
    uint32_t val = 0;
    while (*s) {
        char c = *s++;
        if (c >= '0' && c <= '9') val = (val << 4) | (c - '0');
        else if (c >= 'a' && c <= 'f') val = (val << 4) | (c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') val = (val << 4) | (c - 'A' + 10);
        else break;
    }
    return val;
}

static uint32_t c_parse_color(const char *s) {
    if (!s) return 0xFF000000;
    if (*s == '#') {
        s++;
        int len = 0;
        while (s[len]) len++;
        uint32_t h = c_parse_hex(s);
        if (len == 6) {
            return 0xFF000000 | h;
        } else if (len == 8) {
            return h;
        }
    } else if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        return c_parse_hex(s + 2);
    }
    if (c_strcasecmp(s, "black") == 0) return 0xFF000000;
    if (c_strcasecmp(s, "white") == 0) return 0xFFFFFFFF;
    if (c_strcasecmp(s, "red") == 0) return 0xFFFF0000;
    if (c_strcasecmp(s, "green") == 0) return 0xFF00FF00;
    if (c_strcasecmp(s, "blue") == 0) return 0xFF0000FF;
    if (c_strcasecmp(s, "yellow") == 0) return 0xFFFFFF00;
    if (c_strcasecmp(s, "cyan") == 0) return 0xFF00FFFF;
    if (c_strcasecmp(s, "magenta") == 0) return 0xFFFF00FF;
    return (uint32_t)c_atoi(s);
}

static int c_tokenize(char *str, char *argv[], int max_args) {
    int argc = 0;
    char *p = str;
    while (*p && argc < max_args) {
        while (*p && c_isspace(*p)) p++;
        if (!*p) break;
        if (*p == '"' || *p == '\'') {
            char quote = *p++;
            argv[argc++] = p;
            while (*p && *p != quote) p++;
            if (*p) { *p = '\0'; p++; }
        } else {
            argv[argc++] = p;
            while (*p && !c_isspace(*p)) p++;
            if (*p) { *p = '\0'; p++; }
        }
    }
    return argc;
}

static void handle_text_command(char *str) {
    char *argv[16];
    int argc = c_tokenize(str, argv, 16);
    if (argc == 0) return;

    const char *c0 = argv[0];

    // 1. Resize surface
    if (c_strcasecmp(c0, "resize") == 0 && argc >= 3) {
        int w = c_atoi(argv[1]);
        int h = c_atoi(argv[2]);
        if (w >= 16 && h >= 16) resize_surface(w, h);
        return;
    }
    if (c_strcasecmp(c0, "set") == 0 && argc >= 4 && (c_strcasecmp(argv[1], "size") == 0 || c_strcasecmp(argv[1], "resolution") == 0)) {
        int w = c_atoi(argv[2]);
        int h = c_atoi(argv[3]);
        if (w >= 16 && h >= 16) resize_surface(w, h);
        return;
    }
    if (c_strcasecmp(c0, "set") == 0 && argc >= 3) {
        if (c_strcasecmp(argv[1], "width") == 0) {
            int w = c_atoi(argv[2]);
            if (w >= 16) resize_surface(w, doc_height);
            return;
        } else if (c_strcasecmp(argv[1], "height") == 0) {
            int h = c_atoi(argv[2]);
            if (h >= 16) resize_surface(doc_width, h);
            return;
        }
    }
    // Backward compat: "canvas resize <w> <h>" or "set canvas size <w> <h>"
    if (c_strcasecmp(c0, "canvas") == 0 && argc >= 4 && c_strcasecmp(argv[1], "resize") == 0) {
        int w = c_atoi(argv[2]);
        int h = c_atoi(argv[3]);
        if (w >= 16 && h >= 16) resize_surface(w, h);
        return;
    }
    if (c_strcasecmp(c0, "set") == 0 && argc >= 5 && c_strcasecmp(argv[1], "canvas") == 0 && c_strcasecmp(argv[2], "size") == 0) {
        int w = c_atoi(argv[3]);
        int h = c_atoi(argv[4]);
        if (w >= 16 && h >= 16) resize_surface(w, h);
        return;
    }

    // 2. Layer commands
    if ((c_strcasecmp(c0, "layer") == 0 && argc >= 2 && (c_strcasecmp(argv[1], "add") == 0 || c_strcasecmp(argv[1], "new") == 0)) ||
        (c_strcasecmp(c0, "new") == 0 && argc >= 2 && c_strcasecmp(argv[1], "layer") == 0)) {
        add_new_layer_internal();
        return;
    }

    if ((c_strcasecmp(c0, "layer") == 0 && argc >= 3 && (c_strcasecmp(argv[1], "select") == 0 || c_strcasecmp(argv[1], "set") == 0)) ||
        (c_strcasecmp(c0, "set") == 0 && argc >= 3 && c_strcasecmp(argv[1], "layer") == 0)) {
        int lidx = c_atoi(argv[2]);
        if (lidx >= 0 && lidx < layer_count) active_layer = lidx;
        return;
    }

    if ((c_strcasecmp(c0, "layer") == 0 && argc >= 3 && c_strcasecmp(argv[1], "toggle") == 0) ||
        (c_strcasecmp(c0, "toggle") == 0 && argc >= 3 && c_strcasecmp(argv[1], "layer") == 0)) {
        int lidx = c_atoi(argv[2]);
        if (lidx >= 0 && lidx < layer_count) layers[lidx].visible = !layers[lidx].visible;
        return;
    }

    if ((c_strcasecmp(c0, "layer") == 0 && argc >= 4 && c_strcasecmp(argv[1], "opacity") == 0) ||
        (c_strcasecmp(c0, "opacity") == 0 && argc >= 4 && c_strcasecmp(argv[1], "layer") == 0)) {
        int lidx = c_atoi(argv[2]);
        int op = c_atoi(argv[3]);
        if (op < 0) op = 0; if (op > 100) op = 100;
        if (lidx >= 0 && lidx < layer_count) layers[lidx].opacity = (uint8_t)((op * 255) / 100);
        return;
    }

    if ((c_strcasecmp(c0, "layer") == 0 && argc >= 3 && c_strcasecmp(argv[1], "delete") == 0) ||
        (c_strcasecmp(c0, "delete") == 0 && argc >= 3 && c_strcasecmp(argv[1], "layer") == 0)) {
        int del_idx = c_atoi(argv[2]);
        if (del_idx >= 0 && del_idx < layer_count) {
            if (layer_count > 1) {
                uint32_t *recycled = layers[del_idx].pixels;
                for (int l = del_idx; l < layer_count - 1; l++) layers[l] = layers[l + 1];
                layers[layer_count - 1].pixels = recycled;
                clear_layer(&layers[layer_count - 1], doc_width * doc_height);
                layer_count--;
                if (active_layer >= layer_count) active_layer = layer_count - 1;
            } else {
                clear_layer(&layers[0], doc_width * doc_height);
            }
        }
        return;
    }

    if ((c_strcasecmp(c0, "layer") == 0 && argc >= 2 && c_strcasecmp(argv[1], "clear") == 0) ||
        (c_strcasecmp(c0, "clear") == 0 && argc >= 2 && c_strcasecmp(argv[1], "layer") == 0)) {
        if (active_layer >= 0 && active_layer < layer_count) {
            clear_layer(&layers[active_layer], doc_width * doc_height);
        }
        return;
    }

    // 3. Drawing commands
    if (c_strcasecmp(c0, "draw") == 0 && argc >= 6 && c_strcasecmp(argv[1], "line") == 0) {
        int x0 = c_atoi(argv[2]), y0 = c_atoi(argv[3]);
        int x1 = c_atoi(argv[4]), y1 = c_atoi(argv[5]);
        uint32_t col = (argc >= 7) ? c_parse_color(argv[6]) : current_color;
        draw_line(x0, y0, x1, y1, col);
        return;
    }

    if (c_strcasecmp(c0, "draw") == 0 && argc >= 6 && c_strcasecmp(argv[1], "rect") == 0) {
        int rx = c_atoi(argv[2]), ry = c_atoi(argv[3]);
        int rw = c_atoi(argv[4]), rh = c_atoi(argv[5]);
        uint32_t col = (argc >= 7) ? c_parse_color(argv[6]) : current_color;
        draw_rect(rx, ry, rw, rh, col);
        return;
    }

    if (c_strcasecmp(c0, "draw") == 0 && argc >= 5 && c_strcasecmp(argv[1], "circle") == 0) {
        int cx = c_atoi(argv[2]), cy = c_atoi(argv[3]), cr = c_atoi(argv[4]);
        uint32_t col = (argc >= 6) ? c_parse_color(argv[5]) : current_color;
        draw_circle(cx, cy, cr, col);
        return;
    }

    if (c_strcasecmp(c0, "draw") == 0 && argc >= 3 && c_strcasecmp(argv[1], "grid") == 0) {
        int step = c_atoi(argv[2]);
        uint32_t col = (argc >= 4) ? c_parse_color(argv[3]) : current_color;
        draw_grid(step, col);
        return;
    }

    // 4. Color setting
    if ((c_strcasecmp(c0, "color") == 0 && argc >= 3 && c_strcasecmp(argv[1], "set") == 0) ||
        (c_strcasecmp(c0, "set") == 0 && argc >= 3 && c_strcasecmp(argv[1], "color") == 0)) {
        current_color = c_parse_color(argv[2]);
        return;
    }
    if (c_strcasecmp(c0, "color") == 0 && argc == 2) {
        current_color = c_parse_color(argv[1]);
        return;
    }

    // 5. Composite
    if (c_strcasecmp(c0, "composite") == 0 || c_strcasecmp(c0, "refresh") == 0) {
        force_composite();
        return;
    }
}

void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;

    // Check if message is a text command
    int is_text = 1;
    for (int i = 0; i < len && i < 16; i++) {
        uint8_t b = piolho_page[i];
        if (b == 0) break;
        if (b < 32 && b != '\n' && b != '\r' && b != '\t') {
            is_text = 0;
            break;
        }
    }

    if (is_text) {
        char cmd_buf[512];
        int clen = (len < 511) ? len : 511;
        for (int i = 0; i < clen; i++) cmd_buf[i] = (char)piolho_page[i];
        cmd_buf[clen] = '\0';
        handle_text_command(cmd_buf);
        return;
    }

    if (len < 4) return;
    uint32_t type = *(uint32_t*)piolho_page;

    switch (type) {
        case MSG_CANVAS_RESIZE: {
            if (len >= 12) {
                wesenho_canvas_resize_msg_t *rmsg = (wesenho_canvas_resize_msg_t*)piolho_page;
                resize_surface(rmsg->width, rmsg->height);
            }
            break;
        }
        case MSG_SET_COLOR:
            current_color = *(uint32_t*)(piolho_page + 4);
            break;
        case MSG_EFFECT_CLEAR:
            if (active_layer >= 0 && active_layer < layer_count) {
                clear_layer(&layers[active_layer], doc_width * doc_height);
            }
            break;
        case MSG_LAYER_ADD:
            add_new_layer_internal();
            break;
        case MSG_LAYER_SELECT: {
            int lay_idx = *(int32_t*)(piolho_page + 4);
            if (lay_idx >= 0 && lay_idx < layer_count) {
                active_layer = lay_idx;
            }
            break;
        }
        case MSG_LAYER_TOGGLE_VIS: {
            int lay_idx = *(int32_t*)(piolho_page + 4);
            if (lay_idx >= 0 && lay_idx < layer_count) {
                layers[lay_idx].visible = !layers[lay_idx].visible;
            }
            break;
        }
        case MSG_LAYER_SET_OPACITY: {
            int lay_idx = *(int32_t*)(piolho_page + 4);
            int op = *(int32_t*)(piolho_page + 8);
            if (lay_idx >= 0 && lay_idx < layer_count) {
                if (op < 0) op = 0; if (op > 100) op = 100;
                layers[lay_idx].opacity = (uint8_t)((op * 255) / 100);
            }
            break;
        }
        case MSG_LAYER_DELETE: {
            int del_idx = *(int32_t*)(piolho_page + 4);
            if (del_idx >= 0 && del_idx < layer_count) {
                if (layer_count > 1) {
                    uint32_t *recycled = layers[del_idx].pixels;
                    for (int l = del_idx; l < layer_count - 1; l++) {
                        layers[l] = layers[l + 1];
                    }
                    layers[layer_count - 1].pixels = recycled;
                    clear_layer(&layers[layer_count - 1], doc_width * doc_height);
                    layer_count--;
                    if (active_layer >= layer_count) active_layer = layer_count - 1;
                } else {
                    clear_layer(&layers[0], doc_width * doc_height);
                }
            }
            break;
        }
        case MSG_DRAW_LINE: {
            int x0 = (int16_t)(*(uint32_t*)(piolho_page + 4) >> 16);
            int y0 = (int16_t)(*(uint32_t*)(piolho_page + 4) & 0xFFFF);
            int x1 = (int16_t)(*(uint32_t*)(piolho_page + 8) >> 16);
            int y1 = (int16_t)(*(uint32_t*)(piolho_page + 8) & 0xFFFF);
            draw_line(x0, y0, x1, y1, current_color);
            break;
        }
        case MSG_DRAW_RECT: {
            int rx = (int16_t)(*(uint32_t*)(piolho_page + 4) >> 16);
            int ry = (int16_t)(*(uint32_t*)(piolho_page + 4) & 0xFFFF);
            int rw = (int16_t)(*(uint32_t*)(piolho_page + 8) >> 16);
            int rh = (int16_t)(*(uint32_t*)(piolho_page + 8) & 0xFFFF);
            draw_rect(rx, ry, rw, rh, current_color);
            break;
        }
        case MSG_DRAW_CIRCLE: {
            int cx = (int16_t)(*(uint32_t*)(piolho_page + 4) >> 16);
            int cy = (int16_t)(*(uint32_t*)(piolho_page + 4) & 0xFFFF);
            int cr = (int)(*(uint32_t*)(piolho_page + 8));
            draw_circle(cx, cy, cr, current_color);
            break;
        }
        case MSG_DRAW_GRID: {
            int step = (int)(*(uint32_t*)(piolho_page + 4));
            draw_grid(step, current_color);
            break;
        }
    }
}

static int surface_initialized = 0;

int32_t update(void) {
    if (!surface_initialized) {
        surface_initialized = 1;
        fb = (wframebuffer_t*)ask("std:framebuffer");
        out_pixels = (uint32_t*)canvas_alloc(doc_width * doc_height * sizeof(uint32_t));
        add_new_layer_internal();
        composite_surface();
        sync_fb();
    }

    sync_fb();
    return UPDATE_OK;
}

uint32_t *get_active_layer_pixels(void) {
    if (active_layer >= 0 && active_layer < layer_count && layers) {
        return layers[active_layer].pixels;
    }
    return 0;
}

uint32_t *get_layer_pixels(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers) {
        return layers[idx].pixels;
    }
    return 0;
}

uint32_t *get_composite_pixels(void) {
    return out_pixels;
}

int32_t get_active_layer(void) {
    return active_layer;
}

int32_t get_layer_count(void) {
    return layer_count;
}

int32_t get_width(void) {
    return doc_width;
}

int32_t get_height(void) {
    return doc_height;
}

// Backward-compat aliases
int32_t get_canvas_width(void) {
    return doc_width;
}

int32_t get_canvas_height(void) {
    return doc_height;
}

int32_t get_canvas_count(void) {
    return 1;
}

int32_t get_active_canvas(void) {
    return 0;
}

const char *get_canvas_name(int32_t idx) {
    return "main";
}

uint8_t get_layer_visible(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers) {
        return layers[idx].visible;
    }
    return 0;
}

uint8_t get_layer_opacity(int32_t idx) {
    if (idx >= 0 && idx < layer_count && layers) {
        return layers[idx].opacity;
    }
    return 0;
}
