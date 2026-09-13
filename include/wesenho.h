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
#define MSG_SET_BRUSH_TYPE   11
#define MSG_SET_BRUSH_PARAMS 12
#define MSG_LAYER_DELETE     13
#define MSG_LAYER_RENAME     14
#define MSG_DRAW_LINE        20
#define MSG_DRAW_RECT        21
#define MSG_DRAW_CIRCLE      22
#define MSG_DRAW_GRID        23
#define MSG_APPLY_FILTER     30
#define MSG_BRUSH_STROKE     40
#define MSG_BRUSH_SET_PARAM  41
#define MSG_SET_ACTIVE_BRUSH 42
#define MSG_TEXTURE_SET_ACTIVE 50
#define MSG_LAYER_TO_TEXTURE 51
#define MSG_TEXTURE_LIST     52
#define MSG_LOAD_IMAGE       60
#define MSG_SAVE_IMAGE       61
#define MSG_CONSOLE_LOG      70

#define MSG_CANVAS_NEW       80
#define MSG_CANVAS_SELECT    81
#define MSG_CANVAS_RESIZE    82
#define MSG_CANVAS_DELETE    83
#define MSG_CANVAS_RENAME    84
#define MSG_CANVAS_DUPLICATE 85

#define TOOL_BRUSH  0
#define TOOL_ERASER 1
#define TOOL_BUCKET 2

#define STROKE_START 0
#define STROKE_MOVE  1
#define STROKE_END   2

#define BRUSH_PARAM_SIZE             1
#define BRUSH_PARAM_OPACITY          2
#define BRUSH_PARAM_HARDNESS         3
#define BRUSH_PARAM_FLOW             4
#define BRUSH_PARAM_SPACING          5
#define BRUSH_PARAM_ANGLE            6
#define BRUSH_PARAM_ROUNDNESS        7
#define BRUSH_PARAM_SCATTER          8
#define BRUSH_PARAM_TOLERANCE        9
#define BRUSH_PARAM_DENSITY          10
#define BRUSH_PARAM_WETNESS          11
#define BRUSH_PARAM_GRAIN            12
#define BRUSH_PARAM_TEXTURE_MODE     13  /* 0=off, 1=grain/mask, 2=pattern */
#define BRUSH_PARAM_TEXTURE_SCALE    14  /* 1..500% (default 100) */
#define BRUSH_PARAM_TEXTURE_STRENGTH 15  /* 0..100% (default 100) */

#define MAX_LAYERS_LIMIT 256
#define MAX_CANVASES_LIMIT 64

typedef struct {
    uint32_t type;
    uint32_t param1;
    uint32_t param2;
    uint32_t param3;
} wesenho_msg_t;

typedef struct {
    uint32_t type;       /* MSG_APPLY_FILTER */
    char     name[20];   /* e.g. "invert", "grayscale", "blur", "sepia", "noise" */
    int32_t  param1;     /* e.g. radius, delta, factor */
    int32_t  param2;
} wesenho_filter_msg_t;

typedef struct {
    uint32_t type;        /* MSG_BRUSH_STROKE */
    int32_t  x;
    int32_t  y;
    int32_t  prev_x;
    int32_t  prev_y;
    uint32_t color;       /* ARGB / RGBA uint32 */
    uint8_t  state;       /* STROKE_START, STROKE_MOVE, STROKE_END */
    uint8_t  is_eraser;   /* 1 if eraser tool or right button */
    uint8_t  pressure;    /* 0..255 */
    uint8_t  reserved;
} wesenho_stroke_msg_t;

typedef struct {
    uint32_t type;        /* MSG_BRUSH_SET_PARAM */
    uint32_t param_id;    /* BRUSH_PARAM_* */
    int32_t  value;
    char     param_name[16]; /* Optional text name: "size", "flow", "hardness", etc. */
} wesenho_brush_param_msg_t;

typedef struct {
    uint32_t type;        /* MSG_SET_ACTIVE_BRUSH */
    char     name[20];    /* "round", "airbrush", "pixel", "calligraphy", "fill", "smudge", "scatter", "lasso_fill", "hatch", "charcoal", "blend" */
} wesenho_active_brush_msg_t;

typedef struct {
    uint32_t type;        /* MSG_TEXTURE_SET_ACTIVE */
    char     name[24];    /* "paper", "canvas", "noise", "dots", "grid", "grunge", or custom texture name */
} wesenho_active_texture_msg_t;

typedef struct {
    uint32_t type;        /* MSG_LAYER_TO_TEXTURE */
    int32_t  layer_idx;   /* -1 for active layer */
    char     name[24];    /* Texture name to register */
} wesenho_layer_texture_msg_t;

typedef struct {
    uint32_t type;        /* MSG_SAVE_IMAGE or MSG_LOAD_IMAGE */
    int32_t  target;      /* 0 = canvas composite, 1 = active layer, 2 = as texture */
    char     filepath[64];
    char     name[24];    /* Optional name when target == 2 */
} wesenho_image_io_msg_t;

typedef struct {
    uint32_t type;        /* MSG_CANVAS_NEW */
    uint32_t width;
    uint32_t height;
    char     name[24];
} wesenho_canvas_new_msg_t;

typedef struct {
    uint32_t type;        /* MSG_CANVAS_SELECT or MSG_CANVAS_DELETE */
    int32_t  canvas_idx;  /* -1 if by name */
    char     name[24];
} wesenho_canvas_select_msg_t;

typedef struct {
    uint32_t type;        /* MSG_CANVAS_RESIZE */
    uint32_t width;
    uint32_t height;
} wesenho_canvas_resize_msg_t;

typedef struct {
    uint32_t type;        /* MSG_CANVAS_RENAME */
    int32_t  canvas_idx;
    char     name[24];
} wesenho_canvas_rename_msg_t;

typedef struct {
    uint32_t type;        /* MSG_CONSOLE_LOG */
    uint32_t color;       /* 0xFFRRGGBB */
    char     text[56];
} wesenho_console_log_msg_t;

typedef struct {
    uint32_t type;       /* MSG_PUB_TOPIC */
    char     topic[32];  /* e.g. "anim:frame", "brush:stroke" */
    uint32_t data_len;
    uint8_t  payload[64];
} wesenho_event_t;

#endif /* WESENHO_H */
