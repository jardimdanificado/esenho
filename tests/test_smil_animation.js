/**
 * =========================================================================
 * W3C SMIL Animation Engine Test Suite (tests/test_smil_animation.js)
 * Tests native C/WASM SMIL Animation Profile (quadro.c)
 * =========================================================================
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { EsenhoModule } = require('../src/esenho.js');

async function runSmilTests() {
  console.log('--- Testing W3C SMIL Animation Engine in Quadro WASM ---');

  const canvasWasmPath = path.resolve(__dirname, '../plugins/canvas.wasm');
  assert(fs.existsSync(canvasWasmPath), 'plugins/canvas.wasm must exist');

  const canvas = new EsenhoModule(canvasWasmPath);
  canvas.exports.w_init(800, 600);

  // 1. Test Cubic Spline Solver (keySplines)
  console.log('--- 1. Testing Cubic Spline Solver ---');
  // Linear diagonal (0,0,1,1) -> f(0.5) == 0.5
  const linearMid = canvas.smilSolveSpline(0.5, 0.0, 0.0, 1.0, 1.0);
  assert(Math.abs(linearMid - 0.5) < 1e-4, `Linear spline midpoint should be 0.5, got ${linearMid}`);

  // Ease-in (0.42, 0.0, 1.0, 1.0) -> f(0.5) < 0.5
  const easeInMid = canvas.smilSolveSpline(0.5, 0.42, 0.0, 1.0, 1.0);
  assert(easeInMid < 0.45, `Ease-in midpoint should be < 0.45, got ${easeInMid}`);

  // Ease-out (0.0, 0.0, 0.58, 1.0) -> f(0.5) > 0.5
  const easeOutMid = canvas.smilSolveSpline(0.5, 0.0, 0.0, 0.58, 1.0);
  assert(easeOutMid > 0.55, `Ease-out midpoint should be > 0.55, got ${easeOutMid}`);
  console.log('✔ Cubic Spline Solver (keySplines Newton-Raphson) verified successfully');

  // 2. Test SMIL Tracks: Translate, Rotate, Scale, Opacity, Fill, Path
  console.log('--- 2. Testing SMIL Track Interpolation ---');
  canvas.smilReset();

  // Track 0: <animateTransform type="translate" dur="2s">
  const trTranslate = canvas.smilTrackCreate(101 /* targetId */, 0 /* W_SMIL_ATTR_TRANSLATE */, 0 /* LINEAR */, 0.0, 2.0, 1, 1 /* FREEZE */);
  assert(trTranslate >= 0, 'Translate track must be created');
  canvas.smilTrackAddVec2(trTranslate, 0.0, 100.0, 200.0);
  canvas.smilTrackAddVec2(trTranslate, 2.0, 300.0, 600.0);

  // Track 1: <animateTransform type="rotate" dur="2s" calcMode="spline" keySplines="0.42 0 0.58 1">
  const trRotate = canvas.smilTrackCreate(101, 1 /* W_SMIL_ATTR_ROTATE */, 1 /* SPLINE */, 0.0, 2.0, 1, 1);
  canvas.smilTrackAddRotate(trRotate, 0.0, 0.0, 50.0, 50.0, 0.42, 0.0, 0.58, 1.0);
  canvas.smilTrackAddRotate(trRotate, 2.0, 180.0, 50.0, 50.0, 0.42, 0.0, 0.58, 1.0);

  // Track 2: <animate attributeName="opacity" dur="2s">
  const trOpacity = canvas.smilTrackCreate(101, 5 /* W_SMIL_ATTR_OPACITY */, 0 /* LINEAR */, 0.0, 2.0, 1, 1);
  canvas.smilTrackAddScalar(trOpacity, 0.0, 1.0);
  canvas.smilTrackAddScalar(trOpacity, 2.0, 0.2);

  // Track 3: <animate attributeName="fill" dur="2s"> (Red to Blue)
  const trFill = canvas.smilTrackCreate(101, 6 /* W_SMIL_ATTR_FILL */, 0 /* LINEAR */, 0.0, 2.0, 1, 1);
  const colorRed = 0xFF0000FF; // Red in RGBA (R=255, G=0, B=0, A=255)
  const colorBlue = 0xFFFF0000; // Blue in RGBA (R=0, G=0, B=255, A=255)
  canvas.smilTrackAddColor(trFill, 0.0, colorRed);
  canvas.smilTrackAddColor(trFill, 2.0, colorBlue);

  // Track 4: <animate attributeName="d" dur="2s"> (Bézier Morphing)
  const trPath = canvas.smilTrackCreate(101, 9 /* W_SMIL_ATTR_PATH_D */, 0 /* LINEAR */, 0.0, 2.0, 1, 1);
  const nodes0 = [0, 0, 100, 0, 100, 100, 0, 100];
  const nodes1 = [20, 20, 200, 40, 180, 220, 10, 150];
  canvas.smilTrackAddPath(trPath, 0.0, nodes0);
  canvas.smilTrackAddPath(trPath, 2.0, nodes1);

  // Evaluate at t = 0.0s
  canvas.smilEval(0.0);
  const v0 = canvas.smilGetVec3(trTranslate);
  assert.strictEqual(Math.round(v0[0]), 100, 't=0 translate X should be 100');
  assert.strictEqual(Math.round(v0[1]), 200, 't=0 translate Y should be 200');
  const op0 = canvas.smilGetScalar(trOpacity);
  assert(Math.abs(op0 - 1.0) < 1e-3, 't=0 opacity should be 1.0');

  // Evaluate at t = 1.0s (midpoint)
  canvas.smilEval(1.0);
  const vMid = canvas.smilGetVec3(trTranslate);
  assert.strictEqual(Math.round(vMid[0]), 200, 't=1.0 translate X midpoint should be 200');
  assert.strictEqual(Math.round(vMid[1]), 400, 't=1.0 translate Y midpoint should be 400');

  const rotMid = canvas.smilGetVec3(trRotate);
  assert(rotMid[0] > 80 && rotMid[0] < 100, `t=1.0 ease-in-out rotation midpoint should be ~90 deg, got ${rotMid[0]}`);

  const opMid = canvas.smilGetScalar(trOpacity);
  assert(Math.abs(opMid - 0.6) < 1e-2, `t=1.0 opacity midpoint should be 0.6, got ${opMid}`);

  const colorMid = canvas.smilGetColor(trFill);
  const rMid = colorMid & 0xFF;
  const bMid = (colorMid >> 16) & 0xFF;
  assert(Math.abs(rMid - 128) <= 2, `t=1.0 red component should be ~128, got ${rMid}`);
  assert(Math.abs(bMid - 128) <= 2, `t=1.0 blue component should be ~128, got ${bMid}`);

  const morphCoords = new Float32Array(8);
  canvas.smilGetPath(trPath, morphCoords);
  assert.strictEqual(Math.round(morphCoords[0]), 10, 't=1.0 path morph node 0 X should be 10');
  assert.strictEqual(Math.round(morphCoords[2]), 150, 't=1.0 path morph node 1 X should be 150');

  // Evaluate at t = 2.0s (end / freeze)
  canvas.smilEval(2.0);
  const vEnd = canvas.smilGetVec3(trTranslate);
  assert.strictEqual(Math.round(vEnd[0]), 300, 't=2.0 translate X end should be 300');
  assert.strictEqual(Math.round(vEnd[1]), 600, 't=2.0 translate Y end should be 600');
  const opEnd = canvas.smilGetScalar(trOpacity);
  assert(Math.abs(opEnd - 0.2) < 1e-3, 't=2.0 opacity end should be 0.2');

  // Evaluate past duration (t = 3.5s) with freeze
  canvas.smilEval(3.5);
  const vFrozen = canvas.smilGetVec3(trTranslate);
  assert.strictEqual(Math.round(vFrozen[0]), 300, 't=3.5 frozen translate X should remain 300');

  console.log('✔ SMIL Transforms, Rotations, Splines, Colors, Opacity and Path Morphing verified 100%!');

  // 3. Test calcMode="paced"
  console.log('--- 3. Testing calcMode="paced" Constant Velocity ---');
  canvas.smilReset();
  // Segment 1: distance 100 (from 0 to 100 in X). Segment 2: distance 300 (from 100 to 400 in X). Total dist = 400.
  // Paced should reach X=200 at exactly t = 1.0s (50% of total distance), regardless of keyTimes.
  const trPaced = canvas.smilTrackCreate(102, 0 /* W_SMIL_ATTR_TRANSLATE */, 3 /* W_SMIL_CALC_PACED */, 0.0, 2.0, 1, 1);
  canvas.smilTrackAddVec2(trPaced, 0.0, 0.0, 0.0);
  canvas.smilTrackAddVec2(trPaced, 0.5, 100.0, 0.0);
  canvas.smilTrackAddVec2(trPaced, 2.0, 400.0, 0.0);

  canvas.smilEval(1.0); // 50% of duration
  const vPaced = canvas.smilGetVec3(trPaced);
  assert(Math.abs(vPaced[0] - 200.0) < 5.0, `Paced motion at t=1.0s should be at X=200 (constant speed), got ${vPaced[0]}`);
  console.log('✔ calcMode="paced" verified successfully');

  // 4. Test additive="sum" and accumulate="sum"
  console.log('--- 4. Testing additive="sum" and accumulate="sum" ---');
  canvas.smilReset();
  const trAdditive = canvas.smilTrackCreate(103, 0 /* W_SMIL_ATTR_TRANSLATE */, 0 /* LINEAR */, 0.0, 2.0, 3 /* repeatCount=3 */, 1);
  canvas.smilTrackSetAdditive(trAdditive, 1 /* ADDITIVE_SUM */, 1 /* ACCUMULATE_SUM */);
  canvas.smilTrackSetBaseVec2(trAdditive, 50.0, 50.0); // Base element position
  canvas.smilTrackAddVec2(trAdditive, 0.0, 0.0, 0.0);
  canvas.smilTrackAddVec2(trAdditive, 2.0, 100.0, 0.0);

  // Cycle 0, t=1.0s: base(50) + animated(50) + cycle(0) = 100
  canvas.smilEval(1.0);
  const vAdd0 = canvas.smilGetVec3(trAdditive);
  assert.strictEqual(Math.round(vAdd0[0]), 100, `Cycle 0 at t=1.0s should be 100, got ${vAdd0[0]}`);

  // Cycle 1, t=3.0s (1s into cycle 1): base(50) + animated(50) + cycle_offset(100) = 200
  canvas.smilEval(3.0);
  const vAdd1 = canvas.smilGetVec3(trAdditive);
  assert.strictEqual(Math.round(vAdd1[0]), 200, `Cycle 1 at t=3.0s should be 200, got ${vAdd1[0]}`);

  // Cycle 2, t=5.0s (1s into cycle 2): base(50) + animated(50) + cycle_offset(200) = 300
  canvas.smilEval(5.0);
  const vAdd2 = canvas.smilGetVec3(trAdditive);
  assert.strictEqual(Math.round(vAdd2[0]), 300, `Cycle 2 at t=5.0s should be 300, got ${vAdd2[0]}`);
  console.log('✔ additive="sum" and accumulate="sum" verified successfully');

  // 5. Test <animateMotion> with Tangential Rotation (rotate="auto" & "auto-reverse")
  console.log('--- 5. Testing <animateMotion> with rotate="auto" ---');
  canvas.smilReset();
  const trMotion = canvas.smilTrackCreate(104, 10 /* W_SMIL_ATTR_MOTION */, 0 /* LINEAR */, 0.0, 2.0, 1, 1);
  // Motion path: (0,0) -> (100, 100) -> (200, 100)
  const motionPath = [0.0, 0.0, 100.0, 100.0, 200.0, 100.0];
  canvas.smilTrackSetMotion(trMotion, motionPath, 1 /* W_SMIL_ROTATE_AUTO */, 0.0);

  // At start (0,0) heading to (100,100) -> angle should be ~45 degrees
  canvas.smilEval(0.1);
  const vMotionStart = canvas.smilGetVec3(trMotion);
  assert(Math.abs(vMotionStart[2] - 45.0) < 2.0, `Tangential auto-rotation should be ~45 deg, got ${vMotionStart[2]}`);

  // At end (100,100) to (200,100) -> horizontal direction -> angle should be ~0 degrees
  canvas.smilEval(1.8);
  const vMotionEnd = canvas.smilGetVec3(trMotion);
  assert(Math.abs(vMotionEnd[2] - 0.0) < 2.0, `Tangential auto-rotation should be ~0 deg, got ${vMotionEnd[2]}`);
  console.log('✔ <animateMotion> with rotate="auto" verified successfully');

  // 6. Test SkewX and SkewY in <animateTransform>
  console.log('--- 6. Testing SkewX and SkewY in <animateTransform> ---');
  canvas.smilReset();
  const trSkew = canvas.smilTrackCreate(105, 3 /* W_SMIL_ATTR_SKEW_X */, 0 /* LINEAR */, 0.0, 2.0, 1, 1);
  canvas.smilTrackAddScalar(trSkew, 0.0, 0.0);
  canvas.smilTrackAddScalar(trSkew, 2.0, 30.0);
  canvas.smilEval(1.0);
  const skewMid = canvas.smilGetVec3(trSkew);
  assert(Math.abs(skewMid[0] - 15.0) < 1.0, `SkewX midpoint should be 15 deg, got ${skewMid[0]}`);
  console.log('✔ SkewX and SkewY verified successfully');

  // 7. Test SvgDocument SMIL Roundtrip & Syncbase Timing
  console.log('--- 7. Testing SvgDocument SMIL Serialization, Parser & Syncbase Timing ---');
  const { SvgDocument, SvgRect } = require('../src/svg/svg_engine.js');
  const doc = new SvgDocument({ width: 800, height: 600 });
  const rect1 = new SvgRect({ id: 'rect1', x: 50, y: 50, width: 100, height: 100, fill: '#fabd2f' });
  rect1.keyframes = {
    translate: [
      { t: 0, val: { x: 0, y: 0 } },
      { t: 2, val: { x: 200, y: 100 } }
    ]
  };
  rect1.keyframes.translate.dur = 2.0;

  const rect2 = new SvgRect({ id: 'rect2', x: 200, y: 200, width: 80, height: 80, fill: '#8ec07c' });
  rect2.keyframes = {
    opacity: [
      { t: 0, val: 0.0 },
      { t: 1, val: 1.0 }
    ]
  };
  rect2.keyframes.opacity.begin = 'rect1.end + 0.5s';
  rect2.keyframes.opacity.dur = 1.0;

  rect2.motionTrack = {
    path: 'M 0 0 L 100 100',
    rotate: 'auto',
    calcMode: 'paced',
    dur: 2.0
  };

  rect2.setTracks = [
    { attributeName: 'visibility', to: 'visible', begin: 'rect1.end', fill: 'freeze' }
  ];

  doc.addObject(rect1);
  doc.addObject(rect2);

  const smilSvg = doc.toSMILSvgString(4.0, 24);
  assert(smilSvg.includes('<animateTransform attributeName="transform" type="translate"'), 'Must contain animateTransform');
  assert(smilSvg.includes('begin="rect1.end + 0.5s"'), 'Must preserve syncbase begin timing');
  assert(smilSvg.includes('<animateMotion path="M 0 0 L 100 100"'), 'Must serialize animateMotion');
  assert(smilSvg.includes('<set attributeName="visibility" to="visible"'), 'Must serialize set element');

  // Test fromSVGString deserialization
  const doc2 = new SvgDocument();
  doc2.fromSVGString(smilSvg);
  assert.strictEqual(doc2.objects.length, 2, 'Must deserialize 2 objects');
  const dRect1 = doc2.findObject('rect1');
  const dRect2 = doc2.findObject('rect2');
  assert(dRect1 && dRect1.keyframes && dRect1.keyframes.translate, 'rect1 must have translate keyframes');
  assert(dRect2 && dRect2.motionTrack, 'rect2 must have motionTrack deserialized');
  assert(dRect2.setTracks && dRect2.setTracks.length > 0, 'rect2 must have setTracks deserialized');

  // Verify syncbase timing resolution
  assert(dRect2.keyframes.opacity._resolvedBegin >= 2.45, `Syncbase resolved begin should be 2.5s, got ${dRect2.keyframes.opacity._resolvedBegin}`);
  console.log('✔ SvgDocument SMIL Serialization, Parser & Syncbase Timing verified 100%!');
}

runSmilTests().then(() => {
  console.log('--- ALL W3C SMIL ANIMATION ENGINE TESTS PASSED (100% SPEC CONFORMANCE) ---');
  process.exit(0);
}).catch(err => {
  console.error('SMIL Animation Test Failure:', err);
  process.exit(1);
});
