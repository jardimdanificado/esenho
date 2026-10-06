# Esenho Documentation

> **Esenho** is a high-performance, WebAssembly-accelerated creative studio combining professional raster painting, SVG vector pathfinding & boolean modeling, parametric dopesheet animation, native audio DSP synthesis, and a unified universal scripting SDK.

---

## Architecture Overview

```
                                 ┌─────────────────────────────────────────┐
                                 │       Esenho Studio / Painter UI        │
                                 │    (studio.html / painter.html / Tauri) │
                                 └────────────────────┬────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       ▼                                                             ▼
           ┌──────────────────────┐                                      ┌──────────────────────┐
           │ Universal Script SDK │                                      │   UI & Dockview      │
           │    (esenho.* API)    │                                      │ (Dockable Workspaces)│
           └───────────┬──────────┘                                      └──────────────────────┘
                       │
       ┌───────────────┼───────────────┬─────────────────┬─────────────────┐
       ▼               ▼               ▼                 ▼                 ▼
 ┌───────────┐   ┌───────────┐   ┌───────────┐     ┌───────────┐     ┌───────────┐
 │  Raster   │   │  Vector   │   │ Animation │     │ Audio DAW │     │   Color   │
 │  Domain   │   │  Domain   │   │ DopeSheet │     │  Domain   │     │  Studio   │
 └─────┬─────┘   └─────┬─────┘   └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
       │               │               │                 │                 │
       └───────────────┼───────────────┴─────────────────┼─────────────────┘
                       ▼                                 ▼
         ┌───────────────────────────┐     ┌───────────────────────────┐
         │ Quadro Core (C99 / WASM)  │     │ 28+ WASM Filter Plugins   │
         │ - 32-bit ARGB Canvas      │     │ (Bloom, Blur, Glitch,     │
         │ - Procedural Brush Tips   │     │  Chromatic, Dither, etc.) │
         │ - Native Path & Font      │     └───────────────────────────┘
         │ - Polyphonic Synth & SFXR │
         └───────────────────────────┘
```

---

## Documentation Index

| Document | Description |
| :--- | :--- |
| **[Architecture Guide](ARCHITECTURE.md)** | Deep architectural dive into the WASM core, linear memory layout, Actor model, Command Bus, and desktop Tauri bridge. |
| **[Universal Scripting SDK](SCRIPTING_SDK.md)** | Complete reference for the `esenho.*` JavaScript SDK: namespaces, Command Bus, atomic transactions, macro recording, and hook pipelines. |
| **[Animation & DopeSheet](ANIMATION_DOPESHEET.md)** | Timeline director, 144 Quadro interpolable parameters, multi-clip animation, easing curves, Bézier solvers, 2D CCD-IK, mesh warp, Flash runtime, and GIF/WebM export. |
| **[Vector Engine](VECTOR_ENGINE.md)** | SVG scene graph, Bézier path modeling, polygon boolean operations (Union, Subtract, Intersect, XOR), path simplification, and native C rasterization. |
| **[Audio DSP](AUDIO_DSP.md)** | Native C audio synthesizer, polyphonic voices, ADSR envelopes, filters, procedural SFXR sound effects, and native 16-bit PCM WAV exporter. |
| **[Color Studio](COLOR_STUDIO.md)** | Color spaces (RGB, HSV, HSL, Hex, OKLCH, Lab), color theory harmonies, palette generators, ramps, and reactive UI integration. |
| **[WASM Filter Plugins](PLUGINS.md)** | Complete catalog of all 28+ WASM image filter kernels, C ABI signatures, memory safety guidelines, and tutorial on writing custom plugins. |
| **[C ABI & Core API](API.md)** | Low-level C99 WASM export functions, `quadro.h` structs, brush dynamic opcodes, memory layout, and CLI REPL command reference. |
| **[User Guide & Workspaces](USAGE.md)** | Guide to the Studio workspace, Dockview panel management, themes (Modern & Skeuomorphic), snapping menu, gesture controls, and shortcuts. |

---

## Quickstart

### Running the Web Studio
To start the studio locally:
```bash
# Serve the repository with any HTTP server
npx serve .
# Or with Python
python3 -m http.server 8080
```
Open your browser at:
- `http://localhost:8080/studio.html` for the multi-panel Dockview Studio.
- `http://localhost:8080/painter.html` for the focused, standalone painting canvas.

### Running Test Suite
Esenho includes an extensive automated test suite covering all domains:
```bash
npm test
```
This executes:
1. `test_text_protocol.js` — Text serialization, CLI commands, and brushes.
2. `test_vector.js` — Vector object model and Bézier nodes.
3. `test_animation.js` — Timeline, inverse kinematics, and mesh warp.
4. `test_animator_runtime.js` — Flash-like runtime and symbol hierarchy.
5. `test_dopesheet_parameters.mjs` — 144 Quadro parameters, easing, and multi-clips.
6. `test_universal_scripting_api.js` — SDK `esenho.*`, command bus, transactions.
7. `test_native_core.js` — Native audio DSP, vector path rasterizer, and font engine.
8. `test_color_studio.js` — Color conversions and studio synchronization.

### Desktop App (Tauri)
Esenho can run as a high-performance native desktop application:
```bash
cargo tauri dev
```
(Requires Rust and Tauri CLI installed).
