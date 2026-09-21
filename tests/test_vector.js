const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EsenhoModule, EsenhoScreenHost } = require('../src/esenho.js');

async function runVectorTests() {
  console.log('--- Testing Vector Engine, Shapes & Node Manipulation ---');

  const canvasWasmPath = path.resolve(__dirname, '../roms/canvas.wasm');
  const canvasActor = new EsenhoModule(canvasWasmPath);
  canvasActor.exports.w_init(800, 600);

  // 1. Verify Vector Recording is ON by default
  assert.strictEqual(canvasActor.vectorGetRecording(), true, 'Vector recording should be enabled by default');

  // 2. Clear any existing strokes
  canvasActor.vectorClearAll();
  assert.strictEqual(canvasActor.vectorGetCount(-1), 0, 'Active layer stroke count should be 0');

  // 3. Draw a continuous stroke with pressure & tilt
  canvasActor.exports.w_brush_set_param(1 /* W_PARAM_SIZE */, 24);
  canvasActor.exports.w_brush_set_param(2 /* W_PARAM_OPACITY */, 90);
  canvasActor.exports.w_brush_set_param(3 /* W_PARAM_HARDNESS */, 80);

  const strokeColor = 0xFF3366CC; // ARGB
  canvasActor.stroke(0, 50, 50, 50, 50, strokeColor, 0, 0.5, 10, 5);
  canvasActor.stroke(1, 100, 80, 50, 50, strokeColor, 0, 0.75, 15, 8);
  canvasActor.stroke(2, 150, 120, 100, 80, strokeColor, 0, 1.0, 20, 10);

  // 4. Verify Stroke was recorded
  assert.strictEqual(canvasActor.vectorGetCount(-1), 1, 'Active layer stroke count should be 1');
  const strokes = canvasActor.vectorGetStrokes(-1);
  assert.strictEqual(strokes.length, 1, 'Should return 1 stroke in JS');
  const s0 = strokes[0];
  assert.strictEqual(s0.color, strokeColor >>> 0, 'Stroke color should match');
  assert.strictEqual(s0.size, 24, 'Brush size should match');
  assert.strictEqual(s0.points.length, 3, 'Stroke should have 3 sampled points (start, move, end)');

  // 5. Test Vector Shape Objects (Rect & Ellipse with Fill & Stroke)
  const rectId = canvasActor.vectorCreateShape(1 /* RECT */, 200, 200, 100, 60, 0xFFFF0000 /* Red stroke */, 0xFF00FF00 /* Green fill */);
  assert(rectId > 0, 'Rect ID should be valid');
  assert.strictEqual(canvasActor.vectorGetCount(-1), 2, 'Layer should have 2 vector objects');

  const ellipseId = canvasActor.vectorCreateShape(2 /* ELLIPSE */, 400, 300, 80, 80, 0xFF0000FF /* Blue stroke */, 0xFFFFFF00 /* Yellow fill */);
  assert(ellipseId > 0, 'Ellipse ID should be valid');
  assert.strictEqual(canvasActor.vectorGetCount(-1), 3, 'Layer should have 3 vector objects');

  // 6. Test Hit-Testing (Object and Node)
  const hitObjInsideRect = canvasActor.vectorHitTest(-1, 250, 230, 8);
  assert.strictEqual(hitObjInsideRect, rectId, 'Hit test inside rect should return rectId');

  const hitObjInsideEllipse = canvasActor.vectorHitTest(-1, 440, 340, 8);
  assert.strictEqual(hitObjInsideEllipse, ellipseId, 'Hit test inside ellipse should return ellipseId');

  const hitObjMiss = canvasActor.vectorHitTest(-1, 10, 10, 5);
  assert.strictEqual(hitObjMiss, 0, 'Hit test on empty area should return 0');

  const hitNode0 = canvasActor.vectorHitTestNode(-1, rectId, 200, 200, 6);
  assert.strictEqual(hitNode0, 0, 'Hit test on corner node should return node index 0');

  // 7. Test Node Editing & Affine Transformation
  const okSet = canvasActor.vectorSetPoint(-1, rectId, 0, 190, 190, 1.0);
  assert.strictEqual(okSet, true, 'vectorSetPoint should succeed');

  const okTransform = canvasActor.vectorTransform(-1, rectId, 10, 15, 100, 0);
  assert.strictEqual(okTransform, true, 'vectorTransform should succeed');

  // 8. Test Object Deletion
  const okDel = canvasActor.vectorDeleteObject(-1, ellipseId);
  assert.strictEqual(okDel, true, 'vectorDeleteObject should succeed');
  assert.strictEqual(canvasActor.vectorGetCount(-1), 2, 'Layer should have 2 objects after deletion');

  // 9. Test Replaying Vector Layer with Fills and Strokes
  canvasActor.vectorReplayLayer(-1, 100, 0, 0);
  console.log('[esenho] vector layer with shapes and fills replayed successfully');

  // 10. Test EsenhoScreenHost Rich SVG Export
  const host = new EsenhoScreenHost();
  host.canvasActor = canvasActor;
  const svg = host.exportSVG();
  assert(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'SVG header should be valid');
  assert(svg.includes('<rect'), 'SVG should contain <rect> element');
  assert(svg.includes('fill="rgb(0,255,0)"'), 'SVG rect should have green fill');
  console.log('[esenho] Rich SVG export with fills and shapes verified successfully');

  // 11. Test REPL Commands for Shapes and Nodes
  let lastLog = '';
  host.sendConsoleLog = (msg) => { lastLog = msg; };

  host.executeCommand("vector shape rect 30 40 80 50 #ff00ff #00ffff");
  assert(lastLog.includes('vector rect ['), 'vector shape rect command should create rect');

  host.executeCommand("vector hittest 50 60");
  assert(lastLog.includes('object ['), 'vector hittest command should find object');

  host.executeCommand("vector move 1 5 5");
  assert(lastLog.includes('moved by'), 'vector move command should transform object');

  host.executeCommand("vector node set 1 0 25 25");
  assert(lastLog.includes('updated to (25,25)'), 'vector node set command should update node');

  host.executeCommand("vector status");
  assert(lastLog.includes('vector recording: on'), 'vector status should report active state');

  console.log('ALL VECTOR TESTS (OBJECTS, HIT-TEST, REPL, SVG) PASSED!');
}

runVectorTests().catch(err => {
  console.error('Vector test failed:', err);
  process.exit(1);
});
