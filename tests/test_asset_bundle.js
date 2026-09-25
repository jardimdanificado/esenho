/**
 * Test Suite for Esenho SVG Asset Bundle (.bundle.svg)
 */

const assert = require('assert');
const EsenhoStore = require('../src/project_store.js');
const EsenhoBundle = require('../src/asset_bundle.js');

async function testAssetBundle() {
  console.log('--- Testing SVG Asset Bundle Engine ---');

  // 1. Create a bundle with custom brushes, WASM plugin, project, palette
  const dummyWasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const bundleSvg = EsenhoBundle.createBundle({
    title: 'Test Master Pack',
    author: 'Jardel',
    brushes: {
      custom_oil: { name: 'Custom Impasto Oil', hardness: 80, flow: 95, spacing: 4 },
      custom_pencil: { name: '2B Organic Pencil', hardness: 50, flow: 70, grain: 40 }
    },
    plugins: [
      { name: 'solarize', bytes: dummyWasmBytes }
    ],
    projects: [
      { id: 'proj_vec_01', name: 'Logo Vector', width: 800, height: 600, type: 'vector', layers: [] }
    ],
    palettes: {
      cyberpunk: ['#ff0055', '#00ffee', '#ffe600']
    }
  });

  assert(typeof bundleSvg === 'string', 'Bundle output should be string');
  assert(bundleSvg.includes('<svg'), 'Bundle must start with valid SVG');
  assert(bundleSvg.includes('data-esenho-bundle="1.0"'), 'Bundle must have esenho bundle attribute');
  assert(bundleSvg.includes('<esenho-manifest>'), 'Bundle must contain metadata manifest');
  assert(bundleSvg.includes('data-plugin-name="solarize"'), 'Bundle must embed WASM plugin in defs');

  console.log('✔ Bundle SVG generation passed');

  // 2. Parse bundle
  const parsed = EsenhoBundle.parseBundle(bundleSvg);
  assert(parsed, 'Parsed bundle must not be null');
  assert.strictEqual(parsed.title, 'Test Master Pack');
  assert.strictEqual(parsed.author, 'Jardel');
  assert.strictEqual(parsed.stats.brushes, 2);
  assert.strictEqual(parsed.stats.plugins, 1);
  assert.strictEqual(parsed.stats.projects, 1);
  assert.strictEqual(parsed.stats.palettes, 1);
  assert.strictEqual(parsed.plugins.length, 1);
  assert.strictEqual(parsed.plugins[0].name, 'solarize');
  assert.strictEqual(parsed.plugins[0].bytes.length, dummyWasmBytes.length);

  console.log('✔ Bundle parsing & WASM binary extraction passed');

  // 3. Import bundle into EsenhoStore
  const importResults = await EsenhoBundle.importBundle(parsed, {
    brushes: ['custom_oil'],
    plugins: ['solarize'],
    projects: true,
    palettes: true
  });

  assert.strictEqual(importResults.brushes, 1, 'Should import 1 brush');
  assert.strictEqual(importResults.plugins, 1, 'Should import 1 plugin');

  const customBrushes = EsenhoStore.getCustomBrushPresets();
  assert(customBrushes['custom_impasto_oil'], 'Imported brush preset must exist in store');

  const allPlugins = await EsenhoStore.getAllPlugins();
  assert(allPlugins.some(p => p.name === 'solarize'), 'Imported WASM plugin must exist in store');

  console.log('✔ Selective bundle import into storage passed');
  console.log('\nALL ASSET BUNDLE TESTS PASSED SUCCESSFULLY!\n');
}

testAssetBundle().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
