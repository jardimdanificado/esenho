# Vector & SVG Engine Architecture

Esenho contains a dual-tier vector graphics engine combining high-level SVG scene graph manipulation in JavaScript (`src/svg/svg_engine.js`, `src/svg/svg_boolean.js`) with an ultra-fast, zero-dependency C99 Bézier rasterizer embedded in the WebAssembly core (`src/svg/quadro_svg.c`, `src/svg/quadro_font.c`).

---

## 1. Vector Object Model (`src/svg/svg_engine.js`)

The vector subsystem models 2D geometric primitives as reactive scene graph nodes under `SvgDocument`.

### Node Hierarchy
- **`SvgNode`**: Base node implementing common spatial properties (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`, `visible`), fill & stroke styling, hit testing, bounding box calculation, and event handling.
- **`SvgPath`**: Cubic and quadratic Bézier path consisting of linked `PathNode` control points. Supports curve smoothing, segment subdivision, and point simplification.
- **`SvgCompoundPath`**: Multi-contour shape containing sub-paths, holes, and island contours.
- **`SvgRect`**: Parametric rectangle with `width`, `height`, and `cornerRadius`.
- **`SvgEllipse` / `SvgCircle`**: Center `(cx, cy)` and radii `(rx, ry)`.
- **`SvgLine` / `SvgPolyline` / `SvgPolygon`**: Multi-vertex linear and polygon contours.
- **`SvgText`**: Typography element supporting font families, weight, size, letter spacing, line height, and text-on-a-path offset.
- **`SvgGroup`**: Container node with hierarchical transform propagation, compound bounding boxes, and clip-path scoping.
- **`SvgImage`**: Embedded bitmap graphic with dimensions and base64 or external URI source.
- **`SvgDocument`**: Top-level scene graph container managing layers, document dimensions, undo/redo serialization, and SVG XML import/export.

---

## 2. Boolean Operations & Pathfinder (`src/svg/svg_boolean.js`)

Esenho includes a native constructive 2D polygon clipper capable of performing robust boolean operations between arbitrary closed shapes and Bézier curves.

### Supported Operations
| Operation | Function | Description |
| :--- | :--- | :--- |
| **Union** | `SvgBoolean.union(shapeA, shapeB)` | Combines two shapes into a single unified outline. |
| **Subtract / Difference** | `SvgBoolean.subtract(subject, clip)` | Punches the silhouette of `clip` out of `subject`. |
| **Intersect** | `SvgBoolean.intersect(shapeA, shapeB)` | Retains only the overlapping region between shapes. |
| **Exclude / XOR** | `SvgBoolean.exclude(shapeA, shapeB)` | Keeps areas covered by either shape, excluding overlaps. |

### Pipeline
1. **Contour Discretization**: Curved Bézier segments are adaptively sampled into polygonal vertices based on curvature thresholds.
2. **Segment Intersection**: Line-segment intersection tests identify intersection knots (`t`, `u` coordinates).
3. **Graph Traversal & Winding Rules**: Edges are tagged (inside/outside) based on the even-odd or non-zero winding rules.
4. **Bézier Reconstruction**: Resulting polygon loops are refitted back into smooth cubic Bézier segments (`SvgPath`).

---

## 3. Path Simplification (Ramer-Douglas-Peucker)

Freehand drawing or stylus strokes often produce hundreds of redundant raw points. Esenho provides automatic curve fitting and simplification:

```javascript
// Simplify path nodes
const simplifiedNodes = SvgPath.simplify(rawPoints, /* tolerance */ 2.0);
```
- Reduces point count by **85–95%** while preserving visual curvature.
- Automatically calculates tangent handles for smooth Bézier nodes (`Cubic Bézier control points`).

---

## 4. Native C Bézier Rasterizer (`quadro_svg.c`)

When vector shapes are rendered onto the raster canvas or exported to bitmaps, the engine bypasses HTML Canvas 2D and executes direct C99 scanline rasterization in WebAssembly.

### C ABI Specification (`include/quadro.h`)
```c
/* Path Construction */
W_EXPORT void    w_path_begin(void);
W_EXPORT void    w_path_move_to(float x, float y);
W_EXPORT void    w_path_line_to(float x, float y);
W_EXPORT void    w_path_quad_to(float cx, float cy, float x, float y);
W_EXPORT void    w_path_cubic_to(float c1x, float c1y, float c2x, float c2y, float x, float y);
W_EXPORT void    w_path_close(void);

/* Rasterization */
W_EXPORT int32_t w_path_fill(int32_t layer_idx, uint32_t color, int32_t fill_rule);
W_EXPORT int32_t w_path_stroke(int32_t layer_idx, uint32_t color, float line_width, int32_t cap_style, int32_t join_style);
W_EXPORT int32_t w_path_stroke_brush(int32_t layer_idx, uint32_t color, float base_size);
```

### Fill Rules
- `W_FILL_NONZERO = 0`: Standard non-zero winding number rule.
- `W_FILL_EVENODD = 1`: Even-odd rule for complex intersecting shapes and hollow holes.

### Line Caps and Joins
- **Cap Styles**: `W_CAP_BUTT (0)`, `W_CAP_ROUND (1)`, `W_CAP_SQUARE (2)`.
- **Join Styles**: `W_JOIN_MITER (0)`, `W_JOIN_ROUND (1)`, `W_JOIN_BEVEL (2)`.

---

## 5. Native Font & Glyph Engine (`quadro_font.c`)

Text elements can be rendered directly into WebAssembly framebuffers without browser layout reflow:

```c
W_EXPORT int32_t w_font_draw_text(
    int32_t layer_idx,
    float x, float y,
    const char *text,
    float size,
    uint32_t color,
    float tracking,
    float line_height
);

W_EXPORT void w_font_measure_text(
    const char *text,
    float size,
    float tracking,
    float *out_w_h
);
```

- High-precision subpixel positioning.
- Real-time text bounds measurement (`w_font_measure_text`).
- Transform matrices (rotation, scale, pivot) supported via `w_font_draw_text_transform`.

---

## 6. SVG Import & Export

- **Standard SVG Export**: Serializes the scene graph to clean, resolution-independent SVG XML strings with embedded styles, gradients, and typography.
- **SVG Import**: Parses SVG `<path>`, `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<g>`, and `<text>` elements directly into live editable `SvgNode` objects.
