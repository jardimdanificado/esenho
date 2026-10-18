/**
 * ============================================================================
 * Empirical Stress Test: Core C Engine Arbitrary Polygon Rasterization
 * Challenger 2 Verification for Milestone 2
 * Tests concave polygons, stars, mask export, and pixel clearing in src/quadro.c
 * ============================================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <math.h>
#include <assert.h>
#include <string.h>

// Declarations of exported functions from src/quadro.c
void w_init(uint32_t width, uint32_t height);
void w_select_lasso(const int32_t *points_xy, int32_t point_count, int32_t op_mode);
void w_select_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t op_mode);
void w_select_clear(void);
void w_select_all(int32_t op_mode);
int32_t w_select_get_info(int32_t *out_6words);
uint8_t *w_select_get_mask_ptr(void);
int32_t w_select_get_mask(uint8_t *out_mask, uint32_t max_bytes);
int32_t w_layer_get_active(void);
uint32_t *w_layer_get_pixels(int32_t layer_idx);
int32_t w_layer_get_width(int32_t layer_idx);
int32_t w_layer_get_height(int32_t layer_idx);

// Emulate JNI nativeClearSelectedPixels exactly as implemented in esenho_jni.c
static void emulate_nativeClearSelectedPixels(void) {
    int32_t info[6] = {0};
    if (w_select_get_info(info) && info[0]) {
        int active = w_layer_get_active();
        uint32_t *pix = w_layer_get_pixels(active);
        int lw = w_layer_get_width(active);
        int lh = w_layer_get_height(active);
        int cx = info[1], cy = info[2], cw = info[3], ch = info[4];
        int has_mask = info[5];
        uint8_t *mask = (has_mask) ? w_select_get_mask_ptr() : NULL;
        if (pix && lw > 0 && lh > 0 && cw > 0 && ch > 0) {
            for (int y = 0; y < ch; y++) {
                int py = cy + y;
                if (py < 0 || py >= lh) continue;
                for (int x = 0; x < cw; x++) {
                    int px = cx + x;
                    if (px < 0 || px >= lw) continue;
                    if (has_mask && mask) {
                        if (mask[y * cw + x] == 0) continue;
                    }
                    pix[py * lw + px] = 0;
                }
            }
        }
    }
}

static int g_passed = 0;
static int g_failed = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (!(cond)) { \
        printf("  ✖ FAIL: %s (line %d)\n", msg, __LINE__); \
        g_failed++; \
        return; \
    } \
} while(0)

static void test_concave_l_shape(void) {
    printf("[C-Stress 1] Concave L-Shape Polygon... ");
    w_init(200, 200);

    // L-shaped polygon vertices:
    // (20,20) -> (40,20) -> (40,60) -> (80,60) -> (80,80) -> (20,80)
    int32_t pts[] = {
        20, 20,
        40, 20,
        40, 60,
        80, 60,
        80, 80,
        20, 80
    };
    int count = 6;

    w_select_lasso(pts, count, 0 /* W_SEL_REPLACE */);

    int32_t info[6] = {0};
    int res = w_select_get_info(info);
    printf(" [info: act=%d, x=%d, y=%d, w=%d, h=%d, mask=%d] ", info[0], info[1], info[2], info[3], info[4], info[5]);
    TEST_ASSERT(res == 1, "w_select_get_info returned 0");
    TEST_ASSERT(info[0] == 1, "Selection not active");
    TEST_ASSERT(info[1] == 20, "clip_x mismatch");
    TEST_ASSERT(info[2] == 20, "clip_y mismatch");
    TEST_ASSERT(info[3] == 60, "clip_w mismatch");
    TEST_ASSERT(info[4] == 60, "clip_h mismatch");
    TEST_ASSERT(info[5] == 1, "clip_has_mask must be 1 for lasso");

    // Inspect mask in reflex corner: point (60, 30) is inside bounding box [20..80, 20..80]
    // but in the empty reflex bay of the L!
    int rel_x = 60 - info[1]; // 40
    int rel_y = 30 - info[2]; // 10
    uint8_t *mask = w_select_get_mask_ptr();
    TEST_ASSERT(mask != NULL, "mask pointer is NULL");
    TEST_ASSERT(mask[rel_y * info[3] + rel_x] == 0, "Reflex indentation (60,30) must have mask=0");

    // Test point inside vertical stem: (30, 40)
    int stem_rx = 30 - info[1];
    int stem_ry = 40 - info[2];
    TEST_ASSERT(mask[stem_ry * info[3] + stem_rx] == 1, "Vertical stem (30,40) must have mask=1");

    // Test point inside horizontal foot: (60, 70)
    int foot_rx = 60 - info[1];
    int foot_ry = 70 - info[2];
    TEST_ASSERT(mask[foot_ry * info[3] + foot_rx] == 1, "Horizontal foot (60,70) must have mask=1");

    // Fill active layer with 0xFFAABBCC
    uint32_t *pix = w_layer_get_pixels(w_layer_get_active());
    for (int i = 0; i < 200 * 200; i++) pix[i] = 0xFFAABBCC;

    // Emulate nativeClearSelectedPixels
    emulate_nativeClearSelectedPixels();

    // Verify:
    // (60, 30) in reflex bay MUST NOT be cleared!
    TEST_ASSERT(pix[30 * 200 + 60] == 0xFFAABBCC, "Reflex bay pixel (60,30) was erroneously erased!");
    // (30, 40) in vertical stem MUST be cleared!
    TEST_ASSERT(pix[40 * 200 + 30] == 0, "Stem pixel (30,40) was not erased!");
    // (60, 70) in foot MUST be cleared!
    TEST_ASSERT(pix[70 * 200 + 60] == 0, "Foot pixel (60,70) was not erased!");

    printf("PASS\n");
    g_passed++;
}

static void test_star_5point(void) {
    printf("[C-Stress 2] 5-Pointed Star Polygon... ");
    w_init(300, 300);

    // Center (150, 150), outer radius 60, inner radius 25
    int32_t pts[20];
    for (int i = 0; i < 10; i++) {
        double angle = (i * M_PI) / 5.0 - M_PI / 2.0;
        double r = (i % 2 == 0) ? 60.0 : 25.0;
        pts[i * 2 + 0] = (int32_t)round(150.0 + r * cos(angle));
        pts[i * 2 + 1] = (int32_t)round(150.0 + r * sin(angle));
    }

    w_select_lasso(pts, 10, 0 /* W_SEL_REPLACE */);

    int32_t info[6] = {0};
    w_select_get_info(info);
    printf(" [info: act=%d, x=%d, y=%d, w=%d, h=%d, mask=%d] ", info[0], info[1], info[2], info[3], info[4], info[5]);
    TEST_ASSERT(info[0] == 1, "Selection not active");
    TEST_ASSERT(info[5] == 1, "clip_has_mask must be 1");

    uint8_t *mask = w_select_get_mask_ptr();
    TEST_ASSERT(mask != NULL, "Mask pointer NULL");

    // Center (150, 150) must be inside star (mask = 1)
    int cx_rel = 150 - info[1];
    int cy_rel = 150 - info[2];
    TEST_ASSERT(mask[cy_rel * info[3] + cx_rel] == 1, "Star center (150,150) must have mask=1");

    // Top tip: (150, 91) must be inside star
    int top_rel_x = 150 - info[1];
    int top_rel_y = 91 - info[2];
    TEST_ASSERT(mask[top_rel_y * info[3] + top_rel_x] == 1, "Star top tip (150,91) must have mask=1");

    // Point in the upper-right bay between top tip and right tip:
    // e.g. (170, 110)
    int bay_x = 170, bay_y = 110;
    int bay_rel_x = bay_x - info[1];
    int bay_rel_y = bay_y - info[2];
    TEST_ASSERT(mask[bay_rel_y * info[3] + bay_rel_x] == 0, "Star bay (170,110) must have mask=0");

    // Fill layer with marker color
    uint32_t *pix = w_layer_get_pixels(w_layer_get_active());
    for (int i = 0; i < 300 * 300; i++) pix[i] = 0xFF556677;

    emulate_nativeClearSelectedPixels();

    // Star center must be 0
    TEST_ASSERT(pix[150 * 300 + 150] == 0, "Star center was not cleared!");
    // Star bay must preserve color
    TEST_ASSERT(pix[bay_y * 300 + bay_x] == 0xFF556677, "Star bay pixel was erroneously cleared!");

    printf("PASS\n");
    g_passed++;
}

static void test_star_8point_acute(void) {
    printf("[C-Stress 3] 8-Pointed High-Frequency Acute Star... ");
    w_init(400, 400);

    // Center (200, 200), outer radius 80, inner radius 15 (very sharp acute teeth)
    int32_t pts[32];
    for (int i = 0; i < 16; i++) {
        double angle = (i * M_PI) / 8.0;
        double r = (i % 2 == 0) ? 80.0 : 15.0;
        pts[i * 2 + 0] = (int32_t)round(200.0 + r * cos(angle));
        pts[i * 2 + 1] = (int32_t)round(200.0 + r * sin(angle));
    }

    w_select_lasso(pts, 16, 0);

    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1 && info[5] == 1, "8-point star selection failed");

    // Verify mask export function w_select_get_mask
    uint32_t mask_size = (uint32_t)(info[3] * info[4]);
    uint8_t *copy_buf = (uint8_t*)malloc(mask_size);
    int32_t copied = w_select_get_mask(copy_buf, mask_size);
    TEST_ASSERT(copied == (int32_t)mask_size, "w_select_get_mask copied bytes mismatch");

    // Check byte-for-byte identity between pointer and exported copy
    uint8_t *direct_ptr = w_select_get_mask_ptr();
    TEST_ASSERT(memcmp(copy_buf, direct_ptr, mask_size) == 0, "Exported mask does not match direct pointer");

    free(copy_buf);
    printf("PASS\n");
    g_passed++;
}

static void test_collinear_scanline_singularity(void) {
    printf("[C-Stress 4] Collinear Scanline & Vertex-Crossing Singularity... ");
    w_init(200, 200);

    // Polygon where multiple vertices lie on the exact same horizontal scanline (y = 50)
    int32_t pts[] = {
        20, 50,
        50, 50,
        80, 50,
        100, 100,
        20, 100
    };
    w_select_lasso(pts, 5, 0);

    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1, "Collinear polygon failed to select");
    TEST_ASSERT(info[5] == 1, "Mask flag missing");

    printf("PASS\n");
    g_passed++;
}

static void test_clamping_out_of_bounds(void) {
    printf("[C-Stress 5] Out-of-bounds Polygon Clipping & Memory Safety... ");
    w_init(100, 100);

    // Vertices far outside canvas bounds: negative coordinates and coordinates > 100
    int32_t pts[] = {
        -50, -50,
        150, -50,
        150, 150,
        -50, 150
    };
    w_select_lasso(pts, 4, 0);

    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1, "OOB polygon failed to select");
    TEST_ASSERT(info[1] >= 0, "x0 must be >= 0");
    TEST_ASSERT(info[2] >= 0, "y0 must be >= 0");
    TEST_ASSERT(info[1] + info[3] <= 100, "x1 must be <= 100");
    TEST_ASSERT(info[2] + info[4] <= 100, "y1 must be <= 100");

    printf("PASS\n");
    g_passed++;
}

static void test_rect_has_no_mask(void) {
    printf("[C-Stress 6] Rectangular vs Masked Selection Flags... ");
    w_init(200, 200);

    // 1. Rectangular selection
    w_select_rect(10, 10, 40, 40, 0);
    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1, "Rect selection not active");
    TEST_ASSERT(info[5] == 0, "Rectangular selection must have clip_has_mask = 0");

    // 2. Clear
    w_select_clear();
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 0, "Clear selection did not deactivate");
    TEST_ASSERT(info[5] == 0, "Clear selection must have has_mask = 0");

    printf("PASS\n");
    g_passed++;
}

int main(void) {
    printf("==================================================================\n");
    printf("   Empirical C Core Stress Harness: Arbitrary Polygons (M2)       \n");
    printf("==================================================================\n");

    test_concave_l_shape();
    test_star_5point();
    test_star_8point_acute();
    test_collinear_scanline_singularity();
    test_clamping_out_of_bounds();
    test_rect_has_no_mask();

    printf("==================================================================\n");
    printf("Summary: %d Passed, %d Failed\n", g_passed, g_failed);
    printf("==================================================================\n");

    return (g_failed == 0) ? 0 : 1;
}
