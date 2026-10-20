const test = require('node:test');
const assert = require('node:assert/strict');
const { createProceduralTextures, EsenhoModule } = require('../src/esenho');
const path = require('node:path');

const names = ['paper', 'canvas', 'watercolor', 'charcoal_tooth', 'linen', 'washi', 'dry_scrape', 'pastel_board'];
const textures = createProceduralTextures();
function correlation(t, dx, dy) {
  let n=0, a=0, b=0, aa=0, bb=0, ab=0;
  for (let y=0; y<t.height-dy; y++) for (let x=0; x<t.width-dx; x++) {
    const u=t.data[(y*t.width+x)*4], v=t.data[((y+dy)*t.width+x+dx)*4];
    n++; a+=u; b+=v; aa+=u*u; bb+=v*v; ab+=u*v;
  }
  return (n*ab-a*b)/Math.sqrt((n*aa-a*a)*(n*bb-b*b));
}

test('material grain has no repeated screens, circles or crossed grids', () => {
  for (const name of names) {
    const t=textures.get(name);
    assert.equal(t.width,256,name);
    for (const lag of [8,12,16,24,32,64]) {
      assert.ok(Math.abs(correlation(t,lag,0))<0.25,`${name}: horizontal periodicity at ${lag}`);
      assert.ok(Math.abs(correlation(t,0,lag))<0.25,`${name}: vertical periodicity at ${lag}`);
    }
    assert.ok(new Set(t.data.filter((_,i)=>i%4===0)).size>60,`${name}: continuous grain tones`);
  }
});
test('grain remains stable across sessions', () => {
  const again=createProceduralTextures();
  for(const name of names) assert.deepEqual(again.get(name).data,textures.get(name).data,name);
});
test('intentional halftone stamps retain their screen', () => {
  assert.ok(correlation(textures.get('dots'),16,0)>0.99);
  assert.ok(correlation(textures.get('crosshatch_fine'),8,0)>0.99);
});
test('native embedded materials match browser pixels', () => {
  const engine=new EsenhoModule(path.resolve(__dirname,'../plugins/canvas.wasm'));
  engine.exports.w_init(64,64);
  for(const name of names) {
    const ptrName=engine.exports.w_get_clip_mask_buffer(256);
    new Uint8Array(engine.memory.buffer).set(Buffer.from(name+'\0'),ptrName);
    const slot=engine.exports.w_texture_find_or_create(ptrName);
    assert.ok(slot>=0,name);
    const t=textures.get(name);
    const ptr=engine.exports.w_layer_get_pixels(slot);
    const pixels=new Uint32Array(engine.memory.buffer,ptr,t.width*t.height);
    for(let i=0;i<pixels.length;i++) assert.equal(pixels[i]&255,t.data[i*4],`${name} pixel ${i}`);
  }
});
