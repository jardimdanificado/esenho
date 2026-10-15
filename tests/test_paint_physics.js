const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { EsenhoScreenHost, EsenhoModule, PARAM_IDS, BRUSH_PRESETS } = require('../src/esenho.js');

test('Paint Physics & Watercolor System Suite', async (t) => {
  const canvasWasmPath = path.join(__dirname, '../plugins/canvas.wasm');
  assert.ok(fs.existsSync(canvasWasmPath), 'plugins/canvas.wasm must exist');

  const host = new EsenhoScreenHost();
  host.canvasActor = new EsenhoModule(canvasWasmPath, { name: 'canvas' });
  host.canvasActor.exports.w_init(128, 128);
  host.syncBrushParams(host.canvasActor);

  await t.test('1. Parameter IDs and mapping', () => {
    assert.strictEqual(PARAM_IDS.water, 50);
    assert.strictEqual(PARAM_IDS.bleed, 51);
    assert.strictEqual(PARAM_IDS.granulation, 52);
    assert.strictEqual(PARAM_IDS.fringe, 53);
    assert.strictEqual(PARAM_IDS.pigment_mode, 54);
    assert.strictEqual(PARAM_IDS.impasto, 55);
    assert.strictEqual(PARAM_IDS.drying_rate, 56);

    host.setBrushParam('water', 75);
    assert.strictEqual(host.brushParams.water, 75);

    host.setBrushParam('bleed', 80);
    assert.strictEqual(host.brushParams.bleed, 80);

    host.setBrushParam('granulation', 60);
    assert.strictEqual(host.brushParams.granulation, 60);

    host.setBrushParam('fringe', 50);
    assert.strictEqual(host.brushParams.fringe, 50);

    host.setBrushParam('impasto', 90);
    assert.strictEqual(host.brushParams.impasto, 90);

    host.setBrushParam('pigment_mode', 'subtractive');
    assert.strictEqual(host.brushParams.pigment_mode, 1);

    host.setBrushParam('drying_rate', 25);
    assert.strictEqual(host.brushParams.drying_rate, 25);
  });

  await t.test('2. Water map deposition and dryLayer()', () => {
    host.resetTool();
    host.setBrushParam('water', 90);
    host.setBrushParam('size', 20);
    host.setBrushParam('opacity', 100);

    // Initial water map should be accessible
    const initialWaterMap = host.getWaterMap();
    assert.ok(initialWaterMap, 'Water map should be accessible');

    // Draw a stroke: state 0 (start), state 1 (move), state 2 (end)
    host.sendStroke(64, 64, 64, 64, 0, false, 0xFF0000FF, 1.0);
    host.sendStroke(64, 64, 64, 64, 1, false, 0xFF0000FF, 1.0);
    host.sendStroke(64, 64, 64, 64, 2, false, 0xFF0000FF, 1.0);

    const waterMapAfter = host.getWaterMap();
    let totalWater = 0;
    for (let i = 0; i < waterMapAfter.length; i++) {
      totalWater += waterMapAfter[i];
    }
    assert.ok(totalWater > 0, `Expected water to be deposited on canvas, got ${totalWater}`);

    // Dry the layer
    host.dryLayer();
    const waterMapDried = host.getWaterMap();
    let remainingWater = 0;
    for (let i = 0; i < waterMapDried.length; i++) {
      remainingWater += waterMapDried[i];
    }
    assert.strictEqual(remainingWater, 0, 'dryLayer() must completely clear surface water');
  });

  await t.test('3. Subtractive pigment mixing: Yellow + Blue = Green', () => {
    // In subtractive mode, Yellow (R=255, G=255, B=0) + Blue (R=0, G=0, B=255) mixes into Green
    host.resetTool();
    host.setBrushParam('size', 16);
    host.setBrushParam('opacity', 100);
    host.setBrushParam('pigment_mode', 1); // subtractive mode

    // 0xAABBGGRR: Yellow is 0xFF00FFFF (R=255, G=255, B=0, A=255)
    host.currentColor = 0xFF00FFFF;
    host.sendStroke(30, 30, 30, 30, 0, false, 0xFF00FFFF, 1.0);
    host.sendStroke(30, 30, 30, 30, 2, false, 0xFF00FFFF, 1.0);

    const pixPtr = host.canvasActor.exports.get_layer_pixels(3);
    const pix = new Uint32Array(host.canvasActor.memory.buffer, pixPtr, 128 * 128);
    const centerPix = pix[30 * 128 + 30];
    const r = centerPix & 0xFF;
    const g = (centerPix >> 8) & 0xFF;
    const b = (centerPix >> 16) & 0xFF;
    assert.ok(r > 200, `Red component should be high for yellow, got ${r}`);
    assert.ok(g > 200, `Green component should be high for yellow, got ${g}`);
  });

  await t.test('4. 3D Impasto Height Map & Shading', () => {
    host.resetTool();
    host.setBrushParam('size', 24);
    host.setBrushParam('opacity', 100);
    host.setBrushParam('impasto', 90);

    host.currentColor = 0xFF2255DD; // Orange paint
    host.sendStroke(64, 64, 64, 64, 0, false, 0xFF2255DD, 1.0);
    host.sendStroke(64, 64, 64, 64, 1, false, 0xFF2255DD, 1.0);
    host.sendStroke(64, 64, 64, 64, 2, false, 0xFF2255DD, 1.0);

    const heightMap = host.getHeightMap();
    assert.ok(heightMap, 'Height map must be accessible');
    let totalHeight = 0;
    for (let i = 0; i < heightMap.length; i++) {
      totalHeight += heightMap[i];
    }
    assert.ok(totalHeight > 0, `Impasto must accumulate 3D paint relief height, got ${totalHeight}`);
  });

  await t.test('5. Water diffusion step', () => {
    host.resetTool();
    host.setBrushParam('water', 100);
    host.setBrushParam('size', 16);
    host.setBrushParam('drying_rate', 10);

    host.sendStroke(50, 50, 50, 50, 0, false, 0xFF0000FF, 1.0);
    host.sendStroke(50, 50, 50, 50, 2, false, 0xFF0000FF, 1.0);

    const wMap = host.getWaterMap();
    const waterBefore = wMap[50 * 128 + 50];
    assert.ok(waterBefore > 0, 'Water should be deposited');

    // Step water diffusion
    host.stepWaterDiffusion(3);
    const waterAfter = wMap[50 * 128 + 50];
    assert.ok(waterAfter <= waterBefore, 'Water at center should diffuse/evaporate');
  });

  await t.test('6. REPL Command execution for dry and diffusion', () => {
    host.resetTool();
    host.setBrushParam('water', 90);
    host.sendStroke(60, 60, 60, 60, 0, false, 0xFF0000FF, 1.0);
    host.sendStroke(60, 60, 60, 60, 2, false, 0xFF0000FF, 1.0);

    let wMap = host.getWaterMap();
    assert.ok(wMap[60 * 128 + 60] > 0, 'Water must be present before drying');

    host.executeCommand('dry layer');
    wMap = host.getWaterMap();
    assert.strictEqual(wMap[60 * 128 + 60], 0, 'REPL "dry layer" must dry surface water');
  });

  await t.test('7. Preset verification', () => {
    assert.ok(BRUSH_PRESETS.watercolor, 'watercolor preset should exist');
    assert.ok(BRUSH_PRESETS.wet_on_wet_bloom, 'wet_on_wet_bloom preset should exist');
    assert.ok(BRUSH_PRESETS.oil_impasto, 'oil_impasto preset should exist');
    assert.ok(BRUSH_PRESETS.clear_water_wash, 'clear_water_wash preset should exist');

    host.selectBrushPreset('watercolor');
    assert.strictEqual(host.brushParams.water, 75);
    assert.strictEqual(host.brushParams.bleed, 70);
    assert.strictEqual(host.brushParams.fringe, 60);
    assert.strictEqual(host.brushParams.granulation, 45);
    assert.strictEqual(host.brushParams.pigment_mode, 1);

    host.selectBrushPreset('oil_impasto');
    assert.strictEqual(host.brushParams.impasto, 85);
    assert.strictEqual(host.brushParams.pigment_mode, 1);
  });
});
