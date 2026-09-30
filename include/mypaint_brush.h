#ifndef MYPAINT_BRUSH_H
#define MYPAINT_BRUSH_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Maximum number of control points per spline curve */
#define MYPAINT_MAX_CURVE_POINTS 16

/* Maximum number of inputs per setting */
#define MYPAINT_INPUTS_COUNT 16

/* Total number of brush settings */
#define MYPAINT_SETTINGS_COUNT 48

/* Maximum smudge buckets */
#define MYPAINT_MAX_SMUDGE_BUCKETS 8

/* =========================================================================
 * MyPaint Inputs (Sensors & Dynamic Variables)
 * ========================================================================= */
typedef enum {
    MYPAINT_INPUT_PRESSURE = 0,         /* Stylus pressure (0.0 .. 1.0) */
    MYPAINT_INPUT_SPEED1,               /* Fine movement speed (log/pixel/s via EMA speed1) */
    MYPAINT_INPUT_SPEED2,               /* Coarse movement speed (via EMA speed2) */
    MYPAINT_INPUT_RANDOM,               /* Pseudo-random uniform (0.0 .. 1.0) */
    MYPAINT_INPUT_STROKE,               /* Distance traveled along stroke */
    MYPAINT_INPUT_DIRECTION,            /* Trajectory movement angle (radians or degrees normalized) */
    MYPAINT_INPUT_DECLINATION,          /* Tilt declination from normal (0.0 to 1.0 -> 0 to 90 deg) */
    MYPAINT_INPUT_ASCENSION,            /* Tilt azimuth angle around normal (-1.0 to 1.0 -> -pi to pi) */
    MYPAINT_INPUT_CUSTOM,               /* User customizable slider (0.0 .. 1.0) */
    MYPAINT_INPUT_ATTACK_ANGLE,         /* Relative angle between motion and tilt vector */
    MYPAINT_INPUT_DECLINATION_X,        /* Tilt X component */
    MYPAINT_INPUT_DECLINATION_Y,        /* Tilt Y component */
    MYPAINT_INPUT_GRIDMAP_X,            /* Global canvas grid map X coordinate */
    MYPAINT_INPUT_GRIDMAP_Y,            /* Global canvas grid map Y coordinate */
    MYPAINT_INPUT_VIEWZOOM,             /* Current canvas viewport zoom scale */
    MYPAINT_INPUT_STROKE_DURATION       /* Time elapsed since stroke start (seconds) */
} MyPaintInput;

/* =========================================================================
 * MyPaint Settings (Parameters modulated by Inputs)
 * ========================================================================= */
typedef enum {
    MYPAINT_SETTING_OPAQUE = 0,                 /* Base opacity (0.0 .. 2.0) */
    MYPAINT_SETTING_OPAQUE_MULTIPLY,            /* Multiplier for opacity */
    MYPAINT_SETTING_OPAQUE_LINEARIZE,           /* Linearize opacity response */
    MYPAINT_SETTING_RADIUS_LOGARITHMIC,         /* Logarithmic radius: r = exp(val) */
    MYPAINT_SETTING_HARDNESS,                   /* Gaussian hardness (0.0 .. 1.0) */
    MYPAINT_SETTING_DABS_PER_BASIC_RADIUS,      /* Spacing relative to base radius */
    MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS,     /* Spacing relative to dynamic radius */
    MYPAINT_SETTING_DABS_PER_SECOND,            /* Airbrush temporal spacing rate */
    MYPAINT_SETTING_RADIUS_BY_RANDOM,           /* Radius jitter */
    MYPAINT_SETTING_SPEED1_SLOWNESS,            /* Filter weight for speed1 EMA */
    MYPAINT_SETTING_SPEED2_SLOWNESS,            /* Filter weight for speed2 EMA */
    MYPAINT_SETTING_SPEED1_GAMMA,               /* Non-linear response curve for speed1 */
    MYPAINT_SETTING_SPEED2_GAMMA,               /* Non-linear response curve for speed2 */
    MYPAINT_SETTING_OFFSET_BY_RANDOM,           /* Random positional displacement */
    MYPAINT_SETTING_OFFSET_BY_SPEED,            /* Directional offset proportional to speed */
    MYPAINT_SETTING_OFFSET_BY_SPEED_SLOWNESS,   /* Filter weight for speed offset */
    MYPAINT_SETTING_SLOW_TRACKING,              /* Lazy-mouse position stabilization */
    MYPAINT_SETTING_SLOW_TRACKING_PER_DAB,      /* Sub-dab lazy mouse factor */
    MYPAINT_SETTING_TRACKING_NOISE,             /* Positional jitter noise */
    MYPAINT_SETTING_COLOR_H,                    /* Base Hue (0.0 .. 1.0) */
    MYPAINT_SETTING_COLOR_S,                    /* Base Saturation (0.0 .. 1.0) */
    MYPAINT_SETTING_COLOR_V,                    /* Base Value/Brightness (0.0 .. 1.0) */
    MYPAINT_SETTING_RESTORE_COLOR,              /* Auto-restore sampled color */
    MYPAINT_SETTING_CHANGE_COLOR_H,             /* Per-dab Hue shift */
    MYPAINT_SETTING_CHANGE_COLOR_L,             /* Per-dab Lightness/Value shift */
    MYPAINT_SETTING_CHANGE_COLOR_HSL_S,         /* Per-dab Saturation shift */
    MYPAINT_SETTING_CHANGE_COLOR_VRX,           /* Hue/Value variance */
    MYPAINT_SETTING_SMUDGE,                     /* Smudge blending strength */
    MYPAINT_SETTING_SMUDGE_LENGTH,              /* Pigment decay length */
    MYPAINT_SETTING_SMUDGE_RADIUS_LOG,          /* Sampling area radius: r = exp(val) */
    MYPAINT_SETTING_SMUDGE_BUCKET,              /* Active smudge color bucket index */
    MYPAINT_SETTING_SMUDGE_TRANSPARENCY,        /* Allow smudging transparency */
    MYPAINT_SETTING_ERASER,                     /* Eraser toggle (1.0 = erase) */
    MYPAINT_SETTING_STROKE_THRESHOLD,           /* Minimum pressure threshold to paint */
    MYPAINT_SETTING_STROKE_DURATION_LOGARITHMIC,/* Max duration of stroke */
    MYPAINT_SETTING_STROKE_HOLDTIME,            /* Hold time before fade starts */
    MYPAINT_SETTING_CUSTOM_INPUT,               /* Custom input slider value */
    MYPAINT_SETTING_CUSTOM_INPUT_SLOWNESS,      /* Inertia of custom input slider */
    MYPAINT_SETTING_ELLIPTICAL_DAB_RATIO,       /* Ellipse aspect ratio (1.0 = circle) */
    MYPAINT_SETTING_ELLIPTICAL_DAB_ANGLE,       /* Ellipse rotation angle (degrees) */
    MYPAINT_SETTING_DIRECTION_FILTER,           /* Smoothing factor for trajectory angle */
    MYPAINT_SETTING_LOCK_ALPHA,                 /* Protect canvas alpha */
    MYPAINT_SETTING_COLORIZE,                   /* Colorize blend mode */
    MYPAINT_SETTING_SNAP_TO_PIXEL,              /* Snap dab center to integer coordinates */
    MYPAINT_SETTING_PRESSURE_GAIN_LOG,          /* Non-linear pressure response gain */
    MYPAINT_SETTING_POSTERIZE,                  /* Posterization enable */
    MYPAINT_SETTING_POSTERIZE_NUM,              /* Posterization step count */
    MYPAINT_SETTING_SMUDGE_LENGTH_LOG           /* Logarithmic smudge decay */
} MyPaintSetting;

/* =========================================================================
 * Spline Curve Data (Piecewise Linear with Flat Fast Evaluation)
 * ========================================================================= */
typedef struct {
    uint8_t num_points;
    float x[MYPAINT_MAX_CURVE_POINTS];
    float y[MYPAINT_MAX_CURVE_POINTS];
} mypaint_curve_t;

/* =========================================================================
 * Brush Definition (Flat, Zero Heap, Preallocated)
 * ========================================================================= */
typedef struct {
    float base_values[MYPAINT_SETTINGS_COUNT];
    mypaint_curve_t curves[MYPAINT_SETTINGS_COUNT][MYPAINT_INPUTS_COUNT];
    uint16_t active_inputs[MYPAINT_SETTINGS_COUNT]; /* Bitmask of inputs configured */
} mypaint_brush_def_t;

/* =========================================================================
 * Brush Runtime State (Persisted across stroke events)
 * ========================================================================= */
typedef struct {
    /* Coordinates and trajectory */
    float x, y;
    float last_x, last_y;
    float pressure;
    float tilt_x, tilt_y;
    
    /* Filtered variables (EMA) */
    float speed1;
    float speed2;
    float direction_dx, direction_dy;
    float smoothed_direction;
    float custom_input;

    /* Stroke accumulators */
    float stroke_distance;
    float stroke_time;
    float dabs_accumulator;
    uint32_t random_seed;

    /* Smudge color accumulators (in Linear RGB + Alpha) */
    float smudge_r[MYPAINT_MAX_SMUDGE_BUCKETS];
    float smudge_g[MYPAINT_MAX_SMUDGE_BUCKETS];
    float smudge_b[MYPAINT_MAX_SMUDGE_BUCKETS];
    float smudge_a[MYPAINT_MAX_SMUDGE_BUCKETS];

    /* Flag indicating whether stroke has begun */
    bool in_stroke;
} mypaint_brush_state_t;

/* =========================================================================
 * Single Dab Output Specification
 * ========================================================================= */
typedef struct {
    float x, y;                     /* Center position */
    float radius;                   /* Effective radius in pixels */
    float opacity;                  /* Effective opacity (0.0 .. 1.0+) */
    float hardness;                 /* Gaussian falloff hardness */
    float aspect_ratio;             /* Ellipse ratio (major/minor) */
    float angle_deg;                /* Ellipse rotation in degrees */
    
    /* Linear RGBA color */
    float r, g, b, a;
    
    /* Dynamics modifiers */
    float smudge;
    float smudge_length;
    float smudge_radius;
    int   smudge_bucket;
    bool  smudge_transparency;
    bool  eraser;
    bool  lock_alpha;
    bool  colorize;
    bool  posterize;
    int   posterize_num;
    bool  snap_to_pixel;
} mypaint_dab_t;

/* =========================================================================
 * Callback Function to Render / Blit a Single Dab
 * ========================================================================= */
typedef void (*mypaint_render_dab_fn)(void *surface_ctx, const mypaint_dab_t *dab);

/* =========================================================================
 * Public API
 * ========================================================================= */
void mypaint_brush_init(mypaint_brush_def_t *brush);
void mypaint_brush_set_base_value(mypaint_brush_def_t *brush, int setting, float value);
float mypaint_brush_get_base_value(const mypaint_brush_def_t *brush, int setting);

void mypaint_brush_set_curve(mypaint_brush_def_t *brush, int setting, int input_idx, int npoints, const float *x, const float *y);
void mypaint_brush_clear_curve(mypaint_brush_def_t *brush, int setting, int input_idx);

void mypaint_brush_state_init(mypaint_brush_state_t *state);
void mypaint_brush_state_reset(mypaint_brush_state_t *state);

/* Single stroke progression step. Generates dabs and renders them via callback. */
void mypaint_brush_stroke_to(const mypaint_brush_def_t *brush,
                             mypaint_brush_state_t *state,
                             float x, float y,
                             float pressure,
                             float tilt_x, float tilt_y,
                             float dtime,
                             float viewzoom,
                             void *surface_ctx,
                             mypaint_render_dab_fn render_dab_cb);

/* Direct Freestanding Gaussian Blitter for RGBA canvas surfaces */
void mypaint_surface_render_dab_rgba(uint32_t *pixels, int width, int height, const mypaint_dab_t *dab);
void mypaint_surface_render_dab_stateful(uint32_t *pixels, int width, int height, const mypaint_dab_t *dab, mypaint_brush_state_t *state);

#ifdef __cplusplus
}
#endif

#endif /* MYPAINT_BRUSH_H */
