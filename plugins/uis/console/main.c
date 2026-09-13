#include "../../../include/wesenho.h"
#include "../../../include/font5x7.h"

#define CONSOLE_WIDTH   400
#define CONSOLE_HEIGHT  210
#define MAX_LOG_LINES   12
#define MAX_LINE_LEN    64
#define MAX_HISTORY     16
#define MAX_TOKENS      12
#define MAX_CONSOLE_LAYERS 256
#define MAX_CONSOLE_CANVASES 64

static wframebuffer_t *fb = 0;
static wmouse_t       *mouse = 0;
static wkeyboard_t    *kb = 0;

static uint32_t pixels[CONSOLE_WIDTH * CONSOLE_HEIGHT];

// Terminal State
static char log_lines[MAX_LOG_LINES][MAX_LINE_LEN];
static uint32_t log_colors[MAX_LOG_LINES];
static int log_count = 0;

static char input_buf[MAX_LINE_LEN];
static int input_len = 0;
static int cursor_blink = 0;

// Command History
static char history[MAX_HISTORY][MAX_LINE_LEN];
static int history_count = 0;
static int history_idx = -1;

// Canvas Registry Mirror
static char     canvas_names[MAX_CONSOLE_CANVASES][24];
static uint32_t canvas_widths[MAX_CONSOLE_CANVASES];
static uint32_t canvas_heights[MAX_CONSOLE_CANVASES];
static int      canvas_count = 1;
static int      active_canvas = 0;

// Layer Registry Mirror
static char layer_names[MAX_CONSOLE_LAYERS][16];
static uint8_t layer_vis[MAX_CONSOLE_LAYERS];
static uint8_t layer_op[MAX_CONSOLE_LAYERS];
static int layer_count = 1;
static int active_layer = 0;

static uint8_t prev_keys[256];
static uint8_t key_hold[256];

static inline int is_key_triggered(uint8_t sc, int initial_delay, int repeat_rate) {
    if (!kb) return 0;
    if (kb->keys[sc]) {
        key_hold[sc]++;
        if (key_hold[sc] == 1) return 1;
        if (key_hold[sc] > initial_delay && ((key_hold[sc] - initial_delay) % repeat_rate == 0)) return 1;
    } else {
        key_hold[sc] = 0;
    }
    return 0;
}

static int str_len(const char *s) {
    int l = 0;
    while (s && s[l] != '\0' && l < 100) l++;
    return l;
}

static int str_cmp(const char *a, const char *b) {
    int i = 0;
    while (a[i] && b[i]) {
        char ca = (a[i] >= 'A' && a[i] <= 'Z') ? (a[i] + 32) : a[i];
        char cb = (b[i] >= 'A' && b[i] <= 'Z') ? (b[i] + 32) : b[i];
        if (ca != cb) return ca - cb;
        i++;
    }
    return (unsigned char)a[i] - (unsigned char)b[i];
}

static void str_copy(char *dst, const char *src, int max_len) {
    int i = 0;
    while (src[i] && i < max_len - 1) {
        dst[i] = src[i];
        i++;
    }
    dst[i] = '\0';
}

static void log_print(const char *str, uint32_t color) {
    if (log_count < MAX_LOG_LINES) {
        str_copy(log_lines[log_count], str, MAX_LINE_LEN);
        log_colors[log_count] = color;
        log_count++;
    } else {
        for (int i = 0; i < MAX_LOG_LINES - 1; i++) {
            str_copy(log_lines[i], log_lines[i + 1], MAX_LINE_LEN);
            log_colors[i] = log_colors[i + 1];
        }
        str_copy(log_lines[MAX_LOG_LINES - 1], str, MAX_LINE_LEN);
        log_colors[MAX_LOG_LINES - 1] = color;
    }
}

static void int_to_str(int val, char *buf) {
    if (val == 0) { buf[0] = '0'; buf[1] = '\0'; return; }
    int neg = 0;
    if (val < 0) { neg = 1; val = -val; }
    char tmp[16];
    int idx = 0;
    while (val > 0) {
        tmp[idx++] = '0' + (val % 10);
        val /= 10;
    }
    int out = 0;
    if (neg) buf[out++] = '-';
    for (int i = idx - 1; i >= 0; i--) buf[out++] = tmp[i];
    buf[out] = '\0';
}

static void send_msg(uint32_t type, uint32_t p1, uint32_t p2, uint32_t p3) {
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;
    msg->type = type;
    msg->param1 = p1;
    msg->param2 = p2;
    msg->param3 = p3;
    say(ACTOR_CANVAS, sizeof(wesenho_msg_t));
}

static int is_digit(char c) { return c >= '0' && c <= '9'; }
static int is_hex(char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

static int hex_val(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return 0;
}

static int parse_int(const char *s, int32_t *out) {
    int i = 0;
    int neg = 0;
    if (s[0] == '-') { neg = 1; i++; }
    if (!s[i]) return 0;
    int32_t res = 0;
    while (s[i]) {
        if (!is_digit(s[i])) return 0;
        res = res * 10 + (s[i] - '0');
        i++;
    }
    *out = neg ? -res : res;
    return 1;
}

static int parse_hex_color(const char *s, int32_t *out) {
    if (s[0] != '#' && s[0] != '$') return 0;
    int i = 1;
    uint32_t col = 0;
    int digits = 0;
    while (s[i] && digits < 6) {
        if (!is_hex(s[i])) return 0;
        col = (col << 4) | hex_val(s[i]);
        i++;
        digits++;
    }
    if (digits == 6) {
        uint32_t r = (col >> 16) & 0xFF;
        uint32_t g = (col >> 8) & 0xFF;
        uint32_t b = col & 0xFF;
        *out = (int32_t)(0xFF000000 | (b << 16) | (g << 8) | r);
        return 1;
    }
    return 0;
}

static int parse_color_token(const char *tok, uint32_t *out) {
    int32_t hex = 0;
    if (parse_hex_color(tok, &hex)) { *out = (uint32_t)hex; return 1; }
    if (str_cmp(tok, "black") == 0)   { *out = 0xFF000000; return 1; }
    if (str_cmp(tok, "white") == 0)   { *out = 0xFFFFFFFF; return 1; }
    if (str_cmp(tok, "red") == 0)     { *out = 0xFF0000FF; return 1; }
    if (str_cmp(tok, "green") == 0)   { *out = 0xFF00FF00; return 1; }
    if (str_cmp(tok, "blue") == 0)    { *out = 0xFFFF0000; return 1; }
    if (str_cmp(tok, "yellow") == 0)  { *out = 0xFF00FFFF; return 1; }
    if (str_cmp(tok, "cyan") == 0)    { *out = 0xFFFFFF00; return 1; }
    if (str_cmp(tok, "magenta") == 0) { *out = 0xFFFF00FF; return 1; }
    if (str_cmp(tok, "orange") == 0)  { *out = 0xFF0080FF; return 1; }
    if (str_cmp(tok, "gray") == 0)    { *out = 0xFF808080; return 1; }
    return 0;
}

static int find_canvas_idx(const char *tok) {
    if (!tok || !tok[0]) return -1;
    int32_t id = -1;
    if (parse_int(tok, &id)) {
        if (id >= 0 && id < canvas_count) return id;
    }
    for (int i = 0; i < canvas_count; i++) {
        if (str_cmp(canvas_names[i], tok) == 0) return i;
    }
    return -1;
}

static int find_layer_idx(const char *tok) {
    if (!tok || !tok[0]) return -1;
    int32_t id = -1;
    if (parse_int(tok, &id)) {
        if (id >= 0 && id < layer_count) return id;
    }
    for (int i = 0; i < layer_count; i++) {
        if (str_cmp(layer_names[i], tok) == 0) return i;
    }
    return -1;
}

static void send_canvas_new(const char *name, uint32_t width, uint32_t height) {
    wesenho_canvas_new_msg_t *nmsg = (wesenho_canvas_new_msg_t*)piolho_page;
    nmsg->type = MSG_CANVAS_NEW;
    nmsg->width = width;
    nmsg->height = height;
    str_copy(nmsg->name, name, 24);
    say(ACTOR_CANVAS, sizeof(wesenho_canvas_new_msg_t));
}

static void send_canvas_select(int idx, const char *name) {
    wesenho_canvas_select_msg_t *smsg = (wesenho_canvas_select_msg_t*)piolho_page;
    smsg->type = MSG_CANVAS_SELECT;
    smsg->canvas_idx = idx;
    str_copy(smsg->name, name ? name : "", 24);
    say(ACTOR_CANVAS, sizeof(wesenho_canvas_select_msg_t));
}

static void send_canvas_resize(uint32_t w, uint32_t h) {
    wesenho_canvas_resize_msg_t *rmsg = (wesenho_canvas_resize_msg_t*)piolho_page;
    rmsg->type = MSG_CANVAS_RESIZE;
    rmsg->width = w;
    rmsg->height = h;
    say(ACTOR_CANVAS, sizeof(wesenho_canvas_resize_msg_t));
}

static void send_canvas_delete(int idx, const char *name) {
    wesenho_canvas_select_msg_t *dmsg = (wesenho_canvas_select_msg_t*)piolho_page;
    dmsg->type = MSG_CANVAS_DELETE;
    dmsg->canvas_idx = idx;
    str_copy(dmsg->name, name ? name : "", 24);
    say(ACTOR_CANVAS, sizeof(wesenho_canvas_select_msg_t));
}

static void send_canvas_rename(int idx, const char *name) {
    wesenho_canvas_rename_msg_t *rnmsg = (wesenho_canvas_rename_msg_t*)piolho_page;
    rnmsg->type = MSG_CANVAS_RENAME;
    rnmsg->canvas_idx = idx;
    str_copy(rnmsg->name, name, 24);
    say(ACTOR_CANVAS, sizeof(wesenho_canvas_rename_msg_t));
}

static void send_layer_rename(int idx, const char *name) {
    str_copy(layer_names[idx], name, 16);
    uint32_t p2 = 0;
    uint32_t p3 = 0;
    for (int i = 0; i < 4 && name[i]; i++) p2 |= ((uint8_t)name[i]) << (i * 8);
    for (int i = 0; i < 4 && name[4 + i]; i++) p3 |= ((uint8_t)name[4 + i]) << (i * 8);
    send_msg(MSG_LAYER_RENAME, (uint32_t)idx, p2, p3);
}

static void send_filter(const char *name, int32_t p1, int32_t p2) {
    wesenho_filter_msg_t *fmsg = (wesenho_filter_msg_t*)piolho_page;
    fmsg->type = MSG_APPLY_FILTER;
    str_copy(fmsg->name, name, 20);
    fmsg->param1 = p1;
    fmsg->param2 = p2;
    say(ACTOR_BROKER, sizeof(wesenho_filter_msg_t));
}

static void send_set_brush(const char *name) {
    wesenho_active_brush_msg_t *bmsg = (wesenho_active_brush_msg_t*)piolho_page;
    bmsg->type = MSG_SET_ACTIVE_BRUSH;
    str_copy(bmsg->name, name, 20);
    say(ACTOR_BROKER, sizeof(wesenho_active_brush_msg_t));
}

static void send_brush_param(uint32_t param_id, int32_t val, const char *name) {
    wesenho_brush_param_msg_t *pmsg = (wesenho_brush_param_msg_t*)piolho_page;
    pmsg->type = MSG_BRUSH_SET_PARAM;
    pmsg->param_id = param_id;
    pmsg->value = val;
    str_copy(pmsg->param_name, name ? name : "", 16);
    say(ACTOR_BROKER, sizeof(wesenho_brush_param_msg_t));
}

static void send_set_texture(const char *name) {
    wesenho_active_texture_msg_t *tmsg = (wesenho_active_texture_msg_t*)piolho_page;
    tmsg->type = MSG_TEXTURE_SET_ACTIVE;
    str_copy(tmsg->name, name, 24);
    say(ACTOR_BROKER, sizeof(wesenho_active_texture_msg_t));
}

static void send_layer_to_texture(int layer_idx, const char *name) {
    wesenho_layer_texture_msg_t *ltmsg = (wesenho_layer_texture_msg_t*)piolho_page;
    ltmsg->type = MSG_LAYER_TO_TEXTURE;
    ltmsg->layer_idx = layer_idx;
    str_copy(ltmsg->name, name, 24);
    say(ACTOR_BROKER, sizeof(wesenho_layer_texture_msg_t));
}

static void send_save_image(int target, const char *path) {
    wesenho_image_io_msg_t *smsg = (wesenho_image_io_msg_t*)piolho_page;
    smsg->type = MSG_SAVE_IMAGE;
    smsg->target = target;
    str_copy(smsg->filepath, path, 64);
    smsg->name[0] = '\0';
    say(ACTOR_BROKER, sizeof(wesenho_image_io_msg_t));
}

static void send_load_image(int target, const char *path, const char *tex_name) {
    wesenho_image_io_msg_t *lmsg = (wesenho_image_io_msg_t*)piolho_page;
    lmsg->type = MSG_LOAD_IMAGE;
    lmsg->target = target;
    str_copy(lmsg->filepath, path, 64);
    str_copy(lmsg->name, tex_name ? tex_name : "", 24);
    say(ACTOR_BROKER, sizeof(wesenho_image_io_msg_t));
}

static void list_canvases(void) {
    log_print("--- CANVASES ---", 0xFF00FFCC);
    for (int i = 0; i < canvas_count; i++) {
        char line[MAX_LINE_LEN] = "[";
        char num[8];
        int_to_str(i, num);
        int p = 1;
        for (int k = 0; num[k]; k++) line[p++] = num[k];
        line[p++] = ']'; line[p++] = ' ';
        for (int k = 0; canvas_names[i][k] && p < 20; k++) line[p++] = canvas_names[i][k];
        while (p < 22) line[p++] = ' ';
        line[p++] = '(';
        int_to_str(canvas_widths[i], num);
        for (int k = 0; num[k]; k++) line[p++] = num[k];
        line[p++] = 'x';
        int_to_str(canvas_heights[i], num);
        for (int k = 0; num[k]; k++) line[p++] = num[k];
        line[p++] = ')';
        if (i == active_canvas) {
            line[p++] = ' '; line[p++] = '<'; line[p++] = '*'; line[p++] = '>';
        }
        line[p] = '\0';
        log_print(line, (i == active_canvas) ? 0xFFFFFFFF : 0xFFAABBCC);
    }
}

static void list_layers(void) {
    log_print("--- LAYERS ---", 0xFF00FFCC);
    for (int i = 0; i < layer_count; i++) {
        char line[MAX_LINE_LEN] = "[";
        char num[8];
        int_to_str(i, num);
        int p = 1;
        for (int k = 0; num[k]; k++) line[p++] = num[k];
        line[p++] = ']'; line[p++] = ' ';
        for (int k = 0; layer_names[i][k] && p < 24; k++) line[p++] = layer_names[i][k];
        while (p < 25) line[p++] = ' ';

        // Visibility & Opacity
        line[p++] = layer_vis[i] ? 'V' : '.';
        line[p++] = ' ';
        int_to_str(layer_op[i], num);
        for (int k = 0; num[k]; k++) line[p++] = num[k];
        line[p++] = '%';
        if (i == active_layer) {
            line[p++] = ' '; line[p++] = '<'; line[p++] = '*'; line[p++] = '>';
        }
        line[p] = '\0';
        log_print(line, (i == active_layer) ? 0xFFFFFFFF : 0xFFAABBCC);
    }
}

static void execute_sexpr(char tokens[MAX_TOKENS][32], int ntok) {
    if (ntok == 0) return;

    // 1. Math S-expressions
    if (ntok == 3 && (str_cmp(tokens[0], "+") == 0 || str_cmp(tokens[0], "-") == 0 ||
                      str_cmp(tokens[0], "*") == 0 || str_cmp(tokens[0], "/") == 0)) {
        int32_t a = 0, b = 0;
        parse_int(tokens[1], &a);
        parse_int(tokens[2], &b);
        int32_t res = 0;
        if (tokens[0][0] == '+') res = a + b;
        else if (tokens[0][0] == '-') res = a - b;
        else if (tokens[0][0] == '*') res = a * b;
        else if (tokens[0][0] == '/') res = (b != 0) ? (a / b) : 0;
        char out[MAX_LINE_LEN] = "=> ";
        char num[16];
        int_to_str(res, num);
        for (int i = 0; num[i]; i++) out[3 + i] = num[i];
        out[3 + str_len(num)] = '\0';
        log_print(out, 0xFF00FF88);
        return;
    }

    // 2. new canvas ["name"] [w] [h]
    if (str_cmp(tokens[0], "new") == 0 && ntok >= 2 && str_cmp(tokens[1], "canvas") == 0) {
        if (canvas_count < MAX_CONSOLE_CANVASES) {
            const char *cname = (ntok >= 3) ? tokens[2] : "canvas";
            int32_t w = 800, h = 1000;
            if (ntok >= 4) parse_int(tokens[3], &w);
            if (ntok >= 5) parse_int(tokens[4], &h);
            if (w < 16) w = 800;
            if (h < 16) h = 1000;

            int new_idx = canvas_count;
            str_copy(canvas_names[new_idx], cname, 24);
            canvas_widths[new_idx] = w;
            canvas_heights[new_idx] = h;
            active_canvas = new_idx;
            canvas_count++;

            send_canvas_new(cname, (uint32_t)w, (uint32_t)h);
            char out[MAX_LINE_LEN] = "ok: new canvas created ";
            str_copy(out + str_len(out), cname, 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: max canvases reached (64)", 0xFFFF5555);
        }
        return;
    }

    // 3. set / select canvas <name|id> | set canvas width <x> | set canvas height <y> | set canvas size <w> <h>
    if (str_cmp(tokens[0], "set") == 0 && ntok >= 3 && str_cmp(tokens[1], "canvas") == 0) {
        if (str_cmp(tokens[2], "width") == 0 && ntok >= 4) {
            int32_t w = 800;
            parse_int(tokens[3], &w);
            if (w >= 16 && w <= 4096) {
                canvas_widths[active_canvas] = w;
                send_canvas_resize((uint32_t)w, canvas_heights[active_canvas]);
                log_print("ok: canvas width updated", 0xFF00FF88);
            }
            return;
        } else if (str_cmp(tokens[2], "height") == 0 && ntok >= 4) {
            int32_t h = 1000;
            parse_int(tokens[3], &h);
            if (h >= 16 && h <= 4096) {
                canvas_heights[active_canvas] = h;
                send_canvas_resize(canvas_widths[active_canvas], (uint32_t)h);
                log_print("ok: canvas height updated", 0xFF00FF88);
            }
            return;
        } else if (str_cmp(tokens[2], "size") == 0 && ntok >= 5) {
            int32_t w = 800, h = 1000;
            parse_int(tokens[3], &w);
            parse_int(tokens[4], &h);
            if (w >= 16 && h >= 16) {
                canvas_widths[active_canvas] = w;
                canvas_heights[active_canvas] = h;
                send_canvas_resize((uint32_t)w, (uint32_t)h);
                log_print("ok: canvas resized", 0xFF00FF88);
            }
            return;
        } else {
            int idx = find_canvas_idx(tokens[2]);
            if (idx >= 0) {
                active_canvas = idx;
                send_canvas_select(idx, tokens[2]);
                char out[MAX_LINE_LEN] = "ok: selected canvas ";
                str_copy(out + str_len(out), canvas_names[idx], 20);
                log_print(out, 0xFF00FF88);
            } else {
                log_print("err: canvas not found", 0xFFFF5555);
            }
            return;
        }
    }

    // 4. select canvas <name|id> | canvas <name|id>
    if ((str_cmp(tokens[0], "select") == 0 && ntok >= 2 && str_cmp(tokens[1], "canvas") == 0) ||
        (str_cmp(tokens[0], "canvas") == 0 && ntok >= 2 && str_cmp(tokens[1], "list") != 0 && str_cmp(tokens[1], "resize") != 0)) {
        const char *target = (str_cmp(tokens[0], "select") == 0) ? (ntok >= 3 ? tokens[2] : "") : tokens[1];
        int idx = find_canvas_idx(target);
        if (idx >= 0) {
            active_canvas = idx;
            send_canvas_select(idx, target);
            char out[MAX_LINE_LEN] = "ok: selected canvas ";
            str_copy(out + str_len(out), canvas_names[idx], 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: canvas not found", 0xFFFF5555);
        }
        return;
    }

    // 5. delete canvas <name|id>
    if ((str_cmp(tokens[0], "delete") == 0 || str_cmp(tokens[0], "remove") == 0) && ntok >= 2 && str_cmp(tokens[1], "canvas") == 0) {
        const char *target = (ntok >= 3) ? tokens[2] : "";
        int idx = find_canvas_idx(target);
        if (idx >= 0) {
            send_canvas_delete(idx, target);
            if (canvas_count > 1) {
                for (int c = idx; c < canvas_count - 1; c++) {
                    str_copy(canvas_names[c], canvas_names[c + 1], 24);
                    canvas_widths[c] = canvas_widths[c + 1];
                    canvas_heights[c] = canvas_heights[c + 1];
                }
                canvas_count--;
                if (active_canvas >= canvas_count) active_canvas = canvas_count - 1;
            }
            char out[MAX_LINE_LEN] = "ok: deleted canvas ";
            str_copy(out + str_len(out), target, 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: canvas not found", 0xFFFF5555);
        }
        return;
    }

    // 6. canvases / canvas list / list canvases
    if (str_cmp(tokens[0], "canvases") == 0 ||
        (str_cmp(tokens[0], "canvas") == 0 && ntok == 1) ||
        (str_cmp(tokens[0], "canvas") == 0 && ntok >= 2 && str_cmp(tokens[1], "list") == 0) ||
        (str_cmp(tokens[0], "list") == 0 && ntok >= 2 && str_cmp(tokens[1], "canvases") == 0)) {
        list_canvases();
        return;
    }

    // 7. canvas resize <w> <h>
    if (str_cmp(tokens[0], "canvas") == 0 && ntok >= 4 && str_cmp(tokens[1], "resize") == 0) {
        int32_t w = 800, h = 1000;
        parse_int(tokens[2], &w);
        parse_int(tokens[3], &h);
        if (w >= 16 && h >= 16) {
            canvas_widths[active_canvas] = w;
            canvas_heights[active_canvas] = h;
            send_canvas_resize((uint32_t)w, (uint32_t)h);
            log_print("ok: canvas resized", 0xFF00FF88);
        }
        return;
    }

    // 8. new layer ["name"]
    if (str_cmp(tokens[0], "new") == 0 && ntok >= 2 && str_cmp(tokens[1], "layer") == 0) {
        if (layer_count < MAX_CONSOLE_LAYERS) {
            int new_idx = layer_count;
            layer_vis[new_idx] = 1;
            layer_op[new_idx] = 100;
            if (ntok >= 3) {
                str_copy(layer_names[new_idx], tokens[2], 16);
                send_msg(MSG_LAYER_ADD, 0, 0, 0);
                send_layer_rename(new_idx, tokens[2]);
            } else {
                char def_name[16] = "Layer ";
                char num[8];
                int_to_str(new_idx, num);
                str_copy(def_name + 6, num, 8);
                str_copy(layer_names[new_idx], def_name, 16);
                send_msg(MSG_LAYER_ADD, 0, 0, 0);
            }
            active_layer = new_idx;
            layer_count++;
            char out[MAX_LINE_LEN] = "ok: new layer created ";
            if (ntok >= 3) str_copy(out + str_len(out), tokens[2], 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: max layers reached (256)", 0xFFFF5555);
        }
        return;
    }

    // 9. set / select current_layer / layer <target>
    if ((str_cmp(tokens[0], "set") == 0 && ntok >= 3 && (str_cmp(tokens[1], "current_layer") == 0 || str_cmp(tokens[1], "layer") == 0)) ||
        (str_cmp(tokens[0], "select") == 0 && ntok >= 2 && str_cmp(tokens[1], "canvas") != 0)) {
        const char *target = (str_cmp(tokens[0], "select") == 0) ? (ntok >= 3 && str_cmp(tokens[1], "layer") == 0 ? tokens[2] : tokens[1]) : tokens[2];
        int idx = find_layer_idx(target);
        if (idx >= 0) {
            active_layer = idx;
            send_msg(MSG_LAYER_SELECT, (uint32_t)idx, 0, 0);
            char out[MAX_LINE_LEN] = "ok: selected layer ";
            str_copy(out + str_len(out), layer_names[idx], 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: layer not found", 0xFFFF5555);
        }
        return;
    }

    // 10. rename layer / current_layer / canvas
    if (str_cmp(tokens[0], "rename") == 0 && ntok >= 3) {
        if (str_cmp(tokens[1], "canvas") == 0) {
            const char *new_name = (ntok >= 4) ? tokens[3] : tokens[2];
            int idx = (ntok >= 4) ? find_canvas_idx(tokens[2]) : active_canvas;
            if (idx >= 0) {
                str_copy(canvas_names[idx], new_name, 24);
                send_canvas_rename(idx, new_name);
                log_print("ok: canvas renamed", 0xFF00FF88);
            }
            return;
        }

        int idx = active_layer;
        const char *new_name = tokens[2];
        if (str_cmp(tokens[1], "layer") == 0 && ntok >= 4) {
            idx = find_layer_idx(tokens[2]);
            new_name = tokens[3];
        }
        if (idx >= 0) {
            send_layer_rename(idx, new_name);
            char out[MAX_LINE_LEN] = "ok: renamed layer to ";
            str_copy(out + str_len(out), new_name, 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: layer not found", 0xFFFF5555);
        }
        return;
    }

    // 11. delete layer <target>
    if ((str_cmp(tokens[0], "delete") == 0 || str_cmp(tokens[0], "remove") == 0) && str_cmp(tokens[1], "canvas") != 0) {
        const char *target = (ntok >= 3 && str_cmp(tokens[1], "layer") == 0) ? tokens[2] : (ntok >= 2 ? tokens[1] : "");
        int idx = find_layer_idx(target);
        if (idx >= 0) {
            send_msg(MSG_LAYER_DELETE, (uint32_t)idx, 0, 0);
            if (layer_count > 1) {
                for (int l = idx; l < layer_count - 1; l++) {
                    layer_vis[l] = layer_vis[l + 1];
                    layer_op[l] = layer_op[l + 1];
                    str_copy(layer_names[l], layer_names[l + 1], 16);
                }
                layer_count--;
                if (active_layer >= layer_count) active_layer = layer_count - 1;
            }
            char out[MAX_LINE_LEN] = "ok: deleted layer ";
            str_copy(out + str_len(out), target, 20);
            log_print(out, 0xFF00FF88);
        } else {
            log_print("err: layer not found", 0xFFFF5555);
        }
        return;
    }

    // 12. layer to_texture <name>
    if (str_cmp(tokens[0], "layer") == 0 && ntok >= 3 && (str_cmp(tokens[1], "to_texture") == 0 || str_cmp(tokens[1], "texture") == 0)) {
        send_layer_to_texture(active_layer, tokens[2]);
        return;
    }

    // 13. layers / list layers
    if (str_cmp(tokens[0], "layer") == 0 || str_cmp(tokens[0], "layers") == 0 ||
        (str_cmp(tokens[0], "list") == 0 && ntok >= 2 && str_cmp(tokens[1], "layers") == 0)) {
        list_layers();
        return;
    }

    // 14. toggle / hide / show layer [target]
    if (str_cmp(tokens[0], "toggle") == 0 || str_cmp(tokens[0], "hide") == 0 || str_cmp(tokens[0], "show") == 0) {
        int idx = active_layer;
        if (ntok >= 2) {
            const char *target = (ntok >= 3 && str_cmp(tokens[1], "layer") == 0) ? tokens[2] : tokens[1];
            int f = find_layer_idx(target);
            if (f >= 0) idx = f;
        }
        send_msg(MSG_LAYER_TOGGLE_VIS, (uint32_t)idx, 0, 0);
        layer_vis[idx] = !layer_vis[idx];
        log_print("ok: layer visibility toggled", 0xFF00FF88);
        return;
    }

    // 15. set opacity <val> [layer]
    if (str_cmp(tokens[0], "set") == 0 && (str_cmp(tokens[1], "opacity") == 0 || (ntok >= 4 && str_cmp(tokens[2], "opacity") == 0))) {
        int32_t op = 100;
        int idx = active_layer;
        int val_tok = (str_cmp(tokens[1], "opacity") == 0) ? 2 : 3;
        if (ntok > val_tok) parse_int(tokens[val_tok], &op);
        if (ntok > val_tok + 1) {
            int f = find_layer_idx(tokens[val_tok + 1]);
            if (f >= 0) idx = f;
        }
        send_msg(MSG_LAYER_SET_OPACITY, (uint32_t)idx, (uint32_t)op, 0);
        layer_op[idx] = (uint8_t)op;
        log_print("ok: opacity set", 0xFF00FF88);
        return;
    }

    // 16. set color
    if (str_cmp(tokens[0], "set") == 0 && str_cmp(tokens[1], "color") == 0 && ntok >= 3) {
        uint32_t col = 0;
        if (str_cmp(tokens[2], "rgb") == 0 && ntok >= 6) {
            int32_t r = 0, g = 0, b = 0;
            parse_int(tokens[3], &r);
            parse_int(tokens[4], &g);
            parse_int(tokens[5], &b);
            col = 0xFF000000 | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
            send_msg(MSG_SET_COLOR, col, 0, 0);
            log_print("ok: color set (RGB)", 0xFF00FF88);
            return;
        } else if (parse_color_token(tokens[2], &col)) {
            send_msg(MSG_SET_COLOR, col, 0, 0);
            log_print("ok: color set", 0xFF00FF88);
            return;
        }
    }

    // 17. Texture commands
    if (str_cmp(tokens[0], "texture") == 0 || (str_cmp(tokens[0], "set") == 0 && str_cmp(tokens[1], "texture") == 0)) {
        if (ntok == 1 || (ntok == 2 && str_cmp(tokens[1], "list") == 0)) {
            log_print("--- TEXTURES ---", 0xFF00FFCC);
            log_print("paper, canvas, noise, dots, grid, grunge", 0xFFAABBCC);
            log_print("Usage: texture <name> | layer to_texture <name>", 0xFF888888);
            return;
        }
        const char *tname = (str_cmp(tokens[0], "set") == 0) ? tokens[2] : tokens[1];
        send_set_texture(tname);
        return;
    }

    if (str_cmp(tokens[0], "textures") == 0) {
        log_print("--- TEXTURES ---", 0xFF00FFCC);
        log_print("paper, canvas, noise, dots, grid, grunge", 0xFFAABBCC);
        return;
    }

    // 18. Save / Load Image commands
    if (str_cmp(tokens[0], "save") == 0 && ntok >= 2) {
        const char *fpath = (ntok >= 3 && (str_cmp(tokens[1], "image") == 0 || str_cmp(tokens[1], "canvas") == 0)) ? tokens[2] : tokens[1];
        int target = 0;
        if (ntok >= 3 && str_cmp(tokens[1], "layer") == 0) {
            target = 1;
            fpath = tokens[2];
        }
        send_save_image(target, fpath);
        return;
    }

    if (str_cmp(tokens[0], "load") == 0 && ntok >= 2) {
        if (str_cmp(tokens[1], "texture") == 0 && ntok >= 3) {
            const char *tname = (ntok >= 4) ? tokens[3] : "";
            send_load_image(2, tokens[2], tname);
            return;
        }
        int target = 0;
        const char *fpath = tokens[1];
        if (str_cmp(tokens[1], "image") == 0 && ntok >= 3) {
            fpath = tokens[2];
        } else if (str_cmp(tokens[1], "layer") == 0 && ntok >= 3) {
            target = 1;
            fpath = tokens[2];
        }
        send_load_image(target, fpath, "");
        return;
    }

    // 19. brush commands
    if (str_cmp(tokens[0], "brush") == 0 || (str_cmp(tokens[0], "set") == 0 && str_cmp(tokens[1], "brush") == 0)) {
        if (ntok == 1 || (ntok == 2 && str_cmp(tokens[1], "list") == 0)) {
            log_print("--- WASM BRUSHES ---", 0xFF00FFCC);
            log_print("round, airbrush, pixel, calligraphy, fill", 0xFFAABBCC);
            log_print("lasso_fill, smudge, scatter, hatch, charcoal, blend", 0xFFAABBCC);
            return;
        }

        const char *arg1 = (str_cmp(tokens[0], "set") == 0) ? tokens[2] : tokens[1];
        const char *arg2 = (str_cmp(tokens[0], "set") == 0) ? (ntok >= 4 ? tokens[3] : "") : (ntok >= 3 ? tokens[2] : "");

        int32_t val = 0;
        if (arg2[0] && (parse_int(arg2, &val) || str_cmp(arg2, "off") == 0 || str_cmp(arg2, "grain") == 0 || str_cmp(arg2, "pattern") == 0)) {
            uint32_t pid = 0;
            if (str_cmp(arg1, "size") == 0) pid = BRUSH_PARAM_SIZE;
            else if (str_cmp(arg1, "opacity") == 0 || str_cmp(arg1, "alpha") == 0) pid = BRUSH_PARAM_OPACITY;
            else if (str_cmp(arg1, "hardness") == 0) pid = BRUSH_PARAM_HARDNESS;
            else if (str_cmp(arg1, "flow") == 0) pid = BRUSH_PARAM_FLOW;
            else if (str_cmp(arg1, "spacing") == 0) pid = BRUSH_PARAM_SPACING;
            else if (str_cmp(arg1, "angle") == 0 || str_cmp(arg1, "rotation") == 0) pid = BRUSH_PARAM_ANGLE;
            else if (str_cmp(arg1, "roundness") == 0 || str_cmp(arg1, "aspect") == 0) pid = BRUSH_PARAM_ROUNDNESS;
            else if (str_cmp(arg1, "scatter") == 0) pid = BRUSH_PARAM_SCATTER;
            else if (str_cmp(arg1, "tolerance") == 0 || str_cmp(arg1, "tol") == 0) pid = BRUSH_PARAM_TOLERANCE;
            else if (str_cmp(arg1, "density") == 0 || str_cmp(arg1, "count") == 0) pid = BRUSH_PARAM_DENSITY;
            else if (str_cmp(arg1, "wetness") == 0 || str_cmp(arg1, "wet") == 0) pid = BRUSH_PARAM_WETNESS;
            else if (str_cmp(arg1, "grain") == 0) pid = BRUSH_PARAM_GRAIN;
            else if (str_cmp(arg1, "texture_mode") == 0 || str_cmp(arg1, "tex_mode") == 0) {
                pid = BRUSH_PARAM_TEXTURE_MODE;
                if (str_cmp(arg2, "off") == 0) val = 0;
                else if (str_cmp(arg2, "grain") == 0 || str_cmp(arg2, "mask") == 0) val = 1;
                else if (str_cmp(arg2, "pattern") == 0) val = 2;
            }
            else if (str_cmp(arg1, "texture_scale") == 0 || str_cmp(arg1, "tex_scale") == 0) pid = BRUSH_PARAM_TEXTURE_SCALE;
            else if (str_cmp(arg1, "texture_strength") == 0 || str_cmp(arg1, "tex_strength") == 0) pid = BRUSH_PARAM_TEXTURE_STRENGTH;

            if (pid > 0) {
                send_brush_param(pid, val, arg1);
                char out[MAX_LINE_LEN] = "ok: brush ";
                str_copy(out + str_len(out), arg1, 16);
                str_copy(out + str_len(out), " set to ", 10);
                str_copy(out + str_len(out), arg2, 10);
                log_print(out, 0xFF00FF88);
                return;
            }
        }

        send_set_brush(arg1);
        char out[MAX_LINE_LEN] = "ok: active brush set to ";
        str_copy(out + str_len(out), arg1, 20);
        log_print(out, 0xFF00FF88);
        return;
    }

    if (str_cmp(tokens[0], "brushes") == 0) {
        log_print("--- WASM BRUSHES ---", 0xFF00FFCC);
        log_print("round, airbrush, pixel, calligraphy, fill", 0xFFAABBCC);
        log_print("lasso_fill, smudge, scatter, hatch, charcoal, blend", 0xFFAABBCC);
        return;
    }

    // 20. set size
    if (str_cmp(tokens[0], "set") == 0 && str_cmp(tokens[1], "size") == 0 && ntok >= 3) {
        int32_t sz = 4;
        parse_int(tokens[2], &sz);
        send_brush_param(BRUSH_PARAM_SIZE, sz, "size");
        log_print("ok: brush size set", 0xFF00FF88);
        return;
    }

    // 21. set tool
    if ((str_cmp(tokens[0], "set") == 0 && str_cmp(tokens[1], "tool") == 0 && ntok >= 3) ||
        (str_cmp(tokens[0], "tool") == 0 && ntok >= 2)) {
        const char *t = (str_cmp(tokens[0], "tool") == 0) ? tokens[1] : tokens[2];
        int tool = (str_cmp(t, "eraser") == 0) ? TOOL_ERASER : TOOL_BRUSH;
        send_msg(MSG_SET_TOOL, (uint32_t)tool, 0, 0);
        log_print(tool == TOOL_ERASER ? "ok: eraser mode" : "ok: brush mode", 0xFF00FF88);
        return;
    }

    // 22. draw shapes
    if (str_cmp(tokens[0], "draw") == 0 && ntok >= 2) {
        if (str_cmp(tokens[1], "circle") == 0 && ntok >= 5) {
            int32_t cx = 0, cy = 0, r = 10;
            parse_int(tokens[2], &cx); parse_int(tokens[3], &cy); parse_int(tokens[4], &r);
            send_msg(MSG_DRAW_CIRCLE, ((cx & 0xFFFF) << 16) | (cy & 0xFFFF), (uint32_t)r, 0);
            log_print("ok: circle drawn", 0xFF00FF88);
            return;
        } else if (str_cmp(tokens[1], "rect") == 0 && ntok >= 6) {
            int32_t rx = 0, ry = 0, rw = 0, rh = 0;
            parse_int(tokens[2], &rx); parse_int(tokens[3], &ry); parse_int(tokens[4], &rw); parse_int(tokens[5], &rh);
            send_msg(MSG_DRAW_RECT, ((rx & 0xFFFF) << 16) | (ry & 0xFFFF), ((rw & 0xFFFF) << 16) | (rh & 0xFFFF), 0);
            log_print("ok: rectangle drawn", 0xFF00FF88);
            return;
        } else if (str_cmp(tokens[1], "line") == 0 && ntok >= 6) {
            int32_t x0 = 0, y0 = 0, x1 = 0, y1 = 0;
            parse_int(tokens[2], &x0); parse_int(tokens[3], &y0); parse_int(tokens[4], &x1); parse_int(tokens[5], &y1);
            send_msg(MSG_DRAW_LINE, ((x0 & 0xFFFF) << 16) | (y0 & 0xFFFF), ((x1 & 0xFFFF) << 16) | (y1 & 0xFFFF), 0);
            log_print("ok: line drawn", 0xFF00FF88);
            return;
        } else if (str_cmp(tokens[1], "grid") == 0 && ntok >= 3) {
            int32_t step = 32;
            parse_int(tokens[2], &step);
            send_msg(MSG_DRAW_GRID, (uint32_t)step, 0, 0);
            log_print("ok: grid drawn", 0xFF00FF88);
            return;
        }
    }

    // 23. clear
    if (str_cmp(tokens[0], "clear") == 0) {
        send_msg(MSG_EFFECT_CLEAR, 0, 0, 0);
        log_print("ok: layer cleared", 0xFF00FF88);
        return;
    }

    // 24. filters
    if (str_cmp(tokens[0], "filter") == 0 || str_cmp(tokens[0], "effect") == 0) {
        if (ntok == 1 || str_cmp(tokens[1], "list") == 0) {
            log_print("--- WASM FILTERS ---", 0xFF00FFCC);
            log_print("invert, grayscale, blur [r], brightness [d]", 0xFFAABBCC);
            log_print("contrast [f], sepia, noise [amt], pixelate [s]", 0xFFAABBCC);
            log_print("dither, threshold [t], edge", 0xFFAABBCC);
            return;
        }
        int32_t p1 = 0, p2 = 0;
        if (ntok >= 3) parse_int(tokens[2], &p1);
        if (ntok >= 4) parse_int(tokens[3], &p2);
        send_filter(tokens[1], p1, p2);
        char out[MAX_LINE_LEN] = "ok: filter applied ";
        str_copy(out + str_len(out), tokens[1], 20);
        log_print(out, 0xFF00FF88);
        return;
    }

    if (str_cmp(tokens[0], "filters") == 0) {
        log_print("--- WASM FILTERS ---", 0xFF00FFCC);
        log_print("invert, grayscale, blur [r], brightness [d]", 0xFFAABBCC);
        log_print("contrast [f], sepia, noise [amt], pixelate [s]", 0xFFAABBCC);
        log_print("dither, threshold [t], edge", 0xFFAABBCC);
        return;
    }

    if (str_cmp(tokens[0], "invert") == 0) { send_filter("invert", 0, 0); log_print("ok: filter invert applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "grayscale") == 0) { send_filter("grayscale", 0, 0); log_print("ok: filter grayscale applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "blur") == 0) { int32_t r = 3; if (ntok >= 2) parse_int(tokens[1], &r); send_filter("blur", r, 0); log_print("ok: filter blur applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "brightness") == 0) { int32_t d = 30; if (ntok >= 2) parse_int(tokens[1], &d); send_filter("brightness", d, 0); log_print("ok: filter brightness applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "contrast") == 0) { int32_t f = 30; if (ntok >= 2) parse_int(tokens[1], &f); send_filter("contrast", f, 0); log_print("ok: filter contrast applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "sepia") == 0) { send_filter("sepia", 0, 0); log_print("ok: filter sepia applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "noise") == 0) { int32_t amt = 25; if (ntok >= 2) parse_int(tokens[1], &amt); send_filter("noise", amt, 0); log_print("ok: filter noise applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "pixelate") == 0) { int32_t sz = 8; if (ntok >= 2) parse_int(tokens[1], &sz); send_filter("pixelate", sz, 0); log_print("ok: filter pixelate applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "dither") == 0) { send_filter("dither", 0, 0); log_print("ok: filter dither applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "threshold") == 0) { int32_t t = 128; if (ntok >= 2) parse_int(tokens[1], &t); send_filter("threshold", t, 0); log_print("ok: filter threshold applied", 0xFF00FF88); return; }
    if (str_cmp(tokens[0], "edge") == 0) { send_filter("edge", 0, 0); log_print("ok: filter edge applied", 0xFF00FF88); return; }

    // 25. cls / help
    if (str_cmp(tokens[0], "cls") == 0 || str_cmp(tokens[0], "clear-log") == 0) {
        log_count = 0;
        return;
    }
    if (str_cmp(tokens[0], "help") == 0) {
        log_print("WESENHO COMMAND REFERENCE:", 0xFFFFFF00);
        log_print("Canvas:   new canvas \"name\" [w] [h] | set canvas <name|id>", 0xFFAABBCC);
        log_print("          set canvas width 1200 | set canvas height 900", 0xFFAABBCC);
        log_print("          delete canvas <name|id> | canvases", 0xFFAABBCC);
        log_print("Layers:   new layer \"name\" | delete layer <id|name>", 0xFFAABBCC);
        log_print("          set layer <id|name> | rename layer \"name\"", 0xFFAABBCC);
        log_print("          layer | toggle layer | set opacity 50", 0xFFAABBCC);
        log_print("          layer to_texture \"my_tex\"", 0xFFAABBCC);
        log_print("Textures: texture <name> | textures", 0xFFAABBCC);
        log_print("Image IO: save <path.png|.bmp|.ppm> | load <path>", 0xFFAABBCC);
        log_print("Brush:    brush <name> | set brush <param> <val>", 0xFFAABBCC);
        return;
    }

    // Fallback unknown
    char err[MAX_LINE_LEN] = "Unknown command: ";
    int ep = str_len(err);
    for (int i = 0; tokens[0][i] && ep < MAX_LINE_LEN - 1; i++) err[ep++] = tokens[0][i];
    err[ep] = '\0';
    log_print(err, 0xFFFF5555);
}

static void parse_and_execute_line(const char *line) {
    if (!line || !line[0]) return;

    char tokens[MAX_TOKENS][32];
    int ntok = 0;
    int t_len = 0;
    int in_quotes = 0;
    int i = 0;

    while (line[i]) {
        char c = line[i];
        if (c == '"') {
            in_quotes = !in_quotes;
        } else if ((c == ' ' || c == '\t' || c == '(' || c == ')') && !in_quotes) {
            if (t_len > 0) {
                tokens[ntok][t_len] = '\0';
                ntok++;
                t_len = 0;
                if (ntok >= MAX_TOKENS) break;
            }
        } else {
            if (ntok < MAX_TOKENS && t_len < 31) {
                tokens[ntok][t_len++] = c;
            }
        }
        i++;
    }
    if (t_len > 0 && ntok < MAX_TOKENS) {
        tokens[ntok][t_len] = '\0';
        ntok++;
    }

    if (ntok > 0) {
        execute_sexpr(tokens, ntok);
    }
}

static void draw_rect(int x, int y, int w, int h, uint32_t color) {
    for (int j = y; j < y + h; j++) {
        if (j < 0 || j >= CONSOLE_HEIGHT) continue;
        for (int i = x; i < x + w; i++) {
            if (i < 0 || i >= CONSOLE_WIDTH) continue;
            pixels[j * CONSOLE_WIDTH + i] = color;
        }
    }
}

static void draw_frame(int x, int y, int w, int h, uint32_t color) {
    for (int i = x; i < x + w; i++) {
        if (y >= 0 && y < CONSOLE_HEIGHT) pixels[y * CONSOLE_WIDTH + i] = color;
        if (y + h - 1 >= 0 && y + h - 1 < CONSOLE_HEIGHT) pixels[(y + h - 1) * CONSOLE_WIDTH + i] = color;
    }
    for (int j = y; j < y + h; j++) {
        if (x >= 0 && x < CONSOLE_WIDTH) pixels[j * CONSOLE_WIDTH + x] = color;
        if (x + w - 1 >= 0 && x + w - 1 < CONSOLE_WIDTH) pixels[j * CONSOLE_WIDTH + (x + w - 1)] = color;
    }
}

static void render_console(void) {
    draw_rect(0, 0, CONSOLE_WIDTH, CONSOLE_HEIGHT, 0xFF0E1114);
    draw_frame(0, 0, CONSOLE_WIDTH, CONSOLE_HEIGHT, 0xFF28323C);

    // Log Lines
    int start_y = 8;
    for (int i = 0; i < log_count; i++) {
        draw_string(pixels, CONSOLE_WIDTH, CONSOLE_HEIGHT, 10, start_y + i * 14, log_lines[i], log_colors[i]);
    }

    // Input Prompt Bar
    int prompt_y = CONSOLE_HEIGHT - 22;
    draw_rect(6, prompt_y, CONSOLE_WIDTH - 12, 16, 0xFF161C22);
    draw_frame(6, prompt_y, CONSOLE_WIDTH - 12, 16, 0xFF354452);

    draw_string(pixels, CONSOLE_WIDTH, CONSOLE_HEIGHT, 10, prompt_y + 4, ">", 0xFF00FF00);
    draw_string(pixels, CONSOLE_WIDTH, CONSOLE_HEIGHT, 22, prompt_y + 4, input_buf, 0xFFFFFFFF);

    // Blinking Cursor
    cursor_blink = (cursor_blink + 1) % 60;
    if (cursor_blink < 35) {
        int cur_x = 22 + input_len * 6;
        if (cur_x < CONSOLE_WIDTH - 18) {
            draw_rect(cur_x, prompt_y + 3, 5, 10, 0xFF00FF88);
        }
    }
}

static void handle_keyboard(void) {
    if (!kb) return;

    // Backspace (0x2A) with Key Repeat
    if (is_key_triggered(0x2A, 18, 2)) {
        if (input_len > 0) input_buf[--input_len] = '\0';
    }

    // Enter (0x28) - Single Shot
    if (kb->keys[0x28] && !prev_keys[0x28]) {
        if (input_len > 0) {
            char echo[MAX_LINE_LEN] = "> ";
            int ep = 2;
            for (int i = 0; input_buf[i] && ep < MAX_LINE_LEN - 1; i++) echo[ep++] = input_buf[i];
            echo[ep] = '\0';
            log_print(echo, 0xFFFFFFFF);

            if (history_count < MAX_HISTORY) {
                str_copy(history[history_count++], input_buf, MAX_LINE_LEN);
            } else {
                for (int i = 0; i < MAX_HISTORY - 1; i++) str_copy(history[i], history[i + 1], MAX_LINE_LEN);
                str_copy(history[MAX_HISTORY - 1], input_buf, MAX_LINE_LEN);
            }
            history_idx = history_count;

            parse_and_execute_line(input_buf);
            input_len = 0;
            input_buf[0] = '\0';
        }
    }

    // Up Arrow (0x52) with Repeat
    if (is_key_triggered(0x52, 20, 5)) {
        if (history_count > 0 && history_idx > 0) {
            history_idx--;
            str_copy(input_buf, history[history_idx], MAX_LINE_LEN);
            input_len = str_len(input_buf);
        }
    }

    // Down Arrow (0x51) with Repeat
    if (is_key_triggered(0x51, 20, 5)) {
        if (history_idx < history_count - 1) {
            history_idx++;
            str_copy(input_buf, history[history_idx], MAX_LINE_LEN);
            input_len = str_len(input_buf);
        } else if (history_idx == history_count - 1) {
            history_idx = history_count;
            input_buf[0] = '\0';
            input_len = 0;
        }
    }

    int shift = kb->keys[0xE1] || kb->keys[0xE5];

    // Letters A..Z (0x04 .. 0x1D)
    for (int sc = 0x04; sc <= 0x1D; sc++) {
        if (is_key_triggered((uint8_t)sc, 22, 3) && input_len < MAX_LINE_LEN - 2) {
            input_buf[input_len++] = (shift ? 'A' : 'a') + (sc - 0x04);
            input_buf[input_len] = '\0';
        }
    }

    // Digits 1..9, 0 (0x1E .. 0x27)
    for (int sc = 0x1E; sc <= 0x27; sc++) {
        if (is_key_triggered((uint8_t)sc, 22, 3) && input_len < MAX_LINE_LEN - 2) {
            char d;
            if (shift) {
                const char syms[] = "!@#$%^&*()";
                int idx = (sc == 0x27) ? 9 : (sc - 0x1E);
                d = syms[idx];
            } else {
                d = (sc == 0x27) ? '0' : ('1' + (sc - 0x1E));
            }
            input_buf[input_len++] = d;
            input_buf[input_len] = '\0';
        }
    }

    // Space (0x2C)
    if (is_key_triggered(0x2C, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = ' ';
        input_buf[input_len] = '\0';
    }

    // Minus / Underscore (0x2D)
    if (is_key_triggered(0x2D, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '_' : '-';
        input_buf[input_len] = '\0';
    }

    // Equal / Plus (0x2E)
    if (is_key_triggered(0x2E, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '+' : '=';
        input_buf[input_len] = '\0';
    }

    // Quotes (0x34)
    if (is_key_triggered(0x34, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = '"';
        input_buf[input_len] = '\0';
    }

    // Semicolon / Colon (0x33)
    if (is_key_triggered(0x33, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? ':' : ';';
        input_buf[input_len] = '\0';
    }

    // Period / Greater (0x37)
    if (is_key_triggered(0x37, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '>' : '.';
        input_buf[input_len] = '\0';
    }

    // Slash / Question (0x38)
    if (is_key_triggered(0x38, 22, 3) && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '?' : '/';
        input_buf[input_len] = '\0';
    }

    for (int i = 0; i < 256; i++) prev_keys[i] = kb->keys[i];
}

void on_message(int32_t from_id, int32_t len) {
    if (len < 4) return;
    uint32_t type = *(uint32_t*)piolho_page;

    if (type == MSG_CONSOLE_LOG && len >= 8) {
        wesenho_console_log_msg_t *cmsg = (wesenho_console_log_msg_t*)piolho_page;
        log_print(cmsg->text, cmsg->color ? cmsg->color : 0xFF00FF88);
        return;
    }

    if (len < (int32_t)sizeof(wesenho_msg_t)) return;
    wesenho_msg_t *msg = (wesenho_msg_t*)piolho_page;

    switch (msg->type) {
        case MSG_LAYER_ADD:
            if (layer_count < MAX_CONSOLE_LAYERS) {
                layer_vis[layer_count] = 1;
                layer_op[layer_count] = 100;
                char def_name[16] = "Layer ";
                char num[8];
                int_to_str(layer_count, num);
                str_copy(def_name + 6, num, 8);
                str_copy(layer_names[layer_count], def_name, 16);
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
                        str_copy(layer_names[l], layer_names[l + 1], 16);
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
                char new_name[16];
                new_name[0] = (char)(msg->param2 & 0xFF);
                new_name[1] = (char)((msg->param2 >> 8) & 0xFF);
                new_name[2] = (char)((msg->param2 >> 16) & 0xFF);
                new_name[3] = (char)((msg->param2 >> 24) & 0xFF);
                new_name[4] = (char)(msg->param3 & 0xFF);
                new_name[5] = (char)((msg->param3 >> 8) & 0xFF);
                new_name[6] = (char)((msg->param3 >> 16) & 0xFF);
                new_name[7] = (char)((msg->param3 >> 24) & 0xFF);
                new_name[8] = '\0';
                str_copy(layer_names[idx], new_name, 16);
            }
            break;
        }
    }
}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = CONSOLE_WIDTH;
            fb->height = CONSOLE_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
        str_copy(canvas_names[0], "canvas_0", 24);
        canvas_widths[0] = 800;
        canvas_heights[0] = 1000;
        canvas_count = 1;
        active_canvas = 0;

        str_copy(layer_names[0], "Layer 0", 16);
        layer_vis[0] = 1;
        layer_op[0] = 100;
        layer_count = 1;
        active_layer = 0;

        log_print("WESENHO STUDIO REPL v2.0", 0xFF00FFCC);
        log_print("Type 'help' for commands & S-expressions.", 0xFF888888);
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");
    if (!kb)    kb = (wkeyboard_t*)ask("std:keyboard");

    handle_keyboard();
    render_console();

    return UPDATE_OK;
}
