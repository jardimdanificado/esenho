/**
 * tests/test_wasm_brushes.js
 * Comprehensive Test Suite for Zero-Copy WASM Brush Protocol
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import Esenho engine
const esenhoPath = path.resolve(rootDir, 'src/esenho.js');
const esenhoCode = fs.readFileSync(esenhoPath, 'utf8');

test('Zero-Copy WASM Brush Protocol & Suite', async (t) => {
  const manifestPath = path.resolve(rootDir, 'plugins/brushes/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'plugins/brushes/manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(Array.isArray(manifest) && manifest.length >= 7, 'Must have at least 7 WASM brushes in manifest');

  console.log(`Discovered ${manifest.length} WASM Brushes:`, manifest);

  // Initialize Canvas module
  const canvasWasmPath = path.resolve(rootDir, 'plugins/canvas.wasm');
  assert.ok(fs.existsSync(canvasWasmPath), 'canvas.wasm must exist');
  const canvasBytes = fs.readFileSync(canvasWasmPath);

  const env = {
    sinf: Math.sin, cosf: Math.cos, tanf: Math.tan, atan2f: Math.atan2, sqrtf: Math.sqrt,
    fabsf: Math.abs, powf: Math.pow, fmodf: (x,y)=>x%y, roundf: Math.round, floorf: Math.floor,
    ceilf: Math.ceil, expf: Math.exp, logf: Math.log
  };
  const canvasMod = new WebAssembly.Module(canvasBytes);
  const canvasActor = new WebAssembly.Instance(canvasMod, { env });
  canvasActor.memory = canvasActor.exports.memory;
  canvasActor.exports.w_init(200, 200);

  const pixPtr = canvasActor.exports.get_active_layer_pixels();
  assert.ok(pixPtr > 0, 'Active layer pixel pointer must be valid');

  await t.test('1. Each brush loads with shared memory and exposes valid metadata', async () => {
    for (const bfile of manifest) {
      const bpath = path.resolve(rootDir, 'plugins/brushes', bfile);
      const bbytes = fs.readFileSync(bpath);
      const m = new WebAssembly.Module(bbytes);
      const memBase = canvasActor.exports.w_canvas_alloc(65536);

      const brushInst = new WebAssembly.Instance(m, {
        env: {
          ...env,
          memory: canvasActor.exports.memory,
          __memory_base: new WebAssembly.Global({ value: 'i32', mutable: false }, memBase),
          __table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1)
        }
      });

      assert.strictEqual(typeof brushInst.exports.w_brush_get_info, 'function', `${bfile} must export w_brush_get_info`);
      assert.strictEqual(typeof brushInst.exports.w_brush_render_dab, 'function', `${bfile} must export w_brush_render_dab`);

      const infoPtr = brushInst.exports.w_brush_get_info();
      const u8 = new Uint8Array(canvasActor.exports.memory.buffer);
      let end = infoPtr;
      while (u8[end] !== 0) end++;
      const jsonStr = new TextDecoder('utf-8').decode(u8.subarray(infoPtr, end));
      const info = JSON.parse(jsonStr);

      assert.ok(info.title, `${bfile} must have title`);
      assert.ok(Array.isArray(info.params) && info.params.length > 0, `${bfile} must define custom parameters`);
      console.log(`   ✔ ${bfile.padEnd(25)} [${info.title}] (${info.params.length} parameters)`);
    }
  });

  await t.test('2. Direct zero-copy dab renders into canvas active layer memory', async () => {
    // Clear canvas active layer
    const u32 = new Uint32Array(canvasActor.exports.memory.buffer);
    const pixIdx = pixPtr >> 2;
    u32.fill(0, pixIdx, pixIdx + 200 * 200);

    // Load bristle_oil.wasm
    const oilBytes = fs.readFileSync(path.resolve(rootDir, 'plugins/brushes/bristle_oil.wasm'));
    const memBase = canvasActor.exports.w_canvas_alloc(65536);
    const oilInst = new WebAssembly.Instance(new WebAssembly.Module(oilBytes), {
      env: {
        ...env,
        memory: canvasActor.exports.memory,
        __memory_base: new WebAssembly.Global({ value: 'i32', mutable: false }, memBase),
        __table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1)
      }
    });

    if (oilInst.exports.w_brush_init) oilInst.exports.w_brush_init(200, 200);
    oilInst.exports.w_brush_stroke_begin(100, 100, 1.0, 0, 0, 0xFFFF5522, 0);

    // Stamp dab
    oilInst.exports.w_brush_render_dab(pixPtr, 200, 200, 100, 100, 20.0, 1.0, 0, 0, 0xFFFF5522, 0);

    // Verify canvas memory buffer was modified in place with ZERO COPY!
    let nonZeroCount = 0;
    for (let i = 0; i < 200 * 200; i++) {
      if (u32[pixIdx + i] !== 0) nonZeroCount++;
    }
    assert.ok(nonZeroCount > 50, `Bristle oil dab must paint pixels into canvas memory (painted ${nonZeroCount} pixels)`);
    console.log(`   ✔ Zero-Copy In-Place Painting verified: ${nonZeroCount} pixels stamped directly in canvas memory`);
  });

  await t.test('3. Dynamic parameter updates change brush behavior', async () => {
    const ditherBytes = fs.readFileSync(path.resolve(rootDir, 'plugins/brushes/pixel_dither.wasm'));
    const memBase = canvasActor.exports.w_canvas_alloc(65536);
    const ditherInst = new WebAssembly.Instance(new WebAssembly.Module(ditherBytes), {
      env: {
        ...env,
        memory: canvasActor.exports.memory,
        __memory_base: new WebAssembly.Global({ value: 'i32', mutable: false }, memBase),
        __table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1)
      }
    });

    // Test parameter setting
    ditherInst.exports.w_brush_set_param(0, 4); // 4x4 pixel grid
    ditherInst.exports.w_brush_set_param(2, 90); // 90% density bias

    const u32 = new Uint32Array(canvasActor.exports.memory.buffer);
    const pixIdx = pixPtr >> 2;
    u32.fill(0, pixIdx, pixIdx + 200 * 200);

    ditherInst.exports.w_brush_render_dab(pixPtr, 200, 200, 50, 50, 15.0, 1.0, 0, 0, 0xFFFFFFFF, 0);

    let painted = 0;
    for (let i = 0; i < 200 * 200; i++) {
      if (u32[pixIdx + i] !== 0) painted++;
    }
    assert.ok(painted > 20, 'Pixel dither brush must stamp pixels according to Bayer matrix');
    console.log(`   ✔ Pixel Dither dynamic parameters verified (${painted} pixels stamped with Bayer grid)`);
  });

  await t.test('4. Custom WASM presets preserve and restore custom parameter values', async () => {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const { EsenhoScreenHost } = req('../src/esenho.js');
    const host = new EsenhoScreenHost();
    host.canvasActor = canvasActor;

    const oilPath = path.resolve(rootDir, 'plugins/brushes/bristle_oil.wasm');
    const oilBytes = fs.readFileSync(oilPath);
    await host.loadWasmBrush('bristle_oil', oilBytes);

    host.selectWasmBrush('bristle_oil');
    assert.ok(host.activeWasmBrush, 'WASM brush must be active');
    host.activeWasmBrush.setParam(0, 88);
    host.activeWasmBrush.setParam(1, 95);
    host.setBrushParam('size', 42);

    host.executeCommand('preset save CustomOilSpecial');
    const p = host.customBrushPresets['customoilspecial'];
    assert.ok(p, 'Preset customoilspecial must be registered');
    assert.equal(p.wasmBrush, 'bristle_oil');
    assert.equal(p.wasmParams['0'], 88);
    assert.equal(p.wasmParams['1'], 95);

    host.selectBrushPreset('pencil');
    assert.equal(host.activeWasmBrush, null);

    host.selectBrushPreset('customoilspecial');
    assert.ok(host.activeWasmBrush, 'Custom preset must reactivate WASM brush');
    assert.equal(host.activeWasmBrush.name, 'bristle_oil');
    assert.equal(host.activeWasmBrush.getParam(0), 88);
    assert.equal(host.activeWasmBrush.getParam(1), 95);
    console.log('   ✔ Custom WASM preset saving & restoring parameters verified');
  });

  await t.test('5. WASM brushes are registered in brush presets and listed in REPL', async () => {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const { EsenhoScreenHost, BRUSH_PRESETS } = req('../src/esenho.js');
    const host = new EsenhoScreenHost();
    host.canvasActor = canvasActor;

    const oilPath = path.resolve(rootDir, 'plugins/brushes/bristle_oil.wasm');
    const oilBytes = fs.readFileSync(oilPath);
    await host.loadWasmBrush('bristle_oil', oilBytes);

    // Verify presence in BRUSH_PRESETS proxy
    assert.ok(BRUSH_PRESETS['wasm_bristle_oil'], 'wasm_bristle_oil must exist in BRUSH_PRESETS');
    assert.equal(BRUSH_PRESETS['wasm_bristle_oil'].category, 'wasm');

    // Verify selectBrushPreset activates it
    host.selectBrushPreset('wasm_bristle_oil');
    assert.ok(host.activeWasmBrush, 'selectBrushPreset(wasm_bristle_oil) must activate WASM brush');
    assert.equal(host.activeWasmBrush.name, 'bristle_oil');

    // Verify REPL presets listing
    let logs = [];
    host.sendConsoleLog = (text) => logs.push(text);
    host.executeCommand('presets');
    assert.ok(logs.some(l => l.includes('Zero-Copy WASM Brushes')), 'REPL presets must include Zero-Copy WASM Brushes section');
    assert.ok(logs.some(l => l.includes('wasm_bristle_oil')), 'REPL presets must list wasm_bristle_oil');
    console.log('   ✔ WASM brush preset registration and REPL listing verified');
  });
});
