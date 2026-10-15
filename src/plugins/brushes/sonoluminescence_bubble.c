/**
 * =========================================================================
 * Acoustic Cavitation Collapse & Sonoluminescence (sonoluminescence_bubble.c)
 *
 * Ultrasonic bubble implosion & extreme picosecond light emission in C99:
 * - Ultrasonic standing acoustic pressure waves compressing microbubbles
 * - Violent Rayleigh-Plesset cavitation collapse (adiabatic heating > 15,000 K)
 * - Picosecond flashes of extreme ultraviolet & violet bremsstrahlung luminescence
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_acoustic_freq = 60;  /* 20..120: Ultrasonic standing wave pitch */
static int _param_collapse_flash = 90; /* 20..100: Peak star-temperature flash brilliance */
static int _param_bubble_density = 50; /* 10..100: Cavitation bubble site frequency */
static int _param_shock_wave = 70;     /* 10..100: Acoustic shock ring width */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"sonoluminescence_bubble\","
        "\"title\":\"Sonoluminescence Flash\","
        "\"category\":\"Acousto-Optics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Acoustic Frequency\",\"min\":20,\"max\":120,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Flash Brilliance\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"},"
            "{\"name\":\"Bubble Density\",\"min\":10,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Shock Rings\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_acoustic_freq = val; break;
        case 1: _param_collapse_flash = val; break;
        case 2: _param_bubble_density = val; break;
        case 3: _param_shock_wave = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x50B01000 ^ (uint32_t)(x * 67.0f + y * 73.0f));
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
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(radius + 2.0f), canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    float freq = (float)_param_acoustic_freq * 0.02f;
    float flash_k = (float)_param_collapse_flash * 0.01f;
    float shock_k = (float)_param_shock_wave * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    /* 1. Acoustic Pressure Standing Wave Rings */
    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float r = w_sqrtf(dist_sq);

            /* Concentric acoustic standing wave profile */
            float sound_wave = w_sinf(r * freq);
            sound_wave = sound_wave * sound_wave * sound_wave * sound_wave; /* sharp peaks */

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float acoustic_alpha = sound_wave * falloff * shock_k * eff_p;
            if (acoustic_alpha <= 0.01f) continue;

            uint32_t a = (uint32_t)(acoustic_alpha * 190.0f);
            if (a > 255) a = 255;

            uint32_t acoustic_c = w_color_pack(40, 160, 255, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > a ? da - a : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_add(acoustic_c, row[x], a);
            }
        }
    }

    /* 2. Microbubble Implosion Star-Flashes */
    int flashes = 1 + (int)(((float)_param_bubble_density * 0.01f) * 4.0f * eff_p);
    for (int f = 0; f < flashes; f++) {
        float f_d = radius * 0.65f * w_sqrtf(w_brush_randf());
        float f_a = w_brush_randf() * 6.2831853f;
        int fx = (int)(cx + f_d * w_cosf(f_a));
        int fy = (int)(cy + f_d * w_sinf(f_a));

        if (fx >= 2 && fx < canvas_w - 2 && fy >= 2 && fy < canvas_h - 2) {
            uint32_t star_flash = w_color_pack(255, 255, 255, 255);
            uint32_t uv_corona = w_color_pack(190, 210, 255, 255);

            pixels[fy * canvas_w + fx] = star_flash;

            /* Sub-pixel flash corona */
            for (int dy = -1; dy <= 1; dy++) {
                for (int dx = -1; dx <= 1; dx++) {
                    if (dx == 0 && dy == 0) continue;
                    int cx2 = fx + dx;
                    int cy2 = fy + dy;
                    uint32_t a = (uint32_t)(255.0f * flash_k);
                    pixels[cy2 * canvas_w + cx2] = w_brush_blend_add(uv_corona, pixels[cy2 * canvas_w + cx2], a);
                }
            }
        }
    }
}
