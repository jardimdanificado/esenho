#ifndef QUADRO_SVG_H
#define QUADRO_SVG_H

#include <stdint.h>
#include <stddef.h>
#include "quadro.h"

#ifdef __cplusplus
extern "C" {
#endif

/* 2D Affine Transform Matrix [a c e; b d f; 0 0 1] */
typedef struct {
    float a, b, c, d, e, f;
} quadro_matrix_t;

typedef enum {
    QUADRO_SVG_NONE = 0,
    QUADRO_SVG_PATH,
    QUADRO_SVG_RECT,
    QUADRO_SVG_CIRCLE,
    QUADRO_SVG_ELLIPSE,
    QUADRO_SVG_LINE,
    QUADRO_SVG_POLYLINE,
    QUADRO_SVG_POLYGON,
    QUADRO_SVG_TEXT,
    QUADRO_SVG_GROUP
} quadro_svg_node_type_t;

typedef struct quadro_svg_style {
    uint32_t fill_color;       /* ARGB format */
    uint32_t stroke_color;     /* ARGB format */
    float    stroke_width;
    float    opacity;          /* 0.0 .. 1.0 */
    float    fill_opacity;     /* 0.0 .. 1.0 */
    float    stroke_opacity;   /* 0.0 .. 1.0 */
    int32_t  fill_rule;        /* 0 = non-zero, 1 = even-odd */
    int32_t  cap_style;        /* 0 = butt, 1 = round, 2 = square */
    int32_t  join_style;       /* 0 = miter, 1 = round, 2 = bevel */
    int      has_fill;
    int      has_stroke;
} quadro_svg_style_t;

typedef struct quadro_svg_node {
    quadro_svg_node_type_t type;
    char id[64];
    quadro_matrix_t transform;
    quadro_svg_style_t style;
    
    /* Text specific properties */
    char *text_content;
    float font_size;
    int   text_anchor; /* 0=start, 1=middle, 2=end */
    
    /* Shape geometries */
    union {
        struct { float x, y, w, h, rx, ry; } rect;
        struct { float cx, cy, r; } circle;
        struct { float cx, cy, rx, ry; } ellipse;
        struct { float x1, y1, x2, y2; } line;
        struct { float *points; int count; } poly;
        struct { char *d; } path;
    } geom;

    /* Hierarchical tree structure */
    struct quadro_svg_node *next;
    struct quadro_svg_node *children;
} quadro_svg_node_t;

typedef struct quadro_svg_doc {
    float width;
    float height;
    float vb_x, vb_y, vb_w, vb_h;
    int   has_viewbox;
    uint32_t background_color;
    quadro_svg_node_t *root;
} quadro_svg_doc_t;

/* SVG Document API */
W_EXPORT quadro_svg_doc_t *quadro_svg_parse_string(const char *xml_str, size_t length);
W_EXPORT quadro_svg_doc_t *quadro_svg_parse_file(const char *file_path);
W_EXPORT void              quadro_svg_doc_free(quadro_svg_doc_t *doc);

/* Render API */
W_EXPORT int  quadro_svg_render(quadro_svg_doc_t *doc, uint32_t *out_rgba, int width, int height, float scale);
W_EXPORT int  quadro_svg_render_to_file(const char *svg_path, const char *out_png_path, float scale, int override_w, int override_h);

/* Text to Vector Path API */
W_EXPORT void quadro_text_to_path(const char *text, float x, float y, float font_size, int text_anchor, const quadro_matrix_t *mat);

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_SVG_H */
