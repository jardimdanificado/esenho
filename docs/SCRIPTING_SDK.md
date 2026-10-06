# Universal Esenho Scripting Platform SDK (`esenho.*`)

The **Esenho SDK** (`src/script/esenho_sdk.js`) exposes a unified, zero-copy, reactive JavaScript API that gives full programmatic control over all engines of the Esenho platform:
- **Raster Domain** (`esenho.raster`): Quadro C/WASM pixel engine, brush dynamics, layers, filters, selections.
- **Vector Domain** (`esenho.vector`): SVG scene graph, Bézier curves, boolean path operations, text.
- **Animation Domain** (`esenho.anim`): Stage, timeline tracks, keyframes, interpolations, MovieClips, Flash runtime.
- **Audio Domain** (`esenho.audio`): Native C audio synth, polyphony, SFXR triggers, DAW tracks, WAV exporter.
- **UI Domain** (`esenho.ui`): Dockview panels, custom tools, dynamic keybindings, toasts.
- **Command Bus** (`esenho.commands`): Atomic transactions, macro recording, undo/redo tree, middleware.
- **Memory Bridge** (`esenho.memory`): Zero-copy direct access to WebAssembly linear memory and framebuffers.
- **Hook Registry** (`esenho.hooks`): Priority-based and waterfall lifecycle interceptors.

---

## 1. Getting Started

### Accessing the SDK in the Environment
In the browser UI (Console, Script Editor, or devtools console), the instance is available globally via `window.esenho` or passed into the REPL script context:

```javascript
// Access current brush size and mutate it
console.log(esenho.raster.brush.size);
esenho.raster.brush.size = 35;
esenho.raster.brush.color = 0xFFFF0000; // ARGB Red
```

### Script Execution (`esenho.eval`)
Any arbitrary JavaScript string can be evaluated dynamically inside the platform sandbox:

```javascript
esenho.eval(`
  // Draw a red rectangle in vector space
  const rect = vector.createRect(100, 100, 200, 150, {
    fill: '#ff5533',
    stroke: '#000000',
    strokeWidth: 2
  });

  // Switch brush to 40px and paint
  raster.brush.size = 40;
`);
```

---

## 2. Command Bus & Transactions (`esenho.commands`)

Every user action, script mutation, and state modification is dispatched through the centralized **Command Bus** (`src/script/command_bus.js`).

### Dispatching Commands
```javascript
esenho.commands.dispatch('raster.setBrushParam', { key: 'size', value: 50 });
```

### Atomic Transactions (Compound Undo/Redo)
Use `transaction` to group multiple operations so they appear as a single entry in the undo/redo history stack:

```javascript
esenho.commands.transaction('Draw Complex Shape', () => {
  esenho.vector.createRect(50, 50, 100, 100, { fill: '#336699' });
  esenho.vector.createEllipse(150, 150, 40, 40, { fill: '#993366' });
  esenho.raster.brush.size = 25;
});

// Single undo reverts BOTH creations and the brush change
esenho.commands.undo();
```

### Macro Recording
Record runtime actions and export them as reproducible scripts:
```javascript
esenho.commands.startRecording();

// User or script executes actions...
esenho.raster.brush.size = 35;
esenho.raster.brush.color = 0xFF00FF00;

const macro = esenho.commands.stopRecording();
console.log(macro.toScript());
// Outputs:
// esenho.raster.brush.size = 35;
// esenho.raster.brush.color = 4278255360;
```

### Middleware and Interceptors
Intercept or reject commands before they mutate state:
```javascript
// Add logging middleware
esenho.commands.use((cmd, next) => {
  console.log(`[Command] ${cmd.name}`, cmd.payload);
  return next(cmd);
});

// Intercept specific command
esenho.commands.intercept('raster.deleteLayer', (payload) => {
  if (esenho.raster.layers.count <= 1) {
    console.warn('Cannot delete the last remaining canvas layer!');
    return false; // Blocks execution
  }
  return true;
});
```

---

## 3. Raster Domain (`esenho.raster`)

Deep programmatic interface over Quadro C99/WASM pixel engine.

### Brush Controls (`esenho.raster.brush`)
| Property | Type | Description |
| :--- | :--- | :--- |
| `size` | `number` (1..500) | Main dab diameter in document pixels |
| `opacity` | `number` (0..100) | Maximum opacity per stroke |
| `hardness` | `number` (0..100) | Edge sharpness (Gaussian feathering) |
| `flow` | `number` (0..100) | Pigment deposit rate per step |
| `spacing` | `number` (1..200) | Spacing percentage relative to dab size |
| `angle` | `number` (0..359) | Base rotation of non-circular brush tips |
| `roundness` | `number` (1..100) | Aspect ratio of dab (100 = round, 1 = slit) |
| `color` | `number` | ARGB 32-bit color integer (`0xAARRGGBB`) |
| `jitterSize` | `number` (0..100) | Random size variation per dab |
| `jitterAngle`| `number` (0..100) | Random angle scatter |
| `jitterScatter`| `number` (0..100)| Spatial scatter displacement from path |
| `blendMode` | `number` (0..5) | 0=Normal, 1=Multiply, 2=Screen, 3=Overlay, etc. |

```javascript
esenho.raster.brush.size = 45;
esenho.raster.brush.hardness = 80;
esenho.raster.brush.color = 0xFF2277EE;
```

### Layer Management (`esenho.raster.layers`)
| Method / Property | Description |
| :--- | :--- |
| `layers.count` | Total active layers |
| `layers.activeIndex` | Currently selected layer index |
| `layers.create(width, height)` | Allocates new layer and returns its index |
| `layers.delete(index)` | Removes layer |
| `layers.duplicate(index)` | Clones layer pixels and metadata |
| `layers.clear(index)` | Fills layer with transparent zeroes |
| `layers.mergeDown(index)` | Merges layer with layer below |
| `layers.reorder(from, to)` | Changes render stacking order |
| `layers.setOpacity(idx, val)` | Sets opacity (0..100) |
| `layers.setBlendMode(idx, mode)` | Sets blend mode (0..5) |
| `layers.setVisibility(idx, bool)`| Sets layer visibility |
| `layers.setAlphaLock(idx, bool)` | Protects transparent pixels |

### Filters & Selection
```javascript
// Apply WASM filter to active layer
esenho.raster.filters.apply('bloom', { radius: 10, intensity: 1.5 });
esenho.raster.filters.apply('chromatic', { offset: 6 });

// Marquee Selection
esenho.raster.selection.rect(100, 100, 300, 200);
esenho.raster.selection.invert();
esenho.raster.selection.clear();
```

---

## 4. Vector Domain (`esenho.vector`)

Manipulates shapes, compound Bézier curves, Boolean geometry, and SVG nodes.

### Creating Shapes
```javascript
// Create Rectangle
const rect = esenho.vector.createRect(50, 50, 200, 100, {
  fill: '#ff9900',
  stroke: '#222222',
  strokeWidth: 3,
  cornerRadius: 8
});

// Create Ellipse / Circle
const circle = esenho.vector.createEllipse(300, 200, 80, 80, {
  fill: '#00ccaa'
});

// Create Custom Bézier Path
const path = esenho.vector.createPath('M 10 80 Q 52.5 10, 95 80 T 180 80', {
  stroke: '#e74c3c',
  strokeWidth: 4,
  fill: 'none'
});
```

### Boolean Operations (`svg_boolean.js`)
Perform constructive solid geometry (CSG) on vector shapes:
```javascript
// Supported operations: 'union', 'subtract', 'intersect', 'xor'
const combinedShape = esenho.vector.booleanOp('union', shapeA, shapeB);
const punchedHole = esenho.vector.booleanOp('subtract', backgroundShape, holeShape);
```

### Path Simplification & SVG Export
```javascript
// Simplify dense path using Ramer-Douglas-Peucker algorithm
esenho.vector.simplifyPath(densePath, /* tolerance */ 2.0);

// Export full vector document as SVG string
const svgXml = esenho.vector.exportSvg();
```

---

## 5. Animation Domain (`esenho.anim`)

Interacts with the DopeSheet timeline, MovieClips, and Flash-like runtime.

```javascript
// Playback transport
esenho.anim.fps = 30;
esenho.anim.play();
esenho.anim.stop();
esenho.anim.gotoAndPlay(15);

// Add clip and keyframes
const clip = esenho.anim.createClip('WalkCycle');
esenho.anim.addTrack('WalkCycle', 'rotation', 'arm_bone');
esenho.anim.addKeyframe('WalkCycle', 'rotation', 0, 0, 'linear');
esenho.anim.addKeyframe('WalkCycle', 'rotation', 15, 45, 'easeInOutQuad');
esenho.anim.addKeyframe('WalkCycle', 'rotation', 30, 0, 'easeInOutQuad');

// Export standalone interactive HTML5 bundle
const htmlBundle = esenho.anim.exportHtml5();
```

---

## 6. Audio Domain (`esenho.audio`)

Native C polyphonic synthesizer and procedural SFXR engine.

```javascript
// Transport & Tempo
esenho.audio.setBpm(128);
esenho.audio.play();

// DAW Tracks & Synthesizer
const leadTrack = esenho.audio.createTrack('Lead Synth', 'synth');

// Play polyphonic MIDI chord (Track 0, MIDI note, Velocity 0..1)
esenho.audio.noteOn(0, 60, 0.8); // C4
esenho.audio.noteOn(0, 64, 0.8); // E4
esenho.audio.noteOn(0, 67, 0.8); // G4

// Stop note
esenho.audio.noteOff(0, 60);

// Trigger procedural sound effects (SFXR preset, volume)
// 0=Laser, 1=Explosion, 2=Powerup, 3=Hit, 4=Jump, 5=Blip
esenho.audio.triggerSfxr(0, 1.0); // Laser SFX

// Export 16-bit PCM WAV audio buffer
const wavArrayBuffer = esenho.audio.exportWav(/* totalFrames */ 44100 * 4); // 4 seconds
```

---

## 7. UI Domain (`esenho.ui`)

Extend the Studio interface with custom panels, tools, and shortcuts.

```javascript
// Register a custom dockable Dockview panel
esenho.ui.registerPanel('metadata-inspector', 'Metadata Inspector', (container) => {
  container.innerHTML = `
    <div style="padding: 10px; color: var(--fg);">
      <h3>Scene Metadata</h3>
      <p>Layers: ${esenho.raster.layers.count}</p>
      <p>Vector Shapes: ${esenho.vector.objects.length}</p>
    </div>
  `;
});

// Bind custom keyboard shortcuts
esenho.ui.bindKey('Ctrl+Shift+K', () => {
  esenho.raster.layers.create(800, 600);
  console.log('New layer created via custom shortcut!');
});
```

---

## 8. Memory Bridge (`esenho.memory`)

Provides zero-copy, direct typed array views into WASM linear memory:

```javascript
// Obtain direct Uint32Array view of active layer framebuffer
const pixels = esenho.memory.getLayerPixels(0);
console.log('Top-left pixel 0xAARRGGBB:', pixels[0].toString(16));

// Fast direct pixel manipulation
for (let i = 0; i < 100; i++) {
  pixels[i] = 0xFFFF0000; // Red
}

// Request composite recomposition
esenho.memory.markDirty();
```
