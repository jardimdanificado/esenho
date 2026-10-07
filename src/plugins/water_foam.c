/**
 * =========================================================================
 * Water Surface & Shoreline Proximity Foam Filter Plugin (src/plugins/water_foam.c)
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Water & Shore Foam\",\"params\":[{\"name\":\"Foam Reach\",\"min\":2,\"max\":35,\"default\":12,\"unit\":\"px\"},{\"name\":\"Wave Distortion\",\"min\":1,\"max\":25,\"default\":6,\"unit\":\"px\"}]}";
}

static inline int clamp_coord(int v, int max_v) {
    if (v < 0) return 0;
    if (v >= max_v) return max_v - 1;
    return v;
}

static inline float clamp_f(float v, float min_v, float max_v) {
    if (v < min_v) return min_v;
    if (v > max_v) return max_v;
    return v;
}

static inline float smoothstep_f(float edge0, float edge1, float x) {
    float t = clamp_f((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

/* Pseudo-cellular noise for dynamic foam bubbles & froth */
static inline float foam_pattern(float x, float y) {
    float n1 = w_sinf(x * 0.45f) * w_cosf(y * 0.45f);
    float n2 = w_sinf(x * 0.9f + y * 0.3f) * w_cosf(y * 0.9f - x * 0.3f);
    float n3 = w_sinf((x + y) * 1.5f);
    float combined = (n1 * 0.5f + n2 * 0.35f + n3 * 0.15f) * 0.5f + 0.5f;
    return combined;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int foam_radius = (p1 >= 2 && p1 <= 35) ? p1 : 12;
    int wave_amp = (p2 >= 1 && p2 <= 25) ? p2 : 6;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) {
        temp[i] = pixels[i];
    }

    float max_dist_sq = (float)(foam_radius * foam_radius);
    float inv_max_dist_sq = 1.0f / max_dist_sq;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            uint32_t center_p = temp[y * width + x];
            uint32_t center_a = (center_p >> 24) & 0xFF;

            // Proximity detector: check distance to alpha boundaries or canvas edges
            float min_dist_sq = max_dist_sq;
            int found_boundary = 0;

            // Step adaptive search around pixel neighborhood
            int step = (foam_radius > 16) ? 2 : 1;
            for (int dy = -foam_radius; dy <= foam_radius; dy += step) {
                int sy = y + dy;
                if (sy < 0 || sy >= height) {
                    float edge_d_sq = (float)(dy * dy);
                    if (edge_d_sq < min_dist_sq) {
                        min_dist_sq = edge_d_sq;
                        found_boundary = 1;
                    }
                    continue;
                }

                int row = sy * width;
                for (int dx = -foam_radius; dx <= foam_radius; dx += step) {
                    int sx = x + dx;
                    if (sx < 0 || sx >= width) {
                        float edge_d_sq = (float)(dx * dx + dy * dy);
                        if (edge_d_sq < min_dist_sq) {
                            min_dist_sq = edge_d_sq;
                            found_boundary = 1;
                        }
                        continue;
                    }

                    uint32_t sample_p = temp[row + sx];
                    uint32_t sample_a = (sample_p >> 24) & 0xFF;

                    // Edge detected where alpha changes or contrasting border occurs
                    if (sample_a != center_a) {
                        float d_sq = (float)(dx * dx + dy * dy);
                        if (d_sq < min_dist_sq) {
                            min_dist_sq = d_sq;
                            found_boundary = 1;
                        }
                    }
                }
            }

            // Normalized distance: 0.0 at edge/shore, 1.0 in deep open water
            float dist_factor = found_boundary ? (min_dist_sq * inv_max_dist_sq) : 1.0f;
            if (dist_factor > 1.0f) dist_factor = 1.0f;

            // Wave caustics & refractive displacement
            float fx = (float)x;
            float fy = (float)y;
            float wave_x = w_sinf(fy * 0.08f + fx * 0.04f) + 0.5f * w_sinf(fx * 0.12f);
            float wave_y = w_cosf(fx * 0.08f + fy * 0.04f) + 0.5f * w_cosf(fy * 0.12f);

            int sample_x = clamp_coord(x + (int)(wave_x * (float)wave_amp), width);
            int sample_y = clamp_coord(y + (int)(wave_y * (float)wave_amp), height);
            uint32_t refr_p = temp[sample_y * width + sample_x];

            uint32_t base_r = refr_p & 0xFF;
            uint32_t base_g = (refr_p >> 8) & 0xFF;
            uint32_t base_b = (refr_p >> 16) & 0xFF;
            uint32_t base_a = (refr_p >> 24) & 0xFF;

            // Water tint colors (Deep Azure & Shallow Turquoise)
            float water_r = 18.0f;
            float water_g = 120.0f;
            float water_b = 180.0f;

            float shallow_r = 64.0f;
            float shallow_g = 210.0f;
            float shallow_b = 215.0f;

            // Interpolate shallow vs deep water based on proximity
            float depth_mix = smoothstep_f(0.1f, 0.9f, dist_factor);
            float tint_r = shallow_r * (1.0f - depth_mix) + water_r * depth_mix;
            float tint_g = shallow_g * (1.0f - depth_mix) + water_g * depth_mix;
            float tint_b = shallow_b * (1.0f - depth_mix) + water_b * depth_mix;

            // Water absorption blend over background image
            float water_blend = 0.55f;
            float mixed_r = (float)base_r * (1.0f - water_blend) + tint_r * water_blend;
            float mixed_g = (float)base_g * (1.0f - water_blend) + tint_g * water_blend;
            float mixed_b = (float)base_b * (1.0f - water_blend) + tint_b * water_blend;

            // Caustic glitter highlights
            float caustic = (wave_x * wave_y);
            if (caustic > 0.35f) {
                float c_boost = (caustic - 0.35f) * 55.0f;
                mixed_r += c_boost;
                mixed_g += c_boost;
                mixed_b += c_boost;
            }

            // Proximity Foam & Froth calculation
            float foam_noise_val = foam_pattern(fx, fy);
            float shoreline_wave = w_sinf(dist_factor * 16.0f) * 0.5f + 0.5f;

            // High intensity foam near the edge (0.0 .. 0.3) plus wave crests (0.3 .. 0.7)
            float foam_intensity = (1.0f - smoothstep_f(0.0f, 0.75f, dist_factor)) * shoreline_wave * foam_noise_val;
            
            // Solid contact waterline right against the boundary
            if (dist_factor < 0.15f) {
                float contact_line = (1.0f - (dist_factor / 0.15f)) * 0.85f;
                if (contact_line > foam_intensity) {
                    foam_intensity = contact_line;
                }
            }

            foam_intensity = clamp_f(foam_intensity * 1.35f, 0.0f, 1.0f);

            // Foam color: crisp white / cream
            float foam_r = 248.0f;
            float foam_g = 252.0f;
            float foam_b = 255.0f;

            uint32_t out_r = (uint32_t)clamp_f(mixed_r * (1.0f - foam_intensity) + foam_r * foam_intensity, 0.0f, 255.0f);
            uint32_t out_g = (uint32_t)clamp_f(mixed_g * (1.0f - foam_intensity) + foam_g * foam_intensity, 0.0f, 255.0f);
            uint32_t out_b = (uint32_t)clamp_f(mixed_b * (1.0f - foam_intensity) + foam_b * foam_intensity, 0.0f, 255.0f);
            uint32_t out_a = base_a > 0 ? base_a : (uint32_t)clamp_f(190.0f + foam_intensity * 65.0f, 0.0f, 255.0f);

            pixels[y * width + x] = (out_a << 24) | (out_b << 16) | (out_g << 8) | out_r;
        }
    }
}
