#include "wesenho_mypaint_surface.h"
#include <stdio.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

static inline float w_clamp(float val, float min_v, float max_v) {
    if (val < min_v) return min_v;
    if (val > max_v) return max_v;
    return val;
}

static WesenhoMyPaintSurface g_surface;
static int g_dabs_rendered = 0;

static void update_dirty(WesenhoMyPaintSurface *s, int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    if (!s->has_dirty) {
        s->dirty_min_x = x0;
        s->dirty_min_y = y0;
        s->dirty_max_x = x1;
        s->dirty_max_y = y1;
        s->has_dirty = 1;
    } else {
        if (x0 < s->dirty_min_x) s->dirty_min_x = x0;
        if (y0 < s->dirty_min_y) s->dirty_min_y = y0;
        if (x1 > s->dirty_max_x) s->dirty_max_x = x1;
        if (y1 > s->dirty_max_y) s->dirty_max_y = y1;
    }
}

static int wesenho_draw_dab(MyPaintSurface *self,
                           float x, float y,
                           float radius,
                           float color_r, float color_g, float color_b,
                           float opaque, float hardness,
                           float alpha_eraser,
                           float aspect_ratio, float angle,
                           float lock_alpha,
                           float colorize) {
    WesenhoMyPaintSurface *s = (WesenhoMyPaintSurface*)self;
    if (!s->pixels || radius <= 0.05f || opaque <= 0.00005f) {
        return 0;
    }

    if (aspect_ratio < 1.0f) aspect_ratio = 1.0f;
    hardness = w_clamp(hardness, 0.001f, 1.0f);
    opaque = w_clamp(opaque, 0.0f, 1.0f);
    if (radius < 0.05f || opaque < 0.00005f) return 0;

    float angle_rad = angle * ((float)M_PI / 180.0f);
    float cs = cosf(angle_rad);
    float sn = sinf(angle_rad);
    float one_over_radius2 = 1.0f / (radius * radius);

    float segment1_offset = 1.0f;
    float segment1_slope  = (hardness > 0.001f) ? -(1.0f / hardness - 1.0f) : 0.0f;
    float segment2_offset = (hardness < 0.999f) ? (hardness / (1.0f - hardness)) : 0.0f;
    float segment2_slope  = (hardness < 0.999f) ? (-hardness / (1.0f - hardness)) : 0.0f;

    int32_t min_x = (int32_t)floorf(x - radius - 1.0f);
    int32_t max_x = (int32_t)ceilf(x + radius + 1.0f);
    int32_t min_y = (int32_t)floorf(y - radius - 1.0f);
    int32_t max_y = (int32_t)ceilf(y + radius + 1.0f);

    if (min_x < 0) min_x = 0;
    if (min_y < 0) min_y = 0;
    if (max_x >= s->width) max_x = s->width - 1;
    if (max_y >= s->height) max_y = s->height - 1;
    if (min_x > max_x || min_y > max_y) return 0;

    uint32_t sr = (uint32_t)(w_clamp(color_r, 0.0f, 1.0f) * 255.0f);
    uint32_t sg = (uint32_t)(w_clamp(color_g, 0.0f, 1.0f) * 255.0f);
    uint32_t sb = (uint32_t)(w_clamp(color_b, 0.0f, 1.0f) * 255.0f);

    for (int32_t py = min_y; py <= max_y; ++py) {
        float yy = ((float)py + 0.5f - y);
        uint32_t *row = &s->pixels[py * s->width];

        for (int32_t px = min_x; px <= max_x; ++px) {
            float xx = ((float)px + 0.5f - x);
            float yyr = (yy * cs - xx * sn) * aspect_ratio;
            float xxr = yy * sn + xx * cs;
            float rr = (yyr * yyr + xxr * xxr) * one_over_radius2;
            if (rr > 1.0f) continue;

            const float fac = (rr <= hardness) ? segment1_slope : segment2_slope;
            float opa = (rr <= hardness) ? segment1_offset : segment2_offset;
            opa += rr * fac;
            if (opa <= 0.00005f) continue;

            float final_a = opa * opaque;
            if (s->clip_mask) {
                uint8_t m_val = s->clip_mask[py * s->width + px];
                if (m_val == 0) continue;
                final_a *= ((float)m_val / 255.0f);
            }
            if (final_a <= 0.00005f) continue;
            uint32_t dab_a_int = (uint32_t)(w_clamp(final_a, 0.0f, 1.0f) * 255.0f);
            if (dab_a_int == 0 && final_a > 0.00005f) dab_a_int = 1;
            if (dab_a_int == 0) continue;

            uint32_t dst = row[px];
            uint32_t da = (dst >> 24) & 0xFF;
            uint32_t dr = dst & 0xFF;
            uint32_t dg = (dst >> 8) & 0xFF;
            uint32_t db = (dst >> 16) & 0xFF;

            if (alpha_eraser < 0.999f) {
                if (da == 0) continue;
                uint32_t target_a = (uint32_t)(w_clamp(alpha_eraser, 0.0f, 1.0f) * 255.0f);
                uint32_t new_a = ((da * (255 - dab_a_int)) + (target_a * dab_a_int)) / 255;
                row[px] = (new_a << 24) | (db << 16) | (dg << 8) | dr;
                continue;
            }

            if (lock_alpha > 0.5f && da == 0) continue;

            /* Standard Porter-Duff Over blend */
            uint32_t inv_sa = 255 - dab_a_int;
            uint32_t out_a = (lock_alpha > 0.5f) ? da : dab_a_int + ((da * inv_sa) >> 8);
            if (out_a > 255) out_a = 255;
            if (out_a == 0) continue;

            uint32_t dst_factor = (da * inv_sa) >> 8;
            uint32_t norm = dab_a_int + dst_factor;
            if (norm == 0) norm = 1;

            uint32_t out_r = (sr * dab_a_int + dr * dst_factor) / norm;
            uint32_t out_g = (sg * dab_a_int + dg * dst_factor) / norm;
            uint32_t out_b = (sb * dab_a_int + db * dst_factor) / norm;

            row[px] = (out_a << 24) | ((out_b & 0xFF) << 16) | ((out_g & 0xFF) << 8) | (out_r & 0xFF);
        }
    }

    update_dirty(s, min_x, min_y, max_x + 1, max_y + 1);
    g_dabs_rendered++;
    return 1;
}

static void wesenho_get_color(MyPaintSurface *self,
                             float x, float y,
                             float radius,
                             float *color_r, float *color_g, float *color_b, float *color_a) {
    WesenhoMyPaintSurface *s = (WesenhoMyPaintSurface*)self;
    if (!s->pixels || radius <= 0.5f) {
        *color_r = 0.0f; *color_g = 0.0f; *color_b = 0.0f; *color_a = 0.0f;
        return;
    }

    int32_t min_x = (int32_t)(x - radius);
    int32_t max_x = (int32_t)(x + radius);
    int32_t min_y = (int32_t)(y - radius);
    int32_t max_y = (int32_t)(y + radius);

    if (min_x < 0) min_x = 0;
    if (min_y < 0) min_y = 0;
    if (max_x >= s->width) max_x = s->width - 1;
    if (max_y >= s->height) max_y = s->height - 1;
    if (min_x > max_x || min_y > max_y) {
        *color_r = 0.0f; *color_g = 0.0f; *color_b = 0.0f; *color_a = 0.0f;
        return;
    }

    float sum_r = 0.0f, sum_g = 0.0f, sum_b = 0.0f, sum_a = 0.0f, total_w = 0.0f;
    float r_sq = radius * radius;

    for (int32_t py = min_y; py <= max_y; ++py) {
        float dy = (float)py - y;
        const uint32_t *row = &s->pixels[py * s->width];
        for (int32_t px = min_x; px <= max_x; ++px) {
            float dx = (float)px - x;
            float d2 = dx * dx + dy * dy;
            if (d2 > r_sq) continue;

            float w = 1.0f - (d2 / r_sq);
            uint32_t p = row[px];
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
        *color_r = sum_r / sum_a;
        *color_g = sum_g / sum_a;
        *color_b = sum_b / sum_a;
        *color_a = sum_a / total_w;
    } else {
        *color_r = 0.0f; *color_g = 0.0f; *color_b = 0.0f; *color_a = 0.0f;
    }
}

static void wesenho_begin_atomic(MyPaintSurface *self) {
    (void)self;
}

static void wesenho_end_atomic(MyPaintSurface *self, MyPaintRectangle *roi) {
    (void)self;
    (void)roi;
}

static int wesenho_draw_dab_pigment(MyPaintSurface2 *self,
                                   float x, float y,
                                   float radius,
                                   float color_r, float color_g, float color_b,
                                   float opaque, float hardness,
                                   float alpha_eraser,
                                   float aspect_ratio, float angle,
                                   float lock_alpha,
                                   float colorize,
                                   float posterize,
                                   float posterize_num,
                                   float paint) {
    (void)posterize;
    (void)posterize_num;
    (void)paint;
    return wesenho_draw_dab((MyPaintSurface*)self, x, y, radius, color_r, color_g, color_b,
                           opaque, hardness, alpha_eraser, aspect_ratio, angle, lock_alpha, colorize);
}

static void wesenho_get_color_pigment(MyPaintSurface2 *self,
                                      float x, float y,
                                      float radius,
                                      float *color_r, float *color_g, float *color_b, float *color_a,
                                      float paint) {
    (void)paint;
    wesenho_get_color((MyPaintSurface*)self, x, y, radius, color_r, color_g, color_b, color_a);
}

static void wesenho_end_atomic_multi(MyPaintSurface2 *self, MyPaintRectangles *roi) {
    (void)self;
    (void)roi;
}

/* =========================================================================
 * Exported WASM ABI Implementation
 * ========================================================================= */
W_EXPORT void w_libmypaint_init(void) {
    mypaint_surface_init(&g_surface.parent.parent);
    g_surface.parent.parent.draw_dab = wesenho_draw_dab;
    g_surface.parent.parent.get_color = wesenho_get_color;
    g_surface.parent.parent.begin_atomic = wesenho_begin_atomic;
    g_surface.parent.parent.end_atomic = wesenho_end_atomic;
    g_surface.parent.draw_dab_pigment = wesenho_draw_dab_pigment;
    g_surface.parent.get_color_pigment = wesenho_get_color_pigment;
    g_surface.parent.end_atomic_multi = wesenho_end_atomic_multi;
    g_surface.has_dirty = 0;
}

W_EXPORT void *w_libmypaint_alloc(uint32_t size) {
    return malloc(size);
}

W_EXPORT MyPaintBrush *w_libmypaint_brush_new(void) {
    MyPaintBrush *b = mypaint_brush_new();
    if (b) {
        mypaint_brush_from_defaults(b);
    }
    return b;
}

W_EXPORT void w_libmypaint_brush_free(MyPaintBrush *brush) {
    if (brush) {
        mypaint_brush_unref(brush);
    }
}

W_EXPORT void w_libmypaint_brush_reset(MyPaintBrush *brush) {
    if (brush) {
        mypaint_brush_reset(brush);
    }
}

W_EXPORT int32_t w_libmypaint_brush_from_string(MyPaintBrush *brush, const char *json_str) {
    if (!brush || !json_str) return 0;
    mypaint_brush_from_defaults(brush);
    return mypaint_brush_from_string(brush, json_str) ? 1 : 0;
}

W_EXPORT void w_libmypaint_brush_set_base_value(MyPaintBrush *brush, int setting_id, float value) {
    if (brush) {
        mypaint_brush_set_base_value(brush, (MyPaintBrushSetting)setting_id, value);
    }
}

W_EXPORT float w_libmypaint_brush_get_base_value(MyPaintBrush *brush, int setting_id) {
    if (brush) {
        return mypaint_brush_get_base_value(brush, (MyPaintBrushSetting)setting_id);
    }
    return 0.0f;
}

W_EXPORT void w_libmypaint_brush_set_mapping_n(MyPaintBrush *brush, int setting_id, int input_id, int n) {
    if (brush) {
        mypaint_brush_set_mapping_n(brush, (MyPaintBrushSetting)setting_id, (MyPaintBrushInput)input_id, n);
    }
}

W_EXPORT void w_libmypaint_brush_set_mapping_point(MyPaintBrush *brush, int setting_id, int input_id, int pt_idx, float x, float y) {
    if (brush) {
        mypaint_brush_set_mapping_point(brush, (MyPaintBrushSetting)setting_id, (MyPaintBrushInput)input_id, pt_idx, x, y);
    }
}

W_EXPORT int32_t w_libmypaint_brush_load_file(MyPaintBrush *brush, const char *filepath) {
    if (!brush || !filepath) return 0;
    FILE *f = fopen(filepath, "rb");
    if (!f) return 0;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0 || sz > 10 * 1024 * 1024) { fclose(f); return 0; }
    char *buf = (char*)malloc(sz + 1);
    if (!buf) { fclose(f); return 0; }
    size_t read_bytes = fread(buf, 1, sz, f);
    buf[read_bytes] = '\0';
    fclose(f);
    int32_t ok = w_libmypaint_brush_from_string(brush, buf);
    free(buf);
    return ok;
}

static void argb_to_hsv(uint32_t argb, float *h, float *s, float *v) {
    float r = (float)((argb >> 16) & 0xFF) / 255.0f;
    float g = (float)((argb >> 8) & 0xFF) / 255.0f;
    float b = (float)(argb & 0xFF) / 255.0f;
    float max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    float min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    float d = max - min;
    *v = max;
    *s = (max > 0.0001f) ? (d / max) : 0.0f;
    if (d < 0.0001f) {
        *h = 0.0f;
    } else {
        if (max == r) {
            *h = (g - b) / d + (g < b ? 6.0f : 0.0f);
        } else if (max == g) {
            *h = (b - r) / d + 2.0f;
        } else {
            *h = (r - g) / d + 4.0f;
        }
        *h /= 6.0f;
    }
}

W_EXPORT void w_libmypaint_brush_set_color_argb(MyPaintBrush *brush, uint32_t argb) {
    if (!brush) return;
    float h = 0.0f, s = 0.0f, v = 0.0f;
    argb_to_hsv(argb, &h, &s, &v);
    mypaint_brush_set_base_value(brush, MYPAINT_BRUSH_SETTING_COLOR_H, h);
    mypaint_brush_set_base_value(brush, MYPAINT_BRUSH_SETTING_COLOR_S, s);
    mypaint_brush_set_base_value(brush, MYPAINT_BRUSH_SETTING_COLOR_V, v);
}

W_EXPORT void w_libmypaint_set_clip_mask(const uint8_t *mask) {
    g_surface.clip_mask = mask;
}

W_EXPORT void w_libmypaint_clear_clip_mask(void) {
    g_surface.clip_mask = NULL;
}

W_EXPORT int32_t w_libmypaint_stroke_to(MyPaintBrush *brush, uint32_t *pixels, int32_t width, int32_t height,
                                         float x, float y, float pressure, float tilt_x, float tilt_y, float dtime) {
    if (!brush || !pixels) return 0;

    g_surface.pixels = pixels;
    g_surface.width = width;
    g_surface.height = height;

    g_dabs_rendered = 0;
    mypaint_brush_stroke_to_2(brush, &g_surface.parent, x, y, pressure, tilt_x, tilt_y, dtime, 1.0f, 0.0f, 0.0f);

    return g_dabs_rendered;
}

W_EXPORT int32_t w_libmypaint_stroke_points(MyPaintBrush *brush, uint32_t *pixels, int32_t width, int32_t height,
                                             const float *x_coords, const float *y_coords, const uint8_t *types,
                                             int32_t count, uint32_t color, float size, float pressure) {
    if (!brush || !pixels || !x_coords || !y_coords || !types || count < 2) return 0;

    g_surface.pixels = pixels;
    g_surface.width = width;
    g_surface.height = height;

    if (color != 0) {
        w_libmypaint_brush_set_color_argb(brush, color);
    }
    if (size > 0.1f) {
        float rad_log = logf(size * 0.5f);
        mypaint_brush_set_base_value(brush, MYPAINT_BRUSH_SETTING_RADIUS_LOGARITHMIC, rad_log);
    }
    if (pressure <= 0.0f) pressure = 0.8f;

    int total_dabs = 0;
    float last_x = 0, last_y = 0;
    int is_subpath_active = 0;

    for (int32_t i = 0; i < count; i++) {
        float cur_x = x_coords[i];
        float cur_y = y_coords[i];
        uint8_t type = types[i];

        if (type == 1) { /* move_to / start subpath */
            if (is_subpath_active) {
                g_dabs_rendered = 0;
                mypaint_brush_stroke_to_2(brush, &g_surface.parent, last_x, last_y, 0.0f, 0, 0, 0.016f, 1.0f, 0.0f, 0.0f);
                total_dabs += g_dabs_rendered;
            }
            mypaint_brush_reset(brush);
            g_dabs_rendered = 0;
            mypaint_brush_stroke_to_2(brush, &g_surface.parent, cur_x, cur_y, 0.0f, 0, 0, 10.0f, 1.0f, 0.0f, 0.0f);
            last_x = cur_x;
            last_y = cur_y;
            is_subpath_active = 1;
        } else if (type == 2 || type == 3) { /* line_to / close */
            if (!is_subpath_active) {
                mypaint_brush_reset(brush);
                mypaint_brush_stroke_to_2(brush, &g_surface.parent, cur_x, cur_y, 0.0f, 0, 0, 10.0f, 1.0f, 0.0f, 0.0f);
                last_x = cur_x;
                last_y = cur_y;
                is_subpath_active = 1;
                continue;
            }
            float dx = cur_x - last_x;
            float dy = cur_y - last_y;
            float dist = hypotf(dx, dy);
            int n_steps = (int)ceilf(dist / 2.0f);
            if (n_steps < 1) n_steps = 1;

            for (int s = 1; s <= n_steps; s++) {
                float t = (float)s / (float)n_steps;
                float px = last_x + t * dx;
                float py = last_y + t * dy;
                g_dabs_rendered = 0;
                mypaint_brush_stroke_to_2(brush, &g_surface.parent, px, py, pressure, 0, 0, 0.016f, 1.0f, 0.0f, 0.0f);
                total_dabs += g_dabs_rendered;
            }
            last_x = cur_x;
            last_y = cur_y;
        }
    }

    if (is_subpath_active) {
        g_dabs_rendered = 0;
        mypaint_brush_stroke_to_2(brush, &g_surface.parent, last_x, last_y, 0.0f, 0, 0, 0.016f, 1.0f, 0.0f, 0.0f);
        total_dabs += g_dabs_rendered;
    }

    return total_dabs;
}

W_EXPORT int32_t w_libmypaint_fill_masked(MyPaintBrush *brush, uint32_t *pixels, int32_t width, int32_t height,
                                           const uint8_t *mask, float min_x, float min_y, float max_x, float max_y,
                                           uint32_t color, float size, int pattern) {
    if (!brush || !pixels || !mask) return 0;

    g_surface.pixels = pixels;
    g_surface.width = width;
    g_surface.height = height;
    g_surface.clip_mask = mask;

    if (color != 0) {
        w_libmypaint_brush_set_color_argb(brush, color);
    }
    if (size <= 1.0f) size = 16.0f;
    float rad_log = logf(size * 0.5f);
    mypaint_brush_set_base_value(brush, MYPAINT_BRUSH_SETTING_RADIUS_LOGARITHMIC, rad_log);

    int total_dabs = 0;
    float step = size * 0.75f;
    if (step < 3.0f) step = 3.0f;

    if (pattern == 2) {
        /* Crosshatch pattern: +/- 45 deg diagonal sweep */
        float diag_step = step * 1.2f;
        for (int pass = 0; pass < 2; pass++) {
            float x_span = max_x - min_x;
            for (float y = min_y - x_span; y <= max_y + x_span; y += diag_step) {
                float start_x = min_x - 10.0f;
                float start_y = y;
                float end_x = max_x + 10.0f;
                float end_y = y + x_span * (pass == 0 ? 1.0f : -1.0f);

                mypaint_brush_reset(brush);
                mypaint_brush_stroke_to_2(brush, &g_surface.parent, start_x, start_y, 0.0f, 0, 0, 10.0f, 1.0f, 0.0f, 0.0f);

                float dx = end_x - start_x;
                float dy = end_y - start_y;
                float dist = hypotf(dx, dy);
                int n_steps = (int)ceilf(dist / 2.0f);
                if (n_steps < 1) n_steps = 1;

                for (int s = 1; s <= n_steps; s++) {
                    float t = (float)s / (float)n_steps;
                    float px = start_x + t * dx;
                    float py = start_y + t * dy;
                    g_dabs_rendered = 0;
                    mypaint_brush_stroke_to_2(brush, &g_surface.parent, px, py, 0.75f, 0, 0, 0.016f, 1.0f, 0.0f, 0.0f);
                    total_dabs += g_dabs_rendered;
                }
            }
        }
    } else {
        /* Default Serpentine Wash sweep */
        int dir = 1;
        for (float y = min_y + step * 0.5f; y <= max_y + step * 0.5f; y += step) {
            float x0 = (dir == 1) ? min_x - 10.0f : max_x + 10.0f;
            float x1 = (dir == 1) ? max_x + 10.0f : min_x - 10.0f;

            mypaint_brush_reset(brush);
            mypaint_brush_stroke_to_2(brush, &g_surface.parent, x0, y, 0.0f, 0, 0, 10.0f, 1.0f, 0.0f, 0.0f);

            float dx = x1 - x0;
            int n_steps = (int)ceilf(fabsf(dx) / 2.0f);
            if (n_steps < 1) n_steps = 1;

            for (int s = 1; s <= n_steps; s++) {
                float t = (float)s / (float)n_steps;
                float px = x0 + t * dx;
                float py = y + sinf(t * 3.14159f) * (step * 0.15f); /* gentle organic wave */
                g_dabs_rendered = 0;
                mypaint_brush_stroke_to_2(brush, &g_surface.parent, px, py, 0.8f, 0, 0, 0.016f, 1.0f, 0.0f, 0.0f);
                total_dabs += g_dabs_rendered;
            }
            dir = -dir;
        }
    }

    g_surface.clip_mask = NULL;
    return total_dabs;
}

W_EXPORT void w_libmypaint_get_dirty_rect(int32_t *out_4words) {
    if (!out_4words) return;
    out_4words[0] = g_surface.dirty_min_x;
    out_4words[1] = g_surface.dirty_min_y;
    out_4words[2] = g_surface.dirty_max_x;
    out_4words[3] = g_surface.dirty_max_y;
}

W_EXPORT void w_libmypaint_clear_dirty_rect(void) {
    g_surface.has_dirty = 0;
}
