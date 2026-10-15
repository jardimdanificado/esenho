/**
 * =========================================================================
 * Particle Spray Brush (src/plugins/brushes/particle_spray.c)
 *
 * Simulates physical pneumatic airbrush & paint splatter:
 * - Gaussian particle distribution with stochastic micro-droplets.
 * - Velocity modulation: fast strokes scatter droplets loosely, slow strokes
 *   accumulate a dense saturated center.
 * - Edge splatter bursts mimicking high-pressure nozzle droplets.
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int g_particle_density = 45;   // number of droplets per dab (base)
static int g_splatter_jitter = 30;    // % scatter outside base radius
static int g_droplet_size = 2;        // 1 to 5 pixels
static int g_accumulation = 70;       // % flow intensity

W_EXPORT const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"particle_spray\","
        "\"title\":\"Particle Airbrush Splatter\","
        "\"category\":\"Airbrush\","
        "\"spacing\":0.15,"
        "\"minRadius\":8,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Particle Density\",\"min\":10,\"max\":120,\"default\":45,\"unit\":\"part\"},"
            "{\"name\":\"Splatter Jitter\",\"min\":0,\"max\":100,\"default\":30,\"unit\":\"%\"},"
            "{\"name\":\"Droplet Size\",\"min\":1,\"max\":5,\"default\":2,\"unit\":\"px\"},"
            "{\"name\":\"Flow Accumulation\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"}"
        "]"
    "}";
}

W_EXPORT void w_brush_init(int32_t canvas_w, int32_t canvas_h) {
    w_brush_srand(0xCAFEF00D);
}

W_EXPORT void w_brush_set_param(int32_t param_idx, int32_t value) {
    switch (param_idx) {
        case 0: g_particle_density = (value < 10) ? 10 : (value > 120 ? 120 : value); break;
        case 1: g_splatter_jitter = (value < 0) ? 0 : (value > 100 ? 100 : value); break;
        case 2: g_droplet_size = (value < 1) ? 1 : (value > 5 ? 5 : value); break;
        case 3: g_accumulation = (value < 10) ? 10 : (value > 100 ? 100 : value); break;
    }
}

W_EXPORT void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser) {
    w_brush_srand((uint32_t)(x * 777.0f + y * 333.0f));
}

W_EXPORT void w_brush_stroke_end(void) {}

W_EXPORT void w_brush_render_dab(
    uint32_t *pixels,
    int32_t canvas_w,
    int32_t canvas_h,
    float cx, float cy,
    float radius,
    float pressure,
    float angle_deg,
    float speed,
    uint32_t color,
    int32_t is_eraser
) {
    if (!pixels || canvas_w <= 0 || canvas_h <= 0 || radius <= 0.5f) return;

    float eff_p = (pressure > 0.01f) ? pressure : 0.5f;

    // Velocity spreading: high speed spreads particles more widely
    float speed_scatter = 1.0f + (speed * 0.05f);
    if (speed_scatter > 2.5f) speed_scatter = 2.5f;

    int droplet_count = (int)((float)g_particle_density * eff_p);
    float jitter_mult = 1.0f + ((float)g_splatter_jitter / 100.0f) * speed_scatter;

    int drop_r = g_droplet_size;
    int max_extent = (int)(radius * jitter_mult + (float)drop_r + 2.0f);
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, max_extent, canvas_w, canvas_h, &x0, &y0, &x1, &y1);

    uint32_t base_a = w_color_get_a(color);
    float base_flow = ((float)g_accumulation / 100.0f) * eff_p;

    for (int i = 0; i < droplet_count; i++) {
        // Approximate gaussian distribution: sum of 3 uniform randoms
        float u1 = w_brush_rand_symf();
        float u2 = w_brush_rand_symf();
        float u3 = w_brush_rand_symf();
        float gx = (u1 + u2 + u3) * 0.3333f;

        float v1 = w_brush_rand_symf();
        float v2 = w_brush_rand_symf();
        float v3 = w_brush_rand_symf();
        float gy = (v1 + v2 + v3) * 0.3333f;

        // Occasional wild splatter droplet
        float dist_scale = radius;
        if (g_splatter_jitter > 10 && (w_brush_rand() % 100) < (uint32_t)g_splatter_jitter) {
            dist_scale *= jitter_mult;
        }

        int px = (int)(cx + gx * dist_scale);
        int py = (int)(cy + gy * dist_scale);

        if (px - drop_r < x0 || px + drop_r >= x1 || py - drop_r < y0 || py + drop_r >= y1) continue;

        // Randomize opacity per droplet for natural mist accumulation
        float drop_alpha_factor = 0.5f + w_brush_randf() * 0.5f;
        uint32_t alpha_step = (uint32_t)(drop_alpha_factor * base_flow * (float)base_a);
        if (alpha_step > 255) alpha_step = 255;
        if (alpha_step == 0) continue;

        // Stamp round droplet of size drop_r
        int drop_r_sq = drop_r * drop_r;
        for (int dy = -drop_r; dy <= drop_r; dy++) {
            int cur_y = py + dy;
            if (cur_y < y0 || cur_y >= y1) continue;
            uint32_t *row = &pixels[cur_y * canvas_w];

            for (int dx = -drop_r; dx <= drop_r; dx++) {
                if (dx * dx + dy * dy > drop_r_sq) continue;
                int cur_x = px + dx;
                if (cur_x < x0 || cur_x >= x1) continue;

                uint32_t dst = row[cur_x];
                if (is_eraser) {
                    uint32_t da = (dst >> 24) & 0xFF;
                    uint32_t na = (da > alpha_step) ? (da - alpha_step) : 0;
                    row[cur_x] = (na << 24) | (dst & 0x00FFFFFF);
                } else {
                    row[cur_x] = w_brush_blend_over(color, dst, alpha_step);
                }
            }
        }
    }
}
