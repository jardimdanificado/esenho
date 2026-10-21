#ifndef QUADRO_FILTER_SUITE_H
#define QUADRO_FILTER_SUITE_H

#include "quadro.h"

/* Filters use the plugin ABI: an RGBA image followed by one image of scratch
 * memory. Native callers must allocate both images; WASM hosts do likewise.
 * Color/detail effects keep the original alpha. Warps move RGBA together.
 * Neighborhood samples are alpha weighted to avoid transparent color fringes.
 * No libc, allocation, mutable global state, or external math imports. */
enum {
    SF_EXPOSURE, SF_GAMMA, SF_SATURATION, SF_VIBRANCE, SF_TEMPERATURE, SF_TINT,
    SF_SHADOWS, SF_HIGHLIGHTS, SF_BLACK_POINT, SF_WHITE_POINT, SF_FADE,
    SF_SPLIT_TONE, SF_CHANNEL_MIXER, SF_COLOR_BALANCE, SF_POSTERIZE,
    SF_COLORIZE, SF_BLEACH_BYPASS, SF_CROSS_PROCESS,
    SF_MEDIAN, SF_MINIMUM, SF_MAXIMUM, SF_HIGH_PASS, SF_UNSHARP_MASK,
    SF_MOTION_BLUR, SF_ZOOM_BLUR, SF_RADIAL_BLUR, SF_BILATERAL, SF_TILT_SHIFT,
    SF_OIL_PAINT, SF_PENCIL, SF_CROSSHATCH, SF_ENGRAVING,
    SF_WAVE, SF_PINCH, SF_MIRROR, SF_WEAVE
};

static inline int sf_clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline int sf_abs(int v) { return v < 0 ? -v : v; }
static inline int sf_channel(uint32_t p, int c) { return (p >> (8 * c)) & 255; }
static inline int sf_luma(uint32_t p) {
    return (sf_channel(p, 0) * 77 + sf_channel(p, 1) * 150 + sf_channel(p, 2) * 29) >> 8;
}
static inline uint32_t sf_rgb(int r, int g, int b, uint32_t alpha) {
    return (alpha & 0xff000000u) | (uint32_t)sf_clamp(r, 0, 255) |
        ((uint32_t)sf_clamp(g, 0, 255) << 8) | ((uint32_t)sf_clamp(b, 0, 255) << 16);
}
static inline uint32_t sf_mix(uint32_t a, uint32_t b, int amount) {
    return sf_rgb((sf_channel(a, 0) * (100 - amount) + sf_channel(b, 0) * amount) / 100,
                  (sf_channel(a, 1) * (100 - amount) + sf_channel(b, 1) * amount) / 100,
                  (sf_channel(a, 2) * (100 - amount) + sf_channel(b, 2) * amount) / 100, a);
}
static inline uint32_t sf_sample(const uint32_t *src, int w, int h, int x, int y) {
    return src[sf_clamp(y, 0, h - 1) * w + sf_clamp(x, 0, w - 1)];
}
/* exp approximation evaluated near zero, followed by repeated squaring. */
static inline float sf_exp(float x) {
    float t = x / 32.0f, result = 1.0f, term = 1.0f;
    for (int i = 1; i <= 8; i++) { term *= t / i; result += term; }
    for (int i = 0; i < 5; i++) result *= result;
    return result;
}
static inline float sf_gamma(float x, float exponent) {
    if (x <= 0) return 0;
    float log_x = 0;
    while (x < 0.5f) { x *= 2; log_x -= 0.69314718056f; }
    float z = (x - 1) / (x + 1), term = z, sum = 0;
    for (int i = 1; i < 20; i += 2) { sum += term / i; term *= z * z; }
    return sf_exp((log_x + 2 * sum) * exponent);
}

static inline void sf_color_apply(int kind, int p1, int p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;
    int lut[256];
    float gain = kind == SF_EXPOSURE ? sf_exp(p1 * 0.0069314718f) : 1;
    if (kind == SF_GAMMA) {
        for (int i = 0; i < 256; i++) lut[i] = sf_clamp((int)(255 * sf_gamma(i / 255.0f, 100.0f / p1) + 0.5f), 0, 255);
    }
    for (int y = 0; y < fb->height; y++) for (int x = 0; x < fb->width; x++) {
        int i = y * fb->width + x;
        uint32_t p = fb->pixels[i];
        if (!(p >> 24)) continue;
        int r = sf_channel(p, 0), g = sf_channel(p, 1), b = sf_channel(p, 2), l = sf_luma(p);
        int nr = r, ng = g, nb = b;
        switch (kind) {
        case SF_EXPOSURE: nr = (int)(r * gain); ng = (int)(g * gain); nb = (int)(b * gain); break;
        case SF_GAMMA: nr = lut[r]; ng = lut[g]; nb = lut[b]; break;
        case SF_SATURATION: case SF_VIBRANCE: {
            int amount = p1;
            if (kind == SF_VIBRANCE) {
                int hi = sf_clamp(r > g ? r : g, b, 255), lo = r < g ? r : g;
                if (b < lo) lo = b;
                amount = p1 * (255 - (hi - lo)) / 255;
            }
            nr = r + (r - l) * amount / 100; ng = g + (g - l) * amount / 100; nb = b + (b - l) * amount / 100; break;
        }
        case SF_TEMPERATURE: nr += p1 * 80 / 100; ng += p1 * 12 / 100; nb -= p1 * 80 / 100; break;
        case SF_TINT: nr += p1 * 40 / 100; ng -= p1 * 60 / 100; nb += p1 * 40 / 100; break;
        case SF_SHADOWS: case SF_HIGHLIGHTS: {
            int mask = kind == SF_SHADOWS ? 255 - l : l;
            int delta = p1 * mask * mask / (255 * 100);
            nr += delta; ng += delta; nb += delta; break;
        }
        case SF_BLACK_POINT: nr = (r - p1) * 255 / (255 - p1); ng = (g - p1) * 255 / (255 - p1); nb = (b - p1) * 255 / (255 - p1); break;
        case SF_WHITE_POINT: nr = r * 255 / p1; ng = g * 255 / p1; nb = b * 255 / p1; break;
        case SF_FADE: nr = r + (128 - r) * p1 / 200; ng = g + (128 - g) * p1 / 200; nb = b + (128 - b) * p1 / 200; break;
        case SF_SPLIT_TONE: {
            uint32_t shadow = w_hsv_to_rgb(p1, 170, l, 255), light = w_hsv_to_rgb(p2, 170, l, 255);
            uint32_t tone = sf_mix(shadow, light, l * 100 / 255);
            uint32_t result = sf_mix(p, tone, 35);
            nr = sf_channel(result, 0); ng = sf_channel(result, 1); nb = sf_channel(result, 2); break;
        }
        case SF_CHANNEL_MIXER:
            nr = (r * (100 - p1) + g * p1) / 100; ng = (g * (100 - p1) + b * p1) / 100; nb = (b * (100 - p1) + r * p1) / 100;
            nr += (l - nr) * p2 / 100; ng += (l - ng) * p2 / 100; nb += (l - nb) * p2 / 100; break;
        case SF_COLOR_BALANCE: nr += p1; nb += p2; ng -= (p1 + p2) / 4; break;
        case SF_POSTERIZE: {
            int step = p1 - 1;
            nr = ((r * step + 127) / 255) * 255 / step; ng = ((g * step + 127) / 255) * 255 / step; nb = ((b * step + 127) / 255) * 255 / step; break;
        }
        case SF_COLORIZE: {
            uint32_t tone = w_hsv_to_rgb(p1, p2 * 255 / 100, l, 255);
            nr = sf_channel(tone, 0); ng = sf_channel(tone, 1); nb = sf_channel(tone, 2); break;
        }
        case SF_BLEACH_BYPASS: {
            int rr = r * (100 - p2) / 100 + l * p2 / 100;
            int gg = g * (100 - p2) / 100 + l * p2 / 100;
            int bb = b * (100 - p2) / 100 + l * p2 / 100;
            nr = rr + ((rr - 128) * p1 / 100); ng = gg + ((gg - 128) * p1 / 100); nb = bb + ((bb - 128) * p1 / 100); break;
        }
        case SF_CROSS_PROCESS: {
            int rr = r * r * (765 - 2 * r) / 65025;
            int gg = g * g * (765 - 2 * g) / 65025;
            int bb = 30 + b * 195 / 255;
            nr = r + (rr - r + p2) * p1 / 100; ng = g + (gg - g) * p1 / 100; nb = b + (bb - b - p2) * p1 / 100; break;
        }
        case SF_CROSSHATCH: {
            int ink = (l < 210 && (x + y) % p1 == 0) || (l < 150 && (x - y) % p1 == 0) ||
                      (l < 90 && (x + y + p1 / 2) % p1 == 0) || (l < 40 && (x - y + p1 / 2) % p1 == 0);
            uint32_t paper = sf_rgb(ink ? 15 : 250, ink ? 15 : 250, ink ? 15 : 250, p);
            uint32_t result = sf_mix(p, paper, p2); nr = sf_channel(result, 0); ng = sf_channel(result, 1); nb = sf_channel(result, 2); break;
        }
        case SF_ENGRAVING: {
            int phase = (y + (int)(w_sinf(x * 0.06f) * p1 * 0.4f)) % p1;
            if (phase < 0) phase += p1;
            int value = phase * 255 / p1 < (255 - l) ? 15 : 245;
            uint32_t result = sf_mix(p, sf_rgb(value, value, value, p), p2);
            nr = sf_channel(result, 0); ng = sf_channel(result, 1); nb = sf_channel(result, 2); break;
        }
        case SF_WEAVE: {
            int warp = (x / p1) & 1, weft = (y / p1) & 1;
            int delta = (warp == weft ? (x % p1 < p1 / 2 ? 1 : -1) : (y % p1 < p1 / 2 ? 1 : -1)) * p2;
            nr += delta; ng += delta; nb += delta; break;
        }
        }
        fb->pixels[i] = sf_rgb(nr, ng, nb, p);
    }
}

/* Accumulate straight RGB with alpha weights. Alpha itself stays at the
 * destination for detail/blur filters, so existing silhouettes stay intact. */
typedef struct { float r, g, b, weight; } sf_sum;
static inline void sf_accumulate(sf_sum *sum, uint32_t p, float weight) {
    weight *= (p >> 24) / 255.0f;
    sum->r += sf_channel(p, 0) * weight; sum->g += sf_channel(p, 1) * weight;
    sum->b += sf_channel(p, 2) * weight; sum->weight += weight;
}
static inline uint32_t sf_average(sf_sum sum, uint32_t original) {
    if (sum.weight <= 0) return original;
    return sf_rgb((int)(sum.r / sum.weight + 0.5f), (int)(sum.g / sum.weight + 0.5f), (int)(sum.b / sum.weight + 0.5f), original);
}
static inline uint32_t sf_blur_sample(const uint32_t *src, int w, int h, int x, int y, int radius) {
    sf_sum sum = {0};
    /* A bounded 25-tap box kernel keeps large canvases practical on mobile. */
    for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++)
        sf_accumulate(&sum, sf_sample(src, w, h, x + dx * radius / 2, y + dy * radius / 2), 1);
    return sf_average(sum, src[y * w + x]);
}
static inline void sf_spatial_apply(int kind, int p1, int p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;
    int w = fb->width, h = fb->height;
    uint32_t *dst = fb->pixels, *src = dst + (size_t)w * h;
    for (size_t i = 0; i < (size_t)w * h; i++) src[i] = dst[i];
    float cx = (w - 1) * 0.5f, cy = (h - 1) * 0.5f;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x;
        uint32_t p = src[i], result = p;
        if (kind >= SF_WAVE) {
            float sx = x, sy = y;
            if (kind == SF_WAVE) {
                sx += w_sinf(y * 6.2831853f / p2) * p1;
                sy += w_sinf(x * 6.2831853f / p2) * p1;
            } else if (kind == SF_PINCH) {
                float nx = (x - cx) / (w * 0.5f), ny = (y - cy) / (h * 0.5f);
                float radius = w_sqrtf(nx * nx + ny * ny);
                float extent = p2 / 100.0f;
                if (radius < extent) {
                    float t = 1 - radius / extent, scale = 1 + (p1 / 100.0f) * t * t;
                    sx = cx + (x - cx) * scale; sy = cy + (y - cy) * scale;
                }
            } else if (kind == SF_MIRROR) {
                /* p1: horizontal/vertical/both; p2 chooses the source half. */
                if (p1 != 1 && ((p2 == 0 && x > cx) || (p2 == 1 && x < cx))) sx = w - 1 - x;
                if (p1 != 0 && ((p2 == 0 && y > cy) || (p2 == 1 && y < cy))) sy = h - 1 - y;
            }
            dst[i] = sf_sample(src, w, h, (int)(sx + 0.5f), (int)(sy + 0.5f));
            continue;
        }
        if (!(p >> 24)) continue;
        if (kind == SF_MEDIAN || kind == SF_MINIMUM || kind == SF_MAXIMUM || kind == SF_OIL_PAINT || kind == SF_BILATERAL) {
            int radius = p1, values[3][25], count = 0;
            int rr = 0, gg = 0, bb = 0;
            sf_sum sum = {0}, bins[8] = {{0}};
            int strongest = 0;
            if (kind == SF_MINIMUM) rr = gg = bb = 255;
            for (int dy = -radius; dy <= radius; dy++) for (int dx = -radius; dx <= radius; dx++) {
                uint32_t q = sf_sample(src, w, h, x + dx, y + dy);
                if (!(q >> 24)) continue;
                int r = sf_channel(q, 0), g = sf_channel(q, 1), b = sf_channel(q, 2);
                if (kind == SF_MEDIAN) {
                    int channels[3] = {r, g, b};
                    for (int c = 0; c < 3; c++) {
                        int j = count;
                        while (j > 0 && values[c][j - 1] > channels[c]) { values[c][j] = values[c][j - 1]; j--; }
                        values[c][j] = channels[c];
                    }
                    count++;
                } else if (kind == SF_MINIMUM) {
                    if (r < rr) rr = r; if (g < gg) gg = g; if (b < bb) bb = b;
                } else if (kind == SF_MAXIMUM) {
                    if (r > rr) rr = r; if (g > gg) gg = g; if (b > bb) bb = b;
                } else if (kind == SF_OIL_PAINT) {
                    int bin = sf_luma(q) * p2 / 256;
                    sf_accumulate(&bins[bin], q, 1);
                    if (bins[bin].weight > bins[strongest].weight) strongest = bin;
                } else {
                    int difference = sf_abs(r - sf_channel(p, 0)) + sf_abs(g - sf_channel(p, 1)) + sf_abs(b - sf_channel(p, 2));
                    float edge = difference / (p2 * 3.0f);
                    float distance = (dx * dx + dy * dy) / (float)(radius * radius + 1);
                    sf_accumulate(&sum, q, 1 / ((1 + edge * edge * edge * edge) * (1 + distance)));
                }
            }
            if (kind == SF_MEDIAN && count) result = sf_rgb(values[0][count / 2], values[1][count / 2], values[2][count / 2], p);
            else if (kind == SF_MINIMUM || kind == SF_MAXIMUM) result = sf_rgb(rr, gg, bb, p);
            else if (kind == SF_OIL_PAINT) result = sf_average(bins[strongest], p);
            else if (kind == SF_BILATERAL) result = sf_average(sum, p);
        } else if (kind == SF_HIGH_PASS || kind == SF_UNSHARP_MASK || kind == SF_PENCIL || kind == SF_TILT_SHIFT) {
            uint32_t blurred = sf_blur_sample(src, w, h, x, y, p1);
            if (kind == SF_TILT_SHIFT) {
                float distance = sf_abs(y - (int)cy) * 200.0f / h;
                int amount = sf_clamp((int)((distance - p2) * 100 / (101 - p2)), 0, 100);
                result = sf_mix(p, blurred, amount);
            } else if (kind == SF_PENCIL) {
                int base = sf_luma(p), smooth = sf_luma(blurred);
                int pencil = sf_clamp(base * 255 / (smooth + 1), 0, 255);
                pencil = sf_clamp(255 - (255 - pencil) * p2 / 100, 0, 255);
                result = sf_rgb(pencil, pencil, pencil, p);
            } else {
                int channels[3];
                for (int c = 0; c < 3; c++) {
                    int detail = sf_channel(p, c) - sf_channel(blurred, c);
                    channels[c] = kind == SF_HIGH_PASS ? 128 + detail * p2 / 100 : sf_channel(p, c) + detail * p2 / 100;
                }
                result = sf_rgb(channels[0], channels[1], channels[2], p);
            }
        } else if (kind == SF_MOTION_BLUR || kind == SF_ZOOM_BLUR || kind == SF_RADIAL_BLUR) {
            sf_sum sum = {0};
            int taps = kind == SF_MOTION_BLUR ? sf_clamp(p1 + 1, 2, 32) : 24;
            float vx = 0, vy = 0;
            if (kind == SF_MOTION_BLUR) { vx = w_cosf(p2 * 0.017453293f) * p1; vy = w_sinf(p2 * 0.017453293f) * p1; }
            for (int k = 0; k < taps; k++) {
                float t = k / (float)(taps - 1), sx = x, sy = y;
                if (kind == SF_MOTION_BLUR) { sx += (t - 0.5f) * vx; sy += (t - 0.5f) * vy; }
                else if (kind == SF_ZOOM_BLUR) { sx = cx + (x - cx) * (1 - t * p1 / 100.0f); sy = cy + (y - cy) * (1 - t * p1 / 100.0f); }
                else {
                    float angle = (t - 0.5f) * p1 * 0.017453293f;
                    float cs = w_cosf(angle), sn = w_sinf(angle);
                    sx = cx + (x - cx) * cs - (y - cy) * sn; sy = cy + (x - cx) * sn + (y - cy) * cs;
                }
                sf_accumulate(&sum, sf_sample(src, w, h, (int)(sx + 0.5f), (int)(sy + 0.5f)), 1);
            }
            result = sf_average(sum, p);
            if (kind != SF_MOTION_BLUR) result = sf_mix(p, result, p2);
        }
        dst[i] = result;
    }
}
#endif
