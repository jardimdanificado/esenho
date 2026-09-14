/**
 * =========================================================================
 * Ordered Dither Filter Plugin (plugins/filters/dither/main.c)
 * =========================================================================
 * 
 * Implements 4x4 Bayer matrix ordered dithering to quantize full-color pixels
 * into 1-bit monochrome (solid black 0xFF000000 or solid white 0xFFFFFFFF).
 * 
 * Algorithm:
 *   1. Compute ITU-R BT.601 perceptual luminance:
 *        Y = (R * 299 + G * 587 + B * 114) / 1000  in [0, 255]
 *   2. Retrieve threshold from 4x4 Bayer matrix:
 *        T = bayer4[y % 4][x % 4] * 16 + 8
 *   3. If Y >= T, output white (0xFFFFFFFF), otherwise black (0xFF000000).
 *
 * Command Syntax:
 *   "dither"
 * =========================================================================
 */

#include "wesenho.h"

/**
 * 4x4 Bayer dither threshold matrix (normalized index scale 0..15).
 * Distributes quantization thresholds uniformly across a 4x4 spatial repeating tile.
 */
static const uint8_t bayer4[4][4] = {
    {  0,  8,  2, 10 },
    { 12,  4, 14,  6 },
    {  3, 11,  1,  9 },
    { 15,  7, 13,  5 }
};

/**
 * on_message - Handles incoming invocation message to run the dither filter.
 * 
 * Queries active layer framebuffer from canvas actor and applies 4x4 Bayer ordered
 * dithering across every non-transparent pixel in the canvas.
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
    int width = fb->width;
    int height = fb->height;

    /*
     * Scan every pixel coordinate (x, y) in the canvas.
     */
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t p = pixels[y * width + x];
            uint32_t a = (p >> 24) & 0xFF;
            if (a == 0) continue; // Skip fully transparent background

            uint32_t r = p & 0xFF;
            uint32_t g = (p >> 8) & 0xFF;
            uint32_t b = (p >> 16) & 0xFF;

            // Compute perceptual luminance (BT.601 integer approximation)
            uint32_t lum = (r * 299 + g * 587 + b * 114) / 1000;

            // Map 4x4 Bayer index (0..15) to 8-bit threshold range [8, 248]
            uint8_t threshold = bayer4[y % 4][x % 4] * 16 + 8;

            // 1-bit thresholding: white if above threshold, black otherwise
            uint32_t col = (lum >= threshold) ? 0xFFFFFFFF : 0xFF000000;
            pixels[y * width + x] = col;
        }
    }
}

/**
 * update - Actor tick handler.
 * Dither filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
