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
const { SvgDocument, SvgPath, SvgRect, SvgCircle, SvgCompoundPath, SvgLine, SvgNode } = SvgEngine;
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

// 4.1. Testing Flexible N-Brush Pool (`config.brushes`) with Random and Alternate modes
const fiveBrushPool = ['gpen', 'marker', 'dry_ink', 'tech_pen', 'spray'];
const poolStrokesCycle = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 10,
  brushes: fiveBrushPool,
  brushPickMode: 'cycle',
  seed: 123
});
assert.strictEqual(poolStrokesCycle[0].brushTip.key, 'gpen');
assert.strictEqual(poolStrokesCycle[1].brushTip.key, 'marker');
assert.strictEqual(poolStrokesCycle[2].brushTip.key, 'dry_ink');
assert.strictEqual(poolStrokesCycle[3].brushTip.key, 'tech_pen');
assert.strictEqual(poolStrokesCycle[4].brushTip.key, 'spray');
assert.strictEqual(poolStrokesCycle[5].brushTip.key, 'gpen', 'Pool should wrap cleanly after 5 items');

const poolStrokesRandom = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 8,
  brushes: ['pencil', 'oil'],
  brushPickMode: 'random',
  seed: 99
});
const randomKeys = new Set(poolStrokesRandom.map(s => s.brushTip.key));
assert.ok(randomKeys.has('pencil') && randomKeys.has('oil'), 'Random pick mode should include both brushes in the pool');

// 4.2. Testing Stroke Dynamics: Hardness & Flow override
const dynamicsStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 15,
  hardness: 42,
  flow: 67,
  seed: 42
});
assert.strictEqual(dynamicsStrokes[0].hardness, 42, 'Config hardness must be passed to generated strokes');
assert.strictEqual(dynamicsStrokes[0].flow, 67, 'Config flow must be passed to generated strokes');
assert.strictEqual(dynamicsStrokes[0].brushTip.hardness, 42, 'Config hardness must be passed to brushTip');
assert.strictEqual(dynamicsStrokes[0].brushTip.flow, 67, 'Config flow must be passed to brushTip');

// 4.3. Testing S-Curve (cubic) and Wavy Wobble (poly) generation
const sCurveStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  curvature: 25,
  curvatureMode: 's_curve',
  seed: 42
});
assert.ok(sCurveStrokes.some(s => s.type === 'cubic' && s.cp1 && s.cp2), 'S-Curve must generate cubic Bezier strokes with cp1 and cp2');

const wavyStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  curvatureMode: 'wave',
  waveFrequency: 6,
  seed: 42
});
assert.ok(wavyStrokes.some(s => s.type === 'poly' && s.points && s.points.length > 2), 'Wave curvature mode must generate polyline strokes with multiple points');

const wobbleStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 20,
  wobble: 50,
  seed: 42
});
assert.ok(wobbleStrokes.some(s => s.type === 'poly' && s.points && s.points.length > 2), 'Wobble factor > 0 must generate polyline strokes with organic hand tremor');

console.log('✔ Multi-Brush Pool & Stroke Dynamics (flow, hardness, wobble, s-curve, wave) passed');

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
assert.ok(!svgEl.includes('esenho-brush-fill'), 'Direct SVG element should NOT generate heavy brush fill stroke groups');
assert.ok(svgEl.includes('data-brush-fill'), 'Direct SVG element must contain data-brush-fill attribute for serialization/renderer');
console.log('✔ SvgEngine Integration passed (Clean vector output with data-brush-fill attributes)');

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

// 12. Testing First-Class Brush Fill Preset Library API
console.log('12. Testing First-Class Brush Fill Preset Library API...');
const allPresets = BrushFillEngine.getPresets();
assert.ok(allPresets.length >= 25, `Should load at least 25 built-in presets (got ${allPresets.length})`);

const engravingPreset = BrushFillEngine.getPreset('bf_vintage_engraving');
assert.ok(engravingPreset, 'bf_vintage_engraving must exist in preset library');
assert.strictEqual(engravingPreset.brushFill.pattern, 'triple_hatch');

const daVinciPreset = BrushFillEngine.getPreset('bf_sanguine_sketch');
assert.ok(daVinciPreset, 'bf_sanguine_sketch must exist');
assert.strictEqual(daVinciPreset.category, 'sketch');

const customRegistered = BrushFillEngine.registerPreset({
  id: 'bf_custom_synth',
  name: 'Synthwave Neon Wave',
  category: 'custom',
  brushFill: {
    enabled: true,
    pattern: 'wave',
    brush: 'marker',
    spacing: 12
  }
});
assert.strictEqual(customRegistered.id, 'bf_custom_synth');
assert.strictEqual(BrushFillEngine.getPreset('bf_custom_synth').name, 'Synthwave Neon Wave');

const resolvedConfig = BrushFillEngine.resolveConfig('bf_custom_synth', { spacing: 18 });
assert.strictEqual(resolvedConfig.pattern, 'wave');
assert.strictEqual(resolvedConfig.spacing, 18, 'Override spacing must apply');
assert.strictEqual(resolvedConfig.brush, 'marker');
console.log(`✔ BrushFillEngine Preset Library API verified (${allPresets.length} presets loaded)`);

// 13. Testing Material Color & Gradient Scheme (Linear & Radial Gradient Mapping)
console.log('13. Testing Material Solid Color & Gradient Mapping in Brush Fill...');
// 13.1. Direct Solid Material Color
const solidMaterialStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 10,
  color: '#e78a4e',
  seed: 42
});
assert.ok(solidMaterialStrokes.length > 0);
assert.strictEqual(solidMaterialStrokes[0].color, '#e78a4e', 'Brush stroke must use material solid color');

// 13.2. Linear Gradient Mapping
const linearGradStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  angle: 90, // vertical lines from left to right
  spacing: 10,
  gradient: {
    type: 'linear',
    angle: 0, // left to right gradient
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' }
    ]
  },
  seed: 42
});
assert.ok(linearGradStrokes.length >= 5);
const gradColors = linearGradStrokes.map(s => s.color.toLowerCase());
assert.ok(gradColors.some(c => c.startsWith('#f') || c.startsWith('#e') || c.startsWith('#d')), 'Should contain red-dominant strokes');
assert.ok(gradColors.some(c => c.startsWith('#0') || c.startsWith('#1') || c.startsWith('#2')), 'Should contain blue-dominant strokes');
assert.notStrictEqual(gradColors[0], gradColors[gradColors.length - 1], 'Strokes must transition from start to end of gradient');

// 13.3. Radial Gradient Mapping
const radialGradStrokes = BrushFillEngine.generateStrokes([squarePoly], {
  pattern: 'linear',
  spacing: 10,
  gradient: {
    type: 'radial',
    cx: 0.5,
    cy: 0.5,
    radius: 0.5,
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#000000' }
    ]
  },
  seed: 42
});
assert.ok(radialGradStrokes.length > 0);
console.log('✔ Material Solid Color & Linear/Radial Gradient Mapping passed');

// 14. Testing Mutual Exclusivity of Material Modes
console.log('14. Testing Material Mutually Exclusive Types (Standard vs BrushFill)...');
const testDoc = new SvgDocument();
const testRect = new SvgRect({ x: 10, y: 10, width: 80, height: 80, fill: '#fe8019' });
testDoc.addObject(testRect);
testDoc.selectedIds.add(testRect.id);
global.doc = testDoc;

const widget = new ColorStudio.ColorStudioWidget();

// Mode A: Standard Material with Texture
widget.applyMaterialPreset({
  mode: 'standard',
  color: '#ebdbb2',
  texture: { mode: 1, scale: 50 }
});
assert.strictEqual(testRect.fillType, 'solid');
assert.ok(!testRect.brushFill || testRect.brushFill.enabled === false, 'Standard material must disable brush fill');
assert.ok(testRect.fillTexture, 'Standard material should have fillTexture');

// Mode B: Brush Fill Material
widget.applyMaterialPreset({
  mode: 'brushfill',
  color: '#83a598',
  brushFill: { enabled: true, pattern: 'crosshatch' }
});
assert.strictEqual(testRect.fillType, 'brush', 'BrushFill material must set fillType to brush');
assert.strictEqual(testRect.brushFill.enabled, true, 'BrushFill material must enable brush fill');
assert.strictEqual(testRect.fillTexture, null, 'BrushFill material must disable standard fill texture');
console.log('✔ Mutual Exclusivity of Standard vs BrushFill Material passed');

// 15. Testing Stroke Brush Fill on Outlined Stroke Paths
console.log('15. Testing Stroke Brush Fill on Vector Strokes...');
const strokeLine = new SvgLine({ x1: 10, y1: 50, x2: 190, y2: 50, stroke: '#fb4934', strokeWidth: 30 });
const strokeCircle = new SvgCircle({ cx: 100, cy: 100, r: 40, fill: 'none', stroke: '#b8bb26', strokeWidth: 20 });
testDoc.addObject(strokeLine);
testDoc.addObject(strokeCircle);

// 15.1. Color Studio Target Stroke Brush Fill Application
testDoc.selectedIds.clear();
testDoc.selectedIds.add(strokeLine.id);
widget.setTarget('stroke');
widget.applyBrushFillPreset({
  brushFill: {
    enabled: true,
    pattern: 'linear',
    spacing: 8,
    angle: 45,
    brushes: ['pencil']
  }
});

assert.strictEqual(strokeLine.strokeType, 'brush', 'strokeLine.strokeType should be brush');
assert.strictEqual(strokeLine.strokeBrushFill.enabled, true, 'strokeLine.strokeBrushFill.enabled should be true');
assert.strictEqual(strokeLine.strokeBrushFill.pattern, 'linear', 'pattern should be linear');

// 15.2. SVG serialization of stroke-brush-fill
const strokeExtra = strokeLine.getExtraSVGAttributes();
assert.ok(strokeExtra.includes('data-stroke-brush-fill'), 'Extra attributes should serialize data-stroke-brush-fill');
const strokeSvgGroup = strokeLine.getStrokeBrushFillSVG();
assert.ok(strokeSvgGroup && strokeSvgGroup.includes('<path') || strokeSvgGroup.includes('<g'), 'getStrokeBrushFillSVG should generate SVG group with strokes');

// 15.3. JSON serialization & restoration
const lineJson = strokeLine.toJSON();
assert.strictEqual(lineJson.strokeType, 'brush');
assert.ok(lineJson.strokeBrushFill);
const restoredLine = SvgNode.fromJSON(lineJson);
assert.strictEqual(restoredLine.strokeType, 'brush');
assert.strictEqual(restoredLine.strokeBrushFill.pattern, 'linear');

// 15.4. Quadro SVG Renderer stroke brush fill execution
if (renderer && mockActor) {
  strokeCircle.strokeType = 'brush';
  strokeCircle.strokeBrushFill = {
    enabled: true,
    pattern: 'crosshatch',
    spacing: 6,
    brushes: ['pencil']
  };
  renderer.renderDocument(testDoc);
  assert.ok(strokeCircle._cachedStrokeBfStrokes, 'Renderer must cache generated stroke brush strokes on strokeCircle');
  assert.ok(strokeCircle._cachedStrokeBfStrokes.length > 0, 'strokeCircle should generate brush strokes inside outlined stroke ribbon');
}
console.log('✔ Stroke Brush Fill (acting as outlined path ribbons) passed');

// 16. Testing Static Color vs Gradient Toggling on Fill and Stroke
console.log('16. Testing Static vs Gradient Toggling...');
testDoc.selectedIds.clear();
testDoc.selectedIds.add(strokeCircle.id);

// 16.1. Toggle Stroke to Gradient
widget.setTarget('stroke');
widget.switchMode('gradient');
assert.strictEqual(strokeCircle.strokeType, 'brush');
assert.ok(strokeCircle.strokeGradient, 'strokeGradient should be assigned on gradient switch');
assert.ok(strokeCircle.strokeBrushFill.gradient, 'strokeBrushFill.gradient should be assigned on gradient switch');

// 16.2. Toggle Stroke back to Static Color
widget.switchMode('color');
assert.strictEqual(strokeCircle.strokeType, 'brush');
assert.ok(!strokeCircle.strokeBrushFill.gradient, 'strokeBrushFill.gradient should be cleared when switching to static color');

// 16.3. Visibility when set to 'none' / no color
strokeCircle.stroke = 'none';
delete strokeCircle._cachedStrokeBfStrokes;
assert.strictEqual(strokeCircle.getStrokeBrushFillSVG(), '', 'getStrokeBrushFillSVG must be empty when stroke is none');

testRect.fill = 'none';
delete testRect._cachedBfStrokes;
assert.strictEqual(testRect.getBrushFillSVG(), '', 'getBrushFillSVG must be empty when fill is none');
console.log('✔ Static vs Gradient Toggling & No-Color Invisibility passed');

// 17. Testing Stroke Ribbon Geometry Confinement (No center leaks across patterns)
console.log('17. Testing Stroke Ribbon Geometry Confinement on Closed Shapes...');
const ringCircle = new SvgCircle({ cx: 100, cy: 100, r: 40, fill: 'none', stroke: '#fabd2f', strokeWidth: 10 });
const polylines = [ringCircle.toPolyline(0.4)];
const ribbons = renderer._convertPolylinesToStrokeRibbons(polylines, ringCircle, 10);
assert.strictEqual(ribbons.length, 1, 'Closed shape should produce 1 stitched ribbon polygon');

// Test Stipple pattern on stroke ribbon
const stippleStrokes = BrushFillEngine.generateStrokes(ribbons, {
  enabled: true,
  pattern: 'stipple',
  spacing: 4
});
assert.ok(stippleStrokes.length > 0, 'Should generate stipple dots on stroke ribbon');
for (const s of stippleStrokes) {
  const dist = Math.hypot(s.cx - 100, s.cy - 100);
  // Center is at 100, radius is 40, strokeWidth is 10 (hw = 5) -> dist must be in [34..46]
  assert.ok(dist >= 33 && dist <= 47, `Stipple dot at dist ${dist} must be strictly within stroke ribbon [35..45]`);
}

// Test Scribble pattern on stroke ribbon
const scribbleStrokes = BrushFillEngine.generateStrokes(ribbons, {
  enabled: true,
  pattern: 'scribble',
  spacing: 6
});
assert.ok(scribbleStrokes.length > 0, 'Should generate scribble segments on stroke ribbon');
for (const s of scribbleStrokes) {
  const dist0 = Math.hypot(s.p0.x - 100, s.p0.y - 100);
  const dist1 = Math.hypot(s.p1.x - 100, s.p1.y - 100);
  assert.ok(dist0 >= 30 && dist0 <= 50, `Scribble p0 at dist ${dist0} must stay within stroke band`);
  assert.ok(dist1 >= 30 && dist1 <= 50, `Scribble p1 at dist ${dist1} must stay within stroke band`);
}
console.log('✔ Stroke Ribbon Geometry Confinement passed');

console.log('--- ALL PROCEDURAL BRUSH FILL ENGINE TESTS PASSED ---');


