const sdl = require('@kmamal/sdl');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Piolho, UnsafePiolho, ExtensionRegistry } = require('piolho');
const { saveImage, loadImage } = require('./image_io');

const ACTOR_HOST    = 0;
const ACTOR_SCREEN  = 0;
const ACTOR_CANVAS  = 1;

// Document Dimensions (Default Vertical Proportions)
const DOC_WIDTH  = 800;
const DOC_HEIGHT = 1000;

// Binary Message IDs
const MSG_SET_COLOR          = 1;
const MSG_SET_TOOL           = 3;
const MSG_LAYER_ADD          = 7;
const MSG_LAYER_SELECT       = 8;
const MSG_LAYER_TOGGLE_VIS   = 9;
const MSG_LAYER_SET_OPACITY  = 10;
const MSG_LAYER_DELETE       = 11;
const MSG_DRAW_LINE          = 13;
const MSG_DRAW_RECT          = 14;
const MSG_DRAW_CIRCLE        = 15;
const MSG_DRAW_GRID          = 16;
const MSG_EFFECT_CLEAR       = 20;
const MSG_APPLY_FILTER       = 30;
const MSG_BRUSH_STROKE       = 40;
const MSG_BRUSH_SET_PARAM    = 41;
const MSG_SET_ACTIVE_BRUSH   = 42;
const MSG_TEXTURE_SET_ACTIVE = 50;
const MSG_LAYER_TO_TEXTURE   = 51;
const MSG_LOAD_IMAGE         = 60;
const MSG_SAVE_IMAGE         = 61;
const MSG_CONSOLE_LOG        = 70;
const MSG_CANVAS_NEW         = 80;
const MSG_CANVAS_SELECT      = 81;
const MSG_CANVAS_RESIZE      = 82;
const MSG_CANVAS_DELETE      = 83;
const MSG_CANVAS_RENAME      = 84;
const MSG_CANVAS_DUPLICATE   = 85;

function createProceduralTextures() {
  const map = new Map();

  // 1. Paper (256x256)
  {
    const w = 256, h = 256;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n1 = Math.sin(x * 0.15) * Math.cos(y * 0.15) * 15;
        const n2 = Math.sin(x * 0.6 + y * 0.4) * 10;
        const noise = (Math.random() - 0.5) * 45;
        const v = Math.max(0, Math.min(255, Math.floor(210 + n1 + n2 + noise)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('paper', { width: w, height: h, data: buf });
  }

  // 2. Canvas (128x128)
  {
    const w = 128, h = 128;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wx = Math.sin(x * Math.PI / 4) * 40;
        const wy = Math.sin(y * Math.PI / 4) * 40;
        const v = Math.max(0, Math.min(255, Math.floor(180 + wx + wy + (Math.random() - 0.5) * 30)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('canvas', { width: w, height: h, data: buf });
  }

  // 3. Noise (256x256)
  {
    const w = 256, h = 256;
    const buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = Math.floor(Math.random() * 256);
      buf[i * 4 + 0] = v;
      buf[i * 4 + 1] = v;
      buf[i * 4 + 2] = v;
      buf[i * 4 + 3] = 0xFF;
    }
    map.set('noise', { width: w, height: h, data: buf });
  }

  // 4. Dots (32x32)
  {
    const w = 32, h = 32;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x % 16) - 8;
        const dy = (y % 16) - 8;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = d < 5 ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('dots', { width: w, height: h, data: buf });
  }

  // 5. Grid (32x32)
  {
    const w = 32, h = 32;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isLine = (x % 16 === 0 || y % 16 === 0);
        const v = isLine ? 240 : 40;
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('grid', { width: w, height: h, data: buf });
  }

  // 6. Grunge (256x256)
  {
    const w = 256, h = 256;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g1 = Math.sin(x * 0.05) * Math.sin(y * 0.05) * 80;
        const g2 = Math.cos(x * 0.2 + y * 0.1) * 40;
        const v = Math.max(0, Math.min(255, Math.floor(128 + g1 + g2 + (Math.random() - 0.5) * 70)));
        const idx = (y * w + x) * 4;
        buf[idx + 0] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 0xFF;
      }
    }
    map.set('grunge', { width: w, height: h, data: buf });
  }

  return map;
}

// Math Evaluator
function evaluateMath(expr) {
  expr = expr.trim();
  if (expr.startsWith('(') && expr.endsWith(')')) {
    const inner = expr.slice(1, -1).trim();
    const tokens = [];
    let cur = '';
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '(') { depth++; cur += ch; }
      else if (ch === ')') { depth--; cur += ch; }
      else if (/\s/.test(ch) && depth === 0) {
        if (cur.length > 0) { tokens.push(cur); cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur.length > 0) tokens.push(cur);
    if (tokens.length === 0) return 0;

    const op = tokens[0];
    const args = tokens.slice(1).map(evaluateMath);

    switch (op) {
      case '+': return args.reduce((a, b) => a + b, 0);
      case '-': return args.length === 1 ? -args[0] : args.slice(1).reduce((a, b) => a - b, args[0]);
      case '*': return args.reduce((a, b) => a * b, 1);
      case '/': return args.slice(1).reduce((a, b) => (b === 0 ? 0 : a / b), args[0]);
      case '%': return args.slice(1).reduce((a, b) => a % b, args[0]);
      case '^': case '**': return Math.pow(args[0], args[1]);
      case 'min': return Math.min(...args);
      case 'max': return Math.max(...args);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'abs': return Math.abs(args[0]);
      default: return NaN;
    }
  }

  const num = Number(expr);
  if (!isNaN(num)) return num;

  try {
    if (/^[0-9+\-*/().\s%^Math.sqrtabscosinfelx]+$/.test(expr)) {
      return Function(`"use strict"; return (${expr});`)();
    }
  } catch (e) {
    // ignore
  }
  return NaN;
}

function parseColorString(str) {
  str = str.trim().toLowerCase();
  const named = {
    black: 0xFF000000, white: 0xFFFFFFFF, red: 0xFF0000FF, green: 0xFF00FF00,
    blue: 0xFFFF0000, yellow: 0xFF00FFFF, cyan: 0xFFFFFF00, magenta: 0xFFFF00FF,
    orange: 0xFF0080FF, gray: 0xFF808080, purple: 0xFF800080, pink: 0xFFCBC0FF
  };
  if (named[str] !== undefined) return named[str];

  if (str.startsWith('#') || str.startsWith('$')) {
    const hex = str.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }

  const parts = str.split(/[\s,]+/);
  if (parts.length >= 3) {
    const r = Math.min(255, Math.max(0, parseInt(parts[0], 10) || 0));
    const g = Math.min(255, Math.max(0, parseInt(parts[1], 10) || 0));
    const b = Math.min(255, Math.max(0, parseInt(parts[2], 10) || 0));
    const a = (parts.length >= 4) ? Math.min(255, Math.max(0, parseInt(parts[3], 10) || 255)) : 255;
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  return null;
}

function readCString(memory, ptr) {
  if (!ptr || !memory) return '';
  const bytes = new Uint8Array(memory.buffer, ptr);
  let len = 0;
  while (len < 1024 && (ptr + len) < memory.buffer.byteLength && bytes[len] !== 0) len++;
  return new TextDecoder().decode(bytes.subarray(0, len));
}

function formatLayersList(canvasActor) {
  const count = canvasActor.instance.exports.get_layer_count();
  const active = canvasActor.instance.exports.get_active_layer();
  const w = canvasActor.instance.exports.get_width ? canvasActor.instance.exports.get_width() : canvasActor.instance.exports.get_canvas_width();
  const h = canvasActor.instance.exports.get_height ? canvasActor.instance.exports.get_height() : canvasActor.instance.exports.get_canvas_height();
  let out = `\x1b[1mSurface (${w}x${h}) - Layers (${count}):\x1b[0m\n`;
  for (let i = 0; i < count; i++) {
    const vis = canvasActor.instance.exports.get_layer_visible ? canvasActor.instance.exports.get_layer_visible(i) : 1;
    const op = canvasActor.instance.exports.get_layer_opacity ? canvasActor.instance.exports.get_layer_opacity(i) : 255;
    const opPct = Math.round((op / 255) * 100);
    const marker = (i === active) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
    out += `  ${marker} [${i}] ${vis ? 'visible' : 'HIDDEN'} - opacity: ${opPct}%\n`;
  }
  return out;
}

function formatBrushesList(screenActor) {
  let out = `\x1b[1mBrushes:\x1b[0m\n`;
  for (const [name, actor] of screenActor.plugins.entries()) {
    if (actor.type === 'brush') {
      const marker = (name === screenActor.activeBrush) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
      out += `  ${marker} ${name}\n`;
    }
  }
  return out;
}

function formatTexturesList(screenActor) {
  let out = `\x1b[1mTextures (${screenActor.textures.size}):\x1b[0m\n`;
  for (const [name, tex] of screenActor.textures.entries()) {
    const marker = (name === screenActor.activeTexture) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
    out += `  ${marker} "${name}" (${tex.width}x${tex.height})\n`;
  }
  return out;
}

function formatFiltersList(screenActor) {
  let out = `\x1b[1mFilters:\x1b[0m\n`;
  for (const [name, actor] of screenActor.plugins.entries()) {
    if (actor.type === 'filter') {
      out += `  - ${name}\n`;
    }
  }
  return out;
}

// Application State & Screen Host (Real Unsafe Piolho Actor)
class WesenhoScreenHost {
  constructor() {
    this.windowWidth = 1000;
    this.windowHeight = 900;
    this.zoom = 0.72;
    this.panX = (this.windowWidth - DOC_WIDTH * this.zoom) / 2;
    this.panY = (this.windowHeight - DOC_HEIGHT * this.zoom) / 2;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.mouseState = { x: 0, y: 0, buttons: 0 };
    this.isDrawingOnCanvas = false;
    this.strokePrevX = -1;
    this.strokePrevY = -1;

    this.activeBrush = 'round';
    this.currentColor = 0xFF000000;
    this.currentTool = 0; // 0 = brush, 1 = eraser

    this.brushParams = {
      size: 8,
      opacity: 100,
      hardness: 80,
      flow: 100,
      spacing: 15,
      roundness: 100,
      angle: 0,
      scatter: 0,
      tolerance: 32,
      density: 50,
      wetness: 50,
      grain: 50,
      texture_mode: 1,
      texture_scale: 100,
      texture_strength: 100
    };

    this.textures = createProceduralTextures();
    this.activeTexture = 'paper';

    this.canvasActor = null;
    this.plugins = new Map(); // name -> { type, actor }

    this.window = null;
    this.screenBuffer = Buffer.alloc(this.windowWidth * this.windowHeight * 4);
    this.rl = null;

    // The native Piolho actor instance
    this.actor = new UnsafePiolho('screen', {
      id: ACTOR_SCREEN,
      immediateMessage: true,
      actor: {
        onMessage: (from, data) => this.handleMessage(from, data)
      }
    });
  }

  sendCanvasCmd(cmdStr) {
    if (!this.canvasActor) return;
    this.canvasActor.say(Buffer.from(cmdStr + '\0', 'utf8'), ACTOR_SCREEN);
  }

  getActiveTexture() {
    return this.textures.get(this.activeTexture) || null;
  }

  sendConsoleLog(text, color = 0xFF00FF88) {
    const ansiColor = (color === 0xFFFF5555) ? '\x1b[31m' : '\x1b[32m';
    if (this.rl) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(`${ansiColor}[wesenho]\x1b[0m ${text}`);
      this.rl.prompt(true);
    } else {
      console.log(`${ansiColor}[wesenho]\x1b[0m ${text}`);
    }
  }

  convertLayerToTexture(layerIdx, name) {
    if (!this.canvasActor || !this.canvasActor.instance) return false;
    const w = this.canvasActor.instance.exports.get_canvas_width();
    const h = this.canvasActor.instance.exports.get_canvas_height();
    const targetIdx = (layerIdx >= 0) ? layerIdx : this.canvasActor.instance.exports.get_active_layer();
    const pixPtr = this.canvasActor.instance.exports.get_layer_pixels(targetIdx);
    if (!pixPtr || w === 0 || h === 0) return false;

    const byteLen = w * h * 4;
    const rawBytes = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen);
    const texBuf = Buffer.alloc(byteLen);
    texBuf.set(rawBytes);

    this.textures.set(name, { width: w, height: h, data: texBuf });
    this.activeTexture = name;
    return true;
  }

  saveCanvasOrLayer(filePath, target) {
    if (!this.canvasActor || !this.canvasActor.instance) return { ok: false, error: 'Canvas not found' };
    const w = this.canvasActor.instance.exports.get_canvas_width();
    const h = this.canvasActor.instance.exports.get_canvas_height();
    const pixPtr = (target === 1)
      ? this.canvasActor.instance.exports.get_active_layer_pixels()
      : this.canvasActor.instance.exports.get_composite_pixels();

    if (!pixPtr || w === 0 || h === 0) return { ok: false, error: 'Empty canvas' };

    const byteLen = w * h * 4;
    const rawBytes = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, byteLen);
    const buf = Buffer.from(rawBytes);

    try {
      const res = saveImage(filePath, w, h, buf);
      return { ok: true, path: filePath, format: res.format, size: res.bytes };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  loadImageFromFile(filePath, target, name) {
    try {
      const img = loadImage(filePath);
      if (target === 2) {
        const texName = name || path.basename(filePath, path.extname(filePath));
        this.textures.set(texName, { width: img.width, height: img.height, data: img.data });
        this.activeTexture = texName;
        return { ok: true, msg: `texture '${texName}' loaded (${img.width}x${img.height})` };
      }

      if (!this.canvasActor || !this.canvasActor.instance) return { ok: false, error: 'Canvas not found' };

      const cw = this.canvasActor.instance.exports.get_canvas_width();
      const ch = this.canvasActor.instance.exports.get_canvas_height();

      if (target === 1) {
        this.sendCanvasCmd('layer add');
      }

      const pixPtr = this.canvasActor.instance.exports.get_active_layer_pixels();
      if (!pixPtr) return { ok: false, error: 'No active layer' };

      const canvasBytes = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, cw * ch * 4);
      canvasBytes.fill(0);

      const copyW = Math.min(cw, img.width);
      const copyH = Math.min(ch, img.height);
      const offsetX = Math.max(0, Math.floor((cw - copyW) / 2));
      const offsetY = Math.max(0, Math.floor((ch - copyH) / 2));

      for (let y = 0; y < copyH; y++) {
        const srcRow = y * img.width * 4;
        const dstRow = (offsetY + y) * cw * 4 + offsetX * 4;
        canvasBytes.set(img.data.subarray(srcRow, srcRow + copyW * 4), dstRow);
      }

      if (this.canvasActor.instance.exports.force_composite) {
        this.canvasActor.instance.exports.force_composite();
      }

      return { ok: true, msg: `image '${filePath}' loaded (${img.width}x${img.height})` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  sendStroke(x, y, prev_x, prev_y, state, is_eraser, color) {
    const brushEntry = this.plugins.get(this.activeBrush);
    if (!brushEntry || !brushEntry.actor) return;

    const strokeBuf = Buffer.alloc(28);
    strokeBuf.writeUInt32LE(MSG_BRUSH_STROKE, 0);
    strokeBuf.writeInt32LE(Math.floor(x), 4);
    strokeBuf.writeInt32LE(Math.floor(y), 8);
    strokeBuf.writeInt32LE(Math.floor(prev_x), 12);
    strokeBuf.writeInt32LE(Math.floor(prev_y), 16);
    strokeBuf.writeUInt32LE((color !== undefined) ? color : this.currentColor, 20);
    strokeBuf[24] = state;
    strokeBuf[25] = is_eraser ? 1 : 0;
    strokeBuf[26] = 255;
    strokeBuf[27] = 0;

    brushEntry.actor.say(strokeBuf, ACTOR_CANVAS);
  }

  handleMessage(from, data) {
    if (!data) return;
    const buffer = Buffer.isBuffer(data) ? data : (data instanceof Uint8Array ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(String(data)));

    // Check if text string
    let isText = true;
    for (let i = 0; i < buffer.length; i++) {
      const b = buffer[i];
      if (b === 0 && i === buffer.length - 1) break;
      if (b < 32 && b !== 10 && b !== 13 && b !== 9 && b !== 0) {
        isText = false;
        break;
      }
    }

    if (isText) {
      let str = '';
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0) break;
        str += String.fromCharCode(buffer[i]);
      }
      str = str.trim();
      if (str.length > 0) {
        this.executeCommand(str, from);
      }
      return;
    }

    // Binary message fallback
    if (buffer.length >= 4) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const type = view.getUint32(0, true);

      if (type === MSG_CONSOLE_LOG) {
        let text = '';
        for (let i = 8; i < buffer.length && buffer[i] !== 0; i++) text += String.fromCharCode(buffer[i]);
        this.sendConsoleLog(text);
      }
    }
  }

  executeCommand(raw, from = 'repl') {
    raw = raw.trim();
    if (!raw) return;

    if (raw.startsWith('(') || (/^[\d+\-*/]/.test(raw) && (raw.includes('+') || raw.includes('*') || raw.includes('/')))) {
      const val = evaluateMath(raw);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
        return;
      }
    }

    const tokens = [];
    const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      tokens.push(match[1] || match[2] || match[0]);
    }

    if (tokens.length === 0) return;
    const cmd = tokens[0].toLowerCase();

    // 1. HELP
    if (cmd === 'help') {
      console.log(`
\x1b[1mAvailable Commands:\x1b[0m
  \x1b[36mInspect & Query (list / get):\x1b[0m
    list [layers|brushes|textures|filters]         List all or specific category
    get [surface|layer|brush|texture|color|tool]   Get all or specific entity property
    get size / get width / get height              Get surface dimensions
    get layer [id|count|opacity|visible]           Get layer properties
    get brush [name|size|opacity|hardness|...]     Get brush parameters
    get texture [name|size|count]                  Get texture properties
    get color / get tool / get zoom / get pan      Get current tool/viewport state

  \x1b[36mSurface & Size Commands:\x1b[0m
    resize <w> <h>                       Resize surface dimensions (min 16x16)
    set size <w> <h>                     Set surface resolution
    set width <w> / set height <h>       Set width or height

  \x1b[36mLayer Commands:\x1b[0m
    new layer [name]                     Add new layer
    set layer <id>                       Select active layer
    delete layer [id]                    Delete layer
    toggle layer [id]                    Toggle layer visibility
    opacity layer <id> <0..100>          Set layer opacity
    clear layer                          Clear active layer

  \x1b[36mBrush & Setting Commands:\x1b[0m
    set brush <name>                     Select brush (round, airbrush, blend, calligraphy,
                                         charcoal, fill, hatch, lasso_fill, pixel, scatter, smudge)
    set brush <param> <value>            Set param: size, opacity, hardness, flow, spacing,
                                         angle, roundness, scatter, tolerance, density, wetness, grain

  \x1b[36mTexture Commands:\x1b[0m
    set texture <name>                   Select texture (paper, canvas, noise, dots, grid, grunge)
    layer to texture [name]              Convert active layer to brush texture

  \x1b[36mFilter Commands:\x1b[0m
    filter <name> [param1] [param2]      Apply filter (blur, brightness, contrast, dither,
                                         edge, grayscale, invert, noise, pixelate, sepia, threshold)

  \x1b[36mImage I/O Commands:\x1b[0m
    save [layer] <filename>              Save image (PNG, BMP, PPM)
    load image <filename> [layer|texture [name]] Load image file into active layer or texture

  \x1b[36mTools & Colors:\x1b[0m
    set color <#hex|r g b|name>          Set drawing color (e.g. #ff0000, red, 255 0 0)
    set tool <brush|eraser>              Set active tool
    draw line <x0> <y0> <x1> <y1>        Draw line primitive
    draw rect <x> <y> <w> <h>            Draw rectangle primitive
    draw circle <x> <y> <r>              Draw circle primitive
    draw grid <step>                     Draw grid pattern

  \x1b[36mSystem Commands:\x1b[0m
    status / info                        Show active status overview
    eval <expr>                          Evaluate math expression
    exit / quit                          Quit wesenho
`);
      return;
    }

    // 2. UNIFIED LIST COMMANDS
    if (cmd === 'list' || cmd === 'layers' || cmd === 'brushes' || cmd === 'textures' || cmd === 'filters') {
      const target = (cmd === 'list') ? (tokens[1] ? tokens[1].toLowerCase() : 'all') : cmd;

      if (target === 'layer' || target === 'layers') {
        process.stdout.write(formatLayersList(this.canvasActor));
      } else if (target === 'brush' || target === 'brushes') {
        process.stdout.write(formatBrushesList(this));
      } else if (target === 'texture' || target === 'textures') {
        process.stdout.write(formatTexturesList(this));
      } else if (target === 'filter' || target === 'filters') {
        process.stdout.write(formatFiltersList(this));
      } else if (target === 'all' || target === '') {
        process.stdout.write('\x1b[1;34m=== Wesenho Entities ===\x1b[0m\n\n');
        process.stdout.write(formatLayersList(this.canvasActor) + '\n');
        process.stdout.write(formatBrushesList(this) + '\n');
        process.stdout.write(formatTexturesList(this) + '\n');
        process.stdout.write(formatFiltersList(this));
      } else {
        console.log(`\x1b[31merr: unknown list category '${tokens[1]}'. Options: layers, brushes, textures, filters, all\x1b[0m`);
      }
      return;
    }

    // 3. GET COMMANDS
    if (cmd === 'get') {
      const cat = (tokens[1] || '').toLowerCase();
      const prop = (tokens[2] || '').toLowerCase();

      const activeC = this.canvasActor.instance.exports.get_active_canvas();
      const cCount = this.canvasActor.instance.exports.get_canvas_count();
      const cw = this.canvasActor.instance.exports.get_canvas_width();
      const ch = this.canvasActor.instance.exports.get_canvas_height();
      const cNamePtr = this.canvasActor.instance.exports.get_canvas_name ? this.canvasActor.instance.exports.get_canvas_name(activeC) : 0;
      const cName = readCString(this.canvasActor.memory, cNamePtr) || `canvas_${activeC}`;

      const activeL = this.canvasActor.instance.exports.get_active_layer();
      const lCount = this.canvasActor.instance.exports.get_layer_count();

      if (cat === 'surface' || cat === 'size' || cat === 'canvas' || cat === 'resolution') {
        if (prop === 'width' || prop === 'w' || cat === 'width') {
          console.log(cw);
        } else if (prop === 'height' || prop === 'h' || cat === 'height') {
          console.log(ch);
        } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions' || cat === 'size' || cat === 'resolution') {
          console.log(`${cw}x${ch}`);
        } else {
          console.log(`surface ${cw}x${ch} (layers: ${lCount})`);
        }
        return;
      }

      if (cat === 'layer' || cat === 'layers') {
        const targetId = !isNaN(parseInt(tokens[3] || tokens[2], 10)) ? parseInt(tokens[3] || tokens[2], 10) : activeL;
        const vis = this.canvasActor.instance.exports.get_layer_visible ? this.canvasActor.instance.exports.get_layer_visible(targetId) : 1;
        const op = this.canvasActor.instance.exports.get_layer_opacity ? this.canvasActor.instance.exports.get_layer_opacity(targetId) : 255;
        const opPct = Math.round((op / 255) * 100);

        if (prop === 'id' || prop === 'idx' || prop === 'active') {
          console.log(activeL);
        } else if (prop === 'count' || prop === 'total') {
          console.log(lCount);
        } else if (prop === 'opacity' || prop === 'op') {
          console.log(`${opPct}%`);
        } else if (prop === 'visible' || prop === 'visibility' || prop === 'vis') {
          console.log(vis ? 'visible' : 'hidden');
        } else {
          console.log(`layer [${targetId}] ${vis ? 'visible' : 'hidden'} opacity: ${opPct}% (active: ${activeL}, total: ${lCount})`);
        }
        return;
      }

      if (cat === 'brush') {
        if (prop === 'name' || prop === '') {
          console.log(this.activeBrush);
        } else if (prop === 'params' || prop === 'all') {
          console.log(JSON.stringify(this.brushParams, null, 2));
        } else if (this.brushParams[prop] !== undefined) {
          console.log(this.brushParams[prop]);
        } else {
          console.log(`brush: ${this.activeBrush} | params: size=${this.brushParams.size}, opacity=${this.brushParams.opacity}%, hardness=${this.brushParams.hardness}%`);
        }
        return;
      }

      if (cat === 'texture') {
        const tex = this.getActiveTexture();
        if (prop === 'name' || prop === '') {
          console.log(this.activeTexture);
        } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions') {
          console.log(tex ? `${tex.width}x${tex.height}` : 'none');
        } else if (prop === 'count' || prop === 'total') {
          console.log(this.textures.size);
        } else {
          console.log(`texture: "${this.activeTexture}" (${tex ? `${tex.width}x${tex.height}` : 'none'}, total: ${this.textures.size})`);
        }
        return;
      }

      if (cat === 'color') {
        const c = this.currentColor;
        const r = c & 0xFF;
        const g = (c >> 8) & 0xFF;
        const b = (c >> 16) & 0xFF;
        const a = (c >> 24) & 0xFF;
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        if (prop === 'rgb') {
          console.log(`${r} ${g} ${b}`);
        } else if (prop === 'hex') {
          console.log(hex);
        } else {
          console.log(`color: ${hex} (rgba: ${r}, ${g}, ${b}, ${a})`);
        }
        return;
      }

      if (cat === 'tool') {
        console.log(this.currentTool === 1 ? 'eraser' : 'brush');
        return;
      }

      if (cat === 'zoom') {
        console.log(`${(this.zoom * 100).toFixed(0)}%`);
        return;
      }

      if (cat === 'pan') {
        console.log(`(${Math.round(this.panX)}, ${Math.round(this.panY)})`);
        return;
      }

      console.log(`err: unknown get category '${tokens[1]}'. Options: surface, layer, brush, texture, color, tool, zoom, pan`);
      return;
    }

    // 4. STATUS / INFO
    if (cmd === 'status' || cmd === 'info') {
      const activeL = this.canvasActor.instance.exports.get_active_layer();
      const lCount = this.canvasActor.instance.exports.get_layer_count();
      const cw = this.canvasActor.instance.exports.get_width ? this.canvasActor.instance.exports.get_width() : this.canvasActor.instance.exports.get_canvas_width();
      const ch = this.canvasActor.instance.exports.get_height ? this.canvasActor.instance.exports.get_height() : this.canvasActor.instance.exports.get_canvas_height();

      console.log(`\x1b[1mStatus:\x1b[0m
  Surface: ${cw}x${ch}
  Layer:   [${activeL}] of ${lCount}
  Brush:   ${this.activeBrush} (size: ${this.brushParams.size})
  Texture: "${this.activeTexture}"
  Color:   0x${this.currentColor.toString(16).padStart(8, '0')}
  Tool:    ${this.currentTool === 1 ? 'eraser' : 'brush'}
  Zoom:    ${(this.zoom * 100).toFixed(0)}% | Pan: (${Math.round(this.panX)}, ${Math.round(this.panY)})
`);
      return;
    }

    // 5. EXIT / QUIT
    if (cmd === 'exit' || cmd === 'quit') {
      console.log('Goodbye.');
      process.exit(0);
    }

    // 6. RESIZE / SURFACE COMMANDS
    if (cmd === 'resize' || (cmd === 'set' && tokens[1] && (tokens[1].toLowerCase() === 'size' || tokens[1].toLowerCase() === 'resolution' || (tokens[1].toLowerCase() === 'canvas' && tokens[2] && tokens[2].toLowerCase() === 'size')))) {
      const w = parseInt(cmd === 'resize' ? tokens[1] : (tokens[1].toLowerCase() === 'canvas' ? tokens[3] : tokens[2]), 10);
      const h = parseInt(cmd === 'resize' ? tokens[2] : (tokens[1].toLowerCase() === 'canvas' ? tokens[4] : tokens[3]), 10);
      if (w >= 16 && h >= 16 && w <= 4096 && h <= 4096) {
        this.sendCanvasCmd(`resize ${w} ${h}`);
        this.sendConsoleLog(`surface resized to ${w}x${h}`);
      } else {
        this.sendConsoleLog('err: invalid dimensions (min 16x16, max 4096x4096)', 0xFFFF5555);
      }
      return;
    }

    if (cmd === 'set' && tokens[1]) {
      const sub = tokens[1].toLowerCase();
      if ((sub === 'width' || sub === 'w') && tokens[2]) {
        const w = parseInt(tokens[2], 10);
        const h = this.canvasActor.instance.exports.get_height ? this.canvasActor.instance.exports.get_height() : this.canvasActor.instance.exports.get_canvas_height();
        if (w >= 16 && w <= 4096) {
          this.sendCanvasCmd(`resize ${w} ${h}`);
          this.sendConsoleLog(`width updated to ${w}`);
        }
        return;
      } else if ((sub === 'height' || sub === 'h') && tokens[2]) {
        const w = this.canvasActor.instance.exports.get_width ? this.canvasActor.instance.exports.get_width() : this.canvasActor.instance.exports.get_canvas_width();
        const h = parseInt(tokens[2], 10);
        if (h >= 16 && h <= 4096) {
          this.sendCanvasCmd(`resize ${w} ${h}`);
          this.sendConsoleLog(`height updated to ${h}`);
        }
        return;
      }
    }

    // 7. LAYER COMMANDS
    if (cmd === 'new' && tokens[1] && tokens[1].toLowerCase() === 'layer') {
      this.sendCanvasCmd('layer add');
      this.sendConsoleLog('new layer added');
      return;
    }

    if (((cmd === 'select' || cmd === 'set') && tokens[1] && tokens[1].toLowerCase() === 'layer' && tokens[2]) ||
        (cmd === 'layer' && tokens[1] && !isNaN(parseInt(tokens[1], 10)))) {
      const id = parseInt(cmd === 'layer' ? tokens[1] : tokens[2], 10);
      this.sendCanvasCmd(`layer select ${id}`);
      this.sendConsoleLog(`selected layer [${id}]`);
      return;
    }

    if ((cmd === 'delete' || cmd === 'remove') && tokens[1] && tokens[1].toLowerCase() === 'layer') {
      const id = tokens[2] ? parseInt(tokens[2], 10) : this.canvasActor.instance.exports.get_active_layer();
      this.sendCanvasCmd(`layer delete ${id}`);
      this.sendConsoleLog(`deleted layer [${id}]`);
      return;
    }

    if ((cmd === 'toggle' || cmd === 'hide' || cmd === 'show') && tokens[1] && tokens[1].toLowerCase() === 'layer') {
      const id = tokens[2] ? parseInt(tokens[2], 10) : this.canvasActor.instance.exports.get_active_layer();
      this.sendCanvasCmd(`layer toggle ${id}`);
      this.sendConsoleLog(`toggled layer [${id}] visibility`);
      return;
    }

    if ((cmd === 'opacity' && tokens[1] && tokens[1].toLowerCase() === 'layer') ||
        (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'layer' && tokens[2] && tokens[2].toLowerCase() === 'opacity')) {
      const id = (cmd === 'opacity') ? parseInt(tokens[2], 10) : this.canvasActor.instance.exports.get_active_layer();
      const val = parseInt((cmd === 'opacity') ? tokens[3] : tokens[3], 10);
      if (!isNaN(val)) {
        this.sendCanvasCmd(`layer opacity ${id} ${val}`);
        this.sendConsoleLog(`set layer [${id}] opacity to ${val}%`);
      }
      return;
    }

    if (cmd === 'clear' || (cmd === 'clear' && tokens[1] && tokens[1].toLowerCase() === 'layer')) {
      this.sendCanvasCmd('layer clear');
      this.sendConsoleLog('active layer cleared');
      return;
    }

    // 8. BRUSH COMMANDS
    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'brush') || (cmd === 'brush' && tokens[1])) {
      const sub = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      const val = (cmd === 'set' ? tokens[3] : tokens[2]);

      const paramMap = {
        size: 1, opacity: 2, hardness: 3, flow: 4, spacing: 5,
        angle: 6, roundness: 7, scatter: 8, tolerance: 9, density: 10,
        wetness: 11, grain: 12, texture_mode: 13, texture_scale: 14, texture_strength: 15
      };

      if (paramMap[sub] !== undefined && val !== undefined) {
        const paramId = paramMap[sub];
        const paramVal = parseFloat(val);
        this.brushParams[sub] = paramVal;
        const buf = Buffer.alloc(16);
        buf.writeUInt32LE(MSG_BRUSH_SET_PARAM, 0);
        buf.writeUInt32LE(paramId, 4);
        buf.writeFloatLE(paramVal, 8);

        for (const entry of this.plugins.values()) {
          if (entry.type === 'brush') entry.actor.say(buf, ACTOR_SCREEN);
        }
        this.sendConsoleLog(`brush ${sub} set to ${val}`);
        return;
      } else {
        if (this.plugins.has(sub)) {
          this.activeBrush = sub;
          this.sendConsoleLog(`active brush switched to '${sub}'`);
        } else {
          this.sendConsoleLog(`err: brush '${sub}' not found`, 0xFFFF5555);
        }
        return;
      }
    }

    // 9. TEXTURE COMMANDS
    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'texture') || (cmd === 'texture' && tokens[1])) {
      const tname = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      if (this.textures.has(tname)) {
        this.activeTexture = tname;
        this.sendConsoleLog(`active texture set to '${tname}'`);
      } else {
        this.sendConsoleLog(`err: texture '${tname}' not found`, 0xFFFF5555);
      }
      return;
    }

    if ((cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'to' && tokens[2] && tokens[2].toLowerCase() === 'texture') ||
        cmd === 'layer-to-texture' || cmd === 'layertotexture') {
      const tname = (cmd === 'layer' ? tokens[3] : tokens[1]) || `layer_${Date.now() % 1000}`;
      const ok = this.convertLayerToTexture(-1, tname);
      if (ok) {
        this.sendConsoleLog(`layer converted to texture '${tname}'`);
      } else {
        this.sendConsoleLog(`err: failed converting layer to texture`, 0xFFFF5555);
      }
      return;
    }

    // 10. FILTER COMMANDS
    if (cmd === 'filter' && tokens[1]) {
      const fname = tokens[1].toLowerCase();
      const p1 = parseInt(tokens[2], 10) || 0;
      const p2 = parseInt(tokens[3], 10) || 0;

      const filterEntry = this.plugins.get(fname);
      if (filterEntry && filterEntry.actor) {
        const buf = Buffer.alloc(32);
        buf.writeUInt32LE(MSG_APPLY_FILTER, 0);
        buf.write(fname.slice(0, 19), 4, 'utf8');
        buf.writeInt32LE(p1, 24);
        buf.writeInt32LE(p2, 28);
        filterEntry.actor.say(buf, ACTOR_SCREEN);
        this.sendConsoleLog(`filter '${fname}' applied`);
      } else {
        this.sendConsoleLog(`err: filter '${fname}' not found`, 0xFFFF5555);
      }
      return;
    }

    // 11. IMAGE I/O COMMANDS
    if (cmd === 'save' && tokens[1]) {
      let target = 0;
      let filePath = tokens[1];
      if (tokens[1].toLowerCase() === 'canvas' && tokens[2]) {
        target = 0;
        filePath = tokens[2];
      } else if (tokens[1].toLowerCase() === 'layer' && tokens[2]) {
        target = 1;
        filePath = tokens[2];
      }

      const res = this.saveCanvasOrLayer(filePath, target);
      if (res.ok) {
        this.sendConsoleLog(`image saved to '${res.path}'`);
      } else {
        this.sendConsoleLog(`err: failed saving image: ${res.error}`, 0xFFFF5555);
      }
      return;
    }

    if (cmd === 'load' && tokens[1] && tokens[1].toLowerCase() === 'image' && tokens[2]) {
      const filePath = tokens[2];
      let target = 0;
      let texName = '';

      if (tokens[3]) {
        const opt = tokens[3].toLowerCase();
        if (opt === 'layer' || opt === 'newlayer') target = 1;
        else if (opt === 'texture') {
          target = 2;
          texName = tokens[4] || '';
        }
      }

      const res = this.loadImageFromFile(filePath, target, texName);
      if (res.ok) {
        this.sendConsoleLog(res.msg);
      } else {
        this.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
      }
      return;
    }

    // 12. COLOR & TOOL COMMANDS
    if (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'color' && tokens[2]) {
      const colStr = tokens.slice(2).join(' ');
      const parsed = parseColorString(colStr);
      if (parsed !== null) {
        this.currentColor = parsed;
        this.sendCanvasCmd(`color set 0x${parsed.toString(16)}`);
        this.sendConsoleLog(`color set to 0x${parsed.toString(16).padStart(8, '0')}`);
      } else {
        this.sendConsoleLog(`err: unknown color '${colStr}'`, 0xFFFF5555);
      }
      return;
    }

    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'tool' && tokens[2]) ||
        (cmd === 'tool' && tokens[1])) {
      const t = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      this.currentTool = (t === 'eraser' || t === 'erase') ? 1 : 0;
      this.sendCanvasCmd(`tool set ${this.currentTool === 1 ? 'eraser' : 'brush'}`);
      this.sendConsoleLog(`tool set to ${this.currentTool === 1 ? 'eraser' : 'brush'}`);
      return;
    }

    // 13. PRIMITIVE DRAW COMMANDS
    if (cmd === 'draw' && tokens[1]) {
      const shape = tokens[1].toLowerCase();
      if (shape === 'line' && tokens.length >= 6) {
        const x0 = parseInt(tokens[2], 10);
        const y0 = parseInt(tokens[3], 10);
        const x1 = parseInt(tokens[4], 10);
        const y1 = parseInt(tokens[5], 10);
        this.sendCanvasCmd(`draw line ${x0} ${y0} ${x1} ${y1}`);
        this.sendConsoleLog(`drew line from (${x0},${y0}) to (${x1},${y1})`);
        return;
      }
      if (shape === 'rect' && tokens.length >= 6) {
        const x = parseInt(tokens[2], 10);
        const y = parseInt(tokens[3], 10);
        const w = parseInt(tokens[4], 10);
        const h = parseInt(tokens[5], 10);
        this.sendCanvasCmd(`draw rect ${x} ${y} ${w} ${h}`);
        this.sendConsoleLog(`drew rect at (${x},${y}) size ${w}x${h}`);
        return;
      }
      if (shape === 'circle' && tokens.length >= 5) {
        const cx = parseInt(tokens[2], 10);
        const cy = parseInt(tokens[3], 10);
        const r = parseInt(tokens[4], 10);
        this.sendCanvasCmd(`draw circle ${cx} ${cy} ${r}`);
        this.sendConsoleLog(`drew circle at (${cx},${cy}) radius ${r}`);
        return;
      }
      if (shape === 'grid' && tokens.length >= 3) {
        const step = parseInt(tokens[2], 10);
        this.sendCanvasCmd(`draw grid ${step}`);
        this.sendConsoleLog(`drew grid with step ${step}`);
        return;
      }
    }

    // 14. EVAL COMMAND
    if (cmd === 'eval') {
      const expr = tokens.slice(1).join(' ');
      const val = evaluateMath(expr);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
      } else {
        console.log('\x1b[31merr: invalid expression\x1b[0m');
      }
      return;
    }

    console.log(`\x1b[31merr: unknown command '${raw}'. Type 'help' for commands.\x1b[0m`);
  }

  initWindow() {
    this.window = sdl.video.createWindow({
      title: 'wesenho',
      width: this.windowWidth,
      height: this.windowHeight,
      resizable: true
    });

    this.window.on('resize', (e) => {
      this.windowWidth = e.width;
      this.windowHeight = e.height;
      this.screenBuffer = Buffer.alloc(this.windowWidth * this.windowHeight * 4);
    });

    this.window.on('mouseMove', (e) => {
      this.mouseState.x = e.x;
      this.mouseState.y = e.y;

      if (this.isPanning) {
        this.panX += (e.x - this.panStartX);
        this.panY += (e.y - this.panStartY);
        this.panStartX = e.x;
        this.panStartY = e.y;
      } else if (this.isDrawingOnCanvas && (this.mouseState.buttons & 3)) {
        const docX = (this.mouseState.x - this.panX) / this.zoom;
        const docY = (this.mouseState.y - this.panY) / this.zoom;
        const isEraser = (this.mouseState.buttons & 2) ? 1 : (this.currentTool === 1 ? 1 : 0);
        this.sendStroke(docX, docY, this.strokePrevX, this.strokePrevY, 1 /* STROKE_MOVE */, isEraser, this.currentColor);
        this.strokePrevX = docX;
        this.strokePrevY = docY;
      }
    });

    this.window.on('mouseButtonDown', (e) => {
      if (e.button === 1) this.mouseState.buttons |= 1;
      else if (e.button === 3) this.mouseState.buttons |= 2;
      else if (e.button === 2) this.mouseState.buttons |= 4;

      if (e.button === 2) {
        this.isPanning = true;
        this.panStartX = this.mouseState.x;
        this.panStartY = this.mouseState.y;
      } else if ((e.button === 1 || e.button === 3) && !this.isPanning) {
        this.isDrawingOnCanvas = true;
        const docX = (this.mouseState.x - this.panX) / this.zoom;
        const docY = (this.mouseState.y - this.panY) / this.zoom;
        this.strokePrevX = docX;
        this.strokePrevY = docY;
        const isEraser = (e.button === 3) ? 1 : (this.currentTool === 1 ? 1 : 0);
        this.sendStroke(docX, docY, docX, docY, 0 /* STROKE_START */, isEraser, this.currentColor);
      }
    });

    this.window.on('mouseButtonUp', (e) => {
      if (e.button === 1) this.mouseState.buttons &= ~1;
      else if (e.button === 3) this.mouseState.buttons &= ~2;
      else if (e.button === 2) {
        this.mouseState.buttons &= ~4;
        this.isPanning = false;
      }

      if ((this.mouseState.buttons & 3) === 0) {
        if (this.isDrawingOnCanvas) {
          const isEraser = (this.currentTool === 1);
          this.sendStroke(this.strokePrevX, this.strokePrevY, this.strokePrevX, this.strokePrevY, 2 /* STROKE_END */, isEraser, this.currentColor);
        }
        this.isDrawingOnCanvas = false;
        this.strokePrevX = -1;
        this.strokePrevY = -1;
      }
    });

    this.window.on('mouseWheel', (e) => {
      const oldZoom = this.zoom;
      const factor = e.dy > 0 ? 1.15 : 0.85;
      this.zoom = Math.max(0.1, Math.min(10.0, this.zoom * factor));

      const mx = this.mouseState.x;
      const my = this.mouseState.y;
      this.panX = mx - (mx - this.panX) * (this.zoom / oldZoom);
      this.panY = my - (my - this.panY) * (this.zoom / oldZoom);
    });

    this.window.on('close', () => process.exit(0));
  }

  setupRepl() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[36mwesenho>\x1b[0m '
    });

    console.log('\x1b[1;32m=== Wesenho Interactive Console Ready (Piolho Runtime) ===\x1b[0m');
    console.log('Type \x1b[33mhelp\x1b[0m for command list. Mouse: Left=Draw, Right=Erase, Middle=Pan, Wheel=Zoom\n');
    this.rl.prompt();

    this.rl.on('line', (line) => {
      this.executeCommand(line);
      this.rl.prompt();
    });
  }

  renderFrame() {
    if (!this.canvasActor || !this.canvasActor.instance) return;
    this.canvasActor.instance.exports.update();

    this.screenBuffer.fill(0x18);

    const cw = this.canvasActor.instance.exports.get_canvas_width();
    const ch = this.canvasActor.instance.exports.get_canvas_height();
    const pixPtr = this.canvasActor.instance.exports.get_composite_pixels();

    if (pixPtr && cw > 0 && ch > 0) {
      const canvasPixels = new Uint8Array(this.canvasActor.memory.buffer, pixPtr, cw * ch * 4);
      const screenStartX = Math.max(0, Math.floor(this.panX));
      const screenStartY = Math.max(0, Math.floor(this.panY));
      const screenEndX = Math.min(this.windowWidth, Math.ceil(this.panX + cw * this.zoom));
      const screenEndY = Math.min(this.windowHeight, Math.ceil(this.panY + ch * this.zoom));

      const invZoom = 1 / this.zoom;

      for (let sy = screenStartY; sy < screenEndY; sy++) {
        const dy = Math.floor((sy - this.panY) * invZoom);
        if (dy < 0 || dy >= ch) continue;

        const docRowOffset = dy * cw * 4;
        const screenRowOffset = sy * this.windowWidth * 4;

        for (let sx = screenStartX; sx < screenEndX; sx++) {
          const dx = Math.floor((sx - this.panX) * invZoom);
          if (dx < 0 || dx >= cw) continue;

          const docPixelOffset = docRowOffset + dx * 4;
          const screenPixelOffset = screenRowOffset + sx * 4;

          this.screenBuffer[screenPixelOffset + 0] = canvasPixels[docPixelOffset + 0];
          this.screenBuffer[screenPixelOffset + 1] = canvasPixels[docPixelOffset + 1];
          this.screenBuffer[screenPixelOffset + 2] = canvasPixels[docPixelOffset + 2];
          this.screenBuffer[screenPixelOffset + 3] = 0xFF;
        }
      }
    }

    this.window.render(this.windowWidth, this.windowHeight, this.windowWidth * 4, 'rgba32', this.screenBuffer);
  }
}

function discoverModules(baseDir) {
  const modules = [];
  let nextId = 11;

  const pluginsDir = path.resolve(baseDir, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    const subdirs = [
      { dir: 'filters', type: 'filter' },
      { dir: 'brushes', type: 'brush' }
    ];
    for (const { dir: sub, type } of subdirs) {
      const dir = path.join(pluginsDir, sub);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).sort();
      for (const f of files) {
        if (f.endsWith('.wasm')) {
          const modPath = path.relative(baseDir, path.join(dir, f));
          modules.push({
            id: nextId++,
            name: path.basename(f, '.wasm'),
            type,
            wasmPath: modPath
          });
        }
      }
    }
  }

  return modules;
}

async function main() {
  const host = new WesenhoScreenHost();
  const registry = new ExtensionRegistry();

  // Piolho Extension: std:framebuffer
  registry.register({
    name: ['std:framebuffer', 'framebuffer'],
    onRequest(worker, wasmHost, name) {
      let state = wasmHost.extState.get('std:framebuffer');
      if (!state) {
        const fbPtr = worker.alloc(12, 4);
        state = { fbPtr };
        wasmHost.extState.set('std:framebuffer', state);
      }
      return state.fbPtr;
    }
  });

  // Piolho Extension: canvas:layer (shares active canvas layer buffer with guest actors)
  registry.register({
    name: ['canvas:layer', 'canvas:active_layer', 'std:canvas'],
    onRequest(worker, wasmHost, name) {
      if (!host.canvasActor || !host.canvasActor.instance) return 0;
      const cw = host.canvasActor.instance.exports.get_canvas_width();
      const ch = host.canvasActor.instance.exports.get_canvas_height();
      const pixPtr = host.canvasActor.instance.exports.get_active_layer_pixels();
      if (!pixPtr || cw === 0 || ch === 0) return 0;

      const byteLen = cw * ch * 4;
      let state = wasmHost.extState.get('canvas:layer');
      if (!state || state.byteLen < byteLen) {
        const fbPtr = worker.alloc(12, 4);
        const pixCopyPtr = worker.alloc(byteLen, 4);
        state = { fbPtr, pixCopyPtr, byteLen, cw, ch };
        wasmHost.extState.set('canvas:layer', state);
      }

      const view = new DataView(worker.memory.buffer);
      view.setUint32(state.fbPtr + 0, cw, true);
      view.setUint32(state.fbPtr + 4, ch, true);
      view.setUint32(state.fbPtr + 8, state.pixCopyPtr, true);

      new Uint8Array(worker.memory.buffer, state.pixCopyPtr, byteLen)
        .set(new Uint8Array(host.canvasActor.memory.buffer, pixPtr, byteLen));

      state.dirty = true;
      return state.fbPtr;
    },
    onAfterUpdate(worker, wasmHost) {
      const state = wasmHost.extState.get('canvas:layer');
      if (state && state.dirty && host.canvasActor && host.canvasActor.instance) {
        const pixPtr = host.canvasActor.instance.exports.get_active_layer_pixels();
        if (pixPtr) {
          new Uint8Array(host.canvasActor.memory.buffer, pixPtr, state.byteLen)
            .set(new Uint8Array(worker.memory.buffer, state.pixCopyPtr, state.byteLen));
          if (host.canvasActor.instance.exports.force_composite) {
            host.canvasActor.instance.exports.force_composite();
          }
        }
        state.dirty = false;
      }
    }
  });

  // Piolho Extension: brush:texture (shares procedural/loaded texture with brush actors)
  registry.register({
    name: ['brush:texture', 'std:texture', 'texture'],
    onRequest(worker, wasmHost, name) {
      const tex = host.getActiveTexture();
      if (!tex || !tex.width || !tex.height || !tex.data) return 0;

      const byteLen = tex.width * tex.height * 4;
      let state = wasmHost.extState.get('brush:texture');
      if (!state || state.byteLen < byteLen) {
        const fbPtr = worker.alloc(12, 4);
        const pixPtr = worker.alloc(byteLen, 4);
        state = { fbPtr, pixPtr, byteLen };
        wasmHost.extState.set('brush:texture', state);
      }

      const view = new DataView(worker.memory.buffer);
      view.setUint32(state.fbPtr + 0, tex.width, true);
      view.setUint32(state.fbPtr + 4, tex.height, true);
      view.setUint32(state.fbPtr + 8, state.pixPtr, true);

      new Uint8Array(worker.memory.buffer, state.pixPtr, byteLen).set(tex.data);
      return state.fbPtr;
    }
  });

  // Canvas WASM Actor (Piolho Host)
  host.canvasActor = new Piolho(path.resolve(__dirname, '../roms/canvas.wasm'), {
    id: ACTOR_CANVAS,
    name: 'canvas',
    threaded: false,
    extensions: registry
  });
  await host.canvasActor.init();
  host.canvasActor.instance.exports.update();

  // Connect Screen Actor <-> Canvas Actor
  host.actor.connect(host.canvasActor);

  // Discover & Load WASM Plugins (Brushes & Filters)
  const moduleConfigs = discoverModules(path.resolve(__dirname, '..'));
  for (const mod of moduleConfigs) {
    const fullPath = path.resolve(__dirname, '..', mod.wasmPath);
    if (!fs.existsSync(fullPath)) continue;

    const pluginActor = new Piolho(fullPath, {
      id: mod.id,
      name: mod.name,
      threaded: false,
      extensions: registry
    });
    await pluginActor.init();

    // Hook say(ACTOR_HOST, ...) from plugin to screen actor
    pluginActor.on('say', (payload, reply, target, fromName) => {
      host.actor.say(payload, fromName);
    });

    // When filter/brush modifies layer during on_message, sync layer back to canvas
    const origSay = pluginActor.say.bind(pluginActor);
    pluginActor.say = (data, from) => {
      const res = origSay(data, from);
      const state = pluginActor.extState.get('canvas:layer');
      if (state && state.dirty && host.canvasActor && host.canvasActor.instance) {
        const pixPtr = host.canvasActor.instance.exports.get_active_layer_pixels();
        if (pixPtr) {
          new Uint8Array(host.canvasActor.memory.buffer, pixPtr, state.byteLen)
            .set(new Uint8Array(pluginActor.memory.buffer, state.pixCopyPtr, state.byteLen));
          if (host.canvasActor.instance.exports.force_composite) {
            host.canvasActor.instance.exports.force_composite();
          }
        }
        state.dirty = false;
      }
      return res;
    };

    host.plugins.set(mod.name, { type: mod.type, actor: pluginActor });
    host.actor.connect(pluginActor);
    host.canvasActor.connect(pluginActor);
  }

  // Hook say from canvas actor to screen actor
  host.canvasActor.on('say', (payload, reply, target, fromName) => {
    host.actor.say(payload, fromName);
  });

  // Initialize SDL window & REPL
  host.initWindow();
  host.setupRepl();

  // Render loop (~60 FPS)
  const frameLoop = () => {
    host.renderFrame();
    setTimeout(frameLoop, 16);
  };

  frameLoop();
}

main().catch(console.error);
