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

  // Test Opacity (Translucency) & Flow & Softness
  host.executeCommand('set shape circle');
  host.executeCommand('set size 10');
  host.executeCommand('set hardness 100');
  host.executeCommand('set opacity 40');
  host.executeCommand('set flow 100');
  host.sendStroke(350, 350, 350, 350, 0, 0, 0xFF0000FF); // Red with 40% opacity (alpha ~ 102)
  const opAlpha = (pixels[350 * 640 + 350] >> 24) & 0xFF;
  if (opAlpha > 115 || opAlpha < 90) {
    throw new Error(`Expected alpha ~102 (40% opacity), got ${opAlpha}`);
  }

  // Test Softness alias
  host.executeCommand('set softness 100'); // hardness = 0 (airbrush)
  if (host.brushParams.hardness !== 0) {
    throw new Error(`Expected hardness 0 from softness 100, got ${host.brushParams.hardness}`);
  }
  host.executeCommand('set opacity 100');
  host.sendStroke(450, 450, 450, 450, 0, 0, 0xFF00FF00);
  const centerA = (pixels[450 * 640 + 450] >> 24) & 0xFF;
  const edgeA = (pixels[450 * 640 + 458] >> 24) & 0xFF;
  if (centerA < 200 || edgeA >= centerA) {
    throw new Error(`Expected soft gradient (center: ${centerA}, edge: ${edgeA})`);
  }

  // Test Textures
  host.executeCommand('set texture paper');
  host.executeCommand('set shape circle');
  host.executeCommand('set size 20');
  host.sendStroke(400, 400, 400, 400, 0, 0, 0xFFFFFFFF);
  host.executeCommand('set texture none');

  // Test Parametric Shape: Chisel vs Square geometry
  host.executeCommand('clear layer');
  host.executeCommand('set mode draw');
  host.executeCommand('set opacity 100');
  host.executeCommand('set flow 100');
  host.executeCommand('set hardness 100');
  host.executeCommand('set grain 0');
  host.executeCommand('set texture none');

  // Square at (300, 300) with size 10: width 20, height 20
  host.executeCommand('set shape square');
  host.executeCommand('set size 10');
  host.executeCommand('set angle 0');
  host.sendStroke(300, 300, 300, 300, 0, 0, 0xFFFFFFFF);
  if (pixels[308 * 640 + 300] !== 0xFFFFFFFF || pixels[300 * 640 + 308] !== 0xFFFFFFFF) {
    throw new Error('Square tip should cover (300, 308) and (308, 300)');
  }

  // Chisel at (350, 350) with size 10, angle 0: wide along x axis (u), thin along y axis (v)
  host.executeCommand('set shape chisel');
  host.executeCommand('set size 10');
  host.executeCommand('set angle 0');
  host.sendStroke(350, 350, 350, 350, 0, 0, 0xFF123456);
  if (pixels[350 * 640 + 358] !== 0xFF123456) {
    throw new Error('Chisel tip should cover along width axis (358, 350)');
  }
  if (pixels[358 * 640 + 350] !== 0) {
    throw new Error('Chisel tip should be thin and NOT cover (350, 358)');
  }

  // Test Rotation & Texture Rotation / Scale properties & commands
  host.executeCommand('set rotate 45');
  if (host.brushParams.angle !== 45) {
    throw new Error(`Expected angle 45 from set rotate, got ${host.brushParams.angle}`);
  }
  host.executeCommand('set texture_rotate 90');
  if (host.brushParams.texture_angle !== 90) {
    throw new Error(`Expected texture_angle 90, got ${host.brushParams.texture_angle}`);
  }
  host.executeCommand('set texture_scale 150');
  if (host.brushParams.texture_scale !== 150) {
    throw new Error(`Expected texture_scale 150, got ${host.brushParams.texture_scale}`);
  }

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

  // Test Image Loading as Texture & Draw Image / Stamp with optional size
  const { saveImage } = require('../src/image_io');
  const tmpImgPath = '/tmp/test_stamp_img.png';
  const imgBuf = Buffer.alloc(8 * 8 * 4);
  for (let i = 0; i < 64; i++) {
    imgBuf[i * 4 + 0] = 0xAA; // R
    imgBuf[i * 4 + 1] = 0xBB; // G
    imgBuf[i * 4 + 2] = 0xCC; // B
    imgBuf[i * 4 + 3] = 0xFF; // A
  }
  saveImage(tmpImgPath, 8, 8, imgBuf);

  // Clear layer
  host.executeCommand('clear layer');
  if (pixels[10 * 640 + 20] !== 0) {
    throw new Error('Layer should be cleared');
  }

  // Loading image MUST store as texture, NOT write directly onto layer
  host.executeCommand(`load image ${tmpImgPath} test_stamp`);
  if (!host.textures.has('test_stamp')) {
    throw new Error('Image should be stored in textures collection');
  }
  if (pixels[10 * 640 + 20] !== 0 || pixels[0] !== 0) {
    throw new Error('Loading image must NOT draw directly onto layer');
  }

  // Draw image at (10, 20) with default natural size (8x8)
  host.executeCommand('draw image test_stamp 10 20');
  const stampPix = pixels[20 * 640 + 10];
  if ((stampPix & 0x00FFFFFF) !== 0x00CCBBAA) {
    throw new Error(`Expected drawn image pixel 0xFFCCBBAA at (10,20), got 0x${stampPix.toString(16)}`);
  }

  // Draw image with custom scaled size (width 16, height 16) at (40, 50)
  host.drawImage('test_stamp', 40, 50, 16, 16);
  if ((pixels[50 * 640 + 40] & 0x00FFFFFF) !== 0x00CCBBAA || (pixels[65 * 640 + 55] & 0x00FFFFFF) !== 0x00CCBBAA) {
    throw new Error('Expected scaled 16x16 image stamped from (40,50) to (55,65)');
  }

  // Test stamp alias command
  host.executeCommand('stamp test_stamp 80 80 24 24');
  if ((pixels[80 * 640 + 80] & 0x00FFFFFF) !== 0x00CCBBAA) {
    throw new Error('Expected stamp command to draw image at (80,80)');
  }

  // Test Custom Texture as Brush Shape (Alpha Mask Sampling)
  const customMaskBuf = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = (y * 16 + x) * 4;
      // Cross pattern with opaque alpha
      const isCross = (x === 7 || x === 8 || y === 7 || y === 8);
      customMaskBuf[idx + 0] = 0xFF;
      customMaskBuf[idx + 1] = 0xFF;
      customMaskBuf[idx + 2] = 0xFF;
      customMaskBuf[idx + 3] = isCross ? 0xFF : 0x00;
    }
  }
  host.textures.set('cross_shape', { width: 16, height: 16, data: customMaskBuf });
  host.executeCommand('clear layer');
  host.executeCommand('set mode draw');
  host.executeCommand('set shape cross_shape');
  host.executeCommand('set size 16');
  host.executeCommand('set angle 0');
  host.executeCommand('set hardness 100');
  host.executeCommand('set opacity 100');
  host.executeCommand('set flow 100');
  host.sendStroke(200, 200, 200, 200, 0, 0, 0xFFFF0000); // Blue dab
  pixPtr = canvas.exports.get_active_layer_pixels();
  pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 640 * 480);

  // Check center (200, 200) is colored
  if (pixels[200 * 640 + 200] !== 0xFFFF0000) {
    throw new Error(`Expected cross shape center at (200,200) to be 0xFFFF0000, got 0x${pixels[200 * 640 + 200].toString(16)}`);
  }
  // Check corner (212, 212) has alpha 0 when unrotated (+ pattern)
  if (pixels[212 * 640 + 212] !== 0) {
    throw new Error(`Expected cross shape corner at (212,212) to be empty 0, got 0x${pixels[212 * 640 + 212].toString(16)}`);
  }
  // Check horizontal arm at (212, 200) is colored
  if (pixels[200 * 640 + 212] !== 0xFFFF0000) {
    throw new Error(`Expected cross shape arm at (212,200) to be 0xFFFF0000, got 0x${pixels[200 * 640 + 212].toString(16)}`);
  }

  // Test rotating the cross texture mask by 45 degrees (+ turns into X)
  host.executeCommand('clear layer');
  host.executeCommand('set angle 45');
  host.sendStroke(200, 200, 200, 200, 0, 0, 0xFFFF0000);
  pixPtr = canvas.exports.get_active_layer_pixels();
  pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 640 * 480);
  if (pixels[210 * 640 + 210] !== 0xFFFF0000) {
    throw new Error(`Expected rotated cross (X shape) to hit diagonal (210,210), got 0x${pixels[210 * 640 + 210].toString(16)}`);
  }

  // Test Layer as Brush Shape (Zero-copy unified layer/texture primitive)
  host.executeCommand('layer add'); // Layer 2 added
  const l2Idx = canvas.exports.get_active_layer();
  host.executeCommand('clear layer');
  // Draw a solid box in center of layer 2 (640x480 -> center at 320, 240)
  canvas.exports.w_draw_rect(300, 220, 40, 40, 0xFFFFFFFF);
  
  // Switch back to layer 0 and use layer 2 as brush shape
  host.executeCommand('layer select 0');
  host.executeCommand('clear layer');
  host.executeCommand(`set shape layer_${l2Idx}`);
  host.sendStroke(100, 100, 100, 100, 0, 0, 0xFF00FF00); // Green dab using layer 2's alpha mask
  pixPtr = canvas.exports.get_layer_pixels(0);
  pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 640 * 480);
  if ((pixels[100 * 640 + 100] & 0xFF000000) === 0) {
    throw new Error('Expected layer 0 to receive stroke sampled from layer 2 texture alpha mask');
  }

  // Test Built-in Shapes presence in textures map & list textures command
  if (!host.textures.has('circle') || !host.textures.has('square') || !host.textures.has('chisel')) {
    throw new Error('circle, square, chisel must be present in textures map');
  }
  if (host.textures.get('circle').wasmId !== 0 || host.textures.get('square').wasmId !== 1 || host.textures.get('chisel').wasmId !== 2) {
    throw new Error('circle, square, chisel must have wasmIds 0, 1, 2');
  }

  // Execute list textures
  host.executeCommand('list textures');
  host.executeCommand('get shape');
  host.executeCommand('get texture');

  // Test All Filters without crashing
  for (const f of filters) {
    host.executeCommand(`filter ${f}`);
  }

  console.log('ALL TESTS PASSED: Unified Textures & Layers, Custom Shape Alpha Sampling, REPL, and Filters verified 100%!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
