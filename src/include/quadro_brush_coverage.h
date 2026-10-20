#ifndef QUADRO_BRUSH_COVERAGE_H
#define QUADRO_BRUSH_COVERAGE_H
#include <stdint.h>
#include <stddef.h>

/* Interpolate a kernel's before/after result in premultiplied space, then
   return straight RGBA. This also covers kernels that synthesize their own
   colors or write pixels directly, and works for erasing and paint pickup. */
static inline uint32_t w_brush_mix_coverage(uint32_t before, uint32_t after, uint32_t coverage) {
    if (coverage >= 255 || before == after) return after;
    if (!coverage) return before;
    uint32_t inv = 255 - coverage;
    uint32_t ba = (before >> 24) * inv, aa = (after >> 24) * coverage;
    uint32_t total = ba + aa;
    if (!total) return 0;
    uint32_t alpha = (total + 127) / 255;
    if (!alpha) return 0;
    uint32_t result = alpha << 24;
    for (int shift = 0; shift < 24; shift += 8) {
        uint32_t channel = (((before >> shift) & 255) * ba + ((after >> shift) & 255) * aa + total / 2) / total;
        result |= channel << shift;
    }
    return result;
}
static inline void w_brush_apply_coverage(uint32_t *pixels, const uint32_t *before, size_t count, uint32_t coverage) {
    for (size_t i = 0; i < count; ++i) {
        if (pixels[i] != before[i]) pixels[i] = w_brush_mix_coverage(before[i], pixels[i], coverage);
    }
}
#endif
