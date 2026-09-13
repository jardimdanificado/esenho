const sdl = require('@kmamal/sdl');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { saveImage, loadImage } = require('./image_io');

let windowWidth = 1000;
let windowHeight = 900;

// Document Dimensions (Default Vertical Proportions)
const DOC_WIDTH = 800;
const DOC_HEIGHT = 1000;

// Viewport / Camera Navigation State
let zoom = 0.72;
let panX = (windowWidth - DOC_WIDTH * zoom) / 2;
let panY = (windowHeight - DOC_HEIGHT * zoom) / 2;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

const ACTOR_BROKER  = 0;
const ACTOR_CANVAS  = 1;

// Message IDs
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

  // 1. Paper (256x256) - subtle paper grain & fibers
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

  // 2. Canvas (128x128) - woven cross-thread texture
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

  // 3. Noise (256x256) - dense organic grain
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

  // 4. Dots (32x32) - halftone dot pattern
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

  // 5. Grid (32x32) - cross grid
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

  // 6. Grunge (256x256) - rough stippled splotches
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

class WasmActor {
  constructor(id, name, wasmPath, broker) {
    this.id = id;
    this.name = name;
    this.wasmPath = wasmPath;
    this.width = 0;
    this.height = 0;
    this.broker = broker;

    this.memory = null;
    this.instance = null;
    this.arenaOffset = 0x800000; // 8MB

    this.fbPtr = 0;
    this.mousePtr = 0;
    this.kbPtr = 0;

    this.texFbPtr = 0;
    this.texPixelsPtr = 0;
    this.texAllocSize = 0;
  }

  hostAlloc(size, align = 4) {
    if (align > 1) this.arenaOffset = (this.arenaOffset + align - 1) & ~(align - 1);
    const ptr = this.arenaOffset;
    this.arenaOffset += size;
    if (this.arenaOffset > this.memory.buffer.byteLength) {
      this.memory.grow(Math.ceil((this.arenaOffset - this.memory.buffer.byteLength) / 65536));
    }
    return ptr;
  }

  readString(ptr) {
    if (!ptr || !this.memory) return '';
    const bytes = new Uint8Array(this.memory.buffer, ptr);
    let len = 0;
    while (len < 1024 && (ptr + len) < this.memory.buffer.byteLength && bytes[len] !== 0) len++;
    return new TextDecoder().decode(bytes.subarray(0, len));
  }

  handleAsk(namePtr) {
    const name = this.readString(namePtr);

    if (name === 'std:framebuffer' || name === 'framebuffer') {
      if (!this.fbPtr) {
        this.fbPtr = this.hostAlloc(12);
        const view = new DataView(this.memory.buffer);
        view.setUint32(this.fbPtr + 0, 0, true);
        view.setUint32(this.fbPtr + 4, 0, true);
        view.setUint32(this.fbPtr + 8, 0, true);
      }
      return this.fbPtr;
    }

    if (name === 'canvas:layer' || name === 'canvas:active_layer' || name === 'std:canvas') {
      const canvas = this.broker.actors.get(ACTOR_CANVAS);
      if (!canvas || !canvas.instance || !canvas.instance.exports.get_active_layer_pixels) {
        return 0;
      }
      const canvasPixPtr = canvas.instance.exports.get_active_layer_pixels();
      const w = canvas.instance.exports.get_canvas_width();
      const h = canvas.instance.exports.get_canvas_height();
      if (!canvasPixPtr || w === 0 || h === 0) return 0;

      const byteLen = w * h * 4;
      if (!this.layerFbPtr) {
        this.layerFbPtr = this.hostAlloc(12);
      }
      if (!this.layerPixelsPtr) {
        this.layerPixelsPtr = this.hostAlloc(byteLen);
      }

      const view = new DataView(this.memory.buffer);
      view.setUint32(this.layerFbPtr + 0, w, true);
      view.setUint32(this.layerFbPtr + 4, h, true);
      view.setUint32(this.layerFbPtr + 8, this.layerPixelsPtr, true);

      // Copy pixels from canvas into this actor's layer buffer
      const canvasBytes = new Uint8Array(canvas.memory.buffer, canvasPixPtr, byteLen);
      new Uint8Array(this.memory.buffer, this.layerPixelsPtr, byteLen).set(canvasBytes);

      this.layerFbModified = true;
      this.canvasActorRef = canvas;
      this.canvasPixPtr = canvasPixPtr;
      this.canvasByteLen = byteLen;

      return this.layerFbPtr;
    }

    if (name === 'brush:texture' || name === 'std:texture' || name === 'texture') {
      const tex = this.broker.getActiveTexture();
      if (!tex || !tex.width || !tex.height || !tex.data) {
        if (this.texFbPtr) {
          const view = new DataView(this.memory.buffer);
          view.setUint32(this.texFbPtr + 0, 0, true);
          view.setUint32(this.texFbPtr + 4, 0, true);
          view.setUint32(this.texFbPtr + 8, 0, true);
          return this.texFbPtr;
        }
        return 0;
      }

      const byteLen = tex.width * tex.height * 4;
      if (!this.texFbPtr) {
        this.texFbPtr = this.hostAlloc(12);
      }
      if (!this.texPixelsPtr || this.texAllocSize < byteLen) {
        this.texPixelsPtr = this.hostAlloc(byteLen);
        this.texAllocSize = byteLen;
      }

      const view = new DataView(this.memory.buffer);
      view.setUint32(this.texFbPtr + 0, tex.width, true);
      view.setUint32(this.texFbPtr + 4, tex.height, true);
      view.setUint32(this.texFbPtr + 8, this.texPixelsPtr, true);

      new Uint8Array(this.memory.buffer, this.texPixelsPtr, byteLen).set(tex.data);
      return this.texFbPtr;
    }

    if (name === 'std:mouse' || name === 'mouse') {
      if (!this.mousePtr) {
        this.mousePtr = this.hostAlloc(20);
      }
      return this.mousePtr;
    }

    if (name === 'std:keyboard' || name === 'keyboard') {
      if (!this.kbPtr) {
        this.kbPtr = this.hostAlloc(256);
      }
      return this.kbPtr;
    }

    return 0;
  }

  syncDimensions() {
    if (!this.fbPtr || !this.memory) return;
    const view = new DataView(this.memory.buffer);
    const w = view.getUint32(this.fbPtr + 0, true);
    const h = view.getUint32(this.fbPtr + 4, true);
    if (w > 0 && h > 0) {
      this.width = w;
      this.height = h;
    }
  }

  syncMouse(x, y, buttons, wheel_x, wheel_y) {
    if (!this.mousePtr || !this.memory) return;
    const view = new DataView(this.memory.buffer);
    view.setInt32(this.mousePtr + 0, Math.floor(x), true);
    view.setInt32(this.mousePtr + 4, Math.floor(y), true);
    view.setUint32(this.mousePtr + 8, buttons, true);
    view.setInt32(this.mousePtr + 12, wheel_x, true);
    view.setInt32(this.mousePtr + 16, wheel_y, true);
  }

  syncKeyboard(keys) {
    if (!this.kbPtr || !this.memory) return;
    new Uint8Array(this.memory.buffer, this.kbPtr, 256).set(keys);
  }

  receiveMessage(fromId, buffer) {
    if (!this.instance || !this.instance.exports.on_message) return;
    this.layerFbModified = false;
    const dest = new Uint8Array(this.memory.buffer, 0, buffer.length);
    dest.set(buffer);
    this.instance.exports.on_message(fromId, buffer.length);

    // If filter actor or brush actor modified canvas layer, sync back to canvas
    if (this.layerFbModified && this.canvasActorRef && this.canvasPixPtr) {
      const modifiedBytes = new Uint8Array(this.memory.buffer, this.layerPixelsPtr, this.canvasByteLen);
      new Uint8Array(this.canvasActorRef.memory.buffer, this.canvasPixPtr, this.canvasByteLen).set(modifiedBytes);
      if (this.canvasActorRef.instance.exports.force_composite) {
        this.canvasActorRef.instance.exports.force_composite();
      }
      this.layerFbModified = false;
    }
  }

  async init() {
    const wasmBytes = fs.readFileSync(this.wasmPath);
    const env = {
      ask: (namePtr) => this.handleAsk(namePtr),
      say: (targetId, len) => {
        const msgBytes = new Uint8Array(this.memory.buffer, 0, len).slice();
        this.broker.dispatch(this.id, targetId, msgBytes);
        return 0;
      },
      connect: () => 0,
      quit: (code) => process.exit(code),
      strlen: (ptr) => {
        if (!ptr || !this.memory) return 0;
        const u8 = new Uint8Array(this.memory.buffer, ptr);
        let len = 0;
        while (u8[len] !== 0) len++;
        return len;
      },
      memcpy: (dst, src, num) => {
        if (!this.memory) return dst;
        new Uint8Array(this.memory.buffer, dst, num).set(new Uint8Array(this.memory.buffer, src, num));
        return dst;
      },
      memset: (dst, val, num) => {
        if (!this.memory) return dst;
        new Uint8Array(this.memory.buffer, dst, num).fill(val);
        return dst;
      }
    };

    const mod = await WebAssembly.instantiate(wasmBytes, { env });
    this.instance = mod.instance;
    this.memory = mod.instance.exports.memory;

    this.arenaOffset = 0x2000000; // 32MB host arena (safe from C heap)
  }

  update() {
    if (this.instance && this.instance.exports.update) {
      this.layerFbModified = false;
      this.instance.exports.update();
      this.syncDimensions();

      if (this.layerFbModified && this.canvasActorRef && this.canvasPixPtr) {
        const modifiedBytes = new Uint8Array(this.memory.buffer, this.layerPixelsPtr, this.canvasByteLen);
        new Uint8Array(this.canvasActorRef.memory.buffer, this.canvasPixPtr, this.canvasByteLen).set(modifiedBytes);
        if (this.canvasActorRef.instance.exports.force_composite) {
          this.canvasActorRef.instance.exports.force_composite();
        }
        this.layerFbModified = false;
      }
    }
  }

  getPixels() {
    if (!this.fbPtr || !this.memory) return null;
    const view = new DataView(this.memory.buffer);
    const pixelsPtr = view.getUint32(this.fbPtr + 8, true);
    if (!pixelsPtr || this.width === 0 || this.height === 0) return null;
    return new Uint8Array(this.memory.buffer, pixelsPtr, this.width * this.height * 4);
  }
}

class WesenhoBroker {
  constructor() {
    this.actors = new Map();
    this.actorsByName = new Map();
    this.topics = new Map();
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
    this.rl = null;
  }


  setReadline(rl) {
    this.rl = rl;
  }

  register(actor) {
    this.actors.set(actor.id, actor);
    this.actorsByName.set(actor.name, actor);
  }

  subscribe(actorId, topic) {
    if (!this.topics.has(topic)) this.topics.set(topic, new Set());
    this.topics.get(topic).add(actorId);
  }

  publish(fromId, topic, buffer) {
    const subs = this.topics.get(topic);
    if (!subs) return;
    for (const subId of subs) {
      if (subId !== fromId) {
        const actor = this.actors.get(subId);
        if (actor) actor.receiveMessage(fromId, buffer);
      }
    }
  }

  getActiveTexture() {
    if (!this.activeTexture || !this.textures.has(this.activeTexture)) return null;
    return this.textures.get(this.activeTexture);
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
    const canvas = this.actors.get(ACTOR_CANVAS);
    if (!canvas || !canvas.instance) return false;
    const w = canvas.instance.exports.get_canvas_width();
    const h = canvas.instance.exports.get_canvas_height();
    const targetIdx = (layerIdx >= 0) ? layerIdx : canvas.instance.exports.get_active_layer();
    const pixPtr = canvas.instance.exports.get_layer_pixels(targetIdx);
    if (!pixPtr || w === 0 || h === 0) return false;

    const byteLen = w * h * 4;
    const rawBytes = new Uint8Array(canvas.memory.buffer, pixPtr, byteLen);
    const texBuf = Buffer.alloc(byteLen);
    texBuf.set(rawBytes);

    this.textures.set(name, { width: w, height: h, data: texBuf });
    this.activeTexture = name;
    return true;
  }

  saveCanvasOrLayer(filePath, target) {
    const canvas = this.actors.get(ACTOR_CANVAS);
    if (!canvas || !canvas.instance) return { ok: false, error: 'Canvas not found' };
    const w = canvas.instance.exports.get_canvas_width();
    const h = canvas.instance.exports.get_canvas_height();
    const pixPtr = (target === 1)
      ? canvas.instance.exports.get_active_layer_pixels()
      : canvas.instance.exports.get_composite_pixels();

    if (!pixPtr || w === 0 || h === 0) return { ok: false, error: 'Empty canvas' };

    const byteLen = w * h * 4;
    const rawBytes = new Uint8Array(canvas.memory.buffer, pixPtr, byteLen);
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

      const canvas = this.actors.get(ACTOR_CANVAS);
      if (!canvas || !canvas.instance) return { ok: false, error: 'Canvas not found' };

      const cw = canvas.instance.exports.get_canvas_width();
      const ch = canvas.instance.exports.get_canvas_height();

      if (target === 1) { // New layer
        canvas.receiveMessage(ACTOR_BROKER, Buffer.from(new Uint32Array([7 /* MSG_LAYER_ADD */, 0, 0, 0]).buffer));
      }

      const pixPtr = canvas.instance.exports.get_active_layer_pixels();
      if (!pixPtr) return { ok: false, error: 'No active layer' };

      const canvasBytes = new Uint8Array(canvas.memory.buffer, pixPtr, cw * ch * 4);
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

      if (canvas.instance.exports.force_composite) {
        canvas.instance.exports.force_composite();
      }

      return { ok: true, msg: `image '${filePath}' loaded (${img.width}x${img.height})` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  sendStroke(x, y, prev_x, prev_y, state, is_eraser, color) {
    const brushActor = this.actorsByName.get(this.activeBrush);
    if (!brushActor) return;

    const strokeBuf = new Uint8Array(28);
    const view = new DataView(strokeBuf.buffer);
    view.setUint32(0, 40 /* MSG_BRUSH_STROKE */, true);
    view.setInt32(4, Math.floor(x), true);
    view.setInt32(8, Math.floor(y), true);
    view.setInt32(12, Math.floor(prev_x), true);
    view.setInt32(16, Math.floor(prev_y), true);
    view.setUint32(20, (color !== undefined) ? color : this.currentColor, true);
    strokeBuf[24] = state;
    strokeBuf[25] = is_eraser ? 1 : 0;
    strokeBuf[26] = 255;
    strokeBuf[27] = 0;

    brushActor.receiveMessage(ACTOR_CANVAS, strokeBuf);
  }

  dispatch(fromId, targetId, buffer) {
    if (buffer.length >= 4) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const type = view.getUint32(0, true);

      if (type === 0x100) {
        const topicBytes = buffer.subarray(4, 36);
        let topic = '';
        for (let i = 0; i < 32 && topicBytes[i] !== 0; i++) topic += String.fromCharCode(topicBytes[i]);
        this.publish(fromId, topic, buffer);
        return;
      }

      if (type === 1 /* MSG_SET_COLOR */) {
        this.currentColor = view.getUint32(4, true);
      }

      if (type === 3 /* MSG_SET_TOOL */) {
        this.currentTool = view.getUint32(4, true);
      }

      if (type === 42 /* MSG_SET_ACTIVE_BRUSH */) {
        let name = '';
        for (let i = 0; i < 20; i++) {
          const c = view.getUint8(4 + i);
          if (c === 0) break;
          name += String.fromCharCode(c);
        }
        if (this.actorsByName.has(name)) {
          this.activeBrush = name;
          console.log(`[Broker] Active brush switched to '${name}'`);
        } else {
          console.warn(`[Broker] Brush '${name}' not found`);
        }
        return;
      }

      if (type === MSG_BRUSH_SET_PARAM) {
        const paramId = view.getUint32(4, true);
        const val = view.getFloat32(8, true);
        const paramNames = ['', 'size', 'opacity', 'hardness', 'flow', 'spacing', 'angle', 'roundness', 'scatter', 'tolerance', 'density', 'wetness', 'grain', 'texture_mode', 'texture_scale', 'texture_strength'];
        if (paramNames[paramId]) {
          this.brushParams[paramNames[paramId]] = val;
        }
        for (const actor of this.actorsByName.values()) {
          actor.receiveMessage(fromId, buffer);
        }
        return;
      }


      if (type === 50 /* MSG_TEXTURE_SET_ACTIVE */) {
        let name = '';
        for (let i = 0; i < 24; i++) {
          const c = view.getUint8(4 + i);
          if (c === 0) break;
          name += String.fromCharCode(c);
        }
        if (this.textures.has(name)) {
          this.activeTexture = name;
          this.sendConsoleLog(`ok: active texture set to '${name}'`, 0xFF00FF88);
        } else {
          this.sendConsoleLog(`err: texture '${name}' not found`, 0xFFFF5555);
        }
        return;
      }

      if (type === 51 /* MSG_LAYER_TO_TEXTURE */) {
        const layerIdx = view.getInt32(4, true);
        let name = '';
        for (let i = 0; i < 24; i++) {
          const c = view.getUint8(8 + i);
          if (c === 0) break;
          name += String.fromCharCode(c);
        }
        if (!name) name = `layer_${Date.now() % 1000}`;
        const ok = this.convertLayerToTexture(layerIdx, name);
        if (ok) {
          this.sendConsoleLog(`ok: layer converted to texture '${name}'`, 0xFF00FF88);
        } else {
          this.sendConsoleLog(`err: failed converting layer to texture`, 0xFFFF5555);
        }
        return;
      }

      if (type === 61 /* MSG_SAVE_IMAGE */) {
        const target = view.getInt32(4, true);
        let filePath = '';
        for (let i = 0; i < 64; i++) {
          const c = view.getUint8(8 + i);
          if (c === 0) break;
          filePath += String.fromCharCode(c);
        }
        const res = this.saveCanvasOrLayer(filePath, target);
        if (res.ok) {
          this.sendConsoleLog(`ok: image saved to '${res.path}'`, 0xFF00FF88);
        } else {
          this.sendConsoleLog(`err: failed saving image: ${res.error}`, 0xFFFF5555);
        }
        return;
      }

      if (type === 60 /* MSG_LOAD_IMAGE */) {
        const target = view.getInt32(4, true);
        let filePath = '';
        for (let i = 0; i < 64; i++) {
          const c = view.getUint8(8 + i);
          if (c === 0) break;
          filePath += String.fromCharCode(c);
        }
        let texName = '';
        for (let i = 0; i < 24; i++) {
          const c = view.getUint8(72 + i);
          if (c === 0) break;
          texName += String.fromCharCode(c);
        }
        const res = this.loadImageFromFile(filePath, target, texName);
        if (res.ok) {
          this.sendConsoleLog(`ok: ${res.msg}`, 0xFF00FF88);
        } else {
          this.sendConsoleLog(`err: ${res.error}`, 0xFFFF5555);
        }
        return;
      }

      if (type === 30 /* MSG_APPLY_FILTER */) {
        let name = '';
        for (let i = 0; i < 20; i++) {
          const c = view.getUint8(4 + i);
          if (c === 0) break;
          name += String.fromCharCode(c);
        }

        const filterActor = this.actorsByName.get(name);
        if (filterActor) {
          filterActor.receiveMessage(fromId, buffer);
          console.log(`[Broker] Dispatched MSG_APPLY_FILTER to actor '${name}'`);
        } else {
          console.warn(`[Broker] Filter actor '${name}' not found`);
        }
        return;
      }
    }

    if (targetId === ACTOR_CANVAS) {
      const canvas = this.actors.get(ACTOR_CANVAS);
      if (canvas) canvas.receiveMessage(fromId, buffer);

      // Forward all state changes to HUD actors so status stays synchronized
      for (const [id, actor] of this.actors.entries()) {
        if (id !== fromId && id !== ACTOR_CANVAS) {
          actor.receiveMessage(fromId, buffer);
        }
      }
      return;
    }

    const target = this.actors.get(targetId);
    if (target) {
      target.receiveMessage(fromId, buffer);
    }
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

// Math S-Expression & Arithmetic Evaluator
function evaluateMath(expr) {
  expr = expr.trim();
  if (expr.startsWith('(') && expr.endsWith(')')) {
    // S-Expression
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

function formatCanvasesList(canvasActor) {
  const count = canvasActor.instance.exports.get_canvas_count();
  const active = canvasActor.instance.exports.get_active_canvas();
  let out = `\x1b[1mCanvases (${count}):\x1b[0m\n`;
  for (let i = 0; i < count; i++) {
    const namePtr = canvasActor.instance.exports.get_canvas_name ? canvasActor.instance.exports.get_canvas_name(i) : 0;
    const name = canvasActor.readString(namePtr) || `canvas_${i}`;
    const marker = (i === active) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
    const w = (i === active) ? canvasActor.instance.exports.get_canvas_width() : '';
    const h = (i === active) ? canvasActor.instance.exports.get_canvas_height() : '';
    const dim = (w && h) ? ` (${w}x${h})` : '';
    out += `  ${marker} [${i}] "${name}"${dim}\n`;
  }
  return out;
}

function formatLayersList(canvasActor) {
  const count = canvasActor.instance.exports.get_layer_count();
  const active = canvasActor.instance.exports.get_active_layer();
  let out = `\x1b[1mLayers (${count}):\x1b[0m\n`;
  for (let i = 0; i < count; i++) {
    const vis = canvasActor.instance.exports.get_layer_visible ? canvasActor.instance.exports.get_layer_visible(i) : 1;
    const op = canvasActor.instance.exports.get_layer_opacity ? canvasActor.instance.exports.get_layer_opacity(i) : 255;
    const opPct = Math.round((op / 255) * 100);
    const marker = (i === active) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
    out += `  ${marker} [${i}] ${vis ? 'visible' : 'HIDDEN'} - opacity: ${opPct}%\n`;
  }
  return out;
}

function formatBrushesList(broker) {
  let out = `\x1b[1mBrushes:\x1b[0m\n`;
  for (const [name, actor] of broker.actorsByName.entries()) {
    if (actor.id >= 11 && actor.wasmPath.includes('brushes/')) {
      const marker = (name === broker.activeBrush) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
      out += `  ${marker} ${name}\n`;
    }
  }
  return out;
}

function formatTexturesList(broker) {
  let out = `\x1b[1mTextures (${broker.textures.size}):\x1b[0m\n`;
  for (const [name, tex] of broker.textures.entries()) {
    const marker = (name === broker.activeTexture) ? '\x1b[32m* [ACTIVE]\x1b[0m' : ' ';
    out += `  ${marker} "${name}" (${tex.width}x${tex.height})\n`;
  }
  return out;
}

function formatFiltersList(broker) {
  let out = `\x1b[1mFilters:\x1b[0m\n`;
  for (const [name, actor] of broker.actorsByName.entries()) {
    if (actor.id >= 11 && actor.wasmPath.includes('filters/')) {
      out += `  - ${name}\n`;
    }
  }
  return out;
}

function setupRepl(broker, canvasActor) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36mwesenho>\x1b[0m '
  });

  broker.setReadline(rl);

  console.log('\x1b[1;32m=== Wesenho Interactive Console Ready ===\x1b[0m');
  console.log('Type \x1b[33mhelp\x1b[0m for command list. Mouse: Left=Draw, Right=Erase, Middle=Pan, Wheel=Zoom\n');
  rl.prompt();

  rl.on('line', (line) => {
    const raw = line.trim();
    if (!raw) {
      rl.prompt();
      return;
    }

    // Check S-expression or arithmetic first if begins with '(' or math operator
    if (raw.startsWith('(') || (/^[\d+\-*/]/.test(raw) && (raw.includes('+') || raw.includes('*') || raw.includes('/')))) {
      const val = evaluateMath(raw);
      if (!isNaN(val)) {
        console.log(`\x1b[35m=> ${val}\x1b[0m`);
        rl.prompt();
        return;
      }
    }

    const tokens = [];
    const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      tokens.push(match[1] || match[2] || match[0]);
    }

    if (tokens.length === 0) {
      rl.prompt();
      return;
    }

    const cmd = tokens[0].toLowerCase();

    // 1. HELP
    if (cmd === 'help') {
      console.log(`
\x1b[1mAvailable Commands:\x1b[0m
  \x1b[36mInspect & Query (list / get):\x1b[0m
    list [canvas|layers|brushes|textures|filters]  List all or specific category
    get [canvas|layer|brush|texture|color|tool]    Get all or specific entity property
    get canvas [width|height|size|id|name|count]   Get canvas properties
    get layer [id|count|opacity|visible]           Get layer properties
    get brush [name|size|opacity|hardness|...]     Get brush parameters
    get texture [name|size|count]                  Get texture properties
    get color / get tool / get zoom / get pan      Get current tool/viewport state

  \x1b[36mCanvas Commands:\x1b[0m
    new canvas [name] [width] [height]   Create new canvas doc
    duplicate canvas [name]              Duplicate active canvas
    set canvas <name|id>                 Select active canvas
    set canvas width <w>                 Resize canvas width
    set canvas height <h>                Resize canvas height
    set canvas size <w> <h>              Resize canvas (or: canvas resize <w> <h>)
    delete canvas [name|id]              Delete canvas (defaults to active canvas)
    rename canvas [id] <name>            Rename canvas

  \x1b[36mLayer Commands:\x1b[0m
    new layer [name]                     Add new layer to active canvas
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
    save [canvas|layer] <filename>       Save image (PNG, BMP, PPM)
    load image <filename> [layer|texture [name]] Load image file into canvas or texture

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
      rl.prompt();
      return;
    }

    // 2. UNIFIED LIST COMMANDS
    if (cmd === 'list' || cmd === 'canvases' || cmd === 'layers' || cmd === 'brushes' || cmd === 'textures' || cmd === 'filters') {
      const target = (cmd === 'list') ? (tokens[1] ? tokens[1].toLowerCase() : 'all') : cmd;

      if (target === 'canvas' || target === 'canvases') {
        process.stdout.write(formatCanvasesList(canvasActor));
      } else if (target === 'layer' || target === 'layers') {
        process.stdout.write(formatLayersList(canvasActor));
      } else if (target === 'brush' || target === 'brushes') {
        process.stdout.write(formatBrushesList(broker));
      } else if (target === 'texture' || target === 'textures') {
        process.stdout.write(formatTexturesList(broker));
      } else if (target === 'filter' || target === 'filters') {
        process.stdout.write(formatFiltersList(broker));
      } else if (target === 'all' || target === '') {
        process.stdout.write('\x1b[1;34m=== Wesenho Entities ===\x1b[0m\n\n');
        process.stdout.write(formatCanvasesList(canvasActor) + '\n');
        process.stdout.write(formatLayersList(canvasActor) + '\n');
        process.stdout.write(formatBrushesList(broker) + '\n');
        process.stdout.write(formatTexturesList(broker) + '\n');
        process.stdout.write(formatFiltersList(broker));
      } else {
        console.log(`\x1b[31merr: unknown list category '${tokens[1]}'. Options: canvas, layers, brushes, textures, filters, all\x1b[0m`);
      }
      rl.prompt();
      return;
    }

    // 3. GET COMMANDS
    if (cmd === 'get') {
      const cat = (tokens[1] || '').toLowerCase();
      const prop = (tokens[2] || '').toLowerCase();

      const activeC = canvasActor.instance.exports.get_active_canvas();
      const cCount = canvasActor.instance.exports.get_canvas_count();
      const cw = canvasActor.instance.exports.get_canvas_width();
      const ch = canvasActor.instance.exports.get_canvas_height();
      const cNamePtr = canvasActor.instance.exports.get_canvas_name ? canvasActor.instance.exports.get_canvas_name(activeC) : 0;
      const cName = canvasActor.readString(cNamePtr) || `canvas_${activeC}`;

      const activeL = canvasActor.instance.exports.get_active_layer();
      const lCount = canvasActor.instance.exports.get_layer_count();

      // get canvas ...
      if (cat === 'canvas') {
        if (prop === 'width' || prop === 'w') {
          console.log(cw);
        } else if (prop === 'height' || prop === 'h') {
          console.log(ch);
        } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions') {
          console.log(`${cw}x${ch}`);
        } else if (prop === 'id' || prop === 'idx' || prop === 'index' || prop === 'active') {
          console.log(activeC);
        } else if (prop === 'name') {
          console.log(cName);
        } else if (prop === 'count' || prop === 'total') {
          console.log(cCount);
        } else {
          console.log(`canvas [${activeC}] "${cName}" ${cw}x${ch} (layers: ${lCount}, total canvases: ${cCount})`);
        }
        rl.prompt();
        return;
      }

      // get layer ...
      if (cat === 'layer' || cat === 'layers') {
        const targetId = !isNaN(parseInt(tokens[3] || tokens[2], 10)) ? parseInt(tokens[3] || tokens[2], 10) : activeL;
        const vis = canvasActor.instance.exports.get_layer_visible ? canvasActor.instance.exports.get_layer_visible(targetId) : 1;
        const op = canvasActor.instance.exports.get_layer_opacity ? canvasActor.instance.exports.get_layer_opacity(targetId) : 255;
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
        rl.prompt();
        return;
      }

      // get brush ...
      if (cat === 'brush') {
        if (prop === 'name' || prop === '') {
          console.log(broker.activeBrush);
        } else if (prop === 'params' || prop === 'all') {
          console.log(JSON.stringify(broker.brushParams, null, 2));
        } else if (broker.brushParams[prop] !== undefined) {
          console.log(broker.brushParams[prop]);
        } else {
          console.log(`brush: ${broker.activeBrush} | params: size=${broker.brushParams.size}, opacity=${broker.brushParams.opacity}%, hardness=${broker.brushParams.hardness}%`);
        }
        rl.prompt();
        return;
      }

      // get texture ...
      if (cat === 'texture') {
        const tex = broker.getActiveTexture();
        if (prop === 'name' || prop === '') {
          console.log(broker.activeTexture);
        } else if (prop === 'size' || prop === 'dim' || prop === 'dimensions') {
          console.log(tex ? `${tex.width}x${tex.height}` : 'none');
        } else if (prop === 'count' || prop === 'total') {
          console.log(broker.textures.size);
        } else {
          console.log(`texture: "${broker.activeTexture}" (${tex ? `${tex.width}x${tex.height}` : 'none'}, total: ${broker.textures.size})`);
        }
        rl.prompt();
        return;
      }

      // get color ...
      if (cat === 'color') {
        const c = broker.currentColor;
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
          console.log(`${hex} (ARGB: 0x${c.toString(16).padStart(8, '0')}, rgba(${r}, ${g}, ${b}, ${a / 255}))`);
        }
        rl.prompt();
        return;
      }

      // get tool ...
      if (cat === 'tool') {
        console.log(broker.currentTool === 1 ? 'eraser' : 'brush');
        rl.prompt();
        return;
      }

      // get zoom ...
      if (cat === 'zoom') {
        console.log(`${zoom.toFixed(2)} (${Math.round(zoom * 100)}%)`);
        rl.prompt();
        return;
      }

      // get pan ...
      if (cat === 'pan') {
        console.log(`(${Math.round(panX)}, ${Math.round(panY)})`);
        rl.prompt();
        return;
      }

      // get / get all / status
      if (cat === '' || cat === 'all') {
        console.log(`\x1b[1mActive State:\x1b[0m
  Canvas:  [${activeC}] "${cName}" (${cw}x${ch}) [Total: ${cCount}]
  Layer:   [${activeL}] of ${lCount}
  Brush:   ${broker.activeBrush} (size: ${broker.brushParams.size}, opacity: ${broker.brushParams.opacity}%)
  Texture: "${broker.activeTexture}"
  Color:   0x${broker.currentColor.toString(16).padStart(8, '0')}
  Tool:    ${broker.currentTool === 1 ? 'eraser' : 'brush'}
  Zoom:    ${(zoom * 100).toFixed(0)}% | Pan: (${Math.round(panX)}, ${Math.round(panY)})
`);
        rl.prompt();
        return;
      }

      console.log(`\x1b[31merr: unknown get property '${tokens.slice(1).join(' ')}'\x1b[0m`);
      rl.prompt();
      return;
    }

    // 4. STATUS / INFO
    if (cmd === 'status' || cmd === 'info') {
      const cw = canvasActor.instance.exports.get_canvas_width();
      const ch = canvasActor.instance.exports.get_canvas_height();
      const cCount = canvasActor.instance.exports.get_canvas_count();
      const activeC = canvasActor.instance.exports.get_active_canvas();
      const activeL = canvasActor.instance.exports.get_active_layer();
      const lCount = canvasActor.instance.exports.get_layer_count();
      const cNamePtr = canvasActor.instance.exports.get_canvas_name ? canvasActor.instance.exports.get_canvas_name(activeC) : 0;
      const cName = canvasActor.readString(cNamePtr) || `canvas_${activeC}`;

      console.log(`\x1b[1mStatus:\x1b[0m
  Canvas:  [${activeC}] "${cName}" (${cw}x${ch}) [Total: ${cCount}]
  Layer:   [${activeL}] of ${lCount}
  Brush:   ${broker.activeBrush} (size: ${broker.brushParams.size})
  Texture: "${broker.activeTexture}"
  Color:   0x${broker.currentColor.toString(16).padStart(8, '0')}
  Tool:    ${broker.currentTool === 1 ? 'eraser' : 'brush'}
  Zoom:    ${(zoom * 100).toFixed(0)}% | Pan: (${Math.round(panX)}, ${Math.round(panY)})
`);
      rl.prompt();
      return;
    }

    // 5. EXIT / QUIT
    if (cmd === 'exit' || cmd === 'quit') {
      console.log('Goodbye.');
      process.exit(0);
    }

    // 6. CANVAS COMMANDS
    // new canvas [name] [w] [h]
    if (cmd === 'new' && tokens[1] && tokens[1].toLowerCase() === 'canvas') {
      const cname = tokens[2] || `canvas_${Date.now() % 1000}`;
      const w = parseInt(tokens[3], 10) || DOC_WIDTH;
      const h = parseInt(tokens[4], 10) || DOC_HEIGHT;

      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_CANVAS_NEW, 0);
      buf.writeUInt32LE(w, 4);
      buf.writeUInt32LE(h, 8);
      buf.write(cname.slice(0, 20), 12, 'utf8');
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`new canvas created: '${cname}' (${w}x${h})`);
      rl.prompt();
      return;
    }

    // duplicate canvas [name]
    if (cmd === 'duplicate' && tokens[1] && tokens[1].toLowerCase() === 'canvas') {
      const newName = tokens[2] || '';
      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_CANVAS_DUPLICATE, 0);
      buf.writeInt32LE(-1, 4); // active canvas
      buf.write(newName.slice(0, 23), 8, 'utf8');
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`canvas duplicated ${newName ? `as '${newName}'` : ''}`);
      rl.prompt();
      return;
    }

    // set canvas <name|id> | set canvas width <w> | set canvas height <h> | set canvas size <w> <h>
    if (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'canvas') {
      const sub = (tokens[2] || '').toLowerCase();
      if (sub === 'width' && tokens[3]) {
        const w = parseInt(tokens[3], 10);
        const h = canvasActor.instance.exports.get_canvas_height();
        if (w >= 16 && w <= 4096) {
          const buf = Buffer.alloc(12);
          buf.writeUInt32LE(MSG_CANVAS_RESIZE, 0);
          buf.writeUInt32LE(w, 4);
          buf.writeUInt32LE(h, 8);
          canvasActor.receiveMessage(ACTOR_BROKER, buf);
          broker.sendConsoleLog(`canvas width updated to ${w}`);
        }
        rl.prompt();
        return;
      } else if (sub === 'height' && tokens[3]) {
        const w = canvasActor.instance.exports.get_canvas_width();
        const h = parseInt(tokens[3], 10);
        if (h >= 16 && h <= 4096) {
          const buf = Buffer.alloc(12);
          buf.writeUInt32LE(MSG_CANVAS_RESIZE, 0);
          buf.writeUInt32LE(w, 4);
          buf.writeUInt32LE(h, 8);
          canvasActor.receiveMessage(ACTOR_BROKER, buf);
          broker.sendConsoleLog(`canvas height updated to ${h}`);
        }
        rl.prompt();
        return;
      } else if (sub === 'size' && tokens[3] && tokens[4]) {
        const w = parseInt(tokens[3], 10);
        const h = parseInt(tokens[4], 10);
        if (w >= 16 && h >= 16) {
          const buf = Buffer.alloc(12);
          buf.writeUInt32LE(MSG_CANVAS_RESIZE, 0);
          buf.writeUInt32LE(w, 4);
          buf.writeUInt32LE(h, 8);
          canvasActor.receiveMessage(ACTOR_BROKER, buf);
          broker.sendConsoleLog(`canvas resized to ${w}x${h}`);
        }
        rl.prompt();
        return;
      } else if (tokens[2]) {
        const target = tokens[2];
        const id = parseInt(target, 10);
        const buf = Buffer.alloc(32);
        buf.writeUInt32LE(MSG_CANVAS_SELECT, 0);
        buf.writeInt32LE(!isNaN(id) ? id : -1, 4);
        buf.write(target.slice(0, 23), 8, 'utf8');
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`selected canvas '${target}'`);
        rl.prompt();
        return;
      }
    }

    // select canvas <name|id>
    if ((cmd === 'select' && tokens[1] && tokens[1].toLowerCase() === 'canvas') ||
        (cmd === 'canvas' && tokens[1] && !['list', 'resize'].includes(tokens[1].toLowerCase()))) {
      const target = (cmd === 'select') ? tokens[2] : tokens[1];
      const id = parseInt(target, 10);
      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_CANVAS_SELECT, 0);
      buf.writeInt32LE(!isNaN(id) ? id : -1, 4);
      buf.write(target.slice(0, 23), 8, 'utf8');
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`selected canvas '${target}'`);
      rl.prompt();
      return;
    }

    // delete canvas [name|id] -> defaults to active canvas if no argument given
    if ((cmd === 'delete' || cmd === 'remove') && tokens[1] && tokens[1].toLowerCase() === 'canvas') {
      const target = tokens[2] || '';
      const id = target ? parseInt(target, 10) : -1;
      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_CANVAS_DELETE, 0);
      buf.writeInt32LE(!isNaN(id) ? id : -1, 4);
      buf.write(target.slice(0, 23), 8, 'utf8');
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`deleted canvas ${target ? `'${target}'` : '(active)'}`);
      rl.prompt();
      return;
    }

    // canvas resize <w> <h>
    if (cmd === 'canvas' && tokens[1] && tokens[1].toLowerCase() === 'resize' && tokens[2] && tokens[3]) {
      const w = parseInt(tokens[2], 10);
      const h = parseInt(tokens[3], 10);
      if (w >= 16 && h >= 16) {
        const buf = Buffer.alloc(12);
        buf.writeUInt32LE(MSG_CANVAS_RESIZE, 0);
        buf.writeUInt32LE(w, 4);
        buf.writeUInt32LE(h, 8);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`canvas resized to ${w}x${h}`);
      }
      rl.prompt();
      return;
    }

    // rename canvas [id] <new_name>
    if (cmd === 'rename' && tokens[1] && tokens[1].toLowerCase() === 'canvas') {
      const newName = tokens[3] ? tokens[3] : tokens[2];
      const targetId = tokens[3] ? parseInt(tokens[2], 10) : -1;
      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_CANVAS_RENAME, 0);
      buf.writeInt32LE(targetId, 4);
      buf.write(newName.slice(0, 23), 8, 'utf8');
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`canvas renamed to '${newName}'`);
      rl.prompt();
      return;
    }

    // 7. LAYER COMMANDS
    // new layer [name]
    if (cmd === 'new' && tokens[1] && tokens[1].toLowerCase() === 'layer') {
      const buf = Buffer.alloc(16);
      buf.writeUInt32LE(MSG_LAYER_ADD, 0);
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog('new layer added');
      rl.prompt();
      return;
    }

    // select layer <id> / set layer <id> / layer <id>
    if (((cmd === 'select' || cmd === 'set') && tokens[1] && tokens[1].toLowerCase() === 'layer' && tokens[2]) ||
        (cmd === 'layer' && tokens[1] && !isNaN(parseInt(tokens[1], 10)))) {
      const id = parseInt(cmd === 'layer' ? tokens[1] : tokens[2], 10);
      const buf = Buffer.alloc(16);
      buf.writeUInt32LE(MSG_LAYER_SELECT, 0);
      buf.writeInt32LE(id, 4);
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`selected layer [${id}]`);
      rl.prompt();
      return;
    }

    // delete layer [id]
    if ((cmd === 'delete' || cmd === 'remove') && tokens[1] && tokens[1].toLowerCase() === 'layer') {
      const id = tokens[2] ? parseInt(tokens[2], 10) : canvasActor.instance.exports.get_active_layer();
      const buf = Buffer.alloc(16);
      buf.writeUInt32LE(MSG_LAYER_DELETE, 0);
      buf.writeInt32LE(id, 4);
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`deleted layer [${id}]`);
      rl.prompt();
      return;
    }

    // toggle layer <id> / hide layer <id> / show layer <id>
    if ((cmd === 'toggle' || cmd === 'hide' || cmd === 'show') && tokens[1] && tokens[1].toLowerCase() === 'layer') {
      const id = tokens[2] ? parseInt(tokens[2], 10) : canvasActor.instance.exports.get_active_layer();
      const buf = Buffer.alloc(16);
      buf.writeUInt32LE(MSG_LAYER_TOGGLE_VIS, 0);
      buf.writeInt32LE(id, 4);
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`toggled layer [${id}] visibility`);
      rl.prompt();
      return;
    }

    // opacity layer <id> <0..100> / set layer opacity <0..100>
    if ((cmd === 'opacity' && tokens[1] && tokens[1].toLowerCase() === 'layer') ||
        (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'layer' && tokens[2] && tokens[2].toLowerCase() === 'opacity')) {
      const id = (cmd === 'opacity') ? parseInt(tokens[2], 10) : canvasActor.instance.exports.get_active_layer();
      const val = parseInt((cmd === 'opacity') ? tokens[3] : tokens[3], 10);
      if (!isNaN(val)) {
        const buf = Buffer.alloc(16);
        buf.writeUInt32LE(MSG_LAYER_SET_OPACITY, 0);
        buf.writeInt32LE(id, 4);
        buf.writeInt32LE(Math.max(0, Math.min(100, val)), 8);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`set layer [${id}] opacity to ${val}%`);
      }
      rl.prompt();
      return;
    }

    // clear layer / clear
    if (cmd === 'clear' || (cmd === 'clear' && tokens[1] && tokens[1].toLowerCase() === 'layer')) {
      const buf = Buffer.alloc(16);
      buf.writeUInt32LE(MSG_EFFECT_CLEAR, 0);
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog('active layer cleared');
      rl.prompt();
      return;
    }

    // 8. BRUSH COMMANDS
    // set brush <name> | set brush <param> <value>
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
        broker.brushParams[sub] = paramVal;
        const buf = Buffer.alloc(16);
        buf.writeUInt32LE(MSG_BRUSH_SET_PARAM, 0);
        buf.writeUInt32LE(paramId, 4);
        buf.writeFloatLE(paramVal, 8);
        broker.dispatch(ACTOR_BROKER, 0, buf);
        broker.sendConsoleLog(`brush ${sub} set to ${val}`);
        rl.prompt();
        return;
      } else {
        const buf = Buffer.alloc(24);
        buf.writeUInt32LE(MSG_SET_ACTIVE_BRUSH, 0);
        buf.write(sub.slice(0, 19), 4, 'utf8');
        broker.dispatch(ACTOR_BROKER, 0, buf);
        rl.prompt();
        return;
      }
    }

    // 9. TEXTURE COMMANDS
    // set texture <name>
    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'texture') || (cmd === 'texture' && tokens[1])) {
      const tname = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      const buf = Buffer.alloc(28);
      buf.writeUInt32LE(MSG_TEXTURE_SET_ACTIVE, 0);
      buf.write(tname.slice(0, 23), 4, 'utf8');
      broker.dispatch(ACTOR_BROKER, 0, buf);
      rl.prompt();
      return;
    }

    // layer to texture [name] / layer-to-texture [name]
    if ((cmd === 'layer' && tokens[1] && tokens[1].toLowerCase() === 'to' && tokens[2] && tokens[2].toLowerCase() === 'texture') ||
        cmd === 'layer-to-texture' || cmd === 'layertotexture') {
      const tname = (cmd === 'layer' ? tokens[3] : tokens[1]) || `layer_${Date.now() % 1000}`;
      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_LAYER_TO_TEXTURE, 0);
      buf.writeInt32LE(-1, 4);
      buf.write(tname.slice(0, 23), 8, 'utf8');
      broker.dispatch(ACTOR_BROKER, 0, buf);
      rl.prompt();
      return;
    }

    // 10. FILTER COMMANDS
    // filter <name> [param1] [param2]
    if (cmd === 'filter' && tokens[1]) {
      const fname = tokens[1].toLowerCase();
      const p1 = parseInt(tokens[2], 10) || 0;
      const p2 = parseInt(tokens[3], 10) || 0;
      const buf = Buffer.alloc(32);
      buf.writeUInt32LE(MSG_APPLY_FILTER, 0);
      buf.write(fname.slice(0, 19), 4, 'utf8');
      buf.writeInt32LE(p1, 24);
      buf.writeInt32LE(p2, 28);
      broker.dispatch(ACTOR_BROKER, 0, buf);
      rl.prompt();
      return;
    }

    // 11. IMAGE I/O COMMANDS
    // save [canvas|layer] <filename>
    if (cmd === 'save' && tokens[1]) {
      let target = 0; // 0 = canvas, 1 = layer
      let filePath = tokens[1];
      if (tokens[1].toLowerCase() === 'canvas' && tokens[2]) {
        target = 0;
        filePath = tokens[2];
      } else if (tokens[1].toLowerCase() === 'layer' && tokens[2]) {
        target = 1;
        filePath = tokens[2];
      }

      const buf = Buffer.alloc(72);
      buf.writeUInt32LE(MSG_SAVE_IMAGE, 0);
      buf.writeInt32LE(target, 4);
      buf.write(filePath.slice(0, 63), 8, 'utf8');
      broker.dispatch(ACTOR_BROKER, 0, buf);
      rl.prompt();
      return;
    }

    // load image <filename> [layer|texture [name]]
    if (cmd === 'load' && tokens[1] && tokens[1].toLowerCase() === 'image' && tokens[2]) {
      const filePath = tokens[2];
      let target = 0; // 0 = active layer, 1 = new layer, 2 = texture
      let texName = '';

      if (tokens[3]) {
        const opt = tokens[3].toLowerCase();
        if (opt === 'layer' || opt === 'newlayer') target = 1;
        else if (opt === 'texture') {
          target = 2;
          texName = tokens[4] || '';
        }
      }

      const buf = Buffer.alloc(96);
      buf.writeUInt32LE(MSG_LOAD_IMAGE, 0);
      buf.writeInt32LE(target, 4);
      buf.write(filePath.slice(0, 63), 8, 'utf8');
      buf.write(texName.slice(0, 23), 72, 'utf8');
      broker.dispatch(ACTOR_BROKER, 0, buf);
      rl.prompt();
      return;
    }

    // 12. COLOR & TOOL COMMANDS
    // set color <val>
    if (cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'color' && tokens[2]) {
      const colStr = tokens.slice(2).join(' ');
      const parsed = parseColorString(colStr);
      if (parsed !== null) {
        broker.currentColor = parsed;
        const buf = Buffer.alloc(8);
        buf.writeUInt32LE(MSG_SET_COLOR, 0);
        buf.writeUInt32LE(parsed, 4);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`color set to 0x${parsed.toString(16).padStart(8, '0')}`);
      } else {
        broker.sendConsoleLog(`err: unknown color '${colStr}'`, 0xFFFF5555);
      }
      rl.prompt();
      return;
    }

    // set tool <brush|eraser>
    if ((cmd === 'set' && tokens[1] && tokens[1].toLowerCase() === 'tool' && tokens[2]) ||
        (cmd === 'tool' && tokens[1])) {
      const t = (cmd === 'set' ? tokens[2] : tokens[1]).toLowerCase();
      broker.currentTool = (t === 'eraser' || t === 'erase') ? 1 : 0;
      const buf = Buffer.alloc(8);
      buf.writeUInt32LE(MSG_SET_TOOL, 0);
      buf.writeUInt32LE(broker.currentTool, 4);
      canvasActor.receiveMessage(ACTOR_BROKER, buf);
      broker.sendConsoleLog(`tool set to ${broker.currentTool === 1 ? 'eraser' : 'brush'}`);
      rl.prompt();
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
        const buf = Buffer.alloc(12);
        buf.writeUInt32LE(MSG_DRAW_LINE, 0);
        buf.writeUInt16LE(y0, 4);
        buf.writeUInt16LE(x0, 6);
        buf.writeUInt16LE(y1, 8);
        buf.writeUInt16LE(x1, 10);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`drew line from (${x0},${y0}) to (${x1},${y1})`);
        rl.prompt();
        return;
      }
      if (shape === 'rect' && tokens.length >= 6) {
        const x = parseInt(tokens[2], 10);
        const y = parseInt(tokens[3], 10);
        const w = parseInt(tokens[4], 10);
        const h = parseInt(tokens[5], 10);
        const buf = Buffer.alloc(12);
        buf.writeUInt32LE(MSG_DRAW_RECT, 0);
        buf.writeUInt16LE(y, 4);
        buf.writeUInt16LE(x, 6);
        buf.writeUInt16LE(h, 8);
        buf.writeUInt16LE(w, 10);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`drew rect at (${x},${y}) size ${w}x${h}`);
        rl.prompt();
        return;
      }
      if (shape === 'circle' && tokens.length >= 5) {
        const cx = parseInt(tokens[2], 10);
        const cy = parseInt(tokens[3], 10);
        const r = parseInt(tokens[4], 10);
        const buf = Buffer.alloc(12);
        buf.writeUInt32LE(MSG_DRAW_CIRCLE, 0);
        buf.writeUInt16LE(cy, 4);
        buf.writeUInt16LE(cx, 6);
        buf.writeUInt32LE(r, 8);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`drew circle at (${cx},${cy}) radius ${r}`);
        rl.prompt();
        return;
      }
      if (shape === 'grid' && tokens.length >= 3) {
        const step = parseInt(tokens[2], 10);
        const buf = Buffer.alloc(8);
        buf.writeUInt32LE(MSG_DRAW_GRID, 0);
        buf.writeUInt32LE(step, 4);
        canvasActor.receiveMessage(ACTOR_BROKER, buf);
        broker.sendConsoleLog(`drew grid with step ${step}`);
        rl.prompt();
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
      rl.prompt();
      return;
    }

    console.log(`\x1b[31merr: unknown command '${raw}'. Type 'help' for commands.\x1b[0m`);
    rl.prompt();
  });
}


async function main() {
  const broker = new WesenhoBroker();

  const canvasActor = new WasmActor(
    ACTOR_CANVAS,
    'canvas',
    path.resolve(__dirname, '../roms/canvas.wasm'),
    broker
  );
  broker.register(canvasActor);
  await canvasActor.init();
  canvasActor.update(); // Initialize default canvas doc

  const moduleConfigs = discoverModules(path.resolve(__dirname, '..'));

  for (const mod of moduleConfigs) {
    const fullPath = path.resolve(__dirname, '..', mod.wasmPath);
    if (!fs.existsSync(fullPath)) continue;

    const actor = new WasmActor(mod.id, mod.name, fullPath, broker);
    broker.register(actor);
    await actor.init();
  }

  // Pure canvas SDL window (mouse navigation & drawing)
  const window = sdl.video.createWindow({
    title: 'wesenho',
    width: windowWidth,
    height: windowHeight,
    resizable: true
  });

  let screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  let mouseState = { x: 0, y: 0, buttons: 0 };
  let isDrawingOnCanvas = false;
  let strokePrevX = -1;
  let strokePrevY = -1;

  window.on('resize', (e) => {
    windowWidth = e.width;
    windowHeight = e.height;
    screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  });

  window.on('mouseMove', (e) => {
    mouseState.x = e.x;
    mouseState.y = e.y;

    if (isPanning) {
      panX += (e.x - panStartX);
      panY += (e.y - panStartY);
      panStartX = e.x;
      panStartY = e.y;
    } else if (isDrawingOnCanvas && (mouseState.buttons & 3)) {
      const docX = (mouseState.x - panX) / zoom;
      const docY = (mouseState.y - panY) / zoom;
      const isEraser = (mouseState.buttons & 2) ? 1 : (broker.currentTool === 1 ? 1 : 0);
      broker.sendStroke(docX, docY, strokePrevX, strokePrevY, 1 /* STROKE_MOVE */, isEraser, broker.currentColor);
      strokePrevX = docX;
      strokePrevY = docY;
    }
  });

  window.on('mouseButtonDown', (e) => {
    if (e.button === 1) mouseState.buttons |= 1;
    else if (e.button === 3) mouseState.buttons |= 2;
    else if (e.button === 2) mouseState.buttons |= 4;

    if (e.button === 2) {
      // Middle click: pan
      isPanning = true;
      panStartX = mouseState.x;
      panStartY = mouseState.y;
    } else if ((e.button === 1 || e.button === 3) && !isPanning) {
      // Left click (draw) or Right click (erase)
      isDrawingOnCanvas = true;
      const docX = (mouseState.x - panX) / zoom;
      const docY = (mouseState.y - panY) / zoom;
      strokePrevX = docX;
      strokePrevY = docY;
      const isEraser = (e.button === 3) ? 1 : (broker.currentTool === 1 ? 1 : 0);
      broker.sendStroke(docX, docY, docX, docY, 0 /* STROKE_START */, isEraser, broker.currentColor);
    }
  });

  window.on('mouseButtonUp', (e) => {
    if (e.button === 1) {
      mouseState.buttons &= ~1;
    } else if (e.button === 3) {
      mouseState.buttons &= ~2;
    } else if (e.button === 2) {
      mouseState.buttons &= ~4;
      isPanning = false;
    }

    if ((mouseState.buttons & 3) === 0) {
      if (isDrawingOnCanvas) {
        const isEraser = (broker.currentTool === 1);
        broker.sendStroke(strokePrevX, strokePrevY, strokePrevX, strokePrevY, 2 /* STROKE_END */, isEraser, broker.currentColor);
      }
      isDrawingOnCanvas = false;
      strokePrevX = -1;
      strokePrevY = -1;
    }
  });

  window.on('mouseWheel', (e) => {
    const oldZoom = zoom;
    const factor = e.dy > 0 ? 1.15 : 0.85;
    zoom = Math.max(0.1, Math.min(10.0, zoom * factor));

    const mx = mouseState.x;
    const my = mouseState.y;
    panX = mx - (mx - panX) * (zoom / oldZoom);
    panY = my - (my - panY) * (zoom / oldZoom);
  });

  window.on('close', () => process.exit(0));

  // Initialize REPL in the terminal
  setupRepl(broker, canvasActor);

  const frameLoop = () => {
    canvasActor.update();

    screenBuffer.fill(0x18);

    const canvasPixels = canvasActor.getPixels();
    if (canvasPixels) {
      const docW = canvasActor.width || DOC_WIDTH;
      const docH = canvasActor.height || DOC_HEIGHT;
      const screenStartX = Math.max(0, Math.floor(panX));
      const screenStartY = Math.max(0, Math.floor(panY));
      const screenEndX = Math.min(windowWidth, Math.ceil(panX + docW * zoom));
      const screenEndY = Math.min(windowHeight, Math.ceil(panY + docH * zoom));

      const invZoom = 1 / zoom;

      for (let sy = screenStartY; sy < screenEndY; sy++) {
        const dy = Math.floor((sy - panY) * invZoom);
        if (dy < 0 || dy >= docH) continue;

        const docRowOffset = dy * docW * 4;
        const screenRowOffset = sy * windowWidth * 4;

        for (let sx = screenStartX; sx < screenEndX; sx++) {
          const dx = Math.floor((sx - panX) * invZoom);
          if (dx < 0 || dx >= docW) continue;

          const docPixelOffset = docRowOffset + dx * 4;
          const screenPixelOffset = screenRowOffset + sx * 4;

          screenBuffer[screenPixelOffset + 0] = canvasPixels[docPixelOffset + 0];
          screenBuffer[screenPixelOffset + 1] = canvasPixels[docPixelOffset + 1];
          screenBuffer[screenPixelOffset + 2] = canvasPixels[docPixelOffset + 2];
          screenBuffer[screenPixelOffset + 3] = 0xFF;
        }
      }
    }

    window.render(windowWidth, windowHeight, windowWidth * 4, 'rgba32', screenBuffer);
    setTimeout(frameLoop, 16);
  };

  frameLoop();
}

main().catch(console.error);

