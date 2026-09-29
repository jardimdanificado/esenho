#ifndef MYPAINT_ENGINE_H
#define MYPAINT_ENGINE_H

#include <stdint.h>
#include <stddef.h>

#define W_EXPORT __attribute__((visibility("default")))

#ifdef __cplusplus
extern "C" {
#endif

/* =========================================================================
 * MyPaint Settings Enums (Standard libmypaint v1/v2 mapping)
 * ========================================================================= */
typedef enum {
    MYPAINT_SETTING_OPAQUE = 0,
    MYPAINT_SETTING_OPAQUE_MULTIPLY,
    MYPAINT_SETTING_OPAQUE_LINEARIZE,
    MYPAINT_SETTING_RADIUS_LOGARITHMIC,
    MYPAINT_SETTING_HARDNESS,
    MYPAINT_SETTING_DABS_PER_BASIC_RADIUS,
    MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS,
    MYPAINT_SETTING_DABS_PER_SECOND,
    MYPAINT_SETTING_RADIUS_BY_RANDOM,
    MYPAINT_SETTING_SPEED1_SLOWNESS,
    MYPAINT_SETTING_SPEED2_SLOWNESS,
    MYPAINT_SETTING_SPEED1_GAMMA,
    MYPAINT_SETTING_SPEED2_GAMMA,
    MYPAINT_SETTING_OFFSET_BY_RANDOM,
    MYPAINT_SETTING_OFFSET_BY_SPEED,
    MYPAINT_SETTING_OFFSET_BY_SPEED_SLOWNESS,
    MYPAINT_SETTING_SLOW_TRACKING,
    MYPAINT_SETTING_SLOW_TRACKING_PER_DAB,
    MYPAINT_SETTING_TRACKING_NOISE,
    MYPAINT_SETTING_COLOR_H,
    MYPAINT_SETTING_COLOR_S,
    MYPAINT_SETTING_COLOR_V,
    MYPAINT_SETTING_RESTORE_COLOR,
    MYPAINT_SETTING_CHANGE_COLOR_H,
    MYPAINT_SETTING_CHANGE_COLOR_L,
    MYPAINT_SETTING_CHANGE_COLOR_HSL_S,
    MYPAINT_SETTING_CHANGE_COLOR_V,
    MYPAINT_SETTING_CHANGE_COLOR_HSV_S,
    MYPAINT_SETTING_SMUDGE,
    MYPAINT_SETTING_SMUDGE_LENGTH,
    MYPAINT_SETTING_SMUDGE_RADIUS_LOG,
    MYPAINT_SETTING_ERASER,
    MYPAINT_SETTING_STROKE_THRESHOLD,
    MYPAINT_SETTING_STROKE_DURATION_LOGARITHMIC,
    MYPAINT_SETTING_STROKE_HOLDTIME,
    MYPAINT_SETTING_CUSTOM_INPUT,
    MYPAINT_SETTING_CUSTOM_INPUT_SLOWNESS,
    MYPAINT_SETTING_ELLIPTICAL_DAB_RATIO,
    MYPAINT_SETTING_ELLIPTICAL_DAB_ANGLE,
    MYPAINT_SETTING_DIRECTION_FILTER,
    MYPAINT_SETTING_LOCK_ALPHA,
    MYPAINT_SETTING_COLORIZE,
    MYPAINT_SETTING_SNAP_TO_PIXEL,
    MYPAINT_SETTING_PRESSURE_GAIN_LOG,
    MYPAINT_SETTINGS_COUNT
} MyPaintBrushSetting;

/* =========================================================================
 * MyPaint Dynamic Inputs
 * ========================================================================= */
typedef enum {
    MYPAINT_INPUT_PRESSURE = 0,
    MYPAINT_INPUT_SPEED1,
    MYPAINT_INPUT_SPEED2,
    MYPAINT_INPUT_RANDOM,
    MYPAINT_INPUT_STROKE,
    MYPAINT_INPUT_DIRECTION,
    MYPAINT_INPUT_DECLINATION,
    MYPAINT_INPUT_ASCENSION,
    MYPAINT_INPUT_CUSTOM,
    MYPAINT_INPUT_SPEED1_SLOWNESS,
    MYPAINT_INPUT_SPEED2_SLOWNESS,
    MYPAINT_INPUT_COUNT
} MyPaintBrushInput;

#define MAX_CONTROL_POINTS 16
#define MAX_BRUSHES 8

typedef struct {
    float x;
    float y;
} ControlPoint;

typedef struct {
    int point_count;
    ControlPoint points[MAX_CONTROL_POINTS];
} MappingCurve;

typedef struct {
    float base_value;
    MappingCurve inputs[MYPAINT_INPUT_COUNT];
} SettingMapping;

typedef struct {
    int in_use;
    SettingMapping settings[MYPAINT_SETTINGS_COUNT];

    /* Dynamic runtime stroke state */
    float state_x;
    float state_y;
    float state_pressure;
    float last_pressure;
    float speed1;
    float speed2;
    float stroke_distance;
    float stroke_duration;
    float custom_input;

    /* Smudge state (sampled paint on brush) */
    float smudge_r;
    float smudge_g;
    float smudge_b;
    float smudge_a;

    /* Internal step tracking */
    float next_dab_dist;
    float step_remainder;
    uint32_t rng_state;
} MyPaintBrush;

/* Surface Dirty Rectangle */
typedef struct {
    int32_t min_x;
    int32_t min_y;
    int32_t max_x;
    int32_t max_y;
    int32_t has_dirty;
} MyPaintDirtyRect;

/* =========================================================================
 * C ABI Prototypes
 * ========================================================================= */
W_EXPORT void     w_mypaint_init(void);
W_EXPORT void*    w_mypaint_alloc(uint32_t size);
W_EXPORT int32_t  w_mypaint_brush_new(void);
W_EXPORT void     w_mypaint_brush_free(int32_t brush_id);
W_EXPORT void     w_mypaint_brush_reset(int32_t brush_id);
W_EXPORT void     w_mypaint_brush_set_base_value(int32_t brush_id, int32_t setting_id, float value);
W_EXPORT float    w_mypaint_brush_get_base_value(int32_t brush_id, int32_t setting_id);
W_EXPORT void     w_mypaint_brush_set_mapping_point(int32_t brush_id, int32_t setting_id, int32_t input_id, int32_t pt_idx, float x, float y);
W_EXPORT void     w_mypaint_brush_clear_mapping(int32_t brush_id, int32_t setting_id, int32_t input_id);

W_EXPORT int32_t  w_mypaint_stroke_to(int32_t brush_id, uint32_t *pixels, int32_t width, int32_t height,
                                      float x, float y, float pressure, float tilt_x, float tilt_y,
                                      float dtime, uint32_t color_rgba);

W_EXPORT void     w_mypaint_get_dirty_rect(int32_t *out_4words);
W_EXPORT void     w_mypaint_clear_dirty_rect(void);

#ifdef __cplusplus
}
#endif

#endif /* MYPAINT_ENGINE_H */
