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
  'strokeColor', 'strokeWidth', 'strokeOpacity', 'strokeDashOffset', 'strokeMiterLimit', 'strokeCap', 'strokeJoin',
  'strokeTexMode', 'strokeTexScale', 'strokeTexContrast', 'strokeTexGrain', 'strokeTexAngle',
  'fillColor', 'fillOpacity', 'gradientAngle', 'gradientScale', 'gradientCenterX', 'gradientCenterY',
  'texMode', 'texScale', 'texContrast', 'texGrain', 'texAngle', 'texOffsetX', 'texOffsetY', 'texWarpStrength', 'texWarpFreq', 'texNoiseDistort', 'texHardness', 'texHardnessIntensity', 'texInvert', 'texBlendMode', 'texPosterize', 'texPinchSwirl',
  'wasmPlugin', 'wasmParam1', 'wasmParam2', 'wasmParam3',
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
assert(groups['Stroke'] && groups['Stroke'].length >= 10);
assert(groups['Fill & Material'] && groups['Fill & Material'].length >= 15);
assert(groups['WASM FX'] && groups['WASM FX'].length >= 4);
assert(groups['Brush Dynamics'] && groups['Brush Dynamics'].length >= 20);
assert(groups['Layer FX'] && groups['Layer FX'].length >= 10);
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
  fillTexture: { mode: 5, scale: 150, contrast: 120, grain: 30, warpStrength: 45, hardness: 80, invert: true },
  strokeTexture: { mode: 2, scale: 200, contrast: 100, grain: 10, angle: 90 },
  wasmFilter: { plugin: 'pixelate', param1: 8 },
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
assert.strictEqual(extracted.strokeTexMode, 2);
assert.strictEqual(extracted.strokeTexScale, 200);
assert.strictEqual(extracted.texMode, 5);
assert.strictEqual(extracted.texScale, 150);
assert.strictEqual(extracted.texWarpStrength, 45);
assert.strictEqual(extracted.texHardness, 80);
assert.strictEqual(extracted.texInvert, 1);
assert.strictEqual(extracted.wasmPlugin, 'pixelate');
assert.strictEqual(extracted.wasmParam1, 8);
assert.strictEqual(extracted.polygonSides, 6);
assert.strictEqual(extracted.text, 'Quadro Animation');
assert.strictEqual(extracted.fontSize, 48);
assert.strictEqual(extracted.fontFamily, 'Inter');
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

// Test Line to Curve Morphing
const pLine = 'M 0 0 L 100 100';
const pCurve = 'M 0 0 C 30 70, 70 30, 100 100';
const pMorph = lerpPath(pLine, pCurve, 0.5);
assert(pMorph.startsWith('M 0 0 C'), 'Line to curve should morph into valid cubic Bézier');
assert.strictEqual(pMorph, 'M 0 0 C 15 35, 85 65, 100 100');

// Test Polyline points morphing
const poly1 = '10,20 30,40';
const poly2 = '50,60 70,80';
const polyMid = lerpPath(poly1, poly2, 0.5);
assert.strictEqual(polyMid, '30,40 50,60');

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

// 12. Test Easing Tween Curves
console.log('12. Testing Easing Curves (easeInQuad, easeOutQuad, easeInOutCubic, etc.)...');
const chEaseIn = new DopeSheetChannel('x', 0);
chEaseIn.addKeyframe(1, 0, 'easeInQuad');
chEaseIn.addKeyframe(11, 100, 'easeInQuad');

const chEaseOut = new DopeSheetChannel('x', 0);
chEaseOut.addKeyframe(1, 0, 'easeOutQuad');
chEaseOut.addKeyframe(11, 100, 'easeOutQuad');

const chLinear = new DopeSheetChannel('x', 0);
chLinear.addKeyframe(1, 0, 'linear');
chLinear.addKeyframe(11, 100, 'linear');

assert.strictEqual(chLinear.sample(6), 50);
assert.strictEqual(chEaseIn.sample(6), 25);
assert.strictEqual(chEaseOut.sample(6), 75);

// Test Custom Bézier Curves
const chCustom = new DopeSheetChannel('x', 0);
chCustom.addKeyframe(1, 0, 'cubic-bezier(0.42, 0.0, 0.58, 1.0)');
chCustom.addKeyframe(11, 100, 'cubic-bezier(0.42, 0.0, 0.58, 1.0)');
const customSample = chCustom.sample(6);
assert(Math.abs(customSample - 50) < 0.1, `Symmetric cubic-bezier at midpoint should be 50, got ${customSample}`);

const chOvershoot = new DopeSheetChannel('y', 0);
chOvershoot.addKeyframe(1, 0, 'cubic-bezier(0.34, 1.56, 0.64, 1.0)');
chOvershoot.addKeyframe(11, 100, 'cubic-bezier(0.34, 1.56, 0.64, 1.0)');
const springSample = chOvershoot.sample(6);
assert(springSample > 50, `Spring overshoot at midpoint should be > 50, got ${springSample}`);

// Test Physics Bounce Curves
const chPhysicsBounce = new DopeSheetChannel('x', 0);
chPhysicsBounce.addKeyframe(1, 0, 'bounce(3, 0.45)');
chPhysicsBounce.addKeyframe(11, 100, 'bounce(3, 0.45)');
assert(chPhysicsBounce.sample(1) === 0, 'Bounce at frame 1 should be 0');
assert(chPhysicsBounce.sample(11) === 100, 'Bounce at frame 11 should be 100');
const bounceSample = chPhysicsBounce.sample(6);
assert(typeof bounceSample === 'number' && !isNaN(bounceSample), 'Bounce sample should be valid number');

// Test Harmonic Spring Curves
const chHarmonicSpring = new DopeSheetChannel('x', 0);
chHarmonicSpring.addKeyframe(1, 0, 'spring(3, 0.5)');
chHarmonicSpring.addKeyframe(11, 100, 'spring(3, 0.5)');
assert(chHarmonicSpring.sample(1) === 0, 'Spring at frame 1 should be 0');
assert(chHarmonicSpring.sample(11) === 100, 'Spring at frame 11 should be 100');

// Test Freeform Multi-Node Spline Curves
const chSpline = new DopeSheetChannel('x', 0);
const nodes = [{ x: 0, y: 0 }, { x: 0.5, y: 1.2 }, { x: 1, y: 1 }];
chSpline.addKeyframe(1, 0, `spline:${JSON.stringify(nodes)}`);
chSpline.addKeyframe(11, 100, `spline:${JSON.stringify(nodes)}`);
const splineMid = chSpline.sample(6);
assert(splineMid > 50, `Spline at midpoint with peak 1.2 should be > 50, got ${splineMid}`);

console.log('✔ Easing curves, Custom Bézier, Physics Bounce, Spring & Spline interpolation passed');

// 13. Test Multi-Stop Gradient Manipulation & SvgGradient
console.log('13. Testing SvgGradient Multi-Stop Engine...');
import svgPkg from '../src/svg/svg_engine.js';
const { SvgDocument, SvgLinearGradient, SvgRadialGradient, SvgText } = svgPkg;

const grad = new SvgLinearGradient();
assert.strictEqual(grad.stops.length, 2);
grad.addStop(0.5, '#00ff88', 0.8, 1.2);
assert.strictEqual(grad.stops.length, 3);
assert.strictEqual(grad.stops[1].offset, 0.5);
assert.strictEqual(grad.stops[1].color, '#00ff88');

grad.setStop(1, { color: '#00ccff', opacity: 0.9 });
assert.strictEqual(grad.stops[1].color, '#00ccff');
assert.strictEqual(grad.stops[1].opacity, 0.9);

const removed = grad.removeStop(1);
assert.strictEqual(removed, true);
assert.strictEqual(grad.stops.length, 2);
console.log('✔ SvgGradient multi-stop operations passed');

// 14. Test Animation Persistence in SvgDocument
console.log('14. Testing Animation Persistence in SvgDocument...');

const persistDoc = new SvgDocument(1280, 720);
const persistDs = new DopeSheet(120, 60);
const persistHero = persistDs.getOrCreateObject('obj_hero', 'Hero Character');
persistHero.setKeyframe('x', 1, 10, 'linear');
persistHero.setKeyframe('x', 60, 500, 'easeInOutQuad');

persistDoc.animation = persistDs.toJSON();

// Verify JSON roundtrip
const jsonOut = persistDoc.toJSON();
assert(jsonOut.animation, 'Document JSON should contain animation data');
assert.strictEqual(jsonOut.animation.fps, 60);
assert.strictEqual(jsonOut.animation.totalFrames, 120);

const loadedDoc = new SvgDocument();
loadedDoc.loadJSON(jsonOut);
assert(loadedDoc.animation, 'Loaded Document should restore animation data');
assert.strictEqual(loadedDoc.animation.objects.length, 1);
assert.strictEqual(loadedDoc.animation.objects[0].id, 'obj_hero');

// Verify SVG XML roundtrip with <script type="application/json" id="wesenho-animation">
const svgXml = persistDoc.toSVGString();
assert(svgXml.includes('id="wesenho-animation"'), 'SVG XML should embed wesenho-animation metadata script');

const fromSvgDoc = new SvgDocument();
fromSvgDoc.fromSVGString(svgXml);
assert(fromSvgDoc.animation, 'fromSVGString should parse embedded wesenho-animation script');
assert.strictEqual(fromSvgDoc.animation.objects[0].id, 'obj_hero');
assert.strictEqual(fromSvgDoc.animation.fps, 60);
// 15. Test SvgText Texture & Brush Dynamics Forwarding to Path
console.log('15. Testing SvgText Texture & Brush Dynamics Forwarding to Path...');
const testTxt = new SvgText({
  text: 'Wesenho Vector',
  fillTexture: { enabled: true, mode: 3, contrast: 150, scale: 200 },
  strokeTexture: { enabled: true, mode: 5, angle: 45 },
  brushType: 'rake',
  brushConfig: { preset: 'rake', scatter: 25, grain: 40, dabBlend: 1 },
  wasmFilter: { enabled: true, plugin: 'dither', target: 'backdrop' }
});

const txtPath = testTxt.toPath();
assert(txtPath, 'toPath should return compound path');
assert.strictEqual(txtPath.fillTexture.enabled, true);
assert.strictEqual(txtPath.fillTexture.mode, 3);
assert.strictEqual(txtPath.strokeTexture.enabled, true);
assert.strictEqual(txtPath.strokeTexture.mode, 5);
assert.strictEqual(txtPath.brushType, 'rake');
assert.strictEqual(txtPath.brushConfig.scatter, 25);
assert.strictEqual(txtPath.brushConfig.grain, 40);
assert.strictEqual(txtPath.wasmFilter.plugin, 'dither');
console.log('✔ SvgText Texture & Brush Dynamics forwarding passed');

// 16. Test Single-Track per Object Keyframe Operations
console.log('16. Testing Single-Track per Object Keyframe Operations...');
const singleTrackObj = new DopeSheetObject('hero_sprite', 'Hero Sprite', 'vector');
singleTrackObj.setKeyframe('x', 1, 10, 'linear');
singleTrackObj.setKeyframe('y', 1, 20, 'linear');
singleTrackObj.setKeyframe('opacity', 1, 1.0, 'linear');

singleTrackObj.setKeyframe('x', 15, 100, 'easeOutQuad');
singleTrackObj.setKeyframe('y', 15, 200, 'easeOutQuad');
singleTrackObj.setKeyframe('opacity', 15, 0.5, 'easeOutQuad');

singleTrackObj.setKeyframe('x', 30, 300, 'bounce(3, 0.45)');
singleTrackObj.setKeyframe('y', 30, 400, 'bounce(3, 0.45)');

const kfFrames = singleTrackObj.getKeyframeFrames();
assert.deepStrictEqual(kfFrames, [1, 15, 30], 'Object should report [1, 15, 30] keyframe frames');
assert.strictEqual(singleTrackObj.getKeyframeTweenAt(15), 'easeOutQuad');
assert.strictEqual(singleTrackObj.getKeyframeTweenAt(30), 'bounce(3, 0.45)');

// Test changing tween at frame across all channels
singleTrackObj.setKeyframeTweenAt(15, 'easeInOutCubic');
assert.strictEqual(singleTrackObj.getKeyframeTweenAt(15), 'easeInOutCubic');
assert.strictEqual(singleTrackObj.channels.get('x').getKeyframeAt(15).tweenType, 'easeInOutCubic');
assert.strictEqual(singleTrackObj.channels.get('y').getKeyframeAt(15).tweenType, 'easeInOutCubic');

// Test removing keyframe at frame across all channels
singleTrackObj.removeKeyframesAtFrame(15);
assert.deepStrictEqual(singleTrackObj.getKeyframeFrames(), [1, 30]);
assert.strictEqual(singleTrackObj.hasAnyKeyframeAt(15), false);

// Test moving keyframe across channels and object
singleTrackObj.moveKeyframe(30, 45);
assert.deepStrictEqual(singleTrackObj.getKeyframeFrames(), [1, 45]);
assert.strictEqual(singleTrackObj.hasAnyKeyframeAt(30), false);
assert.strictEqual(singleTrackObj.hasAnyKeyframeAt(45), true);
assert.strictEqual(singleTrackObj.channels.get('x').getKeyframeAt(45).value, 300);

console.log('✔ Single-track per object operations passed');

console.log('--- ALL DOPESHEET & UNIVERSAL PARAMETER TESTS PASSED ---');


