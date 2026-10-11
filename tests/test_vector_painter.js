const assert = require('assert');
const path = require('path');
const SvgEngine = require('../src/svg/svg_engine.js');
const { EsenhoModule, EsenhoScreenHost } = require('../src/esenho.js');

function countNonTransparentPixels(canvasActor, layerId) {
  const lid = layerId !== undefined ? layerId : canvasActor.exports.get_active_layer();
  const ptr = canvasActor.exports.w_layer_get_pixels(lid);
  const w = canvasActor.exports.w_layer_get_width(lid);
  const h = canvasActor.exports.w_layer_get_height(lid);
  const buf = new Uint8Array(canvasActor.memory.buffer, ptr, w * h * 4);
  let count = 0;
  for (let i = 3; i < buf.length; i += 4) {
    if (buf[i] > 0) count++;
  }
  return count;
}

async function runVectorPainterTests() {
  console.log('--- Testing Vector Painter (Vector Layers, Bézier Editor, Width Profile & Live Restyling) ---');

  const canvasWasmPath = path.resolve(__dirname, '../plugins/canvas.wasm');
  const canvasActor = new EsenhoModule(canvasWasmPath);
  canvasActor.exports.w_init(400, 300);

  const host = new EsenhoScreenHost();
  host.canvasActor = canvasActor;
  host.sendConsoleLog = () => {};

  // Clear initial layer so background is transparent for pixel counting
  canvasActor.exports.w_layer_clear(0x00000000);

  // 1. Create a Vector Layer
  const vecLayerIdx = host.createVectorLayer('Vector Ink');
  assert(host.isVectorLayer(vecLayerIdx), 'Created layer should be registered as a Vector Layer');
  const vLayer = host.getVectorLayer(vecLayerIdx);
  assert(vLayer && Array.isArray(vLayer.paths), 'Vector layer state should contain paths array');
  console.log('✔ Vector Layer creation passed');

  // 2. Test Freehand Stroke -> Bézier Auto-Fit ('bezier' mode) with pressure & tilt
  host.vectorCurveMode = 'bezier';
  host.currentColor = 0xFF2288FF;
  host.brushParams.size = 14;
  host.brushParams.opacity = 100;
  host.activeBrush = 'ink_pen';

  const rawWave = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    rawWave.push({
      x: 40 + t * 280,
      y: 120 + Math.sin(t * Math.PI * 2) * 45,
      pressure: 0.25 + 0.75 * Math.sin(t * Math.PI),
      widthScale: 1.0,
      tiltX: 10,
      tiltY: -5
    });
  }

  host.pushUndoSnapshot('vector wave');
  const bezierPath = host.addVectorPathFromRawPoints(rawWave, vecLayerIdx);
  assert(bezierPath, 'addVectorPathFromRawPoints should return an SvgPath');
  assert(bezierPath.nodes.length >= 2 && bezierPath.nodes.length < rawWave.length,
    `Auto-Fit Bézier should compress 25 raw points into fewer smooth nodes (got ${bezierPath.nodes.length})`);
  assert.strictEqual(bezierPath.brushPreset, 'ink_pen', 'Path should capture active brush preset ID');
  assert.strictEqual(bezierPath.strokeWidth, 14, 'Path should capture strokeWidth from brush size');

  const pixelsAfterStroke = countNonTransparentPixels(canvasActor);
  assert(pixelsAfterStroke > 100, `Vector stroke should render pixels to WASM layer (got ${pixelsAfterStroke})`);
  console.log(`✔ Freehand to Bézier Auto-Fit & WASM brush rendering passed (${bezierPath.nodes.length} nodes, ${pixelsAfterStroke} px)`);

  // 3. Test 'raw' Polyline mode
  host.vectorCurveMode = 'raw';
  const rawLinePts = [
    { x: 50, y: 220, pressure: 0.4, widthScale: 1.0 },
    { x: 120, y: 240, pressure: 0.8, widthScale: 1.2 },
    { x: 200, y: 210, pressure: 0.6, widthScale: 0.8 },
    { x: 280, y: 235, pressure: 0.9, widthScale: 1.5 }
  ];
  const rawPath = host.addVectorPathFromRawPoints(rawLinePts, vecLayerIdx);
  assert.strictEqual(rawPath.nodes.length, 4, 'Raw polyline mode should preserve exact point count');
  assert(Math.abs(rawPath.nodes[1].pressure - 0.8) < 1e-6, 'Node pressure should be preserved');
  assert(Math.abs(rawPath.nodes[3].widthScale - 1.5) < 1e-6, 'Node widthScale should be preserved');
  console.log('✔ Raw Polyline mode & per-node dynamics preservation passed');

  // 4. Test Hit-Testing, Segment Bending, Splitting & Handle Continuity
  host.selectVectorPath(bezierPath.id, -1, vecLayerIdx);
  assert.strictEqual(host.getSelectedVectorPath(vecLayerIdx).id, bezierPath.id, 'Bezier path should be selected');

  const segHit = bezierPath.getClosestSegmentPoint(180, 120);
  assert(segHit && segHit.segIndex >= 0, 'getClosestSegmentPoint should locate nearest segment');

  // Bend curve segment directly
  const oldCpOut = { ...bezierPath.nodes[segHit.segIndex].cpOut };
  const bent = bezierPath.bendSegment(segHit.segIndex, 0.5, 180, 40);
  assert.strictEqual(bent, true, 'bendSegment should succeed');
  assert(
    bezierPath.nodes[segHit.segIndex].cpOut.y !== oldCpOut.y,
    'bendSegment should update segment control handles'
  );

  // Split segment and verify interpolated pressure/widthScale
  bezierPath.nodes[0].pressure = 0.2;
  bezierPath.nodes[0].widthScale = 0.5;
  bezierPath.nodes[1].pressure = 1.0;
  bezierPath.nodes[1].widthScale = 2.5;
  const nodeCountBeforeSplit = bezierPath.nodes.length;
  const splitRes = bezierPath.splitSegment(0, 0.5);
  assert.strictEqual(splitRes.index, 1, 'splitSegment(0, 0.5) should insert node at index 1');
  assert.strictEqual(bezierPath.nodes.length, nodeCountBeforeSplit + 1, 'Node count should increase by 1');
  const insertedNode = bezierPath.nodes[1];
  assert(Math.abs(insertedNode.pressure - 0.6) < 0.05, `Split node should interpolate pressure (~0.6, got ${insertedNode.pressure})`);
  assert(Math.abs(insertedNode.widthScale - 1.5) < 0.05, `Split node should interpolate widthScale (~1.5, got ${insertedNode.widthScale})`);

  // Verify polyline points interpolate widthScale & pressure across cubic subdivisions
  const subpts = bezierPath.toPolyline(0.5);
  assert(subpts.length > 5, 'toPolyline should produce subdivided sample points');
  const hasInterpolatedWidth = subpts.some(pt => pt.widthScale > 1.05 && pt.widthScale < 2.45);
  assert(hasInterpolatedWidth, 'Subdivided cubic points should smoothly interpolate widthScale');
  console.log('✔ Bézier curve bending, splitting & width/pressure interpolation passed');

  // 5. Test Non-Destructive Live Restyling in Vector Mode
  host.setActionMode('vector');
  host.selectVectorPath(bezierPath.id, -1, vecLayerIdx);
  host.selectBrushPreset('watercolor');
  assert.strictEqual(bezierPath.brushPreset, 'watercolor', 'Selecting a brush preset in vector mode should restyle selected path');

  host.executeCommand('set color #ff3300');
  assert.strictEqual(bezierPath.stroke.toLowerCase(), '#ff3300', 'Changing color in vector mode should update selected path stroke color');

  host.executeCommand('set size 28');
  assert.strictEqual(bezierPath.strokeWidth, 28, 'Changing brush size in vector mode should update selected path strokeWidth');
  console.log('✔ Non-destructive Live Restyling (brush preset, color, size) passed');

  // 6. Test Undo / Redo of Vector Layer state
  const pathCountBeforeAdd = vLayer.paths.length;
  host.pushUndoSnapshot('vector shape');
  host.addVectorShapePath('ellipse', 80, 60, 220, 180, vecLayerIdx);
  assert.strictEqual(vLayer.paths.length, pathCountBeforeAdd + 1, 'Adding vector shape should increment path count');

  host.undo();
  assert.strictEqual(host.getVectorLayer(vecLayerIdx).paths.length, pathCountBeforeAdd, 'Undo should restore previous vector path list');

  host.redo();
  assert.strictEqual(host.getVectorLayer(vecLayerIdx).paths.length, pathCountBeforeAdd + 1, 'Redo should re-apply added vector shape');
  console.log('✔ Vector Layer Undo / Redo passed');

  // 7. Test SVG Export & Project Serialization (.esen)
  const svgOut = host.exportSVG();
  assert(svgOut.includes('<g id="vector_layer_'), 'SVG export should include vector layer group');
  assert(svgOut.includes('<path d="M'), 'SVG export should include cubic Bézier <path> elements');

  const projectData = host.exportProject();
  const parsedProj = typeof projectData === 'string' ? JSON.parse(projectData) : JSON.parse(JSON.stringify(projectData));
  const savedVecLayer = parsedProj.layers.find(l => l.isVector);
  assert(savedVecLayer && savedVecLayer.vectorPaths.length === 3, 'Project JSON should persist vectorPaths on vector layers');

  // Load project into a fresh host/actor and verify vector paths survive roundtrip
  const canvasActor2 = new EsenhoModule(canvasWasmPath);
  canvasActor2.exports.w_init(400, 300);
  const host2 = new EsenhoScreenHost();
  host2.canvasActor = canvasActor2;
  host2.sendConsoleLog = () => {};
  host2.loadProject(parsedProj);

  assert(host2.isVectorLayer(vecLayerIdx), 'Loaded project should restore vector layer flag');
  const restoredPaths = host2.getVectorLayer(vecLayerIdx).paths;
  assert.strictEqual(restoredPaths.length, 3, 'Loaded project should restore all 3 SvgPath objects');
  assert.strictEqual(restoredPaths[0].brushPreset, 'watercolor', 'Restored path should preserve custom brushPreset');
  assert(Math.abs(restoredPaths[0].nodes[1].widthScale - 1.5) < 0.05, 'Restored path should preserve per-node widthScale');
  console.log('✔ SVG Export & .esen Project roundtrip serialization passed');

  // 8. Test Vector Eraser & Rasterize Vector Layer
  const erased = host2.eraseVectorAtPoint(280, 235, 12, vecLayerIdx);
  assert.strictEqual(erased, true, 'eraseVectorAtPoint should delete hit vector path');
  assert.strictEqual(host2.getVectorLayer(vecLayerIdx).paths.length, 2, 'Vector path count should decrease after erasing');

  host2.rasterizeVectorLayer(vecLayerIdx);
  assert.strictEqual(host2.isVectorLayer(vecLayerIdx), false, 'rasterizeVectorLayer should convert layer to standard raster layer');
  console.log('✔ Vector Eraser & Layer Rasterization passed');

  console.log('ALL VECTOR PAINTER TESTS PASSED!');
}

runVectorPainterTests().catch(err => {
  console.error('Vector Painter test failed:', err);
  process.exit(1);
});
