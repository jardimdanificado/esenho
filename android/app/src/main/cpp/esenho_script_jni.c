#include <jni.h>
#include <string.h>
#include <time.h>
#include <stdlib.h>
#include <stdio.h>
#include "quickjs.h"

typedef struct {
    JNIEnv *env;
    jobject host;
    jmethodID invoke;
    jmethodID stopped;
    double started;
} ScriptHost;

static double cpu_seconds(void) {
    struct timespec t;
    clock_gettime(CLOCK_THREAD_CPUTIME_ID, &t);
    return t.tv_sec + t.tv_nsec / 1e9;
}

static jbyteArray bytes(JNIEnv *env, const char *s, size_t length) {
    jbyteArray result = (*env)->NewByteArray(env, (jsize)length);
    if (result) (*env)->SetByteArrayRegion(env, result, 0, (jsize)length, (const jbyte *)s);
    return result;
}

static int interrupt_script(JSRuntime *rt, void *opaque) {
    ScriptHost *host = opaque;
    if (cpu_seconds() - host->started > 30.0) return 1;
    jboolean stopped = (*host->env)->CallBooleanMethod(host->env, host->host, host->stopped);
    if ((*host->env)->ExceptionCheck(host->env)) {
        (*host->env)->ExceptionClear(host->env);
        return 1;
    }
    return stopped;
}

static JSValue host_call(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    ScriptHost *host = JS_GetContextOpaque(ctx);
    JNIEnv *env = host->env;
    if (interrupt_script(JS_GetRuntime(ctx), host)) return JS_ThrowInternalError(ctx, "Script interrompido");
    if (argc != 2) return JS_ThrowTypeError(ctx, "Comando e argumentos obrigatórios");
    const char *op = JS_ToCString(ctx, argv[0]);
    size_t length;
    const char *args = JS_ToCStringLen(ctx, &length, argv[1]);
    if (!op || !args) {
        JS_FreeCString(ctx, op); JS_FreeCString(ctx, args);
        return JS_EXCEPTION;
    }
    // Operations are ASCII identifiers; all user content crosses JNI as UTF-8 bytes.
    jstring operation = (*env)->NewStringUTF(env, op);
    jbyteArray input = bytes(env, args, length);
    JS_FreeCString(ctx, op); JS_FreeCString(ctx, args);
    if (!operation || !input) return JS_ThrowOutOfMemory(ctx);
    jbyteArray output = (*env)->CallObjectMethod(env, host->host, host->invoke, operation, input);
    (*env)->DeleteLocalRef(env, operation);
    (*env)->DeleteLocalRef(env, input);
    if ((*env)->ExceptionCheck(env)) {
        (*env)->ExceptionClear(env);
        return JS_ThrowInternalError(ctx, "Falha na operação nativa");
    }
    if (!output) return JS_ThrowInternalError(ctx, "Resposta nativa ausente");
    jsize size = (*env)->GetArrayLength(env, output);
    jbyte *data = (*env)->GetByteArrayElements(env, output, NULL);
    JSValue value = data ? JS_NewStringLen(ctx, (const char *)data, size) : JS_EXCEPTION;
    if (data) (*env)->ReleaseByteArrayElements(env, output, data, JNI_ABORT);
    (*env)->DeleteLocalRef(env, output);
    return value;
}

static JSValue evaluate(JNIEnv *env, JSContext *ctx, jbyteArray source, const char *filename) {
    jsize length = (*env)->GetArrayLength(env, source);
    // JS_Eval requires a trailing zero even though it accepts a length.
    char *data = js_malloc(ctx, (size_t)length + 1);
    if (!data) return JS_ThrowOutOfMemory(ctx);
    (*env)->GetByteArrayRegion(env, source, 0, length, (jbyte *)data);
    data[length] = 0;
    JSValue value = JS_Eval(ctx, data, length, filename, JS_EVAL_TYPE_GLOBAL);
    js_free(ctx, data);
    return value;
}

JNIEXPORT jbyteArray JNICALL
Java_app_esenho_scripting_NativeScriptRuntime_execute(JNIEnv *env, jobject self,
        jbyteArray bootstrap, jbyteArray source, jobject hostObject) {
    JSRuntime *rt = JS_NewRuntime();
    if (!rt) return bytes(env, "Sem memória para JavaScript", strlen("Sem memória para JavaScript"));
    JS_SetMemoryLimit(rt, 64 * 1024 * 1024);
    JS_SetMaxStackSize(rt, 512 * 1024);
    JSContext *ctx = JS_NewContext(rt);
    if (!ctx) { JS_FreeRuntime(rt); return bytes(env, "Sem memória", strlen("Sem memória")); }
    jclass cls = (*env)->GetObjectClass(env, hostObject);
    ScriptHost host = {env, hostObject,
        (*env)->GetMethodID(env, cls, "invoke", "(Ljava/lang/String;[B)[B"),
        (*env)->GetMethodID(env, cls, "shouldStop", "()Z"), cpu_seconds()};
    (*env)->DeleteLocalRef(env, cls);
    JS_SetContextOpaque(ctx, &host);
    JS_SetInterruptHandler(rt, interrupt_script, &host);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "__esenhoHost", JS_NewCFunction(ctx, host_call, "__esenhoHost", 2));
    JS_FreeValue(ctx, global);
    JSValue value = evaluate(env, ctx, bootstrap, "esenho-api.js");
    if (!JS_IsException(value)) {
        JS_FreeValue(ctx, value);
        value = evaluate(env, ctx, source, "script.js");
    }
    // Also drain native Promise jobs for standard JS behavior.
    if (!JS_IsException(value)) {
        JSContext *jobContext;
        int result;
        while ((result = JS_ExecutePendingJob(rt, &jobContext)) > 0) {}
        if (result < 0) {
            JS_FreeValue(ctx, value);
            value = JS_EXCEPTION;
        }
    }
    jbyteArray error = NULL;
    if (JS_IsException(value)) {
        JSValue exception = JS_GetException(ctx);
        JSValue stack = JS_GetPropertyStr(ctx, exception, "stack");
        const char *message = JS_ToCString(ctx, exception);
        const char *trace = JS_IsUndefined(stack) ? NULL : JS_ToCString(ctx, stack);
        const char *description = message ? message : "Erro JavaScript";
        size_t length = strlen(description) + (trace ? strlen(trace) : 0) + 2;
        char *report = malloc(length);
        if (report) {
            snprintf(report, length, "%s%s%s", description, trace ? "\n" : "", trace ? trace : "");
            error = bytes(env, report, strlen(report));
            free(report);
        } else error = bytes(env, description, strlen(description));
        JS_FreeCString(ctx, message); JS_FreeCString(ctx, trace);
        JS_FreeValue(ctx, stack); JS_FreeValue(ctx, exception);
    }
    JS_FreeValue(ctx, value);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return error;
}
