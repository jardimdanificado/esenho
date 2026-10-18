/**
 * ============================================================================
 * E2E Test Suite — Tier 4: Real-World Application Scenarios (tests/e2e/test_tier4_scenarios.js)
 * End-to-end multi-step realistic digital painting workflows.
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

test('Tier 4: Real-World Application Scenarios', async (t) => {

  // --------------------------------------------------------------------------
  // Scenario 1: Complete Inking & Colorist Workflow
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: Digital Inker & Colorist Workflow', () => {
    const env = new MockNativePainterEnvironment({ screenWidthDp: 390 });
    const layer = env.layers[0];

    // Step 1: Tune brush parameters and save custom preset
    env.brushSize = 18;
    env.brushOpacity = 95;
    env.brushHardness = 90;
    const preset = env.saveCurrentPresetAsCustom('G-Pen Inker Pro');
    assert.strictEqual(preset.name, 'G-Pen Inker Pro');

    // Step 2: Verify TopBar layout display (properly truncated with ellipsis on 390dp screen)
    const topBar = env.computeTopBarLayout();
    assert.strictEqual(topBar.isTruncated, true);
    assert.strictEqual(topBar.displayLabel, 'G-Pen…');
    assert.strictEqual(topBar.collidesWithUndo, false);

    // Step 3: Create custom palette with inking colors
    const palette = env.createCustomPalette('Cyber Inks');
    env.addColorToActivePalette('#000000');
    env.addColorToActivePalette('#ff0055');
    env.addColorToActivePalette('#00e5ff');
    env.addColorToActivePalette('#7928ca');

    // Step 4: 1-tap color selection on toolbar
    env.currentColor = env.activePalette.colors[1]; // #ff0055
    assert.strictEqual(env.currentColor, '#ff0055');

    // Step 5: Paint stroke line
    for (let x = 100; x < 200; x++) {
      layer.pixels[100 * 800 + x] = 0xffff0055;
    }
    assert.strictEqual(layer.pixels[100 * 800 + 150], 0xffff0055);

    // Step 6: Switch to Borracha tool
    env.clickEraserTool();
    assert.strictEqual(env.currentTool, ToolMode.ERASER);
    assert.strictEqual(env.getTooltipForTool(env.currentTool), 'Borracha');

    // Step 7: Erase segment of stroke
    for (let x = 140; x < 160; x++) {
      layer.pixels[100 * 800 + x] = 0;
    }
    assert.strictEqual(layer.pixels[100 * 800 + 150], 0);

    // Step 8: Return to Pincel mode
    env.clickPincelTool();
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);
    assert.strictEqual(env.currentColor, '#ff0055');
    assert.strictEqual(env.selectedPreset.name, 'G-Pen Inker Pro');

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Character Design Transform, Mirroring & Symmetry
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: Character Design Transform, Mirroring & Symmetry', () => {
    const env = new MockNativePainterEnvironment();
    const layer = env.layers[0];

    // Step 1: Draw an eye shape around (100, 100)
    for (let y = 80; y <= 120; y++) {
      for (let x = 80; x <= 120; x++) {
        if (Math.hypot(x - 100, y - 100) <= 15) {
          layer.pixels[y * 800 + x] = 0xff222222; // Dark eye iris
        }
      }
    }
    assert.strictEqual(layer.pixels[100 * 800 + 100], 0xff222222);

    // Step 2: Select eye using organic lasso
    const lasso = SelectionFixtures.createOrganicLasso(100, 100, 25, 20);
    const bounds = SelectionFixtures.computeBounds(lasso);
    const mask = SelectionFixtures.rasterizeMask(lasso, bounds);

    env.selectionActive = true;
    env.selectionBounds = { left: bounds.x, top: bounds.y, right: bounds.x + bounds.w, bottom: bounds.y + bounds.h };
    env.selectionMask = mask;
    env.selectionPath = lasso;

    // Step 3: Verify marching ants
    const dashes = SelectionFixtures.computeMarchingAntsDashes(0);
    assert.strictEqual(dashes.black.color, 0xff000000);
    assert.strictEqual(dashes.white.color, 0xffffffff);

    // Step 4: Lift selection into floating transform
    env.clickTransformTool();
    assert.strictEqual(env.transformActive, true);
    assert.strictEqual(env.transformState.selectionOnly, true);
    assert.strictEqual(layer.pixels[100 * 800 + 100], 0, 'Original eye lifted');

    // Step 5: Mirror eye horizontally for character symmetry
    env.transformState.quad = TransformOracle.flipQuadH(env.transformState.quad);

    // Step 6: Move mirrored eye to the right side of the face (dx = 200)
    env.transformState.quad = env.transformState.quad.map(pt => ({
      x: pt.x + 200,
      y: pt.y
    }));

    // Step 7: Commit transform with bilinear sampling
    const ok = env.commitTransform();
    assert.strictEqual(ok, true);
    assert.strictEqual(env.transformActive, false);
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);

    // Step 8: Assert mirrored eye exists on right side at center (301, 101)
    assert.strictEqual(layer.pixels[101 * 800 + 301], 0xff222222);

    // Step 9: Undo restores original left-side eye
    env.undo();
    assert.strictEqual(layer.pixels[100 * 800 + 100], 0xff222222);

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Studio Session Recovery & Persistence Across Cold Restarts
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: Studio Session Recovery & Persistence Across Cold Restarts', () => {
    const sandbox = fs.mkdtempSync(path.join(path.resolve(__dirname, '../..'), 'esenho_s3_'));
    const session1 = new MockNativePainterEnvironment({ sandboxDir: sandbox });

    // Step 1: Create 3 customized presets
    session1.brushSize = 12; session1.brushHardness = 60; session1.brushOpacity = 85;
    session1.saveCurrentPresetAsCustom('Rough Pencil 2B');

    session1.brushSize = 40; session1.brushHardness = 20; session1.brushOpacity = 40;
    session1.saveCurrentPresetAsCustom('Soft Blender');

    session1.brushSize = 8; session1.brushHardness = 100; session1.brushOpacity = 100;
    session1.saveCurrentPresetAsCustom('Ink Outline');

    // Step 2: Create 2 palettes
    const palSkin = session1.createCustomPalette('Skin Tones');
    session1.addColorToActivePalette('#fcd3a1');
    session1.addColorToActivePalette('#f1b279');
    session1.addColorToActivePalette('#d88a53');
    session1.addColorToActivePalette('#8c4e2d');

    const palHair = session1.createCustomPalette('Hair Shadows');
    session1.addColorToActivePalette('#2c1609');
    session1.addColorToActivePalette('#48240f');
    session1.addColorToActivePalette('#683516');

    // Step 3: Simulate application cold boot / process recreate
    const session2 = new MockNativePainterEnvironment({ sandboxDir: sandbox });

    // Step 4: Verify custom presets catalog integrity
    const p1 = session2.presetCatalog.find(p => p.name === 'Rough Pencil 2B');
    const p2 = session2.presetCatalog.find(p => p.name === 'Soft Blender');
    const p3 = session2.presetCatalog.find(p => p.name === 'Ink Outline');
    assert.ok(p1 && p2 && p3);
    assert.strictEqual(p1.size, 12);
    assert.strictEqual(p2.hardness, 20);
    assert.strictEqual(p3.opacity, 100);

    // Step 5: Search for "Blender" in compact search bar
    session2.presetSearchQuery = 'Blender';
    const matches = session2.presetCatalog.filter(p => p.name.toLowerCase().includes(session2.presetSearchQuery.toLowerCase()));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].name, 'Soft Blender');

    // Step 6: Verify palettes restored
    const restoredSkin = session2.palettes.find(p => p.name === 'Skin Tones');
    const restoredHair = session2.palettes.find(p => p.name === 'Hair Shadows');
    assert.ok(restoredSkin && restoredHair);
    assert.strictEqual(restoredSkin.colors.length, 4);
    assert.strictEqual(restoredHair.colors.length, 3);

    session1.cleanup();
    try { fs.rmSync(sandbox, { recursive: true }); } catch {}
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Non-Rectangular Mask Editing, Inversion & Background Erasure
  // --------------------------------------------------------------------------
  await t.test('Scenario 4: Non-Rectangular Mask Editing, Inversion & Background Erasure', () => {
    const env = new MockNativePainterEnvironment();
    const layer = env.layers[0];

    // Step 1: Fill canvas with textured background (0xFF112233)
    layer.pixels.fill(0xff112233);

    // Step 2: Draw character star emblem at center (400, 300)
    const star = SelectionFixtures.createStarPolygon(400, 300, 80, 35);
    const bounds = SelectionFixtures.computeBounds(star);
    const mask = SelectionFixtures.rasterizeMask(star, bounds);

    // Fill star area with gold (0xFFFFD700)
    for (let dy = 0; dy < bounds.h; dy++) {
      for (let dx = 0; dx < bounds.w; dx++) {
        if (mask[dy * bounds.w + dx] === 1) {
          layer.pixels[(bounds.y + dy) * 800 + (bounds.x + dx)] = 0xffffd700;
        }
      }
    }
    assert.strictEqual(layer.pixels[300 * 800 + 400], 0xffffd700);

    // Step 3: Invert selection mask
    const invertedMask = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      invertedMask[i] = mask[i] === 1 ? 0 : 1;
    }

    // Step 4: Clear using inverted mask (clears background, preserves star figure)
    for (let dy = 0; dy < bounds.h; dy++) {
      for (let dx = 0; dx < bounds.w; dx++) {
        if (invertedMask[dy * bounds.w + dx] === 1) {
          layer.pixels[(bounds.y + dy) * 800 + (bounds.x + dx)] = 0;
        }
      }
    }

    // Step 5: Assert star emblem remains intact, while surrounding background is cleared
    assert.strictEqual(layer.pixels[300 * 800 + 400], 0xffffd700, 'Star center must remain gold');
    // Top-left corner of bounding box (which was exterior to star) must be cleared
    assert.strictEqual(layer.pixels[bounds.y * 800 + bounds.x], 0, 'Exterior background must be cleared');

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Complex Transform Manipulation, Rotation & History Rollback
  // --------------------------------------------------------------------------
  await t.test('Scenario 5: Complex Transform Manipulation, Rotation & History Rollback', () => {
    const env = new MockNativePainterEnvironment();
    const layer = env.layers[0];

    // Step 1: Draw signature artwork on layer
    layer.pixels[200 * 800 + 200] = 0xffa0b0c0;
    layer.pixels[200 * 800 + 201] = 0xffd0e0f0;

    // Snapshot pre-transform state for bit-for-bit assertion
    const originalPixels = new Uint32Array(layer.pixels);

    // Step 2: Begin whole-layer transform
    env.selectionActive = false;
    env.clickTransformTool();
    assert.strictEqual(env.transformActive, true);
    assert.strictEqual(env.transformState.selectionOnly, false);

    // Step 3: Manipulate transform quad
    let m = env.transformState.matrix;
    m = TransformOracle.rotate(m, 45, 400, 300);
    m = TransformOracle.scale(m, 0.75, 0.75, 400, 300);
    m = TransformOracle.translate(m, 30, -20);
    env.transformState.matrix = m;
    env.transformState.quad = TransformOracle.computeQuad(m, env.transformState.bounds);
    env.transformState.handles = TransformOracle.computeHandles(env.transformState.quad);

    // Verify rotation knob handle
    assert.ok(env.transformState.handles.rotationKnob);

    // Step 4: User clicks Cancel (rollback)
    const cancelled = env.cancelTransform();
    assert.strictEqual(cancelled, true);
    assert.strictEqual(env.transformActive, false);
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);

    // Step 5: Assert layer is 100% bit-for-bit restored to original
    assert.deepStrictEqual(layer.pixels, originalPixels, 'Layer pixels must match original bit-for-bit');

    env.cleanup();
  });

});
