/* Natural-media WASM kernel; also compiled by the native Android registry. */
#include "quadro_natural_brush.h"
static int n_params[4] = {80,65,12,55};
W_EXPORT const char* w_brush_get_info(void) {
    return "{\"name\":\"dry_flat_brush\",\"title\":\"Dry Bristle Brush\",\"category\":\"Paint\",\"spacing\":0.07,\"minRadius\":2,\"maxRadius\":140,\"inputs\":[\"size\",\"pressure\",\"color\",\"opacity\",\"spacing\",\"params\",\"angle\"],\"params\":[{\"name\":\"Paint Load\",\"min\":0,\"max\":100,\"default\":80,\"unit\":\"%\"},{\"name\":\"Bristle Separation\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},{\"name\":\"Color Pickup\",\"min\":0,\"max\":100,\"default\":12,\"unit\":\"%\"},{\"name\":\"Paint Depletion\",\"min\":0,\"max\":100,\"default\":55,\"unit\":\"%\"}]}";
}
W_EXPORT uint32_t w_brush_get_inputs(void) {
    return W_BRUSH_INPUT_SIZE | W_BRUSH_INPUT_PRESSURE | W_BRUSH_INPUT_COLOR | W_BRUSH_INPUT_OPACITY | W_BRUSH_INPUT_SPACING | W_BRUSH_INPUT_PARAMS | W_BRUSH_INPUT_ANGLE;
}
W_EXPORT void w_brush_init(int32_t width, int32_t height) { n_started = 0; }
W_EXPORT void w_brush_set_param(int32_t index, int32_t value) {
    static const int lo[4] = {0,0,0,0};
    static const int hi[4] = {100,100,100,100};
    if (index >= 0 && index < 4) n_params[index] = value < lo[index] ? lo[index] : (value > hi[index] ? hi[index] : value);
}
W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tx, float ty, uint32_t color, int32_t eraser) { n_begin(x,y,color); }
W_EXPORT void w_brush_stroke_end(void) { n_started = 0; }
W_EXPORT void w_brush_render_dab(uint32_t *pixels, int32_t width, int32_t height, float x, float y, float radius, float pressure, float angle, float speed, uint32_t color, int32_t eraser) {
    n_render(N_DRY_FLAT, n_params, pixels,width,height,x,y,radius,pressure,angle,color,eraser);
}
