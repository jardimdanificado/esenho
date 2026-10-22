#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <time.h>
#include "quadro.h"
#include "quadro_brush_coverage.h"
#include "esenho_plugins_registry.h"

#define TAG "EsenhoNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static const native_brush_t *g_current_brush = NULL;

// Quadro C exports
extern void w_init(uint32_t width, uint32_t height);
extern void w_resize(uint32_t width, uint32_t height);
extern void w_brush_stroke_ext_f(int32_t state, float x0, float y0, float x1, float y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);
extern void w_brush_set_param(int32_t param_id, int32_t val);
extern void w_brush_set_type(int32_t type);
extern void w_brush_set_shape(int32_t shape);
extern void w_brush_reset(void);
extern void w_brush_dyn_init(void);
extern float w_brush_dyn_get_base(int32_t setting);
extern void w_brush_dyn_set_base(int32_t setting, float value);
extern void w_brush_dyn_set_curve(int32_t setting, int32_t input, int32_t n, const float *x, const float *y);
extern void w_brush_dyn_clear_curve(int32_t setting, int32_t input);
extern void w_brush_dyn_reset_state(void);
extern void w_brush_dyn_stroke_to(float x, float y, float pressure, float tilt_x, float tilt_y, float dtime, float viewzoom);
extern uint32_t* w_render(void);
extern void force_composite(void);
extern void w_invalidate_layers(void);
extern int32_t get_width(void);
extern int32_t get_height(void);
extern uint32_t* w_layer_get_pixels(int32_t layer_idx);
extern int32_t w_layer_get_width(int32_t layer_idx);
extern int32_t w_layer_get_height(int32_t layer_idx);
extern int32_t w_texture_create(int32_t width, int32_t height);
extern uint32_t* w_texture_get_pixels(int32_t tex_id);
extern uint8_t w_layer_get_visible(int32_t layer_idx);
extern uint8_t w_layer_get_opacity(int32_t layer_idx);

static int g_dynamic_brush_enabled = 0;
static int64_t g_dynamic_last_stroke_ns = 0;
static int g_pressure_min = 0, g_pressure_max = 100;
static int g_pressure_curve = 0;
static float g_pressure_gamma = 1.0f;
static float g_procedural_spacing = -1.0f;
static float g_procedural_opacity = 1.0f;
static float g_procedural_flow = 1.0f;
static uint32_t *g_procedural_before = NULL;
static size_t g_procedural_before_capacity = 0;
static int g_procedural_symmetry = 0;
static int g_procedural_last_pressure = 1000;
static int64_t g_procedural_last_ns = 0;

JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetPressureMap(JNIEnv *env, jobject thiz, jint min, jint max, jint curve, jfloat gamma) {
    g_pressure_min = min < 0 ? 0 : (min > 99 ? 99 : min);
    g_pressure_max = max < g_pressure_min + 1 ? g_pressure_min + 1 : (max > 100 ? 100 : max);
    g_pressure_curve = curve < 0 ? 0 : (curve > 4 ? 0 : curve);
    g_pressure_gamma = gamma < 0.05f ? 0.05f : (gamma > 8.0f ? 8.0f : gamma);
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetProceduralSpacing(JNIEnv *env, jobject thiz, jfloat spacing) {
    g_procedural_spacing = spacing < 0.0f ? -1.0f : fminf(1.0f, fmaxf(0.02f, spacing));
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetProceduralOpacity(JNIEnv *env, jobject thiz, jfloat opacity) {
    g_procedural_opacity = fminf(1.0f, fmaxf(0.0f, opacity));
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBrushSetSymmetry(JNIEnv *env, jobject thiz, jint mode) {
    g_procedural_symmetry = mode < 0 || mode > 4 ? 0 : mode;
}

static int mapped_pressure(int pressure) {
    float p = (float)pressure / 1000.0f;
    float lo = (float)g_pressure_min / 100.0f, hi = (float)g_pressure_max / 100.0f;
    if (p < lo) p = 0.0f; else if (p > hi) p = 1.0f; else p = (p - lo) / (hi - lo);
    if (g_pressure_curve == 1) p = powf(p, 0.6f);
    else if (g_pressure_curve == 2) p = powf(p, 1.8f);
    else if (g_pressure_curve == 3) p = p * p * (3.0f - 2.0f * p);
    else if (g_pressure_curve == 4) p = powf(p, g_pressure_gamma);
    return (int)(fminf(1.0f, fmaxf(0.0f, p)) * 1000.0f + 0.5f);
}

static int procedural_accepts(const char *input) {
    if (!g_current_brush || !g_current_brush->get_info) return 1;
    const char *info = g_current_brush->get_info();
    const char *inputs = info ? strstr(info, "\"inputs\"") : NULL;
    if (!inputs) return 1;
    const char *open = strchr(inputs, '['), *close = open ? strchr(open, ']') : NULL;
    if (!open || !close) return 1;
    char token[40]; snprintf(token, sizeof(token), "\"%s\"", input);
    const char *found = strstr(open, token);
    return found && found < close;
}

static void render_procedural_dab(uint32_t *pixels, int cw, int ch, float x, float y, float radius,
    float pressure, float angle, float speed, uint32_t color, int eraser) {
    g_current_brush->render_dab(pixels, cw, ch, x, y, radius, pressure, angle, speed, color, eraser);
    if (g_procedural_symmetry == 1 || g_procedural_symmetry == 3) g_current_brush->render_dab(pixels, cw, ch, (float)(cw - 1) - x, y, radius, pressure, 180.0f - angle, speed, color, eraser);
    if (g_procedural_symmetry == 2 || g_procedural_symmetry == 3) g_current_brush->render_dab(pixels, cw, ch, x, (float)(ch - 1) - y, radius, pressure, -angle, speed, color, eraser);
    if (g_procedural_symmetry == 3) g_current_brush->render_dab(pixels, cw, ch, (float)(cw - 1) - x, (float)(ch - 1) - y, radius, pressure, 180.0f + angle, speed, color, eraser);
    if (g_procedural_symmetry == 4) {
        float cx = ((float)cw - 1.0f) * 0.5f, cy = ((float)ch - 1.0f) * 0.5f;
        float dx = x - cx, dy = y - cy;
        for (int i = 1; i < 8; i++) {
            float a = (float)i * 0.7853981634f, ca = cosf(a), sa = sinf(a);
            g_current_brush->render_dab(pixels, cw, ch, cx + dx * ca - dy * sa, cy + dx * sa + dy * ca, radius, pressure, angle + (float)i * 45.0f, speed, color, eraser);
        }
    }
}

JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDynBrushEnable(JNIEnv *env, jobject thiz, jboolean enabled) {
    g_dynamic_brush_enabled = enabled ? 1 : 0;
    w_brush_dyn_init();
    w_brush_dyn_reset_state();
    g_dynamic_last_stroke_ns = 0;
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDynBrushReset(JNIEnv *env, jobject thiz) {
    w_brush_dyn_reset_state(); g_dynamic_last_stroke_ns = 0;
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDynBrushSetBase(JNIEnv *env, jobject thiz, jint setting, jfloat value) {
    if (setting >= 0 && setting < 48) w_brush_dyn_set_base(setting, value);
}
JNIEXPORT jfloat JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDynBrushGetBase(JNIEnv *env, jobject thiz, jint setting) {
    return w_brush_dyn_get_base(setting);
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDynBrushSetCurve(JNIEnv *env, jobject thiz, jint setting, jint input, jfloatArray xArray, jfloatArray yArray) {
    if (!xArray || !yArray || setting < 0 || setting >= 48 || input < 0 || input >= 16) return;
    jsize nx = (*env)->GetArrayLength(env, xArray), ny = (*env)->GetArrayLength(env, yArray);
    if (nx != ny || nx < 2 || nx > 16) return;
    jfloat x[16], y[16];
    (*env)->GetFloatArrayRegion(env, xArray, 0, nx, x); (*env)->GetFloatArrayRegion(env, yArray, 0, ny, y);
    if (!(*env)->ExceptionCheck(env)) w_brush_dyn_set_curve(setting, input, nx, x, y);
}
JNIEXPORT void JNICALL Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDynBrushClearCurve(JNIEnv *env, jobject thiz, jint setting, jint input) {
    if (setting >= 0 && setting < 48 && input >= 0 && input < 16) w_brush_dyn_clear_curve(setting, input);
}

extern int32_t w_layer_add(void);
extern int32_t w_layer_restore_slot(int32_t idx, int32_t width, int32_t height, int32_t visible, int32_t order_position);
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
extern void w_layer_adjust_hsv(int32_t layer_idx, int32_t d_hue, int32_t d_sat, int32_t d_val);

extern void w_layer_set_alpha_lock(int32_t idx, int32_t locked);
extern int32_t w_layer_get_alpha_lock(int32_t idx);
extern void w_layer_set_clipping(int32_t idx, int32_t clipping);
extern int32_t w_layer_get_clipping(int32_t idx);
extern void w_layer_set_blend_mode(int32_t idx, int32_t mode);
extern int32_t w_layer_get_blend_mode(int32_t idx);

extern uint32_t w_pick_color(int32_t x, int32_t y, int32_t sample_composite);
extern void w_draw_line(int x0, int y0, int x1, int y1, uint32_t color);
extern void w_draw_rect(int x, int y, int w, int h, uint32_t color);
extern void w_draw_affine_shape(float x0, float y0, float x1, float y1,
    const float *matrix, int ellipse, int erase, uint32_t color);
extern void w_draw_circle(int cx, int cy, int r, uint32_t color);
extern void w_draw_ellipse(int cx, int cy, int rx, int ry, uint32_t color);
extern void w_erase_rect(int x, int y, int w, int h);
extern void w_erase_ellipse(int cx, int cy, int rx, int ry);
extern void w_draw_grid(int step, uint32_t color);
extern int32_t w_has_dirty_rect(void);
extern void w_clear_dirty_bounds(void);
extern void w_mark_dirty_rect(int32_t x0, int32_t y0, int32_t x1, int32_t y1);

extern void w_select_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t op_mode);
extern void w_select_ellipse(int32_t x, int32_t y, int32_t w, int32_t h, int32_t op_mode);
extern int32_t w_select_wand(int32_t layer_idx, int32_t seed_x, int32_t seed_y, int32_t tolerance, int32_t contiguous, int32_t op_mode);
extern void w_select_lasso(const int32_t *points_xy, int32_t point_count, int32_t op_mode);
extern void w_select_apply_mask(const uint8_t *mask, int32_t x, int32_t y, int32_t w, int32_t h, int32_t op_mode);
extern int32_t w_get_selection_scratch_layer(void);
extern void w_select_all(int32_t op_mode);
extern void w_select_clear(void);
extern void w_select_invert(void);
extern int32_t w_select_get_info(int32_t *out_words);
extern int32_t w_select_get_mask_info(int32_t *out_words);
extern uint8_t *w_select_get_mask_ptr(void);
extern int32_t w_select_get_mask(uint8_t *out_mask, uint32_t max_bytes);
extern void w_layer_flip_h(int32_t layer_idx);
extern void w_layer_flip_v(int32_t layer_idx);
extern int32_t w_layer_transform(int32_t src_layer_idx, int32_t dst_layer_idx, int32_t dx, int32_t dy, int32_t scale_x_pct, int32_t scale_y_pct, int32_t rot_deg, int32_t skew_x, int32_t bilinear);
extern void w_dry_all_water(void);
extern void w_step_water_diffusion(int32_t steps);

extern int32_t w_shape_find_or_create(const char *name);
extern int32_t w_texture_find_or_create(const char *name);
extern void w_brush_select_shape_by_name(const char *name);
extern void w_brush_select_texture_by_name(const char *name);

// Active Procedural Brush State
static float g_brush_size = 14.0f;
static float g_last_dab_x = 0.0f;
static float g_last_dab_y = 0.0f;

// ── Native C Undo / Redo Stack (Fast Raw Memory Snapshots) ──
#define MAX_UNDO_DEPTH 24
typedef struct {
    int layer_idx;
    int width;
    int height;
    uint64_t token;
    uint32_t *pixels;
} layer_snapshot_t;

static layer_snapshot_t s_undo_stack[MAX_UNDO_DEPTH];
static int s_undo_count = 0;

static layer_snapshot_t s_redo_stack[MAX_UNDO_DEPTH];
static int s_redo_count = 0;
static uint64_t s_next_snapshot_token = 1;

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

static uint64_t push_layer_snapshot(layer_snapshot_t *stack, int *count, int max_depth, uint64_t token, int layer_idx) {
    int active = (layer_idx >= 0) ? layer_idx : w_layer_get_active();
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
    stack[*count].token = token ? token : s_next_snapshot_token++;
    stack[*count].pixels = buf;
    (*count)++;
    return stack[*count - 1].token;
}

JNIEXPORT jlong JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativePushUndo(
    JNIEnv *env, jobject thiz) {
    clear_snapshot_stack(s_redo_stack, &s_redo_count);
    return (jlong)push_layer_snapshot(s_undo_stack, &s_undo_count, MAX_UNDO_DEPTH, 0, -1);
}

JNIEXPORT jlong JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativePeekUndoToken(
    JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    return s_undo_count > 0 ? (jlong)s_undo_stack[s_undo_count - 1].token : 0;
}

JNIEXPORT jlong JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativePeekRedoToken(
    JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    return s_redo_count > 0 ? (jlong)s_redo_stack[s_redo_count - 1].token : 0;
}

JNIEXPORT jlong JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeUndo(
    JNIEnv *env, jobject thiz) {
    if (s_undo_count <= 0) return 0;

    // 1. Save current state to redo
    uint64_t token = s_undo_stack[s_undo_count - 1].token;
    int layer_idx = s_undo_stack[s_undo_count - 1].layer_idx;
    push_layer_snapshot(s_redo_stack, &s_redo_count, MAX_UNDO_DEPTH, token, layer_idx);

    // 2. Pop from undo
    s_undo_count--;
    layer_snapshot_t *snap = &s_undo_stack[s_undo_count];

    int w = w_layer_get_width(snap->layer_idx);
    int h = w_layer_get_height(snap->layer_idx);
    if ((w != snap->width || h != snap->height) && w_layer_resize(snap->layer_idx, snap->width, snap->height, 0) != 0) {
        free_snapshot(snap);
        return 0;
    }
    uint32_t *dst_pix = w_layer_get_pixels(snap->layer_idx);
    w = w_layer_get_width(snap->layer_idx);
    h = w_layer_get_height(snap->layer_idx);

    if (dst_pix && w == snap->width && h == snap->height) {
        memcpy(dst_pix, snap->pixels, (size_t)w * (size_t)h * sizeof(uint32_t));
        free_snapshot(snap);
        force_composite();
        w_invalidate_layers();
        return (jlong)token;
    }

    free_snapshot(snap);
    return 0;
}

JNIEXPORT jlong JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeRedo(
    JNIEnv *env, jobject thiz) {
    if (s_redo_count <= 0) return 0;

    // 1. Save current state to undo
    uint64_t token = s_redo_stack[s_redo_count - 1].token;
    int layer_idx = s_redo_stack[s_redo_count - 1].layer_idx;
    push_layer_snapshot(s_undo_stack, &s_undo_count, MAX_UNDO_DEPTH, token, layer_idx);

    // 2. Pop from redo
    s_redo_count--;
    layer_snapshot_t *snap = &s_redo_stack[s_redo_count];

    int w = w_layer_get_width(snap->layer_idx);
    int h = w_layer_get_height(snap->layer_idx);
    if ((w != snap->width || h != snap->height) && w_layer_resize(snap->layer_idx, snap->width, snap->height, 0) != 0) {
        free_snapshot(snap);
        return 0;
    }
    uint32_t *dst_pix = w_layer_get_pixels(snap->layer_idx);
    w = w_layer_get_width(snap->layer_idx);
    h = w_layer_get_height(snap->layer_idx);

    if (dst_pix && w == snap->width && h == snap->height) {
        memcpy(dst_pix, snap->pixels, (size_t)w * (size_t)h * sizeof(uint32_t));
        free_snapshot(snap);
        force_composite();
        w_invalidate_layers();
        return (jlong)token;
    }

    free_snapshot(snap);
    return 0;
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
        int w = w_layer_get_width(snap->layer_idx);
        int h = w_layer_get_height(snap->layer_idx);
        if ((w != snap->width || h != snap->height) && w_layer_resize(snap->layer_idx, snap->width, snap->height, 0) != 0) {
            s_undo_count--;
            free_snapshot(snap);
            return;
        }
        uint32_t *dst_pix = w_layer_get_pixels(snap->layer_idx);
        w = w_layer_get_width(snap->layer_idx);
        h = w_layer_get_height(snap->layer_idx);
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
    g_brush_size = fminf(100.0f, fmaxf(1.0f, size));
    w_brush_set_param(1, (int32_t)g_brush_size);
}

// ── Stroke Execution (Classic + Procedural WASM/C) ──

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeStrokeExt(
    JNIEnv *env, jobject thiz,
    jint state, jfloat x0, jfloat y0, jfloat x1, jfloat y1,
    jint color, jint eraser, jint pressure, jint tilt_x, jint tilt_y) {
    int stroke_pressure = mapped_pressure(pressure);

    if (g_dynamic_brush_enabled) {
        struct timespec now;
        clock_gettime(CLOCK_MONOTONIC, &now);
        int64_t now_ns = (int64_t)now.tv_sec * 1000000000LL + now.tv_nsec;
        if (state == 0) { w_brush_dyn_reset_state(); g_dynamic_last_stroke_ns = 0; }
        float dt = g_dynamic_last_stroke_ns > 0 ? (float)(now_ns - g_dynamic_last_stroke_ns) / 1000000000.0f : 1.0f / 60.0f;
        if (dt < 0.001f) dt = 0.001f;
        if (dt > 0.25f) dt = 0.25f;
        g_dynamic_last_stroke_ns = now_ns;
        float p = fminf(1.0f, fmaxf(0.0f, (float)stroke_pressure / 1000.0f));
        float r = (float)(color & 255) / 255.0f, g = (float)((color >> 8) & 255) / 255.0f, b = (float)((color >> 16) & 255) / 255.0f;
        float maxc = fmaxf(r, fmaxf(g, b)), minc = fminf(r, fminf(g, b)), delta = maxc - minc;
        float h = 0.0f, s = maxc <= 0.0001f ? 0.0f : delta / maxc;
        if (delta > 0.0001f) { if (maxc == r) h = (g - b) / delta; else if (maxc == g) h = 2.0f + (b - r) / delta; else h = 4.0f + (r - g) / delta; h /= 6.0f; if (h < 0.0f) h += 1.0f; }
        w_brush_dyn_set_base(19, h); w_brush_dyn_set_base(20, s); w_brush_dyn_set_base(21, maxc);
        w_brush_dyn_set_base(32, eraser ? 1.0f : 0.0f);
        w_brush_dyn_stroke_to(x1, y1, p, (float)tilt_x / 90.0f, (float)tilt_y / 90.0f, dt, 1.0f);
        int pad = (int)fmaxf(g_brush_size * 4.0f, 64.0f);
        w_mark_dirty_rect((int)x1 - pad, (int)y1 - pad, (int)x1 + pad, (int)y1 + pad);
        force_composite();
        w_invalidate_layers();
        if (state == 2) g_dynamic_last_stroke_ns = 0;
        return;
    }

    // If procedural brush is selected:
    if (g_current_brush && g_current_brush->render_dab) {
        int active = w_layer_get_active();
        uint32_t *pixels = w_layer_get_pixels(active);
        int cw = get_width();
        int ch = get_height();
        if (!pixels || cw <= 0 || ch <= 0) return;

        float pNorm = (float)stroke_pressure / 1000.0f;
        if (pNorm < 0.0f) pNorm = 0.0f;
        if (pNorm > 1.0f) pNorm = 1.0f;
        float radius = g_brush_size * 0.5f;
        if (radius < 1.0f) radius = 1.0f;
        uint32_t procedural_color = (uint32_t)color;
        uint32_t coverage = (uint32_t)(g_procedural_opacity * g_procedural_flow * 255.0f + 0.5f);
        size_t pixel_count = (size_t)cw * (size_t)ch;
        // Capture once per submitted stroke segment, not once per dab. Reuse
        // storage; full-strength painting keeps the direct kernel fast path.
        // A whole-layer capture also supports effects that extend beyond the tip.
        if (coverage < 255) {
            if (pixel_count > g_procedural_before_capacity) {
                uint32_t *buffer = realloc(g_procedural_before, pixel_count * sizeof(uint32_t));
                if (!buffer) return;
                g_procedural_before = buffer;
                g_procedural_before_capacity = pixel_count;
            }
            memcpy(g_procedural_before, pixels, pixel_count * sizeof(uint32_t));
        }

        float spacing = g_procedural_spacing >= 0.0f ? g_procedural_spacing : g_current_brush->default_spacing;
        if (spacing < 0.02f) spacing = 0.05f;
        float step = radius * 2.0f * spacing;
        if (step < 1.0f) step = 1.0f;

        if (state == 0) { // Touch down / start
            g_procedural_last_pressure = stroke_pressure;
            struct timespec now; clock_gettime(CLOCK_MONOTONIC, &now);
            g_procedural_last_ns = (int64_t)now.tv_sec * 1000000000LL + now.tv_nsec;
            if (g_current_brush->stroke_begin) {
                g_current_brush->stroke_begin(x1, y1, procedural_accepts("pressure") ? pNorm : 1.0f,
                    procedural_accepts("tilt") ? (float)tilt_x : 0.0f, procedural_accepts("tilt") ? (float)tilt_y : 0.0f,
                    procedural_color, eraser);
            }
            render_procedural_dab(pixels, cw, ch, x1, y1, radius, procedural_accepts("pressure") ? pNorm : 1.0f, 0.0f, 0.0f, procedural_color, eraser);
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
                struct timespec now; clock_gettime(CLOCK_MONOTONIC, &now);
                int64_t now_ns = (int64_t)now.tv_sec * 1000000000LL + now.tv_nsec;
                float dt = g_procedural_last_ns > 0 ? (float)(now_ns - g_procedural_last_ns) / 1000000000.0f : 1.0f / 60.0f;
                float speed = dt > 0.0001f ? dist / dt : 0.0f;
                float angle_deg = atan2f(dy, dx) * 180.0f / 3.14159265f;
                int steps = (int)(dist / step);
                for (int s = 1; s <= steps; s++) {
                    float t = (float)s / (float)steps;
                    float ix = g_last_dab_x + dx * t;
                    float iy = g_last_dab_y + dy * t;
                    float dab_pressure = ((float)g_procedural_last_pressure +
                        ((float)stroke_pressure - (float)g_procedural_last_pressure) * t) / 1000.0f;
                    render_procedural_dab(pixels, cw, ch, ix, iy, radius,
                        procedural_accepts("pressure") ? dab_pressure : 1.0f,
                        procedural_accepts("angle") ? angle_deg : 0.0f,
                        procedural_accepts("speed") ? speed : 0.0f, procedural_color, eraser);
                }
                g_last_dab_x = x1;
                g_last_dab_y = y1;
                g_procedural_last_pressure = stroke_pressure;
                g_procedural_last_ns = now_ns;
                int r_int = (int)radius + 4;
                int min_x = (int)(x0 < x1 ? x0 : x1) - r_int;
                int min_y = (int)(y0 < y1 ? y0 : y1) - r_int;
                int max_x = (int)(x0 > x1 ? x0 : x1) + r_int;
                int max_y = (int)(y0 > y1 ? y0 : y1) + r_int;
                if (g_procedural_symmetry) w_mark_dirty_rect(0, 0, cw - 1, ch - 1);
                else w_mark_dirty_rect(min_x, min_y, max_x, max_y);
                w_invalidate_layers();
            }
        } else if (state == 2) { // Up / end
            if (g_current_brush->stroke_end) {
                g_current_brush->stroke_end();
            }
            force_composite();
            w_invalidate_layers();
            g_procedural_last_ns = 0;
        }
        if (coverage < 255) {
            w_brush_apply_coverage(pixels, g_procedural_before, pixel_count, coverage);
            w_invalidate_layers();
            if (state == 2) force_composite();
        }
        return;
    }

    // Classic Quadro stroke
    w_brush_stroke_ext_f(state, x0, y0, x1, y1, (uint32_t)color, eraser, stroke_pressure, tilt_x, tilt_y);
}

// ── Filters Suite ──

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

    // Plugin ABI reserves scratch images immediately after the input image.
    // Engine layers only own their exact pixel allocation; never expose the
    // following layer/heap memory as scratch to a neighborhood filter.
    size_t workspace_images = strcmp(filter->id, "bloom") == 0 ? 3 : 2;
    if ((size_t)w > SIZE_MAX / (size_t)h / (workspace_images * sizeof(uint32_t))) return JNI_FALSE;
    size_t bytes = (size_t)w * (size_t)h * sizeof(uint32_t);
    uint32_t *workspace = (uint32_t*)malloc(bytes * workspace_images);
    if (!workspace) return JNI_FALSE;
    memcpy(workspace, pix, bytes);
    w_set_layer(workspace, w, h);
    filter->apply(p1, p2);
    memcpy(pix, workspace, bytes);
    w_set_layer(pix, w, h);
    free(workspace);
    force_composite();
    w_invalidate_layers();
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerAdjustHsv(
    JNIEnv *env, jobject thiz, jint layer_idx, jint d_hue, jint d_sat, jint d_val) {
    w_layer_adjust_hsv(layer_idx, d_hue, d_sat, d_val);
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

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeBeginLayerUpdate(
    JNIEnv *env, jobject thiz) {
    w_begin_layer_update();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeEndLayerUpdate(
    JNIEnv *env, jobject thiz) {
    w_end_layer_update();
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerRestoreSlot(
    JNIEnv *env, jobject thiz, jint idx, jint width, jint height, jint visible, jint order_position) {
    (void)env; (void)thiz;
    return w_layer_restore_slot(idx, width, height, visible, order_position);
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
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerResize(
    JNIEnv *env, jobject thiz, jint idx, jint width, jint height, jint resample) {
    return w_layer_resize(idx, width, height, resample);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetWidth(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_width(idx);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetHeight(
    JNIEnv *env, jobject thiz, jint idx) {
    return w_layer_get_height(idx);
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
    if (param_id == 1) val = val < 1 ? 1 : (val > 100 ? 100 : val);
    w_brush_set_param(param_id, val);
    if (param_id == 4) g_procedural_flow = fminf(1.0f, fmaxf(0.0f, val / 100.0f));
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
    g_procedural_flow = 1.0f;
    g_procedural_opacity = 1.0f;
    g_procedural_spacing = -1.0f;
    g_current_brush = NULL;
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectShape(
    JNIEnv *env, jobject thiz, jstring shape_name) {
    if (!shape_name) {
        w_brush_select_shape_by_name("circle");
        return 0;
    }
    const char *name = (*env)->GetStringUTFChars(env, shape_name, NULL);
    int32_t slot = w_shape_find_or_create(name);
    w_brush_select_shape_by_name(name);
    (*env)->ReleaseStringUTFChars(env, shape_name, name);
    return slot;
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectTexture(
    JNIEnv *env, jobject thiz, jstring tex_name) {
    if (!tex_name) {
        w_brush_select_texture_by_name("none");
        return -1;
    }
    const char *name = (*env)->GetStringUTFChars(env, tex_name, NULL);
    int32_t slot = w_texture_find_or_create(name);
    w_brush_select_texture_by_name(name);
    (*env)->ReleaseStringUTFChars(env, tex_name, name);
    return slot;
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeCreateBrushAsset(
    JNIEnv *env, jobject thiz, jobject bitmap) {
    AndroidBitmapInfo info;
    void *source = NULL;
    if (!bitmap || AndroidBitmap_getInfo(env, bitmap, &info) < 0 ||
        info.format != ANDROID_BITMAP_FORMAT_RGBA_8888 || info.width == 0 || info.height == 0 ||
        (uint64_t)info.width * (uint64_t)info.height > 4194304ULL) return -1;
    if (AndroidBitmap_lockPixels(env, bitmap, &source) < 0 || !source) return -1;

    int32_t slot = w_texture_create((int32_t)info.width, (int32_t)info.height);
    uint32_t *destination = slot >= 0 ? w_texture_get_pixels(slot) : NULL;
    if (destination) {
        for (uint32_t y = 0; y < info.height; y++) {
            const void *row = (const uint8_t *)source + (size_t)y * info.stride;
            memcpy(destination + (size_t)y * info.width, row, (size_t)info.width * sizeof(uint32_t));
        }
    } else {
        slot = -1;
    }
    AndroidBitmap_unlockPixels(env, bitmap);
    return slot;
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

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerGetBitmap(
    JNIEnv *env, jobject thiz, jint layer_idx, jobject bitmap) {
    AndroidBitmapInfo info;
    void *pixels = NULL;

    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) return JNI_FALSE;
    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) return JNI_FALSE;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) return JNI_FALSE;

    int active = (layer_idx >= 0) ? layer_idx : w_layer_get_active();
    uint32_t *layer_pixels = w_layer_get_pixels(active);
    int lw = w_layer_get_width(active);
    int lh = w_layer_get_height(active);

    if (layer_pixels != NULL && pixels != NULL && lw > 0 && lh > 0) {
        int copy_w = ((int)info.width < lw) ? (int)info.width : lw;
        int copy_h = ((int)info.height < lh) ? (int)info.height : lh;
        if (copy_w == (int)info.width && copy_w == lw) {
            memcpy(pixels, layer_pixels, (size_t)(copy_w * copy_h * 4));
        } else {
            for (int y = 0; y < copy_h; y++) {
                uint32_t *dst_row = (uint32_t *)((char *)pixels + y * info.stride);
                uint32_t *src_row = layer_pixels + y * lw;
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
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDrawAffineShape(
    JNIEnv *env, jobject thiz, jfloat x0, jfloat y0, jfloat x1, jfloat y1,
    jfloatArray matrix, jboolean ellipse, jboolean erase, jint color) {
    if (!matrix || (*env)->GetArrayLength(env, matrix) != 6) return;
    float values[6];
    (*env)->GetFloatArrayRegion(env, matrix, 0, 6, values);
    w_draw_affine_shape(x0, y0, x1, y1, values, ellipse, erase, (uint32_t)color);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDrawEllipse(
    JNIEnv *env, jobject thiz, jint cx, jint cy, jint rx, jint ry, jint color) {
    w_draw_ellipse(cx, cy, rx, ry, (uint32_t)color);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeEraseRect(
    JNIEnv *env, jobject thiz, jint x, jint y, jint w, jint h) {
    w_erase_rect(x, y, w, h);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeEraseEllipse(
    JNIEnv *env, jobject thiz, jint cx, jint cy, jint rx, jint ry) {
    w_erase_ellipse(cx, cy, rx, ry);
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

// ── Selection JNI Bindings ──

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectRect(
    JNIEnv *env, jobject thiz, jint x, jint y, jint w, jint h, jint op_mode) {
    w_select_rect(x, y, w, h, op_mode);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectEllipse(
    JNIEnv *env, jobject thiz, jint x, jint y, jint w, jint h, jint op_mode) {
    w_select_ellipse(x, y, w, h, op_mode);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectLasso(
    JNIEnv *env, jobject thiz, jintArray points_xy, jint point_count, jint op_mode) {
    if (!points_xy || point_count < 3) return;
    jint *pts = (*env)->GetIntArrayElements(env, points_xy, NULL);
    if (pts) {
        w_select_lasso(pts, point_count, op_mode);
        (*env)->ReleaseIntArrayElements(env, points_xy, pts, JNI_ABORT);
    }
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectBrushMask(
    JNIEnv *env, jobject thiz, jintArray points_xy, jint point_count, jint radius, jint op_mode) {
    if (!points_xy || point_count <= 0) return;
    jint *pts = (*env)->GetIntArrayElements(env, points_xy, NULL);
    if (pts) {
        w_select_brush(pts, point_count, radius, op_mode);
        (*env)->ReleaseIntArrayElements(env, points_xy, pts, JNI_ABORT);
    }
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectApplyMask(
    JNIEnv *env, jobject thiz, jbyteArray mask, jint x, jint y, jint w, jint h, jint op_mode) {
    if (!mask || w <= 0 || h <= 0 || (int64_t)w * h > INT32_MAX) return;
    jsize len = (*env)->GetArrayLength(env, mask);
    if ((int64_t)w * h > len) return;
    jbyte *bytes = (*env)->GetByteArrayElements(env, mask, NULL);
    if (!bytes) return;
    w_select_apply_mask((const uint8_t*)bytes, x, y, w, h, op_mode);
    (*env)->ReleaseByteArrayElements(env, mask, bytes, JNI_ABORT);
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeGetSelectionScratchLayer(
    JNIEnv *env, jobject thiz) {
    return w_get_selection_scratch_layer();
}

JNIEXPORT jint JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectWand(
    JNIEnv *env, jobject thiz, jint layer_idx, jint seed_x, jint seed_y, jint tolerance, jint contiguous, jint op_mode) {
    return w_select_wand(layer_idx, seed_x, seed_y, tolerance, contiguous, op_mode);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectAll(
    JNIEnv *env, jobject thiz, jint op_mode) {
    w_select_all(op_mode);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectClear(
    JNIEnv *env, jobject thiz) {
    w_select_clear();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectInvert(
    JNIEnv *env, jobject thiz) {
    w_select_invert();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectFeather(
    JNIEnv *env, jobject thiz, jint radius) {
    w_select_feather(radius);
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectGetInfo(
    JNIEnv *env, jobject thiz, jintArray out_words) {
    if (!out_words) return JNI_FALSE;
    jsize len = (*env)->GetArrayLength(env, out_words);
    if (len < 5) return JNI_FALSE;
    int32_t buf[6] = {0};
    int res = w_select_get_info(buf);
    if (res) {
        int count = (len >= 6) ? 6 : 5;
        (*env)->SetIntArrayRegion(env, out_words, 0, count, buf);
        return JNI_TRUE;
    }
    return JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeSelectGetMask(
    JNIEnv *env, jobject thiz, jbyteArray out_buffer) {
    if (!out_buffer) return JNI_FALSE;
    jsize len = (*env)->GetArrayLength(env, out_buffer);
    if (len <= 0) return JNI_FALSE;
    jbyte *buf = (*env)->GetByteArrayElements(env, out_buffer, NULL);
    if (!buf) return JNI_FALSE;
    int32_t copied = w_select_get_mask((uint8_t*)buf, (uint32_t)len);
    (*env)->ReleaseByteArrayElements(env, out_buffer, buf, 0);
    return (copied > 0) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeClearSelectedPixels(
    JNIEnv *env, jobject thiz) {
    int32_t info[6] = {0};
    if (w_select_get_info(info) && info[0]) {
        int active = w_layer_get_active();
        uint32_t *pix = w_layer_get_pixels(active);
        int lw = w_layer_get_width(active);
        int lh = w_layer_get_height(active);
        int cx = info[1], cy = info[2], cw = info[3], ch = info[4];
        int has_mask = info[5];
        uint8_t *mask = (has_mask) ? w_select_get_mask_ptr() : NULL;
        if (pix && lw > 0 && lh > 0 && cw > 0 && ch > 0) {
            for (int y = 0; y < ch; y++) {
                int py = cy + y;
                if (py < 0 || py >= lh) continue;
                for (int x = 0; x < cw; x++) {
                    int px = cx + x;
                    if (px < 0 || px >= lw) continue;
                    if (has_mask && mask) {
                        if (mask[y * cw + x] == 0) continue;
                    }
                    pix[py * lw + px] = 0;
                }
            }
            force_composite();
        }
    }
}

// ── Transform & Flip JNI Bindings ──

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerFlipH(
    JNIEnv *env, jobject thiz, jint layer_idx) {
    w_layer_flip_h(layer_idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerFlipV(
    JNIEnv *env, jobject thiz, jint layer_idx) {
    w_layer_flip_v(layer_idx);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeCanvasFlipH(
    JNIEnv *env, jobject thiz) {
    int count = w_layer_get_order_count();
    for (int i = 0; i < count; i++) {
        int idx = w_layer_get_order(i);
        w_layer_flip_h(idx);
    }
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeCanvasFlipV(
    JNIEnv *env, jobject thiz) {
    int count = w_layer_get_order_count();
    for (int i = 0; i < count; i++) {
        int idx = w_layer_get_order(i);
        w_layer_flip_v(idx);
    }
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeLayerDrawBitmap(
    JNIEnv *env, jobject thiz, jint layer_idx, jobject bitmap, jint dst_x, jint dst_y, jint dst_w, jint dst_h) {
    AndroidBitmapInfo info;
    void *src_pixels = NULL;

    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) return;
    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) return;
    if (AndroidBitmap_lockPixels(env, bitmap, &src_pixels) < 0) return;

    int active = (layer_idx >= 0) ? layer_idx : w_layer_get_active();
    uint32_t *layer_pixels = w_layer_get_pixels(active);
    int lw = w_layer_get_width(active);
    int lh = w_layer_get_height(active);

    if (layer_pixels && lw > 0 && lh > 0 && src_pixels && dst_w > 0 && dst_h > 0) {
        int src_w = (int)info.width;
        int src_h = (int)info.height;
        for (int y = 0; y < dst_h; y++) {
            int py = dst_y + y;
            if (py < 0 || py >= lh) continue;
            int sy = (y * src_h) / dst_h;
            if (sy < 0) sy = 0; if (sy >= src_h) sy = src_h - 1;
            uint32_t *src_row = (uint32_t *)((char *)src_pixels + sy * info.stride);
            uint32_t *dst_row = layer_pixels + py * lw;

            for (int x = 0; x < dst_w; x++) {
                int px = dst_x + x;
                if (px < 0 || px >= lw) continue;
                int sx = (x * src_w) / dst_w;
                if (sx < 0) sx = 0; if (sx >= src_w) sx = src_w - 1;
                uint32_t sp = src_row[sx];
                uint32_t sa = (sp >> 24) & 0xFF;
                if (sa == 255) {
                    dst_row[px] = sp;
                } else if (sa > 0) {
                    uint32_t dp = dst_row[px];
                    uint32_t da = (dp >> 24) & 0xFF;
                    uint32_t sr = sp & 0xFF, sg = (sp >> 8) & 0xFF, sb = (sp >> 16) & 0xFF;
                    uint32_t dr = dp & 0xFF, dg = (dp >> 8) & 0xFF, db = (dp >> 16) & 0xFF;
                    uint32_t out_a = sa + (da * (255 - sa)) / 255;
                    if (out_a > 0) {
                        // Android ARGB_8888 bitmaps expose premultiplied color
                        // channels through AndroidBitmap_lockPixels. The raster
                        // engine also stores premultiplied channels, so source
                        // color must not be multiplied by alpha a second time.
                        uint32_t inv_sa = 255 - sa;
                        uint32_t out_r = sr + (dr * inv_sa + 127) / 255;
                        uint32_t out_g = sg + (dg * inv_sa + 127) / 255;
                        uint32_t out_b = sb + (db * inv_sa + 127) / 255;
                        dst_row[px] = (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
                    }
                }
            }
        }
        force_composite();
    }
    AndroidBitmap_unlockPixels(env, bitmap);
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeDryAllWater(
    JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    w_dry_all_water();
}

JNIEXPORT void JNICALL
Java_app_esenho_nativeengine_EsenhoNativeBridge_nativeStepWaterDiffusion(
    JNIEnv *env, jobject thiz, jint steps) {
    (void)env; (void)thiz;
    w_step_water_diffusion(steps);
    force_composite();
}
