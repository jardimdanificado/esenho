/**
 * Esenho Universal Resource Registry & Runner v2.0
 * Decoupled Data & Runner Architecture for the 8 Standard Asset Types:
 *   1. Brush Presets (.ebrush) - Dynamic universal brush configurations
 *   2. Brush Tips    (.etip)   - Stamp / tip geometries (procedural, bitmap, svg)
 *   3. Textures      (.etex)   - Seamless grains, paper tooth, canvas, noise & procedural textures
 *   4. Materials     (.emat)   - Fill appearances, gradients, textures, WASM FX & procedural brush fills
 *   5. Curves        (.ecurve) - Bézier transfer functions (stylus pressure, velocity, dynamics, easing)
 *   6. Meshes        (.emesh)  - Procedural hatching meshes, trajectories & stroke fill layouts
 *   7. WASM FX       (.ewasm)  - WebAssembly filter plugins, backdrop lenses & image processing shaders
 *   8. Palettes      (.epal)   - Swatch sets, color ramps & multi-stop gradients
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
    brushPresets: "esenho/brush/v1",
    tip: "esenho/tip/v1",
    brushTips: "esenho/tip/v1",
    texture: "esenho/texture/v1",
    textures: "esenho/texture/v1",
    curve: "esenho/curve/v1",
    curves: "esenho/curve/v1",
    material: "esenho/material/v1",
    materials: "esenho/material/v1",
    palette: "esenho/palette/v1",
    palettes: "esenho/palette/v1",
    mesh: "esenho/mesh/v1",
    meshes: "esenho/mesh/v1",
    wasm_fx: "esenho/wasm_fx/v1",
    wasmFx: "esenho/wasm_fx/v1",
    data: "esenho/data/v1"
  };

  const TYPE_ALIASES = {
    brushPresets: "brush",
    brush: "brush",
    brushes: "brush",
    brushTips: "tip",
    tip: "tip",
    tips: "tip",
    textures: "texture",
    texture: "texture",
    materials: "material",
    material: "material",
    curves: "curve",
    curve: "curve",
    meshes: "mesh",
    mesh: "mesh",
    wasmFx: "wasm_fx",
    wasm_fx: "wasm_fx",
    wasm: "wasm_fx",
    plugins: "wasm_fx",
    palettes: "palette",
    palette: "palette"
  };

  const EXTENSIONS = {
    brush: ".ebrush",
    tip: ".etip",
    texture: ".etex",
    curve: ".ecurve",
    material: ".emat",
    palette: ".epal",
    mesh: ".emesh",
    wasm_fx: ".ewasm"
  };

  function normalizeType(type) {
    if (!type || typeof type !== "string") return "";
    return TYPE_ALIASES[type] || type;
  }

  function base64ToBytes(b64) {
    if (!b64 || typeof b64 !== "string") return new Uint8Array(0);
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(b64, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToBase64(u8) {
    if (!u8 || !(u8 instanceof Uint8Array)) return "";
    if (typeof Buffer !== "undefined") {
      return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
    }
    let binary = "";
    const len = u8.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = u8.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  /* ── In-Memory Registries for all resource types ── */
  const stores = {
    brush: new Map(),
    tip: new Map(),
    texture: new Map(),
    curve: new Map(),
    material: new Map(),
    palette: new Map(),
    mesh: new Map(),
    wasm_fx: new Map(),
    wasm_core: new Map()
  };

  let initialDataPackage = null;

  // Try loading default data.json in CommonJS / Node environments
  if (typeof require === "function") {
    try {
      const path = require("path");
      const fs = require("fs");
      const rootDataPath = path.join(__dirname, "../data.json");
      if (fs.existsSync(rootDataPath)) {
        initialDataPackage = JSON.parse(fs.readFileSync(rootDataPath, "utf8"));
      }
    } catch (_) {}
  }

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
    TYPE_ALIASES,

    /**
     * Loads a complete standardized data package (data.json).
     * @param {Object|string} data - Raw JSON string or parsed object
     * @returns {Object} statistics of loaded items
     */
    loadData(data) {
      if (!data) return { total: 0 };
      const pkg = typeof data === "string" ? JSON.parse(data) : data;

      const mapping = {
        brush: pkg.brushPresets || pkg.brushes || pkg.brush,
        tip: pkg.brushTips || pkg.tips || pkg.tip,
        texture: pkg.textures || pkg.texture,
        curve: pkg.curves || pkg.curve,
        material: pkg.materials || pkg.material,
        palette: pkg.palettes || pkg.palette,
        mesh: pkg.meshes || pkg.mesh,
        wasm_fx: pkg.wasmFx || pkg.wasm_fx || pkg.plugins
      };

      if (pkg.wasmCore && typeof pkg.wasmCore === "object") {
        const core = { ...pkg.wasmCore };
        if (!core.id) core.id = "quadro_canvas";
        stores.wasm_core.set(core.id, core);
      }

      const stats = {};
      for (const [storeKey, items] of Object.entries(mapping)) {
        if (!items) continue;
        let count = 0;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && item.id) {
              this.register(storeKey, item);
              count++;
            }
          }
        } else if (typeof items === "object") {
          for (const [id, item] of Object.entries(items)) {
            if (item && typeof item === "object") {
              const res = { ...item };
              if (!res.id) res.id = id;
              this.register(storeKey, res);
              count++;
            }
          }
        }
        stats[storeKey] = count;
      }
      return stats;
    },

    /**
     * Exports the live registry as a standardized data.json object.
     * @returns {Object} Standardized data package
     */
    exportData() {
      const toObj = (map) => {
        const obj = {};
        for (const [k, v] of map.entries()) {
          obj[k] = JSON.parse(JSON.stringify(v));
        }
        return obj;
      };

      const brushPresets = toObj(stores.brush);
      const textures = toObj(stores.texture);
      const brushTips = toObj(stores.tip);
      const materials = toObj(stores.material);
      const curves = toObj(stores.curve);
      const meshes = toObj(stores.mesh);
      const wasmFx = toObj(stores.wasm_fx);
      const palettes = toObj(stores.palette);
      const wasmCore = stores.wasm_core.get("quadro_canvas") ? JSON.parse(JSON.stringify(stores.wasm_core.get("quadro_canvas"))) : null;

      return {
        $schema: SCHEMAS.data,
        version: "1.0.0",
        name: "Esenho Universal Standard Resources",
        description: "Unified single-file resource library for brush presets, textures, brush tips, materials, curves, meshes, wasm fx plugins, and palettes.",
        exportedAt: new Date().toISOString(),
        stats: {
          brushPresets: Object.keys(brushPresets).length,
          textures: Object.keys(textures).length,
          brushTips: Object.keys(brushTips).length,
          materials: Object.keys(materials).length,
          curves: Object.keys(curves).length,
          meshes: Object.keys(meshes).length,
          wasmFx: Object.keys(wasmFx).length,
          palettes: Object.keys(palettes).length,
          hasWasmCore: Boolean(wasmCore)
        },
        wasmCore,
        brushPresets,
        textures,
        brushTips,
        materials,
        curves,
        meshes,
        wasmFx,
        palettes
      };
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

      for (const [type, store] of Object.entries(stores)) {
        manifest.resources[type] = Array.from(store.values()).filter(it => !it.builtin && !it.isBuiltIn);
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
        const normType = normalizeType(type);
        if (stores[normType] && Array.isArray(list)) {
          for (const item of list) {
            this.register(normType, item);
            count++;
          }
        }
      }
      return count;
    },

    /**
     * Registers or updates an asset in the registry.
     * @param {string} type - Resource category (e.g., 'brush', 'brushPresets', 'texture', 'material', etc.)
     * @param {Object} resource 
     * @returns {Object} registered resource
     */
    register(type, resource) {
      const normType = normalizeType(type);
      if (!stores[normType]) throw new Error(`Unknown Esenho asset type: "${type}"`);
      if (!resource || !resource.id) throw new Error(`Resource must contain a unique 'id'`);

      const resCopy = JSON.parse(JSON.stringify(resource));
      resCopy.$schema = SCHEMAS[normType] || `esenho/${normType}/v1`;
      if (!resCopy.builtin) {
        resCopy.updatedAt = new Date().toISOString();
      }
      stores[normType].set(resource.id, resCopy);
      return resCopy;
    },

    /**
     * Retrieves an asset by ID from the registry.
     * @param {string} type 
     * @param {string} id 
     * @returns {Object|null}
     */
    get(type, id) {
      const normType = normalizeType(type);
      if (!stores[normType]) return null;
      const res = stores[normType].get(id);
      return res ? JSON.parse(JSON.stringify(res)) : null;
    },

    /**
     * Checks if an asset exists in registry.
     */
    has(type, id) {
      const normType = normalizeType(type);
      return stores[normType] ? stores[normType].has(id) : false;
    },

    /**
     * Lists all assets of a specified type.
     */
    list(type, options = {}) {
      const normType = normalizeType(type);
      if (!stores[normType]) return [];
      let items = Array.from(stores[normType].values());
      if (options.category) {
        items = items.filter(it => it.category === options.category);
      }
      if (options.builtInOnly) {
        items = items.filter(it => Boolean(it.builtin || it.isBuiltIn));
      }
      return items.map(it => JSON.parse(JSON.stringify(it)));
    },

    /**
     * Returns an object dictionary mapping id -> resource for a type.
     */
    getDict(type) {
      const normType = normalizeType(type);
      if (!stores[normType]) return {};
      const dict = {};
      for (const [id, item] of stores[normType].entries()) {
        dict[id] = JSON.parse(JSON.stringify(item));
      }
      return dict;
    },

    /**
     * Unregisters a user-created asset. (Built-ins cannot be deleted).
     */
    unregister(type, id) {
      const normType = normalizeType(type);
      if (!stores[normType]) return false;
      const item = stores[normType].get(id);
      if (item && item.builtin) return false;
      return stores[normType].delete(id);
    },

    /**
     * Clones an asset under a new ID.
     */
    clone(type, sourceId, newId, newName) {
      const normType = normalizeType(type);
      const src = this.get(normType, sourceId);
      if (!src) return null;
      delete src.builtin;
      delete src.isBuiltIn;
      src.id = newId;
      src.name = newName || `${src.name} (Copy)`;
      return this.register(normType, src);
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
        baseBrush = this.get("brush", "studio_inker") || this.get("brush", "pencil") || { name: "Default Brush", size: 6 };
      }

      // Deep copy base brush
      const resolved = JSON.parse(JSON.stringify(baseBrush));

      // Ensure tip object is normalized
      if (!resolved.tip || typeof resolved.tip !== "object") {
        resolved.tip = {
          size: resolved.size !== undefined ? resolved.size : 6,
          hardness: resolved.hardness !== undefined ? resolved.hardness : 100,
          roundness: resolved.roundness !== undefined ? resolved.roundness : 100,
          angle: resolved.angle !== undefined ? resolved.angle : 0,
          shape: resolved.shape || "circle"
        };
      }

      // Resolve Tip Shape
      if (resolved.tip && resolved.tip.ref) {
        const tipObj = this.get("tip", resolved.tip.ref);
        if (tipObj) {
          resolved.tip = { ...tipObj, ...resolved.tip };
        }
      } else if (resolved.shape && typeof resolved.shape === "string") {
        const tipObj = this.get("tip", resolved.shape);
        if (tipObj) {
          resolved.tip = { ...tipObj, ...resolved.tip };
          resolved.resolvedTip = tipObj;
        }
      }

      // Resolve Texture
      if (resolved.texture && resolved.texture.ref && resolved.texture.ref !== "none") {
        const texObj = this.get("texture", resolved.texture.ref);
        if (texObj) {
          resolved.texture = { ...texObj, ...resolved.texture };
        }
      } else if (resolved.texture && typeof resolved.texture === "string" && resolved.texture !== "none") {
        const texObj = this.get("texture", resolved.texture);
        if (texObj) {
          resolved.resolvedTexture = texObj;
        }
      }

      // Apply Local Stroke Overrides
      if (overrides.size !== undefined) {
        if (resolved.tip && typeof resolved.tip === 'object') resolved.tip.size = Number(overrides.size);
        resolved.size = Number(overrides.size);
      }
      if (overrides.color !== undefined) resolved.color = overrides.color;
      if (overrides.opacity !== undefined) resolved.opacity = Number(overrides.opacity);
      if (overrides.flow !== undefined) resolved.flow = Number(overrides.flow);
      if (overrides.hardness !== undefined) {
        if (resolved.tip && typeof resolved.tip === 'object') resolved.tip.hardness = Number(overrides.hardness);
        resolved.hardness = Number(overrides.hardness);
      }

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
        baseMat = this.get("material", "solid_gold") || { id: "default_material", color: "#fabd2f", opacity: 1.0 };
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

      if (resolved.filter && resolved.filter.plugin) {
        resolved.resolvedWasmFx = this.get("wasm_fx", resolved.filter.plugin);
      }

      return { ...resolved, ...overrides };
    },

    /**
     * Resolves a mesh pattern.
     */
    resolveMesh(meshOrId, overrides = {}) {
      let baseMesh = null;
      if (typeof meshOrId === "string") {
        baseMesh = this.get("mesh", meshOrId);
      } else if (meshOrId && typeof meshOrId === "object") {
        baseMesh = meshOrId.ref ? this.get("mesh", meshOrId.ref) : meshOrId;
      }
      if (!baseMesh) {
        baseMesh = this.get("mesh", "linear") || { id: "linear", pattern: "linear", spacing: 8, angle: 45 };
      }
      return { ...JSON.parse(JSON.stringify(baseMesh)), ...overrides };
    },

    /**
     * Resolves a palette by ID or object.
     */
    resolvePalette(palOrId) {
      if (typeof palOrId === "string") {
        return this.get("palette", palOrId);
      }
      return palOrId;
    },

    /**
     * Resolves a WASM FX plugin info and parameters.
     */
    resolveWasmFx(fxOrId) {
      const id = typeof fxOrId === "string" ? fxOrId : (fxOrId && fxOrId.id);
      return this.get("wasm_fx", id);
    },

    /**
     * Retrieves the raw WASM binary as a Uint8Array from embedded base64.
     * @param {string} id - WASM FX plugin ID (or 'canvas' / 'quadro_canvas' for core)
     * @returns {Uint8Array|null}
     */
    getWasmBytes(id) {
      if (!id) return null;
      if (id === 'quadro_canvas' || id === 'canvas') {
        const core = stores.wasm_core ? stores.wasm_core.get('quadro_canvas') : null;
        if (core && core.wasmBase64) return base64ToBytes(core.wasmBase64);
      }
      const fx = this.get("wasm_fx", id);
      if (fx && fx.wasmBase64) {
        return base64ToBytes(fx.wasmBase64);
      }
      return null;
    },

    /**
     * Retrieves the WASM binary base64 string from registry.
     * @param {string} id
     * @returns {string|null}
     */
    getWasmBase64(id) {
      if (!id) return null;
      if (id === 'quadro_canvas' || id === 'canvas') {
        const core = stores.wasm_core ? stores.wasm_core.get('quadro_canvas') : null;
        if (core && core.wasmBase64) return core.wasmBase64;
      }
      const fx = this.get("wasm_fx", id);
      return fx ? fx.wasmBase64 || null : null;
    },

    /**
     * Compiles a WebAssembly.Module directly from embedded in-memory binary without file or network access.
     * @param {string} id
     * @returns {Promise<WebAssembly.Module|null>}
     */
    async compileWasmFx(id) {
      const bytes = this.getWasmBytes(id);
      if (!bytes || bytes.length === 0) return null;
      return await WebAssembly.compile(bytes);
    },

    /**
     * Instantiates a WebAssembly plugin instance directly from embedded in-memory binary.
     * @param {string} id
     * @param {Object} [importObject]
     * @returns {Promise<WebAssembly.Instance|null>}
     */
    async instantiateWasmFx(id, importObject = {}) {
      const bytes = this.getWasmBytes(id);
      if (!bytes || bytes.length === 0) return null;
      const res = await WebAssembly.instantiate(bytes, importObject);
      return res.instance || res;
    },

    /**
     * Loads a Data Pack (alias for loadData).
     * @param {Object|string} dataPack 
     */
    loadDataPack(dataPack) {
      return this.loadData(dataPack);
    },

    /**
     * Asynchronously fetches and activates a Data Pack from a URL.
     * @param {string} url 
     */
    async fetchDataPack(url = "data.json") {
      if (typeof fetch !== "function") return null;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return this.loadDataPack(data);
      } catch (err) {
        console.warn(`[EsenhoRegistry] Failed to fetch data pack from "${url}":`, err);
        return null;
      }
    },

    /**
     * Clears all stores in the registry.
     */
    clear() {
      for (const map of Object.values(stores)) map.clear();
    },

    /**
     * Resets registry to initial defaults from data package.
     */
    resetDefaults() {
      this.clear();
      if (initialDataPackage) {
        this.loadData(initialDataPackage);
      }
    }
  };

  // Seed with initial data package if available
  if (initialDataPackage) {
    EsenhoRegistry.loadData(initialDataPackage);
  } else if (typeof window !== "undefined" && typeof fetch === "function") {
    // Auto-fetch data.json in browser runtime
    EsenhoRegistry.fetchDataPack("data.json");
  }

  return EsenhoRegistry;
});
