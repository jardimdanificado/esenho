const test = require('node:test');
const assert = require('node:assert/strict');
const curves = require('../src/brush_curves_data.json');
const procedural = require('../src/brush_curve_brushes.json');
const metadata = require('../android/app/src/main/res/raw/esenho_native_metadata.json');
const presets = require('../src/presets_data').CURATED_BRUSH_PRESETS;
const data = require('../data.json');
const registry = require('../src/resource_registry');
const common = new Set([1, 2, 4, 5, 19, 20]);

test('saved curve templates share a valid normalized schema across catalogs', () => {
  assert.equal(curves.length, 9);
  assert.equal(new Set(curves.map(c => c.id)).size, curves.length);
  assert.deepEqual(metadata.responseCurves, curves);
  assert.deepEqual(data.brushResponseCurves, curves);
  assert.equal(data.stats.brushResponseCurves, curves.length);
  for (const curve of curves) {
    assert.ok(['smooth', 'linear', 'steps'].includes(curve.interpolation));
    assert.ok(curve.name && curve.points.length >= 2 && curve.points.length <= 32);
    assert.equal(curve.points[0][0], 0); assert.equal(curve.points.at(-1)[0], 1);
    curve.points.forEach(([x, y], i) => {
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && y >= 0 && y <= 1);
      if (i) assert.ok(x - curve.points[i - 1][0] >= .0001);
    });
  }
});

function validate(binding) {
  assert.ok(curves.some(c => c.id === binding.curveId), binding.curveId);
  assert.ok(['pressure', 'speed', 'distance', 'time', 'tilt', 'direction', 'noise'].includes(binding.input));
  assert.ok(binding.scale > 0 && binding.target.max > binding.target.min);
  assert.ok(binding.low >= 0 && binding.low <= binding.high && binding.high <= 1);
  if (binding.target.kind === 'choice') assert.equal(binding.target.max, binding.target.options.length - 1);
}

test('five new brushes demonstrate reuse, sensors, cycles and discrete controls', () => {
  const demos = Object.values(presets).filter(p => p.id.startsWith('curves_'));
  assert.equal(demos.length, 5);
  const inputs = new Set();
  for (const preset of demos) {
    assert.deepEqual(metadata.presets.find(p => p.id === preset.id).curve_bindings, preset.curve_bindings);
    assert.deepEqual(registry.get('brush', preset.id).curve_bindings, preset.curve_bindings);
    assert.ok(preset.size <= 100 && preset.texture === 'none');
    for (const binding of preset.curve_bindings) {
      validate(binding); inputs.add(binding.input);
      assert.equal(binding.target.owner, common.has(binding.target.id) ? '' : 'classic');
    }
  }
  assert.deepEqual([...inputs].sort(), ['distance', 'pressure', 'speed', 'tilt', 'time']);
  assert.ok(demos.some(p => p.curve_bindings.some(b => b.target.kind === 'choice')));
  const airbrush = demos.find(p => p.id === 'curves_time_airbrush');
  assert.equal(airbrush.buildup, 1);
  assert.ok(airbrush.curve_bindings.every(b => b.repeat && b.input === 'time'));
});

test('procedural demonstration binds its actual kernel parameter without leaking its index', () => {
  assert.deepEqual(metadata.proceduralCurveBindings, procedural);
  for (const [kernelId, bindings] of Object.entries(procedural)) {
    const kernel = metadata.brushes.find(b => b.id === kernelId);
    assert.ok(kernel);
    for (const binding of bindings) {
      validate(binding);
      const param = kernel.params[binding.target.id - 10000];
      assert.ok(param);
      assert.equal(binding.target.owner, `wasm:${kernelId}`);
      assert.equal(binding.target.name, param.name);
      assert.equal(binding.target.min, param.min); assert.equal(binding.target.max, param.max);
    }
  }
});
