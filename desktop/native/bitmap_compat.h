/* Linux pixel storage adapter for the shared Android JNI implementation. */
#include <jni.h>
#define ESENHO_DESKTOP_BITMAP 1
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
typedef struct { uint32_t width, height, stride; int32_t format; uint32_t flags; } AndroidBitmapInfo;
#define ANDROID_BITMAP_FORMAT_RGBA_8888 1
#define ANDROID_LOG_INFO 4
#define ANDROID_LOG_ERROR 6
static int __android_log_print(int level, const char *tag, const char *format, ...) {
    va_list args; va_start(args, format); fprintf(stderr, "%s: ", tag);
    int result = vfprintf(stderr, format, args); fputc('\n', stderr); va_end(args); return result;
}
static int AndroidBitmap_getInfo(JNIEnv *env, jobject bitmap, AndroidBitmapInfo *info) {
    if (!bitmap) return -1;
    jclass cls = (*env)->GetObjectClass(env, bitmap);
    info->width = (*env)->CallIntMethod(env, bitmap, (*env)->GetMethodID(env, cls, "getWidth", "()I"));
    info->height = (*env)->CallIntMethod(env, bitmap, (*env)->GetMethodID(env, cls, "getHeight", "()I"));
    info->stride = info->width * 4; info->format = 1; info->flags = 0;
    (*env)->DeleteLocalRef(env, cls); return (*env)->ExceptionCheck(env) ? -1 : 0;
}
static int AndroidBitmap_lockPixels(JNIEnv *env, jobject bitmap, void **pixels) {
    jclass cls = (*env)->GetObjectClass(env, bitmap);
    jobject buffer = (*env)->CallObjectMethod(env, bitmap, (*env)->GetMethodID(env, cls, "getRgbaBuffer", "()Ljava/nio/ByteBuffer;"));
    *pixels = buffer ? (*env)->GetDirectBufferAddress(env, buffer) : NULL;
    (*env)->DeleteLocalRef(env, buffer); (*env)->DeleteLocalRef(env, cls);
    return *pixels ? 0 : -1;
}
static int AndroidBitmap_unlockPixels(JNIEnv *env, jobject bitmap) {
    jclass cls = (*env)->GetObjectClass(env, bitmap);
    (*env)->CallVoidMethod(env, bitmap, (*env)->GetMethodID(env, cls, "markDirty", "()V"));
    (*env)->DeleteLocalRef(env, cls); return 0;
}

/* Display updates already know their changed bounds; preserve that information. */
static int AndroidBitmap_unlockPixelsRect(JNIEnv *env, jobject bitmap, int x0, int y0, int x1, int y1) {
    jclass cls = (*env)->GetObjectClass(env, bitmap);
    (*env)->CallVoidMethod(env, bitmap, (*env)->GetMethodID(env, cls, "markDirty", "(IIII)V"), x0, y0, x1, y1);
    (*env)->DeleteLocalRef(env, cls); return 0;
}
