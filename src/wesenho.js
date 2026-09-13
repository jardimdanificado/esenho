const sdl = require('@kmamal/sdl');
const fs = require('fs');
const path = require('path');

// Wagnostic helpers
const KEY_MAP = {
  a: 0x04, b: 0x05, c: 0x06, d: 0x07, e: 0x08, f: 0x09, g: 0x0A,
  h: 0x0B, i: 0x0C, j: 0x0D, k: 0x0E, l: 0x0F, m: 0x10, n: 0x11,
  o: 0x12, p: 0x13, q: 0x14, r: 0x15, s: 0x16, t: 0x17, u: 0x18,
  v: 0x19, w: 0x1A, x: 0x1B, y: 0x1C, z: 0x1D,
  '1': 0x1E, '2': 0x1F, '3': 0x20, '4': 0x21, '5': 0x22,
  '6': 0x23, '7': 0x24, '8': 0x25, '9': 0x26, '0': 0x27,
  return: 0x28, escape: 0x29, backspace: 0x2A, tab: 0x2B, space: 0x2C
};

class WesenhoApp {
  constructor(wasmPath, options = {}) {
    this.wasmPath = wasmPath;
    this.width = options.width || 640;
    this.height = options.height || 480;

    this.keys = new Uint8Array(256);
    this.mouse = { x: 0, y: 0, buttons: 0, wheel_x: 0, wheel_y: 0 };

    this.memory = null;
    this.instance = null;
    this.arenaOffset = 0x8000;

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

    if (name === 'std:keyboard' || name === 'keyboard') {
      if (!this.kbPtr) {
        this.kbPtr = this.hostAlloc(256);
      }
      return this.kbPtr;
    }

    return 0;
  }

  syncInputs() {
    if (!this.memory) return;
    const view = new DataView(this.memory.buffer);

    if (this.mousePtr) {
      view.setInt32(this.mousePtr + 0, this.mouse.x, true);
      view.setInt32(this.mousePtr + 4, this.mouse.y, true);
      view.setUint32(this.mousePtr + 8, this.mouse.buttons, true);
      view.setInt32(this.mousePtr + 12, this.mouse.wheel_x, true);
      view.setInt32(this.mousePtr + 16, this.mouse.wheel_y, true);
      this.mouse.wheel_x = 0;
      this.mouse.wheel_y = 0;
    }

    if (this.kbPtr) {
      const u8 = new Uint8Array(this.memory.buffer, this.kbPtr, 256);
      u8.set(this.keys);
    }
  }

  sendPiolhoMessage(type, color = 0) {
    if (!this.instance || !this.instance.exports.on_message) return;
    const view = new DataView(this.memory.buffer);
    // Address 0 is piolho_page
    view.setUint32(0, type, true);
    view.setUint32(4, this.width, true);
    view.setUint32(8, this.height, true);
    view.setUint32(12, color, true);

    this.instance.exports.on_message(0, 16);
  }

  async init() {
    const wasmBytes = fs.readFileSync(this.wasmPath);
    const env = {
      ask: (namePtr) => this.handleAsk(namePtr),
      say: (target, len) => 0,
      connect: () => 0,
      quit: (code) => process.exit(code)
    };

    const mod = await WebAssembly.instantiate(wasmBytes, { env });
    this.instance = mod.instance;
    this.memory = mod.instance.exports.memory;
  }

  start() {
    const window = sdl.video.createWindow({
      title: 'Wesenho — Ilustração & Pintura (Wagnostic + Piolho + SDL2)',
      width: this.width,
      height: this.height,
      resizable: false
    });

    // SDL Event handlers
    window.on('mouseMove', (e) => {
      this.mouse.x = Math.max(0, Math.min(this.width - 1, e.x));
      this.mouse.y = Math.max(0, Math.min(this.height - 1, e.y));
    });

    window.on('mouseButtonDown', (e) => {
      if (e.button === 1) this.mouse.buttons |= 1;      // Left
      else if (e.button === 3) this.mouse.buttons |= 2; // Right
      else if (e.button === 2) this.mouse.buttons |= 4; // Middle
    });

    window.on('mouseButtonUp', (e) => {
      if (e.button === 1) this.mouse.buttons &= ~1;
      else if (e.button === 3) this.mouse.buttons &= ~2;
      else if (e.button === 2) this.mouse.buttons &= ~4;
    });

    window.on('mouseWheel', (e) => {
      this.mouse.wheel_y += e.dy;
    });

    window.on('keyDown', (e) => {
      const code = KEY_MAP[e.key] || 0;
      if (code) this.keys[code] = 1;

      // Filter hotkeys via Piolho message
      if (e.key === 'i') {
        this.sendPiolhoMessage(1); // MSG_EFFECT_INVERT
      } else if (e.key === 'g') {
        this.sendPiolhoMessage(2); // MSG_EFFECT_GRAYSCALE
      }
    });

    window.on('keyUp', (e) => {
      const code = KEY_MAP[e.key] || 0;
      if (code) this.keys[code] = 0;
    });

    window.on('close', () => {
      process.exit(0);
    });

    console.log('--- Wesenho Pronto ---');
    console.log('Mouse: Botao Esquerdo = Desenhar | Botao Direito = Borracha | Scroll = Tamanho');
    console.log('Teclado: 1=Vermelho | 2=Verde | 3=Azul | 4=Amarelo | 5=Branco | C=Limpar');
    console.log('Efeitos (Piolho IPC): I=Inverter Cores | G=Preto e Branco');

    // Main frame loop (60 FPS)
    const renderLoop = () => {
      this.syncInputs();
      if (this.instance.exports.update) {
        this.instance.exports.update();
      }

      if (this.fbPtr) {
        const view = new DataView(this.memory.buffer);
        const w = view.getUint32(this.fbPtr + 0, true);
        const h = view.getUint32(this.fbPtr + 4, true);
        const pixelsPtr = view.getUint32(this.fbPtr + 8, true);

        if (pixelsPtr > 0) {
          const pixelBytes = new Uint8Array(this.memory.buffer, pixelsPtr, w * h * 4);
          window.render(w, h, w * 4, 'rgba32', Buffer.from(pixelBytes.buffer, pixelBytes.byteOffset, pixelBytes.byteLength));
        }
      }

      setTimeout(renderLoop, 16);
    };

    renderLoop();
  }
}

async function main() {
  const wasmFile = path.resolve(__dirname, '../roms/canvas.wasm');
  const app = new WesenhoApp(wasmFile);
  await app.init();
  app.start();
}

main().catch(console.error);
