#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include "quadro.h"
#include "esenho_plugins_registry.h"

#define TAG "EsenhoNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

// Quadro C exports
extern void w_init(uint32_t width, uint32_t height);
extern void w_resize(uint32_t width, uint32_t height);
extern void w_brush_stroke_ext_f(int32_t state, float x0, float y0, float x1, float y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);
extern void w_brush_set_param(int32_t param_id, int32_t val);
extern void w_brush_set_type(int32_t type);
extern void w_brush_set_shape(int32_t shape);
extern void w_brush_reset(void);
extern uint32_t* w_render(void);
extern void force_composite(void);
extern void w_invalidate_layers(void);
extern int32_t get_width(void);
extern int32_t get_height(void);
extern uint32_t* w_layer_get_pixels(int32_t layer_idx);
extern int32_t w_layer_get_width(int32_t layer_idx);
extern int32_t w_layer_get_height(int32_t layer_idx);
extern uint8_t w_layer_get_visible(int32_t layer_idx);
extern uint8_t w_layer_get_opacity(int32_t layer_idx);

extern int32_t w_layer_add(void);
extern void w_layer_select(int32_t idx);
extern int32_t w_layer_get_active(void);
extern void w_layer_clear(int32_t idx);
extern void w_layer_delete(int32_t idx);
extern void w_layer_set_opacity(int32_t idx, uint32_t opacity);
extern void w_layer_set_visible(int32_t idx, int32_t visible);
extern int32_t w_layer_get_order_count(void);
extern int32_t w_layer_get_order(int32_t pos);
extern int32_t w_layer_duplicate(int32_t layer_idx);
extern int32_t w_layer_move_up(int32_t layer_idx);
extern int32_t w_layer_move_down(int32_t layer_idx);
extern int32_t w_layer_merge_down(int32_t layer_idx);

extern void w_layer_set_alpha_lock(int32_t idx, int32_t locked);
extern int32_t w_layer_get_alpha_lock(int32_t idx);
extern void w_layer_set_clipping(int32_t idx, int32_t clipping);
extern int32_t w_layer_get_clipping(int32_t idx);
extern void w_layer_set_blend_mode(int32_t idx, int32_t mode);
extern int32_t w_layer_get_blend_mode(int32_t idx);

extern uint32_t w_pick_color(int32_t x, int32_t y, int32_t sample_composite);
extern void w_draw_line(int x0, int y0, int x1, int y1, uint32_t color);
extern void w_draw_rect(int x, int y, int w, int h, uint32_t color);
extern void w_draw_circle(int cx, int cy, int r, uint32_t color);
extern void w_draw_grid(int step, uint32_t color);
extern int32_t w_has_dirty_rect(void);
extern void w_clear_dirty_bounds(void);
extern void w_mark_dirty_rect(int32_t x0, int32_t y0, int32_t x1, int32_t y1);

// Active Procedural Brush State
static const native_brush_t *g_current_brush = NULL;
static float g_brush_size = 14.0f;
static float g_last_dab_x = 0.0f;
static float g_last_dab_y = 0.0f;

// ── Native C Undo / Redo Stack (Fast Raw Memory Snapshots) ──
#define MAX_UNDO_DEPTH 24
typedef struct {
    int layer_idx;
    int width;
    int height;
    uint32_t *pixels;
} layer_snapshot_t;

static layer_snapshot_t s_undo_stack[MAX_UNDO_DEPTH];
static int s_undo_count = 0;

static layer_snapshot_t s_redo_stack[MAX_UNDO_DEPTH];
static int s_redo_count = 0;

static void free_snapshot(layer_snapshot_t *snap) {
    if (snap->pixels) {
        free(snap->pixels);
        snap->pixels = NULL;
    }
}

static void clear_snapshot_stack(layer_snapshot_t *stack, int *count) {
    for (int i = 0; i < *count; i++) {
        free_snapshot(&stack[i]);
    }
    *count = 0;
}

static int push_layer_snapshot(layer_snapshot_t *stack, int *count, int max_depth) {
    int active = w_layer_get_active();
    uint32_t *src_pix = w_layer_get_pixels(active);
    int w = w_layer_get_width(active);
    int h = w_layer_get_height(active);
    if (!src_pix || w <= 0 || h <= 0) return 0;

    size_t byte_size = (size_t)w * (size_t)h * sizeof(uint32_t);
    uint32_t *buf = (uint32_t *)malloc(byte_size);
    if (!buf) return 0;
    memcpy(buf, src_pix, byte_size);

    if (*count >= max_depth) {
        free_snapshot(&stack[0]);
        for (int i = 0; i < *count - 1; i++) {
            stack[i] = stack[i + 1];
        }
        (*count)--;
    }

    stack[*count].layer_idx = active;
    stack[*count].width = w;
    stack[*count].height = h;
    stack[*count].pixels = buf;
    (*count)++;
    return 1;
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativePushUndo(
    JNIEnv *env, jobject thiz) {
    clear_snapshot_stack(s_redo_stack, &s_redo_count);
    push_layer_snapshot(s_undo_stack, &s_undo_count, MAX_UNDO_DEPTH);
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeUndo(
    JNIEnv *env, jobject thiz) {
    if (s_undo_count <= 0) return JNI_FALSE;

    // 1. Save current state to redo
    push_layer_snapshot(s_redo_stack, &s_redo_count, MAX_UNDO_DEPTH);

    // 2. Pop from undo
    s_undo_count--;
    layer_snapshot_t *snap = &s_undo_stack[s_undo_count];

    uint32_t *dst_pix = w_layer_get_pixels(snap->layer_idx);
    int w = w_layer_get_width(snap->layer_idx);
    int h = w_layer_get_height(snap->layer_idx);

    if (dst_pix && w == snap->width && h == snap->height) {
        memcpy(dst_pix, snap->pixels, (size_t)w * (size_t)h * sizeof(uint32_t));
        free_snapshot(snap);
        force_composite();
        w_invalidate_layers();
        return JNI_TRUE;
    }

    free_snapshot(snap);
    return JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeRedo(
    JNIEnv *env, jobject thiz) {
    if (s_redo_count <= 0) return JNI_FALSE;

    // 1. Save current state to undo
    push_layer_snapshot(s_undo_stack, &s_undo_count, MAX_UNDO_DEPTH);

    // 2. Pop from redo
    s_redo_count--;
    layer_snapshot_t *snap = &s_redo_stack[s_redo_count];

    uint32_t *dst_pix = w_layer_get_pixels(snap->layer_idx);
    int w = w_layer_get_width(snap->layer_idx);
    int h = w_layer_get_height(snap->layer_idx);

    if (dst_pix && w == snap->width && h == snap->height) {
        memcpy(dst_pix, snap->pixels, (size_t)w * (size_t)h * sizeof(uint32_t));
        free_snapshot(snap);
        force_composite();
        w_invalidate_layers();
        return JNI_TRUE;
    }

    free_snapshot(snap);
    return JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeCanUndo(
    JNIEnv *env, jobject thiz) {
    return s_undo_count > 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeCanRedo(
    JNIEnv *env, jobject thiz) {
    return s_redo_count > 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeCancelStroke(
    JNIEnv *env, jobject thiz) {
    if (s_undo_count > 0) {
        layer_snapshot_t *snap = &s_undo_stack[s_undo_count - 1];
        uint32_t *dst_pix = w_layer_get_pixels(snap->layer_idx);
        int w = w_layer_get_width(snap->layer_idx);
        int h = w_layer_get_height(snap->layer_idx);
        if (dst_pix && w == snap->width && h == snap->height) {
            memcpy(dst_pix, snap->pixels, (size_t)w * (size_t)h * sizeof(uint32_t));
            force_composite();
            w_invalidate_layers();
        }
        s_undo_count--;
        free_snapshot(snap);
    }
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeInit(
    JNIEnv *env, jobject thiz, jint width, jint height) {
    LOGI("Initializing Esenho Quadro Native: %dx%d", width, height);
    w_init((uint32_t)width, (uint32_t)height);
    g_current_brush = NULL;
    clear_snapshot_stack(s_undo_stack, &s_undo_count);
    clear_snapshot_stack(s_redo_stack, &s_redo_count);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeResize(
    JNIEnv *env, jobject thiz, jint width, jint height) {
    LOGI("Resizing Esenho Quadro: %dx%d", width, height);
    w_resize((uint32_t)width, (uint32_t)height);
    clear_snapshot_stack(s_undo_stack, &s_undo_count);
    clear_snapshot_stack(s_redo_stack, &s_redo_count);
}

// ── Brush Selection & Parameter Configuration ──

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeGetBrushCount(
    JNIEnv *env, jobject thiz) {
    return native_get_brush_count();
}

JNIEXPORT jstring JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeGetBrushInfo(
    JNIEnv *env, jobject thiz, jint idx) {
    const native_brush_t *b = native_get_brush(idx);
    if (!b || !b->get_info) return (*env)->NewStringUTF(env, "{}");
    const char *info = b->get_info();
    return (*env)->NewStringUTF(env, info ? info : "{}");
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectBrush(
    JNIEnv *env, jobject thiz, jstring brush_id) {
    if (brush_id == NULL) {
        g_current_brush = NULL;
        return JNI_TRUE;
    }
    const char *id_str = (*env)->GetStringUTFChars(env, brush_id, NULL);
    if (strcmp(id_str, "classic") == 0 || strcmp(id_str, "default") == 0) {
        g_current_brush = NULL;
        (*env)->ReleaseStringUTFChars(env, brush_id, id_str);
        return JNI_TRUE;
    }
    const native_brush_t *b = native_find_brush(id_str);
    (*env)->ReleaseStringUTFChars(env, brush_id, id_str);

    if (b) {
        g_current_brush = b;
        if (b->init) {
            b->init(get_width(), get_height());
        }
        return JNI_TRUE;
    }
    return JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSetBrushParam(
    JNIEnv *env, jobject thiz, jint param_idx, jint val) {
    if (g_current_brush && g_current_brush->set_param) {
        g_current_brush->set_param(param_idx, val);
    }
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetSize(
    JNIEnv *env, jobject thiz, jfloat size) {
    g_brush_size = size;
    w_brush_set_param(1, (int32_t)size);
}

// ── Stroke Execution (Classic + Procedural WASM/C) ──

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeStrokeExt(
    JNIEnv *env, jobject thiz,
    jint state, jfloat x0, jfloat y0, jfloat x1, jfloat y1,
    jint color, jint eraser, jint pressure, jint tilt_x, jint tilt_y) {

    // If procedural brush is selected:
    if (g_current_brush && g_current_brush->render_dab) {
        int active = w_layer_get_active();
        uint32_t *pixels = w_layer_get_pixels(active);
        int cw = get_width();
        int ch = get_height();

        float pNorm = (float)pressure / 1000.0f;
        if (pNorm <= 0.001f) pNorm = 0.85f;
        if (pNorm > 1.0f) pNorm = 1.0f;
        float radius = (g_brush_size * 0.5f) * (0.3f + 0.7f * pNorm);
        if (radius < 1.0f) radius = 1.0f;

        float spacing = g_current_brush->default_spacing;
        if (spacing < 0.02f) spacing = 0.05f;
        float step = radius * 2.0f * spacing;
        if (step < 1.0f) step = 1.0f;

        if (state == 0) { // Touch down / start
            if (g_current_brush->stroke_begin) {
                g_current_brush->stroke_begin(x1, y1, pNorm, (float)tilt_x, (float)tilt_y, (uint32_t)color, eraser);
            }
            g_current_brush->render_dab(pixels, cw, ch, x1, y1, radius, pNorm, 0.0f, 0.0f, (uint32_t)color, eraser);
            g_last_dab_x = x1;
            g_last_dab_y = y1;
            int r_int = (int)radius + 4;
            w_mark_dirty_rect((int)x1 - r_int, (int)y1 - r_int, (int)x1 + r_int, (int)y1 + r_int);
            w_invalidate_layers();
        } else if (state == 1) { // Move / drag
            float dx = x1 - g_last_dab_x;
            float dy = y1 - g_last_dab_y;
            float dist = sqrtf(dx * dx + dy * dy);

            if (dist >= step) {
                float angle_deg = atan2f(dy, dx) * 180.0f / 3.14159265f;
                int steps = (int)(dist / step);
                for (int s = 1; s <= steps; s++) {
                    float t = (float)s / (float)steps;
                    float ix = g_last_dab_x + dx * t;
                    float iy = g_last_dab_y + dy * t;
                    g_current_brush->render_dab(pixels, cw, ch, ix, iy, radius, pNorm, angle_deg, dist, (uint32_t)color, eraser);
                }
                g_last_dab_x = x1;
                g_last_dab_y = y1;
                int r_int = (int)radius + 4;
                int min_x = (int)(x0 < x1 ? x0 : x1) - r_int;
                int min_y = (int)(y0 < y1 ? y0 : y1) - r_int;
                int max_x = (int)(x0 > x1 ? x0 : x1) + r_int;
                int max_y = (int)(y0 > y1 ? y0 : y1) + r_int;
                w_mark_dirty_rect(min_x, min_y, max_x, max_y);
                w_invalidate_layers();
            }
        } else if (state == 2) { // Up / end
            if (g_current_brush->stroke_end) {
                g_current_brush->stroke_end();
            }
            force_composite();
            w_invalidate_layers();
        }
        return;
    }

    // Classic Quadro stroke
    w_brush_stroke_ext_f(state, x0, y0, x1, y1, (uint32_t)color, eraser, pressure, tilt_x, tilt_y);
}

// ── Filters Suite (All 29 Filters) ──

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeGetFilterCount(
    JNIEnv *env, jobject thiz) {
    return native_get_filter_count();
}

JNIEXPORT jstring JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeGetFilterInfo(
    JNIEnv *env, jobject thiz, jint idx) {
    const native_filter_t *f = native_get_filter(idx);
    if (!f || !f->get_info) return (*env)->NewStringUTF(env, "{}");
    const char *info = f->get_info();
    return (*env)->NewStringUTF(env, info ? info : "{}");
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeApplyFilter(
    JNIEnv *env, jobject thiz, jstring filter_id, jint p1, jint p2) {
    const char *id_str = (*env)->GetStringUTFChars(env, filter_id, NULL);
    const native_filter_t *filter = native_find_filter(id_str);
    (*env)->ReleaseStringUTFChars(env, filter_id, id_str);

    if (!filter || !filter->apply) return JNI_FALSE;

    int active = w_layer_get_active();
    uint32_t *pix = w_layer_get_pixels(active);
    int w = w_layer_get_width(active);
    int h = w_layer_get_height(active);

    if (!pix || w <= 0 || h <= 0) return JNI_FALSE;

    w_set_layer(pix, w, h);
    filter->apply(p1, p2);
    force_composite();
    w_invalidate_layers();
    return JNI_TRUE;
}

// ── Color Picker & Eyedropper ──

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativePickColor(
    JNIEnv *env, jobject thiz, jint x, jint y, jint sample_composite) {
    uint32_t c = w_pick_color(x, y, sample_composite);
    // Convert ABGR (C) to ARGB (Android)
    uint32_t a = (c >> 24) & 0xFF;
    uint32_t b = (c >> 16) & 0xFF;
    uint32_t g = (c >> 8) & 0xFF;
    uint32_t r = c & 0xFF;
    return (jint)((a << 24) | (r << 16) | (g << 8) | b);
}

// ── Layer Operations (Full Stack) ──

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerAdd(
    JNIEnv *env, jobject thiz) {
    return w_layer_add();
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerDuplicate(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_duplicate(idx);
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

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetOpacity(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_opacity(idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSetVisible(
    JNIEnv *env, jobject thiz, jint idx, jint visible) {
    w_layer_set_visible(idx, visible);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetVisible(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_visible(idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSetBlendMode(
    JNIEnv *env, jobject thiz, jint idx, jint mode) {
    w_layer_set_blend_mode(idx, mode);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetBlendMode(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_blend_mode(idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSetAlphaLock(
    JNIEnv *env, jobject thiz, jint idx, jint lock) {
    w_layer_set_alpha_lock(idx, lock);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetAlphaLock(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_alpha_lock(idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerSetClipping(
    JNIEnv *env, jobject thiz, jint idx, jint clip) {
    w_layer_set_clipping(idx, clip);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetClipping(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_clipping(idx);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerMoveUp(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_move_up(idx);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerMoveDown(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_move_down(idx);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerMergeDown(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_merge_down(idx);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetCount(
    JNIEnv *env, jobject thiz) {
    return w_layer_get_order_count();
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetOrder(
    JNIEnv *env, jobject thiz, jint pos) {
    return w_layer_get_order(pos);
}

// ── Shapes, Canvas Allocation & Rendering ──

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
    g_current_brush = NULL;
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
