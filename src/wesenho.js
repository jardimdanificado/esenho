const sdl = require('@kmamal/sdl');
const fs = require('fs');
const path = require('path');

// Initial Window Dimensions (Vertical / Flexible aspect ratio default)
let windowWidth = 800;
let windowHeight = 900;

// UI Component properties (Movable / Dockable sidebar)
let uiX = 16;
let uiY = 16;
const UI_WIDTH = 160;
const UI_HEIGHT = 720;
let isDraggingUI = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Canvas Document Dimensions (Customizable Document Size)
const DOC_WIDTH = 800;
const DOC_HEIGHT = 1000;

// Viewport / Camera Navigation State
let zoom = 0.8;
let panX = (windowWidth - UI_WIDTH - DOC_WIDTH * zoom) / 2 + UI_WIDTH / 2;
let panY = (windowHeight - DOC_HEIGHT * zoom) / 2;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

const ACTOR_HOST = 0;
const ACTOR_CANVAS = 1;
const ACTOR_UI = 2;

class WasmActor {
  constructor(id, name, wasmPath, width, height, coordinator) {
    this.id = id;
    this.name = name;
    this.wasmPath = wasmPath;
    this.width = width;
    this.height = height;
    this.coordinator = coordinator;

    this.memory = null;
    this.instance = null;
    this.arenaOffset = 0x800000; // 8MB offset for dynamic extensions

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
        this.coordinator.dispatch(this.id, targetId, msgBytes);
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

class WesenhoCoordinator {
  constructor() {
    this.actors = new Map();
  }

  register(actor) {
    this.actors.set(actor.id, actor);
  }

  dispatch(fromId, targetId, buffer) {
    const target = this.actors.get(targetId);
    if (target) {
      target.receiveMessage(fromId, buffer);
    }
  }
}

async function main() {
  const coordinator = new WesenhoCoordinator();

  const uiActor = new WasmActor(
    ACTOR_UI,
    'ui',
    path.resolve(__dirname, '../roms/ui.wasm'),
    UI_WIDTH,
    UI_HEIGHT,
    coordinator
  );

  const canvasActor = new WasmActor(
    ACTOR_CANVAS,
    'canvas',
    path.resolve(__dirname, '../roms/canvas.wasm'),
    DOC_WIDTH,
    DOC_HEIGHT,
    coordinator
  );

  coordinator.register(uiActor);
  coordinator.register(canvasActor);

  await uiActor.init();
  await canvasActor.init();

  const window = sdl.video.createWindow({
    title: 'Wesenho — Studio (Movable UI, Multi-Layer & Pan/Zoom Viewport)',
    width: windowWidth,
    height: windowHeight,
    resizable: true
  });

  let screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  let mouseState = { x: 0, y: 0, buttons: 0, wheel_y: 0 };
  let spaceDown = false;
  let ctrlDown = false;

  window.on('resize', (e) => {
    windowWidth = e.width;
    windowHeight = e.height;
    screenBuffer = Buffer.alloc(windowWidth * windowHeight * 4);
  });

  window.on('mouseMove', (e) => {
    mouseState.x = e.x;
    mouseState.y = e.y;

    if (isDraggingUI) {
      uiX = Math.max(0, Math.min(windowWidth - UI_WIDTH, e.x - dragOffsetX));
      uiY = Math.max(0, Math.min(windowHeight - UI_HEIGHT, e.y - dragOffsetY));
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

    // Check if clicked UI titlebar to drag (first 24px)
    if (e.button === 1 &&
        mouseState.x >= uiX && mouseState.x < uiX + UI_WIDTH &&
        mouseState.y >= uiY && mouseState.y < uiY + 24) {
      isDraggingUI = true;
      dragOffsetX = mouseState.x - uiX;
      dragOffsetY = mouseState.y - uiY;
      return;
    }

    // Check if Middle Click or Space + Left Click to start Pan
    if (e.button === 2 || (spaceDown && e.button === 1)) {
      isPanning = true;
      panStartX = mouseState.x;
      panStartY = mouseState.y;
    }
  });

  window.on('mouseButtonUp', (e) => {
    if (e.button === 1) {
      mouseState.buttons &= ~1;
      isDraggingUI = false;
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
    if (ctrlDown) {
      // Zoom centered on cursor
      const oldZoom = zoom;
      const zoomFactor = e.dy > 0 ? 1.15 : 0.85;
      zoom = Math.max(0.1, Math.min(8.0, zoom * zoomFactor));

      const mx = mouseState.x;
      const my = mouseState.y;
      panX = mx - (mx - panX) * (zoom / oldZoom);
      panY = my - (my - panY) * (zoom / oldZoom);
    } else {
      mouseState.wheel_y += e.dy;
    }
  });

  window.on('keyDown', (e) => {
    if (e.key === 'space') spaceDown = true;
    if (e.key === 'leftCtrl' || e.key === 'rightCtrl') ctrlDown = true;

    // Reset view shortcut (Ctrl + 0)
    if (ctrlDown && e.key === '0') {
      zoom = 0.8;
      panX = (windowWidth - DOC_WIDTH * zoom) / 2;
      panY = (windowHeight - DOC_HEIGHT * zoom) / 2;
    }
  });

  window.on('keyUp', (e) => {
    if (e.key === 'space') {
      spaceDown = false;
      isPanning = false;
    }
    if (e.key === 'leftCtrl' || e.key === 'rightCtrl') ctrlDown = false;
  });

  window.on('close', () => process.exit(0));

  console.log('=== Wesenho Studio Pronto ===');
  console.log('UI Flutuante: Arraste a barra superior da sidebar para posicionar livremente.');
  console.log('Navegacao: Espaco + Arrastar ou Botao do Meio = Pan | Ctrl + Scroll = Zoom');
  console.log('Atalhos: Ctrl + 0 = Reset Viewport | Tecla + na UI = Nova Layer');

  const frameLoop = () => {
    // Check if mouse is over UI floating panel
    const isOverUI = (
      mouseState.x >= uiX && mouseState.x < uiX + UI_WIDTH &&
      mouseState.y >= uiY && mouseState.y < uiY + UI_HEIGHT
    );

    // Sync UI Mouse
    if (isOverUI && !isDraggingUI && !isPanning) {
      const relUIX = mouseState.x - uiX;
      const relUIY = mouseState.y - uiY;
      uiActor.syncMouse(relUIX, relUIY, mouseState.buttons, 0, mouseState.wheel_y);
    } else {
      uiActor.syncMouse(-100, -100, 0, 0, 0);
    }

    // Sync Canvas Mouse (Convert Screen Coordinates -> Document Coordinates with Pan & Zoom)
    if (!isOverUI && !isPanning && !isDraggingUI) {
      const docX = (mouseState.x - panX) / zoom;
      const docY = (mouseState.y - panY) / zoom;
      canvasActor.syncMouse(docX, docY, mouseState.buttons, 0, mouseState.wheel_y);
    } else {
      canvasActor.syncMouse(-100, -100, 0, 0, 0);
    }

    mouseState.wheel_y = 0;

    uiActor.update();
    canvasActor.update();

    const uiPixels = uiActor.getPixels();
    const canvasPixels = canvasActor.getPixels();

    // 1. Fill background workspace (Dark Studio theme)
    screenBuffer.fill(0x16); // 0x16161616 dark grey

    // 2. Render Scaled & Panned Document Canvas into screenBuffer
    if (canvasPixels) {
      const startDocX = Math.max(0, Math.floor(-panX / zoom));
      const startDocY = Math.max(0, Math.floor(-panY / zoom));
      const endDocX = Math.min(DOC_WIDTH, Math.ceil((windowWidth - panX) / zoom));
      const endDocY = Math.min(DOC_HEIGHT, Math.ceil((windowHeight - panY) / zoom));

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

      // Draw Document Border / Shadow
      if (screenStartX >= 0 && screenStartX < windowWidth) {
        for (let y = Math.max(0, screenStartY); y < Math.min(windowHeight, screenEndY); y++) {
          const offset = (y * windowWidth + screenStartX) * 4;
          screenBuffer[offset] = 0x55;
          screenBuffer[offset+1] = 0x55;
          screenBuffer[offset+2] = 0x55;
        }
      }
    }

    // 3. Composite Floating UI Panel on top (with shadow border)
    if (uiPixels) {
      for (let y = 0; y < UI_HEIGHT; y++) {
        const sy = uiY + y;
        if (sy < 0 || sy >= windowHeight) continue;

        const uiRowOffset = y * UI_WIDTH * 4;
        const screenRowOffset = sy * windowWidth * 4;

        for (let x = 0; x < UI_WIDTH; x++) {
          const sx = uiX + x;
          if (sx < 0 || sx >= windowWidth) continue;

          const uiPixelOffset = uiRowOffset + x * 4;
          const screenPixelOffset = screenRowOffset + sx * 4;

          screenBuffer[screenPixelOffset + 0] = uiPixels[uiPixelOffset + 0];
          screenBuffer[screenPixelOffset + 1] = uiPixels[uiPixelOffset + 1];
          screenBuffer[screenPixelOffset + 2] = uiPixels[uiPixelOffset + 2];
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
