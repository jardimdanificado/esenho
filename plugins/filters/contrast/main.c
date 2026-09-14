/**
 * =========================================================================
 * Contrast Filter Plugin (plugins/filters/contrast/main.c)
 * =========================================================================
 * 
 * Adjusts dynamic range contrast relative to midtone gray (128) using the
 * standard photographic contrast enhancement formula:
 * 
 *   factor_scale = 259 * (factor + 255) / (255 * (259 - factor))
 *   C' = clamp(factor_scale * (C - 128) + 128, 0, 255)
 * 
 * Where C in {R, G, B}.
 * Alpha channel is strictly preserved.
 *
 * Command Syntax:
 *   "contrast [factor]" (e.g., "contrast 50", "contrast -30", default = 30)
 * =========================================================================
 */

#include "wesenho.h"

/**
 * clamp255 - Clamps an integer color value to the 8-bit range [0, 255].
 *
 * @param val  Input integer value
 * @return     Clamped integer in [0, 255]
 */
static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

/**
 * on_message - Handles incoming invocation message to run the contrast filter.
 * 
 * Decodes the text command string from `piolho_page`, queries active framebuffer
 * pointers from the canvas actor via `ask("canvas:layer")`, parses contrast factor,
 * computes the fixed-point contrast scaling ratio, and shifts pixel colors relative
 * to midtone 128.
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

    // Parse command arguments: "contrast [factor]"
    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int factor = 30; // Default contrast adjustment factor
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v != 0) factor = v;
    }

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;

    // Compute contrast transfer ratio: factor_scale = (259 * (factor + 255)) / (255 * (259 - factor))
    int numerator = 259 * (factor + 255);
    int denominator = 255 * (259 - factor);
    if (denominator == 0) denominator = 1;

    int total = fb->width * fb->height;

    /*
     * Iterate over every pixel in the active layer framebuffer.
     * Expand or compress color deviations around mid-gray level 128.
     */
    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue; // Skip fully transparent background

        // Shift color component from [0, 255] to zero-centered [-128, 127]
        int r = (int)(p & 0xFF) - 128;
        int g = (int)((p >> 8) & 0xFF) - 128;
        int b = (int)((p >> 16) & 0xFF) - 128;

        // Apply contrast factor and shift back to [0, 255] with clamping
        r = clamp255((r * numerator) / denominator + 128);
        g = clamp255((g * numerator) / denominator + 128);
        b = clamp255((b * numerator) / denominator + 128);

        // Pack modified RGBA values back into 32-bit pixel word
        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}

/**
 * update - Actor tick handler.
 * Contrast filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
