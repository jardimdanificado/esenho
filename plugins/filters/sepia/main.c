/**
 * =========================================================================
 * Sepia Filter Plugin (plugins/filters/sepia/main.c)
 * =========================================================================
 * 
 * Applies the standard Microsoft / W3C warm antique sepia tone matrix
 * transformation to each non-transparent pixel in the active layer:
 * 
 *   R' = clamp((R * 393 + G * 769 + B * 189) / 1000, 0, 255)
 *   G' = clamp((R * 349 + G * 686 + B * 168) / 1000, 0, 255)
 *   B' = clamp((R * 272 + G * 534 + B * 131) / 1000, 0, 255)
 * 
 * Alpha channel is strictly preserved.
 *
 * Command Syntax:
 *   "sepia"
 * =========================================================================
 */

#include "wesenho.h"

/**
 * clamp255 - Clamps an unsigned integer color value to 255.
 *
 * @param val  Input computed component value
 * @return     Clamped integer in [0, 255]
 */
static inline uint32_t clamp255(uint32_t val) {
    return val > 255 ? 255 : val;
}

/**
 * on_message - Handles incoming invocation message to run the sepia filter.
 * 
 * Decodes command, queries active layer framebuffer pointer from canvas actor,
 * and transforms RGB channels using fixed-point sepia matrix weights.
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

        // Apply W3C Sepia tone matrix transformation (scaled by 1000)
        uint32_t nr = clamp255((r * 393 + g * 769 + b * 189) / 1000);
        uint32_t ng = clamp255((r * 349 + g * 686 + b * 168) / 1000);
        uint32_t nb = clamp255((r * 272 + g * 534 + b * 131) / 1000);

        // Pack transformed RGBA components back into pixel word
        pixels[i] = (a << 24) | (nb << 16) | (ng << 8) | nr;
    }
}

/**
 * update - Actor tick handler.
 * Sepia filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
