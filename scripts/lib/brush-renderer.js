const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const NATURAL_BRUSHES = ['graphite_pencil', 'colored_pencil', 'soft_pastel', 'wax_crayon', 'dip_pen', 'felt_marker', 'gouache_flat', 'dry_flat_brush', 'charcoal_chalk', 'bristle_oil', 'watercolor_bleed', 'calligraphy_ribbon'];
function loadBrush(name, width = 320, height = 100) {
  const memory = new WebAssembly.Memory({ initial: 256 });
  const module = new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'plugins/brushes', `${name}.wasm`)));
  const instance = new WebAssembly.Instance(module, { env: { memory,
    __memory_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 4096),
    __table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, 1),
    sinf: Math.sin, cosf: Math.cos, sqrtf: Math.sqrt, atan2f: Math.atan2, powf: Math.pow,
  } });
  const api = instance.exports, ptr = 1024 * 1024;
  const bytes = new Uint8Array(memory.buffer);
  let start = api.w_brush_get_info(), end = start;
  while (bytes[end]) end++;
  const info = JSON.parse(Buffer.from(bytes.subarray(start, end)).toString());
  const pixels = new Uint32Array(memory.buffer, ptr, width * height);
  const guard = new Uint32Array(memory.buffer, ptr - 64, width * height + 32);
  guard.fill(0x12563478); pixels.fill(0);
  api.w_brush_init(width, height);
  info.params.forEach((p, i) => api.w_brush_set_param(i, p.default));
  function begin(color = 0xff304080, x = 25, y = height / 2, pressure = 1, eraser = 0) {
    api.w_brush_stroke_begin(x, y, pressure, 0, 0, color, eraser);
  }
  function dab(x, y, radius = 14, pressure = 1, color = 0xff304080, eraser = 0, angle = 0) {
    api.w_brush_render_dab(ptr, width, height, x, y, radius, pressure, angle, 0.4, color, eraser);
  }
  function stroke({ pressure = 1, color = 0xff304080, radius = 14, y = height / 2, wave = 0, eraser = 0 } = {}) {
    begin(color, 25, y, typeof pressure === 'function' ? pressure(0) : pressure, eraser);
    const step = Math.max(0.35, radius * 2 * info.spacing);
    for (let x = 25; x < width - 25; x += step) {
      const t = (x - 25) / (width - 50);
      const angle = Math.atan(wave * Math.PI * 2 / (width - 50) * Math.cos(t * Math.PI * 2)) * 180 / Math.PI;
      dab(x, y + wave * Math.sin(t * Math.PI * 2), radius, typeof pressure === 'function' ? pressure(t) : pressure, color, eraser, angle);
    }
    api.w_brush_stroke_end();
  }
  return { name, api, pixels, guard, info, begin, dab, stroke, width, height };
}
function alphaMass(pixels) { let sum = 0; for (const p of pixels) sum += p >>> 24; return sum; }
module.exports = { loadBrush, NATURAL_BRUSHES, alphaMass };
