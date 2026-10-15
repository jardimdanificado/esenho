/**
 * =========================================================================
 * Pelagic Bioluminescent Jellyfish & Cnidaria (bioluminescence_jellyfish.c)
 *
 * Deep abyssal bioluminescence & hydrozoan pulse dynamics:
 * - Translucent pulsating medusa umbrella with undulating rim
 * - Trailing phosphorescent tentacles that drag and drift behind velocity vector
 * - Cnidocyte stinging light organ nodes with luminescent luciferin glow
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_tentacle_len = 70;   /* 20..150: Trailing tentacle drift length */
static int _param_glow_pulse = 85;     /* 20..100: Abyssal luciferin brightness */
static int _param_undulation = 60;     /* 10..100: Bell rim ruffle frequency */
static int _param_bell_clarity = 75;   /* 20..100: Translucent gelatinous bell */

static float _pulse_time = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"bioluminescence_jellyfish\","
        "\"title\":\"Bioluminescent Medusa\","
        "\"category\":\"Abyssal Bio\","
        "\"spacing\":0.06,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Tentacle Length\",\"min\":20,\"max\":150,\"default\":70,\"unit\":\"px\"},"
            "{\"name\":\"Luciferin Glow\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Bell Undulation\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Umbrella Clarity\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    _pulse_time = 0.0f;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_tentacle_len = val; break;
        case 1: _param_glow_pulse = val; break;
        case 2: _param_undulation = val; break;
        case 3: _param_bell_clarity = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _pulse_time = 0.0f;
    w_brush_srand(0xB1011CE0 ^ (uint32_t)(x * 79.0f + y * 83.0f));
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
    _pulse_time += 0.15f * (1.0f + speed * 0.02f);

    float tentacle_len = (float)_param_tentacle_len * (0.5f + eff_p * 0.8f);
    float glow_boost = (float)_param_glow_pulse * 0.01f;
    float ruff_freq = (float)_param_undulation * 0.1f;
    float clarity = (float)_param_bell_clarity * 0.01f;

    float reach_r = radius + tentacle_len * 0.6f;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(reach_r + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    /* Direction opposite to stroke trajectory: trailing tentacles */
    float trail_x = -cos_a;
    float trail_y = -sin_a;
    float norm_x = -sin_a;
    float norm_y = cos_a;

    float inv_r_sq = 1.0f / (radius * radius);

    /* 1. Render Translucent Medusa Umbrella & Trailing Tendrils */
    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;

            float p_forward = dx * cos_a + dy * sin_a;
            float p_lateral = dx * norm_x + dy * norm_y;

            /* Check if within bell dome */
            if (dist_sq <= radius * radius) {
                float dist = w_sqrtf(dist_sq);
                float angle = w_sinf(p_lateral * ruff_freq + _pulse_time);
                float ruff_rad = radius * (0.85f + 0.15f * angle);

                if (dist <= ruff_rad) {
                    float bell_falloff = w_brush_falloff_smooth(dist * dist, inv_r_sq);
                    /* Rim margin highlight */
                    float rim = w_sinf((dist / ruff_rad) * 3.14159f);
                    float bell_alpha = (rim * 0.6f + (1.0f - dist / ruff_rad) * 0.4f) * clarity * eff_p;

                    uint32_t r = (uint32_t)(20.0f + 60.0f * rim);
                    uint32_t g = (uint32_t)(180.0f + 75.0f * rim);
                    uint32_t b = (uint32_t)(240.0f + 15.0f * rim);
                    uint32_t a = (uint32_t)(bell_alpha * 190.0f * glow_boost);
                    if (a > 255) a = 255;

                    uint32_t bell_c = w_color_pack(r, g, b, 255);
                    if (is_eraser) {
                        uint32_t dst = row[x];
                        uint32_t da = (dst >> 24) & 0xFF;
                        row[x] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
                    } else {
                        row[x] = w_brush_blend_add(bell_c, row[x], a);
                    }
                }
            }

            /* 2. Trailing Tentacle Ribbons */
            float p_behind = -p_forward;
            if (p_behind > 0.0f && p_behind < tentacle_len) {
                float t_ratio = p_behind / tentacle_len;
                /* Sinusoidal waving drift of tentacles */
                float t_wave = w_sinf(p_behind * 0.12f + _pulse_time * 2.0f) * radius * 0.35f * (1.0f - t_ratio);
                float lat_dist = p_lateral - t_wave;

                float tent_thick = (1.5f + (1.0f - t_ratio) * 2.0f);
                if (lat_dist * lat_dist < tent_thick * tent_thick) {
                    float t_alpha = (1.0f - t_ratio) * w_brush_falloff_smooth(lat_dist * lat_dist, 1.0f / (tent_thick * tent_thick));
                    uint32_t a = (uint32_t)(t_alpha * 220.0f * glow_boost * eff_p);
                    if (a > 255) a = 255;

                    uint32_t tent_c = w_color_pack(40, 220, 255, 255);
                    if (!is_eraser) {
                        row[x] = w_brush_blend_add(tent_c, row[x], a);
                    }
                }
            }
        }
    }

    /* 3. Bioluminescent Photophore Stinging Nodes */
    int nodes = 3 + (int)(eff_p * 4.0f);
    for (int i = 0; i < nodes; i++) {
        float f = (float)i / (float)nodes;
        float node_d = radius * (0.2f + 0.7f * f);
        float node_a = rad_ang + 3.14159f + w_brush_rand_symf() * 0.5f;
        int nx = (int)(cx + node_d * w_cosf(node_a));
        int ny = (int)(cy + node_d * w_sinf(node_a));

        if (nx >= 1 && nx < canvas_w - 1 && ny >= 1 && ny < canvas_h - 1) {
            uint32_t light = w_color_pack(150, 255, 255, 255);
            pixels[ny * canvas_w + nx] = w_brush_blend_add(light, pixels[ny * canvas_w + nx], 255);
        }
    }
}
