#ifndef QUADRO_NATURAL_BRUSH_H
#define QUADRO_NATURAL_BRUSH_H
#include "quadro_brush_plugin.h"

/* Material models share paper and compositing, not a random particle stamp.
   All texture is anchored in canvas space. State is reset at stroke begin.
   Wet pickup is a local paint approximation, not a fluid or spectral solver. */
enum { N_GRAPHITE, N_COLORED, N_PASTEL, N_CRAYON, N_DIP_PEN, N_MARKER, N_GOUACHE, N_DRY_FLAT };
static float n_last_x, n_last_y, n_charge = 1.0f;
static uint32_t n_carry;
static int n_started;
static float n_clamp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static float n_abs(float v) { return v < 0 ? -v : v; }
static void n_begin(float x, float y, uint32_t color) {
    n_last_x = x; n_last_y = y; n_charge = 1.0f; n_carry = color; n_started = 1;
}
static void n_render(int kind, const int *params, uint32_t *pixels, int w, int h,
                     float cx, float cy, float radius, float pressure, float angle,
                     uint32_t color, int eraser) {
    if (!pixels || w <= 0 || h <= 0 || !(radius > 0) || !(pressure > 0) || !w_color_get_a(color)) return;
    float p = n_clamp(pressure, 0, 1);
    if (!n_started) n_begin(cx, cy, color);
    float dx = cx - n_last_x, dy = cy - n_last_y;
    float travel = w_sqrtf(dx*dx + dy*dy);
    n_last_x = cx; n_last_y = cy;
    float rx = radius, ry = radius;
    float rad = angle * 0.0174532925f;
    if (kind <= N_CRAYON) {
        rx *= (kind == N_GRAPHITE ? 0.28f : 0.55f) + (kind == N_GRAPHITE ? 0.72f : 0.45f)*p;
        ry = rx * (kind == N_PASTEL ? 0.60f : (kind == N_CRAYON ? 0.78f : 1.0f));
    } else if (kind == N_DIP_PEN) {
        rx *= 0.12f + 0.88f*p;
        ry = rx * (0.22f + 0.78f*(params[2]*0.01f));
        rad = params[1] * 0.0174532925f;
    } else if (kind == N_MARKER) {
        rx *= 0.92f + 0.08f*p;
        ry = rx * params[2]*0.01f;
        rad = params[1] * 0.0174532925f;
    } else {
        rx *= 0.65f + 0.35f*p; ry = rx * 0.38f;
        rad += 1.570796327f;
        n_charge = n_clamp(n_charge - travel * params[3]*0.0004f/(radius+1), 0.02f, 1);
        /* Sample before writing so pickup has no scan direction bias. */
        int sx = (int)cx, sy = (int)cy;
        if (!eraser && sx >= 0 && sx < w && sy >= 0 && sy < h && params[2] > 0) {
            uint32_t under = pixels[sy*w+sx];
            if (w_color_get_a(under) > 0) {
                int pickup = (int)(params[2] * w_color_get_a(under) / 255u);
                n_carry = w_brush_blend_pigment(under, n_carry, pickup / 4);
            }
        }
    }
    rx = rx < 0.45f ? 0.45f : rx; ry = ry < 0.4f ? 0.4f : ry;
    float cs = w_cosf(rad), sn = w_sinf(rad);
    float bound = w_sqrtf(rx*rx + ry*ry) + 1;
    int x0,y0,x1,y1;
    w_brush_compute_bounds((int)cx,(int)cy,(int)bound+1,w,h,&x0,&y0,&x1,&y1);
    for (int y=y0; y<y1; ++y) for (int x=x0; x<x1; ++x) {
        float ux = (x+0.5f-cx)*cs + (y+0.5f-cy)*sn;
        float uy = -(x+0.5f-cx)*sn + (y+0.5f-cy)*cs;
        float qx = n_abs(ux)/rx, qy = n_abs(uy)/ry;
        float q = (kind == N_MARKER || kind >= N_GOUACHE) ? (qx > qy ? qx : qy) : w_sqrtf(qx*qx + qy*qy);
        float edge = n_clamp((1-q)*(ry < rx ? ry : rx)+0.5f, 0, 1);
        if (edge <= 0) continue;
        float coverage;
        uint32_t paint = color;
        if (kind <= N_CRAYON) {
            float rough = params[0]*0.01f, load = params[1]*0.01f, hardness = params[2]*0.01f;
            float tooth = w_brush_paper(x+0.5f,y+0.5f,(float)params[3]);
            float threshold = rough*(0.18f + 0.65f*(1-p)) + hardness*0.12f;
            float deposit = n_clamp((tooth-threshold)/(1-threshold), 0, 1);
            if (kind == N_GRAPHITE) coverage = deposit*load*p*(0.10f+0.13f*(1-hardness));
            else if (kind == N_COLORED) coverage = deposit*load*p*0.18f;
            else if (kind == N_PASTEL) coverage = w_sqrtf(deposit)*load*p*0.34f;
            else coverage = n_clamp(deposit*2.0f,0,1)*load*p*0.28f;
            coverage *= edge;
        } else if (kind == N_DIP_PEN || kind == N_MARKER) {
            float tooth = w_brush_paper(x,y,2);
            float feather = 1 - params[3]*0.004f*(1-tooth);
            coverage = edge * params[0]*0.01f * feather;
            coverage *= kind == N_DIP_PEN ? (0.25f + 0.75f*p) : 0.065f;
        } else {
            float strand = w_brush_paper(ux, 31.7f, 1.4f);
            float separation = params[1]*0.01f;
            float paper = w_brush_paper(x,y,2.3f);
            float dry = kind == N_DRY_FLAT ? n_clamp((paper-0.20f-(1-p)*0.35f)*2,0,1) : 0.80f+0.20f*paper;
            coverage = edge * (1-separation + separation*strand*strand) * dry * n_charge * p * params[0]*0.01f;
            coverage *= kind == N_GOUACHE ? 0.48f : 0.28f;
            paint = (w_brush_blend_pigment(n_carry,color,params[2]) & 0x00FFFFFFu) | (color & 0xFF000000u);
        }
        uint32_t alpha = (uint32_t)(n_clamp(coverage,0,1)*255.0f+0.5f);
        if (alpha) pixels[y*w+x] = eraser ? w_brush_erase(pixels[y*w+x], color, alpha) : w_brush_blend_over(paint,pixels[y*w+x],alpha);
    }
}
#endif
