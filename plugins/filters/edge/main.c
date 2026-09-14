/**
 * =========================================================================
 * Sobel Edge Detection Filter Plugin (plugins/filters/edge/main.c)
 * =========================================================================
 * 
 * Computes spatial gradient vectors on luminance across active layer pixels
 * using 3x3 horizontal and vertical Sobel convolution kernels:
 * 
 *          [ -1  0  +1 ]                  [ -1 -2 -1 ]
 *     Gx = [ -2  0  +2 ] ,           Gy = [  0  0  0 ]
 *          [ -1  0  +1 ]                  [ +1 +2 +1 ]
 * 
 * The edge gradient magnitude is approximated by Manhattan norm:
 *     |G| = |Gx| + |Gy|
 * 
 * Pixels with |G| > 30 are rendered as opaque grayscale edge intensity,
 * while weak gradients (|G| <= 30) are suppressed to transparent black (0x00000000).
 *
 * Command Syntax:
 *   "edge"
 * =========================================================================
 */

#include "wesenho.h"

/** Maximum supported document pixel count for intermediate source sampling buffer. */
#define MAX_DOC (800 * 1000)

/** Temporary buffer holding unmodified source pixel data during neighborhood convolution. */
static uint32_t temp[MAX_DOC];

/**
 * clamp255 - Clamps an integer color value to the 8-bit range [0, 255].
 *
 * @param val  Input gradient magnitude value
 * @return     Clamped integer in [0, 255]
 */
static inline int clamp255(int val) {
    if (val < 0) return 0;
    if (val > 255) return 255;
    return val;
}

/**
 * get_lum - Extracts ITU-R BT.601 perceptual luminance from a packed 32-bit RGBA pixel.
 * Fully transparent pixels return 0 luminance.
 *
 * @param p  Packed RGBA 32-bit pixel
 * @return   8-bit scalar luminance in [0, 255]
 */
static inline uint8_t get_lum(uint32_t p) {
    uint32_t a = (p >> 24) & 0xFF;
    if (a == 0) return 0;
    return (uint8_t)(((p & 0xFF) * 299 + ((p >> 8) & 0xFF) * 587 + ((p >> 16) & 0xFF) * 114) / 1000);
}

/**
 * on_message - Handles incoming invocation message to run Sobel edge detection.
 * 
 * Copies source layer pixels into `temp`, scans internal (1..width-2, 1..height-2)
 * pixels, applies 3x3 Sobel kernels, and outputs edge map.
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
    int total = width * height;
    if (total > MAX_DOC) total = MAX_DOC;

    // Snapshot source pixels into intermediate temp buffer to prevent convolution feedback
    for (int i = 0; i < total; i++) temp[i] = pixels[i];

    /*
     * Iterate internal pixels (excluding 1-pixel border to avoid boundary checks).
     */
    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            // Sample 3x3 luminance neighborhood around (x, y)
            int tl = get_lum(temp[(y - 1) * width + (x - 1)]); // Top-Left
            int tc = get_lum(temp[(y - 1) * width + x]);       // Top-Center
            int tr = get_lum(temp[(y - 1) * width + (x + 1)]); // Top-Right
            int ml = get_lum(temp[y * width + (x - 1)]);       // Mid-Left
            int mr = get_lum(temp[y * width + (x + 1)]);       // Mid-Right
            int bl = get_lum(temp[(y + 1) * width + (x - 1)]); // Bottom-Left
            int bc = get_lum(temp[(y + 1) * width + x]);       // Bottom-Center
            int br = get_lum(temp[(y + 1) * width + (x + 1)]); // Bottom-Right

            // Convolve with horizontal Sobel kernel Gx
            int gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);

            // Convolve with vertical Sobel kernel Gy
            int gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);

            // Approximate gradient magnitude: |Gx| + |Gy|
            int mag = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
            uint8_t out = clamp255(mag);

            // Threshold noise suppression: edges above 30 are kept, others cleared
            if (out > 30) {
                pixels[y * width + x] = 0xFF000000 | (out << 16) | (out << 8) | out;
            } else {
                pixels[y * width + x] = 0x00000000;
            }
        }
    }
}

/**
 * update - Actor tick handler.
 * Sobel edge filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
