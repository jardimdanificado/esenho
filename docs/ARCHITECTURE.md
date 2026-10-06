# Esenho System Architecture

This document details the internal design and data flow of the **Esenho** creative platform, explaining how high-performance C99 WebAssembly execution integrates with a reactive JavaScript runtime, vector engine, parametric animation timeline, and native desktop bridge.

---

## 1. Architectural Philosophy

Esenho is built around five core principles:
1. **Zero-Overhead Native Core**: The raster engine, vector scanline rasterizer, font renderer, and audio DSP are written in standard C99 and compiled to WebAssembly (`wasm32`) **without libc, musl, or Emscripten dependencies**. Execution is lightweight and deterministic.
2. **Zero-Copy Memory Sharing**: Framebuffers, selection alpha masks, and audio PCM buffers live directly in WebAssembly linear memory. The JavaScript host creates direct typed array views (`Uint32Array`, `Float32Array`) pointing into `WebAssembly.Memory.buffer` without serializing or copying pixels.
3. **Decoupled Actor Model**: The WASM engine runs behind a clean abstraction (`EsenhoModule` / `EsenhoScreenHost`), allowing identical execution inside a Node.js CLI script, a browser Web Worker, or the main UI thread.
4. **Command & Transaction Bus**: All state mutations flow through reversible commands supporting atomic multi-operation transactions and continuous macro recording.
5. **Modern Extensible Studio**: Built on Dockview dockable panels, CSS custom properties (supporting modern flat and nostalgic skeuomorphic themes), and native desktop deployment via Tauri.

---

## 2. Memory Architecture & Framebuffer Layout

```
 0x00000000 ┌──────────────────────────────────────────────┐
            │ Static Data & Global State Variables         │
            ├──────────────────────────────────────────────┤
            │ Brush Tip & Grain Texture LUTs               │
            ├──────────────────────────────────────────────┤
            │ Layer 0 ARGB Pixels (Width × Height × 4)     │
            ├──────────────────────────────────────────────┤
            │ Layer 1 ARGB Pixels (Width × Height × 4)     │
            ├──────────────────────────────────────────────┤
            │ ... (Up to MAX_LAYERS)                       │
            ├──────────────────────────────────────────────┤
            │ Scratch Buffer / Floating Selection Pixels   │
            ├──────────────────────────────────────────────┤
            │ Selection 8-bit Alpha Mask                   │
            ├──────────────────────────────────────────────┤
            │ Final 32-bit ARGB Composite Framebuffer      │
            ├──────────────────────────────────────────────┤
            │ Audio Left/Right PCM Channels & WAV Buffer   │
 0x0...MAX  └──────────────────────────────────────────────┘
```

### Framebuffer Descriptors (`include/quadro.h`)
```c
typedef struct {
    uint32_t *pixels;    /* Linear 32-bit ARGB pixel array (0xAABBGGRR) */
    int32_t  width;
    int32_t  height;
    int32_t  x;          /* Document X offset */
    int32_t  y;          /* Document Y offset */
    uint8_t  visible;    /* 1 = rendered in composite */
    uint8_t  opacity;    /* 0..255 */
    uint8_t  in_use;
    uint8_t  alpha_lock; /* 1 = protect transparent alpha channel */
    uint8_t  clipping;   /* 1 = clip render to visible pixels below */
    uint8_t  blend_mode; /* 0=Normal, 1=Multiply, 2=Screen, etc. */
} layer_t;
```

---

## 3. Subsystem Breakdown

### 3.1. Quadro Raster Engine (`src/quadro.c`, `src/quadro_brush_dynamics.c`)
- **Parametric Dab Generator**: Evaluates Gaussian hardness, subpixel displacement, roundness ellipse transformation, and rotation angles per dab.
- **Dynamic Sampling**: Computes real-time stylus pressure, tilt altitude/azimuth, stroke velocity, taper, and fade.
- **Wet Media Simulation**: Models brush reservoir pigment depletion and underlying wet color pickup on every continuous dab.
- **Dual Brush Multiplication**: Dynamically multiplies primary dab footprint with secondary textured tip shapes.

### 3.2. Native Vector & Font Engines (`src/svg/quadro_svg.c`, `src/svg/quadro_font.c`)
- Scanline polygon filling with non-zero winding number or even-odd rules.
- Bézier curve stroke expansion with configurable line caps (`butt`, `round`, `square`) and joins (`miter`, `round`, `bevel`).
- Subpixel font glyph rasterization directly into layer framebuffers.

### 3.3. Audio DSP Engine (`src/quadro.c`)
- 44.1 kHz stereo audio summing bus with 8-voice polyphonic oscillators (sine, square, saw, triangle, noise).
- Real-time ADSR envelopes, resonant bi-quad filters, and delay/reverb/bitcrush/overdrive racks.
- Procedural SFXR sound generator and native RIFF/WAVE header serializer.

### 3.4. Host & Runtime Actor (`src/esenho.js`, `src/host-browser.js`)
- Manages WASM module compilation, memory resizing, and snapshot undo/redo history trees.
- `EsenhoScreenHost` handles multitouch gestures (1-finger draw, 2-finger zoom/pan/rotate, 4-finger radial pie menu, tap undo/redo).
- Viewport blitting engine with GPU/WebGL fallback or direct Canvas 2D (`desynchronized: true`, bilinear filtering).

### 3.5. Universal Scripting Platform (`src/script/*`)
- Centralized `CommandBus` dispatches actions, coordinates atomic compound undo, and provides execution interceptors and middleware.
- `MemoryBridge` grants direct zero-copy typed array access into WASM buffers.
- Domain controllers (`raster`, `vector`, `anim`, `audio`, `ui`) provide intuitive scriptable APIs.

---

## 4. UI Shell & Dockview Architecture

The Esenho Studio (`studio.html`) uses **Dockview** to provide a fully customizable, multi-window creative IDE:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Menubar & Global Transport (Project, Edit, View, Selection, Filter, Audio)  │
├──────────────┬───────────────────────────────────────────────┬──────────────┤
│ Tools &      │ Center Viewport                               │ Layer Stack  │
│ Tool Options │ - Canvas (desynchronized WebGL/2D)            │ & History    │
│              │ - SVG Scene Overlay                           │              │
│              │ - Transform Cage Controls                     ├──────────────┤
│              ├───────────────────────────────────────────────┤ Color Studio │
│              │ Bottom Dock:                                  │ & Swatches   │
│              │ - Animation DopeSheet / Timeline              │              │
│              │ - Curve Editor                                ├──────────────┤
│              │ - Audio DAW Piano Roll & Mixer                │ Properties & │
│              │ - Console REPL & Script Editor                │ Inspector    │
└──────────────┴───────────────────────────────────────────────┴──────────────┘
```

- **Skeuomorphic Theme (`skeuo`)**: Includes realistic bevels, tactile dials, brushed-metal textures, and vintage hardware styling alongside modern flat dark/light modes.
- **Snapping Contextual Menus**: Grid, node, and viewport snap options.

---

## 5. Desktop Application via Tauri (`src-tauri`)

When built as a native desktop binary:
- **Rust Backend**: Manages fast native file system dialogs, native `.esen` project file persistence, and window chrome.
- **Hardware Acceleration**: Takes advantage of native WebKit/Blink engines with direct GPU compositing and lower input latency.
