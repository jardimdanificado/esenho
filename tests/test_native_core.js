/**
 * =========================================================================
 * Wesenho Native Core Test Suite (tests/test_native_core.js)
 * Tests Audio DSP, Vector Bézier Rasterizer, and Font Engine in WASM.
 * =========================================================================
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { EsenhoModule } = require('../src/esenho.js');
const { WesenhoSDK } = require('../src/script/wesenho_sdk.js');

async function runNativeCoreTests() {
  console.log('--- Testing Wesenho Native Core Expansions (WASM) ---');

  const canvasWasmPath = path.resolve(__dirname, '../plugins/canvas.wasm');
  assert(fs.existsSync(canvasWasmPath), 'plugins/canvas.wasm must exist');
  
  const canvas = new EsenhoModule(canvasWasmPath);
  canvas.exports.w_init(800, 600);

  /* =======================================================================
   * 1. Test Native Audio DSP Engine
   * ======================================================================= */
  console.log('--- 1. Testing Native Audio DSP Engine ---');
  canvas.audioInit(44100);
  canvas.audioSetBpm(135);
  assert.strictEqual(canvas.audioGetBpm(), 135, 'BPM should match 135');
  
  canvas.audioSetMasterVol(0.9);
  assert(Math.abs(canvas.audioGetMasterVol() - 0.9) < 1e-4, 'Master volume should match 0.9');

  // Configure Track 0: Saw wave, snappy envelope
  canvas.audioSetTrackSynth(0, 1 /* SAW */, 0.005, 0.1, 0.5, 0.2, 0.5);
  // Configure lowpass filter
  canvas.audioSetTrackFilter(0, 1 /* LOWPASS */, 2500, 2.0, 0.0);
  // Configure stereo delay
  canvas.audioSetTrackFx(0, 0.25, 0.4, 0.3, 0.0, 0.0, 0.0, 0.0);

  // Play a chord: C4 (60), E4 (64), G4 (67)
  canvas.audioNoteOn(0, 60, 0.9);
  canvas.audioNoteOn(0, 64, 0.85);
  canvas.audioNoteOn(0, 67, 0.8);

  // Render 512 frames
  canvas.audioRenderBlock(512);
  const bufs = canvas.audioGetBuffers(512);
  assert(bufs && bufs.left && bufs.right, 'Audio buffers must be returned');
  assert.strictEqual(bufs.left.length, 512, 'Left buffer must have 512 samples');
  assert.strictEqual(bufs.right.length, 512, 'Right buffer must have 512 samples');

  // Verify non-silent samples
  let maxL = 0, maxR = 0;
  for (let i = 0; i < 512; i++) {
    maxL = Math.max(maxL, Math.abs(bufs.left[i]));
    maxR = Math.max(maxR, Math.abs(bufs.right[i]));
  }
  assert(maxL > 0.01, 'Rendered audio left channel must have non-zero signal');
  assert(maxR > 0.01, 'Rendered audio right channel must have non-zero signal');
  console.log(`✔ Polyphonic chord render verified (Peak L: ${maxL.toFixed(3)}, Peak R: ${maxR.toFixed(3)})`);

  // Test SFXR procedural audio
  canvas.audioTriggerSfxr(0 /* COIN */, 1.0);
  canvas.audioRenderBlock(256);
  const sfxBufs = canvas.audioGetBuffers(256);
  let sfxPeak = 0;
  for (let i = 0; i < 256; i++) sfxPeak = Math.max(sfxPeak, Math.abs(sfxBufs.left[i]));
  assert(sfxPeak > 0.05, 'SFXR coin sound must produce non-zero signal');
  console.log(`✔ SFXR procedural sound generator verified (Peak: ${sfxPeak.toFixed(3)})`);

  // Test WAV Export
  const wavBytes = canvas.audioExportWav(44100 /* 1 second */);
  assert(wavBytes && wavBytes.length > 44, 'WAV bytes must be generated');
  const riffMagic = String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3]);
  const waveMagic = String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11]);
  assert.strictEqual(riffMagic, 'RIFF', 'WAV magic must be RIFF');
  assert.strictEqual(waveMagic, 'WAVE', 'WAV format must be WAVE');
  console.log(`✔ Native WAV exporter verified (${wavBytes.length} bytes generated)`);

  /* =======================================================================
   * 2. Test Native Vector Path & Bézier Scanline Rasterizer
   * ======================================================================= */
  console.log('--- 2. Testing Native Vector Path & Bézier Rasterizer ---');
  
  // Create triangle / polygon path
  canvas.pathBegin();
  canvas.pathMoveTo(100, 100);
  canvas.pathLineTo(200, 100);
  canvas.pathLineTo(150, 200);
  canvas.pathClose();
  
  // Fill path with solid red (0xFFFF0000 = ABGR)
  const fillRes = canvas.pathFill(3 /* layer 3 */, 0xFFFF0000, 0 /* Non-zero */);
  assert.strictEqual(fillRes, 1, 'Path fill must return success 1');

  // Create curved path with quadratic & cubic Bézier
  canvas.pathBegin();
  canvas.pathMoveTo(300, 300);
  canvas.pathQuadTo(350, 200, 400, 300);
  canvas.pathCubicTo(450, 400, 500, 200, 550, 300);
  
  // Stroke path with 4px width and green color
  const strokeRes = canvas.pathStroke(3 /* layer 3 */, 0xFF00FF00, 4.0, 0, 0);
  assert.strictEqual(strokeRes, 1, 'Path stroke must return success 1');
  console.log('✔ Native Vector Path Bézier fill and stroke rasterization passed');

  /* =======================================================================
   * 3. Test Native Font & Glyph Engine
   * ======================================================================= */
  console.log('--- 3. Testing Native Font & Glyph Engine ---');
  
  const text = 'Wesenho Studio 2026';
  const metrics = canvas.fontMeasureText(text, 24, 2);
  assert(metrics.width > 100, `Text width must be measured (>100px, got ${metrics.width})`);
  assert(metrics.height > 20, `Text height must be measured (>20px, got ${metrics.height})`);
  console.log(`✔ Font measure text passed: "${text}" is ${metrics.width}x${metrics.height}px`);

  const drawRes = canvas.fontDrawText(3 /* layer 3 */, 50, 50, text, 20, 0xFFFFFFFF, 1, 24);
  assert.strictEqual(drawRes, 1, 'Font draw text must return success 1');
  console.log('✔ Native Font glyph rasterization onto layer passed');

  /* =======================================================================
   * 4. Test Universal SDK Domain Integrations
   * ======================================================================= */
  console.log('--- 4. Testing Universal SDK Domain Bindings ---');
  const sdk = new WesenhoSDK();
  sdk.audio.bindWasm(canvas);
  sdk.vector.bindWasm(canvas);

  sdk.audio.noteOn(0, 'A4', 0.9);
  const audioBlk = sdk.audio.renderBlock(128);
  assert(audioBlk && audioBlk.left.length === 128, 'SDK audio render block must work');

  const textMetrics = sdk.vector.measureTextNative('Test Native Text', 16, 0);
  assert(textMetrics.width > 50, 'SDK vector measureTextNative must work');
  console.log('✔ Universal SDK domain bindings passed');

  console.log('--- ALL NATIVE CORE TESTS PASSED ---');
}

runNativeCoreTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
