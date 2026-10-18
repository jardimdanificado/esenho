/**
 * ============================================================================
 * E2E Test Helper: Selection Fixtures (tests/e2e/helpers/selection_fixtures.js)
 * Test fixtures for arbitrary polygon & lasso selection paths, 1-byte mask
 * buffers, point-in-polygon verification, and marching ants phase math.
 * ============================================================================
 */

class SelectionFixtures {
  /**
   * Generates a 5-pointed star polygon (concave polygon with 10 vertices).
   */
  static createStarPolygon(cx, cy, outerRadius, innerRadius) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      points.push({
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle))
      });
    }
    return points;
  }

  /**
   * Generates an L-shaped non-convex polygon.
   */
  static createLShapePolygon(x, y, w, h, thickness) {
    return [
      { x: x, y: y },
      { x: x + thickness, y: y },
      { x: x + thickness, y: y + h - thickness },
      { x: x + w, y: y + h - thickness },
      { x: x + w, y: y + h },
      { x: x, y: y + h }
    ];
  }

  /**
   * Generates a freeform organic lasso curve.
   */
  static createOrganicLasso(cx, cy, radius, numPoints = 20) {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const angle = (i * 2 * Math.PI) / numPoints;
      // Add pseudo-random harmonic modulation to simulate hand tremor
      const wobble = 1 + 0.25 * Math.sin(3 * angle) - 0.15 * Math.cos(5 * angle);
      const r = radius * wobble;
      points.push({
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle))
      });
    }
    return points;
  }

  /**
   * Determines if point (px, py) is inside polygon using ray-casting algorithm.
   */
  static isPointInPolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Computes bounding box of vertex list: [minX, minY, width, height]
   */
  static computeBounds(vertices) {
    if (!vertices || vertices.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of vertices) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX + 1),
      h: Math.max(1, maxY - minY + 1)
    };
  }

  /**
   * Rasterizes arbitrary polygon vertices into a 1-byte mask buffer (1 = inside, 0 = outside).
   */
  static rasterizeMask(vertices, bounds) {
    const mask = new Uint8Array(bounds.w * bounds.h);
    for (let y = 0; y < bounds.h; y++) {
      const py = bounds.y + y;
      for (let x = 0; x < bounds.w; x++) {
        const px = bounds.x + x;
        if (this.isPointInPolygon(px, py, vertices)) {
          mask[y * bounds.w + x] = 1;
        }
      }
    }
    return mask;
  }

  /**
   * Simulates dual-pass marching ants stroke dash calculation.
   * Total pattern length = 16 (8 on, 8 off).
   */
  static computeMarchingAntsDashes(phase) {
    const normalizedPhase = ((phase % 16) + 16) % 16;
    return {
      black: {
        pattern: [8, 8],
        phase: normalizedPhase,
        color: 0xff000000 // Black
      },
      white: {
        pattern: [8, 8],
        phase: (normalizedPhase + 8) % 16,
        color: 0xffffffff // White
      }
    };
  }
}

module.exports = { SelectionFixtures };
