#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <assert.h>
#include "quadro_brush_dynamics.h"

static int g_dabs_rendered = 0;
static w_dyn_dab_t g_last_dab;

static void test_dab_collector(void *ctx, const w_dyn_dab_t *dab) {
    (void)ctx;
    g_dabs_rendered++;
    g_last_dab = *dab;
}

static void test_spline_curves() {
    printf("[TEST] Spline Curve Evaluator... ");
    w_dyn_brush_def_t brush;
    w_dyn_brush_init(&brush);

    /* Curve: (0.0, 0.0) -> (0.5, 1.0) -> (1.0, 0.0) */
    float cx[3] = {0.0f, 0.5f, 1.0f};
    float cy[3] = {0.0f, 1.0f, 0.0f};
    w_dyn_brush_set_curve(&brush, W_DYN_SETTING_OPAQUE, W_DYN_INPUT_PRESSURE, 3, cx, cy);

    w_dyn_brush_state_t state;
    w_dyn_brush_state_init(&state);

    g_dabs_rendered = 0;
    /* Stroke with pressure = 0.5f -> curve output should be +1.0 added to base_value (1.0) = 2.0 */
    w_dyn_brush_stroke_to(&brush, &state, 10.0f, 10.0f, 0.5f, 0.0f, 0.0f, 0.016f, 1.0f, NULL, test_dab_collector);

    assert(g_last_dab.opacity >= 1.9f);
    printf("OK (opacity=%.2f)\n", g_last_dab.opacity);
}

static void test_airbrush_temporal_spacing() {
    printf("[TEST] Temporal Airbrush Spacing (Stationary Stylus)... ");
    w_dyn_brush_def_t brush;
    w_dyn_brush_init(&brush);

    /* 60 dabs per second, zero geometric spacing */
    w_dyn_brush_set_base(&brush, W_DYN_SETTING_DABS_PER_ACTUAL_RADIUS, 0.0f);
    w_dyn_brush_set_base(&brush, W_DYN_SETTING_DABS_PER_BASIC_RADIUS, 0.0f);
    w_dyn_brush_set_base(&brush, W_DYN_SETTING_DABS_PER_SECOND, 60.0f);

    w_dyn_brush_state_t state;
    w_dyn_brush_state_init(&state);

    g_dabs_rendered = 0;
    /* Stylus stationary at (50, 50) for 0.5 seconds -> should generate ~30 dabs */
    for (int i = 0; i < 30; i++) {
        w_dyn_brush_stroke_to(&brush, &state, 50.0f, 50.0f, 0.8f, 0.0f, 0.0f, 1.0f / 60.0f, 1.0f, NULL, test_dab_collector);
    }

    assert(g_dabs_rendered >= 29 && g_dabs_rendered <= 31);
    printf("OK (generated %d dabs over 0.5s stationary)\n", g_dabs_rendered);
}

static void test_speed_ema_filters() {
    printf("[TEST] Dual EMA Speed Filters... ");
    w_dyn_brush_def_t brush;
    w_dyn_brush_init(&brush);
    w_dyn_brush_set_base(&brush, W_DYN_SETTING_SPEED_FINE_SLOWNESS, 0.05f);
    w_dyn_brush_set_base(&brush, W_DYN_SETTING_SPEED_COARSE_SLOWNESS, 0.50f);

    w_dyn_brush_state_t state;
    w_dyn_brush_state_init(&state);

    /* Fast stroke movement */
    for (int i = 0; i < 10; i++) {
        w_dyn_brush_stroke_to(&brush, &state, (float)(i * 50), 10.0f, 0.5f, 0.0f, 0.0f, 0.016f, 1.0f, NULL, test_dab_collector);
    }

    assert(state.speed_fine > state.speed_coarse);
    printf("OK (speed_fine=%.1f, speed_coarse=%.1f)\n", state.speed_fine, state.speed_coarse);
}

static void test_tilt_polar_decomposition() {
    printf("[TEST] Stylus Tilt Polar Decomposition... ");
    w_dyn_brush_def_t brush;
    w_dyn_brush_init(&brush);

    /* Modulate radius by declination */
    float cx[2] = {0.0f, 1.0f};
    float cy[2] = {0.0f, 2.0f};
    w_dyn_brush_set_curve(&brush, W_DYN_SETTING_RADIUS_LOG, W_DYN_INPUT_DECLINATION, 2, cx, cy);

    w_dyn_brush_state_t state;
    w_dyn_brush_state_init(&state);

    g_dabs_rendered = 0;
    w_dyn_brush_stroke_to(&brush, &state, 10.0f, 10.0f, 0.5f, 0.6f, 0.8f, 0.016f, 1.0f, NULL, test_dab_collector);

    assert(g_dabs_rendered > 0);
    assert(g_last_dab.radius > 50.0f);
    printf("OK (tilt magnitude mapped to radius=%.1fpx)\n", g_last_dab.radius);
}

static void test_gaussian_and_ellipse_rasterizer() {
    printf("[TEST] Gaussian Falloff & Elliptical Blitter... ");
    int w = 64, h = 64;
    uint32_t *pixels = (uint32_t *)calloc(w * h, sizeof(uint32_t));

    w_dyn_dab_t dab;
    memset(&dab, 0, sizeof(dab));
    dab.x = 32.0f;
    dab.y = 32.0f;
    dab.radius = 16.0f;
    dab.opacity = 1.0f;
    dab.hardness = 0.8f;
    dab.aspect_ratio = 2.0f;
    dab.angle_deg = 45.0f;
    dab.r = 1.0f;
    dab.g = 0.0f;
    dab.b = 0.0f;
    dab.a = 1.0f;

    w_dyn_surface_render_dab(pixels, w, h, &dab);

    uint32_t center = pixels[32 * w + 32];
    uint8_t a = (center >> 24) & 0xFF;
    uint8_t r = (center >> 16) & 0xFF;
    assert(a > 200 && r > 200);

    uint32_t far_corner = pixels[0];
    assert(far_corner == 0);

    free(pixels);
    printf("OK\n");
}

static void test_area_smudge_and_decay() {
    printf("[TEST] Area-Weighted Smudge with Exponential Decay... ");
    int w = 64, h = 64;
    uint32_t *pixels = (uint32_t *)calloc(w * h, sizeof(uint32_t));

    for (int i = 0; i < w * h; i++) {
        pixels[i] = 0xFFFF0000;
    }

    w_dyn_brush_state_t state;
    w_dyn_brush_state_init(&state);

    w_dyn_dab_t dab;
    memset(&dab, 0, sizeof(dab));
    dab.x = 32.0f;
    dab.y = 32.0f;
    dab.radius = 8.0f;
    dab.opacity = 1.0f;
    dab.hardness = 0.8f;
    dab.aspect_ratio = 1.0f;
    dab.r = 0.0f; dab.g = 1.0f; dab.b = 0.0f; dab.a = 1.0f;
    dab.smudge = 0.8f;
    dab.smudge_radius = 8.0f;
    dab.smudge_bucket = 0;

    w_dyn_surface_render_dab_stateful(pixels, w, h, &dab, &state);

    assert(state.smudge_a[0] > 0.1f);
    printf("OK (bucket[0] accumulated color)\n");

    free(pixels);
}

int main(int argc, char **argv) {
    (void)argc; (void)argv;
    printf("===================================================\n");
    printf("Testing Universal Continuous Brush Dynamics in C\n");
    printf("===================================================\n");

    test_spline_curves();
    test_airbrush_temporal_spacing();
    test_speed_ema_filters();
    test_tilt_polar_decomposition();
    test_gaussian_and_ellipse_rasterizer();
    test_area_smudge_and_decay();

    printf("===================================================\n");
    printf("ALL NATIVE BRUSH DYNAMICS TESTS PASSED (100%% OK)\n");
    printf("===================================================\n");
    return 0;
}
