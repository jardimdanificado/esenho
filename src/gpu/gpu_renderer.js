/**
 * src/gpu/gpu_renderer.js
 * Hardware-accelerated WebGL 2 rendering engine for Esenho.
 * Supports GPU Viewport transformation, Multi-Layer GPU Compositing, and Instanced GPU Brush Engine.
 */

class EsenhoGPURenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.viewportProgram = null;
    this.compositeProgram = null;
    this.brushProgram = null;

    this.vao = null;
    this.vbo = null;
    this.brushVAO = null;
    this.brushQuadVBO = null;
    this.brushInstanceVBO = null;

    // Viewport composite texture
    this.compositeTex = null;
    this.texWidth = 0;
    this.texHeight = 0;

    // Multi-Layer GPU Compositor structures
    this.layerTextures = new Map(); // layerId -> { texture, fbo, width, height }
    this.fboA = null;
    this.fboB = null;
    this.accumTexA = null;
    this.accumTexB = null;
    this.fboWidth = 0;
    this.fboHeight = 0;

    this.viewportUniforms = {};
    this.compositeUniforms = {};
    this.brushUniforms = {};

    this.filterMode = 0; // 0 = Nearest (Pixel Art), 1 = Linear
    this.isSupported = false;
    this.useLayerCompositor = true;
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

    // 1. Compile Viewport Program
    const vsView = this._createShader(gl.VERTEX_SHADER, shaders.VIEWPORT_VERT);
    const fsView = this._createShader(gl.FRAGMENT_SHADER, shaders.VIEWPORT_FRAG);
    if (!vsView || !fsView) return false;

    this.viewportProgram = gl.createProgram();
    gl.attachShader(this.viewportProgram, vsView);
    gl.attachShader(this.viewportProgram, fsView);
    gl.linkProgram(this.viewportProgram);

    if (!gl.getProgramParameter(this.viewportProgram, gl.LINK_STATUS)) {
      console.error('[EsenhoGPU] Viewport program link error:', gl.getProgramInfoLog(this.viewportProgram));
      return false;
    }

    this.viewportUniforms = {
      u_texture: gl.getUniformLocation(this.viewportProgram, 'u_texture'),
      u_screen_size: gl.getUniformLocation(this.viewportProgram, 'u_screen_size'),
      u_doc_size: gl.getUniformLocation(this.viewportProgram, 'u_doc_size'),
      u_pan: gl.getUniformLocation(this.viewportProgram, 'u_pan'),
      u_zoom: gl.getUniformLocation(this.viewportProgram, 'u_zoom'),
      u_rotation: gl.getUniformLocation(this.viewportProgram, 'u_rotation'),
      u_flip: gl.getUniformLocation(this.viewportProgram, 'u_flip'),
      u_filter_mode: gl.getUniformLocation(this.viewportProgram, 'u_filter_mode'),
      u_symmetry_mode: gl.getUniformLocation(this.viewportProgram, 'u_symmetry_mode'),
      u_time: gl.getUniformLocation(this.viewportProgram, 'u_time')
    };

    // 2. Compile Multi-Layer Composite Program (Phase 2)
    if (shaders.LAYER_COMPOSITE_VERT && shaders.LAYER_COMPOSITE_FRAG) {
      const vsComp = this._createShader(gl.VERTEX_SHADER, shaders.LAYER_COMPOSITE_VERT);
      const fsComp = this._createShader(gl.FRAGMENT_SHADER, shaders.LAYER_COMPOSITE_FRAG);
      if (vsComp && fsComp) {
        this.compositeProgram = gl.createProgram();
        gl.attachShader(this.compositeProgram, vsComp);
        gl.attachShader(this.compositeProgram, fsComp);
        gl.linkProgram(this.compositeProgram);

        if (gl.getProgramParameter(this.compositeProgram, gl.LINK_STATUS)) {
          this.compositeUniforms = {
            u_accum_tex: gl.getUniformLocation(this.compositeProgram, 'u_accum_tex'),
            u_layer_tex: gl.getUniformLocation(this.compositeProgram, 'u_layer_tex'),
            u_clip_tex: gl.getUniformLocation(this.compositeProgram, 'u_clip_tex'),
            u_doc_size: gl.getUniformLocation(this.compositeProgram, 'u_doc_size'),
            u_layer_offset: gl.getUniformLocation(this.compositeProgram, 'u_layer_offset'),
            u_layer_size: gl.getUniformLocation(this.compositeProgram, 'u_layer_size'),
            u_opacity: gl.getUniformLocation(this.compositeProgram, 'u_opacity'),
            u_blend_mode: gl.getUniformLocation(this.compositeProgram, 'u_blend_mode'),
            u_has_clip: gl.getUniformLocation(this.compositeProgram, 'u_has_clip'),
            u_clip_offset: gl.getUniformLocation(this.compositeProgram, 'u_clip_offset'),
            u_clip_size: gl.getUniformLocation(this.compositeProgram, 'u_clip_size')
          };
        }
      }
    }

    // 3. Compile GPU Brush Dab Program (Phase 3)
    if (shaders.BRUSH_DAB_VERT && shaders.BRUSH_DAB_FRAG) {
      const vsBrush = this._createShader(gl.VERTEX_SHADER, shaders.BRUSH_DAB_VERT);
      const fsBrush = this._createShader(gl.FRAGMENT_SHADER, shaders.BRUSH_DAB_FRAG);
      if (vsBrush && fsBrush) {
        this.brushProgram = gl.createProgram();
        gl.attachShader(this.brushProgram, vsBrush);
        gl.attachShader(this.brushProgram, fsBrush);
        gl.linkProgram(this.brushProgram);

        if (gl.getProgramParameter(this.brushProgram, gl.LINK_STATUS)) {
          this.brushUniforms = {
            u_doc_size: gl.getUniformLocation(this.brushProgram, 'u_doc_size'),
            u_is_eraser: gl.getUniformLocation(this.brushProgram, 'u_is_eraser')
          };
        }
      }
    }

    // 4. Create Fullscreen Quad VAO
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

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    // 5. Create Instanced Brush VAO & VBOs
    if (this.brushProgram) {
      this.brushVAO = gl.createVertexArray();
      gl.bindVertexArray(this.brushVAO);

      // Unit Quad for dab
      this.brushQuadVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.brushQuadVBO);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(0, 0); // Per-vertex

      // Instance Buffer (14 floats per instance)
      const STRIDE = 14 * 4;
      this.brushInstanceVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.brushInstanceVBO);

      // 1: a_dab_pos (2 floats)
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 0);
      gl.vertexAttribDivisor(1, 1);

      // 2: a_dab_radius (2 floats)
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 2 * 4);
      gl.vertexAttribDivisor(2, 1);

      // 3: a_dab_angle (1 float)
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 4 * 4);
      gl.vertexAttribDivisor(3, 1);

      // 4: a_dab_color (4 floats)
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, STRIDE, 5 * 4);
      gl.vertexAttribDivisor(4, 1);

      // 5: a_dab_hardness (1 float)
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.FLOAT, false, STRIDE, 9 * 4);
      gl.vertexAttribDivisor(5, 1);

      // 6: a_dab_flow (1 float)
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 1, gl.FLOAT, false, STRIDE, 10 * 4);
      gl.vertexAttribDivisor(6, 1);

      // 7: a_dab_grain (1 float)
      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 1, gl.FLOAT, false, STRIDE, 11 * 4);
      gl.vertexAttribDivisor(7, 1);

      // 8: a_dab_tex_mode (1 float)
      gl.enableVertexAttribArray(8);
      gl.vertexAttribPointer(8, 1, gl.FLOAT, false, STRIDE, 12 * 4);
      gl.vertexAttribDivisor(8, 1);

      // 9: a_dab_shape (1 float)
      gl.enableVertexAttribArray(9);
      gl.vertexAttribPointer(9, 1, gl.FLOAT, false, STRIDE, 13 * 4);
      gl.vertexAttribDivisor(9, 1);

      gl.bindVertexArray(null);
    }

    // 6. Create Direct Composite Texture
    this.compositeTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.isSupported = true;
    console.log('[EsenhoGPU] WebGL2 Full GPU Pipeline (Viewport + Multi-Layer Compositor + Instanced Brush Engine) ready.');
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

  _ensureFBOs(width, height) {
    if (!this.gl || (this.fboWidth === width && this.fboHeight === height && this.fboA && this.fboB)) {
      return;
    }
    const gl = this.gl;
    this.fboWidth = width;
    this.fboHeight = height;

    const createFBOTexture = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fbo, tex };
    };

    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.accumTexA) gl.deleteTexture(this.accumTexA);
    if (this.accumTexB) gl.deleteTexture(this.accumTexB);

    const a = createFBOTexture();
    this.fboA = a.fbo;
    this.accumTexA = a.tex;

    const b = createFBOTexture();
    this.fboB = b.fbo;
    this.accumTexB = b.tex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setFilterMode(linear) {
    if (!this.gl) return;
    this.filterMode = linear ? 1 : 0;
    const gl = this.gl;
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    if (this.compositeTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
    if (this.accumTexA) {
      gl.bindTexture(gl.TEXTURE_2D, this.accumTexA);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
    if (this.accumTexB) {
      gl.bindTexture(gl.TEXTURE_2D, this.accumTexB);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
    for (const entry of this.layerTextures.values()) {
      if (entry && entry.texture) {
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      }
    }
  }

  getLayerTexture(layerId, width, height) {
    const gl = this.gl;
    let entry = this.layerTextures.get(layerId);
    if (!entry) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const filter = this.filterMode ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      entry = { texture: tex, fbo: fbo, width: 0, height: 0 };
      this.layerTextures.set(layerId, entry);
    }
    return entry;
  }

  syncLayerTexture(layerId, pixelsU8, width, height, dx0, dy0, dw, dh) {
    if (!this.gl) return;
    const gl = this.gl;
    const entry = this.getLayerTexture(layerId, width, height);

    gl.bindTexture(gl.TEXTURE_2D, entry.texture);

    if (entry.width !== width || entry.height !== height) {
      entry.width = width;
      entry.height = height;
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

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      }
    }
  }

  syncTexture(pixelsU8, width, height, dx0, dy0, dw, dh) {
    if (!this.gl || !this.compositeTex) return;
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.compositeTex);

    if (this.texWidth !== width || this.texHeight !== height) {
      this.texWidth = width;
      this.texHeight = height;
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

        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      }
    }
  }

  /**
   * Render instanced brush dabs directly onto the active layer's texture via GPU.
   */
  renderDabsGPU(layerId, dabsData, docWidth, docHeight, isEraser = false) {
    if (!this.gl || !this.brushProgram || !this.brushVAO || !dabsData || dabsData.length === 0) return;
    const gl = this.gl;
    const entry = this.getLayerTexture(layerId, docWidth, docHeight);

    gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo);
    gl.viewport(0, 0, docWidth, docHeight);

    gl.enable(gl.BLEND);
    if (isEraser) {
      // Erase alpha depleting Porter-Duff
      gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);
    } else {
      // Standard Premultiplied Additive Blending
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);
    }

    gl.useProgram(this.brushProgram);
    gl.uniform2f(this.brushUniforms.u_doc_size, docWidth, docHeight);
    gl.uniform1i(this.brushUniforms.u_is_eraser, isEraser ? 1 : 0);

    gl.bindVertexArray(this.brushVAO);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.brushInstanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, dabsData, gl.DYNAMIC_DRAW);

    const instanceCount = Math.floor(dabsData.length / 14);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Read pixels back from a GPU layer texture into CPU memory (for undo/export).
   */
  readLayerPixels(layerId, outBufferU8, width, height) {
    if (!this.gl) return;
    const gl = this.gl;
    const entry = this.getLayerTexture(layerId, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, outBufferU8);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Evaluates entire layer stack compositing purely on GPU via Ping-Pong FBOs.
   * Returns final composite texture.
   */
  compositeLayersGPU(host, docWidth, docHeight) {
    if (!this.gl || !this.compositeProgram) return this.compositeTex;
    const gl = this.gl;

    this._ensureFBOs(docWidth, docHeight);

    // Clear FBO A to transparent black
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.viewport(0, 0, docWidth, docHeight);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const exports = host.canvasActor.exports;
    const orderCount = exports.w_layer_get_order_count ? exports.w_layer_get_order_count() : 0;
    if (orderCount <= 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return this.accumTexA;
    }

    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.compositeUniforms.u_doc_size, docWidth, docHeight);

    let curReadTex = this.accumTexA;
    let curTargetFBO = this.fboB;
    let curTargetTex = this.accumTexB;

    // Track visible non-clipped base layers for clipping mask resolution
    const renderedLayers = [];

    for (let i = 0; i < orderCount; i++) {
      const layerId = exports.w_layer_get_order(i);
      if (layerId < 0) continue;

      const visible = exports.w_layer_get_visible ? exports.w_layer_get_visible(layerId) : 1;
      if (!visible) continue;

      const opacity = exports.w_layer_get_opacity ? exports.w_layer_get_opacity(layerId) : 255;
      if (opacity <= 0) continue;

      const lw = exports.w_layer_get_width ? exports.w_layer_get_width(layerId) : docWidth;
      const lh = exports.w_layer_get_height ? exports.w_layer_get_height(layerId) : docHeight;
      const lx = exports.w_layer_get_x ? exports.w_layer_get_x(layerId) : 0;
      const ly = exports.w_layer_get_y ? exports.w_layer_get_y(layerId) : 0;
      const blendMode = exports.w_layer_get_blend_mode ? exports.w_layer_get_blend_mode(layerId) : 0;
      const isClipping = exports.w_layer_get_clipping ? exports.w_layer_get_clipping(layerId) : 0;

      const ptr = exports.w_layer_get_pixels(layerId);
      if (!ptr || lw <= 0 || lh <= 0) continue;

      // Sync layer texture
      const pixelsU8 = new Uint8Array(host.canvasActor.memory.buffer, ptr, lw * lh * 4);
      this.syncLayerTexture(layerId, pixelsU8, lw, lh, 0, 0, lw, lh);
      const layerEntry = this.getLayerTexture(layerId, lw, lh);

      // Resolve base layer if clipped
      let clipEntry = null;
      let clipX = 0, clipY = 0, clipW = docWidth, clipH = docHeight;
      if (isClipping && renderedLayers.length > 0) {
        for (let b = renderedLayers.length - 1; b >= 0; b--) {
          const candId = renderedLayers[b];
          const candClip = exports.w_layer_get_clipping ? exports.w_layer_get_clipping(candId) : 0;
          if (!candClip) {
            clipEntry = this.getLayerTexture(candId, docWidth, docHeight);
            clipX = exports.w_layer_get_x ? exports.w_layer_get_x(candId) : 0;
            clipY = exports.w_layer_get_y ? exports.w_layer_get_y(candId) : 0;
            clipW = exports.w_layer_get_width ? exports.w_layer_get_width(candId) : docWidth;
            clipH = exports.w_layer_get_height ? exports.w_layer_get_height(candId) : docHeight;
            break;
          }
        }
      }

      // Render step to curTargetFBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, curTargetFBO);
      gl.viewport(0, 0, docWidth, docHeight);

      // Texture 0: Accumulator
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, curReadTex);
      gl.uniform1i(this.compositeUniforms.u_accum_tex, 0);

      // Texture 1: Layer
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, layerEntry.texture);
      gl.uniform1i(this.compositeUniforms.u_layer_tex, 1);

      // Texture 2: Clipping Mask (if active)
      if (isClipping && clipEntry) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, clipEntry.texture);
        gl.uniform1i(this.compositeUniforms.u_clip_tex, 2);
        gl.uniform1i(this.compositeUniforms.u_has_clip, 1);
        gl.uniform2f(this.compositeUniforms.u_clip_offset, clipX, clipY);
        gl.uniform2f(this.compositeUniforms.u_clip_size, clipW, clipH);
      } else {
        gl.uniform1i(this.compositeUniforms.u_has_clip, 0);
      }

      // Uniform parameters
      gl.uniform2f(this.compositeUniforms.u_layer_offset, lx, ly);
      gl.uniform2f(this.compositeUniforms.u_layer_size, lw, lh);
      gl.uniform1f(this.compositeUniforms.u_opacity, opacity / 255.0);
      gl.uniform1i(this.compositeUniforms.u_blend_mode, blendMode);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Swap ping-pong buffers
      if (curReadTex === this.accumTexA) {
        curReadTex = this.accumTexB;
        curTargetFBO = this.fboA;
        curTargetTex = this.accumTexA;
      } else {
        curReadTex = this.accumTexA;
        curTargetFBO = this.fboB;
        curTargetTex = this.accumTexB;
      }

      renderedLayers.push(layerId);
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return curReadTex;
  }

  render(state, sourceTex = null) {
    if (!this.gl || !this.isSupported) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.114, 0.125, 0.129, 1.0); // #1d2021
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.viewportProgram);

    // Active Texture
    const texToRender = sourceTex || this.compositeTex;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texToRender);
    gl.uniform1i(this.viewportUniforms.u_texture, 0);

    // Set uniforms
    gl.uniform2f(this.viewportUniforms.u_screen_size, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.viewportUniforms.u_doc_size, state.cw, state.ch);
    gl.uniform2f(this.viewportUniforms.u_pan, state.panX, state.panY);
    gl.uniform1f(this.viewportUniforms.u_zoom, state.zoom);
    gl.uniform1f(this.viewportUniforms.u_rotation, state.canvasRotation || 0);
    gl.uniform2f(this.viewportUniforms.u_flip, state.flipH ? -1.0 : 1.0, state.flipV ? -1.0 : 1.0);
    gl.uniform1i(this.viewportUniforms.u_filter_mode, this.filterMode);
    gl.uniform1i(this.viewportUniforms.u_symmetry_mode, state.symmetry || 0);
    gl.uniform1f(this.viewportUniforms.u_time, (Date.now() % 100000) / 1000.0);

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
