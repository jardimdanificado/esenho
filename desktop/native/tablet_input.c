/* XInput2 tablet valuators supplement AWT's mouse events on Linux/XWayland. */
#include <jni.h>
#include <X11/Xlib.h>
#include <X11/extensions/XInput2.h>
#include <pthread.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t sample_mutex = PTHREAD_MUTEX_INITIALIZER;
static float pressure = 1.f, tilt = 0.f, tool = 0.f;
static int started = 0;
static int input_opcode = 0;
/* Separate connection: XNextEvent owns the reader connection exclusively. */
static Display *sample_display = NULL;
static Atom pressure_label, tilt_x_label, tilt_y_label;
typedef struct {
    int pressure_axis, tilt_x_axis, tilt_y_axis, eraser;
    double minimum, maximum;
} TabletAxes;

static TabletAxes axes_for(Display *display, int device) {
    TabletAxes axes = { .pressure_axis = -1, .tilt_x_axis = -1, .tilt_y_axis = -1 };
    int count = 0;
    XIDeviceInfo *devices = XIQueryDevice(display, device, &count);
    if (!devices) return axes;
    for (int i = 0; i < count; i++) {
        char *name = strdup(devices[i].name);
        if (name) {
            for (char *p = name; *p; p++) *p = (char)tolower((unsigned char)*p);
            axes.eraser = strstr(name, "eraser") != NULL;
            free(name);
        }
        for (int j = 0; j < devices[i].num_classes; j++) {
            XIAnyClassInfo *info = devices[i].classes[j];
            if (info->type != XIValuatorClass) continue;
            XIValuatorClassInfo *v = (XIValuatorClassInfo *)info;
            char *label = v->label ? XGetAtomName(display, v->label) : NULL;
            if (label && !strcmp(label, "Abs Pressure")) {
                axes.pressure_axis = v->number; axes.minimum = v->min; axes.maximum = v->max;
            } else if (label && !strcmp(label, "Abs Tilt X")) axes.tilt_x_axis = v->number;
            else if (label && !strcmp(label, "Abs Tilt Y")) axes.tilt_y_axis = v->number;
            if (label) XFree(label);
        }
    }
    XIFreeDeviceInfo(devices);
    return axes;
}
static void *read_events(void *connection) {
    Display *display = connection;
    int last_source = -1;
    TabletAxes axes = { .pressure_axis = -1 };
    float current_pressure = 1.f, tilt_x = 0.f, tilt_y = 0.f;
    for (;;) {
        XEvent event;
        XNextEvent(display, &event);
        if (event.type != GenericEvent || event.xcookie.extension != input_opcode || !XGetEventData(display, &event.xcookie)) continue;
        if (event.xcookie.evtype == XI_RawMotion) {
            XIRawEvent *raw = event.xcookie.data;
            if (raw->sourceid != last_source) {
                axes = axes_for(display, raw->sourceid); last_source = raw->sourceid;
                current_pressure = 1.f; tilt_x = tilt_y = 0.f;
            }
            double *value = raw->valuators.values;
            for (int i = 0; i < raw->valuators.mask_len * 8; i++) {
                if (!XIMaskIsSet(raw->valuators.mask, i)) continue;
                if (i == axes.pressure_axis && axes.maximum > axes.minimum)
                    current_pressure = (float)((*value - axes.minimum) / (axes.maximum - axes.minimum));
                if (i == axes.tilt_x_axis) tilt_x = (float)*value;
                if (i == axes.tilt_y_axis) tilt_y = (float)*value;
                value++;
            }
            pthread_mutex_lock(&mutex);
            pressure = fminf(1.f, fmaxf(0.f, current_pressure));
            tilt = atan2f(hypotf(tanf(tilt_x * .017453293f), tanf(tilt_y * .017453293f)), 1.f);
            tool = axes.pressure_axis < 0 ? 0.f : axes.eraser ? 2.f : 1.f;
            pthread_mutex_unlock(&mutex);
        }
        XFreeEventData(display, &event.xcookie);
    }
    return NULL;
}
JNIEXPORT jboolean JNICALL Java_app_esenho_desktop_TabletInput_start(JNIEnv *env, jobject self) {
    if (started) return JNI_TRUE;
    /* This connection belongs exclusively to the input thread after setup. */
    Display *display = XOpenDisplay(NULL);
    if (!display) return JNI_FALSE;
    int opcode, event, error, major = 2, minor = 0;
    if (!XQueryExtension(display, "XInputExtension", &opcode, &event, &error) ||
        XIQueryVersion(display, &major, &minor) != Success) { XCloseDisplay(display); return JNI_FALSE; }
    input_opcode = opcode;
    sample_display = XOpenDisplay(NULL);
    if (sample_display) {
        pressure_label = XInternAtom(sample_display, "Abs Pressure", False);
        tilt_x_label = XInternAtom(sample_display, "Abs Tilt X", False);
        tilt_y_label = XInternAtom(sample_display, "Abs Tilt Y", False);
    }
    unsigned char mask[XIMaskLen(XI_RawMotion)] = {0};
    XISetMask(mask, XI_RawMotion);
    XIEventMask events = { .deviceid = XIAllMasterDevices, .mask_len = sizeof(mask), .mask = mask };
    XISelectEvents(display, DefaultRootWindow(display), &events, 1); XFlush(display);
    pthread_t thread;
    if (pthread_create(&thread, NULL, read_events, display)) {
        if (sample_display) XCloseDisplay(sample_display);
        sample_display = NULL; XCloseDisplay(display); return JNI_FALSE;
    }
    pthread_detach(thread); started = 1;
    return JNI_TRUE;
}
static void refresh_sample(float values[3]) {
    /* AWT may deliver its event before the raw-event reader catches up.
     * XWayland also exposes tablet state even when raw motion is absent.
     * Read current absolute valuators rather than using stale pressure. */
    pthread_mutex_lock(&sample_mutex);
    if (sample_display) {
        int count = 0;
        XIDeviceInfo *devices = XIQueryDevice(sample_display, XIAllDevices, &count);
        if (devices) {
            if (values[2] != 0.f) values[0] = 0.f;
            for (int i = 0; i < count; i++) {
                if (devices[i].use != XISlavePointer) continue;
                float p = 0.f, tx = 0.f, ty = 0.f;
                for (int j = 0; j < devices[i].num_classes; j++) {
                    XIAnyClassInfo *info = devices[i].classes[j];
                    if (info->type != XIValuatorClass) continue;
                    XIValuatorClassInfo *v = (XIValuatorClassInfo *)info;
                    if (v->label == pressure_label && v->max > v->min)
                        p = (float)((v->value - v->min) / (v->max - v->min));
                    else if (v->label == tilt_x_label) tx = (float)v->value;
                    else if (v->label == tilt_y_label) ty = (float)v->value;
                }
                if (p <= 0.f) continue;
                values[0] = fminf(1.f, p);
                values[1] = atan2f(hypotf(tanf(tx * .017453293f), tanf(ty * .017453293f)), 1.f);
                /* Device names come from the server; eraser matching is case insensitive. */
                char *name = strdup(devices[i].name);
                if (name) {
                    for (char *c = name; *c; c++) *c = (char)tolower((unsigned char)*c);
                    values[2] = strstr(name, "eraser") ? 2.f : 1.f;
                    free(name);
                } else values[2] = 1.f;
                pthread_mutex_lock(&mutex);
                pressure = values[0]; tilt = values[1]; tool = values[2];
                pthread_mutex_unlock(&mutex);
                break;
            }
            XIFreeDeviceInfo(devices);
        }
    }
    pthread_mutex_unlock(&sample_mutex);
}

JNIEXPORT jfloatArray JNICALL Java_app_esenho_desktop_TabletInput_read(JNIEnv *env, jobject self) {
    float values[3];
    pthread_mutex_lock(&mutex); values[0] = pressure; values[1] = tilt; values[2] = tool; pthread_mutex_unlock(&mutex);
    refresh_sample(values);
    jfloatArray result = (*env)->NewFloatArray(env, 3);
    if (result) (*env)->SetFloatArrayRegion(env, result, 0, 3, values);
    return result;
}
