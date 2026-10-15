/**
 * =========================================================================
 * Bioluminescent Mycelium & Slime Mold Growth (mycelium_hyphae.c)
 *
 * Real-time Physarum polycephalum / fungal hyphae network simulation in C99:
 * - Autonomous chemotactic agents exploring canvas with sensory guidance
 * - Steers toward existing canvas pigments to form organic mycorrhizal bridges
 * - Renders branching fungal root networks with bioluminescent enzymatic glow
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define MAX_AGENTS 64

typedef struct {
    float x, y;
    float angle;
    float speed;
    float vitality;
    int active;
} HyphaeAgent;

static HyphaeAgent _agents[MAX_AGENTS];
static int _agent_count = 0;

static int _param_spores = 32;       /* 16..64: Number of active exploratory tips */
static int _param_chemotaxis = 70;   /* 10..100: Attraction to existing canvas paint */
static int _param_branching = 60;    /* 10..100: Branching / bifurcation rate */
static int _param_biolum = 85;       /* 20..100: Bioluminescent glow intensity */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"mycelium_hyphae\","
        "\"title\":\"Bioluminescent Mycelium\","
        "\"category\":\"Living Simulation\","
        "\"spacing\":0.05,"
        "\"minRadius\":5,"
        "\"maxRadius\":140,"
        "\"params\":["
            "{\"name\":\"Active Spores\",\"min\":16,\"max\":64,\"default\":32,\"unit\":\"tips\"},"
            "{\"name\":\"Chemotaxis Attraction\",\"min\":10,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Branching Rate\",\"min\":10,\"max\":100,\"default\":60,\"unit\":\"%\"},"
            "{\"name\":\"Bioluminescent Glow\",\"min\":20,\"max\":100,\"default\":85,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    _agent_count = 0;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_spores = val; break;
        case 1: _param_chemotaxis = val; break;
        case 2: _param_branching = val; break;
        case 3: _param_biolum = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    w_brush_srand(0x5113E401 ^ (uint32_t)(x * 67.0f + y * 71.0f));

    _agent_count = _param_spores;
    if (_agent_count > MAX_AGENTS) _agent_count = MAX_AGENTS;

    for (int i = 0; i < _agent_count; i++) {
        _agents[i].x = x + w_brush_rand_symf() * 4.0f;
        _agents[i].y = y + w_brush_rand_symf() * 4.0f;
        _agents[i].angle = w_brush_randf() * 6.283185f;
        _agents[i].speed = 1.5f + w_brush_randf() * 2.0f;
        _agents[i].vitality = 1.0f;
        _agents[i].active = 1;
    }
}

static inline float sense_nutrient(uint32_t *pixels, int cw, int ch, float sx, float sy) {
    int ix = (int)sx;
    int iy = (int)sy;
    if (ix < 0 || ix >= cw || iy < 0 || iy >= ch) return 0.0f;
    uint32_t p = pixels[iy * cw + ix];
    uint32_t a = (p >> 24) & 0xFF;
    if (a < 10) return 0.1f;
    /* Nutrients = alpha + luminance richness */
    uint32_t r = p & 0xFF;
    uint32_t g = (p >> 8) & 0xFF;
    uint32_t b = (p >> 16) & 0xFF;
    float lum = (float)(r + g * 2 + b) * 0.000976f;
    return ((float)a * 0.00392f) * (0.5f + lum * 0.5f);
}

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
    if (radius < 2.0f) radius = 2.0f;

    float sensor_dist = radius * 0.55f;
    float sensor_angle = 0.45f; /* ~26 degrees */
    float chemo_pull = ((float)_param_chemotaxis / 100.0f) * 0.35f;
    float branch_prob = ((float)_param_branching / 100.0f) * 0.20f;
    float glow_boost = ((float)_param_biolum / 100.0f);

    uint32_t tint_r = color & 0xFF;
    uint32_t tint_g = (color >> 8) & 0xFF;
    uint32_t tint_b = (color >> 16) & 0xFF;

    /* Bioluminescent enzyme color: neon cyan/green tinted with user color */
    uint32_t bio_r = (tint_r * 40 + 20 * 60) / 100;
    uint32_t bio_g = (tint_g * 60 + 255 * 40) / 100;
    uint32_t bio_b = (tint_b * 60 + 220 * 40) / 100;

    int steps_per_dab = 4;

    for (int step = 0; step < steps_per_dab; step++) {
        for (int i = 0; i < _agent_count; i++) {
            if (!_agents[i].active) {
                /* Respawn inactive agent near current brush center */
                if (w_brush_randf() < 0.25f) {
                    _agents[i].x = cx + w_brush_rand_symf() * radius * 0.5f;
                    _agents[i].y = cy + w_brush_rand_symf() * radius * 0.5f;
                    _agents[i].angle = w_brush_randf() * 6.283185f;
                    _agents[i].vitality = 1.0f;
                    _agents[i].active = 1;
                }
                continue;
            }

            HyphaeAgent *ag = &_agents[i];

            /* 1. Sensory Chemotaxis: sample left, center, right */
            float ang = ag->angle;
            float left_x = ag->x + sensor_dist * w_cosf(ang - sensor_angle);
            float left_y = ag->y + sensor_dist * w_sinf(ang - sensor_angle);
            float fwd_x  = ag->x + sensor_dist * w_cosf(ang);
            float fwd_y  = ag->y + sensor_dist * w_sinf(ang);
            float rgt_x  = ag->x + sensor_dist * w_cosf(ang + sensor_angle);
            float rgt_y  = ag->y + sensor_dist * w_sinf(ang + sensor_angle);

            float s_left = sense_nutrient(pixels, canvas_w, canvas_h, left_x, left_y);
            float s_fwd  = sense_nutrient(pixels, canvas_w, canvas_h, fwd_x, fwd_y);
            float s_rgt  = sense_nutrient(pixels, canvas_w, canvas_h, rgt_x, rgt_y);

            /* Steer toward strongest nutrient concentration */
            if (s_fwd > s_left && s_fwd > s_rgt) {
                /* Keep straight */
            } else if (s_left > s_rgt) {
                ag->angle -= chemo_pull + w_brush_randf() * 0.1f;
            } else if (s_rgt > s_left) {
                ag->angle += chemo_pull + w_brush_randf() * 0.1f;
            } else {
                /* Random Brownian wiggle */
                ag->angle += w_brush_rand_symf() * 0.25f;
            }

            /* Pull slightly toward brush center to keep colony coherent */
            float to_cx = cx - ag->x;
            float to_cy = cy - ag->y;
            float dist_to_brush = w_sqrtf(to_cx * to_cx + to_cy * to_cy);
            if (dist_to_brush > radius * 1.4f) {
                float center_ang = w_atan2f(to_cy, to_cx);
                ag->angle = center_ang + w_brush_rand_symf() * 0.4f;
            }

            /* 2. Move hypha forward */
            float old_x = ag->x;
            float old_y = ag->y;
            ag->x += ag->speed * w_cosf(ag->angle);
            ag->y += ag->speed * w_sinf(ag->angle);

            /* 3. Deposit bioluminescent root segment into canvas memory */
            int px0 = (int)old_x;
            int py0 = (int)old_y;
            int px1 = (int)ag->x;
            int py1 = (int)ag->y;

            int min_x = px0 < px1 ? px0 : px1; if (min_x < 1) min_x = 1;
            int max_x = px0 > px1 ? px0 : px1; if (max_x >= canvas_w - 1) max_x = canvas_w - 2;
            int min_y = py0 < py1 ? py0 : py1; if (min_y < 1) min_y = 1;
            int max_y = py0 > py1 ? py0 : py1; if (max_y >= canvas_h - 1) max_y = canvas_h - 2;

            for (int y = min_y - 1; y <= max_y + 1; y++) {
                uint32_t *row = pixels + (y * canvas_w);
                for (int x = min_x - 1; x <= max_x + 1; x++) {
                    float fdx = (float)x - ag->x;
                    float fdy = (float)y - ag->y;
                    float d_sq = fdx * fdx + fdy * fdy;
                    if (d_sq > 4.5f) continue;

                    float falloff = 1.0f - (d_sq / 4.5f);
                    uint32_t alpha = (uint32_t)(falloff * pressure * ag->vitality * 230.0f);
                    if (alpha == 0) continue;

                    uint32_t core_pix = w_color_pack(bio_r, bio_g, bio_b, alpha);

                    if (is_eraser) {
                        uint32_t dst = row[x];
                        uint32_t da = (dst >> 24) & 0xFF;
                        if (da > 0) {
                            uint32_t na = (da > alpha) ? da - alpha : 0;
                            row[x] = (na << 24) | (dst & 0x00FFFFFF);
                        }
                    } else {
                        /* Additive glow + alpha blend */
                        if (glow_boost > 0.5f) {
                            row[x] = w_brush_blend_add(core_pix, row[x], (uint32_t)(glow_boost * 255.0f));
                        } else {
                            row[x] = w_brush_blend_over(core_pix, row[x], 255);
                        }
                    }
                }
            }

            /* 4. Branching bifurcation */
            if (w_brush_randf() < branch_prob) {
                /* Find an inactive agent slot to spawn child branch */
                for (int k = 0; k < MAX_AGENTS; k++) {
                    if (!_agents[k].active) {
                        _agents[k].x = ag->x;
                        _agents[k].y = ag->y;
                        _agents[k].angle = ag->angle + (w_brush_randf() > 0.5f ? 0.65f : -0.65f);
                        _agents[k].speed = ag->speed * 0.9f;
                        _agents[k].vitality = ag->vitality * 0.85f;
                        _agents[k].active = 1;
                        break;
                    }
                }
            }

            ag->vitality -= 0.015f;
            if (ag->vitality <= 0.05f) {
                ag->active = 0;
            }
        }
    }
}

void w_brush_stroke_end(void) {
    for (int i = 0; i < MAX_AGENTS; i++) {
        _agents[i].vitality *= 0.5f;
    }
}
