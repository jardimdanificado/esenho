# Esenho API Documentation

## 1. System Architecture

Esenho is an extensible digital painting engine built on WebAssembly and high-performance raster algorithms:
- **Core WASM Engine (`plugins/canvas.wasm`)**: Written in C99, compiled to WebAssembly without libc dependencies. Manages linear memory, unified multi-layer framebuffers, parametric dab rendering, procedural grain sampling, integer math, dirty-rect composite generation, native vector path rasterization, font glyph rendering, and polyphonic audio DSP.
- **Header & ABI (`include/quadro.h`)**: Universal interface defining brush engine parameters, layer structures, color conversions, audio DSP, and filter ABI.
- **Host & Runtime Actor (`src/esenho.js`)**: Executes in Node.js and modern browsers. Implements `EsenhoScreenHost`, `EsenhoModule`, state management, undo/redo snapshot trees, clipboard, and the `papagaio` pattern-matching CLI compiler.
- **Universal Scripting Platform (`src/script/*`)**: Unified SDK exposing `esenho.*` across raster, vector, animation, audio, and UI domains with an atomic command bus.
- **Filter Plugins (`plugins/*.wasm`)**: 29 standalone WASM modules implementing image processing kernels (`bloom`, `blur`, `brightness`, `chromatic`, `contrast`, `dither`, `duotone`, `edge`, `emboss`, `fisheye`, `frosted_glass`, `glitch`, `grayscale`, `halftone_dot`, `invert`, `kaleidoscope`, `kuwahara`, `noise`, `pixelate`, `ripple`, `scanline`, `sepia`, `sharpen`, `solarize`, `swirl`, `thermal`, `threshold`, `vignette`).
- **Browser Host (`src/host-browser.js`)**: Glues canvas elements, multitouch gestures, direct WebGL/2D blitting (`desynchronized: true`), and Dockview UI controls to the WASM core.

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
- `3` (`W_SHAPE_STAR`): 5-pointed star procedural tip.
- `4` (`W_SHAPE_DIAMOND`): Rhombus diamond procedural tip.
- `5` (`W_SHAPE_TRIANGLE`): Equilateral triangle procedural tip.
- `6` (`W_SHAPE_HEART`): Stylized heart procedural tip.
- `>= 7`: Any layer index mapped as tip mask via alpha channel.

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
| 14 | `W_PARAM_SHAPE` | int32 | Tip shape index (0..6 or layer index) |
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

#### Brush Engine & Stroke Execution
```c
void w_brush_set_type(int32_t type);
void w_brush_set_shape(int32_t shape);
void w_brush_set_param(int32_t param_id, int32_t val);
void w_brush_reset(void);
void w_brush_stroke(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser);
void w_brush_stroke_ext(int32_t state, int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t color, int32_t eraser, int32_t pressure, int32_t tilt_x, int32_t tilt_y);
```

#### Native Vector Path & Bézier Rasterizer ABI
```c
void    w_path_begin(void);
void    w_path_move_to(float x, float y);
void    w_path_line_to(float x, float y);
void    w_path_quad_to(float cx, float cy, float x, float y);
void    w_path_cubic_to(float c1x, float c1y, float c2x, float c2y, float x, float y);
void    w_path_close(void);
int32_t w_path_fill(int32_t layer_idx, uint32_t color, int32_t fill_rule);
int32_t w_path_stroke(int32_t layer_idx, uint32_t color, float line_width, int32_t cap_style, int32_t join_style);
int32_t w_path_stroke_brush(int32_t layer_idx, uint32_t color, float base_size);
```

#### Native Font & Glyph Engine ABI
```c
int32_t w_font_draw_text(int32_t layer_idx, float x, float y, const char *text, float size, uint32_t color, float tracking, float line_height);
int32_t w_font_draw_text_transform(int32_t layer_idx, float x, float y, const char *text, float size, uint32_t color, float tracking, float line_height, float rotation_deg, float scale_x, float scale_y, float pivot_x, float pivot_y, int32_t alignment);
void    w_font_measure_text(const char *text, float size, float tracking, float *out_w_h);
```

#### Native Audio DSP Engine ABI
```c
void     w_audio_init(uint32_t sample_rate);
void     w_audio_set_bpm(float bpm);
float    w_audio_get_bpm(void);
void     w_audio_set_master_vol(float vol);
float    w_audio_get_master_vol(void);
void     w_audio_set_track_synth(uint32_t track_idx, uint32_t wave_type, float attack_s, float decay_s, float sustain_lvl, float release_s, float pulse_width);
void     w_audio_set_track_filter(uint32_t track_idx, uint32_t filter_type, float cutoff_hz, float resonance, float gain_db);
void     w_audio_set_track_fx(uint32_t track_idx, float delay_s, float delay_fb, float delay_mix, float reverb_size, float reverb_mix, float crush_bits, float dist_drive);
void     w_audio_set_track_vol_pan(uint32_t track_idx, float volume, float pan);
void     w_audio_note_on(uint32_t track_idx, uint32_t midi_note, float velocity);
void     w_audio_note_off(uint32_t track_idx, uint32_t midi_note);
void     w_audio_all_notes_off(uint32_t track_idx);
void     w_audio_trigger_sfxr(uint32_t preset_type, float volume);
void     w_audio_render_block(uint32_t num_frames);
float*   w_audio_get_buffer_l(void);
float*   w_audio_get_buffer_r(void);
uint32_t w_audio_export_wav(uint8_t *out_wav_buffer, uint32_t max_bytes, uint32_t total_frames);
```

#### Selection & Clipping
```c
uint8_t* w_get_clip_mask_buffer(uint32_t size);
void     w_set_clip(int32_t active, int32_t x, int32_t y, int32_t w, int32_t h, int32_t has_mask);
int32_t  w_get_selection_scratch_layer(void);
```

#### Compositing & Sampling
```c
void      w_force_composite(void);
uint32_t* w_render(void);
uint32_t  w_pick_color(int32_t x, int32_t y, int32_t sample_composite);
```

---

## 3. Filter Plugin ABI

Every filter plugin (`plugins/*.wasm`) exports a standard interface:

```c
#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void);
W_EXPORT void        w_filter_apply(int32_t p1, int32_t p2);
```

The host sets the active layer buffer via `w_set_layer()` prior to execution. The plugin accesses the target framebuffer via `w_get_layer()`.

Catalog of 29 available plugins: `bloom`, `blur`, `brightness`, `chromatic`, `contrast`, `dither`, `duotone`, `edge`, `emboss`, `fisheye`, `frosted_glass`, `glitch`, `grayscale`, `halftone_dot`, `invert`, `kaleidoscope`, `kuwahara`, `noise`, `pixelate`, `ripple`, `scanline`, `sepia`, `sharpen`, `solarize`, `swirl`, `thermal`, `threshold`, `vignette`.

---

## 4. CLI / REPL Command Reference

Esenho includes a full command-line parser implemented through the `papagaio` pattern compiler. Commands run in the browser console (`Ctrl+\``) or automated script batches.

### Core Brush & Canvas Commands
- `size <N>`: Set brush diameter (1..500).
- `opacity <N>`: Set brush opacity percentage (0..100).
- `hardness <N>`: Set brush hardness percentage (0..100).
- `flow <N>`: Set brush flow rate (1..100).
- `spacing <N>`: Set dab spacing percentage (1..200).
- `color <hex>`: Set foreground brush color (`#RGB`, `#RRGGBB`, `#RRGGBBAA`).
- `color rgb <r> <g> <b>`: Set brush color from 0..255 channel values.
- `tool <draw|smudge|blend|fill|picker|line|rect|ellipse|select>`: Switch active tool.
- `clear [layer]`: Fill layer with transparent zeroes.
- `dump brush` / `export brush`: Dump current brush configuration as executable CLI script.

### Layer Stack Commands
- `layer new` / `layer add`: Create empty layer above active layer.
- `layer delete [idx]` / `layer del [idx]`: Delete layer.
- `layer select <idx>`: Switch active drawing layer.
- `layer opacity <idx> <val>`: Set layer opacity (0..100).
- `layer visible <idx> <0|1>`: Toggle layer visibility.
- `layer merge down`: Merge active layer down.
- `layer up` / `layer down`: Move layer up or down in stack.
- `layer lock [idx] <0|1>`: Toggle layer alpha lock.
- `layer clip [idx] <0|1>`: Toggle clipping mask.
- `layer blend <idx> <normal|multiply|screen|overlay|dodge|add>`: Set layer blend mode.

### Selection, Clipboard & Transforms
- `select all`: Select entire canvas.
- `select none` / `select clear` / `deselect`: Clear active selection.
- `select lasso`: Enter freehand polygon selection mode.
- `select wand [tolerance]`: Enter color flood selection mode.
- `copy`: Copy selected region to clipboard.
- `cut`: Cut selected region to clipboard.
- `paste [x y]`: Paste clipboard contents.
- `transform apply`: Commit active transform.
- `transform cancel`: Discard active transform.

### Audio & Sound Commands
- `audio play` / `audio stop`: Start or pause audio DAW transport.
- `audio bpm <bpm>`: Set audio beats-per-minute tempo (20..300).
- `audio sfxr <preset> [vol]`: Trigger procedural sound effect (0=laser, 1=explosion, 2=powerup, 3=hit, 4=jump, 5=blip).
- `audio note <track> <midi> [vel]`: Trigger MIDI note on track.

### Vector Path & SVG Commands
- `vector recording <on|off>`: Enable or disable real-time vector spine recording.
- `vector clear [all]`: Clear vector strokes for the active layer or all layers.
- `vector replay [scale_pct]`: Re-rasterize all vector strokes using original brush physics.
- `vector export svg [filename]`: Export recorded vector strokes as a standard SVG file.

### Animation Timeline Commands
- `anim init <frames> [fps]`: Initialize timeline frames and FPS.
- `anim frame <f>` / `anim goto <f>`: Jump to specific frame.
- `anim play` / `anim stop`: Play or halt timeline playback.
- `anim onion <on|off> [prev] [next]`: Configure onion skinning.
- `anim ik solve <armature> <effector> <x> <y>`: Solve 2D CCD-IK towards target.
- `anim camera set <x> <y> <z> <zoom> <rot>`: Position 2.5D multiplane camera.

### Maintenance & History
- `undo` / `redo`: Step through snapshot stack.
- `save project [file]`: Serialize entire project to `.esen` savefile.
- `reset cache`: Purge ServiceWorker caches and reload.
- `reset data`: Clear all IndexedDB/LocalStorage databases.
