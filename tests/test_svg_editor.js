const assert = require('assert');
const path = require('path');
const fs = require('fs');
const SvgEngine = require('../src/svg/svg_engine.js');
const QuadroSvgRenderer = require('../src/svg/quadro_svg_renderer.js');
const { EsenhoModule } = require('../src/esenho.js');

async function runSvgEngineTests() {
  console.log('--- Testing SVG Object Model & Scene Graph ---');

  const { Bezier, SvgDocument, SvgPath, SvgRect, SvgCircle, SvgEllipse, SvgLine, SvgGroup, PathNode } = SvgEngine;

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

  // 7. Test SVG Grouping & Hierarchical Operations
  console.log('--- Testing SVG Grouping (<g>) & Scene Tree ---');
  const activeRect = doc.findObject(rect.id);
  const activeCircle = doc.findObject(circle.id);
  assert(activeRect && activeCircle, 'Active rect and circle should be present in doc');

  doc.clearSelection();
  doc.select(activeRect.id);
  doc.select(activeCircle.id, true); // multi-select
  assert.strictEqual(doc.getSelectedObjects().length, 2, 'Should have 2 selected objects');

  const group = doc.groupSelected('TestGroup');
  assert(group instanceof SvgGroup, 'groupSelected should return SvgGroup instance');
  assert.strictEqual(group.children.length, 2, 'Group should have 2 children');
  assert.strictEqual(doc.objects.includes(group), true, 'Group should be in document objects');
  assert.strictEqual(doc.objects.includes(activeRect), false, 'Rect should now be child of group, not in root');

  // Test Group Bounds & Hit Testing
  const grpBounds = group.getBounds();
  assert(grpBounds.width > 300, 'Group bounds should encompass rect and circle');
  assert.strictEqual(group.hitTest(100, 80), true, 'Group hit test on rect coordinate should return true');

  // Test Group Move Propagation
  const origRectX = activeRect.x;
  group.move(25, 30);
  assert.strictEqual(activeRect.x, origRectX + 25, 'Group move should offset child rect.x');

  // Test Group XML Serialization
  const grpXml = doc.toSVGString();
  assert(grpXml.includes('<g id="'), 'SVG export should contain <g> element');
  assert(grpXml.includes('</g>'), 'SVG export should properly close </g>');

  // Test Ungroup
  doc.clearSelection();
  doc.select(group.id);
  const okUngroup = doc.ungroupSelected();
  assert.strictEqual(okUngroup, true, 'ungroupSelected should succeed');
  assert.strictEqual(doc.objects.includes(activeRect), true, 'Rect should be restored to root objects');
  // 8. Test Brush Dynamics & Procedural Textures
  console.log('--- Testing Brush Dynamics & Procedural Textures ---');
  const texturedPath = new SvgPath({
    stroke: '#fe8019',
    strokeWidth: 10,
    fill: '#fabd2f',
    brushConfig: {
      flow: 75,
      hardness: 60,
      spacing: 12,
      scatter: 15,
      roundness: 80,
      angle: 45,
      shape: 2,
      dabBlend: 2,
      grain: 40
    },
    strokeTexture: {
      enabled: true,
      mode: 9, // Charcoal Tooth
      scale: 150,
      angle: 30,
      contrast: 120,
      grain: 50
    },
    fillTexture: {
      enabled: true,
      mode: 8, // Watercolor Cold Press
      scale: 200,
      angle: 0,
      contrast: 110,
      grain: 25
    }
  });

  texturedPath.addNode(50, 50, null, { x: 50, y: 0 });
  texturedPath.addNode(150, 150, { x: -50, y: 0 }, null);
  doc.addObject(texturedPath);

  const customSvgXml = doc.toSVGString();
  assert(customSvgXml.includes('data-brush='), 'SVG export should include data-brush attribute');
  assert(customSvgXml.includes('data-stroke-tex='), 'SVG export should include data-stroke-tex attribute');
  assert(customSvgXml.includes('data-fill-tex='), 'SVG export should include data-fill-tex attribute');

  // Test SVG Import Roundtrip
  const doc2 = new SvgDocument(800, 600);
  doc2.fromSVGString(customSvgXml);
  const importedObj = doc2.findObject(texturedPath.id);
  assert(importedObj, 'Imported document should contain texturedPath');
  assert.strictEqual(importedObj.brushConfig.flow, 75, 'Imported brush flow should match');
  assert.strictEqual(importedObj.brushConfig.hardness, 60, 'Imported brush hardness should match');
  assert.strictEqual(importedObj.brushConfig.shape, 2, 'Imported brush shape should match');
  assert.strictEqual(importedObj.strokeTexture.mode, 9, 'Imported stroke texture mode should match');
  assert.strictEqual(importedObj.fillTexture.mode, 8, 'Imported fill texture mode should match');
  assert.strictEqual(importedObj.fillTexture.scale, 200, 'Imported fill texture scale should match');

  // Test Advanced Brush Dynamics Parameters
  texturedPath.brushConfig.auto_rotate = 1;
  texturedPath.brushConfig.taper_in = 25;
  texturedPath.brushConfig.taper_out = 35;
  texturedPath.brushConfig.size_jitter = 20;
  texturedPath.brushConfig.wetness = 60;
  texturedPath.brushConfig.color_pickup = 50;
  texturedPath.brushConfig.depletion = 30;
  texturedPath.brushConfig.smudge = 70;

  const advSvgXml = doc.toSVGString();
  const doc3 = new SvgDocument(800, 600);
  doc3.fromSVGString(advSvgXml);
  const importedAdv = doc3.findObject(texturedPath.id);
  assert.strictEqual(importedAdv.brushConfig.auto_rotate, 1, 'Imported auto_rotate should match');
  assert.strictEqual(importedAdv.brushConfig.taper_in, 25, 'Imported taper_in should match');
  assert.strictEqual(importedAdv.brushConfig.wetness, 60, 'Imported wetness should match');
  assert.strictEqual(importedAdv.brushConfig.smudge, 70, 'Imported smudge should match');

  if (fs.existsSync(canvasWasmPath)) {
    const actor = new EsenhoModule(canvasWasmPath);
    const renderer = new QuadroSvgRenderer(actor);
    const res = renderer.renderDocument(doc3, { scale: 1.0 });
    assert.strictEqual(res.width, 800);
    assert.strictEqual(res.height, 600);

    // Mock canvas test for renderToCanvas
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {}
      })
    };
    const res2x = renderer.renderDocument(doc3, { scale: 2.0 });
    assert.strictEqual(res2x.width, 1600);
    assert.strictEqual(res2x.height, 1200);

    const imgData2x = renderer.getImageData();
    assert.strictEqual(imgData2x.width, 1600);
    assert.strictEqual(imgData2x.height, 1200);
    assert.strictEqual(imgData2x.data.length, 1600 * 1200 * 4);

    const okCanvas = renderer.renderToCanvas(doc3, mockCanvas, { scale: 2.0 });
    assert.strictEqual(okCanvas, true, 'renderToCanvas at 2x should succeed');
    assert.strictEqual(mockCanvas.width, 1600);
    assert.strictEqual(mockCanvas.height, 1200);
    console.log('✔ Real-time Quadro renderToCanvas & 2x/4x scaled stroke/fill execution passed');
  }

  // 9. Test Convert to Path (Primitives -> Bézier SvgPath)
  console.log('--- Testing Convert to Path & Geometry Editing ---');
  const convDoc = new SvgDocument(800, 600);
  const testRect = new SvgRect({ x: 20, y: 30, width: 100, height: 50, rx: 10, ry: 10, fill: '#fabd2f' });
  const testCircle = new SvgCircle({ cx: 200, cy: 150, r: 40, fill: '#b8bb26' });
  const testLine = new SvgLine({ x1: 50, y1: 50, x2: 150, y2: 150, stroke: '#fe8019', strokeWidth: 4 });
  convDoc.addObject(testRect);
  convDoc.addObject(testCircle);
  convDoc.addObject(testLine);

  convDoc.select(testRect.id);
  convDoc.select(testCircle.id, true);
  convDoc.select(testLine.id, true);

  const okConvert = convDoc.convertSelectedToPath();
  assert.strictEqual(okConvert, true, 'convertSelectedToPath should return true');
  assert.strictEqual(convDoc.objects.length, 3);
  
  const convertedRectPath = convDoc.objects[0];
  assert.strictEqual(convertedRectPath instanceof SvgPath, true, 'Converted rect should be an SvgPath');
  assert.strictEqual(convertedRectPath.nodes.length, 8, 'Rounded rect should convert to 8-node smooth Bézier path');
  assert.strictEqual(convertedRectPath.closed, true, 'Converted rect path should be closed');

  const convertedCirclePath = convDoc.objects[1];
  assert.strictEqual(convertedCirclePath instanceof SvgPath, true, 'Converted circle should be an SvgPath');
  assert.strictEqual(convertedCirclePath.nodes.length, 4, 'Converted circle should have 4 Bézier nodes');
  assert.strictEqual(convertedCirclePath.closed, true, 'Converted circle path should be closed');

  const convertedLinePath = convDoc.objects[2];
  assert.strictEqual(convertedLinePath instanceof SvgPath, true, 'Converted line should be an SvgPath');
  assert.strictEqual(convertedLinePath.nodes.length, 2, 'Converted line should have 2 nodes');
  assert.strictEqual(convertedLinePath.closed, false, 'Converted line path should not be closed');

  console.log('✔ Convert to Bézier Path for rect, circle, line passed');

  // 10. Test Independent / Cusped Bézier Handles (Breaking handle lock)
  console.log('--- Testing Independent Cusped Bézier Handles ---');
  const node = new PathNode(100, 100, { x: -30, y: 0 }, { x: 30, y: 0 }, 'smooth');
  
  // In smooth mode, moving cpIn rotates cpOut
  node.setAbsCpIn(100, 70); // moved cpIn to (0, -30)
  assert.strictEqual(node.cpIn.x, 0);
  assert.strictEqual(node.cpIn.y, -30);
  assert.strictEqual(Math.round(node.cpOut.x), 0);
  assert.strictEqual(Math.round(node.cpOut.y), 30);

  // With forceIndependent (Alt key) or 'cusp' mode, moving cpIn does NOT touch cpOut
  node.setAbsCpIn(70, 100, true); // moved cpIn to (-30, 0)
  assert.strictEqual(node.cpIn.x, -30);
  assert.strictEqual(node.cpIn.y, 0);
  // cpOut remains untouched at (0, 30)
  assert.strictEqual(Math.round(node.cpOut.x), 0);
  assert.strictEqual(Math.round(node.cpOut.y), 30);
  assert.strictEqual(node.type, 'cusp');
  console.log('✔ Independent / Cusped Bézier handle control passed');

  console.log('\nALL SVG OBJECT ENGINE & QUADRO RENDERER TESTS PASSED SUCCESSFULLY!');
}

runSvgEngineTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
