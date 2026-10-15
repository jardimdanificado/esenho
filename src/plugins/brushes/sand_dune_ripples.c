/**
 * =========================================================================
 * Aeolian Desert Sand Ripples & Dune Shadows (sand_dune_ripples.c)
 *
 * Wind shear sedimentary dynamics & asymmetric ripple fields in C99:
 * - Wind-formed transverse ripple crests perpendicular to stroke wind vector
 * - Asymmetric stoss (gentle windward) and slip-face (steep leeward) slope profiles
 * - Dynamic shadow cast along ripple troughs with granular mineral texture
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_ripple_pitch = 10;   /* 4..24: Ripple wavelength in pixels */
static int _param_slope_relief = 75;   /* 20..100: 3D shadow relief */
static int _param_grain_rough = 60;    /* 10..100: Sand grain texture */
static int _param_dune_warmth = 80;    /* 20..100: Golden terracotta warmth */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"sand_dune_ripples\","
        "\"title\":\"Desert Sand Dune Ripples\","
        "\"category\":\"Sedimentary\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Ripple Pitch\",\"min\":4,\"max\":24,\"default\":10,\"unit\":\"px\"},"
            "{\"name\":\"Slope Relief\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Grain Texture\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Dune Warmth\",\"min\":20,\"max\":100,\"default\":80,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_ripple_pitch = (val < 4) ? 4 : (val > 24 ? 24 : val); break;
        case 1: _param_slope_relief = val; break;
        case 2: _param_grain_rough = val; break;
        case 3: _param_dune_warmth = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0xD0E0E000 ^ (uint32_t)(x * 31.0f + y * 41.0f));
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

    float pitch = (float)_param_ripple_pitch;
    float inv_pitch = 1.0f / pitch;
    float relief_str = (float)_param_slope_relief * 0.01f;
    float grain_str = (float)_param_grain_rough * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    float rad_ang = angle_deg * 0.0174532925f;
    float cos_a = w_cosf(rad_ang);
    float sin_a = w_sinf(rad_ang);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            /* Align ripples perpendicular to stroke wind direction */
            float proj_wind = dx * cos_a + dy * sin_a;
            float proj_trans = -dx * sin_a + dy * cos_a;

            /* Continuous space wave position */
            float wave_phase = (proj_wind * inv_pitch * 6.2831853f) + w_sinf(proj_trans * 0.08f) * 0.6f;
            float wave_sin = w_sinf(wave_phase);

            /* Asymmetric dune ripple slope: steep slip-face vs gentle crest */
            float slope = (wave_sin > 0.0f) ? (wave_sin * 0.8f) : (wave_sin * 1.4f);

            /* Micro sand grain noise */
            uint32_t g_hash = ((uint32_t)x * 0x45D9F3B) ^ ((uint32_t)y * 0x119DE1F);
            float grain = ((float)(g_hash & 0xFF) / 255.0f - 0.5f) * grain_str * 0.25f;

            float light = 0.7f + slope * 0.4f * relief_str + grain;
            if (light < 0.2f) light = 0.2f;
            if (light > 1.3f) light = 1.3f;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            /* Warm desert sand tint: golden ochre to burnt umber in shadows */
            uint32_t r = (uint32_t)(230.0f * light);
            uint32_t g = (uint32_t)(175.0f * light);
            uint32_t b = (uint32_t)(100.0f * light * 0.85f);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 245.0f);
            if (alpha > 255) alpha = 255;

            uint32_t sand_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(sand_c, row[x], alpha);
            }
        }
    }
}
