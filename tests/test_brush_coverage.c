#include <assert.h>
#include <stdio.h>
#include "quadro_brush_coverage.h"
int main(void) {
    // A procedural kernel may ignore source opacity or generate its own colors.
    // The host still controls its output, including transparent layers/erasing.
    uint32_t pigment = 0xff804020u;
    assert(w_brush_mix_coverage(0, pigment, 0) == 0);
    assert(w_brush_mix_coverage(0, pigment, 255) == pigment);
    uint32_t light = w_brush_mix_coverage(0, pigment, 64);
    assert((light >> 24) == 64 && (light & 0xffffff) == (pigment & 0xffffff));
    uint32_t opaque = w_brush_mix_coverage(0xff0000ff, 0xffff0000, 128);
    assert((opaque >> 24) == 255);
    assert((opaque & 255) == 127 && ((opaque >> 16) & 255) == 128);
    uint32_t erased = w_brush_mix_coverage(pigment, 0, 64);
    assert((erased >> 24) == 191 && (erased & 0xffffff) == (pigment & 0xffffff));
    // Repeated deposits accumulate; reduced flow accumulates less pigment.
    uint32_t dry=0, wet=0;
    for (int i=0; i<5; ++i) {
        dry=w_brush_mix_coverage(dry,pigment,32);
        wet=w_brush_mix_coverage(wet,pigment,128);
    }
    assert((dry >> 24) > 32 && (wet >> 24) > (dry >> 24));
    uint32_t before[3] = {0, pigment, 0xff102030};
    uint32_t after[3] = {pigment, 0, before[2]};
    w_brush_apply_coverage(after,before,3,64);
    assert(after[0] == light && after[1] == erased && after[2] == before[2]);
    puts("Procedural brush coverage: opacity, flow, hue, eraser and unchanged pixels passed.");
}
