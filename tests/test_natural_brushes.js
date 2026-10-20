const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrush, NATURAL_BRUSHES, alphaMass } = require('../scripts/lib/brush-renderer');
const presets = require('../src/presets_data').CURATED_BRUSH_PRESETS;

for (const name of NATURAL_BRUSHES) test(`${name}: pressure, opacity, eraser, edges and lifecycle`, () => {
  const b = loadBrush(name);
  if (name === "watercolor_bleed") b.api.w_brush_set_param(1,0); // Disable intentional fringe darkening for the hue invariant.
  b.stroke({pressure: 0});
  assert.equal(alphaMass(b.pixels), 0, 'zero pressure must not paint');
  b.stroke({color: 0x00304080});
  assert.equal(alphaMass(b.pixels), 0, 'transparent color must not paint');
  b.stroke({pressure: 0.2}); const light = alphaMass(b.pixels);
  b.pixels.fill(0); b.stroke({pressure: 1}); const heavy = alphaMass(b.pixels);
  assert.ok(heavy > light && light > 0, `${name} pressure: ${heavy} > ${light}`);
  for (const p of b.pixels) if (p >>> 24) assert.equal(p & 0xffffff, 0x304080, 'transparent substrate must preserve pigment hue');
  const first = b.pixels.slice();
  b.pixels.fill(0); b.stroke({pressure: 1});
  assert.deepEqual(b.pixels, first, 'a new stroke must restore its paint charge');
  b.pixels.fill(0xff304080); b.stroke({color: 0x00304080, eraser: 1});
  assert.ok(b.pixels.every(p => p === 0xff304080), 'transparent eraser must not erase');
  b.stroke({eraser: 1});
  assert.ok(alphaMass(b.pixels) < 255 * b.pixels.length);
  for (const p of b.pixels) if (p >>> 24) assert.equal(p & 0xffffff, 0x304080, 'erasing must preserve straight RGB');
  for (const [x,y] of [[-15,-15],[0,0],[319,99],[340,110]]) b.dab(x,y,25,1);
  assert.ok(b.guard.subarray(0,16).every(p=>p===0x12563478));
  assert.ok(b.guard.subarray(b.guard.length-16).every(p=>p===0x12563478));
  b.api.w_brush_set_param(-1, -1000); b.api.w_brush_set_param(1000, 1000);
  for (let i=0;i<b.info.params.length;i++) {
    b.api.w_brush_set_param(i, -10000); b.dab(40,40);
    b.api.w_brush_set_param(i, 10000); b.dab(40,40);
  }
});

test('transparent layers blend without dark rims', () => {
  const b=loadBrush('dip_pen');
  b.begin(0x80304080); b.dab(70,50,16,1,0x80304080); b.dab(70,50,16,1,0x80304080);
  for(const p of b.pixels) if(p>>>24) assert.equal(p&0xffffff,0x304080);
});
test('paper stays in canvas space; new coats accumulate', () => {
  const b=loadBrush('graphite_pencil'); b.stroke({pressure:.5}); const first=b.pixels.slice();
  b.stroke({pressure:.5});
  for(let i=0;i<first.length;i++) {
    if(!(first[i]>>>24)) assert.equal(b.pixels[i]>>>24,0, 'paper holes must not crawl between strokes');
    else assert.ok((b.pixels[i]>>>24)>=(first[i]>>>24));
  }
});
test('distinct dry materials produce distinct deposition', () => {
  const hashes = new Set();
  for(const name of NATURAL_BRUSHES.slice(0,4)) { const b=loadBrush(name); b.stroke(); hashes.add(require('node:crypto').createHash('sha256').update(Buffer.from(b.pixels.buffer,b.pixels.byteOffset,b.pixels.byteLength)).digest('hex')); }
  assert.equal(hashes.size,4);
});
test('pickup transports existing paint; no opacity increase from opaque substrate', () => {
  const b=loadBrush('gouache_flat');
  b.api.w_brush_set_param(2,100);
  for(let y=0;y<b.height;y++) for(let x=0;x<120;x++) b.pixels[y*b.width+x]=0xffff0000;
  b.stroke({color:0x80304080});
  assert.ok(b.pixels.some((p,i)=> i%b.width>150 && p>>>24 && (p&0xffffff)!==0x304080),'picked pigment must travel to a transparent area');
});
test('natural preset calibrations preserve intentional technical and FX behavior', () => {
  for (const id of ['pencil','soft_pencil','conte','charcoal','hard_charcoal','pastel','watercolor','oil']) {
    assert.equal(presets[id].tex_scale_with_size,0, id+' paper must not scale with the tip');
    assert.ok(!presets[id].scatter,id+' must not scatter its centerline');
  }
  assert.equal(presets.mech_pencil.pressure_size,0);
  assert.equal(presets.precision_liner.pressure_size,0);
  assert.equal(presets.clear_water_wash.opacity,0);
  assert.equal(presets.solid_vector.isVectorPure,true);
  assert.equal(presets.studio_inker.dynamics.velocityScaling,presets.studio_inker.velocity);
  assert.equal(presets.wet_acrylic.wet.wetness,presets.wet_acrylic.wetness);
});
