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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VIEWPORT_VERT, VIEWPORT_FRAG };
} else {
    globalThis.EsenhoGPU_Shaders = { VIEWPORT_VERT, VIEWPORT_FRAG };
}
