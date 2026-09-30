#include "mypaint_brush.h"

/* =========================================================================
 * Freestanding Math Utilities (Zero libc/libm dependencies)
 * ========================================================================= */

#define MYPAINT_PI 3.14159265358979323846f
#define MYPAINT_TWO_PI 6.28318530717958647692f
#define MYPAINT_HALF_PI 1.57079632679489661923f

static inline float m_fabs(float x) {
    return x < 0.0f ? -x : x;
}

static inline float m_min(float a, float b) {
    return a < b ? a : b;
}

static inline float m_max(float a, float b) {
    return a > b ? a : b;
}

static inline float m_clamp(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline float m_sqrt(float x) {
    if (x <= 0.0f) return 0.0f;
    return __builtin_sqrtf(x);
}

/* Fast polynomial exponential approximation e^x */
static inline float m_exp(float x) {
    if (x < -20.0f) return 0.0f;
    if (x > 20.0f) x = 20.0f;
    
    /* e^x = 2^(x * 1.4426950408889634) */
    float val = 1.0f + x / 256.0f;
    val *= val; val *= val; val *= val; val *= val;
    val *= val; val *= val; val *= val; val *= val;
    return val;
}

/* Fast natural log approximation ln(x) for x > 0 */
static inline float m_log(float x) {
    if (x <= 0.00001f) return -11.51f;
    /* Range reduction around 1.0 */
    float y = (x - 1.0f) / (x + 1.0f);
    float y2 = y * y;
    return 2.0f * y * (1.0f + y2 * (0.333333333f + y2 * (0.2f + y2 * 0.14285714f)));
}

/* Fast polynomial sin [-pi, pi] */
static inline float m_sin(float x) {
    while (x > MYPAINT_PI) x -= MYPAINT_TWO_PI;
    while (x < -MYPAINT_PI) x += MYPAINT_TWO_PI;

    const float B = 4.0f / MYPAINT_PI;
    const float C = -4.0f / (MYPAINT_PI * MYPAINT_PI);
    float y = B * x + C * x * m_fabs(x);
    const float P = 0.225f;
    return P * (y * m_fabs(y) - y) + y;
}

static inline float m_cos(float x) {
    return m_sin(x + MYPAINT_HALF_PI);
}

static inline float m_atan2(float y, float x) {
    if (x == 0.0f) {
        if (y > 0.0f) return MYPAINT_HALF_PI;
        if (y < 0.0f) return -MYPAINT_HALF_PI;
        return 0.0f;
    }
    float z = y / x;
    float res;
    if (m_fabs(z) < 1.0f) {
        res = z / (1.0f + 0.28f * z * z);
        if (x < 0.0f) {
            if (y < 0.0f) return res - MYPAINT_PI;
            return res + MYPAINT_PI;
        }
    } else {
        res = MYPAINT_HALF_PI - (z / (z * z + 0.28f));
        if (y < 0.0f) return res - MYPAINT_PI;
    }
    return res;
}

/* Fast PRNG (XORShift32) */
static inline float m_rand01(uint32_t *seed) {
    uint32_t x = *seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *seed = x ? x : 0x12345678;
    return (float)(x & 0x00FFFFFF) * (1.0f / 16777216.0f);
}

/* =========================================================================
 * Gamma & Color Space Conversion (sRGB <-> Linear RGB, RGB <-> HSV)
 * ========================================================================= */

static inline float srgb_to_linear(float c) {
    if (c <= 0.04045f) return c / 12.92f;
    float a = (c + 0.055f) / 1.055f;
    return a * a * (a * 0.8f + 0.2f);
}

static inline float linear_to_srgb(float c) {
    if (c <= 0.0031308f) return c * 12.92f;
    return 1.055f * m_sqrt(m_clamp(c, 0.0f, 1.0f)) - 0.055f;
}

static void hsv_to_rgb(float h, float s, float v, float *r, float *g, float *b) {
    h = h - (int)h;
    if (h < 0.0f) h += 1.0f;
    float c = v * s;
    float x = c * (1.0f - m_fabs(m_sin(h * MYPAINT_PI * 6.0f - MYPAINT_PI)));
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

__attribute__((unused))
static void rgb_to_hsv(float r, float g, float b, float *h, float *s, float *v) {
    float mx = m_max(r, m_max(g, b));
    float mn = m_min(r, m_min(g, b));
    float df = mx - mn;
    *v = mx;
    if (mx <= 0.0001f) {
        *s = 0.0f;
        *h = 0.0f;
        return;
    }
    *s = df / mx;
    if (df <= 0.0001f) {
        *h = 0.0f;
        return;
    }
    if (mx == r) {
        *h = (g - b) / df + (g < b ? 6.0f : 0.0f);
    } else if (mx == g) {
        *h = (b - r) / df + 2.0f;
    } else {
        *h = (r - g) / df + 4.0f;
    }
    *h /= 6.0f;
}

/* =========================================================================
 * Spline Curve Evaluator
 * ========================================================================= */

static inline float curve_eval(const mypaint_curve_t *c, float in) {
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
 * Brush Def & State Lifecycle
 * ========================================================================= */

void mypaint_brush_init(mypaint_brush_def_t *brush) {
    if (!brush) return;
    for (int s = 0; s < MYPAINT_SETTINGS_COUNT; s++) {
        brush->base_values[s] = 0.0f;
        brush->active_inputs[s] = 0;
        for (int i = 0; i < MYPAINT_INPUTS_COUNT; i++) {
            brush->curves[s][i].num_points = 0;
        }
    }
    /* Standard Defaults */
    brush->base_values[MYPAINT_SETTING_OPAQUE] = 1.0f;
    brush->base_values[MYPAINT_SETTING_RADIUS_LOGARITHMIC] = 2.0f;
    brush->base_values[MYPAINT_SETTING_HARDNESS] = 0.8f;
    brush->base_values[MYPAINT_SETTING_DABS_PER_BASIC_RADIUS] = 0.0f;
    brush->base_values[MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS] = 2.0f;
    brush->base_values[MYPAINT_SETTING_DABS_PER_SECOND] = 0.0f;
    brush->base_values[MYPAINT_SETTING_SPEED1_SLOWNESS] = 0.04f;
    brush->base_values[MYPAINT_SETTING_SPEED2_SLOWNESS] = 0.8f;
    brush->base_values[MYPAINT_SETTING_ELLIPTICAL_DAB_RATIO] = 1.0f;
    brush->base_values[MYPAINT_SETTING_COLOR_V] = 1.0f;
}

void mypaint_brush_set_base_value(mypaint_brush_def_t *brush, int setting, float value) {
    if (!brush || setting < 0 || setting >= MYPAINT_SETTINGS_COUNT) return;
    brush->base_values[setting] = value;
}

float mypaint_brush_get_base_value(const mypaint_brush_def_t *brush, int setting) {
    if (!brush || setting < 0 || setting >= MYPAINT_SETTINGS_COUNT) return 0.0f;
    return brush->base_values[setting];
}

void mypaint_brush_set_curve(mypaint_brush_def_t *brush, int setting, int input_idx, int npoints, const float *x, const float *y) {
    if (!brush || setting < 0 || setting >= MYPAINT_SETTINGS_COUNT || input_idx < 0 || input_idx >= MYPAINT_INPUTS_COUNT) return;
    if (npoints <= 0 || !x || !y) {
        mypaint_brush_clear_curve(brush, setting, input_idx);
        return;
    }
    int count = npoints > MYPAINT_MAX_CURVE_POINTS ? MYPAINT_MAX_CURVE_POINTS : npoints;
    mypaint_curve_t *c = &brush->curves[setting][input_idx];
    c->num_points = (uint8_t)count;
    for (int i = 0; i < count; i++) {
        c->x[i] = x[i];
        c->y[i] = y[i];
    }
    brush->active_inputs[setting] |= (1 << input_idx);
}

void mypaint_brush_clear_curve(mypaint_brush_def_t *brush, int setting, int input_idx) {
    if (!brush || setting < 0 || setting >= MYPAINT_SETTINGS_COUNT || input_idx < 0 || input_idx >= MYPAINT_INPUTS_COUNT) return;
    brush->curves[setting][input_idx].num_points = 0;
    brush->active_inputs[setting] &= ~(1 << input_idx);
}

void mypaint_brush_state_init(mypaint_brush_state_t *state) {
    if (!state) return;
    state->x = 0.0f;
    state->y = 0.0f;
    state->last_x = 0.0f;
    state->last_y = 0.0f;
    state->pressure = 0.0f;
    state->tilt_x = 0.0f;
    state->tilt_y = 0.0f;
    state->speed1 = 0.0f;
    state->speed2 = 0.0f;
    state->direction_dx = 1.0f;
    state->direction_dy = 0.0f;
    state->smoothed_direction = 0.0f;
    state->custom_input = 0.0f;
    state->stroke_distance = 0.0f;
    state->stroke_time = 0.0f;
    state->dabs_accumulator = 0.0f;
    state->random_seed = 0x87654321;
    state->in_stroke = false;
    for (int i = 0; i < MYPAINT_MAX_SMUDGE_BUCKETS; i++) {
        state->smudge_r[i] = 0.0f;
        state->smudge_g[i] = 0.0f;
        state->smudge_b[i] = 0.0f;
        state->smudge_a[i] = 0.0f;
    }
}

void mypaint_brush_state_reset(mypaint_brush_state_t *state) {
    mypaint_brush_state_init(state);
}

/* =========================================================================
 * Setting Evaluation
 * ========================================================================= */

static inline float evaluate_setting(const mypaint_brush_def_t *brush, int setting, const float inputs[MYPAINT_INPUTS_COUNT]) {
    float val = brush->base_values[setting];
    uint16_t mask = brush->active_inputs[setting];
    if (mask == 0) return val;

    for (int i = 0; i < MYPAINT_INPUTS_COUNT; i++) {
        if (mask & (1 << i)) {
            val += curve_eval(&brush->curves[setting][i], inputs[i]);
        }
    }
    return val;
}

/* =========================================================================
 * Core Simulation Step Loop
 * ========================================================================= */

void mypaint_brush_stroke_to(const mypaint_brush_def_t *brush,
                             mypaint_brush_state_t *state,
                             float target_x, float target_y,
                             float pressure,
                             float tilt_x, float tilt_y,
                             float dtime,
                             float viewzoom,
                             void *surface_ctx,
                             mypaint_render_dab_fn render_dab_cb) {
    if (!brush || !state || !render_dab_cb) return;
    if (dtime < 0.0001f) dtime = 0.0001f;
    if (viewzoom <= 0.0f) viewzoom = 1.0f;

    /* First point initialize */
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
        state->dabs_accumulator = 1.0f; /* Emit dab on initial contact */
        state->in_stroke = true;
    }

    /* 1. Slow tracking (position stabilization) */
    float slow_tracking = m_clamp(brush->base_values[MYPAINT_SETTING_SLOW_TRACKING], 0.0f, 10.0f);
    float track_alpha = 1.0f;
    if (slow_tracking > 0.001f) {
        track_alpha = 1.0f - m_exp(-dtime / slow_tracking);
    }
    float cur_x = state->x + (target_x - state->x) * track_alpha;
    float cur_y = state->y + (target_y - state->y) * track_alpha;

    /* 2. Kinematics (distance and speed) */
    float dx = cur_x - state->last_x;
    float dy = cur_y - state->last_y;
    float dist = m_sqrt(dx * dx + dy * dy);
    float raw_speed = dist / dtime;

    /* 3. Dual EMA Speed Filters */
    float s1_slow = m_max(brush->base_values[MYPAINT_SETTING_SPEED1_SLOWNESS], 0.001f);
    float s2_slow = m_max(brush->base_values[MYPAINT_SETTING_SPEED2_SLOWNESS], 0.001f);
    float alpha1 = 1.0f - m_exp(-dtime / s1_slow);
    float alpha2 = 1.0f - m_exp(-dtime / s2_slow);

    state->speed1 += (raw_speed - state->speed1) * alpha1;
    state->speed2 += (raw_speed - state->speed2) * alpha2;

    /* 4. Direction & Tilt Polar Vectors */
    if (dist > 0.001f) {
        float dir_filter = m_clamp(brush->base_values[MYPAINT_SETTING_DIRECTION_FILTER], 0.0f, 1.0f);
        float dir_alpha = 1.0f - m_exp(-dtime / (0.01f + dir_filter * 0.5f));
        state->direction_dx += (dx / dist - state->direction_dx) * dir_alpha;
        state->direction_dy += (dy / dist - state->direction_dy) * dir_alpha;
        float dir_norm = m_sqrt(state->direction_dx * state->direction_dx + state->direction_dy * state->direction_dy);
        if (dir_norm > 0.0001f) {
            state->direction_dx /= dir_norm;
            state->direction_dy /= dir_norm;
        }
        state->smoothed_direction = m_atan2(state->direction_dy, state->direction_dx);
    }

    /* Tilt Polar Decomposition */
    float tilt_mag = m_min(m_sqrt(tilt_x * tilt_x + tilt_y * tilt_y), 1.0f);
    float declination = tilt_mag;
    float ascension = m_atan2(tilt_y, tilt_x) / MYPAINT_PI;
    float attack_angle = m_fabs(state->smoothed_direction - (ascension * MYPAINT_PI));
    while (attack_angle > MYPAINT_PI) attack_angle -= MYPAINT_TWO_PI;
    attack_angle = m_fabs(attack_angle) / MYPAINT_PI;

    /* 5. Fill Base Inputs Vector */
    float inputs[MYPAINT_INPUTS_COUNT];
    inputs[MYPAINT_INPUT_PRESSURE] = m_clamp(pressure, 0.0f, 1.0f);
    inputs[MYPAINT_INPUT_SPEED1] = m_log(state->speed1 + 1.0f);
    inputs[MYPAINT_INPUT_SPEED2] = m_log(state->speed2 + 1.0f);
    inputs[MYPAINT_INPUT_RANDOM] = m_rand01(&state->random_seed);
    inputs[MYPAINT_INPUT_STROKE] = state->stroke_distance;
    inputs[MYPAINT_INPUT_DIRECTION] = (state->smoothed_direction + MYPAINT_PI) / MYPAINT_TWO_PI;
    inputs[MYPAINT_INPUT_DECLINATION] = declination;
    inputs[MYPAINT_INPUT_ASCENSION] = ascension;
    inputs[MYPAINT_INPUT_CUSTOM] = state->custom_input;
    inputs[MYPAINT_INPUT_ATTACK_ANGLE] = attack_angle;
    inputs[MYPAINT_INPUT_DECLINATION_X] = tilt_x;
    inputs[MYPAINT_INPUT_DECLINATION_Y] = tilt_y;
    inputs[MYPAINT_INPUT_GRIDMAP_X] = cur_x;
    inputs[MYPAINT_INPUT_GRIDMAP_Y] = cur_y;
    inputs[MYPAINT_INPUT_VIEWZOOM] = viewzoom;
    inputs[MYPAINT_INPUT_STROKE_DURATION] = state->stroke_time;

    /* Stroke threshold check */
    float stroke_threshold = evaluate_setting(brush, MYPAINT_SETTING_STROKE_THRESHOLD, inputs);
    if (pressure < stroke_threshold && stroke_threshold > 0.0f) {
        state->last_x = cur_x;
        state->last_y = cur_y;
        state->x = cur_x;
        state->y = cur_y;
        return;
    }

    /* 6. Spacing Calculation (Geometric + Temporal Airbrush) */
    float radius_log = evaluate_setting(brush, MYPAINT_SETTING_RADIUS_LOGARITHMIC, inputs);
    float base_radius = m_exp(brush->base_values[MYPAINT_SETTING_RADIUS_LOGARITHMIC]);
    float actual_radius = m_exp(radius_log);
    if (base_radius < 0.5f) base_radius = 0.5f;
    if (actual_radius < 0.5f) actual_radius = 0.5f;

    float dabs_per_basic = evaluate_setting(brush, MYPAINT_SETTING_DABS_PER_BASIC_RADIUS, inputs);
    float dabs_per_actual = evaluate_setting(brush, MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS, inputs);
    float dabs_per_sec = evaluate_setting(brush, MYPAINT_SETTING_DABS_PER_SECOND, inputs);

    float delta_dabs = dabs_per_sec * dtime;
    if (actual_radius > 0.0f && dabs_per_actual > 0.0f) {
        delta_dabs += (dist / actual_radius) * dabs_per_actual;
    }
    if (base_radius > 0.0f && dabs_per_basic > 0.0f) {
        delta_dabs += (dist / base_radius) * dabs_per_basic;
    }

    state->dabs_accumulator += delta_dabs;

    /* 7. Emit Dabs */
    int dab_count = (int)state->dabs_accumulator;
    if (dab_count > 0) {
        float step_t = 1.0f / (float)dab_count;
        for (int i = 0; i < dab_count; i++) {
            float frac = ((float)i + 0.5f) * step_t;
            float dab_x = state->last_x + dx * frac;
            float dab_y = state->last_y + dy * frac;
            float dab_p = state->pressure + (pressure - state->pressure) * frac;

            /* Pressure gain */
            float p_gain_log = evaluate_setting(brush, MYPAINT_SETTING_PRESSURE_GAIN_LOG, inputs);
            if (p_gain_log != 0.0f) {
                dab_p = m_clamp(dab_p * m_exp(p_gain_log), 0.0f, 1.0f);
            }

            inputs[MYPAINT_INPUT_PRESSURE] = dab_p;
            inputs[MYPAINT_INPUT_RANDOM] = m_rand01(&state->random_seed);

            /* Re-evaluate dynamic radius and opacity for interpolated point */
            float cur_rad_log = evaluate_setting(brush, MYPAINT_SETTING_RADIUS_LOGARITHMIC, inputs);
            float rad_rand = evaluate_setting(brush, MYPAINT_SETTING_RADIUS_BY_RANDOM, inputs);
            if (rad_rand != 0.0f) {
                cur_rad_log += (inputs[MYPAINT_INPUT_RANDOM] * 2.0f - 1.0f) * rad_rand;
            }
            float dab_radius = m_exp(cur_rad_log);

            /* Opacity */
            float dab_opaque = evaluate_setting(brush, MYPAINT_SETTING_OPAQUE, inputs);
            float op_mul = evaluate_setting(brush, MYPAINT_SETTING_OPAQUE_MULTIPLY, inputs);
            if (op_mul != 0.0f) dab_opaque *= op_mul;
            dab_opaque = m_clamp(dab_opaque, 0.0f, 2.0f);

            /* Hardness */
            float dab_hardness = m_clamp(evaluate_setting(brush, MYPAINT_SETTING_HARDNESS, inputs), 0.0f, 1.0f);

            /* Aspect Ratio & Angle */
            float aspect = m_max(evaluate_setting(brush, MYPAINT_SETTING_ELLIPTICAL_DAB_RATIO, inputs), 1.0f);
            float angle_deg = evaluate_setting(brush, MYPAINT_SETTING_ELLIPTICAL_DAB_ANGLE, inputs);

            /* Random Offsets */
            float off_rand = evaluate_setting(brush, MYPAINT_SETTING_OFFSET_BY_RANDOM, inputs);
            if (off_rand > 0.0f) {
                dab_x += (m_rand01(&state->random_seed) * 2.0f - 1.0f) * off_rand * dab_radius;
                dab_y += (m_rand01(&state->random_seed) * 2.0f - 1.0f) * off_rand * dab_radius;
            }

            /* Colors & HSV shifts */
            float col_h = evaluate_setting(brush, MYPAINT_SETTING_COLOR_H, inputs);
            float col_s = evaluate_setting(brush, MYPAINT_SETTING_COLOR_S, inputs);
            float col_v = evaluate_setting(brush, MYPAINT_SETTING_COLOR_V, inputs);

            float ch_h = evaluate_setting(brush, MYPAINT_SETTING_CHANGE_COLOR_H, inputs);
            float ch_l = evaluate_setting(brush, MYPAINT_SETTING_CHANGE_COLOR_L, inputs);
            float ch_s = evaluate_setting(brush, MYPAINT_SETTING_CHANGE_COLOR_HSL_S, inputs);

            col_h = col_h + ch_h;
            col_s = m_clamp(col_s + ch_s, 0.0f, 1.0f);
            col_v = m_clamp(col_v + ch_l, 0.0f, 1.0f);

            float lr, lg, lb;
            hsv_to_rgb(col_h, col_s, col_v, &lr, &lg, &lb);

            /* Smudge settings */
            float smudge = m_clamp(evaluate_setting(brush, MYPAINT_SETTING_SMUDGE, inputs), 0.0f, 1.0f);
            float smudge_length = evaluate_setting(brush, MYPAINT_SETTING_SMUDGE_LENGTH, inputs);
            float smudge_len_log = evaluate_setting(brush, MYPAINT_SETTING_SMUDGE_LENGTH_LOG, inputs);
            if (smudge_len_log != 0.0f) smudge_length *= m_exp(smudge_len_log);

            float smudge_rad_log = evaluate_setting(brush, MYPAINT_SETTING_SMUDGE_RADIUS_LOG, inputs);
            float smudge_radius = m_exp(smudge_rad_log);
            if (smudge_radius <= 0.0f) smudge_radius = dab_radius;

            int bucket = (int)evaluate_setting(brush, MYPAINT_SETTING_SMUDGE_BUCKET, inputs) % MYPAINT_MAX_SMUDGE_BUCKETS;
            if (bucket < 0) bucket = 0;

            /* Prepare Dab struct */
            mypaint_dab_t dab;
            dab.x = dab_x;
            dab.y = dab_y;
            dab.radius = dab_radius;
            dab.opacity = dab_opaque;
            dab.hardness = dab_hardness;
            dab.aspect_ratio = aspect;
            dab.angle_deg = angle_deg;
            dab.r = srgb_to_linear(lr);
            dab.g = srgb_to_linear(lg);
            dab.b = srgb_to_linear(lb);
            dab.a = dab_opaque;

            dab.smudge = smudge;
            dab.smudge_length = smudge_length;
            dab.smudge_radius = smudge_radius;
            dab.smudge_bucket = bucket;
            dab.smudge_transparency = evaluate_setting(brush, MYPAINT_SETTING_SMUDGE_TRANSPARENCY, inputs) > 0.5f;
            dab.eraser = evaluate_setting(brush, MYPAINT_SETTING_ERASER, inputs) > 0.5f;
            dab.lock_alpha = evaluate_setting(brush, MYPAINT_SETTING_LOCK_ALPHA, inputs) > 0.5f;
            dab.colorize = evaluate_setting(brush, MYPAINT_SETTING_COLORIZE, inputs) > 0.5f;
            dab.posterize = evaluate_setting(brush, MYPAINT_SETTING_POSTERIZE, inputs) > 0.5f;
            dab.posterize_num = (int)evaluate_setting(brush, MYPAINT_SETTING_POSTERIZE_NUM, inputs);
            dab.snap_to_pixel = evaluate_setting(brush, MYPAINT_SETTING_SNAP_TO_PIXEL, inputs) > 0.5f;

            if (dab.snap_to_pixel) {
                dab.x = (float)(int)(dab.x + 0.5f);
                dab.y = (float)(int)(dab.y + 0.5f);
            }

            /* Invoke render blitter */
            render_dab_cb(surface_ctx, &dab);
        }
        state->dabs_accumulator -= (float)dab_count;
    }

    /* Update state progress */
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
 * Area-Weighted Gaussian Smudge & Rasterizer
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
            float weight = m_exp(-dsq * inv_two_r_sq);
            if (weight < 0.01f) continue;

            uint32_t p = row[x];
            float a = (float)((p >> 24) & 0xFF) / 255.0f;
            float r = srgb_to_linear((float)((p >> 16) & 0xFF) / 255.0f);
            float g = srgb_to_linear((float)((p >> 8) & 0xFF) / 255.0f);
            float b = srgb_to_linear((float)(p & 0xFF) / 255.0f);

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

void mypaint_surface_render_dab_rgba(uint32_t *pixels, int width, int height, const mypaint_dab_t *dab) {
    if (!pixels || width <= 0 || height <= 0 || !dab || dab->radius <= 0.1f || dab->opacity <= 0.001f) return;

    float rad = dab->radius;
    float aspect = dab->aspect_ratio;
    if (aspect < 1.0f) aspect = 1.0f;

    /* Bounding box */
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

    /* Ellipse rotation */
    float rad_angle = dab->angle_deg * (MYPAINT_PI / 180.0f);
    float cos_a = m_cos(rad_angle);
    float sin_a = m_sin(rad_angle);

    /* Gaussian hardness scaling */
    float hard = m_clamp(dab->hardness, 0.01f, 0.99f);
    float sigma = rad * (1.0f - hard * 0.5f);
    float inv_two_sigma_sq = 1.0f / (2.0f * sigma * sigma);

    float dab_r = dab->r;
    float dab_g = dab->g;
    float dab_b = dab->b;
    float dab_op = m_clamp(dab->opacity, 0.0f, 1.0f);

    for (int py = y0; py < y1; py++) {
        float dy = (float)py - dab->y;
        uint32_t *row = &pixels[py * width];

        for (int px = x0; px < x1; px++) {
            float dx = (float)px - dab->x;

            /* Rotate to ellipse local coordinates */
            float ex = (dx * cos_a + dy * sin_a);
            float ey = (-dx * sin_a + dy * cos_a) * aspect;
            float dist_sq = ex * ex + ey * ey;

            /* Gaussian falloff: exp(-dist^2 / (2 * sigma^2)) */
            float intensity = m_exp(-dist_sq * inv_two_sigma_sq);
            if (intensity < 0.005f) continue;

            float alpha = intensity * dab_op;
            if (alpha > 1.0f) alpha = 1.0f;

            uint32_t bg_pix = row[px];
            float bg_a = (float)((bg_pix >> 24) & 0xFF) / 255.0f;
            float bg_r = srgb_to_linear((float)((bg_pix >> 16) & 0xFF) / 255.0f);
            float bg_g = srgb_to_linear((float)((bg_pix >> 8) & 0xFF) / 255.0f);
            float bg_b = srgb_to_linear((float)(bg_pix & 0xFF) / 255.0f);

            if (dab->eraser) {
                float out_a = bg_a * (1.0f - alpha);
                uint8_t a_byte = (uint8_t)(m_clamp(out_a, 0.0f, 1.0f) * 255.0f);
                row[px] = ((uint32_t)a_byte << 24) | (bg_pix & 0x00FFFFFF);
            } else if (dab->colorize) {
                /* Colorize blend mode: preserve canvas luminance */
                float bg_lum = 0.2126f * bg_r + 0.7152f * bg_g + 0.0722f * bg_b;
                float out_r = dab_r * bg_lum;
                float out_g = dab_g * bg_lum;
                float out_b = dab_b * bg_lum;

                float blend_r = bg_r + (out_r - bg_r) * alpha;
                float blend_g = bg_g + (out_g - bg_g) * alpha;
                float blend_b = bg_b + (out_b - bg_b) * alpha;
                float out_a = m_max(bg_a, alpha);

                uint8_t r_byte = (uint8_t)(linear_to_srgb(m_clamp(blend_r, 0.0f, 1.0f)) * 255.0f);
                uint8_t g_byte = (uint8_t)(linear_to_srgb(m_clamp(blend_g, 0.0f, 1.0f)) * 255.0f);
                uint8_t b_byte = (uint8_t)(linear_to_srgb(m_clamp(blend_b, 0.0f, 1.0f)) * 255.0f);
                uint8_t a_byte = (uint8_t)(m_clamp(out_a, 0.0f, 1.0f) * 255.0f);

                row[px] = ((uint32_t)a_byte << 24) | ((uint32_t)r_byte << 16) | ((uint32_t)g_byte << 8) | (uint32_t)b_byte;
            } else {
                /* Porter-Duff Over in Linear space */
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

                    uint8_t r_byte = (uint8_t)(linear_to_srgb(m_clamp(out_r, 0.0f, 1.0f)) * 255.0f);
                    uint8_t g_byte = (uint8_t)(linear_to_srgb(m_clamp(out_g, 0.0f, 1.0f)) * 255.0f);
                    uint8_t b_byte = (uint8_t)(linear_to_srgb(m_clamp(out_b, 0.0f, 1.0f)) * 255.0f);
                    uint8_t a_byte = (uint8_t)(m_clamp(out_a, 0.0f, 1.0f) * 255.0f);

                    row[px] = ((uint32_t)a_byte << 24) |
                              ((uint32_t)r_byte << 16) |
                              ((uint32_t)g_byte << 8)  |
                              (uint32_t)b_byte;
                }
            }
        }
    }
}

void mypaint_surface_render_dab_stateful(uint32_t *pixels, int width, int height, const mypaint_dab_t *dab, mypaint_brush_state_t *state) {
    if (!pixels || !dab || !state) return;

    mypaint_dab_t effective_dab = *dab;

    /* Smudge sampling & bucket processing */
    if (dab->smudge > 0.001f) {
        int b = dab->smudge_bucket;
        if (b < 0 || b >= MYPAINT_MAX_SMUDGE_BUCKETS) b = 0;

        float samp_r, samp_g, samp_b, samp_a;
        sample_surface_area_gaussian(pixels, width, height, dab->x, dab->y, dab->smudge_radius,
                                     &samp_r, &samp_g, &samp_b, &samp_a);

        /* Update bucket color with area sample */
        if (samp_a > 0.01f || dab->smudge_transparency) {
            float pickup_rate = dab->smudge;
            state->smudge_r[b] += (samp_r - state->smudge_r[b]) * pickup_rate;
            state->smudge_g[b] += (samp_g - state->smudge_g[b]) * pickup_rate;
            state->smudge_b[b] += (samp_b - state->smudge_b[b]) * pickup_rate;
            state->smudge_a[b] += (samp_a - state->smudge_a[b]) * pickup_rate;
        }

        /* Blend bucket color into active dab */
        float sm_factor = dab->smudge;
        if (state->smudge_a[b] > 0.01f) {
            effective_dab.r = effective_dab.r * (1.0f - sm_factor) + state->smudge_r[b] * sm_factor;
            effective_dab.g = effective_dab.g * (1.0f - sm_factor) + state->smudge_g[b] * sm_factor;
            effective_dab.b = effective_dab.b * (1.0f - sm_factor) + state->smudge_b[b] * sm_factor;
        }
    }

    mypaint_surface_render_dab_rgba(pixels, width, height, &effective_dab);
}
