const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EsenhoModule } = require('../src/esenho');
const parameters = require('../src/brush_realism_params.json');
const presets = require('../src/presets_data').CURATED_BRUSH_PRESETS;
const metadata = require('../android/app/src/main/res/raw/esenho_native_metadata.json');
const width = 512, height = 160;
const engine = new EsenhoModule(path.resolve(__dirname, '../plugins/canvas.wasm'));
engine.exports.w_init(width, height);

function render(values = {}, native = engine, explicitDefaults = false, pressureAt) {
  const api = native.exports;
  api.w_brush_reset();
  api.w_brush_set_param(1, 14);
  api.w_brush_set_param(3, 85);
  api.w_brush_set_param(4, 65);
  api.w_brush_set_param(5, 8);
  api.w_brush_set_param(39, 1);
  api.w_brush_set_param(40, 1);
  const pixels = new Uint32Array(native.memory.buffer, api.get_active_layer_pixels(), width * height);
  pixels.fill(0);
  if (explicitDefaults) for (const p of parameters) api.w_brush_set_param(p.id, p.default);
  for (const [id, value] of Object.entries(values)) api.w_brush_set_param(+id, value);
  let previous;
  for (let i = 0; i <= 160; i++) {
    const point = [30 + i * 2.8, 80 + Math.sin(i / 15) * 20];
    const pressure = pressureAt ? pressureAt(i) : Math.round(250 + 600 * (.5 + .5 * Math.sin(i / 31)));
    api.w_brush_stroke_ext_f(i ? 1 : 0, ...point, ...(previous || point), 0xff376a90, 0, pressure, 0, 0);
    previous = point;
  }
  api.w_brush_stroke_ext_f(2, ...previous, ...previous, 0xff376a90, 0, 650, 0, 0);
  return Buffer.from(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
}

test('every new control changes raster output in its supported context', () => {
  const context = {
    59: {58: 90}, 61: {60: 12}, 62: {60: 12, 61: 70},
    66: {63: 60, 64: 60, 65: 60}, 68: {67: 100},
    70: {71: 90}, 71: {70: 3}, 75: {77: 1}, 76: {58: 90},
  };
  for (const p of parameters) {
    const before = render(context[p.id]);
    const value = p.id === 70 ? 3 : p.max;
    const after = render({...context[p.id], [p.id]: value});
    assert.notDeepEqual(after, before, `${p.key} must affect actual paint`);
    assert.ok(after.some(byte => byte), `${p.key} must not make the entire stroke disappear`);
  }
});

test('neutral realism settings preserve classic brushes exactly', () => {
  assert.deepEqual(render({}, engine, true), render());
  if (process.env.LEGACY_CANVAS_WASM) {
    const legacy = new EsenhoModule(process.env.LEGACY_CANVAS_WASM);
    legacy.exports.w_init(width, height);
    assert.deepEqual(render({}, engine), render({}, legacy));
  }
});

function renderContinuous(values = {}, native = engine) {
  const api = native.exports;
  api.w_brush_reset();
  api.w_brush_dyn_init();
  api.w_brush_dyn_reset_state();
  api.w_brush_dyn_set_base(0, .65);
  api.w_brush_dyn_set_base(3, Math.log(12));
  api.w_brush_dyn_set_base(4, .8);
  api.w_brush_dyn_set_base(21, .4);
  for (const [id, value] of Object.entries(values)) api.w_brush_set_param(+id, value);
  const pixels = new Uint32Array(native.memory.buffer, api.get_active_layer_pixels(), width * height);
  pixels.fill(0);
  for (let i = 0; i <= 160; i++) {
    api.w_brush_dyn_stroke_to(30 + i*2.8, 80 + Math.sin(i/15)*20, .65, 0, 0, .016, 1);
  }
  return Buffer.from(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
}

test('continuous brushes render realism and retain their old neutral behavior', () => {
  const before = renderContinuous();
  assert.ok(before.some(byte => byte));
  for (const config of [{58: 90}, {60: 12, 61: 80}, {67: 100, 68: 80}, {70: 3, 71: 95}, {63: 75}, {73: 200}, {74: 200}, {77: 1}]) {
    assert.notDeepEqual(renderContinuous(config), before, JSON.stringify(config));
  }
  if (process.env.LEGACY_CANVAS_WASM) {
    const legacy = new EsenhoModule(process.env.LEGACY_CANVAS_WASM);
    legacy.exports.w_init(width, height);
    assert.deepEqual(before, renderContinuous({}, legacy));
  }
});

test('independent pressure responses preserve their endpoints and change the middle', () => {
  for (const id of [73, 74]) {
    assert.deepEqual(render({[id]: 25}, engine, false, () => 1000), render({[id]: 300}, engine, false, () => 1000));
    assert.notDeepEqual(render({[id]: 25}, engine, false, () => 450), render({[id]: 300}, engine, false, () => 450));
  }
});

test('pressure opacity caps a stroke and never erases an earlier stronger dab', () => {
  const api = engine.exports;
  const pixels = new Uint32Array(engine.memory.buffer, api.get_active_layer_pixels(), width * height);
  api.w_brush_reset();
  for (const [id, value] of [[1, 12], [3, 100], [4, 100], [5, 5], [39, 0], [40, 0], [77, 1]]) api.w_brush_set_param(id, value);
  pixels.fill(0);
  api.w_brush_stroke_ext_f(0, 80, 80, 80, 80, 0xff376a90, 0, 800, 0, 0);
  const strong = pixels[80 * width + 80] >>> 24;
  for (let i = 0; i < 60; i++) {
    const x = 80 + (i % 2);
    api.w_brush_stroke_ext_f(1, x, 80, 81 - (i % 2), 80, 0xff376a90, 0, 200, 0, 0);
    assert.equal(pixels[80 * width + 80] >>> 24, strong);
  }
  assert.ok(strong >= 200 && strong <= 204);
  pixels.fill(0);
  api.w_brush_stroke_ext_f(0, 80, 80, 80, 80, 0xff376a90, 0, 500, 0, 0);
  for (let i = 0; i < 60; i++) {
    api.w_brush_stroke_ext_f(1, 80 + (i % 2), 80, 81 - (i % 2), 80, 0xff376a90, 0, 500, 0, 0);
  }
  assert.ok((pixels[80 * width + 80] >>> 24) <= 127, 'Repeated dabs respect the pressure opacity ceiling');
});

test('deposition profile is an opt-in choice, and disabling realism resets its state', () => {
  assert.deepEqual(render({70: 3, 71: 0}), render());
  assert.deepEqual(render({70: 0, 71: 100}), render());
  const baseline = render();
  render({58: 90, 60: 30, 67: 100, 68: 100, 72: 100, 77: 1});
  assert.deepEqual(render(), baseline);
});

test('presets, metadata and all pin definitions use one complete schema', () => {
  assert.equal(new Set(parameters.map(p => p.id)).size, parameters.length);
  assert.deepEqual(metadata.realismParameters, parameters);
  const physical = Object.values(presets).filter(p => p.id.startsWith('real_'));
  assert.equal(physical.length, 8);
  for (const param of parameters) {
    assert.ok(physical.some(p => p[param.key] !== undefined && p[param.key] !== param.default), `Showcase ${param.key}`);
    for (const preset of physical) {
      if (preset[param.key] !== undefined) assert.ok(preset[param.key] >= param.min && preset[param.key] <= param.max);
      assert.equal(metadata.presets.find(p => p.id === preset.id)[param.key] ?? param.default, preset[param.key] ?? param.default);
    }
  }
  assert.ok(parameters.some(p => p.switch));
  assert.ok(parameters.some(p => p.options));
  assert.ok(physical.every(p => p.size <= 100 && p.texture === 'none' && p.tex_mode === 0));
});

test('render the eight new presets for visual review', () => {
  for (const preset of Object.values(presets).filter(p => p.id.startsWith('real_'))) {
    const values = Object.fromEntries(parameters.filter(p => preset[p.key] !== undefined).map(p => [p.id, preset[p.key]]));
    values[1] = Math.round(preset.size / 2);
    values[2] = preset.opacity;
    values[3] = preset.hardness;
    values[4] = preset.flow;
    const pixels = render(values);
    if (process.env.BRUSH_REALISM_PREVIEW_DIR) {
      fs.mkdirSync(process.env.BRUSH_REALISM_PREVIEW_DIR, {recursive: true});
      const rgb = Buffer.alloc(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        const a = pixels[i * 4 + 3] / 255;
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(pixels[i * 4 + c] * a + 248 * (1 - a));
      }
      fs.writeFileSync(path.join(process.env.BRUSH_REALISM_PREVIEW_DIR, preset.id + '.ppm'), Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), rgb]));
    }
  }
});
