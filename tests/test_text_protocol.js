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

  console.log('ALL CANVAS TEXT COMMAND TESTS PASSED!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
