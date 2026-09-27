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
console.log('1. Testing Parameter Registry & Groups...');
import { getParameterGroups } from '../src/anim/dopesheet.js';

const requiredParams = [
  'x', 'y', 'zDepth', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY', 'opacity', 'originX', 'originY',
  'width', 'height', 'radius', 'rx', 'ry', 'cornerRadius', 'polygonSides', 'starPoints', 'innerRadius',
  'text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textAlign', 'letterSpacing', 'lineHeight', 'textPathOffset',
  'shadowEnable', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity',
  'strokeColor', 'strokeWidth', 'strokeOpacity', 'strokeDashOffset', 'strokeMiterLimit', 'strokeCap', 'strokeJoin',
  'fillColor', 'fillOpacity', 'gradientAngle', 'gradientScale', 'gradientCenterX', 'gradientCenterY', 'texMode', 'texScale', 'texContrast', 'texAngle',
  'brushSize', 'brushOpacity', 'brushHardness', 'brushFlow', 'brushSpacing', 'brushAngle', 'brushRoundness', 'brushScatter',
  'brushTolerance', 'brushSmudge', 'brushWetness', 'brushGrain', 'brushColor', 'brushSmooth', 'brushMidpoint', 'brushVelocity',
  'brushTaperIn', 'brushTaperOut', 'brushFade', 'brushSizeJitter', 'brushAngleJitter', 'brushOpacityJitter', 'brushColorJitter',
  'brushDabBlend', 'brushDepletion', 'brushColorPickup', 'brushDualSize', 'brushDualSpacing', 'brushSymmetry',
  'fxBlur', 'fxBrightness', 'fxContrast', 'fxHue', 'fxSat', 'fxGrayscale', 'fxSepia', 'fxInvert', 'fxNoise', 'fxPixelate', 'fxThreshold', 'fxDither', 'fxEdge', 'layerBlendMode',
  'camX', 'camY', 'camZ', 'camZoom', 'camRot',
  'boneAngle', 'boneLength', 'meshWarpWeight',
  'bpm', 'masterVol', 'trackVol', 'trackPan', 'filterCutoff', 'filterResonance', 'fxDelay', 'fxReverb', 'fxDistortion'
];

for (const param of requiredParams) {
  assert(PARAMETER_REGISTRY[param] !== undefined, `Parameter '${param}' must exist in PARAMETER_REGISTRY`);
}

const groups = getParameterGroups();
assert(groups['Transform'] && groups['Transform'].length >= 9);
assert(groups['Typography'] && groups['Typography'].length >= 8);
assert(groups['Drop Shadow'] && groups['Drop Shadow'].length >= 6);
assert(groups['Brush Dynamics'] && groups['Brush Dynamics'].length >= 20);
assert(groups['Layer FX'] && groups['Layer FX'].length >= 10);
assert(groups['Fill & Material'] && groups['Fill & Material'].length >= 8);
assert(groups['Audio DSP'] && groups['Audio DSP'].length >= 8);

// Verify default collapsed is true
const testObj = new DopeSheetObject('test_node', 'Node');
assert.strictEqual(testObj.collapsed, true, 'DopeSheetObject must start collapsed by default');

console.log(`✔ Parameter Registry verified (${Object.keys(PARAMETER_REGISTRY).length} Quadro parameters across ${Object.keys(groups).length} groups)`);

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

// 8. Test Auto-Keyframing Simulation
console.log('8. Testing Auto-Keyframe Mode...');
const autoDs = new DopeSheet(60, 24);
autoDs.autoKeyframe = true;
const hero = autoDs.getOrCreateObject('hero', 'Hero Character', 'vector');
hero.getOrCreateChannel('x', 100);
hero.getOrCreateChannel('y', 200);

autoDs.setFrame(10);
hero.setKeyframe('x', 10, 350);
hero.setKeyframe('y', 10, 500);

const kfSample = hero.sample(10);
assert.strictEqual(kfSample.x, 350);
assert.strictEqual(kfSample.y, 500);
console.log('✔ Auto-Keyframing passed');

// 9. Test extractLiveObjectProperties
console.log('9. Testing extractLiveObjectProperties comprehensive extraction...');
import { extractLiveObjectProperties } from '../src/anim/dopesheet.js';

const mockLiveNode = {
  id: 'node_complex',
  x: 50,
  y: 75,
  cx: 120,
  cy: 140,
  rotation: 45,
  scaleX: 2.0,
  scaleY: 1.5,
  opacity: 0.8,
  fill: '#ff5500',
  stroke: '#0033aa',
  strokeWidth: 4,
  strokeDashoffset: 12,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  sides: 6,
  text: 'Quadro Animation',
  fontSize: 48,
  fontFamily: 'Inter',
  shadow: { enabled: true, color: '#111111', blur: 10, offsetX: 5, offsetY: 8, opacity: 0.5 },
  filterBlur: 3,
  filterHue: 90,
  brushSize: 35,
  brushOpacity: 80
};

const extracted = extractLiveObjectProperties(mockLiveNode);
assert.strictEqual(extracted.x, 120, 'cx should map to x');
assert.strictEqual(extracted.y, 140, 'cy should map to y');
assert.strictEqual(extracted.rotation, 45);
assert.strictEqual(extracted.scaleX, 2.0);
assert.strictEqual(extracted.scaleY, 1.5);
assert.strictEqual(extracted.opacity, 0.8);
assert.strictEqual(extracted.fillColor, '#ff5500');
assert.strictEqual(extracted.strokeColor, '#0033aa');
assert.strictEqual(extracted.strokeWidth, 4);
assert.strictEqual(extracted.strokeDashOffset, 12);
assert.strictEqual(extracted.strokeCap, 'square');
assert.strictEqual(extracted.strokeJoin, 'miter');
assert.strictEqual(extracted.polygonSides, 6);
assert.strictEqual(extracted.text, 'Quadro Animation');
assert.strictEqual(extracted.fontSize, 48);
assert.strictEqual(extracted.fontFamily, 'Inter');
assert.strictEqual(extracted.shadowEnable, 1);
assert.strictEqual(extracted.shadowColor, '#111111');
assert.strictEqual(extracted.shadowBlur, 10);
assert.strictEqual(extracted.shadowOffsetX, 5);
assert.strictEqual(extracted.shadowOffsetY, 8);
assert.strictEqual(extracted.shadowOpacity, 0.5);
assert.strictEqual(extracted.fxBlur, 3);
assert.strictEqual(extracted.fxHue, 90);
assert.strictEqual(extracted.brushSize, 35);
assert.strictEqual(extracted.brushOpacity, 80);

console.log('✔ extractLiveObjectProperties passed');

// 10. Test Path Morphing & Polyline Interpolation
console.log('10. Testing Path Morphing & lerpPath...');
import { lerpPath } from '../src/anim/dopesheet.js';

const pathStart = 'M 10.00 20.00 C 15.00 25.00, 30.00 40.00, 50.00 60.00';
const pathEnd   = 'M 30.00 40.00 C 35.00 45.00, 50.00 60.00, 70.00 80.00';
const pathMid   = lerpPath(pathStart, pathEnd, 0.5);

assert.strictEqual(pathMid, 'M 20 30 C 25 35, 40 50, 60 70', 'Path midpoint should be exactly interpolated coordinates');

const pathChannel = new DopeSheetChannel('d', pathStart);
pathChannel.type = 'path';
pathChannel.addKeyframe(1, pathStart, 'linear');
pathChannel.addKeyframe(11, pathEnd, 'linear');

assert.strictEqual(pathChannel.sample(6), 'M 20 30 C 25 35, 40 50, 60 70');
console.log('✔ Path morphing & lerpPath passed');

// 11. Test Object Renaming
console.log('11. Testing Object Renaming on DopeSheet...');
const renameDs = new DopeSheet(60, 24);
const rObj = renameDs.getOrCreateObject('layer_star', 'Original Star');
assert.strictEqual(rObj.name, 'Original Star');

let notifiedRename = null;
renameDs.subscribe((ev, payload) => {
  if (ev === 'objectRenamed') notifiedRename = payload;
});

renameDs.renameObject('layer_star', 'Golden Glowing Star');
assert.strictEqual(rObj.name, 'Golden Glowing Star');
assert.deepStrictEqual(notifiedRename, { id: 'layer_star', name: 'Golden Glowing Star' });
console.log('✔ Object renaming and notification passed');

console.log('--- ALL DOPESHEET & UNIVERSAL PARAMETER TESTS PASSED ---');


