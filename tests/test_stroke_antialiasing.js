const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EsenhoModule } = require('../src/esenho');

function surface({ flow = 100, opacity = 100, subpixel = 1, buildup = 0, eraser = 0 } = {}) {
  const api = new EsenhoModule(path.join(__dirname, '../plugins/canvas.wasm')).exports;
  const w = 72, h = 48;
  api.w_init(w, h);
  for (const [id, value] of [[1, 5], [2, opacity], [3, 100], [4, flow], [5, 5], [7, 100], [32, subpixel], [39, 0], [40, 0], [42, buildup]]) api.w_brush_set_param(id, value);
  const pixels = new Uint32Array(api.memory.buffer, api.get_active_layer_pixels(), w * h);
  pixels.fill(eraser ? 0xff42639a : 0);
  const dab = (state, x, y, previousX = x, previousY = y) => api.w_brush_stroke_ext_f(state, x, y, previousX, previousY, 0xff42639a, eraser, 1000, 0, 0);
  function line(passes = 1) {
    dab(0, 8.25, 24.2);
    for (let i = 0; i < passes; ++i) {
      const from = i % 2 ? 63.25 : 8.25, to = i % 2 ? 8.25 : 63.25;
      dab(1, to, 24.2, from, 24.2);
    }
  }
  return { api, pixels, w, h, dab, line };
}

test('2x stroke coverage matches a fractional horizontal boundary without an opaque halo', () => {
  const s = surface(); s.line();
  for (let y = 17; y <= 31; ++y) {
    const expected = Math.max(0, Math.min(y + 0.5, 29.2) - Math.max(y - 0.5, 19.2)) * 255;
    for (let x = 18; x < 54; ++x) assert.ok(Math.abs((s.pixels[y * s.w + x] >>> 24) - expected) <= 4, `edge (${x},${y}) must resolve to ${expected}`);
  }
});

test('overlapping passes keep partial edge coverage within the same stroke', () => {
  const once = surface(); once.line();
  const repeated = surface(); repeated.line(12);
  for (let y = 17; y <= 31; ++y) for (let x = 18; x < 54; ++x)
    assert.ok(Math.abs((once.pixels[y * once.w + x] >>> 24) - (repeated.pixels[y * repeated.w + x] >>> 24)) <= 3);
});

test('eraser resolves the same subpixel boundary as paint', () => {
  const paint = surface(); paint.line(8);
  const erase = surface({ eraser: 1 }); erase.line(8);
  for (let i = 0; i < paint.pixels.length; ++i)
    assert.ok(Math.abs((paint.pixels[i] >>> 24) + (erase.pixels[i] >>> 24) - 255) <= 1);
});

test('flow still builds inside the footprint and opacity caps each stroke', () => {
  const s = surface({ flow: 1, opacity: 50 });
  s.line(); const first = s.pixels[24 * s.w + 36] >>> 24;
  s.dab(1, 8.25, 24.2, 63.25, 24.2);
  assert.ok((s.pixels[24 * s.w + 36] >>> 24) > first);
  for (const p of s.pixels) assert.ok((p >>> 24) <= 127);
});

test('a new stroke starts a fresh coverage surface and can add another coat', () => {
  const s = surface({ opacity: 50 }); s.line();
  const first = s.pixels[19 * s.w + 36] >>> 24;
  s.dab(2, 63.25, 24.2);
  s.line();
  assert.ok((s.pixels[19 * s.w + 36] >>> 24) > first);
});

test('disabling subpixel rendering keeps pixel-art edges discrete', () => {
  const s = surface({ subpixel: 0 }); s.line();
  for (const p of s.pixels) assert.ok((p >>> 24) === 0 || (p >>> 24) === 255);
});
