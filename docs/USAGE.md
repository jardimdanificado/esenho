# Esenho UI and Usage Documentation

## 1. Getting Started: Canvas Launcher (`index.html`)

The entry launcher configures canvas dimensions before initializing the WebAssembly environment:
- **Width (PX) & Height (PX)**: Numeric inputs accepting values from 64 to 8192 pixels.
- **Quick Presets**: Single-click resolution buttons:
  - `1280x720` (Default 720p HD)
  - `1920x1080` (1080p Full HD)
  - `800x600` (Classic 4:3)
  - `1024x1024` (1:1 Square)
  - `720x1280` (Vertical Mobile / Portrait)
  - `640x480` (Pixel Art / Retro Standard)
- **Create Canvas**: Submits configuration to `painter.html?w=<width>&h=<height>`.

---

## 2. Painter Layout Overview (`painter.html`) & Vector Studio (`studio.html`)

The studio workspace consists of four primary regions:
1. **Interactive Viewport (`#cvswrap`, `#wcanvas`)**: Hardware-accelerated canvas using `desynchronized: true` 2D context for ultra-low latency rendering. Displays background transparency checkerboard (`#222222` / `#2A2A2A`), shape guides, selection boundaries, floating transform cages, and the eyedropper loupe ring.
2. **Right Tools & Parameters Panel (`#ui-panel`)**: Collapsible accordion panel containing 10 tool categories, toggled via `Alt+B` or `Ctrl+B`.
3. **Left Console & Scripts Panel (`#panel`)**: Collapsible terminal drawer containing the REPL command-line interface and the multiline script editor. Toggled via `Ctrl+\``.
4. **Bottom Unified Mobile Dock (`#bottom-dock`)**: Resizable drawer handle with quick tabs for mobile and tablet devices (`Tools`, `Console`, `Scripts`).

---

## 3. Right Tools Panel Breakdown

### Group 1: TOOLS
- **Undo / Redo**: Step backward or forward through snapshot history.
- **Tool Selector (13 Modes)**:
  - `Brush`: Continuous freehand painting with brush dynamics.
  - `Eraser`: Alpha-depleting brush erasing pixels to transparency.
  - `Smudge`: Displaces and blurs existing pigments on the active layer.
  - `Blend`: Wet-media mixing simulating oil paint.
  - `Fill`: 4-way flood fill bounded by pixel color tolerance.
  - `Lasso`: Instant solid flood fill inside freehand drawn polygon.
  - `Picker`: Eyedropper sampling color directly into active palette.
  - `Line`: Straight line guide with live preview until mouse release.
  - `Rect`: Empty rectangle guide with live preview until mouse release.
  - `Ellipse`: Oval / circle guide with live preview until mouse release.
  - `Select`: Rectangular marquee selection.
  - `Lasso Sel`: Freehand polygonal lasso selection.
  - `Wand`: Magic Wand connected color selection.
- **Clipboard & Transform Controls**:
  - `Copy`: Copies selection onto floating layer.
  - `Cut`: Removes selected area from active layer to floating layer.
  - `Paste`: Pastes clipboard buffer onto canvas.
  - `Deselect`: Clears active selection mask.
  - `Apply Xform`: Bakes floating transform into active layer via homography projection.
  - `Cancel Xform`: Discards floating transform layer.
- **Wand Tolerance Slider**: Sets color distance cutoff (0..255) for Magic Wand selection.

### Group 2: VIEW & CANVAS
- `Zoom +` / `Zoom -`: Incrementally zooms viewport.
- `Fit`: Automatically calculates scale and centers canvas within available window space with padding.
- `100%`: Sets zoom scale to exact 1:1 pixel representation.
- `Center`: Resets pan translation without modifying zoom level.
- `0° Rot`: Resets viewport rotation angle back to 0 degrees.
- `Flip H`: Horizontally mirrors screen viewport without modifying layer pixel data. Useful for checking anatomical accuracy and composition balance.
- `Flip V`: Vertically mirrors screen viewport.
- `Pixel Grid Checkbox`: Renders pixel boundary grid lines when canvas zoom is 400% (4x) or higher.
- `UI Scale / DPI Selector`: Scales entire interface typography and controls (Auto, 75%, 85%, 100%, 115%, 125%, 150%, 175%, 200%).

### Group 3: BRUSH PARAMETERS
- `Size` (1..500 px): Base radius/diameter of the dab.
- `Opacity` (1..100%): Maximum stroke opacity cap.
- `Hardness` (0..100%): Sharpness of dab radial falloff.
- `Flow` (1..100%): Deposition rate of paint per dab.
- `Spacing` (1..200%): Distance between consecutive dabs along stroke path relative to brush size.
- `Stabilization` (0..100%): Real-time stroke stabilization removing hand tremor. Supports Streamline and Pulled String modes.
- `Streamline Midpoint` (0..100%): Interpolation tension between control points.
- `Angle` (0..359°): Fixed rotation angle of tip shape.
- `Roundness` (1..100%): Geometric squashing of tip aspect ratio.
- `Scatter` (0..200%): Perpendicular random displacement from stroke centerline.
- `Grain / Noise` (0..100%): Noise modulation intensity.
- `Smudge Pickup` (0..100%): Strength of paint drag when smudging.
- `Wetness Mix` (0..100%): Proportion of existing canvas color mixed into stroke.
- `Paint Depletion` (0..100%): Simulates ink runout over stroke length.
- `Continuous Color Pickup` (0..100%): Re-samples screen color dynamically during stroke.
- `Fill Tolerance` (0..255): Color matching tolerance for flood fill.
- `Velocity Dynamics` (0..100%): Stroke thickness and opacity modulated by cursor/finger velocity.
- `Auto-Rotate Checkbox`: Automatically aligns brush tip angle to trajectory tangent.
- `Subpixel Rendering Checkbox`: Bilinear subpixel interpolation along dab perimeters.
- `Copy Brush Script`: Generates and copies full REPL script of current brush configuration to system clipboard.

### Group 4: DYNAMICS & JITTER
- `Dab Blend Mode`: Blend mode evaluated per individual dab (Normal, Multiply, Screen, Overlay, Color Dodge, Add).
- `Symmetry Mirror`: Real-time symmetrical dab replication:
  - `Off`: Single stroke.
  - `Vertical Mirror`: Mirrors horizontally across document center X axis.
  - `Horizontal Mirror`: Mirrors vertically across document center Y axis.
  - `Quad Mirror`: 4-quadrant simultaneous reflection.
- `Taper In` (0..500 px): Gradual taper length at start of stroke.
- `Fade Distance` (0..2000 px): Distance after which stroke alpha completely extinguishes.
- `Size Jitter` (0..100%): Random size variation per dab.
- `Angle Jitter` (0..360°): Random rotation variation per dab.
- `Opacity Jitter` (0..100%): Random opacity variation per dab.
- `Color Jitter (HSV)` (0..100%): Stochastic hue/saturation variation per dab.

### Group 5: SHAPE & GRAIN
- `Tip Shape`: Selects tip mask from built-in geometry (`Circle`, `Square`, `Chisel`) or from any existing canvas layer.
- `Grain Texture`: Selects procedural grain (`Paper`, `Canvas Weave`, `Noise`, `Halftone Dots`, `Grid`, `Grunge`, `Hatch`) or image layer.
- `Texture Scale` (10..400%): Scaling factor of background grain texture.
- `Texture Rotate` (0..359°): Angular orientation of texture pattern.
- `Grain Contrast` (0..200%): Contrast curve applied to grain sampler.
- `Dual Brush Shape`: Secondary tip mask multiplied with primary dab.
- `Dual Brush Size` (10..300%): Secondary tip scale.
- `Dual Brush Spacing` (1..200%): Secondary tip dab frequency.

### Group 6: COLOR (RGB / HSL / Swatches)
- Preview box with embedded native color picker input.
- Hexadecimal text field (`#RRGGBB`).
- Sub-tabs switching between RGB sliders (`Red`, `Green`, `Blue` 0..255) and HSL sliders (`Hue` 0..360°, `Saturation` 0..100%, `Lightness` 0..100%).
- Swatch palette:
  - `+ Swatch`: Adds active color to swatch list.
  - `- Del`: Toggles deletion mode on swatches.
  - Click any swatch to load into active paint color.

### Group 7: LAYERS (Canvas & Shapes)
- `Active Layer Opacity Slider`: Direct opacity adjustment (0..100%).
- Top Toolbar:
  - `+ New`: Adds empty layer above active layer.
  - `+ Folder`: Creates organized layer folder/group.
  - `Duplicate`: Duplicates active layer buffer and properties.
  - `Clear`: Empties pixel data of active layer to full transparency.
  - `+ Import`: Loads local image file directly as new layer.
- Stacking List (Top renders over bottom):
  - `Visibility Eye`: Shows or hides layer from composite.
  - `Layer Tag`: Index, name, and pixel resolution dimensions.
  - `Active Pill`: Sets layer as active target for painting.
  - `Tip Pill`: Maps layer alpha channel as custom brush tip shape.
  - `Grain Pill`: Maps layer pattern as custom grain texture.
  - `Alpha Lock Button (Lock icon)`: Restricts drawing to existing non-transparent pixels.
  - `Clipping Mask Button (Arrow icon)`: Constrains layer render to opacity of layer below.
  - `Blend Mode Dropdown`: Normal, Multiply, Screen, Overlay, Dodge, Add.
  - `▲ / ▼ Buttons`: Reorders layer up or down in render stack.
  - `Merge Down Button`: Merges layer downward into layer directly underneath.
  - `Folder Button`: Assigns layer to or removes from group.
  - `Delete Button (X)`: Removes layer.
- Folder Headers:
  - Expand/collapse toggle arrow.
  - Folder visibility toggle affecting all child layers.
  - `+ Button`: Adds active layer into folder.
  - `X Button`: Removes folder while preserving child layers.

### Group 8: ACTIVE LAYER / CANVAS SIZE
- Current canvas and active layer dimension readout.
- Numeric inputs for Width and Height (px).
- `Scale Checkbox`: When checked, resamples existing pixel content with bilinear interpolation; when unchecked, performs center cropping.
- `Resize Button`: Commits resolution change.
- Quick Presets: `640x480`, `800x600`, `720p`, `1080p`, `1:1 Square`, `2K High`.

### Group 9: FILTERS & EXPORT
- Filter Dropdown:
  - `Blur`: Low-pass spatial blur with adjustable radius.
  - `Brightness`: Increases or decreases overall luminance.
  - `Contrast`: Enhances dark and light tonal separation.
  - `Dither`: Error-diffusion retro bitmask effect.
  - `Edge Detect`: Highlights spatial contrast transitions.
  - `Grayscale`: Converts color channels to weighted perceptual luminance.
  - `Invert`: Photonegative channel inversion.
  - `Noise`: Injects procedural grain across all channels.
  - `Pixelate`: Quantizes image into blocky pixel clusters.
  - `Sepia`: Applies warm vintage photographic tint.
  - `Threshold`: Binarizes image into pure black and white.
- Filter Radius / Parameter Slider: Adjusts kernel radius or intensity (1..25).
- `Apply`: Runs WASM filter kernel on active layer.
- `Export PNG`: Downloads flattened composite as PNG.
- `Import Image`: Prompts local file selector and imports image.

### Group 10: ADJUSTMENTS (HSV / HSL)
- `Hue Shift` (-180°..+180°): Rotates entire color wheel on active layer.
- `Saturation` (-100%..+100%): Desaturates or enriches chroma.
- `Brightness / Value` (-100%..+100%): Shifts tonal lightness.
- `Apply HSL Adjust`: Commits color transformation to layer.
- `Reset Sliders`: Restores sliders to 0.

---

## 4. Left Panel: Console & Scripts (`#panel`)

### Console Tab (`#console-view`)
- Interactive REPL terminal displaying output log and command prompt (`esenho>`).
- Auto-focused input field with command history navigation via Up and Down arrow keys.
- Command parser executes all Esenho CLI commands with status messages and syntax error reporting.

### Scripts Tab (`#ui-scripts`)
- Automation script manager backed by browser `localStorage`.
- Script selector dropdown with `+ New`, `Save`, and `Del` buttons.
- Script Name input field.
- Multiline code editor textarea:
  - Executes sequential commands one line at a time.
  - Ignores blank lines.
  - Ignores comment lines starting with `#` or `//`.
- `Run Script`: Executes entire script batch sequentially.
- `Clear`: Empties script editor.

---

## 5. Input Interactions & Multitouch Gestures

### Mouse & Stylus Controls
- **Left Click + Drag**: Draws with active tool, paints dabs, creates selection boxes, or manipulates transform handles.
- **Middle Click + Drag** or **Spacebar + Left Click + Drag**: Pans canvas viewport smoothly.
- **Mouse Wheel**: Zooms canvas in and out centered precisely around cursor position.
- **Long Press (~300ms)**: Activates magnifying eyedropper loupe under cursor.

### Touchscreen Gestures (Tablets & Mobile)
- **1-Finger Drag**: Paints continuous brush strokes, draws geometric shapes (Line, Rect, Ellipse), or creates selections (Marquee, Lasso, Wand).
- **1-Finger Hold (300ms)**: Activates magnifying eyedropper loupe directly above finger with real-time color sampling and haptic feedback.
- **2-Finger Pinch / Drag / Twist**: Viewport navigation combining zoom (5% to 2000%), two-dimensional pan, and rotation anchored to the touch midpoint. Automatically snaps to 0° rotation when close to horizontal.
- **2-Finger Quick Tap**: Triggers Undo with haptic feedback.
- **3-Finger Quick Tap**: Triggers Redo with haptic feedback.
- **4-Finger Tap / Hold**: Opens the Radial Quick-Action Menu centered on screen or under fingers, allowing instant tool switching (Brush, Eraser, Smudge, Fill, Picker, Undo, Redo, Color).
- **Floating Touch Toolbar**: Draggable 2D pill with Undo, Redo, HSV Color Picker Modal, and a dynamic parameter dropdown covering all brush parameters (Size 1-100, Opacity, Flow, Hardness, Dynamics, Jitters, Switches, and special selectors for Tip Shape layers, Grain Texture layers, and instant Script execution).
- **Bottom Dock Drawer**: Unified mobile control center for Tools, Console, and Scripts, with separated Mode (Draw, Erase, Smudge, Select) and Tool (Brush, Blend, Fill, Lasso, Picker, Line, Rect, Ellipse) buttons.

### Floating Transform Cage Handles
When a selection is copied, cut, or pasted, an interactive floating cage appears over the region:
- **Inside Body Drag**: Translates floating layer.
- **Corner Handles**: Scales and distorts perspective.
- **Mid-edge Handles**: Skews and shears along X or Y axis.
- **Top Rotation Handle**: Rotates floating selection freely around center.
- **Commit / Abort**: Click `Apply Xform` to bake into WASM layer, or `Cancel Xform` / press `Escape` to discard.

---

## 6. Global Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Z` | Undo last stroke or action |
| `Ctrl + Y` or `Ctrl + Shift + Z` | Redo last undone action |
| `Ctrl + C` | Copy selection to floating layer |
| `Ctrl + X` | Cut selection to floating layer |
| `Ctrl + V` | Paste clipboard to canvas |
| `Ctrl + A` | Select entire canvas |
| `Ctrl + D` or `Escape` | Clear selection or cancel transform |
| `Ctrl + \`` | Toggle left Console / Scripts drawer |
| `Alt + B`, `Ctrl + B`, `Alt + U`, or `Ctrl + U` | Toggle right Tools & Parameters panel |
| `Up / Down Arrows` | In Console prompt: navigate command history |

> **Note:** Undo, redo, copy, cut, select-all, and deselect shortcuts are suppressed while a text input or textarea is focused, to avoid interfering with normal text editing.

