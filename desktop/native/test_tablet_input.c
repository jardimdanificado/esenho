/* Exercise the actual sampler with synthetic XInput device state. */
#include <assert.h>
#include <stdio.h>
#include "tablet_input.c"

static XIDeviceInfo device;
static XIValuatorClassInfo axis;
static XIAnyClassInfo *classes[1];
XIDeviceInfo *XIQueryDevice(Display *display, int id, int *count) {
    (void)display; (void)id; *count = 1; return &device;
}
void XIFreeDeviceInfo(XIDeviceInfo *info) { (void)info; }

int main(void) {
    sample_display = (Display *)1;
    pressure_label = 101; tilt_x_label = 102; tilt_y_label = 103;
    axis.type = XIValuatorClass; axis.label = pressure_label;
    axis.min = 0; axis.max = 65535; axis.value = 327.675;
    classes[0] = (XIAnyClassInfo *)&axis;
    device.use = XISlavePointer; device.name = "xwayland-tablet stylus:17";
    device.num_classes = 1; device.classes = classes;
    float values[3] = {1.f, 0.f, 0.f};
    refresh_sample(values);
    assert(fabsf(values[0] - .005f) < .000001f && values[2] == 1.f);
    assert(tool == 1.f); /* Preserve pen identity through a zero-pressure release. */
    axis.value = 0;
    refresh_sample(values);
    assert(values[0] == 0.f && values[2] == 1.f);
    axis.value = 65535; device.name = "Wacom ERASER";
    refresh_sample(values);
    assert(values[0] == 1.f && values[2] == 2.f);
    values[0] = 1.f; values[2] = 0.f;
    device.use = XIMasterPointer;
    refresh_sample(values);
    assert(values[0] == 1.f && values[2] == 0.f); /* Ignore mirrored master axes. */
    puts("Tablet pressure: light touch, release, eraser and mouse OK");
    return 0;
}
