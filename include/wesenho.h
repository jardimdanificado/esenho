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
#define ACTOR_CANVAS    1

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

/* Wesenho Pub/Sub & Directed Message Types */
#define MSG_PUB_TOPIC        0x100
#define MSG_SUB_TOPIC        0x101

#define MSG_SET_COLOR        1
#define MSG_SET_BRUSH_SIZE   2
#define MSG_SET_TOOL         3
#define MSG_EFFECT_INVERT    4
#define MSG_EFFECT_GRAYSCALE 5
#define MSG_EFFECT_CLEAR     6
#define MSG_LAYER_ADD        7
#define MSG_LAYER_SELECT     8
#define MSG_LAYER_TOGGLE_VIS 9
#define MSG_LAYER_SET_OPACITY 10

#define TOOL_BRUSH  0
#define TOOL_ERASER 1
#define TOOL_BUCKET 2

#define MAX_LAYERS 8

typedef struct {
    uint32_t type;
    uint32_t param1;
    uint32_t param2;
    uint32_t param3;
} wesenho_msg_t;

typedef struct {
    uint32_t type;       /* MSG_PUB_TOPIC */
    char     topic[32];  /* e.g. "anim:frame", "brush:stroke" */
    uint32_t data_len;
    uint8_t  payload[64];
} wesenho_event_t;

#endif /* WESENHO_H */
