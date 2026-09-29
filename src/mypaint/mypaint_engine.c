#include "mypaint_engine.h"

/* Fast float math helpers for freestanding WASM (-nostdlib) */
static inline float m_clamp(float val, float min_v, float max_v) {
    if (val < min_v) return min_v;
    if (val > max_v) return max_v;
    return val;
}

static inline float m_abs(float v) {
    return v < 0.0f ? -v : v;
}

static inline float m_sqrt(float x) {
    if (x <= 0.0f) return 0.0f;
    return __builtin_sqrtf(x);
}

static inline float m_exp(float x) {
    /* Fast Taylor polynomial approximation for e^x */
    if (x > 15.0f) x = 15.0f;
    if (x < -15.0f) return 0.0f;
    float sum = 1.0f;
    float term = 1.0f;
    for (int i = 1; i <= 10; ++i) {
        term *= x / (float)i;
        sum += term;
    }
    return sum;
}

static inline float m_log(float x) {
    if (x <= 0.0f) return -10.0f;
    /* Fast approximation of ln(x) */
    float y = (x - 1.0f) / (x + 1.0f);
    float y2 = y * y;
    float sum = 0.0f;
    float term = y;
    for (int i = 1; i <= 7; i += 2) {
        sum += term / (float)i;
        term *= y2;
    }
    return 2.0f * sum;
}

/* Fast RNG */
static inline float m_random(uint32_t *state) {
    uint32_t x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return (float)(x & 0xFFFF) / 65535.0f;
}

static MyPaintBrush g_brushes[MAX_BRUSHES] = {0};
static MyPaintDirtyRect g_dirty = {0};
static uint8_t *g_heap_top = 0;

W_EXPORT void *w_mypaint_alloc(uint32_t size) {
    if (!g_heap_top) {
        extern uint8_t __heap_base;
        g_heap_top = &__heap_base;
    }
    uintptr_t cur = ((uintptr_t)g_heap_top + 15) & ~15;
    g_heap_top = (uint8_t*)(cur + size);

    uint32_t cur_mem_bytes = __builtin_wasm_memory_size(0) * 65536;
    if ((uintptr_t)g_heap_top > cur_mem_bytes) {
        uint32_t need_pages = (((uintptr_t)g_heap_top - cur_mem_bytes) + 65535) / 65536;
        __builtin_wasm_memory_grow(0, need_pages);
    }
    return (void*)cur;
}

/* =========================================================================
 * Evaluation of Dynamic Mapping Curves
 * ========================================================================= */
static float eval_curve(const MappingCurve *curve, float input_val) {
    int n = curve->point_count;
    if (n == 0) return 0.0f;
    if (n == 1 || input_val <= curve->points[0].x) return curve->points[0].y;
    if (input_val >= curve->points[n - 1].x) return curve->points[n - 1].y;

    for (int i = 0; i < n - 1; ++i) {
        float x0 = curve->points[i].x;
        float x1 = curve->points[i + 1].x;
        if (input_val >= x0 && input_val <= x1) {
            float dx = x1 - x0;
            if (dx <= 0.00001f) return curve->points[i].y;
            float t = (input_val - x0) / dx;
            return curve->points[i].y + t * (curve->points[i + 1].y - curve->points[i].y);
        }
    }
    return curve->points[n - 1].y;
}

static float get_dynamic_setting(MyPaintBrush *b, int setting_id, const float *inputs) {
    const SettingMapping *map = &b->settings[setting_id];
    float val = map->base_value;
    for (int i = 0; i < MYPAINT_INPUT_COUNT; ++i) {
        if (map->inputs[i].point_count > 0) {
            val += eval_curve(&map->inputs[i], inputs[i]);
        }
    }
    return val;
}

/* =========================================================================
 * Dirty Rect Tracking
 * ========================================================================= */
static inline void update_dirty_bounds(int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    if (!g_dirty.has_dirty) {
        g_dirty.min_x = x0;
        g_dirty.min_y = y0;
        g_dirty.max_x = x1;
        g_dirty.max_y = y1;
        g_dirty.has_dirty = 1;
    } else {
        if (x0 < g_dirty.min_x) g_dirty.min_x = x0;
        if (y0 < g_dirty.min_y) g_dirty.min_y = y0;
        if (x1 > g_dirty.max_x) g_dirty.max_x = x1;
        if (y1 > g_dirty.max_y) g_dirty.max_y = y1;
    }
}

/* =========================================================================
 * Surface Dab Rendering & Color Pickup
 * ========================================================================= */
static void render_dab(uint32_t *pixels, int32_t width, int32_t height,
                       float cx, float cy, float radius, float hardness,
                       float opacity, float r, float g, float b, int is_eraser, int lock_alpha) {
    if (radius <= 0.2f || opacity <= 0.001f || !pixels) return;

    int32_t min_x = (int32_t)(cx - radius - 1.0f);
    int32_t max_x = (int32_t)(cx + radius + 1.0f);
    int32_t min_y = (int32_t)(cy - radius - 1.0f);
    int32_t max_y = (int32_t)(cy + radius + 1.0f);

    if (min_x < 0) min_x = 0;
    if (min_y < 0) min_y = 0;
    if (max_x >= width) max_x = width - 1;
    if (max_y >= height) max_y = height - 1;
    if (min_x > max_x || min_y > max_y) return;

    float r_sq = radius * radius;
    float hard_r = radius * m_clamp(hardness, 0.0f, 0.999f);
    float hard_sq = hard_r * hard_r;
    float fade_range = radius - hard_r;
    if (fade_range <= 0.001f) fade_range = 0.001f;

    uint32_t sr = (uint32_t)(m_clamp(r, 0.0f, 1.0f) * 255.0f);
    uint32_t sg = (uint32_t)(m_clamp(g, 0.0f, 1.0f) * 255.0f);
    uint32_t sb = (uint32_t)(m_clamp(b, 0.0f, 1.0f) * 255.0f);

    for (int32_t y = min_y; y <= max_y; ++y) {
        float dy = (float)y - cy;
        float dy_sq = dy * dy;
        uint32_t *row = &pixels[y * width];

        for (int32_t x = min_x; x <= max_x; ++x) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > r_sq) continue;

            float dist = m_sqrt(dist_sq);
            float alpha_dab = 1.0f;
            if (dist > hard_r) {
                float t = (dist - hard_r) / fade_range;
                alpha_dab = 1.0f - t * t * (3.0f - 2.0f * t); /* smoothstep */
            }

            float final_a = alpha_dab * opacity;
            if (final_a <= 0.001f) continue;
            uint32_t dab_a_int = (uint32_t)(m_clamp(final_a, 0.0f, 1.0f) * 255.0f);

            uint32_t dst = row[x];
            uint32_t da = (dst >> 24) & 0xFF;
            uint32_t dr = dst & 0xFF;
            uint32_t dg = (dst >> 8) & 0xFF;
            uint32_t db = (dst >> 16) & 0xFF;

            if (is_eraser) {
                if (da == 0) continue;
                uint32_t new_a = (da * (255 - dab_a_int)) / 255;
                row[x] = (new_a << 24) | (db << 16) | (dg << 8) | dr;
                continue;
            }

            if (lock_alpha && da == 0) continue;

            /* Source-over blend */
            uint32_t inv_sa = 255 - dab_a_int;
            uint32_t out_a = lock_alpha ? da : dab_a_int + ((da * inv_sa) >> 8);
            if (out_a > 255) out_a = 255;
            if (out_a == 0) continue;

            uint32_t dst_factor = (da * inv_sa) >> 8;
            uint32_t norm = dab_a_int + dst_factor;
            if (norm == 0) norm = 1;

            uint32_t out_r = (sr * dab_a_int + dr * dst_factor) / norm;
            uint32_t out_g = (sg * dab_a_int + dg * dst_factor) / norm;
            uint32_t out_b = (sb * dab_a_int + db * dst_factor) / norm;

            row[x] = (out_a << 24) | ((out_b & 0xFF) << 16) | ((out_g & 0xFF) << 8) | (out_r & 0xFF);
        }
    }

    update_dirty_bounds(min_x, min_y, max_x + 1, max_y + 1);
}

static void sample_surface_color(const uint32_t *pixels, int32_t width, int32_t height,
                                 float cx, float cy, float radius,
                                 float *out_r, float *out_g, float *out_b, float *out_a) {
    if (!pixels || radius <= 0.5f) {
        *out_r = 0.0f; *out_g = 0.0f; *out_b = 0.0f; *out_a = 0.0f;
        return;
    }

    int32_t min_x = (int32_t)(cx - radius);
    int32_t max_x = (int32_t)(cx + radius);
    int32_t min_y = (int32_t)(cy - radius);
    int32_t max_y = (int32_t)(cy + radius);

    if (min_x < 0) min_x = 0;
    if (min_y < 0) min_y = 0;
    if (max_x >= width) max_x = width - 1;
    if (max_y >= height) max_y = height - 1;
    if (min_x > max_x || min_y > max_y) {
        *out_r = 0.0f; *out_g = 0.0f; *out_b = 0.0f; *out_a = 0.0f;
        return;
    }

    float sum_r = 0.0f, sum_g = 0.0f, sum_b = 0.0f, sum_a = 0.0f, total_w = 0.0f;
    float r_sq = radius * radius;

    for (int32_t y = min_y; y <= max_y; ++y) {
        float dy = (float)y - cy;
        const uint32_t *row = &pixels[y * width];
        for (int32_t x = min_x; x <= max_x; ++x) {
            float dx = (float)x - cx;
            float d2 = dx * dx + dy * dy;
            if (d2 > r_sq) continue;

            float w = 1.0f - (d2 / r_sq);
            uint32_t p = row[x];
            float pa = (float)((p >> 24) & 0xFF) / 255.0f;
            float pr = (float)(p & 0xFF) / 255.0f;
            float pg = (float)((p >> 8) & 0xFF) / 255.0f;
            float pb = (float)((p >> 16) & 0xFF) / 255.0f;

            sum_r += pr * pa * w;
            sum_g += pg * pa * w;
            sum_b += pb * pa * w;
            sum_a += pa * w;
            total_w += w;
        }
    }

    if (total_w > 0.001f && sum_a > 0.001f) {
        *out_r = sum_r / sum_a;
        *out_g = sum_g / sum_a;
        *out_b = sum_b / sum_a;
        *out_a = sum_a / total_w;
    } else {
        *out_r = 0.0f; *out_g = 0.0f; *out_b = 0.0f; *out_a = 0.0f;
    }
}

/* =========================================================================
 * C ABI Implementation
 * ========================================================================= */
W_EXPORT void w_mypaint_init(void) {
    for (int i = 0; i < MAX_BRUSHES; ++i) {
        g_brushes[i].in_use = 0;
    }
    g_dirty.has_dirty = 0;
}

W_EXPORT int32_t w_mypaint_brush_new(void) {
    for (int i = 0; i < MAX_BRUSHES; ++i) {
        if (!g_brushes[i].in_use) {
            MyPaintBrush *b = &g_brushes[i];
            b->in_use = 1;
            b->rng_state = 123456789 + i * 31;
            w_mypaint_brush_reset(i);

            /* Set basic sensible defaults */
            b->settings[MYPAINT_SETTING_OPAQUE].base_value = 1.0f;
            b->settings[MYPAINT_SETTING_RADIUS_LOGARITHMIC].base_value = 2.0f; /* radius ~7.3px */
            b->settings[MYPAINT_SETTING_HARDNESS].base_value = 0.8f;
            b->settings[MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS].base_value = 2.0f;
            b->settings[MYPAINT_SETTING_DABS_PER_BASIC_RADIUS].base_value = 0.0f;
            return i;
        }
    }
    return -1;
}

W_EXPORT void w_mypaint_brush_free(int32_t brush_id) {
    if (brush_id >= 0 && brush_id < MAX_BRUSHES) {
        g_brushes[brush_id].in_use = 0;
    }
}

W_EXPORT void w_mypaint_brush_reset(int32_t brush_id) {
    if (brush_id < 0 || brush_id >= MAX_BRUSHES) return;
    MyPaintBrush *b = &g_brushes[brush_id];
    b->state_x = 0.0f;
    b->state_y = 0.0f;
    b->state_pressure = 0.0f;
    b->last_pressure = 0.0f;
    b->speed1 = 0.0f;
    b->speed2 = 0.0f;
    b->stroke_distance = 0.0f;
    b->stroke_duration = 0.0f;
    b->custom_input = 0.0f;
    b->smudge_r = 0.0f;
    b->smudge_g = 0.0f;
    b->smudge_b = 0.0f;
    b->smudge_a = 0.0f;
    b->next_dab_dist = 0.0f;
    b->step_remainder = 0.0f;
}

W_EXPORT void w_mypaint_brush_set_base_value(int32_t brush_id, int32_t setting_id, float value) {
    if (brush_id < 0 || brush_id >= MAX_BRUSHES || setting_id < 0 || setting_id >= MYPAINT_SETTINGS_COUNT) return;
    g_brushes[brush_id].settings[setting_id].base_value = value;
}

W_EXPORT float w_mypaint_brush_get_base_value(int32_t brush_id, int32_t setting_id) {
    if (brush_id < 0 || brush_id >= MAX_BRUSHES || setting_id < 0 || setting_id >= MYPAINT_SETTINGS_COUNT) return 0.0f;
    return g_brushes[brush_id].settings[setting_id].base_value;
}

W_EXPORT void w_mypaint_brush_set_mapping_point(int32_t brush_id, int32_t setting_id, int32_t input_id, int32_t pt_idx, float x, float y) {
    if (brush_id < 0 || brush_id >= MAX_BRUSHES || setting_id < 0 || setting_id >= MYPAINT_SETTINGS_COUNT) return;
    if (input_id < 0 || input_id >= MYPAINT_INPUT_COUNT || pt_idx < 0 || pt_idx >= MAX_CONTROL_POINTS) return;

    MappingCurve *c = &g_brushes[brush_id].settings[setting_id].inputs[input_id];
    c->points[pt_idx].x = x;
    c->points[pt_idx].y = y;
    if (pt_idx >= c->point_count) {
        c->point_count = pt_idx + 1;
    }
}

W_EXPORT void w_mypaint_brush_clear_mapping(int32_t brush_id, int32_t setting_id, int32_t input_id) {
    if (brush_id < 0 || brush_id >= MAX_BRUSHES || setting_id < 0 || setting_id >= MYPAINT_SETTINGS_COUNT) return;
    if (input_id < 0 || input_id >= MYPAINT_INPUT_COUNT) return;
    g_brushes[brush_id].settings[setting_id].inputs[input_id].point_count = 0;
}

W_EXPORT int32_t w_mypaint_stroke_to(int32_t brush_id, uint32_t *pixels, int32_t width, int32_t height,
                                      float x, float y, float pressure, float tilt_x, float tilt_y,
                                      float dtime, uint32_t color_rgba) {
    if (brush_id < 0 || brush_id >= MAX_BRUSHES || !g_brushes[brush_id].in_use || !pixels) return 0;
    MyPaintBrush *b = &g_brushes[brush_id];

    if (dtime <= 0.0001f) dtime = 0.001f;
    if (pressure <= 0.0f && b->last_pressure <= 0.0f) {
        b->state_x = x;
        b->state_y = y;
        return 0;
    }

    float start_x = (b->stroke_duration == 0.0f) ? x : b->state_x;
    float start_y = (b->stroke_duration == 0.0f) ? y : b->state_y;
    float dx = x - start_x;
    float dy = y - start_y;
    float dist = m_sqrt(dx * dx + dy * dy);

    /* Instantaneous speed and low-pass filtered speeds */
    float speed = dist / dtime;
    float speed1_slowness = get_dynamic_setting(b, MYPAINT_SETTING_SPEED1_SLOWNESS, (float[MYPAINT_INPUT_COUNT]){0});
    if (speed1_slowness <= 0.01f) speed1_slowness = 0.04f;
    float alpha1 = 1.0f - m_exp(-dtime / speed1_slowness);
    b->speed1 += alpha1 * (speed - b->speed1);

    float speed2_slowness = get_dynamic_setting(b, MYPAINT_SETTING_SPEED2_SLOWNESS, (float[MYPAINT_INPUT_COUNT]){0});
    if (speed2_slowness <= 0.01f) speed2_slowness = 0.14f;
    float alpha2 = 1.0f - m_exp(-dtime / speed2_slowness);
    b->speed2 += alpha2 * (speed - b->speed2);

    b->stroke_duration += dtime;
    b->stroke_distance += dist;

    /* Base color channels */
    float base_r = (float)(color_rgba & 0xFF) / 255.0f;
    float base_g = (float)((color_rgba >> 8) & 0xFF) / 255.0f;
    float base_b = (float)((color_rgba >> 16) & 0xFF) / 255.0f;
    float base_a = (float)((color_rgba >> 24) & 0xFF) / 255.0f;
    if (base_a <= 0.001f) base_a = 1.0f;

    /* Interpolate stroke segment with sub-steps */
    int num_steps = (int)(dist / 1.0f) + 1;
    if (num_steps > 100) num_steps = 100;

    float step_dt = dtime / (float)num_steps;
    int dabs_drawn = 0;

    for (int step = 1; step <= num_steps; ++step) {
        float t = (float)step / (float)num_steps;
        float cur_x = start_x + dx * t;
        float cur_y = start_y + dy * t;
        float cur_p = b->last_pressure + (pressure - b->last_pressure) * t;

        float inputs[MYPAINT_INPUT_COUNT] = {0};
        inputs[MYPAINT_INPUT_PRESSURE] = cur_p;
        inputs[MYPAINT_INPUT_SPEED1] = m_log(b->speed1 + 0.001f);
        inputs[MYPAINT_INPUT_SPEED2] = m_log(b->speed2 + 0.001f);
        inputs[MYPAINT_INPUT_RANDOM] = m_random(&b->rng_state);
        inputs[MYPAINT_INPUT_STROKE] = m_clamp(b->stroke_distance / 1000.0f, 0.0f, 1.0f);
        inputs[MYPAINT_INPUT_DECLINATION] = tilt_x;
        inputs[MYPAINT_INPUT_ASCENSION] = tilt_y;

        float rad_log = get_dynamic_setting(b, MYPAINT_SETTING_RADIUS_LOGARITHMIC, inputs);
        float radius = m_exp(rad_log);
        if (radius < 0.2f) radius = 0.2f;

        float opaque = get_dynamic_setting(b, MYPAINT_SETTING_OPAQUE, inputs);
        float hardness = get_dynamic_setting(b, MYPAINT_SETTING_HARDNESS, inputs);
        float dabs_per_rad = get_dynamic_setting(b, MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS, inputs);
        if (dabs_per_rad <= 0.1f) dabs_per_rad = 1.5f;

        float step_spacing = radius / dabs_per_rad;
        if (step_spacing < 0.5f) step_spacing = 0.5f;

        float step_dist = dist / (float)num_steps;
        b->step_remainder += step_dist;

        if (b->step_remainder >= step_spacing || step == num_steps) {
            b->step_remainder = 0.0f;

            /* Jitter / Offset */
            float jitter_rand = get_dynamic_setting(b, MYPAINT_SETTING_OFFSET_BY_RANDOM, inputs);
            float dab_x = cur_x;
            float dab_y = cur_y;
            if (jitter_rand > 0.001f) {
                float jx = (m_random(&b->rng_state) - 0.5f) * 2.0f * jitter_rand * radius;
                float jy = (m_random(&b->rng_state) - 0.5f) * 2.0f * jitter_rand * radius;
                dab_x += jx;
                dab_y += jy;
            }

            /* Smudge sampling and mixing */
            float smudge = m_clamp(get_dynamic_setting(b, MYPAINT_SETTING_SMUDGE, inputs), 0.0f, 1.0f);
            float final_r = base_r;
            float final_g = base_g;
            float final_b = base_b;

            if (smudge > 0.001f) {
                float surf_r, surf_g, surf_b, surf_a;
                sample_surface_color(pixels, width, height, dab_x, dab_y, radius,
                                     &surf_r, &surf_g, &surf_b, &surf_a);

                if (surf_a > 0.01f) {
                    float smudge_len = m_clamp(get_dynamic_setting(b, MYPAINT_SETTING_SMUDGE_LENGTH, inputs), 0.0f, 1.0f);
                    float pickup_rate = 1.0f - smudge_len;
                    if (pickup_rate < 0.05f) pickup_rate = 0.05f;

                    b->smudge_r += pickup_rate * (surf_r - b->smudge_r);
                    b->smudge_g += pickup_rate * (surf_g - b->smudge_g);
                    b->smudge_b += pickup_rate * (surf_b - b->smudge_b);
                    b->smudge_a += pickup_rate * (surf_a - b->smudge_a);
                }

                final_r = (1.0f - smudge) * base_r + smudge * b->smudge_r;
                final_g = (1.0f - smudge) * base_g + smudge * b->smudge_g;
                final_b = (1.0f - smudge) * base_b + smudge * b->smudge_b;
            }

            int is_eraser = (get_dynamic_setting(b, MYPAINT_SETTING_ERASER, inputs) > 0.5f);
            int lock_alpha = (get_dynamic_setting(b, MYPAINT_SETTING_LOCK_ALPHA, inputs) > 0.5f);

            render_dab(pixels, width, height, dab_x, dab_y, radius, hardness,
                       opaque * base_a, final_r, final_g, final_b, is_eraser, lock_alpha);
            dabs_drawn++;
        }
    }

    b->state_x = x;
    b->state_y = y;
    b->last_pressure = pressure;

    return dabs_drawn;
}

W_EXPORT void w_mypaint_get_dirty_rect(int32_t *out_4words) {
    if (!out_4words) return;
    out_4words[0] = g_dirty.min_x;
    out_4words[1] = g_dirty.min_y;
    out_4words[2] = g_dirty.max_x;
    out_4words[3] = g_dirty.max_y;
}

W_EXPORT void w_mypaint_clear_dirty_rect(void) {
    g_dirty.has_dirty = 0;
}
