/**
 * Test Suite for Custom Textures & Custom Brush Tip Shapes
 */

const assert = require('assert');
const EsenhoStore = require('../src/project_store.js');
const EsenhoBundle = require('../src/asset_bundle.js');
const QuadroSvgRenderer = require('../src/svg/quadro_svg_renderer.js');

async function testCustomTexturesAndTips() {
  console.log('--- Testing Custom Textures & Tip Shapes ---');

  // 1. EsenhoStore CRUD for Custom Textures
  const sampleTexData = {
    id: 'tex_wood_grain_custom',
    name: 'Custom Oak Wood',
    width: 64,
    height: 64,
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  await EsenhoStore.saveCustomTexture(sampleTexData.id, sampleTexData);
  const fetchedTex = await EsenhoStore.getCustomTexture('tex_wood_grain_custom');
  assert(fetchedTex, 'Should retrieve saved custom texture');
  assert.strictEqual(fetchedTex.name, 'Custom Oak Wood');

  const texList = await EsenhoStore.listCustomTextures();
  assert(texList.some(t => t.id === 'tex_wood_grain_custom'), 'Custom texture should be in listing');

  console.log('✔ Custom Texture Store CRUD passed');

  // 2. EsenhoStore CRUD for Custom Tip Shapes
  const sampleTipData = {
    id: 'tip_grunge_splat',
    name: 'Grunge Splat Dab',
    width: 32,
    height: 32,
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  await EsenhoStore.saveCustomTipShape(sampleTipData.id, sampleTipData);
  const fetchedTip = await EsenhoStore.getCustomTipShape('tip_grunge_splat');
  assert(fetchedTip, 'Should retrieve saved custom tip shape');
  assert.strictEqual(fetchedTip.name, 'Grunge Splat Dab');

  const tipList = await EsenhoStore.listCustomTipShapes();
  assert(tipList.some(t => t.id === 'tip_grunge_splat'), 'Custom tip shape should be in listing');

  console.log('✔ Custom Tip Shape Store CRUD passed');

  // 3. Asset Bundle Export & Import with Textures and Tip Shapes
  const bundleSvg = EsenhoBundle.createBundle({
    title: 'Custom Textures & Tip Shapes Pack',
    author: 'Jardel',
    textures: {
      tex_wood_grain_custom: sampleTexData
    },
    tipShapes: {
      tip_grunge_splat: sampleTipData
    }
  });

  assert(bundleSvg.includes('data-esenho-bundle="1.0"'), 'Bundle must have valid format attribute');
  assert(bundleSvg.includes('Custom Oak Wood'), 'Manifest must include texture name');
  assert(bundleSvg.includes('Grunge Splat Dab'), 'Manifest must include tip shape name');

  console.log('✔ Asset Bundle serialization with Textures and Tip Shapes passed');

  // Parse bundle
  const parsed = EsenhoBundle.parseBundle(bundleSvg);
  assert(parsed, 'Parsed bundle must not be null');
  assert.strictEqual(parsed.stats.textures, 1, 'Stats should show 1 texture');
  assert.strictEqual(parsed.stats.tipShapes, 1, 'Stats should show 1 tip shape');
  assert(parsed.textures['tex_wood_grain_custom'], 'Parsed textures map must contain custom texture');
  assert(parsed.tipShapes['tip_grunge_splat'], 'Parsed tipShapes map must contain custom tip shape');

  console.log('✔ Asset Bundle parsing for Textures and Tip Shapes passed');

  // Clear store and import
  await EsenhoStore.deleteCustomTexture('tex_wood_grain_custom');
  await EsenhoStore.deleteCustomTipShape('tip_grunge_splat');

  const importRes = await EsenhoBundle.importBundle(parsed, {
    textures: ['tex_wood_grain_custom'],
    tipShapes: ['tip_grunge_splat']
  });

  assert.strictEqual(importRes.textures, 1, 'Should import 1 texture');
  assert.strictEqual(importRes.tipShapes, 1, 'Should import 1 tip shape');

  const reloadedTex = await EsenhoStore.getCustomTexture('tex_wood_grain_custom');
  assert(reloadedTex, 'Imported texture must exist in store');

  const reloadedTip = await EsenhoStore.getCustomTipShape('tip_grunge_splat');
  assert(reloadedTip, 'Imported tip shape must exist in store');

  console.log('✔ Asset Bundle import for Textures and Tip Shapes passed');

  // 4. Quadro Custom Texture Sampling Test
  const mockWasmModule = {
    memory: { buffer: new ArrayBuffer(1024 * 1024) },
    w_brush_begin_stroke: () => {},
    w_brush_stroke_to: () => {},
    w_brush_end_stroke: () => {},
    w_brush_set_param: () => {},
    w_brush_set_color: () => {},
    w_layer_clear: () => {},
    w_layer_set_blend: () => {},
    w_layer_set_opacity: () => {},
    w_canvas_set_background: () => {},
    w_texture_create: () => 1,
    w_texture_get_pixels: () => 0
  };

  const renderer = new QuadroSvgRenderer(mockWasmModule);
  // Create a 4x4 test texture buffer (RGBA)
  const testPixels = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < testPixels.length; i += 4) {
    testPixels[i] = 128;     // R
    testPixels[i + 1] = 128; // G
    testPixels[i + 2] = 128; // B
    testPixels[i + 3] = 255; // A
  }
  renderer.registerCustomTexture('custom_tex_1', testPixels, 4, 4);

  const sampledAlpha = renderer.sampleCustomTexture(testPixels, 4, 4, 2, 2, 0, 100, 100, 255);
  assert(typeof sampledAlpha === 'number', 'Sampled alpha must be a number');
  assert(sampledAlpha >= 0 && sampledAlpha <= 255, 'Sampled alpha must be in valid byte range 0-255');

  console.log('✔ Quadro custom texture sampling passed');
  console.log('\nALL CUSTOM TEXTURE & TIP SHAPE TESTS PASSED!\n');
}

testCustomTexturesAndTips().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
