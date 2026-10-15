/**
 * =========================================================================
 * Hypervelocity Bolide Fireball & Meteor Train (meteor_shower_bolide.c)
 *
 * Atmospheric hypersonic ablation & persistent meteor ionization in C99:
 * - Ultra-bright incandescent bolide fireball head with shock cone compression
 * - Supersonic fragmentation trail shedding luminous molten droplets behind velocity
 * - Persistent ionized plasma smoke trail glowing in the upper mesosphere
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_trail_length = 75;   /* 20..150: Trailing ionization wake length */
static int _param_fireball_heat = 90;  /* 20..100: Bolide ablation temperature */
static int _param_fragmentation = 65;  /* 10..100: Shedding micro-meteorite sparks */
static int _param_shock_cone = 60;     /* 10..100: Supersonic shock wave cone angle */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"meteor_shower_bolide\","
        "\"title\":\"Hypersonic Meteor Bolide\","
        "\"category\":\"Astronomy\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Ionization Trail\",\"min\":20,\"max\":150,\"default\":75,\"unit\":\"px\"},"
            "{\"name\":\"Fireball Heat\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Spallation Sparks\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"},"
            "{\"name\":\"Shock Cone Width\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_trail_length = val; break;
        case 1: _param_fireball_heat = val; break;
        case 2: _param_fragmentation = val; break;
        case 3: _param_shock_cone = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x3E7E0800 ^ (uint32_t)(x * 79.0f + y * 83.0f));
}

void w_brush_stroke_end(void) {}

void w_brush_render_dab(
    uint32_t *pixels,
    int canvas_w,
    int canvas_h,
    float cx,
    float cy,
    float radius,
    float pressure,
    float angle_deg,
    float speed,
    uint32_t color,
    int is_eraser
) {
    if (!pixels || canvas_w <= 0 || canvas_h <= 0 || radius <= 0.5f) return;

    float eff_p = (pressure > 0.02f) ? pressure : 0.5f;
    float trail_len = (float)_param_trail_length * (0.8f + eff_p * 0.6f);
    float heat = (float)_param_fireball_heat * 0.01f;
    float cone_w = (float)_param_shock_cone * 0.008f;

    float reach_r = radius + trail_len;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(reach_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    /* 1. Supersonic Shock Cone & Ionized Wake */
    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;

            float p_fwd = dx * cos_a + dy * sin_a;
            float p_lat = -dx * sin_a + dy * cos_a;

            /* Fireball Head (sphere at apex) */
            if (dist_sq <= radius * radius) {
                float head_falloff = w_brush_falloff_smooth(dist_sq, 1.0f / (radius * radius));
                uint32_t r = 255;
                uint32_t g = (uint32_t)(180.0f + 75.0f * head_falloff * heat);
                uint32_t b = (uint32_t)(80.0f + 175.0f * head_falloff * heat);
                if (g > 255) g = 255;
                if (b > 255) b = 255;

                uint32_t a = (uint32_t)(head_falloff * 255.0f * eff_p);
                uint32_t head_c = w_color_pack(r, g, b, 255);

                if (is_eraser) {
                    uint32_t dst = row[x];
                    uint32_t da = (dst >> 24) & 0xFF;
                    row[x] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
                } else {
                    row[x] = w_brush_blend_add(head_c, row[x], a);
                }
                continue;
            }

            /* Trailing Hypersonic Wake behind head */
            float p_behind = -p_fwd;
            if (p_behind > 0.0f && p_behind < trail_len) {
                float t_frac = p_behind / trail_len;
                float allowed_lat = radius * 0.7f + p_behind * cone_w;
                float lat_dist = (p_lat < 0.0f) ? -p_lat : p_lat;

                if (lat_dist < allowed_lat) {
                    float cone_falloff = 1.0f - (lat_dist / allowed_lat);
                    cone_falloff = cone_falloff * cone_falloff;
                    float trail_fade = (1.0f - t_frac);

                    uint32_t r = (uint32_t)(255.0f * trail_fade);
                    uint32_t g = (uint32_t)(120.0f * trail_fade * trail_fade);
                    uint32_t b = (uint32_t)(30.0f * trail_fade);

                    uint32_t a = (uint32_t)(cone_falloff * trail_fade * 210.0f * eff_p);
                    if (a > 255) a = 255;

                    uint32_t trail_c = w_color_pack(r, g, b, 255);
                    if (!is_eraser) {
                        row[x] = w_brush_blend_add(trail_c, row[x], a);
                    }
                }
            }
        }
    }

    /* 2. Shedding Molten Spallation Micro-Meteorites */
    int sparks = (int)(((float)_param_fragmentation * 0.01f) * 6.0f * eff_p);
    for (int s = 0; s < sparks; s++) {
        float d_behind = w_brush_randf() * trail_len * 0.7f;
        float d_lat = w_brush_rand_symf() * (radius * 0.5f + d_behind * 0.25f);

        int sx = (int)(cx - cos_a * d_behind - sin_a * d_lat);
        int sy = (int)(cy - sin_a * d_behind + cos_a * d_lat);

        if (sx >= 1 && sx < canvas_w - 1 && sy >= 1 && sy < canvas_h - 1) {
            uint32_t spark_c = w_color_pack(255, 230, 140, 255);
            pixels[sy * canvas_w + sx] = w_brush_blend_add(spark_c, pixels[sy * canvas_w + sx], 255);
        }
    }
}
