/**
 * Esenho Universal Resource Registry v1.0
 * Unified Schema, Registry & Evaluation Engine for the 7 Core Standard Asset Types:
 *   1. Brush    (.ebrush) - Dynamic universal brush configuration
 *   2. Tip      (.etip)   - Stamp / tip geometry (procedural, bitmap, svg)
 *   3. Texture  (.etex)   - Seamless grain, paper tooth & procedural noise
 *   4. Curve    (.ecurve) - Bézier transfer functions (stylus, velocity, easing)
 *   5. Material (.emat)   - Fill appearance, gradients, textures & WASM FX
 *   6. Palette  (.epal)   - Swatch sets & color ramp gradients
 *   7. Mesh     (.emesh)  - Procedural hatching meshes & stroke layouts
 */

(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EsenhoRegistry = factory();
  }
})(typeof self !== "undefined" ? self : this, function() {
  "use strict";

  const SCHEMAS = {
    brush: "esenho/brush/v1",
    tip: "esenho/tip/v1",
    texture: "esenho/texture/v1",
    curve: "esenho/curve/v1",
    material: "esenho/material/v1",
    palette: "esenho/palette/v1",
    mesh: "esenho/mesh/v1"
  };

  const EXTENSIONS = {
    brush: ".ebrush",
    tip: ".etip",
    texture: ".etex",
    curve: ".ecurve",
    material: ".emat",
    palette: ".epal",
    mesh: ".emesh"
  };

  /* ── Built-in Standard Curves ── */
  const BUILTIN_CURVES = [
    {
      $schema: SCHEMAS.curve,
      id: "linear",
      name: "Linear 1:1",
      builtin: true,
      type: "cubic_bezier",
      points: [[0, 0], [0.333, 0.333], [0.667, 0.667], [1, 1]]
    },
    {
      $schema: SCHEMAS.curve,
      id: "stylus_pressure_soft",
      name: "Soft Stylus Response",
      builtin: true,
      type: "cubic_bezier",
      points: [[0, 0], [0.15, 0.45], [0.4, 0.85], [1, 1]]
    },
    {
      $schema: SCHEMAS.curve,
      id: "stylus_pressure_hard",
      name: "Hard Stylus Response",
      builtin: true,
      type: "cubic_bezier",
      points: [[0, 0], [0.65, 0.15], [0.85, 0.55], [1, 1]]
    },
    {
      $schema: SCHEMAS.curve,
      id: "ease_in_out",
      name: "Smooth Sigmoid S-Curve",
      builtin: true,
      type: "cubic_bezier",
      points: [[0, 0], [0.42, 0.0], [0.58, 1.0], [1, 1]]
    },
    {
      $schema: SCHEMAS.curve,
      id: "taper_sharp",
      name: "Sharp Taper",
      builtin: true,
      type: "cubic_bezier",
      points: [[0, 0], [0.05, 0.8], [0.2, 1.0], [1, 1]]
    }
  ];

  /* ── Built-in Standard Tips ── */
  const BUILTIN_TIPS = [
    { $schema: SCHEMAS.tip, id: "round", name: "Circle / Round", builtin: true, type: "procedural", hardness: 100, aspectRatio: 1.0, angle: 0 },
    { $schema: SCHEMAS.tip, id: "soft_round", name: "Soft Airbrush", builtin: true, type: "procedural", hardness: 0, aspectRatio: 1.0, angle: 0 },
    { $schema: SCHEMAS.tip, id: "square", name: "Square Block", builtin: true, type: "procedural", hardness: 100, aspectRatio: 1.0, angle: 0 },
    { $schema: SCHEMAS.tip, id: "chisel", name: "Chisel Flat", builtin: true, type: "procedural", hardness: 100, aspectRatio: 0.35, angle: 45 },
    { $schema: SCHEMAS.tip, id: "bristle", name: "3-Strand Bristle", builtin: true, type: "procedural", hardness: 85, aspectRatio: 0.9, angle: 0 },
    { $schema: SCHEMAS.tip, id: "rake", name: "5-Strand Rake", builtin: true, type: "procedural", hardness: 90, aspectRatio: 0.8, angle: 0 },
    { $schema: SCHEMAS.tip, id: "charcoal", name: "Charcoal Grit", builtin: true, type: "procedural", hardness: 80, aspectRatio: 0.85, angle: 30 },
    { $schema: SCHEMAS.tip, id: "dagger", name: "Dagger / Teardrop", builtin: true, type: "procedural", hardness: 95, aspectRatio: 0.4, angle: 90 },
    { $schema: SCHEMAS.tip, id: "splatter", name: "Splatter Drops", builtin: true, type: "procedural", hardness: 95, aspectRatio: 1.0, angle: 0 },
    { $schema: SCHEMAS.tip, id: "oval", name: "Oval Calligraphy", builtin: true, type: "procedural", hardness: 95, aspectRatio: 0.5, angle: 45 },
    { $schema: SCHEMAS.tip, id: "star", name: "5-Point Star", builtin: true, type: "procedural", hardness: 100, aspectRatio: 1.0, angle: 0 }
  ];

  /* ── Built-in Standard Textures ── */
  const BUILTIN_TEXTURES = [
    { $schema: SCHEMAS.texture, id: "none", name: "None (Smooth)", builtin: true, generator: "none", scale: 100, contrast: 100, brightness: 100, depth: 0, mode: "multiply" },
    { $schema: SCHEMAS.texture, id: "paper", name: "Paper Grain", builtin: true, generator: "paper", scale: 100, contrast: 100, brightness: 100, depth: 50, mode: "multiply" },
    { $schema: SCHEMAS.texture, id: "canvas", name: "Canvas Weave", builtin: true, generator: "canvas", scale: 100, contrast: 120, brightness: 100, depth: 60, mode: "multiply" },
    { $schema: SCHEMAS.texture, id: "noise", name: "Fine Noise", builtin: true, generator: "noise", scale: 80, contrast: 90, brightness: 100, depth: 40, mode: "multiply" },
    { $schema: SCHEMAS.texture, id: "watercolor", name: "Watercolor Coldpress", builtin: true, generator: "watercolor", scale: 120, contrast: 110, brightness: 100, depth: 70, mode: "multiply" },
    { $schema: SCHEMAS.texture, id: "grunge", name: "Rough Grunge", builtin: true, generator: "grunge", scale: 150, contrast: 130, brightness: 95, depth: 80, mode: "multiply" },
    { $schema: SCHEMAS.texture, id: "charcoal_tooth", name: "Charcoal Tooth", builtin: true, generator: "charcoal_tooth", scale: 100, contrast: 140, brightness: 100, depth: 75, mode: "multiply" }
  ];

  /* ── Built-in Standard Mesh Patterns ── */
  const BUILTIN_MESHES = [
    { $schema: SCHEMAS.mesh, id: "linear", name: "Parallel Hatch", builtin: true, pattern: "linear", spacing: 6, angle: 45, curvature: 0, density: 100, direction: "bidirectional" },
    { $schema: SCHEMAS.mesh, id: "crosshatch", name: "Crosshatch", builtin: true, pattern: "crosshatch", spacing: 8, angle: 45, curvature: 0, density: 100, direction: "bidirectional" },
    { $schema: SCHEMAS.mesh, id: "triple_hatch", name: "Triple Hatch", builtin: true, pattern: "triple_hatch", spacing: 8, angle: 30, curvature: 0, density: 100, direction: "bidirectional" },
    { $schema: SCHEMAS.mesh, id: "flow_field", name: "Fluid Flow Field", builtin: true, pattern: "flow_field", spacing: 6, angle: 0, curvature: 25, density: 100, direction: "forward" },
    { $schema: SCHEMAS.mesh, id: "radial", name: "Radial Sunburst", builtin: true, pattern: "radial", spacing: 10, angle: 0, curvature: 0, density: 100, direction: "forward" },
    { $schema: SCHEMAS.mesh, id: "spiral", name: "Archimedean Spiral", builtin: true, pattern: "spiral", spacing: 7, angle: 0, curvature: 50, density: 100, direction: "forward" },
    { $schema: SCHEMAS.mesh, id: "voronoi", name: "Voronoi Crystals", builtin: true, pattern: "voronoi", spacing: 12, angle: 0, curvature: 0, density: 90, direction: "bidirectional" },
    { $schema: SCHEMAS.mesh, id: "stipple", name: "Pointillist Stipple", builtin: true, pattern: "stipple", spacing: 4, angle: 0, curvature: 0, density: 80, direction: "forward" }
  ];

  /* ── Built-in Standard Palettes ── */
  const BUILTIN_PALETTES = [
    {
      $schema: SCHEMAS.palette,
      id: "gruvbox_dark",
      name: "Gruvbox Dark",
      builtin: true,
      colors: ["#282828", "#fabd2f", "#fb4934", "#b8bb26", "#83a598", "#d3869b", "#ebdbb2", "#fe8019"],
      gradients: [
        { id: "gold_fire", type: "linear", stops: [{ offset: 0, color: "#fabd2f" }, { offset: 1, color: "#fb4934" }] },
        { id: "cyber_teal", type: "linear", stops: [{ offset: 0, color: "#83a598" }, { offset: 1, color: "#b8bb26" }] }
      ]
    },
    {
      $schema: SCHEMAS.palette,
      id: "nord_frost",
      name: "Nord Frost",
      builtin: true,
      colors: ["#2e3440", "#3b4252", "#88c0d0", "#81a1c1", "#5e81ac", "#bf616a", "#a3be8c", "#ebcb8b"],
      gradients: [
        { id: "aurora", type: "linear", stops: [{ offset: 0, color: "#88c0d0" }, { offset: 1, color: "#5e81ac" }] }
      ]
    }
  ];

  /* ── Built-in Universal Brushes ── */
  const BUILTIN_BRUSHES = [
    {
      $schema: SCHEMAS.brush,
      id: "solid_vector",
      name: "Solid Vector (Clean Line)",
      category: "ink",
      builtin: true,
      isVectorPure: true,
      tip: { ref: "round", size: 3, hardness: 100, roundness: 100, angle: 0 },
      dynamics: {
        spacing: 1,
        stabilizer: { mode: "streamline", smoothing: 0 },
        pressureSize: false,
        pressureFlow: false,
        velocityScaling: 0
      },
      texture: { ref: "none" },
      wet: { wetness: 0, smudge: 0, colorPickup: 0, depletion: 0 },
      jitter: { size: 0, angle: 0, opacity: 0, scatter: 0 }
    },
    {
      $schema: SCHEMAS.brush,
      id: "studio_inker",
      name: "Studio Inker",
      category: "ink",
      builtin: true,
      tip: { ref: "round", size: 6, hardness: 100, roundness: 100, angle: 0 },
      dynamics: {
        spacing: 3,
        stabilizer: { mode: "streamline", smoothing: 25 },
        pressureSize: true,
        pressureFlow: false,
        velocityScaling: 15,
        taper: { in: 5, out: 15 }
      },
      texture: { ref: "none" },
      wet: { wetness: 0, smudge: 0, colorPickup: 0, depletion: 0 },
      jitter: { size: 0, angle: 0, opacity: 0, scatter: 0 }
    },
    {
      $schema: SCHEMAS.brush,
      id: "charcoal_soft",
      name: "Soft Charcoal Grit",
      category: "charcoal",
      builtin: true,
      tip: { ref: "charcoal", size: 28, hardness: 80, roundness: 85, angle: 30 },
      dynamics: {
        spacing: 8,
        stabilizer: { mode: "streamline", smoothing: 10 },
        pressureSize: true,
        pressureFlow: true,
        tiltAngle: true
      },
      texture: { ref: "charcoal_tooth", scale: 100, depth: 70 },
      wet: { wetness: 0, smudge: 10, colorPickup: 0, depletion: 0 },
      jitter: { size: 10, angle: 35, opacity: 15, scatter: 4 }
    },
    {
      $schema: SCHEMAS.brush,
      id: "soft_airbrush",
      name: "Radial Airbrush",
      category: "airbrush",
      builtin: true,
      tip: { ref: "soft_round", size: 60, hardness: 0, roundness: 100, angle: 0 },
      dynamics: {
        spacing: 4,
        stabilizer: { mode: "streamline", smoothing: 15 },
        pressureSize: false,
        pressureFlow: true,
        buildup: true
      },
      texture: { ref: "none" },
      wet: { wetness: 0, smudge: 0, colorPickup: 0, depletion: 0 },
      jitter: { size: 0, angle: 0, opacity: 0, scatter: 0 }
    },
    {
      $schema: SCHEMAS.brush,
      id: "wet_acrylic",
      name: "Wet Acrylic Paint",
      category: "paint",
      builtin: true,
      tip: { ref: "bristle", size: 32, hardness: 90, roundness: 80, angle: 0 },
      dynamics: {
        spacing: 4,
        stabilizer: { mode: "streamline", smoothing: 20 },
        pressureSize: true,
        pressureFlow: true
      },
      texture: { ref: "canvas", scale: 100, depth: 50 },
      wet: { wetness: 65, smudge: 45, colorPickup: 40, depletion: 15 },
      jitter: { size: 0, angle: 10, opacity: 0, scatter: 0 }
    }
  ];

  /* ── Built-in Standard Materials ── */
  const BUILTIN_MATERIALS = [
    {
      $schema: SCHEMAS.material,
      id: "solid_gold",
      name: "Solid Gold",
      builtin: true,
      color: "#fabd2f",
      opacity: 1.0,
      gradient: null,
      texture: { ref: "none" },
      brushFill: { enabled: false }
    },
    {
      $schema: SCHEMAS.material,
      id: "vintage_paper",
      name: "Vintage Canvas Paper",
      builtin: true,
      color: "#ebdbb2",
      opacity: 1.0,
      gradient: null,
      texture: { ref: "paper", scale: 100, depth: 60 },
      brushFill: { enabled: false }
    },
    {
      $schema: SCHEMAS.material,
      id: "manga_crosshatch",
      name: "Manga Crosshatch Fill",
      builtin: true,
      color: "#282828",
      opacity: 0.95,
      brushFill: {
        enabled: true,
        brushRef: "studio_inker",
        meshRef: "crosshatch",
        spacing: 7,
        strokeWidth: 1.8
      }
    }
  ];

  /* ── In-Memory Registries ── */
  const stores = {
    brush: new Map(),
    tip: new Map(),
    texture: new Map(),
    curve: new Map(),
    material: new Map(),
    palette: new Map(),
    mesh: new Map()
  };

  function seedDefaults() {
    BUILTIN_CURVES.forEach(c => stores.curve.set(c.id, { ...c }));
    BUILTIN_TIPS.forEach(t => stores.tip.set(t.id, { ...t }));
    BUILTIN_TEXTURES.forEach(tx => stores.texture.set(tx.id, { ...tx }));
    BUILTIN_MESHES.forEach(m => stores.mesh.set(m.id, { ...m }));
    BUILTIN_PALETTES.forEach(p => stores.palette.set(p.id, { ...p }));
    BUILTIN_BRUSHES.forEach(b => stores.brush.set(b.id, { ...b }));
    BUILTIN_MATERIALS.forEach(mat => stores.material.set(mat.id, { ...mat }));
  }

  seedDefaults();

  /* ── Bézier Evaluation Helper: Cubic Bézier Curve [0..1] -> [0..1] ── */
  function evalCubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
    const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
    return { x, y };
  }

  function sampleCurveAtX(curveObj, targetX) {
    if (!curveObj || !curveObj.points || curveObj.points.length < 4) {
      return Math.max(0, Math.min(1, targetX));
    }
    const [p0, p1, p2, p3] = curveObj.points;
    if (targetX <= 0) return p0[1];
    if (targetX >= 1) return p3[1];

    // Binary search parametric 't' for target 'x'
    let low = 0.0, high = 1.0;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) * 0.5;
      const pt = evalCubicBezier(p0, p1, p2, p3, mid);
      if (pt.x < targetX) low = mid;
      else high = mid;
    }
    const finalPt = evalCubicBezier(p0, p1, p2, p3, (low + high) * 0.5);
    return Math.max(0, Math.min(1, finalPt.y));
  }

  const EsenhoRegistry = {
    SCHEMAS,
    EXTENSIONS,

    /**
     * Registers or updates a standard asset.
     * @param {"brush"|"tip"|"texture"|"curve"|"material"|"palette"|"mesh"} type 
     * @param {Object} resource 
     * @returns {Object} registered resource
     */
    register(type, resource) {
      if (!stores[type]) throw new Error(`Unknown Esenho asset type: "${type}"`);
      if (!resource || !resource.id) throw new Error(`Resource must contain a unique 'id'`);
      
      const resCopy = JSON.parse(JSON.stringify(resource));
      resCopy.$schema = SCHEMAS[type];
      resCopy.updatedAt = new Date().toISOString();
      stores[type].set(resource.id, resCopy);
      return resCopy;
    },

    /**
     * Retrieves an asset by ID from the registry.
     * @param {"brush"|"tip"|"texture"|"curve"|"material"|"palette"|"mesh"} type 
     * @param {string} id 
     * @returns {Object|null}
     */
    get(type, id) {
      if (!stores[type]) return null;
      const res = stores[type].get(id);
      return res ? JSON.parse(JSON.stringify(res)) : null;
    },

    /**
     * Checks if an asset exists in registry.
     */
    has(type, id) {
      return stores[type] ? stores[type].has(id) : false;
    },

    /**
     * Lists all assets of a specified type.
     */
    list(type, options = {}) {
      if (!stores[type]) return [];
      const items = Array.from(stores[type].values());
      if (options.category) {
        return items.filter(it => it.category === options.category);
      }
      return items.map(it => JSON.parse(JSON.stringify(it)));
    },

    /**
     * Unregisters a user-created asset. (Built-ins cannot be deleted).
     */
    unregister(type, id) {
      if (!stores[type]) return false;
      const item = stores[type].get(id);
      if (item && item.builtin) return false;
      return stores[type].delete(id);
    },

    /**
     * Clones an asset under a new ID.
     */
    clone(type, sourceId, newId, newName) {
      const src = this.get(type, sourceId);
      if (!src) return null;
      delete src.builtin;
      src.id = newId;
      src.name = newName || `${src.name} (Copy)`;
      return this.register(type, src);
    },

    /**
     * Evaluates a curve transfer function at point x in [0, 1].
     * @param {string|Object} curveOrId 
     * @param {number} x - Normalized input [0..1]
     * @returns {number} Normalized output [0..1]
     */
    evaluateCurve(curveOrId, x) {
      const normX = Math.max(0, Math.min(1, Number(x) || 0));
      const curveObj = (typeof curveOrId === "string") ? this.get("curve", curveOrId) : curveOrId;
      return sampleCurveAtX(curveObj, normX);
    },

    /**
     * Resolves a brush reference with local stroke overrides (e.g. size, color, opacity)
     * producing a unified flat configuration for the raster/WASM/SVG engines.
     * @param {string|Object} brushOrId
     * @param {Object} [overrides]
     * @returns {Object} fully resolved brush config
     */
    resolveBrush(brushOrId, overrides = {}) {
      let baseBrush = null;
      if (typeof brushOrId === "string") {
        baseBrush = this.get("brush", brushOrId);
      } else if (brushOrId && typeof brushOrId === "object") {
        baseBrush = brushOrId.ref ? this.get("brush", brushOrId.ref) : brushOrId;
      }
      if (!baseBrush) {
        baseBrush = this.get("brush", "studio_inker") || BUILTIN_BRUSHES[1];
      }

      // Deep copy base brush
      const resolved = JSON.parse(JSON.stringify(baseBrush));

      // Resolve Tip Shape
      if (resolved.tip && resolved.tip.ref) {
        const tipObj = this.get("tip", resolved.tip.ref);
        if (tipObj) {
          resolved.tip = { ...tipObj, ...resolved.tip };
        }
      }

      // Resolve Texture
      if (resolved.texture && resolved.texture.ref && resolved.texture.ref !== "none") {
        const texObj = this.get("texture", resolved.texture.ref);
        if (texObj) {
          resolved.texture = { ...texObj, ...resolved.texture };
        }
      }

      // Apply Local Stroke Overrides
      if (overrides.size !== undefined) resolved.tip.size = Number(overrides.size);
      if (overrides.color !== undefined) resolved.color = overrides.color;
      if (overrides.opacity !== undefined) resolved.opacity = Number(overrides.opacity);
      if (overrides.flow !== undefined) resolved.flow = Number(overrides.flow);
      if (overrides.hardness !== undefined) resolved.tip.hardness = Number(overrides.hardness);

      return resolved;
    },

    /**
     * Resolves a material reference with local overrides.
     */
    resolveMaterial(matOrId, overrides = {}) {
      let baseMat = null;
      if (typeof matOrId === "string") {
        baseMat = this.get("material", matOrId);
      } else if (matOrId && typeof matOrId === "object") {
        baseMat = matOrId.ref ? this.get("material", matOrId.ref) : matOrId;
      }
      if (!baseMat) {
        baseMat = this.get("material", "solid_gold") || BUILTIN_MATERIALS[0];
      }

      const resolved = JSON.parse(JSON.stringify(baseMat));

      if (resolved.texture && resolved.texture.ref && resolved.texture.ref !== "none") {
        const texObj = this.get("texture", resolved.texture.ref);
        if (texObj) resolved.texture = { ...texObj, ...resolved.texture };
      }

      if (resolved.brushFill && resolved.brushFill.brushRef) {
        resolved.brushFill.resolvedBrush = this.resolveBrush(resolved.brushFill.brushRef);
      }
      if (resolved.brushFill && resolved.brushFill.meshRef) {
        resolved.brushFill.resolvedMesh = this.get("mesh", resolved.brushFill.meshRef);
      }

      return { ...resolved, ...overrides };
    },

    /**
     * Exports all user-defined assets as an archive/bundle manifest.
     */
    exportAll() {
      const manifest = {
        format: "esenho-resource-manifest",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        resources: {}
      };

      for (const type of Object.keys(stores)) {
        manifest.resources[type] = Array.from(stores[type].values()).filter(it => !it.builtin);
      }
      return manifest;
    },

    /**
     * Imports a manifest or asset bundle into registry.
     */
    importManifest(manifest) {
      if (!manifest || !manifest.resources) return 0;
      let count = 0;
      for (const [type, list] of Object.entries(manifest.resources)) {
        if (stores[type] && Array.isArray(list)) {
          for (const item of list) {
            this.register(type, item);
            count++;
          }
        }
      }
      return count;
    },

    /**
     * Resets registry to factory defaults.
     */
    resetDefaults() {
      for (const map of Object.values(stores)) map.clear();
      seedDefaults();
    }
  };

  return EsenhoRegistry;
});
