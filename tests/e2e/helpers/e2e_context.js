/**
 * ============================================================================
 * E2E Test Helper: E2E Context (tests/e2e/helpers/e2e_context.js)
 * Implements mock Android Context, Jetpack Compose UI state models,
 * EsenhoStorageManager sandbox persistence, and layout constraints.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { TransformOracle } = require('./transform_oracle.js');

const ToolMode = Object.freeze({
  BRUSH: 'BRUSH',
  ERASER: 'ERASER',
  SELECT_RECT: 'SELECT_RECT',
  SELECT_LASSO: 'SELECT_LASSO',
  TRANSFORM: 'TRANSFORM',
  FILL: 'FILL',
  EYEDROPPER: 'EYEDROPPER',
  HAND: 'HAND'
});

class MockBrushPresetModel {
  constructor(options = {}) {
    this.id = options.id || ('preset_' + Math.random().toString(36).substring(2, 9));
    this.name = options.name || 'Sem Título';
    this.brushId = options.brushId || 'round_hard';
    this.size = options.size !== undefined ? options.size : 20;
    this.opacity = options.opacity !== undefined ? options.opacity : 100;
    this.flow = options.flow !== undefined ? options.flow : 100;
    this.hardness = options.hardness !== undefined ? options.hardness : 80;
    this.spacing = options.spacing !== undefined ? options.spacing : 15;
    this.texture = options.texture || null;
    this.isCustom = Boolean(options.isCustom);
    this.parameters = options.parameters ? { ...options.parameters } : {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      brushId: this.brushId,
      size: this.size,
      opacity: this.opacity,
      flow: this.flow,
      hardness: this.hardness,
      spacing: this.spacing,
      texture: this.texture,
      isCustom: this.isCustom,
      parameters: this.parameters
    };
  }

  static fromJSON(json) {
    return new MockBrushPresetModel(typeof json === 'string' ? JSON.parse(json) : json);
  }
}

class MockColorPaletteModel {
  constructor(options = {}) {
    this.name = options.name || 'Nova Paleta';
    this.colors = Array.isArray(options.colors) ? [...options.colors] : [];
    this.isCustom = Boolean(options.isCustom);
  }

  toJSON() {
    return {
      name: this.name,
      colors: this.colors,
      isCustom: this.isCustom
    };
  }

  static fromJSON(json) {
    return new MockColorPaletteModel(typeof json === 'string' ? JSON.parse(json) : json);
  }
}

/**
 * Sandboxed JSON storage matching EsenhoStorageManager contract
 */
class MockStorageManager {
  constructor(sandboxDir) {
    this.sandboxDir = sandboxDir || fs.mkdtempSync(path.join(os.tmpdir(), 'esenho_test_sandbox_'));
    if (!fs.existsSync(this.sandboxDir)) {
      fs.mkdirSync(this.sandboxDir, { recursive: true });
    }
  }

  get presetsFile() {
    return path.join(this.sandboxDir, 'custom_brush_presets.json');
  }

  get palettesFile() {
    return path.join(this.sandboxDir, 'custom_color_palettes.json');
  }

  saveCustomPresets(presets) {
    const list = presets.filter(p => p.isCustom).map(p => (p.toJSON ? p.toJSON() : p));
    const tempFile = this.presetsFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tempFile, this.presetsFile);
    return true;
  }

  loadCustomPresets() {
    if (!fs.existsSync(this.presetsFile)) return [];
    try {
      const data = fs.readFileSync(this.presetsFile, 'utf8');
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(item => MockBrushPresetModel.fromJSON(item));
    } catch {
      return []; // Resilient fallback against corruption
    }
  }

  savePalettes(palettes) {
    const list = palettes.map(p => (p.toJSON ? p.toJSON() : p));
    const tempFile = this.palettesFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tempFile, this.palettesFile);
    return true;
  }

  loadPalettes() {
    if (!fs.existsSync(this.palettesFile)) {
      return this.getDefaultPalettes();
    }
    try {
      const data = fs.readFileSync(this.palettesFile, 'utf8');
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed) || parsed.length === 0) return this.getDefaultPalettes();
      return parsed.map(item => MockColorPaletteModel.fromJSON(item));
    } catch {
      return this.getDefaultPalettes();
    }
  }

  getDefaultPalettes() {
    return [
      new MockColorPaletteModel({ name: 'Clássico', colors: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'], isCustom: false }),
      new MockColorPaletteModel({ name: 'Pele', colors: ['#fce2c4', '#f0b987', '#d08b5b', '#8a4b2a'], isCustom: false }),
      new MockColorPaletteModel({ name: 'Cyberpunk', colors: ['#05d9e8', '#ff2a6d', '#01012b', '#d1f7ff'], isCustom: false }),
      new MockColorPaletteModel({ name: 'Pastel', colors: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'], isCustom: false }),
      new MockColorPaletteModel({ name: 'Manga', colors: ['#1a1a1a', '#4d4d4d', '#808080', '#b3b3b3', '#ffffff'], isCustom: false })
    ];
  }

  cleanup() {
    try {
      fs.rmSync(this.sandboxDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * End-to-end simulated Android Painter Activity & Engine Environment
 */
class MockNativePainterEnvironment {
  constructor(options = {}) {
    this.screenWidthDp = options.screenWidthDp || 390; // Standard modern Android phone width
    this.screenHeightDp = options.screenHeightDp || 844;
    this.storage = new MockStorageManager(options.sandboxDir);

    // Engine & UI State
    this.currentTool = ToolMode.BRUSH;
    this.currentColor = '#000000';
    this.brushSize = 25;
    this.brushOpacity = 100;
    this.brushHardness = 85;

    // Catalogs
    this.presetCatalog = [];
    this.palettes = this.storage.loadPalettes();
    this.activePalette = this.palettes[0];
    this.selectedPreset = null;

    // UI Drawer & Modal State
    this.showBrushDrawer = false;
    this.showLayerDrawer = false;
    this.showColorStudio = false;
    this.presetSearchQuery = '';

    // Selection State
    this.selectionActive = false;
    this.selectionBounds = null; // { left, top, right, bottom }
    this.selectionMask = null;   // Uint8Array
    this.selectionPath = null;   // Array of {x, y} vertices
    this.marchingAntsPhase = 0;

    // Transform State
    this.transformActive = false;
    this.transformState = null;

    // Undo/Redo Stacks
    this.undoStack = [];
    this.redoStack = [];

    // Layers (Layer 0 is base)
    this.layers = [
      { id: 0, name: 'Camada 1', pixels: new Uint32Array(800 * 600), visible: true, opacity: 100 }
    ];
    this.activeLayerIndex = 0;

    this.initializePresets();
  }

  initializePresets() {
    this.presetCatalog = [
      new MockBrushPresetModel({ id: 'pen_g', name: 'Caneta G', isCustom: false }),
      new MockBrushPresetModel({ id: 'soft_airbrush', name: 'Aerógrafo Suave', isCustom: false }),
      new MockBrushPresetModel({ id: 'rough_pencil', name: 'Lápis Texturizado', isCustom: false })
    ];
    // Merge custom persisted presets
    const custom = this.storage.loadCustomPresets();
    this.presetCatalog.push(...custom);
    this.selectedPreset = this.presetCatalog[0];
  }

  // --- Tool Navigation & Ergonomics ---

  clickPincelTool() {
    this.currentTool = ToolMode.BRUSH;
    // Decoupled: clicking pincel does NOT open brush drawer
  }

  clickPresetsButton() {
    this.showBrushDrawer = true;
  }

  clickEraserTool() {
    this.currentTool = ToolMode.ERASER;
  }

  clickTransformTool() {
    this.currentTool = ToolMode.TRANSFORM;
    this.beginTransform(this.selectionActive);
  }

  getTooltipForTool(tool) {
    const tooltips = {
      [ToolMode.BRUSH]: 'Pincel',
      [ToolMode.ERASER]: 'Borracha',
      [ToolMode.SELECT_RECT]: 'Seleção Retangular',
      [ToolMode.SELECT_LASSO]: 'Seleção Laço',
      [ToolMode.TRANSFORM]: 'Transformar',
      [ToolMode.FILL]: 'Preenchimento',
      [ToolMode.EYEDROPPER]: 'Conta-gotas',
      [ToolMode.HAND]: 'Mover Tela'
    };
    return tooltips[tool] || 'Ferramenta';
  }

  // --- Top App Bar Layout & Truncation ---

  computeTopBarLayout(presetName = null) {
    const name = presetName !== null ? presetName : (this.selectedPreset ? this.selectedPreset.name : '');
    const titleWidth = 80; // "esenho" title width in dp
    const actionsWidth = 240; // Undo, Redo, Layers, Settings action buttons combined
    const availableForPreset = Math.max(40, this.screenWidthDp - titleWidth - actionsWidth - 16);

    // Max allowed preset chip width is capped at 140dp
    const maxChipWidth = Math.min(140, availableForPreset);

    // Character capacity (~8dp per char)
    const maxChars = Math.max(4, Math.floor(maxChipWidth / 8));
    let displayLabel = name;
    let isTruncated = false;

    if (name.length > maxChars) {
      displayLabel = name.substring(0, maxChars - 1) + '…';
      isTruncated = true;
    }

    return {
      screenWidth: this.screenWidthDp,
      maxChipWidth,
      displayLabel,
      isTruncated,
      collidesWithUndo: false // Protected by maxChipWidth constraint
    };
  }

  // --- Compact Drawers & HUD ---

  getBrushDrawerLayout() {
    return {
      cardHeightDp: 48,
      paddingDp: 8,
      maxHeightDp: Math.round(this.screenHeightDp * 0.55),
      searchBarHeightDp: 36
    };
  }

  getLayerDrawerLayout() {
    return {
      cardHeightDp: 48,
      panelHeightDp: 120,
      maxHeightDp: Math.round(this.screenHeightDp * 0.50)
    };
  }

  getSelectionHUDLayout() {
    return {
      widthDp: 160, // Compact fixed width
      iconOnly: true,
      actions: ['invert', 'deselect', 'clear', 'transform']
    };
  }

  // --- Custom Presets & Palettes ---

  saveCurrentPresetAsCustom(name) {
    if (!name || name.trim().length === 0) {
      throw new Error('Nome de preset inválido: não pode ser vazio');
    }
    const cleanName = name.trim();
    const id = 'custom_' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newPreset = new MockBrushPresetModel({
      id,
      name: cleanName,
      size: this.brushSize,
      opacity: this.brushOpacity,
      hardness: this.brushHardness,
      isCustom: true
    });

    // Remove existing if duplicate id
    this.presetCatalog = this.presetCatalog.filter(p => p.id !== id);
    this.presetCatalog.push(newPreset);
    this.selectedPreset = newPreset;
    this.storage.saveCustomPresets(this.presetCatalog);
    return newPreset;
  }

  createCustomPalette(name) {
    if (!name || name.trim().length === 0) {
      throw new Error('Nome de paleta inválido');
    }
    const pal = new MockColorPaletteModel({ name: name.trim(), colors: [], isCustom: true });
    this.palettes.push(pal);
    this.activePalette = pal;
    this.storage.savePalettes(this.palettes);
    return pal;
  }

  addColorToActivePalette(hex) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      throw new Error(`Cor hexadecimal inválida: ${hex}`);
    }
    if (!this.activePalette) return;
    this.activePalette.colors.push(hex.toLowerCase());
    this.storage.savePalettes(this.palettes);
  }

  removeColorFromActivePalette(index) {
    if (!this.activePalette || index < 0 || index >= this.activePalette.colors.length) return;
    this.activePalette.colors.splice(index, 1);
    this.storage.savePalettes(this.palettes);
  }

  deletePalette(index) {
    const pal = this.palettes[index];
    if (!pal) return false;
    if (!pal.isCustom) {
      throw new Error(`Paletas padrão (${pal.name}) não podem ser excluídas`);
    }
    this.palettes.splice(index, 1);
    if (this.activePalette === pal) {
      this.activePalette = this.palettes[0] || null;
    }
    this.storage.savePalettes(this.palettes);
    return true;
  }

  // --- Transform Engine ---

  beginTransform(selectionOnly = false) {
    const layer = this.layers[this.activeLayerIndex];
    this.pushUndoSnapshot('begin_transform');

    let bounds, bitmap;
    if (selectionOnly && this.selectionActive && this.selectionBounds) {
      bounds = { ...this.selectionBounds };
      const w = bounds.right - bounds.left;
      const h = bounds.bottom - bounds.top;
      bitmap = new Uint32Array(w * h);

      // Extract pixels inside selection mask
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const canvasX = bounds.left + x;
          const canvasY = bounds.top + y;
          const maskIdx = y * w + x;
          const isMasked = this.selectionMask ? this.selectionMask[maskIdx] === 1 : true;
          if (isMasked && canvasX >= 0 && canvasX < 800 && canvasY >= 0 && canvasY < 600) {
            const pixel = layer.pixels[canvasY * 800 + canvasX];
            bitmap[maskIdx] = pixel;
            layer.pixels[canvasY * 800 + canvasX] = 0; // Clear source pixel
          }
        }
      }
    } else {
      bounds = { left: 0, top: 0, right: 800, bottom: 600 };
      bitmap = new Uint32Array(layer.pixels);
      layer.pixels.fill(0); // Clear layer
    }

    const matrix = TransformOracle.identity();
    const quad = TransformOracle.computeQuad(matrix, bounds);
    const handles = TransformOracle.computeHandles(quad);

    this.transformActive = true;
    this.transformState = {
      bounds,
      bitmap,
      matrix,
      quad,
      handles,
      selectionOnly
    };
  }

  commitTransform() {
    if (!this.transformActive || !this.transformState) return false;
    const { bounds, bitmap, quad } = this.transformState;
    const layer = this.layers[this.activeLayerIndex];
    const bw = bounds.right - bounds.left;
    const bh = bounds.bottom - bounds.top;

    // Bake transformed pixels into layer using bilinear sampling across quad
    for (let y = 0; y < bh; y++) {
      const v = bh > 1 ? y / (bh - 1) : 0;
      for (let x = 0; x < bw; x++) {
        const u = bw > 1 ? x / (bw - 1) : 0;
        const pix = TransformOracle.sampleBilinear(bitmap, bw, bh, x, y);
        const targetX = Math.round(
          (1 - u) * (1 - v) * quad[0].x +
          u * (1 - v) * quad[1].x +
          u * v * quad[2].x +
          (1 - u) * v * quad[3].x
        );
        const targetY = Math.round(
          (1 - u) * (1 - v) * quad[0].y +
          u * (1 - v) * quad[1].y +
          u * v * quad[2].y +
          (1 - u) * v * quad[3].y
        );
        if (targetX >= 0 && targetX < 800 && targetY >= 0 && targetY < 600) {
          layer.pixels[targetY * 800 + targetX] = pix;
        }
      }
    }

    this.transformActive = false;
    this.transformState = null;
    this.currentTool = ToolMode.BRUSH;
    return true;
  }

  cancelTransform() {
    if (!this.transformActive) return false;
    this.undo(); // Restores original layer pixels from snapshot
    this.transformActive = false;
    this.transformState = null;
    this.currentTool = ToolMode.BRUSH;
    return true;
  }

  pushUndoSnapshot(actionName) {
    const layer = this.layers[this.activeLayerIndex];
    this.undoStack.push({
      actionName,
      layerIndex: this.activeLayerIndex,
      pixels: new Uint32Array(layer.pixels)
    });
    this.redoStack = []; // Clear redo
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const snap = this.undoStack.pop();
    const layer = this.layers[snap.layerIndex];
    this.redoStack.push({
      actionName: snap.actionName,
      layerIndex: snap.layerIndex,
      pixels: new Uint32Array(layer.pixels)
    });
    layer.pixels.set(snap.pixels);
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const snap = this.redoStack.pop();
    const layer = this.layers[snap.layerIndex];
    this.undoStack.push({
      actionName: snap.actionName,
      layerIndex: snap.layerIndex,
      pixels: new Uint32Array(layer.pixels)
    });
    layer.pixels.set(snap.pixels);
    return true;
  }

  cleanup() {
    this.storage.cleanup();
  }
}

module.exports = {
  ToolMode,
  MockBrushPresetModel,
  MockColorPaletteModel,
  MockStorageManager,
  MockNativePainterEnvironment
};
