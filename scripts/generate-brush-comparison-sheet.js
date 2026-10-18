/**
 * scripts/generate-brush-comparison-sheet.js
 *
 * Generates a high-resolution PNG comparison sheet comparing:
 *  - Left Column: "Original Browser Engine (JS/HTML - EsenhoScreenHost pipeline)"
 *  - Right Column: "New Native Android Engine (C Quadro Kernel / NDK pipeline)"
 *
 * Renders all 66 production brush presets side-by-side.
 */

const fs = require('fs');
const path = require('path');
const { encodePng } = require('../src/image_io.js');
const { EsenhoModule, EsenhoScreenHost } = require('../src/esenho.js');

const rootDir = path.resolve(__dirname, '..');
const metadataPath = path.resolve(rootDir, 'android/app/src/main/assets/esenho_native_metadata.json');
const canvasWasmPath = path.resolve(rootDir, 'plugins/canvas.wasm');

if (!fs.existsSync(metadataPath)) {
  console.error(`Metadata file not found: ${metadataPath}`);
  process.exit(1);
}
if (!fs.existsSync(canvasWasmPath)) {
  console.error(`Canvas WASM not found: ${canvasWasmPath}`);
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const presets = metadata.presets;
console.log(`Loaded ${presets.length} brush presets from metadata.`);

// Basic 5x7 ASCII bitmap font
const FONT_5X7 = [
  [0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x5F,0x00,0x00],[0x00,0x07,0x00,0x07,0x00],[0x14,0x7F,0x14,0x7F,0x14],
  [0x24,0x2A,0x7F,0x2A,0x12],[0x23,0x13,0x08,0x64,0x62],[0x36,0x49,0x55,0x22,0x50],[0x00,0x05,0x03,0x00,0x00],
  [0x00,0x1C,0x22,0x41,0x00],[0x00,0x41,0x22,0x1C,0x00],[0x14,0x08,0x3E,0x08,0x14],[0x08,0x08,0x3E,0x08,0x08],
  [0x00,0x50,0x30,0x00,0x00],[0x08,0x08,0x08,0x08,0x08],[0x00,0x60,0x60,0x00,0x00],[0x20,0x10,0x08,0x04,0x02],
  [0x3E,0x51,0x49,0x45,0x3E],[0x00,0x42,0x7F,0x40,0x00],[0x42,0x61,0x51,0x49,0x46],[0x21,0x41,0x45,0x4B,0x31],
  [0x18,0x14,0x12,0x7F,0x10],[0x27,0x45,0x45,0x45,0x39],[0x3C,0x4A,0x49,0x49,0x30],[0x01,0x71,0x09,0x05,0x03],
  [0x36,0x49,0x49,0x49,0x36],[0x06,0x49,0x49,0x29,0x1E],[0x00,0x36,0x36,0x00,0x00],[0x00,0x56,0x36,0x00,0x00],
  [0x08,0x14,0x22,0x41,0x00],[0x14,0x14,0x14,0x14,0x14],[0x00,0x41,0x22,0x14,0x08],[0x02,0x01,0x51,0x09,0x06],
  [0x32,0x49,0x79,0x41,0x3E],[0x7E,0x11,0x11,0x11,0x7E],[0x7F,0x49,0x49,0x49,0x36],[0x3E,0x41,0x41,0x41,0x22],
  [0x7F,0x41,0x41,0x22,0x1C],[0x7F,0x49,0x49,0x49,0x41],[0x7F,0x09,0x09,0x09,0x01],[0x3E,0x41,0x49,0x49,0x7A],
  [0x7F,0x08,0x08,0x08,0x7F],[0x00,0x41,0x7F,0x41,0x00],[0x20,0x40,0x41,0x3F,0x01],[0x7F,0x08,0x14,0x22,0x41],
  [0x7F,0x40,0x40,0x40,0x40],[0x7F,0x02,0x0C,0x02,0x7F],[0x7F,0x04,0x08,0x10,0x7F],[0x3E,0x41,0x41,0x41,0x3E],
  [0x7F,0x09,0x09,0x09,0x06],[0x3E,0x41,0x51,0x21,0x5E],[0x7F,0x09,0x19,0x29,0x46],[0x46,0x49,0x49,0x49,0x31],
  [0x01,0x01,0x7F,0x01,0x01],[0x3F,0x40,0x40,0x40,0x3F],[0x1F,0x20,0x40,0x20,0x1F],[0x3F,0x40,0x38,0x40,0x3F],
  [0x63,0x14,0x08,0x14,0x63],[0x07,0x08,0x70,0x08,0x07],[0x61,0x51,0x49,0x45,0x43],[0x00,0x7F,0x41,0x41,0x00],
  [0x02,0x04,0x08,0x10,0x20],[0x00,0x41,0x41,0x7F,0x00],[0x04,0x02,0x01,0x02,0x04],[0x40,0x40,0x40,0x40,0x40],
  [0x00,0x01,0x02,0x04,0x00],[0x20,0x54,0x54,0x54,0x78],[0x7F,0x48,0x44,0x44,0x38],[0x38,0x44,0x44,0x44,0x20],
  [0x38,0x44,0x44,0x48,0x7F],[0x38,0x54,0x54,0x54,0x18],[0x08,0x7E,0x09,0x01,0x02],[0x0C,0x52,0x52,0x52,0x3E],
  [0x7F,0x08,0x04,0x04,0x78],[0x00,0x44,0x7D,0x40,0x00],[0x20,0x40,0x44,0x3D,0x00],[0x7F,0x10,0x28,0x44,0x00],
  [0x00,0x41,0x7F,0x40,0x00],[0x7C,0x04,0x18,0x04,0x78],[0x7C,0x08,0x04,0x04,0x78],[0x38,0x44,0x44,0x44,0x38],
  [0x7C,0x14,0x14,0x14,0x08],[0x08,0x14,0x14,0x18,0x7C],[0x7C,0x08,0x04,0x04,0x08],[0x48,0x54,0x54,0x54,0x20],
  [0x04,0x3F,0x44,0x40,0x20],[0x3C,0x40,0x40,0x20,0x7C],[0x1C,0x20,0x40,0x20,0x1C],[0x3C,0x40,0x30,0x40,0x3C],
  [0x44,0x28,0x10,0x28,0x44],[0x0C,0x50,0x50,0x50,0x3C],[0x44,0x64,0x54,0x4C,0x44],[0x00,0x08,0x36,0x41,0x00],
  [0x00,0x00,0x7F,0x00,0x00],[0x00,0x41,0x36,0x08,0x00],[0x08,0x08,0x2A,0x1C,0x08],[0x00,0x06,0x09,0x09,0x06]
];

function drawText(buf, imgW, imgH, x, y, rawStr, color, scale = 1) {
  if (!rawStr) return;
  const str = rawStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const r = (color >> 16) & 0xFF;
  const g = (color >> 8) & 0xFF;
  const b = color & 0xFF;
  const a = (color >>> 24) & 0xFF;

  let curX = Math.round(x);
  let curY = Math.round(y);

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 10) {
      curY += 9 * scale;
      curX = Math.round(x);
      continue;
    }
    const glyphIdx = (code >= 32 && code <= 126) ? (code - 32) : (63 - 32);
    const glyph = FONT_5X7[glyphIdx];

    for (let col = 0; col < 5; col++) {
      const colBits = glyph[col];
      for (let row = 0; row < 7; row++) {
        if ((colBits & (1 << row)) !== 0) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = curX + col * scale + sx;
              const py = curY + row * scale + sy;
              if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
                const idx = (py * imgW + px) * 4;
                buf[idx] = r;
                buf[idx + 1] = g;
                buf[idx + 2] = b;
                buf[idx + 3] = a;
              }
            }
          }
        }
      }
    }
    curX += 6 * scale;
  }
}

function fillRect(buf, imgW, imgH, x0, y0, w, h, color) {
  const r = (color >> 16) & 0xFF;
  const g = (color >> 8) & 0xFF;
  const b = color & 0xFF;
  const a = (color >>> 24) & 0xFF;

  const minX = Math.max(0, Math.round(x0));
  const maxX = Math.min(imgW, Math.round(x0 + w));
  const minY = Math.max(0, Math.round(y0));
  const maxY = Math.min(imgH, Math.round(y0 + h));

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const idx = (y * imgW + x) * 4;
      if (a === 255) {
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = 255;
      } else {
        const invA = 255 - a;
        buf[idx] = (r * a + buf[idx] * invA) / 255;
        buf[idx + 1] = (g * a + buf[idx + 1] * invA) / 255;
        buf[idx + 2] = (b * a + buf[idx + 2] * invA) / 255;
        buf[idx + 3] = 255;
      }
    }
  }
}

// Param IDs dictionary for C Quadro
const PARAM_IDS = {
  size: 1, opacity: 2, hardness: 3, flow: 4, spacing: 5, angle: 6,
  roundness: 7, scatter: 8, tolerance: 9, smudge: 10, wetness: 11,
  grain: 12, tex_mode: 13, shape: 14, mode: 15, tex_angle: 16,
  tex_scale: 17, tex_layer: 18, smoothing: 19, midpoint: 20,
  tex_contrast: 21, auto_rotate: 22, velocity: 23, taper_in: 24,
  taper_out: 25, fade: 26, size_jitter: 27, angle_jitter: 28,
  opacity_jitter: 29, color_jitter: 30, dab_blend: 31, subpixel: 32,
  depletion: 33, color_pickup: 34, dual_shape: 35, dual_size: 36,
  dual_spacing: 37, symmetry: 38, pressure_size: 39, pressure_flow: 40,
  tilt_angle: 41, buildup: 42, tex_scale_with_size: 57
};

/**
 * 1. Render using the Original Browser Engine (JS/HTML EsenhoScreenHost)
 * Simulates browser pointer events sent through host.sendStroke
 */
function renderBrowserJsEngineTile(preset, tileW, tileH) {
  const host = new EsenhoScreenHost();
  host.canvasActor = new EsenhoModule(canvasWasmPath);
  host.canvasActor.exports.w_init(tileW, tileH);

  // Apply preset via the Browser Host's native preset system
  host.selectBrushPreset(preset.id);

  const pixPtr = host.canvasActor.exports.get_active_layer_pixels();
  const pixArr = new Uint32Array(host.canvasActor.memory.buffer, pixPtr, tileW * tileH);
  pixArr.fill(0);

  // Input trajectory points
  const steps = 60;
  const startX = 35.0;
  const endX = tileW - 35.0;
  const centerY = tileH * 0.5;
  const amp = tileH * 0.28;
  const strokeCol = 0xFFFFFFFF;

  let prevX = startX;
  let prevY = centerY;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + (endX - startX) * t;
    const y = centerY + Math.sin(t * Math.PI * 2.0) * amp;

    // Stylus pressure curve
    const bell = Math.sin(t * Math.PI);
    const pressure = Math.max(0.15, Math.min(1.0, Math.pow(bell, 0.75)));

    if (i === 0) {
      host.sendStroke(x, y, x, y, 0, 0, strokeCol, pressure, 0, 0);
    } else {
      host.sendStroke(x, y, prevX, prevY, 1, 0, strokeCol, pressure, 0, 0);
    }
    prevX = x;
    prevY = y;
  }
  host.sendStroke(prevX, prevY, prevX, prevY, 2, 0, strokeCol, 0.15, 0, 0);

  // Read rendered pixels
  const outBuf = Buffer.alloc(tileW * tileH * 4);
  const memView = new Uint8Array(host.canvasActor.memory.buffer, pixPtr, tileW * tileH * 4);
  outBuf.set(memView);
  return outBuf;
}

function passString(wasmInst, str) {
  if (!str) return 0;
  const bytes = Buffer.from(str + '\0', 'utf8');
  const ptr = wasmInst.exports.w_canvas_alloc(bytes.length);
  new Uint8Array(wasmInst.exports.memory.buffer, ptr, bytes.length).set(bytes);
  return ptr;
}

/**
 * 2. Render using the New Android Native Engine (C Quadro Kernel)
 * Directly dispatches through native C kernel with bit-exact procedural textures and tip shapes
 */
function renderAndroidNativeEngineTile(wasmInst, preset, tileW, tileH) {
  const exports = wasmInst.exports;
  exports.w_init(tileW, tileH);
  exports.w_brush_reset();

  for (const [k, v] of Object.entries(preset)) {
    const pId = PARAM_IDS[k];
    if (pId !== undefined && typeof v === 'number') {
      exports.w_brush_set_param(pId, Math.floor(v));
    }
  }

  // Select tip shape
  if (preset.shape && preset.shape !== 'circle') {
    const shapePtr = passString(wasmInst, preset.shape);
    exports.w_brush_select_shape_by_name(shapePtr);
  } else {
    const circlePtr = passString(wasmInst, 'circle');
    exports.w_brush_select_shape_by_name(circlePtr);
  }

  // Select texture
  if (preset.texture && preset.texture !== 'none') {
    const texPtr = passString(wasmInst, preset.texture);
    exports.w_brush_select_texture_by_name(texPtr);
  } else {
    const nonePtr = passString(wasmInst, 'none');
    exports.w_brush_select_texture_by_name(nonePtr);
  }

  if (preset.subpixel !== undefined) {
    exports.w_brush_set_param(PARAM_IDS.subpixel, preset.subpixel ? 1 : 0);
  }

  const pixPtr = exports.get_active_layer_pixels();
  const pixArr = new Uint32Array(exports.memory.buffer, pixPtr, tileW * tileH);
  pixArr.fill(0);

  const steps = 60;
  const startX = 35.0;
  const endX = tileW - 35.0;
  const centerY = tileH * 0.5;
  const amp = tileH * 0.28;
  const color = 0xFFFFFFFF;

  let prevX = startX;
  let prevY = centerY;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + (endX - startX) * t;
    const y = centerY + Math.sin(t * Math.PI * 2.0) * amp;

    const bell = Math.sin(t * Math.PI);
    const pressureNorm = Math.max(0.15, Math.min(1.0, Math.pow(bell, 0.75)));
    const pInt = Math.round(pressureNorm * 1000);

    if (i === 0) {
      exports.w_brush_stroke_ext_f(0, x, y, x, y, color, 0, pInt, 0, 0);
    } else {
      // Direct Native C Quadro stroke execution (curX, curY, prevX, prevY)
      exports.w_brush_stroke_ext_f(1, x, y, prevX, prevY, color, 0, pInt, 0, 0);
    }
    prevX = x;
    prevY = y;
  }
  exports.w_brush_stroke_ext_f(2, prevX, prevY, prevX, prevY, color, 0, 150, 0, 0);

  const outBuf = Buffer.alloc(tileW * tileH * 4);
  const memView = new Uint8Array(exports.memory.buffer, pixPtr, tileW * tileH * 4);
  outBuf.set(memView);
  return outBuf;
}

/**
 * Composite a tile RGBA buffer into main image buffer
 */
function blitTile(mainBuf, mainW, mainH, tileBuf, tileW, tileH, dstX, dstY) {
  for (let ty = 0; ty < tileH; ty++) {
    const my = dstY + ty;
    if (my < 0 || my >= mainH) continue;
    for (let tx = 0; tx < tileW; tx++) {
      const mx = dstX + tx;
      if (mx < 0 || mx >= mainW) continue;

      const tIdx = (ty * tileW + tx) * 4;
      const mIdx = (my * mainW + mx) * 4;

      const srcA = tileBuf[tIdx + 3];
      if (srcA === 0) continue;

      if (srcA === 255) {
        mainBuf[mIdx] = tileBuf[tIdx];
        mainBuf[mIdx + 1] = tileBuf[tIdx + 1];
        mainBuf[mIdx + 2] = tileBuf[tIdx + 2];
        mainBuf[mIdx + 3] = 255;
      } else {
        const invA = 255 - srcA;
        mainBuf[mIdx] = Math.min(255, (tileBuf[tIdx] * srcA + mainBuf[mIdx] * invA) / 255);
        mainBuf[mIdx + 1] = Math.min(255, (tileBuf[tIdx + 1] * srcA + mainBuf[mIdx + 1] * invA) / 255);
        mainBuf[mIdx + 2] = Math.min(255, (tileBuf[tIdx + 2] * srcA + mainBuf[mIdx + 2] * invA) / 255);
        mainBuf[mIdx + 3] = 255;
      }
    }
  }
}

async function main() {
  console.log('--- Generating Side-by-Side Comparison: Browser JS/HTML Engine vs. Android Native C Engine ---');

  const nativeModule = new EsenhoModule(canvasWasmPath);

  // Layout parameters
  const sheetW = 1600;
  const headerH = 220;
  const rowH = 92;
  const footerH = 60;
  const sheetH = headerH + presets.length * rowH + footerH;

  console.log(`Canvas Size: ${sheetW} x ${sheetH} (${presets.length} presets)`);
  const sheetBuf = Buffer.alloc(sheetW * sheetH * 4);

  // Background: Deep Studio Slate #0F1216
  fillRect(sheetBuf, sheetW, sheetH, 0, 0, sheetW, sheetH, 0xFF0F1216);

  // Header Background: Dark Navy #151921 with subtle bottom accent
  fillRect(sheetBuf, sheetW, sheetH, 0, 0, sheetW, headerH - 10, 0xFF151921);
  fillRect(sheetBuf, sheetW, sheetH, 0, headerH - 10, sheetW, 2, 0xFF00ADB5); // Cyan separator line

  // Header Typography
  drawText(sheetBuf, sheetW, sheetH, 40, 34, "ESENHO BRUSH ENGINE COMPARISON", 0xFFFFFFFF, 3);
  drawText(sheetBuf, sheetW, sheetH, 42, 80, "Browser JS/HTML Engine (EsenhoScreenHost) vs. Android Native C Engine (Quadro)", 0xFF00ADB5, 2);
  drawText(sheetBuf, sheetW, sheetH, 42, 114, `Direct 1:1 fidelity evaluation across all ${presets.length} production brush presets.`, 0xFF94A3B8, 1);
  drawText(sheetBuf, sheetW, sheetH, 42, 132, "Left: Web Browser JS Host (Bézier tension, speed EMA, dispatch) | Right: Android NDK C Engine (SDF AA, Lerp, Quadro)", 0xFF64748B, 1);

  // Column Headers
  const col1X = 40;   // Preset Info
  const col2X = 450;  // Browser JS/HTML Engine
  const col3X = 1030; // Android Native C Engine
  const tileW = 530;
  const tileH = 74;

  const colHeaderY = 175;
  fillRect(sheetBuf, sheetW, sheetH, 0, colHeaderY - 10, sheetW, 45, 0xFF1A202C);

  drawText(sheetBuf, sheetW, sheetH, col1X, colHeaderY, "BRUSH PRESET & CONFIG", 0xFFE2E8F0, 2);
  drawText(sheetBuf, sheetW, sheetH, col2X, colHeaderY, "BROWSER ENGINE (JS / HTML HOST)", 0xFF38BDF8, 2);
  drawText(sheetBuf, sheetW, sheetH, col3X, colHeaderY, "NATIVE ENGINE (ANDROID C / NDK)", 0xFF34D399, 2);

  console.log('Rendering brush comparison rows...');
  for (let idx = 0; idx < presets.length; idx++) {
    const p = presets[idx];
    const rowY = headerH + idx * rowH;

    // Alternate row background for clean scanability
    const rowBg = (idx % 2 === 0) ? 0xFF12161E : 0xFF161B24;
    fillRect(sheetBuf, sheetW, sheetH, 0, rowY, sheetW, rowH, rowBg);
    // Subtle separator line
    fillRect(sheetBuf, sheetW, sheetH, 20, rowY + rowH - 1, sheetW - 40, 1, 0xFF1F2937);

    // Brush metadata column
    const categoryTag = `[${(p.category || 'general').toUpperCase()}]`;
    drawText(sheetBuf, sheetW, sheetH, col1X, rowY + 12, `${idx + 1}. ${p.name}`, 0xFFF8FAFC, 2);
    drawText(sheetBuf, sheetW, sheetH, col1X, rowY + 36, categoryTag, 0xFF38BDF8, 1);

    const descSnippet = (p.desc && p.desc.length > 50) ? (p.desc.substring(0, 48) + '...') : (p.desc || '');
    drawText(sheetBuf, sheetW, sheetH, col1X, rowY + 50, descSnippet, 0xFF94A3B8, 1);

    const techSpecs = `sz:${p.size || 14} | op:${p.opacity || 100}% | hard:${p.hardness || 0}% | flow:${p.flow || 100}% | sp:${p.spacing || 10}%`;
    drawText(sheetBuf, sheetW, sheetH, col1X, rowY + 66, techSpecs, 0xFF64748B, 1);

    // Card background for Left (Browser JS/HTML)
    fillRect(sheetBuf, sheetW, sheetH, col2X, rowY + 8, tileW, tileH, 0xFF0D1016);
    fillRect(sheetBuf, sheetW, sheetH, col2X, rowY + 8, tileW, 1, 0xFF1E293B);
    fillRect(sheetBuf, sheetW, sheetH, col2X, rowY + 8 + tileH - 1, tileW, 1, 0xFF1E293B);

    // Card background for Right (Android Native C)
    fillRect(sheetBuf, sheetW, sheetH, col3X, rowY + 8, tileW, tileH, 0xFF0D1016);
    fillRect(sheetBuf, sheetW, sheetH, col3X, rowY + 8, tileW, 1, 0xFF132E25);
    fillRect(sheetBuf, sheetW, sheetH, col3X, rowY + 8 + tileH - 1, tileW, 1, 0xFF132E25);

    // 1. Render using Browser JS/HTML Engine
    const browserTile = renderBrowserJsEngineTile(p, tileW, tileH);
    blitTile(sheetBuf, sheetW, sheetH, browserTile, tileW, tileH, col2X, rowY + 8);

    // 2. Render using Android Native C Engine
    const nativeTile = renderAndroidNativeEngineTile(nativeModule, p, tileW, tileH);
    blitTile(sheetBuf, sheetW, sheetH, nativeTile, tileW, tileH, col3X, rowY + 8);

    if ((idx + 1) % 10 === 0 || idx === presets.length - 1) {
      console.log(`  Rendered ${idx + 1}/${presets.length} presets...`);
    }
  }

  // Footer
  const footerY = headerH + presets.length * rowH;
  fillRect(sheetBuf, sheetW, sheetH, 0, footerY, sheetW, footerH, 0xFF0D1015);
  drawText(sheetBuf, sheetW, sheetH, col1X, footerY + 22, "Esenho Studio • Browser JS/HTML vs. Android Native C Engine Comparison Benchmark", 0xFF64748B, 1);

  // Encode PNG
  console.log('Encoding comparison sheet to PNG...');
  const pngBuffer = encodePng(sheetW, sheetH, sheetBuf);
  console.log(`PNG encoded successfully (${(pngBuffer.length / 1024 / 1024).toFixed(2)} MB).`);

  const outPath = path.resolve(rootDir, 'artifacts/brush_comparisons/brush_comparison_sheet.png');
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`✔ Comparison sheet saved to: ${outPath}`);

  // Copy to agent conversation artifact directory
  const brainArtifactDir = '/home/jardel/.gemini/antigravity/brain/bf95c089-eb6a-470e-a7b3-489067aba3cf';
  if (fs.existsSync(brainArtifactDir)) {
    const brainOutPath = path.resolve(brainArtifactDir, 'brush_comparison_sheet.png');
    fs.copyFileSync(outPath, brainOutPath);
    console.log(`✔ Artifact copy mirrored to: ${brainOutPath}`);
  }
}

main().catch(err => {
  console.error('Fatal error during sheet generation:', err);
  process.exit(1);
});
