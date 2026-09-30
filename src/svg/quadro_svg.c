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

static inline int quadro_matrix_invert(quadro_matrix_t m, quadro_matrix_t *out) {
    float det = m.a * m.d - m.c * m.b;
    if (fabsf(det) < 1e-6f) return 0;
    float inv_det = 1.0f / det;
    out->a =  m.d * inv_det;
    out->b = -m.b * inv_det;
    out->c = -m.c * inv_det;
    out->d =  m.a * inv_det;
    out->e = (m.c * m.f - m.d * m.e) * inv_det;
    out->f = (m.b * m.e - m.a * m.f) * inv_det;
    return 1;
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
 * Color, Style & JSON-like Attribute Parsing
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
    return 0xFF000000;
}

static void parse_url_id(const char *val, char *out_id, size_t max_len) {
    if (!val || !out_id) return;
    const char *start = strstr(val, "url(#");
    if (start) {
        start += 5;
        const char *end = strchr(start, ')');
        if (end) {
            size_t len = end - start;
            if (len >= max_len) len = max_len - 1;
            strncpy(out_id, start, len);
            out_id[len] = 0;
            return;
        }
    }
    if (*val == '#') val++;
    strncpy(out_id, val, max_len - 1);
    out_id[max_len - 1] = 0;
}

static char *url_decode(const char *src) {
    if (!src) return NULL;
    size_t len = strlen(src);
    char *dst = (char*)malloc(len + 1);
    char *d = dst;
    const char *s = src;
    while (*s) {
        if (*s == '%' && s[1] && s[2]) {
            int h1 = s[1], h2 = s[2];
            int v1 = (h1 >= '0' && h1 <= '9') ? h1 - '0' : (h1 >= 'a' && h1 <= 'f') ? h1 - 'a' + 10 : (h1 >= 'A' && h1 <= 'F') ? h1 - 'A' + 10 : -1;
            int v2 = (h2 >= '0' && h2 <= '9') ? h2 - '0' : (h2 >= 'a' && h2 <= 'f') ? h2 - 'a' + 10 : (h2 >= 'A' && h2 <= 'F') ? h2 - 'A' + 10 : -1;
            if (v1 >= 0 && v2 >= 0) {
                *d++ = (char)((v1 << 4) | v2);
                s += 3;
                continue;
            }
        } else if (*s == '+') {
            *d++ = ' ';
            s++;
            continue;
        }
        *d++ = *s++;
    }
    *d = 0;
    return dst;
}

static int parse_bool_val(const char *p) {
    if (!p) return 0;
    while (*p == ' ' || *p == '"' || *p == ':') p++;
    if (strncmp(p, "true", 4) == 0 || strncmp(p, "True", 4) == 0 || strncmp(p, "1", 1) == 0 || strncmp(p, "yes", 3) == 0) return 1;
    if (strncmp(p, "false", 5) == 0 || strncmp(p, "False", 5) == 0 || strncmp(p, "0", 1) == 0 || strncmp(p, "no", 2) == 0) return 0;
    return atof(p) > 0.0f ? 1 : 0;
}

static void parse_texture_attribute(quadro_svg_texture_config_t *tex, const char *str) {
    if (!str || !*str) return;
    char *decoded = url_decode(str);
    const char *p = decoded ? decoded : str;
    tex->enabled = 1;
    tex->scale = 100.0f;
    tex->contrast = 100.0f;
    tex->grain = 0.0f;
    tex->relative = 0;
    tex->offset_x = 0.0f;
    tex->offset_y = 0.0f;
    tex->warp_strength = 0.0f;
    tex->warp_freq = 20.0f;
    tex->noise_distort = 0.0f;
    tex->hardness = 100.0f;
    tex->hardness_intensity = 50.0f;
    tex->invert = 0;
    tex->blend_mode = 0;
    tex->posterize = 0;
    tex->pinch_swirl = 0.0f;

    while (*p) {
        while (*p == ' ' || *p == '{' || *p == '}' || *p == '"' || *p == ',' || *p == ';') p++;
        if (!*p) break;

        char key[32] = {0};
        int ki = 0;
        while (*p && *p != ':' && *p != '=' && *p != '"' && !isspace(*p) && ki < 31) key[ki++] = *p++;
        while (*p == ':' || *p == '=' || *p == ' ' || *p == '"') p++;

        if (strcmp(key, "enabled") == 0) {
            tex->enabled = parse_bool_val(p);
        } else if (strcmp(key, "relative") == 0 || strcmp(key, "is_relative") == 0) {
            tex->relative = parse_bool_val(p);
        } else if (strcmp(key, "invert") == 0 || strcmp(key, "invert_tex") == 0) {
            tex->invert = parse_bool_val(p);
        } else {
            float val = (float)atof(p);
            if (strcmp(key, "mode") == 0) {
                tex->mode = (int)val;
                if (tex->mode > 0 && strstr(str, "false") == NULL) {
                    tex->enabled = 1;
                }
            }
            else if (strcmp(key, "scale") == 0) tex->scale = val;
            else if (strcmp(key, "angle") == 0) tex->angle = val;
            else if (strcmp(key, "contrast") == 0) tex->contrast = val;
            else if (strcmp(key, "grain") == 0) tex->grain = val;
            else if (strcmp(key, "offset_x") == 0 || strcmp(key, "offsetX") == 0) tex->offset_x = val;
            else if (strcmp(key, "offset_y") == 0 || strcmp(key, "offsetY") == 0) tex->offset_y = val;
            else if (strcmp(key, "warp_strength") == 0 || strcmp(key, "warpStrength") == 0) tex->warp_strength = val;
            else if (strcmp(key, "warp_freq") == 0 || strcmp(key, "warpFreq") == 0) tex->warp_freq = val;
            else if (strcmp(key, "noise_distort") == 0 || strcmp(key, "noiseDistort") == 0) tex->noise_distort = val;
            else if (strcmp(key, "hardness") == 0 || strcmp(key, "fill_hardness") == 0) tex->hardness = val;
            else if (strcmp(key, "hardness_intensity") == 0 || strcmp(key, "hardnessIntensity") == 0 || strcmp(key, "hardness_radius") == 0 || strcmp(key, "hardnessRadius") == 0) tex->hardness_intensity = val;
            else if (strcmp(key, "blend_mode") == 0 || strcmp(key, "blendMode") == 0 || strcmp(key, "blend") == 0) tex->blend_mode = (int)val;
            else if (strcmp(key, "posterize") == 0) tex->posterize = (int)val;
            else if (strcmp(key, "pinch_swirl") == 0 || strcmp(key, "pinchSwirl") == 0) tex->pinch_swirl = val;
        }

        while (*p && *p != ',' && *p != ';' && *p != '}') p++;
    }
    if (decoded) free(decoded);
}

static void parse_brush_attribute(quadro_svg_brush_config_t *b, const char *str) {
    if (!str || !*str) return;
    char *decoded = url_decode(str);
    const char *p = decoded ? decoded : str;
    b->enabled = 1;
    b->flow = 100.0f;
    b->hardness = 95.0f;
    b->spacing = 10.0f;
    b->roundness = 100.0f;

    while (*p) {
        while (*p == ' ' || *p == '{' || *p == '}' || *p == '"' || *p == ',' || *p == ';') p++;
        if (!*p) break;

        char key[32] = {0};
        int ki = 0;
        while (*p && *p != ':' && *p != '=' && *p != '"' && !isspace(*p) && ki < 31) key[ki++] = *p++;
        while (*p == ':' || *p == '=' || *p == ' ' || *p == '"') p++;

        if (strcmp(key, "enabled") == 0) {
            b->enabled = parse_bool_val(p);
        } else if (strcmp(key, "auto_rotate") == 0 || strcmp(key, "autoRotate") == 0) {
            b->auto_rotate = parse_bool_val(p);
        } else if (strcmp(key, "preset") == 0) {
            while (*p && *p != ',' && *p != '}' && *p != '"') p++;
        } else {
            float val = (float)atof(p);
            if (strcmp(key, "flow") == 0) b->flow = val;
            else if (strcmp(key, "hardness") == 0) b->hardness = val;
            else if (strcmp(key, "spacing") == 0) b->spacing = val;
            else if (strcmp(key, "scatter") == 0) b->scatter = val;
            else if (strcmp(key, "roundness") == 0) b->roundness = val;
            else if (strcmp(key, "angle") == 0) b->angle = val;
            else if (strcmp(key, "grain") == 0) b->grain = val;
            else if (strcmp(key, "taper_in") == 0 || strcmp(key, "taperIn") == 0) b->taper_in = val;
            else if (strcmp(key, "taper_out") == 0 || strcmp(key, "taperOut") == 0) b->taper_out = val;
            else if (strcmp(key, "size_jitter") == 0 || strcmp(key, "sizeJitter") == 0) b->size_jitter = val;
            else if (strcmp(key, "angle_jitter") == 0 || strcmp(key, "angleJitter") == 0) b->angle_jitter = val;
            else if (strcmp(key, "opacity_jitter") == 0 || strcmp(key, "opacityJitter") == 0) b->opacity_jitter = val;
            else if (strcmp(key, "wetness") == 0) b->wetness = val;
            else if (strcmp(key, "smudge") == 0) b->smudge = val;
            else if (strcmp(key, "color_pickup") == 0 || strcmp(key, "colorPickup") == 0) b->color_pickup = val;
            else if (strcmp(key, "depletion") == 0) b->depletion = val;
            else if (strcmp(key, "dab_blend") == 0 || strcmp(key, "dabBlend") == 0) b->dab_blend = (int)val;
            else if (strcmp(key, "shape") == 0) b->tip_shape = (int)val;
        }

        while (*p && *p != ',' && *p != ';' && *p != '}') p++;
    }
    if (decoded) free(decoded);
}


static void apply_style_property(quadro_svg_style_t *st, const char *key, const char *val) {
    if (strcmp(key, "fill") == 0) {
        if (strncmp(val, "url(", 4) == 0) {
            st->fill_type = 1;
            parse_url_id(val, st->fill_gradient_id, sizeof(st->fill_gradient_id));
            st->has_fill = 1;
        } else {
            st->fill_type = 0;
            st->fill_color = parse_color(val, &st->has_fill);
        }
    } else if (strcmp(key, "stroke") == 0) {
        if (strncmp(val, "url(", 4) == 0) {
            st->stroke_type = 1;
            parse_url_id(val, st->stroke_gradient_id, sizeof(st->stroke_gradient_id));
            st->has_stroke = 1;
        } else {
            st->stroke_type = 0;
            st->stroke_color = parse_color(val, &st->has_stroke);
        }
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
    } else if (strcmp(key, "clip-path") == 0) {
        parse_url_id(val, st->clip_path_id, sizeof(st->clip_path_id));
    } else if (strcmp(key, "mix-blend-mode") == 0) {
        if (strcmp(val, "multiply") == 0) st->blend_mode = 1;
        else if (strcmp(val, "screen") == 0) st->blend_mode = 2;
        else if (strcmp(val, "overlay") == 0) st->blend_mode = 3;
        else if (strcmp(val, "darken") == 0) st->blend_mode = 4;
        else if (strcmp(val, "lighten") == 0) st->blend_mode = 5;
    }
}

static void parse_css_style(quadro_svg_style_t *st, const char *style_str) {
    if (!style_str) return;
    char buf[2048];
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
 * Procedural Textures & Shading Math
 * ========================================================================= */

uint8_t quadro_sample_procedural_texture(int mode, int x, int y, float angle, float scale, float contrast, uint8_t base_alpha) {
    if (mode <= 0 || base_alpha == 0) return base_alpha;
    int sc = (int)roundf(scale > 0.0f ? scale : 100.0f);
    int cnt = (int)roundf(contrast >= 0.0f ? contrast : 100.0f);
    int ang = (int)roundf(angle);
    return (uint8_t)w_sample_texture(mode, x, y, ang, sc, cnt, (uint32_t)base_alpha);
}

uint32_t quadro_sample_gradient(const quadro_svg_gradient_t *grad, float x, float y, float min_x, float min_y, float max_x, float max_y) {
    if (!grad || grad->stop_count <= 0) return 0xFF000000;
    if (grad->stop_count == 1) return grad->stops[0].color;

    /* Transform coordinate */
    quadro_matrix_t inv;
    float px = x, py = y;
    if (quadro_matrix_invert(grad->transform, &inv)) {
        transform_point(&inv, x, y, &px, &py);
    }

    float bw = max_x - min_x > 0.001f ? max_x - min_x : 1.0f;
    float bh = max_y - min_y > 0.001f ? max_y - min_y : 1.0f;

    float t = 0.0f;
    if (grad->type == QUADRO_GRADIENT_LINEAR) {
        float x1 = grad->is_percentage ? min_x + grad->x1 * bw : grad->x1;
        float y1 = grad->is_percentage ? min_y + grad->y1 * bh : grad->y1;
        float x2 = grad->is_percentage ? min_x + grad->x2 * bw : grad->x2;
        float y2 = grad->is_percentage ? min_y + grad->y2 * bh : grad->y2;

        float dx = x2 - x1;
        float dy = y2 - y1;
        float len_sq = dx * dx + dy * dy;
        if (len_sq < 1e-6f) t = 0.0f;
        else t = ((px - x1) * dx + (py - y1) * dy) / len_sq;
    } else if (grad->type == QUADRO_GRADIENT_RADIAL) {
        float cx = grad->is_percentage ? min_x + grad->cx * bw : grad->cx;
        float cy = grad->is_percentage ? min_y + grad->cy * bh : grad->cy;
        float max_dim = bw > bh ? bw : bh;
        float r  = grad->is_percentage ? grad->r * max_dim : grad->r;
        if (r < 1e-6f) r = 1.0f;

        float dx = px - cx;
        float dy = py - cy;
        t = sqrtf(dx * dx + dy * dy) / r;
    }

    /* Spread methods */
    if (grad->spread_method == QUADRO_SPREAD_REFLECT) {
        t = fabsf(fmodf(t, 2.0f));
        if (t > 1.0f) t = 2.0f - t;
    } else if (grad->spread_method == QUADRO_SPREAD_REPEAT) {
        t = t - floorf(t);
    } else {
        if (t < 0.0f) t = 0.0f;
        if (t > 1.0f) t = 1.0f;
    }

    /* Find enclosing stops */
    if (t <= grad->stops[0].offset) return grad->stops[0].color;
    if (t >= grad->stops[grad->stop_count - 1].offset) return grad->stops[grad->stop_count - 1].color;

    for (int i = 0; i < grad->stop_count - 1; i++) {
        if (t >= grad->stops[i].offset && t <= grad->stops[i + 1].offset) {
            float span = grad->stops[i + 1].offset - grad->stops[i].offset;
            float local_t = span > 1e-6f ? (t - grad->stops[i].offset) / span : 0.0f;

            uint32_t c0 = grad->stops[i].color;
            uint32_t c1 = grad->stops[i + 1].color;

            uint8_t a0 = (c0 >> 24) & 0xFF, a1 = (c1 >> 24) & 0xFF;
            uint8_t b0 = (c0 >> 16) & 0xFF, b1 = (c1 >> 16) & 0xFF;
            uint8_t g0 = (c0 >> 8)  & 0xFF, g1 = (c1 >> 8)  & 0xFF;
            uint8_t r0 = c0 & 0xFF,         r1 = c1 & 0xFF;

            uint8_t a = (uint8_t)(a0 + (a1 - a0) * local_t);
            uint8_t b = (uint8_t)(b0 + (b1 - b0) * local_t);
            uint8_t g = (uint8_t)(g0 + (g1 - g0) * local_t);
            uint8_t r = (uint8_t)(r0 + (r1 - r0) * local_t);

            return ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | r;
        }
    }

    return grad->stops[grad->stop_count - 1].color;
}

/* Fast separable Gaussian Box Blur for Drop Shadows */
static void gaussian_box_blur_alpha(uint8_t *scl, uint8_t *tcl, int w, int h, float r) {
    if (r <= 0.0f) return;
    int radius = (int)ceilf(r);
    if (radius < 1) radius = 1;
    int size = 2 * radius + 1;

    /* Horizontal pass */
    for (int y = 0; y < h; y++) {
        int sum = 0;
        for (int x = -radius; x <= radius; x++) {
            int cx = x < 0 ? 0 : (x >= w ? w - 1 : x);
            sum += scl[y * w + cx];
        }
        for (int x = 0; x < w; x++) {
            tcl[y * w + x] = (uint8_t)(sum / size);
            int left = x - radius;
            int right = x + radius + 1;
            int cl = left < 0 ? 0 : left;
            int cr = right >= w ? w - 1 : right;
            sum += scl[y * w + cr] - scl[y * w + cl];
        }
    }

    /* Vertical pass */
    for (int x = 0; x < w; x++) {
        int sum = 0;
        for (int y = -radius; y <= radius; y++) {
            int cy = y < 0 ? 0 : (y >= h ? h - 1 : y);
            sum += tcl[cy * w + x];
        }
        for (int y = 0; y < h; y++) {
            scl[y * w + x] = (uint8_t)(sum / size);
            int top = y - radius;
            int bot = y + radius + 1;
            int ct = top < 0 ? 0 : top;
            int cb = bot >= h ? h - 1 : bot;
            sum += tcl[cb * w + x] - tcl[ct * w + x];
        }
    }
}

/* =========================================================================
 * Path `d` Parser & Bézier Math
 * ========================================================================= */

static const char *parse_number(const char *s, float *out_val) {
    while (*s == ' ' || *s == ',' || *s == '\t' || *s == '\r' || *s == '\n') s++;
    if (!*s) return NULL;
    char *endptr = NULL;
    *out_val = strtof(s, &endptr);
    if (endptr == s) return NULL;
    return endptr;
}

static void emit_arc_cubics(float x1, float y1, float rx, float ry, float angle_deg,
                            int large_arc, int sweep, float x2, float y2, const quadro_matrix_t *mat) {
    if (rx == 0.0f || ry == 0.0f) {
        float tx, ty;
        transform_point(mat, x2, y2, &tx, &ty);
        w_path_line_to(tx, ty);
        return;
    }

    rx = fabsf(rx);
    ry = fabsf(ry);
    float phi = angle_deg * (float)M_PI / 180.0f;
    float cos_phi = cosf(phi);
    float sin_phi = sinf(phi);

    float dx2 = (x1 - x2) / 2.0f;
    float dy2 = (y1 - y2) / 2.0f;
    float x1p = cos_phi * dx2 + sin_phi * dy2;
    float y1p = -sin_phi * dx2 + cos_phi * dy2;

    float rx_sq = rx * rx;
    float ry_sq = ry * ry;
    float x1p_sq = x1p * x1p;
    float y1p_sq = y1p * y1p;

    float lambda = x1p_sq / rx_sq + y1p_sq / ry_sq;
    if (lambda > 1.0f) {
        float sq_lambda = sqrtf(lambda);
        rx *= sq_lambda;
        ry *= sq_lambda;
        rx_sq = rx * rx;
        ry_sq = ry * ry;
    }

    float sign = (large_arc == sweep) ? -1.0f : 1.0f;
    float num = rx_sq * ry_sq - rx_sq * y1p_sq - ry_sq * x1p_sq;
    float den = rx_sq * y1p_sq + ry_sq * x1p_sq;
    float rad = (den <= 0.0f || num <= 0.0f) ? 0.0f : sign * sqrtf(num / den);

    float cxp = rad * (rx * y1p / ry);
    float cyp = rad * (-ry * x1p / rx);

    float cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2.0f;
    float cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2.0f;

    float ux = (x1p - cxp) / rx;
    float uy = (y1p - cyp) / ry;
    float vx = (-x1p - cxp) / rx;
    float vy = (-y1p - cyp) / ry;

    float theta1 = atan2f(uy, ux);
    float dtheta = atan2f(ux * vy - uy * vx, ux * vx + uy * vy);

    if (!sweep && dtheta > 0) dtheta -= 2.0f * (float)M_PI;
    else if (sweep && dtheta < 0) dtheta += 2.0f * (float)M_PI;

    int segments = (int)ceilf(fabsf(dtheta) / ((float)M_PI * 0.5f));
    if (segments < 1) segments = 1;
    float delta = dtheta / segments;

    for (int i = 0; i < segments; i++) {
        float t1 = theta1 + i * delta;
        float t2 = t1 + delta;
        float alpha = sinf(delta) * (sqrtf(4.0f + 3.0f * tanf(delta / 2.0f) * tanf(delta / 2.0f)) - 1.0f) / 3.0f;

        float p0x = rx * cosf(t1), p0y = ry * sinf(t1);
        float p3x = rx * cosf(t2), p3y = ry * sinf(t2);

        float cp1x = cos_phi * (p0x - alpha * p0y) - sin_phi * (p0y + alpha * p0x) + cx;
        float cp1y = sin_phi * (p0x - alpha * p0y) + cos_phi * (p0y + alpha * p0x) + cy;
        float cp2x = cos_phi * (p3x + alpha * p3y) - sin_phi * (p3y - alpha * p3x) + cx;
        float cp2y = sin_phi * (p3x + alpha * p3y) + cos_phi * (p3y - alpha * p3x) + cy;
        float endx = cos_phi * p3x - sin_phi * p3y + cx;
        float endy = sin_phi * p3x + cos_phi * p3y + cy;

        float tcp1x, tcp1y, tcp2x, tcp2y, tendx, tendy;
        transform_point(mat, cp1x, cp1y, &tcp1x, &tcp1y);
        transform_point(mat, cp2x, cp2y, &tcp2x, &tcp2y);
        transform_point(mat, endx, endy, &tendx, &tendy);

        w_path_cubic_to(tcp1x, tcp1y, tcp2x, tcp2y, tendx, tendy);
    }
}

static void parse_path_d(const char *d, const quadro_matrix_t *mat) {
    if (!d) return;

    float cur_x = 0, cur_y = 0;
    float start_x = 0, start_y = 0;
    float last_cpx = 0, last_cpy = 0;

    const char *p = d;
    while (*p) {
        while (*p == ' ' || *p == ',' || *p == '\t' || *p == '\r' || *p == '\n') p++;
        if (!*p) break;

        char cmd = *p++;
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
                transform_point(mat, x, y, &tx, &ty);
                w_path_move_to(tx, ty);
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
                transform_point(mat, x, y, &tx, &ty);
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
                float cp1x, cp1y, cp2x, cp2y, x, y;
                p = parse_number(p, &cp1x); if (!p) break;
                p = parse_number(p, &cp1y); if (!p) break;
                p = parse_number(p, &cp2x); if (!p) break;
                p = parse_number(p, &cp2y); if (!p) break;
                p = parse_number(p, &x);    if (!p) break;
                p = parse_number(p, &y);    if (!p) break;
                if (cmd == 'c') {
                    cp1x += cur_x; cp1y += cur_y;
                    cp2x += cur_x; cp2y += cur_y;
                    x += cur_x; y += cur_y;
                }
                float t1x, t1y, t2x, t2y, tx, ty;
                transform_point(mat, cp1x, cp1y, &t1x, &t1y);
                transform_point(mat, cp2x, cp2y, &t2x, &t2y);
                transform_point(mat, x, y, &tx, &ty);
                w_path_cubic_to(t1x, t1y, t2x, t2y, tx, ty);
                last_cpx = cp2x; last_cpy = cp2y;
                cur_x = x; cur_y = y;
                break;
            }
            case 'S':
            case 's': {
                float cp2x, cp2y, x, y;
                p = parse_number(p, &cp2x); if (!p) break;
                p = parse_number(p, &cp2y); if (!p) break;
                p = parse_number(p, &x);    if (!p) break;
                p = parse_number(p, &y);    if (!p) break;
                if (cmd == 's') { cp2x += cur_x; cp2y += cur_y; x += cur_x; y += cur_y; }
                float cp1x = 2.0f * cur_x - last_cpx;
                float cp1y = 2.0f * cur_y - last_cpy;
                float t1x, t1y, t2x, t2y, tx, ty;
                transform_point(mat, cp1x, cp1y, &t1x, &t1y);
                transform_point(mat, cp2x, cp2y, &t2x, &t2y);
                transform_point(mat, x, y, &tx, &ty);
                w_path_cubic_to(t1x, t1y, t2x, t2y, tx, ty);
                last_cpx = cp2x; last_cpy = cp2y;
                cur_x = x; cur_y = y;
                break;
            }
            case 'Q':
            case 'q': {
                float cpx, cpy, x, y;
                p = parse_number(p, &cpx); if (!p) break;
                p = parse_number(p, &cpy); if (!p) break;
                p = parse_number(p, &x);   if (!p) break;
                p = parse_number(p, &y);   if (!p) break;
                if (cmd == 'q') { cpx += cur_x; cpy += cur_y; x += cur_x; y += cur_y; }
                float t1x, t1y, tx, ty;
                transform_point(mat, cpx, cpy, &t1x, &t1y);
                transform_point(mat, x, y, &tx, &ty);
                w_path_quad_to(t1x, t1y, tx, ty);
                last_cpx = cpx; last_cpy = cpy;
                cur_x = x; cur_y = y;
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
 * Tree Traversal, Advanced Shading & Shaders
 * ========================================================================= */

static const quadro_svg_gradient_t *find_gradient(const quadro_svg_doc_t *doc, const char *id) {
    if (!doc || !id || !*id) return NULL;
    for (const quadro_svg_gradient_t *g = doc->gradients; g != NULL; g = g->next) {
        if (strcmp(g->id, id) == 0) return g;
    }
    return NULL;
}

static inline uint32_t blend_pixels(uint32_t dst, uint32_t src, int mode) {
    uint8_t sa = (src >> 24) & 0xFF;
    if (sa == 0) return dst;
    uint8_t da = (dst >> 24) & 0xFF;
    if (da == 0) return src;

    uint8_t sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
    uint8_t dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;

    uint8_t r = sr, g = sg, b = sb;
    if (mode == 1) { /* Multiply */
        r = (sr * dr) / 255;
        g = (sg * dg) / 255;
        b = (sb * db) / 255;
    } else if (mode == 2) { /* Screen */
        r = 255 - ((255 - sr) * (255 - dr)) / 255;
        g = 255 - ((255 - sg) * (255 - dg)) / 255;
        b = 255 - ((255 - sb) * (255 - db)) / 255;
    } else if (mode == 3) { /* Overlay */
        r = dr < 128 ? (2 * sr * dr) / 255 : 255 - (2 * (255 - sr) * (255 - dr)) / 255;
        g = dg < 128 ? (2 * sg * dg) / 255 : 255 - (2 * (255 - sg) * (255 - dg)) / 255;
        b = db < 128 ? (2 * sb * db) / 255 : 255 - (2 * (255 - sb) * (255 - db)) / 255;
    }

    /* Porter-Duff Over with calculated color */
    float fa = sa / 255.0f;
    float inv_fa = 1.0f - fa;
    uint8_t out_a = (uint8_t)(sa + da * inv_fa);
    uint8_t out_r = (uint8_t)(r * fa + dr * inv_fa);
    uint8_t out_g = (uint8_t)(g * fa + dg * inv_fa);
    uint8_t out_b = (uint8_t)(b * fa + db * inv_fa);

    return ((uint32_t)out_a << 24) | ((uint32_t)out_b << 16) | ((uint32_t)out_g << 8) | out_r;
}

static quadro_svg_render_options_t g_render_opts = {0};

void quadro_svg_set_global_options(const quadro_svg_render_options_t *opts) {
    if (opts) g_render_opts = *opts;
    else memset(&g_render_opts, 0, sizeof(g_render_opts));
}

void quadro_svg_get_global_options(quadro_svg_render_options_t *out_opts) {
    if (out_opts) *out_opts = g_render_opts;
}

static void apply_preset_to_brush(quadro_svg_brush_config_t *b, int preset) {
    if (preset <= 0) return;
    b->enabled = 1;
    switch (preset) {
        case 1: /* Inker */
            b->flow = 100.0f; b->hardness = 100.0f; b->spacing = 3.0f; b->roundness = 100.0f;
            b->taper_in = 15.0f; b->taper_out = 25.0f;
            break;
        case 2: /* Pencil */
            b->flow = 60.0f; b->hardness = 35.0f; b->spacing = 7.0f; b->roundness = 85.0f;
            b->size_jitter = 12.0f;
            break;
        case 3: /* Charcoal */
            b->flow = 75.0f; b->hardness = 20.0f; b->spacing = 14.0f; b->roundness = 60.0f;
            b->scatter = 15.0f; b->tip_shape = 1;
            break;
        case 4: /* Chisel */
            b->flow = 95.0f; b->hardness = 95.0f; b->spacing = 5.0f; b->roundness = 25.0f;
            b->angle = 45.0f; b->auto_rotate = 0; b->tip_shape = 2;
            break;
        case 5: /* Watercolor */
            b->flow = 45.0f; b->hardness = 15.0f; b->spacing = 10.0f; b->roundness = 90.0f;
            b->wetness = 80.0f; b->smudge = 50.0f; b->dab_blend = 1;
            break;
    }
}

static void render_node_recursive(const quadro_svg_doc_t *doc, const quadro_svg_node_t *node,
                                  quadro_matrix_t parent_mat, float parent_opacity,
                                  const quadro_svg_style_t *parent_style,
                                  int canvas_w, int canvas_h) {
    if (!node) return;

    quadro_matrix_t cur_mat = quadro_matrix_multiply(parent_mat, node->transform);
    float cur_opacity = parent_opacity * node->style.opacity;

    if (node->type != QUADRO_SVG_GROUP && node->type != QUADRO_SVG_NONE) {
        int has_fill = node->style.has_fill;
        int has_stroke = node->style.has_stroke && node->style.stroke_width > 0.0f;
        if (!has_stroke && parent_style && parent_style->has_stroke && parent_style->stroke_width > 0.0f) {
            has_stroke = 1;
        }

        const quadro_svg_gradient_t *fill_grad = (node->style.fill_type == 1) ? find_gradient(doc, node->style.fill_gradient_id) : NULL;
        const quadro_svg_gradient_t *strk_grad = (node->style.stroke_type == 1) ? find_gradient(doc, node->style.stroke_gradient_id) : NULL;

        quadro_svg_brush_config_t eff_brush = node->style.brush;
        if (!eff_brush.enabled && parent_style && parent_style->brush.enabled) {
            eff_brush = parent_style->brush;
        }
        if (!eff_brush.enabled && g_render_opts.brush_preset > 0) {
            apply_preset_to_brush(&eff_brush, g_render_opts.brush_preset);
        }

        quadro_svg_texture_config_t eff_fill_tex = node->style.fill_texture;
        if (!eff_fill_tex.enabled && parent_style && parent_style->fill_texture.enabled) {
            eff_fill_tex = parent_style->fill_texture;
        }
        if (!eff_fill_tex.enabled && g_render_opts.texture_mode > 0) {
            eff_fill_tex.enabled = 1;
            eff_fill_tex.mode = g_render_opts.texture_mode;
            eff_fill_tex.scale = g_render_opts.texture_scale > 0 ? g_render_opts.texture_scale : 100.0f;
            eff_fill_tex.contrast = g_render_opts.texture_contrast > 0 ? g_render_opts.texture_contrast : 100.0f;
            eff_fill_tex.grain = g_render_opts.texture_grain > 0 ? g_render_opts.texture_grain : 50.0f;
        }

        quadro_svg_texture_config_t eff_strk_tex = node->style.stroke_texture;
        if (!eff_strk_tex.enabled && parent_style && parent_style->stroke_texture.enabled) {
            eff_strk_tex = parent_style->stroke_texture;
        }
        if (!eff_strk_tex.enabled && g_render_opts.texture_mode > 0) {
            eff_strk_tex.enabled = 1;
            eff_strk_tex.mode = g_render_opts.texture_mode;
            eff_strk_tex.scale = g_render_opts.texture_scale > 0 ? g_render_opts.texture_scale : 100.0f;
            eff_strk_tex.contrast = g_render_opts.texture_contrast > 0 ? g_render_opts.texture_contrast : 100.0f;
            eff_strk_tex.grain = g_render_opts.texture_grain > 0 ? g_render_opts.texture_grain : 50.0f;
        }

        int is_complex = (fill_grad != NULL) || (strk_grad != NULL) ||
                         eff_fill_tex.enabled || eff_strk_tex.enabled ||
                         eff_brush.enabled || (node->style.blend_mode != 0);

        uint32_t *layer_pixels = get_layer_pixels(3);

        if (!is_complex) {
            /* Fast path: standard solid color rendering directly to layer 3 */
            render_shape_node(node, &cur_mat);

            if (has_fill && (node->style.fill_color & 0xFF000000) != 0) {
                uint32_t fill_col = node->style.fill_color;
                uint32_t a = (fill_col >> 24) & 0xFF;
                a = (uint32_t)(a * cur_opacity * node->style.fill_opacity);
                if (a > 0) {
                    fill_col = (fill_col & 0x00FFFFFF) | (a << 24);
                    w_path_fill(3, fill_col, node->style.fill_rule);
                }
            }

            if (has_stroke) {
                uint32_t strk_col = node->style.stroke_color;
                uint32_t a = (strk_col >> 24) & 0xFF;
                a = (uint32_t)(a * cur_opacity * node->style.stroke_opacity);
                if (a > 0) {
                    strk_col = (strk_col & 0x00FFFFFF) | (a << 24);
                    float scale_x = sqrtf(cur_mat.a * cur_mat.a + cur_mat.b * cur_mat.b);
                    float sw = node->style.stroke_width * scale_x;
                    w_path_stroke(3, strk_col, sw, node->style.cap_style, node->style.join_style);
                }
            }
        } else {
            /* Complex path: scratch buffer for shading & textures */
            int total_pixels = canvas_w * canvas_h;
            uint32_t *scratch = (uint32_t*)malloc(total_pixels * sizeof(uint32_t));
            memset(scratch, 0, total_pixels * sizeof(uint32_t));

            int scratch_layer = w_get_selection_scratch_layer();
            uint32_t *scratch_layer_pixels = get_layer_pixels(scratch_layer);

            /* 1. Shape Fill Shading */
            render_shape_node(node, &cur_mat);

            if (has_fill) {
                if (scratch_layer_pixels) memset(scratch_layer_pixels, 0, total_pixels * sizeof(uint32_t));
                w_path_fill(scratch_layer, 0xFFFFFFFF, node->style.fill_rule);
                if (scratch_layer_pixels) {
                    /* Compute Bounding Box for ObjectBoundingBox coordinates */
                    int b_min_x = canvas_w, b_min_y = canvas_h, b_max_x = 0, b_max_y = 0;
                    for (int y = 0; y < canvas_h; y++) {
                        for (int x = 0; x < canvas_w; x++) {
                            if ((scratch_layer_pixels[y * canvas_w + x] >> 24) > 0) {
                                if (x < b_min_x) b_min_x = x;
                                if (x > b_max_x) b_max_x = x;
                                if (y < b_min_y) b_min_y = y;
                                if (y > b_max_y) b_max_y = y;
                            }
                        }
                    }
                    float bbox_x1 = b_max_x >= b_min_x ? (float)b_min_x : 0.0f;
                    float bbox_y1 = b_max_y >= b_min_y ? (float)b_min_y : 0.0f;
                    float bbox_x2 = b_max_x >= b_min_x ? (float)b_max_x : (float)canvas_w;
                    float bbox_y2 = b_max_y >= b_min_y ? (float)b_max_y : (float)canvas_h;

                    for (int y = 0; y < canvas_h; y++) {
                        for (int x = 0; x < canvas_w; x++) {
                            int idx = y * canvas_w + x;
                            uint8_t a = (scratch_layer_pixels[idx] >> 24) & 0xFF;
                            if (a == 0) continue;

                            uint32_t col = fill_grad ?
                                quadro_sample_gradient(fill_grad, (float)x, (float)y, bbox_x1, bbox_y1, bbox_x2, bbox_y2) :
                                node->style.fill_color;

                            uint8_t pix_a = (col >> 24) & 0xFF;
                            pix_a = (uint8_t)(pix_a * (a / 255.0f) * cur_opacity * node->style.fill_opacity);

                            if (eff_fill_tex.enabled && eff_fill_tex.mode > 0) {
                                int sx = eff_fill_tex.relative ? (x - (int)bbox_x1 + (int)eff_fill_tex.offset_x) : (x + (int)eff_fill_tex.offset_x);
                                int sy = eff_fill_tex.relative ? (y - (int)bbox_y1 + (int)eff_fill_tex.offset_y) : (y + (int)eff_fill_tex.offset_y);

                                if (eff_fill_tex.warp_strength > 0.0f) {
                                    float freq = eff_fill_tex.warp_freq > 0.0f ? eff_fill_tex.warp_freq * 0.01f : 0.2f;
                                    sx += (int)(sinf((float)sy * freq) * (eff_fill_tex.warp_strength * 0.4f));
                                    sy += (int)(cosf((float)sx * freq) * (eff_fill_tex.warp_strength * 0.4f));
                                }
                                if (eff_fill_tex.noise_distort > 0.0f) {
                                    uint32_t jn = (((sx * 374761393 + sy * 668265263) ^ 0x5bf03635) & 0xFF);
                                    int jitter = (int)((jn - 128) * (eff_fill_tex.noise_distort * 0.0025f));
                                    sx += jitter;
                                    sy += jitter;
                                }
                                if (eff_fill_tex.pinch_swirl != 0.0f) {
                                    float cx = (bbox_x1 + bbox_x2) * 0.5f;
                                    float cy = (bbox_y1 + bbox_y2) * 0.5f;
                                    float dx = (float)x - cx, dy = (float)y - cy;
                                    float r = sqrtf(dx * dx + dy * dy);
                                    float max_r = (bbox_x2 - bbox_x1 > bbox_y2 - bbox_y1 ? bbox_x2 - bbox_x1 : bbox_y2 - bbox_y1) * 0.5f;
                                    if (max_r > 1.0f && r < max_r) {
                                        float factor = (1.0f - r / max_r) * (eff_fill_tex.pinch_swirl * 0.01f) * 3.14159265f;
                                        float cos_s = cosf(factor), sin_s = sinf(factor);
                                        float nrx = dx * cos_s - dy * sin_s;
                                        float nry = dx * sin_s + dy * cos_s;
                                        if (eff_fill_tex.relative) {
                                            sx = (int)(cx + nrx - bbox_x1 + eff_fill_tex.offset_x);
                                            sy = (int)(cy + nry - bbox_y1 + eff_fill_tex.offset_y);
                                        } else {
                                            sx = (int)(cx + nrx + eff_fill_tex.offset_x);
                                            sy = (int)(cy + nry + eff_fill_tex.offset_y);
                                        }
                                    }
                                }

                                uint8_t orig_a = pix_a;
                                pix_a = quadro_sample_procedural_texture(eff_fill_tex.mode, sx, sy,
                                    eff_fill_tex.angle, eff_fill_tex.scale,
                                    eff_fill_tex.contrast, pix_a);

                                if (eff_fill_tex.grain > 0.0f) {
                                    uint32_t hg = (((sx * 1103515245 + sy * 12345 + 0x654321) ^ 0xDEADBEEF) & 0xFF);
                                    float grain_factor = 1.0f - (eff_fill_tex.grain * 0.01f) * ((float)((int)hg - 128) / 128.0f);
                                    int ga = (int)(pix_a * grain_factor);
                                    pix_a = ga < 0 ? 0 : (ga > 255 ? 255 : (uint8_t)ga);
                                }

                                if (eff_fill_tex.invert) {
                                    int inv = (int)orig_a - ((int)pix_a - (int)(orig_a * 40 / 255));
                                    pix_a = inv < 0 ? 0 : (inv > 255 ? 255 : (uint8_t)inv);
                                }
                                if (eff_fill_tex.posterize >= 2) {
                                    int step = 255 / eff_fill_tex.posterize;
                                    pix_a = (uint8_t)(((pix_a + step / 2) / step) * step);
                                }

                                if (eff_fill_tex.hardness < 100.0f) {
                                    float intensity = eff_fill_tex.hardness_intensity > 0.0f ? eff_fill_tex.hardness_intensity : 50.0f;
                                    float feather_w = ((100.0f - eff_fill_tex.hardness) * 0.01f) * intensity;
                                    if (feather_w < 1.0f) feather_w = 1.0f;
                                    int r = (int)ceilf(feather_w);
                                    float min_d2 = feather_w * feather_w;
                                    int found_edge = 0;

                                    for (int dy = -r; dy <= r; dy++) {
                                        int ny = y + dy;
                                        if (ny < 0 || ny >= canvas_h) {
                                            float d2 = (float)(dy * dy);
                                            if (d2 < min_d2) min_d2 = d2;
                                            found_edge = 1;
                                            continue;
                                        }
                                        for (int dx = -r; dx <= r; dx++) {
                                            float d2 = (float)(dx * dx + dy * dy);
                                            if (d2 >= min_d2) continue;
                                            int nx = x + dx;
                                            if (nx < 0 || nx >= canvas_w || ((scratch_layer_pixels[ny * canvas_w + nx] >> 24) & 0xFF) == 0) {
                                                min_d2 = d2;
                                                found_edge = 1;
                                            }
                                        }
                                    }
                                    if (found_edge && min_d2 < feather_w * feather_w) {
                                        float d = sqrtf(min_d2);
                                        pix_a = (uint8_t)(pix_a * (d / feather_w));
                                    }
                                }
                            }

                            if (pix_a > 0) {
                                scratch[idx] = (col & 0x00FFFFFF) | ((uint32_t)pix_a << 24);
                            }
                        }
                    }
                }
            }

            /* 3. Shape Stroke Shading */
            if (has_stroke) {
                if (scratch_layer_pixels) memset(scratch_layer_pixels, 0, total_pixels * sizeof(uint32_t));
                render_shape_node(node, &cur_mat);
                float sw = node->style.stroke_width * sqrtf(cur_mat.a * cur_mat.a + cur_mat.b * cur_mat.b);
                if (eff_brush.enabled || eff_strk_tex.enabled || g_render_opts.brush_preset != 0 || g_render_opts.texture_mode > 0) {
                    float b_sz = sw * (g_render_opts.brush_size_scale > 0 ? g_render_opts.brush_size_scale : 1.0f);
                    if (b_sz < 1.0f) b_sz = 1.0f;
                    w_brush_set_param(W_PARAM_SIZE, (int32_t)roundf(b_sz));
                    w_brush_set_param(W_PARAM_FLOW, (int32_t)(eff_brush.enabled ? eff_brush.flow : 100.0f));
                    w_brush_set_param(W_PARAM_HARDNESS, (int32_t)(eff_brush.enabled ? eff_brush.hardness : 95.0f));
                    w_brush_set_param(W_PARAM_SPACING, (int32_t)(eff_brush.enabled ? eff_brush.spacing : 5.0f));
                    w_brush_set_param(W_PARAM_ROUNDNESS, (int32_t)(eff_brush.enabled ? eff_brush.roundness : 100.0f));
                    w_brush_set_param(W_PARAM_ANGLE, (int32_t)(eff_brush.enabled ? eff_brush.angle : 0.0f));
                    w_brush_set_param(W_PARAM_SCATTER, (int32_t)(eff_brush.enabled ? eff_brush.scatter : 0.0f));
                    w_brush_set_param(W_PARAM_SMUDGE, (int32_t)(eff_brush.enabled ? eff_brush.smudge : 0.0f));
                    w_brush_set_param(W_PARAM_WETNESS, (int32_t)(eff_brush.enabled ? eff_brush.wetness : 0.0f));
                    w_brush_set_param(W_PARAM_SHAPE, eff_brush.enabled ? eff_brush.tip_shape : 0);
                    w_brush_set_param(W_PARAM_DAB_BLEND, eff_brush.enabled ? eff_brush.dab_blend : 0);
                    w_brush_set_param(W_PARAM_TAPER_IN, (int32_t)(eff_brush.enabled ? eff_brush.taper_in : 0.0f));
                    w_brush_set_param(W_PARAM_TAPER_OUT, (int32_t)(eff_brush.enabled ? eff_brush.taper_out : 0.0f));
                    w_brush_set_param(W_PARAM_SIZE_JITTER, (int32_t)(eff_brush.enabled ? eff_brush.size_jitter : 0.0f));
                    w_brush_set_param(W_PARAM_AUTO_ROTATE, eff_brush.enabled ? eff_brush.auto_rotate : 0);
                    w_brush_set_param(W_PARAM_GRAIN, (int32_t)(eff_strk_tex.enabled && eff_strk_tex.grain > 0 ? eff_strk_tex.grain : (eff_brush.enabled ? eff_brush.grain : (g_render_opts.texture_grain > 0 ? g_render_opts.texture_grain : 0))));
                    w_brush_set_param(W_PARAM_TEX_MODE, eff_strk_tex.enabled && eff_strk_tex.mode > 0 ? eff_strk_tex.mode : (g_render_opts.texture_mode > 0 ? g_render_opts.texture_mode : 0));
                    w_brush_set_param(W_PARAM_TEX_ANGLE, eff_strk_tex.enabled ? (int32_t)roundf(eff_strk_tex.angle) : 0);
                    int tex_sc = (int)roundf(eff_strk_tex.enabled ? (eff_strk_tex.scale > 0 ? eff_strk_tex.scale : 100.0f) : (g_render_opts.texture_scale > 0 ? g_render_opts.texture_scale : 100.0f));
                    w_brush_set_param(W_PARAM_TEX_SCALE, tex_sc);
                    int tex_cnt = (int)roundf(eff_strk_tex.enabled ? eff_strk_tex.contrast : (g_render_opts.texture_contrast > 0 ? g_render_opts.texture_contrast : 100.0f));
                    w_brush_set_param(W_PARAM_TEX_CONTRAST, tex_cnt);

                    w_path_stroke_brush(scratch_layer, 0xFFFFFFFF, b_sz);
                } else {
                    w_path_stroke(scratch_layer, 0xFFFFFFFF, sw, node->style.cap_style, node->style.join_style);
                }

                if (scratch_layer_pixels) {
                    int b_min_x = canvas_w, b_min_y = canvas_h, b_max_x = 0, b_max_y = 0;
                    for (int y = 0; y < canvas_h; y++) {
                        for (int x = 0; x < canvas_w; x++) {
                            if ((scratch_layer_pixels[y * canvas_w + x] >> 24) > 0) {
                                if (x < b_min_x) b_min_x = x;
                                if (x > b_max_x) b_max_x = x;
                                if (y < b_min_y) b_min_y = y;
                                if (y > b_max_y) b_max_y = y;
                            }
                        }
                    }
                    float bbox_x1 = b_max_x >= b_min_x ? (float)b_min_x : 0.0f;
                    float bbox_y1 = b_max_y >= b_min_y ? (float)b_min_y : 0.0f;
                    float bbox_x2 = b_max_x >= b_min_x ? (float)b_max_x : (float)canvas_w;
                    float bbox_y2 = b_max_y >= b_min_y ? (float)b_max_y : (float)canvas_h;

                    for (int y = 0; y < canvas_h; y++) {
                        for (int x = 0; x < canvas_w; x++) {
                            int idx = y * canvas_w + x;
                            uint8_t a = (scratch_layer_pixels[idx] >> 24) & 0xFF;
                            if (a == 0) continue;

                            uint32_t col = strk_grad ?
                                quadro_sample_gradient(strk_grad, (float)x, (float)y, bbox_x1, bbox_y1, bbox_x2, bbox_y2) :
                                node->style.stroke_color;

                            uint8_t pix_a = (col >> 24) & 0xFF;
                            pix_a = (uint8_t)(pix_a * (a / 255.0f) * cur_opacity * node->style.stroke_opacity);

                            if (eff_strk_tex.enabled) {
                                pix_a = quadro_sample_procedural_texture(eff_strk_tex.mode, x, y,
                                    eff_strk_tex.angle, eff_strk_tex.scale,
                                    eff_strk_tex.contrast, pix_a);
                            }

                            if (pix_a > 0) {
                                uint32_t strk_pix = (col & 0x00FFFFFF) | ((uint32_t)pix_a << 24);
                                scratch[idx] = blend_pixels(scratch[idx], strk_pix, 0);
                            }
                        }
                    }
                }
            }

            /* 4. Composite Scratch Buffer onto Target Canvas */
            for (int i = 0; i < total_pixels; i++) {
                if ((scratch[i] & 0xFF000000) != 0) {
                    layer_pixels[i] = blend_pixels(layer_pixels[i], scratch[i], node->style.blend_mode);
                }
            }

            free(scratch);
        }
    }

    /* Render Children recursively */
    for (const quadro_svg_node_t *ch = node->children; ch != NULL; ch = ch->next) {
        render_node_recursive(doc, ch, cur_mat, cur_opacity, &node->style, canvas_w, canvas_h);
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

static float parse_dimension(const char *str, float relative_to) {
    if (!str) return 0.0f;
    if (strchr(str, '%')) {
        return (float)atof(str) / 100.0f * (relative_to > 0 ? relative_to : 800.0f);
    }
    return (float)atof(str);
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
        node->base_transform = node->transform;
        free(trans);
    }

    char *fill = extract_attr(tag_str, "fill");
    if (fill) {
        if (strncmp(fill, "url(", 4) == 0) {
            node->style.fill_type = 1;
            parse_url_id(fill, node->style.fill_gradient_id, sizeof(node->style.fill_gradient_id));
            node->style.has_fill = 1;
        } else {
            node->style.fill_type = 0;
            node->style.fill_color = parse_color(fill, &node->style.has_fill);
        }
        free(fill);
    }

    char *stroke = extract_attr(tag_str, "stroke");
    if (stroke) {
        if (strncmp(stroke, "url(", 4) == 0) {
            node->style.stroke_type = 1;
            parse_url_id(stroke, node->style.stroke_gradient_id, sizeof(node->style.stroke_gradient_id));
            node->style.has_stroke = 1;
        } else {
            node->style.stroke_type = 0;
            node->style.stroke_color = parse_color(stroke, &node->style.has_stroke);
        }
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

    char *clip = extract_attr(tag_str, "clip-path");
    if (clip) {
        parse_url_id(clip, node->style.clip_path_id, sizeof(node->style.clip_path_id));
        free(clip);
    }

    char *mix = extract_attr(tag_str, "mix-blend-mode");
    if (mix) {
        if (strcmp(mix, "multiply") == 0) node->style.blend_mode = 1;
        else if (strcmp(mix, "screen") == 0) node->style.blend_mode = 2;
        else if (strcmp(mix, "overlay") == 0) node->style.blend_mode = 3;
        else if (strcmp(mix, "darken") == 0) node->style.blend_mode = 4;
        else if (strcmp(mix, "lighten") == 0) node->style.blend_mode = 5;
        free(mix);
    }

    /* Wesenho Custom Data Attributes */
    char *brush = extract_attr(tag_str, "data-brush");
    if (brush) {
        parse_brush_attribute(&node->style.brush, brush);
        free(brush);
    }

    char *fill_tex = extract_attr(tag_str, "data-fill-tex");
    if (fill_tex) {
        parse_texture_attribute(&node->style.fill_texture, fill_tex);
        free(fill_tex);
    }

    char *strk_tex = extract_attr(tag_str, "data-stroke-tex");
    if (strk_tex) {
        parse_texture_attribute(&node->style.stroke_texture, strk_tex);
        free(strk_tex);
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
    n->base_transform = quadro_matrix_identity();
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

    /* Free Gradients */
    quadro_svg_gradient_t *g = doc->gradients;
    while (g) {
        quadro_svg_gradient_t *next = g->next;
        free(g);
        g = next;
    }

    /* Free Clip Paths */
    quadro_svg_clip_path_t *cp = doc->clip_paths;
    while (cp) {
        quadro_svg_clip_path_t *next = cp->next;
        if (cp->node) free_node(cp->node);
        free(cp);
        cp = next;
    }

    /* Free Animations */
    if (doc->animation) {
        quadro_svg_anim_track_t *tr = doc->animation->tracks;
        while (tr) {
            quadro_svg_anim_track_t *next = tr->next;
            if (tr->keyframes) {
                for (int i = 0; i < tr->keyframe_count; i++) {
                    if (tr->keyframes[i].path_d) free(tr->keyframes[i].path_d);
                }
                free(tr->keyframes);
            }
            if (tr->default_str) free(tr->default_str);
            free(tr);
            tr = next;
        }
        free(doc->animation);
    }

    free(doc);
}

static void parse_wesenho_animation(quadro_svg_doc_t *doc, const char *json_str) {
    if (!doc || !json_str) return;
    if (!doc->animation) {
        doc->animation = (quadro_svg_animation_t*)malloc(sizeof(quadro_svg_animation_t));
        memset(doc->animation, 0, sizeof(quadro_svg_animation_t));
        doc->animation->fps = 30.0f;
    }

    const char *fps_p = strstr(json_str, "\"fps\":");
    if (fps_p) doc->animation->fps = (float)atof(fps_p + 6);
    if (doc->animation->fps <= 0.0f) doc->animation->fps = 30.0f;

    const char *tf_p = strstr(json_str, "\"totalFrames\":");
    if (tf_p) {
        int tf = atoi(tf_p + 14);
        doc->animation->duration_ms = (tf * 1000.0f) / doc->animation->fps;
    }

    /* Iterate over objects array */
    const char *objs = strstr(json_str, "\"objects\":");
    if (!objs) return;

    const char *p = strchr(objs, '[');
    if (!p) return;
    p++;

    while (*p && *p != ']') {
        const char *obj_start = strchr(p, '{');
        if (!obj_start) break;

        /* Extract object id */
        char obj_id[64] = {0};
        const char *id_key = strstr(obj_start, "\"id\":");
        if (id_key) {
            const char *q1 = strchr(id_key + 5, '"');
            if (q1) {
                const char *q2 = strchr(q1 + 1, '"');
                if (q2 && (size_t)(q2 - q1 - 1) < sizeof(obj_id)) {
                    strncpy(obj_id, q1 + 1, q2 - q1 - 1);
                }
            }
        }

        /* Iterate over channels of this object */
        const char *ch_key = strstr(obj_start, "\"channels\":");
        if (ch_key && obj_id[0]) {
            const char *cp = strchr(ch_key, '[');
            if (cp) {
                cp++;
                while (*cp && *cp != ']') {
                    const char *ch_start = strchr(cp, '{');
                    if (!ch_start) break;

                    char param_key[32] = {0};
                    const char *pk = strstr(ch_start, "\"paramKey\":");
                    if (pk) {
                        const char *q1 = strchr(pk + 11, '"');
                        if (q1) {
                            const char *q2 = strchr(q1 + 1, '"');
                            if (q2 && (size_t)(q2 - q1 - 1) < sizeof(param_key)) {
                                strncpy(param_key, q1 + 1, q2 - q1 - 1);
                            }
                        }
                    }

                    float def_val = 0.0f;
                    uint32_t def_col = 0;
                    const char *dv = strstr(ch_start, "\"defaultValue\":");
                    if (dv) {
                        const char *val_start = dv + 15;
                        while (*val_start == ' ') val_start++;
                        if (*val_start == '"') {
                            int hc = 0;
                            char cbuf[64] = {0};
                            const char *q2 = strchr(val_start + 1, '"');
                            if (q2 && (size_t)(q2 - val_start - 1) < sizeof(cbuf)) {
                                strncpy(cbuf, val_start + 1, q2 - val_start - 1);
                                def_col = parse_color(cbuf, &hc);
                            }
                        } else {
                            def_val = (float)atof(val_start);
                        }
                    }

                    if (param_key[0]) {
                        quadro_svg_anim_track_t *tr = (quadro_svg_anim_track_t*)malloc(sizeof(quadro_svg_anim_track_t));
                        memset(tr, 0, sizeof(quadro_svg_anim_track_t));
                        strncpy(tr->target_id, obj_id, sizeof(tr->target_id) - 1);
                        strncpy(tr->property, param_key, sizeof(tr->property) - 1);
                        tr->default_val = def_val;
                        tr->default_color = def_col;

                        /* Parse keyframes array if present */
                        const char *kf_key = strstr(ch_start, "\"keyframes\":");
                        if (kf_key) {
                            const char *kp = strchr(kf_key, '[');
                            if (kp) {
                                kp++;
                                quadro_svg_keyframe_t kf_buf[256];
                                int kf_count = 0;
                                while (*kp && *kp != ']' && kf_count < 256) {
                                    const char *kf_obj = strchr(kp, '{');
                                    if (!kf_obj) break;
                                    float f_idx = 0.0f, val = 0.0f;
                                    const char *fp = strstr(kf_obj, "\"frame\":");
                                    if (fp) f_idx = (float)atof(fp + 8);
                                    const char *vp = strstr(kf_obj, "\"value\":");
                                    if (vp) {
                                        const char *vs = vp + 8;
                                        while (*vs == ' ') vs++;
                                        if (*vs == '"') {
                                            char cbuf[64] = {0};
                                            const char *q2 = strchr(vs + 1, '"');
                                            if (q2 && (size_t)(q2 - vs - 1) < sizeof(cbuf)) {
                                                strncpy(cbuf, vs + 1, q2 - vs - 1);
                                                int hc = 0;
                                                kf_buf[kf_count].fill_color = parse_color(cbuf, &hc);
                                                kf_buf[kf_count].stroke_color = kf_buf[kf_count].fill_color;
                                            }
                                        } else {
                                            val = (float)atof(vs);
                                        }
                                    }
                                    kf_buf[kf_count].time_ms = (f_idx * 1000.0f) / doc->animation->fps;
                                    kf_buf[kf_count].x = val;
                                    kf_buf[kf_count].y = val;
                                    kf_buf[kf_count].scale_x = val;
                                    kf_buf[kf_count].scale_y = val;
                                    kf_buf[kf_count].rotation = val;
                                    kf_buf[kf_count].opacity = val;
                                    kf_count++;

                                    const char *kf_end = strchr(kf_obj, '}');
                                    if (kf_end) kp = kf_end + 1;
                                    else break;
                                }
                                if (kf_count > 0) {
                                    tr->keyframe_count = kf_count;
                                    tr->keyframes = (quadro_svg_keyframe_t*)malloc(kf_count * sizeof(quadro_svg_keyframe_t));
                                    memcpy(tr->keyframes, kf_buf, kf_count * sizeof(quadro_svg_keyframe_t));
                                }
                            }
                        }

                        tr->next = doc->animation->tracks;
                        doc->animation->tracks = tr;
                    }

                    const char *ch_end = strchr(ch_start, '}');
                    if (ch_end) cp = ch_end + 1;
                    else break;
                }
            }
        }

        const char *obj_end = strchr(obj_start, '}');
        if (obj_end) p = obj_end + 1;
        else break;
    }
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

    quadro_svg_gradient_t *current_gradient = NULL;

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

        /* Skip XML declaration */
        if (strncmp(tag_start, "<?", 2) == 0 || strncmp(tag_start, "<!", 2) == 0) {
            const char *tag_end = strchr(tag_start, '>');
            if (tag_end) p = tag_end + 1;
            else break;
            continue;
        }

        /* Closing tags */
        if (strncmp(tag_start, "</", 2) == 0) {
            if (strncmp(tag_start, "</linearGradient>", 17) == 0 || strncmp(tag_start, "</radialGradient>", 17) == 0) {
                current_gradient = NULL;
            } else if (stack_top >= 0) {
                stack_top--;
            }
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
        } else if (strcmp(tag_name, "linearGradient") == 0 || strcmp(tag_name, "radialGradient") == 0) {
            quadro_svg_gradient_t *grad = (quadro_svg_gradient_t*)malloc(sizeof(quadro_svg_gradient_t));
            memset(grad, 0, sizeof(quadro_svg_gradient_t));
            grad->type = (strcmp(tag_name, "linearGradient") == 0) ? QUADRO_GRADIENT_LINEAR : QUADRO_GRADIENT_RADIAL;
            grad->transform = quadro_matrix_identity();

            char *gid = extract_attr(tag_buf, "id");
            if (gid) { strncpy(grad->id, gid, sizeof(grad->id) - 1); free(gid); }

            char *gt = extract_attr(tag_buf, "gradientTransform");
            if (gt) { grad->transform = parse_transform(gt); free(gt); }

            char *sm = extract_attr(tag_buf, "spreadMethod");
            if (sm) {
                if (strcmp(sm, "reflect") == 0) grad->spread_method = QUADRO_SPREAD_REFLECT;
                else if (strcmp(sm, "repeat") == 0) grad->spread_method = QUADRO_SPREAD_REPEAT;
                free(sm);
            }

            if (grad->type == QUADRO_GRADIENT_LINEAR) {
                char *x1 = extract_attr(tag_buf, "x1");
                char *y1 = extract_attr(tag_buf, "y1");
                char *x2 = extract_attr(tag_buf, "x2");
                char *y2 = extract_attr(tag_buf, "y2");
                if (x1 && strchr(x1, '%')) { grad->is_percentage = 1; grad->x1 = (float)atof(x1) / 100.0f; } else if (x1) grad->x1 = (float)atof(x1);
                if (y1 && strchr(y1, '%')) { grad->is_percentage = 1; grad->y1 = (float)atof(y1) / 100.0f; } else if (y1) grad->y1 = (float)atof(y1);
                if (x2 && strchr(x2, '%')) { grad->is_percentage = 1; grad->x2 = (float)atof(x2) / 100.0f; } else if (x2) grad->x2 = (float)atof(x2); else grad->x2 = 1.0f;
                if (y2 && strchr(y2, '%')) { grad->is_percentage = 1; grad->y2 = (float)atof(y2) / 100.0f; } else if (y2) grad->y2 = (float)atof(y2);
                if (x1) free(x1);
                if (y1) free(y1);
                if (x2) free(x2);
                if (y2) free(y2);
            } else {
                char *cx = extract_attr(tag_buf, "cx");
                char *cy = extract_attr(tag_buf, "cy");
                char *r  = extract_attr(tag_buf, "r");
                if (cx && strchr(cx, '%')) { grad->is_percentage = 1; grad->cx = (float)atof(cx) / 100.0f; } else if (cx) grad->cx = (float)atof(cx); else grad->cx = 0.5f;
                if (cy && strchr(cy, '%')) { grad->is_percentage = 1; grad->cy = (float)atof(cy) / 100.0f; } else if (cy) grad->cy = (float)atof(cy); else grad->cy = 0.5f;
                if (r  && strchr(r,  '%')) { grad->is_percentage = 1; grad->r  = (float)atof(r)  / 100.0f; } else if (r)  grad->r  = (float)atof(r);  else grad->r  = 0.5f;
                if (cx) free(cx);
                if (cy) free(cy);
                if (r) free(r);
            }

            /* Insert gradient into document list */
            grad->next = doc->gradients;
            doc->gradients = grad;
            current_gradient = grad;
        } else if (strcmp(tag_name, "stop") == 0 && current_gradient) {
            if (current_gradient->stop_count < 16) {
                int si = current_gradient->stop_count++;
                char *off = extract_attr(tag_buf, "offset");
                char *col = extract_attr(tag_buf, "stop-color");
                char *op  = extract_attr(tag_buf, "stop-opacity");
                if (off) {
                    current_gradient->stops[si].offset = strchr(off, '%') ? (float)atof(off) / 100.0f : (float)atof(off);
                    free(off);
                }
                int hc = 0;
                current_gradient->stops[si].color = col ? parse_color(col, &hc) : 0xFF000000;
                current_gradient->stops[si].opacity = op ? (float)atof(op) : 1.0f;
                if (op) {
                    uint8_t a = (uint8_t)(current_gradient->stops[si].opacity * 255.0f);
                    current_gradient->stops[si].color = (current_gradient->stops[si].color & 0x00FFFFFF) | ((uint32_t)a << 24);
                    free(op);
                }
                if (col) free(col);
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
            if (x) { node->geom.rect.x = parse_dimension(x, doc->width); free(x); }
            if (y) { node->geom.rect.y = parse_dimension(y, doc->height); free(y); }
            if (w) { node->geom.rect.w = parse_dimension(w, doc->width); free(w); }
            if (h) { node->geom.rect.h = parse_dimension(h, doc->height); free(h); }
            if (rx) { node->geom.rect.rx = parse_dimension(rx, doc->width); free(rx); }
            if (ry) { node->geom.rect.ry = parse_dimension(ry, doc->height); free(ry); }
            add_child_node(node);
        } else if (strcmp(tag_name, "circle") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_CIRCLE);
            parse_node_attributes(node, tag_buf);
            char *cx = extract_attr(tag_buf, "cx");
            char *cy = extract_attr(tag_buf, "cy");
            char *r  = extract_attr(tag_buf, "r");
            if (cx) { node->geom.circle.cx = parse_dimension(cx, doc->width); free(cx); }
            if (cy) { node->geom.circle.cy = parse_dimension(cy, doc->height); free(cy); }
            if (r)  { node->geom.circle.r  = parse_dimension(r, doc->width);  free(r);  }
            add_child_node(node);
        } else if (strcmp(tag_name, "ellipse") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_ELLIPSE);
            parse_node_attributes(node, tag_buf);
            char *cx = extract_attr(tag_buf, "cx");
            char *cy = extract_attr(tag_buf, "cy");
            char *rx = extract_attr(tag_buf, "rx");
            char *ry = extract_attr(tag_buf, "ry");
            if (cx) { node->geom.ellipse.cx = parse_dimension(cx, doc->width); free(cx); }
            if (cy) { node->geom.ellipse.cy = parse_dimension(cy, doc->height); free(cy); }
            if (rx) { node->geom.ellipse.rx = parse_dimension(rx, doc->width); free(rx); }
            if (ry) { node->geom.ellipse.ry = parse_dimension(ry, doc->height); free(ry); }
            add_child_node(node);
        } else if (strcmp(tag_name, "line") == 0) {
            quadro_svg_node_t *node = create_node(QUADRO_SVG_LINE);
            parse_node_attributes(node, tag_buf);
            char *x1 = extract_attr(tag_buf, "x1");
            char *y1 = extract_attr(tag_buf, "y1");
            char *x2 = extract_attr(tag_buf, "x2");
            char *y2 = extract_attr(tag_buf, "y2");
            if (x1) { node->geom.line.x1 = parse_dimension(x1, doc->width); free(x1); }
            if (y1) { node->geom.line.y1 = parse_dimension(y1, doc->height); free(y1); }
            if (x2) { node->geom.line.x2 = parse_dimension(x2, doc->width); free(x2); }
            if (y2) { node->geom.line.y2 = parse_dimension(y2, doc->height); free(y2); }
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
                float tx = x ? parse_dimension(x, doc->width) : 0;
                float ty = y ? parse_dimension(y, doc->height) : 0;
                quadro_matrix_t m = { 1, 0, 0, 1, tx, ty };
                node->transform = quadro_matrix_multiply(node->transform, m);
                node->base_transform = node->transform;
                if (x) free(x);
                if (y) free(y);
            }
            if (fs) { node->font_size = (float)atof(fs); free(fs); }
            if (ta) {
                if (strcmp(ta, "middle") == 0) node->text_anchor = 1;
                else if (strcmp(ta, "end") == 0) node->text_anchor = 2;
                free(ta);
            }

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
        } else if (strcmp(tag_name, "script") == 0) {
            char *sid = extract_attr(tag_buf, "id");
            const char *content_start = tag_end + 1;
            const char *content_end = strstr(content_start, "</script>");
            if (content_end) {
                if (sid && strcmp(sid, "wesenho-animation") == 0) {
                    size_t slen = content_end - content_start;
                    char *json_buf = (char*)malloc(slen + 1);
                    memcpy(json_buf, content_start, slen);
                    json_buf[slen] = 0;
                    parse_wesenho_animation(doc, json_buf);
                    free(json_buf);
                }
                p = content_end + 9;
            }
            if (sid) free(sid);
            free(tag_buf);
            continue;
        }

        free(tag_buf);
        p = tag_end + 1;
    }

    if (doc->animation) {
        quadro_svg_doc_evaluate_time(doc, 0.0f);
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
 * Animation / Timeline Evaluation & DopeSheet Morphs
 * ========================================================================= */

static quadro_svg_node_t *find_node_by_id(quadro_svg_node_t *root, const char *id) {
    if (!root || !id || !*id) return NULL;
    if (strcmp(root->id, id) == 0) return root;

    for (quadro_svg_node_t *ch = root->children; ch != NULL; ch = ch->next) {
        quadro_svg_node_t *res = find_node_by_id(ch, id);
        if (res) return res;
    }
    return NULL;
}

void quadro_svg_doc_evaluate_time(quadro_svg_doc_t *doc, float time_ms) {
    if (!doc || !doc->animation) return;

    /* Reset nodes to base transform */
    void reset_nodes(quadro_svg_node_t *n) {
        if (!n) return;
        n->transform = n->base_transform;
        for (quadro_svg_node_t *ch = n->children; ch != NULL; ch = ch->next) reset_nodes(ch);
    }
    reset_nodes(doc->root);

    /* Collect animated state for all objects */
    typedef struct {
        char id[64];
        float x, y, rot, sx, sy, opacity, sw;
        uint32_t stroke_col, fill_col;
        int has_x, has_y, has_rot, has_sx, has_sy, has_op, has_sw, has_scol, has_fcol;
    } node_anim_state_t;

    node_anim_state_t states[256];
    int state_count = 0;

    for (quadro_svg_anim_track_t *tr = doc->animation->tracks; tr != NULL; tr = tr->next) {
        int s_idx = -1;
        for (int i = 0; i < state_count; i++) {
            if (strcmp(states[i].id, tr->target_id) == 0) { s_idx = i; break; }
        }
        if (s_idx < 0 && state_count < 256) {
            s_idx = state_count++;
            memset(&states[s_idx], 0, sizeof(node_anim_state_t));
            strncpy(states[s_idx].id, tr->target_id, 63);
            states[s_idx].sx = 1.0f;
            states[s_idx].sy = 1.0f;
            states[s_idx].opacity = 1.0f;
        }
        if (s_idx < 0) continue;

        float val = tr->default_val;
        uint32_t col = tr->default_color;

        if (tr->keyframe_count == 1 || (tr->keyframe_count > 0 && time_ms <= tr->keyframes[0].time_ms)) {
            val = tr->keyframes[0].x;
            col = tr->keyframes[0].fill_color;
        } else if (tr->keyframe_count > 1 && time_ms >= tr->keyframes[tr->keyframe_count - 1].time_ms) {
            val = tr->keyframes[tr->keyframe_count - 1].x;
            col = tr->keyframes[tr->keyframe_count - 1].fill_color;
        } else if (tr->keyframe_count > 1) {
            for (int i = 0; i < tr->keyframe_count - 1; i++) {
                if (time_ms >= tr->keyframes[i].time_ms && time_ms <= tr->keyframes[i+1].time_ms) {
                    float span = tr->keyframes[i+1].time_ms - tr->keyframes[i].time_ms;
                    float t = span > 1e-6f ? (time_ms - tr->keyframes[i].time_ms) / span : 0.0f;
                    val = tr->keyframes[i].x + (tr->keyframes[i+1].x - tr->keyframes[i].x) * t;
                    break;
                }
            }
        }

        if (strcmp(tr->property, "transform") == 0) {
            if (tr->keyframe_count == 1 || (tr->keyframe_count > 0 && time_ms <= tr->keyframes[0].time_ms)) {
                states[s_idx].x = tr->keyframes[0].x;
                states[s_idx].y = tr->keyframes[0].y;
                states[s_idx].sx = tr->keyframes[0].scale_x > 0 ? tr->keyframes[0].scale_x : 1.0f;
                states[s_idx].sy = tr->keyframes[0].scale_y > 0 ? tr->keyframes[0].scale_y : 1.0f;
                states[s_idx].rot = tr->keyframes[0].rotation;
            } else if (tr->keyframe_count > 1 && time_ms >= tr->keyframes[tr->keyframe_count - 1].time_ms) {
                int last = tr->keyframe_count - 1;
                states[s_idx].x = tr->keyframes[last].x;
                states[s_idx].y = tr->keyframes[last].y;
                states[s_idx].sx = tr->keyframes[last].scale_x > 0 ? tr->keyframes[last].scale_x : 1.0f;
                states[s_idx].sy = tr->keyframes[last].scale_y > 0 ? tr->keyframes[last].scale_y : 1.0f;
                states[s_idx].rot = tr->keyframes[last].rotation;
            } else if (tr->keyframe_count > 1) {
                for (int i = 0; i < tr->keyframe_count - 1; i++) {
                    if (time_ms >= tr->keyframes[i].time_ms && time_ms <= tr->keyframes[i+1].time_ms) {
                        float span = tr->keyframes[i+1].time_ms - tr->keyframes[i].time_ms;
                        float t = span > 1e-6f ? (time_ms - tr->keyframes[i].time_ms) / span : 0.0f;
                        states[s_idx].x = tr->keyframes[i].x + (tr->keyframes[i+1].x - tr->keyframes[i].x) * t;
                        states[s_idx].y = tr->keyframes[i].y + (tr->keyframes[i+1].y - tr->keyframes[i].y) * t;
                        float sx0 = tr->keyframes[i].scale_x > 0 ? tr->keyframes[i].scale_x : 1.0f;
                        float sy0 = tr->keyframes[i].scale_y > 0 ? tr->keyframes[i].scale_y : 1.0f;
                        float sx1 = tr->keyframes[i+1].scale_x > 0 ? tr->keyframes[i+1].scale_x : 1.0f;
                        float sy1 = tr->keyframes[i+1].scale_y > 0 ? tr->keyframes[i+1].scale_y : 1.0f;
                        states[s_idx].sx = sx0 + (sx1 - sx0) * t;
                        states[s_idx].sy = sy0 + (sy1 - sy0) * t;
                        states[s_idx].rot = tr->keyframes[i].rotation + (tr->keyframes[i+1].rotation - tr->keyframes[i].rotation) * t;
                        break;
                    }
                }
            }
            states[s_idx].has_x = states[s_idx].has_y = states[s_idx].has_sx = states[s_idx].has_sy = states[s_idx].has_rot = 1;
        } else if (strcmp(tr->property, "x") == 0) { states[s_idx].x = val; states[s_idx].has_x = 1; }
        else if (strcmp(tr->property, "y") == 0) { states[s_idx].y = val; states[s_idx].has_y = 1; }
        else if (strcmp(tr->property, "rotation") == 0) { states[s_idx].rot = val; states[s_idx].has_rot = 1; }
        else if (strcmp(tr->property, "scaleX") == 0) { states[s_idx].sx = val; states[s_idx].has_sx = 1; }
        else if (strcmp(tr->property, "scaleY") == 0) { states[s_idx].sy = val; states[s_idx].has_sy = 1; }
        else if (strcmp(tr->property, "scale") == 0) { states[s_idx].sx = states[s_idx].sy = val; states[s_idx].has_sx = states[s_idx].has_sy = 1; }
        else if (strcmp(tr->property, "opacity") == 0) { states[s_idx].opacity = val; states[s_idx].has_op = 1; }
        else if (strcmp(tr->property, "strokeWidth") == 0) { states[s_idx].sw = val; states[s_idx].has_sw = 1; }
        else if (strcmp(tr->property, "strokeColor") == 0) { states[s_idx].stroke_col = col; states[s_idx].has_scol = 1; }
        else if (strcmp(tr->property, "fillColor") == 0) { states[s_idx].fill_col = col; states[s_idx].has_fcol = 1; }
    }

    for (int i = 0; i < state_count; i++) {
        quadro_svg_node_t *target = find_node_by_id(doc->root, states[i].id);
        if (!target) continue;

        if (states[i].has_op) target->style.opacity = states[i].opacity;
        if (states[i].has_sw) target->style.stroke_width = states[i].sw;
        if (states[i].has_scol && states[i].stroke_col != 0) target->style.stroke_color = states[i].stroke_col;
        if (states[i].has_fcol && states[i].fill_col != 0) target->style.fill_color = states[i].fill_col;

        if (states[i].has_x || states[i].has_y || states[i].has_rot || states[i].has_sx || states[i].has_sy) {
            float rad = states[i].rot * (float)M_PI / 180.0f;
            float cos_a = cosf(rad);
            float sin_a = sinf(rad);

            quadro_matrix_t t_mat = { 1, 0, 0, 1, states[i].x, states[i].y };
            quadro_matrix_t r_mat = { cos_a, sin_a, -sin_a, cos_a, 0, 0 };
            quadro_matrix_t s_mat = { states[i].sx, 0, 0, states[i].sy, 0, 0 };

            quadro_matrix_t anim_m = quadro_matrix_multiply(t_mat, r_mat);
            anim_m = quadro_matrix_multiply(anim_m, s_mat);

            target->transform = quadro_matrix_multiply(target->base_transform, anim_m);
        }
    }
}

/* =========================================================================
 * High-Level Render & Frame Sequence Export API
 * ========================================================================= */

int quadro_svg_render_frame(quadro_svg_doc_t *doc, uint32_t *out_rgba, int width, int height, float scale, float time_ms) {
    if (!doc) return 0;
    if (doc->animation) {
        quadro_svg_doc_evaluate_time(doc, time_ms);
    }
    return quadro_svg_render(doc, out_rgba, width, height, scale);
}

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
        if (doc->background_color != 0) {
            for (int i = 0; i < w * h; i++) layer_pixels[i] = doc->background_color;
        } else {
            memset(layer_pixels, 0, w * h * sizeof(uint32_t));
        }
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

    /* Traverse scene graph and rasterize with full shading */
    for (const quadro_svg_node_t *node = doc->root; node != NULL; node = node->next) {
        render_node_recursive(doc, node, root_mat, 1.0f, NULL, w, h);
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

int quadro_svg_render_sequence(const char *svg_path, const char *out_pattern, float start_time, float end_time, float fps, float scale) {
    quadro_svg_doc_t *doc = quadro_svg_parse_file(svg_path);
    if (!doc) return 0;

    if (fps <= 0.0f) fps = 30.0f;
    if (scale <= 0.0f) scale = 1.0f;
    float dt = 1000.0f / fps;

    int w = (int)ceilf(doc->width * scale);
    int h = (int)ceilf(doc->height * scale);
    uint32_t *rgba = (uint32_t*)malloc(w * h * sizeof(uint32_t));

    int frame_idx = 0;
    for (float t = start_time; t <= end_time + 0.1f; t += dt) {
        char filename[512];
        snprintf(filename, sizeof(filename), out_pattern, frame_idx++);
        quadro_svg_render_frame(doc, rgba, w, h, scale, t);
        stbi_write_png(filename, w, h, 4, rgba, w * 4);
    }

    free(rgba);
    quadro_svg_doc_free(doc);
    return 1;
}
