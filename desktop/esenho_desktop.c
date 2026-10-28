#include <jni.h>
#include <stdint.h>
#include "quadro.h"

extern int32_t w_has_dirty_rect(void), w_get_dirty_x0(void), w_get_dirty_y0(void), w_get_dirty_x1(void), w_get_dirty_y1(void);
extern void w_clear_dirty_bounds(void);
extern void w_brush_stroke_ext_f(int32_t, float, float, float, float, uint32_t, int32_t, int32_t, int32_t, int32_t);

JNIEXPORT void JNICALL Java_EsenhoDesktop_init(JNIEnv *e, jclass c, jint w, jint h) {
    w_init(w, h);
    w_brush_set_param(W_PARAM_SIZE, 24);
}
JNIEXPORT void JNICALL Java_EsenhoDesktop_size(JNIEnv *e, jclass c, jint n) { w_brush_set_param(W_PARAM_SIZE, n); }
JNIEXPORT void JNICALL Java_EsenhoDesktop_stroke(JNIEnv *e, jclass c, jint state, jfloat x, jfloat y, jfloat px, jfloat py, jint color, jboolean erase) {
    uint32_t rgba = ((uint32_t)color & 0xff00ff00u) | (((uint32_t)color & 0xff0000u) >> 16) | (((uint32_t)color & 0xffu) << 16);
    w_brush_stroke_ext_f(state, x, y, px, py, rgba, erase, 1000, 0, 0);
}
JNIEXPORT jboolean JNICALL Java_EsenhoDesktop_render(JNIEnv *e, jclass c, jintArray array, jint width, jint height, jboolean full) {
    uint32_t *src = w_render();
    if (!src || (*e)->GetArrayLength(e, array) < (jlong)width * height) return JNI_FALSE;
    if (!full && !w_has_dirty_rect()) return JNI_TRUE;
    int x0 = full ? 0 : w_get_dirty_x0(), y0 = full ? 0 : w_get_dirty_y0();
    int x1 = full ? width - 1 : w_get_dirty_x1(), y1 = full ? height - 1 : w_get_dirty_y1();
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= width) x1 = width - 1; if (y1 >= height) y1 = height - 1;
    jint *dst = (*e)->GetPrimitiveArrayCritical(e, array, 0);
    if (!dst) return JNI_FALSE;
    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) {
        uint32_t p = src[(size_t)y * width + x];
        dst[(size_t)y * width + x] = (jint)((p & 0xff00ff00u) | ((p & 0xff0000u) >> 16) | ((p & 0xffu) << 16));
    }
    (*e)->ReleasePrimitiveArrayCritical(e, array, dst, 0);
    w_clear_dirty_bounds();
    return JNI_TRUE;
}

extern void w_brush_dyn_init(void), w_brush_dyn_reset_state(void), w_force_composite(void);
extern void w_brush_dyn_set_base(int32_t, float);
extern void w_brush_dyn_stroke_to(float, float, float, float, float, float, float);
JNIEXPORT void JNICALL Java_EsenhoDesktop_initDynamic(JNIEnv *e, jclass c) {
    w_brush_dyn_init(); w_brush_dyn_set_base(3, 3.0f);
    w_brush_dyn_set_base(4, 0.8f); w_brush_dyn_set_base(7, 100.0f);
    w_brush_dyn_reset_state();
}
JNIEXPORT void JNICALL Java_EsenhoDesktop_strokeDynamic(JNIEnv *e, jclass c, jfloat x, jfloat y, jboolean full) {
    w_brush_dyn_stroke_to(x, y, .8f, 0, 0, .016f, 1);
    if (full) w_force_composite();
}
