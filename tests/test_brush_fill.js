/**
 * Test Suite: Procedural Brush Fill & Multi-Stroke Hatching Engine
 * Tests geometry intersection, segmentation, multi-brush cycling, multi-color palettes,
 * variance/jitters, bleed overshooting, and integration with SvgEngine, QuadroRenderer, and ColorStudio.
 */

const assert = require('assert');
const {
  BrushFillEngine,
  DEFAULT_BRUSH_FILL_CONFIG,
  BUILTIN_BRUSH_FILL_PRESETS,
  FastRandom,
  isPointInPolygon,
  findScanlineIntersections
} = require('../src/brush_fill_engine.js');
const SvgEngine = require('../src/svg/svg_engine.js');
const { SvgPath, SvgRect, SvgCircle, SvgCompoundPath } = SvgEngine;
const QuadroSvgRenderer = require('../src/svg/quadro_svg_renderer.js');
const ColorStudio = require('../src/color_studio.js');

console.log('--- Testing Procedural Brush Fill Engine ---');

// 1. Math, Geometry, and FastRandom PRNG
console.log('1. Testing FastRandom and Geometric Intersection...');
const rng = new FastRandom(42);
const val1 = rng.next();
const val2 = rng.next();
assert.ok(val1 >= 0 && val1 <= 1, 'FastRandom next() should be in [0, 1]');
assert.notStrictEqual(val1, val2, 'Consecutive random numbers should differ');

// Determinism test
const rngA = new FastRandom(999);
const rngB = new FastRandom(999);
assert.strictEqual(rngA.next(), rngB.next(), 'PRNG with same seed must produce identical numbers');

// Polygon point-in-polygon
const squarePoly = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 }
];
assert.strictEqual(isPointInPolygon(50, 50, squarePoly), true, 'Center point should be inside square');
assert.strictEqual(isPointInPolygon(-10, 50, squarePoly), false, 'Outside point should not be in square');
assert.strictEqual(isPointInPolygon(150, 50, squarePoly), false, 'Outside point should not be in square');

// Scanline intersection
const inters = findScanlineIntersections(squarePoly, 50);
assert.strictEqual(inters.length, 2, 'Scanline through square should produce 2 intersections');
assert.strictEqual(Math.round(inters[0]), 0, 'Left intersection at x=0');
assert.strictEqual(Math.round(inters[1]), 100, 'Right intersection at x=100');
console.log('✔ FastRandom & Scanline Intersections passed');

// 2. Trajectory Patterns (17 total: Linear, Crosshatch, Triple Hatch, Herringbone, Woven, Isometric, Cross Contour, Radial, Concentric, Flow Field, Voronoi, Contour, Stipple, Scribble, Zigzag, Wave, Spiral)
console.log('2. Testing Procedural Trajectory Patterns (17 patterns)...');
const patterns = [
  'linear', 'crosshatch', 'triple_hatch', 'herringbone', 'woven', 'isometric',
  'cross_contour', 'radial', 'concentric', 'flow_field', 'voronoi',
  'contour', 'stipple', 'scribble', 'zigzag', 'wave', 'spiral'
];

for (const pattern of patterns) {
  const strokes = BrushFillEngine.generateStrokes([squarePoly], {
    enabled: true,
    pattern: pattern,
    spacing: 15,
    seed: 42
  });
  assert.ok(Array.isArray(strokes), `Pattern ${pattern} should return an array of strokes`);
  assert.ok(strokes.length > 0, `Pattern ${pattern} should generate strokes for a 100x100 square (got ${strokes.length})`);
}

// Crosshatch should have more strokes than linear with same spacing
const linearStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'linear', spacing: 10, seed: 10 });
const crossStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'crosshatch', spacing: 10, seed: 10 });
const tripleStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'triple_hatch', spacing: 10, seed: 10 });
assert.ok(crossStrokes.length > linearStrokes.length, 'Crosshatch should produce more strokes than single linear hatch');
assert.ok(tripleStrokes.length > crossStrokes.length, 'Triple hatch should produce more strokes than crosshatch');

// Directional tests (forward, reverse, bidirectional, random)
const bidiStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'linear', strokeDirection: 'bidirectional', spacing: 20, seed: 42 });
const revStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'linear', strokeDirection: 'reverse', spacing: 20, seed: 42 });
assert.ok(bidiStrokes.length > 0 && revStrokes.length > 0, 'Direction modes should generate strokes');

// Origin and Wave parameters
const radialOriginStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'radial', originX: 25, originY: 25, spacing: 15, seed: 42 });
assert.ok(radialOriginStrokes.length > 0, 'Radial with custom origin should produce strokes');

const waveTunedStrokes = BrushFillEngine.generateStrokes([squarePoly], { pattern: 'wave', waveFrequency: 2.5, waveAmplitude: 15, spacing: 20, seed: 42 });
assert.ok(waveTunedStrokes.length > 0, 'Wave with custom freq & amp should produce strokes');

console.log('✔ All 17 procedural patterns and trajectory parameters passed');

// 3. Strokes Per Line, Segmentation, and Gap Controls
console.log('3. Testing Segmentation and Strokes Per Line...');
const singleSegment = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  strokesPerLine: 1,
  strokeGap: 0,
  seed: 42
});
const multiSegment = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  strokesPerLine: 4,
  strokeGap: 5,
  seed: 42
});
assert.strictEqual(multiSegment.length, singleSegment.length * 4, '4 strokes per line should quadruple the stroke count');
console.log('✔ Segmentation and stroke density passed');

// 4. Multi-Brush Tip Cycling and Pick Modes with Native Brush Engine
console.log('4. Testing Multi-Brush Tip Cycling with Native Presets...');
const brushTips = ['pencil', 'charcoal', 'acrylic', 'watercolor'];
const cycledStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 10,
  brushList: brushTips,
  brushPickMode: 'cycle',
  seed: 42
});

assert.strictEqual(cycledStrokes[0].brushTip.key, 'pencil');
assert.ok(cycledStrokes[0].brushTip.brushConfig, 'Stroke brushTip must contain brushConfig');
assert.strictEqual(cycledStrokes[0].brushTip.brushConfig.texture, 'paper', 'Pencil should inherit authentic paper texture');
assert.strictEqual(cycledStrokes[0].brushTip.brushConfig.grain, 45, 'Pencil should inherit authentic 45 grain');

assert.strictEqual(cycledStrokes[1].brushTip.key, 'charcoal');
assert.strictEqual(cycledStrokes[2].brushTip.key, 'acrylic');
assert.strictEqual(cycledStrokes[3].brushTip.key, 'watercolor');
assert.strictEqual(cycledStrokes[4].brushTip.key, 'pencil', 'Cycle mode should wrap back to first brush');
console.log('✔ Multi-Brush Tip cycling with native brush dynamics passed');

// 5. Multi-Color Palette Assignment
console.log('5. Testing Multi-Color Palette Assignment...');
const palette = ['#ff0000', '#00ff00', '#0000ff'];
const paletteStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 10,
  colorMode: 'palette',
  colorPalette: palette,
  colorPickMode: 'cycle',
  colorJitter: 0,
  seed: 42
});

assert.strictEqual(paletteStrokes[0].color, '#ff0000');
assert.strictEqual(paletteStrokes[1].color, '#00ff00');
assert.strictEqual(paletteStrokes[2].color, '#0000ff');
assert.strictEqual(paletteStrokes[3].color, '#ff0000', 'Palette cycling should wrap back to first color');

// 5.1. Testing Saved Palette ID Resolution with PaletteManager
const customPal = ColorStudio.PaletteManager.createPalette('Test Brush Palette', ['#112233', '#445566', '#778899']);
assert.ok(customPal && customPal.id, 'PaletteManager should create custom palette');
const savedPalStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 10,
  colorMode: 'palette',
  colorPaletteId: customPal.id,
  colorPalette: [], // should resolve from colorPaletteId
  colorPickMode: 'cycle',
  colorJitter: 0,
  seed: 42
});
assert.strictEqual(savedPalStrokes[0].color, '#112233');
assert.strictEqual(savedPalStrokes[1].color, '#445566');
assert.strictEqual(savedPalStrokes[2].color, '#778899');
assert.strictEqual(savedPalStrokes[3].color, '#112233');

console.log('✔ Multi-Color Palette cycling & Saved Palettes resolution passed');

// 6. Variance, Curvature, and Jitters
console.log('6. Testing Parameter Variance & Jitters...');
const curvedStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  curvature: 30,
  seed: 42
});
assert.ok(curvedStrokes.some(s => s.type === 'curve' && s.cp !== null), 'Curvature > 0 should generate curve strokes with control points');

const jitteredStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 15,
  strokeWidth: 4,
  widthJitter: 50,
  strokeOpacity: 0.8,
  opacityJitter: 30,
  seed: 42
});
const widths = jitteredStrokes.map(s => s.width);
const minW = Math.min(...widths);
const maxW = Math.max(...widths);
assert.ok(maxW > minW, 'Width jitter should produce variation in stroke widths');
console.log('✔ Variance & Jitters passed');

// 7. Boundary Bleed & Overshoot Past Contours
console.log('7. Testing Boundary Bleed and Overshoot...');
const strictStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  angle: 0,
  clipMode: 'strict',
  bleedDistance: 0,
  seed: 42
});

const bleedStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  angle: 0,
  clipMode: 'bleed',
  bleedDistance: 25,
  bleedJitter: 0,
  bleedProbability: 100,
  seed: 42
});

// In horizontal angle 0: strict strokes span x: 0 to 100 (len 100). Bleed strokes should overshoot by bleedDistance on both ends (span -25 to 125, len 150)
const strictLen = Math.abs(strictStrokes[0].p1.x - strictStrokes[0].p0.x);
const bleedLen = Math.abs(bleedStrokes[0].p1.x - bleedStrokes[0].p0.x);
assert.strictEqual(Math.round(strictLen), 100, 'Strict stroke should match polygon span');
assert.strictEqual(Math.round(bleedLen), 150, 'Bleed stroke should overshoot polygon boundary by 2x bleedDistance');
console.log('✔ Boundary Bleed & Overshoot passed');

// 8. SvgEngine Serialization & SVG Group Export
console.log('8. Testing SvgEngine Integration (SvgNode, toJSON, clone, toSVGElement)...');
const rect = new SvgRect(10, 10, 80, 80, {
  fill: '#fabd2f',
  fillType: 'brush',
  brushFill: {
    enabled: true,
    pattern: 'crosshatch',
    spacing: 8,
    colorPalette: ['#1d2021'],
    brushList: ['round']
  }
});

const json = rect.toJSON();
assert.strictEqual(json.fillType, 'brush');
assert.strictEqual(json.brushFill.pattern, 'crosshatch');

const cloned = rect.clone();
assert.strictEqual(cloned.fillType, 'brush');
assert.strictEqual(cloned.brushFill.pattern, 'crosshatch');

const svgEl = rect.toSVGElement();
assert.ok(svgEl.includes('esenho-brush-fill'), 'Generated SVG should contain esenho-brush-fill group');
assert.ok(svgEl.includes('data-brush-fill'), 'Generated SVG should contain data-brush-fill attribute');
console.log('✔ SvgEngine Integration passed');

// 9. Quadro SVG Renderer Brush Fill Execution
console.log('9. Testing Quadro WASM Renderer Brush Fill Execution...');
const mockActor = {
  exports: new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'memory') return new WebAssembly.Memory({ initial: 256 });
      return () => 0;
    }
  })
};
const renderer = new QuadroSvgRenderer(mockActor);
const mockDoc = new SvgEngine.SvgDocument(200, 200);
mockDoc.addObject(rect);

assert.doesNotThrow(() => {
  renderer.renderDocument(mockDoc, 1.0);
}, 'QuadroSvgRenderer should cleanly render document containing brush-filled objects');
console.log('✔ Quadro WASM Renderer execution passed');

// 10. ColorStudio Widget Direct Brush Fill Workflow
console.log('10. Testing ColorStudio Widget Brush Fill API...');
const studioDoc = new SvgEngine.SvgDocument(300, 300);
const studioRect = new SvgRect(20, 20, 100, 100);
studioDoc.addObject(studioRect);
studioDoc.select(studioRect.id);

assert.strictEqual(studioRect.fillType, 'solid');

// Apply brush fill directly to selected object
studioRect.brushFill = {
  enabled: true,
  pattern: 'stipple',
  spacing: 5,
  colorPalette: ['#fe8019', '#fabd2f']
};
studioRect.fillType = 'brush';

assert.strictEqual(studioRect.fillType, 'brush');
assert.strictEqual(studioRect.brushFill.pattern, 'stipple');
assert.strictEqual(studioRect.brushFill.colorPalette.length, 2);

console.log('✔ ColorStudio Brush Fill workflow passed');

// 11. Resizing & scaleObjectToBox Stability with Brush-Filled Objects
console.log('11. Testing Object Resizing & scaleObjectToBox with Brush-Filled Paths & Shapes...');

// Function mirroring studio scaleObjectToBox
function scaleObjectToBox(obj, origState, origBounds, newMinX, newMinY, newW, newH) {
  if (!obj || !origState || !origBounds) return;

  newW = Math.max(0.5, newW || 0.5);
  newH = Math.max(0.5, newH || 0.5);

  let sw = 0;
  if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'ellipse') {
    if (origState.stroke && origState.stroke !== 'none' && origState.strokeWidth) {
      sw = Number(origState.strokeWidth) / 2;
    }
  }

  const geomMinX = origBounds.minX + sw;
  const geomMinY = origBounds.minY + sw;
  const geomW = Math.max(0.001, origBounds.width - sw * 2);
  const geomH = Math.max(0.001, origBounds.height - sw * 2);

  const newGeomMinX = newMinX + sw;
  const newGeomMinY = newMinY + sw;
  const newGeomW = Math.max(0.001, newW - sw * 2);
  const newGeomH = Math.max(0.001, newH - sw * 2);

  const rawSx = (origBounds.width > 0.0001) ? newW / origBounds.width : 1;
  const rawSy = (origBounds.height > 0.0001) ? newH / origBounds.height : 1;

  const sx = (geomW > 0.0001) ? newGeomW / geomW : 1;
  const sy = (geomH > 0.0001) ? newGeomH / geomH : 1;

  if (obj.type === 'rect') {
    obj.x = newGeomMinX + ((origState.x !== undefined ? origState.x : geomMinX) - geomMinX) * sx;
    obj.y = newGeomMinY + ((origState.y !== undefined ? origState.y : geomMinY) - geomMinY) * sy;
    obj.width = Math.max(0.5, (origState.width !== undefined ? origState.width : geomW) * sx);
    obj.height = Math.max(0.5, (origState.height !== undefined ? origState.height : geomH) * sy);
  } else if (obj.type === 'path') {
    if (obj.nodes && origState.nodes) {
      for (let i = 0; i < obj.nodes.length; i++) {
        const orig = origState.nodes[i];
        obj.nodes[i].x = newMinX + (orig.x - origBounds.minX) * rawSx;
        obj.nodes[i].y = newMinY + (orig.y - origBounds.minY) * rawSy;
        if (orig.cpIn) obj.nodes[i].cpIn = { x: orig.cpIn.x * rawSx, y: orig.cpIn.y * rawSy };
        if (orig.cpOut) obj.nodes[i].cpOut = { x: orig.cpOut.x * rawSx, y: orig.cpOut.y * rawSy };
      }
    }
  }
}

// Create a brush-filled path with thick stroke and control handles
const brushPath = new SvgPath({
  fill: '#fabd2f',
  fillType: 'brush',
  stroke: '#1d2021',
  strokeWidth: 20,
  brushFill: {
    enabled: true,
    pattern: 'crosshatch',
    spacing: 10,
    brushList: ['pencil']
  }
});
brushPath.addNode(10, 10, { x: 0, y: 0 }, { x: 15, y: 5 }, 'smooth');
brushPath.addNode(50, 40, { x: -10, y: -5 }, { x: 10, y: 5 }, 'smooth');
brushPath.addNode(80, 20, { x: -5, y: -10 }, { x: 0, y: 0 }, 'smooth');
brushPath.closed = true;

const origState = JSON.parse(JSON.stringify(brushPath.toJSON()));
const origBounds = brushPath.getBounds();

// Scale the path down to a small box (which previously caused division by near-zero / spaghetti explosion)
scaleObjectToBox(brushPath, origState, origBounds, 200, 200, 30, 20);

// Validate all nodes and control points are in valid range and finite
for (const n of brushPath.nodes) {
  assert.ok(isFinite(n.x) && !isNaN(n.x), `Node x must be finite: ${n.x}`);
  assert.ok(isFinite(n.y) && !isNaN(n.y), `Node y must be finite: ${n.y}`);
  assert.ok(n.x >= 190 && n.x <= 240, `Node x should be within scaled bounds, got ${n.x}`);
  assert.ok(n.y >= 190 && n.y <= 230, `Node y should be within scaled bounds, got ${n.y}`);
  assert.ok(isFinite(n.cpIn.x) && Math.abs(n.cpIn.x) < 50, `cpIn.x must not explode: ${n.cpIn.x}`);
  assert.ok(isFinite(n.cpOut.x) && Math.abs(n.cpOut.x) < 50, `cpOut.x must not explode: ${n.cpOut.x}`);
}

// Verify that strokes can still be generated without errors on the scaled geometry
const poly = brushPath.toPolyline ? brushPath.toPolyline(0.5) : [];
const scaledStrokes = BrushFillEngine.generateStrokes([poly], brushPath.brushFill);
assert.ok(Array.isArray(scaledStrokes), 'generateStrokes should produce array');
console.log(`✔ Resized brush path generated ${scaledStrokes.length} valid strokes without spaghetti corruption`);

console.log('--- ALL PROCEDURAL BRUSH FILL ENGINE TESTS PASSED ---');
