#ifndef WESENHO_H
#define WESENHO_H

#include <stdint.h>
#include <stddef.h>

/* =========================================================================
 * Wagnostic / Piolho Actor ABI
 * Core lifecycle and communication interface for WebAssembly actors.
 * ========================================================================= */

/** Update return codes for actor frame ticks */
#define UPDATE_OK      0
#define UPDATE_EXIT    1
#define UPDATE_ERROR  -1

/** Host extension querying hook (imports memory/state from host) */
void *ask(const char *name);

/** Called every frame/tick by the host runtime */
int32_t update(void);

/* Piolho Shared Page Buffer (Page 0 at address 0x0000) */
#define PIOLHO_PAGE_SIZE 65536
#define piolho_page ((uint8_t*)0)

/* Well-Known Actor IDs */
#define ACTOR_BROKER    0
#define ACTOR_HOST      0
#define ACTOR_SCREEN    0
#define ACTOR_CANVAS    1
#define ACTOR_CONSOLE   10

/** Sends `len` bytes from `piolho_page` to `target_id` */
int32_t say(int32_t target_id, int32_t len);

/** Message handler callback invoked when an actor receives a message */
void on_message(int32_t from_id, int32_t len);

/* =========================================================================
 * Text Protocol Message Dispatch Helpers
 * Everything is sent as null-terminated UTF-8 text command strings.
 * ========================================================================= */

/**
 * Sends a null-terminated command string to the Host Actor (ID 0).
 * Copies `cmd` into `piolho_page` and invokes `say(ACTOR_HOST, len + 1)`.
 */
static inline void say_cmd(const char *cmd) {
    if (!cmd) return;
    int len = 0;
    while (cmd[len] && len < 4095) {
        piolho_page[len] = (uint8_t)cmd[len];
        len++;
    }
    piolho_page[len] = '\0';
    say(ACTOR_HOST, len + 1);
}

/**
 * Sends a null-terminated text command string to a specific Actor ID.
 * Copies `cmd` into `piolho_page` and invokes `say(target_id, len + 1)`.
 */
static inline void say_text(int32_t target_id, const char *cmd) {
    if (!cmd) return;
    int len = 0;
    while (cmd[len] && len < 4095) {
        piolho_page[len] = (uint8_t)cmd[len];
        len++;
    }
    piolho_page[len] = '\0';
    say(target_id, len + 1);
}

/* =========================================================================
 * Wagnostic Standard Extensions (Host Provided Structs)
 * ========================================================================= */

/** Framebuffer descriptor returned by ask("std:framebuffer") or ask("canvas:layer") */
typedef struct {
    uint32_t width;
    uint32_t height;
    uint32_t pixels; /**< Guest memory pointer to uint32_t RGBA32 pixel buffer */
} wframebuffer_t;

/** Clock/timing structure */
typedef struct {
    uint64_t ticks;
    uint64_t frequency;
    float    delta;
} wclock_t;

/** Keyboard input state */
typedef struct {
    uint8_t keys[256];
} wkeyboard_t;

/* Mouse button bitmasks */
#define WMOUSE_BTN_LEFT   (1 << 0)
#define WMOUSE_BTN_RIGHT  (1 << 1)
#define WMOUSE_BTN_MIDDLE (1 << 2)

/** Mouse input state */
typedef struct {
    int32_t  x;
    int32_t  y;
    uint32_t buttons;
    int32_t  wheel_x;
    int32_t  wheel_y;
} wmouse_t;

/* Tool Identifiers */
#define TOOL_BRUSH  0
#define TOOL_ERASER 1
#define TOOL_BUCKET 2

/* Maximum layers supported per document */
#define MAX_LAYERS_LIMIT 256

/* =========================================================================
 * Standalone Text Parsing Helpers (Libc-Free)
 * Used across WASM actors and plugins for parsing text commands.
 * ========================================================================= */

/**
 * Case-insensitive ASCII string comparison.
 * Returns 0 if equal, negative if s1 < s2, positive if s1 > s2.
 */
static inline int c_strcasecmp(const char *s1, const char *s2) {
    if (!s1 || !s2) return -1;
    while (*s1 && *s2) {
        char c1 = (*s1 >= 'A' && *s1 <= 'Z') ? (*s1 + 32) : *s1;
        char c2 = (*s2 >= 'A' && *s2 <= 'Z') ? (*s2 + 32) : *s2;
        if (c1 != c2) return (int)((unsigned char)c1 - (unsigned char)c2);
        s1++;
        s2++;
    }
    return (int)((unsigned char)*s1 - (unsigned char)*s2);
}

/**
 * Parses signed 32-bit integer from string. Supports negative numbers.
 */
static inline int c_atoi(const char *s) {
    if (!s) return 0;
    int sign = 1;
    while (*s == ' ' || *s == '\t') s++;
    if (*s == '-') { sign = -1; s++; }
    else if (*s == '+') s++;
    int val = 0;
    while (*s >= '0' && *s <= '9') {
        val = val * 10 + (*s - '0');
        s++;
    }
    return val * sign;
}

/**
 * Parses unsigned 32-bit integer (supports decimal or hex formatted as 0x...).
 */
static inline uint32_t c_parse_u32(const char *s) {
    if (!s) return 0;
    while (*s == ' ' || *s == '\t') s++;
    if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        s += 2;
        uint32_t val = 0;
        while (*s) {
            char c = *s;
            if (c >= '0' && c <= '9') val = (val << 4) | (c - '0');
            else if (c >= 'a' && c <= 'f') val = (val << 4) | (10 + c - 'a');
            else if (c >= 'A' && c <= 'F') val = (val << 4) | (10 + c - 'A');
            else break;
            s++;
        }
        return val;
    }
    uint32_t val = 0;
    while (*s >= '0' && *s <= '9') {
        val = val * 10 + (*s - '0');
        s++;
    }
    return val;
}

/**
 * In-place command tokenizer. Modifies `line` by inserting null terminators
 * and populates `tokens` array with pointer to each token. Supports "quoted strings".
 * Returns total number of extracted tokens.
 */
static inline int c_tokenize(char *line, char *tokens[], int max_tokens) {
    int count = 0;
    char *p = line;
    while (*p && count < max_tokens) {
        while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
        if (!*p) break;
        if (*p == '"') {
            p++;
            tokens[count++] = p;
            while (*p && *p != '"') p++;
            if (*p) *p++ = '\0';
        } else {
            tokens[count++] = p;
            while (*p && *p != ' ' && *p != '\t' && *p != '\r' && *p != '\n') p++;
            if (*p) *p++ = '\0';
        }
    }
    return count;
}

/* =========================================================================
 * High-Level Brush SDK & Stroke Helpers
 * Provides unified parsing, interpolation, clipping, and dab callbacks.
 * ========================================================================= */

/** Standard stroke parameters received by brush plugins */
typedef struct {
    int32_t  x0;
    int32_t  y0;
    int32_t  x1;
    int32_t  y1;
    int32_t  radius;
    uint32_t color;
    int32_t  texture_mode;
    int32_t  eraser;
} wstroke_t;

/**
 * Handles "set <param> <value>" configuration commands for brush plugins.
 * Returns 1 if handled, 0 otherwise.
 */
static inline int w_handle_brush_set(int len, int *size, int *opacity, int *hardness, int *flow, int *spacing, int *tex_mode) {
    if (len <= 0) return 0;
    char buf[128];
    int clen = (len < 127) ? len : 127;
    for (int i = 0; i < clen; i++) buf[i] = (char)piolho_page[i];
    buf[clen] = '\0';

    char *tokens[6];
    int ntok = c_tokenize(buf, tokens, 6);
    if (ntok >= 3 && c_strcasecmp(tokens[0], "set") == 0) {
        const char *param = tokens[1];
        int val = c_atoi(tokens[2]);
        if (size && c_strcasecmp(param, "size") == 0) { *size = val < 1 ? 1 : val; return 1; }
        if (opacity && c_strcasecmp(param, "opacity") == 0) { *opacity = val < 0 ? 0 : (val > 100 ? 100 : val); return 1; }
        if (hardness && c_strcasecmp(param, "hardness") == 0) { *hardness = val; return 1; }
        if (flow && c_strcasecmp(param, "flow") == 0) { *flow = val; return 1; }
        if (spacing && c_strcasecmp(param, "spacing") == 0) { *spacing = val < 1 ? 1 : val; return 1; }
        if (tex_mode && (c_strcasecmp(param, "tex_mode") == 0 || c_strcasecmp(param, "texture_mode") == 0)) { *tex_mode = val; return 1; }
    }
    return 0;
}

/**
 * Parses stroke parameters from `piolho_page`.
 * Supports both:
 * 1. Host format: "stroke <state> <x> <y> <prev_x> <prev_y> <color> <is_eraser>"
 * 2. Positional format: "<x0> <y0> <x1> <y1> [radius] [color] [texture_mode] [eraser]"
 */
static inline int w_parse_stroke(int len, wstroke_t *out, int default_size) {
    if (len <= 0 || !out) return 0;
    char buf[128];
    int clen = (len < 127) ? len : 127;
    for (int i = 0; i < clen; i++) buf[i] = (char)piolho_page[i];
    buf[clen] = '\0';

    char *argv[10];
    int argc = c_tokenize(buf, argv, 10);
    if (argc < 1) return 0;

    if (c_strcasecmp(argv[0], "stroke") == 0 && argc >= 8) {
        int state = c_atoi(argv[1]);
        int x = c_atoi(argv[2]);
        int y = c_atoi(argv[3]);
        int px = c_atoi(argv[4]);
        int py = c_atoi(argv[5]);
        out->color = c_parse_u32(argv[6]);
        out->eraser = c_atoi(argv[7]);
        out->radius = default_size > 0 ? default_size : 5;
        out->texture_mode = 0;
        if (state == 0) {
            out->x0 = x; out->y0 = y;
            out->x1 = x; out->y1 = y;
        } else {
            out->x0 = px; out->y0 = py;
            out->x1 = x;  out->y1 = y;
        }
        return 1;
    }

    if (c_strcasecmp(argv[0], "set") == 0) return 0;

    if (argc >= 4) {
        out->x0 = c_atoi(argv[0]);
        out->y0 = c_atoi(argv[1]);
        out->x1 = c_atoi(argv[2]);
        out->y1 = c_atoi(argv[3]);
        out->radius = (argc > 4) ? c_atoi(argv[4]) : default_size;
        if (out->radius < 1) out->radius = 1;
        out->color = (argc > 5) ? c_parse_u32(argv[5]) : 0xFF000000;
        out->texture_mode = (argc > 6) ? c_atoi(argv[6]) : 0;
        out->eraser = (argc > 7) ? c_atoi(argv[7]) : 0;
        return 1;
    }

    return 0;
}

/**
 * Retrieves active layer framebuffer from canvas actor.
 * Returns NULL if invalid or not ready.
 */
static inline wframebuffer_t* w_get_layer(void) {
    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return (wframebuffer_t*)0;
    return fb;
}

/**
 * Fast integer square root.
 */
static inline int w_isqrt(int val) {
    if (val <= 0) return 0;
    int x = val, c = 0, d = 1 << 30;
    while (d > x) d >>= 2;
    while (d != 0) {
        if (x >= c + d) {
            x -= c + d;
            c = (c >> 1) + d;
        } else {
            c >>= 1;
        }
        d >>= 2;
    }
    return c;
}

/**
 * Standard Porter-Duff Source-Over alpha blending of two 32-bit RGBA colors.
 */
static inline uint32_t w_blend_fast(uint32_t src, uint32_t dst, uint32_t alpha) {
    if (alpha == 0) return dst;
    if (alpha >= 255) return src;
    uint32_t inv_a = 255 - alpha;
    uint32_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF, sa = (src >> 24) & 0xFF;
    uint32_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF, da = (dst >> 24) & 0xFF;
    uint32_t r = (sr * alpha + dr * inv_a) / 255;
    uint32_t g = (sg * alpha + dg * inv_a) / 255;
    uint32_t b = (sb * alpha + db * inv_a) / 255;
    uint32_t a = sa + (da * inv_a) / 255;
    if (a > 255) a = 255;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

/**
 * Procedural texture masking for brush strokes (paper, canvas, noise, dots, grid, grunge).
 */
static inline uint32_t w_sample_texture(int mode, int x, int y, uint32_t base_a) {
    if (mode <= 0 || base_a == 0) return base_a;
    uint32_t mod_a = base_a;
    if (mode == 1) { /* Paper grain */
        uint32_t n = ((x * 1234567 + y * 7654321) ^ (x * y)) & 0xFF;
        mod_a = (base_a * (180 + (n * 75 / 255))) / 255;
    } else if (mode == 2) { /* Canvas weave */
        int pat = ((x % 4 < 2) ^ (y % 4 < 2)) ? 255 : 170;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 3) { /* Noise */
        uint32_t n = ((x * 374761393 + y * 668265263) ^ 0x5bf03635) & 0xFF;
        mod_a = (base_a * (150 + (n * 105 / 255))) / 255;
    } else if (mode == 4) { /* Halftone dots */
        int dx = (x % 6) - 3, dy = (y % 6) - 3;
        int d2 = dx * dx + dy * dy;
        int pat = (d2 <= 4) ? 255 : 120;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 5) { /* Grid */
        int pat = (x % 8 == 0 || y % 8 == 0) ? 255 : 160;
        mod_a = (base_a * pat) / 255;
    } else if (mode == 6) { /* Grunge */
        uint32_t n = ((x / 3 * 101 + y / 3 * 203) ^ (x * 17 + y * 31)) & 0xFF;
        mod_a = (base_a * (140 + (n * 115 / 255))) / 255;
    }
    return mod_a;
}

/**
 * Pixel dab shader callback signature.
 * Returns the new packed 32-bit RGBA pixel value.
 */
typedef uint32_t (*w_dab_pixel_fn)(int px, int py, int dx, int dy, int dist_sq, int radius, uint32_t dst_p, const wstroke_t *stroke, void *ctx);

/**
 * Renders a circular dab at `(cx, cy)` clipped to framebuffer dimensions.
 */
static inline void w_draw_dab(wframebuffer_t *fb, int cx, int cy, const wstroke_t *stroke, w_dab_pixel_fn dab_fn, void *ctx) {
    if (!fb || !stroke || !dab_fn) return;
    int r = stroke->radius;
    int r_sq = r * r;
    int min_x = cx - r; if (min_x < 0) min_x = 0;
    int max_x = cx + r; if (max_x >= (int)fb->width) max_x = fb->width - 1;
    int min_y = cy - r; if (min_y < 0) min_y = 0;
    int max_y = cy + r; if (max_y >= (int)fb->height) max_y = fb->height - 1;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;

    for (int y = min_y; y <= max_y; y++) {
        int dy = y - cy;
        int dy_sq = dy * dy;
        for (int x = min_x; x <= max_x; x++) {
            int dx = x - cx;
            int dist_sq = dx * dx + dy_sq;
            if (dist_sq <= r_sq) {
                int idx = y * width + x;
                pixels[idx] = dab_fn(x, y, dx, dy, dist_sq, r, pixels[idx], stroke, ctx);
            }
        }
    }
}

/**
 * Interpolates dabs along the stroke vector `(x0, y0) -> (x1, y1)`.
 * `spacing_factor`: spacing as fraction of radius (e.g., 0.25f for smooth strokes).
 */
static inline void w_stroke_interpolate(wframebuffer_t *fb, const wstroke_t *stroke, float spacing_factor, w_dab_pixel_fn dab_fn, void *ctx) {
    if (!fb || !stroke || !dab_fn) return;
    int dx = stroke->x1 - stroke->x0;
    int dy = stroke->y1 - stroke->y0;
    int dist = w_isqrt(dx * dx + dy * dy);

    int step_size = (int)(stroke->radius * spacing_factor);
    if (step_size < 1) step_size = 1;
    int steps = (dist / step_size) + 1;

    for (int i = 0; i <= steps; i++) {
        int cx = (steps == 0) ? stroke->x0 : (stroke->x0 + (dx * i) / steps);
        int cy = (steps == 0) ? stroke->y0 : (stroke->y0 + (dy * i) / steps);
        w_draw_dab(fb, cx, cy, stroke, dab_fn, ctx);
    }
}

#endif /* WESENHO_H */
