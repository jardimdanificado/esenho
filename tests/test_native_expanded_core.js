const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { EsenhoModule } = require('../src/esenho');

async function runNativeExpandedCoreTests() {
  console.log('===================================================');
  console.log('  Testing Native Expanded Quadro Core (C99/WASM)   ');
  console.log('===================================================');

  const canvas = new EsenhoModule(path.resolve(__dirname, '../plugins/canvas.wasm'));
  canvas.exports.w_init(200, 200);

  // -------------------------------------------------------------
  // 1. Test Oklab & Oklch Perceptual Color Engine
  // -------------------------------------------------------------
  console.log('1. Testing Native Oklab / Oklch & Color Harmonies...');

  // 1.1 RGB -> Oklab & Oklab -> RGB
  // Allocate memory for float lab[3]
  const labPtr = canvas.exports.w_get_clip_mask_buffer(32);
  const redARGB = 0xFFFF0000;
  canvas.exports.w_color_rgb_to_oklab_exp(redARGB, labPtr);
  const labFloats = new Float32Array(canvas.memory.buffer, labPtr, 3);
  console.log(`   Red in Oklab: L=${labFloats[0].toFixed(3)}, a=${labFloats[1].toFixed(3)}, b=${labFloats[2].toFixed(3)}`);
  assert(labFloats[0] > 0.5 && labFloats[0] < 0.7, 'Red L value should be around ~0.62');
  assert(labFloats[1] > 0.15, 'Red a (green-red) should be positive and high');

  const reconstructedRed = canvas.exports.w_color_oklab_to_rgb_exp(labFloats[0], labFloats[1], labFloats[2], 255);
  const recR = (reconstructedRed >> 16) & 0xFF;
  const recG = (reconstructedRed >> 8) & 0xFF;
  const recB = reconstructedRed & 0xFF;
  assert(recR > 240 && recG < 10 && recB < 10, `Reconstructed red should be close to 255,0,0 (got ${recR},${recG},${recB})`);

  // 1.2 RGB -> Oklch & Oklch -> RGB
  canvas.exports.w_color_rgb_to_oklch_exp(0xFF0000FF, labPtr); // Pure Blue
  const lchFloats = new Float32Array(canvas.memory.buffer, labPtr, 3);
  console.log(`   Blue in Oklch: L=${lchFloats[0].toFixed(3)}, C=${lchFloats[1].toFixed(3)}, h=${lchFloats[2].toFixed(1)}°`);
  assert(lchFloats[1] > 0.1, 'Blue chroma should be > 0.1');

  // 1.3 Perceptual Oklab Gradient Lerp
  const midColor = canvas.exports.w_color_oklab_lerp_exp(0xFFFF0000, 0xFF0000FF, 0.5); // Red to Blue midpoint in Oklab
  const midR = (midColor >> 16) & 0xFF;
  const midB = midColor & 0xFF;
  assert(midR > 100 && midB > 100, 'Midpoint should blend red and blue without grayish dips');

  // 1.4 Color Harmonies
  const palettePtr = canvas.exports.w_get_clip_mask_buffer(128);
  const harmonyCount = canvas.exports.w_color_harmony_exp(0xFFFF5500, 0, palettePtr, 4); // Complementary of orange
  assert.strictEqual(harmonyCount, 2, 'Complementary harmony should return 2 colors');
  const paletteColors = new Uint32Array(canvas.memory.buffer, palettePtr, harmonyCount);
  assert.strictEqual(paletteColors[0], 0xFFFF5500, 'First swatch should be base color');
  console.log(`   Complementary Swatch: 0x${paletteColors[1].toString(16)}`);
  console.log('   ✔ Oklab / Oklch & Color Harmonies passed!');

  // -------------------------------------------------------------
  // 2. Test Parametric Easing & Bézier Engine
  // -------------------------------------------------------------
  console.log('2. Testing Native Parametric Easing & Bézier Engine...');

  // 2.1 Standard Easing (Linear, Quad, Cubic, Bounce, Spring)
  assert.strictEqual(canvas.exports.w_easing_evaluate(0, 0.5), 0.5, 'Linear(0.5) must be 0.5');
  assert.strictEqual(canvas.exports.w_easing_evaluate(1, 0.5), 0.25, 'QuadIn(0.5) must be 0.25');
  assert.strictEqual(canvas.exports.w_easing_evaluate(4, 0.5), 0.125, 'CubicIn(0.5) must be 0.125');

  const bounceMid = canvas.exports.w_easing_evaluate(29, 0.5); // BounceOut
  assert(bounceMid > 0.0 && bounceMid <= 1.0, 'BounceOut should be in [0, 1]');

  const springVal = canvas.exports.w_easing_evaluate(31, 0.5); // Spring
  assert(springVal > 0.0, 'Spring should evaluate to positive float');

  // 2.2 Custom Cubic Bézier Easing
  const bezierEase = canvas.exports.w_bezier_easing_evaluate(0.25, 0.1, 0.25, 1.0, 0.5); // CSS ease
  assert(bezierEase > 0.5 && bezierEase < 1.0, `CSS ease at 0.5 should be > 0.5 (got ${bezierEase})`);

  // 2.3 Property evaluation
  const val = canvas.exports.w_anim_eval_property(10.0, 50.0, 0.5, 1); // QuadIn from 10 to 50
  assert.strictEqual(Math.round(val), 20, `QuadIn(10 -> 50, t=0.5) should be 20 (got ${val})`);
  console.log('   ✔ Parametric Easing & Bézier Engine passed!');

  // -------------------------------------------------------------
  // 3. Test Animated GIF89a Native Encoder
  // -------------------------------------------------------------
  console.log('3. Testing Native Animated GIF89a Encoder...');

  const gifInitRes = canvas.exports.w_gif_start(100, 100, 0);
  assert.strictEqual(gifInitRes, 1, 'GIF initialization should succeed');

  // Frame 1: Red rectangle
  canvas.exports.w_draw_rect(0, 0, 100, 100, 0xFFFF0000);
  const f1Res = canvas.exports.w_gif_append_composite_frame(100); // 100ms delay
  assert.strictEqual(f1Res, 1, 'Frame 1 appended');

  // Frame 2: Blue rectangle
  canvas.exports.w_draw_rect(0, 0, 100, 100, 0xFF0000FF);
  const f2Res = canvas.exports.w_gif_append_composite_frame(100); // 100ms delay
  assert.strictEqual(f2Res, 2, 'Frame 2 appended');

  // Finalize GIF
  const gifBytesTotal = canvas.exports.w_gif_finalize();
  assert(gifBytesTotal > 100, `GIF byte stream should be > 100 bytes (got ${gifBytesTotal})`);

  const gifBufPtr = canvas.exports.w_gif_get_buffer(0);
  const gifHeader = Buffer.from(canvas.memory.buffer, gifBufPtr, 6).toString('ascii');
  assert.strictEqual(gifHeader, 'GIF89a', `GIF header should be GIF89a (got ${gifHeader})`);

  // Verify Trailer byte (0x3B)
  const lastByte = new Uint8Array(canvas.memory.buffer, gifBufPtr + gifBytesTotal - 1, 1)[0];
  assert.strictEqual(lastByte, 0x3B, 'GIF stream must end with trailer 0x3B');
  console.log(`   Generated valid GIF89a stream (${gifBytesTotal} bytes, 2 frames)`);
  console.log('   ✔ Native Animated GIF89a Encoder passed!');

  // -------------------------------------------------------------
  // 4. Test Vector Polygon Boolean Operations
  // -------------------------------------------------------------
  console.log('4. Testing Native Vector Polygon Boolean Operations...');

  // Square A: (10, 10) to (50, 50)
  const subjXY = new Int32Array([10, 10, 50, 10, 50, 50, 10, 50]);
  // Square B: (30, 30) to (70, 70)
  const clipXY = new Int32Array([30, 30, 70, 30, 70, 70, 30, 70]);

  const subjPtr = canvas.exports.w_get_clip_mask_buffer(256);
  new Int32Array(canvas.memory.buffer, subjPtr, subjXY.length).set(subjXY);

  const clipPtr = subjPtr + subjXY.byteLength;
  new Int32Array(canvas.memory.buffer, clipPtr, clipXY.length).set(clipXY);

  const outPtr = clipPtr + clipXY.byteLength;

  // 4.1 Boolean Intersect
  const intersectCount = canvas.exports.w_polygon_boolean_clip(1, subjPtr, 4, clipPtr, 4, outPtr, 32);
  assert(intersectCount >= 3, `Polygon intersect should produce valid polygon (got ${intersectCount} vertices)`);
  console.log(`   Intersection polygon vertex count: ${intersectCount}`);

  // 4.2 Boolean Union
  const unionCount = canvas.exports.w_polygon_boolean_clip(0, subjPtr, 4, clipPtr, 4, outPtr, 32);
  assert(unionCount >= 4, `Polygon union should produce valid merged polygon (got ${unionCount} vertices)`);
  console.log(`   Union polygon vertex count: ${unionCount}`);
  console.log('   ✔ Vector Polygon Boolean Operations passed!');

  // -------------------------------------------------------------
  // 5. Test Native Image Ingestion (QOI / BMP / TGA)
  // -------------------------------------------------------------
  console.log('5. Testing Native Image Decoding (QOI / BMP / TGA)...');

  // Build a minimal 2x2 QOI image in memory
  // QOI Header: 'qoif' (4) + width 2 (4) + height 2 (4) + channels 4 (1) + colorspace 0 (1) = 14 bytes
  const qoiData = new Uint8Array([
    0x71, 0x6f, 0x69, 0x66, // 'qoif'
    0x00, 0x00, 0x00, 0x02, // width: 2
    0x00, 0x00, 0x00, 0x02, // height: 2
    0x04,                   // 4 channels RGBA
    0x00,                   // sRGB
    0xFF, 0xFF, 0x00, 0x00, 0xFF, // RGBA: (255, 0, 0, 255)
    0xFF, 0x00, 0xFF, 0x00, 0xFF, // RGBA: (0, 255, 0, 255)
    0xFF, 0x00, 0x00, 0xFF, 0xFF, // RGBA: (0, 0, 255, 255)
    0xFF, 0xFF, 0xFF, 0x00, 0xFF  // RGBA: (255, 255, 0, 255)
  ]);

  const imgDataPtr = canvas.exports.w_get_clip_mask_buffer(256);
  new Uint8Array(canvas.memory.buffer, imgDataPtr, qoiData.length).set(qoiData);

  const dimPtr = (imgDataPtr + qoiData.byteLength + 15) & ~15;
  const hasDim = canvas.exports.w_image_load_auto_dimensions(imgDataPtr, qoiData.length, dimPtr);
  assert(hasDim, 'Image dimensions should be auto-detected');
  const dims = new Int32Array(canvas.memory.buffer, dimPtr, 2);
  assert.strictEqual(dims[0], 2, 'Decoded width should be 2');
  assert.strictEqual(dims[1], 2, 'Decoded height should be 2');

  const decodedCount = canvas.exports.w_image_load_to_layer(3, imgDataPtr, qoiData.length);
  assert.strictEqual(decodedCount, 4, `Decoded pixel count should be 4 (got ${decodedCount})`);

  console.log('   ✔ Native Image Decoding passed!');

  console.log('===================================================');
  console.log('  ALL NATIVE EXPANDED QUADRO CORE TESTS PASSED!    ');
  console.log('===================================================');
}

runNativeExpandedCoreTests().catch(err => {
  console.error(err);
  process.exit(1);
});
