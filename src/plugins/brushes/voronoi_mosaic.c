/**
 * =========================================================================
 * Cellular Voronoi Stained Glass & Crystal Fractures (voronoi_mosaic.c)
 *
 * Real-time Worley/Voronoi cellular decomposition & facetization in C99:
 * - Continuous spatial Worley lattice eliminating circular dab seams
 * - Dual-order distance came borders (F2 - F1)
 * - Hermite cubic boundary feathering
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

#define MAX_SEEDS 64

typedef struct {
    float x, y;
    uint32_t color;
} VoronoiSeed;

static VoronoiSeed _seeds[MAX_SEEDS];
static int _num_seeds = 0;

static int _param_density = 20;     /* 6..48: Number of Voronoi seed cells */
static int _param_border_th = 3;    /* 1..10: Border thickness in pixels */
static int _param_bevel = 70;       /* 0..100: 3D Facet bevel lighting */
static int _param_border_mode = 0;  /* 0=Dark Lead, 1=Gold Leaf, 2=Glass Frost */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"voronoi_mosaic\","
        "\"title\":\"Voronoi Crystal Stained Glass\","
        "\"category\":\"Cellular Geometry\","
        "\"spacing\":0.06,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Cell Density\",\"min\":6,\"max\":48,\"default\":20,\"unit\":\"cells\"},"
            "{\"name\":\"Border Thickness\",\"min\":1,\"max\":10,\"default\":3,\"unit\":\"px\"},"
            "{\"name\":\"3D Facet Bevel\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Border Style (0=Lead 1=Gold 2=Frost)\",\"min\":0,\"max\":2,\"default\":0,\"unit\":\"mode\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
    _num_seeds = 0;
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_density = val; break;
        case 1: _param_border_th = val; break;
        case 2: _param_bevel = val; break;
        case 3: _param_border_mode = (val < 0) ? 0 : (val > 2 ? 2 : val); break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _num_seeds = 0;
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
    if (radius < 4.0f) radius = 4.0f;

    int density = _param_density;
    if (density < 6) density = 6;
    if (density > 48) density = 48;

    uint32_t tint_r = color & 0xFF;
    uint32_t tint_g = (color >> 8) & 0xFF;
    uint32_t tint_b = (color >> 16) & 0xFF;

    float cell_size = radius * (20.0f / (float)density);
    if (cell_size < 10.0f) cell_size = 10.0f;

    int x0 = (int)(cx - radius); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - radius); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + radius); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + radius); if (y1 >= canvas_h) y1 = canvas_h - 1;

    /* Continuous spatial grid seed generation ensuring seamless stroke overlap */
    int gx0 = (int)w_floorf((float)x0 / cell_size) - 1;
    int gy0 = (int)w_floorf((float)y0 / cell_size) - 1;
    int gx1 = (int)w_floorf((float)x1 / cell_size) + 1;
    int gy1 = (int)w_floorf((float)y1 / cell_size) + 1;

    _num_seeds = 0;
    for (int gy = gy0; gy <= gy1 && _num_seeds < MAX_SEEDS; gy++) {
        for (int gx = gx0; gx <= gx1 && _num_seeds < MAX_SEEDS; gx++) {
            uint32_t h = ((uint32_t)gx * 1597334677U) ^ ((uint32_t)gy * 3812015801U);
            float ox = 0.15f + 0.70f * (float)(h & 0x3FF) * (1.0f / 1024.0f);
            float oy = 0.15f + 0.70f * (float)((h >> 10) & 0x3FF) * (1.0f / 1024.0f);
            float sx = ((float)gx + ox) * cell_size;
            float sy = ((float)gy + oy) * cell_size;

            int isx = (int)sx; if (isx < 0) isx = 0; else if (isx >= canvas_w) isx = canvas_w - 1;
            int isy = (int)sy; if (isy < 0) isy = 0; else if (isy >= canvas_h) isy = canvas_h - 1;

            _seeds[_num_seeds].x = sx;
            _seeds[_num_seeds].y = sy;

            uint32_t sampled = pixels[isy * canvas_w + isx];
            uint32_t sa = (sampled >> 24) & 0xFF;
            if (sa > 30) {
                uint32_t sr = sampled & 0xFF, sg = (sampled >> 8) & 0xFF, sb = (sampled >> 16) & 0xFF;
                uint32_t mr = (sr * 55 + tint_r * 45) / 100;
                uint32_t mg = (sg * 55 + tint_g * 45) / 100;
                uint32_t mb = (sb * 55 + tint_b * 45) / 100;
                _seeds[_num_seeds].color = w_color_pack(mr, mg, mb, 255);
            } else {
                int jitter = (int)(((int)((h >> 20) & 0x3F) - 32) * 0.75f);
                int fr = (int)tint_r + jitter; if (fr < 0) fr = 0; else if (fr > 255) fr = 255;
                int fg = (int)tint_g + jitter; if (fg < 0) fg = 0; else if (fg > 255) fg = 255;
                int fb = (int)tint_b + jitter; if (fb < 0) fb = 0; else if (fb > 255) fb = 255;
                _seeds[_num_seeds].color = w_color_pack((uint32_t)fr, (uint32_t)fg, (uint32_t)fb, 255);
            }
            _num_seeds++;
        }
    }

    float inv_r_sq = 1.0f / (radius * radius);
    float border_th = (float)_param_border_th;
    float bevel_strength = ((float)_param_bevel / 100.0f);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        float dy_sq = dy * dy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy_sq;
            if (dist_sq > radius * radius) continue;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            float weight = falloff * pressure;

            /* Compute two closest Voronoi seeds (F1 and F2) */
            float f1 = 1e9f;
            float f2 = 1e9f;
            int best_seed = 0;

            for (int s = 0; s < _num_seeds; s++) {
                float sx = _seeds[s].x - (float)x;
                float sy = _seeds[s].y - (float)y;
                float d = sx * sx + sy * sy;

                if (d < f1) {
                    f2 = f1;
                    f1 = d;
                    best_seed = s;
                } else if (d < f2) {
                    f2 = d;
                }
            }

            float dist_f1 = w_sqrtf(f1);
            float dist_f2 = w_sqrtf(f2);
            float delta_f = dist_f2 - dist_f1;

            uint32_t out_pixel;

            /* Lead came / fracture border check */
            if (delta_f < border_th) {
                float border_alpha = 1.0f - (delta_f / border_th);
                if (_param_border_mode == 0) {
                    /* Dark Charcoal / Leaded Stained Glass Came */
                    uint32_t lead_val = (uint32_t)(25.0f * (1.0f - border_alpha * 0.5f));
                    out_pixel = w_color_pack(lead_val, lead_val, lead_val + 2, (uint32_t)(250.0f * weight));
                } else if (_param_border_mode == 1) {
                    /* Gold Leaf Kintsugi Came */
                    uint32_t gold_r = 245;
                    uint32_t gold_g = 195;
                    uint32_t gold_b = 65;
                    out_pixel = w_color_pack(gold_r, gold_g, gold_b, (uint32_t)(255.0f * weight));
                } else {
                    /* Glass Frost / Crystal Edge */
                    out_pixel = w_color_pack(240, 245, 255, (uint32_t)(240.0f * border_alpha * weight));
                }
            } else {
                /* Facet Interior with 3D Bevel Directional Shading */
                VoronoiSeed *seed = &_seeds[best_seed];
                uint32_t fc = seed->color;
                uint32_t fr = fc & 0xFF;
                uint32_t fg = (fc >> 8) & 0xFF;
                uint32_t fb = (fc >> 16) & 0xFF;

                /* Directional normal pointing from seed center */
                float nx = ((float)x - seed->x);
                float ny = ((float)y - seed->y);
                float n_len = nx * nx + ny * ny;
                if (n_len > 0.001f) {
                    float inv_nl = 1.0f / w_sqrtf(n_len);
                    nx *= inv_nl;
                    ny *= inv_nl;
                }

                /* Directional bevel lighting from top-left light (-0.707, -0.707) */
                float light = -(nx * 0.707f + ny * 0.707f) * bevel_strength;
                int r_lit = (int)((float)fr * (1.0f + light * 0.45f));
                int g_lit = (int)((float)fg * (1.0f + light * 0.45f));
                int b_lit = (int)((float)fb * (1.0f + light * 0.45f));

                if (r_lit < 0) r_lit = 0; else if (r_lit > 255) r_lit = 255;
                if (g_lit < 0) g_lit = 0; else if (g_lit > 255) g_lit = 255;
                if (b_lit < 0) b_lit = 0; else if (b_lit > 255) b_lit = 255;

                uint32_t facet_alpha = (uint32_t)(weight * 240.0f);
                out_pixel = w_color_pack((uint32_t)r_lit, (uint32_t)g_lit, (uint32_t)b_lit, facet_alpha);
            }

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t ea = (uint32_t)(weight * 255.0f);
                    uint32_t na = (da > ea) ? da - ea : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_over(out_pixel, row[x], 255);
            }
        }
    }
}

void w_brush_stroke_end(void) {
}
