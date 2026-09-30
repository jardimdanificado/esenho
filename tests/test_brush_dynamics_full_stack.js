import assert from 'assert';
import fs from 'fs';
import { DopeSheet, DopeSheetObject, PARAMETER_REGISTRY, getParameterGroups } from '../src/anim/dopesheet.js';

console.log('===================================================');
console.log('  Testing Native Quadro Brush Dynamics Full Stack  ');
console.log('===================================================');

// 1. Test DopeSheet Parameter Registry
console.log('1. Verifying DopeSheet Dynamic Channels in PARAMETER_REGISTRY...');
const dynParams = [
  'dynRadiusLog', 'dynHardness', 'dynDabsPerSec',
  'dynDabsPerActual', 'dynDabsPerBasic', 'dynLazyTracking',
  'dynSpeedEmaFine', 'dynSpeedEmaCoarse', 'dynSmudge',
  'dynSmudgeLength', 'dynEllipseRatio', 'dynEllipseAngle',
  'dynColorize', 'dynPressureGainLog', 'dynJitterOffset'
];

for (const p of dynParams) {
  assert(PARAMETER_REGISTRY[p] !== undefined, `Dynamic channel ${p} must be in PARAMETER_REGISTRY`);
  assert.strictEqual(PARAMETER_REGISTRY[p].group, 'Brush Dynamics');
}
console.log('✔ All 15 dynamic channels verified in DopeSheet PARAMETER_REGISTRY!');

// 2. Test DopeSheet Animation Keyframing & Sample Evaluation
console.log('2. Testing DopeSheet Keyframe Animation of Dynamics...');
const dsObj = new DopeSheetObject('brush_layer', 'Brush Layer');
const chRadius = dsObj.getOrCreateChannel('dynRadiusLog');
chRadius.addKeyframe(0, 1.0);     // t=0s, radius_log = 1.0
chRadius.addKeyframe(1000, 4.0);  // t=1s, radius_log = 4.0

const chSmudge = dsObj.getOrCreateChannel('dynSmudge');
chSmudge.addKeyframe(0, 0);       // t=0s, smudge = 0%
chSmudge.addKeyframe(1000, 100);  // t=1s, smudge = 100%

// Sample at frame/time 500
const state = dsObj.sample(500);
assert.strictEqual(state.dynRadiusLog, 2.5);
assert.strictEqual(state.dynSmudge, 50);

// Apply to target object
const mockTarget = { brushConfig: {} };
dsObj.applyState(mockTarget, state);
assert.strictEqual(mockTarget.brushConfig.dynRadiusLog, 2.5);
assert.strictEqual(mockTarget.brushConfig.dynSmudge, 50);
console.log('✔ DopeSheet interpolation & target application verified (radius_log=2.5, smudge=50% at midpoint)!');

// 3. Test WASM Core with w_brush_dyn_* Exports
console.log('3. Testing WASM Core with Native Brush Dynamic Exports...');
const wasmBuffer = fs.readFileSync('./plugins/canvas.wasm');
const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
  env: {
    memory: new WebAssembly.Memory({ initial: 1024, maximum: 32768 })
  }
});

const exp = wasmModule.instance.exports;
assert.strictEqual(typeof exp.w_brush_dyn_init, 'function');
assert.strictEqual(typeof exp.w_brush_dyn_set_base, 'function');
assert.strictEqual(typeof exp.w_brush_dyn_get_base, 'function');
assert.strictEqual(typeof exp.w_brush_dyn_set_curve, 'function');
assert.strictEqual(typeof exp.w_brush_dyn_clear_curve, 'function');
assert.strictEqual(typeof exp.w_brush_dyn_reset_state, 'function');
assert.strictEqual(typeof exp.w_brush_dyn_stroke_to, 'function');

// Initialize in WASM
exp.w_brush_dyn_init();
exp.w_init(200, 200);

// Set base settings
exp.w_brush_dyn_set_base(3 /* RADIUS_LOG */, 3.0);
exp.w_brush_dyn_set_base(4 /* HARDNESS */, 0.85);
exp.w_brush_dyn_set_base(7 /* DABS_PER_SEC */, 60.0);

const val = exp.w_brush_dyn_get_base(3);
assert(Math.abs(val - 3.0) < 0.001);

// Execute dynamic strokes
exp.w_brush_dyn_reset_state();
for (let i = 0; i < 10; i++) {
  exp.w_brush_dyn_stroke_to(10 + i * 5, 20 + i * 5, 0.8, 0.0, 0.0, 0.016, 1.0);
}

console.log('✔ WASM w_brush_dyn_* exports called and executed successfully!');

console.log('===================================================');
console.log('  NATIVE BRUSH DYNAMICS FULL STACK TEST PASSED!    ');
console.log('===================================================');
