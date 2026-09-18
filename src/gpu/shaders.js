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

    // Inverse rotation
    float cos_r = cos(-u_rotation);
    float sin_r = sin(-u_rotation);
    mat2 rot = mat2(cos_r, -sin_r, sin_r, cos_r);
    vec2 unrotated = rot * offset;

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VIEWPORT_VERT, VIEWPORT_FRAG, LAYER_COMPOSITE_VERT, LAYER_COMPOSITE_FRAG };
} else {
    globalThis.EsenhoGPU_Shaders = { VIEWPORT_VERT, VIEWPORT_FRAG, LAYER_COMPOSITE_VERT, LAYER_COMPOSITE_FRAG };
}
