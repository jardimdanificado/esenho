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

typedef enum {
    QUADRO_GRADIENT_NONE = 0,
    QUADRO_GRADIENT_LINEAR,
    QUADRO_GRADIENT_RADIAL
} quadro_svg_gradient_type_t;

typedef enum {
    QUADRO_SPREAD_PAD = 0,
    QUADRO_SPREAD_REFLECT,
    QUADRO_SPREAD_REPEAT
} quadro_svg_spread_method_t;

typedef struct {
    float    offset;     /* 0.0 .. 1.0 */
    uint32_t color;      /* ARGB format */
    float    opacity;    /* 0.0 .. 1.0 */
} quadro_svg_gradient_stop_t;

typedef struct quadro_svg_gradient {
    char id[64];
    quadro_svg_gradient_type_t type;
    float x1, y1, x2, y2;       /* Linear coords (% or abs) */
    float cx, cy, r, fx, fy;    /* Radial coords (% or abs) */
    int   is_percentage;
    quadro_svg_spread_method_t spread_method;
    quadro_matrix_t transform;
    quadro_svg_gradient_stop_t stops[16];
    int stop_count;
    struct quadro_svg_gradient *next;
} quadro_svg_gradient_t;

typedef struct {
    int   enabled;
    float size;
    float flow;          /* 0..100 */
    float hardness;      /* 0..100 */
    float spacing;       /* dab step */
    float scatter;       /* offset jitter % */
    float roundness;     /* 0..100 */
    float angle;         /* degrees */
    int   auto_rotate;   /* 0 or 1 */
    float taper_in;      /* 0..100 */
    float taper_out;     /* 0..100 */
    float size_jitter;   /* 0..100 */
    float angle_jitter;  /* 0..360 */
    float opacity_jitter;/* 0..100 */
    float grain;         /* 0..100 */
    float wetness;       /* 0..100 */
    float smudge;        /* 0..100 */
    float color_pickup;  /* 0..100 */
    float depletion;     /* 0..100 */
    int   dab_blend;
    int   tip_shape;
} quadro_svg_brush_config_t;

typedef struct {
    int   enabled;
    int   mode;          /* 1..70 procedural textures */
    float scale;         /* 100 default */
    float angle;         /* 0 default */
    float contrast;      /* 100 default */
    float grain;         /* 50 default */
    int   relative;      /* 0=world space, 1=object-relative */
    float offset_x;
    float offset_y;
    float warp_strength; /* 0..100 */
    float warp_freq;     /* default 20 */
    float noise_distort; /* 0..100 */
    float hardness;      /* 0..100, default 100 */
    float hardness_intensity; /* 1..500, default 50.0f */
    int   invert;        /* 0 or 1 */
    int   blend_mode;    /* 0=multiply, 1=subtract, 2=overlay, 3=screen, 4=add, 5=color burn */
    int   posterize;     /* 0=off, 2..16 levels */
    float pinch_swirl;   /* -100..100 */
} quadro_svg_texture_config_t;

typedef struct quadro_svg_clip_path {
    char id[64];
    struct quadro_svg_node *node;
    struct quadro_svg_clip_path *next;
} quadro_svg_clip_path_t;

typedef struct {
    float    time_ms;
    float    x, y, scale_x, scale_y, rotation, opacity;
    uint32_t fill_color;
    uint32_t stroke_color;
    char     *path_d;
} quadro_svg_keyframe_t;

typedef struct quadro_svg_anim_track {
    char target_id[64];
    char property[32];
    float default_val;
    uint32_t default_color;
    char *default_str;
    quadro_svg_keyframe_t *keyframes;
    int keyframe_count;
    struct quadro_svg_anim_track *next;
} quadro_svg_anim_track_t;

typedef struct {
    float duration_ms;
    float fps;
    int   loop;
    quadro_svg_anim_track_t *tracks;
} quadro_svg_animation_t;

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

    /* Extended Shader & Effects Properties */
    int      fill_type;        /* 0 = solid, 1 = gradient */
    char     fill_gradient_id[64];
    int      stroke_type;      /* 0 = solid, 1 = gradient */
    char     stroke_gradient_id[64];
    char     clip_path_id[64];
    int      blend_mode;       /* 0=normal, 1=multiply, 2=screen, 3=overlay, etc. */

    quadro_svg_brush_config_t   brush;
    quadro_svg_texture_config_t fill_texture;
    quadro_svg_texture_config_t stroke_texture;
} quadro_svg_style_t;

typedef struct quadro_svg_node {
    quadro_svg_node_type_t type;
    char id[64];
    quadro_matrix_t transform;
    quadro_matrix_t base_transform;
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
    quadro_svg_gradient_t *gradients;
    quadro_svg_clip_path_t *clip_paths;
    quadro_svg_animation_t *animation;
} quadro_svg_doc_t;

/* SVG Document API */
W_EXPORT quadro_svg_doc_t *quadro_svg_parse_string(const char *xml_str, size_t length);
W_EXPORT quadro_svg_doc_t *quadro_svg_parse_file(const char *file_path);
W_EXPORT void              quadro_svg_doc_free(quadro_svg_doc_t *doc);

/* Render API */
W_EXPORT int  quadro_svg_render(quadro_svg_doc_t *doc, uint32_t *out_rgba, int width, int height, float scale);
W_EXPORT int  quadro_svg_render_frame(quadro_svg_doc_t *doc, uint32_t *out_rgba, int width, int height, float scale, float time_ms);
W_EXPORT int  quadro_svg_render_to_file(const char *svg_path, const char *out_png_path, float scale, int override_w, int override_h);
W_EXPORT int  quadro_svg_render_sequence(const char *svg_path, const char *out_pattern, float start_time, float end_time, float fps, float scale);

/* Animation / Timeline Evaluation */
W_EXPORT void quadro_svg_doc_evaluate_time(quadro_svg_doc_t *doc, float time_ms);

/* Procedural & Shader Math Utilities */
W_EXPORT uint8_t  quadro_sample_procedural_texture(int mode, int x, int y, float angle, float scale, float contrast, uint8_t base_alpha);
W_EXPORT uint32_t quadro_sample_gradient(const quadro_svg_gradient_t *grad, float x, float y, float min_x, float min_y, float max_x, float max_y);

/* Global Render & Artistic Quadro Shading Options */
typedef struct {
    int   brush_preset;          /* 0=None, 1=Inker, 2=Pencil, 3=Charcoal, 4=Chisel, 5=Watercolor */
    float brush_size_scale;      /* Stroke width multiplier into brush dab size (default 1.0) */
    int   texture_mode;          /* 0=None, 1=Paper, 2=Canvas, 3=Noise, 4=Smoke, 5=Crosshatch, 6=Halftone, 7=Watercolor, 8=Rough Pastel, 9=Charcoal, 10=Wood, 11=Marble, 12=Grunge */
    float texture_scale;         /* Scale percentage (default 100.0) */
    float texture_contrast;      /* Contrast (default 100.0) */
    float texture_grain;         /* Grain (default 50.0) */
} quadro_svg_render_options_t;

W_EXPORT void quadro_svg_set_global_options(const quadro_svg_render_options_t *opts);
W_EXPORT void quadro_svg_get_global_options(quadro_svg_render_options_t *out_opts);

/* Text to Vector Path API */
W_EXPORT void quadro_text_to_path(const char *text, float x, float y, float font_size, int text_anchor, const quadro_matrix_t *mat);

#ifdef __cplusplus
}
#endif

#endif /* QUADRO_SVG_H */
