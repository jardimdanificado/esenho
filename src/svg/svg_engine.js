/**
 * =========================================================================
 * SVG Object Engine & Scene Graph (src/svg/svg_engine.js)
 * Standalone vector object model with Bézier curves & SVG parser/serializer.
 * =========================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SvgEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let nextId = 1;
  function generateId(prefix = 'obj') {
    return `${prefix}_${nextId++}_${Math.random().toString(36).substr(2, 5)}`;
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
        // Flatness test: distance from control points to baseline
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

        // Subdivide using de Casteljau at midpoint t=0.5
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

    /** Approximate cubic Bézier length */
    cubicLength(p0, cp1, cp2, p1, steps = 16) {
      let len = 0;
      let prev = p0;
      for (let i = 1; i <= steps; i++) {
        const pt = Bezier.evalCubic(p0, cp1, cp2, p1, i / steps);
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        len += Math.sqrt(dx * dx + dy * dy);
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

      // Style
      this.fill = attributes.fill !== undefined ? attributes.fill : '#fabd2f';
      this.fillOpacity = attributes.fillOpacity !== undefined ? Number(attributes.fillOpacity) : 1.0;
      this.stroke = attributes.stroke !== undefined ? attributes.stroke : '#1d2021';
      this.strokeWidth = attributes.strokeWidth !== undefined ? Number(attributes.strokeWidth) : 2;
      this.strokeOpacity = attributes.strokeOpacity !== undefined ? Number(attributes.strokeOpacity) : 1.0;
      this.strokeLinecap = attributes.strokeLinecap || 'round';
      this.strokeLinejoin = attributes.strokeLinejoin || 'round';
      this.strokeDasharray = attributes.strokeDasharray || '';

      // Transform
      this.x = Number(attributes.x || 0);
      this.y = Number(attributes.y || 0);
      this.rotation = Number(attributes.rotation || 0); // in degrees
      this.scaleX = Number(attributes.scaleX !== undefined ? attributes.scaleX : 1);
      this.scaleY = Number(attributes.scaleY !== undefined ? attributes.scaleY : 1);
      this.parent = null;
    }

    clone() {
      const json = this.toJSON();
      json.id = generateId(this.type);
      json.name = `${this.name} (Copy)`;
      return SvgNode.fromJSON(json);
    }

    getBounds() {
      return { minX: this.x, minY: this.y, maxX: this.x, maxY: this.y, width: 0, height: 0 };
    }

    hitTest(px, py, tolerance = 6) {
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
        stroke: this.stroke,
        strokeWidth: this.strokeWidth,
        strokeOpacity: this.strokeOpacity,
        strokeLinecap: this.strokeLinecap,
        strokeLinejoin: this.strokeLinejoin,
        strokeDasharray: this.strokeDasharray,
        x: this.x,
        y: this.y,
        rotation: this.rotation,
        scaleX: this.scaleX,
        scaleY: this.scaleY
      };
    }

    static fromJSON(data) {
      switch (data.type) {
        case 'path': return SvgPath.fromJSON(data);
        case 'rect': return SvgRect.fromJSON(data);
        case 'circle': return SvgCircle.fromJSON(data);
        case 'ellipse': return SvgEllipse.fromJSON(data);
        case 'line': return SvgLine.fromJSON(data);
        case 'polygon': return SvgPolygon.fromJSON(data);
        case 'polyline': return SvgPolyline.fromJSON(data);
        case 'group': return SvgGroup.fromJSON(data);
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
      this.type = type; // 'smooth', 'corner', 'symmetric'
    }

    getAbsCpIn() {
      return { x: this.x + this.cpIn.x, y: this.y + this.cpIn.y };
    }

    getAbsCpOut() {
      return { x: this.x + this.cpOut.x, y: this.y + this.cpOut.y };
    }

    setAbsCpIn(ax, ay) {
      this.cpIn.x = ax - this.x;
      this.cpIn.y = ay - this.y;
      if (this.type === 'symmetric') {
        this.cpOut.x = -this.cpIn.x;
        this.cpOut.y = -this.cpIn.y;
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

    setAbsCpOut(ax, ay) {
      this.cpOut.x = ax - this.x;
      this.cpOut.y = ay - this.y;
      if (this.type === 'symmetric') {
        this.cpIn.x = -this.cpOut.x;
        this.cpIn.y = -this.cpOut.y;
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

      if (this.closed && this.nodes.length > 2) {
        const last = this.nodes[this.nodes.length - 1];
        const first = this.nodes[0];
        const cp1 = last.getAbsCpOut();
        const cp2 = first.getAbsCpIn();
        const hasCp1 = Math.hypot(last.cpOut.x, last.cpOut.y) > 0.1;
        const hasCp2 = Math.hypot(first.cpIn.x, first.cpIn.y) > 0.1;

        if (hasCp1 || hasCp2) {
          d += ` C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
        }
        d += ' Z';
      }

      return d;
    }

    setPathData(d) {
      this.nodes = [];
      this.closed = false;
      if (!d) return;

      const commands = d.match(/[a-df-z][^a-df-z]*/ig) || [];
      let curX = 0, curY = 0;

      for (const cmdStr of commands) {
        const type = cmdStr[0];
        const args = cmdStr.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);

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
      const fill = this.fill || 'none';
      const stroke = this.stroke || 'none';
      const sw = this.strokeWidth;
      const op = this.opacity;
      const fillOp = this.fillOpacity;
      const strokeOp = this.strokeOpacity;
      const cap = this.strokeLinecap;
      const join = this.strokeLinejoin;
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      return `<path id="${this.id}" d="${d}" fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${strokeOp}" stroke-linecap="${cap}" stroke-linejoin="${join}" opacity="${op}"${dash} />`;
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

    toPath() {
      const path = new SvgPath({
        ...this.toJSON(),
        type: 'path'
      });
      path.closed = true;
      const x = this.x, y = this.y, w = this.width, h = this.height;
      path.addNode(x, y, null, null, 'corner');
      path.addNode(x + w, y, null, null, 'corner');
      path.addNode(x + w, y + h, null, null, 'corner');
      path.addNode(x, y + h, null, null, 'corner');
      return path;
    }

    toSVGElement() {
      const fill = this.fill || 'none';
      const stroke = this.stroke || 'none';
      const rxAttr = this.rx > 0 ? ` rx="${this.rx}"` : '';
      const ryAttr = this.ry > 0 ? ` ry="${this.ry}"` : '';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      return `<rect id="${this.id}" x="${this.x}" y="${this.y}" width="${this.width}" height="${this.height}"${rxAttr}${ryAttr} fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash} />`;
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

    toPath() {
      const path = new SvgPath({
        ...this.toJSON(),
        type: 'path'
      });
      path.closed = true;
      const k = 0.5522847498; // Bézier circle constant
      const cx = this.cx, cy = this.cy, rx = this.rx, ry = this.ry;
      const ox = rx * k, oy = ry * k;

      path.addNode(cx, cy - ry, { x: -ox, y: 0 }, { x: ox, y: 0 }, 'smooth');
      path.addNode(cx + rx, cy, { x: 0, y: -oy }, { x: 0, y: oy }, 'smooth');
      path.addNode(cx, cy + ry, { x: ox, y: 0 }, { x: -ox, y: 0 }, 'smooth');
      path.addNode(cx - rx, cy, { x: 0, y: oy }, { x: 0, y: -oy }, 'smooth');
      return path;
    }

    toSVGElement() {
      const fill = this.fill || 'none';
      const stroke = this.stroke || 'none';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';

      return `<ellipse id="${this.id}" cx="${this.cx}" cy="${this.cy}" rx="${this.rx}" ry="${this.ry}" fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash} />`;
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
      const fill = this.fill || 'none';
      const stroke = this.stroke || 'none';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';
      return `<circle id="${this.id}" cx="${this.cx}" cy="${this.cy}" r="${this.r}" fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash} />`;
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

    toPath() {
      const path = new SvgPath({ ...this.toJSON(), type: 'path' });
      path.closed = false;
      path.addNode(this.x1, this.y1, null, null, 'corner');
      path.addNode(this.x2, this.y2, null, null, 'corner');
      return path;
    }

    toSVGElement() {
      const stroke = this.stroke || '#000';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';
      return `<line id="${this.id}" x1="${this.x1}" y1="${this.y1}" x2="${this.x2}" y2="${this.y2}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" stroke-linecap="${this.strokeLinecap}" opacity="${this.opacity}"${dash} />`;
    }

    toJSON() {
      const data = super.toJSON();
      data.x1 = this.x1; data.y1 = this.y1;
      data.x2 = this.x2; data.y2 = this.y2;
      return data;
    }

    static fromJSON(data) {
      return new SvgLine(data);
    }
  }

  class SvgPolygon extends SvgNode {
    constructor(attributes = {}) {
      super('polygon', attributes);
      this.points = Array.isArray(attributes.points) ? attributes.points : [];
      if (typeof attributes.points === 'string') {
        this.points = attributes.points.trim().split(/[\s,]+/).reduce((acc, val, i, arr) => {
          if (i % 2 === 0 && arr[i + 1] !== undefined) acc.push({ x: Number(val), y: Number(arr[i + 1]) });
          return acc;
        }, []);
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

    toPath() {
      const path = new SvgPath({ ...this.toJSON(), type: 'path' });
      path.closed = true;
      for (const p of this.points) path.addNode(p.x, p.y, null, null, 'corner');
      return path;
    }

    toSVGElement() {
      const pts = this.points.map(p => `${p.x},${p.y}`).join(' ');
      const fill = this.fill || 'none';
      const stroke = this.stroke || 'none';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';
      return `<polygon id="${this.id}" points="${pts}" fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash} />`;
    }

    toJSON() {
      const data = super.toJSON();
      data.points = this.points.map(p => ({ x: p.x, y: p.y }));
      return data;
    }

    static fromJSON(data) {
      return new SvgPolygon(data);
    }
  }

  class SvgPolyline extends SvgPolygon {
    constructor(attributes = {}) {
      super(attributes);
      this.type = 'polyline';
      this.fill = attributes.fill || 'none';
    }

    toPath() {
      const path = super.toPath();
      path.closed = false;
      return path;
    }

    toSVGElement() {
      const pts = this.points.map(p => `${p.x},${p.y}`).join(' ');
      const fill = this.fill || 'none';
      const stroke = this.stroke || 'none';
      const dash = this.strokeDasharray ? ` stroke-dasharray="${this.strokeDasharray}"` : '';
      return `<polyline id="${this.id}" points="${pts}" fill="${fill}" fill-opacity="${this.fillOpacity}" stroke="${stroke}" stroke-width="${this.strokeWidth}" stroke-opacity="${this.strokeOpacity}" opacity="${this.opacity}"${dash} />`;
    }

    static fromJSON(data) {
      return new SvgPolyline(data);
    }
  }

  /* =========================================================================
   * SvgGroup Object
   * ========================================================================= */

  class SvgGroup extends SvgNode {
    constructor(attributes = {}) {
      super('group', attributes);
      this.children = [];
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

    remove(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        child.parent = null;
        return this.children.splice(idx, 1)[0];
      }
      return null;
    }

    getBounds() {
      if (this.children.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of this.children) {
        if (!c.visible) continue;
        const b = c.getBounds();
        minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
      }
      return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    }

    toSVGElement() {
      const kids = this.children.map(c => c.toSVGElement()).join('\n    ');
      return `<g id="${this.id}" opacity="${this.opacity}">\n    ${kids}\n  </g>`;
    }

    toJSON() {
      const data = super.toJSON();
      data.children = this.children.map(c => c.toJSON());
      return data;
    }

    static fromJSON(data) {
      return new SvgGroup(data);
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
      this.selectedIds = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this.maxHistory = 50;
    }

    clear() {
      this.pushHistory('Clear Document');
      this.objects = [];
      this.selectedIds.clear();
    }

    addObject(obj, pushHistory = true) {
      if (pushHistory) this.pushHistory(`Add ${obj.name}`);
      this.objects.push(obj);
      return obj;
    }

    insertObject(index, obj, pushHistory = true) {
      if (pushHistory) this.pushHistory(`Insert ${obj.name}`);
      this.objects.splice(index, 0, obj);
      return obj;
    }

    removeObject(id, pushHistory = true) {
      const idx = this.objects.findIndex(o => o.id === id);
      if (idx !== -1) {
        if (pushHistory) this.pushHistory(`Remove ${this.objects[idx].name}`);
        this.selectedIds.delete(id);
        return this.objects.splice(idx, 1)[0];
      }
      return null;
    }

    findObject(id) {
      return this.objects.find(o => o.id === id) || null;
    }

    /** Z-Index Ordering */
    bringForward(id) {
      const idx = this.objects.findIndex(o => o.id === id);
      if (idx !== -1 && idx < this.objects.length - 1) {
        this.pushHistory('Bring Forward');
        const [obj] = this.objects.splice(idx, 1);
        this.objects.splice(idx + 1, 0, obj);
        return true;
      }
      return false;
    }

    sendBackward(id) {
      const idx = this.objects.findIndex(o => o.id === id);
      if (idx > 0) {
        this.pushHistory('Send Backward');
        const [obj] = this.objects.splice(idx, 1);
        this.objects.splice(idx - 1, 0, obj);
        return true;
      }
      return false;
    }

    bringToFront(id) {
      const idx = this.objects.findIndex(o => o.id === id);
      if (idx !== -1 && idx < this.objects.length - 1) {
        this.pushHistory('Bring to Front');
        const [obj] = this.objects.splice(idx, 1);
        this.objects.push(obj);
        return true;
      }
      return false;
    }

    sendToBack(id) {
      const idx = this.objects.findIndex(o => o.id === id);
      if (idx > 0) {
        this.pushHistory('Send to Back');
        const [obj] = this.objects.splice(idx, 1);
        this.objects.unshift(obj);
        return true;
      }
      return false;
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
      return this.objects.filter(o => this.selectedIds.has(o.id));
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
    toSVGString() {
      let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="${this.viewBox}">\n`;
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

    /** Import / parse standard SVG XML string */
    fromSVGString(svgString) {
      this.pushHistory('Import SVG');
      this.objects = [];
      this.selectedIds.clear();

      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) throw new Error('Invalid SVG markup: no <svg> root element');

        if (svgEl.getAttribute('width')) this.width = parseFloat(svgEl.getAttribute('width'));
        if (svgEl.getAttribute('height')) this.height = parseFloat(svgEl.getAttribute('height'));
        if (svgEl.getAttribute('viewBox')) this.viewBox = svgEl.getAttribute('viewBox');

        const parseEl = (el) => {
          const tag = el.tagName.toLowerCase();
          const getAttr = (name, def = null) => el.getAttribute(name) || def;
          const style = el.getAttribute('style') || '';
          const getStyle = (name) => {
            const m = style.match(new RegExp(`${name}\\s*:\\s*([^;]+)`));
            return m ? m[1].trim() : null;
          };

          const fill = getStyle('fill') || getAttr('fill', '#000000');
          const stroke = getStyle('stroke') || getAttr('stroke', 'none');
          const strokeWidth = parseFloat(getStyle('stroke-width') || getAttr('stroke-width', '1'));
          const opacity = parseFloat(getStyle('opacity') || getAttr('opacity', '1'));
          const fillOpacity = parseFloat(getStyle('fill-opacity') || getAttr('fill-opacity', '1'));
          const strokeOpacity = parseFloat(getStyle('stroke-opacity') || getAttr('stroke-opacity', '1'));

          const baseProps = {
            id: getAttr('id', generateId(tag)),
            fill, stroke, strokeWidth, opacity, fillOpacity, strokeOpacity
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
            return new SvgPath({
              ...baseProps,
              d: getAttr('d', '')
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
          } else if (tag === 'g') {
            const grp = new SvgGroup(baseProps);
            for (const child of el.children) {
              const parsedChild = parseEl(child);
              if (parsedChild) grp.add(parsedChild);
            }
            return grp;
          }
          return null;
        };

        for (const child of svgEl.children) {
          const parsed = parseEl(child);
          if (parsed) this.addObject(parsed, false);
        }
      } else {
        const pathMatches = svgString.matchAll(/<path([^>]+)\/?>/ig);
        for (const match of pathMatches) {
          const dMatch = match[1].match(/d="([^"]+)"/i);
          if (dMatch) {
            this.addObject(new SvgPath({ d: dMatch[1] }), false);
          }
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

    loadJSON(data) {
      this.width = data.width || 800;
      this.height = data.height || 600;
      this.viewBox = data.viewBox || `0 0 ${this.width} ${this.height}`;
      this.backgroundColor = data.backgroundColor || '#1d2021';
      this.objects = (data.objects || []).map(o => SvgNode.fromJSON(o));
      this.selectedIds.clear();
    }
  }

  return {
    Bezier,
    PathNode,
    SvgNode,
    SvgPath,
    SvgRect,
    SvgCircle,
    SvgEllipse,
    SvgLine,
    SvgPolygon,
    SvgPolyline,
    SvgGroup,
    SvgDocument,
    generateId
  };
}));
