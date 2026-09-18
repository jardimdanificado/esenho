/**
 * src/gpu/shaders.js
 * GLSL 3.00 ES shaders for Esenho WebGL 2 GPU subsystem.
 */

const VIEWPORT_VERT = `#version 300 es
precision highp float;

// Fullscreen triangle or quad positions [-1, 1]
in vec2 a_position;

out vec2 v_screen_uv;

void main() {
    v_screen_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const VIEWPORT_FRAG = `#version 300 es
precision highp float;

in vec2 v_screen_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_screen_size;     // Canvas screen resolution (pixels)
uniform vec2 u_doc_size;        // Document resolution (pixels)
uniform vec2 u_pan;             // Pan offset (pixels)
uniform float u_zoom;           // Zoom factor
uniform float u_rotation;       // Rotation angle in radians
uniform vec2 u_flip;            // (-1, 1) or (1, 1)
uniform int u_filter_mode;      // 0 = Nearest (Pixel Art), 1 = Linear / Smooth
uniform int u_symmetry_mode;    // 0 = Off, 1 = Vert, 2 = Horiz, 3 = Quad
uniform float u_time;

// Procedural background checkerboard
vec4 get_checkerboard(vec2 doc_px) {
    vec2 cell = floor(doc_px / 16.0);
    float check = mod(cell.x + cell.y, 2.0);
    vec3 c1 = vec3(0.133, 0.133, 0.133); // #222222
    vec3 c2 = vec3(0.165, 0.165, 0.165); // #2a2a2a
    return vec4(mix(c1, c2, check), 1.0);
}

void main() {
    // Convert screen UV to screen pixel coordinates (Y inverted for WebGL viewport)
    vec2 screen_px = vec2(v_screen_uv.x * u_screen_size.x, (1.0 - v_screen_uv.y) * u_screen_size.y);

    // Document center in screen space
    vec2 doc_center_screen = u_pan + (u_doc_size * u_zoom) * 0.5;

    // Offset relative to center
    vec2 offset = screen_px - doc_center_screen;

    // Inverse rotation matching document space
    float cos_r = cos(u_rotation);
    float sin_r = sin(u_rotation);
    vec2 unrotated = vec2(
        offset.x * cos_r + offset.y * sin_r,
       -offset.x * sin_r + offset.y * cos_r
    );

    // Inverse flip
    unrotated *= u_flip;

    // Convert back to document pixel coordinates (0..doc_size)
    vec2 doc_px = (unrotated / u_zoom) + (u_doc_size * 0.5);

    // Check if within document bounds
    if (doc_px.x < 0.0 || doc_px.x > u_doc_size.x || doc_px.y < 0.0 || doc_px.y > u_doc_size.y) {
        // App workspace background (#1d2021)
        fragColor = vec4(0.114, 0.125, 0.129, 1.0);
        return;
    }

    // Normalized UV inside document (0.0 to 1.0)
    vec2 doc_uv = doc_px / u_doc_size;

    // Sample composite texture (upload is top-down)
    vec4 texColor = texture(u_texture, doc_uv);

    // Blend over transparency checkerboard
    vec4 bg = get_checkerboard(doc_px);
    vec3 blended = mix(bg.rgb, texColor.rgb, texColor.a);
    vec4 finalColor = vec4(blended, 1.0);

    // Real-Time Symmetry Guides Overlay
    if (u_symmetry_mode > 0) {
        vec2 d_center = abs(doc_px - (u_doc_size * 0.5));
        float line_width = 1.0 / max(u_zoom, 0.001);
        
        bool is_vert = (u_symmetry_mode == 1 || u_symmetry_mode == 3) && d_center.x < line_width;
        bool is_horiz = (u_symmetry_mode == 2 || u_symmetry_mode == 3) && d_center.y < line_width;

        if (is_vert || is_horiz) {
            float dash = mod((doc_px.x + doc_px.y) * u_zoom + u_time * 10.0, 16.0);
            if (dash < 8.0) {
                finalColor.rgb = mix(finalColor.rgb, vec3(0.996, 0.502, 0.098), 0.85);
            }
        }
    }

    fragColor = finalColor;
}
`;

const LAYER_COMPOSITE_VERT = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const LAYER_COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_accum_tex;    // Background accumulator
uniform sampler2D u_layer_tex;    // Current layer
uniform sampler2D u_clip_tex;     // Base clipping mask layer (if applicable)

uniform vec2 u_doc_size;          // Total document resolution
uniform vec2 u_layer_offset;      // Layer (x, y)
uniform vec2 u_layer_size;        // Layer (w, h)
uniform float u_opacity;          // 0.0 .. 1.0
uniform int u_blend_mode;         // 0=normal, 1=multiply, 2=screen, 3=overlay, 4=dodge, 5=add
uniform int u_has_clip;           // 1 if clipped to base layer
uniform vec2 u_clip_offset;
uniform vec2 u_clip_size;

vec3 apply_blend_mode(int mode, vec3 src, vec3 dst) {
    if (mode == 0) return src;
    if (mode == 1) return src * dst; // Multiply
    if (mode == 2) return 1.0 - (1.0 - src) * (1.0 - dst); // Screen
    if (mode == 3) { // Overlay
        vec3 less = 2.0 * src * dst;
        vec3 more = 1.0 - 2.0 * (1.0 - src) * (1.0 - dst);
        return mix(more, less, step(dst, vec3(0.5)));
    }
    if (mode == 4) { // Color Dodge
        return min(vec3(1.0), dst / max(vec3(0.00392), 1.0 - src));
    }
    if (mode == 5) { // Add
        return min(vec3(1.0), src + dst);
    }
    return src;
}

void main() {
    vec4 dst = texture(u_accum_tex, v_uv);
    vec2 doc_px = v_uv * u_doc_size;

    // Check if doc_px is within layer bounds
    vec2 rel_px = doc_px - u_layer_offset;
    if (rel_px.x < 0.0 || rel_px.x >= u_layer_size.x || rel_px.y < 0.0 || rel_px.y >= u_layer_size.y) {
        fragColor = dst;
        return;
    }

    vec2 layer_uv = rel_px / u_layer_size;
    vec4 src = texture(u_layer_tex, layer_uv);

    float sa = src.a * u_opacity;
    if (sa <= 0.0) {
        fragColor = dst;
        return;
    }

    // Clipping Mask calculation
    if (u_has_clip == 1) {
        vec2 clip_rel = doc_px - u_clip_offset;
        if (clip_rel.x < 0.0 || clip_rel.x >= u_clip_size.x || clip_rel.y < 0.0 || clip_rel.y >= u_clip_size.y) {
            fragColor = dst;
            return;
        }
        vec2 clip_uv = clip_rel / u_clip_size;
        vec4 clip_val = texture(u_clip_tex, clip_uv);
        sa *= clip_val.a;
        if (sa <= 0.0) {
            fragColor = dst;
            return;
        }
    }

    // Blend calculations
    vec3 blended_rgb = apply_blend_mode(u_blend_mode, src.rgb, dst.rgb);
    
    // Standard Over Operator
    float out_a = sa + dst.a * (1.0 - sa);
    vec3 out_rgb = (blended_rgb * sa + dst.rgb * dst.a * (1.0 - sa)) / max(out_a, 0.00001);

    fragColor = vec4(out_rgb, out_a);
}
`;

const BRUSH_DAB_VERT = `#version 300 es
precision highp float;

// Per-vertex quad corner attribute
layout(location = 0) in vec2 a_corner; // [-1, 1]

// Per-instance attributes
layout(location = 1) in vec2 a_dab_pos;       // Center (x, y) in doc space
layout(location = 2) in vec2 a_dab_radius;    // (rx, ry)
layout(location = 3) in float a_dab_angle;    // Radians
layout(location = 4) in vec4 a_dab_color;     // RGBA 0..1
layout(location = 5) in float a_dab_hardness; // 0..1
layout(location = 6) in float a_dab_flow;     // 0..1
layout(location = 7) in float a_dab_grain;    // 0..1
layout(location = 8) in float a_dab_tex_mode; // 0..7
layout(location = 9) in float a_dab_shape;    // 0=circle, 1=square, 2=chisel

uniform vec2 u_doc_size;

out vec2 v_local_uv;
out vec2 v_doc_pos;
out vec4 v_color;
out float v_hardness;
out float v_flow;
out float v_grain;
out float v_tex_mode;
out float v_shape;

void main() {
    v_local_uv = a_corner;
    v_color = a_dab_color;
    v_hardness = a_dab_hardness;
    v_flow = a_dab_flow;
    v_grain = a_dab_grain;
    v_tex_mode = a_dab_tex_mode;
    v_shape = a_dab_shape;

    // Rotate quad
    float c = cos(a_dab_angle);
    float s = sin(a_dab_angle);
    mat2 rot = mat2(c, -s, s, c);
    vec2 offset = rot * (a_corner * a_dab_radius);

    vec2 doc_px = a_dab_pos + offset;
    v_doc_pos = doc_px;

    // Convert doc_px (0..doc_size) to WebGL clip space (-1..1)
    vec2 clip_pos = (doc_px / u_doc_size) * 2.0 - 1.0;
    // Upload/render is top-down (0 at top), in WebGL -1 is bottom, so invert Y
    clip_pos.y = -clip_pos.y;

    gl_Position = vec4(clip_pos, 0.0, 1.0);
}
`;

const BRUSH_DAB_FRAG = `#version 300 es
precision highp float;

in vec2 v_local_uv;
in vec2 v_doc_pos;
in vec4 v_color;
in float v_hardness;
in float v_flow;
in float v_grain;
in float v_tex_mode;
in float v_shape;

uniform int u_is_eraser;

out vec4 fragColor;

// Procedural hash & grain functions
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float get_procedural_texture(int mode, vec2 pos) {
    if (mode == 0) return 1.0;
    if (mode == 1) { // Paper
        return mix(0.7, 1.0, hash(pos * 0.5));
    }
    if (mode == 2) { // Canvas weave
        float wx = sin(pos.x * 0.8) * 0.5 + 0.5;
        float wy = cos(pos.y * 0.8) * 0.5 + 0.5;
        return mix(0.6, 1.0, wx * wy);
    }
    if (mode == 3) { // Noise
        return hash(pos);
    }
    if (mode == 4) { // Dots
        vec2 grid = fract(pos / 8.0) - 0.5;
        return length(grid) < 0.3 ? 1.0 : 0.2;
    }
    if (mode == 5) { // Grid
        vec2 grid = fract(pos / 10.0);
        return (grid.x < 0.15 || grid.y < 0.15) ? 0.3 : 1.0;
    }
    if (mode == 6) { // Grunge
        float h1 = hash(floor(pos / 4.0));
        float h2 = hash(floor(pos / 16.0));
        return mix(0.4, 1.0, h1 * h2);
    }
    if (mode == 7) { // Hatch
        float d = sin((pos.x + pos.y) * 0.6) * 0.5 + 0.5;
        return d > 0.4 ? 1.0 : 0.2;
    }
    return 1.0;
}

void main() {
    float alpha = 1.0;

    // Tip shape evaluation
    if (v_shape < 0.5) {
        // Circle shape
        float dist = length(v_local_uv);
        if (dist > 1.0) discard;
        float edge = clamp(v_hardness, 0.001, 0.999);
        alpha = 1.0 - smoothstep(edge, 1.0, dist);
    } else if (v_shape < 1.5) {
        // Square shape
        vec2 d = abs(v_local_uv);
        if (d.x > 1.0 || d.y > 1.0) discard;
        alpha = 1.0;
    } else {
        // Chisel shape (horizontal ribbon)
        vec2 d = abs(v_local_uv);
        if (d.x > 1.0 || d.y > 0.3) discard;
        alpha = 1.0;
    }

    // Apply procedural grain & texture
    if (v_grain > 0.0) {
        int tmode = int(v_tex_mode);
        float texVal = get_procedural_texture(tmode, v_doc_pos);
        alpha *= mix(1.0, texVal, v_grain);
    }

    alpha *= v_flow * v_color.a;
    if (alpha <= 0.001) discard;

    if (u_is_eraser == 1) {
        fragColor = vec4(0.0, 0.0, 0.0, alpha);
    } else {
        fragColor = vec4(v_color.rgb, alpha);
    }
}
`;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VIEWPORT_VERT, VIEWPORT_FRAG, LAYER_COMPOSITE_VERT, LAYER_COMPOSITE_FRAG, BRUSH_DAB_VERT, BRUSH_DAB_FRAG };
} else {
    globalThis.EsenhoGPU_Shaders = { VIEWPORT_VERT, VIEWPORT_FRAG, LAYER_COMPOSITE_VERT, LAYER_COMPOSITE_FRAG, BRUSH_DAB_VERT, BRUSH_DAB_FRAG };
}
