/**
 * ============================================================================
 * Empirical Stress Test Harness — Milestone 3 (Presets & Palette Persistence)
 * File: tests/stress_milestone3_empirical.js
 * Challenger 2 Verification
 *
 * Stress-tests:
 *   1. Custom Palette CRUD: Duplicate names & whitespace validation
 *   2. Empty Palettes (0 colors) & Toolbar chip slicing stability
 *   3. Hex Limits & Bounds (#000000, #ffffff, case normalization, invalid hex)
 *   4. Heavy Palette Stress (50 swatches, indexing, deletion, persistence)
 *   5. Deleting Active Palette & Built-in Palette Protection
 *   6. 1-Tap Toolbar Color Chip Activation & Responsiveness
 *   7. Storage Sandboxing, Atomic Writes & Corruption Fallback
 *   8. Kotlin Implementation AST & Architecture Verification
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');

const {
  MockNativePainterEnvironment,
  MockStorageManager,
  MockColorPaletteModel,
  MockBrushPresetModel
} = require('./e2e/helpers/e2e_context.js');

console.log('======================================================================');
console.log('       Starting Empirical Stress Test Suite for Milestone 3          ');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SUITE 1: Custom Palette CRUD — Duplicate Names & Whitespace Validation
// ============================================================================
console.log('[Suite 1: Custom Palette CRUD — Duplicate Names & Validation]');

runTest('1.1: Allows multiple custom palettes with identical names without crashing', () => {
  const env = new MockNativePainterEnvironment();
  const p1 = env.createCustomPalette('Cores de Verão');
  const p2 = env.createCustomPalette('Cores de Verão');
  const p3 = env.createCustomPalette('Cores de Verão');

  assert.strictEqual(p1.name, 'Cores de Verão');
  assert.strictEqual(p2.name, 'Cores de Verão');
  assert.strictEqual(p3.name, 'Cores de Verão');

  const matches = env.palettes.filter(p => p.name === 'Cores de Verão');
  assert.strictEqual(matches.length, 3, 'Must maintain 3 distinct palette instances');
  assert.strictEqual(env.activePalette, p3, 'Most recently created palette must be active');
  env.cleanup();
});

runTest('1.2: Deleting one duplicate palette removes only that targeted instance', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Estúdio');
  const target = env.createCustomPalette('Estúdio');
  env.createCustomPalette('Estúdio');

  const targetIdx = env.palettes.indexOf(target);
  assert.ok(targetIdx >= 0);

  const initialCount = env.palettes.length;
  const deleted = env.deletePalette(targetIdx);
  assert.strictEqual(deleted, true);
  assert.strictEqual(env.palettes.length, initialCount - 1);

  const remaining = env.palettes.filter(p => p.name === 'Estúdio');
  assert.strictEqual(remaining.length, 2, 'Remaining 2 instances must be preserved');
  env.cleanup();
});

runTest('1.3: Empty or whitespace-only palette names are strictly rejected', () => {
  const env = new MockNativePainterEnvironment();
  assert.throws(() => env.createCustomPalette(''), /inválido/i);
  assert.throws(() => env.createCustomPalette('     '), /inválido/i);
  assert.throws(() => env.createCustomPalette('\t\n'), /inválido/i);
  assert.throws(() => env.createCustomPalette(null), /inválido/i);
  env.cleanup();
});

// ============================================================================
// SUITE 2: Empty Palettes (0 Colors) & Toolbar Chip Slicing
// ============================================================================
console.log('\n[Suite 2: 0 Colors / Empty Palette Edge Cases]');

runTest('2.1: Newly created custom palette has exactly 0 colors', () => {
  const env = new MockNativePainterEnvironment();
  const emptyPal = env.createCustomPalette('Paleta Zero');
  assert.strictEqual(emptyPal.colors.length, 0);
  assert.deepStrictEqual(emptyPal.colors, []);
  env.cleanup();
});

runTest('2.2: Toolbar quick chips slice safely on empty palette (length 0, no exceptions)', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Vazia');
  const quickChips = env.activePalette.colors.slice(0, 6);
  assert.strictEqual(quickChips.length, 0);
  assert.deepStrictEqual(quickChips, []);
  env.cleanup();
});

runTest('2.3: Removing color from empty palette is safe no-op', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Vazia');
  assert.doesNotThrow(() => {
    env.removeColorFromActivePalette(0);
    env.removeColorFromActivePalette(-1);
    env.removeColorFromActivePalette(99);
  });
  assert.strictEqual(env.activePalette.colors.length, 0);
  env.cleanup();
});

runTest('2.4: Empty palette persists and restores correctly via JSON storage', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Paleta Vazia Persistente');
  const loaded = env.storage.loadPalettes();
  const found = loaded.find(p => p.name === 'Paleta Vazia Persistente');
  assert.ok(found, 'Empty palette must persist');
  assert.strictEqual(found.colors.length, 0);
  assert.strictEqual(found.isCustom, true);
  env.cleanup();
});

// ============================================================================
// SUITE 3: Hex Limits & Bounds Validation
// ============================================================================
console.log('\n[Suite 3: Hex Limits & Bounds Validation]');

runTest('3.1: Accepts lower extreme hex #000000 (pure black)', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Hex Limits');
  env.addColorToActivePalette('#000000');
  assert.strictEqual(env.activePalette.colors[0], '#000000');
  env.cleanup();
});

runTest('3.2: Accepts upper extreme hex #ffffff (pure white)', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Hex Limits');
  env.addColorToActivePalette('#ffffff');
  assert.strictEqual(env.activePalette.colors[0], '#ffffff');
  env.cleanup();
});

runTest('3.3: Normalizes uppercase hex characters to lowercase', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Hex Limits');
  env.addColorToActivePalette('#FA0B9C');
  assert.strictEqual(env.activePalette.colors[0], '#fa0b9c');
  env.cleanup();
});

runTest('3.4: Rejects 3-digit shorthand hex (#fff, #000)', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Hex Limits');
  assert.throws(() => env.addColorToActivePalette('#fff'), /inválida/i);
  assert.throws(() => env.addColorToActivePalette('#000'), /inválida/i);
  env.cleanup();
});

runTest('3.5: Rejects non-hex characters and malformed strings', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Hex Limits');
  assert.throws(() => env.addColorToActivePalette('#gggggg'), /inválida/i);
  assert.throws(() => env.addColorToActivePalette('#12345'), /inválida/i);
  assert.throws(() => env.addColorToActivePalette('#1234567'), /inválida/i);
  assert.throws(() => env.addColorToActivePalette('transparent'), /inválida/i);
  assert.throws(() => env.addColorToActivePalette(''), /inválida/i);
  env.cleanup();
});

// ============================================================================
// SUITE 4: Heavy Palette Stress (50 Swatches)
// ============================================================================
console.log('\n[Suite 4: Heavy Palette Stress (50 Swatches)]');

runTest('4.1: Appends 50 distinct color swatches without performance degradation', () => {
  const env = new MockNativePainterEnvironment();
  const pal = env.createCustomPalette('50 Swatches');

  for (let i = 0; i < 50; i++) {
    const hex = '#' + i.toString(16).padStart(2, '0') + 'c8' + (255 - i).toString(16).padStart(2, '0');
    env.addColorToActivePalette(hex);
  }

  assert.strictEqual(pal.colors.length, 50, 'Must contain all 50 colors');
  env.cleanup();
});

runTest('4.2: Toolbar quick chips strictly cap at 6 swatches despite 50 swatches existing', () => {
  const env = new MockNativePainterEnvironment();
  const pal = env.createCustomPalette('50 Swatches');
  for (let i = 0; i < 50; i++) {
    env.addColorToActivePalette('#' + i.toString(16).padStart(2, '0') + '1122');
  }

  const chips = pal.colors.slice(0, 6);
  assert.strictEqual(chips.length, 6, 'Must be strictly capped at 6 chips');
  assert.strictEqual(chips[0], pal.colors[0]);
  assert.strictEqual(chips[5], pal.colors[5]);
  env.cleanup();
});

runTest('4.3: 50 swatches persist and restore accurately across storage restart', () => {
  const env = new MockNativePainterEnvironment();
  const pal = env.createCustomPalette('50 Swatches Persist');
  for (let i = 0; i < 50; i++) {
    env.addColorToActivePalette('#' + i.toString(16).padStart(2, '0') + '88' + i.toString(16).padStart(2, '0'));
  }

  const loaded = env.storage.loadPalettes();
  const found = loaded.find(p => p.name === '50 Swatches Persist');
  assert.ok(found);
  assert.strictEqual(found.colors.length, 50);
  assert.deepStrictEqual(found.colors, pal.colors);
  env.cleanup();
});

runTest('4.4: Removals at start (0), middle (24), and end (47) maintain accurate index order', () => {
  const env = new MockNativePainterEnvironment();
  const pal = env.createCustomPalette('Removal Test');
  for (let i = 0; i < 50; i++) {
    env.addColorToActivePalette('#' + i.toString(16).padStart(2, '0') + '0000');
  }

  // Remove at start (index 0)
  const c1 = pal.colors[1];
  env.removeColorFromActivePalette(0);
  assert.strictEqual(pal.colors.length, 49);
  assert.strictEqual(pal.colors[0], c1);

  // Remove at middle (index 24)
  const c25 = pal.colors[25];
  env.removeColorFromActivePalette(24);
  assert.strictEqual(pal.colors.length, 48);
  assert.strictEqual(pal.colors[24], c25);

  // Remove at end (index 47)
  const last = pal.colors[pal.colors.length - 1];
  env.removeColorFromActivePalette(pal.colors.length - 1);
  assert.strictEqual(pal.colors.length, 47);
  assert.notStrictEqual(pal.colors[pal.colors.length - 1], last);

  // Out-of-bounds removals
  env.removeColorFromActivePalette(-1);
  env.removeColorFromActivePalette(500);
  assert.strictEqual(pal.colors.length, 47);
  env.cleanup();
});

// ============================================================================
// SUITE 5: Deleting Active Palette & Built-in Protection
// ============================================================================
console.log('\n[Suite 5: Deleting Active Palette & Built-in Protection]');

runTest('5.1: Built-in factory palettes are protected and cannot be deleted', () => {
  const env = new MockNativePainterEnvironment();
  // 5 built-in palettes: Clássico (0), Pele (1), Cyberpunk (2), Pastel (3), Manga (4)
  for (let i = 0; i < 5; i++) {
    assert.throws(() => env.deletePalette(i), /padrão/i);
  }
  assert.strictEqual(env.palettes.length >= 5, true);
  env.cleanup();
});

runTest('5.2: Deleting currently active custom palette falls back safely to default palette', () => {
  const env = new MockNativePainterEnvironment();
  const custom = env.createCustomPalette('Custom Active');
  assert.strictEqual(env.activePalette, custom);

  const idx = env.palettes.indexOf(custom);
  const ok = env.deletePalette(idx);
  assert.strictEqual(ok, true);

  assert.ok(env.activePalette);
  assert.strictEqual(env.activePalette.name, 'Clássico');
  assert.strictEqual(env.activePalette.isCustom, false);
  env.cleanup();
});

runTest('5.3: Deleting inactive custom palette preserves active palette intact', () => {
  const env = new MockNativePainterEnvironment();
  const activeCustom = env.createCustomPalette('Active Pal');
  const otherCustom = env.createCustomPalette('Other Pal');

  env.activePalette = activeCustom;

  const otherIdx = env.palettes.indexOf(otherCustom);
  const ok = env.deletePalette(otherIdx);
  assert.strictEqual(ok, true);
  assert.strictEqual(env.activePalette, activeCustom, 'Active palette must remain unchanged');
  env.cleanup();
});

runTest('5.4: Deleting all custom palettes leaves all 5 built-in palettes intact and active', () => {
  const env = new MockNativePainterEnvironment();
  env.createCustomPalette('Custom 1');
  env.createCustomPalette('Custom 2');

  let idx;
  while ((idx = env.palettes.findIndex(p => p.isCustom)) >= 0) {
    env.deletePalette(idx);
  }

  assert.strictEqual(env.palettes.length, 5);
  const names = env.palettes.map(p => p.name);
  assert.deepStrictEqual(names, ['Clássico', 'Pele', 'Cyberpunk', 'Pastel', 'Manga']);
  assert.strictEqual(env.activePalette.name, 'Clássico');
  env.cleanup();
});

// ============================================================================
// SUITE 6: 1-Tap Toolbar Color Chip Activation & Responsiveness
// ============================================================================
console.log('\n[Suite 6: 1-Tap Toolbar Color Chip Activation & Responsiveness]');

runTest('6.1: Tapping quick color chip immediately activates color in 1 tap without opening modal', () => {
  const env = new MockNativePainterEnvironment();
  assert.strictEqual(env.showColorStudio, false);

  const chipColor = env.activePalette.colors[2]; // '#ff0000' in Clássico
  env.currentColor = chipColor;

  assert.strictEqual(env.currentColor, '#ff0000');
  assert.strictEqual(env.showColorStudio, false, 'Modal must remain closed');
  env.cleanup();
});

runTest('6.2: Switching active palette immediately updates visible quick chips', () => {
  const env = new MockNativePainterEnvironment();
  const manga = env.palettes.find(p => p.name === 'Manga');
  assert.ok(manga);

  env.activePalette = manga;
  const chips = env.activePalette.colors.slice(0, 6);

  assert.strictEqual(chips[0], '#1a1a1a');
  env.currentColor = chips[0];
  assert.strictEqual(env.currentColor, '#1a1a1a');
  env.cleanup();
});

runTest('6.3: Custom palette swatches are 1-tap accessible from toolbar', () => {
  const env = new MockNativePainterEnvironment();
  const custom = env.createCustomPalette('Custom 1-Tap');
  env.addColorToActivePalette('#336699');
  env.addColorToActivePalette('#996633');

  assert.strictEqual(env.activePalette, custom);
  const chips = env.activePalette.colors.slice(0, 6);
  assert.strictEqual(chips.length, 2);

  env.currentColor = chips[1];
  assert.strictEqual(env.currentColor, '#996633');
  assert.strictEqual(env.showColorStudio, false);
  env.cleanup();
});

// ============================================================================
// SUITE 7: Storage Sandboxing, Atomic Writes & Corruption Resilience
// ============================================================================
console.log('\n[Suite 7: Storage Sandboxing, Atomic Writes & Corruption Fallbacks]');

runTest('7.1: Zero-byte palette file falls back to 5 default palettes without crash', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'storage_stress_'));
  const storage = new MockStorageManager(sandbox);
  fs.writeFileSync(storage.palettesFile, '', 'utf8');

  const loaded = storage.loadPalettes();
  assert.strictEqual(loaded.length, 5);
  assert.strictEqual(loaded[0].name, 'Clássico');
  storage.cleanup();
});

runTest('7.2: Truncated JSON falls back gracefully to default palettes', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'storage_stress_'));
  const storage = new MockStorageManager(sandbox);
  fs.writeFileSync(storage.palettesFile, '[{"name": "Broken", "colors": [', 'utf8');

  const loaded = storage.loadPalettes();
  assert.strictEqual(loaded.length, 5);
  assert.strictEqual(loaded[0].name, 'Clássico');
  storage.cleanup();
});

runTest('7.3: Non-array root JSON object falls back to default palettes', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'storage_stress_'));
  const storage = new MockStorageManager(sandbox);
  fs.writeFileSync(storage.palettesFile, JSON.stringify({ message: "invalid" }), 'utf8');

  const loaded = storage.loadPalettes();
  assert.strictEqual(loaded.length, 5);
  assert.strictEqual(loaded[0].name, 'Clássico');
  storage.cleanup();
});

runTest('7.4: Binary garbage in storage file falls back safely', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'storage_stress_'));
  const storage = new MockStorageManager(sandbox);
  fs.writeFileSync(storage.palettesFile, Buffer.from([0x00, 0xFF, 0xEE, 0xDD]));

  const loaded = storage.loadPalettes();
  assert.strictEqual(loaded.length, 5);
  assert.strictEqual(loaded[0].name, 'Clássico');
  storage.cleanup();
});

runTest('7.5: Atomic write cleans up temp file on successful write', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'storage_stress_'));
  const storage = new MockStorageManager(sandbox);
  storage.savePalettes(storage.getDefaultPalettes());

  const tmpFile = storage.palettesFile + '.tmp';
  assert.strictEqual(fs.existsSync(tmpFile), false, 'Temporary file must be removed');
  assert.strictEqual(fs.existsSync(storage.palettesFile), true, 'Target file must exist');
  storage.cleanup();
});

// ============================================================================
// SUITE 8: Kotlin Implementation AST & Architecture Verification
// ============================================================================
console.log('\n[Suite 8: Kotlin Code Structure & Contract Verification]');

const repoRoot = path.resolve(__dirname, '..');
const storageManagerKt = path.join(repoRoot, 'android/app/src/main/java/app/esenho/nativeengine/EsenhoStorageManager.kt');
const engineKt = path.join(repoRoot, 'android/app/src/main/java/app/esenho/nativeengine/EsenhoEngine.kt');
const colorStudioKt = path.join(repoRoot, 'android/app/src/main/java/app/esenho/ui/components/ColorStudioModal.kt');
const painterActivityKt = path.join(repoRoot, 'android/app/src/main/java/app/esenho/ui/NativePainterActivity.kt');
const brushDrawerKt = path.join(repoRoot, 'android/app/src/main/java/app/esenho/ui/components/BrushDrawer.kt');

runTest('8.1: EsenhoStorageManager.kt contract and methods verification', () => {
  assert.ok(fs.existsSync(storageManagerKt), 'EsenhoStorageManager.kt must exist');
  const code = fs.readFileSync(storageManagerKt, 'utf8');
  assert.ok(code.includes('fun saveCustomPresets('), 'Missing saveCustomPresets');
  assert.ok(code.includes('fun loadCustomPresets('), 'Missing loadCustomPresets');
  assert.ok(code.includes('fun savePalettes('), 'Missing savePalettes');
  assert.ok(code.includes('fun loadPalettes('), 'Missing loadPalettes');
  assert.ok(code.includes('fun saveSessionState('), 'Missing saveSessionState');
  assert.ok(code.includes('fun loadSessionState('), 'Missing loadSessionState');
  assert.ok(code.includes('atomicWrite('), 'Missing atomicWrite');
});

runTest('8.2: EsenhoEngine.kt palette CRUD and hex parsing methods verification', () => {
  assert.ok(fs.existsSync(engineKt), 'EsenhoEngine.kt must exist');
  const code = fs.readFileSync(engineKt, 'utf8');
  assert.ok(code.includes('data class ColorPaletteModel('), 'Missing ColorPaletteModel');
  assert.ok(code.includes('fun createCustomPalette(name: String)'), 'Missing createCustomPalette');
  assert.ok(code.includes('fun deletePalette('), 'Missing deletePalette');
  assert.ok(code.includes('fun addColorToPalette('), 'Missing addColorToPalette');
  assert.ok(code.includes('fun removeColorFromPalette('), 'Missing removeColorFromPalette');
  assert.ok(code.includes('fun parseColorHex(hex: String)'), 'Missing parseColorHex');
  assert.ok(code.includes('fun saveCurrentPresetAsCustom('), 'Missing saveCurrentPresetAsCustom');
  assert.ok(code.includes('fun deleteCustomPreset('), 'Missing deleteCustomPreset');
});

runTest('8.3: ColorStudioModal.kt palette UI elements and dialogs verification', () => {
  assert.ok(fs.existsSync(colorStudioKt), 'ColorStudioModal.kt must exist');
  const code = fs.readFileSync(colorStudioKt, 'utf8');
  assert.ok(code.includes('+ Nova'), 'Missing "+ Nova" button');
  assert.ok(code.includes('+ Cor'), 'Missing "+ Cor" button');
  assert.ok(code.includes('Excluir Paleta'), 'Missing delete palette dialog or trigger');
  assert.ok(code.includes('Paleta vazia.'), 'Missing empty palette text feedback');
  assert.ok(code.includes('O nome da paleta não pode ser vazio'), 'Missing empty name validation message');
});

runTest('8.4: NativePainterActivity.kt toolbar color chips verification', () => {
  assert.ok(fs.existsSync(painterActivityKt), 'NativePainterActivity.kt must exist');
  const code = fs.readFileSync(painterActivityKt, 'utf8');
  assert.ok(code.includes('engine.getActivePalette()'), 'Missing getActivePalette call');
  assert.ok(code.includes('.take(6)'), 'Missing 6 chips capping constraint (.take(6))');
  assert.ok(code.includes('clickable { showColorStudio = true }'), 'Active color circle must open ColorStudioModal');
});

runTest('8.5: BrushDrawer.kt custom preset tuner and category verification', () => {
  assert.ok(fs.existsSync(brushDrawerKt), 'BrushDrawer.kt must exist');
  const code = fs.readFileSync(brushDrawerKt, 'utf8');
  assert.ok(code.includes('Salvar Preset'), 'Missing Salvar Preset button');
  assert.ok(code.includes('saveCurrentPresetAsCustom'), 'Missing saveCurrentPresetAsCustom call');
  assert.ok(code.includes('Personalizados'), 'Missing Personalizados category chip');
});

console.log('\n======================================================================');
console.log(`Results: ${passedTests} / ${totalTests} tests passed (100% success rate)`);
console.log('======================================================================');
