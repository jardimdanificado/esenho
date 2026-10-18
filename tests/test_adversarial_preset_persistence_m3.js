/**
 * ============================================================================
 * Adversarial Empirical Stress Test Suite: Milestone 3 (Presets & Persistence)
 * File: tests/test_adversarial_preset_persistence_m3.js
 *
 * Empirical challenger stress-test harness verifying:
 *   1. 52-parameter JSON serialization roundtrip across all 66 metadata presets
 *      and synthetic extreme boundary presets.
 *   2. Cold-boot restore simulation with multi-session lifecycle recreation.
 *   3. Corrupted storage resilience (0-byte, truncated, binary garbage, non-array).
 *   4. Atomic file write safety and temporary file cleanup.
 *   5. Preset CRUD, name collision resolution, and built-in protection.
 *
 * Authoritative References: ORIGINAL_REQUEST.md (§ R5), PROJECT.md
 * ============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ----------------------------------------------------------------------------
// Full 52-Parameter Brush Preset Model (1:1 matching Kotlin BrushPresetModel)
// ----------------------------------------------------------------------------
class FullBrushPresetModel {
  constructor(data = {}) {
    this.id = data.id || ('custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    this.name = data.name || 'Custom Preset';
    this.desc = data.desc || '';
    this.category = data.category || 'Personalizado';
    this.isCustom = data.isCustom !== undefined ? Boolean(data.isCustom) : true;
    this.shape = data.shape || 'circle';
    this.shapeId = data.shape_id !== undefined ? Number(data.shape_id) : (data.shapeId !== undefined ? Number(data.shapeId) : 0);
    this.size = data.size !== undefined ? Number(data.size) : 16;
    this.opacity = data.opacity !== undefined ? Number(data.opacity) : 100;
    this.hardness = data.hardness !== undefined ? Number(data.hardness) : 100;
    this.flow = data.flow !== undefined ? Number(data.flow) : 100;
    this.spacing = data.spacing !== undefined ? Number(data.spacing) : 5;
    this.roundness = data.roundness !== undefined ? Number(data.roundness) : 100;
    this.angle = data.angle !== undefined ? Number(data.angle) : 0;
    this.smoothing = data.smoothing !== undefined ? Number(data.smoothing) : 15;
    this.midpoint = data.midpoint !== undefined ? Number(data.midpoint) : 50;
    this.scatter = data.scatter !== undefined ? Number(data.scatter) : 0;
    this.grain = data.grain !== undefined ? Number(data.grain) : 0;
    this.texMode = data.tex_mode !== undefined ? Number(data.tex_mode) : (data.texMode !== undefined ? Number(data.texMode) : 0);
    this.texture = data.texture || '';
    this.textureScale = data.texture_scale !== undefined ? Number(data.texture_scale) : (data.textureScale !== undefined ? Number(data.textureScale) : 100);
    this.textureContrast = data.texture_contrast !== undefined ? Number(data.texture_contrast) : (data.textureContrast !== undefined ? Number(data.textureContrast) : 100);
    this.texScaleWithSize = data.tex_scale_with_size !== undefined ? Number(data.tex_scale_with_size) : (data.texScaleWithSize !== undefined ? Number(data.texScaleWithSize) : 0);
    this.texAngle = data.tex_angle !== undefined ? Number(data.tex_angle) : (data.texAngle !== undefined ? Number(data.texAngle) : 0);
    this.autoRotate = data.auto_rotate !== undefined ? Number(data.auto_rotate) : (data.autoRotate !== undefined ? Number(data.autoRotate) : 0);
    this.velocity = data.velocity !== undefined ? Number(data.velocity) : 0;
    this.taperIn = data.taper_in !== undefined ? Number(data.taper_in) : (data.taperIn !== undefined ? Number(data.taperIn) : 0);
    this.taperOut = data.taper_out !== undefined ? Number(data.taper_out) : (data.taperOut !== undefined ? Number(data.taperOut) : 0);
    this.fade = data.fade !== undefined ? Number(data.fade) : 0;
    this.sizeJitter = data.size_jitter !== undefined ? Number(data.size_jitter) : (data.sizeJitter !== undefined ? Number(data.sizeJitter) : 0);
    this.angleJitter = data.angle_jitter !== undefined ? Number(data.angle_jitter) : (data.angleJitter !== undefined ? Number(data.angleJitter) : 0);
    this.opacityJitter = data.opacity_jitter !== undefined ? Number(data.opacity_jitter) : (data.opacityJitter !== undefined ? Number(data.opacityJitter) : 0);
    this.colorJitter = data.color_jitter !== undefined ? Number(data.color_jitter) : (data.colorJitter !== undefined ? Number(data.colorJitter) : 0);
    this.dabBlend = data.dab_blend !== undefined ? Number(data.dab_blend) : (data.dabBlend !== undefined ? Number(data.dabBlend) : 0);
    this.subpixel = data.subpixel !== undefined ? Number(data.subpixel) : 1;
    this.smudge = data.smudge !== undefined ? Number(data.smudge) : 0;
    this.wetness = data.wetness !== undefined ? Number(data.wetness) : 0;
    this.depletion = data.depletion !== undefined ? Number(data.depletion) : 0;
    this.colorPickup = data.color_pickup !== undefined ? Number(data.color_pickup) : (data.colorPickup !== undefined ? Number(data.colorPickup) : 0);
    this.pressureSize = data.pressure_size !== undefined ? Number(data.pressure_size) : (data.pressureSize !== undefined ? Number(data.pressureSize) : 1);
    this.pressureFlow = data.pressure_flow !== undefined ? Number(data.pressure_flow) : (data.pressureFlow !== undefined ? Number(data.pressureFlow) : 1);
    this.tiltAngle = data.tilt_angle !== undefined ? Number(data.tilt_angle) : (data.tiltAngle !== undefined ? Number(data.tiltAngle) : 0);
    this.buildup = data.buildup !== undefined ? Number(data.buildup) : 0;
    this.water = data.water !== undefined ? Number(data.water) : 0;
    this.bleed = data.bleed !== undefined ? Number(data.bleed) : 0;
    this.granulation = data.granulation !== undefined ? Number(data.granulation) : 0;
    this.fringe = data.fringe !== undefined ? Number(data.fringe) : 0;
    this.pigmentMode = data.pigment_mode !== undefined ? Number(data.pigment_mode) : (data.pigmentMode !== undefined ? Number(data.pigmentMode) : 0);
    this.impasto = data.impasto !== undefined ? Number(data.impasto) : 0;
    this.dryingRate = data.drying_rate !== undefined ? Number(data.drying_rate) : (data.dryingRate !== undefined ? Number(data.dryingRate) : 0);
    this.mode = data.mode !== undefined ? Number(data.mode) : 0;
    this.eraser = data.eraser !== undefined ? Number(data.eraser) : 0;
    this.color = data.color || '';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      desc: this.desc,
      category: this.category,
      isCustom: this.isCustom,
      shape: this.shape,
      shape_id: this.shapeId,
      size: this.size,
      opacity: this.opacity,
      hardness: this.hardness,
      flow: this.flow,
      spacing: this.spacing,
      roundness: this.roundness,
      angle: this.angle,
      smoothing: this.smoothing,
      midpoint: this.midpoint,
      scatter: this.scatter,
      grain: this.grain,
      tex_mode: this.texMode,
      texture: this.texture,
      texture_scale: this.textureScale,
      texture_contrast: this.textureContrast,
      tex_scale_with_size: this.texScaleWithSize,
      tex_angle: this.texAngle,
      auto_rotate: this.autoRotate,
      velocity: this.velocity,
      taper_in: this.taperIn,
      taper_out: this.taperOut,
      fade: this.fade,
      size_jitter: this.sizeJitter,
      angle_jitter: this.angleJitter,
      opacity_jitter: this.opacityJitter,
      color_jitter: this.colorJitter,
      dab_blend: this.dabBlend,
      subpixel: this.subpixel,
      smudge: this.smudge,
      wetness: this.wetness,
      depletion: this.depletion,
      color_pickup: this.colorPickup,
      pressure_size: this.pressureSize,
      pressure_flow: this.pressureFlow,
      tilt_angle: this.tiltAngle,
      buildup: this.buildup,
      water: this.water,
      bleed: this.bleed,
      granulation: this.granulation,
      fringe: this.fringe,
      pigment_mode: this.pigmentMode,
      impasto: this.impasto,
      drying_rate: this.dryingRate,
      mode: this.mode,
      eraser: this.eraser,
      color: this.color
    };
  }

  static fromJSON(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    return new FullBrushPresetModel(obj);
  }
}

// ----------------------------------------------------------------------------
// Rigorous Sandbox Storage Manager (1:1 with EsenhoStorageManager.kt)
// ----------------------------------------------------------------------------
class StrictStorageManager {
  constructor(sandboxDir) {
    this.sandboxDir = sandboxDir;
    if (!fs.existsSync(this.sandboxDir)) {
      fs.mkdirSync(this.sandboxDir, { recursive: true });
    }
  }

  get presetsFile() { return path.join(this.sandboxDir, 'esenho_custom_presets.json'); }
  get palettesFile() { return path.join(this.sandboxDir, 'esenho_palettes.json'); }
  get recentColorsFile() { return path.join(this.sandboxDir, 'esenho_recent_colors.json'); }
  get sessionFile() { return path.join(this.sandboxDir, 'esenho_session_state.json'); }

  atomicWrite(targetFile, content) {
    const tmpFile = targetFile + '.tmp';
    try {
      fs.writeFileSync(tmpFile, content, 'utf8');
      fs.renameSync(tmpFile, targetFile);
      return true;
    } catch (e) {
      if (fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
      return false;
    }
  }

  safeRead(file) {
    if (!fs.existsSync(file)) return null;
    try {
      const stats = fs.statSync(file);
      if (stats.size === 0) return null;
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  }

  saveCustomPresets(presets) {
    try {
      const list = presets.filter(p => p.isCustom).map(p => p.toJSON());
      return this.atomicWrite(this.presetsFile, JSON.stringify(list, null, 2));
    } catch {
      return false;
    }
  }

  loadCustomPresets() {
    const content = this.safeRead(this.presetsFile);
    if (!content) return [];
    const trimmed = content.trim();
    if (!trimmed.startsWith('[')) return [];
    try {
      const arr = JSON.parse(trimmed);
      if (!Array.isArray(arr)) return [];
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item && typeof item === 'object') {
          try {
            result.add ? result.add(FullBrushPresetModel.fromJSON(item)) : result.push(FullBrushPresetModel.fromJSON(item));
          } catch {}
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  saveSessionState(lastPresetId, activePaletteId, currentColor) {
    const obj = {};
    if (lastPresetId !== undefined && lastPresetId !== null) obj.lastPresetId = lastPresetId;
    if (activePaletteId !== undefined && activePaletteId !== null) obj.activePaletteId = activePaletteId;
    if (currentColor !== undefined && currentColor !== null) obj.currentColor = currentColor;
    return this.atomicWrite(this.sessionFile, JSON.stringify(obj, null, 2));
  }

  loadSessionState() {
    const content = this.safeRead(this.sessionFile);
    if (!content) return {};
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
}

// ----------------------------------------------------------------------------
// Full Empirical Engine Simulation (Cold Boot Lifecycle)
// ----------------------------------------------------------------------------
class SimulatedEsenhoEngine {
  constructor(storageDir, metadataPresets) {
    this.storage = new StrictStorageManager(storageDir);
    this.presetCatalog = [];
    this.selectedPreset = null;
    this.activePaletteId = 'classic';
    this.currentColor = 0xFF000000;

    // Load built-in presets from metadata
    if (metadataPresets && Array.isArray(metadataPresets)) {
      for (const p of metadataPresets) {
        const model = new FullBrushPresetModel({ ...p, isCustom: false });
        this.presetCatalog.push(model);
      }
    }

    // Load custom presets
    const custom = this.storage.loadCustomPresets();
    for (const cp of custom) {
      if (!this.presetCatalog.some(p => p.id === cp.id)) {
        this.presetCatalog.push(cp);
      }
    }

    // Restore session state
    const session = this.storage.loadSessionState();
    if (session.lastPresetId) {
      const found = this.presetCatalog.find(p => p.id === session.lastPresetId);
      if (found) this.selectedPreset = found;
    }
    if (!this.selectedPreset && this.presetCatalog.length > 0) {
      this.selectedPreset = this.presetCatalog.find(p => p.id === 'pencil') || this.presetCatalog[0];
    }
    if (session.activePaletteId) {
      this.activePaletteId = session.activePaletteId;
    }
    if (session.currentColor !== undefined) {
      this.currentColor = session.currentColor;
    }
  }

  saveCurrentPresetAsCustom(name, tweaks = {}) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('O nome do preset não pode ser vazio');
    }
    const base = this.selectedPreset;
    const existing = this.presetCatalog.find(p => p.isCustom && p.name.toLowerCase() === trimmed.toLowerCase());
    const presetId = existing ? existing.id : ('custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

    const newPreset = new FullBrushPresetModel({
      ...(base ? base.toJSON() : {}),
      ...tweaks,
      id: presetId,
      name: trimmed,
      isCustom: true
    });

    if (existing) {
      const idx = this.presetCatalog.indexOf(existing);
      this.presetCatalog[idx] = newPreset;
    } else {
      this.presetCatalog.push(newPreset);
    }

    this.selectedPreset = newPreset;
    this.storage.saveCustomPresets(this.presetCatalog.filter(p => p.isCustom));
    this.storage.saveSessionState(newPreset.id, this.activePaletteId, this.currentColor);
    return newPreset;
  }

  deleteCustomPreset(presetId) {
    const p = this.presetCatalog.find(p => p.id === presetId);
    if (!p) return false;
    if (!p.isCustom) return false; // Protected

    this.presetCatalog = this.presetCatalog.filter(item => item.id !== presetId);
    this.storage.saveCustomPresets(this.presetCatalog.filter(p => p.isCustom));

    if (this.selectedPreset && this.selectedPreset.id === presetId) {
      this.selectedPreset = this.presetCatalog.find(p => p.id === 'pencil') || this.presetCatalog[0] || null;
      this.storage.saveSessionState(this.selectedPreset ? this.selectedPreset.id : null, this.activePaletteId, this.currentColor);
    }
    return true;
  }
}

// ----------------------------------------------------------------------------
// Test Suite Execution
// ----------------------------------------------------------------------------
test('Milestone 3 Adversarial Challenge: 52 Preset Parameters & Storage Resilience', async (suite) => {
  const metadataPath = path.resolve(__dirname, '../android/app/src/main/assets/esenho_native_metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const rawPresets = metadata.presets;

  // --------------------------------------------------------------------------
  // Group 1: 52-Parameter Complete Fidelity Roundtrip
  // --------------------------------------------------------------------------
  await suite.test('CH-PRESET-1: 52-Parameter Complete Fidelity Roundtrip', async (t) => {

    await t.test('All 66 metadata presets preserve all 52 parameters through JSON roundtrip', () => {
      assert.strictEqual(rawPresets.length, 66, 'Must have exactly 66 curated presets');

      for (const raw of rawPresets) {
        const model = new FullBrushPresetModel(raw);
        const serialized = model.toJSON();
        const roundtrip = FullBrushPresetModel.fromJSON(serialized);

        // Verify id, name, category, isCustom
        assert.strictEqual(roundtrip.id, raw.id);
        assert.strictEqual(roundtrip.name, raw.name);
        assert.strictEqual(roundtrip.category, raw.category);

        // Verify all 48 tuning & physics parameters
        assert.strictEqual(roundtrip.shape, raw.shape);
        assert.strictEqual(roundtrip.shapeId, raw.shape_id);
        assert.strictEqual(roundtrip.size, raw.size);
        assert.strictEqual(roundtrip.opacity, raw.opacity);
        assert.strictEqual(roundtrip.hardness, raw.hardness);
        assert.strictEqual(roundtrip.flow, raw.flow);
        assert.strictEqual(roundtrip.spacing, raw.spacing);
        assert.strictEqual(roundtrip.roundness, raw.roundness);
        assert.strictEqual(roundtrip.angle, raw.angle);
        assert.strictEqual(roundtrip.smoothing, raw.smoothing);
        assert.strictEqual(roundtrip.midpoint, raw.midpoint);
        assert.strictEqual(roundtrip.scatter, raw.scatter);
        assert.strictEqual(roundtrip.grain, raw.grain);
        assert.strictEqual(roundtrip.texMode, raw.tex_mode);
        assert.strictEqual(roundtrip.texture, raw.texture);
        assert.strictEqual(roundtrip.textureScale, raw.texture_scale);
        assert.strictEqual(roundtrip.textureContrast, raw.texture_contrast);
        assert.strictEqual(roundtrip.texScaleWithSize, raw.tex_scale_with_size);
        assert.strictEqual(roundtrip.texAngle, raw.tex_angle);
        assert.strictEqual(roundtrip.autoRotate, raw.auto_rotate);
        assert.strictEqual(roundtrip.velocity, raw.velocity);
        assert.strictEqual(roundtrip.taperIn, raw.taper_in);
        assert.strictEqual(roundtrip.taperOut, raw.taper_out);
        assert.strictEqual(roundtrip.fade, raw.fade);
        assert.strictEqual(roundtrip.sizeJitter, raw.size_jitter);
        assert.strictEqual(roundtrip.angleJitter, raw.angle_jitter);
        assert.strictEqual(roundtrip.opacityJitter, raw.opacity_jitter);
        assert.strictEqual(roundtrip.colorJitter, raw.color_jitter);
        assert.strictEqual(roundtrip.dabBlend, raw.dab_blend);
        assert.strictEqual(roundtrip.subpixel, raw.subpixel);
        assert.strictEqual(roundtrip.smudge, raw.smudge);
        assert.strictEqual(roundtrip.wetness, raw.wetness);
        assert.strictEqual(roundtrip.depletion, raw.depletion);
        assert.strictEqual(roundtrip.colorPickup, raw.color_pickup);
        assert.strictEqual(roundtrip.pressureSize, raw.pressure_size);
        assert.strictEqual(roundtrip.pressureFlow, raw.pressure_flow);
        assert.strictEqual(roundtrip.tiltAngle, raw.tilt_angle);
        assert.strictEqual(roundtrip.buildup, raw.buildup);
        assert.strictEqual(roundtrip.water, raw.water);
        assert.strictEqual(roundtrip.bleed, raw.bleed);
        assert.strictEqual(roundtrip.granulation, raw.granulation);
        assert.strictEqual(roundtrip.fringe, raw.fringe);
        assert.strictEqual(roundtrip.pigmentMode, raw.pigment_mode);
        assert.strictEqual(roundtrip.impasto, raw.impasto);
        assert.strictEqual(roundtrip.dryingRate, raw.drying_rate);
        assert.strictEqual(roundtrip.mode, raw.mode);
        assert.strictEqual(roundtrip.eraser, raw.eraser);
        assert.strictEqual(roundtrip.color, raw.color);
      }
    });

    await t.test('Synthetic preset with extreme boundaries across all 52 parameters', () => {
      const boundaryPreset = new FullBrushPresetModel({
        id: 'extreme_alpha_123',
        name: '🎨 Extremidade Máxima 測試',
        desc: 'Special "quotes", \\slashes\\, and \n newlines',
        category: 'Experimental/Extreme',
        isCustom: true,
        shape: 'custom_procedural_chisel',
        shape_id: 2,
        size: 1000,
        opacity: 0,
        hardness: 0,
        flow: 0,
        spacing: 100,
        roundness: 0,
        angle: 360,
        smoothing: 100,
        midpoint: 0,
        scatter: 100,
        grain: 100,
        tex_mode: 2,
        texture: 'heavy_cold_press_canvas_tooth',
        texture_scale: 500,
        texture_contrast: 200,
        tex_scale_with_size: 1,
        tex_angle: 270,
        auto_rotate: 1,
        velocity: 100,
        taper_in: 100,
        taper_out: 100,
        fade: 100,
        size_jitter: 100,
        angle_jitter: 100,
        opacity_jitter: 100,
        color_jitter: 100,
        dab_blend: 1,
        subpixel: 0,
        smudge: 100,
        wetness: 100,
        depletion: 100,
        color_pickup: 100,
        pressure_size: 0,
        pressure_flow: 0,
        tilt_angle: 1,
        buildup: 1,
        water: 100,
        bleed: 100,
        granulation: 100,
        fringe: 100,
        pigment_mode: 1,
        impasto: 100,
        drying_rate: 100,
        mode: 5,
        eraser: 1,
        color: '#FF00AACC'
      });

      const jsonStr = JSON.stringify(boundaryPreset.toJSON());
      const restored = FullBrushPresetModel.fromJSON(jsonStr);

      assert.strictEqual(restored.name, '🎨 Extremidade Máxima 測試');
      assert.strictEqual(restored.desc, 'Special "quotes", \\slashes\\, and \n newlines');
      assert.strictEqual(restored.size, 1000);
      assert.strictEqual(restored.opacity, 0);
      assert.strictEqual(restored.textureScale, 500);
      assert.strictEqual(restored.color, '#FF00AACC');
      assert.strictEqual(restored.eraser, 1);
      assert.strictEqual(restored.impasto, 100);
    });

    await t.test('Missing JSON keys fall back to resilient default values', () => {
      const minimalObj = { id: 'min_1', name: 'Minimal' };
      const model = FullBrushPresetModel.fromJSON(minimalObj);

      assert.strictEqual(model.id, 'min_1');
      assert.strictEqual(model.name, 'Minimal');
      assert.strictEqual(model.size, 16);
      assert.strictEqual(model.opacity, 100);
      assert.strictEqual(model.hardness, 100);
      assert.strictEqual(model.flow, 100);
      assert.strictEqual(model.spacing, 5);
      assert.strictEqual(model.shape, 'circle');
      assert.strictEqual(model.isCustom, true);
      assert.strictEqual(model.eraser, 0);
    });
  });

  // --------------------------------------------------------------------------
  // Group 2: Cold-Boot Restore Simulation
  // --------------------------------------------------------------------------
  await suite.test('CH-PRESET-2: Cold-Boot Restore Simulation', async (t) => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esenho_coldboot_test_'));

    await t.test('Session 1: Create custom presets, modify session, save and exit', () => {
      const engine1 = new SimulatedEsenhoEngine(sandboxDir, rawPresets);
      assert.strictEqual(engine1.presetCatalog.length, 66);

      const p1 = engine1.saveCurrentPresetAsCustom('Pincel Óleo Espesso', { size: 45, impasto: 80, wetness: 60 });
      const p2 = engine1.saveCurrentPresetAsCustom('Nanquim Mangá Fineline', { size: 2, flow: 100, smoothing: 30 });

      assert.strictEqual(engine1.presetCatalog.length, 68);
      assert.strictEqual(engine1.selectedPreset.name, 'Nanquim Mangá Fineline');

      engine1.activePaletteId = 'cyberpunk';
      engine1.currentColor = 0xFF00FFCC;
      engine1.storage.saveSessionState(p2.id, engine1.activePaletteId, engine1.currentColor);
    });

    await t.test('Session 2: Cold start completely restores catalog, custom presets, and active state', () => {
      // Simulate new process instance with fresh memory pointing to same sandbox
      const engine2 = new SimulatedEsenhoEngine(sandboxDir, rawPresets);

      assert.strictEqual(engine2.presetCatalog.length, 68);
      const customP1 = engine2.presetCatalog.find(p => p.name === 'Pincel Óleo Espesso');
      const customP2 = engine2.presetCatalog.find(p => p.name === 'Nanquim Mangá Fineline');

      assert.ok(customP1);
      assert.strictEqual(customP1.size, 45);
      assert.strictEqual(customP1.impasto, 80);
      assert.strictEqual(customP1.wetness, 60);
      assert.strictEqual(customP1.isCustom, true);

      assert.ok(customP2);
      assert.strictEqual(customP2.size, 2);
      assert.strictEqual(customP2.smoothing, 30);
      assert.strictEqual(customP2.isCustom, true);

      // Verify active session state restored
      assert.strictEqual(engine2.selectedPreset.name, 'Nanquim Mangá Fineline');
      assert.strictEqual(engine2.activePaletteId, 'cyberpunk');
      assert.strictEqual(engine2.currentColor, 0xFF00FFCC);
    });

    await t.test('Session 3: Deleting active preset and cold restarting falls back to default preset', () => {
      const engine3 = new SimulatedEsenhoEngine(sandboxDir, rawPresets);
      const customP2 = engine3.presetCatalog.find(p => p.name === 'Nanquim Mangá Fineline');
      assert.ok(customP2);

      const deleted = engine3.deleteCustomPreset(customP2.id);
      assert.strictEqual(deleted, true);
      assert.strictEqual(engine3.presetCatalog.length, 67);

      // Cold start session 4
      const engine4 = new SimulatedEsenhoEngine(sandboxDir, rawPresets);
      assert.strictEqual(engine4.presetCatalog.length, 67);
      assert.strictEqual(engine4.presetCatalog.some(p => p.name === 'Nanquim Mangá Fineline'), false);
      assert.ok(engine4.selectedPreset, 'Must have a valid selected preset fallback');
      assert.strictEqual(engine4.selectedPreset.id, 'pencil');
    });

    // Cleanup
    try { fs.rmSync(sandboxDir, { recursive: true }); } catch {}
  });

  // --------------------------------------------------------------------------
  // Group 3: Storage Corruption Resilience & Fallback
  // --------------------------------------------------------------------------
  await suite.test('CH-PRESET-3: Storage Corruption Resilience & Fallback', async (t) => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esenho_corruption_test_'));
    const storage = new StrictStorageManager(sandboxDir);

    await t.test('0-byte empty file returns empty array without throwing', () => {
      fs.writeFileSync(storage.presetsFile, '', 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t.test('Truncated JSON midway through parsing returns empty array', () => {
      fs.writeFileSync(storage.presetsFile, '[{"id":"custom_1","name":"Pincel Incomp', 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t.test('Binary garbage / null bytes returns empty array', () => {
      const garbage = Buffer.from([0x00, 0xFF, 0xFE, 0x80, 0x12, 0x34, 0xDE, 0xAD]);
      fs.writeFileSync(storage.presetsFile, garbage);
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t.test('Non-array root JSON object returns empty array', () => {
      fs.writeFileSync(storage.presetsFile, JSON.stringify({ preset: 'invalid_root' }), 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.deepStrictEqual(loaded, []);
    });

    await t.test('Array with mixed valid and corrupted items recovers all valid items', () => {
      const mixed = [
        { id: 'valid_1', name: 'Valid One', isCustom: true, size: 25 },
        null,
        12345,
        'string_instead_of_object',
        { id: 'valid_2', name: 'Valid Two', isCustom: true, size: 50 }
      ];
      fs.writeFileSync(storage.presetsFile, JSON.stringify(mixed), 'utf8');
      const loaded = storage.loadCustomPresets();
      assert.strictEqual(loaded.length, 2);
      assert.strictEqual(loaded[0].name, 'Valid One');
      assert.strictEqual(loaded[1].name, 'Valid Two');
    });

    await t.test('Corrupted session state file returns empty object without throwing', () => {
      fs.writeFileSync(storage.sessionFile, 'CORRUPTED_SESSION_JSON{{{{', 'utf8');
      const session = storage.loadSessionState();
      assert.deepStrictEqual(session, {});
    });

    // Cleanup
    try { fs.rmSync(sandboxDir, { recursive: true }); } catch {}
  });

  // --------------------------------------------------------------------------
  // Group 4: Atomic Write Safety & Sandbox Isolation
  // --------------------------------------------------------------------------
  await suite.test('CH-PRESET-4: Atomic Write Safety & Sandbox Isolation', async (t) => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esenho_atomic_test_'));
    const storage = new StrictStorageManager(sandboxDir);

    await t.test('Atomic write cleans up temporary .tmp file on success', () => {
      const presets = [new FullBrushPresetModel({ id: 'p1', name: 'Test Brush', isCustom: true })];
      const ok = storage.saveCustomPresets(presets);
      assert.strictEqual(ok, true);

      assert.ok(fs.existsSync(storage.presetsFile));
      assert.strictEqual(fs.existsSync(storage.presetsFile + '.tmp'), false, 'Temp file must be removed');
    });

    await t.test('Rapid consecutive overwrites maintain data integrity', () => {
      for (let i = 0; i < 50; i++) {
        const presets = [new FullBrushPresetModel({ id: 'rapid_' + i, name: 'Rapid ' + i, isCustom: true })];
        storage.saveCustomPresets(presets);
      }
      const loaded = storage.loadCustomPresets();
      assert.strictEqual(loaded.length, 1);
      assert.strictEqual(loaded[0].name, 'Rapid 49');
    });

    await t.test('Only presets with isCustom = true are written to custom presets file', () => {
      const mixed = [
        new FullBrushPresetModel({ id: 'b1', name: 'Builtin', isCustom: false }),
        new FullBrushPresetModel({ id: 'c1', name: 'Custom', isCustom: true })
      ];
      storage.saveCustomPresets(mixed);
      const raw = JSON.parse(fs.readFileSync(storage.presetsFile, 'utf8'));
      assert.strictEqual(raw.length, 1);
      assert.strictEqual(raw[0].id, 'c1');
    });

    // Cleanup
    try { fs.rmSync(sandboxDir, { recursive: true }); } catch {}
  });

  // --------------------------------------------------------------------------
  // Group 5: Preset Catalog CRUD & Name Collision Defense
  // --------------------------------------------------------------------------
  await suite.test('CH-PRESET-5: Preset Catalog CRUD & Name Collision Defense', async (t) => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esenho_crud_test_'));
    const engine = new SimulatedEsenhoEngine(sandboxDir, rawPresets);

    await t.test('Saving preset with existing name updates existing preset without duplicate IDs', () => {
      const first = engine.saveCurrentPresetAsCustom('Giz Pastel Seco', { size: 20 });
      const id1 = first.id;

      const second = engine.saveCurrentPresetAsCustom('Giz Pastel Seco', { size: 35 });
      assert.strictEqual(second.id, id1, 'Must retain same ID on update');

      const matches = engine.presetCatalog.filter(p => p.name.toLowerCase() === 'giz pastel seco');
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].size, 35);
    });

    await t.test('Attempting to delete built-in preset returns false and does not remove it', () => {
      const beforeCount = engine.presetCatalog.length;
      const result = engine.deleteCustomPreset('pencil');
      assert.strictEqual(result, false, 'Built-in presets must be protected');
      assert.strictEqual(engine.presetCatalog.length, beforeCount);
      assert.ok(engine.presetCatalog.some(p => p.id === 'pencil'));
    });

    await t.test('Empty or whitespace-only preset names are strictly rejected', () => {
      assert.throws(() => { engine.saveCurrentPresetAsCustom(''); }, /vazio/);
      assert.throws(() => { engine.saveCurrentPresetAsCustom('   '); }, /vazio/);
      assert.throws(() => { engine.saveCurrentPresetAsCustom(null); }, /vazio/);
    });

    // Cleanup
    try { fs.rmSync(sandboxDir, { recursive: true }); } catch {}
  });

});
