/**
 * =========================================================================
 * Tesla Plasma Globe & High-Voltage Filaments (plasma_ball_arc.c)
 *
 * Inert gas dielectric discharge & capacitive plasma streamers in C99:
 * - High-voltage central electrode emitting stochastic electric filaments
 * - Streamers termination at glass boundary with capacitive touch point attraction
 * - Violet-magenta inner beam with luminous cyan surface contact nodes
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_filaments = 6;       /* 2..12: Number of plasma streamers */
static int _param_jitter = 70;         /* 10..100: Filament curl & snake jitter */
static int _param_core_glow = 85;      /* 20..100: Central electrode radiance */
static int _param_touch_hotspot = 80;  /* 10..100: Perimeter touch focus */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"plasma_ball_arc\","
        "\"title\":\"Tesla Plasma Globe\","
        "\"category\":\"Electrical\","
        "\"spacing\":0.06,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Streamer Count\",\"min\":2,\"max\":12,\"default\":6,\"unit\":\"filaments\"},"
            "{\"name\":\"Filament Jitter\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Electrode Glow\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"},"
            "{\"name\":\"Touch Hotspot\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_filaments = val; break;
        case 1: _param_jitter = val; break;
        case 2: _param_core_glow = val; break;
        case 3: _param_touch_hotspot = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x7E51A000 ^ (uint32_t)(x * 79.0f + y * 97.0f));
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
    int num_filaments = _param_filaments;
    if (num_filaments < 2) num_filaments = 2;
    if (num_filaments > 12) num_filaments = 12;

    float jitter_scale = (float)_param_jitter * 0.01f;
    float core_boost = (float)_param_core_glow * 0.01f;

    /* 1. Central glowing high-voltage electrode */
    float electrode_r = radius * 0.22f;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;

            if (dist_sq <= electrode_r * electrode_r) {
                float falloff = 1.0f - (dist_sq / (electrode_r * electrode_r));
                falloff = falloff * falloff;
                uint32_t a = (uint32_t)(falloff * 255.0f * core_boost);
                if (a > 255) a = 255;

                uint32_t elec_c = w_color_pack(240, 160, 255, 255);
                if (is_eraser) {
                    uint32_t dst = row[x];
                    uint32_t da = (dst >> 24) & 0xFF;
                    row[x] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
                } else {
                    row[x] = w_brush_blend_add(elec_c, row[x], a);
                }
            }
        }
    }

    /* 2. Procedural filaments reaching out to perimeter */
    for (int f = 0; f < num_filaments; f++) {
        float base_ang = ((float)f / (float)num_filaments) * 6.2831853f;
        float target_r = radius * (0.85f + 0.15f * w_brush_randf());
        float cur_x = cx;
        float cur_y = cy;

        int segments = 10;
        float seg_len = target_r / (float)segments;

        for (int s = 0; s < segments; s++) {
            float frac = (float)(s + 1) / (float)segments;
            float ang = base_ang + w_sinf(frac * 4.0f + (float)f) * 0.45f * jitter_scale;
            float next_x = cx + target_r * frac * w_cosf(ang);
            float next_y = cy + target_r * frac * w_sinf(ang);

            int px = (int)next_x;
            int py = (int)next_y;

            if (px >= 1 && px < canvas_w - 1 && py >= 1 && py < canvas_h - 1) {
                /* Color transitions from deep magenta near electrode to electric cyan at edge */
                uint32_t r = (uint32_t)(255.0f * (1.0f - frac * 0.6f));
                uint32_t g = (uint32_t)(100.0f + frac * 155.0f);
                uint32_t b = (uint32_t)(255.0f);
                uint32_t streamer_c = w_color_pack(r, g, b, 255);

                uint32_t a = (uint32_t)(220.0f * eff_p);
                pixels[py * canvas_w + px] = w_brush_blend_add(streamer_c, pixels[py * canvas_w + px], a);

                /* Contact node spark at edge */
                if (s == segments - 1) {
                    uint32_t contact_c = w_color_pack(180, 255, 255, 255);
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dx = -1; dx <= 1; dx++) {
                            int cx2 = px + dx;
                            int cy2 = py + dy;
                            if (cx2 >= 0 && cx2 < canvas_w && cy2 >= 0 && cy2 < canvas_h) {
                                pixels[cy2 * canvas_w + cx2] = w_brush_blend_add(contact_c, pixels[cy2 * canvas_w + cx2], 255);
                            }
                        }
                    }
                }
            }

            cur_x = next_x;
            cur_y = next_y;
        }
    }
}
