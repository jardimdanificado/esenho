#include "quadro_brush_dynamics.h"

/* =========================================================================
 * Freestanding Math Utilities (Zero external dependencies)
 * ========================================================================= */

#define W_DYN_PI 3.14159265358979323846f
#define W_DYN_TWO_PI 6.28318530717958647692f
#define W_DYN_HALF_PI 1.57079632679489661923f

static inline float dyn_fabs(float x) {
    return x < 0.0f ? -x : x;
}

static inline float dyn_min(float a, float b) {
    return a < b ? a : b;
}

static inline float dyn_max(float a, float b) {
    return a > b ? a : b;
}

static inline float dyn_clamp(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline float dyn_sqrt(float x) {
    if (x <= 0.0f) return 0.0f;
    return __builtin_sqrtf(x);
}

/* Fast polynomial exponential approximation e^x */
static inline float dyn_exp(float x) {
    if (x < -20.0f) return 0.0f;
    if (x > 20.0f) x = 20.0f;
    
    float val = 1.0f + x / 256.0f;
    val *= val; val *= val; val *= val; val *= val;
    val *= val; val *= val; val *= val; val *= val;
    return val;
}

/* Fast natural log approximation ln(x) for x > 0 */
static inline float dyn_log(float x) {
    if (x <= 0.00001f) return -11.51f;
    float y = (x - 1.0f) / (x + 1.0f);
    float y2 = y * y;
    return 2.0f * y * (1.0f + y2 * (0.333333333f + y2 * (0.2f + y2 * 0.14285714f)));
}

/* Fast polynomial sin [-pi, pi] */
static inline float dyn_sin(float x) {
    while (x > W_DYN_PI) x -= W_DYN_TWO_PI;
    while (x < -W_DYN_PI) x += W_DYN_TWO_PI;

    const float B = 4.0f / W_DYN_PI;
    const float C = -4.0f / (W_DYN_PI * W_DYN_PI);
    float y = B * x + C * x * dyn_fabs(x);
    const float P = 0.225f;
    return P * (y * dyn_fabs(y) - y) + y;
}

static inline float dyn_cos(float x) {
    return dyn_sin(x + W_DYN_HALF_PI);
}

static inline float dyn_atan2(float y, float x) {
    if (x == 0.0f) {
        if (y > 0.0f) return W_DYN_HALF_PI;
        if (y < 0.0f) return -W_DYN_HALF_PI;
        return 0.0f;
    }
    float z = y / x;
    float res;
    if (dyn_fabs(z) < 1.0f) {
        res = z / (1.0f + 0.28f * z * z);
        if (x < 0.0f) {
            if (y < 0.0f) return res - W_DYN_PI;
            return res + W_DYN_PI;
        }
    } else {
        res = W_DYN_HALF_PI - (z / (z * z + 0.28f));
        if (y < 0.0f) return res - W_DYN_PI;
    }
    return res;
}

/* Fast PRNG (XORShift32) */
static inline float dyn_rand01(uint32_t *seed) {
    uint32_t x = *seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *seed = x ? x : 0x12345678;
    return (float)(x & 0x00FFFFFF) * (1.0f / 16777216.0f);
}

/* =========================================================================
 * Color Spaces (sRGB <-> Linear RGB, HSV Conversion)
 * ========================================================================= */

static inline float dyn_srgb_to_linear(float c) {
    if (c <= 0.04045f) return c / 12.92f;
    float a = (c + 0.055f) / 1.055f;
    return a * a * (a * 0.8f + 0.2f);
}

static inline float dyn_linear_to_srgb(float c) {
    if (c <= 0.0031308f) return c * 12.92f;
    return 1.055f * dyn_sqrt(dyn_clamp(c, 0.0f, 1.0f)) - 0.055f;
}

static void dyn_hsv_to_rgb(float h, float s, float v, float *r, float *g, float *b) {
    h = h - (int)h;
    if (h < 0.0f) h += 1.0f;
    float c = v * s;
    float x = c * (1.0f - dyn_fabs(dyn_sin(h * W_DYN_PI * 6.0f - W_DYN_PI)));
    float m = v - c;
    
    int segment = (int)(h * 6.0f) % 6;
    switch (segment) {
        case 0: *r = c + m; *g = x + m; *b = m; break;
        case 1: *r = x + m; *g = c + m; *b = m; break;
        case 2: *r = m; *g = c + m; *b = x + m; break;
        case 3: *r = m; *g = x + m; *b = c + m; break;
        case 4: *r = x + m; *g = m; *b = c + m; break;
        default: *r = c + m; *g = m; *b = x + m; break;
    }
}

/* =========================================================================
 * Spline Curve Evaluator
 * ========================================================================= */

static inline float dyn_curve_eval(const w_dyn_curve_t *c, float in) {
    if (c->num_points == 0) return 0.0f;
    if (in <= c->x[0]) return c->y[0];
    if (in >= c->x[c->num_points - 1]) return c->y[c->num_points - 1];

    for (int i = 0; i < c->num_points - 1; i++) {
        if (in >= c->x[i] && in <= c->x[i + 1]) {
            float dx = c->x[i + 1] - c->x[i];
            if (dx <= 0.00001f) return c->y[i];
            float t = (in - c->x[i]) / dx;
            return c->y[i] + t * (c->y[i + 1] - c->y[i]);
        }
    }
    return c->y[c->num_points - 1];
}

/* =========================================================================
 * Lifecycle Management
 * ========================================================================= */

void w_dyn_brush_init(w_dyn_brush_def_t *brush) {
    if (!brush) return;
    for (int s = 0; s < W_DYN_SETTINGS_COUNT; s++) {
        brush->base_values[s] = 0.0f;
        brush->active_inputs[s] = 0;
        for (int i = 0; i < W_DYN_INPUTS_COUNT; i++) {
            brush->curves[s][i].num_points = 0;
        }
    }
    brush->base_values[W_DYN_SETTING_OPAQUE] = 1.0f;
    brush->base_values[W_DYN_SETTING_RADIUS_LOG] = 2.0f;
    brush->base_values[W_DYN_SETTING_HARDNESS] = 0.8f;
    brush->base_values[W_DYN_SETTING_DABS_PER_BASIC_RADIUS] = 0.0f;
    brush->base_values[W_DYN_SETTING_DABS_PER_ACTUAL_RADIUS] = 2.0f;
    brush->base_values[W_DYN_SETTING_DABS_PER_SECOND] = 0.0f;
    brush->base_values[W_DYN_SETTING_SPEED_FINE_SLOWNESS] = 0.04f;
    brush->base_values[W_DYN_SETTING_SPEED_COARSE_SLOWNESS] = 0.8f;
    brush->base_values[W_DYN_SETTING_ELLIPSE_RATIO] = 1.0f;
    brush->base_values[W_DYN_SETTING_COLOR_V] = 1.0f;
}

void w_dyn_brush_set_base(w_dyn_brush_def_t *brush, int setting, float value) {
    if (!brush || setting < 0 || setting >= W_DYN_SETTINGS_COUNT) return;
    brush->base_values[setting] = value;
}

float w_dyn_brush_get_base(const w_dyn_brush_def_t *brush, int setting) {
    if (!brush || setting < 0 || setting >= W_DYN_SETTINGS_COUNT) return 0.0f;
    return brush->base_values[setting];
}

void w_dyn_brush_set_curve(w_dyn_brush_def_t *brush, int setting, int input_idx, int npoints, const float *x, const float *y) {
    if (!brush || setting < 0 || setting >= W_DYN_SETTINGS_COUNT || input_idx < 0 || input_idx >= W_DYN_INPUTS_COUNT) return;
    if (npoints <= 0 || !x || !y) {
        w_dyn_brush_clear_curve(brush, setting, input_idx);
        return;
    }
    int count = npoints > W_DYN_MAX_CURVE_POINTS ? W_DYN_MAX_CURVE_POINTS : npoints;
    w_dyn_curve_t *c = &brush->curves[setting][input_idx];
    c->num_points = (uint8_t)count;
    for (int i = 0; i < count; i++) {
        c->x[i] = x[i];
        c->y[i] = y[i];
    }
    brush->active_inputs[setting] |= (1 << input_idx);
}

void w_dyn_brush_clear_curve(w_dyn_brush_def_t *brush, int setting, int input_idx) {
    if (!brush || setting < 0 || setting >= W_DYN_SETTINGS_COUNT || input_idx < 0 || input_idx >= W_DYN_INPUTS_COUNT) return;
    brush->curves[setting][input_idx].num_points = 0;
    brush->active_inputs[setting] &= ~(1 << input_idx);
}

void w_dyn_brush_state_init(w_dyn_brush_state_t *state) {
    if (!state) return;
    state->x = 0.0f;
    state->y = 0.0f;
    state->last_x = 0.0f;
    state->last_y = 0.0f;
    state->pressure = 0.0f;
    state->tilt_x = 0.0f;
    state->tilt_y = 0.0f;
    state->speed_fine = 0.0f;
    state->speed_coarse = 0.0f;
    state->direction_dx = 1.0f;
    state->direction_dy = 0.0f;
    state->smoothed_direction = 0.0f;
    state->custom_input = 0.0f;
    state->stroke_distance = 0.0f;
    state->stroke_time = 0.0f;
    state->dabs_accumulator = 0.0f;
    state->random_seed = 0x87654321;
    state->in_stroke = false;
    for (int i = 0; i < W_DYN_MAX_SMUDGE_BUCKETS; i++) {
        state->smudge_r[i] = 0.0f;
        state->smudge_g[i] = 0.0f;
        state->smudge_b[i] = 0.0f;
        state->smudge_a[i] = 0.0f;
    }
}

void w_dyn_brush_state_reset(w_dyn_brush_state_t *state) {
    w_dyn_brush_state_init(state);
}

/* =========================================================================
 * Setting Evaluation
 * ========================================================================= */

static inline float evaluate_dyn_setting(const w_dyn_brush_def_t *brush, int setting, const float inputs[W_DYN_INPUTS_COUNT]) {
    float val = brush->base_values[setting];
    uint16_t mask = brush->active_inputs[setting];
    if (mask == 0) return val;

    for (int i = 0; i < W_DYN_INPUTS_COUNT; i++) {
        if (mask & (1 << i)) {
            val += dyn_curve_eval(&brush->curves[setting][i], inputs[i]);
        }
    }
    return val;
}

/* =========================================================================
 * Core Simulation Step Loop
 * ========================================================================= */

void w_dyn_brush_stroke_to(const w_dyn_brush_def_t *brush,
                           w_dyn_brush_state_t *state,
                           float target_x, float target_y,
                           float pressure,
                           float tilt_x, float tilt_y,
                           float dtime,
                           float viewzoom,
                           void *surface_ctx,
                           w_dyn_render_dab_fn render_dab_cb) {
    if (!brush || !state || !render_dab_cb) return;
    if (dtime < 0.0001f) dtime = 0.0001f;
    if (viewzoom <= 0.0f) viewzoom = 1.0f;

    /* Initialize on first stroke contact */
    if (!state->in_stroke) {
        state->x = target_x;
        state->y = target_y;
        state->last_x = target_x;
        state->last_y = target_y;
        state->pressure = pressure;
        state->tilt_x = tilt_x;
        state->tilt_y = tilt_y;
        state->stroke_distance = 0.0f;
        state->stroke_time = 0.0f;
        state->dabs_accumulator = 1.0f;
        state->in_stroke = true;
    }

    /* 1. Lazy Tracking (Position Stabilization) */
    float lazy_tracking = dyn_clamp(brush->base_values[W_DYN_SETTING_LAZY_TRACKING], 0.0f, 10.0f);
    float track_alpha = 1.0f;
    if (lazy_tracking > 0.001f) {
        track_alpha = 1.0f - dyn_exp(-dtime / lazy_tracking);
    }
    float cur_x = state->x + (target_x - state->x) * track_alpha;
    float cur_y = state->y + (target_y - state->y) * track_alpha;

    /* 2. Kinematics */
    float dx = cur_x - state->last_x;
    float dy = cur_y - state->last_y;
    float dist = dyn_sqrt(dx * dx + dy * dy);
    float raw_speed = dist / dtime;

    /* 3. Dual EMA Speed Filters */
    float s1_slow = dyn_max(brush->base_values[W_DYN_SETTING_SPEED_FINE_SLOWNESS], 0.001f);
    float s2_slow = dyn_max(brush->base_values[W_DYN_SETTING_SPEED_COARSE_SLOWNESS], 0.001f);
    float alpha1 = 1.0f - dyn_exp(-dtime / s1_slow);
    float alpha2 = 1.0f - dyn_exp(-dtime / s2_slow);

    state->speed_fine += (raw_speed - state->speed_fine) * alpha1;
    state->speed_coarse += (raw_speed - state->speed_coarse) * alpha2;

    /* 4. Direction & Tilt Vectors */
    if (dist > 0.001f) {
        float dir_filter = dyn_clamp(brush->base_values[W_DYN_SETTING_DIRECTION_FILTER], 0.0f, 1.0f);
        float dir_alpha = 1.0f - dyn_exp(-dtime / (0.01f + dir_filter * 0.5f));
        state->direction_dx += (dx / dist - state->direction_dx) * dir_alpha;
        state->direction_dy += (dy / dist - state->direction_dy) * dir_alpha;
        float dir_norm = dyn_sqrt(state->direction_dx * state->direction_dx + state->direction_dy * state->direction_dy);
        if (dir_norm > 0.0001f) {
            state->direction_dx /= dir_norm;
            state->direction_dy /= dir_norm;
        }
        state->smoothed_direction = dyn_atan2(state->direction_dy, state->direction_dx);
    }

    float tilt_mag = dyn_min(dyn_sqrt(tilt_x * tilt_x + tilt_y * tilt_y), 1.0f);
    float declination = tilt_mag;
    float ascension = dyn_atan2(tilt_y, tilt_x) / W_DYN_PI;
    float attack_angle = dyn_fabs(state->smoothed_direction - (ascension * W_DYN_PI));
    while (attack_angle > W_DYN_PI) attack_angle -= W_DYN_TWO_PI;
    attack_angle = dyn_fabs(attack_angle) / W_DYN_PI;

    /* 5. Inputs Array */
    float inputs[W_DYN_INPUTS_COUNT];
    inputs[W_DYN_INPUT_PRESSURE] = dyn_clamp(pressure, 0.0f, 1.0f);
    inputs[W_DYN_INPUT_SPEED_FINE] = dyn_log(state->speed_fine + 1.0f);
    inputs[W_DYN_INPUT_SPEED_COARSE] = dyn_log(state->speed_coarse + 1.0f);
    inputs[W_DYN_INPUT_RANDOM] = dyn_rand01(&state->random_seed);
    inputs[W_DYN_INPUT_STROKE_DIST] = state->stroke_distance;
    inputs[W_DYN_INPUT_DIRECTION] = (state->smoothed_direction + W_DYN_PI) / W_DYN_TWO_PI;
    inputs[W_DYN_INPUT_DECLINATION] = declination;
    inputs[W_DYN_INPUT_ASCENSION] = ascension;
    inputs[W_DYN_INPUT_CUSTOM] = state->custom_input;
    inputs[W_DYN_INPUT_ATTACK_ANGLE] = attack_angle;
    inputs[W_DYN_INPUT_TILT_X] = tilt_x;
    inputs[W_DYN_INPUT_TILT_Y] = tilt_y;
    inputs[W_DYN_INPUT_GRIDMAP_X] = cur_x;
    inputs[W_DYN_INPUT_GRIDMAP_Y] = cur_y;
    inputs[W_DYN_INPUT_VIEWZOOM] = viewzoom;
    inputs[W_DYN_INPUT_STROKE_DURATION] = state->stroke_time;

    float stroke_threshold = evaluate_dyn_setting(brush, W_DYN_SETTING_STROKE_THRESHOLD, inputs);
    if (pressure < stroke_threshold && stroke_threshold > 0.0f) {
        state->last_x = cur_x;
        state->last_y = cur_y;
        state->x = cur_x;
        state->y = cur_y;
        return;
    }

    /* 6. Continuous Spacing Calculation */
    float radius_log = evaluate_dyn_setting(brush, W_DYN_SETTING_RADIUS_LOG, inputs);
    float base_radius = dyn_exp(brush->base_values[W_DYN_SETTING_RADIUS_LOG]);
    float actual_radius = dyn_exp(radius_log);
    if (base_radius < 0.5f) base_radius = 0.5f;
    if (actual_radius < 0.5f) actual_radius = 0.5f;

    float dabs_per_basic = evaluate_dyn_setting(brush, W_DYN_SETTING_DABS_PER_BASIC_RADIUS, inputs);
    float dabs_per_actual = evaluate_dyn_setting(brush, W_DYN_SETTING_DABS_PER_ACTUAL_RADIUS, inputs);
    float dabs_per_sec = evaluate_dyn_setting(brush, W_DYN_SETTING_DABS_PER_SECOND, inputs);

    float delta_dabs = dabs_per_sec * dtime;
    if (actual_radius > 0.0f && dabs_per_actual > 0.0f) {
        delta_dabs += (dist / actual_radius) * dabs_per_actual;
    }
    if (base_radius > 0.0f && dabs_per_basic > 0.0f) {
        delta_dabs += (dist / base_radius) * dabs_per_basic;
    }

    state->dabs_accumulator += delta_dabs;

    /* 7. Emit Interpolated Dabs */
    int dab_count = (int)state->dabs_accumulator;
    if (dab_count > 0) {
        float step_t = 1.0f / (float)dab_count;
        for (int i = 0; i < dab_count; i++) {
            float frac = ((float)i + 0.5f) * step_t;
            float dab_x = state->last_x + dx * frac;
            float dab_y = state->last_y + dy * frac;
            float dab_p = state->pressure + (pressure - state->pressure) * frac;

            float p_gain_log = evaluate_dyn_setting(brush, W_DYN_SETTING_PRESSURE_GAIN_LOG, inputs);
            if (p_gain_log != 0.0f) {
                dab_p = dyn_clamp(dab_p * dyn_exp(p_gain_log), 0.0f, 1.0f);
            }

            inputs[W_DYN_INPUT_PRESSURE] = dab_p;
            inputs[W_DYN_INPUT_RANDOM] = dyn_rand01(&state->random_seed);

            float cur_rad_log = evaluate_dyn_setting(brush, W_DYN_SETTING_RADIUS_LOG, inputs);
            float rad_rand = evaluate_dyn_setting(brush, W_DYN_SETTING_RADIUS_BY_RANDOM, inputs);
            if (rad_rand != 0.0f) {
                cur_rad_log += (inputs[W_DYN_INPUT_RANDOM] * 2.0f - 1.0f) * rad_rand;
            }
            float dab_radius = dyn_exp(cur_rad_log);

            float dab_opaque = evaluate_dyn_setting(brush, W_DYN_SETTING_OPAQUE, inputs);
            float op_mul = evaluate_dyn_setting(brush, W_DYN_SETTING_OPAQUE_MULTIPLY, inputs);
            if (op_mul != 0.0f) dab_opaque *= op_mul;
            dab_opaque = dyn_clamp(dab_opaque, 0.0f, 2.0f);

            float dab_hardness = dyn_clamp(evaluate_dyn_setting(brush, W_DYN_SETTING_HARDNESS, inputs), 0.0f, 1.0f);
            float aspect = dyn_max(evaluate_dyn_setting(brush, W_DYN_SETTING_ELLIPSE_RATIO, inputs), 1.0f);
            float angle_deg = evaluate_dyn_setting(brush, W_DYN_SETTING_ELLIPSE_ANGLE, inputs);

            float off_rand = evaluate_dyn_setting(brush, W_DYN_SETTING_OFFSET_BY_RANDOM, inputs);
            if (off_rand > 0.0f) {
                dab_x += (dyn_rand01(&state->random_seed) * 2.0f - 1.0f) * off_rand * dab_radius;
                dab_y += (dyn_rand01(&state->random_seed) * 2.0f - 1.0f) * off_rand * dab_radius;
            }

            float col_h = evaluate_dyn_setting(brush, W_DYN_SETTING_COLOR_H, inputs);
            float col_s = evaluate_dyn_setting(brush, W_DYN_SETTING_COLOR_S, inputs);
            float col_v = evaluate_dyn_setting(brush, W_DYN_SETTING_COLOR_V, inputs);

            float ch_h = evaluate_dyn_setting(brush, W_DYN_SETTING_CHANGE_COLOR_H, inputs);
            float ch_l = evaluate_dyn_setting(brush, W_DYN_SETTING_CHANGE_COLOR_L, inputs);
            float ch_s = evaluate_dyn_setting(brush, W_DYN_SETTING_CHANGE_COLOR_HSL_S, inputs);

            col_h = col_h + ch_h;
            col_s = dyn_clamp(col_s + ch_s, 0.0f, 1.0f);
            col_v = dyn_clamp(col_v + ch_l, 0.0f, 1.0f);

            float lr, lg, lb;
            dyn_hsv_to_rgb(col_h, col_s, col_v, &lr, &lg, &lb);

            float smudge = dyn_clamp(evaluate_dyn_setting(brush, W_DYN_SETTING_SMUDGE, inputs), 0.0f, 1.0f);
            float smudge_length = evaluate_dyn_setting(brush, W_DYN_SETTING_SMUDGE_LENGTH, inputs);
            float smudge_len_log = evaluate_dyn_setting(brush, W_DYN_SETTING_SMUDGE_LENGTH_LOG, inputs);
            if (smudge_len_log != 0.0f) smudge_length *= dyn_exp(smudge_len_log);

            float smudge_rad_log = evaluate_dyn_setting(brush, W_DYN_SETTING_SMUDGE_RADIUS_LOG, inputs);
            float smudge_radius = dyn_exp(smudge_rad_log);
            if (smudge_radius <= 0.0f) smudge_radius = dab_radius;

            int bucket = (int)evaluate_dyn_setting(brush, W_DYN_SETTING_SMUDGE_BUCKET, inputs) % W_DYN_MAX_SMUDGE_BUCKETS;
            if (bucket < 0) bucket = 0;

            w_dyn_dab_t dab;
            dab.x = dab_x;
            dab.y = dab_y;
            dab.radius = dab_radius;
            dab.opacity = dab_opaque;
            dab.hardness = dab_hardness;
            dab.aspect_ratio = aspect;
            dab.angle_deg = angle_deg;
            dab.r = dyn_srgb_to_linear(lr);
            dab.g = dyn_srgb_to_linear(lg);
            dab.b = dyn_srgb_to_linear(lb);
            dab.a = dab_opaque;

            dab.smudge = smudge;
            dab.smudge_length = smudge_length;
            dab.smudge_radius = smudge_radius;
            dab.smudge_bucket = bucket;
            dab.smudge_transparency = evaluate_dyn_setting(brush, W_DYN_SETTING_SMUDGE_TRANSPARENCY, inputs) > 0.5f;
            dab.eraser = evaluate_dyn_setting(brush, W_DYN_SETTING_ERASER, inputs) > 0.5f;
            dab.lock_alpha = evaluate_dyn_setting(brush, W_DYN_SETTING_LOCK_ALPHA, inputs) > 0.5f;
            dab.colorize = evaluate_dyn_setting(brush, W_DYN_SETTING_COLORIZE, inputs) > 0.5f;
            dab.posterize = evaluate_dyn_setting(brush, W_DYN_SETTING_POSTERIZE, inputs) > 0.5f;
            dab.posterize_num = (int)evaluate_dyn_setting(brush, W_DYN_SETTING_POSTERIZE_NUM, inputs);
            dab.snap_to_pixel = evaluate_dyn_setting(brush, W_DYN_SETTING_SNAP_TO_PIXEL, inputs) > 0.5f;

            if (dab.snap_to_pixel) {
                dab.x = (float)(int)(dab.x + 0.5f);
                dab.y = (float)(int)(dab.y + 0.5f);
            }

            render_dab_cb(surface_ctx, &dab);
        }
        state->dabs_accumulator -= (float)dab_count;
    }

    state->last_x = cur_x;
    state->last_y = cur_y;
    state->x = cur_x;
    state->y = cur_y;
    state->pressure = pressure;
    state->tilt_x = tilt_x;
    state->tilt_y = tilt_y;
    state->stroke_distance += dist;
    state->stroke_time += dtime;
}

/* =========================================================================
 * Area-Weighted Gaussian Smudge & Blitter
 * ========================================================================= */

static void sample_surface_area_gaussian(const uint32_t *pixels, int width, int height,
                                         float cx, float cy, float radius,
                                         float *out_r, float *out_g, float *out_b, float *out_a) {
    if (radius <= 0.5f) radius = 0.5f;
    int x0 = (int)(cx - radius * 1.5f);
    int y0 = (int)(cy - radius * 1.5f);
    int x1 = (int)(cx + radius * 1.5f + 1.0f);
    int y1 = (int)(cy + radius * 1.5f + 1.0f);

    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > width) x1 = width;
    if (y1 > height) y1 = height;

    float sum_weight = 0.0f;
    float sum_r = 0.0f, sum_g = 0.0f, sum_b = 0.0f, sum_a = 0.0f;
    float inv_two_r_sq = 1.0f / (2.0f * radius * radius);

    for (int y = y0; y < y1; y++) {
        float dy = (float)y - cy;
        const uint32_t *row = &pixels[y * width];
        for (int x = x0; x < x1; x++) {
            float dx = (float)x - cx;
            float dsq = dx * dx + dy * dy;
            float weight = dyn_exp(-dsq * inv_two_r_sq);
            if (weight < 0.01f) continue;

            uint32_t p = row[x];
            float a = (float)((p >> 24) & 0xFF) / 255.0f;
            float r = dyn_srgb_to_linear((float)((p >> 16) & 0xFF) / 255.0f);
            float g = dyn_srgb_to_linear((float)((p >> 8) & 0xFF) / 255.0f);
            float b = dyn_srgb_to_linear((float)(p & 0xFF) / 255.0f);

            sum_weight += weight;
            sum_r += r * a * weight;
            sum_g += g * a * weight;
            sum_b += b * a * weight;
            sum_a += a * weight;
        }
    }

    if (sum_weight > 0.0001f && sum_a > 0.0001f) {
        *out_r = sum_r / sum_a;
        *out_g = sum_g / sum_a;
        *out_b = sum_b / sum_a;
        *out_a = sum_a / sum_weight;
    } else {
        *out_r = 0.0f;
        *out_g = 0.0f;
        *out_b = 0.0f;
        *out_a = 0.0f;
    }
}

void w_dyn_surface_render_dab(uint32_t *pixels, int width, int height, const w_dyn_dab_t *dab) {
    if (!pixels || width <= 0 || height <= 0 || !dab || dab->radius <= 0.1f || dab->opacity <= 0.001f) return;

    float rad = dab->radius;
    float aspect = dab->aspect_ratio;
    if (aspect < 1.0f) aspect = 1.0f;

    float max_r = rad * aspect * 1.5f + 1.0f;
    int x0 = (int)(dab->x - max_r);
    int y0 = (int)(dab->y - max_r);
    int x1 = (int)(dab->x + max_r + 1.0f);
    int y1 = (int)(dab->y + max_r + 1.0f);

    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > width) x1 = width;
    if (y1 > height) y1 = height;
    if (x0 >= x1 || y0 >= y1) return;

    float rad_angle = dab->angle_deg * (W_DYN_PI / 180.0f);
    float cos_a = dyn_cos(rad_angle);
    float sin_a = dyn_sin(rad_angle);

    float hard = dyn_clamp(dab->hardness, 0.01f, 0.99f);
    float sigma = rad * (1.0f - hard * 0.5f);
    float inv_two_sigma_sq = 1.0f / (2.0f * sigma * sigma);

    float dab_r = dab->r;
    float dab_g = dab->g;
    float dab_b = dab->b;
    float dab_op = dyn_clamp(dab->opacity, 0.0f, 1.0f);

    for (int py = y0; py < y1; py++) {
        float dy = (float)py - dab->y;
        uint32_t *row = &pixels[py * width];

        for (int px = x0; px < x1; px++) {
            float dx = (float)px - dab->x;

            float ex = (dx * cos_a + dy * sin_a);
            float ey = (-dx * sin_a + dy * cos_a) * aspect;
            float dist_sq = ex * ex + ey * ey;

            float intensity = dyn_exp(-dist_sq * inv_two_sigma_sq);
            if (intensity < 0.005f) continue;

            float alpha = intensity * dab_op;
            if (alpha > 1.0f) alpha = 1.0f;

            uint32_t bg_pix = row[px];
            float bg_a = (float)((bg_pix >> 24) & 0xFF) / 255.0f;
            float bg_r = dyn_srgb_to_linear((float)((bg_pix >> 16) & 0xFF) / 255.0f);
            float bg_g = dyn_srgb_to_linear((float)((bg_pix >> 8) & 0xFF) / 255.0f);
            float bg_b = dyn_srgb_to_linear((float)(bg_pix & 0xFF) / 255.0f);

            if (dab->eraser) {
                float out_a = bg_a * (1.0f - alpha);
                uint8_t a_byte = (uint8_t)(dyn_clamp(out_a, 0.0f, 1.0f) * 255.0f);
                row[px] = ((uint32_t)a_byte << 24) | (bg_pix & 0x00FFFFFF);
            } else if (dab->colorize) {
                float bg_lum = 0.2126f * bg_r + 0.7152f * bg_g + 0.0722f * bg_b;
                float out_r = dab_r * bg_lum;
                float out_g = dab_g * bg_lum;
                float out_b = dab_b * bg_lum;

                float blend_r = bg_r + (out_r - bg_r) * alpha;
                float blend_g = bg_g + (out_g - bg_g) * alpha;
                float blend_b = bg_b + (out_b - bg_b) * alpha;
                float out_a = dyn_max(bg_a, alpha);

                uint8_t r_byte = (uint8_t)(dyn_linear_to_srgb(dyn_clamp(blend_r, 0.0f, 1.0f)) * 255.0f);
                uint8_t g_byte = (uint8_t)(dyn_linear_to_srgb(dyn_clamp(blend_g, 0.0f, 1.0f)) * 255.0f);
                uint8_t b_byte = (uint8_t)(dyn_linear_to_srgb(dyn_clamp(blend_b, 0.0f, 1.0f)) * 255.0f);
                uint8_t a_byte = (uint8_t)(dyn_clamp(out_a, 0.0f, 1.0f) * 255.0f);

                row[px] = ((uint32_t)a_byte << 24) | ((uint32_t)r_byte << 16) | ((uint32_t)g_byte << 8) | (uint32_t)b_byte;
            } else {
                float out_a = alpha + bg_a * (1.0f - alpha);
                if (out_a > 0.0001f) {
                    float out_r = (dab_r * alpha + bg_r * bg_a * (1.0f - alpha)) / out_a;
                    float out_g = (dab_g * alpha + bg_g * bg_a * (1.0f - alpha)) / out_a;
                    float out_b = (dab_b * alpha + bg_b * bg_a * (1.0f - alpha)) / out_a;

                    if (dab->posterize && dab->posterize_num > 1) {
                        float steps = (float)dab->posterize_num;
                        out_r = ((int)(out_r * steps + 0.5f)) / steps;
                        out_g = ((int)(out_g * steps + 0.5f)) / steps;
                        out_b = ((int)(out_b * steps + 0.5f)) / steps;
                    }

                    if (dab->lock_alpha) {
                        out_a = bg_a;
                    }

                    uint8_t r_byte = (uint8_t)(dyn_linear_to_srgb(dyn_clamp(out_r, 0.0f, 1.0f)) * 255.0f);
                    uint8_t g_byte = (uint8_t)(dyn_linear_to_srgb(dyn_clamp(out_g, 0.0f, 1.0f)) * 255.0f);
                    uint8_t b_byte = (uint8_t)(dyn_linear_to_srgb(dyn_clamp(out_b, 0.0f, 1.0f)) * 255.0f);
                    uint8_t a_byte = (uint8_t)(dyn_clamp(out_a, 0.0f, 1.0f) * 255.0f);

                    row[px] = ((uint32_t)a_byte << 24) |
                              ((uint32_t)r_byte << 16) |
                              ((uint32_t)g_byte << 8)  |
                              (uint32_t)b_byte;
                }
            }
        }
    }
}

void w_dyn_surface_render_dab_stateful(uint32_t *pixels, int width, int height, const w_dyn_dab_t *dab, w_dyn_brush_state_t *state) {
    if (!pixels || !dab || !state) return;

    w_dyn_dab_t effective_dab = *dab;

    if (dab->smudge > 0.001f) {
        int b = dab->smudge_bucket;
        if (b < 0 || b >= W_DYN_MAX_SMUDGE_BUCKETS) b = 0;

        float samp_r, samp_g, samp_b, samp_a;
        sample_surface_area_gaussian(pixels, width, height, dab->x, dab->y, dab->smudge_radius,
                                     &samp_r, &samp_g, &samp_b, &samp_a);

        if (samp_a > 0.01f || dab->smudge_transparency) {
            float pickup_rate = dab->smudge;
            state->smudge_r[b] += (samp_r - state->smudge_r[b]) * pickup_rate;
            state->smudge_g[b] += (samp_g - state->smudge_g[b]) * pickup_rate;
            state->smudge_b[b] += (samp_b - state->smudge_b[b]) * pickup_rate;
            state->smudge_a[b] += (samp_a - state->smudge_a[b]) * pickup_rate;
        }

        float sm_factor = dab->smudge;
        if (state->smudge_a[b] > 0.01f) {
            effective_dab.r = effective_dab.r * (1.0f - sm_factor) + state->smudge_r[b] * sm_factor;
            effective_dab.g = effective_dab.g * (1.0f - sm_factor) + state->smudge_g[b] * sm_factor;
            effective_dab.b = effective_dab.b * (1.0f - sm_factor) + state->smudge_b[b] * sm_factor;
        }
    }

    w_dyn_surface_render_dab(pixels, width, height, &effective_dab);
}
