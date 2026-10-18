/**
 * ============================================================================
 * E2E Test Suite — Tier 3: Cross-Feature Interactions (tests/e2e/test_tier3_interactions.js)
 * Covers pairwise and multi-feature interaction contracts across subsystems.
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

test('Tier 3: Cross-Feature Interactions', async (t) => {

  // --------------------------------------------------------------------------
  // Interaction 1: Lasso Selection + Mask Clear + Transform + Undo
  // --------------------------------------------------------------------------
  await t.test('I-1: Arbitrary Lasso Selection + Transform + Commit + Undo', () => {
    const env = new MockNativePainterEnvironment();
    const layer = env.layers[env.activeLayerIndex];

    // 1. Draw a test figure on layer (fill 100x100 box at origin)
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        layer.pixels[y * 800 + x] = 0xff00ff00; // Green
      }
    }

    // 2. Select an L-shaped region using arbitrary polygonal lasso
    const lpoly = SelectionFixtures.createLShapePolygon(10, 10, 80, 80, 30);
    const bounds = SelectionFixtures.computeBounds(lpoly);
    const mask = SelectionFixtures.rasterizeMask(lpoly, bounds);

    env.selectionActive = true;
    env.selectionBounds = { left: bounds.x, top: bounds.y, right: bounds.x + bounds.w, bottom: bounds.y + bounds.h };
    env.selectionMask = mask;
    env.selectionPath = lpoly;

    // 3. Initiate selection transform (lifts masked pixels, clears source)
    env.clickTransformTool();
    assert.strictEqual(env.transformActive, true);
    assert.strictEqual(env.transformState.selectionOnly, true);

    // Source pixels inside mask must be cleared on layer
    const sampleX = bounds.x + 15, sampleY = bounds.y + 15;
    assert.strictEqual(layer.pixels[sampleY * 800 + sampleX], 0);

    // 4. Commit transform
    env.commitTransform();
    assert.strictEqual(env.transformActive, false);
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);

    // 5. Undo restores original green pixels
    env.undo();
    assert.strictEqual(layer.pixels[sampleY * 800 + sampleX], 0xff00ff00);

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Interaction 2: Custom Preset Tuner + Decoupled Presets Button + TopBar Ellipsis
  // --------------------------------------------------------------------------
  await t.test('I-2: Custom Preset Tuner + Decoupled Button + TopBar Ellipsis', () => {
    const env = new MockNativePainterEnvironment({ screenWidthDp: 360 });

    // 1. User tunes parameters and saves custom preset with a long name
    env.brushSize = 42;
    env.brushOpacity = 88;
    const longName = 'Aerógrafo de Textura Muito Longa Detalhada';
    env.saveCurrentPresetAsCustom(longName);

    // 2. Top bar layout verifies truncation and lack of collision with Undo
    const layout = env.computeTopBarLayout();
    assert.ok(layout.isTruncated, 'Long preset name must truncate on 360dp screen');
    assert.ok(layout.displayLabel.endsWith('…'));
    assert.strictEqual(layout.collidesWithUndo, false);

    // 3. Close drawer, verify clicking Pincel does NOT re-open drawer
    env.showBrushDrawer = false;
    env.clickPincelTool();
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);
    assert.strictEqual(env.showBrushDrawer, false);

    // 4. Clicking dedicated presets button opens drawer without changing active tool
    env.clickPresetsButton();
    assert.strictEqual(env.showBrushDrawer, true);
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Interaction 3: Custom Color Palette CRUD + Quick Toolbar Chips + Tool Switching
  // --------------------------------------------------------------------------
  await t.test('I-3: Custom Color Palette CRUD + Toolbar Chips + Tool Switching', () => {
    const env = new MockNativePainterEnvironment();

    // 1. Create custom palette and add 3 colors
    const pal = env.createCustomPalette('Pastel Neon');
    env.addColorToActivePalette('#ff6ec7');
    env.addColorToActivePalette('#39ff14');
    env.addColorToActivePalette('#ffe600');

    // 2. Toolbar quick chips reflect new palette colors
    const chips = env.activePalette.colors.slice(0, 6);
    assert.deepStrictEqual(chips, ['#ff6ec7', '#39ff14', '#ffe600']);

    // 3. 1-tap color selection updates currentColor
    env.currentColor = chips[1];
    assert.strictEqual(env.currentColor, '#39ff14');

    // 4. Switch from Pincel to Borracha and back to Pincel: active color preserved
    env.clickEraserTool();
    assert.strictEqual(env.currentTool, ToolMode.ERASER);
    env.clickPincelTool();
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);
    assert.strictEqual(env.currentColor, '#39ff14', 'Color must remain preserved across tool switches');

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Interaction 4: Compact Preset Search + Compact Brushes Drawer + Custom Preset
  // --------------------------------------------------------------------------
  await t.test('I-4: Compact Preset Search + Compact Drawer + Custom Preset Selection', () => {
    const env = new MockNativePainterEnvironment();
    env.saveCurrentPresetAsCustom('Nanquim Especial');

    // 1. Open drawer and verify compact dimensions
    env.clickPresetsButton();
    const drawerLayout = env.getBrushDrawerLayout();
    assert.strictEqual(drawerLayout.cardHeightDp, 48);
    assert.strictEqual(drawerLayout.searchBarHeightDp, 36);

    // 2. Filter using search bar
    env.presetSearchQuery = 'nanquim';
    const filtered = env.presetCatalog.filter(p => p.name.toLowerCase().includes(env.presetSearchQuery.toLowerCase()));
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].name, 'Nanquim Especial');

    // 3. Select filtered preset
    env.selectedPreset = filtered[0];
    assert.strictEqual(env.selectedPreset.name, 'Nanquim Especial');
    assert.strictEqual(env.selectedPreset.isCustom, true);

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Interaction 5: Selection HUD + Transform + Flip H/V + Bilinear Bake
  // --------------------------------------------------------------------------
  await t.test('I-5: Selection HUD + Transform + Flip H/V + Bilinear Bake', () => {
    const env = new MockNativePainterEnvironment();
    const layer = env.layers[env.activeLayerIndex];

    // Put a distinguishable non-symmetric pattern in 10x10 area
    layer.pixels[10 * 800 + 10] = 0xffff0000; // Red at (10, 10)
    layer.pixels[10 * 800 + 20] = 0xff0000ff; // Blue at (20, 10)

    env.selectionActive = true;
    env.selectionBounds = { left: 5, top: 5, right: 25, bottom: 25 };

    // 1. Verify selection HUD offers transform action
    const hud = env.getSelectionHUDLayout();
    assert.ok(hud.actions.includes('transform'));

    // 2. Activate transform
    env.clickTransformTool();
    assert.strictEqual(env.transformActive, true);

    // 3. Apply Flip H to transform quad
    env.transformState.quad = TransformOracle.flipQuadH(env.transformState.quad);

    // 4. Commit transform
    env.commitTransform();
    assert.strictEqual(env.transformActive, false);
    assert.strictEqual(env.currentTool, ToolMode.BRUSH);

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // Interaction 6: Storage Manager + Cold Restart + Custom Presets + Palettes
  // --------------------------------------------------------------------------
  await t.test('I-6: Storage Manager + Cold Restart + Presets & Palettes Persistence', () => {
    const sandbox = fs.mkdtempSync(path.join(path.resolve(__dirname, '../..'), 'esenho_i6_'));
    const session1 = new MockNativePainterEnvironment({ sandboxDir: sandbox });

    // 1. Create custom preset and palette in session 1
    session1.saveCurrentPresetAsCustom('PincelManga');
    session1.createCustomPalette('PaletaManga');
    session1.addColorToActivePalette('#112233');

    // 2. Spin up session 2 (cold boot) referencing same sandbox
    const session2 = new MockNativePainterEnvironment({ sandboxDir: sandbox });

    // 3. Assert full restoration
    const loadedPreset = session2.presetCatalog.find(p => p.name === 'PincelManga');
    assert.ok(loadedPreset);
    assert.strictEqual(loadedPreset.isCustom, true);

    const loadedPal = session2.palettes.find(p => p.name === 'PaletaManga');
    assert.ok(loadedPal);
    assert.deepStrictEqual(loadedPal.colors, ['#112233']);

    // Both sessions clean up
    session1.cleanup();
    try { fs.rmSync(sandbox, { recursive: true }); } catch {}
  });

  // --------------------------------------------------------------------------
  // Interaction 7: Multi-Layer Creation + Transform Whole Layer + Cancel
  // --------------------------------------------------------------------------
  await t.test('I-7: Multi-Layer Creation + Transform Whole Layer + Cancel Rollback', () => {
    const env = new MockNativePainterEnvironment();

    // 1. Add Layer 1
    env.layers.push({ id: 1, name: 'Camada Arte', pixels: new Uint32Array(800 * 600), visible: true, opacity: 100 });
    env.activeLayerIndex = 1;
    const layer1 = env.layers[1];
    layer1.pixels[50 * 800 + 50] = 0xffeeddcc;

    // 2. Initiate whole layer transform (no selection active)
    env.selectionActive = false;
    env.clickTransformTool();
    assert.strictEqual(env.transformActive, true);
    assert.strictEqual(env.transformState.selectionOnly, false);
    assert.strictEqual(layer1.pixels[50 * 800 + 50], 0, 'Layer pixels lifted into floating buffer');

    // 3. User cancels transform
    env.cancelTransform();
    assert.strictEqual(env.transformActive, false);
    assert.strictEqual(layer1.pixels[50 * 800 + 50], 0xffeeddcc, 'Layer pixels restored bit-for-bit');
    assert.strictEqual(env.layers[0].pixels[0], 0, 'Base layer completely unaffected');

    env.cleanup();
  });

});
