/* Natural-media WASM kernel; also compiled by the native Android registry. */
#include "quadro_natural_brush.h"
static int n_params[4] = {70,45,30,12};
W_EXPORT const char* w_brush_get_info(void) {
    return "{\"name\":\"felt_marker\",\"title\":\"Translucent Chisel Marker\",\"category\":\"Paint\",\"spacing\":0.08,\"minRadius\":2,\"maxRadius\":140,\"inputs\":[\"size\",\"pressure\",\"color\",\"opacity\",\"spacing\",\"params\"],\"params\":[{\"name\":\"Ink Flow\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},{\"name\":\"Nib Angle\",\"min\":0,\"max\":180,\"default\":45,\"unit\":\"deg\"},{\"name\":\"Nib Width Ratio\",\"min\":10,\"max\":100,\"default\":30,\"unit\":\"%\"},{\"name\":\"Paper Feathering\",\"min\":0,\"max\":100,\"default\":12,\"unit\":\"%\"}]}";
}
W_EXPORT uint32_t w_brush_get_inputs(void) {
    return W_BRUSH_INPUT_SIZE | W_BRUSH_INPUT_PRESSURE | W_BRUSH_INPUT_COLOR | W_BRUSH_INPUT_OPACITY | W_BRUSH_INPUT_SPACING | W_BRUSH_INPUT_PARAMS;
}
W_EXPORT void w_brush_init(int32_t width, int32_t height) { n_started = 0; }
W_EXPORT void w_brush_set_param(int32_t index, int32_t value) {
    static const int lo[4] = {0,0,10,0};
    static const int hi[4] = {100,180,100,100};
    if (index >= 0 && index < 4) n_params[index] = value < lo[index] ? lo[index] : (value > hi[index] ? hi[index] : value);
}
W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tx, float ty, uint32_t color, int32_t eraser) { n_begin(x,y,color); }
W_EXPORT void w_brush_stroke_end(void) { n_started = 0; }
W_EXPORT void w_brush_render_dab(uint32_t *pixels, int32_t width, int32_t height, float x, float y, float radius, float pressure, float angle, float speed, uint32_t color, int32_t eraser) {
    n_render(N_MARKER, n_params, pixels,width,height,x,y,radius,pressure,angle,color,eraser);
}
