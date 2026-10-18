/**
 * ============================================================================
 * tests/stress_milestone2_empirical.c
 * Empirical Stress Test Harness for Milestone 2 (Exact Selection Marching Ants)
 * Challenger 1 Verification
 * ============================================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stdint.h>
#include <math.h>

/* Declarations from quadro.h / src/quadro.c */
extern void w_init(uint32_t width, uint32_t height);
extern void w_select_clear(void);
extern void w_select_rect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t op_mode);
extern void w_select_all(int32_t op_mode);
extern void w_select_lasso(const int32_t *points_xy, int32_t point_count, int32_t op_mode);
extern void w_select_invert(void);
extern void w_select_feather(int32_t radius);
extern int32_t w_select_get_info(int32_t *out_6words);
extern int32_t w_select_get_mask_info(int32_t *out_6words);
extern uint8_t *w_select_get_mask_ptr(void);
extern int32_t w_select_get_mask(uint8_t *out_mask, uint32_t max_bytes);
extern uint8_t *w_get_clip_mask_buffer(uint32_t size);

extern int32_t w_layer_get_active(void);
extern uint32_t *w_layer_get_pixels(int32_t layer_idx);
extern int32_t w_layer_get_width(int32_t layer_idx);
extern int32_t w_layer_get_height(int32_t layer_idx);
extern void w_layer_fill(int32_t layer_idx, uint32_t argb);

#define W_SEL_REPLACE   0
#define W_SEL_ADD       1
#define W_SEL_SUB       2
#define W_SEL_INTERSECT 3

static int g_pass = 0;
static int g_fail = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (!(cond)) { \
        printf("  [FAIL] Line %d: %s\n", __LINE__, msg); \
        g_fail++; \
        return; \
    } \
} while(0)

#define RUN_TEST(fn) do { \
    printf("Running %s...\n", #fn); \
    int prev_fail = g_fail; \
    fn(); \
    if (g_fail == prev_fail) { \
        printf("  [PASS] %s\n", #fn); \
        g_pass++; \
    } \
} while(0)

/* Exact simulation of nativeClearSelectedPixels in esenho_jni.c */
static void simulate_nativeClearSelectedPixels(void) {
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

/* =========================================================================
 * Test 1: JNI Selection Mask Info & Buffer Functions
 * ========================================================================= */
static void test_selection_info_and_mask_export(void) {
    w_init(200, 200);
    w_select_clear();

    /* 1.1 Clear selection info */
    int32_t info[6] = {-1, -1, -1, -1, -1, -1};
    int res = w_select_get_info(info);
    TEST_ASSERT(res == 1, "w_select_get_info must return 1");
    TEST_ASSERT(info[0] == 0, "clip_active must be 0 after clear");
    TEST_ASSERT(info[5] == 0, "clip_has_mask must be 0 after clear");

    /* 1.2 Rectangular selection info: has_mask must be 0 */
    w_select_rect(20, 30, 40, 50, W_SEL_REPLACE);
    res = w_select_get_info(info);
    TEST_ASSERT(res == 1, "w_select_get_info must return 1");
    TEST_ASSERT(info[0] == 1, "clip_active must be 1");
    TEST_ASSERT(info[1] == 20 && info[2] == 30, "clip_x and clip_y match");
    TEST_ASSERT(info[3] == 40 && info[4] == 50, "clip_w and clip_h match");
    TEST_ASSERT(info[5] == 0, "Rectangular selection must have clip_has_mask == 0");

    /* 1.3 w_select_get_mask on rectangular selection must safely return 0 */
    uint8_t small_buf[100];
    int32_t copied = w_select_get_mask(small_buf, sizeof(small_buf));
    TEST_ASSERT(copied == 0, "w_select_get_mask should return 0 when no mask exists");

    /* 1.4 Lasso selection info: has_mask must be 1 */
    int32_t tri_pts[] = {10, 10, 50, 10, 10, 50};
    w_select_lasso(tri_pts, 3, W_SEL_REPLACE);
    res = w_select_get_info(info);
    TEST_ASSERT(res == 1, "w_select_get_info must return 1");
    TEST_ASSERT(info[0] == 1, "clip_active must be 1 for lasso");
    TEST_ASSERT(info[5] == 1, "Lasso selection must have clip_has_mask == 1");

    /* 1.5 w_select_get_mask_ptr must return valid non-null pointer */
    uint8_t *mask_ptr = w_select_get_mask_ptr();
    TEST_ASSERT(mask_ptr != NULL, "w_select_get_mask_ptr must be non-null");

    /* 1.6 w_select_get_mask buffer copying and boundary clamping */
    uint32_t mask_size = info[3] * info[4];
    uint8_t *full_mask = (uint8_t*)malloc(mask_size + 64);
    memset(full_mask, 0xEE, mask_size + 64);

    /* Truncated copy (e.g. buffer only 10 bytes) */
    copied = w_select_get_mask(full_mask, 10);
    TEST_ASSERT(copied == 10, "Truncated copy must return exact requested byte count 10");
    TEST_ASSERT(full_mask[10] == 0xEE, "Truncated copy must not write past requested size");

    /* Full copy */
    copied = w_select_get_mask(full_mask, mask_size + 64);
    TEST_ASSERT(copied == (int32_t)mask_size, "Full copy must return exact mask size");
    TEST_ASSERT(memcmp(full_mask, mask_ptr, mask_size) == 0, "Mask buffer must match ptr bit-for-bit");
    free(full_mask);

    /* 1.7 NULL buffer handling */
    copied = w_select_get_mask(NULL, 100);
    TEST_ASSERT(copied == 0, "NULL buffer must return 0 without crashing");
}

/* =========================================================================
 * Test 2: Lasso Mask Boundary & Acute Angle Clearing (Triangle)
 * ========================================================================= */
static void test_lasso_triangle_clearing(void) {
    w_init(200, 200);
    int active = w_layer_get_active();
    uint32_t *pix = w_layer_get_pixels(active);
    int lw = w_layer_get_width(active);

    /* Fill layer with opaque red (0xFFFF0000) */
    for (int i = 0; i < 200 * 200; i++) pix[i] = 0xFFFF0000;

    /* Right triangle from (20, 20) to (100, 20) to (20, 100)
     * Hypotenuse runs from (100, 20) to (20, 100).
     * Area inside: x + y <= 120.
     * Area outside but inside bounding box: x + y > 120.
     */
    int32_t pts[] = {20, 20, 100, 20, 20, 100};
    w_select_lasso(pts, 3, W_SEL_REPLACE);

    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1, "Selection must be active");
    TEST_ASSERT(info[5] == 1, "Must have mask");

    /* Execute clearing */
    simulate_nativeClearSelectedPixels();

    /* Point inside triangle (e.g. (30, 30): 30+30 = 60 <= 120) MUST BE CLEARED (0) */
    TEST_ASSERT(pix[30 * lw + 30] == 0, "Pixel (30, 30) inside triangle must be cleared to 0");
    TEST_ASSERT(pix[25 * lw + 25] == 0, "Pixel (25, 25) inside triangle must be cleared to 0");
    TEST_ASSERT(pix[21 * lw + 21] == 0, "Pixel near vertex (21, 21) must be cleared to 0");

    /* Point outside triangle but INSIDE bounding box [20, 20, 81, 81]
     * e.g. (90, 90): 90+90 = 180 > 120.
     * This was previously cleared incorrectly by the bounding box bug!
     * It MUST REMAIN 0xFFFF0000!
     */
    TEST_ASSERT(pix[90 * lw + 90] == 0xFFFF0000, "Pixel (90, 90) outside triangle must NOT be cleared");
    TEST_ASSERT(pix[80 * lw + 80] == 0xFFFF0000, "Pixel (80, 80) outside triangle must NOT be cleared");
    TEST_ASSERT(pix[70 * lw + 70] == 0xFFFF0000, "Pixel (70, 70) outside triangle must NOT be cleared");

    /* Points strictly outside the bounding box */
    TEST_ASSERT(pix[10 * lw + 10] == 0xFFFF0000, "Pixel (10, 10) outside bbox must NOT be cleared");
    TEST_ASSERT(pix[150 * lw + 150] == 0xFFFF0000, "Pixel (150, 150) outside bbox must NOT be cleared");
}

/* =========================================================================
 * Test 3: Non-Convex / Horseshoe (U-Shape) Lasso Mask Clearing
 * ========================================================================= */
static void test_lasso_horseshoe_clearing(void) {
    w_init(200, 200);
    int active = w_layer_get_active();
    uint32_t *pix = w_layer_get_pixels(active);
    int lw = w_layer_get_width(active);

    for (int i = 0; i < 200 * 200; i++) pix[i] = 0xFF00FF00; /* Green */

    /* U-shaped polygon:
     * Left arm: (20,20) to (40,20) down to (40,70)
     * Valley: (40,70) across to (80,70) up to (80,20)
     * Right arm: (80,20) to (100,20) down to (100,100)
     * Bottom bar: (100,100) to (20,100) back to (20,20)
     */
    int32_t u_pts[] = {
        20, 20,
        40, 20,
        40, 70,
        80, 70,
        80, 20,
        100, 20,
        100, 100,
        20, 100
    };
    w_select_lasso(u_pts, 8, W_SEL_REPLACE);

    simulate_nativeClearSelectedPixels();

    /* Inside Left Arm: (30, 40) -> CLEARED */
    TEST_ASSERT(pix[40 * lw + 30] == 0, "Inside left arm (30, 40) must be cleared");

    /* Inside Right Arm: (90, 40) -> CLEARED */
    TEST_ASSERT(pix[40 * lw + 90] == 0, "Inside right arm (90, 40) must be cleared");

    /* Inside Bottom Base: (60, 85) -> CLEARED */
    TEST_ASSERT(pix[85 * lw + 60] == 0, "Inside bottom base (60, 85) must be cleared");

    /* Inside Valley (Empty center of the U): (60, 40) -> MUST BE PRESERVED! */
    TEST_ASSERT(pix[40 * lw + 60] == 0xFF00FF00, "Inside U valley (60, 40) must NOT be cleared");
    TEST_ASSERT(pix[50 * lw + 50] == 0xFF00FF00, "Inside U valley (50, 50) must NOT be cleared");
}

/* =========================================================================
 * Test 4: Lasso Crossing Canvas Boundaries (Extreme Coordinates)
 * ========================================================================= */
static void test_lasso_boundary_crossing(void) {
    w_init(100, 100);
    int active = w_layer_get_active();
    uint32_t *pix = w_layer_get_pixels(active);
    int lw = w_layer_get_width(active);

    for (int i = 0; i < 100 * 100; i++) pix[i] = 0xFF0000FF; /* Blue */

    /* Lasso partially outside: negative coords and coords > doc bounds */
    int32_t out_pts[] = {
        -50, -50,
        50, -50,
        50, 50,
        -50, 50
    };
    w_select_lasso(out_pts, 4, W_SEL_REPLACE);

    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1, "Must be active");
    TEST_ASSERT(info[1] >= 0, "clip_x must be clamped >= 0");
    TEST_ASSERT(info[2] >= 0, "clip_y must be clamped >= 0");
    TEST_ASSERT(info[1] + info[3] <= 100, "clip right must be <= doc_width");
    TEST_ASSERT(info[2] + info[4] <= 100, "clip bottom must be <= doc_height");

    simulate_nativeClearSelectedPixels();

    /* Pixels within the visible quadrant [0..49, 0..49] should be cleared */
    TEST_ASSERT(pix[10 * lw + 10] == 0, "Pixel (10, 10) in quadrant must be cleared");
    TEST_ASSERT(pix[45 * lw + 45] == 0, "Pixel (45, 45) in quadrant must be cleared");

    /* Pixels outside [50..99, 50..99] should NOT be cleared */
    TEST_ASSERT(pix[60 * lw + 60] == 0xFF0000FF, "Pixel (60, 60) outside quadrant must NOT be cleared");
}

/* =========================================================================
 * Test 5: Degenerate Lasso Inputs & Edge Cases
 * ========================================================================= */
static void test_degenerate_lassos(void) {
    w_init(100, 100);
    w_select_clear();

    /* 5.1 Fewer than 3 points */
    int32_t pts2[] = {10, 10, 20, 20};
    w_select_lasso(pts2, 2, W_SEL_REPLACE);
    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 0, "Lasso with 2 points must not activate selection");

    /* 5.2 Collinear 3 points */
    int32_t colin[] = {10, 10, 20, 20, 30, 30};
    w_select_lasso(colin, 3, W_SEL_REPLACE);
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 0, "Collinear lasso (zero area) must clear or not activate selection");

    /* 5.3 All points completely outside canvas */
    int32_t outside[] = {200, 200, 300, 200, 250, 300};
    w_select_lasso(outside, 3, W_SEL_REPLACE);
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 0, "Lasso completely outside canvas must not activate selection");

    /* 5.4 Null pointer */
    w_select_lasso(NULL, 10, W_SEL_REPLACE);
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 0, "NULL points array must not crash and remain inactive");
}

/* =========================================================================
 * Test 6: Inversion of Lasso Selection
 * ========================================================================= */
static void test_lasso_inversion(void) {
    w_init(100, 100);
    /* Pre-allocate buffer to doc size to prevent reallocation clobbering in legacy w_select_invert */
    w_get_clip_mask_buffer(100 * 100);

    int active = w_layer_get_active();
    uint32_t *pix = w_layer_get_pixels(active);
    int lw = w_layer_get_width(active);

    for (int i = 0; i < 100 * 100; i++) pix[i] = 0xFFFFFFFF;

    /* Select a small square lasso in center: (40, 40) to (60, 60) */
    int32_t box_pts[] = {40, 40, 60, 40, 60, 60, 40, 60};
    w_select_lasso(box_pts, 4, W_SEL_REPLACE);

    int32_t pre_info[6] = {0};
    w_select_get_info(pre_info);
    TEST_ASSERT(pre_info[0] == 1, "Pre-invert must be active");
    TEST_ASSERT(pre_info[5] == 1, "Pre-invert must have mask");

    /* Invert selection */
    w_select_invert();

    int32_t info[6] = {0};
    w_select_get_info(info);
    TEST_ASSERT(info[0] == 1, "Inverted selection must be active");
    TEST_ASSERT(info[5] == 1, "Inverted lasso must have clip_has_mask == 1");

    /* Clear selected pixels */
    simulate_nativeClearSelectedPixels();

    /* Center (50, 50) was INSIDE the original lasso, so in inverted selection it is EXCLUDED */
    TEST_ASSERT(pix[50 * lw + 50] == 0xFFFFFFFF, "Center (50, 50) must remain intact after invert-clear");
    TEST_ASSERT(pix[10 * lw + 10] == 0, "Exterior (10, 10) must be cleared after invert-clear");
    TEST_ASSERT(pix[80 * lw + 80] == 0, "Exterior (80, 80) must be cleared after invert-clear");
}

int main(void) {
    printf("===================================================\n");
    printf("  Empirical C Stress Tests: Milestone 2 Selection  \n");
    printf("===================================================\n");

    RUN_TEST(test_selection_info_and_mask_export);
    RUN_TEST(test_lasso_triangle_clearing);
    RUN_TEST(test_lasso_horseshoe_clearing);
    RUN_TEST(test_lasso_boundary_crossing);
    RUN_TEST(test_degenerate_lassos);
    RUN_TEST(test_lasso_inversion);

    printf("\n===================================================\n");
    printf("  Results: %d passed, %d failed\n", g_pass, g_fail);
    printf("===================================================\n");

    return (g_fail == 0) ? 0 : 1;
}
