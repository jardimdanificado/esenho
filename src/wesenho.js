const sdl = require('@kmamal/sdl');
const fs = require('fs');
const path = require('path');

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

const ACTOR_BROKER = 0;
const ACTOR_CANVAS = 1;

// USB HID Scancode mapping
const KEY_MAP = {
  a: 0x04, b: 0x05, c: 0x06, d: 0x07, e: 0x08, f: 0x09, g: 0x0A,
  h: 0x0B, i: 0x0C, j: 0x0D, k: 0x0E, l: 0x0F, m: 0x10, n: 0x11,
  o: 0x12, p: 0x13, q: 0x14, r: 0x15, s: 0x16, t: 0x17, u: 0x18,
  v: 0x19, w: 0x1A, x: 0x1B, y: 0x1C, z: 0x1D,
  '1': 0x1E, '2': 0x1F, '3': 0x20, '4': 0x21, '5': 0x22,
  '6': 0x23, '7': 0x24, '8': 0x25, '9': 0x26, '0': 0x27,
  return: 0x28, enter: 0x28, escape: 0x29, backspace: 0x2A, tab: 0x2B, space: 0x2C,
  '-': 0x2D, '_': 0x2D, '=': 0x2E, '+': 0x2E,
  '[': 0x2F, '{': 0x2F, ']': 0x30, '}': 0x30,
  '\\': 0x31, '|': 0x31, ';': 0x33, ':': 0x33,
  '\'': 0x34, '"': 0x34, '`': 0x35, '~': 0x35,
  ',': 0x36, '<': 0x36, '.': 0x37, '>': 0x37,
  '/': 0x38, '?': 0x38,
  up: 0x52, down: 0x51, left: 0x50, right: 0x4F,
  leftShift: 0xE1, rightShift: 0xE5,
  leftCtrl: 0xE0, rightCtrl: 0xE4,
  leftAlt: 0xE2, rightAlt: 0xE6
};

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
    const dest = new Uint8Array(this.memory.buffer, 0, buffer.length);
    dest.set(buffer);
    this.instance.exports.on_message(fromId, buffer.length);
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

    if (this.instance.exports.__heap_base) {
      this.arenaOffset = (this.instance.exports.__heap_base.value + 65535) & ~65535;
    } else {
      this.arenaOffset = 0x2000000;
    }
  }

  update() {
    if (this.instance && this.instance.exports.update) {
      this.instance.exports.update();
      this.syncDimensions();
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
    this.topics = new Map();
  }

  register(actor) {
    this.actors.set(actor.id, actor);
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

  dispatch(fromId, targetId, buffer) {
    if (buffer.length >= 4) {
      const type = new Uint32Array(buffer.buffer, buffer.byteOffset, 1)[0];
      if (type === 0x100) {
        const topicBytes = buffer.subarray(4, 36);
        let topic = '';
        for (let i = 0; i < 32 && topicBytes[i] !== 0; i++) topic += String.fromCharCode(topicBytes[i]);
        this.publish(fromId, topic, buffer);
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
  let nextId = 10;

  modules.push(
    { id: 2, name: 'tools', x: 20, y: 20, wasmPath: 'roms/tools.wasm' },
    { id: 3, name: 'palette', x: 20, y: 175, wasmPath: 'roms/palette.wasm' },
    { id: 4, name: 'layers', x: windowWidth - 170, y: 20, wasmPath: 'roms/layers.wasm' }
  );

  const pluginsDir = path.resolve(baseDir, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    const subdirs = ['uis', 'brushes', 'filters'];
    let pluginSlot = 0;
    for (const sub of subdirs) {
      const dir = path.join(pluginsDir, sub);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).sort();
      for (const f of files) {
        if (f.endsWith('.wasm')) {
          const modPath = path.relative(baseDir, path.join(dir, f));
          let posX = 185;
          let posY = 20;
          if (f.includes('console')) { posX = 185; posY = 20; }
          pluginSlot++;

          modules.push({
            id: nextId++,
            name: path.basename(f, '.wasm'),
            x: posX,
            y: posY,
            wasmPath: modPath
          });
        }
      }
    }
  }

  return modules;
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
  canvasActor.update(); // read dimensions from wasm

  const moduleConfigs = discoverModules(path.resolve(__dirname, '..'));
  const uiActors = [];

  for (const win of moduleConfigs) {
    const fullPath = path.resolve(__dirname, '..', win.wasmPath);
    if (!fs.existsSync(fullPath)) continue;

    const actor = new WasmActor(win.id, win.name, fullPath, broker);
    broker.register(actor);
    await actor.init();
    actor.update(); // initial frame to set dimensions from Wasm struct
    uiActors.push({ win, actor });
    console.log(`[Plugin Loaded] ${win.name} (ID: ${win.id}) -> ${win.wasmPath} (${actor.width}x${actor.height})`);
  }

  const window = sdl.video.createWindow({
    title: 'Wesenho Studio — Sistema Extensivel por Plugins & Microkernel Piolho',
    width: windowWidth,
    height: windowHeight,
    resizable: true
  });

  let screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  let mouseState = { x: 0, y: 0, buttons: 0, wheel_y: 0 };
  let isDrawingOnCanvas = false;
  let spaceDown = false;
  let dragWin = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const globalKeys = new Uint8Array(256);

  window.on('resize', (e) => {
    windowWidth = e.width;
    windowHeight = e.height;
    screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  });

  window.on('mouseMove', (e) => {
    mouseState.x = e.x;
    mouseState.y = e.y;

    if (dragWin) {
      dragWin.win.x = Math.max(0, Math.min(windowWidth - dragWin.actor.width, e.x - dragOffsetX));
      dragWin.win.y = Math.max(0, Math.min(windowHeight - dragWin.actor.height, e.y - dragOffsetY));
    } else if (isPanning) {
      panX += (e.x - panStartX);
      panY += (e.y - panStartY);
      panStartX = e.x;
      panStartY = e.y;
    }
  });

  window.on('mouseButtonDown', (e) => {
    if (e.button === 1) mouseState.buttons |= 1;
    else if (e.button === 3) mouseState.buttons |= 2;
    else if (e.button === 2) mouseState.buttons |= 4;

    for (let i = uiActors.length - 1; i >= 0; i--) {
      const { win, actor } = uiActors[i];
      if (mouseState.x >= win.x && mouseState.x < win.x + actor.width &&
          mouseState.y >= win.y && mouseState.y < win.y + 18) {
        dragWin = { win, actor };
        dragOffsetX = mouseState.x - win.x;
        dragOffsetY = mouseState.y - win.y;

        const item = uiActors.splice(i, 1)[0];
        uiActors.push(item);
        return;
      }
    }

    if (e.button === 2 || (spaceDown && e.button === 1)) {
      isPanning = true;
      panStartX = mouseState.x;
      panStartY = mouseState.y;
    }
  });

  window.on('mouseButtonUp', (e) => {
    if (e.button === 1) {
      mouseState.buttons &= ~1;
      dragWin = null;
      isDrawingOnCanvas = false;
    } else if (e.button === 3) {
      mouseState.buttons &= ~2;
      isDrawingOnCanvas = false;
    } else if (e.button === 2) {
      mouseState.buttons &= ~4;
      isPanning = false;
    }

    if (isPanning && !spaceDown) {
      isPanning = false;
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

  window.on('keyDown', (e) => {
    if (e.key === 'space' || e.scancode === 44) spaceDown = true;

    const sc = KEY_MAP[e.key] || 0;
    if (sc) globalKeys[sc] = 1;
    if (e.shift) { globalKeys[0xE1] = 1; globalKeys[0xE5] = 1; }

    if (e.key === '=' || e.key === '+' || e.key === 'kpPlus') {
      const oldZoom = zoom;
      zoom = Math.min(10.0, zoom * 1.2);
      panX = windowWidth / 2 - (windowWidth / 2 - panX) * (zoom / oldZoom);
      panY = windowHeight / 2 - (windowHeight / 2 - panY) * (zoom / oldZoom);
    } else if (e.key === '-' || e.key === 'kpMinus') {
      const oldZoom = zoom;
      zoom = Math.max(0.1, zoom * 0.8);
      panX = windowWidth / 2 - (windowWidth / 2 - panX) * (zoom / oldZoom);
      panY = windowHeight / 2 - (windowHeight / 2 - panY) * (zoom / oldZoom);
    } else if (e.key === '0' || e.key === 'kp0') {
      zoom = 0.72;
      panX = (windowWidth - DOC_WIDTH * zoom) / 2;
      panY = (windowHeight - DOC_HEIGHT * zoom) / 2;
    }
  });

  window.on('keyUp', (e) => {
    if (e.key === 'space' || e.scancode === 44) {
      spaceDown = false;
      isPanning = false;
    }
    const sc = KEY_MAP[e.key] || 0;
    if (sc) globalKeys[sc] = 0;
    if (!e.shift) { globalKeys[0xE1] = 0; globalKeys[0xE5] = 0; }
  });

  window.on('close', () => process.exit(0));

  console.log('=== Wesenho Studio — Microkernel Pronto ===');

  const frameLoop = () => {
    let focusedActor = null;
    for (let i = uiActors.length - 1; i >= 0; i--) {
      const { win, actor } = uiActors[i];
      if (mouseState.x >= win.x && mouseState.x < win.x + actor.width &&
          mouseState.y >= win.y && mouseState.y < win.y + actor.height) {
        focusedActor = { win, actor };
        break;
      }
    }

    for (const { win, actor } of uiActors) {
      if (focusedActor && focusedActor.win === win && !dragWin && !isPanning && !isDrawingOnCanvas) {
        const relX = mouseState.x - win.x;
        const relY = mouseState.y - win.y;
        actor.syncMouse(relX, relY, mouseState.buttons, 0, 0);
      } else {
        actor.syncMouse(-100, -100, 0, 0, 0);
      }
      actor.syncKeyboard(globalKeys);
      actor.update();
    }

    // Canvas Mouse Handling with continuous stroke lock
    const hasDrawBtn = (mouseState.buttons & 1) || (mouseState.buttons & 2);
    if (!focusedActor && hasDrawBtn && !dragWin && !isPanning) {
      isDrawingOnCanvas = true;
    }

    if (isDrawingOnCanvas && hasDrawBtn && !isPanning && !dragWin) {
      const docX = (mouseState.x - panX) / zoom;
      const docY = (mouseState.y - panY) / zoom;
      canvasActor.syncMouse(docX, docY, mouseState.buttons, 0, 0);
    } else {
      isDrawingOnCanvas = false;
      canvasActor.syncMouse(-100, -100, 0, 0, 0);
    }

    canvasActor.update();

    screenBuffer.fill(0x18);

    const canvasPixels = canvasActor.getPixels();
    if (canvasPixels) {
      const screenStartX = Math.max(0, Math.floor(panX));
      const screenStartY = Math.max(0, Math.floor(panY));
      const screenEndX = Math.min(windowWidth, Math.ceil(panX + DOC_WIDTH * zoom));
      const screenEndY = Math.min(windowHeight, Math.ceil(panY + DOC_HEIGHT * zoom));

      const invZoom = 1 / zoom;

      for (let sy = screenStartY; sy < screenEndY; sy++) {
        const dy = Math.floor((sy - panY) * invZoom);
        if (dy < 0 || dy >= DOC_HEIGHT) continue;

        const docRowOffset = dy * DOC_WIDTH * 4;
        const screenRowOffset = sy * windowWidth * 4;

        for (let sx = screenStartX; sx < screenEndX; sx++) {
          const dx = Math.floor((sx - panX) * invZoom);
          if (dx < 0 || dx >= DOC_WIDTH) continue;

          const docPixelOffset = docRowOffset + dx * 4;
          const screenPixelOffset = screenRowOffset + sx * 4;

          screenBuffer[screenPixelOffset + 0] = canvasPixels[docPixelOffset + 0];
          screenBuffer[screenPixelOffset + 1] = canvasPixels[docPixelOffset + 1];
          screenBuffer[screenPixelOffset + 2] = canvasPixels[docPixelOffset + 2];
          screenBuffer[screenPixelOffset + 3] = 0xFF;
        }
      }
    }

    for (const { win, actor } of uiActors) {
      const winPixels = actor.getPixels();
      if (!winPixels) continue;

      for (let y = 0; y < actor.height; y++) {
        const sy = win.y + y;
        if (sy < 0 || sy >= windowHeight) continue;

        const winRowOffset = y * actor.width * 4;
        const screenRowOffset = sy * windowWidth * 4;

        for (let x = 0; x < actor.width; x++) {
          const sx = win.x + x;
          if (sx < 0 || sx >= windowWidth) continue;

          const winPixelOffset = winRowOffset + x * 4;
          const screenPixelOffset = screenRowOffset + sx * 4;

          screenBuffer[screenPixelOffset + 0] = winPixels[winPixelOffset + 0];
          screenBuffer[screenPixelOffset + 1] = winPixels[winPixelOffset + 1];
          screenBuffer[screenPixelOffset + 2] = winPixels[winPixelOffset + 2];
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
