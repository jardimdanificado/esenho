# wesenho
> High-performance WebAssembly digital painting studio and raster engine.

## Features

- **WebAssembly Core (`roms/canvas.wasm`)**: Bare-metal C99 raster pipeline compiling without libc dependencies. Direct linear memory access, dirty-rect composition, subpixel dab antialiasing.
- **Unified Layer System**: Bitmap drawing layers, automation scripts (`SCR`), and WASM filter plugins (`FLT`) managed as first-class citizens in a single layer stack with folder grouping (`tips/`, `grains/`, `scripts/`, `plugins/`).
- **Canvas Script Editor**: Monospace overlay to write and edit automation scripts directly over the canvas.
- **WASM Plugin Architecture (`plugins/*.wasm`)**: Standalone, sandboxed image processing kernels (`blur`, `brightness`, `contrast`, `dither`, `edge`, `grayscale`, `invert`, `noise`, `pixelate`, `sepia`, `threshold`) loaded dynamically.
- **Native `.esen` Project Format & IndexedDB**: Portable JSON project savefiles with embedded base64 layers, autosave engine, and project gallery (`index.html`).
- **Stylus & Wacom Dynamics**: Pressure-sensitive size and flow, tilt angle dynamics, touch gestures (pinch-zoom, rotate, 2-finger undo, 3-finger redo).
- **Embedded CLI & REPL**: `papagaio` pattern-matching command engine with over 80 drawing, editing, layer, filter, and storage commands.

---

## Quick Start

### 1. Build WebAssembly Core & Plugins
```bash
make
```

### 2. Run Test Suite
```bash
npm test
```

### 3. Start Local Development Server
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080/index.html` in your browser.

---

## Project Structure

```
├── app.html              # Main canvas painting studio
├── index.html            # Project launcher & gallery manager
├── include/
│   └── esenho.h          # C header & WebAssembly ABI interface
├── plugins/              # Compiled & source WASM filter plugins
│   ├── manifest.json     # Plugin registry manifest
│   └── *.wasm            # Filter modules
├── roms/
│   └── canvas.wasm       # Core raster engine binary
├── src/
│   ├── esenho.c          # C99 raster engine source
│   ├── esenho.js         # Headless Node/Browser runtime & CLI engine
│   └── host-browser.js   # Browser UI and canvas glue code
├── docs/
│   ├── API.md            # Complete WASM ABI and CLI reference
│   └── USAGE.md          # User manual, gestures, and layout guide
└── tests/
    └── test-core.js      # Headless Node.js test suite
```

---

## Documentation

- **[User Guide (`docs/USAGE.md`)](docs/USAGE.md)**: Studio layout, gesture controls, tool configuration, layer management, and shortcuts.
- **[API & CLI Reference (`docs/API.md`)](docs/API.md)**: WebAssembly C ABI, `.esen` schema, REPL command syntax, and plugin architecture.

---

## License

MIT
