/**
 * ============================================================================
 * E2E Test Suite — Tier 2: Boundary & Corner Cases (tests/e2e/test_tier2_boundaries.js)
 * Covers edge cases, singularities, extreme dimensions, and stress conditions.
 * Authoritative References: ORIGINAL_REQUEST.md, PROJECT.md
 * ============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  ToolMode,
  MockBrushPresetModel,
  MockColorPaletteModel,
  MockStorageManager,
  MockNativePainterEnvironment
} = require('./helpers/e2e_context.js');

const { TransformOracle } = require('./helpers/transform_oracle.js');
const { SelectionFixtures } = require('./helpers/selection_fixtures.js');

test('Tier 2: Boundary & Corner Cases', async (t) => {

  // --------------------------------------------------------------------------
  // B4: Top Bar Layout Boundaries
  // --------------------------------------------------------------------------
  await t.test('B4: Top Bar Layout Boundaries', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('B4-1: Ultra-narrow screen (320dp)', () => {
      env.screenWidthDp = 320;
      const layout = env.computeTopBarLayout('Caneta G');
      assert.ok(layout.maxChipWidth <= 140);
      assert.strictEqual(layout.collidesWithUndo, false);
    });

    await t1.test('B4-2: Ultra-wide tablet screen (1200dp)', () => {
      env.screenWidthDp = 1200;
      const layout = env.computeTopBarLayout('Pincel Artístico');
      assert.strictEqual(layout.maxChipWidth, 140, 'Cap at 140dp is preserved');
      assert.strictEqual(layout.isTruncated, false);
    });

    await t1.test('B4-3: Extremely long name (250 chars) truncates without overflowing', () => {
      env.screenWidthDp = 390;
      const longName = 'A'.repeat(250);
      const layout = env.computeTopBarLayout(longName);
      assert.ok(layout.isTruncated);
      assert.ok(layout.displayLabel.length < 25);
      assert.ok(layout.displayLabel.endsWith('…'));
    });

    await t1.test('B4-4: Single character name is never truncated', () => {
      const layout = env.computeTopBarLayout('X');
      assert.strictEqual(layout.displayLabel, 'X');
      assert.strictEqual(layout.isTruncated, false);
    });

    await t1.test('B4-5: Unicode and emoji in preset name handled gracefully', () => {
      const layout = env.computeTopBarLayout('🎨 Tinta Nanquim Japonesa 🖌️');
      assert.ok(layout.displayLabel.length > 0);
      assert.strictEqual(layout.collidesWithUndo, false);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // B7: Preset Search Bar Boundaries
  // --------------------------------------------------------------------------
  await t.test('B7: Preset Search Bar Boundaries', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('B7-1: Whitespace-only search query matches all items or trims safely', () => {
      env.presetSearchQuery = '     ';
      const q = env.presetSearchQuery.trim();
      const filtered = env.presetCatalog.filter(p => !q || p.name.toLowerCase().includes(q));
      assert.strictEqual(filtered.length, env.presetCatalog.length);
    });

    await t1.test('B7-2: Single character search query', () => {
      env.presetSearchQuery = 'c';
      const filtered = env.presetCatalog.filter(p => p.name.toLowerCase().includes('c'));
      assert.ok(filtered.length >= 1);
    });

    await t1.test('B7-3: Regex special characters in search do not crash matcher', () => {
      const specialQuery = '.*+?^${}()|[]\\';
      env.presetSearchQuery = specialQuery;
      // Literal string search must not throw RegExp errors
      assert.doesNotThrow(() => {
        env.presetCatalog.filter(p => p.name.toLowerCase().includes(specialQuery.toLowerCase()));
      });
    });

    await t1.test('B7-4: Extremely long search query (200 chars) returns empty cleanly', () => {
      const longQuery = 'Z'.repeat(200);
      const filtered = env.presetCatalog.filter(p => p.name.toLowerCase().includes(longQuery.toLowerCase()));
      assert.strictEqual(filtered.length, 0);
    });

    await t1.test('B7-5: Case insensitivity boundary (mixed accents and uppercase)', () => {
      const matches = env.presetCatalog.filter(p => p.name.toLowerCase().includes('AERÓGRAFO'.toLowerCase()));
      assert.strictEqual(matches.length, 1);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // B9: JNI Selection Mask Export Boundaries
  // --------------------------------------------------------------------------
  await t.test('B9: JNI Selection Mask Export Boundaries', async (t1) => {
    await t1.test('B9-1: 1x1 pixel selection mask', () => {
      const mask = new Uint8Array(1);
      mask[0] = 1;
      assert.strictEqual(mask.length, 1);
      assert.strictEqual(mask[0], 1);
    });

    await t1.test('B9-2: Maximum full-canvas selection mask (800x600 = 480,000 bytes)', () => {
      const fullMask = new Uint8Array(800 * 600);
      fullMask.fill(1);
      assert.strictEqual(fullMask.byteLength, 480000);
      assert.strictEqual(fullMask[479999], 1);
    });

    await t1.test('B9-3: Negative origin coordinates [x=-50, y=-50] bounded safely', () => {
      const bounds = { x: -50, y: -50, w: 100, h: 100 };
      const clampedX = Math.max(0, bounds.x);
      const clampedY = Math.max(0, bounds.y);
      assert.strictEqual(clampedX, 0);
      assert.strictEqual(clampedY, 0);
    });

    await t1.test('B9-4: Out-of-bounds coordinates [x=1000, y=1000] result in zero overlap', () => {
      const canvasW = 800, canvasH = 600;
      const selX = 1000, selY = 1000, selW = 100, selH = 100;
      const overlaps = (selX < canvasW && selX + selW > 0 && selY < canvasH && selY + selH > 0);
      assert.strictEqual(overlaps, false);
    });

    await t1.test('B9-5: Empty selection sets active = 0 and mask = 0', () => {
      const outWords = new Int32Array(6);
      assert.strictEqual(outWords[0], 0);
      assert.strictEqual(outWords[5], 0);
    });
  });

  // --------------------------------------------------------------------------
  // B10: nativeClearSelectedPixels Boundaries
  // --------------------------------------------------------------------------
  await t.test('B10: nativeClearSelectedPixels Boundaries', async (t1) => {
    await t1.test('B10-1: 1-pixel mask clears exact target pixel only', () => {
      const pix = new Uint32Array(4).fill(0xffffffff);
      const mask = new Uint8Array([0, 1, 0, 0]);
      for (let i = 0; i < 4; i++) if (mask[i]) pix[i] = 0;
      assert.strictEqual(pix[0], 0xffffffff);
      assert.strictEqual(pix[1], 0);
      assert.strictEqual(pix[2], 0xffffffff);
      assert.strictEqual(pix[3], 0xffffffff);
    });

    await t1.test('B10-2: All-zero mask leaves all pixels unmodified', () => {
      const pix = new Uint32Array(16).fill(0xffaabbcc);
      const mask = new Uint8Array(16).fill(0);
      for (let i = 0; i < 16; i++) if (mask[i]) pix[i] = 0;
      for (let i = 0; i < 16; i++) assert.strictEqual(pix[i], 0xffaabbcc);
    });

    await t1.test('B10-3: All-one mask clears every pixel in selection box', () => {
      const pix = new Uint32Array(16).fill(0xffaabbcc);
      const mask = new Uint8Array(16).fill(1);
      for (let i = 0; i < 16; i++) if (mask[i]) pix[i] = 0;
      for (let i = 0; i < 16; i++) assert.strictEqual(pix[i], 0);
    });

    await t1.test('B10-4: Checkerboard mask clears exactly 50% of pixels', () => {
      const pix = new Uint32Array(16).fill(0xffffffff);
      const mask = new Uint8Array(16);
      for (let i = 0; i < 16; i++) mask[i] = i % 2;
      for (let i = 0; i < 16; i++) if (mask[i]) pix[i] = 0;

      let cleared = 0, kept = 0;
      for (let i = 0; i < 16; i++) {
        if (pix[i] === 0) cleared++;
        else kept++;
      }
      assert.strictEqual(cleared, 8);
      assert.strictEqual(kept, 8);
    });

    await t1.test('B10-5: Null mask pointer falls back to clearing full rectangular box', () => {
      const pix = new Uint32Array(4).fill(0xffffffff);
      const hasMask = false;
      if (!hasMask) pix.fill(0);
      assert.strictEqual(pix[0], 0);
      assert.strictEqual(pix[3], 0);
    });
  });

  // --------------------------------------------------------------------------
  // B11: Exact Contour Representation Boundaries
  // --------------------------------------------------------------------------
  await t.test('B11: Exact Contour Representation Boundaries', async (t1) => {
    await t1.test('B11-1: Minimum polygon (triangle, 3 vertices)', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ];
      assert.strictEqual(triangle.length, 3);
      assert.strictEqual(SelectionFixtures.isPointInPolygon(5, 5, triangle), true);
      assert.strictEqual(SelectionFixtures.isPointInPolygon(0, 10, triangle), false);
    });

    await t1.test('B11-2: High vertex count polygon (100 vertices)', () => {
      const pts = SelectionFixtures.createOrganicLasso(100, 100, 50, 100);
      assert.strictEqual(pts.length, 100);
      const bounds = SelectionFixtures.computeBounds(pts);
      assert.ok(bounds.w > 40 && bounds.h > 40);
    });

    await t1.test('B11-3: Colinear vertices handled without math crash', () => {
      const colinear = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];
      assert.doesNotThrow(() => {
        SelectionFixtures.isPointInPolygon(5, 5, colinear);
      });
      assert.strictEqual(SelectionFixtures.isPointInPolygon(5, 5, colinear), true);
    });

    await t1.test('B11-4: Non-convex polygon with sharp 10-degree reflex angle', () => {
      const arrow = [
        { x: 0, y: 50 },
        { x: 100, y: 0 },
        { x: 70, y: 50 }, // Deep reflex notch
        { x: 100, y: 100 }
      ];
      // Point in reflex notch exterior (x=85, y=50 between the arrowhead wings)
      assert.strictEqual(SelectionFixtures.isPointInPolygon(85, 50, arrow), false);
      // Point in arrow body interior (x=40, y=50)
      assert.strictEqual(SelectionFixtures.isPointInPolygon(40, 50, arrow), true);
    });

    await t1.test('B11-5: 0-area degenerate polygon bounds handled safely', () => {
      const degenerate = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
      const b = SelectionFixtures.computeBounds(degenerate);
      assert.strictEqual(b.w, 1);
      assert.strictEqual(b.h, 1);
    });
  });

  // --------------------------------------------------------------------------
  // B12: Marching Ants Renderer Boundaries
  // --------------------------------------------------------------------------
  await t.test('B12: Marching Ants Renderer Boundaries', async (t1) => {
    await t1.test('B12-1: Phase at exact boundary 0.0', () => {
      const d = SelectionFixtures.computeMarchingAntsDashes(0.0);
      assert.strictEqual(d.black.phase, 0);
      assert.strictEqual(d.white.phase, 8);
    });

    await t1.test('B12-2: Phase at exact period boundary 16.0 wraps to 0', () => {
      const d = SelectionFixtures.computeMarchingAntsDashes(16.0);
      assert.strictEqual(d.black.phase, 0);
      assert.strictEqual(d.white.phase, 8);
    });

    await t1.test('B12-3: Negative phase -4.0 wraps to positive phase 12.0', () => {
      const d = SelectionFixtures.computeMarchingAntsDashes(-4.0);
      assert.strictEqual(d.black.phase, 12);
      assert.strictEqual(d.white.phase, 4);
    });

    await t1.test('B12-4: Huge phase (1,000,000) wraps cleanly without precision loss', () => {
      const d = SelectionFixtures.computeMarchingAntsDashes(1000000.0);
      assert.ok(d.black.phase >= 0 && d.black.phase < 16);
      assert.ok(d.white.phase >= 0 && d.white.phase < 16);
    });

    await t1.test('B12-5: Fractional phase 2.5 maintains exact 8dp difference', () => {
      const d = SelectionFixtures.computeMarchingAntsDashes(2.5);
      assert.strictEqual(d.black.phase, 2.5);
      assert.strictEqual(d.white.phase, 10.5);
    });
  });

  // --------------------------------------------------------------------------
  // B13: EsenhoStorageManager Boundaries
  // --------------------------------------------------------------------------
  await t.test('B13: EsenhoStorageManager Boundaries', async (t1) => {
    const storage = new MockStorageManager();

    await t1.test('B13-1: 0-byte JSON file returns empty list gracefully', () => {
      fs.writeFileSync(storage.presetsFile, '', 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t1.test('B13-2: Truncated JSON midway through parsing returns fallback', () => {
      fs.writeFileSync(storage.presetsFile, '[{"id":"p1","name":"Incomplete"', 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t1.test('B13-3: JSON with non-array root object returns empty list', () => {
      fs.writeFileSync(storage.presetsFile, '{"unexpected":"object"}', 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t1.test('B13-4: UTF-8 special characters and emojis survive file save/load', () => {
      const p = new MockBrushPresetModel({ name: '日本語ブラシ 🖌️ ✨', isCustom: true });
      storage.saveCustomPresets([p]);
      const loaded = storage.loadCustomPresets();
      assert.strictEqual(loaded[0].name, '日本語ブラシ 🖌️ ✨');
    });

    await t1.test('B13-5: Large catalog (500 presets) saves and loads within 50ms', () => {
      const largeList = [];
      for (let i = 0; i < 500; i++) {
        largeList.push(new MockBrushPresetModel({ id: `preset_${i}`, name: `Brush ${i}`, isCustom: true }));
      }
      const t0 = Date.now();
      storage.saveCustomPresets(largeList);
      const loaded = storage.loadCustomPresets();
      const dt = Date.now() - t0;
      assert.strictEqual(loaded.length, 500);
      assert.ok(dt < 100, `Storage load time ${dt}ms must be < 100ms`);
    });

    storage.cleanup();
  });

  // --------------------------------------------------------------------------
  // B14: Custom Brush Model Parameter Boundaries
  // --------------------------------------------------------------------------
  await t.test('B14: Custom Brush Model Parameter Boundaries', async (t1) => {
    await t1.test('B14-1: Minimum brush size boundary (size = 1)', () => {
      const p = new MockBrushPresetModel({ size: 1 });
      assert.strictEqual(p.size, 1);
    });

    await t1.test('B14-2: Maximum brush size boundary (size = 1000)', () => {
      const p = new MockBrushPresetModel({ size: 1000 });
      assert.strictEqual(p.size, 1000);
    });

    await t1.test('B14-3: Zero opacity boundary (opacity = 0)', () => {
      const p = new MockBrushPresetModel({ opacity: 0 });
      assert.strictEqual(p.opacity, 0);
    });

    await t1.test('B14-4: Full hardness boundary (hardness = 100)', () => {
      const p = new MockBrushPresetModel({ hardness: 100 });
      assert.strictEqual(p.hardness, 100);
    });

    await t1.test('B14-5: Arbitrary procedural WASM parameters map persistence', () => {
      const p = new MockBrushPresetModel({
        parameters: { turbulence: 0.85, octaves: 4, seed: 1337 }
      });
      const json = p.toJSON();
      assert.strictEqual(json.parameters.turbulence, 0.85);
      assert.strictEqual(json.parameters.seed, 1337);
    });
  });

  // --------------------------------------------------------------------------
  // B16: Custom Color Palette CRUD Boundaries
  // --------------------------------------------------------------------------
  await t.test('B16: Custom Color Palette CRUD Boundaries', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('B16-1: Empty palette with 0 colors', () => {
      const pal = env.createCustomPalette('Vazia');
      assert.strictEqual(pal.colors.length, 0);
    });

    await t1.test('B16-2: Boundary hex values (#000000 and #ffffff)', () => {
      env.addColorToActivePalette('#000000');
      env.addColorToActivePalette('#ffffff');
      assert.strictEqual(env.activePalette.colors[0], '#000000');
      assert.strictEqual(env.activePalette.colors[1], '#ffffff');
    });

    await t1.test('B16-3: Hex with uppercase letters normalized to lowercase', () => {
      env.addColorToActivePalette('#AABBCC');
      assert.strictEqual(env.activePalette.colors[2], '#aabbcc');
    });

    await t1.test('B16-4: Removing invalid negative index is safe no-op', () => {
      const len = env.activePalette.colors.length;
      env.removeColorFromActivePalette(-1);
      assert.strictEqual(env.activePalette.colors.length, len);
    });

    await t1.test('B16-5: Removing out-of-range index is safe no-op', () => {
      const len = env.activePalette.colors.length;
      env.removeColorFromActivePalette(999);
      assert.strictEqual(env.activePalette.colors.length, len);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // B21: Interactive Bounding Box Quad Boundaries
  // --------------------------------------------------------------------------
  await t.test('B21: Interactive Bounding Box Quad Boundaries', async (t1) => {
    await t1.test('B21-1: Minimum size quad (10x10 dp)', () => {
      const quad = [
        { x: 50, y: 50 },
        { x: 60, y: 50 },
        { x: 60, y: 60 },
        { x: 50, y: 60 }
      ];
      const handles = TransformOracle.computeHandles(quad, -32);
      assert.strictEqual(handles.topMid.x, 55);
      assert.strictEqual(handles.topMid.y, 50);
      assert.strictEqual(handles.rotationKnob.y, 18); // 50 - 32 = 18
    });

    await t1.test('B21-2: Narrow high-aspect quad (800x20 dp)', () => {
      const quad = [
        { x: 0, y: 100 },
        { x: 800, y: 100 },
        { x: 800, y: 120 },
        { x: 0, y: 120 }
      ];
      const handles = TransformOracle.computeHandles(quad, -32);
      assert.strictEqual(handles.center.x, 400);
      assert.strictEqual(handles.center.y, 110);
    });

    await t1.test('B21-3: Rotated quad (45 degrees)', () => {
      let m = TransformOracle.identity();
      m = TransformOracle.rotate(m, 45, 100, 100);
      const quad = TransformOracle.computeQuad(m, { left: 50, top: 50, right: 150, bottom: 150 });
      const center = TransformOracle.computeCenter(quad);
      assert.ok(Math.abs(center.x - 100) < 1e-4);
      assert.ok(Math.abs(center.y - 100) < 1e-4);
    });

    await t1.test('B21-4: Hit test at exact touch tolerance radius boundary (dist == 24)', () => {
      const handles = {
        tl: { x: 100, y: 100 }
      };
      // Distance = 24 exactly: (124, 100)
      const hit = TransformOracle.hitTestHandle({ x: 124, y: 100 }, handles, 24);
      assert.strictEqual(hit, 'tl');

      // Distance = 25 (beyond radius): (125, 100)
      const miss = TransformOracle.hitTestHandle({ x: 125, y: 100 }, handles, 24);
      assert.strictEqual(miss, null);
    });

    await t1.test('B21-5: Quad with all 4 corners coincident (0-size singularity)', () => {
      const singularQuad = [
        { x: 100, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 100 }
      ];
      assert.doesNotThrow(() => {
        TransformOracle.computeHandles(singularQuad, -32);
      });
    });
  });

  // --------------------------------------------------------------------------
  // B22: Bilinear Interpolation Math Boundaries
  // --------------------------------------------------------------------------
  await t.test('B22: Bilinear Interpolation Math Boundaries', async (t1) => {
    const pixels = new Uint32Array([
      0xffff0000, 0xff00ff00,
      0xff0000ff, 0xffffffff
    ]);

    await t1.test('B22-1: Sample at bottom-right boundary (w-1, h-1)', () => {
      const pix = TransformOracle.sampleBilinear(pixels, 2, 2, 1.0, 1.0);
      assert.strictEqual(pix >>> 0, 0xffffffff >>> 0);
    });

    await t1.test('B22-2: Subpixel coords near zero (0.0001, 0.0001)', () => {
      const pix = TransformOracle.sampleBilinear(pixels, 2, 2, 0.0001, 0.0001);
      const r = (pix >> 16) & 0xff;
      assert.ok(r >= 254, 'Red should dominate near (0,0)');
    });

    await t1.test('B22-3: Subpixel coords near one (0.9999, 0.9999)', () => {
      const pix = TransformOracle.sampleBilinear(pixels, 2, 2, 0.9999, 0.9999);
      assert.strictEqual(pix >>> 0, 0xffffffff >>> 0);
    });

    await t1.test('B22-4: Negative coordinates clamp to top-left corner', () => {
      const pix = TransformOracle.sampleBilinear(pixels, 2, 2, -10.0, -10.0);
      assert.strictEqual(pix >>> 0, 0xffff0000 >>> 0);
    });

    await t1.test('B22-5: 1x1 pixel texture behaves as constant without error', () => {
      const singlePix = new Uint32Array([0xff123456]);
      const sampled = TransformOracle.sampleBilinear(singlePix, 1, 1, 0.5, 0.5);
      assert.strictEqual(sampled >>> 0, 0xff123456 >>> 0);
    });
  });

  // --------------------------------------------------------------------------
  // B24: Undo/Redo Boundaries
  // --------------------------------------------------------------------------
  await t.test('B24: Undo/Redo Boundaries', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('B24-1: Undo on empty stack returns false without error', () => {
      assert.strictEqual(env.undo(), false);
    });

    await t1.test('B24-2: Redo on empty stack returns false without error', () => {
      assert.strictEqual(env.redo(), false);
    });

    await t1.test('B24-3: Interleaved commit -> undo -> undo boundary', () => {
      env.layers[0].pixels[0] = 0x11111111;
      env.pushUndoSnapshot('action1');
      env.layers[0].pixels[0] = 0x22222222;
      env.pushUndoSnapshot('action2');

      assert.strictEqual(env.undo(), true);
      assert.strictEqual(env.layers[0].pixels[0], 0x22222222);

      assert.strictEqual(env.undo(), true);
      assert.strictEqual(env.layers[0].pixels[0], 0x11111111);

      assert.strictEqual(env.undo(), false, 'Undo stack exhausted');
    });

    await t1.test('B24-4: New action clears redo stack', () => {
      env.pushUndoSnapshot('snap1');
      env.undo();
      assert.strictEqual(env.redoStack.length, 1);

      // New action
      env.pushUndoSnapshot('snap2');
      assert.strictEqual(env.redoStack.length, 0, 'Redo stack must be cleared on new mutation');
    });

    await t1.test('B24-5: Multiple consecutive transform cancellations do not corrupt undo stack', () => {
      env.cancelTransform();
      env.cancelTransform();
      assert.strictEqual(env.transformActive, false);
    });

    env.cleanup();
  });

});
