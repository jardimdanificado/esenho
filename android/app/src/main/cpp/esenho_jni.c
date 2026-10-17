#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <string.h>
#include <stdlib.h>
#include "quadro.h"

#define TAG "EsenhoNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

// Declarations of quadro exports from quadro.c
extern void w_init(uint32_t width, uint32_t height);
extern void w_resize(uint32_t width, uint32_t height);
extern void w_brush_stroke_ext_f(int32_t state, float x0, float y0, float x1, float y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);
extern void w_brush_set_param(int32_t param_id, int32_t val);
extern void w_brush_set_type(int32_t type);
extern void w_brush_set_shape(int32_t shape);
extern void w_brush_reset(void);
extern uint32_t* w_render(void);
extern int32_t get_width(void);
extern int32_t get_height(void);
extern int32_t w_layer_add(void);
extern void w_layer_select(int32_t idx);
extern int32_t w_layer_get_active(void);
extern void w_layer_clear(int32_t idx);
extern void w_layer_delete(int32_t idx);
extern void w_layer_set_opacity(int32_t idx, uint32_t opacity);
extern void w_layer_set_visible(int32_t idx, int32_t visible);
extern int32_t w_layer_get_order_count(void);
extern void w_draw_line(int x0, int y0, int x1, int y1, uint32_t color);
extern void w_draw_rect(int x, int y, int w, int h, uint32_t color);
extern void w_draw_circle(int cx, int cy, int r, uint32_t color);
extern void w_draw_grid(int step, uint32_t color);
extern int32_t w_has_dirty_rect(void);
extern void w_clear_dirty_bounds(void);
extern int32_t w_get_dirty_x0(void);
extern int32_t w_get_dirty_y0(void);
extern int32_t w_get_dirty_x1(void);
extern int32_t w_get_dirty_y1(void);

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeInit(
    JNIEnv *env, jobject thiz, jint width, jint height) {
    LOGI("Initializing Esenho Quadro Native: %dx%d", width, height);
    w_init((uint32_t)width, (uint32_t)height);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeResize(
    JNIEnv *env, jobject thiz, jint width, jint height) {
    LOGI("Resizing Esenho Quadro: %dx%d", width, height);
    w_resize((uint32_t)width, (uint32_t)height);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeStrokeExt(
    JNIEnv *env, jobject thiz,
    jint state, jfloat x0, jfloat y0, jfloat x1, jfloat y1,
    jint color, jint eraser, jint pressure, jint tilt_x, jint tilt_y) {
    w_brush_stroke_ext_f(state, x0, y0, x1, y1, (uint32_t)color, eraser, pressure, tilt_x, tilt_y);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetParam(
    JNIEnv *env, jobject thiz, jint param_id, jint val) {
    w_brush_set_param(param_id, val);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetType(
    JNIEnv *env, jobject thiz, jint type) {
    w_brush_set_type(type);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetShape(
    JNIEnv *env, jobject thiz, jint shape) {
    w_brush_set_shape(shape);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushReset(
    JNIEnv *env, jobject thiz) {
    w_brush_reset();
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeRenderToBitmap(
    JNIEnv *env, jobject thiz, jobject bitmap) {
    AndroidBitmapInfo info;
    void *pixels = NULL;

    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) {
        LOGE("Failed to get bitmap info");
        return JNI_FALSE;
    }

    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) {
        LOGE("Bitmap format must be RGBA_8888");
        return JNI_FALSE;
    }

    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) {
        LOGE("Failed to lock bitmap pixels");
        return JNI_FALSE;
    }

    uint32_t *comp_pixels = w_render();
    if (comp_pixels != NULL && pixels != NULL) {
        int doc_w = get_width();
        int doc_h = get_height();
        int copy_w = ((int)info.width < doc_w) ? (int)info.width : doc_w;
        int copy_h = ((int)info.height < doc_h) ? (int)info.height : doc_h;

        if (copy_w == (int)info.width && copy_w == doc_w) {
            memcpy(pixels, comp_pixels, (size_t)(copy_w * copy_h * 4));
        } else {
            for (int y = 0; y < copy_h; y++) {
                uint32_t *dst_row = (uint32_t *)((char *)pixels + y * info.stride);
                uint32_t *src_row = comp_pixels + y * doc_w;
                memcpy(dst_row, src_row, (size_t)(copy_w * 4));
            }
        }
    }

    AndroidBitmap_unlockPixels(env, bitmap);
    return JNI_TRUE;
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerAdd(
    JNIEnv *env, jobject thiz) {
    return w_layer_add();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSelect(
    JNIEnv *env, jobject thiz, jint idx) {
    w_layer_select(idx);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetActive(
    JNIEnv *env, jobject thiz) {
    return w_layer_get_active();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerClear(
    JNIEnv *env, jobject thiz, jint idx) {
    w_layer_clear(idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerDelete(
    JNIEnv *env, jobject thiz, jint idx) {
    w_layer_delete(idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSetOpacity(
    JNIEnv *env, jobject thiz, jint idx, jint opacity) {
    w_layer_set_opacity(idx, (uint32_t)opacity);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSetVisible(
    JNIEnv *env, jobject thiz, jint idx, jint visible) {
    w_layer_set_visible(idx, visible);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetCount(
    JNIEnv *env, jobject thiz) {
    return w_layer_get_order_count();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDrawLine(
    JNIEnv *env, jobject thiz, jint x0, jint y0, jint x1, jint y1, jint color) {
    w_draw_line(x0, y0, x1, y1, (uint32_t)color);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDrawRect(
    JNIEnv *env, jobject thiz, jint x, jint y, jint w, jint h, jint color) {
    w_draw_rect(x, y, w, h, (uint32_t)color);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDrawCircle(
    JNIEnv *env, jobject thiz, jint cx, jint cy, jint r, jint color) {
    w_draw_circle(cx, cy, r, (uint32_t)color);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDrawGrid(
    JNIEnv *env, jobject thiz, jint step, jint color) {
    w_draw_grid(step, (uint32_t)color);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeHasDirtyRect(
    JNIEnv *env, jobject thiz) {
    return w_has_dirty_rect();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeClearDirtyBounds(
    JNIEnv *env, jobject thiz) {
    w_clear_dirty_bounds();
}
