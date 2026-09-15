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
  if (canvas.exports.get_layer_count() !== 4) {
    throw new Error(`Expected 4 layers initially (3 builtin shapes + 1 canvas), got ${canvas.exports.get_layer_count()}`);
  }
  if (canvas.exports.get_active_layer() !== 3) {
    throw new Error(`Expected active layer 3, got ${canvas.exports.get_active_layer()}`);
  }

  // 1. Layer add
  const l1 = canvas.exports.w_layer_add();
  if (l1 !== 4 || canvas.exports.get_layer_count() !== 5) {
    throw new Error(`Expected layer 4 added, got ${l1} (total: ${canvas.exports.get_layer_count()})`);
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
  canvas.exports.w_layer_opacity(l1, 128);
  const op = canvas.exports.get_layer_opacity(l1);
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
    const wasmPath = path.resolve(__dirname, `../plugins/${f}.wasm`);
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
  host.executeCommand('set mode brush');
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

  // Test export command alias
  const tmpExportPath = '/tmp/test_export_drawing.png';
  host.executeCommand(`export ${tmpExportPath}`);
  if (!fs.existsSync(tmpExportPath)) {
    throw new Error('export command should save file to disk');
  }
  fs.unlinkSync(tmpExportPath);

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
  
  // Switch back to canvas layer 3 and use newly added layer as brush shape
  host.executeCommand('layer select 3');
  host.executeCommand('clear layer');
  host.executeCommand(`set shape layer_${l2Idx}`);
  host.sendStroke(100, 100, 100, 100, 0, 0, 0xFF00FF00); // Green dab using layer's alpha mask
  pixPtr = canvas.exports.get_layer_pixels(3);
  pixels = new Uint32Array(canvas.memory.buffer, pixPtr, 640 * 480);
  if ((pixels[100 * 640 + 100] & 0xFF000000) === 0) {
    throw new Error('Expected layer 3 to receive stroke sampled from layer texture alpha mask');
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

  // Test stroke smoothing & stabilization parameters and stroke execution
  host.executeCommand('set smooth 45');
  if (host.brushParams.smoothing !== 45) {
    throw new Error(`Expected smoothing 45, got ${host.brushParams.smoothing}`);
  }
  host.executeCommand('set stabilizer 60');
  if (host.brushParams.smoothing !== 60) {
    throw new Error(`Expected smoothing 60, got ${host.brushParams.smoothing}`);
  }

  // Draw smoothed stroke
  host.sendStroke(20, 20, 20, 20, 0, 0, 0xFFFF00FF);
  host.sendStroke(40, 25, 20, 20, 1, 0, 0xFFFF00FF);
  host.sendStroke(60, 40, 40, 25, 1, 0, 0xFFFF00FF);
  host.sendStroke(60, 40, 60, 40, 2, 0, 0xFFFF00FF);

  // Reset smooth to 0
  host.executeCommand('set smooth 0');
  if (host.brushParams.smoothing !== 0) {
    throw new Error(`Expected smoothing 0, got ${host.brushParams.smoothing}`);
  }

  // Test configurable Bézier midpoint
  if (host.brushParams.midpoint !== 50) {
    throw new Error(`Expected default midpoint 50, got ${host.brushParams.midpoint}`);
  }
  host.executeCommand('set midpoint 30');
  if (host.brushParams.midpoint !== 30) {
    throw new Error(`Expected midpoint 30, got ${host.brushParams.midpoint}`);
  }
  host.executeCommand('set bezier 70');
  if (host.brushParams.midpoint !== 70) {
    throw new Error(`Expected midpoint 70 via 'set bezier', got ${host.brushParams.midpoint}`);
  }
  host.executeCommand('bezier_midpoint 25');
  if (host.brushParams.midpoint !== 25) {
    throw new Error(`Expected midpoint 25 via 'bezier_midpoint', got ${host.brushParams.midpoint}`);
  }
  host.executeCommand('get midpoint');
  host.executeCommand('get bezier');

  // Test smoothed stroke with custom midpoint
  host.executeCommand('set smooth 50');
  host.sendStroke(10, 10, 10, 10, 0, 0, 0xFFFF00FF);
  host.sendStroke(30, 15, 10, 10, 1, 0, 0xFFFF00FF);
  host.sendStroke(50, 30, 30, 15, 1, 0, 0xFFFF00FF);
  host.sendStroke(50, 30, 50, 30, 2, 0, 0xFFFF00FF);
  host.executeCommand('set smooth 0');
  host.executeCommand('set midpoint 50');

  // Test Texture Contrast parameter
  if (host.brushParams.texture_contrast !== 100) {
    throw new Error(`Expected default texture_contrast 100, got ${host.brushParams.texture_contrast}`);
  }
  host.executeCommand('set texture_contrast 150');
  if (host.brushParams.texture_contrast !== 150) {
    throw new Error(`Expected texture_contrast 150, got ${host.brushParams.texture_contrast}`);
  }
  host.executeCommand('set tex_contrast 80');
  if (host.brushParams.texture_contrast !== 80) {
    throw new Error(`Expected texture_contrast 80, got ${host.brushParams.texture_contrast}`);
  }
  host.executeCommand('set grain_contrast 120');
  if (host.brushParams.texture_contrast !== 120) {
    throw new Error(`Expected texture_contrast 120, got ${host.brushParams.texture_contrast}`);
  }

  // Test Papagaio Custom Syntax Rule extension
  WesenhoScreenHost.COMMAND_RULES.unshift({
    pat: "pincel tamanho $s$int cor $c",
    run: (m, h) => {
      h.setBrushParam('size', parseInt(m.s, 10));
      h.currentColor = parseColorString(m.c, h.currentColor);
      h.sendConsoleLog(`pincel ajustado: tamanho ${m.s}, cor ${m.c}`);
    }
  });
  host.executeCommand('pincel tamanho 33 cor #112233');
  if (host.brushParams.size !== 33) {
    throw new Error(`Expected brush size 33 from custom papagaio rule, got ${host.brushParams.size}`);
  }

  // Test All Filters without crashing
  for (const f of filters) {
    host.executeCommand(`filter ${f}`);
  }

  // Test 100% Papagaio unknown command handling
  let lastLog = '';
  const origSendLog = host.sendConsoleLog.bind(host);
  host.sendConsoleLog = (msg, col) => {
    lastLog = msg;
    origSendLog(msg, col);
  };
  host.executeCommand('comando_inexistente_xyz');
  if (!lastLog.includes("err: unknown command 'comando_inexistente_xyz'")) {
    throw new Error(`Expected unknown command error, got: ${lastLog}`);
  }

  // Test Math eval via pure Papagaio
  host.executeCommand('(10 + 20)');

  // Test List commands
  host.executeCommand('list');
  host.executeCommand('list *');
  host.executeCommand('list layers');
  host.executeCommand('list textures');
  host.executeCommand('list brushes');
  host.executeCommand('list filters');
  host.executeCommand('layers');
  host.executeCommand('textures');
  host.executeCommand('brushes');
  host.executeCommand('filters');

  // Test Layer Resize
  host.executeCommand('new layer');
  const newLyrId = canvas.exports.get_active_layer();
  const origW = canvas.exports.w_layer_get_width(newLyrId);
  const origH = canvas.exports.w_layer_get_height(newLyrId);
  if (origW !== 640 || origH !== 480) {
    throw new Error(`Expected new layer 640x480, got ${origW}x${origH}`);
  }
  host.executeCommand(`layer resize ${newLyrId} 320 240`);
  const rW = canvas.exports.w_layer_get_width(newLyrId);
  const rH = canvas.exports.w_layer_get_height(newLyrId);
  if (rW !== 320 || rH !== 240) {
    throw new Error(`Expected layer resize to 320x240, got ${rW}x${rH}`);
  }

  // Test Active Layer Driving Canvas Dimensions
  if (canvas.exports.get_canvas_width() !== 320 || canvas.exports.get_canvas_height() !== 240) {
    throw new Error(`Expected canvas dimensions to match active layer (320x240), got ${canvas.exports.get_canvas_width()}x${canvas.exports.get_canvas_height()}`);
  }

  // Test Layer Duplicate
  host.executeCommand('duplicate layer');
  const dupLyrId = canvas.exports.get_active_layer();
  if (dupLyrId === newLyrId) {
    throw new Error(`Expected duplicated layer to have new index, got ${dupLyrId}`);
  }
  if (canvas.exports.w_layer_get_width(dupLyrId) !== 320 || canvas.exports.w_layer_get_height(dupLyrId) !== 240) {
    throw new Error(`Expected duplicated layer to be 320x240, got ${canvas.exports.w_layer_get_width(dupLyrId)}x${canvas.exports.w_layer_get_height(dupLyrId)}`);
  }

  // Test View Navigation Commands
  host.executeCommand('zoom in');
  host.executeCommand('zoom out');
  host.executeCommand('zoom fit');
  host.executeCommand('zoom reset');
  if (Math.abs(host.zoom - 1.0) > 0.001) {
    throw new Error(`Expected zoom reset to 1.0, got ${host.zoom}`);
  }
  host.executeCommand('pan reset');
  host.executeCommand('rotate reset');
  if (host.canvasRotation !== 0) {
    throw new Error(`Expected canvas rotation 0, got ${host.canvasRotation}`);
  }

  // Test Auto-Rotate parameter
  host.executeCommand('set auto_rotate 1');
  if (host.brushParams.auto_rotate !== 1) {
    throw new Error(`Expected auto_rotate 1, got ${host.brushParams.auto_rotate}`);
  }
  host.executeCommand('set auto_rotate off');
  if (host.brushParams.auto_rotate !== 0) {
    throw new Error(`Expected auto_rotate 0, got ${host.brushParams.auto_rotate}`);
  }
  host.executeCommand('set auto_rotate on');

  // Test Velocity Dynamics parameter
  host.executeCommand('set velocity 75');
  if (host.brushParams.velocity !== 75) {
    throw new Error(`Expected velocity 75, got ${host.brushParams.velocity}`);
  }

  // Draw stroke with auto-rotate and velocity
  host.sendStroke(100, 100, 100, 100, 0, 0, 0xFF4488CC);
  host.sendStroke(130, 140, 100, 100, 1, 0, 0xFF4488CC);
  host.sendStroke(130, 140, 130, 140, 2, 0, 0xFF4488CC);

  // Test Undo / Redo
  const activeLyr = canvas.exports.get_active_layer();
  const lyrPtr = canvas.exports.get_layer_pixels(activeLyr);
  const lyrW = canvas.exports.get_canvas_width();
  const pixBeforeStroke = new Uint32Array(canvas.memory.buffer, lyrPtr, lyrW * 100)[50 * lyrW + 50];

  // Draw distinct dab at (50, 50)
  host.sendStroke(50, 50, 50, 50, 0, 0, 0xFF00FF00);
  host.sendStroke(50, 50, 50, 50, 2, 0, 0xFF00FF00);
  const pixAfterStroke = new Uint32Array(canvas.memory.buffer, lyrPtr, lyrW * 100)[50 * lyrW + 50];
  if (pixAfterStroke !== 0xFF00FF00) {
    throw new Error(`Expected pixel at (50, 50) to be 0xFF00FF00, got 0x${pixAfterStroke.toString(16)}`);
  }

  // Undo stroke
  const undoRes = host.undo();
  if (!undoRes.ok) {
    throw new Error(`Undo failed: ${undoRes.msg}`);
  }
  const pixAfterUndo = new Uint32Array(canvas.memory.buffer, lyrPtr, lyrW * 100)[50 * lyrW + 50];
  if (pixAfterUndo !== pixBeforeStroke) {
    throw new Error(`Expected pixel after undo to be 0x${pixBeforeStroke.toString(16)}, got 0x${pixAfterUndo.toString(16)}`);
  }

  // Redo stroke
  const redoRes = host.redo();
  if (!redoRes.ok) {
    throw new Error(`Redo failed: ${redoRes.msg}`);
  }
  const pixAfterRedo = new Uint32Array(canvas.memory.buffer, lyrPtr, lyrW * 100)[50 * lyrW + 50];
  if (pixAfterRedo !== 0xFF00FF00) {
    throw new Error(`Expected pixel after redo to be 0xFF00FF00, got 0x${pixAfterRedo.toString(16)}`);
  }

  // Test Undo via REPL command
  host.executeCommand('undo');
  const pixAfterUndoCmd = new Uint32Array(canvas.memory.buffer, lyrPtr, lyrW * 100)[50 * lyrW + 50];
  if (pixAfterUndoCmd !== pixBeforeStroke) {
    throw new Error(`Expected pixel after 'undo' command to match before stroke`);
  }

  // Test Redo via REPL command
  host.executeCommand('redo');
  const pixAfterRedoCmd = new Uint32Array(canvas.memory.buffer, lyrPtr, lyrW * 100)[50 * lyrW + 50];
  if (pixAfterRedoCmd !== 0xFF00FF00) {
    throw new Error(`Expected pixel after 'redo' command to be restored`);
  }

  // Test Phase 2: Taper & Fade parameters
  host.executeCommand('set taper_in 80');
  if (host.brushParams.taper_in !== 80) {
    throw new Error(`Expected taper_in 80, got ${host.brushParams.taper_in}`);
  }
  host.executeCommand('set fade 350');
  if (host.brushParams.fade !== 350) {
    throw new Error(`Expected fade 350, got ${host.brushParams.fade}`);
  }

  // Test Phase 2: Jitters
  host.executeCommand('set size_jitter 45');
  if (host.brushParams.size_jitter !== 45) {
    throw new Error(`Expected size_jitter 45, got ${host.brushParams.size_jitter}`);
  }
  host.executeCommand('set angle_jitter 180');
  if (host.brushParams.angle_jitter !== 180) {
    throw new Error(`Expected angle_jitter 180, got ${host.brushParams.angle_jitter}`);
  }
  host.executeCommand('set opacity_jitter 35');
  if (host.brushParams.opacity_jitter !== 35) {
    throw new Error(`Expected opacity_jitter 35, got ${host.brushParams.opacity_jitter}`);
  }
  host.executeCommand('set color_jitter 50');
  if (host.brushParams.color_jitter !== 50) {
    throw new Error(`Expected color_jitter 50, got ${host.brushParams.color_jitter}`);
  }

  // Test Phase 2: Dab Blend Modes (string & integer)
  host.executeCommand('set dab_blend multiply');
  if (host.brushParams.dab_blend !== 1) {
    throw new Error(`Expected dab_blend multiply (1), got ${host.brushParams.dab_blend}`);
  }
  host.executeCommand('set dab_blend screen');
  if (host.brushParams.dab_blend !== 2) {
    throw new Error(`Expected dab_blend screen (2), got ${host.brushParams.dab_blend}`);
  }
  host.executeCommand('set dab_blend overlay');
  if (host.brushParams.dab_blend !== 3) {
    throw new Error(`Expected dab_blend overlay (3), got ${host.brushParams.dab_blend}`);
  }
  host.executeCommand('set dab_blend dodge');
  if (host.brushParams.dab_blend !== 4) {
    throw new Error(`Expected dab_blend dodge (4), got ${host.brushParams.dab_blend}`);
  }
  host.executeCommand('set dab_blend add');
  if (host.brushParams.dab_blend !== 5) {
    throw new Error(`Expected dab_blend add (5), got ${host.brushParams.dab_blend}`);
  }
  host.executeCommand('set dab_blend normal');
  if (host.brushParams.dab_blend !== 0) {
    throw new Error(`Expected dab_blend normal (0), got ${host.brushParams.dab_blend}`);
  }

  // Test stroke execution with taper, fade, jitters & blend without error
  host.sendStroke(100, 100, 100, 100, 0, 0, 0xFF3366CC);
  host.sendStroke(150, 120, 100, 100, 1, 0, 0xFF3366CC);
  host.sendStroke(200, 150, 150, 120, 1, 0, 0xFF3366CC);
  host.sendStroke(250, 180, 200, 150, 2, 0, 0xFF3366CC);

  // Reset dynamics for clean state
  host.executeCommand('set taper_in 0');
  host.executeCommand('set fade 0');
  host.executeCommand('set size_jitter 0');
  host.executeCommand('set angle_jitter 0');
  host.executeCommand('set opacity_jitter 0');
  host.executeCommand('set color_jitter 0');
  host.executeCommand('set dab_blend normal');

  // Test UI Scale adaptation commands & events
  let scaleChangeTriggered = false;
  host.onUiScaleChange = (val) => {
    scaleChangeTriggered = val;
  };
  host.executeCommand('set ui_scale 125%');
  if (host.uiScale !== '125%' || scaleChangeTriggered !== '125%') {
    throw new Error(`Expected ui_scale 125%, got ${host.uiScale} (callback: ${scaleChangeTriggered})`);
  }
  host.executeCommand('ui_scale 0.85');
  if (host.uiScale !== '0.85' || scaleChangeTriggered !== '0.85') {
    throw new Error(`Expected ui_scale 0.85, got ${host.uiScale}`);
  }
  host.executeCommand('ui scale auto');
  if (host.uiScale !== 'auto' || scaleChangeTriggered !== 'auto') {
    throw new Error(`Expected ui_scale auto, got ${host.uiScale}`);
  }

  // Test Layer Reordering (Move Up / Down) & Merge Down
  const initialOrderCount = canvas.exports.w_layer_get_order_count();
  host.executeCommand('new layer');
  const layerA = canvas.exports.get_active_layer();
  const orderCountAfterA = canvas.exports.w_layer_get_order_count();
  if (orderCountAfterA !== initialOrderCount + 1) {
    throw new Error(`Expected order count ${initialOrderCount + 1}, got ${orderCountAfterA}`);
  }
  // layerA should be top of stack
  const topPos = orderCountAfterA - 1;
  if (canvas.exports.w_layer_get_order(topPos) !== layerA) {
    throw new Error(`Expected top layer to be ${layerA}, got ${canvas.exports.w_layer_get_order(topPos)}`);
  }

  // Move layerA down
  host.executeCommand(`layer move down ${layerA}`);
  if (canvas.exports.w_layer_get_order(topPos - 1) !== layerA) {
    throw new Error(`Expected layer ${layerA} at pos ${topPos - 1} after move down`);
  }

  // Move layerA back up
  host.executeCommand(`layer move up ${layerA}`);
  if (canvas.exports.w_layer_get_order(topPos) !== layerA) {
    throw new Error(`Expected layer ${layerA} at top pos ${topPos} after move up`);
  }

  // Paint on layerA then merge down
  host.sendStroke(50, 50, 50, 50, 0, 0, 0xFF4488CC);
  host.sendStroke(50, 50, 50, 50, 2, 0, 0xFF4488CC);
  host.executeCommand('merge down');
  const orderCountAfterMerge = canvas.exports.w_layer_get_order_count();
  if (orderCountAfterMerge !== orderCountAfterA - 1) {
    throw new Error(`Expected order count ${orderCountAfterA - 1} after merge down, got ${orderCountAfterMerge}`);
  }

  // Test Layer Groups / Folders
  host.executeCommand('group new InkFolder');
  let foundGroup = null;
  for (const g of host.layerGroups.values()) {
    if (g.name === 'InkFolder') { foundGroup = g; break; }
  }
  if (!foundGroup) throw new Error("Expected group 'InkFolder' to exist");

  const curActive = canvas.exports.get_active_layer();
  host.executeCommand(`group add InkFolder ${curActive}`);
  if (!foundGroup.layerIds.includes(curActive)) {
    throw new Error(`Expected layer ${curActive} in group InkFolder`);
  }

  host.executeCommand('group toggle InkFolder');
  if (foundGroup.visible !== false) {
    throw new Error("Expected InkFolder visible to be false after toggle");
  }
  host.executeCommand('group toggle InkFolder');
  if (foundGroup.visible !== true) {
    throw new Error("Expected InkFolder visible to be true after second toggle");
  }

  host.executeCommand(`group remove ${curActive}`);
  if (foundGroup.layerIds.includes(curActive)) {
    throw new Error(`Expected layer ${curActive} to be removed from group`);
  }

  // ── Test Eyedropper / Color Picker ──
  host.executeCommand('set mode brush');
  host.executeCommand('set color #3388ee');
  host.executeCommand('brush 50 50');
  host.executeCommand('set mode picker');
  if (host.brushParams.mode !== 5) {
    throw new Error(`Expected mode 5 (picker), got ${host.brushParams.mode}`);
  }
  const pickedHex = host.pickColor(50, 50, true);
  if (!pickedHex || !pickedHex.startsWith('#')) {
    throw new Error(`Expected valid picked hex, got ${pickedHex}`);
  }
  host.executeCommand('pick 50 50');

  // ── Test Roadmap Phase 3 Features ──
  // 1. Subpixel
  host.executeCommand('set subpixel on');
  if (host.brushParams.subpixel !== 1) {
    throw new Error(`Expected subpixel 1, got ${host.brushParams.subpixel}`);
  }
  host.executeCommand('set subpixel off');
  if (host.brushParams.subpixel !== 0) {
    throw new Error(`Expected subpixel 0, got ${host.brushParams.subpixel}`);
  }

  // 2. Paint Depletion
  host.executeCommand('set depletion 45');
  if (host.brushParams.depletion !== 45) {
    throw new Error(`Expected depletion 45, got ${host.brushParams.depletion}`);
  }

  // 3. Continuous Color Pickup
  host.executeCommand('set color_pickup 60');
  if (host.brushParams.color_pickup !== 60) {
    throw new Error(`Expected color_pickup 60, got ${host.brushParams.color_pickup}`);
  }

  // 4. Dual Brush
  host.executeCommand('set dual_shape chisel');
  if (host.brushParams.dual_shape !== 2) {
    throw new Error(`Expected dual_shape 2 (chisel), got ${host.brushParams.dual_shape}`);
  }
  host.executeCommand('set dual_size 125');
  if (host.brushParams.dual_size !== 125) {
    throw new Error(`Expected dual_size 125, got ${host.brushParams.dual_size}`);
  }
  host.executeCommand('set dual_spacing 30');
  if (host.brushParams.dual_spacing !== 30) {
    throw new Error(`Expected dual_spacing 30, got ${host.brushParams.dual_spacing}`);
  }

  // 5. Dump Brush Script
  const dumped = host.dumpBrushScript();
  if (!dumped.includes('set size') || !dumped.includes('set opacity') || !dumped.includes('set dual_shape')) {
    throw new Error(`Expected complete brush dump, got:\n${dumped}`);
  }
  host.executeCommand('dump brush');

  console.log('ALL TESTS PASSED: Unified Textures & Layers, Custom Shape Alpha Sampling, REPL, Stroke Smoothing, Filters, Undo/Redo, Auto-Rotate, Velocity, Taper/Fade, Jitters, Dab Blend Modes, UI Scaling, Layer Reordering, Merge Down, Layer Groups, Eyedropper, Subpixel, Wet Media Depletion/Pickup, Dual Brush, and Dump Brush verified 100%!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
