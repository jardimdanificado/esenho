#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quadro.h"
extern void w_brush_dyn_init(void), w_brush_dyn_reset_state(void);
extern void w_brush_dyn_set_base(int32_t, float);
extern void w_brush_dyn_stroke_to(float, float, float, float, float, float, float);
extern uint32_t *w_render(void);
extern void w_force_composite(void), w_clear_dirty_bounds(void);
extern int32_t w_has_dirty_rect(void);
int main(void) {
    const int w = 512, h = 512;
    w_init(w, h); w_brush_dyn_init();
    w_brush_dyn_set_base(3, 3.5f);
    w_brush_dyn_set_base(4, 0.8f);
    w_brush_dyn_set_base(7, 100.0f);
    w_brush_dyn_reset_state(); w_render(); w_clear_dirty_bounds();
    uint32_t *snapshot = malloc((size_t)w * h * 4); assert(snapshot);
    int dirty = 0;
    for (int i = 0; i < 30; ++i) {
        w_brush_dyn_stroke_to(20.f + i * 12.f, 50.f + (i % 5) * 18.f, .8f, 0, 0, .016f, 1);
        dirty += w_has_dirty_rect();
        memcpy(snapshot, w_render(), (size_t)w * h * 4);
        w_force_composite();
        assert(memcmp(snapshot, w_render(), (size_t)w * h * 4) == 0);
        w_clear_dirty_bounds();
    }
    assert(dirty > 0); free(snapshot);
    puts("Dynamic brush incremental composite matches full composite.");
}
