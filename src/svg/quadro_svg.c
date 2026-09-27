#include "quadro_svg.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <math.h>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* =========================================================================
 * 2D Affine Matrix Helpers
 * ========================================================================= */

static inline quadro_matrix_t quadro_matrix_identity(void) {
    quadro_matrix_t m = { 1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f };
    return m;
}

static inline quadro_matrix_t quadro_matrix_multiply(quadro_matrix_t a, quadro_matrix_t b) {
    quadro_matrix_t r;
    r.a = a.a * b.a + a.c * b.b;
    r.b = a.b * b.a + a.d * b.b;
    r.c = a.a * b.c + a.c * b.d;
    r.d = a.b * b.c + a.d * b.d;
    r.e = a.a * b.e + a.c * b.f + a.e;
    r.f = a.b * b.e + a.d * b.f + a.f;
    return r;
}

static inline void transform_point(const quadro_matrix_t *mat, float x, float y, float *ox, float *oy) {
    if (!mat) {
        *ox = x;
        *oy = y;
        return;
    }
    *ox = mat->a * x + mat->c * y + mat->e;
    *oy = mat->b * x + mat->d * y + mat->f;
}

/* =========================================================================
 * Color & Style Parsing
 * ========================================================================= */

static uint32_t parse_color_hex(const char *str) {
    if (*str == '#') str++;
    size_t len = strlen(str);
    unsigned int r = 0, g = 0, b = 0, a = 255;
    if (len == 3) {
        sscanf(str, "%1x%1x%1x", &r, &g, &b);
        r = r * 17; g = g * 17; b = b * 17;
    } else if (len == 6) {
        sscanf(str, "%2x%2x%2x", &r, &g, &b);
    } else if (len == 8) {
        sscanf(str, "%2x%2x%2x%2x", &r, &g, &b, &a);
    }
    return ((a & 0xFF) << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
}

static uint32_t parse_color(const char *val, int *has_color) {
    if (!val || !*val || strcmp(val, "none") == 0 || strcmp(val, "transparent") == 0) {
        if (has_color) *has_color = 0;
        return 0;
    }
    if (has_color) *has_color = 1;

    while (*val == ' ') val++;
    if (*val == '#') {
        return parse_color_hex(val);
    }
    if (strncmp(val, "rgb", 3) == 0) {
        int r = 0, g = 0, b = 0;
        float a = 1.0f;
        const char *p = strchr(val, '(');
        if (p) {
            if (strncmp(val, "rgba", 4) == 0) {
                sscanf(p + 1, "%d , %d , %d , %f", &r, &g, &b, &a);
            } else {
                sscanf(p + 1, "%d , %d , %d", &r, &g, &b);
            }
        }
        uint32_t ua = (uint32_t)(a * 255.0f);
        if (ua > 255) ua = 255;
        return (ua << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
    }

    /* Named colors */
    struct { const char *name; uint32_t color; } NAMED[] = {
        { "black",   0xFF000000 }, { "white",   0xFFFFFFFF },
        { "red",     0xFF0000FF }, { "green",   0xFF008000 },
        { "lime",    0xFF00FF00 }, { "blue",    0xFFFF0000 },
        { "yellow",  0xFF00FFFF }, { "cyan",    0xFFFFFF00 },
        { "magenta", 0xFFFF00FF }, { "gray",    0xFF808080 },
        { "grey",    0xFF808080 }, { "orange",  0xFF00A5FF },
        { "purple",  0xFF800080 }, { "brown",   0xFF2A2AA5 },
        { "gold",    0xFF00D7FF }, { "silver",  0xFFC0C0C0 },
        { "navy",    0xFF800000 }, { "teal",    0xFF808000 }
    };
    for (size_t i = 0; i < sizeof(NAMED) / sizeof(NAMED[0]); i++) {
        if (strcasecmp(val, NAMED[i].name) == 0) {
            return NAMED[i].color;
        }
    }
    return 0xFF000000; /* Fallback black */
}

static void apply_style_property(quadro_svg_style_t *st, const char *key, const char *val) {
    if (strcmp(key, "fill") == 0) {
        st->fill_color = parse_color(val, &st->has_fill);
    } else if (strcmp(key, "stroke") == 0) {
        st->stroke_color = parse_color(val, &st->has_stroke);
    } else if (strcmp(key, "stroke-width") == 0) {
        st->stroke_width = (float)atof(val);
    } else if (strcmp(key, "opacity") == 0) {
        st->opacity = (float)atof(val);
    } else if (strcmp(key, "fill-opacity") == 0) {
        st->fill_opacity = (float)atof(val);
    } else if (strcmp(key, "stroke-opacity") == 0) {
        st->stroke_opacity = (float)atof(val);
    } else if (strcmp(key, "fill-rule") == 0) {
        if (strcmp(val, "evenodd") == 0) st->fill_rule = 1;
        else st->fill_rule = 0;
    } else if (strcmp(key, "stroke-linecap") == 0) {
        if (strcmp(val, "round") == 0) st->cap_style = 1;
        else if (strcmp(val, "square") == 0) st->cap_style = 2;
        else st->cap_style = 0;
    } else if (strcmp(key, "stroke-linejoin") == 0) {
        if (strcmp(val, "round") == 0) st->join_style = 1;
        else if (strcmp(val, "bevel") == 0) st->join_style = 2;
        else st->join_style = 0;
    }
}

static void parse_css_style(quadro_svg_style_t *st, const char *style_str) {
    if (!style_str) return;
    char buf[1024];
    strncpy(buf, style_str, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = 0;

    char *saveptr = NULL;
    char *token = strtok_r(buf, ";", &saveptr);
    while (token) {
        char *colon = strchr(token, ':');
        if (colon) {
            *colon = 0;
            char *k = token;
            char *v = colon + 1;
            while (*k == ' ') k++;
            char *kend = k + strlen(k) - 1;
            while (kend > k && *kend == ' ') *kend-- = 0;

            while (*v == ' ') v++;
            char *vend = v + strlen(v) - 1;
            while (vend > v && *vend == ' ') *vend-- = 0;

            apply_style_property(st, k, v);
        }
        token = strtok_r(NULL, ";", &saveptr);
    }
}

/* =========================================================================
 * Transform Parser
 * ========================================================================= */

static quadro_matrix_t parse_transform(const char *str) {
    quadro_matrix_t res = quadro_matrix_identity();
    if (!str) return res;

    const char *p = str;
    while (*p) {
        while (*p == ' ' || *p == ',') p++;
        if (!*p) break;

        if (strncmp(p, "matrix", 6) == 0) {
            p = strchr(p, '(');
            if (!p) break;
            p++;
            float a, b, c, d, e, f;
            if (sscanf(p, "%f%*[ ,]%f%*[ ,]%f%*[ ,]%f%*[ ,]%f%*[ ,]%f", &a, &b, &c, &d, &e, &f) == 6) {
                quadro_matrix_t m = { a, b, c, d, e, f };
                res = quadro_matrix_multiply(res, m);
            }
            p = strchr(p, ')');
            if (p) p++;
        } else if (strncmp(p, "translate", 9) == 0) {
            p = strchr(p, '(');
            if (!p) break;
            p++;
            float tx = 0, ty = 0;
            sscanf(p, "%f%*[ ,]%f", &tx, &ty);
            quadro_matrix_t m = { 1, 0, 0, 1, tx, ty };
            res = quadro_matrix_multiply(res, m);
            p = strchr(p, ')');
            if (p) p++;
        } else if (strncmp(p, "scale", 5) == 0) {
            p = strchr(p, '(');
            if (!p) break;
            p++;
            float sx = 1, sy = 1;
            int count = sscanf(p, "%f%*[ ,]%f", &sx, &sy);
            if (count == 1) sy = sx;
            quadro_matrix_t m = { sx, 0, 0, sy, 0, 0 };
            res = quadro_matrix_multiply(res, m);
            p = strchr(p, ')');
            if (p) p++;
        } else if (strncmp(p, "rotate", 6) == 0) {
            p = strchr(p, '(');
            if (!p) break;
            p++;
            float deg = 0, cx = 0, cy = 0;
            int count = sscanf(p, "%f%*[ ,]%f%*[ ,]%f", &deg, &cx, &cy);
            float rad = deg * (float)M_PI / 180.0f;
            float cos_a = cosf(rad);
            float sin_a = sinf(rad);
            if (count >= 3) {
                quadro_matrix_t t1 = { 1, 0, 0, 1, cx, cy };
                quadro_matrix_t rot = { cos_a, sin_a, -sin_a, cos_a, 0, 0 };
                quadro_matrix_t t2 = { 1, 0, 0, 1, -cx, -cy };
                res = quadro_matrix_multiply(res, t1);
                res = quadro_matrix_multiply(res, rot);
                res = quadro_matrix_multiply(res, t2);
            } else {
                quadro_matrix_t rot = { cos_a, sin_a, -sin_a, cos_a, 0, 0 };
                res = quadro_matrix_multiply(res, rot);
            }
            p = strchr(p, ')');
            if (p) p++;
        } else {
            p++;
        }
    }
    return res;
}

/* =========================================================================
 * Path `d` Number Tokenizer & Arc Decomposer
 * ========================================================================= */

static const char *parse_number(const char *s, float *out_val) {
    while (*s == ' ' || *s == ',' || *s == '\t' || *s == '\r' || *s == '\n') s++;
    if (!*s) return NULL;
    char *endptr = NULL;
    *out_val = strtof(s, &endptr);
    if (endptr == s) return NULL;
    return endptr;
}

/* Elliptical Arc to Cubic Bézier Segments */
static void emit_arc_cubics(float x0, float y0, float rx, float ry, float angle_deg,
                           int large_arc, int sweep, float x1, float y1, const quadro_matrix_t *mat) {
    if (rx <= 0.0f || ry <= 0.0f) {
        float tx, ty;
        transform_point(mat, x1, y1, &tx, &ty);
        w_path_line_to(tx, ty);
        return;
    }

    rx = fabsf(rx);
    ry = fabsf(ry);
    float phi = angle_deg * (float)M_PI / 180.0f;
    float cos_phi = cosf(phi);
    float sin_phi = sinf(phi);

    float dx2 = (x0 - x1) / 2.0f;
    float dy2 = (y0 - y1) / 2.0f;
    float x1p = cos_phi * dx2 + sin_phi * dy2;
    float y1p = -sin_phi * dx2 + cos_phi * dy2;

    float prx = rx * rx;
    float pry = ry * ry;
    float px1 = x1p * x1p;
    float py1 = y1p * y1p;

    float check = px1 / prx + py1 / pry;
    if (check > 1.0f) {
        float scale = sqrtf(check);
        rx *= scale;
        ry *= scale;
        prx = rx * rx;
        pry = ry * ry;
    }

    float sign = (large_arc == sweep) ? -1.0f : 1.0f;
    float num = prx * pry - prx * py1 - pry * px1;
    float denom = prx * py1 + pry * px1;
    float factor = 0.0f;
    if (denom > 1e-6f && num > 0.0f) {
        factor = sign * sqrtf(num / denom);
    }
    float cxp = factor * (rx * y1p / ry);
    float cyp = factor * (-ry * x1p / rx);

    float cx = cos_phi * cxp - sin_phi * cyp + (x0 + x1) / 2.0f;
    float cy = sin_phi * cxp + cos_phi * cyp + (y0 + y1) / 2.0f;

    float ux = (x1p - cxp) / rx;
    float uy = (y1p - cyp) / ry;
    float vx = (-x1p - cxp) / rx;
    float vy = (-y1p - cyp) / ry;

    float theta1 = atan2f(uy, ux);
    float dtheta = atan2f(ux * vy - uy * vx, ux * vx + uy * vy);

    if (!sweep && dtheta > 0) dtheta -= 2.0f * (float)M_PI;
    else if (sweep && dtheta < 0) dtheta += 2.0f * (float)M_PI;

    int segments = (int)ceilf(fabsf(dtheta) / ((float)M_PI / 2.0f));
    if (segments < 1) segments = 1;
    float delta = dtheta / (float)segments;
    float t = theta1;

    for (int i = 0; i < segments; i++) {
        float next_t = t + delta;
        float alpha = sinf(delta) * (sqrtf(4.0f + 3.0f * tanf(delta / 2.0f) * tanf(delta / 2.0f)) - 1.0f) / 3.0f;

        float p0x = rx * cosf(t), p0y = ry * sinf(t);
        float p1x = rx * cosf(next_t), p1y = ry * sinf(next_t);

        float cp1x = p0x - alpha * rx * sinf(t);
        float cp1y = p0y + alpha * ry * cosf(t);
        float cp2x = p1x + alpha * rx * sinf(next_t);
        float cp2y = p1y - alpha * ry * cosf(next_t);

        // Rotate and translate
        float q1x = cos_phi * cp1x - sin_phi * cp1y + cx;
        float q1y = sin_phi * cp1x + cos_phi * cp1y + cy;
        float q2x = cos_phi * cp2x - sin_phi * cp2y + cx;
        float q2y = sin_phi * cp2x + cos_phi * cp2y + cy;
        float q3x = cos_phi * p1x - sin_phi * p1y + cx;
        float q3y = sin_phi * p1x + cos_phi * p1y + cy;

        float t1x, t1y, t2x, t2y, t3x, t3y;
        transform_point(mat, q1x, q1y, &t1x, &t1y);
        transform_point(mat, q2x, q2y, &t2x, &t2y);
        transform_point(mat, q3x, q3y, &t3x, &t3y);

        w_path_cubic_to(t1x, t1y, t2x, t2y, t3x, t3y);
        t = next_t;
    }
}

/* Parse SVG path `d` string */
static void parse_path_d(const char *d, const quadro_matrix_t *mat) {
    if (!d) return;
    const char *p = d;

    float cur_x = 0, cur_y = 0;
    float start_x = 0, start_y = 0;
    float last_cpx = 0, last_cpy = 0;
    char cmd = 0;

    while (*p) {
        while (*p == ' ' || *p == ',' || *p == '\t' || *p == '\r' || *p == '\n') p++;
        if (!*p) break;

        if (isalpha(*p)) {
            cmd = *p++;
        }

        switch (cmd) {
            case 'M':
            case 'm': {
                float x, y;
                p = parse_number(p, &x); if (!p) break;
                p = parse_number(p, &y); if (!p) break;
                if (cmd == 'm') { x += cur_x; y += cur_y; }
                cur_x = start_x = last_cpx = x;
                cur_y = start_y = last_cpy = y;
                float tx, ty;
                transform_point(mat, cur_x, cur_y, &tx, &ty);
                w_path_move_to(tx, ty);
                cmd = (cmd == 'm') ? 'l' : 'L'; /* Subsequent coords are lines */
                break;
            }
            case 'L':
            case 'l': {
                float x, y;
                p = parse_number(p, &x); if (!p) break;
                p = parse_number(p, &y); if (!p) break;
                if (cmd == 'l') { x += cur_x; y += cur_y; }
                cur_x = last_cpx = x;
                cur_y = last_cpy = y;
                float tx, ty;
                transform_point(mat, cur_x, cur_y, &tx, &ty);
                w_path_line_to(tx, ty);
                break;
            }
            case 'H':
            case 'h': {
                float x;
                p = parse_number(p, &x); if (!p) break;
                if (cmd == 'h') x += cur_x;
                cur_x = last_cpx = x;
                float tx, ty;
                transform_point(mat, cur_x, cur_y, &tx, &ty);
                w_path_line_to(tx, ty);
                break;
            }
            case 'V':
            case 'v': {
                float y;
                p = parse_number(p, &y); if (!p) break;
                if (cmd == 'v') y += cur_y;
                cur_y = last_cpy = y;
                float tx, ty;
                transform_point(mat, cur_x, cur_y, &tx, &ty);
                w_path_line_to(tx, ty);
                break;
            }
            case 'C':
            case 'c': {
                float x1, y1, x2, y2, x, y;
                p = parse_number(p, &x1); if (!p) break;
                p = parse_number(p, &y1); if (!p) break;
                p = parse_number(p, &x2); if (!p) break;
                p = parse_number(p, &y2); if (!p) break;
                p = parse_number(p, &x);  if (!p) break;
                p = parse_number(p, &y);  if (!p) break;
                if (cmd == 'c') {
                    x1 += cur_x; y1 += cur_y;
                    x2 += cur_x; y2 += cur_y;
                    x  += cur_x; y  += cur_y;
                }
                last_cpx = x2;
                last_cpy = y2;
                cur_x = x;
                cur_y = y;
                float t1x, t1y, t2x, t2y, tx, ty;
                transform_point(mat, x1, y1, &t1x, &t1y);
                transform_point(mat, x2, y2, &t2x, &t2y);
                transform_point(mat, x,  y,  &tx,  &ty);
                w_path_cubic_to(t1x, t1y, t2x, t2y, tx, ty);
                break;
            }
            case 'S':
            case 's': {
                float x2, y2, x, y;
                p = parse_number(p, &x2); if (!p) break;
                p = parse_number(p, &y2); if (!p) break;
                p = parse_number(p, &x);  if (!p) break;
                p = parse_number(p, &y);  if (!p) break;
                if (cmd == 's') {
                    x2 += cur_x; y2 += cur_y;
                    x  += cur_x; y  += cur_y;
                }
                float x1 = 2.0f * cur_x - last_cpx;
                float y1 = 2.0f * cur_y - last_cpy;
                last_cpx = x2;
                last_cpy = y2;
                cur_x = x;
                cur_y = y;
                float t1x, t1y, t2x, t2y, tx, ty;
                transform_point(mat, x1, y1, &t1x, &t1y);
                transform_point(mat, x2, y2, &t2x, &t2y);
                transform_point(mat, x,  y,  &tx,  &ty);
                w_path_cubic_to(t1x, t1y, t2x, t2y, tx, ty);
                break;
            }
            case 'Q':
            case 'q': {
                float x1, y1, x, y;
                p = parse_number(p, &x1); if (!p) break;
                p = parse_number(p, &y1); if (!p) break;
                p = parse_number(p, &x);  if (!p) break;
                p = parse_number(p, &y);  if (!p) break;
                if (cmd == 'q') {
                    x1 += cur_x; y1 += cur_y;
                    x  += cur_x; y  += cur_y;
                }
                last_cpx = x1;
                last_cpy = y1;
                cur_x = x;
                cur_y = y;
                float t1x, t1y, tx, ty;
                transform_point(mat, x1, y1, &t1x, &t1y);
                transform_point(mat, x,  y,  &tx,  &ty);
                w_path_quad_to(t1x, t1y, tx, ty);
                break;
            }
            case 'T':
            case 't': {
                float x, y;
                p = parse_number(p, &x); if (!p) break;
                p = parse_number(p, &y); if (!p) break;
                if (cmd == 't') { x += cur_x; y += cur_y; }
                float x1 = 2.0f * cur_x - last_cpx;
                float y1 = 2.0f * cur_y - last_cpy;
                last_cpx = x1;
                last_cpy = y1;
                cur_x = x;
                cur_y = y;
                float t1x, t1y, tx, ty;
                transform_point(mat, x1, y1, &t1x, &t1y);
                transform_point(mat, x,  y,  &tx,  &ty);
                w_path_quad_to(t1x, t1y, tx, ty);
                break;
            }
            case 'A':
            case 'a': {
                float rx, ry, deg, large_arc, sweep, x, y;
                p = parse_number(p, &rx);        if (!p) break;
                p = parse_number(p, &ry);        if (!p) break;
                p = parse_number(p, &deg);       if (!p) break;
                p = parse_number(p, &large_arc); if (!p) break;
                p = parse_number(p, &sweep);     if (!p) break;
                p = parse_number(p, &x);         if (!p) break;
                p = parse_number(p, &y);         if (!p) break;
                if (cmd == 'a') { x += cur_x; y += cur_y; }
                emit_arc_cubics(cur_x, cur_y, rx, ry, deg, (int)large_arc, (int)sweep, x, y, mat);
                cur_x = last_cpx = x;
                cur_y = last_cpy = y;
                break;
            }
            case 'Z':
            case 'z': {
                w_path_close();
                cur_x = last_cpx = start_x;
                cur_y = last_cpy = start_y;
                break;
            }
            default:
                p++;
                break;
        }
    }
}

/* =========================================================================
 * Shape Generation to Paths
 * ========================================================================= */

static void render_shape_node(const quadro_svg_node_t *node, const quadro_matrix_t *mat) {
    w_path_begin();

    switch (node->type) {
        case QUADRO_SVG_PATH:
            if (node->geom.path.d) {
                parse_path_d(node->geom.path.d, mat);
            }
            break;
        case QUADRO_SVG_RECT: {
            float x = node->geom.rect.x, y = node->geom.rect.y;
            float w = node->geom.rect.w, h = node->geom.rect.h;
            float rx = node->geom.rect.rx, ry = node->geom.rect.ry;
            if (rx > 0 || ry > 0) {
                if (rx <= 0) rx = ry;
                if (ry <= 0) ry = rx;
                if (rx > w * 0.5f) rx = w * 0.5f;
                if (ry > h * 0.5f) ry = h * 0.5f;
                float k = 0.5522847498f;
                float kx = rx * (1.0f - k);
                float ky = ry * (1.0f - k);

                float p0x, p0y, p1x, p1y, p2x, p2y;
                transform_point(mat, x + rx, y, &p0x, &p0y); w_path_move_to(p0x, p0y);
                transform_point(mat, x + w - rx, y, &p0x, &p0y); w_path_line_to(p0x, p0y);
                transform_point(mat, x + w - kx, y, &p0x, &p0y);
                transform_point(mat, x + w, y + ky, &p1x, &p1y);
                transform_point(mat, x + w, y + ry, &p2x, &p2y);
                w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);

                transform_point(mat, x + w, y + h - ry, &p0x, &p0y); w_path_line_to(p0x, p0y);
                transform_point(mat, x + w, y + h - ky, &p0x, &p0y);
                transform_point(mat, x + w - kx, y + h, &p1x, &p1y);
                transform_point(mat, x + w - rx, y + h, &p2x, &p2y);
                w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);

                transform_point(mat, x + rx, y + h, &p0x, &p0y); w_path_line_to(p0x, p0y);
                transform_point(mat, x + kx, y + h, &p0x, &p0y);
                transform_point(mat, x, y + h - ky, &p1x, &p1y);
                transform_point(mat, x, y + h - ry, &p2x, &p2y);
                w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);

                transform_point(mat, x, y + ry, &p0x, &p0y); w_path_line_to(p0x, p0y);
                transform_point(mat, x, y + ky, &p0x, &p0y);
                transform_point(mat, x + kx, y, &p1x, &p1y);
                transform_point(mat, x + rx, y, &p2x, &p2y);
                w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);
                w_path_close();
            } else {
                float p0x, p0y;
                transform_point(mat, x, y, &p0x, &p0y); w_path_move_to(p0x, p0y);
                transform_point(mat, x + w, y, &p0x, &p0y); w_path_line_to(p0x, p0y);
                transform_point(mat, x + w, y + h, &p0x, &p0y); w_path_line_to(p0x, p0y);
                transform_point(mat, x, y + h, &p0x, &p0y); w_path_line_to(p0x, p0y);
                w_path_close();
            }
            break;
        }
        case QUADRO_SVG_CIRCLE:
        case QUADRO_SVG_ELLIPSE: {
            float cx = (node->type == QUADRO_SVG_CIRCLE) ? node->geom.circle.cx : node->geom.ellipse.cx;
            float cy = (node->type == QUADRO_SVG_CIRCLE) ? node->geom.circle.cy : node->geom.ellipse.cy;
            float rx = (node->type == QUADRO_SVG_CIRCLE) ? node->geom.circle.r : node->geom.ellipse.rx;
            float ry = (node->type == QUADRO_SVG_CIRCLE) ? node->geom.circle.r : node->geom.ellipse.ry;
            float k = 0.5522847498f;
            float ox = rx * k;
            float oy = ry * k;

            float p0x, p0y, p1x, p1y, p2x, p2y;
            transform_point(mat, cx, cy - ry, &p0x, &p0y); w_path_move_to(p0x, p0y);
            transform_point(mat, cx + ox, cy - ry, &p0x, &p0y);
            transform_point(mat, cx + rx, cy - oy, &p1x, &p1y);
            transform_point(mat, cx + rx, cy, &p2x, &p2y);
            w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);

            transform_point(mat, cx + rx, cy + oy, &p0x, &p0y);
            transform_point(mat, cx + ox, cy + ry, &p1x, &p1y);
            transform_point(mat, cx, cy + ry, &p2x, &p2y);
            w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);

            transform_point(mat, cx - ox, cy + ry, &p0x, &p0y);
            transform_point(mat, cx - rx, cy + oy, &p1x, &p1y);
            transform_point(mat, cx - rx, cy, &p2x, &p2y);
            w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);

            transform_point(mat, cx - rx, cy - oy, &p0x, &p0y);
            transform_point(mat, cx - ox, cy - ry, &p1x, &p1y);
            transform_point(mat, cx, cy - ry, &p2x, &p2y);
            w_path_cubic_to(p0x, p0y, p1x, p1y, p2x, p2y);
            w_path_close();
            break;
        }
        case QUADRO_SVG_LINE: {
            float p0x, p0y, p1x, p1y;
            transform_point(mat, node->geom.line.x1, node->geom.line.y1, &p0x, &p0y);
            transform_point(mat, node->geom.line.x2, node->geom.line.y2, &p1x, &p1y);
            w_path_move_to(p0x, p0y);
            w_path_line_to(p1x, p1y);
            break;
        }
        case QUADRO_SVG_POLYLINE:
        case QUADRO_SVG_POLYGON: {
            if (node->geom.poly.count >= 2) {
                float px, py;
                transform_point(mat, node->geom.poly.points[0], node->geom.poly.points[1], &px, &py);
                w_path_move_to(px, py);
                for (int i = 1; i < node->geom.poly.count; i++) {
                    transform_point(mat, node->geom.poly.points[i * 2], node->geom.poly.points[i * 2 + 1], &px, &py);
                    w_path_line_to(px, py);
                }
                if (node->type == QUADRO_SVG_POLYGON) {
                    w_path_close();
                }
            }
            break;
        }
        case QUADRO_SVG_TEXT: {
            if (node->text_content) {
                quadro_text_to_path(node->text_content, 0, 0, node->font_size > 0 ? node->font_size : 16.0f,
                                   node->text_anchor, mat);
            }
            break;
        }
        default:
            break;
    }
}

/* =========================================================================
 * Tree Traversal & Layer Rendering
 * ========================================================================= */

static void render_node_recursive(const quadro_svg_node_t *node, quadro_matrix_t parent_mat, float parent_opacity) {
    if (!node) return;

    quadro_matrix_t cur_mat = quadro_matrix_multiply(parent_mat, node->transform);
    float cur_opacity = parent_opacity * node->style.opacity;

    if (node->type != QUADRO_SVG_GROUP && node->type != QUADRO_SVG_NONE) {
        render_shape_node(node, &cur_mat);

        /* Fill */
        if (node->style.has_fill && (node->style.fill_color & 0xFF000000) != 0) {
            uint32_t fill_col = node->style.fill_color;
            uint32_t a = (fill_col >> 24) & 0xFF;
            a = (uint32_t)(a * cur_opacity * node->style.fill_opacity);
            if (a > 0) {
                fill_col = (fill_col & 0x00FFFFFF) | (a << 24);
                w_path_fill(3, fill_col, node->style.fill_rule);
            }
        }

        /* Stroke */
        if (node->style.has_stroke && node->style.stroke_width > 0.0f) {
            uint32_t strk_col = node->style.stroke_color;
            uint32_t a = (strk_col >> 24) & 0xFF;
            a = (uint32_t)(a * cur_opacity * node->style.stroke_opacity);
            if (a > 0) {
                strk_col = (strk_col & 0x00FFFFFF) | (a << 24);
                // Approximate stroke scaling from matrix
                float scale_x = sqrtf(cur_mat.a * cur_mat.a + cur_mat.b * cur_mat.b);
                float sw = node->style.stroke_width * scale_x;
                w_path_stroke(3, strk_col, sw, node->style.cap_style, node->style.join_style);
            }
        }
    }

    /* Render Children */
    for (const quadro_svg_node_t *ch = node->children; ch != NULL; ch = ch->next) {
        render_node_recursive(ch, cur_mat, cur_opacity);
    }
}

/* =========================================================================
 * XML Parser & Document Builder
 * ========================================================================= */

static char *extract_attr(const char *tag, const char *attr_name) {
    char search[128];
    snprintf(search, sizeof(search), " %s=", attr_name);
    const char *p = strstr(tag, search);
    if (!p) {
        snprintf(search, sizeof(search), "\n%s=", attr_name);
        p = strstr(tag, search);
    }
    if (!p) {
        snprintf(search, sizeof(search), "\t%s=", attr_name);
        p = strstr(tag, search);
    }
    if (!p) return NULL;

    p += strlen(search);
    char quote = *p;
    if (quote != '"' && quote != '\'') return NULL;
    p++;
    const char *end = strchr(p, quote);
    if (!end) return NULL;

    size_t len = end - p;
    char *res = (char*)malloc(len + 1);
    memcpy(res, p, len);
    res[len] = 0;
    return res;
}

static void parse_node_attributes(quadro_svg_node_t *node, const char *tag_str) {
    char *id = extract_attr(tag_str, "id");
    if (id) {
        strncpy(node->id, id, sizeof(node->id) - 1);
        free(id);
    }

    char *trans = extract_attr(tag_str, "transform");
    if (trans) {
        node->transform = parse_transform(trans);
        free(trans);
    }

    char *fill = extract_attr(tag_str, "fill");
    if (fill) {
        node->style.fill_color = parse_color(fill, &node->style.has_fill);
        free(fill);
    }

    char *stroke = extract_attr(tag_str, "stroke");
    if (stroke) {
        node->style.stroke_color = parse_color(stroke, &node->style.has_stroke);
        free(stroke);
    }

    char *sw = extract_attr(tag_str, "stroke-width");
    if (sw) {
        node->style.stroke_width = (float)atof(sw);
        free(sw);
    }

    char *op = extract_attr(tag_str, "opacity");
    if (op) {
        node->style.opacity = (float)atof(op);
        free(op);
    }

    char *fop = extract_attr(tag_str, "fill-opacity");
    if (fop) {
        node->style.fill_opacity = (float)atof(fop);
        free(fop);
    }

    char *sop = extract_attr(tag_str, "stroke-opacity");
    if (sop) {
        node->style.stroke_opacity = (float)atof(sop);
        free(sop);
    }

    char *frule = extract_attr(tag_str, "fill-rule");
    if (frule) {
        if (strcmp(frule, "evenodd") == 0) node->style.fill_rule = 1;
        free(frule);
    }

    char *style = extract_attr(tag_str, "style");
    if (style) {
        parse_css_style(&node->style, style);
        free(style);
    }
}

static quadro_svg_node_t *create_node(quadro_svg_node_type_t type) {
    quadro_svg_node_t *n = (quadro_svg_node_t*)malloc(sizeof(quadro_svg_node_t));
    memset(n, 0, sizeof(quadro_svg_node_t));
    n->type = type;
    n->transform = quadro_matrix_identity();
    n->style.fill_color = 0xFF000000;
    n->style.has_fill = 1;
    n->style.opacity = 1.0f;
    n->style.fill_opacity = 1.0f;
    n->style.stroke_opacity = 1.0f;
    n->style.stroke_width = 1.0f;
    return n;
}

void quadro_svg_doc_free(quadro_svg_doc_t *doc) {
    if (!doc) return;
    
    // Recursive free
    void free_node(quadro_svg_node_t *n) {
        if (!n) return;
        if (n->type == QUADRO_SVG_PATH && n->geom.path.d) free(n->geom.path.d);
        if ((n->type == QUADRO_SVG_POLYLINE || n->type == QUADRO_SVG_POLYGON) && n->geom.poly.points) {
            free(n->geom.poly.points);
        }
        if (n->text_content) free(n->text_content);
        
        quadro_svg_node_t *ch = n->children;
        while (ch) {
            quadro_svg_node_t *next = ch->next;
            free_node(ch);
            ch = next;
        }
        free(n);
    }

    if (doc->root) {
        quadro_svg_node_t *cur = doc->root;
        while (cur) {
            quadro_svg_node_t *next = cur->next;
            free_node(cur);
            cur = next;
        }
    }
    free(doc);
}

quadro_svg_doc_t *quadro_svg_parse_string(const char *xml_str, size_t length) {
    if (!xml_str) return NULL;
    quadro_svg_doc_t *doc = (quadro_svg_doc_t*)malloc(sizeof(quadro_svg_doc_t));
    memset(doc, 0, sizeof(quadro_svg_doc_t));
    doc->width = 800;
    doc->height = 600;

    const char *p = xml_str;
    quadro_svg_node_t *stack[64];
    int stack_top = -1;

    void add_child_node(quadro_svg_node_t *n) {
        if (stack_top >= 0) {
            quadro_svg_node_t *parent = stack[stack_top];
            if (!parent->children) parent->children = n;
            else {
                quadro_svg_node_t *c = parent->children;
                while (c->next) c = c->next;
                c->next = n;
            }
        } else {
            if (!doc->root) doc->root = n;
            else {
                quadro_svg_node_t *c = doc->root;
                while (c->next) c = c->next;
                c->next = n;
            }
        }
    }

    while (*p) {
        const char *tag_start = strchr(p, '<');
        if (!tag_start) break;

        /* Skip comments <!-- ... --> */
        if (strncmp(tag_start, "<!--", 4) == 0) {
            const char *comm_end = strstr(tag_start, "-->");
            if (comm_end) p = comm_end + 3;
            else break;
            continue;
        }

        /* Skip XML declaration / doctype */
        if (strncmp(tag_start, "<?", 2) == 0 || strncmp(tag_start, "<!", 2) == 0) {
            const char *tag_end = strchr(tag_start, '>');
            if (tag_end) p = tag_end + 1;
            else break;
            continue;
        }

        /* Closing tag </tag> */
        if (strncmp(tag_start, "</", 2) == 0) {
            if (stack_top >= 0) stack_top--;
            const char *tag_end = strchr(tag_start, '>');
            if (tag_end) p = tag_end + 1;
            else break;
            continue;
        }

        const char *tag_end = strchr(tag_start, '>');
        if (!tag_end) break;

        size_t tag_len = tag_end - tag_start + 1;
        char *tag_buf = (char*)malloc(tag_len + 1);
        memcpy(tag_buf, tag_start, tag_len);
        tag_buf[tag_len] = 0;

        int is_self_closing = (tag_len >= 2 && tag_buf[tag_len - 2] == '/');

        /* Extract Tag Name */
        char tag_name[32] = {0};
        const char *name_start = tag_buf + 1;
        while (*name_start == ' ') name_start++;
        int ni = 0;
        while (name_start[ni] && !isspace(name_start[ni]) && name_start[ni] != '>' && name_start[ni] != '/' && ni < 31) {
            tag_name[ni] = name_start[ni];
            ni++;
        }
        tag_name[ni] = 0;

        if (strcmp(tag_name, "svg") == 0) {
            char *w = extract_attr(tag_buf, "width");
            char *h = extract_attr(tag_buf, "height");
            char *vb = extract_attr(tag_buf, "viewBox");
            if (w) { doc->width = (float)atof(w); free(w); }
            if (h) { doc->height = (float)atof(h); free(h); }
            if (vb) {
                sscanf(vb, "%f%*[ ,]%f%*[ ,]%f%*[ ,]%f", &doc->vb_x, &doc->vb_y, &doc->vb_w, &doc->vb_h);
                doc->has_viewbox = 1;
                if (!w || !h) {
                    doc->width = doc->vb_w;
                    doc->height = doc->vb_h;
                }
                free(vb);
            }
        } else if (strcmp(tag_name, "g") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_GROUP);
            parse_node_attributes(node, tag_buf);
            add_child_node(node);
            if (!is_self_closing && stack_top < 63) {
                stack[++stack_top] = node;
            }
        } else if (strcmp(tag_name, "path") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_PATH);
            parse_node_attributes(node, tag_buf);
            node->geom.path.d = extract_attr(tag_buf, "d");
            add_child_node(node);
        } else if (strcmp(tag_name, "rect") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_RECT);
            parse_node_attributes(node, tag_buf);
            char *x = extract_attr(tag_buf, "x");
            char *y = extract_attr(tag_buf, "y");
            char *w = extract_attr(tag_buf, "width");
            char *h = extract_attr(tag_buf, "height");
            char *rx = extract_attr(tag_buf, "rx");
            char *ry = extract_attr(tag_buf, "ry");
            if (x) { node->geom.rect.x = (float)atof(x); free(x); }
            if (y) { node->geom.rect.y = (float)atof(y); free(y); }
            if (w) { node->geom.rect.w = (float)atof(w); free(w); }
            if (h) { node->geom.rect.h = (float)atof(h); free(h); }
            if (rx) { node->geom.rect.rx = (float)atof(rx); free(rx); }
            if (ry) { node->geom.rect.ry = (float)atof(ry); free(ry); }
            add_child_node(node);
        } else if (strcmp(tag_name, "circle") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_CIRCLE);
            parse_node_attributes(node, tag_buf);
            char *cx = extract_attr(tag_buf, "cx");
            char *cy = extract_attr(tag_buf, "cy");
            char *r  = extract_attr(tag_buf, "r");
            if (cx) { node->geom.circle.cx = (float)atof(cx); free(cx); }
            if (cy) { node->geom.circle.cy = (float)atof(cy); free(cy); }
            if (r)  { node->geom.circle.r  = (float)atof(r);  free(r);  }
            add_child_node(node);
        } else if (strcmp(tag_name, "ellipse") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_ELLIPSE);
            parse_node_attributes(node, tag_buf);
            char *cx = extract_attr(tag_buf, "cx");
            char *cy = extract_attr(tag_buf, "cy");
            char *rx = extract_attr(tag_buf, "rx");
            char *ry = extract_attr(tag_buf, "ry");
            if (cx) { node->geom.ellipse.cx = (float)atof(cx); free(cx); }
            if (cy) { node->geom.ellipse.cy = (float)atof(cy); free(cy); }
            if (rx) { node->geom.ellipse.rx = (float)atof(rx); free(rx); }
            if (ry) { node->geom.ellipse.ry = (float)atof(ry); free(ry); }
            add_child_node(node);
        } else if (strcmp(tag_name, "line") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_LINE);
            parse_node_attributes(node, tag_buf);
            char *x1 = extract_attr(tag_buf, "x1");
            char *y1 = extract_attr(tag_buf, "y1");
            char *x2 = extract_attr(tag_buf, "x2");
            char *y2 = extract_attr(tag_buf, "y2");
            if (x1) { node->geom.line.x1 = (float)atof(x1); free(x1); }
            if (y1) { node->geom.line.y1 = (float)atof(y1); free(y1); }
            if (x2) { node->geom.line.x2 = (float)atof(x2); free(x2); }
            if (y2) { node->geom.line.y2 = (float)atof(y2); free(y2); }
            add_child_node(node);
        } else if (strcmp(tag_name, "polyline") == 0 || strcmp(tag_name, "polygon") == 0) {
            quadro_svg_node_t *node = create_node(strcmp(tag_name, "polygon") == 0 ? QUADRO_SVG_POLYGON : QUADRO_SVG_POLYLINE);
            parse_node_attributes(node, tag_buf);
            char *pts = extract_attr(tag_buf, "points");
            if (pts) {
                float *coords = (float*)malloc(1024 * sizeof(float));
                int pt_count = 0, cap = 1024;
                const char *s = pts;
                float val;
                while ((s = parse_number(s, &val)) != NULL) {
                    if (pt_count >= cap) {
                        cap *= 2;
                        coords = (float*)realloc(coords, cap * sizeof(float));
                    }
                    coords[pt_count++] = val;
                }
                node->geom.poly.points = coords;
                node->geom.poly.count = pt_count / 2;
                free(pts);
            }
            add_child_node(node);
        } else if (strcmp(tag_name, "text") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_TEXT);
            parse_node_attributes(node, tag_buf);
            char *x = extract_attr(tag_buf, "x");
            char *y = extract_attr(tag_buf, "y");
            char *fs = extract_attr(tag_buf, "font-size");
            char *ta = extract_attr(tag_buf, "text-anchor");
            if (x || y) {
                float tx = x ? (float)atof(x) : 0;
                float ty = y ? (float)atof(y) : 0;
                quadro_matrix_t m = { 1, 0, 0, 1, tx, ty };
                node->transform = quadro_matrix_multiply(node->transform, m);
                if (x) free(x);
                if (y) free(y);
            }
            if (fs) { node->font_size = (float)atof(fs); free(fs); }
            if (ta) {
                if (strcmp(ta, "middle") == 0) node->text_anchor = 1;
                else if (strcmp(ta, "end") == 0) node->text_anchor = 2;
                free(ta);
            }

            /* Extract inner text content */
            const char *content_start = tag_end + 1;
            const char *content_end = strstr(content_start, "</text>");
            if (content_end) {
                size_t clen = content_end - content_start;
                node->text_content = (char*)malloc(clen + 1);
                memcpy(node->text_content, content_start, clen);
                node->text_content[clen] = 0;
                p = content_end + 7;
            }
            add_child_node(node);
            free(tag_buf);
            continue;
        }

        free(tag_buf);
        p = tag_end + 1;
    }

    return doc;
}

quadro_svg_doc_t *quadro_svg_parse_file(const char *file_path) {
    FILE *f = fopen(file_path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0) { fclose(f); return NULL; }

    char *buf = (char*)malloc(sz + 1);
    fread(buf, 1, sz, f);
    buf[sz] = 0;
    fclose(f);

    quadro_svg_doc_t *doc = quadro_svg_parse_string(buf, sz);
    free(buf);
    return doc;
}

/* =========================================================================
 * High-Level Render & Export API
 * ========================================================================= */

int quadro_svg_render(quadro_svg_doc_t *doc, uint32_t *out_rgba, int width, int height, float scale) {
    if (!doc) return 0;
    if (scale <= 0.0f) scale = 1.0f;
    int w = width > 0 ? width : (int)ceilf(doc->width * scale);
    int h = height > 0 ? height : (int)ceilf(doc->height * scale);
    if (w < 1) w = 1;
    if (h < 1) h = 1;

    w_init(w, h);

    /* Clear Layer 3 */
    uint32_t *layer_pixels = get_layer_pixels(3);
    if (layer_pixels) {
        memset(layer_pixels, 0, w * h * sizeof(uint32_t));
    }

    /* Compute root transform (Scale & ViewBox normalization) */
    quadro_matrix_t root_mat = quadro_matrix_identity();
    if (doc->has_viewbox && doc->vb_w > 0 && doc->vb_h > 0) {
        float sx = (float)w / doc->vb_w;
        float sy = (float)h / doc->vb_h;
        quadro_matrix_t svb = { sx, 0, 0, sy, -doc->vb_x * sx, -doc->vb_y * sy };
        root_mat = svb;
    } else {
        quadro_matrix_t s = { scale, 0, 0, scale, 0, 0 };
        root_mat = s;
    }

    /* Traverse scene graph and rasterize */
    for (const quadro_svg_node_t *node = doc->root; node != NULL; node = node->next) {
        render_node_recursive(node, root_mat, 1.0f);
    }

    w_force_composite();

    uint32_t *comp = get_composite_pixels();
    if (comp && out_rgba) {
        memcpy(out_rgba, comp, w * h * sizeof(uint32_t));
    }
    return 1;
}

int quadro_svg_render_to_file(const char *svg_path, const char *out_png_path, float scale, int override_w, int override_h) {
    quadro_svg_doc_t *doc = quadro_svg_parse_file(svg_path);
    if (!doc) {
        fprintf(stderr, "[quadro-svg] Failed to open/parse SVG: %s\n", svg_path);
        return 0;
    }

    if (scale <= 0.0f) scale = 1.0f;
    int w = override_w > 0 ? override_w : (int)ceilf(doc->width * scale);
    int h = override_h > 0 ? override_h : (int)ceilf(doc->height * scale);

    uint32_t *rgba_buffer = (uint32_t*)malloc(w * h * sizeof(uint32_t));
    quadro_svg_render(doc, rgba_buffer, w, h, scale);

    int ok = stbi_write_png(out_png_path, w, h, 4, rgba_buffer, w * 4);
    if (!ok) {
        fprintf(stderr, "[quadro-svg] Failed to write PNG: %s\n", out_png_path);
    }

    free(rgba_buffer);
    quadro_svg_doc_free(doc);
    return ok;
}
