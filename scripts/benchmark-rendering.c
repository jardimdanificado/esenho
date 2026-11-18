#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include "quadro_viewport_filter.h"

extern void w_init(int width, int height);
extern void w_brush_set_param(int parameter, int value);
extern void w_brush_stroke_ext_f(int state, float x, float y,
    float previous_x, float previous_y, unsigned color, int eraser,
    int pressure, int tilt_x, int tilt_y);

static double now(void) {
    struct timespec time;
    clock_gettime(CLOCK_MONOTONIC, &time);
    return time.tv_sec + time.tv_nsec * 1e-9;
}

int main(void) {
    const int size = 4096;
    unsigned *source = malloc((size_t)size * size * 4);
    unsigned *target = malloc((size_t)size * size / 16 * 4);
    if (!source || !target) return 1;
    for (int i = 0; i < size * size; ++i) source[i] = 0xff112233u + (i & 255);
    double start = now();
    for (int i = 0; i < 3; ++i)
        w_viewport_reduce(source, size, size, target, size / 4, size / 4,
            size, 0, 0, size / 4 - 1, size / 4 - 1);
    printf("Area reduction 4096 to 1024: %.3f ms/frame (pixel %08x)\n",
        (now() - start) * 1000 / 3, target[0]);
    free(source);
    free(target);

    /* Whole 700-pixel strokes, not individual pointer events. Both modes
       share the same size, hardness, flow, pressure, path and dab spacing. */
    w_init(1024, 1024);
    for (int radius = 4; radius <= 64; radius *= 4) {
        for (int aa = 0; aa <= 1; ++aa) {
            w_brush_set_param(1, radius);
            w_brush_set_param(3, 100);
            w_brush_set_param(4, 100);
            w_brush_set_param(32, aa);
            w_brush_set_param(39, 0);
            w_brush_set_param(40, 0);
            start = now();
            for (int stroke = 0; stroke < 8; ++stroke) {
                float y = 200 + stroke * 30;
                w_brush_stroke_ext_f(0, 100, y, 100, y, 0xff123456, 0, 1000, 0, 0);
                for (int x = 101; x < 801; ++x)
                    w_brush_stroke_ext_f(1, x, y, x - 1, y, 0xff123456, 0, 1000, 0, 0);
            }
            printf("Radius %d AA %d: %.3f ms/stroke\n",
                radius, aa, (now() - start) * 1000 / 8);
        }
    }
    return 0;
}
