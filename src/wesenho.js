const sdl = require('@kmamal/sdl');
const fs = require('fs');
const path = require('path');

let windowWidth = 900;
let windowHeight = 900;

// Document Dimensions (Default Vertical Proportions)
const DOC_WIDTH = 800;
const DOC_HEIGHT = 1000;

// Viewport / Camera Navigation State
let zoom = 0.75;
let panX = (windowWidth - DOC_WIDTH * zoom) / 2;
let panY = (windowHeight - DOC_HEIGHT * zoom) / 2;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

const ACTOR_HOST = 0;
const ACTOR_CANVAS = 1;
const ACTOR_TOOLS = 2;
const ACTOR_PALETTE = 3;
const ACTOR_LAYERS = 4;

// Floating Windows State (Separate movable windows inside viewport)
const floatingWindows = [
  { id: ACTOR_TOOLS, name: 'tools', x: 20, y: 20, w: 140, h: 230, wasmPath: 'roms/tools.wasm', isDragging: false },
  { id: ACTOR_PALETTE, name: 'palette', x: 20, y: 270, w: 140, h: 150, wasmPath: 'roms/palette.wasm', isDragging: false },
  { id: ACTOR_LAYERS, name: 'layers', x: windowWidth - 180, y: 20, w: 160, h: 280, wasmPath: 'roms/layers.wasm', isDragging: false }
];

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
    this.arenaOffset = 0x800000;

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

  const canvasActor = new WasmActor(
    ACTOR_CANVAS,
    'canvas',
    path.resolve(__dirname, '../roms/canvas.wasm'),
    DOC_WIDTH,
    DOC_HEIGHT,
    coordinator
  );
  coordinator.register(canvasActor);
  await canvasActor.init();

  const uiActors = [];
  for (const win of floatingWindows) {
    const actor = new WasmActor(
      win.id,
      win.name,
      path.resolve(__dirname, '..', win.wasmPath),
      win.w,
      win.h,
      coordinator
    );
    coordinator.register(actor);
    await actor.init();
    uiActors.push({ win, actor });
  }

  const window = sdl.video.createWindow({
    title: 'Wesenho Studio — Janelas Flutuantes, Camadas com Nomes & Pan/Zoom',
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

    // 1. Check titlebar drag on any floating window (z-order top to bottom)
    for (let i = uiActors.length - 1; i >= 0; i--) {
      const { win } = uiActors[i];
      if (mouseState.x >= win.x && mouseState.x < win.x + win.w &&
          mouseState.y >= win.y && mouseState.y < win.y + 20) {
        dragWin = win;
        dragOffsetX = mouseState.x - win.x;
        dragOffsetY = mouseState.y - win.y;

        // Bring to front
        const item = uiActors.splice(i, 1)[0];
        uiActors.push(item);
        return;
      }
    }

    // 2. Middle mouse button or Space + Left button starts panning
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

  // Wheel Zoom
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

    // Brush Size Shortcuts: [ / ] or - / =
    if (e.key === '[' || e.key === 'BracketLeft') {
      coordinator.dispatch(ACTOR_HOST, ACTOR_CANVAS, Buffer.from(new Uint32Array([MSG_SET_BRUSH_SIZE, Math.max(1, 4), 0, 0]).buffer));
    }

    // Zoom Keys (+ / - / = / 0)
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
      zoom = 0.75;
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

  console.log('=== Wesenho Studio Pronto ===');
  console.log('Tamanho do Pincel: Botoes [+] e [-] na janela Ferramentas.');
  console.log('Zoom: Scroll do Mouse (roda) ou Teclas [+], [-], [0].');
  console.log('Pan: Espaco + Botao Esquerdo ou Botao do Meio.');

  const frameLoop = () => {
    // Check if mouse is over any floating window
    let focusedActor = null;
    for (let i = uiActors.length - 1; i >= 0; i--) {
      const { win, actor } = uiActors[i];
      if (mouseState.x >= win.x && mouseState.x < win.x + win.w &&
          mouseState.y >= win.y && mouseState.y < win.y + win.h) {
        focusedActor = { win, actor };
        break;
      }
    }

    // Sync UI Actors Mouse
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

    // Sync Canvas Mouse
    if (!focusedActor && !dragWin && !isPanning) {
      const docX = (mouseState.x - panX) / zoom;
      const docY = (mouseState.y - panY) / zoom;
      canvasActor.syncMouse(docX, docY, mouseState.buttons, 0, 0);
    } else {
      canvasActor.syncMouse(-100, -100, 0, 0, 0);
    }

    canvasActor.update();

    // 1. Clear background (Dark Studio Pattern)
    screenBuffer.fill(0x18);

    // 2. Render Scaled & Panned Document Canvas
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

    // 3. Render Floating Windows in order
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
