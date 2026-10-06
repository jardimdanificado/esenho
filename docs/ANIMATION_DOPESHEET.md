# Animation System & DopeSheet

Esenho features an industrial-grade 2D animation and motion-graphics subsystem designed to bridge raster digital painting, vector graphics, 2D skeletal rigging, and audio DAW playback into a unified timeline.

It consists of four tightly-coupled components:
1. **DopeSheet Engine (`src/anim/dopesheet.js`)**: Universal parametric timeline capable of animating 144 Quadro engine parameters across 11 groups with sub-frame interpolation and multi-clip support.
2. **Interactive DopeSheet UI (`src/anim/dopesheet_ui.js`)**: Scrubbable timeline dock with tracks, keyframe diamonds, curve editor, and auto-keyframing.
3. **Flash-Style Animator Runtime (`src/anim/animator_engine.js`)**: Interactive scene graph (`Stage`, `MovieClip`, `Button`, `Graphic`), frame scripts (`gotoAndPlay`, `stop`), and standalone HTML5 bundle exporter.
4. **Export Encoders (`src/anim/gif_encoder.js`, `src/anim/webm_muxer.js`)**: Direct client-side video rendering to animated GIF and WebM video formats.

---

## 1. Parameter Registry & Groups

The parameter registry (`PARAMETER_REGISTRY`) defines **144 interpolable parameters** categorized into **11 functional groups**:

### Parameter Groups Breakdown

| Group | Parameters | Description |
| :--- | :--- | :--- |
| **Transform** | `x`, `y`, `zDepth`, `scaleX`, `scaleY`, `rotation`, `skewX`, `skewY`, `opacity`, `originX`, `originY` | Spatial translation, scale, 2D orientation, skew, and anchor point. |
| **Geometry** | `width`, `height`, `radius`, `rx`, `ry`, `cornerRadius`, `polygonSides`, `starPoints`, `innerRadius` | Vector primitive geometric dimensions. |
| **Typography** | `text`, `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `textAlign`, `letterSpacing`, `lineHeight`, `textPathOffset` | Vector text labels, typography, and path offset. |
| **Stroke** | `strokeColor`, `strokeWidth`, `strokeOpacity`, `strokeDashOffset`, `strokeMiterLimit`, `strokeCap`, `strokeJoin`, `strokeTexMode`, `strokeTexScale`, `strokeTexContrast`, `strokeTexGrain`, `strokeTexAngle` | Vector outline styling and texture mapping. |
| **Fill & Material** | `fillColor`, `fillOpacity`, `gradientAngle`, `gradientScale`, `gradientCenterX`, `gradientCenterY`, `texMode`, `texScale`, `texContrast`, `texGrain`, `texAngle`, `texOffsetX`, `texOffsetY`, `texWarpStrength`, `texWarpFreq`, `texNoiseDistort`, `texHardness`, `texInvert`, `texBlendMode`, `texPosterize`, `texPinchSwirl` | Fills, multi-stop gradients, procedural grain shaders, and warp materials. |
| **WASM Plugins** | `wasmPlugin`, `wasmParam1`, `wasmParam2`, `wasmParam3` | Keyframing active WASM image filters and their dynamic parameters. |
| **Brush Dynamics** | `brushSize`, `brushOpacity`, `brushHardness`, `brushFlow`, `brushSpacing`, `brushAngle`, `brushRoundness`, `brushScatter`, `brushTolerance`, `brushSmudge`, `brushWetness`, `brushGrain`, `brushColor`, `brushSmooth`, `brushMidpoint`, `brushVelocity`, `brushTaperIn`, `brushTaperOut`, `brushFade`, `brushSizeJitter`, `brushAngleJitter`, `brushOpacityJitter`, `brushColorJitter`, `brushDabBlend`, `brushDepletion`, `brushColorPickup`, `brushDualSize`, `brushDualSpacing`, `brushSymmetry` | Full Quadro paint engine dynamics animated along time or recorded strokes. |
| **Raster FX / Layers**| `fxBlur`, `fxBrightness`, `fxContrast`, `fxHue`, `fxSat`, `fxGrayscale`, `fxSepia`, `fxInvert`, `fxNoise`, `fxPixelate`, `fxThreshold`, `fxDither`, `fxEdge`, `layerBlendMode` | Post-processing effects applied to raster layers. |
| **2.5D Camera** | `camX`, `camY`, `camZ`, `camZoom`, `camRot` | Multiplane parallax camera coordinates, depth, focal zoom, and roll angle. |
| **Armatures & Rigging**| `boneAngle`, `boneLength`, `meshWarpWeight` | Skeletal bones, 2D mesh warp control pins, and skinning weights. |
| **Audio DAW** | `bpm`, `masterVol`, `trackVol`, `trackPan`, `filterCutoff`, `filterResonance`, `fxDelay`, `fxReverb`, `fxDistortion` | Real-time audio synthesizer and mixer automation channels. |

---

## 2. Interpolation Mathematics & Easing

### Standard Easing Functions
The engine supports standard interpolation curves via `Easing`:
- **Linear**: `linear`
- **Quadratic**: `easeInQuad`, `easeOutQuad`, `easeInOutQuad`
- **Cubic**: `easeInCubic`, `easeOutCubic`, `easeInOutCubic`
- **Sinusoidal**: `easeInSine`, `easeOutSine`, `easeInOutSine`
- **Elastic**: `easeInElastic`, `easeOutElastic`
- **Bouncing**: `easeOutBounce`, `easeInOutBounce`
- **Step / Hold**: `step`, `none`

### Advanced Procedural Curves
- **Cubic Bézier Solver (`solveCubicBezier(x1, y1, x2, y2)`)**: Evaluates arbitrary CSS-style Bézier transition curves using Newton-Raphson approximation.
- **Physics Bounce (`createBounceEasing(bounces, elasticity)`)**: Simulates damped physical collisions.
- **Spring Oscillation (`createSpringEasing(mass, stiffness, damping)`)**: Underdamped physical harmonic oscillator.
- **Catmull-Rom Spline (`createSplineEasing(points)`)**: Smooth multi-point spline interpolation through control knots.

### Value Interpolators
- **Color Interpolation (`lerpColor(c1, c2, t, format)`)**: Smooth transitions across Hex, RGBA, and 32-bit ARGB integer values with correct gamma handling.
- **Shortest-Path Angle Interpolation (`lerpAngle(a1, a2, t)`)**: Wraps angular orientation across the 360°/0° boundary to avoid unnatural full-circle spins.
- **Path Morphing (`lerpPath(pathA, pathB, t)`)**: Morphing engine that normalizes point counts, handles Bézier control nodes, and smoothly interpolates complex SVG outlines.

---

## 3. Multi-Clip Animation Architecture

Animations in Esenho are organized into independent, named **Animation Clips** (`MultiClip` support):

```javascript
// DopeSheet holds multiple named clips for an object or document
const clipWalk = dopeSheet.createClip('Walk', { startFrame: 1, endFrame: 24, fps: 24 });
const clipJump = dopeSheet.createClip('Jump', { startFrame: 1, endFrame: 16, fps: 24 });

// Switch active clip on the timeline
dopeSheet.setActiveClip('Walk');
```

Each clip maintains its own isolated set of parameter channels:
- Object tracks (`x`, `y`, `rotation`, `scaleX`, `scaleY`, etc.)
- Material and Fill channels
- Brush dynamics channels
- Camera multiplane tracks

Clips are fully serialized and deserialized into `.esen` project files and SVG animation metadata.

---

## 4. Skeletal Rigging, IK, and 2.5D Multiplane Camera

### CCD Inverse Kinematics (CCD-IK)
Esenho includes a native 2D Cyclic Coordinate Descent (CCD) inverse kinematics solver for character armatures:
```javascript
// Solve bone chain towards effector target
esenho.anim.solveIK({
  armatureId: 'arm_rig',
  effectorBone: 'hand',
  targetX: 320,
  targetY: 450,
  maxIterations: 15,
  tolerance: 0.1
});
```

### Vector Studio Rigging & Ragdoll Physics (`src/svg/svg_rigging.js`)
Esenho features a 2D skeletal rigging and Verlet physics simulation engine:
- **`SvgSkeleton` & `SvgBone`**: Hierarchical Forward Kinematics (FK) and Inverse Kinematics (IK) bone trees.
- **Cutout Rigging & Skinning**: Binds scene graph nodes or Bézier curve control vertices to skeletal bones with weighted influences.
- **Verlet Ragdoll Simulation (`RagdollSimulation`)**:
  - Full Verlet particle integration with gravity, air resistance, and ground/boundary collisions.
  - Rigid distance stick constraints and rotational angle limits.
  - **Secondary Physics**: Dynamic spring jiggle for tails, hair, cloth, and antennae.
- **Bake to DopeSheet (`bakeRagdollToDopeSheet`)**:
  - Runs physical simulation and bakes the resulting bone transforms frame-by-frame into keyframes directly on a DopeSheet animation clip for hand editing.

### 2D Mesh Warp & Skin Binding
Enables freeform deformation of raster layers or vector paths:
- Triangular mesh tessellation over layer bounding box.
- Weighted control vertices bound to armature bones.
- Real-time affine deformation per triangle during playback.

### 2.5D Multiplane Camera
Simulates traditional Disney-style multiplane animation cameras:
- Parallax layers placed at varying `zDepth` values.
- Automatic scale and perspective displacement calculated as `camZ` and `camZoom` animate.

---

## 5. Flash-Style Animator Engine (`src/anim/animator_engine.js`)

For rich interactive animations and web exports, Esenho implements a Flash/Director-style runtime:

### Display Object Hierarchy
- **`Stage`**: Root viewport containing display list and global frame clock.
- **`MovieClip`**: Hierarchical container with its own independent timeline, frame labels, and scripts.
- **`Button`**: 4-state interactive object responding to pointer events:
  - `Up`: Normal resting appearance.
  - `Over`: Cursor hover state.
  - `Down`: Active pressed state.
  - `Hit`: Invisible bounding area used for hit testing.
- **`Graphic`**: Static vector/raster symbol without script execution.

### Frame Actions & Scripting Sandbox
Timeline frames can execute ActionScript-style code:
```javascript
// On frame 25 of a MovieClip:
this.addFrameScript(25, function() {
  if (this.health <= 0) {
    this.gotoAndPlay('death_animation');
  } else {
    this.gotoAndPlay('idle_loop');
  }
});
```

### Standalone HTML5 Export
The runtime can export any scene as a zero-dependency, self-contained HTML5 bundle containing the vector shapes, sprite sheets, and lightweight JavaScript runner:
```javascript
const htmlBundle = esenho.anim.exportHtml5();
// Download or save bundle as standalone interactive web asset
```

---

## 6. Exporting to Video (GIF & WebM)

### Animated GIF Encoder (`src/anim/gif_encoder.js`)
- Quantizes 32-bit ARGB frames using Octree or NeuQuant color quantization into 256-color palettes.
- Generates standard LZW-compressed animated GIF files in linear memory without external binaries.

### WebM Video Muxer (`src/anim/webm_muxer.js`)
- Captures canvas frames at fixed FPS.
- Encodes frames into VP8/VP9 or lightweight WebM container format directly in the browser.
- Produces clean 60fps video files suitable for web distribution and social media.
