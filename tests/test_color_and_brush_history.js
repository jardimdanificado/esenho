const assert = require('assert');
const { EsenhoScreenHost, BRUSH_PRESETS } = require('../src/esenho.js');
const ColorStudio = require('../src/color_studio.js');

console.log('--- Testing Color History & Brush History ---');

// 1. EsenhoHost Initialization
console.log('1. Testing EsenhoHost history initialization...');
const host = new EsenhoScreenHost();
assert(Array.isArray(host.colorHistory), 'host.colorHistory should be an array');
assert(Array.isArray(host.brushHistory), 'host.brushHistory should be an array');
assert.strictEqual(host.colorHistory.length, 0, 'host.colorHistory starts empty');
assert.strictEqual(host.brushHistory.length, 0, 'host.brushHistory starts empty');
console.log('✔ EsenhoHost history arrays initialized');

// 2. Color History Pushing & Deduplication
console.log('2. Testing Color History pushing & deduplication...');
let colorCallbackInvoked = false;
host.onColorHistoryChanged = (hist) => {
  colorCallbackInvoked = true;
};

host.pushColorHistory('#FABD2F');
assert.strictEqual(host.colorHistory[0], '#FABD2F');
assert.strictEqual(host.colorHistory.length, 1);
assert.strictEqual(colorCallbackInvoked, true);

host.pushColorHistory('#FB4934');
assert.strictEqual(host.colorHistory[0], '#FB4934');
assert.strictEqual(host.colorHistory[1], '#FABD2F');
assert.strictEqual(host.colorHistory.length, 2);

// Re-pushing an existing color must move it to the front without duplicating
host.pushColorHistory('#fabd2f'); // lower-case test
assert.strictEqual(host.colorHistory[0], '#FABD2F');
assert.strictEqual(host.colorHistory[1], '#FB4934');
assert.strictEqual(host.colorHistory.length, 2, 'No duplicates in color history');

// Pushing integer color (0xAABBGGRR)
host.pushColorHistory(0xFF00FF00); // Green: R=00, G=FF, B=00 -> #00FF00
assert.strictEqual(host.colorHistory[0], '#00FF00');
assert.strictEqual(host.colorHistory.length, 3);
console.log('✔ Color History push, normalization & deduplication passed');

// 3. Color History Capacity Limit
console.log('3. Testing Color History capacity limit...');
for (let i = 0; i < 40; i++) {
  const hex = '#' + i.toString(16).padStart(2, '0') + '0000';
  host.pushColorHistory(hex);
}
assert(host.colorHistory.length <= 32, `Color history must cap at 32 items, got ${host.colorHistory.length}`);
console.log('✔ Color History capacity limit passed');

// 4. Brush History Pushing & Deduplication
console.log('4. Testing Brush History pushing & deduplication...');
let brushCallbackInvoked = false;
host.onBrushHistoryChanged = (hist) => {
  brushCallbackInvoked = true;
};

host.pushBrushHistory('ink_pen');
assert.strictEqual(host.brushHistory[0], 'ink_pen');
assert.strictEqual(host.brushHistory.length, 1);
assert.strictEqual(brushCallbackInvoked, true);

host.pushBrushHistory('PENCIL');
assert.strictEqual(host.brushHistory[0], 'pencil');
assert.strictEqual(host.brushHistory[1], 'ink_pen');
assert.strictEqual(host.brushHistory.length, 2);

// Re-pushing ink_pen must move to front
host.pushBrushHistory(' ink_pen ');
assert.strictEqual(host.brushHistory[0], 'ink_pen');
assert.strictEqual(host.brushHistory[1], 'pencil');
assert.strictEqual(host.brushHistory.length, 2, 'No duplicates in brush history');
console.log('✔ Brush History push & deduplication passed');

// 5. Brush History Capacity Limit
console.log('5. Testing Brush History capacity limit...');
for (let i = 0; i < 30; i++) {
  host.pushBrushHistory(`brush_test_${i}`);
}
assert(host.brushHistory.length <= 24, `Brush history must cap at 24 items, got ${host.brushHistory.length}`);
console.log('✔ Brush History capacity limit passed');

// 6. selectBrushPreset recording to Brush History
console.log('6. Testing selectBrushPreset auto-records to Brush History...');
host.brushHistory = [];
host.selectBrushPreset('watercolor');
assert.strictEqual(host.activeBrush, 'watercolor');
assert.strictEqual(host.brushHistory[0], 'watercolor');
assert.strictEqual(host.brushHistory.length, 1);

host.selectBrushPreset('gouache');
assert.strictEqual(host.activeBrush, 'gouache');
assert.strictEqual(host.brushHistory[0], 'gouache');
assert.strictEqual(host.brushHistory[1], 'watercolor');
console.log('✔ selectBrushPreset auto-recording passed');

// 7. sendStroke stroke end recording
console.log('7. Testing sendStroke auto-records color and brush on stroke end...');
host.colorHistory = [];
host.brushHistory = [];
host.activeBrush = 'oil';
// Mock canvasActor with dummy export
host.canvasActor = {
  exports: {
    w_brush_stroke: () => 0,
    w_brush_set_param: () => 0
  }
};

// Phase 0: STROKE_START
host.sendStroke(10, 10, 10, 10, 0, 0, 0xFF83A598);
// Phase 2: STROKE_END
host.sendStroke(20, 20, 10, 10, 2, 0, 0xFF83A598);

assert(host.colorHistory.length > 0, 'Stroke end must record color');
assert.strictEqual(host.colorHistory[0], '#98A583'); // 0xFF83A598: R=98, G=A5, B=83
assert.strictEqual(host.brushHistory[0], 'oil');

// Eraser stroke must not record into color history
const colHistLen = host.colorHistory.length;
host.sendStroke(30, 30, 30, 30, 2, 1, 0xFF000000);
assert.strictEqual(host.colorHistory.length, colHistLen, 'Eraser stroke must not push to color history');
console.log('✔ sendStroke auto-recording passed');

// 8. Command execution updates Color History
console.log('8. Testing executeCommand updates Color History...');
host.colorHistory = [];
host.executeCommand('set color #b8bb26');
assert.strictEqual(host.colorHistory[0], '#B8BB26');

host.executeCommand('color 254 128 25'); // RGB(254, 128, 25) -> #FE8019
assert.strictEqual(host.colorHistory[0], '#FE8019');
console.log('✔ Command execution color history passed');

// 9. ColorStudio PaletteManager history palette
console.log('9. Testing ColorStudio PaletteManager history palette...');
const PaletteManager = ColorStudio.PaletteManager;
assert(PaletteManager.palettes.history, 'PaletteManager must have built-in history palette');
assert.strictEqual(PaletteManager.palettes.history.id, 'history');

PaletteManager.pushColorHistory('#fabd2f');
assert.strictEqual(PaletteManager.palettes.history.colors[0], '#FABD2F');

PaletteManager.pushColorHistory('#fe8019');
assert.strictEqual(PaletteManager.palettes.history.colors[0], '#FE8019');
assert.strictEqual(PaletteManager.palettes.history.colors[1], '#FABD2F');

// Deduplication in ColorStudio history
PaletteManager.pushColorHistory('#fabd2f');
assert.strictEqual(PaletteManager.palettes.history.colors[0], '#FABD2F');
assert.strictEqual(PaletteManager.palettes.history.colors[1], '#FE8019');
console.log('✔ ColorStudio PaletteManager history palette passed');

console.log('--- ALL COLOR HISTORY & BRUSH HISTORY TESTS PASSED ---');
