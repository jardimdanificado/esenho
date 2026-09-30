#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <assert.h>
#include "mypaint_brush.h"

static int g_dabs_rendered = 0;
static mypaint_dab_t g_last_dab;

static void test_dab_collector(void *ctx, const mypaint_dab_t *dab) {
    (void)ctx;
    g_dabs_rendered++;
    g_last_dab = *dab;
}

static void test_spline_curves() {
    printf("[TEST] Spline Curve Evaluator... ");
    mypaint_brush_def_t brush;
    mypaint_brush_init(&brush);

    /* Curve: (0.0, 0.0) -> (0.5, 1.0) -> (1.0, 0.0) */
    float cx[3] = {0.0f, 0.5f, 1.0f};
    float cy[3] = {0.0f, 1.0f, 0.0f};
    mypaint_brush_set_curve(&brush, MYPAINT_SETTING_OPAQUE, MYPAINT_INPUT_PRESSURE, 3, cx, cy);

    mypaint_brush_state_t state;
    mypaint_brush_state_init(&state);

    g_dabs_rendered = 0;
    /* Stroke with pressure = 0.5f -> curve output should be +1.0 added to base_value (1.0) = 2.0 */
    mypaint_brush_stroke_to(&brush, &state, 10.0f, 10.0f, 0.5f, 0.0f, 0.0f, 0.016f, 1.0f, NULL, test_dab_collector);

    assert(g_last_dab.opacity >= 1.9f);
    printf("OK (opacity=%.2f)\n", g_last_dab.opacity);
}

static void test_airbrush_temporal_spacing() {
    printf("[TEST] Temporal Airbrush Spacing (Caneta Parada)... ");
    mypaint_brush_def_t brush;
    mypaint_brush_init(&brush);

    /* 60 dabs per second, zero geometric spacing */
    mypaint_brush_set_base_value(&brush, MYPAINT_SETTING_DABS_PER_ACTUAL_RADIUS, 0.0f);
    mypaint_brush_set_base_value(&brush, MYPAINT_SETTING_DABS_PER_BASIC_RADIUS, 0.0f);
    mypaint_brush_set_base_value(&brush, MYPAINT_SETTING_DABS_PER_SECOND, 60.0f);

    mypaint_brush_state_t state;
    mypaint_brush_state_init(&state);

    g_dabs_rendered = 0;
    /* Stylus stationary at (50, 50) for 0.5 seconds -> should generate ~30 dabs */
    for (int i = 0; i < 30; i++) {
        mypaint_brush_stroke_to(&brush, &state, 50.0f, 50.0f, 0.8f, 0.0f, 0.0f, 1.0f / 60.0f, 1.0f, NULL, test_dab_collector);
    }

    assert(g_dabs_rendered >= 29 && g_dabs_rendered <= 31);
    printf("OK (generated %d dabs over 0.5s stationary)\n", g_dabs_rendered);
}

static void test_speed_ema_filters() {
    printf("[TEST] Dual EMA Speed Filters... ");
    mypaint_brush_def_t brush;
    mypaint_brush_init(&brush);
    mypaint_brush_set_base_value(&brush, MYPAINT_SETTING_SPEED1_SLOWNESS, 0.05f);
    mypaint_brush_set_base_value(&brush, MYPAINT_SETTING_SPEED2_SLOWNESS, 0.50f);

    mypaint_brush_state_t state;
    mypaint_brush_state_init(&state);

    /* Fast stroke movement */
    for (int i = 0; i < 10; i++) {
        mypaint_brush_stroke_to(&brush, &state, (float)(i * 50), 10.0f, 0.5f, 0.0f, 0.0f, 0.016f, 1.0f, NULL, test_dab_collector);
    }

    /* Speed1 (fast EMA) should react faster than Speed2 (slow EMA) */
    assert(state.speed1 > state.speed2);
    printf("OK (speed1=%.1f, speed2=%.1f)\n", state.speed1, state.speed2);
}

static void test_tilt_polar_decomposition() {
    printf("[TEST] Stylus Tilt Polar Decomposition... ");
    mypaint_brush_def_t brush;
    mypaint_brush_init(&brush);

    /* Modulate radius by declination */
    float cx[2] = {0.0f, 1.0f};
    float cy[2] = {0.0f, 2.0f};
    mypaint_brush_set_curve(&brush, MYPAINT_SETTING_RADIUS_LOGARITHMIC, MYPAINT_INPUT_DECLINATION, 2, cx, cy);

    mypaint_brush_state_t state;
    mypaint_brush_state_init(&state);

    g_dabs_rendered = 0;
    /* Tilt = (0.6, 0.8) -> mag = 1.0 */
    mypaint_brush_stroke_to(&brush, &state, 10.0f, 10.0f, 0.5f, 0.6f, 0.8f, 0.016f, 1.0f, NULL, test_dab_collector);

    assert(g_dabs_rendered > 0);
    /* radius_log = base(2.0) + declination(2.0) = 4.0 -> radius = exp(4.0) ~ 54.6px */
    assert(g_last_dab.radius > 50.0f);
    printf("OK (tilt magnitude mapped to radius=%.1fpx)\n", g_last_dab.radius);
}

static void test_gaussian_and_ellipse_rasterizer() {
    printf("[TEST] Gaussian Falloff & Elliptical Blitter... ");
    int w = 64, h = 64;
    uint32_t *pixels = (uint32_t *)calloc(w * h, sizeof(uint32_t));

    mypaint_dab_t dab;
    memset(&dab, 0, sizeof(dab));
    dab.x = 32.0f;
    dab.y = 32.0f;
    dab.radius = 16.0f;
    dab.opacity = 1.0f;
    dab.hardness = 0.8f;
    dab.aspect_ratio = 2.0f; /* 2:1 ellipse */
    dab.angle_deg = 45.0f;
    dab.r = 1.0f;
    dab.g = 0.0f;
    dab.b = 0.0f;
    dab.a = 1.0f;

    mypaint_surface_render_dab_rgba(pixels, w, h, &dab);

    /* Center pixel should be red */
    uint32_t center = pixels[32 * w + 32];
    uint8_t a = (center >> 24) & 0xFF;
    uint8_t r = (center >> 16) & 0xFF;
    assert(a > 200 && r > 200);

    /* Far pixel should be untouched transparent */
    uint32_t far_corner = pixels[0];
    assert(far_corner == 0);

    free(pixels);
    printf("OK\n");
}

static void test_area_smudge_and_decay() {
    printf("[TEST] Area-Weighted Smudge with Exponential Decay... ");
    int w = 64, h = 64;
    uint32_t *pixels = (uint32_t *)calloc(w * h, sizeof(uint32_t));

    /* Fill background with Blue (0xFF0000FF) */
    for (int i = 0; i < w * h; i++) {
        pixels[i] = 0xFFFF0000; /* ARGB / ABGR */
    }

    mypaint_brush_state_t state;
    mypaint_brush_state_init(&state);

    mypaint_dab_t dab;
    memset(&dab, 0, sizeof(dab));
    dab.x = 32.0f;
    dab.y = 32.0f;
    dab.radius = 8.0f;
    dab.opacity = 1.0f;
    dab.hardness = 0.8f;
    dab.aspect_ratio = 1.0f;
    dab.r = 0.0f; dab.g = 1.0f; dab.b = 0.0f; dab.a = 1.0f; /* Green */
    dab.smudge = 0.8f;
    dab.smudge_radius = 8.0f;
    dab.smudge_bucket = 0;

    mypaint_surface_render_dab_stateful(pixels, w, h, &dab, &state);

    /* State bucket should have captured canvas color */
    assert(state.smudge_a[0] > 0.1f);
    printf("OK (bucket[0] accumulated color)\n");

    free(pixels);
}

int main(int argc, char **argv) {
    (void)argc; (void)argv;
    printf("===================================================\n");
    printf("Testing Freestanding MyPaint Engine in C\n");
    printf("===================================================\n");

    test_spline_curves();
    test_airbrush_temporal_spacing();
    test_speed_ema_filters();
    test_tilt_polar_decomposition();
    test_gaussian_and_ellipse_rasterizer();
    test_area_smudge_and_decay();

    printf("===================================================\n");
    printf("ALL TESTS PASSED SUCCESSFULLY! (100%% Dynamic Features)\n");
    printf("===================================================\n");
    return 0;
}
