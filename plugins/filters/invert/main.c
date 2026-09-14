/**
 * =========================================================================
 * Invert Filter Plugin (plugins/filters/invert/main.c)
 * =========================================================================
 * 
 * Performs photographic negative color inversion by subtracting each RGB
 * color component from 255:
 * 
 *   R' = 255 - R
 *   G' = 255 - G
 *   B' = 255 - B
 * 
 * Alpha channel is strictly preserved. Fully transparent pixels are skipped.
 *
 * Command Syntax:
 *   "invert"
 * =========================================================================
 */

#include "wesenho.h"

/**
 * on_message - Handles incoming invocation message to run the color inversion filter.
 * 
 * Decodes command, queries active layer framebuffer pointer from canvas actor,
 * and subtractively inverts RGB channels of each non-transparent pixel.
 * 
 * @param from_id  Actor ID of caller sending the message
 * @param len      Length in bytes of command text in piolho_page
 */
void on_message(int32_t from_id, int32_t len) {
    if (len <= 0) return;

    // Retrieve active layer framebuffer pointer from canvas actor
    wframebuffer_t *fb = (wframebuffer_t*)ask("canvas:layer");
    if (!fb || !fb->pixels || fb->width == 0 || fb->height == 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    /*
     * Scan every pixel in the active layer framebuffer.
     */
    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue; // Skip fully transparent pixels

        // Invert RGB channels (255 - component)
        uint32_t r = 255 - (p & 0xFF);
        uint32_t g = 255 - ((p >> 8) & 0xFF);
        uint32_t b = 255 - ((p >> 16) & 0xFF);

        // Pack inverted RGB components with original Alpha
        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}

/**
 * update - Actor tick handler.
 * Invert filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
