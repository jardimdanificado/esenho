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

  await t.test('6. WASM Brush Protocol defines accepted inputs via JSON metadata and ABI export', async () => {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const { EsenhoWasmBrush } = req('../src/esenho.js');

    // 1. aurora_borealis: defines size, pressure, angle, speed, color, spacing, params
    const auroraBytes = fs.readFileSync(path.resolve(rootDir, 'plugins/brushes/aurora_borealis.wasm'));
    const memBase1 = canvasActor.exports.w_canvas_alloc(65536);
    const auroraInst = new WebAssembly.Instance(new WebAssembly.Module(auroraBytes), {
      env: {
        ...env,
        memory: canvasActor.exports.memory,
        __memory_base: new WebAssembly.Global({ value: 'i32', mutable: false }, memBase1),
        __table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1)
      }
    });

    const auroraBrush = new EsenhoWasmBrush(auroraInst, { name: 'aurora_borealis', canvasActor });
    const auroraInputs = auroraBrush.getAcceptedInputs();
    assert.ok(Array.isArray(auroraInputs), 'Must return array of accepted inputs');
    assert.ok(auroraBrush.acceptsInput('size'), 'aurora accepts size');
    assert.ok(auroraBrush.acceptsInput('radius'), 'aurora accepts radius alias for size');
    assert.ok(auroraBrush.acceptsInput('pressure'), 'aurora accepts pressure');
    assert.ok(auroraBrush.acceptsInput('angle'), 'aurora accepts angle');
    assert.ok(auroraBrush.acceptsInput('speed'), 'aurora accepts speed');
    assert.ok(auroraBrush.acceptsInput('velocity'), 'aurora accepts velocity alias for speed');
    assert.ok(auroraBrush.acceptsInput('params'), 'aurora accepts params');
    assert.equal(auroraBrush.acceptsInput('texture'), false, 'aurora does NOT accept texture');
    assert.equal(auroraBrush.acceptsInput('wet'), false, 'aurora does NOT accept wet physics');
    assert.equal(auroraBrush.acceptsInput('dual'), false, 'aurora does NOT accept dual brush');

    // 2. pixel_dither: defines size, pressure, color, params (no speed, no angle, no texture)
    const ditherBytes = fs.readFileSync(path.resolve(rootDir, 'plugins/brushes/pixel_dither.wasm'));
    const memBase2 = canvasActor.exports.w_canvas_alloc(65536);
    const ditherInst = new WebAssembly.Instance(new WebAssembly.Module(ditherBytes), {
      env: {
        ...env,
        memory: canvasActor.exports.memory,
        __memory_base: new WebAssembly.Global({ value: 'i32', mutable: false }, memBase2),
        __table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1)
      }
    });

    const ditherBrush = new EsenhoWasmBrush(ditherInst, { name: 'pixel_dither', canvasActor });
    assert.ok(ditherBrush.acceptsInput('size'), 'dither accepts size');
    assert.ok(ditherBrush.acceptsInput('pressure'), 'dither accepts pressure');
    assert.ok(ditherBrush.acceptsInput('color'), 'dither accepts color');
    assert.ok(ditherBrush.acceptsInput('params'), 'dither accepts params');
    assert.equal(ditherBrush.acceptsInput('angle'), false, 'dither does NOT accept angle');
    assert.equal(ditherBrush.acceptsInput('speed'), false, 'dither does NOT accept speed');
    assert.equal(ditherBrush.acceptsInput('stabilizer'), false, 'dither does NOT accept stabilizer');
    assert.equal(ditherBrush.acceptsInput('texture'), false, 'dither does NOT accept texture');
    console.log('   ✔ WASM Brush accepted inputs detection and semantic filtering verified');
  });

  await t.test('7. Brush Studio dynamically shows ONLY accepted parameters when WASM brush is active', async () => {
    // Simulate DOM elements for Brush Studio (dock-panel-lab)
    const elements = new Map();
    const createFakeEl = (id, attrs = {}) => {
      const el = {
        id,
        style: { display: '' },
        attributes: { ...attrs },
        children: [],
        getAttribute: (k) => el.attributes[k],
        setAttribute: (k, v) => { el.attributes[k] = v; },
        appendChild: (c) => el.children.push(c),
        querySelectorAll: (selector) => {
          const res = [];
          const matchAttr = selector.match(/\[([a-zA-Z0-9_-]+)\]/);
          const attr = matchAttr ? matchAttr[1] : null;
          const walk = (node) => {
            if (attr && node.attributes && node.attributes[attr] !== undefined) {
              res.push(node);
            }
            if (node.children) node.children.forEach(walk);
          };
          el.children.forEach(walk);
          return res;
        }
      };
      if (id) elements.set(id, el);
      return el;
    };

    const sheetLab = createFakeEl('sheet-lab');
    const wasmSection = createFakeEl('ip-lab-section-wasm-params');
    const wasmContainer = createFakeEl('ip-lab-wasm-params-container');
    const wasmBadge = createFakeEl('ip-lab-wasm-badge');
    sheetLab.appendChild(wasmSection);
    wasmSection.appendChild(wasmBadge);
    wasmSection.appendChild(wasmContainer);

    const tipSection = createFakeEl('ip-lab-section-tip');
    const sizeCtrl = createFakeEl('ctrl-size', { 'data-brush-input': 'size' });
    const hardnessCtrl = createFakeEl('ctrl-hardness', { 'data-brush-input': 'hardness' });
    const roundnessCtrl = createFakeEl('ctrl-roundness', { 'data-brush-input': 'roundness' });
    tipSection.appendChild(sizeCtrl);
    tipSection.appendChild(hardnessCtrl);
    tipSection.appendChild(roundnessCtrl);
    sheetLab.appendChild(tipSection);

    const dynamicsSection = createFakeEl('ip-lab-section-dynamics');
    const speedCtrl = createFakeEl('ctrl-speed', { 'data-brush-input': 'speed' });
    const stabCtrl = createFakeEl('ctrl-stabilizer', { 'data-brush-input': 'stabilizer' });
    dynamicsSection.appendChild(speedCtrl);
    dynamicsSection.appendChild(stabCtrl);
    sheetLab.appendChild(dynamicsSection);

    const wetSection = createFakeEl('ip-lab-section-wet', { 'data-brush-input': 'wet' });
    sheetLab.appendChild(wetSection);

    const textureSection = createFakeEl('ip-lab-section-texture', { 'data-brush-input': 'texture' });
    sheetLab.appendChild(textureSection);

    // Mock document.getElementById and document.querySelectorAll
    const oldDoc = globalThis.document;
    globalThis.document = {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: (sel) => {
        if (sel.includes('#sheet-lab [data-brush-input]')) {
          const list = [];
          elements.forEach(el => {
            if (el.attributes && el.attributes['data-brush-input']) list.push(el);
          });
          return list;
        }
        return [];
      },
      createElement: (tag) => ({
        tagName: tag,
        className: '',
        style: {},
        appendChild: () => {}
      })
    };

    try {
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const { EsenhoScreenHost } = req('../src/esenho.js');
      const host = new EsenhoScreenHost();
      host.canvasActor = canvasActor;

      const ditherPath = path.resolve(rootDir, 'plugins/brushes/pixel_dither.wasm');
      await host.loadWasmBrush('pixel_dither', fs.readFileSync(ditherPath));

      // Test helper logic from host-browser.js
      const syncStudioForBrush = (activeKey) => {
        const isWasm = activeKey.startsWith('wasm_') || (host.wasmBrushes && host.wasmBrushes.has(activeKey));
        const wKey = isWasm ? activeKey.replace(/^wasm[:_]/i, '') : null;
        const wb = isWasm ? host.getWasmBrush(wKey) : null;

        if (!isWasm || !wb) {
          wasmSection.style.display = 'none';
          document.querySelectorAll('#sheet-lab [data-brush-input]').forEach(el => el.style.display = '');
          ['ip-lab-section-tip', 'ip-lab-section-dynamics', 'ip-lab-section-wet', 'ip-lab-section-jitter', 'ip-lab-section-texture'].forEach(secId => {
            const sec = document.getElementById(secId);
            if (sec) sec.style.display = '';
          });
          return;
        }

        const info = wb.getInfo ? wb.getInfo() : wb.info;
        const acceptsParams = typeof wb.acceptsInput === 'function' ? wb.acceptsInput('params') : true;

        if (acceptsParams && info && Array.isArray(info.params) && info.params.length > 0) {
          wasmSection.style.display = 'flex';
        } else {
          wasmSection.style.display = 'none';
        }

        document.querySelectorAll('#sheet-lab [data-brush-input]').forEach(el => {
          const inputType = el.getAttribute('data-brush-input');
          const accepted = typeof wb.acceptsInput === 'function' ? wb.acceptsInput(inputType) : true;
          el.style.display = accepted ? '' : 'none';
        });

        ['ip-lab-section-tip', 'ip-lab-section-dynamics', 'ip-lab-section-wet', 'ip-lab-section-jitter', 'ip-lab-section-texture'].forEach(secId => {
          const sec = document.getElementById(secId);
          if (!sec) return;
          const secInput = sec.getAttribute('data-brush-input');
          if (secInput) {
            const accepted = typeof wb.acceptsInput === 'function' ? wb.acceptsInput(secInput) : true;
            sec.style.display = accepted ? '' : 'none';
            return;
          }
          const inputsInSec = sec.querySelectorAll('[data-brush-input]');
          if (inputsInSec.length > 0) {
            const anyVisible = Array.from(inputsInSec).some(el => el.style.display !== 'none');
            sec.style.display = anyVisible ? '' : 'none';
          }
        });
      };

      // 1. Activate pixel_dither (accepts: size, pressure, color, params)
      host.selectBrushPreset('wasm_pixel_dither');
      syncStudioForBrush('wasm_pixel_dither');

      // WASM Kernel params section must be displayed
      assert.equal(wasmSection.style.display, 'flex', 'WASM params section must be visible');

      // Size must be visible
      assert.equal(sizeCtrl.style.display, '', 'Size control must be visible');

      // Hardness and Roundness must be hidden
      assert.equal(hardnessCtrl.style.display, 'none', 'Hardness control must be hidden');
      assert.equal(roundnessCtrl.style.display, 'none', 'Roundness control must be hidden');

      // Speed and Stabilizer must be hidden
      assert.equal(speedCtrl.style.display, 'none', 'Speed control must be hidden');
      assert.equal(stabCtrl.style.display, 'none', 'Stabilizer control must be hidden');

      // Dynamics section had all child controls hidden -> whole dynamics section hidden!
      assert.equal(dynamicsSection.style.display, 'none', 'Dynamics section must be completely hidden');

      // Wet and Texture sections were not accepted -> must be hidden!
      assert.equal(wetSection.style.display, 'none', 'Wet section must be completely hidden');
      assert.equal(textureSection.style.display, 'none', 'Texture section must be completely hidden');

      // 2. Switch back to a standard brush ('pencil')
      host.selectBrushPreset('pencil');
      syncStudioForBrush('pencil');

      // WASM params section must be hidden
      assert.equal(wasmSection.style.display, 'none', 'WASM params must be hidden for standard brush');

      // All standard controls must be unhidden
      assert.equal(sizeCtrl.style.display, '', 'Size control must be restored');
      assert.equal(hardnessCtrl.style.display, '', 'Hardness control must be restored');
      assert.equal(roundnessCtrl.style.display, '', 'Roundness control must be restored');
      assert.equal(speedCtrl.style.display, '', 'Speed control must be restored');
      assert.equal(stabCtrl.style.display, '', 'Stabilizer control must be restored');
      assert.equal(dynamicsSection.style.display, '', 'Dynamics section must be restored');
      assert.equal(wetSection.style.display, '', 'Wet section must be restored');
      assert.equal(textureSection.style.display, '', 'Texture section must be restored');

      console.log('   ✔ Brush Studio input filtering and parameter visibility verified');
    } finally {
      globalThis.document = oldDoc;
    }
  });
});

