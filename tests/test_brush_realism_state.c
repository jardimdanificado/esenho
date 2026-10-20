#include <assert.h>
#include <stdio.h>
#include "quadro_brush_realism.h"

int main(void) {
    realism_reset();
    realism_update(0, 0, .2f, 0, 12);
    assert(!realism_enabled && realism_sample.size == 1 && realism_sample.flow == 1);
    for (int curve = 25; curve <= 300; curve += 25) {
        assert(realism_pressure(0, curve) == 0);
        assert(realism_pressure(1, curve) == 1);
        assert(realism_pressure(.3f, curve) < realism_pressure(.7f, curve));
    }
    assert(realism_pressure(.5f, 25) > .5f && realism_pressure(.5f, 300) < .5f);

    realism_set(58, 100);
    realism_set(59, 100);
    realism_begin();
    realism_update(0, 0, 1, 0, 12);
    realism_update(1, 0, 0, 0, 12);
    float delayed_size = realism_sample.size;
    realism_set(59, 0);
    realism_update(2, 0, 0, 0, 12);
    assert(realism_sample.size < delayed_size);

    realism_set(72, 100);
    for (int i = 0; i < 5; i++) {
        realism_begin();
        realism_update(0, 0, 1, 0, 12);
        realism_update(1000, 0, 1, 0, 12);
    }
    assert(realism_state.wear > .25f);
    float wear = realism_state.wear;
    realism_begin();
    assert(realism_state.wear == wear);
    realism_set(72, 0);
    assert(realism_state.wear == 0);

    realism_reset();
    realism_set(67, 100);
    realism_set(68, 100);
    float low = 0, high = 0, wet = 0;
    for (int y = 0; y < 30; y++) for (int x = 0; x < 30; x++) {
        realism_sample.pressure = .1f;
        float a = realism_coverage(0, 0, 0, 0, x, y, 0);
        float b = realism_coverage(0, 0, 0, 0, x, y, 1);
        realism_sample.pressure = .9f;
        float c = realism_coverage(0, 0, 0, 0, x, y, 0);
        assert(b >= a && c >= a);
        low += a; wet += b; high += c;
    }
    assert(high > low && wet > low);

    realism_reset();
    realism_set(70, 3); realism_set(71, 100);
    realism_begin();
    assert(realism_coverage(0, 0, 0, 0, 0, 0, 0) < realism_coverage(0, .5f, 0, .5f, 0, 0, 0));
    realism_reset();
    realism_set(63, 100); realism_set(66, 100);
    realism_begin();
    float last = 1;
    for (int i = 0; i < 1000; i++) {
        realism_update(i*.1f, 0, 1, 0, 12);
        if (i) assert(realism_abs(realism_sample.size - last) < .01f);
        last = realism_sample.size;
    }
    realism_set(60, 9999); assert(realism_params[2] == 48);
    realism_set(73, -100); assert(realism_params[15] == 25);
    realism_reset(); assert(!realism_enabled && !realism_coverage_enabled);
    puts("Brush realism: pressure, recovery, persistent wear, paper contact, profiles, smooth noise and limits passed.");
}
