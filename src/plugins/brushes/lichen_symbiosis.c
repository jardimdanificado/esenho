/**
 * =========================================================================
 * Symbiotic Crustose Lichen & Foliose Thallus (lichen_symbiosis.c)
 *
 * Mutualistic fungal-algal colony growth & concentric thallus lobes in C99:
 * - Foliose lichen lobes expanding outwards with crenulate vegetative margins
 * - Microscopic fungal hyphae cortex with photobiont chlorophyll green zones
 * - Central apothecia fruiting discs with powdery soredia spore textures
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_lobe_scale = 10;     /* 4..24: Thallus lobe cluster size */
static int _param_algal_vibrance = 75; /* 20..100: Chlorophyll green saturation */
static int _param_apothecia = 50;      /* 0..100: Central spore disc density */
static int _param_crust_rough = 65;    /* 10..100: Stone cortex texture */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"lichen_symbiosis\","
        "\"title\":\"Symbiotic Lichen Colony\","
        "\"category\":\"Botanical\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Lobe Scale\",\"min\":4,\"max\":24,\"default\":10,\"unit\":\"px\"},"
            "{\"name\":\"Algal Vibrance\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Apothecia Discs\",\"min\":0,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Cortex Texture\",\"min\":10,\"max\":100,\"default\":65,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_lobe_scale = (val < 4) ? 4 : (val > 24 ? 24 : val); break;
        case 1: _param_algal_vibrance = val; break;
        case 2: _param_apothecia = val; break;
        case 3: _param_crust_rough = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x71C4E800 ^ (uint32_t)(x * 43.0f + y * 47.0f));
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

    float lobe_size = (float)_param_lobe_scale;
    float inv_lobe = 1.0f / lobe_size;
    float chlorophyll = (float)_param_algal_vibrance * 0.01f;
    float apothecia_str = (float)_param_apothecia * 0.01f;
    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float dist = w_sqrtf(dist_sq);

            /* Continuous space cellular lobe boundary */
            float sx = (float)x * inv_lobe;
            float sy = (float)y * inv_lobe;

            float l1 = w_sinf(sx * 1.1f + sy * 0.4f);
            float l2 = w_cosf(sx * -0.5f + sy * 0.9f);
            float lobe = l1 * l2;
            if (lobe < 0.0f) lobe = -lobe;

            /* Concentric zone: Central apothecia fruiting bodies vs peripheral green thallus */
            float norm_d = dist / radius;

            /* Lobe boundary crenulation */
            float cren = w_sinf(sx * 3.0f + sy * 2.5f) * 0.15f;
            if (lobe + cren > 0.48f) continue;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.01f) continue;

            uint32_t r, g, b;
            if (norm_d < 0.35f && apothecia_str > 0.15f && lobe < 0.2f) {
                /* Central apothecia cup: warm terracotta/orange-brown */
                r = 195;
                g = 110;
                b = 50;
            } else if (norm_d > 0.85f) {
                /* Dark prothallus border margin */
                r = 45;
                g = 55;
                b = 40;
            } else {
                /* Symbiotic algal-fungal vegetative thallus: sage/olive/mint lichen green */
                float algae = (1.0f - lobe * 2.0f);
                r = (uint32_t)(100.0f + 35.0f * (1.0f - chlorophyll));
                g = (uint32_t)(155.0f + 65.0f * chlorophyll * algae);
                b = (uint32_t)(85.0f + 40.0f * (1.0f - chlorophyll));
            }
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;

            uint32_t alpha = (uint32_t)(falloff * eff_p * 245.0f);
            if (alpha > 255) alpha = 255;

            uint32_t lichen_c = w_color_pack(r, g, b, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(lichen_c, row[x], alpha);
            }
        }
    }
}
