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
#define HOST_ID 0
#define piolho_page ((uint8_t*)0)

int32_t say(int32_t target_id, int32_t len);
void on_message(int32_t from_id, int32_t len);

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

/* Wesenho IPC Message Types (between Canvas & Host/Effects) */
#define MSG_EFFECT_INVERT    1
#define MSG_EFFECT_GRAYSCALE 2
#define MSG_EFFECT_CLEAR     3
#define MSG_EFFECT_APPLIED   10

typedef struct {
    uint32_t type;
    uint32_t width;
    uint32_t height;
    uint32_t color; /* 0xAABBGGRR */
} wesenho_msg_t;

#endif /* WESENHO_H */
