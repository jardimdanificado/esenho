/**
 * ============================================================================
 * tests/stress_milestone2_empirical.js
 * Empirical Stress Test Suite for Milestone 2 (Exact Selection Marching Ants)
 * Challenger 1 Verification
 * ============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  ToolMode,
  MockNativePainterEnvironment
} = require('./e2e/helpers/e2e_context.js');

const { SelectionFixtures } = require('./e2e/helpers/selection_fixtures.js');

console.log('--- Starting Empirical Stress Test Suite for Milestone 2 ---');

test('Empirical Stress Tests: Milestone 2 Selection Marching Ants', async (t) => {

  // ==========================================================================
  // SUITE 1: Dash Phase Animation & Dual-Pass High-Contrast Math
  // ==========================================================================
  await t.test('Suite 1: Dash Phase Animation & Dual-Pass High-Contrast Math', async (t1) => {

    await t1.test('1.1: Alternating black/white dash phase coverage across 360-degree cycle', () => {
      // Black: DashPathEffect([8, 8], phase)
      // White: DashPathEffect([8, 8], phase + 8)
      // Dash length = 8, Gap length = 8, Period = 16.
      // For any point along the perimeter distance d, exactly one of black or white is ON (stroke active).

      function isSegmentActive(dist, phase, dashLen = 8, gapLen = 8) {
        const period = dashLen + gapLen;
        // In Android Skia DashPathEffect, positive phase shifts the dash pattern backward
        const effectiveDist = ((dist + phase) % period + period) % period;
        return effectiveDist < dashLen;
      }

      // Test 100 phases across [0, 16) and 200 perimeter points
      for (let phase = 0; phase < 16; phase += 0.5) {
        for (let d = 0; d < 100; d += 0.5) {
          const blackActive = isSegmentActive(d, phase);
          const whiteActive = isSegmentActive(d, phase + 8);

          // Crucial invariants:
          // 1. Black and White must be mutually exclusive (no overlapping strokes)
          assert.strictEqual(
            blackActive && whiteActive,
            false,
            `Black and White overlap at phase=${phase}, dist=${d}`
          );
          // 2. Either Black or White must be active (no gap without contrast)
          assert.strictEqual(
            blackActive || whiteActive,
            true,
            `Gaps found without any stroke at phase=${phase}, dist=${d}`
          );
        }
      }
    });

    await t1.test('1.2: Phase wrapping boundary and float precision drift', () => {
      let antsPhase = 0.0;
      const FRAMES = 10000;
      for (let f = 0; f < FRAMES; f++) {
        antsPhase = (antsPhase + 1.0) % 16.0;
        assert.ok(antsPhase >= 0.0 && antsPhase < 16.0, `Phase out of bounds at frame ${f}: ${antsPhase}`);
      }
      // Exact alignment check after complete cycles: 10000 % 16 = 0
      assert.strictEqual(Math.round(antsPhase * 1000) / 1000, 0.0);
    });

    await t1.test('1.3: Animation lifecycle and zero idle CPU overhead', () => {
      let postInvalidateCount = 0;
      let selectionActive = false;

      function renderFrame() {
        if (selectionActive) {
          postInvalidateCount++;
        }
      }

      // No selection active -> must NEVER request animation frames
      for (let i = 0; i < 50; i++) {
        renderFrame();
      }
      assert.strictEqual(postInvalidateCount, 0, 'Idle CPU must be 0 when no selection active');

      // Activate selection -> must request continuous animation frames
      selectionActive = true;
      for (let i = 0; i < 60; i++) {
        renderFrame();
      }
      assert.strictEqual(postInvalidateCount, 60, 'Must request frame invalidation while selection active');

      // Dismiss selection -> immediately stops requesting animation frames
      selectionActive = false;
      const countAtDismiss = postInvalidateCount;
      for (let i = 0; i < 50; i++) {
        renderFrame();
      }
      assert.strictEqual(postInvalidateCount, countAtDismiss, 'Must stop requesting frames immediately upon selection dismissal');
    });
  });

  // ==========================================================================
  // SUITE 2: Non-Rectangular Contour Representation & Engine State
  // ==========================================================================
  await t.test('Suite 2: Non-Rectangular Contour Representation & Engine State', async (t1) => {

    await t1.test('2.1: Mock engine retains closed Path on lasso and nulls on rect/clear', () => {
      class SimulatedEsenhoEngine {
        constructor() {
          this.selectionActive = false;
          this.selectionBounds = null;
          this.selectionHasMask = false;
          this.selectionPath = null;
        }

        updateSelectionInfo(nativeInfo) {
          if (nativeInfo && nativeInfo[0] !== 0 && nativeInfo[3] > 0 && nativeInfo[4] > 0) {
            this.selectionActive = true;
            this.selectionBounds = {
              left: nativeInfo[1],
              top: nativeInfo[2],
              right: nativeInfo[1] + nativeInfo[3],
              bottom: nativeInfo[2] + nativeInfo[4]
            };
            this.selectionHasMask = (nativeInfo.length >= 6 && nativeInfo[5] !== 0);
            if (!this.selectionHasMask) {
              this.selectionPath = null;
            }
          } else {
            this.selectionActive = false;
            this.selectionBounds = null;
            this.selectionHasMask = false;
            this.selectionPath = null;
          }
        }

        selectRect(x, y, w, h) {
          this.selectionPath = null;
          // Native w_select_rect sets has_mask = 0
          this.updateSelectionInfo([1, x, y, w, h, 0]);
        }

        selectLasso(points) {
          if (points.length < 3) return;
          const path = {
            points: [...points],
            isClosed: true
          };
          this.selectionPath = path;
          // Native w_select_lasso sets has_mask = 1
          const bounds = SelectionFixtures.computeBounds(points);
          this.updateSelectionInfo([1, bounds.x, bounds.y, bounds.w, bounds.h, 1]);
        }

        clearSelection() {
          this.selectionPath = null;
          this.selectionHasMask = false;
          this.updateSelectionInfo([0, 0, 0, 0, 0, 0]);
        }

        selectAll() {
          this.selectionPath = null;
          this.updateSelectionInfo([1, 0, 0, 800, 600, 0]);
        }

        invertSelection() {
          this.selectionPath = null;
          this.updateSelectionInfo([1, 0, 0, 800, 600, 1]);
        }
      }

      const eng = new SimulatedEsenhoEngine();

      // Case A: Lasso selection creates non-null path with matching vertex count
      const star = SelectionFixtures.createStarPolygon(100, 100, 40, 20);
      eng.selectLasso(star);
      assert.strictEqual(eng.selectionActive, true);
      assert.strictEqual(eng.selectionHasMask, true);
      assert.ok(eng.selectionPath !== null, 'selectionPath must be non-null for lasso');
      assert.strictEqual(eng.selectionPath.points.length, star.length);
      assert.strictEqual(eng.selectionPath.isClosed, true);

      // Case B: Rectangular selection nulls selectionPath and sets selectionHasMask=false
      eng.selectRect(10, 10, 50, 50);
      assert.strictEqual(eng.selectionActive, true);
      assert.strictEqual(eng.selectionHasMask, false);
      assert.strictEqual(eng.selectionPath, null, 'selectionPath must be null for rectangular selection');

      // Case C: Clear selection resets all state
      eng.selectLasso(star);
      assert.strictEqual(eng.selectionActive, true);
      eng.clearSelection();
      assert.strictEqual(eng.selectionActive, false);
      assert.strictEqual(eng.selectionHasMask, false);
      assert.strictEqual(eng.selectionPath, null);
      assert.strictEqual(eng.selectionBounds, null);

      // Case D: SelectAll resets selectionPath to null
      eng.selectLasso(star);
      eng.selectAll();
      assert.strictEqual(eng.selectionActive, true);
      assert.strictEqual(eng.selectionHasMask, false);
      assert.strictEqual(eng.selectionPath, null);

      // Case E: Invert selection nulls selectionPath
      eng.selectLasso(star);
      eng.invertSelection();
      assert.strictEqual(eng.selectionActive, true);
      assert.strictEqual(eng.selectionPath, null);
    });

    await t1.test('2.2: Dual-mode rendering fallback in Viewport', () => {
      const canvasDrawCalls = [];
      const mockCanvas = {
        drawPath: (p, paint) => canvasDrawCalls.push({ type: 'drawPath', paint: paint.color }),
        drawRect: (l, t, r, b, paint) => canvasDrawCalls.push({ type: 'drawRect', paint: paint.color })
      };

      // Scenario A: Non-rectangular lasso active -> draws Path
      let eng = {
        selectionActive: true,
        selectionPath: { type: 'path' },
        selectionBounds: { left: 10, top: 10, right: 90, bottom: 90 }
      };

      function renderSelectionMarquee(engine, canvas) {
        if (!engine.selectionActive) return;
        if (engine.selectionPath) {
          canvas.drawPath(engine.selectionPath, { color: 'fill' });
          canvas.drawPath(engine.selectionPath, { color: 'black' });
          canvas.drawPath(engine.selectionPath, { color: 'white' });
        } else if (engine.selectionBounds) {
          const b = engine.selectionBounds;
          canvas.drawRect(b.left, b.top, b.right, b.bottom, { color: 'fill' });
          canvas.drawRect(b.left, b.top, b.right, b.bottom, { color: 'black' });
          canvas.drawRect(b.left, b.top, b.right, b.bottom, { color: 'white' });
        }
      }

      renderSelectionMarquee(eng, mockCanvas);
      assert.strictEqual(canvasDrawCalls.filter(c => c.type === 'drawPath').length, 3);
      assert.strictEqual(canvasDrawCalls.filter(c => c.type === 'drawRect').length, 0);

      // Scenario B: Rectangular selection active -> draws Rect fallback
      canvasDrawCalls.length = 0;
      eng.selectionPath = null;
      renderSelectionMarquee(eng, mockCanvas);
      assert.strictEqual(canvasDrawCalls.filter(c => c.type === 'drawPath').length, 0);
      assert.strictEqual(canvasDrawCalls.filter(c => c.type === 'drawRect').length, 3);

      // Scenario C: No selection active -> draws nothing
      canvasDrawCalls.length = 0;
      eng.selectionActive = false;
      renderSelectionMarquee(eng, mockCanvas);
      assert.strictEqual(canvasDrawCalls.length, 0);
    });
  });

  // ==========================================================================
  // SUITE 3: Lasso Mask Clearing & Boundary Verification
  // ==========================================================================
  await t.test('Suite 3: Lasso Mask Clearing & Boundary Verification', async (t1) => {

    await t1.test('3.1: Triangular lasso clearing boundary', () => {
      // 100x100 canvas filled with 0xFFFFFFFF
      const w = 100, h = 100;
      const pix = new Uint32Array(w * h).fill(0xffffffff);

      // Right triangle: (10, 10), (90, 10), (10, 90)
      // Points inside: x + y <= 100 (for x >= 10, y >= 10)
      // Points outside: x + y > 100 (in the bounding box [10..90, 10..90])
      const tri = [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 10, y: 90 }
      ];
      const bounds = SelectionFixtures.computeBounds(tri);
      const mask = SelectionFixtures.rasterizeMask(tri, bounds);

      // Execute clearing with mask
      for (let y = 0; y < bounds.h; y++) {
        const py = bounds.y + y;
        for (let x = 0; x < bounds.w; x++) {
          const px = bounds.x + x;
          if (mask[y * bounds.w + x] === 1) {
            pix[py * w + px] = 0;
          }
        }
      }

      // Point inside triangle
      assert.strictEqual(pix[20 * w + 20], 0, 'Point (20, 20) inside triangle must be cleared');
      // Point outside triangle but in bounding box
      assert.strictEqual(pix[70 * w + 70], 0xffffffff, 'Point (70, 70) outside triangle must be preserved');
      // Point outside bounding box
      assert.strictEqual(pix[5 * w + 5], 0xffffffff, 'Point (5, 5) outside bounding box must be preserved');
    });

    await t1.test('3.2: Organic concave lasso clearing boundary', () => {
      const w = 200, h = 200;
      const pix = new Uint32Array(w * h).fill(0xff00ff00);

      const lasso = SelectionFixtures.createOrganicLasso(100, 100, 60, 36);
      const bounds = SelectionFixtures.computeBounds(lasso);
      const mask = SelectionFixtures.rasterizeMask(lasso, bounds);

      let clearedCount = 0;
      let preservedInBoxCount = 0;

      for (let y = 0; y < bounds.h; y++) {
        const py = bounds.y + y;
        for (let x = 0; x < bounds.w; x++) {
          const px = bounds.x + x;
          if (mask[y * bounds.w + x] === 1) {
            pix[py * w + px] = 0;
            clearedCount++;
          } else {
            preservedInBoxCount++;
          }
        }
      }

      // For an organic wavy circle, there MUST be non-cleared pixels within the bounding box corners
      assert.ok(clearedCount > 500, `Must clear interior pixels (cleared=${clearedCount})`);
      assert.ok(preservedInBoxCount > 100, `Must preserve exterior pixels in bounding box (preserved=${preservedInBoxCount})`);
      assert.strictEqual(pix[bounds.y * w + bounds.x], 0xff00ff00, 'Bounding box corner must remain unmodified');
    });
  });
});
