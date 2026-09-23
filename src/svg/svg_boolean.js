/**
 * =========================================================================
 * SVG Boolean Operations & Pathfinder (src/svg/svg_boolean.js)
 * Robust 2D polygon clipping (Union, Subtract, Intersect, Exclude/XOR)
 * Supports multi-contour polygons and Bézier path conversion.
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SvgBoolean = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPSILON = 1e-5;

  function isPointInsidePolygon(pt, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function segmentIntersection(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-9) return null; // Parallel

    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = -((p1.x - p3.x) * (p2.y - p1.y) - (p1.y - p3.y) * (p2.x - p1.x)) / d;

    if (t >= EPSILON && t <= 1 - EPSILON && u >= EPSILON && u <= 1 - EPSILON) {
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        t,
        u
      };
    }
    return null;
  }

  function cleanPolygon(poly, minDistance = 0.5) {
    if (!poly || poly.length < 3) return [];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const prev = out[out.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= minDistance) {
        out.push({ x: p.x, y: p.y });
      }
    }
    if (out.length > 2) {
      const first = out[0], last = out[out.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < minDistance) {
        out.pop();
      }
    }
    return out.length >= 3 ? out : [];
  }

  function polygonArea(poly) {
    if (!poly || poly.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      area += (poly[j].x * poly[i].y) - (poly[i].x * poly[j].y);
    }
    return area / 2;
  }

  /**
   * Split polygon into sub-segments at all intersection points with other polygon
   */
  function subdividePolygon(poly, otherPoly) {
    const n = poly.length;
    const segments = [];

    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      const cuts = [{ t: 0, pt: p1 }, { t: 1, pt: p2 }];

      for (let j = 0; j < otherPoly.length; j++) {
        const q1 = otherPoly[j];
        const q2 = otherPoly[(j + 1) % otherPoly.length];
        const isect = segmentIntersection(p1, p2, q1, q2);
        if (isect) {
          cuts.push({ t: isect.t, pt: { x: isect.x, y: isect.y } });
        }
      }

      cuts.sort((a, b) => a.t - b.t);

      for (let c = 0; c < cuts.length - 1; c++) {
        const a = cuts[c].pt;
        const b = cuts[c + 1].pt;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 0.05) {
          segments.push({
            p1: a,
            p2: b,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          });
        }
      }
    }

    return segments;
  }

  /**
   * Stitch directed segments into closed polygon contours
   */
  function stitchSegments(segments, tolerance = 1.0) {
    if (segments.length === 0) return [];
    const remaining = [...segments];
    const polys = [];

    while (remaining.length > 0) {
      const firstSeg = remaining.shift();
      const currentPoly = [{ x: firstSeg.p1.x, y: firstSeg.p1.y }, { x: firstSeg.p2.x, y: firstSeg.p2.y }];
      let currentEnd = currentPoly[currentPoly.length - 1];
      let closed = false;

      let loopCount = 0;
      while (!closed && remaining.length > 0 && loopCount++ < 5000) {
        let bestIdx = -1;
        let bestDist = tolerance;

        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          const dist = Math.hypot(currentEnd.x - seg.p1.x, currentEnd.y - seg.p1.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }

        if (bestIdx !== -1) {
          const [nextSeg] = remaining.splice(bestIdx, 1);
          currentPoly.push({ x: nextSeg.p2.x, y: nextSeg.p2.y });
          currentEnd = nextSeg.p2;

          // Check if closed
          const startPt = currentPoly[0];
          if (Math.hypot(currentEnd.x - startPt.x, currentEnd.y - startPt.y) < tolerance) {
            closed = true;
          }
        } else {
          break;
        }
      }

      const cleaned = cleanPolygon(currentPoly);
      if (cleaned.length >= 3) {
        polys.push(cleaned);
      }
    }

    return polys;
  }

  /**
   * Boolean Operations on 2 Polygons
   * @param {Array<{x, y}>} polyA Subject polygon
   * @param {Array<{x, y}>} polyB Clip polygon
   * @param {'union'|'subtract'|'intersect'|'exclude'} op 
   * @returns {Array<Array<{x, y}>>} Array of resulting closed polygon contours
   */
  function clipPolygons(polyA, polyB, op = 'union') {
    const cleanA = cleanPolygon(polyA);
    const cleanB = cleanPolygon(polyB);

    if (cleanA.length < 3) return (op === 'union' || op === 'exclude') ? [cleanB] : [];
    if (cleanB.length < 3) return (op === 'union' || op === 'subtract' || op === 'exclude') ? [cleanA] : [];

    // Check if one polygon is completely inside the other with no intersection cuts
    const segsA = subdividePolygon(cleanA, cleanB);
    const segsB = subdividePolygon(cleanB, cleanA);

    const hasIntersections = segsA.length > cleanA.length || segsB.length > cleanB.length;

    if (!hasIntersections) {
      const aInB = isPointInsidePolygon(cleanA[0], cleanB);
      const bInA = isPointInsidePolygon(cleanB[0], cleanA);

      if (op === 'union') {
        if (aInB) return [cleanB];
        if (bInA) return [cleanA];
        return [cleanA, cleanB];
      } else if (op === 'intersect') {
        if (aInB) return [cleanA];
        if (bInA) return [cleanB];
        return [];
      } else if (op === 'subtract') {
        if (aInB) return []; // A is subtracted entirely by B
        if (bInA) return [cleanA, cleanB]; // Hole
        return [cleanA];
      } else if (op === 'exclude') {
        return [cleanA, cleanB];
      }
    }

    // For Exclude / XOR: (A - B) + (B - A)
    if (op === 'exclude') {
      const sub1 = clipPolygons(cleanA, cleanB, 'subtract');
      const sub2 = clipPolygons(cleanB, cleanA, 'subtract');
      return [...sub1, ...sub2];
    }

    const keptSegments = [];

    // Classify segments of A
    for (const seg of segsA) {
      const insideB = isPointInsidePolygon(seg.mid, cleanB);
      if (op === 'union' && !insideB) {
        keptSegments.push(seg);
      } else if (op === 'intersect' && insideB) {
        keptSegments.push(seg);
      } else if (op === 'subtract' && !insideB) {
        keptSegments.push(seg);
      }
    }

    // Classify segments of B
    for (const seg of segsB) {
      const insideA = isPointInsidePolygon(seg.mid, cleanA);
      if (op === 'union' && !insideA) {
        keptSegments.push(seg);
      } else if (op === 'intersect' && insideA) {
        keptSegments.push(seg);
      } else if (op === 'subtract' && insideA) {
        // Reverse segment for subtraction boundary
        keptSegments.push({
          p1: seg.p2,
          p2: seg.p1,
          mid: seg.mid
        });
      }
    }

    const stitched = stitchSegments(keptSegments);
    if (stitched.length > 0) {
      return stitched;
    }

    // Fallback if degenerate
    return (op === 'union' || op === 'subtract') ? [cleanA] : [];
  }

  /**
   * Boolean Operations on Multiple Polygons (N >= 2)
   * @param {Array<Array<{x, y}>>} polygons Array of polygon contours
   * @param {'union'|'subtract'|'intersect'|'exclude'} op
   * @returns {Array<Array<{x, y}>>}
   */
  function clipMultiplePolygons(polygons, op = 'union') {
    if (!polygons || polygons.length === 0) return [];
    if (polygons.length === 1) return [polygons[0]];

    if (op === 'union') {
      let currentList = [polygons[0]];
      for (let i = 1; i < polygons.length; i++) {
        let toMerge = [polygons[i]];
        while (toMerge.length > 0) {
          const candidate = toMerge.pop();
          let merged = false;
          for (let j = 0; j < currentList.length; j++) {
            const existing = currentList[j];
            const clipped = clipPolygons(existing, candidate, 'union');
            if (clipped.length === 1) {
              currentList.splice(j, 1);
              toMerge.push(clipped[0]);
              merged = true;
              break;
            }
          }
          if (!merged) {
            currentList.push(candidate);
          }
        }
      }
      return currentList;
    }

    if (op === 'subtract') {
      let acc = [polygons[0]];
      for (let i = 1; i < polygons.length; i++) {
        const clipPoly = polygons[i];
        let nextAcc = [];
        for (const base of acc) {
          const clipped = clipPolygons(base, clipPoly, 'subtract');
          nextAcc.push(...clipped);
        }
        acc = nextAcc;
      }
      return acc;
    }

    if (op === 'intersect') {
      let acc = [polygons[0]];
      for (let i = 1; i < polygons.length; i++) {
        const clipPoly = polygons[i];
        let nextAcc = [];
        for (const base of acc) {
          const clipped = clipPolygons(base, clipPoly, 'intersect');
          nextAcc.push(...clipped);
        }
        acc = nextAcc;
      }
      return acc;
    }

    if (op === 'exclude') {
      let acc = [polygons[0]];
      for (let i = 1; i < polygons.length; i++) {
        const nextPoly = polygons[i];
        let sub1 = [];
        for (const base of acc) {
          sub1.push(...clipPolygons(base, nextPoly, 'subtract'));
        }
        let sub2 = [nextPoly];
        for (const base of acc) {
          let nextSub2 = [];
          for (const s of sub2) {
            nextSub2.push(...clipPolygons(s, base, 'subtract'));
          }
          sub2 = nextSub2;
        }
        acc = [...sub1, ...sub2];
      }
      return acc;
    }

    return [polygons[0]];
  }

  /**
   * Convert polygon points array into an SvgPath / Bézier curve
   */
  function polygonToSvgPath(poly, SvgPathClass, attributes = {}) {
    const path = new SvgPathClass({
      ...attributes,
      closed: true
    });
    if (!poly || poly.length === 0) return path;

    for (let i = 0; i < poly.length; i++) {
      path.addNode(poly[i].x, poly[i].y, null, null, 'corner');
    }
    return path;
  }

  return {
    clipPolygons,
    clipMultiplePolygons,
    isPointInsidePolygon,
    segmentIntersection,
    polygonToSvgPath,
    cleanPolygon,
    polygonArea
  };
}));
