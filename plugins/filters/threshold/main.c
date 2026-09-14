/**
 * =========================================================================
 * Threshold Filter Plugin (plugins/filters/threshold/main.c)
 * =========================================================================
 * 
 * Binarizes the active layer into high-contrast solid black (0xFF000000) or
 * solid white (0xFFFFFFFF) by comparing the perceptual luminance of each
 * non-transparent pixel against a configurable threshold:
 * 
 *   lum = (R * 299 + G * 587 + B * 114) / 1000
 *   out = (lum >= thresh) ? 0xFFFFFFFF : 0xFF000000
 * 
 * Fully transparent pixels (alpha == 0) remain unaffected.
 *
 * Command Syntax:
 *   "threshold [value]" (e.g., "threshold 140", default threshold = 128)
 * =========================================================================
 */

#include "wesenho.h"

/**
 * on_message - Handles incoming invocation message to run the threshold filter.
 * 
 * Decodes command string, parses threshold cutoff parameter, queries active layer
 * framebuffer pointer, and sets each pixel to either black or white.
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

    // Parse command arguments: "threshold [value]"
    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int thresh = 128; // Default luminance threshold
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v > 0) thresh = v;
    }

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

        // Compute perceptual luminance
        uint32_t lum = (r * 299 + g * 587 + b * 114) / 1000;

        // Binary thresholding
        uint32_t out = (lum >= (uint32_t)thresh) ? 0xFFFFFFFF : 0xFF000000;
        pixels[i] = out;
    }
}

/**
 * update - Actor tick handler.
 * Threshold filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
