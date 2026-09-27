/**
 * =========================================================================
 * Test Suite: DopeSheet & Universal Parameter Keyframing
 * Tests full interpolation of Transform, Brush Dynamics, Materials/Fills & FX.
 * =========================================================================
 */

import assert from 'assert';
import { DopeSheet, DopeSheetObject, DopeSheetChannel, parseColor, formatColor, lerpColor, lerpAngle, PARAMETER_REGISTRY } from '../src/anim/dopesheet.js';

console.log('--- Testing DopeSheet & Universal Parameter Interpolation Engine ---');

// 1. Test Parameter Registry Completeness
console.log('1. Testing Parameter Registry...');
const requiredParams = [
  'x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity',
  'brushSize', 'brushOpacity', 'brushHardness', 'brushFlow', 'brushSpacing', 'brushAngle', 'brushGrain', 'brushSmudge', 'brushColor',
  'fillColor', 'strokeColor', 'strokeWidth', 'fillOpacity', 'strokeOpacity',
  'camX', 'camY', 'camZ', 'camZoom', 'camRot',
  'fxBlur', 'fxBrightness', 'fxContrast', 'fxHue'
];

for (const param of requiredParams) {
  assert(PARAMETER_REGISTRY[param] !== undefined, `Parameter '${param}' must exist in PARAMETER_REGISTRY`);
}
console.log('✔ Parameter Registry verified');

// 2. Test Color & Angle Interpolation Math
console.log('2. Testing Color & Angle Math...');
// Hex to Hex lerp
const redToBlue = lerpColor('#ff0000', '#0000ff', 0.5);
assert.strictEqual(redToBlue, '#800080', 'Midpoint of red and blue should be purple #800080');

// RGBA lerp
const transparentToOpaque = lerpColor('rgba(255, 0, 0, 0)', 'rgba(255, 0, 0, 1)', 0.5, 'rgba');
assert.strictEqual(transparentToOpaque, 'rgba(255, 0, 0, 0.5)', 'Alpha lerp should yield 0.5');

// Shortest-path angle lerp
const angLerp1 = lerpAngle(350, 10, 0.5);
assert.strictEqual(angLerp1, 360, 'Angle lerp from 350 to 10 across 0 should be 360/0');

const angLerp2 = lerpAngle(10, 350, 0.5);
assert.strictEqual(angLerp2, 0, 'Angle lerp from 10 to 350 across 0 should be 0');
console.log('✔ Color and Angle interpolation passed');

// 3. Test Channel Keyframing & Easing Tweens
console.log('3. Testing Channel Keyframing & Easing...');
const scaleChannel = new DopeSheetChannel('scaleX', 1.0);
scaleChannel.addKeyframe(1, 1.0, 'linear');
scaleChannel.addKeyframe(11, 3.0, 'linear');

assert.strictEqual(scaleChannel.sample(1), 1.0);
assert.strictEqual(scaleChannel.sample(6), 2.0); // Exact midpoint
assert.strictEqual(scaleChannel.sample(11), 3.0);
assert.strictEqual(scaleChannel.sample(20), 3.0); // Hold last value
console.log('✔ Channel linear interpolation passed');

// 4. Test Brush Dynamics Keyframing
console.log('4. Testing Brush Dynamics Keyframing...');
const brushObj = new DopeSheetObject('brush_custom', 'Inker Dynamic', 'brush_preset');
brushObj.setKeyframe('brushSize', 1, 10, 'linear');
brushObj.setKeyframe('brushSize', 21, 50, 'linear');
brushObj.setKeyframe('brushHardness', 1, 100, 'linear');
brushObj.setKeyframe('brushHardness', 21, 20, 'linear');
brushObj.setKeyframe('brushColor', 1, '#ff0000', 'linear');
brushObj.setKeyframe('brushColor', 21, '#00ff00', 'linear');

const brushFrame11 = brushObj.sample(11);
assert.strictEqual(brushFrame11.brushSize, 30, 'Brush size at frame 11 should be 30');
assert.strictEqual(brushFrame11.brushHardness, 60, 'Brush hardness at frame 11 should be 60');
assert.strictEqual(brushFrame11.brushColor, '#808000', 'Brush color at frame 11 should be #808000');
console.log('✔ Brush dynamics keyframing passed');

// 5. Test Vector Fill & Stroke Keyframing
console.log('5. Testing Material & Fill Keyframing...');
const shapeObj = new DopeSheetObject('shape_rect', 'Hero Rect', 'vector');
shapeObj.setKeyframe('fillColor', 1, '#000000', 'linear');
shapeObj.setKeyframe('fillColor', 11, '#ffffff', 'linear');
shapeObj.setKeyframe('strokeWidth', 1, 2, 'linear');
shapeObj.setKeyframe('strokeWidth', 11, 12, 'linear');

const shapeFrame6 = shapeObj.sample(6);
assert.strictEqual(shapeFrame6.fillColor, '#808080', 'Fill color at frame 6 should be #808080');
assert.strictEqual(shapeFrame6.strokeWidth, 7, 'Stroke width at frame 6 should be 7');
console.log('✔ Material & Fill keyframing passed');

// 6. Test DopeSheet Director, Scrubbing & Multi-Object Sample
console.log('6. Testing DopeSheet Director...');
const ds = new DopeSheet(60, 24);
ds.getOrCreateObject('layer_1', 'Background');
ds.setKeyframe('layer_1', 'opacity', 1, 1.0, 'linear');
ds.setKeyframe('layer_1', 'opacity', 31, 0.0, 'linear');

ds.getOrCreateObject('layer_2', 'Foreground');
ds.setKeyframe('layer_2', 'x', 1, 0, 'linear');
ds.setKeyframe('layer_2', 'x', 31, 300, 'linear');

ds.setFrame(16);
const samples = ds.sampleAll(16);
assert.strictEqual(Math.round(samples.layer_1.opacity * 10) / 10, 0.5, 'Layer 1 opacity at frame 16 should be 0.5');
assert.strictEqual(Math.round(samples.layer_2.x), 150, 'Layer 2 position X at frame 16 should be 150');
console.log('✔ Multi-object sampling passed');

// 7. Test JSON Serialization & Deserialization
console.log('7. Testing JSON Serialization / Deserialization...');
const json = ds.toJSON();
const restoredDs = DopeSheet.fromJSON(json);
assert.strictEqual(restoredDs.totalFrames, 60);
assert.strictEqual(restoredDs.fps, 24);
const restoredSamples = restoredDs.sampleAll(16);
assert.strictEqual(Math.round(restoredSamples.layer_1.opacity * 10) / 10, 0.5);
assert.strictEqual(Math.round(restoredSamples.layer_2.x), 150);
console.log('✔ Serialization / Deserialization passed');

console.log('--- ALL DOPESHEET & UNIVERSAL PARAMETER TESTS PASSED ---');
