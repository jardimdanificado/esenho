#ifndef WESENHO_MYPAINT_SURFACE_H
#define WESENHO_MYPAINT_SURFACE_H

#include <stdint.h>
#include <stddef.h>
#include "mypaint-brush.h"
#include "mypaint-surface.h"

#define W_EXPORT __attribute__((visibility("default")))

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    MyPaintSurface2 parent;
    uint32_t *pixels;
    const uint8_t *clip_mask;
    int32_t width;
    int32_t height;
    int32_t dirty_min_x;
    int32_t dirty_min_y;
    int32_t dirty_max_x;
    int32_t dirty_max_y;
    int32_t has_dirty;
} WesenhoMyPaintSurface;

/* Exported ABI for WASM JS Bridge & Native Quadro SVG Engine */
W_EXPORT void     w_libmypaint_init(void);
W_EXPORT void*    w_libmypaint_alloc(uint32_t size);
W_EXPORT MyPaintBrush* w_libmypaint_brush_new(void);
W_EXPORT void     w_libmypaint_brush_free(MyPaintBrush *brush);
W_EXPORT void     w_libmypaint_brush_reset(MyPaintBrush *brush);
W_EXPORT int32_t  w_libmypaint_brush_from_string(MyPaintBrush *brush, const char *json_str);
W_EXPORT int32_t  w_libmypaint_brush_load_file(MyPaintBrush *brush, const char *filepath);
W_EXPORT void     w_libmypaint_brush_set_color_argb(MyPaintBrush *brush, uint32_t argb);
W_EXPORT void     w_libmypaint_brush_set_base_value(MyPaintBrush *brush, int setting_id, float value);
W_EXPORT float    w_libmypaint_brush_get_base_value(MyPaintBrush *brush, int setting_id);
W_EXPORT void     w_libmypaint_brush_set_mapping_n(MyPaintBrush *brush, int setting_id, int input_id, int n);
W_EXPORT void     w_libmypaint_brush_set_mapping_point(MyPaintBrush *brush, int setting_id, int input_id, int pt_idx, float x, float y);

W_EXPORT void     w_libmypaint_set_clip_mask(const uint8_t *mask);
W_EXPORT void     w_libmypaint_clear_clip_mask(void);

W_EXPORT int32_t  w_libmypaint_stroke_to(MyPaintBrush *brush, uint32_t *pixels, int32_t width, int32_t height,
                                         float x, float y, float pressure, float tilt_x, float tilt_y, float dtime);

/* High-level Vector Stroke & Fill Operations */
W_EXPORT int32_t  w_libmypaint_stroke_points(MyPaintBrush *brush, uint32_t *pixels, int32_t width, int32_t height,
                                             const float *x_coords, const float *y_coords, const uint8_t *types,
                                             int32_t count, uint32_t color, float size, float pressure);

W_EXPORT int32_t  w_libmypaint_fill_masked(MyPaintBrush *brush, uint32_t *pixels, int32_t width, int32_t height,
                                           const uint8_t *mask, float min_x, float min_y, float max_x, float max_y,
                                           uint32_t color, float size, int pattern);

W_EXPORT void     w_libmypaint_get_dirty_rect(int32_t *out_4words);
W_EXPORT void     w_libmypaint_clear_dirty_rect(void);

#ifdef __cplusplus
}
#endif

#endif /* WESENHO_MYPAINT_SURFACE_H */
