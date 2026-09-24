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

  // Test Marquee Box Selection (hitTestBox)
  const boxHits = doc.hitTestBox(0, 0, 500, 350);
  assert.strictEqual(boxHits.length, 2, `Marquee box should intersect 2 objects (rect and circle), got ${boxHits.length}`);
  const boxHitsEnclosed = doc.hitTestBox(0, 0, 500, 400, false);
  assert.strictEqual(boxHitsEnclosed.length, 2, `Enclosed marquee box should contain 2 objects, got ${boxHitsEnclosed.length}`);
  const boxMiss = doc.hitTestBox(0, 0, 30, 30);
  assert.strictEqual(boxMiss.length, 0, 'Marquee on empty corner should find 0 objects');

  // Test bringToFront
  doc.bringToFront(rect.id);
  assert.strictEqual(doc.objects[doc.objects.length - 1].id, rect.id, 'Rect should now be on top');

  // Test sendToBack
  doc.sendToBack(rect.id);
  assert.strictEqual(doc.objects[0].id, rect.id, 'Rect should now be at bottom');
  console.log('✔ Hit testing, Marquee Box Selection & Z-order reordering passed');

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

  // 10. Test Independent / Cusped Bézier Handles & Anchor Point Removal
  console.log('--- Testing Independent Cusped Bézier Handles & Anchor Deletion ---');
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

  // Test single anchor removal
  const multiNodePath = new SvgPath();
  multiNodePath.addNode(0, 0);
  multiNodePath.addNode(50, 50);
  multiNodePath.addNode(100, 0);
  assert.strictEqual(multiNodePath.nodes.length, 3);
  const removed = multiNodePath.removeNode(1);
  assert.strictEqual(removed.x, 50);
  assert.strictEqual(multiNodePath.nodes.length, 2);
  console.log('✔ Independent / Cusped Bézier handle control and single anchor point removal passed');

  // 11. Test Phase 1: Pathfinder & Boolean Operations (Union, Subtract, Intersect, Exclude)
  console.log('--- Testing Pathfinder & Boolean Operations ---');
  const { SvgCompoundPath, SvgText, SvgLinearGradient, SvgRadialGradient } = SvgEngine;
  
  // Test Union
  const unionDoc = new SvgDocument(800, 600);
  const uA = new SvgRect({ x: 100, y: 100, width: 100, height: 100, fill: '#fabd2f' });
  const uB = new SvgRect({ x: 150, y: 150, width: 100, height: 100, fill: '#fe8019' });
  unionDoc.addObject(uA);
  unionDoc.addObject(uB);
  unionDoc.select(uA.id);
  unionDoc.select(uB.id, true);
  const unionResult = unionDoc.booleanOperation('union');
  assert(unionResult && unionResult instanceof SvgCompoundPath, 'Union should return SvgCompoundPath');
  assert(unionResult.subPaths.length >= 1, 'Union shape should have subpaths');
  assert.strictEqual(unionDoc.objects.length, 1);
  console.log('✔ Boolean Union operation passed');

  // Test Intersect
  const isectDoc = new SvgDocument(800, 600);
  const iA = new SvgRect({ x: 100, y: 100, width: 100, height: 100 });
  const iB = new SvgRect({ x: 150, y: 150, width: 100, height: 100 });
  isectDoc.addObject(iA);
  isectDoc.addObject(iB);
  isectDoc.select(iA.id);
  isectDoc.select(iB.id, true);
  const isectResult = isectDoc.booleanOperation('intersect');
  assert(isectResult && isectResult instanceof SvgCompoundPath, 'Intersect should return SvgCompoundPath');
  assert(isectResult.subPaths.length >= 1, 'Intersect shape should have overlapping subpaths');
  console.log('✔ Boolean Intersect operation passed');

  // Test Subtract
  const subDoc = new SvgDocument(800, 600);
  const sA = new SvgRect({ x: 100, y: 100, width: 100, height: 100 });
  const sB = new SvgRect({ x: 150, y: 150, width: 100, height: 100 });
  subDoc.addObject(sA);
  subDoc.addObject(sB);
  subDoc.select(sA.id);
  subDoc.select(sB.id, true);
  const subResult = subDoc.booleanOperation('subtract');
  assert(subResult && subResult instanceof SvgCompoundPath, 'Subtract should return SvgCompoundPath');
  assert(subResult.subPaths.length >= 1, 'Subtracted shape should contain path nodes');
  console.log('✔ Boolean Subtract operation passed');

  // Test Exclude (XOR)
  const excDoc = new SvgDocument(800, 600);
  const eA = new SvgRect({ x: 100, y: 100, width: 100, height: 100 });
  const eB = new SvgRect({ x: 150, y: 150, width: 100, height: 100 });
  excDoc.addObject(eA);
  excDoc.addObject(eB);
  excDoc.select(eA.id);
  excDoc.select(eB.id, true);
  const excResult = excDoc.booleanOperation('exclude');
  assert(excResult && excResult instanceof SvgCompoundPath, 'Exclude should return SvgCompoundPath');
  assert(excResult.subPaths.length >= 1, 'Exclude shape should have subpaths');
  console.log('✔ Boolean Exclude operation passed');

  // 12. Test Phase 2: Gradients & Drop Shadows in Engine and Quadro WASM
  console.log('--- Testing Linear/Radial Gradients & Drop Shadows ---');
  const gradDoc = new SvgDocument(800, 600);
  const linGrad = new SvgLinearGradient({ x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
  linGrad.stops = [
    { offset: 0, color: '#fe8019', opacity: 1.0 },
    { offset: 1, color: '#b8bb26', opacity: 1.0 }
  ];
  const gradRect = new SvgRect({
    x: 50, y: 50, width: 300, height: 200,
    fillType: 'linear',
    fillGradient: linGrad,
    dropShadow: {
      enabled: true,
      color: '#000000',
      blur: 32, // Large blur test
      offsetX: 8,
      offsetY: 8,
      opacity: 0.7
    }
  });
  gradDoc.addObject(gradRect);

  const gradSvgXml = gradDoc.toSVGString();
  assert(gradSvgXml.includes('<linearGradient'), 'SVG export should contain <linearGradient>');
  assert(gradSvgXml.includes('<filter id="shadow_'), 'SVG export should contain shadow filter');
  assert(gradSvgXml.includes('filter="url(#shadow_'), 'Shape should reference shadow filter');

  if (fs.existsSync(canvasWasmPath)) {
    const actor = new EsenhoModule(canvasWasmPath);
    const renderer = new QuadroSvgRenderer(actor);
    const res = renderer.renderDocument(gradDoc, { scale: 1.0 });
    assert.strictEqual(res.width, 800);
    assert.strictEqual(res.height, 600);
    const imgData = renderer.getImageData();
    assert(imgData && imgData.data.length === 800 * 600 * 4);
    console.log('✔ Quadro procedural linear gradient & Gaussian drop shadow rasterization passed');
  }

  // 13. Test Phase 3: Vector Typography & Create Outlines
  console.log('--- Testing Vector Typography & Outlines Decomposition ---');
  const textDoc = new SvgDocument(800, 600);
  const textObj = new SvgText({
    x: 100,
    y: 200,
    text: 'WESENHO',
    fontFamily: 'sans-serif',
    fontSize: 48,
    fill: '#fabd2f'
  });
  textDoc.addObject(textObj);
  assert.strictEqual(textDoc.objects.length, 1);

  const textSvgXml = textDoc.toSVGString();
  assert(textSvgXml.includes('<text'), 'SVG export should contain <text> tag');
  assert(textSvgXml.includes('WESENHO'), 'SVG export should contain text string');
  assert(textSvgXml.includes('font-size="48"'), 'SVG export should contain font size');

  textDoc.select(textObj.id);
  const okOutlines = textDoc.createOutlinesSelected();
  assert.strictEqual(okOutlines, true, 'createOutlinesSelected should succeed');
  assert.strictEqual(textDoc.objects.length, 1);
  const outlinedCompound = textDoc.objects[0];
  assert(outlinedCompound instanceof SvgCompoundPath, 'Outlined text should become SvgCompoundPath');
  assert.strictEqual(outlinedCompound.subPaths.length, 7, '7 characters should yield 7 subpaths');

  // 14. Test SvgImage, Rotation & Anchor Transform Support
  console.log('--- Testing SvgImage, Rotation & Anchor Origin Transforms ---');
  const { SvgImage } = SvgEngine;
  const imgDoc = new SvgDocument(800, 600);
  const imgObj = new SvgImage({
    x: 50,
    y: 50,
    width: 200,
    height: 150,
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rotation: 45
  });
  imgDoc.addObject(imgObj);
  assert.strictEqual(imgDoc.objects.length, 1);

  // Check bounds
  const imgBounds = imgObj.getBounds();
  assert.strictEqual(imgBounds.width, 200);
  assert.strictEqual(imgBounds.height, 150);

  // Check default center origin vs custom origin
  const origCenter = imgObj.getOrigin();
  assert.strictEqual(origCenter.x, 150); // 50 + 200/2
  assert.strictEqual(origCenter.y, 125); // 50 + 150/2

  imgObj.originX = 50;
  imgObj.originY = 50;
  const customOrigin = imgObj.getOrigin();
  assert.strictEqual(customOrigin.x, 50);
  assert.strictEqual(customOrigin.y, 50);

  // Check SVG XML transform export
  const imgSvgXml = imgDoc.toSVGString();
  assert(imgSvgXml.includes('<image'), 'SVG export should contain <image> tag');
  assert(imgSvgXml.includes('transform="rotate(45 50 50)"'), 'SVG export should contain rotate transform');

  // Verify convertSelectedToPath does NOT destroy or convert SvgImage
  imgDoc.select(imgObj.id);
  const converted = imgDoc.convertSelectedToPath();
  assert.strictEqual(converted, false, 'convertSelectedToPath must not convert SvgImage');
  assert.strictEqual(imgDoc.objects[0] instanceof SvgImage, true, 'Object should remain SvgImage');

  // Test anchor translation when moving object
  imgObj.move(20, 30);
  assert.strictEqual(imgObj.x, 70);
  assert.strictEqual(imgObj.y, 80);
  assert.strictEqual(imgObj.originX, 70);
  assert.strictEqual(imgObj.originY, 80);

  // Test setOrigin visual invariant under 90° rotation
  const rectRot = new SvgRect({ x: 0, y: 0, width: 100, height: 100, rotation: 90 });
  const initialOrig = rectRot.getOrigin(); // { x: 50, y: 50 }
  assert.strictEqual(initialOrig.x, 50);
  assert.strictEqual(initialOrig.y, 50);

  // Change anchor to (0, 0)
  rectRot.setOrigin(0, 0, true);
  assert.strictEqual(rectRot.originX, 0);
  assert.strictEqual(rectRot.originY, 0);
  // Geometry must shift by (0, -100) so that rotated visual position is exactly unchanged
  assert.strictEqual(rectRot.x, 0);
  assert.strictEqual(rectRot.y, -100);

  // Test rotated hit-testing
  const rBar = new SvgRect({ x: 100, y: 100, width: 200, height: 40, rotation: 90 });
  // Center is (200, 120). Rotated 90°, the 200x40 bar extends vertically around center:
  // Visual bounds: x in [180, 220], y in [20, 220]
  assert.strictEqual(rBar.hitTest(200, 50), true, 'Clicking visual vertical bar should hit rotated rect');
  assert.strictEqual(rBar.hitTest(200, 200), true, 'Clicking visual vertical bar bottom should hit rotated rect');
  assert.strictEqual(rBar.hitTest(280, 120), false, 'Clicking unrotated horizontal zone should NOT hit');

  // Test SVG import with xlink / XML namespaces
  const svgWithNamespaces = `<svg width="500" height="400" viewBox="0 0 500 400">
    <image x="10" y="20" width="100" height="80" xlink:href="data:image/png;base64,abc" transform="rotate(45 60 60)"/>
    <polyline points="0,0 50,50 100,0" stroke="#ff0000"/>
  </svg>`;
  const nsDoc = new SvgDocument(500, 400);
  nsDoc.fromSVGString(svgWithNamespaces);
  assert.strictEqual(nsDoc.objects.length, 2, 'Should import image and polyline');
  assert.strictEqual(nsDoc.objects[0].type, 'image');
  assert.strictEqual(nsDoc.objects[0].rotation, 45);
  assert.strictEqual(nsDoc.objects[1].type, 'polyline');

  console.log('✔ SvgImage, rotation transforms, hit-testing & origin anchor protection passed');

  console.log('\nALL SVG OBJECT ENGINE, ROADMAP PHASES 1-3 & QUADRO TESTS PASSED SUCCESSFULLY!');
}

runSvgEngineTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
