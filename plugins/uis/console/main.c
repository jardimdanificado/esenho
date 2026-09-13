#include "../../../include/wesenho.h"
#include "../../../include/font5x7.h"

#define CONSOLE_WIDTH   400
#define CONSOLE_HEIGHT  210
#define MAX_LOG_LINES   11
#define MAX_LINE_LEN    60
#define MAX_STACK       32
#define MAX_HISTORY     12

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

// Forth Stack
static int32_t stack[MAX_STACK];
static int sp = 0;

static uint8_t prev_keys[256];

static void push(int32_t val) {
    if (sp < MAX_STACK) stack[sp++] = val;
}

static int32_t pop(void) {
    if (sp > 0) return stack[--sp];
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
        if (a[i] != b[i]) return a[i] - b[i];
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

static void print_stack(void) {
    char out[MAX_LINE_LEN] = "<";
    char num[16];
    int_to_str(sp, num);
    int p = 1;
    for (int i = 0; num[i]; i++) out[p++] = num[i];
    out[p++] = '>';
    out[p++] = ' ';
    for (int i = 0; i < sp && p < MAX_LINE_LEN - 12; i++) {
        int_to_str(stack[i], num);
        for (int j = 0; num[j]; j++) out[p++] = num[j];
        out[p++] = ' ';
    }
    out[p] = '\0';
    log_print(out, 0xFF00E0E0);
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

static void execute_word(const char *word) {
    int32_t num = 0;

    // Numbers & Hex
    if (parse_int(word, &num)) { push(num); return; }
    if (parse_hex_color(word, &num)) { push(num); return; }

    // Color Shortcuts
    if (str_cmp(word, "black") == 0) { send_msg(MSG_SET_COLOR, 0xFF000000, 0, 0); log_print("cor: preto", 0xFF00FF88); return; }
    if (str_cmp(word, "white") == 0) { send_msg(MSG_SET_COLOR, 0xFFFFFFFF, 0, 0); log_print("cor: branco", 0xFF00FF88); return; }
    if (str_cmp(word, "red") == 0)   { send_msg(MSG_SET_COLOR, 0xFF0000FF, 0, 0); log_print("cor: vermelho", 0xFF00FF88); return; }
    if (str_cmp(word, "green") == 0) { send_msg(MSG_SET_COLOR, 0xFF00FF00, 0, 0); log_print("cor: verde", 0xFF00FF88); return; }
    if (str_cmp(word, "blue") == 0)  { send_msg(MSG_SET_COLOR, 0xFFFF0000, 0, 0); log_print("cor: azul", 0xFF00FF88); return; }
    if (str_cmp(word, "yellow") == 0){ send_msg(MSG_SET_COLOR, 0xFF00FFFF, 0, 0); log_print("cor: amarelo", 0xFF00FF88); return; }
    if (str_cmp(word, "cyan") == 0)  { send_msg(MSG_SET_COLOR, 0xFFFFFF00, 0, 0); log_print("cor: ciano", 0xFF00FF88); return; }
    if (str_cmp(word, "magenta") == 0){send_msg(MSG_SET_COLOR, 0xFFFF00FF, 0, 0); log_print("cor: magenta", 0xFF00FF88); return; }
    if (str_cmp(word, "orange") == 0){ send_msg(MSG_SET_COLOR, 0xFF0080FF, 0, 0); log_print("cor: laranja", 0xFF00FF88); return; }

    // Stack Ops
    if (str_cmp(word, "+") == 0) { int32_t b = pop(), a = pop(); push(a + b); }
    else if (str_cmp(word, "-") == 0) { int32_t b = pop(), a = pop(); push(a - b); }
    else if (str_cmp(word, "*") == 0) { int32_t b = pop(), a = pop(); push(a * b); }
    else if (str_cmp(word, "/") == 0) { int32_t b = pop(), a = pop(); push(b != 0 ? a / b : 0); }
    else if (str_cmp(word, "dup") == 0) { if (sp > 0) push(stack[sp - 1]); }
    else if (str_cmp(word, "drop") == 0) { pop(); }
    else if (str_cmp(word, "swap") == 0) { int32_t b = pop(), a = pop(); push(b); push(a); }
    else if (str_cmp(word, "rot") == 0) { int32_t c = pop(), b = pop(), a = pop(); push(b); push(c); push(a); }
    else if (str_cmp(word, ".s") == 0) { print_stack(); }
    else if (str_cmp(word, "clear-stack") == 0) { sp = 0; log_print("Stack limpo.", 0xFF888888); }

    // Colors
    else if (str_cmp(word, "rgb") == 0) {
        int32_t b = pop(), g = pop(), r = pop();
        uint32_t col = 0xFF000000 | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
        send_msg(MSG_SET_COLOR, col, 0, 0);
        log_print("ok: cor definida (RGB)", 0xFF00FF88);
    } else if (str_cmp(word, "hex") == 0) {
        int32_t col = pop();
        send_msg(MSG_SET_COLOR, (uint32_t)col, 0, 0);
        log_print("ok: cor definida (HEX)", 0xFF00FF88);
    }

    // Brush & Tools
    else if (str_cmp(word, "size") == 0 || str_cmp(word, "brush-size") == 0) {
        int32_t sz = pop();
        send_msg(MSG_SET_BRUSH_SIZE, (uint32_t)sz, 0, 0);
        log_print("ok: tamanho pincel alterado", 0xFF00FF88);
    } else if (str_cmp(word, "brush-type") == 0) {
        int32_t t = pop();
        send_msg(MSG_SET_BRUSH_TYPE, (uint32_t)t, 0, 0);
        log_print("ok: tipo pincel alterado", 0xFF00FF88);
    } else if (str_cmp(word, "round") == 0 || str_cmp(word, "brush-round") == 0) {
        send_msg(MSG_SET_BRUSH_TYPE, BRUSH_HARD_ROUND, 0, 0);
        log_print("ok: pincel redondo", 0xFF00FF88);
    } else if (str_cmp(word, "soft") == 0 || str_cmp(word, "air") == 0 || str_cmp(word, "brush-soft") == 0) {
        send_msg(MSG_SET_BRUSH_TYPE, BRUSH_SOFT_AIRBRUSH, 0, 0);
        log_print("ok: pincel macio/airbrush", 0xFF00FF88);
    } else if (str_cmp(word, "pixel") == 0 || str_cmp(word, "brush-pixel") == 0) {
        send_msg(MSG_SET_BRUSH_TYPE, BRUSH_PIXEL, 0, 0);
        log_print("ok: pincel pixel art", 0xFF00FF88);
    } else if (str_cmp(word, "chisel") == 0 || str_cmp(word, "brush-chisel") == 0) {
        send_msg(MSG_SET_BRUSH_TYPE, BRUSH_CHISEL, 0, 0);
        log_print("ok: pincel chanfrado", 0xFF00FF88);
    } else if (str_cmp(word, "spray") == 0 || str_cmp(word, "brush-spray") == 0) {
        send_msg(MSG_SET_BRUSH_TYPE, BRUSH_SCATTER, 0, 0);
        log_print("ok: pincel spray/noise", 0xFF00FF88);
    } else if (str_cmp(word, "brush-params") == 0) {
        int32_t spc = pop(), op = pop(), hd = pop();
        send_msg(MSG_SET_BRUSH_PARAMS, (uint32_t)hd, (uint32_t)op, (uint32_t)spc);
        log_print("ok: parametros de pincel", 0xFF00FF88);
    } else if (str_cmp(word, "brush") == 0 || str_cmp(word, "tool-brush") == 0) {
        send_msg(MSG_SET_TOOL, TOOL_BRUSH, 0, 0);
        log_print("ok: modo pincel", 0xFF00FF88);
    } else if (str_cmp(word, "eraser") == 0 || str_cmp(word, "tool-eraser") == 0) {
        send_msg(MSG_SET_TOOL, TOOL_ERASER, 0, 0);
        log_print("ok: modo borracha", 0xFF00FF88);
    }

    // Layers & Effects
    else if (str_cmp(word, "layer-new") == 0) {
        send_msg(MSG_LAYER_ADD, 0, 0, 0);
        log_print("ok: nova camada criada", 0xFF00FF88);
    } else if (str_cmp(word, "layer-select") == 0 || str_cmp(word, "select") == 0) {
        int32_t id = pop();
        send_msg(MSG_LAYER_SELECT, (uint32_t)id, 0, 0);
        log_print("ok: camada selecionada", 0xFF00FF88);
    } else if (str_cmp(word, "layer-toggle") == 0 || str_cmp(word, "toggle") == 0) {
        int32_t id = pop();
        send_msg(MSG_LAYER_TOGGLE_VIS, (uint32_t)id, 0, 0);
        log_print("ok: visibilidade alternada", 0xFF00FF88);
    } else if (str_cmp(word, "layer-opacity") == 0 || str_cmp(word, "opacity") == 0) {
        int32_t op = pop(), id = pop();
        send_msg(MSG_LAYER_SET_OPACITY, (uint32_t)id, (uint32_t)op, 0);
        log_print("ok: opacidade alterada", 0xFF00FF88);
    } else if (str_cmp(word, "clear") == 0) {
        send_msg(MSG_EFFECT_CLEAR, 0, 0, 0);
        log_print("ok: camada limpa", 0xFF00FF88);
    } else if (str_cmp(word, "invert") == 0) {
        send_msg(MSG_EFFECT_INVERT, 0, 0, 0);
        log_print("ok: cores invertidas", 0xFF00FF88);
    } else if (str_cmp(word, "grayscale") == 0) {
        send_msg(MSG_EFFECT_GRAYSCALE, 0, 0, 0);
        log_print("ok: escala de cinza", 0xFF00FF88);
    }

    // Generative & Primitive Drawing Words
    else if (str_cmp(word, "line") == 0) {
        int32_t y1 = pop(), x1 = pop(), y0 = pop(), x0 = pop();
        send_msg(MSG_DRAW_LINE, ((x0 & 0xFFFF) << 16) | (y0 & 0xFFFF), ((x1 & 0xFFFF) << 16) | (y1 & 0xFFFF), 0);
        log_print("ok: linha desenhada", 0xFF00FF88);
    } else if (str_cmp(word, "rect") == 0) {
        int32_t h = pop(), w = pop(), y = pop(), x = pop();
        send_msg(MSG_DRAW_RECT, ((x & 0xFFFF) << 16) | (y & 0xFFFF), ((w & 0xFFFF) << 16) | (h & 0xFFFF), 0);
        log_print("ok: retangulo desenhado", 0xFF00FF88);
    } else if (str_cmp(word, "circle") == 0) {
        int32_t r = pop(), cy = pop(), cx = pop();
        send_msg(MSG_DRAW_CIRCLE, ((cx & 0xFFFF) << 16) | (cy & 0xFFFF), (uint32_t)r, 0);
        log_print("ok: circulo desenhado", 0xFF00FF88);
    } else if (str_cmp(word, "grid") == 0) {
        int32_t step = pop();
        send_msg(MSG_DRAW_GRID, (uint32_t)step, 0, 0);
        log_print("ok: grid gerado", 0xFF00FF88);
    }

    // System
    else if (str_cmp(word, "cls") == 0) {
        log_count = 0;
    } else if (str_cmp(word, "help") == 0) {
        log_print("WESENHO FORTH / LISP CHEATSHEET:", 0xFFFFFF00);
        log_print("Cores: 255 0 128 rgb | #ff0080 hex | red | blue | cyan", 0xFFAABBCC);
        log_print("Pincel: 14 size | round | soft | pixel | chisel | spray", 0xFFAABBCC);
        log_print("Camadas: layer-new | 1 select | 0 toggle | 50 1 opacity", 0xFFAABBCC);
        log_print("Generativo: 100 100 200 150 rect | 400 500 80 circle | 32 grid", 0xFFAABBCC);
        log_print("Lisp: (rgb 255 0 0) | (size 12) | (circle 400 500 50)", 0xFFAABBCC);
    } else {
        char err[MAX_LINE_LEN] = "Palavra desconhecida: ";
        int ep = str_len(err);
        for (int i = 0; word[i] && ep < MAX_LINE_LEN - 1; i++) err[ep++] = word[i];
        err[ep] = '\0';
        log_print(err, 0xFFFF5555);
    }
}

static void execute_line(const char *line) {
    if (str_len(line) == 0) return;

    if (line[0] == '(') {
        char tokens[8][32];
        int tok_count = 0;
        int t_idx = 0;
        int i = 1;
        while (line[i] && line[i] != ')') {
            if (line[i] == ' ' || line[i] == '\t') {
                if (t_idx > 0) {
                    tokens[tok_count][t_idx] = '\0';
                    tok_count++;
                    t_idx = 0;
                }
            } else {
                if (tok_count < 8 && t_idx < 31) {
                    tokens[tok_count][t_idx++] = line[i];
                }
            }
            i++;
        }
        if (t_idx > 0 && tok_count < 8) {
            tokens[tok_count][t_idx] = '\0';
            tok_count++;
        }

        if (tok_count > 0) {
            for (int a = 1; a < tok_count; a++) {
                int32_t val = 0;
                if (parse_int(tokens[a], &val) || parse_hex_color(tokens[a], &val)) {
                    push(val);
                }
            }
            execute_word(tokens[0]);
            return;
        }
    }

    char word[32];
    int w_idx = 0;
    int i = 0;
    while (line[i]) {
        char c = line[i];
        if (c == ' ' || c == '\t' || c == '\n') {
            if (w_idx > 0) {
                word[w_idx] = '\0';
                execute_word(word);
                w_idx = 0;
            }
        } else {
            if (w_idx < 31) word[w_idx++] = c;
        }
        i++;
    }
    if (w_idx > 0) {
        word[w_idx] = '\0';
        execute_word(word);
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

    // Title Bar
    draw_rect(0, 0, CONSOLE_WIDTH, 18, 0xFF1C242C);
    draw_string(pixels, CONSOLE_WIDTH, CONSOLE_HEIGHT, 8, 5, "WESENHO FORTH / LISP REPL", 0xFF00FFCC);

    // Log Lines
    int start_y = 22;
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

    // Backspace (0x2A)
    if (kb->keys[0x2A] && !prev_keys[0x2A]) {
        if (input_len > 0) input_buf[--input_len] = '\0';
    }

    // Enter (0x28)
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

            execute_line(input_buf);
            input_len = 0;
            input_buf[0] = '\0';
        }
    }

    // Up Arrow (0x52)
    if (kb->keys[0x52] && !prev_keys[0x52]) {
        if (history_count > 0 && history_idx > 0) {
            history_idx--;
            str_copy(input_buf, history[history_idx], MAX_LINE_LEN);
            input_len = str_len(input_buf);
        }
    }

    // Down Arrow (0x51)
    if (kb->keys[0x51] && !prev_keys[0x51]) {
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
        if (kb->keys[sc] && !prev_keys[sc] && input_len < MAX_LINE_LEN - 2) {
            input_buf[input_len++] = (shift ? 'A' : 'a') + (sc - 0x04);
            input_buf[input_len] = '\0';
        }
    }

    // Digits 1..9, 0 (0x1E .. 0x27)
    for (int sc = 0x1E; sc <= 0x27; sc++) {
        if (kb->keys[sc] && !prev_keys[sc] && input_len < MAX_LINE_LEN - 2) {
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
    if (kb->keys[0x2C] && !prev_keys[0x2C] && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = ' ';
        input_buf[input_len] = '\0';
    }

    // Minus / Underscore (0x2D)
    if (kb->keys[0x2D] && !prev_keys[0x2D] && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '_' : '-';
        input_buf[input_len] = '\0';
    }

    // Equal / Plus (0x2E)
    if (kb->keys[0x2E] && !prev_keys[0x2E] && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '+' : '=';
        input_buf[input_len] = '\0';
    }

    // Semicolon / Colon (0x33)
    if (kb->keys[0x33] && !prev_keys[0x33] && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? ':' : ';';
        input_buf[input_len] = '\0';
    }

    // Period / Greater (0x37)
    if (kb->keys[0x37] && !prev_keys[0x37] && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '>' : '.';
        input_buf[input_len] = '\0';
    }

    // Slash / Question (0x38)
    if (kb->keys[0x38] && !prev_keys[0x38] && input_len < MAX_LINE_LEN - 2) {
        input_buf[input_len++] = shift ? '?' : '/';
        input_buf[input_len] = '\0';
    }

    for (int i = 0; i < 256; i++) prev_keys[i] = kb->keys[i];
}

void on_message(int32_t from_id, int32_t len) {}

int32_t update(void) {
    if (!fb) {
        fb = (wframebuffer_t*)ask("std:framebuffer");
        if (fb) {
            fb->width = CONSOLE_WIDTH;
            fb->height = CONSOLE_HEIGHT;
            fb->pixels = (uint32_t)(uintptr_t)pixels;
        }
        log_print("WESENHO FORTH / LISP STUDIO v0.2", 0xFF00FFCC);
        log_print("Digite 'help' para comandos e palavras.", 0xFF888888);
    }
    if (!mouse) mouse = (wmouse_t*)ask("std:mouse");
    if (!kb)    kb = (wkeyboard_t*)ask("std:keyboard");

    handle_keyboard();
    render_console();

    return UPDATE_OK;
}
