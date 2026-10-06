# Color Studio Engine & Widget

The **Color Studio** (`src/color_studio.js`) is an ultra-high-performance, zero-lag color management and selection subsystem built for Esenho. It provides pure GPU/CSS-accelerated visual picking, multi-color-space conversions, live object mutation, palette swatches, and headless-safe operation.

---

## 1. Color Math & Spaces

Color Studio is built with zero memory allocation paths and branch-optimized algorithms to ensure 60fps responsiveness during color scrubbing.

### Supported Conversions
- **RGB (`0..255`) <—> HEX (`#RRGGBB` / `#RRGGBBAA`)**
- **RGB <—> HSV (`Hue 0..360°`, `Saturation 0..100%`, `Value 0..100%`)**
- **RGB <—> HSL (`Hue 0..360°`, `Saturation 0..100%`, `Lightness 0..100%`)**
- **Named & Special States**: `none`, `transparent`.

```javascript
import ColorStudio from './src/color_studio.js';

// RGB to Hex
ColorStudio.rgbToHex(250, 189, 47); // Returns '#fabd2f'

// Hex to RGB
ColorStudio.hexToRgb('#fabd2f');    // Returns { r: 250, g: 189, b: 47, a: 1.0 }

// RGB to HSV
ColorStudio.rgbToHsv(250, 189, 47); // Returns { h: 42, s: 81.2, v: 98.0 }

// Universal parser
const parsed = ColorStudio.parseColor('transparent');
// parsed.isNone === true
```

---

## 2. Interactive ColorStudioWidget

The visual interface embeds directly into the Dockview workspace under the **Color Studio** panel.

### Features
1. **Interactive 2D Saturation-Value Canvas**: GPU/CSS gradient-backed picking field with responsive cursor tracker.
2. **Hue & Alpha Sliders**: Smooth continuous spectrum scrubbers.
3. **Target Switcher (`Fill` vs `Stroke`)**:
   - `fill`: Mutates the interior color, solid fill, or gradient stops of the selected vector shapes or raster layer tint.
   - `stroke`: Mutates the outline stroke color.
4. **None / Clear Button**: Quickly clears fill or stroke (`fill = 'none'`).
5. **Document Swatches & Palette**:
   - Palette bar displaying recently used document colors.
   - Click to assign; right-click or toggle delete mode to remove swatches.

### Mounting the Widget
```javascript
const container = document.getElementById('color-studio-dock-mount');
const widget = ColorStudio.mountColorTab(container);

// Programmatically update active color
widget.setColorFromExternal('#fe8019');

// Target stroke or fill
widget.setTarget('stroke');
widget.applyToSelected(/* pushHistory */ true);
```

---

## 3. Reactive Selection Synchronization

Color Studio continuously listens to viewport selection changes:
- When a user selects a vector shape or switches active layers, `ColorStudio.syncFromSelection()` samples the active fill and stroke properties.
- When an object color is modified in the widget, it commits changes into the undo/redo history (`pushHistory('Change Fill Color')`) and triggers immediate viewport redraws.

---

## 4. Headless Safety & Testability

Color Studio is engineered to run safely across headless environments (Node.js CI test suites and automated script batches):
- If `window` or `document` is missing, UI event listeners and DOM styling mutations are bypassed.
- Pure mathematical conversions and color mutations continue to function without throwing exceptions.
