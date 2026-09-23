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

      // 1. Render Fill
      if (obj.fill && obj.fill !== 'none') {
        const fillAlpha = (obj.fillOpacity !== undefined ? obj.fillOpacity : 1.0) * totalOpacity;
        const fillArgb = parseCssColorToArgb(obj.fill, fillAlpha);

        if ((fillArgb >>> 24) > 0) {
          const poly = pathObj.toPolyline ? pathObj.toPolyline(0.5) : [];
          if (poly.length >= 3) {
            // Use Quadro vector shape fill or scanline rasterizer
            this.fillPolygon(poly, fillArgb, scale);
          }
        }
      }

      // 2. Render Stroke
      if (obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0) {
        const strokeAlpha = (obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1.0) * totalOpacity;
        const strokeArgb = parseCssColorToArgb(obj.stroke, strokeAlpha);

        if ((strokeArgb >>> 24) > 0) {
          const poly = pathObj.toPolyline ? pathObj.toPolyline(0.4) : [];
          if (poly.length >= 2) {
            this.strokePolyline(poly, strokeArgb, Math.max(1, Math.round(obj.strokeWidth * scale)), pathObj.closed);
          }
        }
      }
    }

    /**
     * Scanline polygon fill in Quadro layer
     */
    fillPolygon(poly, argbColor, scale = 1.0) {
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
              pixels[row + x] = this.blendFast(argbColor, pixels[row + x]);
            }
          }
        }
      }
    }

    /**
     * Anti-aliased stroke drawing via Quadro brush engine
     */
    strokePolyline(poly, argbColor, strokeWidth = 2, closed = false) {
      const exp = this.actor.exports;
      exp.w_brush_set_param(1 /* SIZE */, strokeWidth);
      exp.w_brush_set_param(2 /* OPACITY */, 100);
      exp.w_brush_set_param(3 /* HARDNESS */, 95);
      exp.w_brush_set_param(4 /* FLOW */, 100);

      const n = poly.length;
      if (n === 1) {
        exp.w_brush_stroke_ext(0, poly[0].x, poly[0].y, poly[0].x, poly[0].y, argbColor, 0, 1000, 0, 0);
        exp.w_brush_stroke_ext(2, poly[0].x, poly[0].y, poly[0].x, poly[0].y, argbColor, 0, 1000, 0, 0);
        return;
      }

      exp.w_brush_stroke_ext(0, poly[0].x, poly[0].y, poly[1].x, poly[1].y, argbColor, 0, 1000, 0, 0);
      for (let i = 2; i < n; i++) {
        exp.w_brush_stroke_ext(1, poly[i].x, poly[i].y, poly[i - 1].x, poly[i - 1].y, argbColor, 0, 1000, 0, 0);
      }

      if (closed && n >= 3) {
        exp.w_brush_stroke_ext(1, poly[0].x, poly[0].y, poly[n - 1].x, poly[n - 1].y, argbColor, 0, 1000, 0, 0);
      }

      const last = closed ? poly[0] : poly[n - 1];
      const prev = closed ? poly[n - 1] : poly[n - 2];
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
  }

  return QuadroSvgRenderer;
}));
