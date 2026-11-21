#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quadro.h"

extern void w_brush_set_param(int32_t parameter, int32_t value);
extern void w_brush_stroke_ext_f(int32_t state, float x0, float y0,
    float x1, float y1, uint32_t color, int32_t eraser, int32_t pressure,
    int32_t tilt_x, int32_t tilt_y);
extern uint32_t *w_render(void);
extern void w_force_composite(void);
extern void w_clear_dirty_bounds(void);
extern int32_t w_has_dirty_rect(void);
extern int32_t w_get_dirty_x0(void), w_get_dirty_y0(void);
extern int32_t w_get_dirty_x1(void), w_get_dirty_y1(void);

int main(void) {
    const int w = 512, h = 384; /* Non-square: catches mid_x/mid_y mixups. */
    w_init(w, h);
    w_brush_set_param(1, 8);   /* brush size */
    w_brush_set_param(38, 4);  /* radial symmetry (8x) */
    w_render();
    w_clear_dirty_bounds();

    w_brush_stroke_ext_f(0, 100.f, 100.f, 100.f, 100.f, 0xff123456u, 0, 1000, 0, 0);
    w_brush_stroke_ext_f(1, 132.f, 100.f, 100.f, 100.f, 0xff123456u, 0, 1000, 0, 0);
    assert(w_has_dirty_rect());

    int x0 = w_get_dirty_x0(), y0 = w_get_dirty_y0();
    int x1 = w_get_dirty_x1(), y1 = w_get_dirty_y1();
    assert(x1 - x0 + 1 < w);
    assert(y1 - y0 + 1 < h);
    printf("Radial dirty rect: (%d,%d)-(%d,%d) of %dx%d\n", x0, y0, x1, y1, w, h);

    uint32_t *snapshot = malloc((size_t)w * h * sizeof(uint32_t));
    assert(snapshot);
    memcpy(snapshot, w_render(), (size_t)w * h * sizeof(uint32_t));
    w_force_composite();
    assert(memcmp(snapshot, w_render(), (size_t)w * h * sizeof(uint32_t)) == 0);
    free(snapshot);
    puts("Radial symmetry dirty bounds cover every mirrored dab.");
    return 0;
}
