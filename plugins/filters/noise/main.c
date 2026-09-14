/**
 * =========================================================================
 * Noise Filter Plugin (plugins/filters/noise/main.c)
 * =========================================================================
 * 
 * Injects stochastic uniform additive RGB jitter using a fast 32-bit Xorshift PRNG.
 * For each non-transparent pixel, generates random integer noise in [-amount, +amount]:
 * 
 *   noise = (RNG % (2*amount + 1)) - amount
 *   R' = clamp(R + noise, 0, 255)
 *   G' = clamp(G + noise, 0, 255)
 *   B' = clamp(B + noise, 0, 255)
 * 
 * Alpha channel is strictly preserved.
 *
 * Command Syntax:
 *   "noise [amount]" (e.g., "noise 30", default amount = 25)
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

/** PRNG state vector for uniform pseudorandom number generation. */
static uint32_t rng_state = 0x9E3779B9;

/**
 * next_rnd - 32-bit Xorshift Pseudo-Random Number Generator.
 * Period is 2^32 - 1 with low register overhead.
 *
 * @return  Uniformly distributed 32-bit unsigned pseudo-random integer
 */
static inline uint32_t next_rnd(void) {
    rng_state ^= (rng_state << 13);
    rng_state ^= (rng_state >> 17);
    rng_state ^= (rng_state << 5);
    return rng_state;
}

/**
 * on_message - Handles incoming invocation message to run the noise filter.
 * 
 * Decodes command string, parses noise amplitude parameter, queries active layer
 * framebuffer, and iterates all pixels adding random noise.
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

    // Parse command arguments: "noise [amount]"
    char *argv[8];
    int argc = c_tokenize(buf, argv, 8);
    int amount = 25; // Default noise amplitude
    for (int i = 0; i < argc; i++) {
        int v = c_atoi(argv[i]);
        if (v > 0) amount = v;
    }

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    /*
     * Scan every pixel in the active layer framebuffer.
     */
    for (int i = 0; i < total; i++) {
        uint32_t p = pixels[i];
        uint32_t a = (p >> 24) & 0xFF;
        if (a == 0) continue; // Skip transparent pixels

        // Generate uniform integer noise offset in [-amount, +amount]
        int noise = ((int)(next_rnd() % (amount * 2 + 1))) - amount;

        // Apply additive noise to R, G, B with [0, 255] clamping
        int r = clamp255((int)(p & 0xFF) + noise);
        int g = clamp255((int)((p >> 8) & 0xFF) + noise);
        int b = clamp255((int)((p >> 16) & 0xFF) + noise);

        // Store back RGBA word with preserved original alpha
        pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
}

/**
 * update - Actor tick handler.
 * Noise filter is an immediate one-shot filter, so update returns OK.
 */
int32_t update(void) {
    return UPDATE_OK;
}
