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
    const BrushFillEngine = require('../brush_fill_engine.js');
    module.exports = factory(EsenhoModule, SvgEngine, BrushFillEngine);
  } else {
    root.QuadroSvgRenderer = factory(root.EsenhoModule, root.SvgEngine, root.BrushFillEngine || (root.esenho && root.esenho.BrushFillEngine));
  }
}(typeof self !== 'undefined' ? self : this, function (EsenhoModule, SvgEngine, BrushFillEngine) {
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

  /* ── 2D Affine Matrix Helpers for Hierarchical Scene Graph Rendering ── */
  function identityMatrix() {
    return [1, 0, 0, 1, 0, 0];
  }

  function multiplyMatrix(m1, m2) {
    if (!m1) return m2;
    if (!m2) return m1;
    const a1 = m1[0], b1 = m1[1], c1 = m1[2], d1 = m1[3], e1 = m1[4], f1 = m1[5];
    const a2 = m2[0], b2 = m2[1], c2 = m2[2], d2 = m2[3], e2 = m2[4], f2 = m2[5];
    return [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1
    ];
  }

  function translateMatrix(tx, ty) {
    return [1, 0, 0, 1, tx, ty];
  }

  function rotateMatrix(angleDeg, ox = 0, oy = 0) {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
      cos,
      sin,
      -sin,
      cos,
      ox - ox * cos + oy * sin,
      oy - ox * sin - oy * cos
    ];
  }

  function scaleMatrix(sx, sy, ox = 0, oy = 0) {
    return [
      sx,
      0,
      0,
      sy,
      ox - ox * sx,
      oy - oy * sy
    ];
  }

  function skewMatrix(skewXDeg, skewYDeg) {
    const tanX = Math.tan((skewXDeg || 0) * Math.PI / 180);
    const tanY = Math.tan((skewYDeg || 0) * Math.PI / 180);
    return [1, tanY, tanX, 1, 0, 0];
  }

  function transformPoint(m, p) {
    if (!m) return p;
    return {
      x: m[0] * p.x + m[2] * p.y + m[4],
      y: m[1] * p.x + m[3] * p.y + m[5]
    };
  }

  function isIdentityMatrix(m) {
    if (!m) return true;
    return Math.abs(m[0] - 1) < 1e-6 &&
           Math.abs(m[1]) < 1e-6 &&
           Math.abs(m[2]) < 1e-6 &&
           Math.abs(m[3] - 1) < 1e-6 &&
           Math.abs(m[4]) < 1e-6 &&
           Math.abs(m[5]) < 1e-6;
  }

  function getNodeLocalMatrix(node) {
    let m = identityMatrix();
    if (node.type === 'group') {
      const tx = Number(node.x || 0);
      const ty = Number(node.y || 0);
      if (tx !== 0 || ty !== 0) {
        m = multiplyMatrix(m, translateMatrix(tx, ty));
      }
    }
    const bounds = (typeof node.getBounds === 'function') ? (node.type === 'group' ? node.getBounds(true) : node.getBounds()) : { minX: 0, minY: 0, width: 0, height: 0 };
    const ox = node.originX !== undefined ? node.originX : (bounds.minX + (bounds.width || 0) / 2);
    const oy = node.originY !== undefined ? node.originY : (bounds.minY + (bounds.height || 0) / 2);
    if (node.rotation && node.rotation !== 0) {
      m = multiplyMatrix(m, rotateMatrix(node.rotation, ox, oy));
    }
    if ((node.scaleX !== undefined && node.scaleX !== 1) || (node.scaleY !== undefined && node.scaleY !== 1)) {
      const sx = node.scaleX !== undefined ? node.scaleX : 1;
      const sy = node.scaleY !== undefined ? node.scaleY : 1;
      m = multiplyMatrix(m, scaleMatrix(sx, sy, ox, oy));
    }
    if (node.skewX || node.skewY) {
      m = multiplyMatrix(m, skewMatrix(node.skewX || 0, node.skewY || 0));
    }
    return m;
  }

  function posMod(a, m) {
    const r = a % m;
    return r < 0 ? r + m : r;
  }

  function posDiv(a, d) {
    return Math.floor(a / d);
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
      const n = (((tx * 1234567 + ty * 7654321) ^ (tx * ty * 13)) >>> 0) & 0xFF;
      const fiber = (posMod(tx * 3 + ty * 5, 17) < 3) ? 50 : 255;
      modA = Math.round((baseA * n * fiber) / (255 * 255));
    } else if (mode === 2) { // Canvas weave
      const pat = ((posMod(tx, 6) < 3) ^ (posMod(ty, 6) < 3)) ? 255 : 40;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 3) { // Noise
      const n = (((tx * 374761393 + ty * 668265263) ^ 0x5bf03635) >>> 0) & 0xFF;
      modA = Math.round((baseA * n) / 255);
    } else if (mode === 4) { // Halftone dots
      const dx = posMod(tx, 8) - 4, dy = posMod(ty, 8) - 4;
      const d2 = dx * dx + dy * dy;
      const pat = (d2 <= 5) ? 255 : 20;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 5) { // Grid
      const pat = (posMod(tx, 8) === 0 || posMod(ty, 8) === 0) ? 255 : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 6) { // Grunge
      const bx = posDiv(tx, 4);
      const by = posDiv(ty, 4);
      const n = (((bx * 101 + by * 203) ^ (tx * 17 + ty * 31)) >>> 0) & 0xFF;
      const pat = n > 120 ? 255 : Math.round(n * 255 / 120);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 7) { // Hatch
      const m = posMod(tx + ty, 6);
      const pat = (m === 0 || m === 1) ? 255 : 0;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 8) { // Watercolor Cold Press Paper
      const n1 = (((tx * 239847 + ty * 983471) ^ (tx * 7)) >>> 0) & 0xFF;
      const bx = posDiv(tx, 3);
      const by = posDiv(ty, 3);
      const pit = (posMod(bx * 11 + by * 13, 23) < 4) ? 40 : 255;
      modA = Math.round((baseA * n1 * pit) / (255 * 255));
    } else if (mode === 9) { // Charcoal Tooth
      const bx = posDiv(tx, 2);
      const by = posDiv(ty, 2);
      const n = (((bx * 589237 + by * 782391) ^ (tx * 31 + ty * 19)) >>> 0) & 0xFF;
      const tooth = (n > 140) ? 255 : (n > 70 ? 120 : 20);
      modA = Math.round((baseA * tooth) / 255);
    } else if (mode === 10) { // Wood Grain
      const wave = tx + posMod(posDiv(ty * ty, 120), 24);
      const ring = (posMod(wave, 12) < 3) ? 255 : 70;
      modA = Math.round((baseA * ring) / 255);
    } else if (mode === 11) { // Leather / Cellular Pores
      const cx = posMod(tx, 10) - 5, cy = posMod(ty, 10) - 5;
      const d = cx * cx + cy * cy;
      const pore = (d <= 3) ? 40 : 240;
      modA = Math.round((baseA * pore) / 255);
    } else if (mode === 12) { // Dense Linen
      const lx = (posMod(tx, 4) < 2), ly = (posMod(ty, 4) < 2);
      const pat = (lx ^ ly) ? 245 : 65;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 13) { // Marble Veins
      const v = (((tx * 7 + posMod(ty * 13, 31)) ^ (tx * ty)) >>> 0) & 0xFF;
      const pat = (v > 180) ? 250 : (v < 60 ? 30 : 160);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 14) { // Perlin Cloud
      const c1 = (((tx * 197 + ty * 311) ^ 0x5a5a5a5a) >>> 0) & 0xFF;
      const pat = (c1 > 140) ? 240 : (c1 < 60 ? 40 : 130);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 15) { // Basket Weave
      const bx = posMod(posDiv(tx, 8), 2);
      const by = posMod(posDiv(ty, 8), 2);
      const pat = (bx ^ by) ? ((posMod(tx, 4) < 2) ? 235 : 60) : ((posMod(ty, 4) < 2) ? 235 : 60);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 16) { // Sandpaper Grit
      const g = (((tx * 377 + ty * 491) ^ (tx * ty * 13)) >>> 0) & 0xFF;
      const tooth = g > 110 ? 255 : (g > 50 ? 110 : 25);
      modA = Math.round((baseA * tooth) / 255);
    } else if (mode === 17) { // Radial Halftone
      const dx = posMod(tx, 16) - 8, dy = posMod(ty, 16) - 8;
      const d = Math.round(Math.sqrt(dx * dx + dy * dy));
      let pat = (d <= 6) ? (255 - d * 35) : 30;
      if (pat < 0) pat = 0;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 18) { // Crackle Fissures
      const c = (((tx * 17 + ty * 31) ^ (tx * ty * 3)) >>> 0) & 0xFF;
      const pat = (c < 35 || (posMod(tx + ty * 2, 37) < 3)) ? 30 : 235;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 19) { // Washi Fiber
      const f1 = (posMod(tx * 7 + ty * 29, 31) < 3) ? 70 : 255;
      const f2 = (posMod(tx * 19 - ty * 11, 43) < 2) ? 50 : 255;
      modA = Math.round((baseA * f1 * f2) / (255 * 255));
    } else if (mode === 20) { // Concrete Stone
      const p1 = (((tx * 133 + ty * 277) ^ (tx * ty * 17)) >>> 0) & 0xFF;
      const pat = (p1 > 130) ? 230 : (p1 < 60 ? 50 : 140);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 21) { // Antique Parchment
      const m1 = posMod(tx * 31 + ty * 17, 47);
      const m2 = posMod(tx * 13 - ty * 29, 37);
      let pat = 180 + m1 - m2;
      if (pat < 0) pat = 0; if (pat > 255) pat = 255;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 22) { // Stipple Noise
      const r = (((tx * 499 + ty * 883) ^ 0x3d3d3d3d) >>> 0) & 0xFF;
      const pat = r > 165 ? 245 : (r > 75 ? 140 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 23) { // Spatter Drops
      const cx = posMod(tx, 32) - 16, cy = posMod(ty, 32) - 16;
      const d2 = cx * cx + cy * cy;
      const pat = (d2 <= 9 || (posMod(tx * 97 + ty * 43, 89) < 4)) ? 30 : 240;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 24) { // Raw Fiber Pulp
      const bx = posDiv(tx, 4);
      const by = posDiv(ty, 4);
      const clump = (((bx * 31 + by * 47) ^ (tx * 3)) >>> 0) & 0xFF;
      const pat = (clump > 140) ? 245 : (clump < 70 ? 60 : 190);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 25) { // Coarse Halftone
      const dx = posMod(tx, 16) - 8, dy = posMod(ty, 16) - 8;
      const pat = (dx * dx + dy * dy <= 42) ? 255 : 20;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 26) { // Fine Crosshatch
      const h1 = posMod(tx + ty, 4) === 0;
      const h2 = posMod(tx - ty, 4) === 0;
      const pat = (h1 || h2) ? 250 : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 27) { // Distressed Rust
      const g = (((tx * 19 + ty * 43) ^ (tx * ty)) >>> 0) & 0xFF;
      const pat = (g > 160) ? 235 : (g < 60 ? 40 : 130);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 28) { // Dry Bristle Scrape
      const by = posDiv(ty, 4);
      const streak = (((tx * 53 + by * 97) ^ (tx * 11)) >>> 0) & 0xFF;
      const pat = streak > 100 ? 245 : (streak > 40 ? 110 : 25);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 29) { // Pastel Board (Honeycomb)
      const u = posMod(Math.floor((tx * 866 + ty * 500) / 1000), 12);
      const v = posMod(Math.floor((-tx * 866 + ty * 500) / 1000), 12);
      const du = (u > 6) ? (12 - u) : u;
      const dv = (v > 6) ? (12 - v) : v;
      const hex = (du < dv) ? du : dv;
      let pat = 60 + hex * 30;
      if (pat > 255) pat = 255;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 30) { // Tree Bark
      const wave = posMod(ty * 13, 29);
      const xPerturb = posMod(tx + wave, 32);
      const fissure = (xPerturb > 16) ? (32 - xPerturb) : xPerturb;
      const fiber = (posMod(tx * 47 + ty * 13, 17) < 3) ? -35 : 20;
      let pat = fissure * 14 + fiber + 60;
      if (pat < 0) pat = 0; if (pat > 255) pat = 255;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 31) { // Manga 60L Screen Dots
      const u = posMod(Math.floor(((tx + ty) * 707) / 1000), 8);
      const v = posMod(Math.floor(((-tx + ty) * 707) / 1000), 8);
      const du = u - 4, dv = v - 4;
      const pat = (du * du + dv * dv <= 5) ? 255 : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 32) { // Manga Sandtone
      const g1 = (((tx * 127 + ty * 311) ^ (tx * 19)) >>> 0) & 0xFF;
      const g2 = (((tx * 37 - ty * 97) ^ (ty * 23)) >>> 0) & 0xFF;
      const pat = (g1 > 170 || (g2 > 210 && posMod(tx + ty, 2) === 0)) ? 245 : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 33) { // Sea Sponge
      const bx = posDiv(tx, 6);
      const by = posDiv(ty, 6);
      const pore = (posMod(bx * 17 + by * 29, 19) < 3) ? 40 : 230;
      const noise = (((tx * 43 + ty * 71) ^ (tx * ty)) >>> 0) & 0xFF;
      let pat = Math.round((pore * (160 + (noise >> 1))) / 255);
      if (pat > 255) pat = 255;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 34) { // Stucco Plaster Wall
      const facet = (posMod(tx * 3 + ty * 5, 64) < 32) ? 220 : 80;
      const knife = (posMod(tx * 19 - ty * 23, 41) < 4) ? 40 : 255;
      const pat = Math.round((facet * knife) / 255);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 35) { // Denim Twill Weave
      const twill = posMod(tx * 2 + ty, 6);
      const pat = (twill < 3) ? 240 : 60;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 36) { // Oil Impasto Knife Peaks
      const ridge = (posMod(tx * 11 + ty * 7, 32) < 16) ? 250 : 50;
      const gouge = (posMod(tx * 29 - ty * 13, 47) < 3) ? 30 : 240;
      const pat = Math.round((ridge * gouge) / 255);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 37) { // Dusty Chalk Tooth
      const grain = (((tx * 199 + ty * 337) ^ (tx * ty * 5)) >>> 0) & 0xFF;
      const pat = grain > 120 ? 240 : 45;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 38) { // Vintage Engraving Lines
      const line = posMod(ty + posMod(tx * 7, 5), 6);
      const pat = (line < 3) ? 245 : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 39) { // Granite Rock Flecks
      const f1 = (((tx * 17 + ty * 73) ^ (tx * 3)) >>> 0) & 0xFF;
      const f2 = (((tx * 89 + ty * 13) ^ (ty * 5)) >>> 0) & 0xFF;
      const pat = (f1 > 220) ? 250 : ((f2 > 230) ? 30 : (120 + ((f1 + f2) >> 2)));
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 40) { // Watercolor Salt Bloom
      const cx = posMod(tx, 64) - 32, cy = posMod(ty, 64) - 32;
      const d = Math.round(Math.sqrt(cx * cx + cy * cy));
      const pat = (d >= 24 && d <= 30) ? 40 : (d < 24 ? 245 : 180);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 41) { // Coarse Burlap Jute
      const tx_b = (posMod(tx, 8) < 4) ? 220 : 50;
      const ty_b = (posMod(ty, 8) < 4) ? 220 : 50;
      const block = posMod(posDiv(tx, 8) + posDiv(ty, 8), 2) === 0;
      const pat = block ? tx_b : ty_b;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 42) { // Cracked Mud Earth
      const c1 = (posMod(tx * 13, 47) < 4);
      const c2 = (posMod(ty * 17, 53) < 4);
      const pat = (c1 || c2) ? 30 : 235;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 43) { // Cyber PCB Circuit Board
      const cx = posMod(tx, 32), cy = posMod(ty, 32);
      const dx = cx - 16, dy = cy - 16;
      const d2 = dx * dx + dy * dy;
      const is_pad = (d2 <= 25);
      const is_hole = (d2 <= 4);
      const is_trace = (cx === 16 || cy === 16 || (posMod(cx + cy, 32) === 0 && cx >= 6 && cx <= 26));
      const pat = is_hole ? 35 : (is_pad || is_trace ? 250 : 55);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 44) { // Foliage / Organic Leaves
      const u = posMod(tx, 32) - 16, v = posMod(ty, 32) - 16;
      const lu = Math.round((u + v) * 0.7071), lv = Math.round((-u + v) * 0.7071);
      const w_max = Math.max(0, 6 - Math.floor((lu * lu) / 28));
      const in_leaf = (lu >= -13 && lu <= 13 && lv >= -w_max && lv <= w_max);
      const is_stem = in_leaf && (lv === 0);
      const pat = in_leaf ? (is_stem ? 45 : 230) : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 45) { // Grass Blades Lawn
      const u = posMod(tx, 16) - 8, v = posMod(ty, 32);
      const curve = Math.floor(((32 - v) * (32 - v)) / 160);
      const du = Math.abs(u - curve);
      const w_blade = Math.floor(((32 - v) * 3) / 32);
      const pat = (du <= w_blade) ? Math.max(35, 245 - v * 3) : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 46) { // Butterfly Wings Motif
      const u = Math.abs(posMod(tx, 40) - 20);
      const v = posMod(ty, 40) - 20;
      const d_up = (u - 10)*(u - 10) + (v + 6)*(v + 6);
      const d_dn = (u - 7)*(u - 7) + (v - 8)*(v - 8);
      const in_wing = (d_up <= 64 || d_dn <= 36 || (u <= 2 && v >= -14 && v <= 14));
      const vein = in_wing && (posMod(u * 3 + v * 2, 7) < 2);
      const pat = in_wing ? (vein ? 65 : 240) : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 47) { // Mystic Surreal Eyes
      const u = posMod(tx, 48) - 24, v = posMod(ty, 32) - 16;
      const v_abs = Math.abs(v);
      const v_bound = Math.max(0, 12 - Math.floor((u * u) / 48));
      const in_eye = (v_abs <= v_bound);
      const d2 = u * u + v * v;
      const is_pupil = (d2 <= 12);
      const is_iris = (d2 <= 56);
      const is_lid = (v_abs >= v_bound - 2 && v_abs <= v_bound + 1);
      const pat = is_pupil ? 25 : (is_iris ? 230 : (in_eye ? 180 : (is_lid ? 245 : 30)));
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 48) { // Steampunk Gears / Cogs
      const u = posMod(tx, 36) - 18, v = posMod(ty, 36) - 18;
      const r = Math.round(Math.sqrt(u * u + v * v));
      const ang = Math.round(((Math.atan2(v, u) * 180 / Math.PI) + 360) % 360);
      const cog = (posMod(Math.floor((ang * 8) / 360), 2) === 0);
      const r_max = cog ? 15 : 12;
      const in_gear = (r <= r_max && r >= 5);
      const is_hole = (r <= 4);
      const pat = is_hole ? 30 : (in_gear ? 240 : 40);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 49) { // Kitty Silhouettes & Paw Prints
      const u = posMod(tx, 36), v = posMod(ty, 36);
      const d_main = (u - 18)*(u - 18) + (v - 22)*(v - 22);
      const d1 = (u - 11)*(u - 11) + (v - 11)*(v - 11);
      const d2 = (u - 15)*(u - 15) + (v - 8)*(v - 8);
      const d3 = (u - 21)*(u - 21) + (v - 8)*(v - 8);
      const d4 = (u - 25)*(u - 25) + (v - 11)*(v - 11);
      const is_paw = (d_main <= 49 || d1 <= 9 || d2 <= 9 || d3 <= 9 || d4 <= 9);
      const pat = is_paw ? 245 : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 50) { // Dragon / Reptile Armor Scales
      const row = posDiv(ty, 16);
      const off = (posMod(row, 2) === 0) ? 0 : 12;
      const u = posMod(tx + off, 24) - 12, v = posMod(ty, 16);
      const d = Math.round(Math.sqrt(u * u + (v - 16) * (v - 16)));
      const pat = (d <= 14 && d >= 11) ? 255 : (d < 11 ? Math.min(255, 150 + v * 6) : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 51) { // Starry Cosmos & Constellations
      const u = Math.abs(posMod(tx, 40) - 20);
      const v = Math.abs(posMod(ty, 40) - 20);
      const is_star = (u * v <= 6 && (u + v <= 16));
      const is_tiny = (u === 8 && v === 10) || (u === 12 && v === 12);
      const neb = (((tx * 31 + ty * 67) ^ (tx * ty * 7)) >>> 0) & 0x3F;
      const pat = is_star ? 255 : (is_tiny ? 230 : (35 + neb));
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 52) { // Sci-Fi Cyber Hex Tech
      const u = posMod(Math.floor((tx * 866 + ty * 500) / 1000), 16);
      const v = posMod(Math.floor((-tx * 866 + ty * 500) / 1000), 16);
      const is_border = (u <= 2 || u >= 14 || v <= 2 || v >= 14);
      const is_node = (u >= 7 && u <= 9 && v >= 7 && v <= 9);
      const pat = is_node ? 255 : (is_border ? 210 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 53) { // Bubble & Soap Foam Clusters
      const c1x = posMod(tx, 28) - 14, c1y = posMod(ty, 28) - 14;
      const d1 = Math.round(Math.sqrt(c1x * c1x + c1y * c1y));
      const c2x = posMod(tx + 14, 20) - 10, c2y = posMod(ty + 10, 20) - 10;
      const d2 = Math.round(Math.sqrt(c2x * c2x + c2y * c2y));
      const is_wall = (d1 >= 11 && d1 <= 13) || (d2 >= 8 && d2 <= 9);
      const is_glint = (d1 < 11 && c1x <= -5 && c1y <= -5);
      const pat = is_glint ? 255 : (is_wall ? 235 : (d1 < 11 ? 120 : 35));
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 54) { // Celtic Knot Interlaced Ribbons
      const u = posMod(tx, 24), v = posMod(ty, 24);
      const b1 = posMod(u + v, 12);
      const b2 = posMod(u - v + 24, 12);
      const s1 = (b1 >= 4 && b1 <= 8);
      const s2 = (b2 >= 4 && b2 <= 8);
      const over = (posDiv(u, 12) ^ posDiv(v, 12));
      const pat = (s1 && s2) ? (over ? (b1 === 4 || b1 === 8 ? 40 : 240) : (b2 === 4 || b2 === 8 ? 40 : 240)) : ((s1 || s2) ? 230 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 55) { // Skulls & Crossbones Motif
      const u = posMod(tx, 36) - 18, v = posMod(ty, 36) - 18;
      const d_head = u * u + (v + 4) * (v + 4);
      const in_jaw = (u >= -5 && u <= 5 && v >= 4 && v <= 10);
      const in_head = (d_head <= 81) || in_jaw;
      const in_eye1 = (u + 4) * (u + 4) + (v + 2) * (v + 2) <= 6;
      const in_eye2 = (u - 4) * (u - 4) + (v + 2) * (v + 2) <= 6;
      const in_nose = (u * u + (v - 3) * (v - 3) <= 2);
      const pat = (in_eye1 || in_eye2 || in_nose) ? 25 : (in_head ? 245 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 56) { // Hearts & Sweet Cupid Motif
      const u = posMod(tx, 32) - 16, v = posMod(ty, 32) - 14;
      const u_abs = Math.abs(u);
      const top_y = Math.round(Math.sqrt(u_abs * 6));
      const d2 = u * u + (v - top_y) * (v - top_y);
      const in_heart = (d2 <= 64 && v <= 12);
      const glint = in_heart && (u >= -8 && u <= -4 && v >= -4 && v <= 0);
      const pat = glint ? 255 : (in_heart ? 235 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 57) { // Traditional Japanese Waves (Seigaiha)
      const row = posDiv(ty, 12);
      const off = (posMod(row, 2) === 0) ? 0 : 16;
      const u = posMod(tx + off, 32) - 16, v = posMod(ty, 12);
      const d = Math.round(Math.sqrt(u * u + (v - 12) * (v - 12)));
      const is_arch = (d <= 20 && posMod(d, 4) < 2);
      const pat = is_arch ? 245 : 45;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 58) { // Musical Notation & Staff
      const u = posMod(tx, 40), v = posMod(ty, 32);
      const is_staff = (v === 8 || v === 12 || v === 16 || v === 20 || v === 24);
      const n1 = (u - 14)*(u - 14) + (v - 20)*(v - 20) <= 12;
      const s1 = (u === 17 && v >= 6 && v <= 20);
      const n2 = (u - 28)*(u - 28) + (v - 16)*(v - 16) <= 12;
      const s2 = (u === 31 && v >= 2 && v <= 16);
      const beam = (u >= 17 && u <= 31 && v >= 2 && v <= 5);
      const is_note = n1 || s1 || n2 || s2 || beam;
      const pat = (is_note || is_staff) ? 245 : 40;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 59) { // Classic Houndstooth (Pied-de-Poule)
      const u = posMod(tx, 16), v = posMod(ty, 16);
      const q1 = (u < 8 && v < 8);
      const q4 = (u >= 8 && v >= 8);
      const teeth = (u + v >= 8 && u + v <= 16 && (u < 8 ^ v < 8));
      const is_ht = q1 || q4 || teeth;
      const pat = is_ht ? 245 : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 60) { // Bird Feathers & Plumage
      const u = posMod(tx, 20) - 10, v = posMod(ty, 40);
      const u_abs = Math.abs(u);
      const spine = (u_abs === 0);
      const barb = (posMod(v - u_abs * 2, 5) < 2 && u_abs <= 9);
      const pat = spine ? 255 : (barb ? 220 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 61) { // Interlinked Chainmail Armor
      const row = posDiv(ty, 8);
      const off = (posMod(row, 2) === 0) ? 0 : 8;
      const u = posMod(tx + off, 16) - 8, v = posMod(ty, 8) - 4;
      const d = Math.round(Math.sqrt(u * u + v * v * 3));
      const ring = (d >= 5 && d <= 8);
      const pat = ring ? 240 : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 62) { // Vintage Damask & Floral Paisley
      const u = posMod(tx, 36) - 18, v = posMod(ty, 36) - 18;
      const r = Math.round(Math.sqrt(u * u + v * v));
      const ang = Math.round(((Math.atan2(v, u) * 180 / Math.PI) + 360) % 360);
      const swirl = posMod(r * 8 - Math.floor(ang / 15), 24) < 8;
      const pat = swirl ? 235 : 45;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 63) { // Argyle Diamond Plaid
      const u = Math.abs(posMod(tx, 32) - 16);
      const v = Math.abs(posMod(ty, 48) - 24);
      const d_val = u * 3 + v * 2;
      const is_diamond = (d_val <= 48);
      const is_stitch = (posMod(u * 3 + v * 2, 8) < 4 && d_val >= 46 && d_val <= 50);
      const pat = is_stitch ? 255 : (is_diamond ? 210 : 50);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 64) { // Masonry Brick Wall & Mortar
      const row = posDiv(ty, 12);
      const off = (posMod(row, 2) === 0) ? 0 : 16;
      const u = posMod(tx + off, 32), v = posMod(ty, 12);
      const is_mortar = (u < 2 || v < 2);
      const b_noise = (((tx * 13 + ty * 29) ^ (tx * 7)) >>> 0) & 0x1F;
      const pat = is_mortar ? 40 : (180 + b_noise);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 65) { // Liquid Molten Magma / Lava
      const n1 = (((tx * 179 + ty * 313) ^ (tx * ty * 7)) >>> 0) & 0xFF;
      const w1 = posMod(tx * 3 + ty * 2 + (n1 >> 2), 48);
      const fissure = Math.abs(w1 - 24);
      const pat = (fissure <= 4) ? 255 : (fissure <= 10 ? 190 : 35);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 66) { // Geometric Labyrinth Maze
      const u = posMod(tx, 24), v = posMod(ty, 24);
      const wall = (u === 0 || v === 0 || (u >= 6 && u <= 18 && (v === 6 || v === 18)) || (u === 12 && v >= 6 && v <= 14));
      const pat = wall ? 245 : 35;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 67) { // Lightning Electric Arcs
      const jag = posMod(ty * 13, 17);
      const bolt = posMod(tx + jag - 24, 48);
      const pat = (bolt <= 2) ? 255 : (bolt <= 5 ? 140 : 25);
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 68) { // Radial Spiderweb
      const u = posMod(tx, 48) - 24, v = posMod(ty, 48) - 24;
      const r = Math.round(Math.sqrt(u * u + v * v));
      const u_abs = Math.abs(u), v_abs = Math.abs(v);
      const ring = (posMod(r, 8) <= 1 && r <= 24);
      const spoke = (u === 0 || v === 0 || u_abs === v_abs) && (r <= 24);
      const pat = (ring || spoke) ? 245 : 30;
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 69) { // Crystal Facets / Gemstones
      const cx = posMod(tx, 24) - 12, cy = posMod(ty, 24) - 12;
      const cx_abs = Math.abs(cx), cy_abs = Math.abs(cy);
      const diff = Math.abs(cx_abs - cy_abs);
      const is_edge = (diff <= 1 || cx_abs === 11 || cy_abs === 11);
      const pat = is_edge ? 30 : Math.max(0, Math.min(255, 175 + cx * 4 - cy * 3));
      modA = Math.round((baseA * pat) / 255);
    } else if (mode === 70) { // 8-Bit Space Pixel Invaders
      const bx = posDiv(posMod(tx, 24), 3);
      const by = posDiv(posMod(ty, 24), 3);
      const sym_x = bx > 3 ? (7 - bx) : bx;
      const sprite = [0x00, 0x04, 0x02, 0x07, 0x0D, 0x0F, 0x0A, 0x05];
      const is_pixel = (sprite[by & 7] & (1 << sym_x)) !== 0;
      const pat = is_pixel ? 245 : 30;
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

  function sampleCustomTexture(buffer, bufW, bufH, x, y, texAngle = 0, texScale = 100, texContrast = 100, baseA = 255) {
    if (!buffer || bufW <= 0 || bufH <= 0 || baseA === 0) return baseA;
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

    const u = ((tx % bufW) + bufW) % bufW;
    const v = ((ty % bufH) + bufH) % bufH;
    const pix = buffer[v * bufW + u];
    // ARGB:
    const a = (pix >>> 24) & 0xFF;
    const r = (pix >>> 16) & 0xFF;
    const g = (pix >>> 8) & 0xFF;
    const b = pix & 0xFF;
    const lum = Math.round((r * 0.299 + g * 0.587 + b * 0.114) * (a / 255));
    
    let modA = Math.round((baseA * lum) / 255);
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

  function lerpArgb(c1, c2, factor) {
    if (factor <= 0) return c1;
    if (factor >= 1) return c2;
    const a1 = (c1 >>> 24) & 0xFF, r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF;
    const a2 = (c2 >>> 24) & 0xFF, r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF;
    const a = Math.round(a1 + (a2 - a1) * factor);
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  class WasmFilterRunner {
    constructor() {
      this.instances = new Map();
    }

    getOrInstantiatePlugin(name, doc = null) {
      if (this.instances.has(name)) {
        return this.instances.get(name);
      }

      let bytes = null;
      if (doc && doc.wasmPlugins && doc.wasmPlugins.has(name)) {
        bytes = doc.wasmPlugins.get(name);
      } else if (SvgEngine && SvgEngine.wasmPlugins && SvgEngine.wasmPlugins.has(name)) {
        bytes = SvgEngine.wasmPlugins.get(name);
      } else if (typeof require !== 'undefined') {
        try {
          const fs = require('fs');
          const path = require('path');
          const pluginPath = path.resolve(__dirname, '../../plugins', `${name}.wasm`);
          if (fs.existsSync(pluginPath)) {
            bytes = fs.readFileSync(pluginPath);
          }
        } catch (e) {}
      }

      if (!bytes) return null;

      try {
        const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
        const wasmMod = new WebAssembly.Module(u8);
        const instance = new WebAssembly.Instance(wasmMod, { env: {} });
        const entry = {
          instance,
          exports: instance.exports,
          memory: instance.exports.memory,
          bytes: u8
        };
        this.instances.set(name, entry);
        return entry;
      } catch (err) {
        console.warn(`Failed to instantiate WASM plugin "${name}":`, err);
        return null;
      }
    }

    applyFilter(name, pixelBuffer32, width, height, p1 = 0, p2 = 0, doc = null) {
      if (!name || width <= 0 || height <= 0 || !pixelBuffer32 || pixelBuffer32.length === 0) return false;
      const plugin = this.getOrInstantiatePlugin(name, doc);
      if (!plugin || typeof plugin.exports.w_filter_apply !== 'function') return false;

      const byteLen = width * height * 4;
      // Multi-buffer filters (bloom, blur, emboss, kuwahara, etc.) allocate 3-6x scratch buffers following the layer
      const requiredMem = 65536 + byteLen * 8 + 65536;
      if (plugin.memory.buffer.byteLength < requiredMem) {
        const currentBytes = plugin.memory.buffer.byteLength;
        const pagesNeeded = Math.ceil((requiredMem - currentBytes) / 65536);
        if (pagesNeeded > 0) {
          plugin.memory.grow(pagesNeeded);
        }
      }

      const layerPtr = 65536;
      new Uint8Array(plugin.memory.buffer, layerPtr, byteLen)
        .set(new Uint8Array(pixelBuffer32.buffer, pixelBuffer32.byteOffset, byteLen));

      if (typeof plugin.exports.w_set_layer === 'function') {
        plugin.exports.w_set_layer(layerPtr, width, height);
      }

      try {
        plugin.exports.w_filter_apply(p1, p2);
      } catch (err) {
        console.warn(`Filter plugin "${name}" execution error:`, err);
        return false;
      }

      pixelBuffer32.set(new Uint32Array(plugin.memory.buffer, layerPtr, width * height));
      return true;
    }
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
      this.filterRunner = new WasmFilterRunner();
      this.customTextureCache = new Map();
    }

    setActor(actor) {
      this.actor = actor;
    }

    registerCustomTexture(id, buffer, width, height) {
      if (!id) return;
      this.customTextureCache.set(id, { pixels: buffer, width: width || 256, height: height || 256 });
    }

    sampleCustomTexture(buffer, bufW, bufH, x, y, texAngle = 0, texScale = 100, texContrast = 100, baseA = 255) {
      return sampleCustomTexture(buffer, bufW, bufH, x, y, texAngle, texScale, texContrast, baseA);
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

      this.currentDoc = doc;
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
      const pixPtr = this.actor.exports.w_layer_get_pixels(3);
      if (pixPtr && this.actor.memory) {
        const u32 = new Uint32Array(this.actor.memory.buffer, pixPtr, w * h);
        if (options.background !== false && doc.backgroundColor && doc.backgroundColor !== 'none') {
          const bgArgb = parseCssColorToArgb(doc.backgroundColor, 1.0);
          u32.fill(bgArgb);
        } else {
          u32.fill(0); // clear to transparent
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
     * Generate an alpha mask buffer for a clipping mask object
     */
    generateMaskAlpha(maskObj, scale, lw, lh, parentMatrix = null) {
      const maskAlpha = new Uint8Array(lw * lh);
      const localM = getNodeLocalMatrix(maskObj);
      const maskMatrix = parentMatrix ? multiplyMatrix(parentMatrix, localM) : localM;

      if (typeof document !== 'undefined' && document.createElement) {
        const off = document.createElement('canvas');
        off.width = lw;
        off.height = lh;
        const ctx = off.getContext('2d');
        if (!ctx) return maskAlpha;

        ctx.save();
        if (!isIdentityMatrix(maskMatrix)) {
          ctx.transform(maskMatrix[0], maskMatrix[1], maskMatrix[2], maskMatrix[3], maskMatrix[4] * scale, maskMatrix[5] * scale);
        }

        ctx.fillStyle = '#ffffff';
        let pathObj = maskObj;
        if (typeof maskObj.toPath === 'function') {
          pathObj = maskObj.toPath();
        }

        if (pathObj.toPolylines) {
          const polylines = pathObj.toPolylines(0.4);
          ctx.beginPath();
          for (const poly of polylines) {
            if (!poly || poly.length < 2) continue;
            ctx.moveTo(poly[0].x * scale, poly[0].y * scale);
            for (let i = 1; i < poly.length; i++) {
              ctx.lineTo(poly[i].x * scale, poly[i].y * scale);
            }
            ctx.closePath();
          }
          ctx.fill(pathObj.fillRule || 'evenodd');
        } else if (pathObj.toPolyline) {
          const poly = pathObj.toPolyline(0.4);
          if (poly.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(poly[0].x * scale, poly[0].y * scale);
            for (let i = 1; i < poly.length; i++) {
              ctx.lineTo(poly[i].x * scale, poly[i].y * scale);
            }
            ctx.closePath();
            ctx.fill();
          }
        } else if (maskObj.type === 'rect') {
          ctx.fillRect(maskObj.x * scale, maskObj.y * scale, maskObj.width * scale, maskObj.height * scale);
        } else if (maskObj.type === 'circle') {
          ctx.beginPath();
          ctx.arc(maskObj.cx * scale, maskObj.cy * scale, (maskObj.r || maskObj.rx) * scale, 0, Math.PI * 2);
          ctx.fill();
        } else if (maskObj.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(maskObj.cx * scale, maskObj.cy * scale, maskObj.rx * scale, maskObj.ry * scale, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        const imgData = ctx.getImageData(0, 0, lw, lh);
        const d = imgData.data;
        for (let i = 0; i < lw * lh; i++) {
          maskAlpha[i] = d[i * 4 + 3];
        }
      } else {
        let pathObj = maskObj;
        if (typeof maskObj.toPath === 'function') pathObj = maskObj.toPath();
        const rawPolys = pathObj.toPolylines ? pathObj.toPolylines(0.5) : (pathObj.toPolyline ? [pathObj.toPolyline(0.5)] : []);
        const transformPoly = (poly) => isIdentityMatrix(maskMatrix) ? poly : poly.map(p => transformPoint(maskMatrix, p));
        const polylines = rawPolys.map(transformPoly);
        for (const poly of polylines) {
          if (!poly || poly.length < 3) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of poly) {
            minX = Math.min(minX, p.x * scale);
            maxX = Math.max(maxX, p.x * scale);
            minY = Math.min(minY, p.y * scale);
            maxY = Math.max(maxY, p.y * scale);
          }
          for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(lh - 1, Math.ceil(maxY)); y++) {
            for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(lw - 1, Math.ceil(maxX)); x++) {
              maskAlpha[y * lw + x] = 255;
            }
          }
        }
      }
      return maskAlpha;
    }

    /**
     * Render a single SvgNode into Quadro
     */
    renderObject(obj, scale = 1.0, parentOpacity = 1.0, parentMatrix = null) {
      if (!obj.visible) return;

      const totalOpacity = (obj.opacity !== undefined ? obj.opacity : 1.0) * parentOpacity;
      if (totalOpacity <= 0.001) return;

      if (obj.type === 'group') {
        const localM = getNodeLocalMatrix(obj);
        const groupMatrix = parentMatrix ? multiplyMatrix(parentMatrix, localM) : localM;
        for (const child of obj.children) {
          this.renderObject(child, scale, totalOpacity, groupMatrix);
        }
        return;
      }

      // Check if this object is clipped by a clipping mask (<clipPath>)
      const maskObj = obj.clipPathId && this.currentDoc ? this.currentDoc.findObject(obj.clipPathId) : null;
      if (maskObj) {
        const exp = this.actor.exports;
        const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
        const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
        const pixPtr = exp.w_layer_get_pixels(3);
        if (pixPtr && this.actor.memory) {
          const pixels = new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh);
          const savedBuffer = new Uint32Array(pixels.length);
          savedBuffer.set(pixels);

          const maskAlpha = this.generateMaskAlpha(maskObj, scale, lw, lh, parentMatrix);
          this.renderObjectDirect(obj, scale, totalOpacity, parentMatrix);

          for (let i = 0; i < lw * lh; i++) {
            const m = maskAlpha[i];
            if (m === 0) {
              pixels[i] = savedBuffer[i];
            } else if (m < 255) {
              const alphaFactor = m / 255;
              const colRendered = pixels[i];
              const colSaved = savedBuffer[i];
              const aR = (colRendered >>> 24) & 0xFF, rR = colRendered & 0xFF, gR = (colRendered >> 8) & 0xFF, bR = (colRendered >> 16) & 0xFF;
              const aS = (colSaved >>> 24) & 0xFF, rS = colSaved & 0xFF, gS = (colSaved >> 8) & 0xFF, bS = (colSaved >> 16) & 0xFF;
              const a = Math.round(aS + (aR - aS) * alphaFactor);
              const r = Math.round(rS + (rR - rS) * alphaFactor);
              const g = Math.round(gS + (gR - gS) * alphaFactor);
              const b = Math.round(bS + (bR - bS) * alphaFactor);
              pixels[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
            }
          }
          return;
        }
      }

      this.renderObjectDirect(obj, scale, totalOpacity, parentMatrix);
    }

    renderObjectDirect(obj, scale = 1.0, totalOpacity = 1.0, parentMatrix = null) {
      if (!obj.visible) return;

      const localM = getNodeLocalMatrix(obj);
      const totalMatrix = parentMatrix ? multiplyMatrix(parentMatrix, localM) : localM;

      // Handle Text with dedicated canvas rasterization unless custom brush dynamics/textures/WASM filters are applied
      if (obj.type === 'text') {
        const hasCustomBrush = (obj.brushType && obj.brushType !== 'pencil') ||
          (obj.brushConfig && (
            (obj.brushConfig.preset && obj.brushConfig.preset !== 'round') ||
            (obj.brushConfig.scatter && obj.brushConfig.scatter > 0) ||
            (obj.brushConfig.grain && obj.brushConfig.grain > 0) ||
            (obj.brushConfig.smudge && obj.brushConfig.smudge > 0) ||
            (obj.brushConfig.dabBlend && obj.brushConfig.dabBlend > 0) ||
            (obj.brushConfig.texture_mode && obj.brushConfig.texture_mode > 0) ||
            (obj.brushConfig.size_jitter && obj.brushConfig.size_jitter > 0) ||
            (obj.brushConfig.angle_jitter && obj.brushConfig.angle_jitter > 0) ||
            (obj.brushConfig.opacity_jitter && obj.brushConfig.opacity_jitter > 0)
          ));
        const hasTexture = (obj.fillTexture && obj.fillTexture.enabled) ||
          (obj.strokeTexture && obj.strokeTexture.enabled);
        const hasWasmFilter = obj.wasmFilter && obj.wasmFilter.enabled;

        if (!hasCustomBrush && !hasTexture && !hasWasmFilter) {
          this.renderText(obj, scale, totalOpacity, totalMatrix);
          return;
        }
      }

      // Handle Raster Image
      if (obj.type === 'image') {
        this.renderImage(obj, scale, totalOpacity, totalMatrix);
        return;
      }

      // Convert shape to polyline / compound paths
      let pathObj = obj;
      if (typeof obj.toPath === 'function') {
        pathObj = obj.toPath();
      }

      const bounds = obj.getBounds ? obj.getBounds() : (pathObj.getBounds ? pathObj.getBounds() : null);

      const rawPolys = pathObj.toPolylines ? pathObj.toPolylines(0.5) : (pathObj.toPolyline ? [pathObj.toPolyline(0.5)] : []);
      const transformPoly = (poly) => isIdentityMatrix(totalMatrix) ? poly : poly.map(p => transformPoint(totalMatrix, p));
      const transformPolys = (polys) => isIdentityMatrix(totalMatrix) ? polys : polys.map(transformPoly);
      const rotatedPolys = transformPolys(rawPolys);

      // Check Non-Destructive WASM Filter Plugins (Separate for Fill/Lens and Stroke)
      const effFillFilter = (obj.fillFilter && obj.fillFilter.enabled && obj.fillFilter.plugin) ? obj.fillFilter : (obj.fillTexture?.wasmFilter?.enabled ? obj.fillTexture.wasmFilter : (obj.wasmFilter?.enabled && (obj.wasmFilter.target === 'fill' || obj.wasmFilter.target === 'backdrop' || !obj.wasmFilter.target) ? obj.wasmFilter : null));
      const effStrokeFilter = (obj.strokeFilter && obj.strokeFilter.enabled && obj.strokeFilter.plugin) ? obj.strokeFilter : (obj.brushConfig?.wasmFilter?.enabled ? obj.brushConfig.wasmFilter : (obj.wasmFilter?.enabled && obj.wasmFilter.target === 'stroke' ? obj.wasmFilter : null));
      const effObjectFilter = (obj.wasmFilter && obj.wasmFilter.enabled && obj.wasmFilter.plugin && obj.wasmFilter.target === 'object') ? obj.wasmFilter : null;

      const exp = this.actor.exports;
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
      const pixPtr = exp.w_layer_get_pixels(3);
      const pixels = (pixPtr && this.actor.memory) ? new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh) : null;

      let bMinX = 0, bMinY = 0, bMaxX = lw - 1, bMaxY = lh - 1;
      if (bounds) {
        const pts = [
          transformPoint(totalMatrix, { x: bounds.minX, y: bounds.minY }),
          transformPoint(totalMatrix, { x: bounds.maxX, y: bounds.minY }),
          transformPoint(totalMatrix, { x: bounds.maxX, y: bounds.maxY }),
          transformPoint(totalMatrix, { x: bounds.minX, y: bounds.maxY })
        ];
        bMinX = Math.min(...pts.map(p => p.x));
        bMaxX = Math.max(...pts.map(p => p.x));
        bMinY = Math.min(...pts.map(p => p.y));
        bMaxY = Math.max(...pts.map(p => p.y));
      }
      const pad = Math.ceil(Math.max(obj.strokeWidth || 2, 8) * scale);
      const bx0 = Math.max(0, Math.min(lw - 1, Math.floor(bMinX * scale - pad)));
      const by0 = Math.max(0, Math.min(lh - 1, Math.floor(bMinY * scale - pad)));
      const bx1 = Math.min(lw - 1, Math.max(0, Math.ceil(bMaxX * scale + pad)));
      const by1 = Math.min(lh - 1, Math.max(0, Math.ceil(bMaxY * scale + pad)));
      const bw = (bx1 >= bx0) ? (bx1 - bx0 + 1) : 0;
      const bh = (by1 >= by0) ? (by1 - by0 + 1) : 0;

      const hasFill = (obj.fill && obj.fill !== 'none') || (obj.fillType && obj.fillType !== 'solid');
      const hasStroke = obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0;

      if (effObjectFilter && pixels && bw > 0 && bh > 0) {
        const savedBuf = new Uint32Array(bw * bh);
        for (let y = 0; y < bh; y++) {
          const srcRow = (by0 + y) * lw + bx0;
          const dstRow = y * bw;
          for (let x = 0; x < bw; x++) {
            savedBuf[dstRow + x] = pixels[srcRow + x];
            pixels[srcRow + x] = 0;
          }
        }
        if (hasFill) this._renderObjectFillOnly(obj, pathObj, rotatedPolys, bounds, scale, totalOpacity);
        if (hasStroke) this._renderObjectStrokeOnly(obj, pathObj, rotatedPolys, scale, totalOpacity);

        const objBuf = new Uint32Array(bw * bh);
        for (let y = 0; y < bh; y++) {
          const srcRow = (by0 + y) * lw + bx0;
          const dstRow = y * bw;
          for (let x = 0; x < bw; x++) {
            objBuf[dstRow + x] = pixels[srcRow + x];
            pixels[srcRow + x] = savedBuf[dstRow + x];
          }
        }

        this.filterRunner.applyFilter(effObjectFilter.plugin, objBuf, bw, bh, Number(effObjectFilter.p1 || 0), Number(effObjectFilter.p2 || 0), this.currentDoc);
        const filterOpacity = effObjectFilter.opacity !== undefined ? Number(effObjectFilter.opacity) : 1.0;

        for (let y = 0; y < bh; y++) {
          const destRow = (by0 + y) * lw + bx0;
          const srcRow = y * bw;
          for (let x = 0; x < bw; x++) {
            let col = objBuf[srcRow + x];
            let a = (col >>> 24) & 0xFF;
            if (a > 0) {
              if (filterOpacity < 1.0) {
                a = Math.round(a * filterOpacity);
                col = ((a << 24) | (col & 0x00FFFFFF)) >>> 0;
              }
              pixels[destRow + x] = this.blendFast(col, pixels[destRow + x]);
            }
          }
        }
        return;
      }

      // 1. Render Fill / Lens Pass
      if (effFillFilter && pixels && bw > 0 && bh > 0) {
        const target = effFillFilter.target || 'fill';
        const p1 = Number(effFillFilter.p1 || 0);
        const p2 = Number(effFillFilter.p2 || 0);
        const filterOpacity = effFillFilter.opacity !== undefined ? Number(effFillFilter.opacity) : 1.0;

        if (target === 'backdrop') {
          const lensBuf = new Uint32Array(bw * bh);
          for (let y = 0; y < bh; y++) {
            const srcRow = (by0 + y) * lw + bx0;
            const dstRow = y * bw;
            for (let x = 0; x < bw; x++) {
              lensBuf[dstRow + x] = pixels[srcRow + x];
            }
          }

          this.filterRunner.applyFilter(effFillFilter.plugin, lensBuf, bw, bh, p1, p2, this.currentDoc);
          const shapeMask = this.rasterizeLocalShapeMask(pathObj, scale, bx0, by0, bw, bh, totalMatrix, rotatedPolys);

          for (let y = 0; y < bh; y++) {
            const destRow = (by0 + y) * lw + bx0;
            const srcRow = y * bw;
            for (let x = 0; x < bw; x++) {
              const m = shapeMask[srcRow + x];
              if (m > 0) {
                const orig = pixels[destRow + x];
                const filt = lensBuf[srcRow + x];
                const effectiveAlpha = (m / 255) * filterOpacity * totalOpacity;
                pixels[destRow + x] = lerpArgb(orig, filt, effectiveAlpha);
              }
            }
          }

          if (hasFill && obj.fillOpacity > 0) {
            this._renderObjectFillOnly(obj, pathObj, rotatedPolys, bounds, scale, totalOpacity);
          }
        } else {
          if (hasFill) {
            const savedBuf = new Uint32Array(bw * bh);
            for (let y = 0; y < bh; y++) {
              const srcRow = (by0 + y) * lw + bx0;
              const dstRow = y * bw;
              for (let x = 0; x < bw; x++) {
                savedBuf[dstRow + x] = pixels[srcRow + x];
                pixels[srcRow + x] = 0;
              }
            }

            this._renderObjectFillOnly(obj, pathObj, rotatedPolys, bounds, scale, totalOpacity);

            const fillBuf = new Uint32Array(bw * bh);
            for (let y = 0; y < bh; y++) {
              const srcRow = (by0 + y) * lw + bx0;
              const dstRow = y * bw;
              for (let x = 0; x < bw; x++) {
                fillBuf[dstRow + x] = pixels[srcRow + x];
                pixels[srcRow + x] = savedBuf[dstRow + x];
              }
            }

            this.filterRunner.applyFilter(effFillFilter.plugin, fillBuf, bw, bh, p1, p2, this.currentDoc);

            for (let y = 0; y < bh; y++) {
              const destRow = (by0 + y) * lw + bx0;
              const srcRow = y * bw;
              for (let x = 0; x < bw; x++) {
                let col = fillBuf[srcRow + x];
                let a = (col >>> 24) & 0xFF;
                if (a > 0) {
                  if (filterOpacity < 1.0) {
                    a = Math.round(a * filterOpacity);
                    col = ((a << 24) | (col & 0x00FFFFFF)) >>> 0;
                  }
                  pixels[destRow + x] = this.blendFast(col, pixels[destRow + x]);
                }
              }
            }
          }
        }
      } else {
        this._renderObjectFillOnly(obj, pathObj, rotatedPolys, bounds, scale, totalOpacity);
      }

      // 2. Render Stroke Pass
      if (effStrokeFilter && pixels && bw > 0 && bh > 0) {
        const p1 = Number(effStrokeFilter.p1 || 0);
        const p2 = Number(effStrokeFilter.p2 || 0);
        const filterOpacity = effStrokeFilter.opacity !== undefined ? Number(effStrokeFilter.opacity) : 1.0;

        if (hasStroke) {
          const savedBuf = new Uint32Array(bw * bh);
          for (let y = 0; y < bh; y++) {
            const srcRow = (by0 + y) * lw + bx0;
            const dstRow = y * bw;
            for (let x = 0; x < bw; x++) {
              savedBuf[dstRow + x] = pixels[srcRow + x];
              pixels[srcRow + x] = 0;
            }
          }

          this._renderObjectStrokeOnly(obj, pathObj, rotatedPolys, scale, totalOpacity);

          const strokeBuf = new Uint32Array(bw * bh);
          for (let y = 0; y < bh; y++) {
            const srcRow = (by0 + y) * lw + bx0;
            const dstRow = y * bw;
            for (let x = 0; x < bw; x++) {
              strokeBuf[dstRow + x] = pixels[srcRow + x];
              pixels[srcRow + x] = savedBuf[dstRow + x];
            }
          }

          this.filterRunner.applyFilter(effStrokeFilter.plugin, strokeBuf, bw, bh, p1, p2, this.currentDoc);

          for (let y = 0; y < bh; y++) {
            const destRow = (by0 + y) * lw + bx0;
            const srcRow = y * bw;
            for (let x = 0; x < bw; x++) {
              let col = strokeBuf[srcRow + x];
              let a = (col >>> 24) & 0xFF;
              if (a > 0) {
                if (filterOpacity < 1.0) {
                  a = Math.round(a * filterOpacity);
                  col = ((a << 24) | (col & 0x00FFFFFF)) >>> 0;
                }
                pixels[destRow + x] = this.blendFast(col, pixels[destRow + x]);
              }
            }
          }
        }
      } else {
        this._renderObjectStrokeOnly(obj, pathObj, rotatedPolys, scale, totalOpacity);
      }
    }

    _renderObjectFillOnly(obj, pathObj, rotatedPolys, bounds, scale, totalOpacity) {
      const isBrushFill = obj.fillType === 'brush' || (obj.brushFill && obj.brushFill.enabled);
      const hasFill = (obj.fill && obj.fill !== 'none') || (obj.fillType && obj.fillType !== 'solid') || isBrushFill;
      if (!hasFill) return;

      const fillAlpha = (obj.fillOpacity !== undefined ? obj.fillOpacity : 1.0) * totalOpacity;
      const fillArgb = parseCssColorToArgb(obj.fill, fillAlpha);
      const gradient = (obj.fillType === 'linear' || obj.fillType === 'radial') ? obj.fillGradient : null;

      // 1. Procedural Brush Fill / Multi-Stroke Hatching
      if (isBrushFill && rotatedPolys && rotatedPolys.length > 0) {
        // If there's a non-empty solid base background under the brush fill, render it first
        if (obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent' && fillAlpha > 0 && obj.fillType !== 'brush') {
          this.fillCompoundPolygons(rotatedPolys, pathObj.fillRule || 'evenodd', fillArgb, scale, obj.fillTexture, gradient, bounds, totalOpacity);
        }

        let Engine = BrushFillEngine || (typeof window !== 'undefined' && (window.BrushFillEngine || (window.esenho && window.esenho.BrushFillEngine))) || (typeof globalThis !== 'undefined' && globalThis.BrushFillEngine);
        if (Engine && Engine.BrushFillEngine) Engine = Engine.BrushFillEngine;
        if (Engine && typeof Engine.generateStrokes === 'function') {
          const brushFillCfg = obj.brushFill || {};
          const strokes = Engine.generateStrokes(rotatedPolys, brushFillCfg);
          for (let sIdx = 0; sIdx < strokes.length; sIdx++) {
            const stroke = strokes[sIdx];
            const strokeA = (stroke.opacity !== undefined ? stroke.opacity : 1.0) * totalOpacity;
            const strokeColor = stroke.color || obj.fill || '#fabd2f';
            const sArgb = parseCssColorToArgb(strokeColor, strokeA);
            if ((sArgb >>> 24) === 0) continue;

            const sWidth = Math.max(1, Math.round((stroke.width || 2) * scale));
            const strokeBrushConfig = (stroke.brushTip && stroke.brushTip.brushConfig) ? stroke.brushTip.brushConfig : {};
            const shapeName = (strokeBrushConfig.shape || (stroke.brushTip && stroke.brushTip.shape)) ? String(strokeBrushConfig.shape || stroke.brushTip.shape).toLowerCase() : 'round';
            const shapeMap = { round: 0, circle: 0, square: 1, ellipse: 2, oval: 2, pencil: 3, charcoal: 4, acrylic: 5, watercolor: 6, chisel: 1, fan: 5, bristle: 5, dry_brush: 4, dagger: 2 };
            const shapeId = typeof strokeBrushConfig.shape === 'number' ? strokeBrushConfig.shape : (shapeMap[shapeName] !== undefined ? shapeMap[shapeName] : 0);

            const bConfig = {
              hardness: stroke.brushTip?.hardness !== undefined ? stroke.brushTip.hardness : (stroke.hardness !== undefined ? stroke.hardness : 95),
              flow: stroke.brushTip?.flow !== undefined ? stroke.brushTip.flow : (stroke.flow !== undefined ? stroke.flow : 100),
              spacing: strokeBrushConfig.spacing || 5,
              shape: shapeId,
              roundness: strokeBrushConfig.roundness !== undefined ? strokeBrushConfig.roundness : 100,
              ...strokeBrushConfig
            };
            const strokeTex = (strokeBrushConfig.texture && strokeBrushConfig.texture !== 'none') ? strokeBrushConfig.texture : obj.strokeTexture;

            if (stroke.type === 'curve' && stroke.cp) {
              // Subdivide quadratic curve into small polyline
              const p0 = stroke.p0;
              const cp = stroke.cp;
              const p1 = stroke.p1;
              const curvePoly = [];
              const steps = 6;
              for (let step = 0; step <= steps; step++) {
                const t = step / steps;
                const it = 1 - t;
                curvePoly.push({
                  x: it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x,
                  y: it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y
                });
              }
              this.strokePolyline(curvePoly, sArgb, sWidth, false, bConfig, strokeTex, scale);
            } else if (stroke.type === 'dot') {
              const dabPt = stroke.p0 || { x: stroke.cx || 0, y: stroke.cy || 0 };
              this.strokePolyline([dabPt], sArgb, Math.max(1, Math.round((stroke.width || 2) * scale)), false, bConfig, strokeTex, scale);
            } else {
              // Standard straight line stroke
              const linePoly = [stroke.p0, stroke.p1];
              this.strokePolyline(linePoly, sArgb, sWidth, false, bConfig, strokeTex, scale);
            }
          }
          return;
        }
      }

      // 2. Standard solid/gradient/texture fill
      if (rotatedPolys && rotatedPolys.length > 0) {
        this.fillCompoundPolygons(rotatedPolys, pathObj.fillRule || 'evenodd', fillArgb, scale, obj.fillTexture, gradient, bounds, totalOpacity);
      }
    }

    _renderObjectStrokeOnly(obj, pathObj, rotatedPolys, scale, totalOpacity) {
      if (!obj.stroke || obj.stroke === 'none' || !(obj.strokeWidth > 0)) return;

      const strokeAlpha = (obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1.0) * totalOpacity;
      const strokeArgb = parseCssColorToArgb(obj.stroke, strokeAlpha);

      if ((strokeArgb >>> 24) > 0 && rotatedPolys && rotatedPolys.length > 0) {
        const strokeWidth = Math.max(1, Math.round(obj.strokeWidth * scale));
        const subPaths = pathObj.subPaths || [];
        for (let i = 0; i < rotatedPolys.length; i++) {
          const poly = rotatedPolys[i];
          if (poly.length >= 2) {
            const closed = subPaths[i] ? subPaths[i].closed : (pathObj.closed !== undefined ? pathObj.closed : true);
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
      }
    }

    /**
     * Rasterize a local 8-bit silhouette mask of a shape into [0..bw-1, 0..bh-1]
     */
    rasterizeLocalShapeMask(pathObj, scale, bx0, by0, bw, bh, totalMatrix = null, rotatedPolys = null) {
      const mask = new Uint8Array(bw * bh);

      if (typeof document !== 'undefined' && document.createElement) {
        const off = document.createElement('canvas');
        off.width = bw;
        off.height = bh;
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.translate(-bx0, -by0);
          if (totalMatrix && !isIdentityMatrix(totalMatrix)) {
            ctx.transform(totalMatrix[0], totalMatrix[1], totalMatrix[2], totalMatrix[3], totalMatrix[4] * scale, totalMatrix[5] * scale);
          }
          ctx.fillStyle = '#ffffff';

          if (pathObj.toPolylines) {
            const polylines = pathObj.toPolylines(0.4);
            ctx.beginPath();
            for (const poly of polylines) {
              if (!poly || poly.length < 2) continue;
              ctx.moveTo(poly[0].x * scale, poly[0].y * scale);
              for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x * scale, poly[i].y * scale);
              }
              ctx.closePath();
            }
            ctx.fill(pathObj.fillRule || 'evenodd');
          } else if (pathObj.toPolyline) {
            const poly = pathObj.toPolyline(0.4);
            if (poly.length >= 2) {
              ctx.beginPath();
              ctx.moveTo(poly[0].x * scale, poly[0].y * scale);
              for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x * scale, poly[i].y * scale);
              }
              ctx.closePath();
              ctx.fill();
            }
          } else if (pathObj.type === 'rect') {
            ctx.fillRect(pathObj.x * scale, pathObj.y * scale, pathObj.width * scale, pathObj.height * scale);
          } else if (pathObj.type === 'circle') {
            ctx.beginPath();
            ctx.arc(pathObj.cx * scale, pathObj.cy * scale, (pathObj.r || pathObj.rx) * scale, 0, Math.PI * 2);
            ctx.fill();
          } else if (pathObj.type === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(pathObj.cx * scale, pathObj.cy * scale, pathObj.rx * scale, pathObj.ry * scale, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

          const imgData = ctx.getImageData(0, 0, bw, bh);
          const d = imgData.data;
          for (let i = 0; i < bw * bh; i++) {
            mask[i] = d[i * 4 + 3];
          }
          return mask;
        }
      }

      // Pure JS scanline fallback (for Node / headless tests)
      const polylines = rotatedPolys || (pathObj.toPolylines ? pathObj.toPolylines(0.5) : (pathObj.toPolyline ? [pathObj.toPolyline(0.5)] : []));
      for (const poly of polylines) {
        if (!poly || poly.length < 3) continue;
        const localPts = poly.map(p => ({
          x: Math.round(p.x * scale) - bx0,
          y: Math.round(p.y * scale) - by0
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
      return mask;
    }

    /**
     * Render Text into Quadro WASM using high-resolution typography rasterization
     */
    renderText(textObj, scale = 1.0, totalOpacity = 1.0, totalMatrix = null) {
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

        // Check if text is attached to a path (<textPath>)
        const pathObj = textObj.pathId ? (this.currentDoc ? this.currentDoc.findObject(textObj.pathId) : null) : null;

        if (pathObj) {
          let pts = null;
          if (typeof pathObj.toPolyline === 'function') {
            pts = pathObj.toPolyline(0.2);
          } else if (typeof pathObj.toPath === 'function') {
            pts = pathObj.toPath().toPolyline(0.2);
          }
          if (pts && pts.length >= 2) {
            if (totalMatrix && !isIdentityMatrix(totalMatrix)) {
              pts = pts.map(p => transformPoint(totalMatrix, p));
            }
            const cumLens = [0];
            let totalLen = 0;
            for (let i = 1; i < pts.length; i++) {
              const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
              totalLen += segLen;
              cumLens.push(totalLen);
            }

            const getPointAndAngle = (dist) => {
              if (dist <= 0) {
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                return { x: pts[0].x, y: pts[0].y, angle: Math.atan2(dy, dx) };
              }
              if (dist >= totalLen) {
                const last = pts.length - 1;
                const dx = pts[last].x - pts[last - 1].x;
                const dy = pts[last].y - pts[last - 1].y;
                return { x: pts[last].x, y: pts[last].y, angle: Math.atan2(dy, dx) };
              }
              for (let i = 1; i < cumLens.length; i++) {
                if (cumLens[i] >= dist) {
                  const segLen = cumLens[i] - cumLens[i - 1];
                  const t = segLen > 0 ? (dist - cumLens[i - 1]) / segLen : 0;
                  const p0 = pts[i - 1];
                  const p1 = pts[i];
                  return {
                    x: p0.x + (p1.x - p0.x) * t,
                    y: p0.y + (p1.y - p0.y) * t,
                    angle: Math.atan2(p1.y - p0.y, p1.x - p0.x)
                  };
                }
              }
              return { x: pts[0].x, y: pts[0].y, angle: 0 };
            };

            const chars = Array.from(textObj.text || '');
            let totalTextW = 0;
            const charWidths = chars.map(ch => {
              const w = (octx.measureText(ch).width / scale) + (Number(textObj.letterSpacing) || 0);
              totalTextW += w;
              return w;
            });

            let curDist = 0;
            if (typeof textObj.startOffset === 'string' && textObj.startOffset.endsWith('%')) {
              curDist = (parseFloat(textObj.startOffset) / 100) * totalLen;
            } else {
              curDist = (Number(textObj.startOffset) || 0);
            }

            if (anchor === 'center' || textObj.textAlign === 'center') {
              curDist -= totalTextW / 2;
            } else if (anchor === 'right' || textObj.textAlign === 'right') {
              curDist -= totalTextW;
            }

            for (let i = 0; i < chars.length; i++) {
              const ch = chars[i];
              const charW = charWidths[i];
              const midDist = curDist + charW / 2;
              const ptAngle = getPointAndAngle(midDist);

              octx.save();
              octx.translate(ptAngle.x * scale, ptAngle.y * scale);
              octx.rotate(ptAngle.angle);
              octx.textAlign = 'center';
              octx.textBaseline = 'alphabetic';

              if (textObj.fill && textObj.fill !== 'none') {
                octx.fillStyle = textObj.fill;
                octx.fillText(ch, 0, 0);
              }
              if (textObj.stroke && textObj.stroke !== 'none' && textObj.strokeWidth > 0) {
                octx.strokeStyle = textObj.stroke;
                octx.lineWidth = textObj.strokeWidth * scale;
                octx.strokeText(ch, 0, 0);
              }
              octx.restore();

              curDist += charW;
            }
          }
        } else {
          octx.save();
          if (totalMatrix && !isIdentityMatrix(totalMatrix)) {
            octx.transform(totalMatrix[0], totalMatrix[1], totalMatrix[2], totalMatrix[3], totalMatrix[4] * scale, totalMatrix[5] * scale);
          } else {
            const origin = (typeof textObj.getOrigin === 'function')
              ? textObj.getOrigin()
              : { x: textObj.x, y: textObj.y };
            
            octx.translate(origin.x * scale, origin.y * scale);
            if (textObj.rotation) {
              octx.rotate((textObj.rotation || 0) * Math.PI / 180);
            }
            if (textObj.scaleX !== undefined || textObj.scaleY !== undefined) {
              octx.scale(textObj.scaleX !== undefined ? textObj.scaleX : 1.0, textObj.scaleY !== undefined ? textObj.scaleY : 1.0);
            }
            if (textObj.skewX || textObj.skewY) {
              const tanX = Math.tan((textObj.skewX || 0) * Math.PI / 180);
              const tanY = Math.tan((textObj.skewY || 0) * Math.PI / 180);
              octx.transform(1, tanY, tanX, 1, 0, 0);
            }
            octx.translate(-origin.x * scale, -origin.y * scale);
          }

          if (textObj.opacity !== undefined) {
            octx.globalAlpha = Math.max(0, Math.min(1, textObj.opacity));
          }

          const tx = textObj.x * scale;
          const ty = textObj.y * scale;
          const lines = String(textObj.text || '').split('\n');
          const lineStep = (textObj.fontSize * (textObj.lineHeight || 1.2)) * scale;

          // Fill Text
          if (textObj.fill && textObj.fill !== 'none') {
            const fillAlpha = textObj.fillOpacity !== undefined ? textObj.fillOpacity : 1.0;
            octx.save();
            octx.globalAlpha *= fillAlpha;
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
            lines.forEach((line, idx) => {
              octx.fillText(line, tx, ty + idx * lineStep);
            });
            octx.restore();
          }

          // Stroke Text
          if (textObj.stroke && textObj.stroke !== 'none' && textObj.strokeWidth > 0) {
            const strokeAlpha = textObj.strokeOpacity !== undefined ? textObj.strokeOpacity : 1.0;
            octx.save();
            octx.globalAlpha *= strokeAlpha;
            octx.strokeStyle = textObj.stroke;
            octx.lineWidth = textObj.strokeWidth * scale;
            if (textObj.strokeDashoffset !== undefined) octx.lineDashOffset = textObj.strokeDashoffset;
            if (textObj.strokeLinecap) octx.lineCap = textObj.strokeLinecap;
            if (textObj.strokeLinejoin) octx.lineJoin = textObj.strokeLinejoin;
            lines.forEach((line, idx) => {
              octx.strokeText(line, tx, ty + idx * lineStep);
            });
            octx.restore();
          }

          octx.restore();
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
          const rawPolys = pathObj.toPolylines(0.5);
          const transformPoly = (poly) => isIdentityMatrix(totalMatrix) ? poly : poly.map(p => transformPoint(totalMatrix, p));
          const polylines = rawPolys.map(transformPoly);
          const fillAlpha = (textObj.fillOpacity !== undefined ? textObj.fillOpacity : 1.0) * totalOpacity;
          const fillArgb = parseCssColorToArgb(textObj.fill || '#fabd2f', fillAlpha);
          this.fillCompoundPolygons(polylines, 'nonzero', fillArgb, scale, textObj.fillTexture, null, textObj.getBounds(), totalOpacity);
        }
      }
    }

    /**
     * Render Image (Raster) into Quadro WASM
     */
    renderImage(imgObj, scale = 1.0, totalOpacity = 1.0, totalMatrix = null) {
      if (!imgObj._imgElement) {
        if (imgObj.src && typeof Image !== 'undefined' && !imgObj._loading) {
          imgObj._loading = true;
          const img = new Image();
          img.onload = () => {
            imgObj._imgElement = img;
            imgObj._loading = false;
            if (typeof window !== 'undefined' && typeof window.renderSvgEditor === 'function') {
              window.renderSvgEditor();
            }
          };
          img.src = imgObj.src;
        }
        return;
      }

      const exp = this.actor.exports;
      const lw = exp.w_layer_get_width ? exp.w_layer_get_width(3) : 800;
      const lh = exp.w_layer_get_height ? exp.w_layer_get_height(3) : 600;
      const pixPtr = exp.w_layer_get_pixels(3);
      if (!pixPtr || !this.actor.memory) return;

      const pixels = new Uint32Array(this.actor.memory.buffer, pixPtr, lw * lh);

      if (typeof document !== 'undefined' && document.createElement) {
        const sx = imgObj.x * scale;
        const sy = imgObj.y * scale;
        const sw = imgObj.width * scale;
        const sh = imgObj.height * scale;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = lw;
        offCanvas.height = lh;
        const octx = offCanvas.getContext('2d');
        if (!octx) return;

        octx.save();
        if (totalMatrix && !isIdentityMatrix(totalMatrix)) {
          octx.transform(totalMatrix[0], totalMatrix[1], totalMatrix[2], totalMatrix[3], totalMatrix[4] * scale, totalMatrix[5] * scale);
        } else {
          const origin = (typeof imgObj.getOrigin === 'function')
            ? imgObj.getOrigin()
            : { x: imgObj.x + imgObj.width / 2, y: imgObj.y + imgObj.height / 2 };
          if (imgObj.rotation && imgObj.rotation !== 0) {
            octx.translate(origin.x * scale, origin.y * scale);
            octx.rotate(imgObj.rotation * Math.PI / 180);
            octx.translate(-origin.x * scale, -origin.y * scale);
          }
        }
        octx.drawImage(imgObj._imgElement, sx, sy, sw, sh);
        octx.restore();

        const imgData = octx.getImageData(0, 0, lw, lh);
        const data32 = new Uint32Array(imgData.data.buffer);
        for (let i = 0; i < lw * lh; i++) {
          const col = data32[i];
          if ((col & 0xFF000000) !== 0) {
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

      let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
      for (const pts of scaledPolys) {
        for (const pt of pts) {
          if (pt.x < bMinX) bMinX = pt.x;
          if (pt.x > bMaxX) bMaxX = pt.x;
          if (pt.y < bMinY) bMinY = pt.y;
          if (pt.y > bMaxY) bMaxY = pt.y;
        }
      }
      if (bMinX === Infinity) { bMinX = 0; bMaxX = lw; bMinY = 0; bMaxY = lh; }

      const baseAlpha = (fillArgb >>> 24) & 0xFF;
      const texMode = fillTexture ? (fillTexture.mode || 0) : 0;
      const texAngle = fillTexture ? (fillTexture.angle || 0) : 0;
      const texScale = Math.round((fillTexture ? (fillTexture.scale || 100) : 100) * scale);
      const texContrast = fillTexture ? (fillTexture.contrast || 100) : 100;
      const texGrain = fillTexture ? (fillTexture.grain || 0) : 0;

      const isRelative = !!(fillTexture && (fillTexture.relative || fillTexture.is_relative || fillTexture.origin === 'object'));
      const offsetX = fillTexture ? (fillTexture.offsetX || fillTexture.offset_x || 0) : 0;
      const offsetY = fillTexture ? (fillTexture.offsetY || fillTexture.offset_y || 0) : 0;
      const warpStrength = fillTexture ? (fillTexture.warpStrength || fillTexture.warp_strength || 0) : 0;
      const warpFreq = fillTexture ? (fillTexture.warpFreq || fillTexture.warp_freq || 20) : 20;
      const noiseDistort = fillTexture ? (fillTexture.noiseDistort || fillTexture.noise_distort || 0) : 0;
      const hardness = fillTexture && fillTexture.hardness !== undefined ? fillTexture.hardness : 100;
      const hardnessIntensity = fillTexture ? (fillTexture.hardnessIntensity !== undefined ? fillTexture.hardnessIntensity : (fillTexture.hardness_intensity !== undefined ? fillTexture.hardness_intensity : (fillTexture.hardnessRadius || 50))) : 50;
      const invert = !!(fillTexture && (fillTexture.invert || fillTexture.invert_tex));
      const blendMode = fillTexture ? (fillTexture.blendMode || fillTexture.blend_mode || fillTexture.blend || 0) : 0;
      const posterize = fillTexture ? (fillTexture.posterize || 0) : 0;
      const pinchSwirl = fillTexture ? (fillTexture.pinchSwirl || fillTexture.pinch_swirl || 0) : 0;

      const cx = (bMinX + bMaxX) * 0.5;
      const cy = (bMinY + bMaxY) * 0.5;
      const maxR = Math.max(1.0, Math.max(bMaxX - bMinX, bMaxY - bMinY) * 0.5);

      const customBuf = fillTexture ? (fillTexture.customBuffer || fillTexture.buffer || (this.customTextureCache && (this.customTextureCache.get(fillTexture.customId || fillTexture.textureId) || this.customTextureCache.get(fillTexture.id)))) : null;
      const customW = fillTexture?.customWidth || customBuf?.width || 256;
      const customH = fillTexture?.customHeight || customBuf?.height || 256;
      const customPixels = customBuf ? (customBuf.pixels || customBuf) : null;

      const allSegments = [];
      const featherW = hardness < 100 ? Math.max(1, ((100 - hardness) * 0.01) * hardnessIntensity) : 0;
      const maxD2 = featherW * featherW;
      if (featherW > 0) {
        for (const pts of scaledPolys) {
          const n = pts.length;
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const p1 = pts[j], p2 = pts[i];
            const vx = p2.x - p1.x, vy = p2.y - p1.y;
            const segLen2 = vx * vx + vy * vy;
            allSegments.push({
              x1: p1.x, y1: p1.y,
              vx, vy, segLen2,
              minY: (p1.y < p2.y ? p1.y : p2.y) - featherW,
              maxY: (p1.y > p2.y ? p1.y : p2.y) + featherW,
              minX: (p1.x < p2.x ? p1.x : p2.x) - featherW,
              maxX: (p1.x > p2.x ? p1.x : p2.x) + featherW
            });
          }
        }
      }

      const nodeX = [];
      for (let y = minY; y <= maxY; y++) {
        nodeX.length = 0;
        let activeSegs = null;
        if (featherW > 0) {
          activeSegs = [];
          for (let s = 0; s < allSegments.length; s++) {
            const seg = allSegments[s];
            if (y >= seg.minY && y <= seg.maxY) activeSegs.push(seg);
          }
        }
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
              let sx = isRelative ? (x - bMinX + offsetX) : (x + offsetX);
              let sy = isRelative ? (y - bMinY + offsetY) : (y + offsetY);

              if (warpStrength > 0) {
                const freq = warpFreq > 0 ? warpFreq * 0.01 : 0.2;
                sx += Math.sin(sy * freq) * (warpStrength * 0.4);
                sy += Math.cos(sx * freq) * (warpStrength * 0.4);
              }

              if (noiseDistort > 0) {
                const isx = Math.floor(sx) | 0;
                const isy = Math.floor(sy) | 0;
                const jn = (((Math.imul(isx, 374761393) + Math.imul(isy, 668265263)) ^ 0x5bf03635) >>> 0) & 0xFF;
                const jitter = (jn - 128) * (noiseDistort * 0.0025);
                sx += jitter;
                sy += jitter;
              }

              if (pinchSwirl !== 0) {
                const dx = x - cx;
                const dy = y - cy;
                const r = Math.sqrt(dx * dx + dy * dy);
                if (r < maxR) {
                  const factor = (1.0 - r / maxR) * (pinchSwirl * 0.01) * Math.PI;
                  const cosS = Math.cos(factor);
                  const sinS = Math.sin(factor);
                  const nrx = dx * cosS - dy * sinS;
                  const nry = dx * sinS + dy * cosS;
                  if (isRelative) {
                    sx = cx + nrx - bMinX + offsetX;
                    sy = cy + nry - bMinY + offsetY;
                  } else {
                    sx = cx + nrx + offsetX;
                    sy = cy + nry + offsetY;
                  }
                }
              }

              let pixColor = fillArgb;
              if (gradient && bounds) {
                const gradX = (warpStrength > 0 || noiseDistort > 0 || pinchSwirl !== 0) ? (isRelative ? sx + bMinX - offsetX : sx - offsetX) : x;
                const gradY = (warpStrength > 0 || noiseDistort > 0 || pinchSwirl !== 0) ? (isRelative ? sy + bMinY - offsetY : sy - offsetY) : y;
                pixColor = sampleGradient(gradient, gradX, gradY, bounds, scale, totalOpacity);
              }

              const origA = (pixColor >>> 24) & 0xFF;
              let sampledA = origA;
              if (customPixels) {
                sampledA = sampleCustomTexture(customPixels, customW, customH, sx, sy, texAngle, texScale, texContrast, origA);
              } else if (texMode > 0) {
                sampledA = sampleProceduralTexture(texMode, sx, sy, texAngle, texScale, texContrast, origA);
              }

              if (texGrain > 0) {
                const isx = Math.floor(sx) | 0;
                const isy = Math.floor(sy) | 0;
                const hg = (((Math.imul(isx, 1103515245) + Math.imul(isy, 12345) + 0x654321) ^ 0xDEADBEEF) >>> 0) & 0xFF;
                const gFactor = 1.0 - (texGrain * 0.01) * ((hg - 128) / 128.0);
                sampledA = Math.max(0, Math.min(255, Math.round(sampledA * gFactor)));
              }

              if (invert) {
                let inv = origA - (sampledA - Math.floor(origA * 40 / 255));
                sampledA = inv < 0 ? 0 : (inv > 255 ? 255 : inv);
              }

              if (posterize >= 2) {
                const step = Math.floor(255 / posterize);
                sampledA = Math.min(255, Math.floor((sampledA + Math.floor(step / 2)) / step) * step);
              }

              if (featherW > 0 && activeSegs && activeSegs.length > 0) {
                let minD2 = maxD2;
                for (let s = 0; s < activeSegs.length; s++) {
                  const seg = activeSegs[s];
                  if (x < seg.minX || x > seg.maxX) continue;
                  let d2;
                  if (seg.segLen2 === 0) {
                    const dx = x - seg.x1, dy = y - seg.y1;
                    d2 = dx * dx + dy * dy;
                  } else {
                    let t = ((x - seg.x1) * seg.vx + (y - seg.y1) * seg.vy) / seg.segLen2;
                    if (t < 0) t = 0;
                    else if (t > 1) t = 1;
                    const qx = seg.x1 + t * seg.vx - x;
                    const qy = seg.y1 + t * seg.vy - y;
                    d2 = qx * qx + qy * qy;
                  }
                  if (d2 < minD2) minD2 = d2;
                }
                if (minD2 < maxD2) {
                  sampledA = Math.round(sampledA * (Math.sqrt(minD2) / featherW));
                }
              }

              pixColor = ((sampledA << 24) | (pixColor & 0x00FFFFFF)) >>> 0;
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
      const outPtr = exp.w_layer_get_pixels(3);
      if (!outPtr || !this.actor.memory) return null;

      const totalPixels = w * h;
      if (!this._cachedRawArray || this._cachedRawArray.length !== totalPixels * 4) {
        this._cachedRawArray = new Uint8ClampedArray(totalPixels * 4);
        this._cachedRawU32 = new Uint32Array(this._cachedRawArray.buffer);
      }

      const srcU32 = new Uint32Array(this.actor.memory.buffer, outPtr, totalPixels);
      this._cachedRawU32.set(srcU32);

      return { width: w, height: h, data: this._cachedRawArray };
    }

    /**
     * Direct rasterization blit to a Canvas element in real time
     */
    renderToCanvas(doc, canvas, options = {}) {
      const res = this.renderDocument(doc, options);
      if (!res) return false;

      const exp = this.actor.exports;
      const w = exp.get_width ? exp.get_width() : 800;
      const h = exp.get_height ? exp.get_height() : 600;
      const outPtr = exp.w_layer_get_pixels(3);
      if (!outPtr || !this.actor.memory) return false;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return false;

      // Reuse cached ImageData to eliminate GC pauses and per-frame memory allocation
      if (!this._cachedCanvasImageData || this._cachedCanvasWidth !== w || this._cachedCanvasHeight !== h) {
        this._cachedCanvasImageData = ctx2d.createImageData(w, h);
        this._cachedCanvasU32 = new Uint32Array(this._cachedCanvasImageData.data.buffer);
        this._cachedCanvasWidth = w;
        this._cachedCanvasHeight = h;
      }

      const totalPixels = w * h;
      const srcU32 = new Uint32Array(this.actor.memory.buffer, outPtr, totalPixels);
      this._cachedCanvasU32.set(srcU32);

      ctx2d.putImageData(this._cachedCanvasImageData, 0, 0);
      return true;
    }
  }

  return QuadroSvgRenderer;
}));
