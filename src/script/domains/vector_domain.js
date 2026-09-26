/**
 * =========================================================================
 * Wesenho Vector Scripting Domain (src/script/domains/vector_domain.js)
 * Programmatic creation and manipulation of SVG shapes, Bézier paths,
 * boolean operations, node edits, and SVG tree traversal.
 * =========================================================================
 */

export class VectorDomain {
  constructor(sdk) {
    this.sdk = sdk;
  }

  get doc() {
    return this.sdk.context.vectorDoc || null;
  }

  get objects() {
    return this.doc && this.doc.objects ? this.doc.objects.slice() : [];
  }

  get selectedObjects() {
    return this.doc && this.doc.selectedObjects ? this.doc.selectedObjects.slice() : [];
  }

  /* ── Shape Creation ── */
  createRect(x, y, width, height, style = {}) {
    return this.sdk.commands.dispatch('vector.createShape', {
      type: 'rect',
      x, y, width, height, style
    });
  }

  createEllipse(cx, cy, rx, ry, style = {}) {
    return this.sdk.commands.dispatch('vector.createShape', {
      type: 'ellipse',
      cx, cy, rx, ry, style
    });
  }

  createPath(dString, style = {}) {
    return this.sdk.commands.dispatch('vector.createPath', {
      d: dString, style
    });
  }

  createText(text, x, y, style = {}) {
    return this.sdk.commands.dispatch('vector.createText', {
      text, x, y, style
    });
  }

  /* ── Object Manipulation ── */
  remove(objectId) {
    return this.sdk.commands.dispatch('vector.removeObject', { id: objectId });
  }

  setStyle(objectId, style = {}) {
    return this.sdk.commands.dispatch('vector.setStyle', { id: objectId, style });
  }

  transform(objectId, matrixOrDelta = {}) {
    return this.sdk.commands.dispatch('vector.transformObject', { id: objectId, transform: matrixOrDelta });
  }

  /* ── Boolean Operations ── */
  booleanUnion(objA, objB) {
    return this.sdk.commands.dispatch('vector.boolean', { op: 'union', a: objA, b: objB });
  }

  booleanDifference(objA, objB) {
    return this.sdk.commands.dispatch('vector.boolean', { op: 'difference', a: objA, b: objB });
  }

  booleanIntersection(objA, objB) {
    return this.sdk.commands.dispatch('vector.boolean', { op: 'intersection', a: objA, b: objB });
  }

  /* ── Node & Path Tools ── */
  simplify(objectId, tolerance = 1.0) {
    return this.sdk.commands.dispatch('vector.simplify', { id: objectId, tolerance });
  }

  /* ── Export & Import ── */
  toSVG() {
    return this.doc && typeof this.doc.toSVG === 'function' ? this.doc.toSVG() : '<svg></svg>';
  }

  fromSVG(svgString) {
    return this.sdk.commands.dispatch('vector.importSVG', { svg: svgString });
  }
}
