const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function testOfficialLibMyPaint() {
  console.log('\n=== 1. Testing Official Upstream libmypaint (v1.6.1 C WASM) ===');
  const wasmPath = path.join(__dirname, '../plugins/libmypaint.wasm');
  assert(fs.existsSync(wasmPath), 'plugins/libmypaint.wasm must exist');

  const { MyPaintEngine, MYPAINT_PRESETS } = await import('../src/mypaint_bridge.js');
  const engine = new MyPaintEngine();
  await engine.init(wasmPath);
  assert(engine.isOfficial, 'Engine should be identified as official libmypaint');

  const brush = engine.createBrush();
  assert(brush, 'Should create official MyPaintBrush instance');

  // Test loading raw JSON with mypaint_brush_from_string
  const sampleJson = JSON.stringify(MYPAINT_PRESETS.classic_pencil);
  engine.loadBrushData(brush, sampleJson);

  console.log('  -> radius_log base_value:', engine.module._w_libmypaint_brush_get_base_value(brush, 3));
  console.log('  -> opaque base_value:', engine.module._w_libmypaint_brush_get_base_value(brush, 0));
  console.log('  -> hardness base_value:', engine.module._w_libmypaint_brush_get_base_value(brush, 4));

  const width = 200;
  const height = 200;
  const pixelCount = width * height;
  const pixelOffset = engine.alloc(pixelCount * 4);

  new Uint32Array(engine.module.HEAPU8.buffer, pixelOffset, pixelCount).fill(0);

  // Stroke with official libmypaint
  // First point (start stroke)
  const res1 = engine.strokeTo(brush, pixelOffset, width, height, 40, 40, 0.8, 0, 0, 0.016);
  // Intermediate points
  const res2 = engine.strokeTo(brush, pixelOffset, width, height, 80, 40, 0.8, 0, 0, 0.016);
  const res3 = engine.strokeTo(brush, pixelOffset, width, height, 120, 40, 0.8, 0, 0, 0.016);
  const res4 = engine.strokeTo(brush, pixelOffset, width, height, 160, 40, 0.8, 0, 0, 0.016);

  const totalDabs = res1.dabsDrawn + res2.dabsDrawn + res3.dabsDrawn + res4.dabsDrawn;
  console.log(`  -> Official libmypaint stroke result: dabs=${totalDabs} (res1=${res1.dabsDrawn}, res2=${res2.dabsDrawn}, res3=${res3.dabsDrawn}, res4=${res4.dabsDrawn})`);
  console.log(`  -> DirtyRect:`, res4.dirtyRect);
  assert(totalDabs > 0, 'Official engine should draw dabs');

  const mem32 = new Uint32Array(engine.module.HEAPU8.buffer, pixelOffset, pixelCount);
  let written = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (mem32[i] !== 0) written++;
  }
  console.log(`  -> Modified pixels on surface: ${written}`);
  assert(written > 50, 'Pixels should be painted on Wesenho surface');

  engine.freeBrush(brush);
  console.log('✔ Official Upstream libmypaint test passed!');
}

async function testAllPresets() {
  console.log('\n=== 2. Testing All Built-in Presets with Official libmypaint ===');
  const wasmPath = path.join(__dirname, '../plugins/libmypaint.wasm');
  const { MyPaintEngine, MYPAINT_PRESETS } = await import('../src/mypaint_bridge.js');
  const engine = new MyPaintEngine();
  await engine.init(wasmPath);

  const presets = Object.keys(MYPAINT_PRESETS);
  const width = 120;
  const height = 120;
  const pixelCount = width * height;
  const pixelOffset = engine.alloc(pixelCount * 4);

  for (const presetKey of presets) {
    const brush = engine.createBrush();
    engine.loadPreset(brush, presetKey);

    const mem32 = new Uint32Array(engine.module.HEAPU8.buffer, pixelOffset, pixelCount);
    mem32.fill(0);

    // If testing blender / smudge brush, pre-fill center rectangle with paint
    if (presetKey === 'wet_oil_blender' || presetKey === 'watercolor_wash') {
      for (let y = 10; y < 50; y++) {
        for (let x = 10; x < 50; x++) {
          mem32[y * width + x] = 0xFF0000FF; // Red square
        }
      }
    }

    const initialPainted = mem32.reduce((acc, v) => acc + (v !== 0 ? 1 : 0), 0);

    // Initial anchor stroke
    engine.strokeTo(brush, pixelOffset, width, height, 20, 20, 0.7, 0, 0, 0.016);
    // Draw stroke across surface
    const res = engine.strokeTo(brush, pixelOffset, width, height, 100, 100, 0.9, 0, 0, 0.032);

    console.log(`  -> Preset [${presetKey}] ("${MYPAINT_PRESETS[presetKey].name}"): dabs=${res.dabsDrawn}, dirtyRect=`, res.dirtyRect);
    assert(res.dabsDrawn > 0, `Preset ${presetKey} should render dabs`);

    let finalPainted = 0;
    for (let i = 0; i < pixelCount; i++) {
      if (mem32[i] !== 0) finalPainted++;
    }
    console.log(`     Total painted pixels on surface: ${finalPainted} (initial=${initialPainted})`);
    assert(finalPainted > 0, `Preset ${presetKey} should have painted pixels`);

    engine.freeBrush(brush);
  }

  engine.free(pixelOffset);
  console.log('✔ All official libmypaint presets tested successfully!');
}

async function testOfficialMybFiles() {
  console.log('\n=== 3. Testing Real Official .myb Files from mypaint-brushes ===');
  const wasmPath = path.join(__dirname, '../plugins/libmypaint.wasm');
  const { MyPaintEngine } = await import('../src/mypaint_bridge.js');
  const engine = new MyPaintEngine();
  await engine.init(wasmPath);

  const sampleFiles = [
    'brushes/mypaint-brushes/brushes/deevad/4H_pencil.myb',
    'brushes/mypaint-brushes/brushes/deevad/airbrush.myb',
    'brushes/mypaint-brushes/brushes/classic/brush.myb',
    'brushes/mypaint-brushes/brushes/classic/ink_blot.myb',
    'brushes/mypaint-brushes/brushes/ramon/2B_pencil.myb',
    'brushes/mypaint-brushes/brushes/tanda/charcoal-01.myb',
    'brushes/mypaint-brushes/brushes/kaerhon_v1/classic_sk.myb'
  ];

  const width = 100;
  const height = 100;
  const pixelCount = width * height;
  const pixelOffset = engine.alloc(pixelCount * 4);

  for (const relPath of sampleFiles) {
    const fullPath = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(fullPath)) continue;

    const mybRaw = fs.readFileSync(fullPath, 'utf8');
    const brush = engine.createBrush();
    engine.loadBrushData(brush, mybRaw);
    engine.setBrushColorHex(brush, '#10b981'); // Emerald color

    const mem32 = new Uint32Array(engine.module.HEAPU8.buffer, pixelOffset, pixelCount);
    mem32.fill(0);

    engine.strokeTo(brush, pixelOffset, width, height, 10, 10, 0.8, 0, 0, 0.016);
    const res = engine.strokeTo(brush, pixelOffset, width, height, 90, 90, 0.9, 0, 0, 0.032);

    console.log(`  -> File [${path.basename(relPath)}]: dabs=${res.dabsDrawn}, dirtyRect=`, res.dirtyRect);
    assert(res.dabsDrawn > 0, `Official .myb file ${relPath} should render dabs`);

    let painted = 0;
    for (let i = 0; i < pixelCount; i++) {
      if (mem32[i] !== 0) painted++;
    }
    console.log(`     Painted pixels: ${painted}`);
    assert(painted > 0, `Official .myb file ${relPath} should paint pixels`);

    engine.freeBrush(brush);
  }

  engine.free(pixelOffset);
  console.log('✔ Real official .myb files loaded and rendered successfully!');
}

async function run() {
  await testOfficialLibMyPaint();
  await testAllPresets();
  await testOfficialMybFiles();
  console.log('\n🎉 ALL LIBMYPAINT & OFFICIAL MYB TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
