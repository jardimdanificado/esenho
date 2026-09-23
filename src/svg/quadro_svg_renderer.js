/**
 * =========================================================================
 * Quadro SVG Renderer (src/svg/quadro_svg_renderer.js)
 * High-performance rasterizer of SVG Object Scene Graphs into Quadro WASM.
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const { EsenhoModule } = require('../esenho.js');
    const SvgEngine = require('./svg_engine.js');
    module.exports = factory(EsenhoModule, SvgEngine);
  } else {
    root.QuadroSvgRenderer = factory(root.EsenhoModule, root.SvgEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (EsenhoModule, SvgEngine) {
  'use strict';

  function parseCssColorToArgb(colorStr, alphaMultiplier = 1.0) {
    if (!colorStr || colorStr === 'none' || colorStr === 'transparent') {
      return 0x00000000;
    }

    let r = 0, g = 0, b = 0, a = 255;

    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else if (hex.length === 8) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
        a = parseInt(hex.slice(6, 8), 16);
      }
    } else if (colorStr.startsWith('rgb')) {
      const parts = colorStr.match(/[\d.]+/g);
      if (parts) {
        r = parseInt(parts[0], 10);
        g = parseInt(parts[1], 10);
        b = parseInt(parts[2], 10);
        if (parts[3] !== undefined) a = Math.round(parseFloat(parts[3]) * 255);
      }
    } else {
      // Basic named colors
      const named = {
        black: 0x000000, white: 0xFFFFFF, red: 0xFF0000, green: 0x00FF00,
        blue: 0x0000FF, yellow: 0xFFFF00, cyan: 0x00FFFF, magenta: 0xFF00FF,
        gray: 0x808080, orange: 0xFFA500, purple: 0x800080
      };
      const val = named[colorStr.toLowerCase()];
      if (val !== undefined) {
        r = (val >> 16) & 0xFF;
        g = (val >> 8) & 0xFF;
        b = val & 0xFF;
      }
    }

    a = Math.round(Math.max(0, Math.min(255, a * alphaMultiplier)));
    // Format ARGB uint32
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  function sampleProceduralTexture(mode, x, y, texAngle = 0, texScale = 100, texContrast = 100, baseA = 255) {
    if (mode <= 0 || baseA === 0) return baseA;
    if (texScale <= 0) texScale = 100;

    let tx = x;
    let ty = y;

    if (texAngle !== 0) {
      const rad = (texAngle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      tx = Math.round(x * cos + y * sin);
      ty = Math.round(-x * sin + y * cos);
    }

    if (texScale !== 100) {
      tx = Math.round((tx * 100) / texScale);
      ty = Math.round((ty * 100) / texScale);
    }

    let modA = baseA;
    if (mode === 1) { // Paper grain
      const n = ((tx * 1234567 + ty * 7654321) ^ (tx * ty * 13)) & 0xFF;
      const fiber = ((tx * 3 + ty * 5) % 17 < 3) ? 50 : 255;
      modA = Math.round((baseA * n * fiber) / (255 * 255));
    } else if (mode === 2) { // Canvas weave
      const pat = ((Math.abs(tx) % 6 < 3) ^ (Math.abs(ty) % 6 < 3)) ? 255 : 40;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 3) { // Noise
      const n = ((tx * 374761393 + ty * 668265263) ^ 0x5bf03635) & 0xFF;
      modA = Math.round((baseA * n) / 255);
    } else if (mode === 4) { // Halftone dots
      const dx = (Math.abs(tx) % 8) - 4;
      const dy = (Math.abs(ty) % 8) - 4;
      const d2 = dx * dx + dy * dy;
      const pat = (d2 <= 5) ? 255 : 20;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 5) { // Grid
      const pat = (Math.abs(tx) % 8 === 0 || Math.abs(ty) % 8 === 0) ? 255 : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 6) { // Grunge
      const n = ((Math.floor(tx / 4) * 101 + Math.floor(ty / 4) * 203) ^ (tx * 17 + ty * 31)) & 0xFF;
      const pat = n > 120 ? 255 : Math.round(n * 255 / 120);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 7) { // Hatch
      const pat = ((Math.abs(tx + ty)) % 6 <= 1) ? 255 : 0;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 8) { // Watercolor Cold Press
      const n1 = ((tx * 239847 + ty * 983471) ^ (tx * 7)) & 0xFF;
      const pit = (((Math.floor(tx / 3) * 11 + Math.floor(ty / 3) * 13)) % 23 < 4) ? 40 : 255;
      modA = Math.round((baseA * n1 * pit) / (255 * 255));
    } else if (mode === 9) { // Charcoal Tooth
      const n = ((Math.floor(tx / 2) * 589237 + Math.floor(ty / 2) * 782391) ^ (tx * 31 + ty * 19)) & 0xFF;
      const tooth = (n > 140) ? 255 : (n > 70 ? 120 : 20);
      modA = Math.round((baseA * tooth) / 255);
    } else if (mode === 10) { // Wood Grain
      const wave = Math.floor(tx + (ty * ty / 120) % 24);
      const ring = (Math.abs(wave) % 12 < 3) ? 255 : 70;
      modA = Math.round((baseA * ring) / 255);
    } else if (mode === 11) { // Leather Pores
      const cx = Math.abs(tx) % 10 - 5;
      const cy = Math.abs(ty) % 10 - 5;
      const d = cx * cx + cy * cy;
      const pore = (d <= 3) ? 40 : 240;
      modA = Math.round((baseA * pore) / 255);
    } else if (mode === 12) { // Dense Linen
      const lx = (Math.abs(tx) % 4 < 2);
      const ly = (Math.abs(ty) % 4 < 2);
      const pat = (lx ^ ly) ? 245 : 65;
      modA = Math.round((baseA * pat) / 255);
    }

    if (texContrast !== 100 && texContrast >= 0 && baseA > 0) {
      let factor = (modA * 255) / baseA;
      factor = 128 + ((factor - 128) * texContrast) / 100;
      factor = Math.max(0, Math.min(255, factor));
      modA = Math.round((baseA * factor) / 255);
    }
    return modA;
  }

  class QuadroSvgRenderer {
    constructor(wasmModuleOrPath) {
      if (wasmModuleOrPath instanceof EsenhoModule) {
        this.actor = wasmModuleOrPath;
      } else if (typeof wasmModuleOrPath === 'string' && EsenhoModule) {
        this.actor = new EsenhoModule(wasmModuleOrPath);
      } else if (wasmModuleOrPath && wasmModuleOrPath.exports) {
        this.actor = wasmModuleOrPath;
      } else {
        this.actor = null;
      }
    }

    setActor(actor) {
      this.actor = actor;
    }

    /**
     * Render an entire SvgDocument into Quadro linear memory
     * @param {SvgDocument} doc 
     * @param {Object} options - { scale: 1.0, background: true }
     */
    renderDocument(doc, options = {}) {
      if (!this.actor || !this.actor.exports) {
        throw new Error('Quadro WASM actor not initialized');
      }

      const scale = options.scale || 1.0;
      const w = Math.round(doc.width * scale);
      const h = Math.round(doc.height * scale);

      // Initialize Quadro dimensions
      this.actor.exports.w_init(w, h);

      // Reset brush defaults
      this.actor.exports.w_brush_set_param(1 /* SIZE */, 2);
      this.actor.exports.w_brush_set_param(2 /* OPACITY */, 100);
      this.actor.exports.w_brush_set_param(3 /* HARDNESS */, 100);
      this.actor.exports.w_brush_set_param(4 /* FLOW */, 100);
      this.actor.exports.w_brush_set_param(5 /* SPACING */, 5);
      this.actor.exports.w_brush_set_param(14 /* SHAPE */, 0 /* CIRCLE */);

      // Set background color
      if (options.background !== false && doc.backgroundColor && doc.backgroundColor !== 'none') {
        const bgArgb = parseCssColorToArgb(doc.backgroundColor, 1.0);
        // Fill layer 3 (active layer) with background
        const pixPtr = this.actor.exports.w_layer_get_pixels(3);
        if (pixPtr && this.actor.memory) {
          const u32 = new Uint32Array(this.actor.memory.buffer, pixPtr, w * h);
          u32.fill(bgArgb);
        }
      }

      // Render each object in Z-order (bottom to top)
      for (const obj of doc.objects) {
        if (!obj.visible) continue;
        this.renderObject(obj, scale);
      }

      // Composite final frame
      if (this.actor.exports.force_composite) {
        this.actor.exports.force_composite();
      }

      return { width: w, height: h };
    }

    /**
     * Render a single SvgNode into Quadro
     */
    renderObject(obj, scale = 1.0, parentOpacity = 1.0) {
      if (!obj.visible) return;

      const totalOpacity = (obj.opacity !== undefined ? obj.opacity : 1.0) * parentOpacity;
      if (totalOpacity <= 0.001) return;

      if (obj.type === 'group') {
        for (const child of obj.children) {
          this.renderObject(child, scale, totalOpacity);
        }
        return;
      }

      // Convert shape to polyline for fills and strokes
      let pathObj = obj;
      if (typeof obj.toPath === 'function') {
        pathObj = obj.toPath();
      }

      // 1. Render Fill (with procedural fill texture support)
      if (obj.fill && obj.fill !== 'none') {
        const fillAlpha = (obj.fillOpacity !== undefined ? obj.fillOpacity : 1.0) * totalOpacity;
        const fillArgb = parseCssColorToArgb(obj.fill, fillAlpha);

        if ((fillArgb >>> 24) > 0) {
          const poly = pathObj.toPolyline ? pathObj.toPolyline(0.5) : [];
          if (poly.length >= 3) {
            this.fillPolygon(poly, fillArgb, scale, obj.fillTexture);
          }
        }
      }

      // 2. Render Stroke (with brush dynamics & stroke texture support)
      if (obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0) {
        const strokeAlpha = (obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1.0) * totalOpacity;
        const strokeArgb = parseCssColorToArgb(obj.stroke, strokeAlpha);

        if ((strokeArgb >>> 24) > 0) {
          const poly = pathObj.toPolyline ? pathObj.toPolyline(0.4) : [];
          if (poly.length >= 2) {
            this.strokePolyline(
              poly,
              strokeArgb,
              Math.max(1, Math.round(obj.strokeWidth * scale)),
              pathObj.closed,
              obj.brushConfig,
              obj.strokeTexture,
              scale
            );
          }
        }
      }
    }

    /**
     * Scanline polygon fill in Quadro layer with procedural texture masking
     */
    fillPolygon(poly, argbColor, scale = 1.0, fillTexture = null) {
      const exp = this.actor.exports;
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
      const pixPtr = exp.w_layer_get_pixels(3);
      if (!pixPtr || !this.actor.memory) return;

      const pixels = new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh);
      const n = poly.length;
      if (n < 3) return;

      let minY = lh, maxY = 0;
      const scaledPts = poly.map(p => {
        const x = Math.round(p.x * scale);
        const y = Math.round(p.y * scale);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        return { x, y };
      });

      if (minY < 0) minY = 0;
      if (maxY >= lh) maxY = lh - 1;

      const baseAlpha = (argbColor >>> 24) & 0xFF;
      const texMode = fillTexture ? (fillTexture.mode || 0) : 0;
      const texAngle = fillTexture ? (fillTexture.angle || 0) : 0;
      const texScale = Math.round((fillTexture ? (fillTexture.scale || 100) : 100) * scale);
      const texContrast = fillTexture ? (fillTexture.contrast || 100) : 100;

      const nodeX = [];
      for (let y = minY; y <= maxY; y++) {
        nodeX.length = 0;
        let j = n - 1;
        for (let i = 0; i < n; i++) {
          const pi = scaledPts[i];
          const pj = scaledPts[j];
          if ((pi.y < y && pj.y >= y) || (pj.y < y && pi.y >= y)) {
            const x = Math.round(pi.x + (y - pi.y) / (pj.y - pi.y) * (pj.x - pi.x));
            nodeX.push(x);
          }
          j = i;
        }

        nodeX.sort((a, b) => a - b);

        for (let i = 0; i < nodeX.length; i += 2) {
          if (nodeX[i] >= lw) break;
          if (nodeX[i + 1] > 0) {
            let x0 = nodeX[i] < 0 ? 0 : nodeX[i];
            let x1 = nodeX[i + 1] >= lw ? lw - 1 : nodeX[i + 1];
            const row = y * lw;
            for (let x = x0; x <= x1; x++) {
              let pixColor = argbColor;
              if (texMode > 0) {
                const sampledA = sampleProceduralTexture(texMode, x, y, texAngle, texScale, texContrast, baseAlpha);
                pixColor = ((sampledA << 24) | (argbColor & 0x00FFFFFF)) >>> 0;
              }
              pixels[row + x] = this.blendFast(pixColor, pixels[row + x]);
            }
          }
        }
      }
    }

    /**
     * Anti-aliased stroke drawing via Quadro brush engine with dynamics and textures
     */
    strokePolyline(poly, argbColor, strokeWidth = 2, closed = false, brushConfig = null, strokeTexture = null, scale = 1.0) {
      const exp = this.actor.exports;
      exp.w_brush_set_param(1 /* SIZE */, strokeWidth);
      exp.w_brush_set_param(2 /* OPACITY */, 100);
      exp.w_brush_set_param(3 /* HARDNESS */, brushConfig?.hardness !== undefined ? brushConfig.hardness : 95);
      exp.w_brush_set_param(4 /* FLOW */, brushConfig?.flow !== undefined ? brushConfig.flow : 100);
      exp.w_brush_set_param(5 /* SPACING */, brushConfig?.spacing !== undefined ? brushConfig.spacing : 5);
      exp.w_brush_set_param(6 /* ANGLE */, brushConfig?.angle !== undefined ? brushConfig.angle : 0);
      exp.w_brush_set_param(7 /* ROUNDNESS */, brushConfig?.roundness !== undefined ? brushConfig.roundness : 100);
      exp.w_brush_set_param(8 /* SCATTER */, brushConfig?.scatter !== undefined ? brushConfig.scatter : 0);
      exp.w_brush_set_param(10 /* SMUDGE */, brushConfig?.smudge !== undefined ? brushConfig.smudge : 0);
      exp.w_brush_set_param(11 /* WETNESS */, brushConfig?.wetness !== undefined ? brushConfig.wetness : 0);
      exp.w_brush_set_param(12 /* GRAIN */, strokeTexture?.grain !== undefined ? strokeTexture.grain : (brushConfig?.grain !== undefined ? brushConfig.grain : 0));
      exp.w_brush_set_param(13 /* TEX_MODE */, strokeTexture?.mode !== undefined ? strokeTexture.mode : (brushConfig?.texture_mode !== undefined ? brushConfig.texture_mode : 0));
      exp.w_brush_set_param(14 /* SHAPE */, brushConfig?.shape !== undefined ? brushConfig.shape : 0);
      exp.w_brush_set_param(16 /* TEX_ANGLE */, strokeTexture?.angle !== undefined ? strokeTexture.angle : 0);
      const texScale = Math.round((strokeTexture?.scale !== undefined ? strokeTexture.scale : (brushConfig?.texture_scale !== undefined ? brushConfig.texture_scale : 100)) * scale);
      exp.w_brush_set_param(17 /* TEX_SCALE */, texScale);
      exp.w_brush_set_param(21 /* TEX_CONTRAST */, strokeTexture?.contrast !== undefined ? strokeTexture.contrast : 100);
      exp.w_brush_set_param(22 /* AUTO_ROTATE */, brushConfig?.auto_rotate !== undefined ? brushConfig.auto_rotate : (brushConfig?.autoRotate ? 1 : 0));
      exp.w_brush_set_param(23 /* VELOCITY */, brushConfig?.velocity !== undefined ? brushConfig.velocity : 0);
      exp.w_brush_set_param(24 /* TAPER_IN */, brushConfig?.taper_in !== undefined ? brushConfig.taper_in : (brushConfig?.taperIn !== undefined ? brushConfig.taperIn : 0));
      exp.w_brush_set_param(25 /* TAPER_OUT */, brushConfig?.taper_out !== undefined ? brushConfig.taper_out : (brushConfig?.taperOut !== undefined ? brushConfig.taperOut : 0));
      exp.w_brush_set_param(27 /* SIZE_JITTER */, brushConfig?.size_jitter !== undefined ? brushConfig.size_jitter : (brushConfig?.sizeJitter !== undefined ? brushConfig.sizeJitter : 0));
      exp.w_brush_set_param(28 /* ANGLE_JITTER */, brushConfig?.angle_jitter !== undefined ? brushConfig.angle_jitter : (brushConfig?.angleJitter !== undefined ? brushConfig.angleJitter : 0));
      exp.w_brush_set_param(29 /* OPACITY_JITTER */, brushConfig?.opacity_jitter !== undefined ? brushConfig.opacity_jitter : (brushConfig?.opacityJitter !== undefined ? brushConfig.opacityJitter : 0));
      exp.w_brush_set_param(31 /* DAB_BLEND */, brushConfig?.dabBlend !== undefined ? brushConfig.dabBlend : (brushConfig?.dab_blend !== undefined ? brushConfig.dab_blend : 0));
      exp.w_brush_set_param(33 /* DEPLETION */, brushConfig?.depletion !== undefined ? brushConfig.depletion : 0);
      exp.w_brush_set_param(34 /* COLOR_PICKUP */, brushConfig?.color_pickup !== undefined ? brushConfig.color_pickup : (brushConfig?.colorPickup !== undefined ? brushConfig.colorPickup : 0));

      const pts = scale === 1.0 ? poly : poly.map(p => ({ x: Math.round(p.x * scale), y: Math.round(p.y * scale) }));
      const n = pts.length;
      if (n === 1) {
        exp.w_brush_stroke_ext(0, pts[0].x, pts[0].y, pts[0].x, pts[0].y, argbColor, 0, 1000, 0, 0);
        exp.w_brush_stroke_ext(2, pts[0].x, pts[0].y, pts[0].x, pts[0].y, argbColor, 0, 1000, 0, 0);
        return;
      }

      exp.w_brush_stroke_ext(0, pts[0].x, pts[0].y, pts[1].x, pts[1].y, argbColor, 0, 1000, 0, 0);
      for (let i = 2; i < n; i++) {
        exp.w_brush_stroke_ext(1, pts[i].x, pts[i].y, pts[i - 1].x, pts[i - 1].y, argbColor, 0, 1000, 0, 0);
      }

      if (closed && n >= 3) {
        exp.w_brush_stroke_ext(1, pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y, argbColor, 0, 1000, 0, 0);
      }

      const last = closed ? pts[0] : pts[n - 1];
      const prev = closed ? pts[n - 1] : pts[n - 2];
      exp.w_brush_stroke_ext(2, last.x, last.y, prev.x, prev.y, argbColor, 0, 1000, 0, 0);
    }

    /** Alpha blending helper (ARGB Porter-Duff Source Over) */
    blendFast(src, dst) {
      const sa = (src >>> 24) & 0xFF;
      if (sa === 0) return dst;
      if (sa === 255) return src;

      const da = (dst >>> 24) & 0xFF;
      const invSa = 255 - sa;
      const outA = sa + ((da * invSa) / 255);
      if (outA === 0) return dst;

      const sr = src & 0xFF, sg = (src >> 8) & 0xFF, sb = (src >> 16) & 0xFF;
      const dr = dst & 0xFF, dg = (dst >> 8) & 0xFF, db = (dst >> 16) & 0xFF;

      const outR = Math.min(255, Math.round((sr * sa + dr * (da * invSa / 255)) / outA));
      const outG = Math.min(255, Math.round((sg * sa + dg * (da * invSa / 255)) / outA));
      const outB = Math.min(255, Math.round((sb * sa + db * (da * invSa / 255)) / outA));

      return ((Math.round(outA) << 24) | (outB << 16) | (outG << 8) | outR) >>> 0;
    }

    /**
     * Get rendered ImageData / RGBA pixels from Quadro linear memory
     */
    getImageData() {
      const exp = this.actor.exports;
      const w = exp.get_width ? exp.get_width() : 800;
      const h = exp.get_height ? exp.get_height() : 600;
      const outPtr = exp.get_out_pixels ? exp.get_out_pixels() : exp.w_layer_get_pixels(3);
      if (!outPtr || !this.actor.memory) return null;

      const u32 = new Uint32Array(this.actor.memory.buffer, outPtr, w * h);
      const imgDataArray = new Uint8ClampedArray(w * h * 4);

      // Convert ARGB to RGBA
      for (let i = 0; i < u32.length; i++) {
        const p = u32[i];
        const idx = i * 4;
        imgDataArray[idx] = p & 0xFF;         // R
        imgDataArray[idx + 1] = (p >> 8) & 0xFF;  // G
        imgDataArray[idx + 2] = (p >> 16) & 0xFF; // B
        imgDataArray[idx + 3] = (p >> 24) & 0xFF; // A
      }

      return { width: w, height: h, data: imgDataArray };
    }

    /**
     * Direct rasterization blit to a Canvas element in real time
     */
    renderToCanvas(doc, canvas, options = {}) {
      const res = this.renderDocument(doc, options);
      if (!res) return false;
      const imgData = this.getImageData();
      if (!imgData) return false;
      if (canvas.width !== imgData.width || canvas.height !== imgData.height) {
        canvas.width = imgData.width;
        canvas.height = imgData.height;
      }
      const ctx2d = canvas.getContext('2d');
      const img = ctx2d.createImageData(imgData.width, imgData.height);
      img.data.set(imgData.data);
      ctx2d.putImageData(img, 0, 0);
      return true;
    }
  }

  return QuadroSvgRenderer;
}));
