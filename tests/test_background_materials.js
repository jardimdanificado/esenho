/**
 * Test Background Materials in Quadro SVG Renderer & Material Studio
 * Tests Solid Colors, Multi-Stop Gradients, Procedural & Custom Textures,
 * Procedural Brush Fills, and WASM FX Filters on Document Background.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { EsenhoModule } = require('../src/esenho.js');
const SvgEngine = require('../src/svg/svg_engine.js');
const BrushFillEngine = require('../src/brush_fill_engine.js');
const QuadroSvgRenderer = require('../src/svg/quadro_svg_renderer.js');
const MaterialStudio = require('../src/color_studio.js');

async function runBackgroundMaterialTests() {
  console.log('--- Testing Comprehensive Background Materials Engine ---');

  // 1. Initialize Quadro Actor & Renderer
  const wasmPath = path.resolve(__dirname, '../plugins/canvas.wasm');
  let actor = null;
  if (fs.existsSync(wasmPath)) {
    actor = new EsenhoModule(wasmPath);
  } else {
    console.warn('plugins/canvas.wasm not found, skipping low-level WASM rasterization assertions');
  }

  const renderer = new QuadroSvgRenderer(actor);

  // 2. Test Solid Background
  console.log('1. Testing Solid Color Background rasterization...');
  const doc = new SvgEngine.SvgDocument(100, 100);
  doc.backgroundColor = '#282828';
  
  if (actor) {
    renderer.renderDocument(doc);
    const pixPtr = actor.exports.w_layer_get_pixels(3);
    const u32 = new Uint32Array(actor.memory.buffer, pixPtr, 100 * 100);
    // 0xFF282828 in ARGB
    const sample = u32[50 * 100 + 50];
    const a = (sample >>> 24) & 0xFF;
    const r = sample & 0xFF;
    const g = (sample >> 8) & 0xFF;
    const b = (sample >> 16) & 0xFF;
    assert.strictEqual(a, 255, 'Background alpha must be 255');
    assert.strictEqual(r, 0x28, 'Background Red channel matches');
    assert.strictEqual(g, 0x28, 'Background Green channel matches');
    assert.strictEqual(b, 0x28, 'Background Blue channel matches');
  }
  console.log('✔ Solid Color Background verified');

  // 3. Test Linear Gradient Background
  console.log('2. Testing Linear Gradient Background rasterization...');
  doc.backgroundType = 'linear';
  doc.backgroundGradient = {
    type: 'linear',
    stops: [
      { offset: 0, color: '#ff0000', opacity: 1.0 },
      { offset: 1, color: '#0000ff', opacity: 1.0 }
    ],
    x1: '0%', y1: '0%', x2: '100%', y2: '0%'
  };

  if (actor) {
    renderer.renderDocument(doc);
    const pixPtr = actor.exports.w_layer_get_pixels(3);
    const u32 = new Uint32Array(actor.memory.buffer, pixPtr, 100 * 100);
    const leftPixel = u32[50 * 100 + 2]; // Near left: should be mostly Red
    const rightPixel = u32[50 * 100 + 98]; // Near right: should be mostly Blue
    const leftR = leftPixel & 0xFF;
    const leftB = (leftPixel >> 16) & 0xFF;
    const rightR = rightPixel & 0xFF;
    const rightB = (rightPixel >> 16) & 0xFF;
    assert.ok(leftR > 200, `Left pixel red channel (${leftR}) should be high`);
    assert.ok(leftB < 50, `Left pixel blue channel (${leftB}) should be low`);
    assert.ok(rightB > 200, `Right pixel blue channel (${rightB}) should be high`);
    assert.ok(rightR < 50, `Right pixel red channel (${rightR}) should be low`);
  }
  console.log('✔ Linear Gradient Background verified');

  // 4. Test Procedural Texture Background
  console.log('3. Testing Procedural Texture Background rasterization...');
  doc.backgroundType = 'solid';
  doc.backgroundColor = '#ffffff';
  doc.backgroundTexture = {
    enabled: true,
    mode: 5, // Grid texture
    scale: 100,
    contrast: 150
  };

  if (actor) {
    renderer.renderDocument(doc);
    const pixPtr = actor.exports.w_layer_get_pixels(3);
    const u32 = new Uint32Array(actor.memory.buffer, pixPtr, 100 * 100);
    // Check that grid texture created non-uniform alpha variations along row 50
    let hasVariation = false;
    const firstA = (u32[50 * 100 + 10] >>> 24) & 0xFF;
    for (let x = 11; x < 90; x++) {
      const curA = (u32[50 * 100 + x] >>> 24) & 0xFF;
      if (curA !== firstA) {
        hasVariation = true;
        break;
      }
    }
    assert.ok(hasVariation, 'Procedural texture should create alpha modulation on background');
  }
  console.log('✔ Procedural Texture Background verified');

  // 5. Test Custom Texture on Background
  console.log('4. Testing Custom Texture on Background...');
  const customTexId = 'test_custom_bg_pattern';
  const customPixels = new Uint32Array(16 * 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const val = (x + y) % 2 === 0 ? 0xFFFFFFFF : 0xFF202020;
      customPixels[y * 16 + x] = val;
    }
  }
  renderer.registerCustomTexture(customTexId, customPixels, 16, 16);

  doc.backgroundTexture = {
    enabled: true,
    customId: customTexId,
    scale: 100,
    contrast: 100
  };

  if (actor) {
    renderer.renderDocument(doc);
    const pixPtr = actor.exports.w_layer_get_pixels(3);
    const u32 = new Uint32Array(actor.memory.buffer, pixPtr, 100 * 100);
    const p0 = (u32[0] >>> 24) & 0xFF;
    const p1 = (u32[1] >>> 24) & 0xFF;
    assert.ok(p0 !== p1, 'Custom texture pattern should modulate background pixels');
  }
  console.log('✔ Custom Texture on Background verified');

  // 6. Test Procedural Brush Fill on Background
  console.log('5. Testing Procedural Brush Fill on Background...');
  doc.backgroundTexture = null;
  doc.backgroundType = 'brush';
  doc.backgroundBrushFill = {
    enabled: true,
    style: 'hatch',
    spacing: 10,
    angle: 45,
    color: '#fabd2f',
    width: 2
  };

  if (actor) {
    renderer.renderDocument(doc);
    const pixPtr = actor.exports.w_layer_get_pixels(3);
    const u32 = new Uint32Array(actor.memory.buffer, pixPtr, 100 * 100);
    let strokedCount = 0;
    for (let i = 0; i < 100 * 100; i++) {
      if ((u32[i] >>> 24) > 0) strokedCount++;
    }
    assert.ok(strokedCount > 0, 'Brush fill should generate strokes on background');
  }
  console.log('✔ Procedural Brush Fill on Background verified');

  // 7. Test WASM FX Filter on Background
  console.log('6. Testing WASM FX Filter on Background...');
  doc.backgroundType = 'solid';
  doc.backgroundColor = '#fe8019';
  doc.backgroundBrushFill = null;
  doc.backgroundFilter = {
    enabled: true,
    plugin: 'invert',
    p1: 100,
    p2: 0,
    opacity: 1.0
  };

  // Preload invert.wasm into SvgEngine for testing
  const invertWasmPath = path.resolve(__dirname, '../plugins/invert.wasm');
  if (fs.existsSync(invertWasmPath)) {
    const invertBytes = fs.readFileSync(invertWasmPath);
    doc.wasmPlugins.set('invert', invertBytes);
  }

  if (actor) {
    renderer.renderDocument(doc);
    const pixPtr = actor.exports.w_layer_get_pixels(3);
    const u32 = new Uint32Array(actor.memory.buffer, pixPtr, 100 * 100);
    const sample = u32[50 * 100 + 50];
    const r = sample & 0xFF;
    const g = (sample >> 8) & 0xFF;
    const b = (sample >> 16) & 0xFF;
    // Original #fe8019: r=254, g=128, b=25
    // Inverted: r ~ 1, g ~ 127, b ~ 230
    assert.ok(r < 50, `Inverted red channel (${r}) should be low`);
    assert.ok(b > 200, `Inverted blue channel (${b}) should be high`);
  }
  console.log('✔ WASM FX Filter on Background verified');

  // 8. Test JSON Serialization, Deserialization, Undo/Redo
  console.log('7. Testing Background Material serialization and History...');
  const json = doc.toJSON();
  assert.strictEqual(json.backgroundColor, '#fe8019');
  assert.strictEqual(json.backgroundFilter.plugin, 'invert');

  const restoredDoc = new SvgEngine.SvgDocument();
  restoredDoc.fromJSON(json);
  assert.strictEqual(restoredDoc.backgroundColor, '#fe8019');
  assert.strictEqual(restoredDoc.backgroundFilter.plugin, 'invert');

  // Test pushHistory & undo
  doc.pushHistory('Apply Background Filter');
  doc.backgroundColor = '#00ff00';
  doc.backgroundFilter = null;
  assert.strictEqual(doc.backgroundColor, '#00ff00');
  assert.strictEqual(doc.backgroundFilter, null);

  doc.undo();
  assert.strictEqual(doc.backgroundColor, '#fe8019', 'Undo must restore previous background color');
  assert.strictEqual(doc.backgroundFilter.plugin, 'invert', 'Undo must restore background WASM filter');
  console.log('✔ Background Material persistence and Undo/Redo verified');

  // 9. Test toSVGString export with Background Material attributes & defs
  console.log('8. Testing SVG export with Background Materials...');
  const svgXml = doc.toSVGString();
  assert.ok(svgXml.includes('<rect id="doc_background"'), 'SVG export must include background rect');
  assert.ok(svgXml.includes('data-wasm-plugin="invert"'), 'SVG export must include data-wasm-plugin attribute');
  assert.ok(svgXml.includes('wasm-plugin-invert'), 'SVG export must embed WASM plugin in defs');
  console.log('✔ SVG export with Background Materials verified');

  console.log('--- ALL BACKGROUND MATERIAL TESTS PASSED ---');
}

runBackgroundMaterialTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
