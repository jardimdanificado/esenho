#ifndef QUADRO_BRUSH_DYNAMICS_H
#define QUADRO_BRUSH_DYNAMICS_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Maximum number of control points per spline curve */
#define W_DYN_MAX_CURVE_POINTS 16

/* Maximum number of inputs per setting */
#define W_DYN_INPUTS_COUNT 16

/* Total number of dynamic brush settings */
#define W_DYN_SETTINGS_COUNT 48

/* Maximum smudge color buckets */
#define W_DYN_MAX_SMUDGE_BUCKETS 8

/* =========================================================================
 * Dynamic Sensor Inputs (Stylus, Motion & Canvas Variables)
 * ========================================================================= */
typedef enum {
    W_DYN_INPUT_PRESSURE = 0,         /* Stylus pressure (0.0 .. 1.0) */
    W_DYN_INPUT_SPEED_FINE,           /* Fine movement speed (log px/s via EMA speed1) */
    W_DYN_INPUT_SPEED_COARSE,         /* Coarse movement speed (via EMA speed2) */
    W_DYN_INPUT_RANDOM,               /* Pseudo-random uniform (0.0 .. 1.0) */
    W_DYN_INPUT_STROKE_DIST,          /* Distance traveled along stroke */
    W_DYN_INPUT_DIRECTION,            /* Trajectory movement angle */
    W_DYN_INPUT_DECLINATION,          /* Tilt declination from normal (0.0=vertical, 1.0=flat) */
    W_DYN_INPUT_ASCENSION,            /* Tilt azimuth angle around normal (-1.0 .. 1.0) */
    W_DYN_INPUT_CUSTOM,               /* User customizable slider (0.0 .. 1.0) */
    W_DYN_INPUT_ATTACK_ANGLE,         /* Relative angle between motion and tilt vector */
    W_DYN_INPUT_TILT_X,               /* Tilt X component */
    W_DYN_INPUT_TILT_Y,               /* Tilt Y component */
    W_DYN_INPUT_GRIDMAP_X,            /* Global canvas grid map X coordinate */
    W_DYN_INPUT_GRIDMAP_Y,            /* Global canvas grid map Y coordinate */
    W_DYN_INPUT_VIEWZOOM,             /* Current canvas viewport zoom scale */
    W_DYN_INPUT_STROKE_DURATION       /* Time elapsed since stroke start (seconds) */
} w_dyn_input_t;

/* =========================================================================
 * Dynamic Brush Settings (Continuous Spline-Modulated Parameters)
 * ========================================================================= */
typedef enum {
    W_DYN_SETTING_OPAQUE = 0,                 /* Base opacity (0.0 .. 2.0) */
    W_DYN_SETTING_OPAQUE_MULTIPLY,            /* Multiplier for opacity */
    W_DYN_SETTING_OPAQUE_LINEARIZE,           /* Linearize opacity response */
    W_DYN_SETTING_RADIUS_LOG,                 /* Logarithmic radius: r = exp(val) */
    W_DYN_SETTING_HARDNESS,                   /* Gaussian hardness (0.0 .. 1.0) */
    W_DYN_SETTING_DABS_PER_BASIC_RADIUS,      /* Spacing relative to base radius */
    W_DYN_SETTING_DABS_PER_ACTUAL_RADIUS,     /* Spacing relative to dynamic radius */
    W_DYN_SETTING_DABS_PER_SECOND,            /* Temporal airbrush rate */
    W_DYN_SETTING_RADIUS_BY_RANDOM,           /* Radius jitter */
    W_DYN_SETTING_SPEED_FINE_SLOWNESS,        /* Filter weight for speed EMA fine */
    W_DYN_SETTING_SPEED_COARSE_SLOWNESS,      /* Filter weight for speed EMA coarse */
    W_DYN_SETTING_SPEED_FINE_GAMMA,           /* Non-linear response curve for speed fine */
    W_DYN_SETTING_SPEED_COARSE_GAMMA,         /* Non-linear response curve for speed coarse */
    W_DYN_SETTING_OFFSET_BY_RANDOM,           /* Random positional displacement */
    W_DYN_SETTING_OFFSET_BY_SPEED,            /* Directional offset proportional to speed */
    W_DYN_SETTING_OFFSET_BY_SPEED_SLOWNESS,   /* Filter weight for speed offset */
    W_DYN_SETTING_LAZY_TRACKING,              /* Lazy-mouse position stabilizer (seconds) */
    W_DYN_SETTING_LAZY_TRACKING_PER_DAB,      /* Sub-dab lazy mouse factor */
    W_DYN_SETTING_TRACKING_NOISE,             /* Positional jitter noise */
    W_DYN_SETTING_COLOR_H,                    /* Base Hue (0.0 .. 1.0) */
    W_DYN_SETTING_COLOR_S,                    /* Base Saturation (0.0 .. 1.0) */
    W_DYN_SETTING_COLOR_V,                    /* Base Value/Brightness (0.0 .. 1.0) */
    W_DYN_SETTING_RESTORE_COLOR,              /* Auto-restore sampled color */
    W_DYN_SETTING_CHANGE_COLOR_H,             /* Per-dab Hue shift */
    W_DYN_SETTING_CHANGE_COLOR_L,             /* Per-dab Lightness/Value shift */
    W_DYN_SETTING_CHANGE_COLOR_HSL_S,         /* Per-dab Saturation shift */
    W_DYN_SETTING_CHANGE_COLOR_VRX,           /* Hue/Value variance */
    W_DYN_SETTING_SMUDGE,                     /* Smudge blending strength */
    W_DYN_SETTING_SMUDGE_LENGTH,              /* Pigment decay length */
    W_DYN_SETTING_SMUDGE_RADIUS_LOG,          /* Sampling area radius: r = exp(val) */
    W_DYN_SETTING_SMUDGE_BUCKET,              /* Active smudge color bucket index */
    W_DYN_SETTING_SMUDGE_TRANSPARENCY,        /* Allow smudging transparency */
    W_DYN_SETTING_ERASER,                     /* Eraser toggle (1.0 = erase) */
    W_DYN_SETTING_STROKE_THRESHOLD,           /* Minimum pressure threshold to paint */
    W_DYN_SETTING_STROKE_DURATION_LOG,        /* Max duration of stroke */
    W_DYN_SETTING_STROKE_HOLDTIME,            /* Hold time before fade starts */
    W_DYN_SETTING_CUSTOM_INPUT,               /* Custom input slider value */
    W_DYN_SETTING_CUSTOM_INPUT_SLOWNESS,      /* Inertia of custom input slider */
    W_DYN_SETTING_ELLIPSE_RATIO,              /* Ellipse aspect ratio (1.0 = circle) */
    W_DYN_SETTING_ELLIPSE_ANGLE,              /* Ellipse rotation angle (degrees) */
    W_DYN_SETTING_DIRECTION_FILTER,           /* Smoothing factor for trajectory angle */
    W_DYN_SETTING_LOCK_ALPHA,                 /* Protect canvas alpha */
    W_DYN_SETTING_COLORIZE,                   /* Colorize blend mode */
    W_DYN_SETTING_SNAP_TO_PIXEL,              /* Snap dab center to integer coordinates */
    W_DYN_SETTING_PRESSURE_GAIN_LOG,          /* Non-linear pressure response gain */
    W_DYN_SETTING_POSTERIZE,                  /* Posterization enable */
    W_DYN_SETTING_POSTERIZE_NUM,              /* Posterization step count */
    W_DYN_SETTING_SMUDGE_LENGTH_LOG           /* Logarithmic smudge decay */
} w_dyn_setting_t;

/* =========================================================================
 * Spline Curve Data (Piecewise Linear with Flat Fast Evaluation)
 * ========================================================================= */
typedef struct {
    uint8_t num_points;
    float x[W_DYN_MAX_CURVE_POINTS];
    float y[W_DYN_MAX_CURVE_POINTS];
} w_dyn_curve_t;

/* =========================================================================
 * Brush Definition (Flat, Zero Heap, Preallocated)
 * ========================================================================= */
typedef struct {
    float base_values[W_DYN_SETTINGS_COUNT];
    w_dyn_curve_t curves[W_DYN_SETTINGS_COUNT][W_DYN_INPUTS_COUNT];
    uint16_t active_inputs[W_DYN_SETTINGS_COUNT]; /* Bitmask of inputs configured */
} w_dyn_brush_def_t;

/* =========================================================================
 * Brush Runtime State (Persisted across continuous stroke steps)
 * ========================================================================= */
typedef struct {
    /* Coordinates and trajectory */
    float x, y;
    float last_x, last_y;
    float pressure;
    float tilt_x, tilt_y;
    
    /* Filtered variables (EMA) */
    float speed_fine;
    float speed_coarse;
    float direction_dx, direction_dy;
    float smoothed_direction;
    float custom_input;

    /* Stroke accumulators */
    float stroke_distance;
    float stroke_time;
    float dabs_accumulator;
    uint32_t random_seed;

    /* Smudge color accumulators (Linear RGB + Alpha) */
    float smudge_r[W_DYN_MAX_SMUDGE_BUCKETS];
    float smudge_g[W_DYN_MAX_SMUDGE_BUCKETS];
    float smudge_b[W_DYN_MAX_SMUDGE_BUCKETS];
    float smudge_a[W_DYN_MAX_SMUDGE_BUCKETS];

    /* Flag indicating whether stroke is active */
    bool in_stroke;
} w_dyn_brush_state_t;

/* =========================================================================
 * Single Dab Output Parameters
 * ========================================================================= */
typedef struct {
    float x, y;                     /* Center position */
    float radius;                   /* Effective radius in pixels */
    float opacity;                  /* Effective opacity */
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
} w_dyn_dab_t;

/* =========================================================================
 * Callback Function to Blit / Render a Single Dab
 * ========================================================================= */
typedef void (*w_dyn_render_dab_fn)(void *surface_ctx, const w_dyn_dab_t *dab);

/* =========================================================================
 * Core Dynamic Brush C API
 * ========================================================================= */
void w_dyn_brush_init(w_dyn_brush_def_t *brush);
void w_dyn_brush_set_base(w_dyn_brush_def_t *brush, int setting, float value);
float w_dyn_brush_get_base(const w_dyn_brush_def_t *brush, int setting);

void w_dyn_brush_set_curve(w_dyn_brush_def_t *brush, int setting, int input_idx, int npoints, const float *x, const float *y);
void w_dyn_brush_clear_curve(w_dyn_brush_def_t *brush, int setting, int input_idx);

void w_dyn_brush_state_init(w_dyn_brush_state_t *state);
void w_dyn_brush_state_reset(w_dyn_brush_state_t *state);

/* Universal continuous stroke stepping function */
void w_dyn_brush_stroke_to(const w_dyn_brush_def_t *brush,
                           w_dyn_brush_state_t *state,
                           float x, float y,
                           float pressure,
                           float tilt_x, float tilt_y,
                           float dtime,
                           float viewzoom,
                           void *surface_ctx,
                           w_dyn_render_dab_fn render_dab_cb);

/* Freestanding Gaussian & Elliptical surface blitter */
void w_dyn_surface_render_dab(uint32_t *pixels, int width, int height, const w_dyn_dab_t *dab);
void w_dyn_surface_render_dab_stateful(uint32_t *pixels, int width, int height, const w_dyn_dab_t *dab, w_dyn_brush_state_t *state);

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_BRUSH_DYNAMICS_H */
