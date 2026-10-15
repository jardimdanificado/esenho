const test = require('node:test');
const assert = require('node:assert/strict');
const EsenhoStore = require('../src/project_store.js');
const { EsenhoScreenHost } = require('../src/esenho.js');

test('EsenhoStore - Custom Brush Preset Saving and Deletion', async (t) => {
  const storage = {};
  global.localStorage = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val); },
    removeItem: (key) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };

  await t.test('saves custom brush preset with sanitized key', () => {
    const presetData = {
      size: 24,
      opacity: 85,
      flow: 90,
      hardness: 75,
      texture: 'canvas'
    };
    const saved = EsenhoStore.saveCustomBrushPreset('My Oil Brush #1', presetData);
    assert.equal(saved, true);

    const presets = EsenhoStore.getCustomBrushPresets();
    assert.ok(presets['my_oil_brush__1'], 'Sanitized key should exist');
    assert.equal(presets['my_oil_brush__1'].name, 'My Oil Brush #1');
    assert.equal(presets['my_oil_brush__1'].size, 24);
    assert.equal(presets['my_oil_brush__1'].texture, 'canvas');
  });

  await t.test('deletes custom brush preset using name or key', () => {
    const deleted = EsenhoStore.deleteCustomBrushPreset('My Oil Brush #1');
    assert.equal(deleted, true);

    const presets = EsenhoStore.getCustomBrushPresets();
    assert.equal(presets['my_oil_brush__1'], undefined);
  });
});

test('Esenho Core REPL - preset save and preset delete', async (t) => {
  const host = new EsenhoScreenHost();
  host.brushParams = { size: 35, opacity: 80 };

  await t.test('saves preset via REPL command', () => {
    host.executeCommand('preset save MyDryInk');
    assert.ok(host.customBrushPresets['mydryink']);
    assert.equal(host.customBrushPresets['mydryink'].size, 35);
    assert.equal(host.activeBrush, 'mydryink');
  });

  await t.test('selects and uses custom preset', () => {
    host.brushParams.size = 10;
    const selected = host.selectBrushPreset('mydryink');
    assert.equal(selected, true);
    assert.equal(host.brushParams.size, 35);
  });

  await t.test('deletes preset via REPL command', () => {
    host.executeCommand('preset delete MyDryInk');
    assert.equal(host.customBrushPresets['mydryink'], undefined);
  });
});
