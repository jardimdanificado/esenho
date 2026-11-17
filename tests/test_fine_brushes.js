const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBrush, alphaMass } = require('../scripts/lib/brush-renderer');

const names = fs.readdirSync(path.join(__dirname, '../src/plugins/brushes'))
  .filter(name => name.endsWith('.c')).map(name => name.slice(0, -2));

for (const name of names) test(`${name}: one-pixel stroke survives fractional placement and canvas edges`, () => {
  const b = loadBrush(name, 96, 48);
  b.begin(0xff304080, 25.3, 24.37);
  for (let i = 0; i < 32; ++i) b.dab(25.3 + i * 0.35, 24.37, 0.5, 1);
  assert.ok(alphaMass(b.pixels) > 0, `${name} lost its one-pixel stroke`);
  b.api.w_brush_stroke_end();
  for (const [x, y] of [[0, 0], [95.8, 47.8], [-2, -2], [98, 50]]) {
    b.begin(0xff304080, x, y);
    b.dab(x, y, 2, 1);
    b.api.w_brush_stroke_end();
  }
  assert.ok(b.guard.subarray(0, 16).every(p => p === 0x12563478), 'write before canvas');
  assert.ok(b.guard.subarray(b.guard.length - 16).every(p => p === 0x12563478), 'write after canvas');
});

test('classic pressure retains fractional radii below one pixel', () => {
  const { EsenhoModule } = require('../src/esenho');
  const e = new EsenhoModule(path.join(__dirname, '../plugins/canvas.wasm')).exports;
  e.w_init(96, 48);
  const pixels = new Uint32Array(e.memory.buffer, e.get_active_layer_pixels(), 96 * 48);
  for (const [id, value] of [[1, 1], [2, 100], [3, 100], [4, 100], [7, 100], [32, 1], [39, 1], [40, 0]]) e.w_brush_set_param(id, value);
  const masses = [];
  for (const pressure of [250, 500, 1000]) {
    pixels.fill(0);
    e.w_brush_stroke_ext_f(0, 25.3, 24.37, 25.3, 24.37, 0xff304080, 0, pressure, 0, 0);
    e.w_brush_stroke_ext_f(2, 25.3, 24.37, 25.3, 24.37, 0xff304080, 0, pressure, 0, 0);
    masses.push(alphaMass(pixels));
  }
  assert.ok(masses[0] > 0 && masses[0] < masses[1] && masses[1] < masses[2], `pressure coverage: ${masses}`);
});

for (const [name, parameter] of [
  ['dragon_scale_armor', 0], ['neon_glow', 0], ['fiber_optic_strands', 0],
  ['sand_dune_ripples', 0], ['moire_interference_silk', 0], ['particle_spray', 0],
  ['origami_kaleido', 0], ['watercolor_bleed', 0], ['calligraphy_ribbon', 1],
]) test(`${name}: characteristic control still changes a fine stroke`, () => {
  const samples = [];
  for (const edge of ['min', 'max']) {
    const b = loadBrush(name, 96, 48);
    b.api.w_brush_set_param(parameter, b.info.params[parameter][edge]);
    b.stroke({ radius: 1, y: 24.37 });
    samples.push(b.pixels.slice());
  }
  assert.notDeepEqual(samples[0], samples[1]);
});

test('extremely flat fine calligraphy nib survives between sample positions', () => {
  for (const angle of [0, 45, 90]) {
    const b = loadBrush('calligraphy_ribbon');
    b.api.w_brush_set_param(0, angle);
    b.api.w_brush_set_param(1, 98);
    b.stroke({ radius: 0.5, y: 50.37 });
    assert.ok(alphaMass(b.pixels) > 0, `lost hairline at angle ${angle}`);
  }
});
