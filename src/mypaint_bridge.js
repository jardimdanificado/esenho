/**
 * =========================================================================
 * Wesenho MyPaint Sidecar WASM Bridge (src/mypaint_bridge.js)
 * Native binding to official libmypaint (v1.6.1 upstream).
 * =========================================================================
 */

// Setting IDs matching upstream libmypaint v1.6.1 enum
export const MYPAINT_SETTINGS = {
  opaque: 0,
  opaque_multiply: 1,
  opaque_linearize: 2,
  radius_logarithmic: 3,
  hardness: 4,
  anti_aliasing: 5,
  dabs_per_basic_radius: 6,
  dabs_per_actual_radius: 7,
  dabs_per_second: 8,
  radius_by_random: 9,
  speed1_slowness: 10,
  speed2_slowness: 11,
  speed1_gamma: 12,
  speed2_gamma: 13,
  offset_by_random: 14,
  offset_by_speed: 15,
  offset_by_speed_slowness: 16,
  slow_tracking: 17,
  slow_tracking_per_dab: 18,
  tracking_noise: 19,
  color_h: 20,
  color_s: 21,
  color_v: 22,
  restore_color: 23,
  change_color_h: 24,
  change_color_l: 25,
  change_color_hsl_s: 26,
  change_color_v: 27,
  change_color_hsv_s: 28,
  smudge: 29,
  smudge_length: 30,
  smudge_radius_log: 31,
  eraser: 32,
  stroke_threshold: 33,
  stroke_duration_logarithmic: 34,
  stroke_holdtime: 35,
  custom_input: 36,
  custom_input_slowness: 37,
  elliptical_dab_ratio: 38,
  elliptical_dab_angle: 39,
  direction_filter: 40,
  lock_alpha: 41,
  colorize: 42,
  snap_to_pixel: 43,
  pressure_gain_log: 44,
  gridmap_scale: 45,
  gridmap_scale_x: 46,
  gridmap_scale_y: 47,
  smudge_length_log: 48,
  smudge_bucket: 49,
  smudge_transparency: 50,
  offset_y: 51,
  offset_x: 52,
  offset_angle: 53,
  offset_angle_asc: 54,
  offset_angle_view: 55,
  offset_angle_2: 56,
  offset_angle_2_asc: 57,
  offset_angle_2_view: 58,
  offset_angle_adj: 59,
  offset_multiplier: 60,
  posterize: 61,
  posterize_num: 62,
  paint_mode: 63
};

export const MYPAINT_INPUTS = {
  pressure: 0,
  speed1: 1,
  speed2: 2,
  random: 3,
  stroke: 4,
  direction: 5,
  tilt_declination: 6,
  declination: 6,
  tilt_ascension: 7,
  ascension: 7,
  custom: 8,
  direction_angle: 9,
  attack_angle: 10,
  tilt_declinationx: 11,
  declinationx: 11,
  tilt_declinationy: 12,
  declinationy: 12,
  gridmap_x: 13,
  gridmap_y: 14,
  viewzoom: 15,
  barrel_rotation: 16,
  brush_radius: 17
};

export const MYPAINT_INPUT_NAMES = {
  0: "Pressão (Pressure)",
  1: "Velocidade Rápida (Speed 1)",
  2: "Velocidade Suave (Speed 2)",
  3: "Aleatório (Random)",
  4: "Comprimento do Traço (Stroke)",
  5: "Direção do Traço (Direction)",
  6: "Declinação da Caneta (Declination)",
  7: "Ascensão da Caneta (Ascension)",
  8: "Entrada Custom (Custom)"
};

export const MYPAINT_SETTING_METADATA = {
  radius_logarithmic: {
    id: 3,
    label: "Raio do Traço (Tamanho)",
    category: "geometry",
    min: -2.0,
    max: 5.0,
    default: 1.5,
    step: 0.05,
    format: v => `${Math.round(2 * Math.exp(v))} px`,
    desc: "Tamanho do pincel em escala logarítmica real"
  },
  hardness: {
    id: 4,
    label: "Dureza da Borda",
    category: "geometry",
    min: 0.0,
    max: 1.0,
    default: 0.8,
    step: 0.01,
    format: v => `${Math.round(v * 100)}%`,
    desc: "Nitidez do contorno do dab de tinta"
  },
  dabs_per_actual_radius: {
    id: 6,
    label: "Espaçamento / Passo (Dabs)",
    category: "geometry",
    min: 0.5,
    max: 10.0,
    default: 3.0,
    step: 0.1,
    format: v => `${v.toFixed(1)}x`,
    desc: "Densidade de pontos por raio do traço"
  },
  dabs_per_basic_radius: {
    id: 5,
    label: "Densidade Básica",
    category: "geometry",
    min: 0.0,
    max: 10.0,
    default: 0.0,
    step: 0.1,
    format: v => `${v.toFixed(1)}`,
    desc: "Frequência de dabs independente do raio atual"
  },
  elliptical_dab_ratio: {
    id: 37,
    label: "Proporção Elíptica (Chisel)",
    category: "geometry",
    min: 1.0,
    max: 10.0,
    default: 1.0,
    step: 0.1,
    format: v => `${v.toFixed(1)}:1`,
    desc: "Achata o ponto para criar pontas chanfradas ou caligráficas"
  },
  elliptical_dab_angle: {
    id: 38,
    label: "Ângulo Elíptico",
    category: "geometry",
    min: 0.0,
    max: 360.0,
    default: 0.0,
    step: 1.0,
    format: v => `${Math.round(v)}°`,
    desc: "Orientação da elipse quando a ponta for chanfrada"
  },
  direction_filter: {
    id: 39,
    label: "Filtro de Direção",
    category: "geometry",
    min: 0.0,
    max: 10.0,
    default: 0.0,
    step: 0.1,
    format: v => `${v.toFixed(1)}`,
    desc: "Alinha rotação do dab com o sentido do movimento"
  },
  opaque: {
    id: 0,
    label: "Opacidade Base",
    category: "opacity",
    min: 0.0,
    max: 2.0,
    default: 1.0,
    step: 0.01,
    format: v => `${Math.round(v * 100)}%`,
    desc: "Densidade máxima de cobertura da tinta"
  },
  opaque_linearize: {
    id: 2,
    label: "Linearização de Fluxo",
    category: "opacity",
    min: 0.0,
    max: 1.0,
    default: 0.9,
    step: 0.05,
    format: v => `${Math.round(v * 100)}%`,
    desc: "Garante resposta proporcional em sobreposições"
  },
  eraser: {
    id: 31,
    label: "Modo Borracha / Apagar",
    category: "opacity",
    min: 0.0,
    max: 1.0,
    default: 0.0,
    step: 1.0,
    format: v => (v > 0.5 ? "Ativado" : "Desativado"),
    desc: "Subtrai alfa da superfície ao invés de depositar cor"
  },
  lock_alpha: {
    id: 40,
    label: "Bloquear Alfa (Lock Alpha)",
    category: "opacity",
    min: 0.0,
    max: 1.0,
    default: 0.0,
    step: 1.0,
    format: v => (v > 0.5 ? "Bloqueado" : "Livre"),
    desc: "Pinta exclusivamente sobre pixels já existentes na camada"
  },
  smudge: {
    id: 28,
    label: "Mistura / Smudge",
    category: "color",
    min: 0.0,
    max: 1.0,
    default: 0.0,
    step: 0.01,
    format: v => `${Math.round(v * 100)}%`,
    desc: "Intensidade com que o pincel espalha e mistura a tinta da tela"
  },
  smudge_length: {
    id: 29,
    label: "Comprimento do Smudge",
    category: "color",
    min: 0.0,
    max: 1.0,
    default: 0.5,
    step: 0.02,
    format: v => `${Math.round(v * 100)}%`,
    desc: "Duração do arraste de tinta antes de descarregar"
  },
  smudge_radius_log: {
    id: 30,
    label: "Raio de Smudge",
    category: "color",
    min: -2.0,
    max: 3.0,
    default: 0.0,
    step: 0.1,
    format: v => `${v.toFixed(1)}`,
    desc: "Área de captação de cor ao redor do centro do dab"
  },
  offset_by_random: {
    id: 13,
    label: "Dispersão / Jitter Aleatório",
    category: "dynamics",
    min: 0.0,
    max: 1.5,
    default: 0.0,
    step: 0.01,
    format: v => `${Math.round(v * 100)}%`,
    desc: "Deslocamento estocástico dos dabs (efeito spray / carvão)"
  },
  slow_tracking: {
    id: 16,
    label: "Estabilizador / Suavizador",
    category: "dynamics",
    min: 0.0,
    max: 10.0,
    default: 0.0,
    step: 0.1,
    format: v => `${v.toFixed(1)}s`,
    desc: "Inércia para traços caligráficos sem tremor"
  },
  speed1_slowness: {
    id: 9,
    label: "Filtro de Velocidade 1",
    category: "dynamics",
    min: 0.0,
    max: 10.0,
    default: 0.04,
    step: 0.01,
    format: v => `${v.toFixed(2)}`,
    desc: "Taxa de decaimento do sensor de velocidade rápida"
  }
};

/** Built-in starter .myb presets */
export const MYPAINT_PRESETS = {
  classic_pencil: {
    name: "Lápis Grafite 2B",
    description: "Lápis suave com resposta à pressão e textura natural",
    version: 2,
    settings: {
      opaque: { base_value: 0.3, pointsList: { pressure: [[0.0, 0.0], [1.0, 0.6]] } },
      radius_logarithmic: { base_value: 1.1, pointsList: { pressure: [[0.0, -0.4], [1.0, 0.8]] } },
      hardness: { base_value: 0.85 },
      dabs_per_actual_radius: { base_value: 3.5 },
      offset_by_random: { base_value: 0.08, pointsList: { pressure: [[0.0, 0.15], [1.0, 0.02]] } }
    }
  },
  ink_pen: {
    name: "Caneta Nanquim",
    description: "Traço firme e nítido para inking e caligrafia",
    version: 2,
    settings: {
      opaque: { base_value: 1.0 },
      radius_logarithmic: { base_value: 1.6, pointsList: { pressure: [[0.0, -1.2], [0.5, 0.0], [1.0, 0.8]] } },
      hardness: { base_value: 0.95 },
      dabs_per_actual_radius: { base_value: 4.0 },
      offset_by_random: { base_value: 0.0 }
    }
  },
  wet_oil_blender: {
    name: "Óleo & Smudge Úmido",
    description: "Mistura e espalha a tinta existente na tela com pigmento fresco",
    version: 2,
    settings: {
      opaque: { base_value: 0.85 },
      radius_logarithmic: { base_value: 2.5, pointsList: { pressure: [[0.0, -0.5], [1.0, 0.7]] } },
      hardness: { base_value: 0.6 },
      smudge: { base_value: 0.65, pointsList: { pressure: [[0.0, 0.3], [1.0, 0.8]] } },
      smudge_length: { base_value: 0.7 },
      dabs_per_actual_radius: { base_value: 2.2 }
    }
  },
  charcoal: {
    name: "Carvão Artístico",
    description: "Traço poroso e expressivo com alta dispersão",
    version: 2,
    settings: {
      opaque: { base_value: 0.45, pointsList: { pressure: [[0.0, 0.1], [1.0, 0.75]] } },
      radius_logarithmic: { base_value: 2.8, pointsList: { pressure: [[0.0, -0.3], [1.0, 0.5]] } },
      hardness: { base_value: 0.4 },
      dabs_per_actual_radius: { base_value: 2.0 },
      offset_by_random: { base_value: 0.22, pointsList: { pressure: [[0.0, 0.3], [1.0, 0.1]] } }
    }
  },
  watercolor_wash: {
    name: "Aquarela Suave",
    description: "Lavagem transparente com bordas difusas e acúmulo suave",
    version: 2,
    settings: {
      opaque: { base_value: 0.18, pointsList: { pressure: [[0.0, 0.05], [1.0, 0.35]] } },
      radius_logarithmic: { base_value: 3.2, pointsList: { pressure: [[0.0, 0.0], [1.0, 0.6]] } },
      hardness: { base_value: 0.35 },
      dabs_per_actual_radius: { base_value: 1.8 },
      smudge: { base_value: 0.4 },
      smudge_length: { base_value: 0.85 }
    }
  }
};

export class MyPaintEngine {
  constructor() {
    this.module = null;
    this.exports = null;
    this.memory = null;
    this.scratchRectPtr = 0;
    this.loaded = false;
    this.isOfficial = true;
  }

  /**
   * Initializes WASM module from libmypaint.js / WASM
   */
  async init(loaderOrPath = "plugins/libmypaint.js") {
    if (typeof window === "undefined" && typeof process !== "undefined") {
      // Node.js
      const { createRequire } = await import("module");
      const path = await import("path");
      const require = createRequire(import.meta.url);

      let createLibMyPaint;
      if (typeof loaderOrPath === "function") {
        createLibMyPaint = loaderOrPath;
      } else {
        const resolvedPath = path.resolve(process.cwd(), loaderOrPath.endsWith(".wasm") ? loaderOrPath.replace(".wasm", ".js") : loaderOrPath);
        createLibMyPaint = require(resolvedPath);
      }

      const mod = await createLibMyPaint();
      this.module = mod;
      this.exports = mod;
      this.memory = mod.wasmMemory || { buffer: mod.HEAPU8.buffer };
      this.isOfficial = true;

      mod._w_libmypaint_init();
      this.scratchRectPtr = mod._malloc(32);
      this.loaded = true;
      return this;
    }

    // Browser environment
    let createLibMyPaint = typeof window !== "undefined" ? window.createLibMyPaint : null;
    if (!createLibMyPaint) {
      // Load script dynamically if needed
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = loaderOrPath.endsWith(".wasm") ? loaderOrPath.replace(".wasm", ".js") : loaderOrPath;
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
      });
      createLibMyPaint = window.createLibMyPaint;
    }

    const mod = await createLibMyPaint();
    this.module = mod;
    this.exports = mod;
    this.memory = mod.wasmMemory || { buffer: mod.HEAPU8.buffer };
    this.isOfficial = true;

    mod._w_libmypaint_init();
    this.scratchRectPtr = mod._malloc(32);
    this.loaded = true;
    return this;
  }

  /**
   * Allocates buffer in WASM linear memory
   */
  alloc(size) {
    if (!this.loaded) return 0;
    return this.module._malloc(size);
  }

  /**
   * Frees buffer in WASM memory
   */
  free(ptr) {
    if (this.loaded && ptr) {
      this.module._free(ptr);
    }
  }

  /**
   * Allocates a new official MyPaintBrush instance
   */
  createBrush() {
    if (!this.loaded) throw new Error("libmypaint not initialized");
    const brush = this.module._w_libmypaint_brush_new();
    if (!brush) throw new Error("Failed to allocate MyPaintBrush");
    return brush;
  }

  /**
   * Frees official MyPaintBrush instance
   */
  freeBrush(brush) {
    if (this.loaded && brush) {
      this.module._w_libmypaint_brush_free(brush);
    }
  }

  /**
   * Resets brush stroke dynamics
   */
  resetBrush(brush) {
    if (this.loaded && brush) {
      this.module._w_libmypaint_brush_reset(brush);
    }
  }

  /**
   * Loads brush configuration from JSON string or object via upstream parser
   */
  loadBrushData(brush, mybJsonOrStr) {
    if (!this.loaded || !brush) return;

    const jsonStr = typeof mybJsonOrStr === "string" ? mybJsonOrStr : JSON.stringify(mybJsonOrStr);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(jsonStr + "\0");
    const ptr = this.alloc(bytes.length);
    const view = new Uint8Array(this.memory.buffer, ptr, bytes.length);
    view.set(bytes);

    const ok = this.module._w_libmypaint_brush_from_string(brush, ptr);
    this.free(ptr);

    if (!ok) {
      // Fallback to setting base values manually
      const obj = typeof mybJsonOrStr === "object" ? mybJsonOrStr : JSON.parse(jsonStr);
      const settings = obj.settings || obj;
      for (const [settingName, settingDef] of Object.entries(settings)) {
        const settingId = MYPAINT_SETTINGS[settingName];
        if (settingId === undefined) continue;

        if (typeof settingDef === "number") {
          this.module._w_libmypaint_brush_set_base_value(brush, settingId, settingDef);
        } else if (typeof settingDef === "object" && settingDef !== null) {
          if (typeof settingDef.base_value === "number") {
            this.module._w_libmypaint_brush_set_base_value(brush, settingId, settingDef.base_value);
          }
          const pointsList = settingDef.inputs || settingDef.pointsList || {};
          for (const [inputName, points] of Object.entries(pointsList)) {
            const inputId = MYPAINT_INPUTS[inputName];
            if (inputId === undefined || !Array.isArray(points)) continue;
            if (this.module._w_libmypaint_brush_set_mapping_n) {
              this.module._w_libmypaint_brush_set_mapping_n(brush, settingId, inputId, points.length);
            }
            for (let i = 0; i < points.length; i++) {
              const pt = points[i];
              if (Array.isArray(pt) && pt.length >= 2) {
                this.module._w_libmypaint_brush_set_mapping_point(brush, settingId, inputId, i, pt[0], pt[1]);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Loads a starter preset
   */
  loadPreset(brush, presetKey) {
    const preset = MYPAINT_PRESETS[presetKey];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}`);
    this.loadBrushData(brush, preset);
    return preset;
  }

  /**
   * Sets brush color from HSV (0.0 to 1.0)
   */
  setBrushColor(brush, h, s, v) {
    if (!this.loaded || !brush) return;
    this.module._w_libmypaint_brush_set_base_value(brush, MYPAINT_SETTINGS.color_h, h);
    this.module._w_libmypaint_brush_set_base_value(brush, MYPAINT_SETTINGS.color_s, s);
    this.module._w_libmypaint_brush_set_base_value(brush, MYPAINT_SETTINGS.color_v, v);
  }

  /**
   * Sets brush color from hex string (#RRGGBB)
   */
  setBrushColorHex(brush, hexStr) {
    const c = hexStr.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    this.setBrushColor(brush, h, s, v);
  }

  /**
   * Sets a single setting's base value
   */
  setBaseValue(brush, settingKeyOrId, value) {
    if (!this.loaded || !brush) return;
    const settingId = typeof settingKeyOrId === "string" ? MYPAINT_SETTINGS[settingKeyOrId] : settingKeyOrId;
    if (settingId === undefined) return;
    this.module._w_libmypaint_brush_set_base_value(brush, settingId, value);
  }

  /**
   * Gets a single setting's base value
   */
  getBaseValue(brush, settingKeyOrId) {
    if (!this.loaded || !brush) return 0.0;
    const settingId = typeof settingKeyOrId === "string" ? MYPAINT_SETTINGS[settingKeyOrId] : settingKeyOrId;
    if (settingId === undefined) return 0.0;
    return this.module._w_libmypaint_brush_get_base_value(brush, settingId);
  }

  /**
   * Sets mapping point count for a dynamic input
   */
  setMappingN(brush, settingKeyOrId, inputKeyOrId, n) {
    if (!this.loaded || !brush) return;
    const settingId = typeof settingKeyOrId === "string" ? MYPAINT_SETTINGS[settingKeyOrId] : settingKeyOrId;
    const inputId = typeof inputKeyOrId === "string" ? MYPAINT_INPUTS[inputKeyOrId] : inputKeyOrId;
    if (settingId === undefined || inputId === undefined) return;
    this.module._w_libmypaint_brush_set_mapping_n(brush, settingId, inputId, n);
  }

  /**
   * Sets a specific mapping point (x, y)
   */
  setMappingPoint(brush, settingKeyOrId, inputKeyOrId, ptIdx, x, y) {
    if (!this.loaded || !brush) return;
    const settingId = typeof settingKeyOrId === "string" ? MYPAINT_SETTINGS[settingKeyOrId] : settingKeyOrId;
    const inputId = typeof inputKeyOrId === "string" ? MYPAINT_INPUTS[inputKeyOrId] : inputKeyOrId;
    if (settingId === undefined || inputId === undefined) return;
    this.module._w_libmypaint_brush_set_mapping_point(brush, settingId, inputId, ptIdx, x, y);
  }

  /**
   * Sets clip mask in WASM memory
   */
  setClipMask(maskPtr) {
    if (!this.loaded) return;
    if (this.module._w_libmypaint_set_clip_mask) {
      this.module._w_libmypaint_set_clip_mask(maskPtr);
    }
  }

  /**
   * Clears clip mask
   */
  clearClipMask() {
    if (!this.loaded) return;
    if (this.module._w_libmypaint_clear_clip_mask) {
      this.module._w_libmypaint_clear_clip_mask();
    }
  }

  /**
   * Simulates brush stroke step and draws dabs into Wesenho surface buffer
   */
  strokeTo(brush, pixelsOffsetOrPtr, width, height, x, y, pressure, tiltX = 0, tiltY = 0, dtime = 0.016) {
    if (!this.loaded || !brush) return { dabsDrawn: 0, dirtyRect: null };

    const dabsDrawn = this.module._w_libmypaint_stroke_to(
      brush,
      pixelsOffsetOrPtr,
      width,
      height,
      x,
      y,
      pressure,
      tiltX,
      tiltY,
      dtime
    );

    let dirtyRect = null;
    if (dabsDrawn > 0) {
      this.module._w_libmypaint_get_dirty_rect(this.scratchRectPtr);
      const mem32 = new Int32Array(this.module.HEAPU8.buffer, this.scratchRectPtr, 4);
      dirtyRect = {
        minX: mem32[0],
        minY: mem32[1],
        maxX: mem32[2],
        maxY: mem32[3]
      };
      this.module._w_libmypaint_clear_dirty_rect();
    }

    return { dabsDrawn, dirtyRect };
  }
}
