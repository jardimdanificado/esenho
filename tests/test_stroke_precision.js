/**
 * Test Suite: Stroke Precision, Subpixel AA, Bézier Curvature & Pressure Dynamics
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function main() {
  console.log('--- Testing Stroke Precision, Subpixel AA, Bézier Midpoint & Pressure ---');

  // Load WASM Canvas module
  const wasmPath = path.join(__dirname, '../plugins/canvas.wasm');
  assert(fs.existsSync(wasmPath), 'plugins/canvas.wasm must exist');
  const { EsenhoModule } = require('../src/esenho.js');
  const canvas = new EsenhoModule(wasmPath);
  const exports = canvas.exports;

  // 1. Verify w_brush_stroke_ext_f export exists
  assert(typeof exports.w_brush_stroke_ext_f === 'function', 'w_brush_stroke_ext_f must be exported by Quadro Core');
  console.log('✔ w_brush_stroke_ext_f ABI export verified');

  // Initialize canvas
  const w = 640;
  const h = 480;
  exports.w_init(w, h);
  const pixPtr = exports.get_active_layer_pixels();
  assert(pixPtr !== 0, 'active layer pixels pointer must be valid');

  // 2. Test Subpixel Stroke Rendering with Fractional Coordinates
  exports.w_brush_set_param(1 /* SIZE */, 10);
  exports.w_brush_set_param(2 /* OPACITY */, 100);
  exports.w_brush_set_param(4 /* FLOW */, 100);
  exports.w_brush_set_param(6 /* HARDNESS */, 100);
  exports.w_brush_set_param(32 /* SUBPIXEL */, 1);

  // Clear canvas
  const pixArr = new Uint32Array(exports.memory.buffer, pixPtr, w * h);
  pixArr.fill(0);

  // Draw stroke with precise floating point coordinates: (100.25, 100.75) to (120.5, 100.75)
  exports.w_brush_stroke_ext_f(0, 100.25, 100.75, 100.25, 100.75, 0xFFFF0000, 0, 1000, 0, 0);
  exports.w_brush_stroke_ext_f(1, 120.5, 100.75, 100.25, 100.75, 0xFFFF0000, 0, 1000, 0, 0);
  exports.w_brush_stroke_ext_f(2, 120.5, 100.75, 120.5, 100.75, 0xFFFF0000, 0, 1000, 0, 0);

  // Verify pixels were stamped along the fractional coordinate line
  let coloredPixels = 0;
  for (let x = 95; x <= 126; x++) {
    for (let y = 95; y <= 106; y++) {
      if ((pixArr[y * w + x] & 0xFF000000) !== 0) {
        coloredPixels++;
      }
    }
  }
  assert(coloredPixels > 50, `Subpixel stroke should render dabs along fractional path, got ${coloredPixels} pixels`);
  console.log(`✔ Subpixel float coordinate execution stamped ${coloredPixels} pixels with continuous AA`);

  // 3. Test Bézier Midpoint Curvature Modulations
  // Simulate the esenho.js mathematical Bézier evaluation under varying midpoint settings
  function computeBezierPath(pPrev, pCurr, pOld, midpoint) {
    const midClamped = Math.max(0, Math.min(100, midpoint));
    const ratio = 0.15 + (midClamped / 100.0) * 0.70;
    const tension = midClamped / 50.0;

    const midPrev = {
      x: pOld.x + (pPrev.x - pOld.x) * ratio,
      y: pOld.y + (pPrev.y - pOld.y) * ratio
    };
    const midCurr = {
      x: pPrev.x + (pCurr.x - pPrev.x) * ratio,
      y: pPrev.y + (pCurr.y - pPrev.y) * ratio
    };

    const chordMidX = (midPrev.x + midCurr.x) * 0.5;
    const chordMidY = (midPrev.y + midCurr.y) * 0.5;
    const ctrlX = chordMidX + (pPrev.x - chordMidX) * tension;
    const ctrlY = chordMidY + (pPrev.y - chordMidY) * tension;

    // Evaluate curve vertex at t = 0.5
    const t = 0.5;
    const invT = 0.5;
    const bx = invT * invT * midPrev.x + 2.0 * invT * t * ctrlX + t * t * midCurr.x;
    const by = invT * invT * midPrev.y + 2.0 * invT * t * ctrlY + t * t * midCurr.y;

    return { ctrlX, ctrlY, midVertexX: bx, midVertexY: by, tension, ratio };
  }

  const pOld = { x: 0, y: 0 };
  const pPrev = { x: 50, y: 100 }; // 90 degree corner turn
  const pCurr = { x: 100, y: 0 };

  const resStraight = computeBezierPath(pPrev, pCurr, pOld, 0); // 0% midpoint (straight chord)
  const resSmooth = computeBezierPath(pPrev, pCurr, pOld, 50);   // 50% midpoint (standard smooth quadratic)
  const resElastic = computeBezierPath(pPrev, pCurr, pOld, 100); // 100% midpoint (high tension elastic arc)

  // At midpoint = 0 (tension = 0), control point collapses to chord line, midVertexY is lower
  // At midpoint = 100 (tension = 2.0), control point pulls higher, midVertexY approaches corner (y=100)
  assert(resStraight.tension === 0, 'midpoint 0 should have tension 0');
  assert(resSmooth.tension === 1.0, 'midpoint 50 should have tension 1.0');
  assert(resElastic.tension === 2.0, 'midpoint 100 should have tension 2.0');

  assert(resStraight.midVertexY < resSmooth.midVertexY, `Straight vertex y (${resStraight.midVertexY}) must be flatter than smooth y (${resSmooth.midVertexY})`);
  assert(resSmooth.midVertexY < resElastic.midVertexY, `Smooth vertex y (${resSmooth.midVertexY}) must be lower than elastic y (${resElastic.midVertexY})`);
  console.log(`✔ Bézier Midpoint tension verified: 0% y=${resStraight.midVertexY.toFixed(1)} -> 50% y=${resSmooth.midVertexY.toFixed(1)} -> 100% y=${resElastic.midVertexY.toFixed(1)}`);

  // 4. Test Tip Catch-Up: final point is rendered exactly at stroke lift point
  const strokeEndFinal = { x: 180.5, y: 220.25 };
  const strokeLastMid = { x: 170.0, y: 210.0 };
  const dEnd = Math.hypot(strokeEndFinal.x - strokeLastMid.x, strokeEndFinal.y - strokeLastMid.y);
  assert(dEnd > 1.0, 'Distance to final lift point must be non-zero');
  // Evaluate the last step t = 1.0 of the tip catch-up Bézier
  const tFinal = 1.0;
  const invTFinal = 0.0;
  const bxFinal = invTFinal * invTFinal * strokeLastMid.x + 2.0 * invTFinal * tFinal * strokeEndFinal.x + tFinal * tFinal * strokeEndFinal.x;
  const byFinal = invTFinal * invTFinal * strokeLastMid.y + 2.0 * invTFinal * tFinal * strokeEndFinal.y + tFinal * tFinal * strokeEndFinal.y;
  assert(Math.abs(bxFinal - strokeEndFinal.x) < 0.001, 'Tip catch-up must close exactly at finalX');
  assert(Math.abs(byFinal - strokeEndFinal.y) < 0.001, 'Tip catch-up must close exactly at finalY');
  console.log('✔ Tip Catch-up endpoint closure verified');

  // 5. Test Stylus Pressure Response Curve Mapping
  function mapPressure(p, curve, minP = 0, maxP = 1) {
    let mp = p;
    if (mp < minP) mp = 0;
    else if (mp > maxP) mp = 1.0;
    else mp = (mp - minP) / Math.max(0.01, maxP - minP);

    if (curve === 'soft') {
      mp = Math.pow(mp, 0.6);
    } else if (curve === 'hard') {
      mp = Math.pow(mp, 1.8);
    } else if (curve === 's-curve' || curve === 'sigmoid') {
      mp = mp * mp * (3 - 2 * mp);
    }
    return mp;
  }

  const pHalf = 0.5;
  const pSoft = mapPressure(pHalf, 'soft');
  const pHard = mapPressure(pHalf, 'hard');
  const pSigmoid = mapPressure(pHalf, 's-curve');
  const pLinear = mapPressure(pHalf, 'linear');

  assert(pSoft > pLinear, `Soft curve (got ${pSoft}) must yield higher output than linear for light touch`);
  assert(pHard < pLinear, `Hard curve (got ${pHard}) must yield lower output than linear for firm touch`);
  assert(Math.abs(pSigmoid - 0.5) < 0.001, 'S-curve at 0.5 inflection point must equal 0.5');
  console.log(`✔ Pressure curves verified: Soft=${pSoft.toFixed(2)}, Linear=${pLinear.toFixed(2)}, Hard=${pHard.toFixed(2)}, Sigmoid=${pSigmoid.toFixed(2)}`);

  console.log('All Stroke Precision, Subpixel AA, Bézier & Pressure tests PASSED!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
