/**
 * =========================================================================
 * Water Surface & Shoreline Proximity Foam Filter Plugin (src/plugins/water_foam.c)
 * Universal Quadro WASM Filter ABI
 * =========================================================================
 */

#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Water & Shore Foam\",\"params\":["
           "{\"name\":\"Foam Reach\",\"min\":2,\"max\":60,\"default\":18,\"unit\":\"px\"},"
           "{\"name\":\"Wave & Sparkle\",\"min\":1,\"max\":30,\"default\":12,\"unit\":\"px\"}]}";
}

static inline int clamp_i(int v, int min_v, int max_v) {
    if (v < min_v) return min_v;
    if (v > max_v) return max_v;
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

/* Fast Voronoi-like cellular foam pattern */
static inline float cellular_foam(float x, float y) {
    // Multi-frequency wave interference simulating interconnected foam bubbles
    float w1 = w_sinf(x * 0.22f + y * 0.15f);
    float w2 = w_sinf(y * 0.25f - x * 0.18f);
    float w3 = w_sinf((x + y) * 0.35f);
    float w4 = w_cosf(x * 0.45f - y * 0.40f);

    float cell = (w1 + w2 + w3 + w4) * 0.25f; // [-1 .. 1]
    cell = cell * cell; // Peaks at bubble walls [0 .. 1]
    return cell;
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    int foam_radius = (p1 >= 2 && p1 <= 60) ? p1 : 18;
    int wave_power  = (p2 >= 1 && p2 <= 30) ? p2 : 12;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    uint32_t *temp = pixels + total;
    for (int i = 0; i < total; i++) {
        temp[i] = pixels[i];
    }

    float max_r = (float)foam_radius;
    float max_r_sq = max_r * max_r;

    // Check if layer has transparent areas (e.g. vector shapes / cutouts)
    int has_transparency = 0;
    for (int i = 0; i < total; i += 7) {
        if (((temp[i] >> 24) & 0xFF) < 128) {
            has_transparency = 1;
            break;
        }
    }

    for (int y = 0; y < height; y++) {
        int row = y * width;
        for (int x = 0; x < width; x++) {
            uint32_t center_p = temp[row + x];
            uint32_t center_a = (center_p >> 24) & 0xFF;

            // Preserve transparency outside shapes
            if (center_a == 0) {
                pixels[row + x] = 0;
                continue;
            }

            // Calculate distance to edge / shoreline
            float min_d_sq = max_r_sq;

            if (has_transparency) {
                // Vector shape mode: find distance to alpha boundary
                int step = (foam_radius > 20) ? 2 : 1;
                for (int dy = -foam_radius; dy <= foam_radius; dy += step) {
                    int sy = y + dy;
                    if (sy < 0 || sy >= height) {
                        float d_sq = (float)(dy * dy);
                        if (d_sq < min_d_sq) min_d_sq = d_sq;
                        continue;
                    }
                    int srow = sy * width;
                    for (int dx = -foam_radius; dx <= foam_radius; dx += step) {
                        int sx = x + dx;
                        if (sx < 0 || sx >= width) {
                            float d_sq = (float)(dx * dx + dy * dy);
                            if (d_sq < min_d_sq) min_d_sq = d_sq;
                            continue;
                        }

                        uint32_t sa = (temp[srow + sx] >> 24) & 0xFF;
                        if (sa < 128) {
                            float d_sq = (float)(dx * dx + dy * dy);
                            if (d_sq < min_d_sq) {
                                min_d_sq = d_sq;
                            }
                        }
                    }
                }
            } else {
                // Full canvas mode: distance to canvas boundary
                int dx_edge = x < (width - 1 - x) ? x : (width - 1 - x);
                int dy_edge = y < (height - 1 - y) ? y : (height - 1 - y);
                int min_edge = dx_edge < dy_edge ? dx_edge : dy_edge;
                min_d_sq = (float)(min_edge * min_edge);
            }

            float dist = w_sqrtf(min_d_sq); // Distance in pixels to edge
            float norm_dist = dist / max_r; // 0.0 at shore, 1.0 in deep water
            if (norm_dist > 1.0f) norm_dist = 1.0f;

            // Wave refraction & caustics
            float fx = (float)x;
            float fy = (float)y;
            float wave_scale = 0.08f;
            float wave_x = w_sinf(fy * wave_scale + fx * 0.04f) + 0.6f * w_sinf(fx * 0.16f);
            float wave_y = w_cosf(fx * wave_scale + fy * 0.04f) + 0.6f * w_cosf(fy * 0.16f);

            int disp_x = clamp_i(x + (int)(wave_x * (float)wave_power * 0.5f), 0, width - 1);
            int disp_y = clamp_i(y + (int)(wave_y * (float)wave_power * 0.5f), 0, height - 1);
            uint32_t refr_p = temp[disp_y * width + disp_x];

            float base_r = (float)(refr_p & 0xFF);
            float base_g = (float)((refr_p >> 8) & 0xFF);
            float base_b = (float)((refr_p >> 16) & 0xFF);

            // Water Palette:
            // Shallow Shore: Vibrant Turquoise Cyan (#22D5C8)
            // Deep Open Ocean: Deep Lapis Blue (#0A488A)
            float shallow_r = 34.0f,  shallow_g = 213.0f, shallow_b = 200.0f;
            float deep_r    = 10.0f,  deep_g    = 72.0f,  deep_b    = 138.0f;

            // Depth tint based on distance from shoreline
            float depth_curve = smoothstep_f(0.0f, 1.0f, norm_dist);
            float water_r = shallow_r * (1.0f - depth_curve) + deep_r * depth_curve;
            float water_g = shallow_g * (1.0f - depth_curve) + deep_g * depth_curve;
            float water_b = shallow_b * (1.0f - depth_curve) + deep_b * depth_curve;

            // Blend water body over original background (70% water tint)
            float blend_factor = 0.72f;
            float curr_r = base_r * (1.0f - blend_factor) + water_r * blend_factor;
            float curr_g = base_g * (1.0f - blend_factor) + water_g * blend_factor;
            float curr_b = base_b * (1.0f - blend_factor) + water_b * blend_factor;

            // Caustic glitter & sun reflection on wave peaks
            float caustic_val = wave_x * wave_y;
            if (caustic_val > 0.30f) {
                float glitter = (caustic_val - 0.30f) * 60.0f;
                curr_r += glitter * 0.8f;
                curr_g += glitter * 1.1f;
                curr_b += glitter * 1.2f;
            }

            // Proximity Foam calculation
            // 1. Shoreline contact crest: solid bright foam right along the perimeter
            float contact_foam = 1.0f - smoothstep_f(0.0f, 3.5f, dist);

            // 2. Incoming wave froth bands (concentric ripples)
            float wave_band1 = w_sinf(dist * 0.65f); // First breaker
            float wave_band2 = w_sinf(dist * 1.10f); // Secondary breaker
            float wave_froth = (wave_band1 > 0.4f ? (wave_band1 - 0.4f) * 1.6f : 0.0f) +
                               (wave_band2 > 0.6f ? (wave_band2 - 0.6f) * 1.2f : 0.0f);

            // 3. Modulate with cellular bubble pattern
            float bubble_pattern = cellular_foam(fx, fy);
            float shoreline_foam = (1.0f - norm_dist) * wave_froth * (0.6f + 0.4f * bubble_pattern);

            // Combine contact foam + wave froth
            float total_foam = contact_foam * 0.95f + shoreline_foam * 0.85f;
            total_foam = clamp_f(total_foam, 0.0f, 1.0f);

            // Foam color: ultra-bright pure seafoam white
            float foam_r = 255.0f;
            float foam_g = 255.0f;
            float foam_b = 255.0f;

            uint32_t final_r = (uint32_t)clamp_f(curr_r * (1.0f - total_foam) + foam_r * total_foam, 0.0f, 255.0f);
            uint32_t final_g = (uint32_t)clamp_f(curr_g * (1.0f - total_foam) + foam_g * total_foam, 0.0f, 255.0f);
            uint32_t final_b = (uint32_t)clamp_f(curr_b * (1.0f - total_foam) + foam_b * total_foam, 0.0f, 255.0f);

            pixels[row + x] = (center_a << 24) | (final_b << 16) | (final_g << 8) | final_r;
        }
    }
}
