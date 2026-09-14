/**
 * =========================================================================
 * Brightness Filter Plugin (plugins/filters/brightness/main.c)
 * =========================================================================
 * 
 * Modifies the overall luminance of the active layer by applying a uniform
 * additive/subtractive bias (delta) to each individual color component
 * (Red, Green, Blue) of every non-transparent pixel:
 * 
 *   R' = clamp(R + delta, 0, 255)
 *   G' = clamp(G + delta, 0, 255)
 *   B' = clamp(B + delta, 0, 255)
 * 
 * Alpha channel is strictly preserved.
 *
 * Command Syntax:
 *   "brightness [delta]" (e.g., "brightness 40", "brightness -20", default = 30)
 * =========================================================================
 */

#include "wesenho.h"

/**
 * clamp255 - Clamps an integer color value to the 8-bit range [0, 255].
 *
 * @param val  Input integer value (can be negative or > 255)
 * @return     Clamped integer in [0, 255]
 */
static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

/**
 * on_message - Handles incoming invocation message to run the brightness filter.
 * 
 * Decodes the text command string from `piolho_page`, queries active framebuffer
 * pointers from the canvas actor via `ask("canvas:layer")`, parses optional delta,
 * and iterates all pixels applying the clamped additive offset.
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

    // Parse command arguments: "brightness [delta]"
    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int delta = 30; // Default brightness delta increment
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v != 0) delta = v;
    }

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    /*
     * Iterate over every pixel in the active layer framebuffer.
     * Skip fully transparent pixels (a == 0) to avoid ghost coloring.
     */
    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue;

        // Apply additive delta to R, G, B channels with 8-bit clamping
        int r = clamp255((int)(p & 0xFF) + delta);
        int g = clamp255((int)((p >> 8) & 0xFF) + delta);
        int b = clamp255((int)((p >> 16) & 0xFF) + delta);

        // Pack clamped RGBA components back into 32-bit pixel word
        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}

/**
 * update - Actor tick handler.
 * Brightness filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
