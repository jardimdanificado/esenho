const assert = require('assert');
const ColorStudio = require('../src/color_studio.js');

console.log('--- Testing Material & Color Studio High-Performance Engine ---');

// 1. Math & Conversions
console.log('1. Testing RGB <-> HEX conversions...');
assert.strictEqual(ColorStudio.rgbToHex(250, 189, 47), '#fabd2f');
assert.strictEqual(ColorStudio.rgbToHex(0, 0, 0), '#000000');
assert.strictEqual(ColorStudio.rgbToHex(255, 255, 255), '#ffffff');

const rgb = ColorStudio.hexToRgb('#fabd2f');
assert.strictEqual(rgb.r, 250);
assert.strictEqual(rgb.g, 189);
assert.strictEqual(rgb.b, 47);

// 2. HSV Math
console.log('2. Testing RGB <-> HSV conversions...');
const hsv = ColorStudio.rgbToHsv(250, 189, 47);
assert(hsv.h >= 40 && hsv.h <= 44, `Expected Hue around 42, got ${hsv.h}`);
assert(hsv.s >= 80 && hsv.s <= 82, `Expected Saturation around 81, got ${hsv.s}`);
assert(hsv.v >= 97 && hsv.v <= 99, `Expected Value around 98, got ${hsv.v}`);

const rgbBack = ColorStudio.hsvToRgb(hsv.h, hsv.s, hsv.v);
assert(Math.abs(rgbBack.r - 250) <= 2);
assert(Math.abs(rgbBack.g - 189) <= 2);
assert(Math.abs(rgbBack.b - 47) <= 2);

// 3. HSL Math
console.log('3. Testing RGB <-> HSL conversions...');
const hsl = ColorStudio.rgbToHsl(250, 189, 47);
const rgbFromHsl = ColorStudio.hslToRgb(hsl.h, hsl.s, hsl.l);
assert(Math.abs(rgbFromHsl.r - 250) <= 2);
assert(Math.abs(rgbFromHsl.g - 189) <= 2);
assert(Math.abs(rgbFromHsl.b - 47) <= 2);

// 4. Parse Color
console.log('4. Testing parseColor...');
assert.strictEqual(ColorStudio.parseColor('none').isNone, true);
assert.strictEqual(ColorStudio.parseColor('transparent').isNone, true);
assert.strictEqual(ColorStudio.parseColor('#fe8019').hex, '#fe8019');

// 5. Zero-Lag Sync verification (no DOM crash when window/document is headless)
console.log('5. Testing headless sync safety...');
ColorStudio.syncFromSelection();
ColorStudio.onPanelActivated();

// 6. Direct Object Color & Material Mutation
console.log('6. Testing direct object color & material mutation in MaterialStudioWidget...');

// Setup mock window & document environment
const mockObj = {
  id: 'test_rect_1',
  type: 'rect',
  fill: '#fabd2f',
  stroke: '#1d2021',
  fillType: 'solid',
  fillTexture: {},
  strokeTexture: {}
};

let renderCount = 0;
let historyActions = [];

global.window = {
  doc: {
    getSelectedObjects: () => [mockObj],
    pushHistory: (action) => historyActions.push(action),
    objects: [mockObj]
  },
  render: () => { renderCount++; },
  drawOverlay: () => {},
  updateSwatches: () => {},
  scheduleAutosave: () => {}
};

// Mount mock
const mockContainer = {
  innerHTML: '',
  querySelector: () => ({ addEventListener: () => {}, classList: { toggle: () => {} }, style: { setProperty: () => {} } }),
  querySelectorAll: () => []
};

const widget = ColorStudio.mountColorTab(mockContainer);
assert(widget, 'Widget instance should be returned');

// Test Fill Mutation
widget.setTarget('fill');
widget.setColorFromExternal('#fe8019');
widget.applyToSelected(true);

assert.strictEqual(mockObj.fill.toLowerCase(), '#fe8019', 'mockObj.fill should be updated to #fe8019');
assert(renderCount > 0, 'render() should have been called upon color change');
assert(historyActions.includes('Change Fill Color'), 'pushHistory should have been called');

// Test Stroke Mutation
widget.setTarget('stroke');
widget.setColorFromExternal('#83a598');
widget.applyToSelected(true);

assert.strictEqual(mockObj.stroke.toLowerCase(), '#83a598', 'mockObj.stroke should be updated to #83a598');
assert(historyActions.includes('Change Stroke Color'), 'pushHistory should have been called for stroke');

// Test Set None
widget.setNone();
assert.strictEqual(mockObj.stroke, 'none', 'mockObj.stroke should be set to none');

// Test Alpha & Opacity Mutation
widget.setTarget('fill');
widget.currentA = 0.42;
widget.applyToSelected(true);
assert.strictEqual(mockObj.fillOpacity, 0.42, 'mockObj.fillOpacity should be updated to 0.42');

widget.setTarget('stroke');
widget.currentA = 0.75;
widget.applyToSelected(true);
assert.strictEqual(mockObj.strokeOpacity, 0.75, 'mockObj.strokeOpacity should be updated to 0.75');

// Test Alpha Sync from Selection
widget.setTarget('fill');
widget.syncFromSelection(true);
assert.strictEqual(widget.currentA, 0.42, 'widget.currentA should sync correctly from primary.fillOpacity');

widget.setTarget('stroke');
widget.syncFromSelection(true);
assert.strictEqual(widget.currentA, 0.75, 'widget.currentA should sync correctly from primary.strokeOpacity');

// Test Background Target Mutation
widget.setTarget('bg');
widget.setColorFromExternal('#282828');
widget.applyToSelected(true);
assert.strictEqual(global.window.doc.backgroundColor, '#282828', 'doc.backgroundColor should be updated to #282828');
assert(historyActions.includes('Change Background Color'), 'pushHistory should have been called for background');

// 7. Testing Material Gradient Engine
console.log('7. Testing Material Gradient application...');
widget.setTarget('fill');
widget.gradientType = 'linear';
widget.gradientStops = [
  { offset: 0, color: '#fe8019', opacity: 1.0, intensity: 1.0 },
  { offset: 1, color: '#fabd2f', opacity: 1.0, intensity: 1.0 }
];
widget.gradientAngle = 45;
widget.applyGradientToSelected(true);

assert.strictEqual(mockObj.fillType, 'linear', 'fillType should be linear');
assert.strictEqual(mockObj.fillGradient.stops.length, 2, 'stops count should be 2');
assert(historyActions.includes('Change Material Gradient'), 'history should record gradient change');

// 8. Testing Material Procedural Texture Engine
console.log('8. Testing Material Procedural Texture application...');
widget.setTarget('fill');
widget.textureMode = 36; // Impasto Knife Peaks
widget.textureScale = 120;
widget.textureContrast = 140;
widget.textureGrain = 55;
widget.applyTextureToSelected(true);

assert.strictEqual(mockObj.fillTexture.mode, 36, 'Texture mode should be 36');
assert.strictEqual(mockObj.fillTexture.scale, 120, 'Texture scale should be 120');
assert.strictEqual(mockObj.fillTexture.contrast, 140, 'Texture contrast should be 140');
assert(historyActions.includes('Change Material Texture'), 'history should record texture change');

// 9. Testing WASM Filter Engine in Materials
console.log('9. Testing Material WASM Filter application...');
widget.setTarget('fill');
widget.filterEnabled = true;
widget.filterIsLens = false;
widget.filterPlugin = 'kuwahara';
widget.filterTarget = 'fill';
widget.filterP1 = 3;
widget.filterOpacity = 1.0;
widget.applyFilterToSelected(true);

assert.strictEqual(mockObj.fillFilter.enabled, true, 'WASM filter should be enabled');
assert.strictEqual(mockObj.fillFilter.plugin, 'kuwahara', 'WASM filter plugin should be kuwahara');
assert.strictEqual(mockObj.fillFilter.target, 'fill', 'WASM filter target should be fill when isLens is false');
assert.strictEqual(mockObj.fillFilter.p1, 3, 'WASM filter P1 should be 3');
assert(historyActions.includes('Change WASM Filter'), 'history should record WASM filter change');

// Test Lens FX (Backdrop Lens)
widget.filterIsLens = true;
widget.applyFilterToSelected(true);
assert.strictEqual(mockObj.fillFilter.target, 'backdrop', 'WASM filter target should be backdrop when filterIsLens is true');
assert.strictEqual(mockObj.fillFilter.isLens, true, 'isLens should be true on filter config');

// 10. Testing Material Preset Application
console.log('10. Testing Material Preset application...');
widget.applyMaterialPreset({
  name: 'Cyberpunk Neon Matrix',
  color: '#00ffcc',
  texture: { mode: 43, scale: 100, contrast: 150 },
  filter: { enabled: true, plugin: 'bloom', target: 'fill', p1: 20, p2: 100, opacity: 1.0 }
});

assert.strictEqual(mockObj.fill.toLowerCase(), '#00ffcc', 'Color should be #00ffcc');
assert.strictEqual(mockObj.fillTexture.mode, 43, 'Texture mode should be 43');
assert.strictEqual(mockObj.fillFilter.plugin, 'bloom', 'Filter should be bloom');

// 11. Testing Background Material Suite (with and without selection)
console.log('11. Testing Background Material workflow with selected object...');
widget.setTarget('bg');
widget.gradientType = 'linear';
widget.gradientStops = [
  { offset: 0, color: '#1d2021', opacity: 1.0, intensity: 1.0 },
  { offset: 1, color: '#3c3836', opacity: 1.0, intensity: 1.0 }
];
widget.gradientAngle = 90;
widget.applyGradientToSelected(true);

assert.strictEqual(global.window.doc.backgroundType, 'linear', 'doc.backgroundType should be linear');
assert.strictEqual(global.window.doc.backgroundGradient.stops.length, 2, 'doc.backgroundGradient should have 2 stops');
assert.strictEqual(mockObj.fill.toLowerCase(), '#00ffcc', 'mockObj.fill must NOT be modified when target is bg');

widget.textureMode = 32; // Noise Dissolve
widget.textureGrain = 80;
widget.applyTextureToSelected(true);
assert.strictEqual(global.window.doc.backgroundTexture.mode, 32, 'doc.backgroundTexture.mode should be 32');

widget.filterEnabled = true;
widget.filterPlugin = 'dither';
widget.applyFilterToSelected(true);
assert.strictEqual(global.window.doc.backgroundFilter.plugin, 'dither', 'doc.backgroundFilter.plugin should be dither');
assert.strictEqual(global.window.doc.backgroundFilter.target, 'bg', 'doc.backgroundFilter.target should be bg');

console.log('12. Testing Material workflows when NO object is selected...');
global.window.doc.getSelectedObjects = () => []; // Deselect all

widget.setTarget('bg');
widget.setColorFromExternal('#504945');
widget.applyToSelected(true);
assert.strictEqual(global.window.doc.backgroundColor, '#504945', 'doc.backgroundColor should update even with 0 selection');

widget.setTarget('fill');
widget.gradientType = 'radial';
widget.gradientStops = [
  { offset: 0, color: '#b8bb26', opacity: 1.0, intensity: 1.0 },
  { offset: 1, color: '#98971a', opacity: 1.0, intensity: 1.0 }
];
widget.applyGradientToSelected(true);
assert.strictEqual(global.window.doc.defaultFillType, 'radial', 'doc.defaultFillType should be set when nothing is selected');

widget.textureMode = 12;
widget.applyTextureToSelected(true);
assert.strictEqual(global.window.doc.defaultFillTexture.mode, 12, 'doc.defaultFillTexture should be set when nothing is selected');

console.log('13. Testing Palette & Custom Swatches rendering and persistence...');
let storageMap = {};
global.localStorage = {
  getItem: (k) => storageMap[k] || null,
  setItem: (k, v) => { storageMap[k] = v; },
  clear: () => { storageMap = {}; }
};

// Test custom swatches normalization with mixed object/string input
localStorage.setItem('esenho_color_studio_custom_swatches', JSON.stringify([
  '#fe8019',
  { hex: '#fabd2f' },
  { color: '#b8bb26' },
  { value: '#83a598' }
]));

// Mock document for DOM testing
let createdButtons = [];
const mockEl = {
  style: {
    _props: {},
    setProperty(prop, val, prio) { this._props[prop] = { val, prio }; },
    getPropertyValue(prop) { return this._props[prop]?.val || ''; }
  },
  classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  addEventListener: () => {},
  value: ''
};

global.document = {
  getElementById: () => mockEl,
  querySelector: () => mockEl,
  querySelectorAll: () => [],
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {
        _props: {},
        setProperty(prop, val, prio) { this._props[prop] = { val, prio }; },
        getPropertyValue(prop) { return this._props[prop]?.val || ''; }
      },
      classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      listeners: {},
      addEventListener(evt, fn) { this.listeners[evt] = fn; }
    };
    if (tag === 'button') createdButtons.push(el);
    return el;
  }
};

const mockGrid = {
  innerHTML: '',
  appendChild: (child) => {}
};

widget.dom.swatchesGrid = mockGrid;
widget.dom.palSelect = { value: 'custom' };

widget.renderPalettes();

assert(createdButtons.length >= 4, `Expected at least 4 swatches, got ${createdButtons.length}`);
assert.strictEqual(createdButtons[0].style._props['background'].val, '#fe8019');
assert.strictEqual(createdButtons[0].style._props['background'].prio, 'important');
assert.strictEqual(createdButtons[1].style._props['background'].val, '#fabd2f');
assert.strictEqual(createdButtons[2].style._props['background'].val, '#b8bb26');
assert.strictEqual(createdButtons[3].style._props['background'].val, '#83a598');

// Test click to select
createdButtons[0].listeners['click']();
assert.strictEqual(widget.currentHex.toLowerCase(), '#fe8019');

// 14. Comprehensive Palette Management (Create, Rename, Modify, Harmonies, Import/Export)
console.log('14. Testing Comprehensive Palette Management Engine...');
const PM = ColorStudio.PaletteManager;
assert(PM, 'PaletteManager should be exported');

// 14.1 Create Palette
const newPal = PM.createPalette('Neon Nights', ['#ff0055', '#00ffcc']);
assert(newPal, 'New palette should be created');
assert.strictEqual(newPal.name, 'Neon Nights');
assert.strictEqual(newPal.colors.length, 2);
assert.strictEqual(PM.getPalette(newPal.id).name, 'Neon Nights');

// 14.2 Rename Palette
const renameSuccess = PM.renamePalette(newPal.id, 'Cyber Neon 2026');
assert.strictEqual(renameSuccess, true);
assert.strictEqual(PM.getPalette(newPal.id).name, 'Cyber Neon 2026');

// 14.3 Modify Palettes Freely (Add, Edit, Remove, Reorder, Clear)
PM.addColor(newPal.id, '#ffe600');
assert.strictEqual(PM.getPalette(newPal.id).colors.length, 3);
assert.strictEqual(PM.getPalette(newPal.id).colors[2], '#ffe600');

// Insert color at index 1
PM.addColor(newPal.id, '#7928ca', 1);
assert.strictEqual(PM.getPalette(newPal.id).colors[1], '#7928ca');
assert.strictEqual(PM.getPalette(newPal.id).colors.length, 4);

// Edit color
PM.editColor(newPal.id, 0, '#ff1177');
assert.strictEqual(PM.getPalette(newPal.id).colors[0], '#ff1177');

// Move color
PM.moveColor(newPal.id, 0, 2);
assert.strictEqual(PM.getPalette(newPal.id).colors[2], '#ff1177');

// Remove color
PM.removeColor(newPal.id, 2);
assert.strictEqual(PM.getPalette(newPal.id).colors.length, 3);

// 14.4 Sorting & Reversing
PM.setColors(newPal.id, ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff']);
PM.sortPalette(newPal.id, 'lightness');
assert.strictEqual(PM.getPalette(newPal.id).colors[0], '#000000');
assert.strictEqual(PM.getPalette(newPal.id).colors[4], '#ffffff');

PM.reversePalette(newPal.id);
assert.strictEqual(PM.getPalette(newPal.id).colors[0], '#ffffff');
assert.strictEqual(PM.getPalette(newPal.id).colors[4], '#000000');

// 14.5 Harmonies Generator
const analogous = PM.generateHarmony('#fabd2f', 'analogous');
assert.strictEqual(analogous.length, 5);
const comp = PM.generateHarmony('#fabd2f', 'complementary');
assert.strictEqual(comp.length, 5);
const triadic = PM.generateHarmony('#fabd2f', 'triadic');
assert.strictEqual(triadic.length, 6);
const mono = PM.generateHarmony('#fabd2f', 'monochromatic');
assert.strictEqual(mono.length, 6);

// 14.6 Clone Palette
const cloned = PM.clonePalette(newPal.id, 'Cloned Neon');
assert(cloned);
assert.strictEqual(cloned.name, 'Cloned Neon');
assert.strictEqual(cloned.colors.length, 5);

// 14.7 Export & Import
const exportedJson = PM.exportPalette(newPal.id, 'json');
assert(exportedJson.includes('Cyber Neon 2026'));
const importedFromJson = PM.importPalette(exportedJson);
assert(importedFromJson);
assert.strictEqual(importedFromJson.name, 'Cyber Neon 2026');
assert.strictEqual(importedFromJson.colors.length, 5);

const exportedGpl = PM.exportPalette(newPal.id, 'gpl');
assert(exportedGpl.includes('GIMP Palette'));
const importedFromGpl = PM.importPalette(exportedGpl);
assert(importedFromGpl);
assert.strictEqual(importedFromGpl.name, 'Cyber Neon 2026');

const hexList = '#112233\n#445566\n#778899';
const importedFromHex = PM.importPalette(hexList);
assert(importedFromHex);
assert.strictEqual(importedFromHex.colors.length, 3);

// 14.8 Delete Palette
const delId = importedFromHex.id;
PM.deletePalette(delId);
assert.strictEqual(PM.getPalette(delId), null);

// 14.9 Built-in & Factory Presets freely modifiable and resettable
const gruv = PM.getPalette('gruvbox');
assert(gruv);
PM.addColor('gruvbox', '#123456');
assert(PM.getPalette('gruvbox').colors.includes('#123456'));
PM.resetPalette('gruvbox');
assert(!PM.getPalette('gruvbox').colors.includes('#123456'));

console.log('--- ALL MATERIAL & COLOR STUDIO TESTS PASSED ---');
