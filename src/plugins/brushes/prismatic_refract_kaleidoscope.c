/**
 * =========================================================================
 * Internal Specular Mirror Kaleidoscope (prismatic_refract_kaleidoscope.c)
 *
 * 60-degree triangular specular mirror reflection of canvas pixels in C99:
 * - Real-time dihedral group $D_6$ folding and reflection of underlying artwork
 * - Equilateral triangular mirror chamber with total internal reflection
 * - Prismatic bevel chromatic dispersion along mirror seams
 * =========================================================================
 */

#include "quadro_brush_plugin.h"

static int _param_fold_sectors = 6;    /* 3..12: Dihedral mirror fold count */
static int _param_zoom_scale = 100;    /* 50..200: Kaleidoscope zoom % */
static int _param_seam_glow = 70;      /* 0..100: Mirror seam bevel radiance */
static int _param_spin_rate = 45;      /* 0..100: Chamber rotation angle */

const char* w_brush_get_info(void) {
    return "{"
        "\"name\":\"prismatic_refract_kaleidoscope\","
        "\"title\":\"Specular Mirror Kaleidoscope\","
        "\"category\":\"Geometric Optics\","
        "\"spacing\":0.05,"
        "\"minRadius\":8,"
        "\"maxRadius\":160,"
        "\"params\":["
            "{\"name\":\"Mirror Slices\",\"min\":3,\"max\":12,\"default\":6,\"unit\":\"folds\"},"
            "{\"name\":\"Chamber Zoom\",\"min\":50,\"max\":200,\"default\":100,\"unit\":\"%\"},"
            "{\"name\":\"Seam Bevel Glow\",\"min\":0,\"max\":100,\"default\":70,\"unit\":\"%\"},"
            "{\"name\":\"Mirror Rotation\",\"min\":0,\"max\":100,\"default\":45,\"unit\":\"%\"}"
        "]"
    "}";
}

void w_brush_init(int canvas_w, int canvas_h) {}

void w_brush_set_param(int param_idx, int val) {
    switch (param_idx) {
        case 0: _param_fold_sectors = (val < 3) ? 3 : (val > 12 ? 12 : val); break;
        case 1: _param_zoom_scale = val; break;
        case 2: _param_seam_glow = val; break;
        case 3: _param_spin_rate = val; break;
    }
}

void w_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int is_eraser) {}
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

    int folds = _param_fold_sectors;
    float sector_ang = 6.2831853f / (float)folds;
    float inv_sector = 1.0f / sector_ang;

    float zoom = (float)_param_zoom_scale * 0.01f;
    float seam_boost = (float)_param_seam_glow * 0.01f;
    float spin = (float)_param_spin_rate * 0.062831853f;
    float inv_r_sq = 1.0f / (radius * radius);

    for (int y = y0; y <= y1; y++) {
        float dy = (float)y - cy;
        uint32_t *row = pixels + (y * canvas_w);

        for (int x = x0; x <= x1; x++) {
            float dx = (float)x - cx;
            float dist_sq = dx * dx + dy * dy;
            if (dist_sq > radius * radius) continue;

            float r = w_sqrtf(dist_sq);
            if (r < 0.001f) continue;

            /* Polar angle $\theta$ */
            float theta = w_sinf(dx / r) + spin;

            /* Sector fold index */
            float sector_t = theta * inv_sector;
            int s_idx = (int)w_floorf(sector_t);
            float frac_ang = (sector_t - (float)s_idx) * sector_ang;

            /* Mirror reflection fold: alternate sectors are flipped */
            if (s_idx & 1) {
                frac_ang = sector_ang - frac_ang;
            }

            /* Reconstructed mirrored source point on canvas */
            float fold_ang = frac_ang + spin;
            int src_x = (int)(cx + r * zoom * w_cosf(fold_ang));
            int src_y = (int)(cy + r * zoom * w_sinf(fold_ang));

            if (src_x < 0) src_x = 0; else if (src_x >= canvas_w) src_x = canvas_w - 1;
            if (src_y < 0) src_y = 0; else if (src_y >= canvas_h) src_y = canvas_h - 1;

            uint32_t sampled_px = pixels[src_y * canvas_w + src_x];

            /* Mirror seam line glint */
            float dist_to_seam = frac_ang;
            if (dist_to_seam > sector_ang * 0.5f) dist_to_seam = sector_ang - dist_to_seam;
            float seam_glint = 0.0f;
            if (dist_to_seam < 0.06f) {
                seam_glint = (1.0f - dist_to_seam / 0.06f) * seam_boost * 60.0f;
            }

            uint32_t r_val = w_color_get_r(sampled_px);
            uint32_t g_val = w_color_get_g(sampled_px);
            uint32_t b_val = w_color_get_b(sampled_px);

            r_val = (uint32_t)((float)r_val + seam_glint);
            g_val = (uint32_t)((float)g_val + seam_glint);
            b_val = (uint32_t)((float)b_val + seam_glint * 1.4f);
            if (r_val > 255) r_val = 255;
            if (g_val > 255) g_val = 255;
            if (b_val > 255) b_val = 255;

            float falloff = w_brush_falloff_smooth(dist_sq, inv_r_sq);
            uint32_t alpha = (uint32_t)(falloff * eff_p * 255.0f);
            if (alpha > 255) alpha = 255;

            uint32_t kaleido_c = w_color_pack(r_val, g_val, b_val, 255);

            if (is_eraser) {
                uint32_t dst = row[x];
                uint32_t da = (dst >> 24) & 0xFF;
                row[x] = ((da > alpha ? da - alpha : 0) << 24) | (dst & 0x00FFFFFF);
            } else {
                row[x] = w_brush_blend_over(kaleido_c, row[x], alpha);
            }
        }
    }
}
