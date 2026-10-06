# WASM Filter Plugins Catalog & ABI

Esenho features a modular WebAssembly plugin architecture for image processing filters. Plugins are written in C99, compiled without standard library dependencies, and executed directly over linear memory framebuffers.

---

## 1. Plugin Architecture & WebAssembly C ABI

Each plugin is an independent WebAssembly module (`plugins/<name>.wasm`) implementing two exported functions:

```c
#include "quadro.h"

// 1. Metadata descriptor (JSON format)
W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"My Filter\",\"params\":[{\"name\":\"Radius\",\"min\":1,\"max\":25,\"default\":5,\"unit\":\"px\"}]}";
}

// 2. Execution entrypoint
W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels || fb->width <= 0 || fb->height <= 0) return;

    uint32_t *pixels = (uint32_t*)(uintptr_t)fb->pixels;
    int width = fb->width;
    int height = fb->height;
    int total = width * height;

    // Direct 32-bit ARGB pixel manipulation...
}
```

### Memory Safety & Scratch Space
- Plugins run in isolated WebAssembly instances or share linear memory with the host.
- Temporary scratch buffers can safely use memory offsets beyond `fb->pixels + total` or allocate via `w_scratch_alloc`.
- In-place transformations must protect the Alpha channel unless specifically intended (e.g. threshold).

---

## 2. Complete Filter Catalog (29 Plugins)

| Plugin Name | Source File | Parameters | Visual Description |
| :--- | :--- | :--- | :--- |
| **Bloom** | `bloom.c` | Threshold (80..240), Glow Radius (2..30) | High-pass luminosity extraction with Gaussian blur overlay. |
| **Blur** | `blur.c` | Radius (1..25) | Spatial box/separable low-pass blur kernel. |
| **Brightness** | `brightness.c` | Shift (-100..100) | Linear channel luminance offset with clamping. |
| **Chromatic** | `chromatic.c` | Split Offset (1..20), Angle (0..360) | Spatial RGB channel aberration and prism fringe. |
| **Contrast** | `contrast.c` | Multiplier (0..200) | Midpoint-anchored tonal contrast expansion/compression. |
| **Dither** | `dither.c` | Bit Depth (1..4), Pattern Mode | Floyd-Steinberg retro error-diffusion bitmask. |
| **Duotone** | `duotone.c` | Color 1, Color 2 | Remaps grayscale luminance into a 2-stop color gradient. |
| **Edge Detect** | `edge.c` | Sensitivity (1..10) | Sobel/Laplacian spatial gradient operator. |
| **Emboss** | `emboss.c` | Angle (0..360), Height (1..10) | Directional relief shading with 50% neutral gray base. |
| **Fisheye** | `fisheye.c` | Distortion (-100..100) | Radial barrel or pincushion optical lens warp. |
| **Frosted Glass** | `frosted_glass.c` | Scatter (1..20) | Semi-random jitter sampling simulating frosted glass. |
| **Glitch** | `glitch.c` | Intensity (1..50), Slice Shift | Horizontal scanline slicing and RGB channel drift. |
| **Grayscale** | `grayscale.c` | Weighting Mode | Perceptual luminance calculation (`0.299R + 0.587G + 0.114B`). |
| **Halftone Dot** | `halftone_dot.c` | Frequency (2..30), Angle (0..90) | Newspaper/comic book CMYK halftone dot screening. |
| **Invert** | `invert.c` | None | Bitwise channel inversion (Photonegative). |
| **Kaleidoscope** | `kaleidoscope.c` | Segments (2..16), Rotation | Angular radial mirror symmetry around canvas center. |
| **Kuwahara** | `kuwahara.c` | Radius (1..8), Variance Bias | Edge-preserving quadrant filter producing oil painting look. |
| **Noise** | `noise.c` | Amount (1..100), Monochromatic switch | PRNG pseudorandom grain injection across channels. |
| **Pixelate** | `pixelate.c` | Block Size (2..50) | Quantizes pixels into uniform square pixel blocks. |
| **Ripple** | `ripple.c` | Wavelength (5..50), Amplitude (1..20) | Concentric or linear water surface wave displacement. |
| **Scanline** | `scanline.c` | Line Spacing (1..10), Darkening % | Retro CRT television horizontal scanline rasterization. |
| **Sepia** | `sepia.c` | Warmth (0..100) | Warm vintage photographic chemical toning matrix. |
| **Sharpen** | `sharpen.c` | Amount (1..10) | Spatial unsharp masking enhancing high-frequency edges. |
| **Solarize** | `solarize.c` | Threshold (0..255) | Sabattier photochemical tone reversal curve. |
| **Swirl** | `swirl.c` | Angle (-360..360), Radius (10..500) | Angular vortex rotation around mouse or layer center. |
| **Thermal** | `thermal.c` | Color Ramp Preset | False-color heat-vision lookup table. |
| **Threshold** | `threshold.c` | Cutoff (0..255) | Hard binary black-and-white mask conversion. |
| **Vignette** | `vignette.c` | Radius (10..100), Softness | Radial corner darkening falloff. |

---

## 3. Creating a Custom WASM Plugin

### Step 1: Write the C Source (`src/plugins/my_effect.c`)
```c
#include "quadro.h"

W_EXPORT const char* w_plugin_get_info(void) {
    return "{\"title\":\"Custom Invert Red\",\"params\":[{\"name\":\"Amount\",\"min\":0,\"max\":100,\"default\":100}]}";
}

W_EXPORT void w_filter_apply(int32_t p1, int32_t p2) {
    wframebuffer_t *fb = w_get_layer();
    if (!fb || !fb->pixels) return;

    uint32_t *p = (uint32_t*)(uintptr_t)fb->pixels;
    int total = fb->width * fb->height;

    for (int i = 0; i < total; i++) {
        uint32_t c = p[i];
        uint32_t a = (c >> 24) & 0xFF;
        uint32_t r = (c >> 16) & 0xFF;
        uint32_t g = (c >> 8) & 0xFF;
        uint32_t b = c & 0xFF;

        r = 255 - r; // Invert red channel
        p[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }
}
```

### Step 2: Compile with Clang / Makefile
```bash
clang --target=wasm32 -O3 -nostdlib \
  -Wl,--no-entry -Wl,--export-dynamic \
  -Iinclude \
  src/plugins/my_effect.c -o plugins/my_effect.wasm
```

### Step 3: Register and Execute in Script SDK
```javascript
// Automatically loaded into filter catalog
esenho.raster.filters.apply('my_effect', { p1: 80 });
```
