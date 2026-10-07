# Material & Color Studio Engine & Widget

The **Material & Color Studio** (`src/color_studio.js`) is an ultra-high-performance, zero-lag material management, procedural generation, and color subsystem built for Esenho. It unifies solid flat colors, linear and radial multi-stop gradients, procedural surface textures (70+ modes), WASM optical lenses and filters (28+ plugins), and material preset libraries into a single dedicated dockview studio.

---

## 1. Unified Material Architecture

Materials in Esenho encapsulate all visual surface properties of an object or layer:
1. **Color (Flat/Solid)**: Pure GPU/CSS-accelerated visual picking, HSV/RGB/HSL sliders, document color swatches, and palettes (Gruvbox, Material Design, Nord, Cyberpunk, Monochrome).
2. **Gradient**: Multi-stop Linear and Radial gradients with HDR intensity multipliers, angle/radius controls, and interactive color stop editing.
3. **Texture**: 70+ built-in procedural texture modes (paper, canvas, halftone, wood, marble, clouds, cyber circuits, manga tones, etc.) with grain, relative/world origin, warp wave, noise jitter, swirl vortex, and cel posterization.
4. **WASM FX**: 28+ optical lenses and image kernels (Bloom, Kuwahara oil painting, VHS glitch, Frosted Glass, CRT scanlines, chromatic aberration, etc.) targeted directly to fill surface, stroke outline, or backdrop lenses.
5. **Presets**: 1-click material styles with instant preview chips and custom user preset saving (`localStorage`).

---

## 2. Color Math & Spaces

Color Studio is built with zero memory allocation paths and branch-optimized algorithms to ensure 60fps responsiveness during scrubbing.

### Supported Conversions
- **RGB (`0..255`) <—> HEX (`#RRGGBB` / `#RRGGBBAA`)**
- **RGB <—> HSV (`Hue 0..360°`, `Saturation 0..100%`, `Value 0..100%`)**
- **RGB <—> HSL (`Hue 0..360°`, `Saturation 0..100%`, `Lightness 0..100%`)**
- **Named & Special States**: `none`, `transparent`.

```javascript
import { ColorStudio, MaterialsStudio } from './src/color_studio.js';

// RGB to Hex
ColorStudio.rgbToHex(250, 189, 47); // Returns '#fabd2f'

// Hex to RGB
ColorStudio.hexToRgb('#fabd2f');    // Returns { r: 250, g: 189, b: 47, a: 1.0 }

// RGB to HSV
ColorStudio.rgbToHsv(250, 189, 47); // Returns { h: 42, s: 81, v: 98 }
```

---

## 3. Interactive Material & Color Studio Widget

The visual interface embeds directly into the Dockview workspace under the **Materials** panel.

### Target Switcher
- `Fill`: Mutates interior fill color, gradient, procedural texture, or WASM filter.
- `Stroke`: Mutates outline stroke color, texture, or brush filter.
- `Back`: Mutates canvas backdrop background color.
- `Swap (⇄)`: Instantly swaps fill and stroke attributes.
- `None (⊘)`: Sets target fill or stroke to transparent/none.

### Mounting the Widget
```javascript
const container = document.getElementById('materials-studio-dock-mount');
const widget = MaterialsStudio.mountMaterialsTab(container);

// Programmatically update active color
widget.setColorFromExternal('#fe8019');

// Target stroke or fill
widget.setTarget('fill');
widget.switchMode('gradient');
widget.applyToSelected(/* pushHistory */ true);
```

---

## 4. Reactive Selection Synchronization

Material Studio continuously listens to viewport selection changes:
- When selecting objects or switching active layers, `syncFromSelection()` samples the active fill, stroke, gradient, texture, and filter properties with zero lag.
- When any property is scrubbed or modified in the widget, it updates the viewport in real time and commits to undo/redo history (`pushHistory`).

---

## 5. Headless Safety & Testability

Material Studio is engineered to run safely across headless environments (Node.js CI test suites):
- DOM manipulations are safely guarded when running in non-browser runtimes.
- Math conversions, material state management, and direct object mutations run without errors.
