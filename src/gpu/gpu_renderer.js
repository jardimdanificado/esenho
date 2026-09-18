/**
 * src/gpu/gpu_renderer.js
 * Hardware-accelerated WebGL 2 rendering engine for Esenho.
 */

class EsenhoGPURenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.vbo = null;
    this.compositeTex = null;
    this.texWidth = 0;
    this.texHeight = 0;
    this.uniforms = {};
    this.filterMode = 0; // 0 = Nearest (Pixel Art), 1 = Linear
    this.isSupported = false;
  }

  init() {
    try {
      this.gl = this.canvas.getContext('webgl2', {
        alpha: false,
        desynchronized: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
      });
    } catch (e) {
      console.warn('[EsenhoGPU] WebGL2 not supported:', e);
      return false;
    }

    if (!this.gl) {
      console.warn('[EsenhoGPU] Failed to get WebGL2 context');
      return false;
    }

    const gl = this.gl;
    const shaders = globalThis.EsenhoGPU_Shaders;
    if (!shaders) {
      console.error('[EsenhoGPU] Shaders definition not found');
      return false;
    }

    // Compile shaders
    const vs = this._createShader(gl.VERTEX_SHADER, shaders.VIEWPORT_VERT);
    const fs = this._createShader(gl.FRAGMENT_SHADER, shaders.VIEWPORT_FRAG);
    if (!vs || !fs) return false;

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('[EsenhoGPU] Program link error:', gl.getProgramInfoLog(this.program));
      return false;
    }

    // Cache uniform locations
    this.uniforms = {
      u_texture: gl.getUniformLocation(this.program, 'u_texture'),
      u_screen_size: gl.getUniformLocation(this.program, 'u_screen_size'),
      u_doc_size: gl.getUniformLocation(this.program, 'u_doc_size'),
      u_pan: gl.getUniformLocation(this.program, 'u_pan'),
      u_zoom: gl.getUniformLocation(this.program, 'u_zoom'),
      u_rotation: gl.getUniformLocation(this.program, 'u_rotation'),
      u_flip: gl.getUniformLocation(this.program, 'u_flip'),
      u_filter_mode: gl.getUniformLocation(this.program, 'u_filter_mode'),
      u_symmetry_mode: gl.getUniformLocation(this.program, 'u_symmetry_mode'),
      u_time: gl.getUniformLocation(this.program, 'u_time')
    };

    // Create Fullscreen Quad VAO
    // 2 Triangles covering [-1, -1] to [1, 1]
    const quadVertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0
    ]);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    // Create Composite Texture
    this.compositeTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.isSupported = true;
    console.log('[EsenhoGPU] WebGL2 Hardware Acceleration initialized successfully.');
    return true;
  }

  _createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[EsenhoGPU] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  setFilterMode(linear) {
    if (!this.gl || !this.compositeTex) return;
    this.filterMode = linear ? 1 : 0;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }

  syncTexture(pixelsU8, width, height, dx0, dy0, dw, dh) {
    if (!this.gl || !this.compositeTex) return;
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);

    if (this.texWidth !== width || this.texHeight !== height) {
      this.texWidth = width;
      this.texHeight = height;
      // Reallocate texture memory
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixelsU8
      );
    } else if (dw > 0 && dh > 0) {
      if (dw === width && dh === height) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          width,
          height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixelsU8
        );
      } else {
        // PixelStore unpack row length for efficient sub-rectangle upload
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, width);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, dx0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, dy0);

        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          dx0,
          dy0,
          dw,
          dh,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixelsU8
        );

        // Reset pixel store
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      }
    }
  }

  render(state) {
    if (!this.gl || !this.isSupported) return;
    const gl = this.gl;

    // Viewport setup
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.114, 0.125, 0.129, 1.0); // #1d2021
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Active Texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);
    gl.uniform1i(this.uniforms.u_texture, 0);

    // Set uniforms
    gl.uniform2f(this.uniforms.u_screen_size, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.u_doc_size, state.cw, state.ch);
    gl.uniform2f(this.uniforms.u_pan, state.panX, state.panY);
    gl.uniform1f(this.uniforms.u_zoom, state.zoom);
    gl.uniform1f(this.uniforms.u_rotation, state.canvasRotation || 0);
    gl.uniform2f(this.uniforms.u_flip, state.flipH ? -1.0 : 1.0, state.flipV ? -1.0 : 1.0);
    gl.uniform1i(this.uniforms.u_filter_mode, this.filterMode);
    gl.uniform1i(this.uniforms.u_symmetry_mode, state.symmetry || 0);
    gl.uniform1f(this.uniforms.u_time, (Date.now() % 100000) / 1000.0);

    // Draw
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EsenhoGPURenderer };
} else {
  globalThis.EsenhoGPURenderer = EsenhoGPURenderer;
}
