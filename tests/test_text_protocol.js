const path = require('path');
const { Piolho, ExtensionRegistry } = require('piolho');

async function run() {
  const registry = new ExtensionRegistry();
  registry.register({
    name: ['std:framebuffer', 'framebuffer'],
    onRequest(worker, wasmHost, name) {
      return worker.alloc(12, 4);
    }
  });

  const canvasActor = new Piolho(path.resolve(__dirname, '../roms/canvas.wasm'), {
    id: 1,
    name: 'canvas',
    threaded: false,
    extensions: registry
  });

  await canvasActor.init();
  canvasActor.instance.exports.update();

  console.log('Initial canvas width:', canvasActor.instance.exports.get_canvas_width());
  console.log('Initial layer count:', canvasActor.instance.exports.get_layer_count());

  // Helper to send text command
  function sendCmd(cmd) {
    const buf = Buffer.from(cmd + '\0', 'utf8');
    canvasActor.say(buf, 0);
  }

  // Test 1: layer add
  sendCmd('layer add layer_1');
  const layersAfterAdd = canvasActor.instance.exports.get_layer_count();
  console.log('Layers after "layer add":', layersAfterAdd);
  if (layersAfterAdd !== 2) throw new Error(`Expected 2 layers, got ${layersAfterAdd}`);

  // Test 2: resize
  sendCmd('resize 640 480');
  const w = canvasActor.instance.exports.get_width ? canvasActor.instance.exports.get_width() : canvasActor.instance.exports.get_canvas_width();
  const h = canvasActor.instance.exports.get_height ? canvasActor.instance.exports.get_height() : canvasActor.instance.exports.get_canvas_height();
  console.log(`Surface size after "resize 640 480": ${w}x${h}`);
  if (w !== 640 || h !== 480) throw new Error(`Expected 640x480, got ${w}x${h}`);

  // Test 3: draw rect
  sendCmd('draw rect 0 0 10 10 0xFFFF0000');
  const pixPtr = canvasActor.instance.exports.get_active_layer_pixels();
  const pixels = new Uint32Array(canvasActor.memory.buffer, pixPtr, 100);
  console.log('Pixel (0,0) after "draw rect": 0x' + pixels[0].toString(16));
  if (pixels[0] !== 0xFFFF0000) throw new Error(`Expected 0xFFFF0000, got 0x${pixels[0].toString(16)}`);

  // Test 4: layer opacity
  sendCmd('layer opacity 1 50');
  const op = canvasActor.instance.exports.get_layer_opacity(1);
  console.log('Layer 1 opacity after "layer opacity 1 50":', op);
  if (Math.abs(op - 127) > 2) throw new Error(`Expected ~127, got ${op}`);

  // Test 5: set size
  sendCmd('set size 300 200');
  const w2 = canvasActor.instance.exports.get_width();
  const h2 = canvasActor.instance.exports.get_height();
  console.log(`Surface size after "set size 300 200": ${w2}x${h2}`);
  if (w2 !== 300 || h2 !== 200) throw new Error(`Expected 300x200, got ${w2}x${h2}`);

  // Test 7: color set & draw line
  sendCmd('color set 0xFF00FF00');
  sendCmd('draw line 0 0 5 0');
  const pixPtr0 = canvasActor.instance.exports.get_active_layer_pixels();
  const pixels0 = new Uint32Array(canvasActor.memory.buffer, pixPtr0, 10);
  console.log('Pixel (1,0) after "draw line": 0x' + pixels0[1].toString(16));
  if (pixels0[1] !== 0xFF00FF00) throw new Error(`Expected 0xFF00FF00, got 0x${pixels0[1].toString(16)}`);

  // Test 8: layer clear
  sendCmd('layer clear');
  console.log('Pixel (1,0) after "layer clear": 0x' + pixels0[1].toString(16));
  if (pixels0[1] !== 0) throw new Error(`Expected 0 after clear, got 0x${pixels0[1].toString(16)}`);

  // Check composite output immediately reflects the clear without any manual click
  const compPtr = canvasActor.instance.exports.get_composite_pixels();
  const compPixels = new Uint32Array(canvasActor.memory.buffer, compPtr, 300 * 200);
  console.log('Composite pixel (1,0) after clear: 0x' + compPixels[1].toString(16));
  if (compPixels[1] === 0xFF00FF00) throw new Error('Composite pixel still green! Clear did not auto-composite');

  // Piolho Extension: canvas:layer for plugins
  registry.register({
    name: ['canvas:layer', 'canvas:active_layer', 'std:canvas'],
    onRequest(worker, wasmHost, name) {
      const cw = canvasActor.instance.exports.get_canvas_width();
      const ch = canvasActor.instance.exports.get_canvas_height();
      const pixPtr = canvasActor.instance.exports.get_active_layer_pixels();
      if (!pixPtr) return 0;

      const byteLen = cw * ch * 4;
      let state = wasmHost.extState.get('canvas:layer');
      if (!state || state.byteLen < byteLen) {
        const fbPtr = worker.alloc(12, 4);
        const pixCopyPtr = worker.alloc(byteLen, 4);
        state = { fbPtr, pixCopyPtr, byteLen };
        wasmHost.extState.set('canvas:layer', state);
      }

      const view = new DataView(worker.memory.buffer);
      view.setUint32(state.fbPtr + 0, cw, true);
      view.setUint32(state.fbPtr + 4, ch, true);
      view.setUint32(state.fbPtr + 8, state.pixCopyPtr, true);

      new Uint8Array(worker.memory.buffer, state.pixCopyPtr, byteLen)
        .set(new Uint8Array(canvasActor.memory.buffer, pixPtr, byteLen));

      state.dirty = true;
      return state.fbPtr;
    }
  });

  function syncLayerBack(actor) {
    const state = actor.extState.get('canvas:layer');
    if (state && state.dirty) {
      const pixPtr = canvasActor.instance.exports.get_active_layer_pixels();
      new Uint8Array(canvasActor.memory.buffer, pixPtr, state.byteLen)
        .set(new Uint8Array(actor.memory.buffer, state.pixCopyPtr, state.byteLen));
      state.dirty = false;
    }
  }

  // Test 9: Round brush plugin with text protocol
  const roundBrush = new Piolho(path.resolve(__dirname, '../plugins/brushes/round.wasm'), {
    id: 11,
    name: 'round',
    threaded: false,
    extensions: registry
  });
  await roundBrush.init();

  roundBrush.say(Buffer.from('set size 10\0', 'utf8'), 0);
  roundBrush.say(Buffer.from('set opacity 100\0', 'utf8'), 0);
  roundBrush.say(Buffer.from('stroke 0 20 20 20 20 0xFFFF00FF 0\0', 'utf8'), 1);
  syncLayerBack(roundBrush);

  const pixPtrRound = canvasActor.instance.exports.get_active_layer_pixels();
  const pixelsRound = new Uint32Array(canvasActor.memory.buffer, pixPtrRound, 300 * 200);
  console.log('Pixel (20,20) after round brush stroke:', '0x' + pixelsRound[20 * 300 + 20].toString(16));
  if (pixelsRound[20 * 300 + 20] !== 0xFFFF00FF) throw new Error(`Expected 0xFFFF00FF, got 0x${pixelsRound[20 * 300 + 20].toString(16)}`);

  // Test 10: Invert filter plugin with text protocol
  const invertFilter = new Piolho(path.resolve(__dirname, '../plugins/filters/invert.wasm'), {
    id: 12,
    name: 'invert',
    threaded: false,
    extensions: registry
  });
  await invertFilter.init();

  invertFilter.say(Buffer.from('filter invert 0 0\0', 'utf8'), 0);
  syncLayerBack(invertFilter);

  console.log('Pixel (20,20) after invert filter:', '0x' + pixelsRound[20 * 300 + 20].toString(16));
  if ((pixelsRound[20 * 300 + 20] & 0x00FFFFFF) !== 0x0000FF00) throw new Error(`Expected RGB inverted 0x0000FF00, got 0x${(pixelsRound[20 * 300 + 20] & 0x00FFFFFF).toString(16)}`);

  console.log('ALL CANVAS, BRUSH & FILTER TEXT COMMAND TESTS PASSED!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
