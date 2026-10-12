/**
 * =========================================================================
 * Raster Frame-by-Frame Animation Unit Test Suite
 * (tests/test_raster_animator.js)
 * Tests frame creation, layer capture/restoration, onion skinning math,
 * serialization (.esen JSON round-trip) and Animated GIF generation.
 * =========================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RasterAnimator } from '../src/anim/raster_animator.js';

describe('Raster Frame-by-Frame Animator Engine', () => {
  // Mock Host and WASM Canvas Actor
  function createMockHost(w = 100, h = 100) {
    const memory = new ArrayBuffer(w * h * 4 * 16);
    const layerPixels = new Map();
    let order = [3];
    let active = 3;

    function getLayerPtr(id) {
      if (!layerPixels.has(id)) {
        layerPixels.set(id, (id - 3 + 1) * w * h * 4);
      }
      return layerPixels.get(id);
    }

    const host = {
      currentProjectName: 'Test Animation',
      render: () => {},
      getTextureWasmIds: () => new Set(),
      canvasActor: {
        memory: { buffer: memory },
        exports: {
          get_canvas_width: () => w,
          get_canvas_height: () => h,
          get_composite_pixels: () => 0,
          w_layer_get_order_count: () => order.length,
          w_layer_get_order: (pos) => order[pos] || -1,
          w_layer_get_pixels: (id) => getLayerPtr(id),
          w_layer_get_width: () => w,
          w_layer_get_height: () => h,
          w_layer_get_visible: () => 1,
          w_layer_get_opacity: () => 255,
          w_layer_get_active: () => active,
          w_layer_select: (id) => { active = id; },
          w_layer_clear: (id) => {
            const ptr = getLayerPtr(id);
            new Uint8Array(memory, ptr, w * h * 4).fill(0);
          },
          w_force_composite: () => {}
        }
      }
    };
    return host;
  }

  it('1. Initializes with Frame 1 capturing initial canvas state', () => {
    const host = createMockHost(50, 50);
    const anim = new RasterAnimator(host);

    assert.strictEqual(anim.frames.length, 1, 'Should initialize with 1 frame');
    assert.strictEqual(anim.currentFrameIndex, 0, 'Current frame should be 0');
    assert(anim.frames[0].layers instanceof Map, 'Frame layers should be stored in a Map');
    assert(anim.frames[0].layers.has(3), 'Background/default layer 3 should be captured');
  });

  it('2. Adds blank frames and duplicates existing frames', () => {
    const host = createMockHost(50, 50);
    const anim = new RasterAnimator(host);

    // Write a marker byte into frame 1 layer 3
    const ptr = host.canvasActor.exports.w_layer_get_pixels(3);
    const buf = new Uint8Array(host.canvasActor.memory.buffer, ptr, 50 * 50 * 4);
    buf[0] = 42;
    anim.saveActiveFrame();

    // Add duplicate frame
    anim.addFrame(true);
    assert.strictEqual(anim.frames.length, 2, 'Should have 2 frames');
    assert.strictEqual(anim.currentFrameIndex, 1, 'Current frame should advance to 1');
    assert.strictEqual(anim.frames[1].layers.get(3).pixels[0], 42, 'Duplicate frame must preserve pixels');

    // Add blank frame
    anim.addFrame(false);
    assert.strictEqual(anim.frames.length, 3, 'Should have 3 frames');
    assert.strictEqual(anim.currentFrameIndex, 2, 'Current frame should advance to 2');
    assert.strictEqual(anim.frames[2].layers.get(3).pixels[0], 0, 'Blank frame must have zeroed pixels');
  });

  it('3. Navigates frames with state restoration', () => {
    const host = createMockHost(40, 40);
    const anim = new RasterAnimator(host);

    const ptr = host.canvasActor.exports.w_layer_get_pixels(3);
    const buf = new Uint8Array(host.canvasActor.memory.buffer, ptr, 40 * 40 * 4);

    // Frame 1: pixel 0 = 100
    buf[0] = 100;
    anim.saveActiveFrame();

    // Frame 2: pixel 0 = 200
    anim.addFrame(false);
    buf[0] = 200;
    anim.saveActiveFrame();

    // Go back to frame 1
    anim.goToFrame(0);
    assert.strictEqual(anim.currentFrameIndex, 0);
    assert.strictEqual(buf[0], 100, 'Canvas buffer should restore Frame 1 pixels');

    // Next frame (returns to frame 2)
    anim.nextFrame();
    assert.strictEqual(anim.currentFrameIndex, 1);
    assert.strictEqual(buf[0], 200, 'Canvas buffer should restore Frame 2 pixels');
  });

  it('4. Onion skinning toggles and configuration', () => {
    const host = createMockHost(30, 30);
    const anim = new RasterAnimator(host);

    assert.strictEqual(anim.onionSkin.enabled, false);
    anim.toggleOnionSkin(true);
    assert.strictEqual(anim.onionSkin.enabled, true);
    assert(Array.isArray(anim.onionSkin.prevTint), 'Past tint must be RGB array');
    assert(Array.isArray(anim.onionSkin.nextTint), 'Future tint must be RGB array');
  });

  it('5. Frame reordering and deletion', () => {
    const host = createMockHost(20, 20);
    const anim = new RasterAnimator(host);

    anim.addFrame(false);
    anim.addFrame(false);
    assert.strictEqual(anim.frames.length, 3);

    anim.frames[0].name = 'First';
    anim.frames[1].name = 'Second';
    anim.frames[2].name = 'Third';

    // Move frame 0 to position 2
    anim.moveFrame(0, 2);
    assert.strictEqual(anim.frames[0].name, 'Second');
    assert.strictEqual(anim.frames[2].name, 'First');

    // Delete active frame
    anim.deleteFrame(1);
    assert.strictEqual(anim.frames.length, 2);
  });

  it('6. Serialization round-trip (.esen JSON schema preservation)', () => {
    const host = createMockHost(25, 25);
    const anim = new RasterAnimator(host);

    anim.setFps(24);
    anim.toggleOnionSkin(true);
    anim.addFrame(false);

    const json = anim.toJSON();
    assert.strictEqual(json.fps, 24);
    assert.strictEqual(json.onionSkin.enabled, true);
    assert.strictEqual(json.frames.length, 2);
    assert(typeof json.frames[0].layers['3'].pixels === 'string', 'Layers pixels should be base64 encoded');

    // Restore into a new animator instance
    const host2 = createMockHost(25, 25);
    const anim2 = new RasterAnimator(host2);
    anim2.fromJSON(json);

    assert.strictEqual(anim2.fps, 24);
    assert.strictEqual(anim2.onionSkin.enabled, true);
    assert.strictEqual(anim2.frames.length, 2);
    assert(anim2.frames[0].layers.has(3), 'Restored frame must have layer 3');
  });

  it('7. Animated GIF export generation', async () => {
    const host = createMockHost(30, 30);
    const anim = new RasterAnimator(host);

    anim.addFrame(false);
    const blob = await anim.exportGif(80);

    assert(blob instanceof Blob, 'Export must return a Blob');
    assert.strictEqual(blob.type, 'image/gif', 'Blob type must be image/gif');
    assert(blob.size > 50, 'GIF Blob should contain header and encoded frame data');
  });

  it('8. Supports independent per-layer timelines and arbitrary (unlimited) frame hold durations', () => {
    const host = createMockHost(20, 20);
    // Simulate 2 layers: layer 3 (Background) and layer 4 (Foreground)
    let layersOrder = [3, 4];
    host.canvasActor.exports.w_layer_get_order_count = () => layersOrder.length;
    host.canvasActor.exports.w_layer_get_order = (pos) => layersOrder[pos] ?? -1;

    const anim = new RasterAnimator(host);
    anim.syncLayersWithCanvas();

    // Layer 3 has 1 cel with duration = 50 frames (way beyond old 4/12 frame limit)
    anim.setFrameDuration(50, 0, 3);
    assert.strictEqual(anim.getLayerTrack(3).frames.length, 1);
    assert.strictEqual(anim.getLayerTrack(3).frames[0].duration, 50);

    // Select Layer 4 and add 2 more cels with durations 15 and 120
    host.canvasActor.exports.w_layer_select(4);
    anim.setFrameDuration(10, 0, 4);
    anim.addFrame(false, 4);
    anim.setFrameDuration(15, 1, 4);
    anim.addFrame(false, 4);
    anim.setFrameDuration(120, 2, 4);

    assert.strictEqual(anim.getLayerTrack(3).frames.length, 1, 'Layer 3 must still have 1 cel');
    assert.strictEqual(anim.getLayerTrack(4).frames.length, 3, 'Layer 4 must have 3 independent cels');
    assert.strictEqual(anim.getLayerDurationTicks(3), 50);
    assert.strictEqual(anim.getLayerDurationTicks(4), 10 + 15 + 120);
    assert.strictEqual(anim.getTotalDurationTicks(), 145);

    // Check cel resolution at tick 20: Layer 3 is on cel 0, Layer 4 is on cel 1 (ticks 10..24)
    assert.strictEqual(anim.getCelAtTick(3, 20).celIndex, 0);
    assert.strictEqual(anim.getCelAtTick(4, 20).celIndex, 1);
    // At tick 60: Layer 4 is on cel 2 (ticks 25..144)
    assert.strictEqual(anim.getCelAtTick(4, 60).celIndex, 2);
  });
});

