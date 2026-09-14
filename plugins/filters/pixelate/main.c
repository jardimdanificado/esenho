/**
 * =========================================================================
 * Pixelate Filter Plugin (plugins/filters/pixelate/main.c)
 * =========================================================================
 * 
 * Implements a mosaic / pixelation filter by partitioning the layer framebuffer
 * into non-overlapping grid blocks of size `(size x size)`:
 *   1. For each block, averages the R, G, B, and A channel intensities of all
 *      contained pixels.
 *   2. Re-fills the entire block area with this computed uniform average color.
 *
 * Command Syntax:
 *   "pixelate [size]" (e.g., "pixelate 12", default block size = 8)
 * =========================================================================
 */

#include "wesenho.h"

/**
 * on_message - Handles incoming invocation message to run the pixelate filter.
 * 
 * Decodes command, parses block size argument, queries active layer framebuffer
 * pointer from canvas actor, and performs block-by-block color averaging and filling.
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

    // Parse command arguments: "pixelate [size]"
    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int size = 8; // Default pixel block size (8x8 pixels)
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v > 1) size = v;
    }

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;

    /*
     * Iterate across the canvas in strides of `size` in Y and X.
     */
    for (int by = 0; by < height; by += size) {
        for (int bx = 0; bx < width; bx += size) {
            uint32_t sum_r = 0, sum_g = 0, sum_b = 0, sum_a = 0;
            int count = 0;

            // Pass 1: Accumulate color channels across all pixels within current block
            for (int dy = 0; dy < size && by + dy < height; dy++) {
                for (int dx = 0; dx < size && bx + dx < width; dx++) {
                    uint32_t p = pixels[(by + dy) * width + (bx + dx)];
                    sum_r += (p & 0xFF);
                    sum_g += ((p >> 8) & 0xFF);
                    sum_b += ((p >> 16) & 0xFF);
                    sum_a += ((p >> 24) & 0xFF);
                    count++;
                }
            }

            // Pass 2: Calculate mean block color and fill the entire block area
            if (count > 0) {
                uint32_t avg = ((sum_a / count) << 24) |
                               ((sum_b / count) << 16) |
                               ((sum_g / count) << 8)  |
                               (sum_r / count);

                for (int dy = 0; dy < size && by + dy < height; dy++) {
                    for (int dx = 0; dx < size && bx + dx < width; dx++) {
                        pixels[(by + dy) * width + (bx + dx)] = avg;
                    }
                }
            }
        }
    }
}

/**
 * update - Actor tick handler.
 * Pixelate filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
