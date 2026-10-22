#ifndef QUADRO_FILTER_CREATIVE_H
#define QUADRO_FILTER_CREATIVE_H

#include "quadro_filter_suite.h"

/* Stylized approximations of optical, photographic and material processes.
 * Same two-image plugin ABI as the detail suite, with bounded sampling costs.
 * No global random state: identical inputs and parameters produce identical art.
 */
enum {
    CF_FILM_GRAIN, CF_HALATION, CF_LIGHT_LEAK, CF_LENS_FLARE, CF_ANAMORPHIC,
    CF_DIFFRACTION_STAR, CF_FOG, CF_UNDERWATER, CF_NIGHT_VISION, CF_CYANOTYPE,
    CF_LITH_PRINT, CF_RISOGRAPH, CF_CMYK_PRINT, CF_PHOTOCOPY, CF_INK_BLEED,
    CF_WATERCOLOR_PAPER, CF_PIGMENT_GRANULATION, CF_IMPASTO_LIGHTING,
    CF_BRUSHED_METAL, CF_OXIDIZED_COPPER, CF_RUST, CF_CRACKLE, CF_STAINED_GLASS,
    CF_MARBLE, CF_CONTOUR_MAP, CF_IRIDESCENCE, CF_PRISM, CF_LENTICULAR,
    CF_PIXEL_SORT, CF_MOIRE, CF_SLIT_SCAN, CF_RAIN_GLASS
};
static inline float cf_abs(float v) { return v < 0 ? -v : v; }
static inline float cf_limit(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline int cf_floor(float x) { int i = (int)x; return x < i ? i - 1 : i; }
/* Keep freestanding trigonometry bounded even on large canvases. */
static inline float cf_sin(float x) {
    x -= cf_floor((x + 3.14159265f) / 6.2831853f) * 6.2831853f;
    return w_sinf(x);
}
static inline float cf_cos(float x) { return cf_sin(x + 1.57079633f); }
static inline uint32_t cf_hash(int x, int y, uint32_t salt) {
    uint32_t n = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u + salt * 1442695041u;
    n = (n ^ (n >> 13)) * 1274126177u;
    return n ^ (n >> 16);
}
static inline float cf_random(int x, int y, uint32_t salt) {
    return (cf_hash(x, y, salt) & 65535u) / 65535.0f;
}
static inline float cf_noise(float x, float y, uint32_t salt) {
    int ix = cf_floor(x), iy = cf_floor(y);
    float u = x - ix, v = y - iy;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    float a = cf_random(ix, iy, salt), b = cf_random(ix + 1, iy, salt);
    float c = cf_random(ix, iy + 1, salt), d = cf_random(ix + 1, iy + 1, salt);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
static inline float cf_cloud(float x, float y) {
    return cf_noise(x, y, 17) * .6f + cf_noise(x * 2.1f, y * 2.1f, 39) * .3f + cf_noise(x * 4.3f, y * 4.3f, 71) * .1f;
}
static inline int cf_light(uint32_t p, int threshold) {
    int l = sf_luma(p);
    return sf_clamp((l - threshold) * 255 / (256 - threshold), 0, 255) * (int)(p >> 24) / 255;
}
static inline int cf_local_light(const uint32_t *src, int w, int h, int x, int y, int radius, int threshold) {
    int sum = 0, weights = 0;
    for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
        int weight = (3 - sf_abs(dx)) * (3 - sf_abs(dy));
        sum += cf_light(sf_sample(src, w, h, x + dx * radius / 2, y + dy * radius / 2), threshold) * weight;
        weights += weight;
    }
    return sum / weights;
}
static inline int cf_screen_channel(int base, float light) {
    int value = sf_clamp((int)light, 0, 255);
    return 255 - (255 - base) * (255 - value) / 255;
}
static inline float cf_screen(float x, float y, float angle, int spacing) {
    float cs = cf_cos(angle), sn = cf_sin(angle);
    float u = (x * cs + y * sn) / spacing, v = (-x * sn + y * cs) / spacing;
    u -= cf_floor(u); v -= cf_floor(v);
    u -= .5f; v -= .5f;
    return cf_limit((u * u + v * v) * 2.8f, 0, .999f);
}
/* Refracted channels fall back to the destination color outside painted areas. */
static inline uint32_t cf_painted_sample(const uint32_t *src, int w, int h, int x, int y, uint32_t fallback) {
    uint32_t p = sf_sample(src, w, h, x, y);
    return p >> 24 ? p : fallback;
}
static inline void cf_apply(int kind, int p1, int p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;
    int w = fb->width, h = fb->height;
    uint32_t *dst = fb->pixels, *src = dst + (size_t)w * h;
    for (size_t i = 0; i < (size_t)w * h; i++) src[i] = dst[i];

    if (kind == CF_PIXEL_SORT) {
        /* Bounded insertion sort over bright, painted runs within short spans.
         * Dark/transparent separators stay fixed. RGBA travels with each pixel. */
        for (int y = 0; y < h; y++) for (int start = 0; start < w; start += p1) {
            int end = sf_clamp(start + p1, 0, w), first = start;
            while (first < end) {
                if (!(dst[y * w + first] >> 24) || sf_luma(dst[y * w + first]) < p2) { first++; continue; }
                int last = first + 1;
                while (last < end && (dst[y * w + last] >> 24) && sf_luma(dst[y * w + last]) >= p2) last++;
                for (int j = first + 1; j < last; j++) {
                    uint32_t pixel = dst[y * w + j]; int k = j;
                    while (k > first && sf_luma(dst[y * w + k - 1]) > sf_luma(pixel)) {
                        dst[y * w + k] = dst[y * w + k - 1]; k--;
                    }
                    dst[y * w + k] = pixel;
                }
                first = last;
            }
        }
        return;
    }
    float cx = (w - 1) * .5f, cy = (h - 1) * .5f;
    float source_x = cx, source_y = cy;
    int source_light = 0;
    if (kind == CF_LENS_FLARE) {
        /* One linear scan also detects tiny highlights between grid samples. */
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int light = cf_light(src[y * w + x], 170);
            if (light > source_light) { source_light = light; source_x = x; source_y = y; }
        }
    }
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x;
        uint32_t p = src[i];
        if (kind == CF_LENTICULAR || kind == CF_SLIT_SCAN) {
            if (kind == CF_LENTICULAR) {
                int band = x / p1;
                int sx = band % 2 ? w - 1 - x + p2 : x - p2;
                dst[i] = sf_sample(src, w, h, sx, y);
            } else {
                int band = y / p2;
                int offset = (int)(cf_sin(band * .23f) * p1 + (cf_random(band, 0, 91) - .5f) * p1 * .4f);
                dst[i] = sf_sample(src, w, h, x + offset, y);
            }
            continue;
        }
        if (!(p >> 24)) continue;
        int r = sf_channel(p, 0), g = sf_channel(p, 1), b = sf_channel(p, 2), l = sf_luma(p);
        float nr = r, ng = g, nb = b;
        switch (kind) {
        case CF_FILM_GRAIN: {
            int grain_x = x / p2, grain_y = y / p2;
            float grain = (cf_random(grain_x, grain_y, 41) + cf_random(grain_x, grain_y, 83) - 1) * p1;
            grain *= .35f + (255 - l) / 255.0f;
            nr += grain; ng += grain * .94f; nb += grain * 1.08f; break;
        }
        case CF_HALATION: {
            float glow = cf_local_light(src, w, h, x, y, p1, 175) * p2 / 100.0f;
            nr = cf_screen_channel(r, glow); ng = cf_screen_channel(g, glow * .27f); nb = cf_screen_channel(b, glow * .08f); break;
        }
        case CF_LIGHT_LEAK: {
            float nx = x / (float)w, ny = y / (float)h;
            float distance = p2 == 0 ? nx : p2 == 1 ? 1 - nx : p2 == 2 ? ny : 1 - ny;
            float leak = cf_limit(1 - distance * 3.5f, 0, 1);
            leak = leak * leak * (.5f + .5f * cf_noise(x / 160.0f, y / 110.0f, 12)) * p1 * 3;
            nr = cf_screen_channel(r, leak); ng = cf_screen_channel(g, leak * .35f); nb = cf_screen_channel(b, leak * .08f); break;
        }
        case CF_LENS_FLARE: {
            float rr = 0, gg = 0, bb = 0;
            float radius = p2 * (w < h ? w : h) / 100.0f;
            for (int ghost = 0; ghost < 5; ghost++) {
                float t = ghost * .48f;
                float gx = source_x + (cx - source_x) * t, gy = source_y + (cy - source_y) * t;
                float dx = x - gx, dy = y - gy;
                float rad = radius * (.45f + ghost * .2f);
                float d = w_sqrtf(dx * dx + dy * dy) / (rad + .001f);
                float disk = cf_limit(1 - d, 0, 1), rim = cf_limit(1 - cf_abs(d - .8f) * 12, 0, 1) * .4f;
                float light = (disk * disk + rim) * source_light * p1 / 100.0f / (ghost + 1);
                rr += light * (ghost % 2 ? .4f : 1); gg += light * .65f; bb += light * (ghost % 2 ? 1 : .3f);
            }
            nr = cf_screen_channel(r, rr); ng = cf_screen_channel(g, gg); nb = cf_screen_channel(b, bb); break;
        }
        case CF_ANAMORPHIC: case CF_DIFFRACTION_STAR: {
            float light = 0, weight_sum = 0;
            for (int k = -8; k <= 8; k++) {
                int distance = k * p1 / 8;
                float weight = 1.0f / (1 + sf_abs(k));
                light += cf_light(sf_sample(src, w, h, x + distance, y), p2) * weight;
                weight_sum += weight;
                if (kind == CF_DIFFRACTION_STAR) {
                    light += cf_light(sf_sample(src, w, h, x, y + distance), p2) * weight;
                    light += cf_light(sf_sample(src, w, h, x + distance, y + distance), p2) * weight;
                    light += cf_light(sf_sample(src, w, h, x + distance, y - distance), p2) * weight;
                    weight_sum += weight * 3;
                }
            }
            light = light * 2 / weight_sum;
            nr = cf_screen_channel(r, light * (kind == CF_ANAMORPHIC ? .35f : 1));
            ng = cf_screen_channel(g, light * .75f); nb = cf_screen_channel(b, light); break;
        }
        case CF_FOG: {
            float depth = 1 - y / (float)h;
            float haze = p1 / 100.0f * (.2f + depth * .8f) * (.7f + .3f * cf_cloud(x / 180.0f, y / 150.0f));
            int air_r = p2 ? 225 : 195, air_g = p2 ? 214 : 211, air_b = p2 ? 190 : 225;
            nr += (air_r - r) * haze; ng += (air_g - g) * haze; nb += (air_b - b) * haze; break;
        }
        case CF_UNDERWATER: {
            float depth = .3f + .7f * y / h;
            float absorption = p1 / 100.0f;
            float wave = cf_sin(x * .045f + cf_sin(y * .035f) * 3) + cf_sin(y * .055f - x * .025f);
            float caustic = cf_limit((wave - 1.2f) * 1.25f, 0, 1) * p2;
            nr = r * (1 - absorption * .8f * depth) + caustic * .3f;
            ng = g * (1 - absorption * .25f * depth) + absorption * 15 + caustic;
            nb = b * (1 - absorption * .1f * depth) + absorption * 30 + caustic * 1.1f; break;
        }
        case CF_NIGHT_VISION: {
            float nx = (x - cx) / (w * .5f), ny = (y - cy) / (h * .5f);
            float value = (l * p1 / 100.0f + (cf_random(x, y, 19) - .5f) * p2) * cf_limit(1 - .35f * (nx * nx + ny * ny), .2f, 1);
            nr = value * .12f; ng = value; nb = value * .24f; break;
        }
        case CF_CYANOTYPE: {
            float tone = l / 255.0f;
            tone = cf_limit((tone - .5f) * (1 + p1 / 100.0f) + .5f, 0, 1);
            float paper = (cf_random(x, y, 27) - .5f) * p2;
            nr = 8 + tone * 230 + paper; ng = 35 + tone * 206 + paper; nb = 83 + tone * 149 + paper; break;
        }
        case CF_LITH_PRINT: {
            float tone = cf_limit((l - 50) / 205.0f, 0, 1);
            float grit = (cf_random(x, y, 93) - .5f) * p1 * (1 - tone) * 1.4f;
            tone = tone * tone;
            nr = 22 + tone * 228 + grit; ng = 15 + tone * (215 - p2 * .4f) + grit; nb = 14 + tone * (196 - p2 * .8f) + grit; break;
        }
        case CF_RISOGRAPH: {
            uint32_t shifted = cf_painted_sample(src, w, h, x + p2, y - p2, p);
            float warm_ink = cf_limit((255 - b) / 255.0f, 0, 1);
            float blue_ink = cf_limit((255 - sf_channel(shifted, 0)) / 255.0f, 0, 1);
            float grain = (cf_random(x, y, 29) - .5f) * .1f;
            warm_ink = warm_ink + grain > cf_screen(x, y, .26f, p1) ? 1 : 0;
            blue_ink = blue_ink + grain > cf_screen(x, y, 1.31f, p1) ? 1 : 0;
            nr = 247 * (1 - blue_ink * .8f); ng = 235 * (1 - warm_ink * .63f) * (1 - blue_ink * .47f); nb = 210 * (1 - warm_ink * .76f) * (1 - blue_ink * .15f); break;
        }
        case CF_CMYK_PRINT: {
            int maximum = r > g ? r : g; if (b > maximum) maximum = b;
            float key = 1 - maximum / 255.0f;
            float cyan = maximum ? (maximum - r) / (float)maximum : 0;
            float magenta = maximum ? (maximum - g) / (float)maximum : 0;
            float yellow = maximum ? (maximum - b) / (float)maximum : 0;
            cyan = cyan > cf_screen(x + p2, y, .2618f, p1) ? 1 : 0;
            magenta = magenta > cf_screen(x, y + p2, 1.309f, p1) ? 1 : 0;
            yellow = yellow > cf_screen(x - p2, y, 0, p1) ? 1 : 0;
            key = key > cf_screen(x, y, .7854f, p1) ? 1 : 0;
            nr = 245 * (1 - cyan * .9f) * (1 - key * .95f);
            ng = 239 * (1 - magenta * .9f) * (1 - key * .95f);
            nb = 222 * (1 - yellow * .9f) * (1 - key * .95f); break;
        }
        case CF_PHOTOCOPY: {
            uint32_t blur = sf_blur_sample(src, w, h, x, y, 6);
            int local = sf_luma(blur);
            int threshold = (p1 * 2 + local) / 3;
            float toner = (cf_random(x, y, 53) - .5f) * p2;
            float value = l + toner > threshold ? 243 : 16 + cf_random(x, y, 33) * p2 * .3f;
            nr = value; ng = value; nb = value * .97f; break;
        }
        case CF_INK_BLEED: {
            sf_sum sum = {0};
            for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
                uint32_t q = sf_sample(src, w, h, x + dx * p1 / 2, y + dy * p1 / 2);
                int dark = 256 - sf_luma(q);
                sf_accumulate(&sum, q, dark * dark / 65536.0f);
            }
            uint32_t bleed = sf_average(sum, p), mixed = sf_mix(p, bleed, p2);
            nr = sf_channel(mixed, 0); ng = sf_channel(mixed, 1); nb = sf_channel(mixed, 2); break;
        }
        case CF_WATERCOLOR_PAPER: {
            float fibers = cf_noise(x / (float)p2, y / (p2 * .28f), 47) - .5f;
            float tooth = (cf_random(x, y, 61) - .5f) * .4f + fibers;
            float edge = cf_abs(l - sf_luma(sf_blur_sample(src, w, h, x, y, 2))) / 255.0f;
            float modulation = tooth * p1 * .6f - edge * p1;
            nr += modulation; ng += modulation * .97f; nb += modulation * .85f; break;
        }
        case CF_PIGMENT_GRANULATION: {
            float n = cf_cloud(x / (float)p2, y / (float)p2);
            float density = (n - .5f) * p1 / 100.0f;
            float concentration = 1 - l / 300.0f;
            nr = r * (1 - density * concentration); ng = g * (1 - density * concentration * 1.15f); nb = b * (1 - density * concentration * 1.35f); break;
        }
        case CF_IMPASTO_LIGHTING: {
            float dx = (sf_luma(cf_painted_sample(src, w, h, x + 1, y, p)) - sf_luma(cf_painted_sample(src, w, h, x - 1, y, p))) / 255.0f;
            float dy = (sf_luma(cf_painted_sample(src, w, h, x, y + 1, p)) - sf_luma(cf_painted_sample(src, w, h, x, y - 1, p))) / 255.0f;
            float angle = p2 * .017453293f;
            float shade = (-dx * cf_cos(angle) - dy * cf_sin(angle)) * p1 * 1.5f;
            nr += shade; ng += shade; nb += shade; break;
        }
        case CF_BRUSHED_METAL: {
            float angle = p2 * .017453293f;
            float u = x * cf_cos(angle) + y * cf_sin(angle), v = -x * cf_sin(angle) + y * cf_cos(angle);
            float grain = cf_noise(u / 70, v * 1.7f, 31) - .5f;
            float shine = cf_sin(v * .035f + cf_noise(u / 150, v / 150, 21)) * .3f;
            float metal = 65 + l * .55f + (grain + shine) * p1;
            nr = metal * .94f; ng = metal; nb = metal * 1.05f; break;
        }
        case CF_OXIDIZED_COPPER: case CF_RUST: {
            float patch = cf_cloud(x / (float)p2, y / (float)p2);
            float coverage = cf_limit((patch + p1 / 100.0f - 1) * 5, 0, 1);
            float speckle = cf_random(x, y, 67) * .25f;
            if (kind == CF_OXIDIZED_COPPER) {
                float copper = .35f + l / 390.0f;
                nr = (170 * copper) * (1 - coverage) + (35 + l * .12f) * coverage;
                ng = (91 * copper) * (1 - coverage) + (100 + l * .25f) * coverage;
                nb = (50 * copper) * (1 - coverage) + (85 + l * .2f) * coverage;
            } else {
                nr = r * (1 - coverage) + (115 + l * .28f) * coverage;
                ng = g * (1 - coverage) + (38 + l * .15f) * coverage;
                nb = b * (1 - coverage) + (12 + l * .05f) * coverage;
            }
            nr *= 1 - speckle * coverage; ng *= 1 - speckle * coverage; nb *= 1 - speckle * coverage; break;
        }
        case CF_CRACKLE: case CF_STAINED_GLASS: {
            int cell = p1, gx = x / cell, gy = y / cell;
            float nearest = 1e20f, second = 1e20f, seed_x = x, seed_y = y;
            for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
                int tx = gx + ox, ty = gy + oy;
                float px = (tx + .2f + cf_random(tx, ty, 71) * .6f) * cell;
                float py = (ty + .2f + cf_random(tx, ty, 73) * .6f) * cell;
                float dx = x - px, dy = y - py, distance = dx * dx + dy * dy;
                if (distance < nearest) { second = nearest; nearest = distance; seed_x = px; seed_y = py; }
                else if (distance < second) second = distance;
            }
            float border = (w_sqrtf(second) - w_sqrtf(nearest));
            if (kind == CF_CRACKLE) {
                float crack = cf_limit(1 - border / (1 + p2 * .04f), 0, 1) * p2 / 100.0f;
                nr *= 1 - crack * .85f; ng *= 1 - crack * .9f; nb *= 1 - crack;
            } else {
                sf_sum sum = {0};
                for (int sy = -1; sy <= 1; sy++) for (int sx = -1; sx <= 1; sx++)
                    sf_accumulate(&sum, sf_sample(src, w, h, (int)seed_x + sx * cell / 5, (int)seed_y + sy * cell / 5), 1);
                uint32_t glass = sf_average(sum, p);
                float lead = cf_limit(border / p2, 0, 1), glint = .85f + cf_random(gx, gy, 79) * .3f;
                nr = sf_channel(glass, 0) * lead * glint + 12 * (1 - lead);
                ng = sf_channel(glass, 1) * lead * glint + 12 * (1 - lead);
                nb = sf_channel(glass, 2) * lead * glint + 16 * (1 - lead);
            }
            break;
        }
        case CF_MARBLE: {
            float turbulence = cf_cloud(x / (float)p2, y / (float)p2);
            float vein = cf_abs(cf_sin((x + y * .35f) / p2 * 3 + turbulence * 12));
            vein = cf_limit((.22f - vein) * 5, 0, 1);
            float amount = p1 / 100.0f;
            nr += ((235 - vein * 125) - r) * amount; ng += ((232 - vein * 128) - g) * amount; nb += ((222 - vein * 120) - b) * amount; break;
        }
        case CF_CONTOUR_MAP: {
            int band = l * p1 / 256;
            int position = (l * p1) % 256;
            uint32_t terrain = w_hsv_to_rgb((240 - band * 220 / p1 + 360) % 360, 150, 225, 255);
            float line = position < p2 ? .28f : 1;
            nr = sf_channel(terrain, 0) * line; ng = sf_channel(terrain, 1) * line; nb = sf_channel(terrain, 2) * line; break;
        }
        case CF_IRIDESCENCE: {
            int dx = sf_luma(cf_painted_sample(src, w, h, x + 1, y, p)) - sf_luma(cf_painted_sample(src, w, h, x - 1, y, p));
            int dy = sf_luma(cf_painted_sample(src, w, h, x, y + 1, p)) - sf_luma(cf_painted_sample(src, w, h, x, y - 1, p));
            int hue = (l * 2 + w_atan2_deg(dy, dx) + p2) % 360;
            uint32_t thin_film = w_hsv_to_rgb(hue, 200, sf_clamp(100 + l * 155 / 255, 0, 255), 255);
            uint32_t mixed = sf_mix(p, thin_film, p1);
            nr = sf_channel(mixed, 0); ng = sf_channel(mixed, 1); nb = sf_channel(mixed, 2); break;
        }
        case CF_PRISM: {
            float angle = p2 * .017453293f;
            float displacement = (l - 128) * p1 / 128.0f;
            int dx = (int)(cf_cos(angle) * displacement), dy = (int)(cf_sin(angle) * displacement);
            uint32_t red = cf_painted_sample(src, w, h, x + dx, y + dy, p);
            uint32_t green = cf_painted_sample(src, w, h, x + dx / 3, y + dy / 3, p);
            uint32_t blue = cf_painted_sample(src, w, h, x - dx, y - dy, p);
            nr = sf_channel(red, 0); ng = sf_channel(green, 1); nb = sf_channel(blue, 2); break;
        }
        case CF_MOIRE: {
            float angle = p2 * .017453293f;
            float a = cf_sin(x * 6.2831853f / p1), bb = cf_sin((x * cf_cos(angle) + y * cf_sin(angle)) * 6.2831853f / p1);
            float pattern = a * bb;
            nr += pattern * 65; ng += pattern * 25; nb -= pattern * 55; break;
        }
        case CF_RAIN_GLASS: {
            int cell = p1, gx = x / cell, gy = y / cell;
            float best = 0, best_dx = 0, best_dy = 0, best_radius = 1;
            for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
                int tx = gx + ox, ty = gy + oy;
                if (cf_random(tx, ty, 101) > .65f) continue;
                float px = (tx + cf_random(tx, ty, 103)) * cell, py = (ty + cf_random(tx, ty, 107)) * cell;
                float radius = cell * (.14f + cf_random(tx, ty, 109) * .2f);
                float dx = x - px, dy = (y - py) * 1.25f;
                float inside = 1 - (dx * dx + dy * dy) / (radius * radius);
                if (inside > best) { best = inside; best_dx = dx; best_dy = dy; best_radius = radius; }
            }
            if (best > 0) {
                float refraction = p2 / 30.0f * best;
                uint32_t q = cf_painted_sample(src, w, h, x + (int)(best_dx * refraction), y + (int)(best_dy * refraction), p);
                float rim = (1 - best) * 28;
                float glint = cf_limit(1 - cf_abs(best_dx / best_radius + .3f) * 5 - cf_abs(best_dy / best_radius + .45f) * 5, 0, 1) * 100;
                nr = sf_channel(q, 0) - rim + glint; ng = sf_channel(q, 1) - rim + glint; nb = sf_channel(q, 2) - rim + glint;
            }
            break;
        }
        }
        dst[i] = sf_rgb((int)nr, (int)ng, (int)nb, p);
    }
}
#endif
