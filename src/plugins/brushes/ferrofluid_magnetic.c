/**
 * =========================================================================
 * Ferrofluid Spikes & Magnetic Rosensweig Instability (ferrofluid_magnetic.c)
 *
 * Real-time magnetic colloidal fluid simulation in C99:
 * - Solves 3D dipole magnetic field vector B(r) from stylus position and tilt
 * - Simulates normal-field Rosensweig instability with hexagonal wave interference
 * - Renders 3D conical spikes with metallic specular highlights and obsidian sheen
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_mag_field = 75;    /* 20..100: Magnetic field intensity (B) */
static int _param_sharpness = 80;    /* 10..100: Conical spike sharpness */
static int _param_tension = 50;      /* 10..100: Viscous surface tension */
static int _param_specular = 90;     /* 20..100: Metallic specular highlight */

static float _last_tilt_x = 0.0f;
static float _last_tilt_y = 0.0f;

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"ferrofluid_magnetic\","
        "\"title\":\"Ferrofluid Magnetic Spikes\","
        "\"category\":\"Magnetic Physics\","
        "\"spacing\":0.05,"
        "\"minRadius\":6,"
        "\"maxRadius\":150,"
        "\"params\":["
            "{\"name\":\"Magnetic Field\",\"min\":20,\"max\":100,\"default\":75,\"unit\":\"%\"},"
            "{\"name\":\"Spike Sharpness\",\"min\":10,\"max\":100,\"default\":80,\"unit\":\"%\"},"
            "{\"name\":\"Surface Tension\",\"min\":10,\"max\":100,\"default\":50,\"unit\":\"%\"},"
            "{\"name\":\"Metallic Specular\",\"min\":20,\"max\":100,\"default\":90,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {
}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_mag_field = val; break;
        case 1: _param_sharpness = val; break;
        case 2: _param_tension = val; break;
        case 3: _param_specular = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {
    _last_tilt_x = tilt_x;
    _last_tilt_y = tilt_y;
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

    float b_strength = ((float)_param_mag_field / 100.0f) * pressure * 1.5f;
    float sharpness = 1.0f + ((float)_param_sharpness / 100.0f) * 4.0f;
    float tension = ((float)_param_tension / 100.0f);
    float spec_strength = ((float)_param_specular / 100.0f);

    /* Magnetic dipole orientation influenced by stylus tilt */
    float mx = _last_tilt_x * 0.5f;
    float my = _last_tilt_y * 0.5f;
    float mz = 1.0f;

    /* Hexagonal Rosensweig wave numbers (120 deg apart) */
    float k_spacing = 0.45f * (20.0f / radius);
    if (k_spacing < 0.15f) k_spacing = 0.15f;
    if (k_spacing > 0.80f) k_spacing = 0.80f;

    float k1_x = k_spacing;
    float k1_y = 0.0f;
    float k2_x = -0.5f * k_spacing;
    float k2_y = 0.866025f * k_spacing;
    float k3_x = -0.5f * k_spacing;
    float k3_y = -0.866025f * k_spacing;

    int x0 = (int)(cx - radius - 2.0f); if (x0 < 0) x0 = 0;
    int y0 = (int)(cy - radius - 2.0f); if (y0 < 0) y0 = 0;
    int x1 = (int)(cx + radius + 2.0f); if (x1 >= canvas_w) x1 = canvas_w - 1;
    int y1 = (int)(cy + radius + 2.0f); if (y1 >= canvas_h) y1 = canvas_h - 1;

    float inv_r_sq = 1.0f / (radius * radius);

    uint32_t base_r = color & 0xFF;
    uint32_t base_g = (color >> 8) & 0xFF;
    uint32_t base_b = (color >> 16) & 0xFF;

    /* Obsidian oil base color */
    uint32_t oil_r = (base_r * 25) / 100;
    uint32_t oil_g = (base_g * 25) / 100;
    uint32_t oil_b = (base_b * 30 + 10 * 70) / 100;

    for (int y = y0; y <= y1; y++) {
        float fdy = (float)y - cy;
        float dy_sq = fdy * fdy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float fdx = (float)x - cx;
            float dist_sq = fdx * fdx + dy_sq;
            if (dist_sq > radius * radius) continue;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            if (falloff <= 0.0f) continue;

            /* 1. Hexagonal standing wave pattern (Rosensweig peaks) */
            float px = fdx - mx * radius * 0.3f;
            float py = fdy - my * radius * 0.3f;

            float w1 = w_cosf(k1_x * px + k1_y * py);
            float w2 = w_cosf(k2_x * px + k2_y * py);
            float w3 = w_cosf(k3_x * px + k3_y * py);

            /* Normalized height field: peaks where waves constructively interfere */
            float h = (w1 + w2 + w3 + 3.0f) * 0.166666f; /* in [0, 1] */
            h = w_fast_powf(h, sharpness) * b_strength * falloff;

            /* Surface tension smoothes valleys */
            float liquid_base = falloff * (0.35f + tension * 0.4f);
            float total_height = h + liquid_base;
            if (total_height > 1.0f) total_height = 1.0f;

            /* 2. 3D Surface normal computation from wave derivatives */
            float dw_dx = -(k1_x * w_sinf(k1_x * px) + k2_x * w_sinf(k2_x * px + k2_y * py) + k3_x * w_sinf(k3_x * px + k3_y * py));
            float dw_dy = -(k2_y * w_sinf(k2_x * px + k2_y * py) + k3_y * w_sinf(k3_x * px + k3_y * py));

            float nx = dw_dx * sharpness * 0.6f + mx * 0.2f;
            float ny = dw_dy * sharpness * 0.6f + my * 0.2f;
            float nz = 1.0f;
            float n_len = w_sqrtf(nx * nx + ny * ny + nz * nz);
            if (n_len > 0.001f) {
                float inv_nl = 1.0f / n_len;
                nx *= inv_nl;
                ny *= inv_nl;
                nz *= inv_nl;
            }

            /* 3. Blinn-Phong directional specular highlights (metallic peak reflections) */
            float light_x = -0.577f;
            float light_y = -0.577f;
            float light_z = 0.577f;

            float ndotl = nx * light_x + ny * light_y + nz * light_z;
            if (ndotl < 0.0f) ndotl = 0.0f;

            /* Half-vector for view vector (0, 0, 1) */
            float hx = light_x;
            float hy = light_y;
            float hz = light_z + 1.0f;
            float h_len = w_sqrtf(hx * hx + hy * hy + hz * hz);
            float ndoth = (nx * hx + ny * hy + nz * hz) / (h_len + 0.001f);
            if (ndoth < 0.0f) ndoth = 0.0f;

            float spec = w_fast_powf(ndoth, 24.0f) * spec_strength * 255.0f;
            float diffuse_amt = ndotl * 0.4f + 0.6f;

            /* Spike tips are accented with user brush tint + blinding white reflection */
            uint32_t r_out = (uint32_t)((float)oil_r * diffuse_amt + (float)base_r * h * 0.5f + spec);
            uint32_t g_out = (uint32_t)((float)oil_g * diffuse_amt + (float)base_g * h * 0.5f + spec);
            uint32_t b_out = (uint32_t)((float)oil_b * diffuse_amt + (float)base_b * h * 0.5f + spec);

            if (r_out > 255) r_out = 255;
            if (g_out > 255) g_out = 255;
            if (b_out > 255) b_out = 255;

            uint32_t alpha = (uint32_t)(total_height * pressure * 250.0f);
            if (alpha > 255) alpha = 255;
            if (alpha == 0) continue;

            uint32_t final_pix = w_color_pack(r_out, g_out, b_out, alpha);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                if (da > 0) {
                    uint32_t na = (da > alpha) ? da - alpha : 0;
                    row[x] = (na << 24) | (dst & 0x00FFFFFF);
                }
            } else {
                row[x] = w_brush_blend_over(final_pix, row[x], 255);
            }
        }
    }
}

void w_brush_stroke_end(void) {
}
