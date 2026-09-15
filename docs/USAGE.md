# Esenho UI and Usage Documentation

## 1. Getting Started: Project Gallery & Launcher (`index.html`)

The entry launcher manages project creation, local storage in IndexedDB (`EsenhoDB`), and file I/O:
- **Project Gallery**:
  - Displays all saved projects with live metadata (name, resolution, creation and last-modified dates).
  - **Open**: Launches the canvas studio (`app.html?project=<id>`).
  - **Rename**: Renames the project within IndexedDB.
  - **Export .esen**: Downloads complete project savefile with all layers, scripts, groups, and parameters.
  - **Export PNG**: Renders and downloads composite PNG image directly from the project gallery without opening the studio.
  - **Delete**: Removes project from local IndexedDB storage with confirmation.
- **New Project Form**:
  - **Width (PX) & Height (PX)**: Numeric inputs accepting values from 64 to 8192 pixels.
  - **Quick Presets**: `1280x720` (720p HD), `1920x1080` (1080p Full HD), `800x600` (4:3), `1024x1024` (1:1 Square), `720x1280` (Mobile Portrait), `640x480` (Pixel Art).
  - **Create Project**: Initializes project in IndexedDB and opens `app.html`.
- **Import .esen**: File input to load existing `.esen` project files into IndexedDB.
- **Version Badge**: Real-time project version synchronization with `package.json`.

---

## 2. Studio Layout Overview (`app.html`)

The studio workspace consists of four primary regions:
1. **Interactive Viewport (`#cvswrap`, `#wcanvas`)**: Hardware-accelerated canvas using `desynchronized: true` 2D context for ultra-low latency rendering. Displays background transparency checkerboard (`#222222` / `#2A2A2A`), shape guides, selection boundaries, floating transform cages, and the eyedropper loupe ring.
   - **Canvas Status Bar (`#cvs-status-bar` / `#wstatus`)**: Positioned at bottom-left of viewport showing pointer coordinates `(x, y)`, canvas dimensions `(W x H)`, zoom level `(Z%)`, and tool mode.
   - **Canvas Script Editor (`#canvas-script-editor`)**: Full-canvas monospace overlay activated when a script layer is set to `Active`. Allows editing script code directly over the canvas with `Save` and `Cancel` buttons.
2. **Right Tools & Parameters Panel (`#ui-panel`)**: Collapsible accordion panel containing 10 tool categories, toggled via `Alt+B` or `Ctrl+B`.
   - **Project Section**: Contains `Save` button (forces instant autosave), `Home` button (autosaves and returns to gallery), and live autosave status badge (`Saved`, `Saving...`, `Unsaved`, `Save Error`).
3. **Left Console Panel (`#panel`)**: Collapsible terminal drawer (`3. Console`) containing the REPL command-line interface. Toggled via `Ctrl+\``.
4. **Bottom Unified Mobile Dock (`#bottom-dock`)**: Resizable drawer handle with quick tabs for touch devices (`Tools`, `Layers`, `Console`, `Filters`).

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
- `Smoothing` (0..100%): Real-time stroke stabilization removing hand tremor.
- `Bézier Midpoint` (0..100%): Interpolation tension between control points.
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
- `Pressure & Tilt Dynamics`: Wacom/Apple Pencil pressure sensitivity for size and flow, stylus tilt angle dynamics.
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

### Group 7: LAYERS & CANVAS (Unified First-Class System)
- `Active Layer Opacity Slider`: Direct opacity adjustment (0..100%).
- **Top Toolbar**:
  - `+ New`: Adds empty drawing layer above active layer.
  - `+ Folder`: Creates organized layer folder/group.
  - `+ Script`: Creates new automation script in layers list.
  - `+ Filter`: Prompts file dialog to load custom `.wasm` filter plugin into layers list.
  - `Duplicate`: Duplicates active layer buffer and properties.
  - `Clear`: Empties pixel data of active layer to full transparency.
  - `+ Import`: Loads local image file directly as new layer.
- **Unified Layer Stack**:
  - **Drawing Layer Row**:
    - Visibility toggle (`V` / `-`).
    - Name and dimensions (double-click to rename).
    - `Active`: Sets layer as active painting target.
    - `ALock`: Alpha lock toggle (prevents modifying transparent pixels).
    - `Clip`: Clipping mask toggle (constrains render to opacity of layer below).
    - `Blend Mode`: Dropdown (Normal, Multiply, Screen, Overlay, Dodge, Add).
    - `^` / `v`: Reorder layer position.
    - `[-]` / `[+]`: Remove from or assign to folder.
    - `x`: Delete layer.
  - **Script Row (`SCR` badge)**:
    - `Active`: Opens/closes full canvas text editor.
    - `Run`: Executes script batch commands directly on active drawing layer.
    - `^` / `v`: Reorder script.
    - `[-]` / `[+]`: Remove from or assign to folder (default: `scripts/`).
    - `x`: Delete script.
  - **WASM Filter Row (`FLT` badge)**:
    - `Apply`: Runs WASM filter kernel on active drawing layer.
    - `^` / `v`: Reorder filter.
    - `[-]` / `[+]`: Remove from or assign to folder (default: `plugins/`).
    - `x`: Delete/unload filter plugin.
- **Default System Folders**:
  - `tips/`: Layer-based brush tips.
  - `grains/`: Layer-based grain textures.
  - `scripts/`: Stored automation scripts.
  - `plugins/`: Compiled WASM filter plugins.

### Group 8: ACTIVE LAYER / CANVAS SIZE
- Current canvas and active layer dimension readout.
- Numeric inputs for Width and Height (px).
- `Scale Checkbox`: When checked, resamples existing pixel content with bilinear interpolation; when unchecked, performs center cropping.
- `Resize Button`: Commits resolution change.
- Quick Presets: `640x480`, `800x600`, `720p`, `1080p`, `1:1 Square`, `2K High`.

### Group 9: FILTERS & EXPORT
- Filter Dropdown:
  - `Blur`, `Brightness`, `Contrast`, `Dither`, `Edge Detect`, `Grayscale`, `Invert`, `Noise`, `Pixelate`, `Sepia`, `Threshold`.
- Filter Radius / Parameter Slider: Adjusts kernel radius or intensity.
- `Apply`: Runs selected WASM filter kernel on active layer.
- `Load Plugin`: Uploads external `.wasm` plugin.

### Group 10: ADJUSTMENTS (HSV / HSL)
- `Hue Shift` (-180°..+180°): Rotates entire color wheel on active layer.
- `Saturation` (-100%..+100%): Desaturates or enriches chroma.
- `Brightness / Value` (-100%..+100%): Shifts tonal lightness.
- `Apply HSL Adjust`: Commits color transformation to layer.
- `Reset Sliders`: Restores sliders to 0.

---

## 4. Left Panel: Console (`#panel`)

- **Terminal Drawer (`3. Console`)**:
  - Interactive REPL terminal displaying output log and command prompt (`esenho>`).
  - Auto-focused input field with command history navigation via Up and Down arrow keys.
  - Command parser executes all Esenho CLI commands (`help`, `status`, `list`, `brush`, `layer`, `filter`, `clear data`, etc.).
  - Syntax error highlighting in terminal log.

---

## 5. Input Interactions & Multitouch Gestures

### Mouse & Stylus Controls
- **Left Click + Drag**: Draws with active tool, paints dabs, creates selection boxes, or manipulates transform handles.
- **Middle Click + Drag** or **Spacebar + Left Click + Drag**: Pans canvas viewport smoothly.
- **Mouse Wheel**: Zooms canvas in and out centered precisely around cursor position.
- **Long Press (~300ms)**: Activates magnifying eyedropper loupe under cursor.
- **Stylus Pressure & Tilt**: Dynamically scales dab size/flow and aligns tip angle.

### Touchscreen Gestures (Tablets & Mobile)
- **1-Finger Drag**: Paints brush strokes, shapes, or selections.
- **1-Finger Hold (~300ms)**: Displays circular eyedropper ring (`#eyedropper-ring`) sampling screen colors under finger.
- **2-Finger Pinch**: Continuous zoom scaling between 5% and 2000%.
- **2-Finger Drag**: Fluid two-dimensional viewport panning.
- **2-Finger Twist**: Smooth viewport rotation around touch midpoint with built-in deadzone and damping to eliminate tremor.
- **2-Finger Quick Tap**: Triggers `Undo`.
- **3-Finger Quick Tap**: Triggers `Redo`.

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
| `Ctrl + \`` | Toggle left Console drawer |
| `Alt + B` or `Ctrl + B` | Toggle right Tools & Parameters panel |
| `Up / Down Arrows` | In Console prompt: navigate command history |

