const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EsenhoModule, EsenhoScreenHost } = require('../src/esenho.js');

async function runVectorTests() {
  console.log('--- Testing Vector Engine & Path Storage ---');

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
  assert.strictEqual(s0.opacity, 90, 'Brush opacity should match');
  assert.strictEqual(s0.hardness, 80, 'Brush hardness should match');
  assert.strictEqual(s0.points.length, 3, 'Stroke should have 3 sampled points (start, move, end)');

  // 5. Verify point coordinates & pressure
  assert.strictEqual(s0.points[0].x, 50);
  assert.strictEqual(s0.points[0].y, 50);
  assert.strictEqual(s0.points[0].pressure, 0.5);

  // 6. Test vector replaying at 200% scale
  canvasActor.vectorReplayLayer(-1, 200, 10, 20);
  console.log('[esenho] vector layer replayed at 200% scale');

  // 7. Test disabling vector recording
  canvasActor.vectorSetRecording(false);
  assert.strictEqual(canvasActor.vectorGetRecording(), false);
  canvasActor.stroke(0, 200, 200, 200, 200, strokeColor, 0, 1.0, 0, 0);
  canvasActor.stroke(2, 250, 250, 200, 200, strokeColor, 0, 1.0, 0, 0);
  assert.strictEqual(canvasActor.vectorGetCount(-1), 1, 'Stroke count should not increase when recording is off');

  // Re-enable recording
  canvasActor.vectorSetRecording(true);

  // 8. Test EsenhoScreenHost SVG export
  const host = new EsenhoScreenHost();
  host.canvasActor = canvasActor;
  const svg = host.exportSVG();
  assert(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'SVG header should be valid');
  assert(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'), 'SVG tag should exist');
  assert(svg.includes('<path d="M 50 50 L 100 80 L 150 120"'), 'SVG path should match recorded points');
  assert(svg.includes('stroke-width="24"'), 'SVG stroke width should match brush size');
  console.log('[esenho] SVG export verified successfully');

  // 9. Test REPL commands
  let lastLog = '';
  host.sendConsoleLog = (msg) => { lastLog = msg; };

  host.executeCommand("vector status");
  assert(lastLog.includes('vector recording: on'), 'vector status should report status');

  host.executeCommand("vector replay 150");
  assert(lastLog.includes('vector strokes replayed at 150% scale'), 'vector replay should run');

  host.executeCommand("vector clear");
  assert.strictEqual(canvasActor.vectorGetCount(-1), 0, 'Vector clear should empty stroke list');

  console.log('ALL VECTOR TESTS PASSED!');
}

runVectorTests().catch(err => {
  console.error('Vector test failed:', err);
  process.exit(1);
});
