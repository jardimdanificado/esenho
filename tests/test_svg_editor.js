const assert = require('assert');
const path = require('path');
const fs = require('fs');
const SvgEngine = require('../src/svg/svg_engine.js');
const QuadroSvgRenderer = require('../src/svg/quadro_svg_renderer.js');
const { EsenhoModule } = require('../src/esenho.js');

async function runSvgEngineTests() {
  console.log('--- Testing SVG Object Model & Scene Graph ---');

  const { Bezier, SvgDocument, SvgPath, SvgRect, SvgCircle, SvgEllipse, SvgLine, SvgGroup } = SvgEngine;

  // 1. Test Bézier math
  const p0 = { x: 0, y: 0 };
  const cp1 = { x: 50, y: 100 };
  const cp2 = { x: 100, y: 100 };
  const p1 = { x: 150, y: 0 };

  const mid = Bezier.evalCubic(p0, cp1, cp2, p1, 0.5);
  assert(mid.x > 70 && mid.x < 80, `mid.x expected ~75, got ${mid.x}`);
  assert(mid.y > 70 && mid.y < 80, `mid.y expected ~75, got ${mid.y}`);

  const polySubdiv = Bezier.subdivideCubic(p0, cp1, cp2, p1, 0.5);
  assert(polySubdiv.length >= 4, `Adaptive subdivision should return multiple points, got ${polySubdiv.length}`);
  console.log('✔ Bézier math & subdivision passed');

  // 2. Test Document & Shapes
  const doc = new SvgDocument(800, 600);
  assert.strictEqual(doc.objects.length, 0);

  const rect = new SvgRect({ x: 50, y: 50, width: 200, height: 100, fill: '#fabd2f', stroke: '#fe8019', strokeWidth: 4 });
  doc.addObject(rect);
  assert.strictEqual(doc.objects.length, 1);

  const circle = new SvgCircle({ cx: 400, cy: 300, r: 60, fill: '#b8bb26', stroke: '#1d2021', strokeWidth: 2 });
  doc.addObject(circle);
  assert.strictEqual(doc.objects.length, 2);

  const pathObj = new SvgPath({ stroke: '#83a598', strokeWidth: 3, fill: 'none' });
  pathObj.addNode(100, 400, null, { x: 40, y: -40 }, 'smooth');
  pathObj.addNode(300, 400, { x: -40, y: 40 }, null, 'smooth');
  doc.addObject(pathObj);
  assert.strictEqual(doc.objects.length, 3);
  console.log('✔ SVG Object creation passed');

  // 3. Test Hit Testing & Z-Order
  const hit1 = doc.hitTest(100, 80);
  assert(hit1 && hit1.id === rect.id, 'Hit test on rect should find rect');

  const hit2 = doc.hitTest(400, 300);
  assert(hit2 && hit2.id === circle.id, 'Hit test on circle should find circle');

  const hitMiss = doc.hitTest(10, 10);
  assert.strictEqual(hitMiss, null, 'Hit test on empty space should return null');

  // Test bringToFront
  doc.bringToFront(rect.id);
  assert.strictEqual(doc.objects[doc.objects.length - 1].id, rect.id, 'Rect should now be on top');

  // Test sendToBack
  doc.sendToBack(rect.id);
  assert.strictEqual(doc.objects[0].id, rect.id, 'Rect should now be at bottom');
  console.log('✔ Hit testing & Z-order reordering passed');

  // 4. Test Undo / Redo
  const countBefore = doc.objects.length;
  doc.removeObject(circle.id);
  assert.strictEqual(doc.objects.length, countBefore - 1);

  doc.undo();
  assert.strictEqual(doc.objects.length, countBefore, 'Undo should restore deleted circle');

  doc.redo();
  assert.strictEqual(doc.objects.length, countBefore - 1, 'Redo should re-delete circle');

  doc.undo(); // restore again
  console.log('✔ Undo/Redo history stack passed');

  // 5. Test SVG XML Generation
  const svgXml = doc.toSVGString();
  assert(svgXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert(svgXml.includes('<rect'));
  assert(svgXml.includes('<circle'));
  assert(svgXml.includes('<path'));
  assert(svgXml.includes('fill="#fabd2f"'));
  console.log('✔ SVG XML export generation passed');

  // 6. Test Quadro WASM Rasterization
  console.log('--- Testing Quadro WASM SVG Renderer ---');
  const canvasWasmPath = path.resolve(__dirname, '../roms/canvas.wasm');
  if (fs.existsSync(canvasWasmPath)) {
    const actor = new EsenhoModule(canvasWasmPath);
    const renderer = new QuadroSvgRenderer(actor);

    const renderResult = renderer.renderDocument(doc, { scale: 1.0 });
    assert.strictEqual(renderResult.width, 800);
    assert.strictEqual(renderResult.height, 600);

    const imgData = renderer.getImageData();
    assert(imgData && imgData.data.length === 800 * 600 * 4, 'Rendered image data should have correct RGBA buffer size');
    console.log('✔ Quadro WASM rasterization of SVG Scene Graph passed');
  } else {
    console.log('⚠ roms/canvas.wasm not found, skipping WASM execution step');
  }

  console.log('\nALL SVG OBJECT ENGINE & QUADRO RENDERER TESTS PASSED SUCCESSFULLY!');
}

runSvgEngineTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
