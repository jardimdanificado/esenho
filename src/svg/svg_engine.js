/**
 * =========================================================================
 * SVG Object Engine & Scene Graph (src/svg/svg_engine.js)
 * Standalone vector object model with Bézier curves, Booleans, Compound Paths,
 * Gradients, Shadows, Typography, and SVG parser/serializer.
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const SvgBoolean = require('./svg_boolean.js');
    module.exports = factory(SvgBoolean);
  } else {
    root.SvgEngine = factory(root.SvgBoolean);
  }
}(typeof self !== 'undefined' ? self : this, function (SvgBoolean) {
  'use strict';

  let nextId = 1;
  function generateId(prefix = 'obj') {
    return `${prefix}_${nextId++}_${Math.random().toString(36).substr(2, 5)}`;
  }

  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /* =========================================================================
   * Bézier Math & Geometry Utilities
   * ========================================================================= */

  const Bezier = {
    /** Evaluate cubic Bézier curve at parameter t (0..1) */
    evalCubic(p0, cp1, cp2, p1, t) {
      const it = 1 - t;
      const it2 = it * it;
      const it3 = it2 * it;
      const t2 = t * t;
      const t3 = t2 * t;

      return {
        x: it3 * p0.x + 3 * it2 * t * cp1.x + 3 * it * t2 * cp2.x + t3 * p1.x,
        y: it3 * p0.y + 3 * it2 * t * cp1.y + 3 * it * t2 * cp2.y + t3 * p1.y
      };
    },

    /** Evaluate quadratic Bézier curve at parameter t (0..1) */
    evalQuad(p0, cp, p1, t) {
      const it = 1 - t;
      const it2 = it * it;
      const t2 = t * t;

      return {
        x: it2 * p0.x + 2 * it * t * cp.x + t2 * p1.x,
        y: it2 * p0.y + 2 * it * t * cp.y + t2 * p1.y
      };
    },

    /** Evaluate derivative / tangent angle in radians at parameter t */
    tangentCubic(p0, cp1, cp2, p1, t) {
      const it = 1 - t;
      const dx = 3 * it * it * (cp1.x - p0.x) + 6 * it * t * (cp2.x - cp1.x) + 3 * t * t * (p1.x - cp2.x);
      const dy = 3 * it * it * (cp1.y - p0.y) + 6 * it * t * (cp2.y - cp1.y) + 3 * t * t * (p1.y - cp2.y);
      return Math.atan2(dy, dx);
    },

    /**
     * Adaptive subdivision of cubic Bézier curve (De Casteljau).
     * Returns an array of points approximating the curve with tolerance.
     */
    subdivideCubic(p0, cp1, cp2, p1, tolerance = 0.5, maxDepth = 8) {
      const points = [p0];

      function recurse(p0, cp1, cp2, p1, depth) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const lenSq = dx * dx + dy * dy;

        let flat = false;
        if (lenSq < 1e-4) {
          const d1 = (cp1.x - p0.x) ** 2 + (cp1.y - p0.y) ** 2;
          const d2 = (cp2.x - p1.x) ** 2 + (cp2.y - p1.y) ** 2;
          flat = (d1 <= tolerance * tolerance) && (d2 <= tolerance * tolerance);
        } else {
          const len = Math.sqrt(lenSq);
          const d1 = Math.abs((cp1.y - p0.y) * dx - (cp1.x - p0.x) * dy) / len;
          const d2 = Math.abs((cp2.y - p0.y) * dx - (cp2.x - p0.x) * dy) / len;
          flat = (d1 <= tolerance && d2 <= tolerance);
        }

        if (flat || depth >= maxDepth) {
          points.push(p1);
          return;
        }

        const p01 = { x: (p0.x + cp1.x) * 0.5, y: (p0.y + cp1.y) * 0.5 };
        const p12 = { x: (cp1.x + cp2.x) * 0.5, y: (cp1.y + cp2.y) * 0.5 };
        const p23 = { x: (cp2.x + p1.x) * 0.5, y: (cp2.y + p1.y) * 0.5 };

        const p012 = { x: (p01.x + p12.x) * 0.5, y: (p01.y + p12.y) * 0.5 };
        const p123 = { x: (p12.x + p23.x) * 0.5, y: (p12.y + p23.y) * 0.5 };

        const p0123 = { x: (p012.x + p123.x) * 0.5, y: (p012.y + p123.y) * 0.5 };

        recurse(p0, p01, p012, p0123, depth + 1);
        recurse(p0123, p123, p23, p1, depth + 1);
      }

      recurse(p0, cp1, cp2, p1, 0);
      return points;
    },

    /** Approximate arc length of cubic Bézier curve */
    arcLengthCubic(p0, cp1, cp2, p1, steps = 16) {
      let len = 0;
      let prev = p0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const pt = Bezier.evalCubic(p0, cp1, cp2, p1, t);
        len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
        prev = pt;
      }
      return len;
    },

    /** Calculate bounding box for cubic Bézier */
    cubicBounds(p0, cp1, cp2, p1) {
      let minX = Math.min(p0.x, p1.x);
      let maxX = Math.max(p0.x, p1.x);
      let minY = Math.min(p0.y, p1.y);
      let maxY = Math.max(p0.y, p1.y);

      // Extrema along X
      const ax = 3 * (-p0.x + 3 * cp1.x - 3 * cp2.x + p1.x);
      const bx = 6 * (p0.x - 2 * cp1.x + cp2.x);
      const cx = 3 * (cp1.x - p0.x);

      if (Math.abs(ax) > 1e-6) {
        const disc = bx * bx - 4 * ax * cx;
        if (disc >= 0) {
          const s = Math.sqrt(disc);
          const t1 = (-bx + s) / (2 * ax);
          const t2 = (-bx - s) / (2 * ax);
          if (t1 > 0 && t1 < 1) {
            const x = Bezier.evalCubic(p0, cp1, cp2, p1, t1).x;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          }
          if (t2 > 0 && t2 < 1) {
            const x = Bezier.evalCubic(p0, cp1, cp2, p1, t2).x;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          }
        }
      } else if (Math.abs(bx) > 1e-6) {
        const t = -cx / bx;
        if (t > 0 && t < 1) {
          const x = Bezier.evalCubic(p0, cp1, cp2, p1, t).x;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        }
      }

      // Extrema along Y
      const ay = 3 * (-p0.y + 3 * cp1.y - 3 * cp2.y + p1.y);
      const by = 6 * (p0.y - 2 * cp1.y + cp2.y);
      const cy = 3 * (cp1.y - p0.y);

      if (Math.abs(ay) > 1e-6) {
        const disc = by * by - 4 * ay * cy;
        if (disc >= 0) {
          const s = Math.sqrt(disc);
          const t1 = (-by + s) / (2 * ay);
          const t2 = (-by - s) / (2 * ay);
          if (t1 > 0 && t1 < 1) {
            const y = Bezier.evalCubic(p0, cp1, cp2, p1, t1).y;
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
          if (t2 > 0 && t2 < 1) {
            const y = Bezier.evalCubic(p0, cp1, cp2, p1, t2).y;
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      } else if (Math.abs(by) > 1e-6) {
        const t = -cy / by;
        if (t > 0 && t < 1) {
          const y = Bezier.evalCubic(p0, cp1, cp2, p1, t).y;
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }

      return { minX, minY, maxX, maxY };
    },

    evalCubicDerivative(p0, cp1, cp2, p1, t) {
      const it = 1 - t;
      return {
        x: 3 * it * it * (cp1.x - p0.x) + 6 * it * t * (cp2.x - cp1.x) + 3 * t * t * (p1.x - cp2.x),
        y: 3 * it * it * (cp1.y - p0.y) + 6 * it * t * (cp2.y - cp1.y) + 3 * t * t * (p1.y - cp2.y)
      };
    },

    evalCubicSecondDerivative(p0, cp1, cp2, p1, t) {
      const it = 1 - t;
      return {
        x: 6 * it * (cp2.x - 2 * cp1.x + p0.x) + 6 * t * (p1.x - 2 * cp2.x + cp1.x),
        y: 6 * it * (cp2.y - 2 * cp1.y + p0.y) + 6 * t * (p1.y - 2 * cp2.y + cp1.y)
      };
    },

    /**
     * Ramer-Douglas-Peucker (RDP) polyline simplification.
     * Reduces the number of points in a curve approximated by a series of points.
     */
    simplifyRDP(points, tolerance = 1.0) {
      if (!points || points.length <= 2) return (points || []).slice();
      const sqTol = tolerance * tolerance;

      function getSqDist(p, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
          return (p.x - p1.x) ** 2 + (p.y - p1.y) ** 2;
        }
        const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        return (p.x - projX) ** 2 + (p.y - projY) ** 2;
      }

      function rdpStep(firstIdx, lastIdx, result) {
        let maxSqDist = 0;
        let index = firstIdx;

        for (let i = firstIdx + 1; i < lastIdx; i++) {
          const sqDist = getSqDist(points[i], points[firstIdx], points[lastIdx]);
          if (sqDist > maxSqDist) {
            maxSqDist = sqDist;
            index = i;
          }
        }

        if (maxSqDist > sqTol) {
          rdpStep(firstIdx, index, result);
          result.pop();
          rdpStep(index, lastIdx, result);
        } else {
          result.push(points[firstIdx]);
          result.push(points[lastIdx]);
        }
      }

      const res = [];
      rdpStep(0, points.length - 1, res);
      return res;
    },

    /**
     * Schneider's Algorithm for Automatically Fitting Digitized Curves
     * (Graphic Gems I, Philip J. Schneider).
     * Fits a series of digitized points with smooth cubic Bézier curve segments.
     * Returns an array of cubic segments: [{ p0, cp1, cp2, p1 }, ...]
     */
    fitCurve(points, maxError = 2.0) {
      if (!points || points.length < 2) return [];
      if (points.length === 2) {
        const p0 = points[0];
        const p1 = points[1];
        const cp1 = { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 };
        const cp2 = { x: p1.x - (p1.x - p0.x) / 3, y: p1.y - (p1.y - p0.y) / 3 };
        return [{ p0, cp1, cp2, p1 }];
      }

      function normalize(v) {
        const len = Math.hypot(v.x, v.y);
        return len > 1e-9 ? { x: v.x / len, y: v.y / len } : { x: 1, y: 0 };
      }

      function computeLeftTangent(pts, end) {
        return normalize({ x: pts[end + 1].x - pts[end].x, y: pts[end + 1].y - pts[end].y });
      }

      function computeRightTangent(pts, end) {
        return normalize({ x: pts[end - 1].x - pts[end].x, y: pts[end - 1].y - pts[end].y });
      }

      function computeCenterTangent(pts, center) {
        const v1 = { x: pts[center - 1].x - pts[center].x, y: pts[center - 1].y - pts[center].y };
        const v2 = { x: pts[center].x - pts[center + 1].x, y: pts[center].y - pts[center + 1].y };
        return normalize({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 });
      }

      function chordLengthParameterize(pts, first, last) {
        const u = [0];
        for (let i = first + 1; i <= last; i++) {
          u.push(u[u.length - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        }
        const total = u[u.length - 1];
        if (total > 0) {
          for (let i = 0; i < u.length; i++) u[i] /= total;
        }
        return u;
      }

      function generateBezier(pts, first, last, uPrime, tHat1, tHat2) {
        const p0 = pts[first];
        const p3 = pts[last];
        const nPts = last - first + 1;

        let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;

        for (let i = 0; i < nPts; i++) {
          const u = uPrime[i];
          const it = 1 - u;
          const b0 = it * it * it;
          const b1 = 3 * u * it * it;
          const b2 = 3 * u * u * it;
          const b3 = u * u * u;

          const a1 = { x: tHat1.x * b1, y: tHat1.y * b1 };
          const a2 = { x: tHat2.x * b2, y: tHat2.y * b2 };

          c00 += a1.x * a1.x + a1.y * a1.y;
          c01 += a1.x * a2.x + a1.y * a2.y;
          c11 += a2.x * a2.x + a2.y * a2.y;

          const v = {
            x: pts[first + i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3)),
            y: pts[first + i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3))
          };

          x0 += a1.x * v.x + a1.y * v.y;
          x1 += a2.x * v.x + a2.y * v.y;
        }

        const det = c00 * c11 - c01 * c01;
        let alphaL, alphaR;

        if (Math.abs(det) > 1e-9) {
          alphaL = (x0 * c11 - x1 * c01) / det;
          alphaR = (c00 * x1 - c01 * x0) / det;
        } else {
          alphaL = alphaR = 0;
        }

        const segLen = Math.hypot(p3.x - p0.x, p3.y - p0.y);
        const epsilon = 1e-6 * segLen;

        if (alphaL < epsilon || alphaR < epsilon) {
          const dist = segLen / 3.0;
          return {
            p0,
            cp1: { x: p0.x + tHat1.x * dist, y: p0.y + tHat1.y * dist },
            cp2: { x: p3.x + tHat2.x * dist, y: p3.y + tHat2.y * dist },
            p1: p3
          };
        }

        return {
          p0,
          cp1: { x: p0.x + tHat1.x * alphaL, y: p0.y + tHat1.y * alphaL },
          cp2: { x: p3.x + tHat2.x * alphaR, y: p3.y + tHat2.y * alphaR },
          p1: p3
        };
      }

      function computeMaxError(pts, first, last, curve, u) {
        let maxDist = 0;
        let splitPoint = Math.floor((last - first + 1) / 2);
        const nPts = last - first + 1;

        for (let i = 1; i < nPts - 1; i++) {
          const pt = Bezier.evalCubic(curve.p0, curve.cp1, curve.cp2, curve.p1, u[i]);
          const dist = Math.hypot(pt.x - pts[first + i].x, pt.y - pts[first + i].y);
          if (dist >= maxDist) {
            maxDist = dist;
            splitPoint = first + i;
          }
        }
        return { maxDist, splitPoint };
      }

      function reparameterize(curve, pts, first, last, u) {
        const nPts = last - first + 1;
        const uPrime = [];
        for (let i = 0; i < nPts; i++) {
          let ui = u[i];
          const P = pts[first + i];
          for (let iter = 0; iter < 4; iter++) {
            const Q_u = Bezier.evalCubic(curve.p0, curve.cp1, curve.cp2, curve.p1, ui);
            const Q_prime = Bezier.evalCubicDerivative(curve.p0, curve.cp1, curve.cp2, curve.p1, ui);
            const Q_prime2 = Bezier.evalCubicSecondDerivative(curve.p0, curve.cp1, curve.cp2, curve.p1, ui);

            const num = (Q_u.x - P.x) * Q_prime.x + (Q_u.y - P.y) * Q_prime.y;
            const den = (Q_prime.x * Q_prime.x + Q_prime.y * Q_prime.y) +
                        ((Q_u.x - P.x) * Q_prime2.x + (Q_u.y - P.y) * Q_prime2.y);

            if (Math.abs(den) < 1e-9) break;
            ui = Math.max(0, Math.min(1, ui - num / den));
          }
          uPrime.push(ui);
        }
        return uPrime;
      }

      const curves = [];

      function fitCubic(pts, first, last, tHat1, tHat2, error) {
        const nPts = last - first + 1;
        if (nPts === 2) {
          const dist = Math.hypot(pts[last].x - pts[first].x, pts[last].y - pts[first].y) / 3.0;
          curves.push({
            p0: pts[first],
            cp1: { x: pts[first].x + tHat1.x * dist, y: pts[first].y + tHat1.y * dist },
            cp2: { x: pts[last].x + tHat2.x * dist, y: pts[last].y + tHat2.y * dist },
            p1: pts[last]
          });
          return;
        }

        let u = chordLengthParameterize(pts, first, last);
        let curve = generateBezier(pts, first, last, u, tHat1, tHat2);
        let { maxDist, splitPoint } = computeMaxError(pts, first, last, curve, u);

        if (maxDist < error) {
          curves.push(curve);
          return;
        }

        if (maxDist < error * 4.0) {
          for (let iter = 0; iter < 4; iter++) {
            u = reparameterize(curve, pts, first, last, u);
            curve = generateBezier(pts, first, last, u, tHat1, tHat2);
            const err = computeMaxError(pts, first, last, curve, u);
            maxDist = err.maxDist;
            splitPoint = err.splitPoint;
            if (maxDist < error) {
              curves.push(curve);
              return;
            }
          }
        }

        let tHatCenter = computeCenterTangent(pts, splitPoint);
        fitCubic(pts, first, splitPoint, tHat1, tHatCenter, error);
        fitCubic(pts, splitPoint, last, { x: -tHatCenter.x, y: -tHatCenter.y }, tHat2, error);
      }

      const tHat1 = computeLeftTangent(points, 0);
      const tHat2 = computeRightTangent(points, points.length - 1);
      fitCubic(points, 0, points.length - 1, tHat1, tHat2, maxError);
      return curves;
    }
  };

  /* =========================================================================
   * Base SVG Object (Scene Graph Node)
   * ========================================================================= */

  class SvgNode {
    constructor(type, attributes = {}) {
      this.id = attributes.id || generateId(type);
      this.type = type;
      this.name = attributes.name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.id.split('_')[1] || ''}`;
      this.visible = attributes.visible !== undefined ? !!attributes.visible : true;
      this.locked = attributes.locked !== undefined ? !!attributes.locked : false;
      this.opacity = attributes.opacity !== undefined ? Number(attributes.opacity) : 1.0;
      this.blendMode = attributes.blendMode || 'normal';

      // Style & Fill
      this.fill = attributes.fill !== undefined ? attributes.fill : '#fabd2f';
      this.fillOpacity = attributes.fillOpacity !== undefined ? Number(attributes.fillOpacity) : 1.0;
      this.fillType = attributes.fillType || 'solid'; // 'solid', 'linear', 'radial'
      this.fillGradient = attributes.fillGradient
        ? (attributes.fillGradient instanceof SvgGradient
            ? attributes.fillGradient
            : { enabled: true, stops: [], type: attributes.fillType || 'linear', ...attributes.fillGradient })
        : null;

      this.stroke = attributes.stroke !== undefined ? attributes.stroke : '#1d2021';
      this.strokeWidth = attributes.strokeWidth !== undefined ? Number(attributes.strokeWidth) : 2;
      this.strokeOpacity = attributes.strokeOpacity !== undefined ? Number(attributes.strokeOpacity) : 1.0;
      this.strokeLinecap = attributes.strokeLinecap || 'round';
      this.strokeLinejoin = attributes.strokeLinejoin || 'round';
      this.strokeDasharray = attributes.strokeDasharray || '';

      // Drop Shadows & Glows
      this.dropShadow = {
        enabled: false,
        color: '#000000',
        blur: 4,
        offsetX: 2,
        offsetY: 2,
        opacity: 0.6,
        ...(attributes.dropShadow || {})
      };

      // Brush & Dynamics Configuration
      this.brushConfig = {
        preset: 'round',
        hardness: 95,
        flow: 100,
        spacing: 5,
        scatter: 0,
        roundness: 100,
        angle: 0,
        shape: 0,
        dabBlend: 0,
        grain: 0,
        auto_rotate: 0,
        taper_in: 0,
        taper_out: 0,
        size_jitter: 0,
        angle_jitter: 0,
        opacity_jitter: 0,
        wetness: 0,
        color_pickup: 0,
        depletion: 0,
        smudge: 0,
        ...(attributes.brushConfig || {})
      };

      // Procedural Textures for Stroke and Fill (Modes 0..12)
      this.strokeTexture = {
        enabled: false,
        mode: 0,
        angle: 0,
        scale: 100,
        contrast: 100,
        grain: 0,
        ...(attributes.strokeTexture || {})
      };

      this.fillTexture = {
        enabled: false,
        mode: 0,
        angle: 0,
        scale: 100,
        contrast: 100,
        grain: 0,
        ...(attributes.fillTexture || {})
      };

      // Transform
      this.x = Number(attributes.x || 0);
      this.y = Number(attributes.y || 0);
      this.rotation = Number(attributes.rotation || 0); // in degrees
      this.originX = attributes.originX !== undefined ? Number(attributes.originX) : undefined;
      this.originY = attributes.originY !== undefined ? Number(attributes.originY) : undefined;
      this.scaleX = Number(attributes.scaleX !== undefined ? attributes.scaleX : 1);
      this.scaleY = Number(attributes.scaleY !== undefined ? attributes.scaleY : 1);
      this.clipPathId = attributes.clipPathId || null;
      this.parent = null;
    }

    getOrigin() {
      const b = this.getBounds();
      return {
        x: this.originX !== undefined ? this.originX : (b.minX + b.width / 2),
        y: this.originY !== undefined ? this.originY : (b.minY + b.height / 2)
      };
    }

    getTransformAttribute() {
      const transforms = [];
      const origin = this.getOrigin();
      if (this.rotation && this.rotation !== 0) {
        transforms.push(`rotate(${this.rotation} ${origin.x} ${origin.y})`);
      }
      if ((this.scaleX !== undefined && this.scaleX !== 1) || (this.scaleY !== undefined && this.scaleY !== 1)) {
        const sx = this.scaleX !== undefined ? this.scaleX : 1;
        const sy = this.scaleY !== undefined ? this.scaleY : 1;
        transforms.push(`translate(${origin.x} ${origin.y}) scale(${sx} ${sy}) translate(${-origin.x} ${-origin.y})`);
      }
      return transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';
    }

    getExtraSVGAttributes(includeClipPath = false) {
      let attrs = this.getTransformAttribute();
      if (includeClipPath && this.clipPathId) {
        const hasMask = (this.doc ? !!this.doc.findObject(this.clipPathId) : true);
        if (hasMask) {
          attrs += ` clip-path="url(#clip_${this.clipPathId})"`;
        }
      }
      if (this.brushConfig) {
        attrs += ` data-brush="${encodeURIComponent(JSON.stringify(this.brushConfig))}"`;
      }
      if (this.strokeTexture && (this.strokeTexture.mode > 0 || this.strokeTexture.enabled)) {
        attrs += ` data-stroke-tex="${encodeURIComponent(JSON.stringify(this.strokeTexture))}"`;
      }
      if (this.fillTexture && (this.fillTexture.mode > 0 || this.fillTexture.enabled)) {
        attrs += ` data-fill-tex="${encodeURIComponent(JSON.stringify(this.fillTexture))}"`;
      }
      if (this.dropShadow && this.dropShadow.enabled) {
        attrs += ` data-shadow="${encodeURIComponent(JSON.stringify(this.dropShadow))}"`;
      }
      if (this.fillGradient) {
        attrs += ` data-gradient="${encodeURIComponent(JSON.stringify(this.fillGradient))}"`;
      }
      return attrs;
    }

    wrapClipPath(svgEl) {
      if (this.clipPathId) {
        const hasMask = (this.doc ? !!this.doc.findObject(this.clipPathId) : true);
        if (hasMask) {
          return `<g clip-path="url(#clip_${this.clipPathId})">\n    ${svgEl}\n  </g>`;
        }
      }
      return svgEl;
    }

    getSvgFillAttribute() {
      if (this.fillType && this.fillType !== 'solid' && this.fillGradient) {
        return `url(#${this.fillGradient.id || 'grad_' + this.id})`;
      }
      return this.fill || 'none';
    }

    getSvgFilterAttribute() {
      if (this.dropShadow && this.dropShadow.enabled) {
        return ` filter="url(#shadow_${this.id})"`;
      }
      return '';
    }

    clone() {
      const json = this.toJSON();
      json.id = generateId(this.type);
      json.name = `${this.name} (Copy)`;
      return SvgNode.fromJSON(json);
    }

    move(dx, dy) {
      this.x += dx;
      this.y += dy;
      if (this.originX !== undefined) this.originX += dx;
      if (this.originY !== undefined) this.originY += dy;
    }

    _shiftGeometry(dx, dy) {
      this.x += dx;
      this.y += dy;
    }

    setOrigin(newOx, newOy, preserveVisualPosition = true) {
      if (newOx === undefined || newOy === undefined) {
        this.originX = undefined;
        this.originY = undefined;
        return;
      }
      const oldOrigin = this.getOrigin();
      const dx = newOx - oldOrigin.x;
      const dy = newOy - oldOrigin.y;

      if (preserveVisualPosition && (this.rotation || 0) !== 0 && (dx !== 0 || dy !== 0)) {
        const rad = (this.rotation || 0) * Math.PI / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        // delta in geom coords = d - R(-theta)*d
        const rx = dx * cosA + dy * sinA;
        const ry = -dx * sinA + dy * cosA;
        const geomDx = dx - rx;
        const geomDy = dy - ry;

        // Shift base geometry to preserve visual position invariant under rotation
        this._shiftGeometry(geomDx, geomDy);
      }
      this.originX = newOx;
      this.originY = newOy;
    }

    getTransformedBounds() {
      const b = this.getBounds();
      if (!this.rotation || this.rotation === 0) return b;
      const origin = this.getOrigin();
      const rad = this.rotation * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      const corners = [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY }
      ];

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of corners) {
        const dx = c.x - origin.x;
        const dy = c.y - origin.y;
        const rx = origin.x + dx * cosA - dy * sinA;
        const ry = origin.y + dx * sinA + dy * cosA;
        minX = Math.min(minX, rx);
        minY = Math.min(minY, ry);
        maxX = Math.max(maxX, rx);
        maxY = Math.max(maxY, ry);
      }
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    hitTest(px, py, tolerance = 6) {
      let testX = px;
      let testY = py;
      if (this.rotation && this.rotation !== 0) {
        const origin = this.getOrigin();
        const rad = - (this.rotation * Math.PI / 180);
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const dx = px - origin.x;
        const dy = py - origin.y;
        testX = origin.x + dx * cosA - dy * sinA;
        testY = origin.y + dx * sinA + dy * cosA;
      }
      return this._localHitTest(testX, testY, tolerance);
    }

    _localHitTest(px, py, tolerance = 6) {
      const b = this.getBounds();
      return px >= b.minX - tolerance && px <= b.maxX + tolerance &&
             py >= b.minY - tolerance && py <= b.maxY + tolerance;
    }

    toSVGElement() {
      return '';
    }

    toJSON() {
      return {
        id: this.id,
        type: this.type,
        name: this.name,
        visible: this.visible,
        locked: this.locked,
        opacity: this.opacity,
        blendMode: this.blendMode,
        fill: this.fill,
        fillOpacity: this.fillOpacity,
        fillType: this.fillType,
        fillGradient: this.fillGradient ? { ...this.fillGradient } : null,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
        strokeOpacity: this.strokeOpacity,
        strokeLinecap: this.strokeLinecap,
        strokeLinejoin: this.strokeLinejoin,
        strokeDasharray: this.strokeDasharray,
        dropShadow: { ...this.dropShadow },
        brushConfig: { ...this.brushConfig },
        strokeTexture: { ...this.strokeTexture },
        fillTexture: { ...this.fillTexture },
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        originX: this.originX,
        originY: this.originY,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
        clipPathId: this.clipPathId
      };
    }

    static fromJSON(data) {
      switch (data.type) {
        case 'path': return SvgPath.fromJSON(data);
        case 'compoundPath': return SvgCompoundPath.fromJSON(data);
        case 'text': return SvgText.fromJSON(data);
        case 'rect': return SvgRect.fromJSON(data);
        case 'circle': return SvgCircle.fromJSON(data);
        case 'ellipse': return SvgEllipse.fromJSON(data);
        case 'line': return SvgLine.fromJSON(data);
        case 'polygon': return SvgPolygon.fromJSON(data);
        case 'polyline': return SvgPolyline.fromJSON(data);
        case 'group': return SvgGroup.fromJSON(data);
        case 'image': return SvgImage.fromJSON(data);
        default: return new SvgNode(data.type, data);
      }
    }
  }

  /* =========================================================================
   * SvgPath Object (Bézier Path with Nodes & Handles)
   * ========================================================================= */

  class PathNode {
    constructor(x, y, cpIn = null, cpOut = null, type = 'smooth') {
      this.x = Number(x);
      this.y = Number(y);
      this.cpIn = cpIn ? { x: Number(cpIn.x), y: Number(cpIn.y) } : { x: 0, y: 0 };
      this.cpOut = cpOut ? { x: Number(cpOut.x), y: Number(cpOut.y) } : { x: 0, y: 0 };
      this.type = type; // 'smooth', 'corner', 'symmetric', 'cusp'
    }

    getAbsCpIn() {
      return { x: this.x + this.cpIn.x, y: this.y + this.cpIn.y };
    }

    getAbsCpOut() {
      return { x: this.x + this.cpOut.x, y: this.y + this.cpOut.y };
    }

    setAbsCpIn(ax, ay, forceIndependent = false) {
      this.cpIn.x = ax - this.x;
      this.cpIn.y = ay - this.y;
      if (forceIndependent || this.type === 'cusp') {
        this.type = 'cusp';
        return;
      }
      if (this.type === 'symmetric' || this.type === 'corner' || Math.hypot(this.cpOut.x, this.cpOut.y) < 1e-4) {
        this.cpOut.x = -this.cpIn.x;
        this.cpOut.y = -this.cpIn.y;
        this.type = 'symmetric';
      } else if (this.type === 'smooth') {
        const lenOut = Math.hypot(this.cpOut.x, this.cpOut.y);
        const lenIn = Math.hypot(this.cpIn.x, this.cpIn.y);
        if (lenIn > 1e-4 && lenOut > 1e-4) {
          const angle = Math.atan2(this.cpIn.y, this.cpIn.x) + Math.PI;
          this.cpOut.x = Math.cos(angle) * lenOut;
          this.cpOut.y = Math.sin(angle) * lenOut;
        }
      }
    }

    setAbsCpOut(ax, ay, forceIndependent = false) {
      this.cpOut.x = ax - this.x;
      this.cpOut.y = ay - this.y;
      if (forceIndependent || this.type === 'cusp') {
        this.type = 'cusp';
        return;
      }
      if (this.type === 'symmetric' || this.type === 'corner' || Math.hypot(this.cpIn.x, this.cpIn.y) < 1e-4) {
        this.cpIn.x = -this.cpOut.x;
        this.cpIn.y = -this.cpOut.y;
        this.type = 'symmetric';
      } else if (this.type === 'smooth') {
        const lenIn = Math.hypot(this.cpIn.x, this.cpIn.y);
        const lenOut = Math.hypot(this.cpOut.x, this.cpOut.y);
        if (lenOut > 1e-4 && lenIn > 1e-4) {
          const angle = Math.atan2(this.cpOut.y, this.cpOut.x) + Math.PI;
          this.cpIn.x = Math.cos(angle) * lenIn;
          this.cpIn.y = Math.sin(angle) * lenIn;
        }
      }
    }

    clone() {
      return new PathNode(this.x, this.y, { ...this.cpIn }, { ...this.cpOut }, this.type);
    }
  }

  class SvgPath extends SvgNode {
    constructor(attributes = {}) {
      super('path', attributes);
      this.nodes = [];
      this.closed = attributes.closed !== undefined ? !!attributes.closed : false;

      if (attributes.nodes && Array.isArray(attributes.nodes)) {
        this.nodes = attributes.nodes.map(n => new PathNode(n.x, n.y, n.cpIn, n.cpOut, n.type));
      } else if (attributes.d) {
        this.setPathData(attributes.d);
      }
    }

    addNode(x, y, cpIn = null, cpOut = null, type = 'smooth') {
      const node = new PathNode(x, y, cpIn, cpOut, type);
      this.nodes.push(node);
      return node;
    }

    insertNode(index, x, y, cpIn = null, cpOut = null, type = 'smooth') {
      const node = new PathNode(x, y, cpIn, cpOut, type);
      this.nodes.splice(index, 0, node);
      return node;
    }

    removeNode(index) {
      if (index >= 0 && index < this.nodes.length) {
        return this.nodes.splice(index, 1)[0];
      }
      return null;
    }

    toPathData() {
      if (this.nodes.length === 0) return '';
      let d = `M ${this.nodes[0].x.toFixed(2)} ${this.nodes[0].y.toFixed(2)}`;

      for (let i = 1; i < this.nodes.length; i++) {
        const prev = this.nodes[i - 1];
        const curr = this.nodes[i];
        const cp1 = prev.getAbsCpOut();
        const cp2 = curr.getAbsCpIn();

        const hasCp1 = Math.hypot(prev.cpOut.x, prev.cpOut.y) > 0.1;
        const hasCp2 = Math.hypot(curr.cpIn.x, curr.cpIn.y) > 0.1;

        if (hasCp1 || hasCp2) {
          d += ` C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
        } else {
          d += ` L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
        }
      }

      if (this.closed && this.nodes.length >= 2) {
        const last = this.nodes[this.nodes.length - 1];
        const first = this.nodes[0];
        const cp1 = last.getAbsCpOut();
        const cp2 = first.getAbsCpIn();

        const hasCp1 = Math.hypot(last.cpOut.x, last.cpOut.y) > 0.1;
        const hasCp2 = Math.hypot(first.cpIn.x, first.cpIn.y) > 0.1;

        if (hasCp1 || hasCp2) {
          d += ` C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${first.x.toFixed(2)} ${first.y.toFixed(2)} Z`;
        } else {
          d += ' Z';
        }
      }

      return d;
    }

    setPathData(d) {
      this.nodes = [];
      this.closed = false;
      if (!d) return;

      const cmdRegex = /([a-df-z])([^a-df-z]*)/ig;
      let match;
      let curX = 0, curY = 0;

      while ((match = cmdRegex.exec(d)) !== null) {
        const type = match[1];
        const args = (match[2].trim().match(/-?[\d.]+(?:e-?\d+)?/gi) || []).map(Number);

        if (type === 'M' || type === 'm') {
          for (let k = 0; k < args.length; k += 2) {
            const x = type === 'M' ? args[k] : curX + args[k];
            const y = type === 'M' ? args[k + 1] : curY + args[k + 1];
            curX = x; curY = y;
            this.addNode(x, y, null, null, 'corner');
          }
        } else if (type === 'L' || type === 'l') {
          for (let k = 0; k < args.length; k += 2) {
            const x = type === 'L' ? args[k] : curX + args[k];
            const y = type === 'L' ? args[k + 1] : curY + args[k + 1];
            curX = x; curY = y;
            this.addNode(x, y, null, null, 'corner');
          }
        } else if (type === 'C' || type === 'c') {
          for (let k = 0; k < args.length; k += 6) {
            const cp1x = type === 'C' ? args[k] : curX + args[k];
            const cp1y = type === 'C' ? args[k + 1] : curY + args[k + 1];
            const cp2x = type === 'C' ? args[k + 2] : curX + args[k + 2];
            const cp2y = type === 'C' ? args[k + 3] : curY + args[k + 3];
            const x = type === 'C' ? args[k + 4] : curX + args[k + 4];
            const y = type === 'C' ? args[k + 5] : curY + args[k + 5];

            if (this.nodes.length > 0) {
              const prev = this.nodes[this.nodes.length - 1];
              prev.cpOut = { x: cp1x - prev.x, y: cp1y - prev.y };
            }
            curX = x; curY = y;
            this.addNode(x, y, { x: cp2x - x, y: cp2y - y }, null, 'smooth');
          }
        } else if (type === 'Z' || type === 'z') {
          this.closed = true;
        }
      }
    }

    toPolyline(tolerance = 0.5) {
      if (this.nodes.length === 0) return [];
      const poly = [ { x: this.nodes[0].x, y: this.nodes[0].y } ];

      for (let i = 1; i < this.nodes.length; i++) {
        const prev = this.nodes[i - 1];
        const curr = this.nodes[i];
        const p0 = { x: prev.x, y: prev.y };
        const cp1 = prev.getAbsCpOut();
        const cp2 = curr.getAbsCpIn();
        const p1 = { x: curr.x, y: curr.y };

        const segment = Bezier.subdivideCubic(p0, cp1, cp2, p1, tolerance);
        for (let s = 1; s < segment.length; s++) {
          poly.push(segment[s]);
        }
      }

      if (this.closed && this.nodes.length > 2) {
        const last = this.nodes[this.nodes.length - 1];
        const first = this.nodes[0];
        const segment = Bezier.subdivideCubic(
          { x: last.x, y: last.y },
          last.getAbsCpOut(),
          first.getAbsCpIn(),
          { x: first.x, y: first.y },
          tolerance
        );
        for (let s = 1; s < segment.length; s++) {
          poly.push(segment[s]);
        }
      }

      return poly;
    }

    toPath() {
      return this;
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      for (const n of this.nodes) {
        n.x += dx;
        n.y += dy;
      }
    }

    move(dx, dy) {
      super.move(dx, dy);
      for (const n of this.nodes) {
        n.x += dx;
        n.y += dy;
      }
      let attachedText = null;
      if (this.doc && this.doc.objects) {
        attachedText = this.doc.objects.find(o => o.type === 'text' && o.pathId === this.id);
      } else if (typeof window !== 'undefined' && window.doc && window.doc.objects) {
        attachedText = window.doc.objects.find(o => o.type === 'text' && o.pathId === this.id);
      }
      if (attachedText) {
        attachedText.x += dx;
        attachedText.y += dy;
      }
    }

    getBounds() {
      if (this.nodes.length === 0) {
        return { minX: this.x, minY: this.y, maxX: this.x, maxY: this.y, width: 0, height: 0 };
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (let i = 1; i < this.nodes.length; i++) {
        const prev = this.nodes[i - 1];
        const curr = this.nodes[i];
        const b = Bezier.cubicBounds(
          { x: prev.x, y: prev.y },
          prev.getAbsCpOut(),
          curr.getAbsCpIn(),
          { x: curr.x, y: curr.y }
        );
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      }

      if (this.closed && this.nodes.length >= 2) {
        const last = this.nodes[this.nodes.length - 1];
        const first = this.nodes[0];
        const b = Bezier.cubicBounds(
          { x: last.x, y: last.y },
          last.getAbsCpOut(),
          first.getAbsCpIn(),
          { x: first.x, y: first.y }
        );
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      }

      for (const n of this.nodes) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }

      if (this.nodes.length === 1) {
        minX = this.nodes[0].x; maxX = this.nodes[0].x;
        minY = this.nodes[0].y; maxY = this.nodes[0].y;
      }

      const sw = this.stroke && this.stroke !== 'none' ? this.strokeWidth / 2 : 0;
      return {
        minX: minX - sw,
        minY: minY - sw,
        maxX: maxX + sw,
        maxY: maxY + sw,
        width: Math.max(0, maxX - minX + sw * 2),
        height: Math.max(0, maxY - minY + sw * 2)
      };
    }

    toSVGElement() {
      const d = this.toPathData();
      if (!d) return '';
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const stroke = this.stroke || 'none';
      const sw = this.strokeWidth;
      const op = this.opacity;
      const fillOp = this.fillOpacity;
      const strokeOp = this.strokeOpacity;
      const cap = this.strokeLinecap;
      const join = this.strokeLinejoin;
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      const el = `<path id="${this.id}" d="${d}" fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${strokeOp}" stroke-linecap="${cap}" stroke-linejoin="${join}" opacity="${op}"${dash}${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    simplify(tolerance = 2.0, fitCurves = true) {
      if (this.nodes.length <= 2) return this;
      const poly = this.toPolyline(0.5);
      if (poly.length < 3) return this;

      if (!fitCurves) {
        const reduced = Bezier.simplifyRDP(poly, tolerance);
        this.nodes = reduced.map(p => new PathNode(p.x, p.y, null, null, 'corner'));
        return this;
      }

      // Schneider curve fitting
      const segments = Bezier.fitCurve(poly, tolerance);
      if (segments.length === 0) return this;

      const newNodes = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (i === 0) {
          newNodes.push(new PathNode(
            seg.p0.x, seg.p0.y,
            null,
            { x: seg.cp1.x - seg.p0.x, y: seg.cp1.y - seg.p0.y },
            'smooth'
          ));
        } else {
          newNodes[newNodes.length - 1].cpOut = { x: seg.cp1.x - seg.p0.x, y: seg.cp1.y - seg.p0.y };
        }

        newNodes.push(new PathNode(
          seg.p1.x, seg.p1.y,
          { x: seg.cp2.x - seg.p1.x, y: seg.cp2.y - seg.p1.y },
          null,
          'smooth'
        ));
      }

      if (this.closed && newNodes.length > 2) {
        const first = newNodes[0];
        const last = newNodes[newNodes.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 5) {
          first.cpIn = last.cpIn;
          newNodes.pop();
        }
      }

      this.nodes = newNodes;
      return this;
    }

    toJSON() {
      const data = super.toJSON();
      data.closed = this.closed;
      data.nodes = this.nodes.map(n => ({
        x: n.x, y: n.y,
        cpIn: { ...n.cpIn },
        cpOut: { ...n.cpOut },
        type: n.type
      }));
      return data;
    }

    static fromJSON(data) {
      return new SvgPath(data);
    }
  }

  /* =========================================================================
   * SvgCompoundPath (Multiple Sub-Paths / Holes with EvenOdd / NonZero fill)
   * ========================================================================= */

  class SvgCompoundPath extends SvgNode {
    constructor(attributes = {}) {
      super('compoundPath', attributes);
      this.subPaths = [];
      this.fillRule = attributes.fillRule || 'evenodd'; // 'evenodd' or 'nonzero'
      if (attributes.subPaths && Array.isArray(attributes.subPaths)) {
        this.subPaths = attributes.subPaths.map(sp => (sp instanceof SvgPath ? sp : SvgPath.fromJSON(sp)));
      } else if (attributes.d) {
        this.setPathData(attributes.d);
      }
    }

    addSubPath(path) {
      this.subPaths.push(path);
      return path;
    }

    setPathData(d) {
      this.subPaths = [];
      if (!d) return;
      const subDStrings = d.match(/[Mm][^Mm]*/g) || [];
      for (const subD of subDStrings) {
        const p = new SvgPath({ d: subD, closed: /[Zz]/.test(subD) });
        if (p.nodes.length > 0) this.subPaths.push(p);
      }
    }

    toPathData() {
      return this.subPaths.map(p => p.toPathData()).filter(Boolean).join(' ');
    }

    toPolyline(tolerance = 0.5) {
      const all = [];
      for (const sp of this.subPaths) {
        all.push(...sp.toPolyline(tolerance));
      }
      return all;
    }

    toPolylines(tolerance = 0.5) {
      return this.subPaths.map(p => p.toPolyline(tolerance));
    }

    toPath() {
      return this;
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      for (const sp of this.subPaths) {
        if (typeof sp._shiftGeometry === 'function') {
          sp._shiftGeometry(dx, dy);
        } else if (typeof sp.move === 'function') {
          sp.move(dx, dy);
        }
      }
    }

    move(dx, dy) {
      super.move(dx, dy);
      for (const sp of this.subPaths) {
        sp.move(dx, dy);
      }
      let attachedText = null;
      if (this.doc && this.doc.objects) {
        attachedText = this.doc.objects.find(o => o.type === 'text' && o.pathId === this.id);
      } else if (typeof window !== 'undefined' && window.doc && window.doc.objects) {
        attachedText = window.doc.objects.find(o => o.type === 'text' && o.pathId === this.id);
      }
      if (attachedText) {
        attachedText.x += dx;
        attachedText.y += dy;
      }
    }

    getBounds() {
      if (this.subPaths.length === 0) return { minX: this.x, minY: this.y, maxX: this.x, maxY: this.y, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const sp of this.subPaths) {
        const b = sp.getBounds();
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      }
      return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    }

    toSVGElement() {
      const d = this.toPathData();
      if (!d) return '';
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const stroke = this.stroke || 'none';
      const sw = this.strokeWidth;
      const op = this.opacity;
      const fillOp = this.fillOpacity;
      const strokeOp = this.strokeOpacity;
      const cap = this.strokeLinecap;
      const join = this.strokeLinejoin;
      const rule = ` fill-rule="${this.fillRule}"`;
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      const el = `<path id="${this.id}" d="${d}"${rule} fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${strokeOp}" stroke-linecap="${cap}" stroke-linejoin="${join}" opacity="${op}"${dash}${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    simplify(tolerance = 2.0, fitCurves = true) {
      for (const sp of this.subPaths) {
        sp.simplify(tolerance, fitCurves);
      }
      return this;
    }

    toJSON() {
      const data = super.toJSON();
      data.fillRule = this.fillRule;
      data.subPaths = this.subPaths.map(p => p.toJSON());
      return data;
    }

    static fromJSON(data) {
      return new SvgCompoundPath(data);
    }
  }

  /* =========================================================================
   * SvgText Object (Vector Typography)
   * ========================================================================= */

  class SvgText extends SvgNode {
    constructor(attributes = {}) {
      super('text', attributes);
      this.text = attributes.text || 'Wesenho Text';
      this.fontFamily = attributes.fontFamily || 'sans-serif';
      this.fontSize = Number(attributes.fontSize || 36);
      this.fontWeight = attributes.fontWeight || 'normal';
      this.fontStyle = attributes.fontStyle || 'normal';
      this.textAlign = attributes.textAlign || 'left'; // 'left', 'center', 'right'
      this.letterSpacing = Number(attributes.letterSpacing || 0);
      this.pathId = attributes.pathId || null;
      if (!this.fill || (this.fill === 'none' && (!this.stroke || this.stroke === 'none'))) {
        this.fill = '#fabd2f';
      }
    }

    getBounds() {
      if (this.pathId) {
        let pathObj = this.doc ? this.doc.findObject(this.pathId) : null;
        if (!pathObj && this.parent) {
          let root = this.parent;
          while (root.parent) root = root.parent;
          if (typeof root.findObject === 'function') pathObj = root.findObject(this.pathId);
        }
        if (!pathObj && typeof window !== 'undefined' && window.doc) {
          pathObj = window.doc.findObject(this.pathId);
        }
        if (pathObj && typeof pathObj.getBounds === 'function') {
          return pathObj.getBounds();
        }
      }
      const approxCharWidth = this.fontSize * 0.55;
      const w = Math.max(10, this.text.length * (approxCharWidth + this.letterSpacing));
      const h = this.fontSize * 1.1;
      let minX = this.x;
      if (this.textAlign === 'center') minX = this.x - w / 2;
      else if (this.textAlign === 'right') minX = this.x - w;
      const minY = this.y - this.fontSize * 0.85;
      return {
        minX,
        minY,
        maxX: minX + w,
        maxY: minY + h,
        width: w,
        height: h
      };
    }

    _localHitTest(px, py, tolerance = 6) {
      if (!this.visible || this.locked) return false;
      // Text attached to path is selectable ONLY via layer manager
      if (this.pathId) return false;
      const b = this.getBounds();
      return px >= b.minX - tolerance && px <= b.maxX + tolerance && py >= b.minY - tolerance && py <= b.maxY + tolerance;
    }

    getOrigin() {
      const b = this.getBounds();
      return {
        x: this.originX !== undefined ? this.originX : (b.minX + b.width / 2),
        y: this.originY !== undefined ? this.originY : (b.minY + b.height / 2)
      };
    }

    toPath() {
      const subPaths = [];
      const baseAttributes = {
        fill: this.fill,
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
        opacity: this.opacity
      };

      if (typeof document !== 'undefined' && document.createElement) {
        const off = document.createElement('canvas');
        const pad = 10;
        const sz = Math.max(12, Math.round(this.fontSize));
        off.width = sz * 2 + pad * 2;
        off.height = sz * 2 + pad * 2;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          const b = this.getBounds();
          let curX = b.minX;

          for (let i = 0; i < this.text.length; i++) {
            const ch = this.text[i];
            if (ch === ' ') {
              curX += this.fontSize * 0.3 + this.letterSpacing;
              continue;
            }

            ctx.clearRect(0, 0, off.width, off.height);
            ctx.font = `${this.fontStyle} ${this.fontWeight} ${sz}px ${this.fontFamily}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#000000';
            const drawX = pad;
            const drawY = sz + pad;
            ctx.fillText(ch, drawX, drawY);

            const metrics = ctx.measureText(ch);
            const chW = Math.ceil(metrics.width || sz * 0.6);
            const imgW = Math.min(off.width, chW + pad * 2);
            const imgH = off.height;
            const imgData = ctx.getImageData(0, 0, imgW, imgH);
            const data = imgData.data;

            const visited = new Uint8Array(imgW * imgH);
            for (let y = 1; y < imgH - 1; y++) {
              for (let x = 1; x < imgW - 1; x++) {
                const idx = (y * imgW + x) * 4;
                if (data[idx + 3] > 120 && !visited[y * imgW + x]) {
                  const nUp = data[((y - 1) * imgW + x) * 4 + 3] <= 120;
                  const nDown = data[((y + 1) * imgW + x) * 4 + 3] <= 120;
                  const nLeft = data[(y * imgW + x - 1) * 4 + 3] <= 120;
                  const nRight = data[(y * imgW + x + 1) * 4 + 3] <= 120;
                  if (nUp || nDown || nLeft || nRight) {
                    const contour = [];
                    let cx = x, cy = y;
                    let dir = 0;
                    const dxs = [1, 0, -1, 0];
                    const dys = [0, 1, 0, -1];
                    let steps = 0;

                    while (steps++ < 1500) {
                      contour.push({ x: cx, y: cy });
                      visited[cy * imgW + cx] = 1;

                      let foundNext = false;
                      for (let d = 0; d < 4; d++) {
                        const nextDir = (dir + 3 + d) % 4;
                        const nx = cx + dxs[nextDir];
                        const ny = cy + dys[nextDir];
                        if (nx >= 0 && nx < imgW && ny >= 0 && ny < imgH && data[(ny * imgW + nx) * 4 + 3] > 120) {
                          cx = nx;
                          cy = ny;
                          dir = nextDir;
                          foundNext = true;
                          break;
                        }
                      }
                      if (!foundNext || (cx === x && cy === y)) break;
                    }

                    if (contour.length >= 6) {
                      const simplified = [];
                      const stepSize = Math.max(1, Math.floor(contour.length / 32));
                      for (let k = 0; k < contour.length; k += stepSize) {
                        simplified.push(contour[k]);
                      }
                      const charPath = new SvgPath({
                        ...baseAttributes,
                        name: `Glyph '${ch}'`,
                        closed: true
                      });
                      for (const pt of simplified) {
                        const wx = curX + (pt.x - drawX);
                        const wy = this.y + (pt.y - drawY);
                        charPath.addNode(wx, wy, null, null, 'smooth');
                      }
                      subPaths.push(charPath);
                    }
                  }
                }
              }
            }
            curX += chW + this.letterSpacing;
          }
        }
      }

      // Fallback vector path
      if (subPaths.length === 0) {
        const b = this.getBounds();
        let curX = b.minX;
        for (let i = 0; i < this.text.length; i++) {
          const char = this.text[i];
          if (char === ' ') {
            curX += this.fontSize * 0.3 + this.letterSpacing;
            continue;
          }
          const cw = this.fontSize * 0.52;
          const ch = this.fontSize * 0.75;
          const cy = b.minY + this.fontSize * 0.1;
          const charPath = new SvgPath({
            ...baseAttributes,
            name: `Glyph '${char}'`,
            closed: true
          });
          charPath.addNode(curX + cw / 2, cy, null, null, 'smooth');
          charPath.addNode(curX + cw, cy + ch / 2, null, null, 'smooth');
          charPath.addNode(curX + cw / 2, cy + ch, null, null, 'smooth');
          charPath.addNode(curX, cy + ch / 2, null, null, 'smooth');
          subPaths.push(charPath);
          curX += cw + this.fontSize * 0.08 + this.letterSpacing;
        }
      }

      const path = new SvgCompoundPath({
        name: `Path (${this.text})`,
        ...baseAttributes
      });
      for (const sp of subPaths) {
        path.addSubPath(sp);
      }
      return path;
    }

    toSVGElement() {
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const stroke = this.stroke && this.stroke !== 'none' ? ` stroke="${this.stroke}" stroke-width="${this.strokeWidth}"` : '';
      const anchor = this.textAlign === 'center' ? 'middle' : (this.textAlign === 'right' ? 'end' : 'start');
      const letterSpace = this.letterSpacing ? ` letter-spacing="${this.letterSpacing}px"` : '';

      let textEl = '';
      if (this.pathId) {
        textEl = `<text id="${this.id}" font-family="${this.fontFamily}" font-size="${this.fontSize}" font-weight="${this.fontWeight}" font-style="${this.fontStyle}" text-anchor="${anchor}" fill="${fill}" opacity="${this.opacity}"${stroke}${letterSpace}${filter}${this.getExtraSVGAttributes(false)}><textPath href="#${this.pathId}" xlink:href="#${this.pathId}">${escapeXml(this.text)}</textPath></text>`;
      } else {
        textEl = `<text id="${this.id}" x="${this.x}" y="${this.y}" font-family="${this.fontFamily}" font-size="${this.fontSize}" font-weight="${this.fontWeight}" font-style="${this.fontStyle}" text-anchor="${anchor}" fill="${fill}" opacity="${this.opacity}"${stroke}${letterSpace}${filter}${this.getExtraSVGAttributes(false)}>${escapeXml(this.text)}</text>`;
      }
      return this.wrapClipPath(textEl);
    }

    toJSON() {
      const data = super.toJSON();
      data.text = this.text;
      data.fontFamily = this.fontFamily;
      data.fontSize = this.fontSize;
      data.fontWeight = this.fontWeight;
      data.fontStyle = this.fontStyle;
      data.textAlign = this.textAlign;
      data.letterSpacing = this.letterSpacing;
      data.pathId = this.pathId;
      return data;
    }

    static fromJSON(data) {
      return new SvgText(data);
    }
  }

  /* =========================================================================
   * SvgGradient (Linear & Radial Gradients)
   * ========================================================================= */

  class SvgGradient {
    constructor(type, attributes = {}) {
      this.id = attributes.id || generateId('grad');
      this.type = type;
      this.stops = attributes.stops && Array.isArray(attributes.stops)
        ? attributes.stops.map(s => ({
            offset: Number(s.offset !== undefined ? s.offset : 0),
            color: s.color || '#fabd2f',
            opacity: Number(s.opacity !== undefined ? s.opacity : 1.0)
          }))
        : [
            { offset: 0, color: '#fe8019', opacity: 1.0 },
            { offset: 1, color: '#fabd2f', opacity: 1.0 }
          ];
    }

    addStop(offset, color, opacity = 1.0) {
      this.stops.push({ offset: Number(offset), color, opacity: Number(opacity) });
      this.stops.sort((a, b) => a.offset - b.offset);
    }

    toSVGElement() {
      return '';
    }
  }

  class SvgLinearGradient extends SvgGradient {
    constructor(attributes = {}) {
      super('linear', attributes);
      this.x1 = attributes.x1 !== undefined ? attributes.x1 : '0%';
      this.y1 = attributes.y1 !== undefined ? attributes.y1 : '0%';
      this.x2 = attributes.x2 !== undefined ? attributes.x2 : '100%';
      this.y2 = attributes.y2 !== undefined ? attributes.y2 : '0%';
    }

    toSVGElement() {
      const stopsXml = this.stops.map(s =>
        `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${s.color}" stop-opacity="${s.opacity}" />`
      ).join('\n    ');
      return `<linearGradient id="${this.id}" x1="${this.x1}" y1="${this.y1}" x2="${this.x2}" y2="${this.y2}">\n    ${stopsXml}\n  </linearGradient>`;
    }
  }

  class SvgRadialGradient extends SvgGradient {
    constructor(attributes = {}) {
      super('radial', attributes);
      this.cx = attributes.cx !== undefined ? attributes.cx : '50%';
      this.cy = attributes.cy !== undefined ? attributes.cy : '50%';
      this.r = attributes.r !== undefined ? attributes.r : '50%';
      this.fx = attributes.fx !== undefined ? attributes.fx : this.cx;
      this.fy = attributes.fy !== undefined ? attributes.fy : this.cy;
    }

    toSVGElement() {
      const stopsXml = this.stops.map(s =>
        `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${s.color}" stop-opacity="${s.opacity}" />`
      ).join('\n    ');
      return `<radialGradient id="${this.id}" cx="${this.cx}" cy="${this.cy}" r="${this.r}" fx="${this.fx}" fy="${this.fy}">\n    ${stopsXml}\n  </radialGradient>`;
    }
  }

  /* =========================================================================
   * SvgRect Object
   * ========================================================================= */

  class SvgRect extends SvgNode {
    constructor(attributes = {}) {
      super('rect', attributes);
      this.width = Number(attributes.width || 100);
      this.height = Number(attributes.height || 60);
      this.rx = Number(attributes.rx || 0);
      this.ry = Number(attributes.ry || 0);
    }

    getBounds() {
      const sw = this.stroke && this.stroke !== 'none' ? this.strokeWidth / 2 : 0;
      return {
        minX: this.x - sw,
        minY: this.y - sw,
        maxX: this.x + this.width + sw,
        maxY: this.y + this.height + sw,
        width: this.width + sw * 2,
        height: this.height + sw * 2
      };
    }

    toPolyline(tolerance = 0.5) {
      return this.toPath().toPolyline(tolerance);
    }

    toPath() {
      const path = new SvgPath({
        ...this.toJSON(),
        type: 'path'
      });
      path.closed = true;
      const x = this.x, y = this.y, w = this.width, h = this.height;
      const rx = Math.max(0, Math.min(this.rx || 0, w / 2));
      const ry = Math.max(0, Math.min(this.ry || rx, h / 2));

      if (rx > 0 && ry > 0) {
        const k = 0.5522847498;
        path.addNode(x + rx, y, { x: -rx * k, y: 0 }, null, 'smooth');
        path.addNode(x + w - rx, y, null, { x: rx * k, y: 0 }, 'smooth');
        path.addNode(x + w, y + ry, { x: 0, y: -ry * k }, null, 'smooth');
        path.addNode(x + w, y + h - ry, null, { x: 0, y: ry * k }, 'smooth');
        path.addNode(x + w - rx, y + h, { x: rx * k, y: 0 }, null, 'smooth');
        path.addNode(x + rx, y + h, null, { x: -rx * k, y: 0 }, 'smooth');
        path.addNode(x, y + h - ry, { x: 0, y: ry * k }, null, 'smooth');
        path.addNode(x, y + ry, null, { x: 0, y: -ry * k }, 'smooth');
      } else {
        path.addNode(x, y, null, null, 'corner');
        path.addNode(x + w, y, null, null, 'corner');
        path.addNode(x + w, y + h, null, null, 'corner');
        path.addNode(x, y + h, null, null, 'corner');
      }
      return path;
    }

    toSVGElement() {
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const stroke = this.stroke || 'none';
      const rxAttr = this.rx > 0 ? ` rx="${this.rx}"` : '';
      const ryAttr = this.ry > 0 ? ` ry="${this.ry}"` : '';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      const el = `<rect id="${this.id}" x="${this.x}" y="${this.y}" width="${this.width}" height="${this.height}"${rxAttr}${ryAttr} fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash}${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    toJSON() {
      const data = super.toJSON();
      data.width = this.width;
      data.height = this.height;
      data.rx = this.rx;
      data.ry = this.ry;
      return data;
    }

    static fromJSON(data) {
      return new SvgRect(data);
    }
  }

  /* =========================================================================
   * SvgCircle & SvgEllipse Objects
   * ========================================================================= */

  class SvgEllipse extends SvgNode {
    constructor(attributes = {}) {
      super('ellipse', attributes);
      this.cx = Number(attributes.cx !== undefined ? attributes.cx : this.x);
      this.cy = Number(attributes.cy !== undefined ? attributes.cy : this.y);
      this.rx = Number(attributes.rx || 50);
      this.ry = Number(attributes.ry || 30);
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      this.cx += dx;
      this.cy += dy;
    }

    move(dx, dy) {
      super.move(dx, dy);
      this.cx += dx;
      this.cy += dy;
    }

    getBounds() {
      const sw = this.stroke && this.stroke !== 'none' ? this.strokeWidth / 2 : 0;
      return {
        minX: this.cx - this.rx - sw,
        minY: this.cy - this.ry - sw,
        maxX: this.cx + this.rx + sw,
        maxY: this.cy + this.ry + sw,
        width: this.rx * 2 + sw * 2,
        height: this.ry * 2 + sw * 2
      };
    }

    toPolyline(tolerance = 0.5) {
      return this.toPath().toPolyline(tolerance);
    }

    toPath() {
      const path = new SvgPath({
        ...this.toJSON(),
        type: 'path'
      });
      path.closed = true;
      const k = 0.5522847498;
      const cx = this.cx, cy = this.cy, rx = this.rx, ry = this.ry;
      const ox = rx * k, oy = ry * k;

      path.addNode(cx, cy - ry, { x: -ox, y: 0 }, { x: ox, y: 0 }, 'smooth');
      path.addNode(cx + rx, cy, { x: 0, y: -oy }, { x: 0, y: oy }, 'smooth');
      path.addNode(cx, cy + ry, { x: ox, y: 0 }, { x: -ox, y: 0 }, 'smooth');
      path.addNode(cx - rx, cy, { x: 0, y: oy }, { x: 0, y: -oy }, 'smooth');
      return path;
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      this.cx += dx;
      this.cy += dy;
    }

    move(dx, dy) {
      super.move(dx, dy);
      this.cx += dx;
      this.cy += dy;
    }

    toSVGElement() {
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const stroke = this.stroke || 'none';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      const el = `<ellipse id="${this.id}" cx="${this.cx}" cy="${this.cy}" rx="${this.rx}" ry="${this.ry}" fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash}${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    toJSON() {
      const data = super.toJSON();
      data.cx = this.cx;
      data.cy = this.cy;
      data.rx = this.rx;
      data.ry = this.ry;
      return data;
    }

    static fromJSON(data) {
      return new SvgEllipse(data);
    }
  }

  class SvgCircle extends SvgEllipse {
    constructor(attributes = {}) {
      const r = Number(attributes.r || 40);
      super({ ...attributes, rx: r, ry: r });
      this.type = 'circle';
      this.r = r;
    }

    toSVGElement() {
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const stroke = this.stroke || 'none';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';
      const el = `<circle id="${this.id}" cx="${this.cx}" cy="${this.cy}" r="${this.r}" fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash}${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    toJSON() {
      const data = super.toJSON();
      data.r = this.r;
      return data;
    }

    static fromJSON(data) {
      return new SvgCircle(data);
    }
  }

  /* =========================================================================
   * SvgLine, SvgPolyline, SvgPolygon Objects
   * ========================================================================= */

  class SvgLine extends SvgNode {
    constructor(attributes = {}) {
      super('line', attributes);
      this.x1 = Number(attributes.x1 || 0);
      this.y1 = Number(attributes.y1 || 0);
      this.x2 = Number(attributes.x2 !== undefined ? attributes.x2 : 100);
      this.y2 = Number(attributes.y2 !== undefined ? attributes.y2 : 100);
      this.fill = 'none';
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      this.x1 += dx;
      this.y1 += dy;
      this.x2 += dx;
      this.y2 += dy;
    }

    move(dx, dy) {
      super.move(dx, dy);
      this.x1 += dx;
      this.y1 += dy;
      this.x2 += dx;
      this.y2 += dy;
      let attachedText = null;
      if (this.doc && this.doc.objects) {
        attachedText = this.doc.objects.find(o => o.type === 'text' && o.pathId === this.id);
      } else if (typeof window !== 'undefined' && window.doc && window.doc.objects) {
        attachedText = window.doc.objects.find(o => o.type === 'text' && o.pathId === this.id);
      }
      if (attachedText) {
        attachedText.x += dx;
        attachedText.y += dy;
      }
    }

    getBounds() {
      const sw = this.strokeWidth / 2;
      return {
        minX: Math.min(this.x1, this.x2) - sw,
        minY: Math.min(this.y1, this.y2) - sw,
        maxX: Math.max(this.x1, this.x2) + sw,
        maxY: Math.max(this.y1, this.y2) + sw,
        width: Math.abs(this.x2 - this.x1) + sw * 2,
        height: Math.abs(this.y2 - this.y1) + sw * 2
      };
    }

    toPolyline() {
      return [{ x: this.x1, y: this.y1 }, { x: this.x2, y: this.y2 }];
    }

    toPath() {
      const path = new SvgPath({ ...this.toJSON(), type: 'path' });
      path.closed = false;
      path.addNode(this.x1, this.y1, null, null, 'corner');
      path.addNode(this.x2, this.y2, null, null, 'corner');
      return path;
    }

    toSVGElement() {
      const stroke = this.stroke || '#000';
      const filter = this.getSvgFilterAttribute();
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';
      const el = `<line id="${this.id}" x1="${this.x1}" y1="${this.y1}" x2="${this.x2}" y2="${this.y2}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash}${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    toJSON() {
      const data = super.toJSON();
      data.x1 = this.x1;
      data.y1 = this.y1;
      data.x2 = this.x2;
      data.y2 = this.y2;
      return data;
    }

    static fromJSON(data) {
      return new SvgLine(data);
    }
  }

  class SvgPolyline extends SvgNode {
    constructor(attributes = {}) {
      super('polyline', attributes);
      this.points = [];
      if (typeof attributes.points === 'string') {
        const coords = attributes.points.trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i < coords.length; i += 2) {
          if (!isNaN(coords[i]) && !isNaN(coords[i + 1])) {
            this.points.push({ x: coords[i], y: coords[i + 1] });
          }
        }
      } else if (Array.isArray(attributes.points)) {
        this.points = attributes.points.map(p => ({ x: Number(p.x), y: Number(p.y) }));
      }
    }

    toPolyline() {
      return this.points.map(p => ({ x: p.x, y: p.y }));
    }

    toPath() {
      const path = new SvgPath({ ...this.toJSON(), type: 'path' });
      path.closed = false;
      for (const p of this.points) {
        path.addNode(p.x, p.y, null, null, 'corner');
      }
      return path;
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      for (const p of this.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    move(dx, dy) {
      super.move(dx, dy);
      for (const p of this.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    getBounds() {
      if (this.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of this.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const sw = this.strokeWidth / 2;
      return { minX: minX - sw, minY: minY - sw, maxX: maxX + sw, maxY: maxY + sw, width: maxX - minX + sw * 2, height: maxY - minY + sw * 2 };
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      for (const p of this.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    move(dx, dy) {
      super.move(dx, dy);
      for (const p of this.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    toSVGElement() {
      const pts = this.points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const el = `<polyline id="${this.id}" points="${pts}" fill="${fill}" stroke="${this.stroke}" stroke-width="${this.strokeWidth}" opacity="${this.opacity}"${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    toJSON() {
      const data = super.toJSON();
      data.points = this.points.map(p => ({ ...p }));
      return data;
    }

    static fromJSON(data) {
      return new SvgPolyline(data);
    }
  }

  class SvgPolygon extends SvgPolyline {
    constructor(attributes = {}) {
      super(attributes);
      this.type = 'polygon';
    }

    toPath() {
      const path = super.toPath();
      path.closed = true;
      return path;
    }

    toSVGElement() {
      const pts = this.points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      const fill = this.getSvgFillAttribute();
      const filter = this.getSvgFilterAttribute();
      const el = `<polygon id="${this.id}" points="${pts}" fill="${fill}" stroke="${this.stroke}" stroke-width="${this.strokeWidth}" opacity="${this.opacity}"${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    static fromJSON(data) {
      return new SvgPolygon(data);
    }
  }

  /* =========================================================================
   * SvgGroup Object
   * ========================================================================= */

  class SvgGroup extends SvgNode {
    constructor(attributes = {}) {
      super('group', attributes);
      this.children = [];
      this.collapsed = attributes.collapsed !== undefined ? !!attributes.collapsed : false;

      if (attributes.children && Array.isArray(attributes.children)) {
        this.children = attributes.children.map(c => {
          const child = SvgNode.fromJSON(c);
          child.parent = this;
          return child;
        });
      }
    }

    add(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    }

    addChild(child) {
      return this.add(child);
    }

    remove(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        child.parent = null;
        return this.children.splice(idx, 1)[0];
      }
      return null;
    }

    replaceChild(oldId, newChild) {
      const idx = this.children.findIndex(c => c.id === oldId);
      if (idx !== -1) {
        newChild.parent = this;
        this.children[idx] = newChild;
        return true;
      }
      return false;
    }

    _shiftGeometry(dx, dy) {
      super._shiftGeometry(dx, dy);
      for (const child of this.children) {
        if (typeof child._shiftGeometry === 'function') {
          child._shiftGeometry(dx, dy);
        } else if (typeof child.move === 'function') {
          child.move(dx, dy);
        } else if (child.type === 'rect' || child.type === 'image' || child.type === 'text') {
          child.x += dx; child.y += dy;
        } else if (child.type === 'ellipse' || child.type === 'circle') {
          child.cx += dx; child.cy += dy;
        } else if (child.type === 'line') {
          child.x1 += dx; child.y1 += dy; child.x2 += dx; child.y2 += dy;
        } else if (child.type === 'path') {
          for (const n of child.nodes) {
            n.x += dx; n.y += dy;
          }
        } else if (child.type === 'polygon' || child.type === 'polyline') {
          for (const p of child.points) {
            p.x += dx; p.y += dy;
          }
        }
      }
    }

    move(dx, dy) {
      super.move(dx, dy);
      for (const child of this.children) {
        if (typeof child.move === 'function') {
          child.move(dx, dy);
        } else if (child.type === 'rect' || child.type === 'image' || child.type === 'text') {
          child.x += dx; child.y += dy;
        } else if (child.type === 'ellipse' || child.type === 'circle') {
          child.cx += dx; child.cy += dy;
        } else if (child.type === 'line') {
          child.x1 += dx; child.y1 += dy; child.x2 += dx; child.y2 += dy;
        } else if (child.type === 'path') {
          for (const n of child.nodes) {
            n.x += dx; n.y += dy;
          }
        } else if (child.type === 'polygon' || child.type === 'polyline') {
          for (const p of child.points) {
            p.x += dx; p.y += dy;
          }
        }
      }
    }

    _localHitTest(px, py, tolerance = 6) {
      if (!this.visible || this.locked) return false;
      for (let i = this.children.length - 1; i >= 0; i--) {
        const c = this.children[i];
        if (c.visible && !c.locked && c.hitTest(px, py, tolerance)) {
          return true;
        }
      }
      return false;
    }

    getBounds() {
      if (this.children.length === 0) return { minX: this.x, minY: this.y, maxX: this.x, maxY: this.y, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of this.children) {
        if (!c.visible) continue;
        const b = c.getBounds();
        minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
      }
      if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
      return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    }

    toSVGElement() {
      const kids = this.children
        .filter(c => c.visible !== false)
        .map(c => c.toSVGElement())
        .join('\n    ');
      const groupEl = `<g id="${this.id}" opacity="${this.opacity}"${this.getExtraSVGAttributes(false)}>\n    ${kids}\n  </g>`;
      return this.wrapClipPath(groupEl);
    }

    toJSON() {
      const data = super.toJSON();
      data.collapsed = this.collapsed;
      data.children = this.children.map(c => c.toJSON());
      return data;
    }

    static fromJSON(data) {
      return new SvgGroup(data);
    }
  }

  /* =========================================================================
   * SvgImage Object
   * ========================================================================= */

  class SvgImage extends SvgNode {
    constructor(attributes = {}) {
      super('image', attributes);
      this.width = Number(attributes.width || 100);
      this.height = Number(attributes.height || 100);
      this.src = attributes.src || '';
      this._imgElement = attributes._imgElement || null;

      if (!this._imgElement && this.src && typeof Image !== 'undefined') {
        const img = new Image();
        img.onload = () => {
          this._imgElement = img;
          if (typeof window !== 'undefined' && typeof window.renderSvgEditor === 'function') {
            window.renderSvgEditor();
          }
        };
        img.src = this.src;
      }
    }

    getBounds() {
      return {
        minX: this.x,
        minY: this.y,
        maxX: this.x + this.width,
        maxY: this.y + this.height,
        width: this.width,
        height: this.height
      };
    }

    toSVGElement() {
      const href = this.src ? ` href="${escapeXml(this.src)}" xlink:href="${escapeXml(this.src)}"` : '';
      const filter = this.getSvgFilterAttribute();
      const el = `<image id="${this.id}" x="${this.x}" y="${this.y}" width="${this.width}" height="${this.height}"${href} opacity="${this.opacity}" preserveAspectRatio="none"${filter}${this.getExtraSVGAttributes(false)} />`;
      return this.wrapClipPath(el);
    }

    toJSON() {
      const data = super.toJSON();
      data.width = this.width;
      data.height = this.height;
      data.src = this.src;
      return data;
    }

    static fromJSON(data) {
      return new SvgImage(data);
    }
  }

  /* =========================================================================
   * SvgDocument (Root Scene Graph Container)
   * ========================================================================= */

  class SvgDocument {
    constructor(width = 800, height = 600, viewBox = null) {
      this.width = Number(width);
      this.height = Number(height);
      this.viewBox = viewBox || `0 0 ${this.width} ${this.height}`;
      this.backgroundColor = '#1d2021';
      this.objects = []; // In z-order: index 0 is background, index N is top
      this.defs = new Map(); // Gradient & Filter definitions
      this.selectedIds = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this.maxHistory = 50;
    }

    clear() {
      this.pushHistory('Clear Document');
      this.objects = [];
      this.defs.clear();
      this.selectedIds.clear();
    }

    addObject(obj, pushHistory = true) {
      if (pushHistory) this.pushHistory(`Add ${obj.name}`);
      obj.doc = this;
      if (obj.type === 'group' && obj.children) {
        const setDocRec = (kids) => {
          for (const k of kids) {
            k.doc = this;
            if (k.type === 'group' && k.children) setDocRec(k.children);
          }
        };
        setDocRec(obj.children);
      }
      this.objects.push(obj);
      return obj;
    }

    insertObject(index, obj, pushHistory = true) {
      if (pushHistory) this.pushHistory(`Insert ${obj.name}`);
      obj.doc = this;
      if (obj.type === 'group' && obj.children) {
        const setDocRec = (kids) => {
          for (const k of kids) {
            k.doc = this;
            if (k.type === 'group' && k.children) setDocRec(k.children);
          }
        };
        setDocRec(obj.children);
      }
      this.objects.splice(index, 0, obj);
      return obj;
    }

    removeObject(id, pushHistory = true) {
      const obj = this.findObject(id);
      if (!obj) return null;
      if (pushHistory) this.pushHistory(`Remove ${obj.name}`);
      this.selectedIds.delete(id);

      // Clean up dangling references across document
      const cleanRefs = (list) => {
        for (const o of list) {
          if (o.clipPathId === id) o.clipPathId = null;
          if (o.pathId === id) o.pathId = null;
          if (o.type === 'group' && o.children) cleanRefs(o.children);
        }
      };
      cleanRefs(this.objects);

      if (obj.parent && typeof obj.parent.remove === 'function') {
        return obj.parent.remove(obj);
      }
      const idx = this.objects.indexOf(obj);
      if (idx !== -1) {
        return this.objects.splice(idx, 1)[0];
      }
      return null;
    }

    findObject(id) {
      const findRecursive = (list) => {
        for (const o of list) {
          if (o.id === id) return o;
          if (o.type === 'group' && o.children) {
            const res = findRecursive(o.children);
            if (res) return res;
          }
        }
        return null;
      };
      return findRecursive(this.objects);
    }

    /** Group Selected Objects */
    groupSelected(groupName = null) {
      const selected = this.getSelectedObjects();
      if (selected.length === 0) return null;

      let insertIdx = 0;
      for (const item of selected) {
        const idx = this.objects.indexOf(item);
        if (idx > insertIdx) insertIdx = idx;
      }

      const group = new SvgGroup({
        name: groupName || `Group ${generateId('grp').split('_')[1]}`
      });

      for (const item of selected) {
        if (item.parent && typeof item.parent.remove === 'function') {
          item.parent.remove(item);
        } else {
          const idx = this.objects.indexOf(item);
          if (idx !== -1) {
            this.objects.splice(idx, 1);
          }
        }
        group.add(item);
      }

      insertIdx = Math.min(insertIdx, this.objects.length);
      this.objects.splice(insertIdx, 0, group);

      this.selectedIds.clear();
      this.selectedIds.add(group.id);
      this.pushHistory('Group Objects');
      return group;
    }

    /** Ungroup Selected Groups */
    ungroupSelected() {
      const selected = this.getSelectedObjects();
      const groups = selected.filter(o => o.type === 'group');
      if (groups.length === 0) return false;

      this.selectedIds.clear();

      for (const grp of groups) {
        const parentList = grp.parent ? grp.parent.children : this.objects;
        const idx = parentList.indexOf(grp);
        if (idx !== -1) {
          parentList.splice(idx, 1);
          const kids = [...grp.children];
          for (let k = 0; k < kids.length; k++) {
            kids[k].parent = grp.parent || null;
            parentList.splice(idx + k, 0, kids[k]);
            this.selectedIds.add(kids[k].id);
          }
        }
      }

      this.pushHistory('Ungroup Objects');
      return true;
    }

    /** Z-Index Ordering (Works on Root and Inside Groups) */
    bringForward(id) {
      const targetId = id || (this.getSelectedObjects()[0]?.id);
      const obj = this.findObject(targetId);
      if (!obj) return false;
      const list = obj.parent ? obj.parent.children : this.objects;
      const idx = list.indexOf(obj);
      if (idx !== -1 && idx < list.length - 1) {
        this.pushHistory('Bring Forward');
        const [item] = list.splice(idx, 1);
        list.splice(idx + 1, 0, item);
        return true;
      }
      return false;
    }

    sendBackward(id) {
      const targetId = id || (this.getSelectedObjects()[0]?.id);
      const obj = this.findObject(targetId);
      if (!obj) return false;
      const list = obj.parent ? obj.parent.children : this.objects;
      const idx = list.indexOf(obj);
      if (idx > 0) {
        this.pushHistory('Send Backward');
        const [item] = list.splice(idx, 1);
        list.splice(idx - 1, 0, item);
        return true;
      }
      return false;
    }

    bringToFront(id) {
      const targetId = id || (this.getSelectedObjects()[0]?.id);
      const obj = this.findObject(targetId);
      if (!obj) return false;
      const list = obj.parent ? obj.parent.children : this.objects;
      const idx = list.indexOf(obj);
      if (idx !== -1 && idx < list.length - 1) {
        this.pushHistory('Bring to Front');
        const [item] = list.splice(idx, 1);
        list.push(item);
        return true;
      }
      return false;
    }

    sendToBack(id) {
      const targetId = id || (this.getSelectedObjects()[0]?.id);
      const obj = this.findObject(targetId);
      if (!obj) return false;
      const list = obj.parent ? obj.parent.children : this.objects;
      const idx = list.indexOf(obj);
      if (idx > 0) {
        this.pushHistory('Send to Back');
        const [item] = list.splice(idx, 1);
        list.unshift(item);
        return true;
      }
      return false;
    }

    isDescendant(parent, target) {
      if (!parent || parent.type !== 'group' || !parent.children) return false;
      for (const c of parent.children) {
        if (c === target) return true;
        if (c.type === 'group' && this.isDescendant(c, target)) return true;
      }
      return false;
    }

    /**
     * Tree Reordering (Drag & Drop in Layers Tree)
     * @param {string} draggedId
     * @param {string} targetId
     * @param {'above'|'below'|'inside'} dropPos - 'above' (higher z-index), 'below' (lower z-index), 'inside' (into group)
     */
    reorderTreeItem(draggedId, targetId, dropPos = 'above', pushHistory = true) {
      if (!draggedId || !targetId || String(draggedId) === String(targetId)) return false;
      const draggedObj = this.findObject(draggedId);
      const targetObj = this.findObject(targetId);
      if (!draggedObj || !targetObj) return false;

      // Prevent dragging a group into itself or its own descendants
      if (draggedObj.type === 'group' && (this.isDescendant(draggedObj, targetObj) || draggedObj === targetObj)) {
        return false;
      }

      if (pushHistory) this.pushHistory('Reorder Object');

      // 1. Remove draggedObj from current parent list
      if (draggedObj.parent && typeof draggedObj.parent.remove === 'function') {
        draggedObj.parent.remove(draggedObj);
      } else {
        const srcIdx = this.objects.indexOf(draggedObj);
        if (srcIdx !== -1) this.objects.splice(srcIdx, 1);
      }

      // 2. Insert into target position
      if (dropPos === 'inside' && targetObj.type === 'group') {
        targetObj.add(draggedObj);
        return true;
      }

      const targetList = targetObj.parent ? targetObj.parent.children : this.objects;
      const targetIdx = targetList.indexOf(targetObj);
      draggedObj.parent = targetObj.parent || null;

      if (dropPos === 'above') {
        targetList.splice(targetIdx + 1, 0, draggedObj);
      } else if (dropPos === 'below') {
        targetList.splice(targetIdx, 0, draggedObj);
      } else {
        targetList.splice(targetIdx + 1, 0, draggedObj);
      }

      return true;
    }

    /** Selection */
    select(id, multi = false) {
      if (!multi) this.selectedIds.clear();
      this.selectedIds.add(id);
    }

    deselect(id) {
      this.selectedIds.delete(id);
    }

    clearSelection() {
      this.selectedIds.clear();
    }

    getSelectedObjects() {
      const res = [];
      const collect = (list) => {
        for (const o of list) {
          if (this.selectedIds.has(o.id)) res.push(o);
          if (o.type === 'group' && o.children) collect(o.children);
        }
      };
      collect(this.objects);
      return res;
    }

    /** Convert Selected Shapes (Rect, Circle, Ellipse, Line) to Editable Bézier Paths */
    convertSelectedToPath() {
      const selected = this.getSelectedObjects();
      let converted = false;
      for (const obj of selected) {
        if (typeof obj.toPath === 'function' && obj.type !== 'path' && obj.type !== 'image' && obj.type !== 'text' && obj.type !== 'group') {
          if (!converted) {
            this.pushHistory('Convert to Path');
            converted = true;
          }
          const pathObj = obj.toPath();
          if (obj.parent && typeof obj.parent.replaceChild === 'function') {
            obj.parent.replaceChild(obj.id, pathObj);
          } else {
            const idx = this.objects.indexOf(obj);
            if (idx !== -1) {
              this.objects[idx] = pathObj;
            }
          }
          this.selectedIds.delete(obj.id);
          this.selectedIds.add(pathObj.id);
        }
      }
      return converted;
    }

    /**
     * Perform Boolean Operations on Selected Objects (Union, Subtract, Intersect, Exclude)
     */
    booleanOperation(op = 'union') {
      const selected = this.getSelectedObjects();
      if (selected.length < 2) return false;

      // Extract polygon contours from selected shapes
      const polylines = [];
      for (const obj of selected) {
        if (typeof obj.toPolylines === 'function') {
          polylines.push(...obj.toPolylines(0.3));
        } else if (typeof obj.toPolyline === 'function') {
          polylines.push(obj.toPolyline(0.3));
        } else if (typeof obj.toPath === 'function') {
          polylines.push(obj.toPath().toPolyline(0.3));
        }
      }

      if (polylines.length < 2) return false;

      this.pushHistory(`Boolean ${op.toUpperCase()}`);

      const resultPolys = SvgBoolean.clipMultiplePolygons
        ? SvgBoolean.clipMultiplePolygons(polylines, op)
        : SvgBoolean.clipPolygons(polylines[0], polylines[1], op);

      if (!resultPolys || resultPolys.length === 0) return false;

      const firstSelected = selected[0];
      const baseAttributes = {
        fill: firstSelected.fill,
        fillOpacity: firstSelected.fillOpacity,
        stroke: firstSelected.stroke,
        strokeWidth: firstSelected.strokeWidth,
        opacity: firstSelected.opacity,
        brushConfig: { ...firstSelected.brushConfig },
        strokeTexture: { ...firstSelected.strokeTexture },
        fillTexture: { ...firstSelected.fillTexture },
        dropShadow: { ...firstSelected.dropShadow }
      };

      const newResultObj = new SvgCompoundPath({
        ...baseAttributes,
        name: `${op.charAt(0).toUpperCase() + op.slice(1)} Result`,
        fillRule: (op === 'exclude' || op === 'subtract') ? 'evenodd' : 'nonzero'
      });
      for (const poly of resultPolys) {
        const sp = SvgBoolean.polygonToSvgPath(poly, SvgPath);
        newResultObj.addSubPath(sp);
      }

      const insertIdx = this.objects.indexOf(selected[0]);
      for (const sel of selected) {
        this.removeObject(sel.id, false);
      }

      if (insertIdx !== -1 && insertIdx <= this.objects.length) {
        this.objects.splice(insertIdx, 0, newResultObj);
      } else {
        this.objects.push(newResultObj);
      }

      this.selectedIds.clear();
      this.selectedIds.add(newResultObj.id);
      return newResultObj;
    }

    /**
     * Create Outlines: Convert selected SvgText objects to Bézier curves
     */
    createOutlinesSelected() {
      const selected = this.getSelectedObjects();
      let count = 0;
      for (const obj of selected) {
        if (obj.type === 'text') {
          if (count === 0) this.pushHistory('Create Outlines');
          const outlineObj = obj.toPath();
          const idx = this.objects.indexOf(obj);
          if (idx !== -1) {
            this.objects[idx] = outlineObj;
            this.selectedIds.delete(obj.id);
            this.selectedIds.add(outlineObj.id);
            count++;
          }
        }
      }
      return count > 0;
    }

    isSelected(id) {
      return this.selectedIds.has(id);
    }

    /** Hit Test topmost object */
    hitTest(px, py, tolerance = 6) {
      for (let i = this.objects.length - 1; i >= 0; i--) {
        const obj = this.objects[i];
        if (!obj.visible || obj.locked) continue;
        if (obj.hitTest(px, py, tolerance)) {
          return obj;
        }
      }
      return null;
    }

    /** Hit Test deepest child inside groups (for direct child selection) */
    hitTestDeep(px, py, tolerance = 6) {
      for (let i = this.objects.length - 1; i >= 0; i--) {
        const obj = this.objects[i];
        if (!obj.visible || obj.locked) continue;
        if (obj.type === 'group' && obj.children) {
          for (let k = obj.children.length - 1; k >= 0; k--) {
            const ch = obj.children[k];
            if (ch.visible && !ch.locked && ch.hitTest(px, py, tolerance)) {
              return ch;
            }
          }
        }
        if (obj.hitTest(px, py, tolerance)) {
          return obj;
        }
      }
      return null;
    }

    /** Box / Marquee selection test for bulk selection */
    hitTestBox(minX, minY, maxX, maxY, intersect = true) {
      const results = [];
      const boxMinX = Math.min(minX, maxX);
      const boxMinY = Math.min(minY, maxY);
      const boxMaxX = Math.max(minX, maxX);
      const boxMaxY = Math.max(minY, maxY);

      for (let i = 0; i < this.objects.length; i++) {
        const obj = this.objects[i];
        if (!obj.visible || obj.locked) continue;
        if (obj.type === 'text' && obj.pathId) continue; // Text on path selectable only via layer manager
        const b = typeof obj.getTransformedBounds === 'function' ? obj.getTransformedBounds() : obj.getBounds();
        if (intersect) {
          const overlaps = !(b.maxX < boxMinX || b.minX > boxMaxX || b.maxY < boxMinY || b.minY > boxMaxY);
          if (overlaps) results.push(obj);
        } else {
          const enclosed = b.minX >= boxMinX && b.maxX <= boxMaxX && b.minY >= boxMinY && b.maxY <= boxMaxY;
          if (enclosed) results.push(obj);
        }
      }
      return results;
    }

    /**
     * Alignment (Left, Center, Right, Top, Middle, Bottom)
     * @param {'left'|'center'|'right'|'top'|'middle'|'bottom'} alignment
     */
    alignSelected(alignment) {
      const selected = this.getSelectedObjects();
      if (selected.length === 0) return false;

      this.pushHistory(`Align ${alignment.charAt(0).toUpperCase() + alignment.slice(1)}`);

      let targetBounds;
      if (selected.length === 1) {
        targetBounds = { minX: 0, minY: 0, maxX: this.width, maxY: this.height, width: this.width, height: this.height };
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const obj of selected) {
          const b = typeof obj.getTransformedBounds === 'function' ? obj.getTransformedBounds() : obj.getBounds();
          minX = Math.min(minX, b.minX);
          minY = Math.min(minY, b.minY);
          maxX = Math.max(maxX, b.maxX);
          maxY = Math.max(maxY, b.maxY);
        }
        targetBounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
      }

      const cx = targetBounds.minX + targetBounds.width / 2;
      const cy = targetBounds.minY + targetBounds.height / 2;

      for (const obj of selected) {
        const b = typeof obj.getTransformedBounds === 'function' ? obj.getTransformedBounds() : obj.getBounds();
        let dx = 0, dy = 0;
        switch (alignment) {
          case 'left':
            dx = targetBounds.minX - b.minX;
            break;
          case 'center':
            dx = cx - (b.minX + b.width / 2);
            break;
          case 'right':
            dx = targetBounds.maxX - b.maxX;
            break;
          case 'top':
            dy = targetBounds.minY - b.minY;
            break;
          case 'middle':
            dy = cy - (b.minY + b.height / 2);
            break;
          case 'bottom':
            dy = targetBounds.maxY - b.maxY;
            break;
        }
        if (dx !== 0 || dy !== 0) {
          if (typeof obj.move === 'function') obj.move(dx, dy);
          else if (obj.x !== undefined) { obj.x += dx; obj.y += dy; }
        }
      }
      return true;
    }

    /**
     * Distribute Even Spacing
     * @param {'horizontal'|'vertical'} axis
     */
    distributeSelected(axis = 'horizontal') {
      const selected = this.getSelectedObjects();
      if (selected.length < 3) return false;

      this.pushHistory(`Distribute ${axis.charAt(0).toUpperCase() + axis.slice(1)}`);

      if (axis === 'horizontal') {
        selected.sort((a, b) => {
          const ba = typeof a.getTransformedBounds === 'function' ? a.getTransformedBounds() : a.getBounds();
          const bb = typeof b.getTransformedBounds === 'function' ? b.getTransformedBounds() : b.getBounds();
          return ba.minX - bb.minX;
        });

        const firstBounds = typeof selected[0].getTransformedBounds === 'function' ? selected[0].getTransformedBounds() : selected[0].getBounds();
        const lastBounds = typeof selected[selected.length - 1].getTransformedBounds === 'function' ? selected[selected.length - 1].getTransformedBounds() : selected[selected.length - 1].getBounds();

        let totalObjWidth = 0;
        for (let i = 0; i < selected.length; i++) {
          const b = typeof selected[i].getTransformedBounds === 'function' ? selected[i].getTransformedBounds() : selected[i].getBounds();
          totalObjWidth += b.width;
        }

        const totalSpan = lastBounds.maxX - firstBounds.minX;
        const totalGaps = totalSpan - totalObjWidth;
        const gap = totalGaps / (selected.length - 1);

        let curX = firstBounds.maxX + gap;
        for (let i = 1; i < selected.length - 1; i++) {
          const obj = selected[i];
          const b = typeof obj.getTransformedBounds === 'function' ? obj.getTransformedBounds() : obj.getBounds();
          const dx = curX - b.minX;
          if (typeof obj.move === 'function') obj.move(dx, 0);
          else if (obj.x !== undefined) obj.x += dx;
          curX += b.width + gap;
        }
      } else {
        selected.sort((a, b) => {
          const ba = typeof a.getTransformedBounds === 'function' ? a.getTransformedBounds() : a.getBounds();
          const bb = typeof b.getTransformedBounds === 'function' ? b.getTransformedBounds() : b.getBounds();
          return ba.minY - bb.minY;
        });

        const firstBounds = typeof selected[0].getTransformedBounds === 'function' ? selected[0].getTransformedBounds() : selected[0].getBounds();
        const lastBounds = typeof selected[selected.length - 1].getTransformedBounds === 'function' ? selected[selected.length - 1].getTransformedBounds() : selected[selected.length - 1].getBounds();

        let totalObjHeight = 0;
        for (let i = 0; i < selected.length; i++) {
          const b = typeof selected[i].getTransformedBounds === 'function' ? selected[i].getTransformedBounds() : selected[i].getBounds();
          totalObjHeight += b.height;
        }

        const totalSpan = lastBounds.maxY - firstBounds.minY;
        const totalGaps = totalSpan - totalObjHeight;
        const gap = totalGaps / (selected.length - 1);

        let curY = firstBounds.maxY + gap;
        for (let i = 1; i < selected.length - 1; i++) {
          const obj = selected[i];
          const b = typeof obj.getTransformedBounds === 'function' ? obj.getTransformedBounds() : obj.getBounds();
          const dy = curY - b.minY;
          if (typeof obj.move === 'function') obj.move(0, dy);
          else if (obj.y !== undefined) obj.y += dy;
          curY += b.height + gap;
        }
      }
      return true;
    }

    /** Clipboard & Duplicate */
    copySelected() {
      const selected = this.getSelectedObjects();
      if (selected.length === 0) return [];
      this.clipboard = selected.map(obj => JSON.parse(JSON.stringify(obj.toJSON())));
      return this.clipboard;
    }

    cutSelected() {
      const copied = this.copySelected();
      if (copied.length === 0) return [];
      this.pushHistory('Cut');
      const selected = this.getSelectedObjects();
      for (const obj of selected) {
        this.removeObject(obj.id, false);
      }
      this.selectedIds.clear();
      return copied;
    }

    paste(offset = { x: 20, y: 20 }) {
      if (!this.clipboard || this.clipboard.length === 0) return [];
      this.pushHistory('Paste');
      this.selectedIds.clear();
      const pasted = [];
      const offX = (typeof offset === 'number') ? offset : (offset?.x ?? 20);
      const offY = (typeof offset === 'number') ? offset : (offset?.y ?? 20);

      const oldToNewId = new Map();
      const clonedList = [];

      function assignNewIds(node) {
        const oldId = node.id;
        node.id = generateId(node.type);
        if (oldId) oldToNewId.set(oldId, node.id);
        if (node.type === 'group' && node.children) {
          for (const ch of node.children) {
            assignNewIds(ch);
          }
        }
      }

      for (const itemData of this.clipboard) {
        const cloned = SvgNode.fromJSON(itemData);
        assignNewIds(cloned);
        if (typeof cloned.move === 'function') {
          cloned.move(offX, offY);
        } else if (cloned.x !== undefined) {
          cloned.x += offX;
          cloned.y += offY;
        }
        clonedList.push(cloned);
      }

      // Re-map clipPathId and pathId references among newly cloned items
      function fixRefs(node) {
        if (node.clipPathId) {
          if (oldToNewId.has(node.clipPathId)) {
            node.clipPathId = oldToNewId.get(node.clipPathId);
          } else {
            node.clipPathId = null; // Don't point to external mask that wasn't cloned
          }
        }
        if (node.pathId) {
          if (oldToNewId.has(node.pathId)) {
            node.pathId = oldToNewId.get(node.pathId);
          }
        }
        if (node.type === 'group' && node.children) {
          for (const ch of node.children) fixRefs(ch);
        }
      }

      for (const cloned of clonedList) {
        fixRefs(cloned);
        this.addObject(cloned, false);
        this.selectedIds.add(cloned.id);
        pasted.push(cloned);
      }
      return pasted;
    }

    duplicateSelected(offset = { x: 20, y: 20 }) {
      const copied = this.copySelected();
      if (copied.length === 0) return [];
      return this.paste(offset);
    }

    /**
     * Clipping Mask (<clipPath>)
     */
    createClipMask() {
      const selected = this.getSelectedObjects();
      if (selected.length < 2) return false;
      this.pushHistory('Create Clipping Mask');

      const maskObj = selected[selected.length - 1]; // topmost object is mask
      for (let i = 0; i < selected.length - 1; i++) {
        const targetObj = selected[i];
        targetObj.clipPathId = maskObj.id;
      }
      maskObj.visible = false;
      return true;
    }

    releaseClipMask() {
      const selected = this.getSelectedObjects();
      if (selected.length === 0) return false;
      this.pushHistory('Release Clipping Mask');
      let released = false;

      const targetIds = new Set();
      for (const obj of selected) {
        if (obj.clipPathId) targetIds.add(obj.id);
        // Also if obj is acting as a mask
        const findDependents = (list) => {
          for (const o of list) {
            if (o.clipPathId === obj.id) targetIds.add(o.id);
            if (o.type === 'group' && o.children) findDependents(o.children);
          }
        };
        findDependents(this.objects);
        if (obj.type === 'group' && obj.children) {
          for (const ch of obj.children) {
            if (ch.clipPathId) targetIds.add(ch.id);
          }
        }
      }

      for (const tid of targetIds) {
        const targetObj = this.findObject(tid);
        if (targetObj && targetObj.clipPathId) {
          const maskObj = this.findObject(targetObj.clipPathId);
          if (maskObj) maskObj.visible = true;
          targetObj.clipPathId = null;
          released = true;
        }
      }
      return released;
    }

    /**
     * Outline Stroke (Expand Stroke to Filled Vector Path)
     */
    outlineStrokeSelected() {
      const selected = this.getSelectedObjects();
      let convertedCount = 0;
      for (const obj of selected) {
        if (!obj.stroke || obj.stroke === 'none' || !(obj.strokeWidth > 0)) continue;
        const strokeColor = obj.stroke;
        const strokeWidth = Number(obj.strokeWidth || 1);
        const hw = strokeWidth / 2;

        let pathObj = obj;
        if (typeof obj.toPath === 'function') {
          pathObj = obj.toPath();
        }

        const poly = typeof pathObj.toPolyline === 'function' ? pathObj.toPolyline(0.2) : null;
        const pts = Array.isArray(poly) ? poly : (poly && poly.points ? poly.points : null);
        if (!pts || pts.length < 2) continue;

        const leftPts = [];
        const rightPts = [];

        for (let i = 0; i < pts.length; i++) {
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(pts.length - 1, i + 1)];
          let dx = next.x - prev.x;
          let dy = next.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;

          const nx = -dy;
          const ny = dx;

          leftPts.push({ x: pts[i].x + nx * hw, y: pts[i].y + ny * hw });
          rightPts.push({ x: pts[i].x - nx * hw, y: pts[i].y - ny * hw });
        }

        if (convertedCount === 0) this.pushHistory('Outline Stroke');

        let newOutlineObj;
        if (pathObj.closed) {
          newOutlineObj = new SvgCompoundPath({
            name: `${obj.name} (Outline)`,
            fill: strokeColor,
            fillOpacity: obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1,
            stroke: 'none',
            strokeWidth: 0,
            fillRule: 'evenodd'
          });
          const outer = new SvgPath({ closed: true, fill: strokeColor, stroke: 'none' });
          for (const p of leftPts) outer.addNode(p.x, p.y, null, null, 'smooth');
          const inner = new SvgPath({ closed: true, fill: strokeColor, stroke: 'none' });
          for (let k = rightPts.length - 1; k >= 0; k--) inner.addNode(rightPts[k].x, rightPts[k].y, null, null, 'smooth');
          newOutlineObj.addSubPath(outer);
          newOutlineObj.addSubPath(inner);
        } else {
          newOutlineObj = new SvgPath({
            name: `${obj.name} (Outline)`,
            fill: strokeColor,
            fillOpacity: obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1,
            stroke: 'none',
            strokeWidth: 0,
            closed: true
          });
          for (const p of leftPts) newOutlineObj.addNode(p.x, p.y, null, null, 'smooth');
          for (let k = rightPts.length - 1; k >= 0; k--) newOutlineObj.addNode(rightPts[k].x, rightPts[k].y, null, null, 'smooth');
        }

        if (obj.parent && typeof obj.parent.replaceChild === 'function') {
          obj.parent.replaceChild(obj.id, newOutlineObj);
        } else {
          const idx = this.objects.indexOf(obj);
          if (idx !== -1) {
            this.objects[idx] = newOutlineObj;
          }
        }
        this.selectedIds.delete(obj.id);
        this.selectedIds.add(newOutlineObj.id);
        convertedCount++;
      }
      return convertedCount > 0;
    }

    /**
    /**
     * Text on Path (<textPath>)
     */
    attachTextToPath(textId, pathId) {
      let textObj = textId ? this.findObject(textId) : null;
      let pathObj = pathId ? this.findObject(pathId) : null;

      if (!textObj || !pathObj) {
        const selected = this.getSelectedObjects();
        textObj = selected.find(o => o.type === 'text');
        pathObj = selected.find(o => o.type === 'path' || o.type === 'line' || o.type === 'compoundPath');
      }

      if (!textObj || textObj.type !== 'text' || !pathObj) return false;
      this.pushHistory('Attach Text to Path');
      textObj.pathId = pathObj.id;
      return true;
    }

    detachTextFromPath(textId) {
      let textObj = textId ? this.findObject(textId) : null;
      if (!textObj) {
        const selected = this.getSelectedObjects();
        textObj = selected.find(o => o.type === 'text');
      }
      if (!textObj || textObj.type !== 'text' || !textObj.pathId) return false;
      this.pushHistory('Detach Text from Path');
      textObj.pathId = null;
      return true;
    }

    /**
     * Smart Snapping against Canvas, Guides, Grid, and Objects
     */
    snapToGeometry(box, options = {}) {
      const {
        snapToGrid = false,
        snapToCanvas = true,
        snapToGuides = true,
        snapToObjects = true,
        gridSize = 20,
        tolerance = options.threshold || 6,
        userGuides = options.guides || options.userGuides || { horizontal: [], vertical: [] },
        ignoreIds = new Set()
      } = options;

      let dx = 0;
      let dy = 0;
      let bestDistX = tolerance;
      let bestDistY = tolerance;
      let winningSnapX = null;
      let winningSnapY = null;

      const targetXs = [box.minX, box.minX + box.width / 2, box.maxX];
      const targetYs = [box.minY, box.minY + box.height / 2, box.maxY];

      // 1. Grid Snap (explicitly opt-in only)
      if (snapToGrid && gridSize > 0) {
        for (const tx of targetXs) {
          const gridSnapX = Math.round(tx / gridSize) * gridSize;
          const distGX = Math.abs(gridSnapX - tx);
          if (distGX < bestDistX) {
            bestDistX = distGX;
            dx = gridSnapX - tx;
            winningSnapX = gridSnapX;
          }
        }
        for (const ty of targetYs) {
          const gridSnapY = Math.round(ty / gridSize) * gridSize;
          const distGY = Math.abs(gridSnapY - ty);
          if (distGY < bestDistY) {
            bestDistY = distGY;
            dy = gridSnapY - ty;
            winningSnapY = gridSnapY;
          }
        }
      }

      // 2. Canvas bounds snap
      const canvasXs = [];
      const canvasYs = [];

      if (snapToCanvas) {
        canvasXs.push(0, this.width / 2, this.width);
        canvasYs.push(0, this.height / 2, this.height);
      }

      // 3. User Guides snap (Ruler Guides)
      if (snapToGuides && userGuides) {
        if (userGuides.vertical && Array.isArray(userGuides.vertical)) canvasXs.push(...userGuides.vertical);
        if (userGuides.horizontal && Array.isArray(userGuides.horizontal)) canvasYs.push(...userGuides.horizontal);
      }

      // 4. Other objects bounds snap
      if (snapToObjects && this.objects) {
        for (const obj of this.objects) {
          if (!obj.visible || (ignoreIds && ignoreIds.has(obj.id))) continue;
          const b = typeof obj.getTransformedBounds === 'function' ? obj.getTransformedBounds() : obj.getBounds();
          canvasXs.push(b.minX, b.minX + b.width / 2, b.maxX);
          canvasYs.push(b.minY, b.minY + b.height / 2, b.maxY);
        }
      }

      for (const tx of targetXs) {
        for (const cx of canvasXs) {
          const d = Math.abs(cx - tx);
          if (d < bestDistX) {
            bestDistX = d;
            dx = cx - tx;
            winningSnapX = cx;
          }
        }
      }

      for (const ty of targetYs) {
        for (const cy of canvasYs) {
          const d = Math.abs(cy - ty);
          if (d < bestDistY) {
            bestDistY = d;
            dy = cy - ty;
            winningSnapY = cy;
          }
        }
      }

      const snapLines = [];
      if (winningSnapX !== null) snapLines.push({ type: 'v', pos: winningSnapX });
      if (winningSnapY !== null) snapLines.push({ type: 'h', pos: winningSnapY });

      return {
        dx,
        dy,
        snappedX: box.minX + dx,
        snappedY: box.minY + dy,
        snapLines
      };
    }

    /** History (Undo/Redo) */
    pushHistory(description = 'Edit') {
      const snapshot = JSON.stringify(this.toJSON());
      this.undoStack.push({ description, snapshot });
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (this.undoStack.length === 0) return false;
      const current = JSON.stringify(this.toJSON());
      const state = this.undoStack.pop();
      this.redoStack.push({ description: state.description, snapshot: current });
      this.loadJSON(JSON.parse(state.snapshot));
      return true;
    }

    redo() {
      if (this.redoStack.length === 0) return false;
      const current = JSON.stringify(this.toJSON());
      const state = this.redoStack.pop();
      this.undoStack.push({ description: state.description, snapshot: current });
      this.loadJSON(JSON.parse(state.snapshot));
      return true;
    }

    /** Export to standard SVG XML string */
    toSvgXml() {
      return this.toSVGString();
    }

    toSVGString() {
      const defsMap = new Map(this.defs);

      const collectDefs = (list) => {
        for (const obj of list) {
          if (obj.clipPathId) {
            const clipObj = this.findObject(obj.clipPathId);
            if (clipObj && !defsMap.has(`clip_${obj.clipPathId}`)) {
              let innerEl = clipObj.toSVGElement();
              innerEl = innerEl
                .replace(/^<g\s+clip-path="[^"]*">\s*([\s\S]*?)\s*<\/g>$/i, '$1')
                .replace(/\s*id="[^"]*"/g, '')
                .replace(/\s*clip-path="[^"]*"/g, '')
                .replace(/\s*filter="[^"]*"/g, '')
                .replace(/\s*data-[a-z0-9_-]+="[^"]*"/gi, '');
              defsMap.set(`clip_${obj.clipPathId}`, {
                toSVGElement: () => `<clipPath id="clip_${obj.clipPathId}" clipPathUnits="userSpaceOnUse">\n      ${innerEl.trim()}\n    </clipPath>`
              });
            }
          }
          if (obj.type === 'text' && obj.pathId) {
            const pObj = this.findObject(obj.pathId);
            if (pObj && pObj.type !== 'path' && typeof pObj.toPath === 'function' && !defsMap.has(`path_${obj.pathId}`)) {
              const pData = pObj.toPath().toPathData();
              defsMap.set(`path_${obj.pathId}`, {
                toSVGElement: () => `<path id="${obj.pathId}" d="${pData}" fill="none" stroke="none" />`
              });
            }
          }
          const hasGrad = (obj.fillType === 'linear' || obj.fillType === 'radial') && obj.fillGradient;
          if (hasGrad || (obj.fillGradient && obj.fillGradient.enabled)) {
            const gradId = (obj.fillGradient && obj.fillGradient.id) ? obj.fillGradient.id : `grad_${obj.id}`;
            if (!defsMap.has(gradId)) {
              if (obj.fillGradient instanceof SvgGradient) {
                defsMap.set(gradId, obj.fillGradient);
              } else if ((obj.fillGradient && obj.fillGradient.type === 'radial') || obj.fillType === 'radial') {
                defsMap.set(gradId, new SvgRadialGradient({ id: gradId, stops: obj.fillGradient.stops, ...obj.fillGradient }));
              } else {
                defsMap.set(gradId, new SvgLinearGradient({ id: gradId, stops: obj.fillGradient.stops, ...obj.fillGradient }));
              }
            }
          }
          if (obj.dropShadow && obj.dropShadow.enabled) {
            const shadowId = `shadow_${obj.id}`;
            if (!defsMap.has(shadowId)) {
              const dx = obj.dropShadow.offsetX !== undefined ? obj.dropShadow.offsetX : 4;
              const dy = obj.dropShadow.offsetY !== undefined ? obj.dropShadow.offsetY : 4;
              const blur = obj.dropShadow.blur !== undefined ? obj.dropShadow.blur : 8;
              const color = obj.dropShadow.color || '#000000';
              const op = obj.dropShadow.opacity !== undefined ? obj.dropShadow.opacity : 0.6;
              defsMap.set(shadowId, {
                toSVGElement: () => `<filter id="${shadowId}" x="-30%" y="-30%" width="160%" height="160%">\n      <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur / 2}" flood-color="${color}" flood-opacity="${op}" />\n    </filter>`
              });
            }
          }
          if (obj.type === 'group' && obj.children) {
            collectDefs(obj.children);
          }
        }
      };
      collectDefs(this.objects);

      let defsXml = '';
      if (defsMap.size > 0) {
        const items = Array.from(defsMap.values()).map(d => d.toSVGElement()).join('\n    ');
        defsXml = `\n  <defs>\n    ${items}\n  </defs>`;
      }
      let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      svg += `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.width}" height="${this.height}" viewBox="${this.viewBox}">${defsXml}\n`;
      if (this.backgroundColor && this.backgroundColor !== 'none') {
        svg += `  <rect width="100%" height="100%" fill="${this.backgroundColor}" />\n`;
      }

      for (const obj of this.objects) {
        if (!obj.visible) continue;
        const el = obj.toSVGElement();
        if (el) svg += `  ${el}\n`;
      }

      svg += `</svg>\n`;
      return svg;
    }

    /** Parse SVG XML into Document */
    fromSVGString(svgString) {
      this.clear();
      if (!svgString) return;

      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        let doc = null;
        try {
          let safeSvgString = svgString;
          if (!safeSvgString.includes('xmlns:xlink=')) {
            safeSvgString = safeSvgString.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
          }
          if (!safeSvgString.includes('xmlns=')) {
            safeSvgString = safeSvgString.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
          }
          doc = parser.parseFromString(safeSvgString, 'image/svg+xml');
          if (doc.querySelector('parsererror')) {
            doc = parser.parseFromString(svgString, 'text/html');
          }
        } catch (e) {
          try {
            doc = parser.parseFromString(svgString, 'text/html');
          } catch (e2) {
            doc = null;
          }
        }
        if (!doc) return;
        const svgEl = doc.querySelector('svg');
        if (!svgEl) return;

        if (svgEl.getAttribute('width')) this.width = parseFloat(svgEl.getAttribute('width'));
        if (svgEl.getAttribute('height')) this.height = parseFloat(svgEl.getAttribute('height'));
        if (svgEl.getAttribute('viewBox')) this.viewBox = svgEl.getAttribute('viewBox');

        const parseNode = (el) => {
          const tag = el.tagName.toLowerCase();
          const getAttr = (name, def = null) => el.getAttribute(name) || def;

          const fill = getAttr('fill', '#fabd2f');
          const stroke = getAttr('stroke', '#1d2021');
          const strokeWidth = parseFloat(getAttr('stroke-width', '2'));
          const opacity = parseFloat(getAttr('opacity', '1.0'));
          const fillOpacity = parseFloat(getAttr('fill-opacity', '1.0'));
          const strokeOpacity = parseFloat(getAttr('stroke-opacity', '1.0'));

          let brushConfig = undefined;
          const brushAttr = getAttr('data-brush');
          if (brushAttr) {
            try { brushConfig = JSON.parse(decodeURIComponent(brushAttr)); } catch (e) {}
          }

          let strokeTexture = undefined;
          const strokeTexAttr = getAttr('data-stroke-tex');
          if (strokeTexAttr) {
            try { strokeTexture = JSON.parse(decodeURIComponent(strokeTexAttr)); } catch (e) {}
          }

          let fillTexture = undefined;
          const fillTexAttr = getAttr('data-fill-tex');
          if (fillTexAttr) {
            try { fillTexture = JSON.parse(decodeURIComponent(fillTexAttr)); } catch (e) {}
          }

          let dropShadow = undefined;
          const shadowAttr = getAttr('data-shadow');
          if (shadowAttr) {
            try { dropShadow = JSON.parse(decodeURIComponent(shadowAttr)); } catch (e) {}
          }

          let fillGradient = undefined;
          const gradAttr = getAttr('data-gradient');
          if (gradAttr) {
            try { fillGradient = JSON.parse(decodeURIComponent(gradAttr)); } catch (e) {}
          }

          const transformAttr = getAttr('transform');
          let rotation = 0;
          let originX = undefined, originY = undefined;
          if (transformAttr) {
            const rotMatch = transformAttr.match(/rotate\(\s*([\d.-]+)(?:\s+([\d.-]+)\s+([\d.-]+))?\s*\)/);
            if (rotMatch) {
              rotation = parseFloat(rotMatch[1]) || 0;
              if (rotMatch[2] !== undefined && rotMatch[3] !== undefined) {
                originX = parseFloat(rotMatch[2]);
                originY = parseFloat(rotMatch[3]);
              }
            }
          }

          const baseProps = {
            id: getAttr('id', generateId(tag)),
            fill, stroke, strokeWidth, opacity, fillOpacity, strokeOpacity,
            brushConfig, strokeTexture, fillTexture, dropShadow, fillGradient,
            rotation, originX, originY
          };

          if (tag === 'rect') {
            return new SvgRect({
              ...baseProps,
              x: parseFloat(getAttr('x', '0')),
              y: parseFloat(getAttr('y', '0')),
              width: parseFloat(getAttr('width', '100')),
              height: parseFloat(getAttr('height', '60')),
              rx: parseFloat(getAttr('rx', '0')),
              ry: parseFloat(getAttr('ry', '0'))
            });
          } else if (tag === 'circle') {
            return new SvgCircle({
              ...baseProps,
              cx: parseFloat(getAttr('cx', '0')),
              cy: parseFloat(getAttr('cy', '0')),
              r: parseFloat(getAttr('r', '50'))
            });
          } else if (tag === 'ellipse') {
            return new SvgEllipse({
              ...baseProps,
              cx: parseFloat(getAttr('cx', '0')),
              cy: parseFloat(getAttr('cy', '0')),
              rx: parseFloat(getAttr('rx', '50')),
              ry: parseFloat(getAttr('ry', '30'))
            });
          } else if (tag === 'line') {
            return new SvgLine({
              ...baseProps,
              x1: parseFloat(getAttr('x1', '0')),
              y1: parseFloat(getAttr('y1', '0')),
              x2: parseFloat(getAttr('x2', '100')),
              y2: parseFloat(getAttr('y2', '100'))
            });
          } else if (tag === 'path') {
            const d = getAttr('d', '');
            const fillRule = getAttr('fill-rule', 'nonzero');
            const subDCount = (d.match(/[Mm]/g) || []).length;
            if (subDCount > 1) {
              return new SvgCompoundPath({
                ...baseProps,
                d,
                fillRule
              });
            }
            return new SvgPath({
              ...baseProps,
              d
            });
          } else if (tag === 'text') {
            return new SvgText({
              ...baseProps,
              x: parseFloat(getAttr('x', '0')),
              y: parseFloat(getAttr('y', '0')),
              text: el.textContent || '',
              fontFamily: getAttr('font-family', 'sans-serif'),
              fontSize: parseFloat(getAttr('font-size', '36')),
              fontWeight: getAttr('font-weight', 'normal'),
              fontStyle: getAttr('font-style', 'normal'),
              letterSpacing: parseFloat(getAttr('letter-spacing', '0'))
            });
          } else if (tag === 'image') {
            const src = getAttr('href') || getAttr('xlink:href') || getAttr('src') || '';
            return new SvgImage({
              ...baseProps,
              x: parseFloat(getAttr('x', '0')),
              y: parseFloat(getAttr('y', '0')),
              width: parseFloat(getAttr('width', '100')),
              height: parseFloat(getAttr('height', '100')),
              src
            });
          } else if (tag === 'polyline') {
            return new SvgPolyline({
              ...baseProps,
              points: getAttr('points', '')
            });
          } else if (tag === 'polygon') {
            return new SvgPolygon({
              ...baseProps,
              points: getAttr('points', '')
            });
          } else if (tag === 'g') {
            const grp = new SvgGroup({ id: baseProps.id, opacity });
            for (const childEl of el.children) {
              const childNode = parseNode(childEl);
              if (childNode) grp.add(childNode);
            }
            return grp;
          }
          return null;
        };

        for (const childEl of svgEl.children) {
          const node = parseNode(childEl);
          if (node) this.addObject(node, false);
        }
      } else {
        // Fallback RegEx Parser for Node.js
        const parseAttrString = (attrStr) => {
          const attrs = {};
          const regex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
          let m;
          while ((m = regex.exec(attrStr)) !== null) {
            attrs[m[1]] = m[2];
          }
          return attrs;
        };

        const createNodeFromAttrs = (tag, attrs) => {
          const getAttr = (name, def = null) => attrs[name] || def;
          const fill = getAttr('fill', '#fabd2f');
          const stroke = getAttr('stroke', '#1d2021');
          const strokeWidth = parseFloat(getAttr('stroke-width', '2'));
          const opacity = parseFloat(getAttr('opacity', '1.0'));
          const fillOpacity = parseFloat(getAttr('fill-opacity', '1.0'));
          const strokeOpacity = parseFloat(getAttr('stroke-opacity', '1.0'));

          let brushConfig = undefined;
          const brushAttr = getAttr('data-brush');
          if (brushAttr) {
            try { brushConfig = JSON.parse(decodeURIComponent(brushAttr)); } catch (e) {}
          }

          let strokeTexture = undefined;
          const strokeTexAttr = getAttr('data-stroke-tex');
          if (strokeTexAttr) {
            try { strokeTexture = JSON.parse(decodeURIComponent(strokeTexAttr)); } catch (e) {}
          }

          let fillTexture = undefined;
          const fillTexAttr = getAttr('data-fill-tex');
          if (fillTexAttr) {
            try { fillTexture = JSON.parse(decodeURIComponent(fillTexAttr)); } catch (e) {}
          }

          let dropShadow = undefined;
          const shadowAttr = getAttr('data-shadow');
          if (shadowAttr) {
            try { dropShadow = JSON.parse(decodeURIComponent(shadowAttr)); } catch (e) {}
          }

          let fillGradient = undefined;
          const gradAttr = getAttr('data-gradient');
          if (gradAttr) {
            try { fillGradient = JSON.parse(decodeURIComponent(gradAttr)); } catch (e) {}
          }

          const transformAttr = getAttr('transform');
          let rotation = 0;
          let originX = undefined, originY = undefined;
          if (transformAttr) {
            const rotMatch = transformAttr.match(/rotate\(\s*([\d.-]+)(?:\s+([\d.-]+)\s+([\d.-]+))?\s*\)/);
            if (rotMatch) {
              rotation = parseFloat(rotMatch[1]) || 0;
              if (rotMatch[2] !== undefined && rotMatch[3] !== undefined) {
                originX = parseFloat(rotMatch[2]);
                originY = parseFloat(rotMatch[3]);
              }
            }
          }

          const baseProps = {
            id: getAttr('id', generateId(tag)),
            fill, stroke, strokeWidth, opacity, fillOpacity, strokeOpacity,
            brushConfig, strokeTexture, fillTexture, dropShadow, fillGradient,
            rotation, originX, originY
          };

          if (tag === 'rect') {
            return new SvgRect({
              ...baseProps,
              x: parseFloat(getAttr('x', '0')),
              y: parseFloat(getAttr('y', '0')),
              width: parseFloat(getAttr('width', '100')),
              height: parseFloat(getAttr('height', '60')),
              rx: parseFloat(getAttr('rx', '0')),
              ry: parseFloat(getAttr('ry', '0'))
            });
          } else if (tag === 'circle') {
            return new SvgCircle({
              ...baseProps,
              cx: parseFloat(getAttr('cx', '0')),
              cy: parseFloat(getAttr('cy', '0')),
              r: parseFloat(getAttr('r', '50'))
            });
          } else if (tag === 'ellipse') {
            return new SvgEllipse({
              ...baseProps,
              cx: parseFloat(getAttr('cx', '0')),
              cy: parseFloat(getAttr('cy', '0')),
              rx: parseFloat(getAttr('rx', '50')),
              ry: parseFloat(getAttr('ry', '30'))
            });
          } else if (tag === 'line') {
            return new SvgLine({
              ...baseProps,
              x1: parseFloat(getAttr('x1', '0')),
              y1: parseFloat(getAttr('y1', '0')),
              x2: parseFloat(getAttr('x2', '100')),
              y2: parseFloat(getAttr('y2', '100'))
            });
          } else if (tag === 'path') {
            const d = getAttr('d', '');
            const fillRule = getAttr('fill-rule', 'nonzero');
            const subDCount = (d.match(/[Mm]/g) || []).length;
            if (subDCount > 1) {
              return new SvgCompoundPath({
                ...baseProps,
                d,
                fillRule
              });
            }
            return new SvgPath({
              ...baseProps,
              d
            });
          } else if (tag === 'polygon') {
            return new SvgPolygon({
              ...baseProps,
              points: getAttr('points', '')
            });
          } else if (tag === 'polyline') {
            return new SvgPolyline({
              ...baseProps,
              points: getAttr('points', '')
            });
          } else if (tag === 'image') {
            return new SvgImage({
              ...baseProps,
              x: parseFloat(getAttr('x', '0')),
              y: parseFloat(getAttr('y', '0')),
              width: parseFloat(getAttr('width', '100')),
              height: parseFloat(getAttr('height', '100')),
              src: getAttr('href') || getAttr('xlink:href') || getAttr('src') || ''
            });
          }
          return null;
        };

        const tagRegex = /<(path|rect|circle|ellipse|line|polygon|polyline|image)\b([^>]*)\/?>/ig;
        let match;
        while ((match = tagRegex.exec(svgString)) !== null) {
          const tagName = match[1].toLowerCase();
          const attrStr = match[2];
          const attrs = parseAttrString(attrStr);
          const node = createNodeFromAttrs(tagName, attrs);
          if (node) this.addObject(node, false);
        }
      }
    }

    toJSON() {
      return {
        width: this.width,
        height: this.height,
        viewBox: this.viewBox,
        backgroundColor: this.backgroundColor,
        objects: this.objects.map(o => o.toJSON())
      };
    }

    fromJSON(data) {
      return this.loadJSON(data);
    }

    loadJSON(data) {
      this.width = data.width || 800;
      this.height = data.height || 600;
      this.viewBox = data.viewBox || `0 0 ${this.width} ${this.height}`;
      this.backgroundColor = data.backgroundColor || '#1d2021';
      this.objects = (data.objects || []).map(o => {
        const node = SvgNode.fromJSON(o);
        node.doc = this;
        if (node.type === 'group' && node.children) {
          const setDocRec = (kids) => {
            for (const k of kids) {
              k.doc = this;
              if (k.type === 'group' && k.children) setDocRec(k.children);
            }
          };
          setDocRec(node.children);
        }
        return node;
      });
      this.selectedIds.clear();
    }
  }

  /* =========================================================================
   * SvgTracer: High-Performance Raster to Vector Tracing Engine
   * Marching squares contour extraction, hole classification, color quantization,
   * RDP polygon decimation, and Schneider Bézier curve fitting.
   * ========================================================================= */

  const SvgTracer = {
    /**
     * Main trace entry point.
     */
    trace(imgData, width, height, options = {}) {
      const mode = options.mode || 'color'; // 'color', 'silhouette', 'threshold'
      const smoothness = Number(options.smoothness || options.tolerance || 2.0);
      const minArea = Number(options.minArea || 8);
      const fitCurves = options.fitCurves !== undefined ? !!options.fitCurves : true;
      const cornerThreshold = Number(options.cornerThreshold || 110); // degrees

      const data = imgData.data || imgData;

      if (mode === 'silhouette') {
        return this.traceBinary(data, width, height, (r, g, b, a) => a > (options.threshold || 64), options.fill || '#fabd2f', smoothness, minArea, fitCurves, cornerThreshold);
      } else if (mode === 'threshold') {
        const thresh = options.threshold || 128;
        return this.traceBinary(data, width, height, (r, g, b, a) => a > 32 && (0.299 * r + 0.587 * g + 0.114 * b < thresh), options.fill || '#1d2021', smoothness, minArea, fitCurves, cornerThreshold);
      } else {
        // Multi-Color Quantization Mode
        return this.traceMultiColor(data, width, height, options.colors || 6, smoothness, minArea, fitCurves, cornerThreshold);
      }
    },

    /**
     * Trace a single binary mask into an SvgPath or SvgCompoundPath.
     */
    traceBinary(data, width, height, predicate, fill, smoothness, minArea, fitCurves, cornerThreshold) {
      const mask = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (predicate(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
            mask[y * width + x] = 1;
          }
        }
      }

      const contours = this.extractContours(mask, width, height, minArea);
      if (contours.length === 0) return null;

      const subPaths = [];
      for (const cont of contours) {
        const path = this.contourToPath(cont.points, smoothness, fitCurves, cornerThreshold);
        if (path && path.nodes.length >= 2) {
          path.closed = true;
          path.fill = fill;
          path.stroke = 'none';
          subPaths.push(path);
        }
      }

      if (subPaths.length === 0) return null;
      if (subPaths.length === 1) {
        return subPaths[0];
      }

      const compound = new SvgCompoundPath({ fill: fill, stroke: 'none', fillRule: 'evenodd' });
      for (const sp of subPaths) {
        compound.addSubPath(sp);
      }
      return compound;
    },

    /**
     * Trace an image with color quantization into layered vector paths.
     */
    traceMultiColor(data, width, height, numColors = 6, smoothness = 2.0, minArea = 8, fitCurves = true, cornerThreshold = 110) {
      const samples = [];
      const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4000)));
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          if (data[idx + 3] > 64) {
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
          }
        }
      }

      if (samples.length === 0) return null;

      const palette = this.quantizeKMeans(samples, numColors);
      if (palette.length === 0) return null;

      const colorMap = new Int16Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (data[idx + 3] <= 64) {
            colorMap[y * width + x] = -1;
            continue;
          }
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          let bestDist = Infinity;
          let bestCol = 0;
          for (let k = 0; k < palette.length; k++) {
            const p = palette[k];
            const dist = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              bestCol = k;
            }
          }
          colorMap[y * width + x] = bestCol;
        }
      }

      const group = new SvgGroup({ name: 'Traced Vector Group' });

      // Sort palette by perceived brightness (background colors first)
      const sortedColors = palette.map((col, idx) => ({ ...col, idx }))
        .sort((a, b) => (0.299 * b.r + 0.587 * b.g + 0.114 * b.b) - (0.299 * a.r + 0.587 * a.g + 0.114 * a.b));

      for (const col of sortedColors) {
        const mask = new Uint8Array(width * height);
        let count = 0;
        for (let i = 0; i < colorMap.length; i++) {
          if (colorMap[i] === col.idx) {
            mask[i] = 1;
            count++;
          }
        }
        if (count < minArea) continue;

        const contours = this.extractContours(mask, width, height, minArea);
        if (contours.length === 0) continue;

        const hex = this.rgbToHex(col.r, col.g, col.b);
        const subPaths = [];
        for (const cont of contours) {
          const p = this.contourToPath(cont.points, smoothness, fitCurves, cornerThreshold);
          if (p && p.nodes.length >= 2) {
            p.closed = true;
            p.fill = hex;
            p.stroke = 'none';
            subPaths.push(p);
          }
        }

        if (subPaths.length === 1) {
          group.addChild(subPaths[0]);
        } else if (subPaths.length > 1) {
          const comp = new SvgCompoundPath({ fill: hex, stroke: 'none', fillRule: 'evenodd' });
          for (const sp of subPaths) comp.addSubPath(sp);
          group.addChild(comp);
        }
      }

      return group.children.length > 0 ? group : null;
    },

    /**
     * Marching Squares grid contour extraction.
     */
    extractContours(mask, width, height, minArea = 8) {
      const visitedH = new Uint8Array((width + 1) * (height + 1));
      const visitedV = new Uint8Array((width + 1) * (height + 1));

      function getVal(x, y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        return mask[y * width + x] ? 1 : 0;
      }

      const contours = [];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = getVal(x, y);
          const vTop = getVal(x, y - 1);
          // Detect top boundary of solid pixel
          if (v === 1 && vTop === 0 && !visitedH[y * (width + 1) + x]) {
            const loop = [];
            let cx = x, cy = y;
            let dir = 0; // 0=E, 1=S, 2=W, 3=N
            const startX = cx, startY = cy;
            const startDir = dir;
            let maxSteps = (width + height) * 16;

            do {
              loop.push({ x: cx, y: cy });

              // 4 neighbor pixels around corner (cx, cy)
              const tl = getVal(cx - 1, cy - 1);
              const tr = getVal(cx, cy - 1);
              const br = getVal(cx, cy);
              const bl = getVal(cx - 1, cy);
              const state = (tl << 3) | (tr << 2) | (br << 1) | bl;

              let nextDir = dir;
              switch (state) {
                case 1:  nextDir = 1; break; // bl -> S
                case 2:  nextDir = 0; break; // br -> E
                case 3:  nextDir = 0; break; // br, bl -> E
                case 4:  nextDir = 3; break; // tr -> N
                case 5:  nextDir = (dir === 0) ? 1 : (dir === 2 ? 3 : 1); break; // tr, bl (saddle)
                case 6:  nextDir = 3; break; // tr, br -> N
                case 7:  nextDir = 3; break; // tr, br, bl -> N
                case 8:  nextDir = 2; break; // tl -> W
                case 9:  nextDir = 1; break; // tl, bl -> S
                case 10: nextDir = (dir === 1) ? 2 : (dir === 3 ? 0 : 2); break; // tl, br (saddle)
                case 11: nextDir = 0; break; // tl, br, bl -> E
                case 12: nextDir = 2; break; // tl, tr -> W
                case 13: nextDir = 1; break; // tl, tr, bl -> S
                case 14: nextDir = 2; break; // tl, tr, br -> W
                default:
                  nextDir = (dir + 1) % 4;
                  break;
              }

              // Mark edge in movement direction and step
              if (nextDir === 0) { visitedH[cy * (width + 1) + cx] = 1; cx += 1; }
              else if (nextDir === 1) { visitedV[cy * (width + 1) + cx] = 1; cy += 1; }
              else if (nextDir === 2) { visitedH[cy * (width + 1) + (cx - 1)] = 1; cx -= 1; }
              else if (nextDir === 3) { visitedV[(cy - 1) * (width + 1) + cx] = 1; cy -= 1; }

              dir = nextDir;
              if (--maxSteps <= 0) break;
            } while (cx !== startX || cy !== startY);

            if (loop.length >= 3) {
              let area = 0;
              for (let i = 0; i < loop.length; i++) {
                const j = (i + 1) % loop.length;
                area += loop[i].x * loop[j].y - loop[j].x * loop[i].y;
              }
              area = area / 2.0;

              if (Math.abs(area) >= minArea) {
                contours.push({ points: loop, area });
              }
            }
          }
        }
      }

      return contours;
    },

    /**
     * Converts a raw point loop into a smooth, simplified SvgPath.
     */
    contourToPath(pts, smoothness = 2.0, fitCurves = true, cornerThreshold = 110) {
      if (!pts || pts.length < 3) return null;

      // Close point loop for RDP reduction
      const closedPts = [...pts, pts[0]];
      let simplified = Bezier.simplifyRDP(closedPts, Math.max(0.5, smoothness * 0.5));
      if (simplified.length > 2 && Math.hypot(simplified[0].x - simplified[simplified.length - 1].x, simplified[0].y - simplified[simplified.length - 1].y) < 1e-4) {
        simplified.pop();
      }
      if (simplified.length < 3) return null;

      if (!fitCurves) {
        const path = new SvgPath({ closed: true });
        for (const pt of simplified) {
          path.addNode(pt.x, pt.y, null, null, 'corner');
        }
        return path;
      }

      const n = simplified.length;
      const corners = [];
      const cornerRad = (cornerThreshold * Math.PI) / 180;

      for (let i = 0; i < n; i++) {
        const prev = simplified[(i - 1 + n) % n];
        const curr = simplified[i];
        const next = simplified[(i + 1) % n];

        const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
        const v2 = { x: next.x - curr.x, y: next.y - curr.y };
        const l1 = Math.hypot(v1.x, v1.y);
        const l2 = Math.hypot(v2.x, v2.y);

        if (l1 > 1e-4 && l2 > 1e-4) {
          const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (angle < cornerRad) {
            corners.push(i);
          }
        }
      }

      const path = new SvgPath({ closed: true });

      if (corners.length === 0) {
        // Continuous smooth closed loop
        const closedSpan = [...simplified, simplified[0]];
        const segments = Bezier.fitCurve(closedSpan, smoothness);
        if (segments.length === 0) {
          for (const pt of simplified) path.addNode(pt.x, pt.y, null, null, 'corner');
          return path;
        }
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          if (i === 0) {
            path.addNode(s.p0.x, s.p0.y, null, { x: s.cp1.x - s.p0.x, y: s.cp1.y - s.p0.y }, 'smooth');
          } else {
            path.nodes[path.nodes.length - 1].cpOut = { x: s.cp1.x - s.p0.x, y: s.cp1.y - s.p0.y };
          }
          path.addNode(s.p1.x, s.p1.y, { x: s.cp2.x - s.p1.x, y: s.cp2.y - s.p1.y }, null, 'smooth');
        }
        if (path.nodes.length > 2) {
          const first = path.nodes[0];
          const last = path.nodes[path.nodes.length - 1];
          first.cpIn = last.cpIn;
          path.nodes.pop();
        }
      } else {
        for (let c = 0; c < corners.length; c++) {
          const startIdx = corners[c];
          const endIdx = corners[(c + 1) % corners.length];
          const span = [];
          let idx = startIdx;
          while (true) {
            span.push(simplified[idx]);
            if (idx === endIdx) break;
            idx = (idx + 1) % n;
          }

          const segments = Bezier.fitCurve(span, smoothness);
          for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            if (i === 0 && path.nodes.length === 0) {
              path.addNode(s.p0.x, s.p0.y, null, { x: s.cp1.x - s.p0.x, y: s.cp1.y - s.p0.y }, 'corner');
            } else if (i === 0) {
              path.nodes[path.nodes.length - 1].cpOut = { x: s.cp1.x - s.p0.x, y: s.cp1.y - s.p0.y };
            } else {
              path.nodes[path.nodes.length - 1].cpOut = { x: s.cp1.x - s.p0.x, y: s.cp1.y - s.p0.y };
            }

            const isCorner = (i === segments.length - 1);
            path.addNode(
              s.p1.x, s.p1.y,
              { x: s.cp2.x - s.p1.x, y: s.cp2.y - s.p1.y },
              null,
              isCorner ? 'corner' : 'smooth'
            );
          }
        }
        if (path.nodes.length > 2) {
          const first = path.nodes[0];
          const last = path.nodes[path.nodes.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) < 2) {
            first.cpIn = last.cpIn;
            path.nodes.pop();
          }
        }
      }

      return path;
    },

    /**
     * K-Means color clustering for Multi-Color palette quantization.
     */
    quantizeKMeans(samples, k = 6, maxIter = 10) {
      if (samples.length === 0) return [];
      k = Math.min(k, samples.length);

      const centroids = [];
      const step = Math.floor(samples.length / k);
      for (let i = 0; i < k; i++) {
        const s = samples[i * step];
        centroids.push({ r: s[0], g: s[1], b: s[2] });
      }

      for (let iter = 0; iter < maxIter; iter++) {
        const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          let bestDist = Infinity;
          let bestC = 0;
          for (let c = 0; c < centroids.length; c++) {
            const cent = centroids[c];
            const dist = (s[0] - cent.r) ** 2 + (s[1] - cent.g) ** 2 + (s[2] - cent.b) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              bestC = c;
            }
          }
          sums[bestC].r += s[0];
          sums[bestC].g += s[1];
          sums[bestC].b += s[2];
          sums[bestC].count++;
        }

        let moved = false;
        for (let c = 0; c < centroids.length; c++) {
          if (sums[c].count > 0) {
            const nr = Math.round(sums[c].r / sums[c].count);
            const ng = Math.round(sums[c].g / sums[c].count);
            const nb = Math.round(sums[c].b / sums[c].count);
            if (nr !== centroids[c].r || ng !== centroids[c].g || nb !== centroids[c].b) {
              centroids[c].r = nr;
              centroids[c].g = ng;
              centroids[c].b = nb;
              moved = true;
            }
          }
        }
        if (!moved) break;
      }

      return centroids;
    },

    rgbToHex(r, g, b) {
      const toHex = c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  };

  return {
    Bezier,
    PathNode,
    SvgNode,
    SvgPath,
    SvgCompoundPath,
    SvgText,
    SvgGradient,
    SvgLinearGradient,
    SvgRadialGradient,
    SvgRect,
    SvgCircle,
    SvgEllipse,
    SvgLine,
    SvgPolygon,
    SvgPolyline,
    SvgGroup,
    SvgImage,
    SvgDocument,
    SvgTracer,
    generateId
  };
}));

