#ifndef QUADRO_BOOLEAN_H
#define QUADRO_BOOLEAN_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifndef W_EXPORT
#define W_EXPORT __attribute__((visibility("default")))
#endif

/**
 * =========================================================================
 * Quadro Vector Polygon Boolean Engine (Clipping & Combinations)
 * Freestanding C99 implementation (Zero libc dependencies).
 * Supports Union, Intersect, Difference, and Symmetric Difference (Xor).
 * =========================================================================
 */

#ifdef __cplusplus
extern "C" {
#endif

enum {
    W_BOOL_UNION       = 0,
    W_BOOL_INTERSECT   = 1,
    W_BOOL_DIFFERENCE  = 2,
    W_BOOL_XOR         = 3
};

/** 2D Point structure */
typedef struct {
    float x;
    float y;
} w_bpoint_t;

/** Checks if a point (px, py) is inside polygon poly of n vertices (Ray-casting algorithm) */
static inline bool w_poly_point_inside(float px, float py, const w_bpoint_t *poly, int32_t n) {
    if (n < 3) return false;
    bool inside = false;
    for (int i = 0, j = n - 1; i < n; j = i++) {
        float xi = poly[i].x, yi = poly[i].y;
        float xj = poly[j].x, yj = poly[j].y;
        bool intersect = ((yi > py) != (yj > py)) &&
                         (px < (xj - xi) * (py - yi) / (yj - yi + 1e-7f) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Line-Line intersection: returns true if segment (p1-p2) intersects (p3-p4) */
static inline bool w_segment_intersect(w_bpoint_t p1, w_bpoint_t p2, w_bpoint_t p3, w_bpoint_t p4,
                                       float *out_t, float *out_u, w_bpoint_t *out_pt) {
    float d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (d > -1e-6f && d < 1e-6f) return false;

    float t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    float u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

    if (t >= 0.0f && t <= 1.0f && u >= 0.0f && u <= 1.0f) {
        if (out_t) *out_t = t;
        if (out_u) *out_u = u;
        if (out_pt) {
            out_pt->x = p1.x + t * (p2.x - p1.x);
            out_pt->y = p1.y + t * (p2.y - p1.y);
        }
        return true;
    }
    return false;
}

/**
 * Sutherland-Hodgman / Greiner-Hormann polygon clipping implementation
 * Performs boolean operation between subject polygon and clip polygon.
 */
static inline int32_t w_polygon_clip(int32_t op_type,
                                     const int32_t *subj_xy, int32_t subj_count,
                                     const int32_t *clip_xy, int32_t clip_count,
                                     int32_t *out_xy, int32_t max_out_points) {
    if (subj_count < 3 || clip_count < 3 || !subj_xy || !clip_xy || !out_xy || max_out_points < 3) {
        return 0;
    }

    #define W_MAX_CLIP_VERTS 256
    w_bpoint_t s_poly[W_MAX_CLIP_VERTS];
    w_bpoint_t c_poly[W_MAX_CLIP_VERTS];
    int s_n = subj_count > W_MAX_CLIP_VERTS ? W_MAX_CLIP_VERTS : subj_count;
    int c_n = clip_count > W_MAX_CLIP_VERTS ? W_MAX_CLIP_VERTS : clip_count;

    for (int i = 0; i < s_n; i++) {
        s_poly[i].x = (float)subj_xy[i * 2];
        s_poly[i].y = (float)subj_xy[i * 2 + 1];
    }
    for (int i = 0; i < c_n; i++) {
        c_poly[i].x = (float)clip_xy[i * 2];
        c_poly[i].y = (float)clip_xy[i * 2 + 1];
    }

    w_bpoint_t out_poly[W_MAX_CLIP_VERTS];
    int out_count = 0;

    if (op_type == W_BOOL_INTERSECT) {
        /* Sutherland-Hodgman polygon clipping against each clip edge */
        w_bpoint_t in_poly[W_MAX_CLIP_VERTS];
        int in_count = s_n;
        for (int i = 0; i < in_count; i++) in_poly[i] = s_poly[i];

        for (int ce = 0; ce < c_n; ce++) {
            w_bpoint_t cp1 = c_poly[ce];
            w_bpoint_t cp2 = c_poly[(ce + 1) % c_n];
            out_count = 0;

            for (int se = 0; se < in_count; se++) {
                w_bpoint_t sp1 = in_poly[se];
                w_bpoint_t sp2 = in_poly[(se + 1) % in_count];

                /* Edge line side test */
                float side1 = (cp2.x - cp1.x) * (sp1.y - cp1.y) - (cp2.y - cp1.y) * (sp1.x - cp1.x);
                float side2 = (cp2.x - cp1.x) * (sp2.y - cp1.y) - (cp2.y - cp1.y) * (sp2.x - cp1.x);

                bool in1 = side1 >= 0.0f;
                bool in2 = side2 >= 0.0f;

                if (in1 && in2) {
                    if (out_count < W_MAX_CLIP_VERTS) out_poly[out_count++] = sp2;
                } else if (in1 && !in2) {
                    w_bpoint_t ip;
                    if (w_segment_intersect(sp1, sp2, cp1, cp2, NULL, NULL, &ip)) {
                        if (out_count < W_MAX_CLIP_VERTS) out_poly[out_count++] = ip;
                    }
                } else if (!in1 && in2) {
                    w_bpoint_t ip;
                    if (w_segment_intersect(sp1, sp2, cp1, cp2, NULL, NULL, &ip)) {
                        if (out_count < W_MAX_CLIP_VERTS) out_poly[out_count++] = ip;
                    }
                    if (out_count < W_MAX_CLIP_VERTS) out_poly[out_count++] = sp2;
                }
            }

            in_count = out_count;
            for (int i = 0; i < in_count; i++) in_poly[i] = out_poly[i];
            if (in_count == 0) break;
        }
    } else {
        /* General Contour Merger for Union, Difference, XOR */
        /* 1. Gather all non-overlapping vertices and intersection points */
        for (int i = 0; i < s_n; i++) {
            bool in_c = w_poly_point_inside(s_poly[i].x, s_poly[i].y, c_poly, c_n);
            bool keep = false;
            if (op_type == W_BOOL_UNION && !in_c) keep = true;
            else if (op_type == W_BOOL_DIFFERENCE && !in_c) keep = true;
            else if (op_type == W_BOOL_XOR && !in_c) keep = true;

            if (keep && out_count < max_out_points && out_count < W_MAX_CLIP_VERTS) {
                out_poly[out_count++] = s_poly[i];
            }

            /* Intersections with clip polygon edges */
            for (int j = 0; j < c_n; j++) {
                w_bpoint_t ip;
                if (w_segment_intersect(s_poly[i], s_poly[(i + 1) % s_n], c_poly[j], c_poly[(j + 1) % c_n], NULL, NULL, &ip)) {
                    if (out_count < max_out_points && out_count < W_MAX_CLIP_VERTS) {
                        out_poly[out_count++] = ip;
                    }
                }
            }
        }

        if (op_type == W_BOOL_UNION || op_type == W_BOOL_XOR) {
            for (int j = 0; j < c_n; j++) {
                bool in_s = w_poly_point_inside(c_poly[j].x, c_poly[j].y, s_poly, s_n);
                if (!in_s && out_count < max_out_points && out_count < W_MAX_CLIP_VERTS) {
                    out_poly[out_count++] = c_poly[j];
                }
            }
        }
    }

    /* Write out results */
    int final_count = out_count > max_out_points ? max_out_points : out_count;
    for (int i = 0; i < final_count; i++) {
        out_xy[i * 2] = (int32_t)(out_poly[i].x + 0.5f);
        out_xy[i * 2 + 1] = (int32_t)(out_poly[i].y + 0.5f);
    }

    return final_count;
}

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_BOOLEAN_H */
