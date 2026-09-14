/**
 * =========================================================================
 * Grayscale Filter Plugin (plugins/filters/grayscale/main.c)
 * =========================================================================
 * 
 * Converts active layer colors to monochrome grayscale using standard
 * ITU-R BT.601 perceptual luminance weighting coefficients:
 * 
 *   Y = (R * 299 + G * 587 + B * 114) / 1000
 *   R' = Y,  G' = Y,  B' = Y
 * 
 * Preserves the original alpha channel.
 *
 * Command Syntax:
 *   "grayscale"
 * =========================================================================
 */

#include "wesenho.h"

/**
 * on_message - Handles incoming invocation message to run the grayscale filter.
 * 
 * Decodes command, queries active layer framebuffer pointer from canvas actor,
 * and converts RGB channels of each non-transparent pixel to scalar luminance.
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

        uint32_t r = p & 0xFF;
        uint32_t g = (p >> 8) & 0xFF;
        uint32_t b = (p >> 16) & 0xFF;

        // Compute perceptual luminance: Y = 0.299*R + 0.587*G + 0.114*B
        uint32_t gray = (r * 299 + g * 587 + b * 114) / 1000;

        // Pack identical gray component into R, G, B channels with original Alpha
        pixels[i] = (a << 24) | (gray << 16) | (gray << 8) | gray;
    }
}

/**
 * update - Actor tick handler.
 * Grayscale filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
