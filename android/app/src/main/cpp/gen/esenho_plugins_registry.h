/* Auto-generated Plugin Registry Header */
#ifndef ESENHO_PLUGINS_REGISTRY_H
#define ESENHO_PLUGINS_REGISTRY_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    const char *id;
    const char *title;
    const char *category;
    float default_spacing;
    float min_radius;
    float max_radius;
    const char *(*get_info)(void);
    void (*init)(int32_t w, int32_t h);
    void (*set_param)(int32_t idx, int32_t val);
    void (*stroke_begin)(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
    void (*render_dab)(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
    void (*stroke_end)(void);
} native_brush_t;

typedef struct {
    const char *id;
    const char *title;
    const char *(*get_info)(void);
    void (*apply)(int32_t p1, int32_t p2);
} native_filter_t;

int native_get_brush_count(void);
const native_brush_t *native_get_brush(int idx);
const native_brush_t *native_find_brush(const char *id);

int native_get_filter_count(void);
const native_filter_t *native_get_filter(int idx);
const native_filter_t *native_find_filter(const char *id);

#endif
