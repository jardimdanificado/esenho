#ifndef WESENHO_H
#define WESENHO_H

#include <stdint.h>
#include <stddef.h>

/* Wagnostic ABI */
#define UPDATE_OK      0
#define UPDATE_EXIT    1
#define UPDATE_ERROR  -1

void *ask(const char *name);
int32_t update(void);

/* Piolho ABI */
#define PIOLHO_PAGE_SIZE 65536
#define piolho_page ((uint8_t*)0)

/* Base Actor IDs */
#define ACTOR_BROKER    0
#define ACTOR_HOST      0
#define ACTOR_SCREEN    0
#define ACTOR_CANVAS    1
#define ACTOR_CONSOLE   10

int32_t say(int32_t target_id, int32_t len);
void on_message(int32_t from_id, int32_t len);

/* Helper to send text command string to Host Actor */
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

/* Helper to send text command string to any Actor */
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


/* Wagnostic Standard Extensions */
typedef struct {
    uint32_t width;
    uint32_t height;
    uint32_t pixels;
} wframebuffer_t;

typedef struct {
    uint64_t ticks;
    uint64_t frequency;
    float    delta;
} wclock_t;

typedef struct {
    uint8_t keys[256];
} wkeyboard_t;

#define WMOUSE_BTN_LEFT   (1 << 0)
#define WMOUSE_BTN_RIGHT  (1 << 1)
#define WMOUSE_BTN_MIDDLE (1 << 2)

typedef struct {
    int32_t  x;
    int32_t  y;
    uint32_t buttons;
    int32_t  wheel_x;
    int32_t  wheel_y;
} wmouse_t;

#define TOOL_BRUSH  0
#define TOOL_ERASER 1
#define TOOL_BUCKET 2

#define MAX_LAYERS_LIMIT 256

/* Text Parsing Helpers for Actors & Plugins */
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

#endif /* WESENHO_H */
