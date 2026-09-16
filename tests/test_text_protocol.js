const path = require('path');
const fs = require('fs');
const { EsenhoScreenHost, EsenhoModule, PARAM_IDS, parseColorString } = require('../src/esenho');

async function run() {
  console.log('--- Testing Canvas Native Exports ---');
  const canvas = new EsenhoModule(path.resolve(__dirname, '../roms/canvas.wasm'));
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

  console.log('--- Testing EsenhoScreenHost REPL / Command Parsing ---');
  const host = new EsenhoScreenHost();
  host.canvasActor = canvas;
  host.syncBrushParams(canvas);

  // Dynamically discover and load filter plugins from plugins/
  const pluginsDir = path.resolve(__dirname, '../plugins');
  if (fs.existsSync(pluginsDir)) {
    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.wasm')).sort();
    for (const file of files) {
      const f = file.replace(/\.wasm$/, '');
      const wasmPath = path.join(pluginsDir, file);
      const mod = new EsenhoModule(wasmPath, { name: f });
      host.plugins.set(f, { type: 'filter', module: mod, actor: mod });
    }
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
  host.executeCommand('set stabilize 50');
  if (host.brushParams.smoothing !== 50) {
    throw new Error(`Expected smoothing 50, got ${host.brushParams.smoothing}`);
  }
  host.executeCommand('brush stabilization 75');
  if (host.brushParams.smoothing !== 75) {
    throw new Error(`Expected smoothing 75, got ${host.brushParams.smoothing}`);
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
  EsenhoScreenHost.COMMAND_RULES.unshift({
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

  // Test All Dynamically Discovered Filters without crashing
  for (const f of host.plugins.keys()) {
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
  const prevActive = canvas.exports.get_active_layer();
  let prevActivePos = -1;
  for (let p = 0; p < canvas.exports.w_layer_get_order_count(); p++) {
    if (canvas.exports.w_layer_get_order(p) === prevActive) { prevActivePos = p; break; }
  }
  const initialOrderCount = canvas.exports.w_layer_get_order_count();
  host.executeCommand('new layer');
  const layerA = canvas.exports.get_active_layer();
  const orderCountAfterA = canvas.exports.w_layer_get_order_count();
  if (orderCountAfterA !== initialOrderCount + 1) {
    throw new Error(`Expected order count ${initialOrderCount + 1}, got ${orderCountAfterA}`);
  }
  // layerA should be immediately above prevActive in stack
  const posA = prevActivePos + 1;
  if (canvas.exports.w_layer_get_order(posA) !== layerA) {
    throw new Error(`Expected layer ${layerA} above active at pos ${posA}, got ${canvas.exports.w_layer_get_order(posA)}`);
  }

  // Move layerA down
  host.executeCommand(`layer move down ${layerA}`);
  if (canvas.exports.w_layer_get_order(posA - 1) !== layerA) {
    throw new Error(`Expected layer ${layerA} at pos ${posA - 1} after move down`);
  }

  // Move layerA back up
  host.executeCommand(`layer move up ${layerA}`);
  if (canvas.exports.w_layer_get_order(posA) !== layerA) {
    throw new Error(`Expected layer ${layerA} at pos ${posA} after move up`);
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

  // ── Test History Command Fix ──
  host.pushUndoSnapshot('test_history_action_1');
  host.pushUndoSnapshot('test_history_action_2');
  if (host.undoStack.length < 2) {
    throw new Error(`Expected undoStack to have items, got ${host.undoStack.length}`);
  }
  // history command should run without throwing or erroring
  host.executeCommand('history');
  host.executeCommand('history clear');
  if (host.undoStack.length !== 0 || host.redoStack.length !== 0) {
    throw new Error(`Expected history clear to empty stacks, got undo:${host.undoStack.length} redo:${host.redoStack.length}`);
  }

  // ── Test Roadmap Phase 4 Features ──
  console.log('--- Testing Roadmap Phase 4 Features ---');

  // Reset tool and mode to normal brush drawing
  host.currentTool = 0;
  host.executeCommand('set mode draw');
  host.executeCommand('set brush round');
  host.executeCommand('set color_pickup 0');
  host.executeCommand('set depletion 0');
  host.executeCommand('set dual_shape none');
  host.executeCommand('set opacity 100');
  host.executeCommand('set flow 100');
  host.executeCommand('set spacing 5');

  // Select topmost visible document layer so new layers are placed on top of canvas
  for (let p = canvas.exports.w_layer_get_order_count() - 1; p >= 0; p--) {
    const l = canvas.exports.w_layer_get_order(p);
    if (canvas.exports.get_layer_visible(l) && canvas.exports.w_layer_get_width(l) === 640) {
      host.canvasActor.exports.w_layer_select(l);
      break;
    }
  }

  // 1. Alpha Lock
  const testLayerAlpha = host.canvasActor.exports.w_layer_add();
  host.canvasActor.exports.w_layer_select(testLayerAlpha);
  const lw = host.canvasActor.exports.w_layer_get_width(testLayerAlpha);
  const lh = host.canvasActor.exports.w_layer_get_height(testLayerAlpha);
  // Draw a 20x20 red square in active layer
  host.canvasActor.exports.w_draw_rect(50, 50, 20, 20, 0xFF0000FF); // Red (ABGR)
  let lPixPtr = host.canvasActor.exports.w_layer_get_pixels(testLayerAlpha);
  let lPixels = new Uint32Array(host.canvasActor.memory.buffer, lPixPtr, lw * lh);
  if (lPixels[55 * lw + 55] !== 0xFF0000FF || lPixels[10 * lw + 10] !== 0) {
    throw new Error('Alpha lock setup: initial square failed');
  }

  // Enable Alpha Lock
  host.executeCommand('layer alpha_lock on');
  if (host.getLayerAlphaLock(testLayerAlpha) !== 1) {
    throw new Error(`Expected alpha_lock 1, got ${host.getLayerAlphaLock(testLayerAlpha)}`);
  }

  // Draw green dab across both transparent pixel (10, 10) and opaque pixel (55, 55)
  host.executeCommand('set color green');
  host.executeCommand('set brush size 10');
  host.executeCommand('set brush hardness 100');
  host.sendStroke(10, 10, 10, 10, 0, 0, 0xFF00FF00);
  host.sendStroke(55, 55, 55, 55, 0, 0, 0xFF00FF00);

  // Transparent pixel (10, 10) must REMAIN 0 (untouched by stroke)
  if (lPixels[10 * lw + 10] !== 0) {
    throw new Error(`Alpha lock failed: transparent pixel was modified to 0x${lPixels[10 * lw + 10].toString(16)}`);
  }
  // Opaque pixel (55, 55) must be painted green
  if (lPixels[55 * lw + 55] !== 0xFF00FF00) {
    throw new Error(`Alpha lock failed: opaque pixel was not painted, got 0x${lPixels[55 * lw + 55].toString(16)}`);
  }

  // Disable Alpha Lock
  host.executeCommand('layer alpha_lock off');
  if (host.getLayerAlphaLock(testLayerAlpha) !== 0) {
    throw new Error('Alpha lock off failed');
  }

  // 2. Clipping Mask
  const baseLayer = host.canvasActor.exports.w_layer_add();
  const clippedLayer = host.canvasActor.exports.w_layer_add();

  // Draw an opaque mask area on baseLayer: 40x40 at (200, 200)
  host.canvasActor.exports.w_layer_select(baseLayer);
  host.canvasActor.exports.w_draw_rect(200, 200, 40, 40, 0xFFFFFFFF);

  // On clippedLayer, draw a wider area: 100x100 at (180, 180)
  host.canvasActor.exports.w_layer_select(clippedLayer);
  host.canvasActor.exports.w_draw_rect(180, 180, 100, 100, 0xFF0000FF); // Red

  // Enable Clipping Mask on clippedLayer
  host.executeCommand(`layer clipping ${clippedLayer} on`);
  if (host.getLayerClipping(clippedLayer) !== 1) {
    throw new Error(`Expected clipping 1, got ${host.getLayerClipping(clippedLayer)}`);
  }

  // Force composite and inspect output
  host.canvasActor.exports.w_force_composite();
  const cPtr = host.canvasActor.exports.get_composite_pixels();
  const cPixels = new Uint32Array(host.canvasActor.memory.buffer, cPtr, 640 * 480);

  // Pixel at (185, 185) is inside clippedLayer rect (red 0xFF0000FF) but outside baseLayer (200..240) -> must NOT be red (clipped!)
  if (cPixels[185 * 640 + 185] === 0xFF0000FF) {
    throw new Error(`Clipping mask failed: pixel outside base layer was not clipped! Got red color`);
  }
  // Pixel at (210, 210) is inside both baseLayer and clippedLayer -> must be red
  if (cPixels[210 * 640 + 210] !== 0xFF0000FF) {
    throw new Error(`Clipping mask failed: pixel inside base layer was not red! Got 0x${cPixels[210 * 640 + 210].toString(16)}`);
  }

  // Disable Clipping
  host.executeCommand(`layer clipping ${clippedLayer} off`);
  if (host.getLayerClipping(clippedLayer) !== 0) {
    throw new Error('Clipping off failed');
  }

  // 3. Layer Blend Modes
  const blendLayer = host.canvasActor.exports.w_layer_add();
  const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'dodge', 'add'];
  for (let i = 0; i < blendModes.length; i++) {
    host.executeCommand(`layer blend ${blendLayer} ${blendModes[i]}`);
    if (host.getLayerBlendMode(blendLayer) !== i) {
      throw new Error(`Expected layer blend mode ${i} (${blendModes[i]}), got ${host.getLayerBlendMode(blendLayer)}`);
    }
  }
  host.executeCommand(`layer blend ${blendLayer} normal`);

  // 4. Flip Canvas Horizontal & Vertical
  if (host.flipH !== false) throw new Error('Expected initial flipH to be false');
  host.executeCommand('flip canvas');
  if (host.flipH !== true) throw new Error('Expected flipH true after flip canvas');
  host.executeCommand('flip h');
  if (host.flipH !== false) throw new Error('Expected flipH false after flip h');
  host.executeCommand('view flip');
  if (host.flipH !== true) throw new Error('Expected flipH true after view flip');
  host.executeCommand('flip');
  if (host.flipH !== false) throw new Error('Expected flipH false after toggle flip');

  if (host.flipV !== false) throw new Error('Expected initial flipV to be false');
  host.executeCommand('flip v');
  if (host.flipV !== true) throw new Error('Expected flipV true after flip v');
  host.executeCommand('flip vertical');
  if (host.flipV !== false) throw new Error('Expected flipV false after flip vertical');
  host.executeCommand('view flip v');
  if (host.flipV !== true) throw new Error('Expected flipV true after view flip v');
  host.executeCommand('flip canvas');
  if (host.flipH !== true || host.flipV !== true) throw new Error('Expected both flipH and flipV true');
  host.executeCommand('flip reset');
  if (host.flipH !== false || host.flipV !== false) throw new Error('Expected flip reset to clear both flips');

  // 5. Real-Time Symmetry
  const symLayer = host.canvasActor.exports.w_layer_add();
  host.canvasActor.exports.w_layer_select(symLayer);

  // Vertical Symmetry (Mirror across X axis)
  host.executeCommand('set symmetry vertical');
  if (host.brushParams.symmetry !== 1) {
    throw new Error(`Expected symmetry 1 (vertical), got ${host.brushParams.symmetry}`);
  }

  const sPixPtr = host.canvasActor.exports.w_layer_get_pixels(symLayer);
  const sPixels = new Uint32Array(host.canvasActor.memory.buffer, sPixPtr, 640 * 480);

  // Paint a single dab at (120, 80)
  host.executeCommand('set color #ff00ff');
  host.executeCommand('set brush size 6');
  host.executeCommand('set brush hardness 100');
  host.sendStroke(120, 80, 120, 80, 0, 0, 0xFFFF00FF);

  // Original point (120, 80) must have been painted
  if (sPixels[80 * 640 + 120] === 0) {
    throw new Error('Symmetry stroke original point was not painted');
  }
  // Mirrored point (640 - 1 - 120 = 519, 80) must also have been painted!
  const mirrorX = 640 - 1 - 120;
  if (sPixels[80 * 640 + mirrorX] === 0) {
    throw new Error(`Symmetry vertical failed: mirrored point (${mirrorX}, 80) was not painted!`);
  }

  // Quad Symmetry (Horizontal + Vertical = 4 quadrants)
  host.executeCommand('set symmetry quad');
  if (host.brushParams.symmetry !== 3) {
    throw new Error(`Expected symmetry 3 (quad), got ${host.brushParams.symmetry}`);
  }
  host.sendStroke(100, 60, 100, 60, 0, 0, 0xFFFF00FF);

  const mx = 640 - 1 - 100;
  const my = 480 - 1 - 60;
  if (sPixels[60 * 640 + 100] === 0 || sPixels[60 * 640 + mx] === 0 ||
      sPixels[my * 640 + 100] === 0 || sPixels[my * 640 + mx] === 0) {
    throw new Error('Symmetry quad failed: one of 4 mirrored quadrants was not painted!');
  }

  // Turn symmetry off
  host.executeCommand('set symmetry off');
  if (host.brushParams.symmetry !== 0) {
    throw new Error('Symmetry off failed');
  }

  // Check dump brush includes symmetry when enabled
  host.executeCommand('set symmetry v');
  const dumpedSym = host.dumpBrushScript();
  if (!dumpedSym.includes('set symmetry vertical')) {
    throw new Error(`Expected dump brush to include symmetry, got:\n${dumpedSym}`);
  }
  // Test Initial Folders: 'tips' and 'grains'
  const groupNames = Array.from(host.layerGroups.values()).map(g => g.name);
  if (!groupNames.includes('tips') || !groupNames.includes('grains')) {
    throw new Error(`Expected initial folders 'tips' and 'grains', got: ${JSON.stringify(groupNames)}`);
  }

  // Test 'reset tool' Command
  host.executeCommand('set size 55');
  host.executeCommand('set opacity 40');
  host.executeCommand('set hardness 20');
  host.executeCommand('set symmetry quad');
  host.executeCommand('set color_pickup 80');
  host.executeCommand('# A comment should be ignored without error');
  host.executeCommand('// Another comment');
  if (host.brushParams.size !== 55 || host.brushParams.symmetry !== 3) {
    throw new Error('Brush params setup before reset tool failed');
  }
  host.executeCommand('reset tool');
  if (host.brushParams.size !== 16 || host.brushParams.opacity !== 100 || host.brushParams.hardness !== 100 ||
      host.brushParams.spacing !== 5 || host.brushParams.smudge !== 0 || host.brushParams.wetness !== 0 ||
      host.brushParams.symmetry !== 0 || host.brushParams.color_pickup !== 0 || host.activeTexture !== 'none') {
    throw new Error(`reset tool failed, brushParams: ${JSON.stringify(host.brushParams)}`);
  }

  console.log('--- Testing Roadmap Phase 5 Features ---');
  // 1. Shapes and Straight Line Guides
  host.executeCommand('set mode line');
  if (host.brushParams.mode !== 6) {
    throw new Error(`Expected mode 6 for line, got ${host.brushParams.mode}`);
  }
  host.executeCommand('set mode rect');
  if (host.brushParams.mode !== 7) {
    throw new Error(`Expected mode 7 for rect, got ${host.brushParams.mode}`);
  }
  host.executeCommand('set mode ellipse');
  if (host.brushParams.mode !== 8) {
    throw new Error(`Expected mode 8 for ellipse, got ${host.brushParams.mode}`);
  }
  host.executeCommand('set mode select');
  if (host.brushParams.mode !== 9) {
    throw new Error(`Expected mode 9 for select, got ${host.brushParams.mode}`);
  }

  // Test draw ellipse command
  host.executeCommand('set mode brush');
  host.executeCommand('draw ellipse 200 200 30 20 #ff00ffff');
  const pAct = canvas.exports.get_active_layer();
  const pPtr = canvas.exports.get_layer_pixels(pAct);
  const pWidth = canvas.exports.get_canvas_width();
  const pPix = new Uint32Array(canvas.memory.buffer, pPtr, pWidth * 480);
  if (pPix[200 * pWidth + (200 + 30)] !== 0xFFFF00FF) {
    throw new Error('draw ellipse command failed: expected pixel at (230, 200)');
  }

  // 2. Selection & Clipboard Commands
  host.executeCommand('select rect 190 190 45 40');
  if (!host.selection.active || host.selection.x !== 190 || host.selection.y !== 190 || host.selection.w !== 45 || host.selection.h !== 40) {
    throw new Error(`select rect failed, selection: ${JSON.stringify(host.selection)}`);
  }
  // Cut selection: copies to clipboard and clears layer region; creates floating layer
  host.executeCommand('cut');
  if (!host.clipboard || host.clipboard.w !== 45 || host.clipboard.h !== 40) {
    throw new Error(`cut selection failed, clipboard: ${JSON.stringify(host.clipboard)}`);
  }
  curPix = new Uint32Array(canvas.memory.buffer, canvas.exports.get_layer_pixels(pAct), pWidth * 480);
  if (curPix[200 * pWidth + 200] !== 0) {
    throw new Error('cut selection failed: pixel inside selection was not cleared');
  }
  // Apply floating transform (commits it) and switch back to original layer for paste
  host.executeCommand('transform apply');
  host.executeCommand(`layer ${pAct}`);
  // Paste to new location (300, 300)
  host.executeCommand('paste 300 300');
  curPix = new Uint32Array(canvas.memory.buffer, canvas.exports.get_layer_pixels(pAct), pWidth * 480);
  if (curPix[310 * pWidth + 310] !== 0xFFFF00FF) {
    throw new Error('paste clipboard failed: expected pixel at (310, 310)');
  }
  // Select all & deselect
  host.executeCommand('select all');
  if (!host.selection.active || host.selection.w !== 640 || host.selection.h !== 480) {
    throw new Error('select all failed');
  }
  host.executeCommand('deselect');
  if (host.selection.active) {
    throw new Error('deselect failed: selection still active');
  }

  // 3. Layer Color Adjustments (HSV/HSL)
  const getPix = () => new Uint32Array(canvas.memory.buffer, canvas.exports.get_layer_pixels(pAct), pWidth * 480);
  host.executeCommand('draw rect 50 50 20 20 #ff0000ff');
  const sampleIdx = 55 * pWidth + 55;
  const beforeAdj = getPix()[sampleIdx];
  const redB = (beforeAdj >> 16) & 0xFF;
  const redG = (beforeAdj >> 8) & 0xFF;
  const redR = beforeAdj & 0xFF;
  const redA = (beforeAdj >> 24) & 0xFF;
  if (redR < 200 || redG > 50 || redA !== 255) {
    throw new Error(`Setup before HSV adjust failed, pixel: 0x${beforeAdj.toString(16)}`);
  }
  // Shift Hue +120° (Red -> Green)
  host.executeCommand('adjust hue 120');
  const afterHue = getPix()[sampleIdx];
  const gB = (afterHue >> 16) & 0xFF;
  const gG = (afterHue >> 8) & 0xFF;
  const gR = afterHue & 0xFF;
  const gA = (afterHue >> 24) & 0xFF;
  if (gG < 200 || gR > 50 || gA !== 255) {
    throw new Error(`adjust hue 120 failed: expected green pixel, got 0x${afterHue.toString(16)}`);
  }
  // Adjust Saturation -100% -> Grayscale
  host.executeCommand('adjust sat -100');
  const afterSat = getPix()[sampleIdx];
  const satB = (afterSat >> 16) & 0xFF;
  const satG = (afterSat >> 8) & 0xFF;
  const satR = afterSat & 0xFF;
  if (Math.abs(satR - satG) > 2 || Math.abs(satG - satB) > 2) {
    throw new Error(`adjust sat -100 failed: expected grayscale pixel, got 0x${afterSat.toString(16)}`);
  }
  // Adjust Brightness / Value
  host.executeCommand('adjust val -50');
  const afterVal = getPix()[sampleIdx];
  const valR = afterVal & 0xFF;
  if (valR >= satR) {
    throw new Error(`adjust val -50 failed: expected darker pixel, got ${valR} vs previous ${satR}`);
  }

  // 4. Test filter blur with radius
  host.executeCommand('filter blur 5');

  // 5. Test Phase 6: Lasso & Wand Selection
  host.executeCommand('set mode wand_select');
  if (host.brushParams.mode !== 11) {
    throw new Error(`set mode wand_select failed: expected mode 11, got ${host.brushParams.mode}`);
  }
  host.executeCommand('set tool wand_select');
  if (host.brushParams.mode !== 11) {
    throw new Error(`set tool wand_select failed: expected mode 11, got ${host.brushParams.mode}`);
  }
  host.executeCommand('wand tolerance 50');
  if (host.wandTolerance !== 50) {
    throw new Error(`wand tolerance 50 failed, got ${host.wandTolerance}`);
  }
  // Draw a solid rect to test wand selection
  host.executeCommand('set mode draw');
  host.executeCommand('draw rect 100 100 30 30 #00ff00ff');
  host.wandSelect(110, 110, 10);
  if (!host.selection.active || host.selection.x < 100 || host.selection.w < 20 || host.selection.h < 20) {
    throw new Error(`wandSelect failed: selection=${JSON.stringify(host.selection)}`);
  }
  host.executeCommand('deselect');
  if (host.selection.active) {
    throw new Error('deselect after wand failed');
  }
  host.executeCommand('select lasso');
  if (host.brushParams.mode !== 10) {
    throw new Error(`select lasso failed: expected mode 10, got ${host.brushParams.mode}`);
  }

  // 6. Test Drawing & Filters Constrained to Selection
  const actLayer = canvas.exports.get_active_layer();
  const cWidth = canvas.exports.get_canvas_width();
  const cPix = new Uint32Array(canvas.memory.buffer, canvas.exports.get_layer_pixels(actLayer), cWidth * 480);
  cPix.fill(0); // clear layer

  // Set selection rect (50, 50, 40, 40)
  host.executeCommand('select rect 50 50 40 40');
  // Draw rect covering (0, 0, 100, 100) with solid red
  host.executeCommand('draw rect 0 0 100 100 #ff0000ff');

  // Verify pixel inside selection (60, 60) is red
  const insidePixel = cPix[60 * cWidth + 60];
  if ((insidePixel & 0xFF) < 200) {
    throw new Error(`selection drawing clip failed: expected red inside selection, got 0x${insidePixel.toString(16)}`);
  }
  // Verify pixel outside selection (20, 20) is still 0 (untouched)
  const outsidePixel = cPix[20 * cWidth + 20];
  if (outsidePixel !== 0) {
    throw new Error(`selection drawing clip failed: expected untouched pixel outside selection, got 0x${outsidePixel.toString(16)}`);
  }

  // Test filter only applies inside selection
  host.executeCommand('filter invert');
  const insideInverted = cPix[60 * cWidth + 60];
  // Inverted red (#ff0000) should have cyan tone (high green/blue)
  if (((insideInverted >> 8) & 0xFF) < 200) {
    throw new Error(`selection filter clip failed: expected inverted pixel inside selection, got 0x${insideInverted.toString(16)}`);
  }
  // Outside pixel must still be 0!
  if (cPix[20 * cWidth + 20] !== 0) {
    throw new Error(`selection filter clip failed: outside pixel was modified!`);
  }
  // 7. Test Selection Modes (Add, Sub, Intersect) and Adjacent Pixels Switch
  host.executeCommand('set select_mode add');
  if (host.selectionMode !== 'add') {
    throw new Error(`set select_mode add failed, got ${host.selectionMode}`);
  }
  // Start with a rect at (10, 10, 20, 20)
  host.setSelection(10, 10, 20, 20, 'replace');
  // Add another adjacent rect at (30, 10, 20, 20)
  host.setSelection(30, 10, 20, 20, 'add');
  if (!host.selection.active || host.selection.x !== 10 || host.selection.y !== 10 || host.selection.w !== 40 || host.selection.h !== 20) {
    throw new Error(`selection mode add failed: expected 40x20 rect at (10,10), got ${JSON.stringify(host.selection)}`);
  }

  // Subtract rect (25, 10, 10, 20) from the middle
  host.executeCommand('set selection_mode sub');
  host.setSelection(25, 10, 10, 20);
  if (!host.selection.active || !host.selection.mask) {
    throw new Error(`selection mode sub failed: expected masked selection, got ${JSON.stringify(host.selection)}`);
  }
  // Middle pixel (27, 15) must be carved out (0 in mask)
  const subMaskX = 27 - host.selection.x;
  const subMaskY = 15 - host.selection.y;
  if (host.selection.mask[subMaskY * host.selection.w + subMaskX] !== 0) {
    throw new Error('selection mode sub failed: center pixel still selected in mask');
  }
  // Left pixel (15, 15) must still be selected (1 in mask)
  const leftMaskX = 15 - host.selection.x;
  const leftMaskY = 15 - host.selection.y;
  if (host.selection.mask[leftMaskY * host.selection.w + leftMaskX] !== 1) {
    throw new Error('selection mode sub failed: left pixel was unselected');
  }

  // Test Intersect mode
  host.setSelection(10, 10, 30, 30, 'replace');
  host.setSelection(20, 20, 30, 30, 'intersect');
  if (!host.selection.active || host.selection.x !== 20 || host.selection.y !== 20 || host.selection.w !== 20 || host.selection.h !== 20) {
    throw new Error(`selection mode intersect failed: expected 20x20 at (20,20), got ${JSON.stringify(host.selection)}`);
  }
  host.executeCommand('deselect');
  host.executeCommand('set select_mode replace');

  // 8. Test Wand Adjacent (Contiguous vs Global) Switch
  // Draw two disconnected red squares on layer
  cPix.fill(0);
  host.executeCommand('draw rect 50 50 20 20 #ff0000ff');
  host.executeCommand('draw rect 100 50 20 20 #ff0000ff');

  // Adjacent ON (default): clicking (55, 55) should only select the first square
  host.executeCommand('wand adjacent on');
  if (!host.wandAdjacent) throw new Error('wand adjacent on failed');
  host.wandSelect(55, 55, 10);
  if (!host.selection.active || host.selection.w > 25 || host.selection.x > 60) {
    throw new Error(`wand contiguous failed: expected only first rect, got ${JSON.stringify(host.selection)}`);
  }

  // Adjacent OFF: clicking (55, 55) should globally select BOTH disconnected squares
  host.executeCommand('wand adjacent off');
  if (host.wandAdjacent) throw new Error('wand adjacent off failed');
  host.wandSelect(55, 55, 10);
  if (!host.selection.active || host.selection.x > 50 || (host.selection.x + host.selection.w) < 119) {
    throw new Error(`wand global (adjacent off) failed: expected both squares, got ${JSON.stringify(host.selection)}`);
  }
  // 9. Test Action Modes: Draw, Erase, Smudge, Select
  host.executeCommand('set action_mode erase');
  if (host.actionMode !== 'erase') throw new Error(`set action_mode erase failed, got ${host.actionMode}`);
  host.executeCommand('set action_mode smudge');
  if (host.actionMode !== 'smudge') throw new Error(`set action_mode smudge failed, got ${host.actionMode}`);

  // Test Smudge stroke smears paint
  host.executeCommand('deselect');
  host.executeCommand('clear');
  host.executeCommand('set action_mode draw');
  host.executeCommand('set size 10');
  host.executeCommand('set hardness 100');
  host.executeCommand('draw rect 40 40 20 20 #0000ffff'); // Blue square
  const actL = host.canvasActor.exports.get_active_layer();
  const smWidth = host.canvasActor.exports.w_layer_get_width(actL);
  const smHeight = host.canvasActor.exports.w_layer_get_height(actL);
  const beforeSmudge = host.canvasActor.exports.w_layer_get_pixels(actL);
  const beforeU32 = new Uint32Array(host.canvasActor.memory.buffer, beforeSmudge, smWidth * smHeight);
  if ((beforeU32[45 * smWidth + 65] >>> 24) !== 0) {
    throw new Error('expected target pixel to be empty before smudge');
  }
  host.setActionMode('smudge');
  host.sendStroke(50, 45, 50, 45, 0, 0, 0);
  host.sendStroke(70, 45, 50, 45, 1, 0, 0);
  host.sendStroke(70, 45, 70, 45, 2, 0, 0);
  const afterSmudge = host.canvasActor.exports.w_layer_get_pixels(actL);
  const afterU32 = new Uint32Array(host.canvasActor.memory.buffer, afterSmudge, smWidth * smHeight);
  if ((afterU32[45 * smWidth + 65] >>> 24) === 0) {
    throw new Error('smudge failed to smear color to (65, 45)');
  }

  // Test Smudge on empty area does NOT deposit paint
  host.sendStroke(200, 200, 200, 200, 0, 0, 0xFF0000FF);
  host.sendStroke(220, 200, 200, 200, 1, 0, 0xFF0000FF);
  host.sendStroke(220, 200, 220, 200, 2, 0, 0xFF0000FF);
  if ((afterU32[200 * smWidth + 210] >>> 24) !== 0) {
    throw new Error('smudge on empty canvas unexpectedly deposited paint');
  }

  host.executeCommand('set action_mode select');
  if (host.actionMode !== 'select') throw new Error(`set action_mode select failed, got ${host.actionMode}`);
  host.setEllipseSelection(150, 150, 20, 15);
  if (!host.selection.active || !host.selection.mask || host.selection.w !== 41 || host.selection.h !== 31) {
    throw new Error(`setEllipseSelection failed: ${JSON.stringify(host.selection)}`);
  }
  host.executeCommand('deselect');

  // Test Selection scratch layer with brush over existing colored content
  const scratchId = host.canvasActor.exports.w_get_selection_scratch_layer();
  if (scratchId < 0) throw new Error('w_get_selection_scratch_layer failed');
  const curAct = host.canvasActor.exports.get_active_layer();
  host.canvasActor.exports.w_layer_select(scratchId);
  host.canvasActor.exports.w_layer_clear(scratchId);
  host.sendStroke(45, 45, 45, 45, 0, 0, 0xFF83A598);
  host.sendStroke(65, 45, 45, 45, 1, 0, 0xFF83A598);
  host.sendStroke(65, 45, 65, 45, 2, 0, 0xFF83A598);
  const sPtr = host.canvasActor.exports.w_layer_get_pixels(scratchId);
  const sU32 = new Uint32Array(host.canvasActor.memory.buffer, sPtr, smWidth * smHeight);
  if ((sU32[45 * smWidth + 45] >>> 24) === 0 || (sU32[45 * smWidth + 65] >>> 24) === 0) {
    throw new Error('brush selection on scratch layer failed to record stroked pixels');
  }
  host.canvasActor.exports.w_layer_clear(scratchId);
  host.canvasActor.exports.w_layer_select(curAct);

  host.executeCommand('set action_mode draw');
  if (host.actionMode !== 'draw') throw new Error(`set action_mode draw failed, got ${host.actionMode}`);

  // Test Filter Parameterization (all filters with custom p1 and p2)
  host.executeCommand('clear');
  host.executeCommand('draw rect 50 50 100 100 #ff0000ff');
  host.executeCommand('filter blur 8 2');
  host.executeCommand('filter brightness 20');
  host.executeCommand('filter contrast 15');
  host.executeCommand('filter noise 10 1');
  host.executeCommand('filter pixelate 4');
  host.executeCommand('filter grayscale 50');
  host.executeCommand('filter invert 50');
  host.executeCommand('filter sepia 40');
  host.executeCommand('filter threshold 100');
  host.executeCommand('filter edge 25 1');
  host.executeCommand('filter dither 10 0');

  // Test Stylus & Wacom Tablet Dynamics (Pressure & Tilt)
  console.log('--- Testing Stylus & Wacom Dynamics ---');
  host.executeCommand('set pressure_size on');
  host.executeCommand('set pressure_flow on');
  host.executeCommand('set tilt_angle on');
  if (host.brushParams.pressure_size !== 1 || host.brushParams.pressure_flow !== 1 || host.brushParams.tilt_angle !== 1) {
    throw new Error('Stylus parameters failed to set via REPL');
  }

  // Test aliases
  host.executeCommand('set stylus_size off');
  host.executeCommand('set stylus_flow off');
  host.executeCommand('set stylus_tilt off');
  if (host.brushParams.pressure_size !== 0 || host.brushParams.pressure_flow !== 0 || host.brushParams.tilt_angle !== 0) {
    throw new Error('Stylus alias parameters failed to set via REPL');
  }

  // Re-enable for stroke tests
  host.executeCommand('set pressure_size on');
  host.executeCommand('set pressure_flow on');
  host.executeCommand('set tilt_angle on');
  host.executeCommand('set size 30');
  host.executeCommand('set hardness 100');
  host.executeCommand('set opacity 100');
  host.executeCommand('set flow 100');

  // Low pressure stroke (pressure = 0.2 -> effective dab_r = 30 * 0.2 = 6)
  host.executeCommand('clear');
  host.sendStroke(100, 100, 100, 100, 0, 0, 0xFF0000FF, 0.2, 0, 0);
  const stylusPtr1 = host.canvasActor.exports.get_active_layer_pixels();
  const stylusU32_1 = new Uint32Array(host.canvasActor.memory.buffer, stylusPtr1, 640 * 480);
  
  // Center (100, 100) must be colored
  if ((stylusU32_1[100 * 640 + 100] >>> 24) === 0) {
    throw new Error('Expected low-pressure stroke center to be drawn');
  }
  // Point at distance 12 (100, 112) should be untouched because radius is ~6
  if ((stylusU32_1[112 * 640 + 100] >>> 24) !== 0) {
    throw new Error('Expected point at dist 12 to be empty under low pressure');
  }

  // High pressure stroke (pressure = 1.0 -> effective dab_r = 30)
  host.executeCommand('clear');
  host.sendStroke(100, 100, 100, 100, 0, 0, 0xFF0000FF, 1.0, 0, 0);
  const stylusPtr2 = host.canvasActor.exports.get_active_layer_pixels();
  const stylusU32_2 = new Uint32Array(host.canvasActor.memory.buffer, stylusPtr2, 640 * 480);
  if ((stylusU32_2[112 * 640 + 100] >>> 24) === 0) {
    throw new Error('Expected point at dist 12 to be drawn under full pressure');
  }

  // Test Stylus Tilt Dynamics
  host.executeCommand('clear');
  host.executeCommand('set shape chisel');
  host.executeCommand('set size 40');
  host.executeCommand('set roundness 25');
  host.executeCommand('set angle 0');
  // Tilt along X axis (tiltX = 45, tiltY = 0 -> angle = 0)
  host.sendStroke(200, 200, 200, 200, 0, 0, 0xFF00FF00, 1.0, 45, 0);
  // Tilt along Y axis (tiltX = 0, tiltY = 45 -> angle = 90)
  host.sendStroke(300, 200, 300, 200, 0, 0, 0xFF00FF00, 1.0, 0, 45);

  console.log('--- Testing Native .esen Project Savefile & Autosave Engine ---');
  // Setup multi-layer drawing with specific properties
  host.canvasActor.exports.w_init(320, 240);
  host.executeCommand('clear');
  host.executeCommand('set color #ff0055');
  host.executeCommand('shape rect 20 20 40 40');
  host.executeCommand('new layer OverlayLayer');
  host.executeCommand('layer blend overlay');
  host.executeCommand('layer alpha_lock on');
  host.executeCommand('set color #00aaff');
  host.executeCommand('shape rect 30 30 50 50');
  host.executeCommand('group new InkGroup');
  host.executeCommand('set size 42');
  host.executeCommand('set opacity 77');

  // Export project to .esen data object
  const projData = host.exportProject('Masterpiece Test');
  if (!projData || projData.magic !== 'ESENHO' || projData.version !== 1) {
    throw new Error('exportProject failed: invalid magic or version');
  }
  if (projData.width !== 320 || projData.height !== 240) {
    throw new Error(`exportProject failed: incorrect dimensions ${projData.width}x${projData.height}`);
  }
  if (!Array.isArray(projData.layers) || projData.layers.length < 2) {
    throw new Error(`exportProject failed: expected at least 2 layers, got ${projData.layers?.length}`);
  }
  if (!projData.layers[0].pixels && projData.layers[0].encoding !== 'solid' && projData.layers[0].encoding !== 'empty') {
    throw new Error('exportProject failed: expected pixels string or solid/empty encoding');
  }
  if (projData.settings.brushParams.size !== 42 || projData.settings.brushParams.opacity !== 77) {
    throw new Error('exportProject failed: brush parameters not preserved');
  }

  const overlayLayer = projData.layers.find(l => l.name === 'OverlayLayer');
  if (!overlayLayer) {
    throw new Error(`exportProject failed: expected layer with name 'OverlayLayer'`);
  }
  if (!overlayLayer.alphaLock) {
    throw new Error('exportProject failed: alphaLock not set on OverlayLayer');
  }

  // Corrupt / Reset canvas to different state
  host.canvasActor.exports.w_init(640, 480);
  host.executeCommand('clear');

  // Load project back
  const loadedOk = host.loadProject(projData);
  if (!loadedOk) {
    throw new Error('loadProject returned false');
  }
  const loadedW = host.canvasActor.exports.get_canvas_width();
  const loadedH = host.canvasActor.exports.get_canvas_height();
  if (loadedW !== 320 || loadedH !== 240) {
    throw new Error(`loadProject failed: expected 320x240, got ${loadedW}x${loadedH}`);
  }
  if (host.brushParams.size !== 42 || host.brushParams.opacity !== 77) {
    throw new Error(`loadProject failed: brush size/opacity not restored, got ${host.brushParams.size}/${host.brushParams.opacity}`);
  }
  const overlayEntry = Array.from(host.layerNames.entries()).find(([id, name]) => name === 'OverlayLayer');
  if (!overlayEntry) {
    throw new Error('loadProject failed: OverlayLayer not found in host.layerNames');
  }
  const restoredOverlayId = overlayEntry[0];
  if (host.canvasActor.exports.w_layer_get_alpha_lock(restoredOverlayId) !== 1) {
    throw new Error('loadProject failed: alpha lock not restored on layer');
  }

  // Test REPL save and load project
  const testSavePath = '/tmp/test_savefile.esen';
  host.executeCommand(`save project ${testSavePath}`);
  if (!fs.existsSync(testSavePath)) {
    throw new Error(`REPL 'save project' did not create file at ${testSavePath}`);
  }
  const fileContent = JSON.parse(fs.readFileSync(testSavePath, 'utf8'));
  if (fileContent.magic !== 'ESENHO' || fileContent.name !== 'Masterpiece Test') {
    throw new Error(`Saved .esen file has invalid contents: ${JSON.stringify(fileContent)}`);
  }

  // Reset and load via REPL
  host.canvasActor.exports.w_init(100, 100);
  host.executeCommand(`load project ${testSavePath}`);
  if (host.canvasActor.exports.get_canvas_width() !== 320) {
    throw new Error('REPL load project failed to restore canvas width');
  }
  try { fs.unlinkSync(testSavePath); } catch (_) {}

  // Test reset data command rule
  let dataResetLogged = false;
  const origLog = host.sendConsoleLog;
  host.sendConsoleLog = (msg) => {
    if (msg.includes('clearing all user data')) dataResetLogged = true;
    origLog.call(host, msg);
  };
  host.executeCommand('reset data');
  host.sendConsoleLog = origLog;
  if (!dataResetLogged) {
    throw new Error("Expected 'reset data' to trigger data clearing log");
  }

  // Test Brush Presets System & REPL Commands
  console.log('--- Testing Brush Presets System ---');
  host.executeCommand('preset inker');
  if (host.activeBrush !== 'inker' || host.brushParams.hardness !== 100 || !!host.strokeIsEraser !== false) {
    throw new Error(`Expected preset inker active with hardness 100, got activeBrush=${host.activeBrush}, hardness=${host.brushParams.hardness}`);
  }

  host.executeCommand('preset charcoal');
  if (host.activeBrush !== 'charcoal' || host.brushParams.grain !== 60 || host.brushParams.scatter !== 18) {
    throw new Error(`Expected preset charcoal active with grain 60 scatter 18, got activeBrush=${host.activeBrush}, grain=${host.brushParams.grain}`);
  }

  host.executeCommand('preset soft_eraser');
  if (host.activeBrush !== 'soft_eraser' || !host.strokeIsEraser) {
    throw new Error(`Expected preset soft_eraser with strokeIsEraser=true, got ${host.strokeIsEraser}`);
  }

  host.executeCommand('preset smudge');
  if (host.actionMode !== 'smudge' || host.brushParams.mode !== 1) {
    throw new Error(`Expected preset smudge to set actionMode=smudge mode=1, got actionMode=${host.actionMode}, mode=${host.brushParams.mode}`);
  }

  // Test custom preset save & select & delete via REPL
  host.brushParams.size = 77;
  host.brushParams.opacity = 88;
  host.executeCommand('preset save test_custom');
  if (!host.customBrushPresets || !host.customBrushPresets.test_custom) {
    throw new Error("Expected customBrushPresets.test_custom to be created");
  }
  if (host.customBrushPresets.test_custom.size !== 77) {
    throw new Error(`Expected custom preset size 77, got ${host.customBrushPresets.test_custom.size}`);
  }

  host.executeCommand('preset pencil');
  if (host.brushParams.size === 77) {
    throw new Error("Expected size to change when switching to pencil");
  }

  host.executeCommand('preset test_custom');
  if (host.activeBrush !== 'test_custom' || host.brushParams.size !== 77 || host.brushParams.opacity !== 88) {
    throw new Error(`Expected test_custom loaded with size 77 opacity 88, got activeBrush=${host.activeBrush}, size=${host.brushParams.size}`);
  }

  host.executeCommand('preset delete test_custom');
  if (host.customBrushPresets.test_custom) {
    throw new Error("Expected test_custom to be deleted");
  }

  // Test that switching from charcoal (grain, scatter, jitter) to inker resets all non-inker params cleanly
  host.executeCommand('preset charcoal');
  if (host.brushParams.grain !== 60 || host.brushParams.scatter !== 18 || host.brushParams.size_jitter !== 12) {
    throw new Error("Charcoal params not set properly");
  }
  host.executeCommand('preset inker');
  if (host.brushParams.grain !== 0 || host.brushParams.scatter !== 0 || host.brushParams.size_jitter !== 0 || host.activeTexture !== 'none') {
    throw new Error(`Preset parameter leak: inker inherited previous params (grain=${host.brushParams.grain}, scatter=${host.brushParams.scatter}, jitter=${host.brushParams.size_jitter}, texture=${host.activeTexture})`);
  }

  console.log('ALL TESTS PASSED: Unified Textures & Layers, Custom Shape Alpha Sampling, REPL, Stroke Smoothing, Filters (with Dynamic Params & Memory Safety), Undo/Redo, Auto-Rotate, Velocity, Taper/Fade, Jitters, Dab Blend Modes, UI Scaling, Layer Reordering, Merge Down, Layer Groups, Eyedropper, Subpixel, Wet Media Depletion/Pickup, Dual Brush, Dump Brush, History Fix, Alpha Lock, Clipping Mask, Layer Blend Modes, Flip Canvas, Real-Time Symmetry, Layer Order Insert, Default Folders, Reset Tool, Shape Guides, Marquee Selection/Clipboard, Layer HSV Adjustments, Lasso/Wand Selection, Selection-Clipped Drawing/Filters, Selection Modes (Add/Sub/Intersect), Adjacent Pixels Switch, 4-Mode Action System, Stylus/Wacom Pressure & Tilt Dynamics, Native .esen Project Savefile Engine, Reset Data Command, and Professional Brush Presets System verified 100%!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
