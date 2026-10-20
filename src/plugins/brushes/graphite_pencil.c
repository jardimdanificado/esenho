/* Natural-media WASM kernel; also compiled by the native Android registry. */
#include "quadro_natural_brush.h"
static int n_params[4] = {55,78,55,2};
W_EXPORT const char* w_brush_get_info(void) {
    return "{\"name\":\"graphite_pencil\",\"title\":\"Graphite Pencil HB\\u20136B\",\"category\":\"Sketch\",\"spacing\":0.07,\"minRadius\":1,\"maxRadius\":80,\"inputs\":[\"size\",\"pressure\",\"color\",\"opacity\",\"spacing\",\"params\"],\"params\":[{\"name\":\"Paper Tooth\",\"min\":0,\"max\":100,\"default\":55,\"unit\":\"%\"},{\"name\":\"Graphite Load\",\"min\":0,\"max\":100,\"default\":78,\"unit\":\"%\"},{\"name\":\"Lead Hardness\",\"min\":0,\"max\":100,\"default\":55,\"unit\":\"%\"},{\"name\":\"Paper Grain Scale\",\"min\":1,\"max\":8,\"default\":2,\"unit\":\"px\"}]}";
}
W_EXPORT uint32_t w_brush_get_inputs(void) {
    return W_BRUSH_INPUT_SIZE | W_BRUSH_INPUT_PRESSURE | W_BRUSH_INPUT_COLOR | W_BRUSH_INPUT_OPACITY | W_BRUSH_INPUT_SPACING | W_BRUSH_INPUT_PARAMS;
}
W_EXPORT void w_brush_init(int32_t width, int32_t height) { n_started = 0; }
W_EXPORT void w_brush_set_param(int32_t index, int32_t value) {
    static const int lo[4] = {0,0,0,1};
    static const int hi[4] = {100,100,100,8};
    if (index >= 0 && index < 4) n_params[index] = value < lo[index] ? lo[index] : (value > hi[index] ? hi[index] : value);
}
W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tx, float ty, uint32_t color, int32_t eraser) { n_begin(x,y,color); }
W_EXPORT void w_brush_stroke_end(void) { n_started = 0; }
W_EXPORT void w_brush_render_dab(uint32_t *pixels, int32_t width, int32_t height, float x, float y, float radius, float pressure, float angle, float speed, uint32_t color, int32_t eraser) {
    n_render(N_GRAPHITE, n_params, pixels,width,height,x,y,radius,pressure,angle,color,eraser);
}
