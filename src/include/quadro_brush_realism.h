#ifndef QUADRO_BRUSH_REALISM_H
#define QUADRO_BRUSH_REALISM_H

#include <stdint.h>

/* Shared by classic and continuous brushes. Defaults are opt-in and preserve
 * existing strokes. Distances are measured between dabs, not input events. */
#define W_REALISM_FIRST 58
#define W_REALISM_LAST 77
static int realism_params[20] = {
    0, 0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0, 100, 100, 100, 100, 0
};
static int realism_enabled = 0;
static int realism_coverage_enabled = 0;
static float realism_dab_radius = 1;
static float realism_base_moisture = 0;
static float realism_bristle_shift[48], realism_bristle_ink[48];
typedef struct {
    float last_x, last_y, distance, contact, bend_x, bend_y, wear;
    float tangent_x, tangent_y;
    uint32_t seed;
    int started;
} w_realism_state_t;
static w_realism_state_t realism_state = {0};
typedef struct {
    float size, aspect, flow, pigment, opacity, pressure, offset_x, offset_y;
} w_realism_sample_t;
static w_realism_sample_t realism_sample = {1, 1, 1, 1, 1, 1, 0, 0};

static inline float realism_clamp(float v, float lo, float hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
static inline float realism_abs(float v) { return v < 0 ? -v : v; }
static inline float realism_smooth(float v) {
    v = realism_clamp(v, 0, 1);
    return v * v * (3 - 2 * v);
}
static inline uint32_t realism_hash(uint32_t n) {
    n ^= n >> 16; n *= 0x7feb352dU; n ^= n >> 15;
    n *= 0x846ca68bU; return n ^ (n >> 16);
}
static inline float realism_random(int x, int y, uint32_t seed) {
    return (realism_hash((uint32_t)x * 0x9e3779b9U ^ (uint32_t)y * 0x85ebca6bU ^ seed) & 65535) / 65535.0f;
}
static inline float realism_noise(float x, float y, uint32_t seed) {
    int ix = (int)__builtin_floorf(x), iy = (int)__builtin_floorf(y);
    float sx = realism_smooth(x - ix), sy = realism_smooth(y - iy);
    float a = realism_random(ix, iy, seed), b = realism_random(ix + 1, iy, seed);
    float c = realism_random(ix, iy + 1, seed), d = realism_random(ix + 1, iy + 1, seed);
    return (a + (b-a)*sx)*(1-sy) + (c + (d-c)*sx)*sy;
}
/* Rational pressure response: 100 = linear, lower = softer, higher = firmer. */
static inline float realism_pressure(float p, int curve) {
    p = realism_clamp(p, 0, 1);
    return p / (p + (1-p) * (curve * .01f));
}
static inline void realism_begin(void) {
    float wear = realism_state.wear;
    uint32_t seed = realism_hash(realism_state.seed + 0x9e3779b9U);
    realism_state = (w_realism_state_t){0};
    realism_state.wear = wear;
    realism_state.seed = seed;
    realism_state.tangent_x = 1;
    realism_sample = (w_realism_sample_t){1, 1, 1, 1, 1, 1, 0, 0};
}
static inline void realism_reset(void) {
    for (int i = 0; i < 20; i++) realism_params[i] = 0;
    realism_params[8] = 40;
    for (int i = 15; i <= 18; i++) realism_params[i] = 100;
    realism_enabled = realism_coverage_enabled = 0;
    realism_base_moisture = 0;
    realism_state = (w_realism_state_t){0};
    realism_begin();
}
static inline int realism_set(int id, int value) {
    if (id < W_REALISM_FIRST || id > W_REALISM_LAST) return 0;
    int i = id - W_REALISM_FIRST;
    int lo = i == 8 ? 1 : i >= 15 && i <= 18 ? 25 : 0;
    int hi = i == 2 ? 48 : i == 8 ? 200 : i == 12 ? 4 : i >= 15 && i <= 18 ? 300 : i == 19 ? 1 : 100;
    realism_params[i] = value < lo ? lo : value > hi ? hi : value;
    if (i == 14 && value == 0) realism_state.wear = 0;
    realism_enabled = 0;
    for (int j = 0; j < 20; j++) {
        if (j == 8) continue;
        int def = j >= 15 && j <= 18 ? 100 : 0;
        if (realism_params[j] != def) realism_enabled = 1;
    }
    realism_coverage_enabled = realism_params[2] > 0 || realism_params[9] > 0 ||
        (realism_params[12] > 0 && realism_params[13] > 0);
    return 1;
}
static inline void realism_update(float x, float y, float pressure, float tilt, float radius) {
    realism_sample = (w_realism_sample_t){1, 1, 1, 1, 1, 1, 0, 0};
    if (!realism_enabled) return;
    w_realism_state_t *s = &realism_state;
    float dx = s->started ? x - s->last_x : 0, dy = s->started ? y - s->last_y : 0;
    float distance = __builtin_sqrtf(dx*dx + dy*dy);
    float p = realism_clamp(pressure, 0, 1);
    float target = realism_pressure(p, realism_params[18]);
    if (!s->started) s->contact = target;
    float travel = distance > .25f ? distance : .25f;
    float lag = realism_params[1] * .15f + realism_params[11] * .04f;
    float response = travel / (travel + lag);
    s->contact += (target - s->contact) * response;
    if (distance > .001f) {
        s->tangent_x = dx/distance; s->tangent_y = dy/distance;
    }
    s->bend_x += (s->tangent_x * s->contact - s->bend_x) * response;
    s->bend_y += (s->tangent_y * s->contact - s->bend_y) * response;
    s->distance += distance;
    s->last_x = x; s->last_y = y; s->started = 1;
    float flex = realism_params[0] * .01f;
    float friction = realism_params[11] * .01f;
    float deform = flex * (s->contact + realism_clamp(tilt, 0, 1)*.25f);
    s->wear = realism_clamp(s->wear + distance * realism_params[14] /
        (100.0f * (radius > 1 ? radius : 1) * 1200.0f), 0, 1);
    float wear = realism_params[14] > 0 ? s->wear : 0;
    realism_sample.size = (1 + .35f*deform) * (1 + .3f*wear);
    realism_sample.aspect = 1 / (1 + .8f*deform + .6f*wear);
    realism_sample.offset_x = -s->bend_x * radius * (friction*.2f + flex*.12f);
    realism_sample.offset_y = -s->bend_y * radius * (friction*.2f + flex*.12f);
    realism_sample.flow = 1 - friction * .25f * (1 - s->contact);
    realism_sample.pressure = p;
    float t = s->distance / realism_params[8];
    realism_sample.size *= 1 + (realism_noise(t, 0, s->seed) * 2 - 1) * realism_params[5] * .004f;
    realism_sample.flow *= 1 - realism_noise(t, 3, s->seed) * realism_params[6] * .008f;
    realism_sample.pigment = 1 - realism_noise(t, 7, s->seed) * realism_params[7] * .008f;
    if (realism_params[19]) realism_sample.opacity = realism_pressure(p, realism_params[17]);
    float irregular = realism_params[4] * .01f;
    for (int i = 0; i < realism_params[2]; i++) {
        realism_bristle_shift[i] = (realism_random(i, 0, s->seed)*2-1)*.3f*irregular +
            (realism_noise(s->distance*.025f, (float)i, s->seed)*2-1)*.15f*irregular;
        realism_bristle_ink[i] = 1 - irregular*.5f*realism_random(i, 2, s->seed);
    }
}

/* Coverage follows the tip and its bristles; paper relief is sampled in canvas
 * coordinates and yields to pressure/moisture instead of masking the stroke. */
static inline float realism_coverage(float u, float v, float dx, float dy, float x, float y, float moisture) {
    if (!realism_coverage_enabled) return 1;
    float coverage = 1;
    float across = -dx * realism_state.tangent_y + dy * realism_state.tangent_x;
    if (realism_params[2] > 0) {
        float count = (float)realism_params[2];
        float lane = (across + 1) * count * .5f;
        int index = (int)__builtin_floorf(lane);
        float irregular = realism_params[4] * .01f;
        float spacing = realism_params[3] * .01f;
        float width = .48f - .32f*spacing;
        float footprint = count / (2 * (realism_dab_radius > 1 ? realism_dab_radius : 1));
        float feather = footprint > .15f ? footprint : .15f;
        float best = 0;
        for (int i = index-1; i <= index+1; i++) {
            if (i < 0 || i >= realism_params[2]) continue;
            float d = realism_abs(lane - (i + .5f + realism_bristle_shift[i]));
            float strand = realism_smooth((width - d) / feather + .5f);
            strand *= realism_bristle_ink[i];
            if (strand > best) best = strand;
        }
        // Blend subpixel strands to their mean density to avoid moire and dots.
        float blur = realism_clamp((footprint - .5f) / .7f, 0, 1);
        float density = realism_clamp(2*width, 0, 1) * (1 - irregular*.25f);
        best = best*(1-blur) + density*blur;
        coverage *= .08f + .92f*best;
    }
    if (realism_params[9] > 0) {
        float height = realism_noise(x*.55f, y*.55f, 0x12345678U)*.7f +
            realism_noise(x*.17f, y*.17f, 0xabcdef01U)*.3f;
        float depth = realism_params[10] * .01f;
        float reach = .12f + realism_sample.pressure * .88f + realism_clamp(moisture, 0, 1)*.5f;
        float contact = realism_smooth((reach - height*(.3f + depth)) * 2.5f + .1f);
        float strength = realism_params[9] * .01f;
        coverage *= 1 - strength + strength*contact;
    }
    if (realism_params[12] && realism_params[13]) {
        float radial = realism_clamp(u*u + v*v, 0, 1), profile = 1;
        switch (realism_params[12]) {
            case 1: profile = 1 - .85f*radial; break;
            case 2: profile = .12f + .88f*radial; break;
            case 3: profile = .05f + .95f*realism_smooth(realism_abs(across)*4); break;
            case 4: profile = .15f + .85f*realism_noise(u*3 + realism_state.distance*.01f, v*3, realism_state.seed); break;
        }
        float strength = realism_params[13] * .01f;
        coverage *= 1 - strength + strength*profile;
    }
    return realism_clamp(coverage, 0, 1);
}
#endif
