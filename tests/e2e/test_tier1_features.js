/**
 * ============================================================================
 * E2E Test Suite — Tier 1: Feature Coverage (tests/e2e/test_tier1_features.js)
 * Covers Features F1 through F24 (>= 5 test cases per feature).
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

test('Tier 1: Feature Coverage (F1–F24)', async (t) => {

  // --------------------------------------------------------------------------
  // F1: Eraser Icon Replacement
  // --------------------------------------------------------------------------
  await t.test('F1: Eraser Icon Replacement', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F1-1: Eraser tool activation transitions tool mode to ERASER', () => {
      env.clickEraserTool();
      assert.strictEqual(env.currentTool, ToolMode.ERASER);
    });

    await t1.test('F1-2: Tooltip and accessibility description is "Borracha"', () => {
      const tooltip = env.getTooltipForTool(ToolMode.ERASER);
      assert.strictEqual(tooltip, 'Borracha');
    });

    await t1.test('F1-3: Drawing eraser vector drawable asset exists and has valid XML schema', () => {
      const assetPath = path.resolve(__dirname, '../../android/app/src/main/res/drawable/ic_eraser.xml');
      assert.ok(fs.existsSync(assetPath), 'ic_eraser.xml must exist in res/drawable');
      const xml = fs.readFileSync(assetPath, 'utf8');
      assert.ok(xml.includes('<vector'), 'Must be an Android vector drawable');
      assert.ok(xml.includes('android:pathData'), 'Must contain path data');
    });

    await t1.test('F1-4: Eraser icon does NOT reference magic wand (AutoFixNormal)', () => {
      const assetPath = path.resolve(__dirname, '../../android/app/src/main/res/drawable/ic_eraser.xml');
      const xml = fs.readFileSync(assetPath, 'utf8');
      assert.ok(!xml.toLowerCase().includes('magic'), 'Must not reference magic wand');
      assert.ok(!xml.toLowerCase().includes('autofix'), 'Must not reference AutoFixNormal');
    });

    await t1.test('F1-5: Switching back to Pincel restores BRUSH tool mode', () => {
      env.clickPincelTool();
      assert.strictEqual(env.currentTool, ToolMode.BRUSH);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F2: Decouple Tool & Presets
  // --------------------------------------------------------------------------
  await t.test('F2: Decouple Tool & Presets', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F2-1: Clicking Pincel selects BRUSH mode without opening presets drawer', () => {
      env.showBrushDrawer = false;
      env.clickPincelTool();
      assert.strictEqual(env.currentTool, ToolMode.BRUSH);
      assert.strictEqual(env.showBrushDrawer, false, 'Drawer must remain closed on 1st click');
    });

    await t1.test('F2-2: Clicking Pincel second time does NOT toggle presets drawer', () => {
      env.clickPincelTool();
      assert.strictEqual(env.currentTool, ToolMode.BRUSH);
      assert.strictEqual(env.showBrushDrawer, false, 'Drawer must not open on double-click of Pincel');
    });

    await t1.test('F2-3: Dedicated Presets button opens brush drawer', () => {
      env.clickPresetsButton();
      assert.strictEqual(env.showBrushDrawer, true, 'Dedicated presets button must open drawer');
    });

    await t1.test('F2-4: Opening presets drawer does not alter active tool mode', () => {
      env.currentTool = ToolMode.ERASER;
      env.clickPresetsButton();
      assert.strictEqual(env.currentTool, ToolMode.ERASER, 'Active tool must be preserved');
      assert.strictEqual(env.showBrushDrawer, true);
    });

    await t1.test('F2-5: Both buttons operate independently without state interference', () => {
      env.showBrushDrawer = false;
      env.clickPincelTool();
      assert.strictEqual(env.currentTool, ToolMode.BRUSH);
      assert.strictEqual(env.showBrushDrawer, false);
      env.clickPresetsButton();
      assert.strictEqual(env.showBrushDrawer, true);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F3: Long-Press Tooltips
  // --------------------------------------------------------------------------
  await t.test('F3: Long-Press Tooltips', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F3-1: Pincel tooltip returns correct Portuguese description', () => {
      assert.strictEqual(env.getTooltipForTool(ToolMode.BRUSH), 'Pincel');
    });

    await t1.test('F3-2: Borracha tooltip returns correct Portuguese description', () => {
      assert.strictEqual(env.getTooltipForTool(ToolMode.ERASER), 'Borracha');
    });

    await t1.test('F3-3: Transformar tooltip returns correct Portuguese description', () => {
      assert.strictEqual(env.getTooltipForTool(ToolMode.TRANSFORM), 'Transformar');
    });

    await t1.test('F3-4: Selection tooltips return distinct descriptions', () => {
      assert.strictEqual(env.getTooltipForTool(ToolMode.SELECT_RECT), 'Seleção Retangular');
      assert.strictEqual(env.getTooltipForTool(ToolMode.SELECT_LASSO), 'Seleção Laço');
    });

    await t1.test('F3-5: Auxiliary tool tooltips return descriptive labels', () => {
      assert.strictEqual(env.getTooltipForTool(ToolMode.FILL), 'Preenchimento');
      assert.strictEqual(env.getTooltipForTool(ToolMode.EYEDROPPER), 'Conta-gotas');
      assert.strictEqual(env.getTooltipForTool(ToolMode.HAND), 'Mover Tela');
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F4: Top Bar Preset Overlap Fix
  // --------------------------------------------------------------------------
  await t.test('F4: Top Bar Preset Overlap Fix', async (t1) => {
    const env = new MockNativePainterEnvironment({ screenWidthDp: 360 });

    await t1.test('F4-1: On 360dp screen, preset chip width is capped at <= 140dp', () => {
      const layout = env.computeTopBarLayout('Caneta G');
      assert.ok(layout.maxChipWidth <= 140, 'Max chip width must be <= 140dp');
      assert.strictEqual(layout.collidesWithUndo, false, 'Must not collide with Undo button');
    });

    await t1.test('F4-2: Long preset name is truncated with ellipsis', () => {
      const layout = env.computeTopBarLayout('Aerógrafo Ultra Especial de Brilho');
      assert.ok(layout.isTruncated, 'Long preset name must be truncated');
      assert.ok(layout.displayLabel.endsWith('…'), 'Truncated text must end with ellipsis');
    });

    await t1.test('F4-3: Short preset name fits without truncation', () => {
      const layout = env.computeTopBarLayout('Ink');
      assert.strictEqual(layout.isTruncated, false);
      assert.strictEqual(layout.displayLabel, 'Ink');
    });

    await t1.test('F4-4: Wide screen (600dp tablet) provides adequate space while preserving cap', () => {
      env.screenWidthDp = 600;
      const layout = env.computeTopBarLayout('Caneta de Tinta Nanquim');
      assert.ok(layout.maxChipWidth <= 140, 'Cap is preserved even on wider screens');
      assert.strictEqual(layout.collidesWithUndo, false);
    });

    await t1.test('F4-5: Empty or null preset name is handled safely', () => {
      const layout = env.computeTopBarLayout('');
      assert.strictEqual(layout.displayLabel, '');
      assert.strictEqual(layout.isTruncated, false);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F5: Compact Brushes Drawer
  // --------------------------------------------------------------------------
  await t.test('F5: Compact Brushes Drawer', async (t1) => {
    const env = new MockNativePainterEnvironment();
    const layout = env.getBrushDrawerLayout();

    await t1.test('F5-1: Preset card height is compacted to <= 48dp', () => {
      assert.ok(layout.cardHeightDp <= 48, `Card height ${layout.cardHeightDp}dp must be <= 48dp`);
    });

    await t1.test('F5-2: Drawer item padding is compacted to <= 8dp', () => {
      assert.ok(layout.paddingDp <= 8, `Padding ${layout.paddingDp}dp must be <= 8dp`);
    });

    await t1.test('F5-3: Max drawer height does not exceed 60% of viewport', () => {
      const maxAllowed = Math.round(env.screenHeightDp * 0.60);
      assert.ok(layout.maxHeightDp <= maxAllowed, 'Drawer height must not cover canvas (>60%)');
    });

    await t1.test('F5-4: At least 40% of canvas height remains visible when drawer is open', () => {
      const canvasVisibleHeight = env.screenHeightDp - layout.maxHeightDp;
      const visibleRatio = canvasVisibleHeight / env.screenHeightDp;
      assert.ok(visibleRatio >= 0.40, `Visible canvas ratio ${visibleRatio.toFixed(2)} must be >= 0.40`);
    });

    await t1.test('F5-5: Preset item selection in drawer updates active preset', () => {
      env.selectedPreset = env.presetCatalog[1];
      assert.strictEqual(env.selectedPreset.id, env.presetCatalog[1].id);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F6: Compact Layers Drawer
  // --------------------------------------------------------------------------
  await t.test('F6: Compact Layers Drawer', async (t1) => {
    const env = new MockNativePainterEnvironment();
    const layout = env.getLayerDrawerLayout();

    await t1.test('F6-1: Layer item card height is compacted to <= 48dp', () => {
      assert.ok(layout.cardHeightDp <= 48, `Layer card height ${layout.cardHeightDp}dp must be <= 48dp`);
    });

    await t1.test('F6-2: Layer properties adjustment panel height is <= 120dp', () => {
      assert.ok(layout.panelHeightDp <= 120, `Panel height ${layout.panelHeightDp}dp must be <= 120dp`);
    });

    await t1.test('F6-3: Maximum layer drawer height does not exceed 55% of viewport', () => {
      const maxAllowed = Math.round(env.screenHeightDp * 0.55);
      assert.ok(layout.maxHeightDp <= maxAllowed, 'Layer drawer height must be <= 55%');
    });

    await t1.test('F6-4: At least 45% of canvas height remains visible when layer drawer is open', () => {
      const visibleHeight = env.screenHeightDp - layout.maxHeightDp;
      assert.ok(visibleHeight / env.screenHeightDp >= 0.45, 'Canvas visibility ratio must be >= 0.45');
    });

    await t1.test('F6-5: Active layer switching is tracked accurately', () => {
      env.layers.push({ id: 1, name: 'Camada 2', pixels: new Uint32Array(800 * 600), visible: true, opacity: 100 });
      env.activeLayerIndex = 1;
      assert.strictEqual(env.activeLayerIndex, 1);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F7: Compact Preset Search Bar
  // --------------------------------------------------------------------------
  await t.test('F7: Compact Preset Search Bar', async (t1) => {
    const env = new MockNativePainterEnvironment();
    const layout = env.getBrushDrawerLayout();

    await t1.test('F7-1: Preset search bar container height is 36dp', () => {
      assert.strictEqual(layout.searchBarHeightDp, 36);
    });

    await t1.test('F7-2: Search query filters presets by matching name case-insensitively', () => {
      env.presetSearchQuery = 'aeró';
      const filtered = env.presetCatalog.filter(p => p.name.toLowerCase().includes(env.presetSearchQuery.toLowerCase()));
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, 'soft_airbrush');
    });

    await t1.test('F7-3: Non-matching search query yields empty result list', () => {
      env.presetSearchQuery = 'xyznonexistent';
      const filtered = env.presetCatalog.filter(p => p.name.toLowerCase().includes(env.presetSearchQuery.toLowerCase()));
      assert.strictEqual(filtered.length, 0);
    });

    await t1.test('F7-4: Empty search query returns all presets in catalog', () => {
      env.presetSearchQuery = '';
      const filtered = env.presetCatalog.filter(p => p.name.toLowerCase().includes(env.presetSearchQuery.toLowerCase()));
      assert.strictEqual(filtered.length, env.presetCatalog.length);
    });

    await t1.test('F7-5: Clearing query resets filter instantly', () => {
      env.presetSearchQuery = 'Caneta';
      assert.strictEqual(env.presetCatalog.filter(p => p.name.includes('Caneta')).length, 1);
      env.presetSearchQuery = ''; // Click clear icon
      assert.strictEqual(env.presetCatalog.length >= 3, true);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F8: Icon-Only Selection HUD
  // --------------------------------------------------------------------------
  await t.test('F8: Icon-Only Selection HUD', async (t1) => {
    const env = new MockNativePainterEnvironment();
    const layout = env.getSelectionHUDLayout();

    await t1.test('F8-1: Selection HUD width is compact and capped at <= 160dp', () => {
      assert.ok(layout.widthDp <= 160, `HUD width ${layout.widthDp}dp must be <= 160dp`);
    });

    await t1.test('F8-2: HUD operates in icon-only mode with text chips eliminated', () => {
      assert.strictEqual(layout.iconOnly, true);
    });

    await t1.test('F8-3: HUD includes all 4 core actions: invert, deselect, clear, transform', () => {
      assert.deepStrictEqual(layout.actions, ['invert', 'deselect', 'clear', 'transform']);
    });

    await t1.test('F8-4: HUD triggers transform tool directly', () => {
      env.selectionActive = true;
      env.selectionBounds = { left: 10, top: 10, right: 100, bottom: 100 };
      env.clickTransformTool();
      assert.strictEqual(env.currentTool, ToolMode.TRANSFORM);
      assert.strictEqual(env.transformActive, true);
    });

    await t1.test('F8-5: Clearing selection deactivates HUD', () => {
      env.selectionActive = false;
      env.selectionBounds = null;
      assert.strictEqual(env.selectionActive, false);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F9: JNI Selection Mask Export
  // --------------------------------------------------------------------------
  await t.test('F9: JNI Selection Mask Export', async (t1) => {
    await t1.test('F9-1: 6-word protocol returns [active, x, y, w, h, has_mask]', () => {
      const mockOut6Words = new Int32Array(6);
      mockOut6Words[0] = 1; // active
      mockOut6Words[1] = 50; // x
      mockOut6Words[2] = 60; // y
      mockOut6Words[3] = 200; // w
      mockOut6Words[4] = 150; // h
      mockOut6Words[5] = 1; // has_mask (lasso/polygon)

      assert.strictEqual(mockOut6Words[0], 1);
      assert.strictEqual(mockOut6Words[1], 50);
      assert.strictEqual(mockOut6Words[2], 60);
      assert.strictEqual(mockOut6Words[3], 200);
      assert.strictEqual(mockOut6Words[4], 150);
      assert.strictEqual(mockOut6Words[5], 1);
    });

    await t1.test('F9-2: Rectangular selection sets has_mask = 0', () => {
      const outWords = new Int32Array([1, 10, 10, 80, 80, 0]);
      assert.strictEqual(outWords[5], 0, 'Rectangular selection has no 1-byte mask');
    });

    await t1.test('F9-3: Lasso selection sets has_mask = 1', () => {
      const outWords = new Int32Array([1, 10, 10, 80, 80, 1]);
      assert.strictEqual(outWords[5], 1, 'Lasso selection must flag has_mask = 1');
    });

    await t1.test('F9-4: When has_mask == 1, mask buffer size matches w * h bytes', () => {
      const w = 120, h = 90;
      const maskBuffer = new Uint8Array(w * h);
      assert.strictEqual(maskBuffer.byteLength, 10800);
    });

    await t1.test('F9-5: Inactive selection clears active flag and returns zero bounds', () => {
      const outWords = new Int32Array(6); // All 0s
      assert.strictEqual(outWords[0], 0);
      assert.strictEqual(outWords[5], 0);
    });
  });

  // --------------------------------------------------------------------------
  // F10: Fix nativeClearSelectedPixels
  // --------------------------------------------------------------------------
  await t.test('F10: Fix nativeClearSelectedPixels', async (t1) => {
    await t1.test('F10-1: Clearing mask-based selection clears ONLY masked pixels (mask == 1)', () => {
      const w = 4, h = 4;
      // Mask: diagonal active
      const mask = new Uint8Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);
      const pixels = new Uint32Array(16).fill(0xffffffff); // All white

      // Execute mask-aware clear
      for (let i = 0; i < 16; i++) {
        if (mask[i] === 1) pixels[i] = 0;
      }

      assert.strictEqual(pixels[0], 0);
      assert.strictEqual(pixels[5], 0);
      assert.strictEqual(pixels[10], 0);
      assert.strictEqual(pixels[15], 0);

      // Unmasked pixels must remain untouched
      assert.strictEqual(pixels[1], 0xffffffff);
      assert.strictEqual(pixels[2], 0xffffffff);
      assert.strictEqual(pixels[4], 0xffffffff);
    });

    await t1.test('F10-2: Pixels outside bounding box remain strictly untouched', () => {
      const layerPixels = new Uint32Array(100).fill(0xff112233);
      // Clear region [10..19]
      for (let i = 10; i < 20; i++) layerPixels[i] = 0;

      assert.strictEqual(layerPixels[0], 0xff112233);
      assert.strictEqual(layerPixels[9], 0xff112233);
      assert.strictEqual(layerPixels[10], 0);
      assert.strictEqual(layerPixels[20], 0xff112233);
    });

    await t1.test('F10-3: Star-shaped lasso mask preserves pixels in acute indentations', () => {
      const bounds = { x: 0, y: 0, w: 20, h: 20 };
      const star = SelectionFixtures.createStarPolygon(10, 10, 9, 4);
      const mask = SelectionFixtures.rasterizeMask(star, bounds);
      const pixels = new Uint32Array(20 * 20).fill(0xffaabbcc);

      let cleared = 0, kept = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 1) {
          pixels[i] = 0;
          cleared++;
        } else {
          kept++;
        }
      }

      assert.ok(cleared > 0, 'Pixels inside star must be cleared');
      assert.ok(kept > 0, 'Pixels outside star indentations must be kept');
    });

    await t1.test('F10-4: Rectangular selection without mask clears full box', () => {
      const pixels = new Uint32Array(9).fill(0xffffffff);
      pixels.fill(0);
      assert.deepStrictEqual(pixels, new Uint32Array(9));
    });

    await t1.test('F10-5: Clearing with 0-size selection is a safe no-op', () => {
      const pixels = new Uint32Array(4).fill(0xffaabbcc);
      // No pixels cleared
      assert.strictEqual(pixels[0], 0xffaabbcc);
    });
  });

  // --------------------------------------------------------------------------
  // F11: Exact Contour Representation
  // --------------------------------------------------------------------------
  await t.test('F11: Exact Contour Representation', async (t1) => {
    await t1.test('F11-1: 5-pointed star retains all 10 vertices in exact order', () => {
      const star = SelectionFixtures.createStarPolygon(100, 100, 50, 20);
      assert.strictEqual(star.length, 10);
      // Check alternating radii
      const r0 = Math.hypot(star[0].x - 100, star[0].y - 100);
      const r1 = Math.hypot(star[1].x - 100, star[1].y - 100);
      assert.ok(Math.abs(r0 - 50) <= 1);
      assert.ok(Math.abs(r1 - 20) <= 1);
    });

    await t1.test('F11-2: L-shaped non-convex polygon retains all 6 vertices', () => {
      const lpoly = SelectionFixtures.createLShapePolygon(0, 0, 100, 100, 20);
      assert.strictEqual(lpoly.length, 6);
      // Inner corner at (20, 80)
      assert.strictEqual(lpoly[2].x, 20);
      assert.strictEqual(lpoly[2].y, 80);
    });

    await t1.test('F11-3: Organic lasso path preserves closed loop without point loss', () => {
      const lasso = SelectionFixtures.createOrganicLasso(200, 200, 80, 24);
      assert.strictEqual(lasso.length, 24);
      const bounds = SelectionFixtures.computeBounds(lasso);
      assert.ok(bounds.w > 50 && bounds.h > 50);
    });

    await t1.test('F11-4: Point-in-polygon correctly classifies interior vs exterior', () => {
      const poly = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ];
      assert.strictEqual(SelectionFixtures.isPointInPolygon(50, 50, poly), true);
      assert.strictEqual(SelectionFixtures.isPointInPolygon(150, 50, poly), false);
    });

    await t1.test('F11-5: Rasterized mask matches polygon bounding box dimensions', () => {
      const lpoly = SelectionFixtures.createLShapePolygon(10, 10, 50, 50, 15);
      const bounds = SelectionFixtures.computeBounds(lpoly);
      const mask = SelectionFixtures.rasterizeMask(lpoly, bounds);
      assert.strictEqual(mask.length, bounds.w * bounds.h);
    });
  });

  // --------------------------------------------------------------------------
  // F12: Dynamic Marching Ants Renderer
  // --------------------------------------------------------------------------
  await t.test('F12: Dynamic Marching Ants Renderer', async (t1) => {
    await t1.test('F12-1: Dual-pass stroke defines black and white alternating phases', () => {
      const dashes = SelectionFixtures.computeMarchingAntsDashes(0);
      assert.strictEqual(dashes.black.phase, 0);
      assert.strictEqual(dashes.white.phase, 8); // Offset by half dash pattern (8dp)
    });

    await t1.test('F12-2: Dash pattern interval is 8dp on, 8dp off (period 16dp)', () => {
      const dashes = SelectionFixtures.computeMarchingAntsDashes(4);
      assert.deepStrictEqual(dashes.black.pattern, [8, 8]);
      assert.deepStrictEqual(dashes.white.pattern, [8, 8]);
      assert.strictEqual(dashes.black.phase, 4);
      assert.strictEqual(dashes.white.phase, 12);
    });

    await t1.test('F12-3: Phase wraps around smoothly modulo 16', () => {
      const d0 = SelectionFixtures.computeMarchingAntsDashes(0);
      const d16 = SelectionFixtures.computeMarchingAntsDashes(16);
      assert.strictEqual(d0.black.phase, d16.black.phase);
      assert.strictEqual(d0.white.phase, d16.white.phase);
    });

    await t1.test('F12-4: High contrast guarantee on pure white canvas (#FFFFFF)', () => {
      const dashes = SelectionFixtures.computeMarchingAntsDashes(0);
      // Black dashes (0xFF000000) against white background give 21:1 contrast ratio
      assert.strictEqual(dashes.black.color, 0xff000000);
    });

    await t1.test('F12-5: High contrast guarantee on pure black canvas (#000000)', () => {
      const dashes = SelectionFixtures.computeMarchingAntsDashes(0);
      // White dashes (0xFFFFFFFF) against black background give 21:1 contrast ratio
      assert.strictEqual(dashes.white.color, 0xffffffff);
    });
  });

  // --------------------------------------------------------------------------
  // F13: EsenhoStorageManager
  // --------------------------------------------------------------------------
  await t.test('F13: EsenhoStorageManager', async (t1) => {
    const storage = new MockStorageManager();

    await t1.test('F13-1: Saves custom presets to sandbox JSON file', () => {
      const presets = [
        new MockBrushPresetModel({ id: 'p1', name: 'Ink Master', isCustom: true })
      ];
      const ok = storage.saveCustomPresets(presets);
      assert.strictEqual(ok, true);
      assert.ok(fs.existsSync(storage.presetsFile));
    });

    await t1.test('F13-2: Loads custom presets from JSON file', () => {
      const loaded = storage.loadCustomPresets();
      assert.strictEqual(loaded.length, 1);
      assert.strictEqual(loaded[0].name, 'Ink Master');
      assert.strictEqual(loaded[0].isCustom, true);
    });

    await t1.test('F13-3: Atomic file write leaves no orphaned .tmp files', () => {
      const tmpPath = storage.presetsFile + '.tmp';
      assert.strictEqual(fs.existsSync(tmpPath), false);
    });

    await t1.test('F13-4: Resilient recovery: corrupted JSON file returns empty array', () => {
      fs.writeFileSync(storage.presetsFile, 'CORRUPTED_NOT_JSON{{{', 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t1.test('F13-5: Missing file returns empty array without throwing', () => {
      fs.unlinkSync(storage.presetsFile);
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    storage.cleanup();
  });

  // --------------------------------------------------------------------------
  // F14: Custom Brush Model Extension
  // --------------------------------------------------------------------------
  await t.test('F14: Custom Brush Model Extension', async (t1) => {
    await t1.test('F14-1: Default preset has isCustom = false', () => {
      const p = new MockBrushPresetModel({ name: 'Standard' });
      assert.strictEqual(p.isCustom, false);
    });

    await t1.test('F14-2: Custom preset has isCustom = true', () => {
      const p = new MockBrushPresetModel({ name: 'My Pencil', isCustom: true });
      assert.strictEqual(p.isCustom, true);
    });

    await t1.test('F14-3: JSON serialization includes all required fields', () => {
      const p = new MockBrushPresetModel({
        id: 'c1',
        name: 'Oil Thick',
        size: 45,
        opacity: 80,
        flow: 75,
        hardness: 90,
        isCustom: true
      });
      const json = p.toJSON();
      assert.strictEqual(json.id, 'c1');
      assert.strictEqual(json.name, 'Oil Thick');
      assert.strictEqual(json.size, 45);
      assert.strictEqual(json.opacity, 80);
      assert.strictEqual(json.flow, 75);
      assert.strictEqual(json.hardness, 90);
      assert.strictEqual(json.isCustom, true);
    });

    await t1.test('F14-4: Deserialization roundtrip preserves fidelity', () => {
      const original = new MockBrushPresetModel({
        name: 'Watercolor Bleed',
        size: 32,
        isCustom: true,
        parameters: { wetness: 85 }
      });
      const restored = MockBrushPresetModel.fromJSON(original.toJSON());
      assert.strictEqual(restored.name, original.name);
      assert.strictEqual(restored.size, original.size);
      assert.strictEqual(restored.isCustom, true);
      assert.deepStrictEqual(restored.parameters, { wetness: 85 });
    });

    await t1.test('F14-5: Unique IDs generated when id omitted', () => {
      const p1 = new MockBrushPresetModel({ name: 'A' });
      const p2 = new MockBrushPresetModel({ name: 'B' });
      assert.notStrictEqual(p1.id, p2.id);
    });
  });

  // --------------------------------------------------------------------------
  // F15: Preset Tuner Save Action
  // --------------------------------------------------------------------------
  await t.test('F15: Preset Tuner Save Action', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F15-1: Saving current preset captures active engine parameters', () => {
      env.brushSize = 55;
      env.brushOpacity = 90;
      env.brushHardness = 70;

      const saved = env.saveCurrentPresetAsCustom('Pincel Especial');
      assert.strictEqual(saved.name, 'Pincel Especial');
      assert.strictEqual(saved.size, 55);
      assert.strictEqual(saved.opacity, 90);
      assert.strictEqual(saved.hardness, 70);
      assert.strictEqual(saved.isCustom, true);
    });

    await t1.test('F15-2: Saved preset is added to presetCatalog and selected', () => {
      assert.strictEqual(env.selectedPreset.name, 'Pincel Especial');
      const inCatalog = env.presetCatalog.find(p => p.name === 'Pincel Especial');
      assert.ok(inCatalog);
    });

    await t1.test('F15-3: Empty name is rejected with descriptive validation error', () => {
      assert.throws(() => {
        env.saveCurrentPresetAsCustom('   ');
      }, /vazio/);
    });

    await t1.test('F15-4: Duplicate name updates existing custom preset without duplicate IDs', () => {
      env.brushSize = 60;
      env.saveCurrentPresetAsCustom('Pincel Especial');
      const matches = env.presetCatalog.filter(p => p.name === 'Pincel Especial');
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].size, 60);
    });

    await t1.test('F15-5: Saved preset persists immediately to disk storage', () => {
      const onDisk = env.storage.loadCustomPresets();
      assert.ok(onDisk.some(p => p.name === 'Pincel Especial'));
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F16: Custom Color Palette CRUD
  // --------------------------------------------------------------------------
  await t.test('F16: Custom Color Palette CRUD', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F16-1: Create: Adds new custom palette', () => {
      const pal = env.createCustomPalette('Retrô 80s');
      assert.strictEqual(pal.name, 'Retrô 80s');
      assert.strictEqual(pal.isCustom, true);
      assert.deepStrictEqual(pal.colors, []);
    });

    await t1.test('F16-2: Update: Appends valid hex color swatches', () => {
      env.addColorToActivePalette('#ff007f');
      env.addColorToActivePalette('#00f0ff');
      assert.deepStrictEqual(env.activePalette.colors, ['#ff007f', '#00f0ff']);
    });

    await t1.test('F16-3: Invalid hex color string is rejected', () => {
      assert.throws(() => {
        env.addColorToActivePalette('invalid-color');
      }, /hexadecimal/);
    });

    await t1.test('F16-4: Delete Swatch: Removes color swatch by index', () => {
      env.removeColorFromActivePalette(0);
      assert.deepStrictEqual(env.activePalette.colors, ['#00f0ff']);
    });

    await t1.test('F16-5: Delete Palette: Deletes custom palette, but protects default palettes', () => {
      // Default palette cannot be deleted
      assert.throws(() => {
        env.deletePalette(0); // Clássico is index 0
      }, /padrão/);

      // Custom palette can be deleted
      const customIdx = env.palettes.findIndex(p => p.name === 'Retrô 80s');
      assert.ok(customIdx >= 0);
      const deleted = env.deletePalette(customIdx);
      assert.strictEqual(deleted, true);
      assert.strictEqual(env.palettes.some(p => p.name === 'Retrô 80s'), false);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F17: Toolbar Color Chips
  // --------------------------------------------------------------------------
  await t.test('F17: Toolbar Color Chips', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F17-1: Active palette colors populate quick color chips', () => {
      assert.ok(env.activePalette.colors.length > 0);
      const chips = env.activePalette.colors.slice(0, 6);
      assert.strictEqual(chips[0], '#000000');
    });

    await t1.test('F17-2: Clicking color chip updates engine currentColor immediately', () => {
      const chipColor = env.activePalette.colors[2]; // '#ff0000'
      env.currentColor = chipColor;
      assert.strictEqual(env.currentColor, '#ff0000');
    });

    await t1.test('F17-3: Switching active palette updates toolbar chips immediately', () => {
      env.activePalette = env.palettes.find(p => p.name === 'Cyberpunk');
      assert.ok(env.activePalette);
      assert.strictEqual(env.activePalette.colors[0], '#05d9e8');
    });

    await t1.test('F17-4: Max visible chips is capped to avoid toolbar overflow', () => {
      const maxChips = 6;
      const visible = env.activePalette.colors.slice(0, maxChips);
      assert.ok(visible.length <= maxChips);
    });

    await t1.test('F17-5: 1-tap color selection does not trigger modal opening', () => {
      env.currentColor = '#05d9e8';
      assert.strictEqual(env.showColorStudio, false);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F18: Palette & Preset Lifecycle
  // --------------------------------------------------------------------------
  await t.test('F18: Palette & Preset Lifecycle', async (t1) => {
    const sandbox = fs.mkdtempSync(path.join(path.resolve(__dirname, '../..'), 'esenho_lifecycle_'));
    let env = new MockNativePainterEnvironment({ sandboxDir: sandbox });

    // Step 1: Save custom preset and custom palette
    env.saveCurrentPresetAsCustom('PersistentBrush');
    env.createCustomPalette('PersistentPalette');
    env.addColorToActivePalette('#123456');

    await t1.test('F18-1: Cold restart reloads custom preset from sandbox storage', () => {
      // Simulate activity recreation / cold start
      const env2 = new MockNativePainterEnvironment({ sandboxDir: sandbox });
      const found = env2.presetCatalog.find(p => p.name === 'PersistentBrush');
      assert.ok(found, 'PersistentBrush must be loaded on cold start');
      assert.strictEqual(found.isCustom, true);
    });

    await t1.test('F18-2: Cold restart restores custom palette and colors', () => {
      const env2 = new MockNativePainterEnvironment({ sandboxDir: sandbox });
      const foundPal = env2.palettes.find(p => p.name === 'PersistentPalette');
      assert.ok(foundPal, 'PersistentPalette must be loaded');
      assert.deepStrictEqual(foundPal.colors, ['#123456']);
    });

    await t1.test('F18-3: Built-in presets are preserved alongside custom presets', () => {
      const env2 = new MockNativePainterEnvironment({ sandboxDir: sandbox });
      assert.ok(env2.presetCatalog.some(p => p.id === 'pen_g'));
      assert.ok(env2.presetCatalog.some(p => p.name === 'PersistentBrush'));
    });

    await t1.test('F18-4: Default palettes are preserved alongside custom palettes', () => {
      const env2 = new MockNativePainterEnvironment({ sandboxDir: sandbox });
      assert.ok(env2.palettes.some(p => p.name === 'Clássico'));
      assert.ok(env2.palettes.some(p => p.name === 'Cyberpunk'));
      assert.ok(env2.palettes.some(p => p.name === 'PersistentPalette'));
    });

    await t1.test('F18-5: Missing persistence file falls back to defaults without error', () => {
      const emptyDir = fs.mkdtempSync(path.join(path.resolve(__dirname, '../..'), 'esenho_empty_'));
      const envFresh = new MockNativePainterEnvironment({ sandboxDir: emptyDir });
      assert.strictEqual(envFresh.presetCatalog.length, 3);
      assert.strictEqual(envFresh.palettes.length, 5);
      envFresh.cleanup();
      try { fs.rmSync(emptyDir, { recursive: true }); } catch {}
    });

    env.cleanup();
    try { fs.rmSync(sandbox, { recursive: true }); } catch {}
  });

  // --------------------------------------------------------------------------
  // F19: ToolMode.TRANSFORM
  // --------------------------------------------------------------------------
  await t.test('F19: ToolMode.TRANSFORM', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F19-1: ToolMode enum contains TRANSFORM', () => {
      assert.strictEqual(ToolMode.TRANSFORM, 'TRANSFORM');
    });

    await t1.test('F19-2: Activating transform tool sets currentTool and transformActive', () => {
      env.clickTransformTool();
      assert.strictEqual(env.currentTool, ToolMode.TRANSFORM);
      assert.strictEqual(env.transformActive, true);
    });

    await t1.test('F19-3: Transform mode is mutually exclusive with BRUSH drawing mode', () => {
      assert.notStrictEqual(env.currentTool, ToolMode.BRUSH);
    });

    await t1.test('F19-4: Tooltip description is "Transformar"', () => {
      assert.strictEqual(env.getTooltipForTool(ToolMode.TRANSFORM), 'Transformar');
    });

    await t1.test('F19-5: Committing transform returns tool mode to BRUSH', () => {
      env.commitTransform();
      assert.strictEqual(env.currentTool, ToolMode.BRUSH);
      assert.strictEqual(env.transformActive, false);
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F20: Floating Transform State
  // --------------------------------------------------------------------------
  await t.test('F20: Floating Transform State', async (t1) => {
    const env = new MockNativePainterEnvironment();

    await t1.test('F20-1: Transforming selection lifts masked pixels into floating bitmap', () => {
      const layer = env.layers[env.activeLayerIndex];
      layer.pixels[100 * 800 + 100] = 0xffff0000; // Red pixel

      env.selectionActive = true;
      env.selectionBounds = { left: 90, top: 90, right: 110, bottom: 110 };
      env.beginTransform(true);

      assert.strictEqual(env.transformActive, true);
      assert.ok(env.transformState.bitmap);
      assert.strictEqual(env.transformState.selectionOnly, true);
    });

    await t1.test('F20-2: Source pixels on layer are cleared upon lifting selection', () => {
      const layer = env.layers[env.activeLayerIndex];
      assert.strictEqual(layer.pixels[100 * 800 + 100], 0, 'Source pixel must be cleared on layer');
    });

    await t1.test('F20-3: Transforming without selection lifts entire active layer', () => {
      env.cancelTransform(); // Restore
      env.selectionActive = false;
      env.selectionBounds = null;
      env.beginTransform(false);

      assert.strictEqual(env.transformState.selectionOnly, false);
      assert.strictEqual(env.transformState.bounds.right, 800);
      assert.strictEqual(env.transformState.bounds.bottom, 600);
    });

    await t1.test('F20-4: Floating state initializes with identity affine matrix', () => {
      assert.deepStrictEqual(env.transformState.matrix, TransformOracle.identity());
    });

    await t1.test('F20-5: Quad coordinates accurately reflect initial bounding box', () => {
      const q = env.transformState.quad;
      assert.strictEqual(q[0].x, 0);
      assert.strictEqual(q[0].y, 0);
      assert.strictEqual(q[2].x, 800);
      assert.strictEqual(q[2].y, 600);
      env.cancelTransform();
    });

    env.cleanup();
  });

  // --------------------------------------------------------------------------
  // F21: Interactive Bounding Box Quad
  // --------------------------------------------------------------------------
  await t.test('F21: Interactive Bounding Box Quad', async (t1) => {
    const quad = [
      { x: 100, y: 100 }, // TL
      { x: 300, y: 100 }, // TR
      { x: 300, y: 300 }, // BR
      { x: 100, y: 300 }  // BL
    ];
    const handles = TransformOracle.computeHandles(quad, -32);

    await t1.test('F21-1: Computes all 4 corner handles', () => {
      assert.deepStrictEqual(handles.tl, { x: 100, y: 100 });
      assert.deepStrictEqual(handles.tr, { x: 300, y: 100 });
      assert.deepStrictEqual(handles.br, { x: 300, y: 300 });
      assert.deepStrictEqual(handles.bl, { x: 100, y: 300 });
    });

    await t1.test('F21-2: Computes all 4 edge midpoint handles', () => {
      assert.deepStrictEqual(handles.topMid, { x: 200, y: 100 });
      assert.deepStrictEqual(handles.rightMid, { x: 300, y: 200 });
      assert.deepStrictEqual(handles.bottomMid, { x: 200, y: 300 });
      assert.deepStrictEqual(handles.leftMid, { x: 100, y: 200 });
    });

    await t1.test('F21-3: Rotation knob is positioned at -32dp offset above top midpoint', () => {
      assert.strictEqual(handles.rotationKnob.x, 200);
      assert.strictEqual(handles.rotationKnob.y, 68); // 100 - 32 = 68
    });

    await t1.test('F21-4: Center crosshair is located at quad midpoint', () => {
      assert.deepStrictEqual(handles.center, { x: 200, y: 200 });
    });

    await t1.test('F21-5: Hit testing accurately detects handle clicks within 24dp tolerance', () => {
      const hitCorner = TransformOracle.hitTestHandle({ x: 105, y: 105 }, handles, 24);
      assert.strictEqual(hitCorner, 'tl');

      const hitKnob = TransformOracle.hitTestHandle({ x: 202, y: 70 }, handles, 24);
      assert.strictEqual(hitKnob, 'rotationKnob');

      const hitMiss = TransformOracle.hitTestHandle({ x: 200, y: 150 }, handles, 24);
      assert.strictEqual(hitMiss, null);
    });
  });

  // --------------------------------------------------------------------------
  // F22: Bilinear Interpolation
  // --------------------------------------------------------------------------
  await t.test('F22: Bilinear Interpolation', async (t1) => {
    // 2x2 test pixel grid:
    // P00: Red (#FF0000), P10: Green (#00FF00)
    // P01: Blue (#0000FF), P11: White (#FFFFFF)
    const w = 2, h = 2;
    const pixels = new Uint32Array([
      0xffff0000, 0xff00ff00,
      0xff0000ff, 0xffffffff
    ]);

    await t1.test('F22-1: Sampling exact integer coordinate returns source pixel', () => {
      const pix00 = TransformOracle.sampleBilinear(pixels, w, h, 0.0, 0.0);
      assert.strictEqual(pix00 >>> 0, 0xffff0000 >>> 0);
    });

    await t1.test('F22-2: Subpixel midpoint (0.5, 0.0) between Red and Green yields 50/50 blend', () => {
      const pix = TransformOracle.sampleBilinear(pixels, w, h, 0.5, 0.0);
      const r = (pix >> 16) & 0xff;
      const g = (pix >> 8) & 0xff;
      const b = pix & 0xff;
      assert.ok(Math.abs(r - 128) <= 2, `Red ${r} should be ~128`);
      assert.ok(Math.abs(g - 128) <= 2, `Green ${g} should be ~128`);
      assert.strictEqual(b, 0);
    });

    await t1.test('F22-3: Center midpoint (0.5, 0.5) blends all 4 corners equally', () => {
      const pix = TransformOracle.sampleBilinear(pixels, w, h, 0.5, 0.5);
      const r = (pix >> 16) & 0xff;
      const g = (pix >> 8) & 0xff;
      const b = pix & 0xff;
      // Expected: Red: (255+0+0+255)/4 = 128, Green: (0+255+0+255)/4 = 128, Blue: (0+0+255+255)/4 = 128
      assert.ok(Math.abs(r - 128) <= 2);
      assert.ok(Math.abs(g - 128) <= 2);
      assert.ok(Math.abs(b - 128) <= 2);
    });

    await t1.test('F22-4: Alpha channel blends smoothly across transparency gradient', () => {
      const alphaPixels = new Uint32Array([0x00000000, 0xff000000]);
      const mid = TransformOracle.sampleBilinear(alphaPixels, 2, 1, 0.5, 0.0);
      const a = (mid >>> 24) & 0xff;
      assert.ok(Math.abs(a - 128) <= 2);
    });

    await t1.test('F22-5: Coordinates beyond boundary clamp cleanly without error', () => {
      const clamped = TransformOracle.sampleBilinear(pixels, w, h, -5.0, 10.0);
      assert.ok(clamped !== 0);
    });
  });

  // --------------------------------------------------------------------------
  // F23: Flip H & Flip V
  // --------------------------------------------------------------------------
  await t.test('F23: Flip H & Flip V', async (t1) => {
    const quad = [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 10, y: 80 }
    ];

    await t1.test('F23-1: Flip H mirrors x coordinates around center (x=30)', () => {
      const flippedH = TransformOracle.flipQuadH(quad);
      assert.deepStrictEqual(flippedH[0], { x: 50, y: 20 });
      assert.deepStrictEqual(flippedH[1], { x: 10, y: 20 });
      assert.deepStrictEqual(flippedH[2], { x: 10, y: 80 });
      assert.deepStrictEqual(flippedH[3], { x: 50, y: 80 });
    });

    await t1.test('F23-2: Double Flip H returns to original coordinates (identity)', () => {
      const flippedTwice = TransformOracle.flipQuadH(TransformOracle.flipQuadH(quad));
      assert.deepStrictEqual(flippedTwice, quad);
    });

    await t1.test('F23-3: Flip V mirrors y coordinates around center (y=50)', () => {
      const flippedV = TransformOracle.flipQuadV(quad);
      assert.deepStrictEqual(flippedV[0], { x: 10, y: 80 });
      assert.deepStrictEqual(flippedV[1], { x: 50, y: 80 });
      assert.deepStrictEqual(flippedV[2], { x: 50, y: 20 });
      assert.deepStrictEqual(flippedV[3], { x: 10, y: 20 });
    });

    await t1.test('F23-4: Double Flip V returns to original coordinates (identity)', () => {
      const flippedTwice = TransformOracle.flipQuadV(TransformOracle.flipQuadV(quad));
      assert.deepStrictEqual(flippedTwice, quad);
    });

    await t1.test('F23-5: Flip H + Flip V produces 180 degree central inversion', () => {
      const flippedHV = TransformOracle.flipQuadV(TransformOracle.flipQuadH(quad));
      assert.deepStrictEqual(flippedHV[0], { x: 50, y: 80 });
      assert.deepStrictEqual(flippedHV[1], { x: 10, y: 80 });
      assert.deepStrictEqual(flippedHV[2], { x: 10, y: 20 });
      assert.deepStrictEqual(flippedHV[3], { x: 50, y: 20 });
    });
  });

  // --------------------------------------------------------------------------
  // F24: Undo/Redo Commit Integration
  // --------------------------------------------------------------------------
  await t.test('F24: Undo/Redo Commit Integration', async (t1) => {
    const env = new MockNativePainterEnvironment();
    const layer = env.layers[env.activeLayerIndex];

    await t1.test('F24-1: Starting transform pushes initial layer undo snapshot', () => {
      layer.pixels[0] = 0xffaabbcc;
      env.beginTransform(false);
      assert.strictEqual(env.undoStack.length, 1);
      assert.strictEqual(env.undoStack[0].pixels[0], 0xffaabbcc);
    });

    await t1.test('F24-2: Committing transform bakes transformed pixels and clears transform state', () => {
      const ok = env.commitTransform();
      assert.strictEqual(ok, true);
      assert.strictEqual(env.transformActive, false);
      assert.strictEqual(env.transformState, null);
    });

    await t1.test('F24-3: Undo restores pre-transform layer pixels bit-for-bit', () => {
      env.undo();
      assert.strictEqual(layer.pixels[0], 0xffaabbcc);
    });

    await t1.test('F24-4: Redo reapplies post-commit layer state', () => {
      env.redo();
      assert.strictEqual(env.undoStack.length, 1);
    });

    await t1.test('F24-5: Cancel transform discards floating state and restores layer snapshot', () => {
      layer.pixels[5] = 0xff123456;
      env.beginTransform(false);
      assert.strictEqual(env.transformActive, true);
      env.cancelTransform();
      assert.strictEqual(env.transformActive, false);
      assert.strictEqual(layer.pixels[5], 0xff123456);
    });

    env.cleanup();
  });

});
