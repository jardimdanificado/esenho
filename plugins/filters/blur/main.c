/**
 * =========================================================================
 * Box Blur Filter Plugin (plugins/filters/blur/main.c)
 * =========================================================================
 * 
 * Implements a fast, separable two-pass 2D box blur filter over active layer
 * pixels. Separability decomposes an O(N * R^2) 2D kernel convolution into two
 * sequential O(N * R) 1D passes:
 *   1. Horizontal Pass: Blurs horizontally along each row from input `pixels`
 *      into intermediate `temp` buffer.
 *   2. Vertical Pass: Blurs vertically down each column from `temp` buffer
 *      back into output `pixels`.
 *
 * Command Syntax:
 *   "blur [radius]" (e.g., "blur 5", default radius = 3, clamped to max 25)
 * =========================================================================
 */

#include "wesenho.h"

/** Maximum supported document pixel count for separable intermediate scratchpad buffer. */
#define MAX_DOC (800 * 1000)

/** Intermediate scratchpad buffer to store row-blurred results between 1D passes. */
static uint32_t temp[MAX_DOC];

/**
 * on_message - Handles incoming invocation message to run the blur filter.
 * 
 * Decodes the text command string from `piolho_page`, queries active framebuffer
 * pointers from the canvas actor via `ask("canvas:layer")`, parses optional radius,
 * and executes horizontal + vertical box blur passes.
 * 
 * @param from_id  Actor ID of caller sending the message
 * @param len      Length in bytes of command text in piolho_page
 */
void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;

    // Retrieve active layer framebuffer pointer from canvas actor
    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    // Copy command payload from shared page to local buffer for tokenization
    char buf[128];
    int clen = (len < 127) ? len : 127;
    for (int i = 0; i < clen; i++) buf[i] = (char)piolho_page[i];
    buf[clen] = '\0';

    // Parse command arguments: "blur [radius]"
    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int r = 3; // Default blur radius
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v > 0) r = v;
    }
    // Clamp radius to prevent excessive performance drops on large canvases
    if (r > 25) r = 25;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    /*
     * ---------------------------------------------------------------------
     * Pass 1: Horizontal 1D Box Blur
     * Iterates each pixel (x, y), accumulating color channels across the
     * horizontal window [x - r, x + r], and writes mean RGBA into `temp`.
     * ---------------------------------------------------------------------
     */
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;

            // Accumulate neighbor samples within horizontal kernel window [-r, +r]
            for (int dx = -r; dx <= r; dx++) {
                int nx = x + dx;
                if (nx >= 0 && nx < width) {
                    uint32_t p = pixels[y * width + nx];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }

            // Compute channel arithmetic mean and store into intermediate temp buffer
            if (count > 0) {
                temp[y * width + x] = ((sum_a / count) << 24) |
                                      ((sum_b / count) << 16) |
                                      ((sum_g / count) << 8)  |
                                      (sum_r / count);
            }
        }
    }

    /*
     * ---------------------------------------------------------------------
     * Pass 2: Vertical 1D Box Blur
     * Iterates each pixel (x, y), accumulating color channels from `temp`
     * across the vertical window [y - r, y + r], and writes final mean
     * back into the layer framebuffer `pixels`.
     * ---------------------------------------------------------------------
     */
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;

            // Accumulate neighbor samples within vertical kernel window [-r, +r]
            for (int dy = -r; dy <= r; dy++) {
                int ny = y + dy;
                if (ny >= 0 && ny < height) {
                    uint32_t p = temp[ny * width + x];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }

            // Compute final channel arithmetic mean and write back to active layer
            if (count > 0) {
                pixels[y * width + x] = ((sum_a / count) << 24) |
                                        ((sum_b / count) << 16) |
                                        ((sum_g / count) << 8)  |
                                        (sum_r / count);
            }
        }
    }
}

/**
 * update - Actor tick handler.
 * Box blur is an immediate one-shot filter triggered via on_message, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
