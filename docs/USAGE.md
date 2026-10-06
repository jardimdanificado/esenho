# Esenho User Guide & Studio Manual

This manual explains how to use the **Esenho Studio** (`studio.html`) and the minimalist **Painter** (`painter.html`).

---

## 1. Workspaces: Studio vs. Painter

Esenho offers two distinct web environments depending on your creative workflow:

1. **Esenho Studio (`studio.html`)**:
   - Built on the **Dockview** docking framework.
   - Comprehensive multi-panel layout containing:
     - Central High-DPI Canvas Viewport & Vector Scene Graph.
     - Layers Stack & History Tree.
     - Color Studio & Document Swatches.
     - DopeSheet Timeline, Keyframe Tracks & Curve Editor.
     - Audio DAW Piano Roll & SFXR Sound Controls.
     - REPL Console & Universal Scripting Editor.
     - Inspector / Object Properties Panel.
   - Dockable panels can be rearranged, tabbed, split horizontally/vertically, or closed.

2. **Esenho Painter (`painter.html`)**:
   - Minimalist, distraction-free raster painting environment.
   - Optimized for tablets, iPads, graphic displays, and stylus drawing.
   - Features collapsible floating toolbars, multitouch gestures, and radial quick-action pie menus.

---

## 2. Visual Themes & Snapping Options

### Theme Switcher
Esenho supports modern and retro visual aesthetics via CSS variables:
- **Default Dark / Gruvbox Theme**: High-contrast, easy-on-the-eyes palette designed for long painting sessions.
- **Skeuomorphic Theme (`skeuo`)**: Realistic brushed-metal panels, physical tactile buttons, recessed bevels, and vintage audio hardware aesthetic.

Switch themes anytime via the Studio **View** menu or the console:
```text
theme skeuo
theme dark
```

### Contextual Menu & Snapping Options
Right-clicking anywhere on the canvas brings up the context menu:
- **Snap to Grid**: Constrains strokes and vector nodes to configurable document grid coordinates.
- **Snap to Objects / Bounding Box**: Automatically aligns vector nodes to edges and center pivots of other shapes.
- **Snap to Angle (15° / 45°)**: Locks rotation transforms and line tools to clean geometric angles.

---

## 3. The Dockview Panels

### 3.1. Canvas Viewport
- Direct WebGL/Canvas 2D blitting (`desynchronized: true`).
- Bilinear smooth interpolation for natural viewing or nearest-neighbor filtering for crisp pixel art.
- Interactive vector handles and floating transform cage.

### 3.2. Color Studio (`#dock-panel-color`)
- GPU-accelerated 2D Saturation-Value box and spectrum sliders.
- Instant switching between **Fill** and **Stroke** targets.
- Palette bar with quick add (`+ Swatch`) and delete modes.
- Color space readout in HEX, RGB, HSV, and HSL.

### 3.3. DopeSheet & Curve Editor (`#dock-panel-timeline`)
- Scrubbable frame ruler with Play/Stop transport controls.
- Track hierarchy: Transform, Fill/Material, Brush Dynamics, Camera, and Audio.
- Diamonds indicate keyframes; right-click keyframes to select easing curves:
  - `Linear`, `Ease In/Out Quad/Cubic`, `Bounce`, `Spring`, or `Custom Bézier`.
- Auto-Keyframing button (records property adjustments at the current playhead frame).

### 3.4. Layers Panel
- Stacking order (top renders above bottom).
- Drag-and-drop layer reordering.
- Blend modes: Normal, Multiply, Screen, Overlay, Color Dodge, Add.
- Opacity slider, Alpha Lock toggle, and Clipping Mask toggle.
- Layer grouping folders.

### 3.5. Audio DAW & SFXR Panel
- Tempo (BPM) control and Master volume slider.
- Multi-track synthesizer controls: Oscillator waveform (Sine, Saw, Square, Tri, Noise), ADSR envelopes, resonant filter, delay/reverb FX.
- Procedural SFXR triggers (Laser, Explosion, Powerup, Hit, Jump, Blip).
- One-click native 16-bit PCM WAV exporter.

### 3.6. Console & Script Editor
- Interactive REPL terminal executing all CLI commands.
- Multi-line JavaScript code editor with direct access to the `esenho.*` SDK.
- Macro recorder to capture and replay brush gestures or layout operations.

---

## 4. Input Interactions & Gestures

### Mouse & Stylus Controls
- **Left Click + Drag**: Draws strokes, manipulates vector paths, or drags transform handles.
- **Middle Click + Drag** / **Spacebar + Left Drag**: Smoothly pans the viewport.
- **Mouse Wheel**: Zooms centered precisely around cursor location.
- **Long Press (~300ms)**: Activates magnifying eyedropper loupe under cursor.
- **Stylus Tilt & Pressure**: Automatically maps Wacom/Apple Pencil pressure and tilt angles to brush size, opacity, and flow.

### Touchscreen Gestures (Tablets & Mobile)
- **1-Finger Drag**: Paints strokes or draws vector shapes.
- **2-Finger Pinch / Drag / Twist**: Simultaneous zoom (5% to 2000%), pan, and canvas rotation. Automatically snaps to 0° when close to horizontal.
- **2-Finger Quick Tap**: Undo.
- **3-Finger Quick Tap**: Redo.
- **4-Finger Tap / Hold**: Opens Radial Quick-Action Menu (Brush, Eraser, Smudge, Fill, Picker, Undo, Redo, Color).

---

## 5. Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |
| `Ctrl + C` | Copy selection to floating layer / clipboard |
| `Ctrl + X` | Cut selection |
| `Ctrl + V` | Paste clipboard |
| `Ctrl + A` | Select all |
| `Ctrl + D` / `Escape` | Deselect or cancel floating transform |
| `Space` + Drag | Pan viewport |
| `B` | Brush tool |
| `E` | Eraser mode |
| `G` | Fill / Paint Bucket |
| `V` | Vector selection & move tool |
| `P` | Bézier Pen tool |
| `Ctrl + \`` | Toggle REPL Console & Script Editor |
| `F` | Toggle Fullscreen |
| `[` / `]` | Decrease / Increase brush size |
