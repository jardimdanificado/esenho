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

class WasmActor {
  constructor(id, name, wasmPath, width, height, broker) {
    this.id = id;
    this.name = name;
    this.wasmPath = wasmPath;
    this.width = width;
    this.height = height;
    this.broker = broker;

    this.memory = null;
    this.instance = null;
    this.arenaOffset = 0x800000; // 8MB

    this.fbPtr = 0;
    this.mousePtr = 0;
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
    const view = new DataView(this.memory.buffer);

    if (name === 'std:framebuffer' || name === 'framebuffer') {
      if (!this.fbPtr) {
        this.fbPtr = this.hostAlloc(12);
        view.setUint32(this.fbPtr + 0, this.width, true);
        view.setUint32(this.fbPtr + 4, this.height, true);
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

    return 0;
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
      quit: (code) => process.exit(code)
    };

    const mod = await WebAssembly.instantiate(wasmBytes, { env });
    this.instance = mod.instance;
    this.memory = mod.instance.exports.memory;
  }

  update() {
    if (this.instance && this.instance.exports.update) {
      this.instance.exports.update();
    }
  }

  getPixels() {
    if (!this.fbPtr || !this.memory) return null;
    const view = new DataView(this.memory.buffer);
    const pixelsPtr = view.getUint32(this.fbPtr + 8, true);
    if (!pixelsPtr) return null;
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
      if (type === 0x100) { // MSG_PUB_TOPIC
        const topicBytes = buffer.subarray(4, 36);
        let topic = '';
        for (let i = 0; i < 32 && topicBytes[i] !== 0; i++) topic += String.fromCharCode(topicBytes[i]);
        this.publish(fromId, topic, buffer);
        return;
      }
    }

    const target = this.actors.get(targetId);
    if (target) {
      target.receiveMessage(fromId, buffer);
    }
  }
}

// Dynamic plugin discovery function
function discoverModules(baseDir) {
  const modules = [];
  let nextId = 10;

  // Default core UI windows
  modules.push(
    { id: 2, name: 'tools', x: 20, y: 20, w: 140, h: 230, wasmPath: 'roms/tools.wasm' },
    { id: 3, name: 'palette', x: 20, y: 265, w: 140, h: 150, wasmPath: 'roms/palette.wasm' },
    { id: 4, name: 'layers', x: windowWidth - 180, y: 20, w: 160, h: 280, wasmPath: 'roms/layers.wasm' }
  );

  // Scan plugins/ directory for user modules (*.json or *.wasm)
  const pluginsDir = path.resolve(baseDir, 'plugins');
  if (fs.existsSync(pluginsDir)) {
    const subdirs = ['uis', 'brushes', 'filters'];
    for (const sub of subdirs) {
      const dir = path.join(pluginsDir, sub);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.wasm')) {
          const modPath = path.relative(baseDir, path.join(dir, f));
          modules.push({
            id: nextId++,
            name: path.basename(f, '.wasm'),
            x: 200 + (nextId * 20) % 300,
            y: 100 + (nextId * 20) % 300,
            w: 160,
            h: 200,
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
    DOC_WIDTH,
    DOC_HEIGHT,
    broker
  );
  broker.register(canvasActor);
  await canvasActor.init();

  // Load core & dynamic user plugins
  const moduleConfigs = discoverModules(path.resolve(__dirname, '..'));
  const uiActors = [];

  for (const win of moduleConfigs) {
    const fullPath = path.resolve(__dirname, '..', win.wasmPath);
    if (!fs.existsSync(fullPath)) continue;

    const actor = new WasmActor(win.id, win.name, fullPath, win.w, win.h, broker);
    broker.register(actor);
    await actor.init();
    uiActors.push({ win, actor });
    console.log(`[Plugin Loaded] ${win.name} (ID: ${win.id}) -> ${win.wasmPath}`);
  }

  const window = sdl.video.createWindow({
    title: 'Wesenho Studio — Sistema Extensivel por Plugins & Microkernel Piolho',
    width: windowWidth,
    height: windowHeight,
    resizable: true
  });

  let screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  let mouseState = { x: 0, y: 0, buttons: 0, wheel_y: 0 };
  let spaceDown = false;
  let dragWin = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  window.on('resize', (e) => {
    windowWidth = e.width;
    windowHeight = e.height;
    screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  });

  window.on('mouseMove', (e) => {
    mouseState.x = e.x;
    mouseState.y = e.y;

    if (dragWin) {
      dragWin.x = Math.max(0, Math.min(windowWidth - dragWin.w, e.x - dragOffsetX));
      dragWin.y = Math.max(0, Math.min(windowHeight - dragWin.h, e.y - dragOffsetY));
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
      const { win } = uiActors[i];
      if (mouseState.x >= win.x && mouseState.x < win.x + win.w &&
          mouseState.y >= win.y && mouseState.y < win.y + 18) {
        dragWin = win;
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
    } else if (e.button === 3) {
      mouseState.buttons &= ~2;
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
  });

  window.on('close', () => process.exit(0));

  console.log('=== Wesenho Studio — Microkernel Pronto ===');
  console.log('Plugins podem ser colocados em plugins/uis/, plugins/brushes/ ou plugins/filters/.');

  const frameLoop = () => {
    let focusedActor = null;
    for (let i = uiActors.length - 1; i >= 0; i--) {
      const { win, actor } = uiActors[i];
      if (mouseState.x >= win.x && mouseState.x < win.x + win.w &&
          mouseState.y >= win.y && mouseState.y < win.y + win.h) {
        focusedActor = { win, actor };
        break;
      }
    }

    for (const { win, actor } of uiActors) {
      if (focusedActor && focusedActor.win === win && !dragWin && !isPanning) {
        const relX = mouseState.x - win.x;
        const relY = mouseState.y - win.y;
        actor.syncMouse(relX, relY, mouseState.buttons, 0, 0);
      } else {
        actor.syncMouse(-100, -100, 0, 0, 0);
      }
      actor.update();
    }

    if (!focusedActor && !dragWin && !isPanning) {
      const docX = (mouseState.x - panX) / zoom;
      const docY = (mouseState.y - panY) / zoom;
      canvasActor.syncMouse(docX, docY, mouseState.buttons, 0, 0);
    } else {
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

      for (let y = 0; y < win.h; y++) {
        const sy = win.y + y;
        if (sy < 0 || sy >= windowHeight) continue;

        const winRowOffset = y * win.w * 4;
        const screenRowOffset = sy * windowWidth * 4;

        for (let x = 0; x < win.w; x++) {
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
