/**
 * =========================================================================
 * Quadro SVG Renderer (src/svg/quadro_svg_renderer.js)
 * High-performance rasterizer of SVG Object Scene Graphs into Quadro WASM.
 * Supports Compound Paths, Gradients, Drop Shadows & Brush Dynamics.
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
    } else if (mode === 4) { // Perlin Clouds / Soft Smoke
      const n1 = ((tx * 41 + ty * 59) ^ (tx * 17)) & 0xFF;
      const n2 = (((tx >> 2) * 103 + (ty >> 2) * 149) ^ (ty * 11)) & 0xFF;
      const smooth = (n1 + n2 * 3) >> 2;
      modA = Math.round((baseA * smooth) / 255);
    } else if (mode === 5) { // Crosshatch
      const d1 = (Math.abs(tx + ty) % 10 < 2);
      const d2 = (Math.abs(tx - ty) % 10 < 2);
      const hatch = (d1 || d2) ? 255 : 30;
      modA = Math.round((baseA * hatch) / 255);
    } else if (mode === 6) { // Halftone Dots
      const cx = Math.abs(tx) % 8 - 4;
      const cy = Math.abs(ty) % 8 - 4;
      const dist = cx * cx + cy * cy;
      const dot = (dist <= 6) ? 255 : 20;
      modA = Math.round((baseA * dot) / 255);
    } else if (mode === 7) { // Watercolor Granulation
      const n1 = ((tx * 2246822519 + ty * 3266489917) ^ ((tx >> 3) * 668265263)) & 0xFF;
      const cluster = (((tx >> 1) ^ (ty >> 1)) % 11 < 4) ? 240 : 60;
      modA = Math.round((baseA * n1 * cluster) / (255 * 255));
    } else if (mode === 8) { // Rough Pastel
      const n1 = ((tx * 1234567 + ty * 7654321) ^ 0xdeadbeef) & 0xFF;
      const pit = (n1 > 90) ? 255 : 40;
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

  function sampleGradient(gradient, x, y, bounds, scale, totalOpacity = 1.0) {
    if (!gradient || !gradient.stops || gradient.stops.length === 0) {
      return 0xFF000000;
    }

    let t = 0;
    const bx = bounds ? bounds.minX * scale : 0;
    const by = bounds ? bounds.minY * scale : 0;
    const bw = bounds ? Math.max(1, (bounds.maxX - bounds.minX) * scale) : 100;
    const bh = bounds ? Math.max(1, (bounds.maxY - bounds.minY) * scale) : 100;

    function parseCoord(val, size, base) {
      if (typeof val === 'string' && val.endsWith('%')) {
        return base + (parseFloat(val) / 100) * size;
      }
      return base + Number(val || 0) * scale;
    }

    if (gradient.type === 'linear') {
      const x1 = parseCoord(gradient.x1 !== undefined ? gradient.x1 : '0%', bw, bx);
      const y1 = parseCoord(gradient.y1 !== undefined ? gradient.y1 : '0%', bh, by);
      const x2 = parseCoord(gradient.x2 !== undefined ? gradient.x2 : '100%', bw, bx);
      const y2 = parseCoord(gradient.y2 !== undefined ? gradient.y2 : '0%', bh, by);

      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-6) {
        t = 0;
      } else {
        t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
      }
    } else if (gradient.type === 'radial') {
      const cx = parseCoord(gradient.cx !== undefined ? gradient.cx : '50%', bw, bx);
      const cy = parseCoord(gradient.cy !== undefined ? gradient.cy : '50%', bh, by);
      const r = typeof gradient.r === 'string' && gradient.r.endsWith('%')
        ? (parseFloat(gradient.r) / 100) * Math.max(bw, bh)
        : Math.max(1, Number(gradient.r || 50) * scale);

      const dx = x - cx;
      const dy = y - cy;
      t = Math.sqrt(dx * dx + dy * dy) / r;
    }

    t = Math.max(0, Math.min(1, t));

    const stops = gradient.stops;
    if (t <= stops[0].offset) {
      const argb = parseCssColorToArgb(stops[0].color, (stops[0].opacity !== undefined ? stops[0].opacity : 1.0) * totalOpacity);
      return argb;
    }
    if (t >= stops[stops.length - 1].offset) {
      const last = stops[stops.length - 1];
      const argb = parseCssColorToArgb(last.color, (last.opacity !== undefined ? last.opacity : 1.0) * totalOpacity);
      return argb;
    }

    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].offset && t <= stops[i + 1].offset) {
        s0 = stops[i];
        s1 = stops[i + 1];
        break;
      }
    }

    const range = s1.offset - s0.offset;
    const ratio = range <= 0 ? 0 : (t - s0.offset) / range;

    const c0 = parseCssColorToArgb(s0.color, s0.opacity !== undefined ? s0.opacity : 1.0);
    const c1 = parseCssColorToArgb(s1.color, s1.opacity !== undefined ? s1.opacity : 1.0);

    const a0 = (c0 >>> 24) & 0xFF, r0 = c0 & 0xFF, g0 = (c0 >> 8) & 0xFF, b0 = (c0 >> 16) & 0xFF;
    const a1 = (c1 >>> 24) & 0xFF, r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF;

    const a = Math.round((a0 + (a1 - a0) * ratio) * totalOpacity);
    const r = Math.round(r0 + (r1 - r0) * ratio);
    const g = Math.round(g0 + (g1 - g0) * ratio);
    const b = Math.round(b0 + (b1 - b0) * ratio);

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

      // Handle Text with dedicated high-res canvas rasterization
      if (obj.type === 'text') {
        this.renderText(obj, scale, totalOpacity);
        return;
      }

      // Convert shape to polyline / compound paths
      let pathObj = obj;
      if (typeof obj.toPath === 'function') {
        pathObj = obj.toPath();
      }

      const bounds = obj.getBounds ? obj.getBounds() : (pathObj.getBounds ? pathObj.getBounds() : null);

      // 0. Render Drop Shadow & Glow
      if (obj.dropShadow && obj.dropShadow.enabled) {
        this.renderDropShadow(pathObj, obj.dropShadow, scale, totalOpacity);
      }

      // 1. Render Fill (Solid, Linear Gradient, Radial Gradient, Procedural Texture)
      const hasFill = (obj.fill && obj.fill !== 'none') || (obj.fillType && obj.fillType !== 'solid');
      if (hasFill) {
        const fillAlpha = (obj.fillOpacity !== undefined ? obj.fillOpacity : 1.0) * totalOpacity;
        const fillArgb = parseCssColorToArgb(obj.fill, fillAlpha);

        const gradient = (obj.fillType === 'linear' || obj.fillType === 'radial') ? obj.fillGradient : null;

        if (pathObj.toPolylines) {
          const polylines = pathObj.toPolylines(0.5);
          if (polylines.length > 0) {
            this.fillCompoundPolygons(polylines, pathObj.fillRule || 'evenodd', fillArgb, scale, obj.fillTexture, gradient, bounds, totalOpacity);
          }
        } else if (pathObj.toPolyline) {
          const poly = pathObj.toPolyline(0.5);
          if (poly.length >= 3) {
            this.fillPolygon(poly, fillArgb, scale, obj.fillTexture, gradient, bounds, totalOpacity);
          }
        }
      }

      // 2. Render Stroke (with brush dynamics & stroke texture support)
      if (obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0) {
        const strokeAlpha = (obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1.0) * totalOpacity;
        const strokeArgb = parseCssColorToArgb(obj.stroke, strokeAlpha);

        if ((strokeArgb >>> 24) > 0) {
          const strokeWidth = Math.max(1, Math.round(obj.strokeWidth * scale));
          if (pathObj.toPolylines) {
            const polylines = pathObj.toPolylines(0.4);
            const subPaths = pathObj.subPaths || [];
            for (let i = 0; i < polylines.length; i++) {
              const poly = polylines[i];
              if (poly.length >= 2) {
                const closed = subPaths[i] ? subPaths[i].closed : true;
                this.strokePolyline(
                  poly,
                  strokeArgb,
                  strokeWidth,
                  closed,
                  obj.brushConfig,
                  obj.strokeTexture,
                  scale
                );
              }
            }
          } else if (pathObj.toPolyline) {
            const poly = pathObj.toPolyline(0.4);
            if (poly.length >= 2) {
              this.strokePolyline(
                poly,
                strokeArgb,
                strokeWidth,
                pathObj.closed,
                obj.brushConfig,
                obj.strokeTexture,
                scale
              );
            }
          }
        }
      }
    }

    /**
     * Render Text into Quadro WASM using high-resolution typography rasterization
     */
    renderText(textObj, scale = 1.0, totalOpacity = 1.0) {
      const exp = this.actor.exports;
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
      const pixPtr = exp.w_layer_get_pixels(3);
      if (!pixPtr || !this.actor.memory) return;

      const pixels = new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh);

      if (typeof document !== 'undefined' && document.createElement) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = lw;
        offCanvas.height = lh;
        const octx = offCanvas.getContext('2d');
        if (!octx) return;

        const fontSize = Math.max(4, Math.round(textObj.fontSize * scale));
        const fontStyle = textObj.fontStyle || 'normal';
        const fontWeight = textObj.fontWeight || 'normal';
        const fontFamily = textObj.fontFamily || 'sans-serif';
        octx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
        
        const anchor = textObj.textAlign === 'center' ? 'center' : (textObj.textAlign === 'right' ? 'right' : 'left');
        octx.textAlign = anchor;
        octx.textBaseline = 'alphabetic';

        const tx = textObj.x * scale;
        const ty = textObj.y * scale;

        // Render drop shadow if enabled
        if (textObj.dropShadow && textObj.dropShadow.enabled) {
          const s = textObj.dropShadow;
          octx.save();
          octx.shadowColor = s.color || '#000000';
          octx.shadowBlur = (s.blur || 4) * scale;
          octx.shadowOffsetX = (s.offsetX || 2) * scale;
          octx.shadowOffsetY = (s.offsetY || 2) * scale;
          octx.fillStyle = textObj.fill && textObj.fill !== 'none' ? textObj.fill : '#fabd2f';
          octx.fillText(textObj.text, tx, ty);
          octx.restore();
        }

        // Fill Text
        if (textObj.fill && textObj.fill !== 'none') {
          if ((textObj.fillType === 'linear' || textObj.fillType === 'radial') && textObj.fillGradient) {
            const b = textObj.getBounds();
            const grad = textObj.fillGradient;
            let canvasGrad;
            if (grad.type === 'radial') {
              const cx = (b.minX + b.width / 2) * scale;
              const cy = (b.minY + b.height / 2) * scale;
              const r = Math.max(b.width, b.height) / 2 * scale;
              canvasGrad = octx.createRadialGradient(cx, cy, 0, cx, cy, r);
            } else {
              canvasGrad = octx.createLinearGradient(b.minX * scale, b.minY * scale, b.maxX * scale, b.minY * scale);
            }
            for (const st of grad.stops) {
              canvasGrad.addColorStop(Math.max(0, Math.min(1, st.offset)), st.color);
            }
            octx.fillStyle = canvasGrad;
          } else {
            octx.fillStyle = textObj.fill;
          }
          octx.fillText(textObj.text, tx, ty);
        }

        // Stroke Text
        if (textObj.stroke && textObj.stroke !== 'none' && textObj.strokeWidth > 0) {
          octx.strokeStyle = textObj.stroke;
          octx.lineWidth = textObj.strokeWidth * scale;
          octx.strokeText(textObj.text, tx, ty);
        }

        // Blit offscreen canvas ImageData to Quadro buffer
        const imgData = octx.getImageData(0, 0, lw, lh);
        const data32 = new Uint32Array(imgData.data.buffer);
        for (let i = 0; i < lw * lh; i++) {
          const col = data32[i];
          if ((col & 0xFF000000) !== 0) {
            // Convert ABGR from Canvas to ARGB for Quadro
            const a = (col >>> 24) & 0xFF;
            const b = (col >> 16) & 0xFF;
            const g = (col >> 8) & 0xFF;
            const r = col & 0xFF;
            const finalAlpha = Math.round(a * totalOpacity);
            if (finalAlpha > 0) {
              const argb = ((finalAlpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
              pixels[i] = this.blendFast(argb, pixels[i]);
            }
          }
        }
      } else {
        // Fallback for headless environments
        const pathObj = textObj.toPath();
        if (pathObj.toPolylines) {
          const polylines = pathObj.toPolylines(0.5);
          const fillAlpha = (textObj.fillOpacity !== undefined ? textObj.fillOpacity : 1.0) * totalOpacity;
          const fillArgb = parseCssColorToArgb(textObj.fill || '#fabd2f', fillAlpha);
          this.fillCompoundPolygons(polylines, 'nonzero', fillArgb, scale, textObj.fillTexture, null, textObj.getBounds(), totalOpacity);
        }
      }
    }

    /**
     * Render Gaussian Drop Shadows & Glows (Optimized Local Bounding Box Blit)
     */
    renderDropShadow(pathObj, shadowConfig, scale = 1.0, parentOpacity = 1.0) {
      const exp = this.actor.exports;
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
      const pixPtr = exp.w_layer_get_pixels(3);
      if (!pixPtr || !this.actor.memory) return;

      const pixels = new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh);
      const polylines = pathObj.toPolylines ? pathObj.toPolylines(0.5) : (pathObj.toPolyline ? [pathObj.toPolyline(0.5)] : []);
      if (!polylines.length) return;

      const blur = Math.max(0, Math.round((shadowConfig.blur !== undefined ? shadowConfig.blur : 4) * scale));
      const ox = Math.round((shadowConfig.offsetX !== undefined ? shadowConfig.offsetX : 2) * scale);
      const oy = Math.round((shadowConfig.offsetY !== undefined ? shadowConfig.offsetY : 2) * scale);
      const shadowAlpha = (shadowConfig.opacity !== undefined ? shadowConfig.opacity : 0.6) * parentOpacity;
      const shadowColor = parseCssColorToArgb(shadowConfig.color || '#000000', 1.0);
      const sR = shadowColor & 0xFF, sG = (shadowColor >> 8) & 0xFF, sB = (shadowColor >> 16) & 0xFF;

      // Compute bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const poly of polylines) {
        for (const p of poly) {
          const sx = p.x * scale + ox;
          const sy = p.y * scale + oy;
          if (sx < minX) minX = sx;
          if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy;
          if (sy > maxY) maxY = sy;
        }
      }
      if (minX === Infinity) return;

      const pad = Math.max(4, blur * 3);
      const bx0 = Math.max(0, Math.floor(minX - pad));
      const by0 = Math.max(0, Math.floor(minY - pad));
      const bx1 = Math.min(lw - 1, Math.ceil(maxX + pad));
      const by1 = Math.min(lh - 1, Math.ceil(maxY + pad));
      const bw = bx1 - bx0 + 1;
      const bh = by1 - by0 + 1;
      if (bw <= 0 || bh <= 0) return;

      // 1. Create local silhouette mask
      const mask = new Uint8Array(bw * bh);

      for (const poly of polylines) {
        if (poly.length < 3) continue;
        const localPts = poly.map(p => ({
          x: Math.round(p.x * scale) + ox - bx0,
          y: Math.round(p.y * scale) + oy - by0
        }));

        let pMinY = bh, pMaxY = 0;
        for (const p of localPts) {
          if (p.y < pMinY) pMinY = p.y;
          if (p.y > pMaxY) pMaxY = p.y;
        }
        pMinY = Math.max(0, pMinY);
        pMaxY = Math.min(bh - 1, pMaxY);

        const nodeX = [];
        for (let y = pMinY; y <= pMaxY; y++) {
          nodeX.length = 0;
          let j = localPts.length - 1;
          for (let i = 0; i < localPts.length; i++) {
            const pi = localPts[i];
            const pj = localPts[j];
            if ((pi.y < y && pj.y >= y) || (pj.y < y && pi.y >= y)) {
              const x = Math.round(pi.x + (y - pi.y) / (pj.y - pi.y) * (pj.x - pi.x));
              nodeX.push(x);
            }
            j = i;
          }
          nodeX.sort((a, b) => a - b);
          for (let i = 0; i < nodeX.length; i += 2) {
            if (nodeX[i] >= bw) break;
            if (nodeX[i + 1] > 0) {
              const x0 = Math.max(0, nodeX[i]);
              const x1 = Math.min(bw - 1, nodeX[i + 1]);
              const row = y * bw;
              for (let x = x0; x <= x1; x++) {
                mask[row + x] = 255;
              }
            }
          }
        }
      }

      // 2. Exact 3-Pass Local Gaussian Blur
      let blurredMask = mask;
      if (blur > 0) {
        const radius = Math.min(100, blur);
        const r = Math.max(1, Math.round(radius / 2));
        let current = new Float32Array(mask);
        let temp = new Float32Array(bw * bh);

        for (let pass = 0; pass < 3; pass++) {
          // Horizontal pass
          const iarrH = 1 / (r + r + 1);
          for (let y = 0; y < bh; y++) {
            const row = y * bw;
            const firstVal = current[row];
            const lastVal = current[row + bw - 1];
            let sum = (r + 1) * firstVal;
            for (let j = 0; j < r; j++) {
              sum += current[row + Math.min(bw - 1, j)];
            }
            for (let x = 0; x <= r; x++) {
              sum += current[row + Math.min(bw - 1, x + r)] - firstVal;
              temp[row + x] = sum * iarrH;
            }
            for (let x = r + 1; x < bw - r; x++) {
              sum += current[row + x + r] - current[row + x - r - 1];
              temp[row + x] = sum * iarrH;
            }
            for (let x = Math.max(r + 1, bw - r); x < bw; x++) {
              sum += lastVal - current[row + x - r - 1];
              temp[row + x] = sum * iarrH;
            }
          }

          // Vertical pass
          const iarrV = 1 / (r + r + 1);
          for (let x = 0; x < bw; x++) {
            const firstVal = temp[x];
            const lastVal = temp[(bh - 1) * bw + x];
            let sum = (r + 1) * firstVal;
            for (let j = 0; j < r; j++) {
              sum += temp[Math.min(bh - 1, j) * bw + x];
            }
            for (let y = 0; y <= r; y++) {
              sum += temp[Math.min(bh - 1, y + r) * bw + x] - firstVal;
              current[y * bw + x] = sum * iarrV;
            }
            for (let y = r + 1; y < bh - r; y++) {
              sum += temp[(y + r) * bw + x] - temp[(y - r - 1) * bw + x];
              current[y * bw + x] = sum * iarrV;
            }
            for (let y = Math.max(r + 1, bh - r); y < bh; y++) {
              sum += lastVal - temp[(y - r - 1) * bw + x];
              current[y * bw + x] = sum * iarrV;
            }
          }
        }

        blurredMask = new Uint8Array(bw * bh);
        for (let i = 0; i < bw * bh; i++) {
          blurredMask[i] = Math.max(0, Math.min(255, Math.round(current[i])));
        }
      }

      // 3. Blit local shadow onto layer
      for (let y = 0; y < bh; y++) {
        const destY = by0 + y;
        if (destY >= lh) break;
        const destRow = destY * lw;
        const srcRow = y * bw;
        for (let x = 0; x < bw; x++) {
          const destX = bx0 + x;
          if (destX >= lw) break;
          const alphaVal = Math.round(blurredMask[srcRow + x] * shadowAlpha);
          if (alphaVal > 0) {
            const argb = ((alphaVal << 24) | (sB << 16) | (sG << 8) | sR) >>> 0;
            pixels[destRow + destX] = this.blendFast(argb, pixels[destRow + destX]);
          }
        }
      }
    }

    /**
     * Scanline polygon fill in Quadro layer with procedural texture and gradient masking
     */
    fillPolygon(poly, argbColor, scale = 1.0, fillTexture = null, gradient = null, bounds = null, totalOpacity = 1.0) {
      this.fillCompoundPolygons([poly], 'nonzero', argbColor, scale, fillTexture, gradient, bounds, totalOpacity);
    }

    /**
     * Scanline compound polygons fill in Quadro layer (supports EvenOdd parity for holes & NonZero)
     */
    fillCompoundPolygons(polylines, fillRule = 'evenodd', fillArgb = 0xFFfabd2f, scale = 1.0, fillTexture = null, gradient = null, bounds = null, totalOpacity = 1.0) {
      const exp = this.actor.exports;
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
      const pixPtr = exp.w_layer_get_pixels(3);
      if (!pixPtr || !this.actor.memory) return;

      const pixels = new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh);
      if (!polylines || polylines.length === 0) return;

      let minY = lh, maxY = 0;
      const scaledPolys = [];
      for (const poly of polylines) {
        if (!poly || poly.length < 3) continue;
        const sPts = poly.map(p => {
          const x = Math.round(p.x * scale);
          const y = Math.round(p.y * scale);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          return { x, y };
        });
        scaledPolys.push(sPts);
      }

      if (minY < 0) minY = 0;
      if (maxY >= lh) maxY = lh - 1;
      if (minY > maxY) return;

      const baseAlpha = (fillArgb >>> 24) & 0xFF;
      const texMode = fillTexture ? (fillTexture.mode || 0) : 0;
      const texAngle = fillTexture ? (fillTexture.angle || 0) : 0;
      const texScale = Math.round((fillTexture ? (fillTexture.scale || 100) : 100) * scale);
      const texContrast = fillTexture ? (fillTexture.contrast || 100) : 100;

      const nodeX = [];
      for (let y = minY; y <= maxY; y++) {
        nodeX.length = 0;
        for (const pts of scaledPolys) {
          const n = pts.length;
          let j = n - 1;
          for (let i = 0; i < n; i++) {
            const pi = pts[i];
            const pj = pts[j];
            if ((pi.y < y && pj.y >= y) || (pj.y < y && pi.y >= y)) {
              const x = Math.round(pi.x + (y - pi.y) / (pj.y - pi.y) * (pj.x - pi.x));
              nodeX.push(x);
            }
            j = i;
          }
        }

        nodeX.sort((a, b) => a - b);

        for (let i = 0; i < nodeX.length; i += 2) {
          if (nodeX[i] >= lw) break;
          if (nodeX[i + 1] > 0) {
            let x0 = nodeX[i] < 0 ? 0 : nodeX[i];
            let x1 = nodeX[i + 1] >= lw ? lw - 1 : nodeX[i + 1];
            const row = y * lw;
            for (let x = x0; x <= x1; x++) {
              let pixColor = fillArgb;
              if (gradient && bounds) {
                pixColor = sampleGradient(gradient, x, y, bounds, scale, totalOpacity);
              }
              if (texMode > 0) {
                const pA = (pixColor >>> 24) & 0xFF;
                const sampledA = sampleProceduralTexture(texMode, x, y, texAngle, texScale, texContrast, pA);
                pixColor = ((sampledA << 24) | (pixColor & 0x00FFFFFF)) >>> 0;
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
