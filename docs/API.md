# Esenho API Documentation

## 1. System Architecture

Esenho is an extensible digital painting engine built on WebAssembly and high-performance raster algorithms:
- **Core WASM Engine (`roms/canvas.wasm`)**: Written in C99, compiled to WebAssembly without libc dependencies. Manages linear memory, unified multi-layer framebuffers, parametric dab rendering, procedural grain sampling, integer math, and dirty-rect composite generation.
- **Header & ABI (`include/esenho.h`)**: Universal interface defining brush engine parameters, layer structures, color conversions, and filter ABI.
- **Host & Runtime Actor (`src/esenho.js`)**: Executes in Node.js and modern browsers. Implements `EsenhoScreenHost`, `EsenhoModule`, state management, undo/redo snapshot trees, clipboard, and the `papagaio` pattern-matching CLI compiler.
- **Filter Plugins (`plugins/*.wasm`)**: Standalone WASM modules implementing image processing kernels (`blur`, `brightness`, `contrast`, `dither`, `edge`, `grayscale`, `invert`, `noise`, `pixelate`, `sepia`, `threshold`).
- **Browser Host (`src/host-browser.js`)**: Glues the canvas element, multitouch gesture recognition, direct WebGL/2D blitting (`desynchronized: true`), and UI controls to the WASM core.

---

## 2. WebAssembly C ABI Reference

### Memory Layout & Framebuffer Types

All canvas layers, imported images, and custom tip/grain textures share the unified `layer_t` descriptor:

```c
typedef struct {
    uint32_t *pixels;    /* Linear ARGB pixel buffer (0xAABBGGRR) */
    int32_t  width;     /* Width in pixels */
    int32_t  height;    /* Height in pixels */
    int32_t  x;         /* Document X coordinate */
    int32_t  y;         /* Document Y coordinate */
    uint8_t  visible;   /* 1 = rendered in composite, 0 = offscreen/masked */
    uint8_t  opacity;   /* Layer alpha multiplier (0..255) */
    uint8_t  in_use;    /* 1 = slot allocated */
    uint8_t  alpha_lock;/* 1 = prevent modification of alpha channel */
    uint8_t  clipping;  /* 1 = clip render to visible pixels of layer below */
    uint8_t  blend_mode;/* Layer blend mode (0..5) */
} layer_t;

typedef struct {
    uint32_t *pixels;
    int32_t width;
    int32_t height;
} wframebuffer_t;
```

---

### Enumerations & Parameter Constants

#### Operating Modes (`W_MODE_*`)
- `0` (`W_MODE_DRAW`): Standard brush stroke with additive dab accumulation.
- `1` (`W_MODE_SMUDGE`): Displaces and smears pixels already present on the layer.
- `2` (`W_MODE_BLEND`): Wet-media blend combining active color with existing canvas pigment.
- `3` (`W_MODE_FILL`): 4-way flood fill with color tolerance.
- `4` (`W_MODE_LASSO_FILL`): Solid fill enclosed within arbitrary polygon coordinates.
- `5` (`W_MODE_PICKER`): Color sampler / eyedropper tool.
- `6` (`W_MODE_LINE`): Geometric straight line guide.
- `7` (`W_MODE_RECT`): Geometric rectangle guide.
- `8` (`W_MODE_ELLIPSE`): Geometric ellipse guide.
- `9` (`W_MODE_SELECT`): Marquee bounding box selection.

#### Base Shapes (`W_SHAPE_*`)
- `0` (`W_SHAPE_CIRCLE`): 64x64 circle mask.
- `1` (`W_SHAPE_SQUARE`): 64x64 square mask.
- `2` (`W_SHAPE_CHISEL`): 64x64 horizontal ribbon calligraphic mask.
- `>= 3`: Any layer index mapped as tip mask via alpha channel.

#### Parameter IDs (`W_PARAM_*`)
| ID | Constant | Range / Type | Description |
|---|---|---|---|
| 1 | `W_PARAM_SIZE` | 1..500 | Brush base radius/size in pixels |
| 2 | `W_PARAM_OPACITY` | 0..100 | Stroke maximum alpha cap percentage |
| 3 | `W_PARAM_HARDNESS` | 0..100 | Radial edge falloff steepness |
| 4 | `W_PARAM_FLOW` | 1..100 | Alpha deposition rate per dab |
| 5 | `W_PARAM_SPACING` | 1..200 | Distance between dabs relative to brush size (%) |
| 6 | `W_PARAM_ANGLE` | 0..359 | Static tip rotation in degrees |
| 7 | `W_PARAM_ROUNDNESS` | 1..100 | Aspect ratio squashing (%) |
| 8 | `W_PARAM_SCATTER` | 0..200 | Random orthogonal scatter (%) |
| 9 | `W_PARAM_TOLERANCE` | 0..255 | Color distance tolerance for flood fill |
| 10 | `W_PARAM_SMUDGE` | 0..100 | Smudge strength and drag persistence |
| 11 | `W_PARAM_WETNESS` | 0..100 | Wet paint blending ratio |
| 12 | `W_PARAM_GRAIN` | 0..100 | Procedural grain intensity |
| 13 | `W_PARAM_TEX_MODE` | 0..7 | Procedural texture pattern ID (0=off, 1=paper, 2=canvas, 3=noise, 4=dots, 5=grid, 6=grunge, 7=hatch) |
| 14 | `W_PARAM_SHAPE` | int32 | Tip shape index (0..2 or layer index) |
| 15 | `W_PARAM_MODE` | 0..9 | Tool operating mode index |
| 16 | `W_PARAM_TEX_ANGLE` | 0..359 | Texture angle in degrees |
| 17 | `W_PARAM_TEX_SCALE` | 10..400 | Texture scale percentage |
| 18 | `W_PARAM_TEX_LAYER` | int32 | Layer index mapped as grain texture (-1 = none) |
| 19 | `W_PARAM_SMOOTH` | 0..100 | Exponential stroke smoothing / stabilization |
| 20 | `W_PARAM_MIDPOINT` | 0..100 | Quadratic/cubic Bezier midpoint tension (default 50) |
| 21 | `W_PARAM_TEX_CONTRAST` | 0..200 | Texture grain contrast curve |
| 22 | `W_PARAM_AUTO_ROTATE` | 0 or 1 | Rotate tip along stroke trajectory tangent |
| 23 | `W_PARAM_VELOCITY` | 0..100 | Velocity dynamics sensitivity |
| 24 | `W_PARAM_TAPER_IN` | 0..500 | Taper length at stroke start (pixels) |
| 25 | `W_PARAM_TAPER_OUT` | 0..500 | Taper length at stroke end (pixels) |
| 26 | `W_PARAM_FADE` | 0..5000 | Stroke fadeout distance (pixels) |
| 27 | `W_PARAM_SIZE_JITTER` | 0..100 | Stochastic size variation percentage |
| 28 | `W_PARAM_ANGLE_JITTER`| 0..360 | Stochastic angle variation range (degrees) |
| 29 | `W_PARAM_OPACITY_JITTER`| 0..100| Stochastic opacity/flow variation percentage |
| 30 | `W_PARAM_COLOR_JITTER`| 0..100 | Stochastic HSV hue variation percentage |
| 31 | `W_PARAM_DAB_BLEND` | 0..5 | Per-dab blend mode |
| 32 | `W_PARAM_SUBPIXEL` | 0 or 1 | Subpixel anti-aliasing interpolation |
| 33 | `W_PARAM_DEPLETION` | 0..100 | Wet paint exhaustion rate |
| 34 | `W_PARAM_COLOR_PICKUP`| 0..100 | Continuous color pickup from canvas |
| 35 | `W_PARAM_DUAL_SHAPE` | int32 | Secondary tip layer index (-1 = none) |
| 36 | `W_PARAM_DUAL_SIZE` | 10..500 | Secondary tip relative size (%) |
| 37 | `W_PARAM_DUAL_SPACING`| 1..500 | Secondary tip spacing (%) |
| 38 | `W_PARAM_SYMMETRY` | 0..3 | Symmetry axis (0=off, 1=vertical X, 2=horizontal Y, 3=both) |

#### Blend Modes (`W_DAB_BLEND_*` / `W_LAYER_BLEND_*`)
- `0`: Normal (Standard Porter-Duff Source-Over alpha blend)
- `1`: Multiply (`(src * dst) / 255`)
- `2`: Screen (`255 - ((255 - src) * (255 - dst)) / 255`)
- `3`: Overlay (`dst < 128 ? 2*src*dst/255 : 255 - 2*(255-src)*(255-dst)/255`)
- `4`: Color Dodge (`src >= 255 ? 255 : (dst * 255) / (255 - src)`)
- `5`: Add / Linear Dodge (`clamp255(src + dst)`)

---

### Exported Core Functions

#### Document & Initialization
```c
void w_init(uint32_t width, uint32_t height);
void w_resize(uint32_t width, uint32_t height);
```

#### Layer Lifecycle & Manipulation
```c
int32_t   w_layer_create(int32_t width, int32_t height);
int32_t   w_layer_add(void);
void      w_layer_select(int32_t idx);
void      w_layer_delete(int32_t idx);
void      w_layer_toggle(int32_t idx);
void      w_layer_opacity(int32_t idx, uint32_t opacity);
void      w_layer_clear(int32_t idx);
int32_t   w_layer_duplicate(int32_t layer_idx);
int32_t   w_layer_resize(int32_t layer_idx, int32_t new_w, int32_t new_h, int32_t resample);

int32_t   w_layer_get_order_count(void);
int32_t   w_layer_get_order(int32_t pos);
int32_t   w_layer_move_up(int32_t layer_idx);
int32_t   w_layer_move_down(int32_t layer_idx);
int32_t   w_layer_merge_down(int32_t layer_idx);

void      w_layer_set_alpha_lock(int32_t idx, int32_t locked);
int32_t   w_layer_get_alpha_lock(int32_t idx);
void      w_layer_set_clipping(int32_t idx, int32_t clipping);
int32_t   w_layer_get_clipping(int32_t idx);
void      w_layer_set_blend_mode(int32_t idx, int32_t mode);
int32_t   w_layer_get_blend_mode(int32_t idx);

uint32_t* w_layer_get_pixels(int32_t layer_idx);
int32_t   w_layer_get_width(int32_t layer_idx);
int32_t   w_layer_get_height(int32_t layer_idx);
uint8_t   w_layer_get_visible(int32_t layer_idx);
uint8_t   w_layer_get_opacity(int32_t layer_idx);
void      w_layer_set_pixels(int32_t layer_idx, uint32_t *pixels, int32_t width, int32_t height);
```

#### Textures & Tip Masks
```c
int32_t   w_texture_create(int32_t width, int32_t height);
void      w_texture_set_pixels(int32_t tex_id, uint32_t *pixels, int32_t width, int32_t height);
uint32_t* w_texture_get_pixels(int32_t tex_id);
int32_t   w_texture_get_width(int32_t tex_id);
int32_t   w_texture_get_height(int32_t tex_id);
int32_t   w_layer_add_texture(int32_t tex_id);
int32_t   w_layer_get_texture(int32_t layer_idx);
void      w_set_layer(uint32_t *pixels, int32_t width, int32_t height);
void      w_set_texture(uint32_t *pixels, int32_t width, int32_t height);
```

#### Brush Engine & Stroke Execution
```c
void w_brush_set_type(int32_t type);
void w_brush_set_shape(int32_t shape);
void w_brush_set_param(int32_t param_id, int32_t val);
void w_brush_reset(void);
void w_brush_stroke(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser);
void w_brush_stroke_ext(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);
```

#### Primitives & Pixel Operations
```c
void w_draw_line(int x0, int y0, int x1, int y1, uint32_t color);
void w_draw_rect(int x, int y, int w, int h, uint32_t color);
void w_draw_circle(int cx, int cy, int r, uint32_t color);
void w_draw_ellipse(int cx, int cy, int rx, int ry, uint32_t color);
void w_draw_grid(int step, uint32_t color);
void w_draw_image(uint32_t *src_pixels, int src_w, int src_h, int dst_x, int dst_y, int dst_w, int dst_h, uint32_t opacity);
void w_layer_adjust_hsv(int32_t layer_idx, int32_t d_hue, int32_t d_sat, int32_t d_val);
```

#### Selection & Clipping
```c
uint8_t* w_get_clip_mask_buffer(uint32_t size);
void     w_set_clip(int32_t active, int32_t x, int32_t y, int32_t w, int32_t h, int32_t has_mask);
```

#### Compositing & Sampling
```c
void      w_force_composite(void);
uint32_t* w_render(void);
uint32_t  w_pick_color(int32_t x, int32_t y, int32_t sample_composite);
```

---

## 3. Filter Plugin ABI

Every filter plugin (`plugins/*.wasm`) exports a standard interface invoked on the active layer:

```c
#include "esenho.h"

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2);
```

The host sets the active layer buffer via `w_set_layer()` prior to execution. The plugin accesses the target framebuffer via `w_get_layer()`.

Available plugins:
- `blur`: Box / Gaussian low-pass spatial blur (`p1` = radius, 1..25).
- `brightness`: Linear luma bias (`p1` = offset, -100..100).
- `contrast`: Non-linear contrast curve steepness (`p1` = scale, 0..200).
- `dither`: Floyd-Steinberg / threshold error diffusion.
- `edge`: Sobel / Laplacian high-pass edge gradient kernel.
- `grayscale`: ITU-R BT.601 weighted luminance conversion.
- `invert`: Bitwise/channel arithmetic color inversion.
- `noise`: Pseudorandom noise injection (`p1` = intensity, 0..100).
- `pixelate`: Block quantization filter (`p1` = block size in pixels, 1..64).
- `sepia`: Photochemical sepia toning matrix.
- `threshold`: Binary luminance thresholding (`p1` = cutoff value, 0..255).

---

## 4. CLI / REPL Command Reference

Esenho includes a full command-line parser implemented through the `papagaio` pattern compiler. Commands run in the browser console (`Ctrl+\``) or automated script batches.

### System & Inspection
- `status` / `info`: Print canvas resolution, layer count, active layer, and tool parameters.
- `list [all|layers|brushes|textures|filters]`: List registered system entities.
- `get surface [width|height|size]`: Query document dimensions.
- `get layer [id|opacity|visible|alpha_lock|clipping|blend]`: Query layer properties.
- `get tool` / `get mode` / `get shape` / `get brush`: Query active tool configuration.

### Math & Scripting
- `eval <expr>`: Evaluate a mathematical expression and print result (e.g. `eval 2+2`, `eval 512*0.75`).
- `(<expr>)`: Inline math shorthand — any parenthesised expression is evaluated as math (e.g. `(100/3)`).
- `log <msg>`: Print an arbitrary message to the console (useful inside scripts).

### Canvas & Document
- `resize <w> <h>`: Resize document canvas.
- `set resolution <w> <h>`: Alias for `resize`.
- `set width <w>` / `set height <h>`: Set single dimension.
- `grid [on|off]` / `set grid <on|off>`: Toggle pixel grid overlay for >= 4x zoom.
- `set ui_scale <auto|0.75|0.85|1.0|1.15|1.25|1.5|1.75|2.0>`: Adjust UI zoom scale.

### Layer Stack & Operations
- `new layer [name]` / `layer add [name]`: Allocate new transparent layer (optional name).
- `layer select <id>` / `set layer <id>` / `layer <id>`: Set active drawing layer.
- `delete layer [id]` / `remove layer [id]`: Delete specified or active layer.
- `duplicate layer [id]` / `layer dup [id]` / `dup layer [id]`: Clone layer.
- `toggle layer [id]` / `hide layer` / `show layer`: Toggle layer visibility.
- `opacity layer [id] <0..100>`: Set layer opacity percentage.
- `layer alpha_lock [id] <on|off>`: Toggle alpha preservation lock.
- `layer clipping [id] <on|off>`: Toggle clipping mask to layer below.
- `layer blend [id] <normal|multiply|screen|overlay|dodge|add>`: Set blend mode.
- `layer resize [id] <w> <h> [scale|crop]`: Resize single layer buffer.
- `layer move up [id]`: Move layer up in render order.
- `layer move down [id]`: Move layer down in render order.
- `layer merge down [id]`: Merge layer down into layer below.
- `clear layer [id]`: Clear layer pixels to transparent black.
- `layer to texture [name]`: Convert layer pixels into named grain/tip texture.

### Layer Folders / Groups
- `group new [name]`: Create layer folder.
- `group add <group_name> <layer_id>`: Move layer into folder.
- `group remove <layer_id>`: Remove layer from folder.
- `group toggle <group_name>`: Toggle visibility of entire folder.
- `group delete <group_name>`: Delete folder without deleting member layers.

### Brush & Tool Configuration
- `set tool <brush|eraser|smudge|blend|fill|lasso_fill|picker|line|rect|ellipse|select>`: Set active tool.
- `set mode <draw|smudge|blend|fill|lasso_fill>`: Set stroke execution mode.
- `set action_mode <mode>` / `action mode <mode>`: Set raw action mode integer directly.
- `set shape <circle|square|chisel|layer_name>`: Set brush tip shape.
- `set texture <paper|canvas|noise|dots|grid|grunge|hatch|none|layer_name>`: Set grain texture.
- `set color <#hex|r g b>`: Set active color (supports `#rrggbb`, `#aarrggbb`, `r g b`).
- `set <param_name> <val>`: Configure any parameter (`size`, `opacity`, `hardness`, `flow`, `spacing`, `smooth`, `angle`, `roundness`, `scatter`, `smudge`, `wetness`, `depletion`, `color_pickup`, `taper_in`, `taper_out`, `fade`, `size_jitter`, `angle_jitter`, `opacity_jitter`, `color_jitter`, `dab_blend`, `symmetry`, `subpixel`).
- `dump brush` / `export brush`: Dump current brush configuration as executable CLI script.
- `reset tool` / `tool reset` / `reset brush` / `brush reset`: Reset brush and tool parameters to defaults.

#### Brush Presets
Apply a named preset with `brush <preset>` or `set brush <preset>`:

| Preset | Description |
|---|---|
| `round` | Classic soft-edge round brush |
| `airbrush` | Low opacity, soft spray |
| `pixel` | 1px hard square, no anti-aliasing |
| `square` | Hard square tip |
| `calligraphy` / `chisel` | 45° chisel nib |
| `charcoal` | Grainy, high-scatter charcoal stroke |
| `hatch` | Wide-spaced chisel for cross-hatching |
| `scatter` | Random scattered dabs |
| `smudge` | Smudge mode preset |
| `blend` | Wet-media blend preset |
| `fill` | Flood fill mode (tolerance 32) |
| `flood_fill` | Alias for `fill` |
| `lasso_fill` | Lasso solid fill preset |
| `lasso` | Alias for `lasso_fill` |

### Drawing Primitives
- `brush <x> <y>` / `dab <x> <y>`: Paint single dab at coordinate.
- `stroke <x0> <y0> <x1> <y1>`: Render continuous stroke segment.
- `draw line <x0> <y0> <x1> <y1> [color]`
- `draw rect <x> <y> <w> <h> [color]`
- `draw circle <cx> <cy> <r> [color]`
- `draw ellipse <cx> <cy> <rx> <ry> [color]`
- `draw grid <step> [color]`
- `draw image <name> <x> <y> [w] [h] [opacity]`
- `stamp <name> <x> <y>`: Alias for `draw image`.
- `pick <x> <y>` / `picker <x> <y>` / `eyedropper <x> <y>`: Sample color at document coordinates and set as active color.

### Selection, Clipboard & Transform
- `select rect <x> <y> <w> <h>`: Select rectangular area.
- `select all`: Select entire canvas.
- `select none` / `select clear` / `deselect`: Clear active selection.
- `select lasso`: Enter freehand polygon selection mode.
- `select wand [tolerance]`: Enter color flood selection mode.
- `wand tolerance <tol>`: Set magic wand color tolerance (0..255).
- `copy`: Copy selected region to clipboard.
- `cut`: Cut selected region to clipboard.
- `paste [x y]`: Paste clipboard contents onto active layer.
- `transform apply`: Bake active floating transform into layer pixels.
- `transform cancel`: Cancel floating transform.

### Color Adjustments & Filters
- `adjust hsv <h> <s> <v>`: Shift hue (-180..180), saturation (-100..100), and value (-100..100).
- `adjust hue <h>`, `adjust sat <s>`, `adjust val <v>` / `adjust brightness <v>` / `adjust light <v>`.
- `filter <filter_name> [p1] [p2]`: Apply WASM filter plugin.

### Viewport Navigation
- `zoom <in|out|fit|reset>`: Adjust zoom scale.
- `zoom <N>` / `zoom <N>%`: Set zoom to exact percentage (e.g. `zoom 200` → 200%).
- `pan reset` / `pan center`: Re-center canvas.
- `rotate reset` / `rot 0` / `rotate 0`: Reset canvas rotation angle.
- `flip canvas` / `flip h` / `flip` / `flip horizontal`: Flip viewport horizontally (mirror view).
- `flip v` / `flip vertical`: Flip viewport vertically.
- `flip reset`: Reset view flipping.

### History & I/O
- `undo` / `redo`: Step through snapshot stack.
- `history`: Print undo/redo stack entries.
- `history clear`: Empty history stack.
- `save canvas <filename>` / `export <filename>`: Save composite image as PNG.
- `save layer <filename>`: Save active layer as PNG.
- `load image <filename> [name]`: Import image file as new layer/texture.
- `save project [file]` / `export project [file]`: Serialize entire project (all layers, history, settings) to `.esen` JSON file.
- `load project <file>` / `open project <file>`: Load a `.esen` project file (Node.js / CLI only; use file picker in browser).

### Cache & Maintenance
- `reset cache` / `cache reset` / `clear cache`: Delete all service worker caches and reload the page (browser only).

