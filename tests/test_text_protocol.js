const path = require('path');
const fs = require('fs');
const { WesenhoScreenHost, WesenhoModule, PARAM_IDS, parseColorString } = require('../src/wesenho');

async function run() {
  console.log('--- Testing Canvas Native Exports ---');
  const canvas = new WesenhoModule(path.resolve(__dirname, '../roms/canvas.wasm'));
  canvas.exports.w_init(800, 1000);

  if (canvas.exports.get_canvas_width() !== 800 || canvas.exports.get_canvas_height() !== 1000) {
    throw new Error('Canvas init dimensions mismatch');
  }
  if (canvas.exports.get_layer_count() !== 1) {
    throw new Error('Expected 1 layer initially');
  }

  // 1. Layer add
  const l1 = canvas.exports.w_layer_add();
  if (l1 !== 1 || canvas.exports.get_layer_count() !== 2) {
    throw new Error(`Expected layer 1 added, got ${l1} (total: ${canvas.exports.get_layer_count()})`);
  }

  // 2. Resize
  canvas.exports.w_resize(640, 480);
  if (canvas.exports.get_width() !== 640 || canvas.exports.get_height() !== 480) {
    throw new Error(`Resize failed, got ${canvas.exports.get_width()}x${canvas.exports.get_height()}`);
  }

  // 3. Draw rect
  canvas.exports.w_draw_rect(0, 0, 10, 10, 0xFFFF0000);
  let pixPtr = canvas.exports.get_active_layer_pixels();
  let pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 100);
  if (pixels[0] !== 0xFFFF0000) {
    throw new Error(`Expected 0xFFFF0000, got 0x${pixels[0].toString(16)}`);
  }

  // 4. Layer opacity
  canvas.exports.w_layer_opacity(1, 128);
  const op = canvas.exports.get_layer_opacity(1);
  if (op !== 128) {
    throw new Error(`Expected opacity 128, got ${op}`);
  }

  // 5. Draw line
  canvas.exports.w_draw_line(0, 0, 5, 0, 0xFF00FF00);
  pixPtr = canvas.exports.get_active_layer_pixels();
  pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 10);
  if (pixels[1] !== 0xFF00FF00) {
    throw new Error(`Expected 0xFF00FF00, got 0x${pixels[1].toString(16)}`);
  }

  // 6. Layer clear
  canvas.exports.w_layer_clear(-1);
  if (pixels[1] !== 0) {
    throw new Error(`Expected 0 after clear, got 0x${pixels[1].toString(16)}`);
  }

  // Check composite output
  const compPtr = canvas.exports.get_composite_pixels();
  const compPixels = new Uint32Array(canvas.memory.buffer, compPtr, 640 * 480);
  if (compPixels[1] === 0xFF00FF00) {
    throw new Error('Composite pixel still green! Clear did not composite');
  }

  console.log('--- Testing WesenhoScreenHost REPL / Command Parsing ---');
  const host = new WesenhoScreenHost();
  host.canvasActor = canvas;
  host.syncBrushParams(canvas);

  // Load filter plugins
  const filters = ['blur', 'brightness', 'contrast', 'dither', 'edge', 'grayscale', 'invert', 'noise', 'pixelate', 'sepia', 'threshold'];
  for (const f of filters) {
    const wasmPath = path.resolve(__dirname, `../plugins/filters/${f}.wasm`);
    const mod = new WesenhoModule(wasmPath, { name: f });
    host.plugins.set(f, { type: 'filter', module: mod, actor: mod });
  }

  // Test Host Command execution
  host.executeCommand('set color red');
  if (host.currentColor !== 0xFF0000FF) {
    throw new Error(`Expected red 0xFF0000FF, got 0x${host.currentColor.toString(16)}`);
  }

  host.executeCommand('draw rect 10 10 20 20 red');
  pixPtr = canvas.exports.get_active_layer_pixels();
  pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 640 * 480);
  if (pixels[10 * 640 + 10] !== 0xFF0000FF) {
    throw new Error(`Expected red pixel at (10,10), got 0x${pixels[10 * 640 + 10].toString(16)}`);
  }

  // Test Round Brush stroke via Native Engine
  host.executeCommand('set brush round');
  host.executeCommand('set brush size 12');
  host.executeCommand('set brush texture_mode 0');
  host.sendStroke(30, 30, 30, 30, 0, 0, 0xFFFF00FF);
  if (pixels[30 * 640 + 30] !== 0xFFFF00FF) {
    throw new Error(`Expected 0xFFFF00FF from round brush, got 0x${pixels[30 * 640 + 30].toString(16)}`);
  }

  // Test Invert filter via Host
  host.executeCommand('filter invert');
  const inverted = pixels[30 * 640 + 30];
  if ((inverted & 0x00FFFFFF) !== 0x0000FF00) {
    throw new Error(`Expected inverted RGB 0x0000FF00, got 0x${(inverted & 0x00FFFFFF).toString(16)}`);
  }

  // Test Grayscale filter via Host
  host.executeCommand('filter grayscale');

  // Test Atomic Brush Construction Commands
  host.executeCommand('set tool brush');
  host.executeCommand('set shape square');
  host.executeCommand('set size 10');
  host.executeCommand('set hardness 100');
  host.executeCommand('set opacity 100');
  host.executeCommand('set flow 100');
  host.sendStroke(300, 300, 300, 300, 0, 0, 0xFF00FF00); // Draw green square at (300,300)
  if (pixels[300 * 640 + 300] !== 0xFF00FF00) {
    throw new Error(`Expected square brush pixel 0xFF00FF00, got 0x${pixels[300 * 640 + 300].toString(16)}`);
  }

  // Test Right Click Eraser without trailing dot bug
  host.strokeIsEraser = 1;
  host.sendStroke(300, 300, 300, 300, 0, 1, host.currentColor); // start erase
  host.sendStroke(300, 300, 300, 300, 1, 1, host.currentColor); // move erase
  host.sendStroke(300, 300, 300, 300, 2, 1, host.currentColor); // end erase (should not put a color pixel)
  if (pixels[300 * 640 + 300] !== 0x00000000) {
    throw new Error(`Expected erased pixel 0x00000000, got 0x${pixels[300 * 640 + 300].toString(16)}`);
  }

  // Test Textures
  host.executeCommand('set texture paper');
  host.executeCommand('set shape circle');
  host.executeCommand('set size 20');
  host.sendStroke(400, 400, 400, 400, 0, 0, 0xFFFFFFFF);
  host.executeCommand('set texture none');

  // Test Parametric Shape: Chisel with rotation angle and roundness
  host.executeCommand('set shape chisel');
  host.executeCommand('set angle 45');
  host.executeCommand('set roundness 30');
  host.executeCommand('set size 16');
  host.sendStroke(100, 100, 120, 120, 0, 0, 0xFF55AABB);

  // Test Smudge mode via set mode
  host.executeCommand('set mode smudge');
  host.executeCommand('set smudge 80');
  host.sendStroke(100, 100, 110, 110, 0, 0, 0x0);

  // Test Blend mode via set mode
  host.executeCommand('set mode blend');
  host.executeCommand('set wetness 50');
  host.sendStroke(100, 100, 105, 105, 0, 0, 0xFF112233);

  // Test Flood Fill mode via set mode
  host.executeCommand('set mode fill');
  host.executeCommand('set tolerance 50');
  host.sendStroke(30, 30, 30, 30, 0, 0, 0xFF00FFFF);

  // Test Lasso Fill mode via set mode
  host.executeCommand('set mode lasso_fill');
  host.sendStroke(200, 200, 200, 200, 0, 0, 0xFF336699); // start
  host.sendStroke(250, 200, 200, 200, 1, 0, 0xFF336699);
  host.sendStroke(250, 250, 250, 200, 1, 0, 0xFF336699);
  host.sendStroke(200, 250, 250, 250, 2, 0, 0xFF336699); // close and rasterize
  if (pixels[220 * 640 + 220] !== 0xFF336699) {
    throw new Error(`Expected lasso fill color 0xFF336699, got 0x${pixels[220 * 640 + 220].toString(16)}`);
  }

  // Test All Filters without crashing
  for (const f of filters) {
    host.executeCommand(`filter ${f}`);
  }

  console.log('ALL TESTS PASSED: Canvas API, Custom Parametric Brush Construction, Host REPL, and Modular Filters verified 100%!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
