/**
 * ============================================================================
 * E2E Test Helper: Transform Oracle (tests/e2e/helpers/transform_oracle.js)
 * Mathematical reference oracle for 2D affine matrix math, quad handles,
 * flipping, and subpixel bilinear interpolation.
 * ============================================================================
 */

class TransformOracle {
  /**
   * 3x3 2D Affine Matrix representation [a, c, tx, b, d, ty, 0, 0, 1]
   * Corresponding to standard Android Matrix / CSS 2D Matrix:
   * [ a  c  tx ]
   * [ b  d  ty ]
   * [ 0  0   1 ]
   */
  static identity() {
    return [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1
    ];
  }

  static multiply(m1, m2) {
    const res = new Array(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        res[r * 3 + c] =
          m1[r * 3 + 0] * m2[0 * 3 + c] +
          m1[r * 3 + 1] * m2[1 * 3 + c] +
          m1[r * 3 + 2] * m2[2 * 3 + c];
      }
    }
    return res;
  }

  static translate(m, dx, dy) {
    const t = [
      1, 0, dx,
      0, 1, dy,
      0, 0, 1
    ];
    return this.multiply(m, t);
  }

  static scale(m, sx, sy, cx = 0, cy = 0) {
    let res = this.translate(m, cx, cy);
    const s = [
      sx, 0, 0,
      0, sy, 0,
      0,  0, 1
    ];
    res = this.multiply(res, s);
    return this.translate(res, -cx, -cy);
  }

  static rotate(m, deg, cx = 0, cy = 0) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let res = this.translate(m, cx, cy);
    const r = [
      cos, -sin, 0,
      sin,  cos, 0,
        0,    0, 1
    ];
    res = this.multiply(res, r);
    return this.translate(res, -cx, -cy);
  }

  static transformPoint(m, pt) {
    const x = pt.x;
    const y = pt.y;
    return {
      x: m[0] * x + m[1] * y + m[2],
      y: m[3] * x + m[4] * y + m[5]
    };
  }

  static computeQuad(m, bounds) {
    const tl = this.transformPoint(m, { x: bounds.left, y: bounds.top });
    const tr = this.transformPoint(m, { x: bounds.right, y: bounds.top });
    const br = this.transformPoint(m, { x: bounds.right, y: bounds.bottom });
    const bl = this.transformPoint(m, { x: bounds.left, y: bounds.bottom });
    return [tl, tr, br, bl];
  }

  static computeCenter(quad) {
    return {
      x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
      y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4
    };
  }

  static computeHandles(quad, rotationKnobOffset = -32) {
    const [tl, tr, br, bl] = quad;
    const topMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
    const rightMid = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
    const bottomMid = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
    const leftMid = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 };
    const center = this.computeCenter(quad);

    // Compute upward normal vector perpendicular to top edge (screen space: -y is UP)
    const dx = tr.x - tl.x;
    const dy = tr.y - tl.y;
    const len = Math.hypot(dx, dy) || 1;
    // Normal pointing outward (upward towards -y)
    const nx = dy / len;
    const ny = -dx / len;

    const rotationKnob = {
      x: topMid.x + nx * Math.abs(rotationKnobOffset),
      y: topMid.y + ny * Math.abs(rotationKnobOffset)
    };

    return {
      tl,
      tr,
      br,
      bl,
      topMid,
      rightMid,
      bottomMid,
      leftMid,
      rotationKnob,
      center
    };
  }

  static hitTestHandle(pt, handles, radius = 24) {
    const rSq = radius * radius;
    for (const [name, handle] of Object.entries(handles)) {
      const dx = pt.x - handle.x;
      const dy = pt.y - handle.y;
      if (dx * dx + dy * dy <= rSq) {
        return name;
      }
    }
    return null;
  }

  static flipQuadH(quad) {
    const center = this.computeCenter(quad);
    return quad.map(pt => ({
      x: 2 * center.x - pt.x,
      y: pt.y
    }));
  }

  static flipQuadV(quad) {
    const center = this.computeCenter(quad);
    return quad.map(pt => ({
      x: pt.x,
      y: 2 * center.y - pt.y
    }));
  }

  /**
   * High-accuracy Bilinear Interpolation
   * Samples a fractional (u, v) from a 32-bit ARGB/ABGR pixel buffer.
   */
  static sampleBilinear(pixels, width, height, x, y) {
    if (width <= 0 || height <= 0 || !pixels || pixels.length === 0) return 0;

    const xClamped = Math.max(0, Math.min(width - 1, x));
    const yClamped = Math.max(0, Math.min(height - 1, y));

    const x0 = Math.floor(xClamped);
    const y0 = Math.floor(yClamped);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const u = xClamped - x0;
    const v = yClamped - y0;

    const p00 = pixels[y0 * width + x0];
    const p10 = pixels[y0 * width + x1];
    const p01 = pixels[y1 * width + x0];
    const p11 = pixels[y1 * width + x1];

    const getA = (c) => (c >>> 24) & 0xff;
    const getR = (c) => (c >>> 16) & 0xff;
    const getG = (c) => (c >>> 8) & 0xff;
    const getB = (c) => c & 0xff;

    const lerp4 = (c00, c10, c01, c11) => {
      const w00 = (1 - u) * (1 - v);
      const w10 = u * (1 - v);
      const w01 = (1 - u) * v;
      const w11 = u * v;
      return Math.round(c00 * w00 + c10 * w10 + c01 * w01 + c11 * w11);
    };

    const a = lerp4(getA(p00), getA(p10), getA(p01), getA(p11));
    const r = lerp4(getR(p00), getR(p10), getR(p01), getR(p11));
    const g = lerp4(getG(p00), getG(p10), getG(p01), getG(p11));
    const b = lerp4(getB(p00), getB(p10), getB(p01), getB(p11));

    return ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }
}

module.exports = { TransformOracle };
