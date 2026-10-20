const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EsenhoModule } = require('../src/esenho');
const presets = require('../src/presets_data').CURATED_BRUSH_PRESETS;
const registry = require('../src/resource_registry');
const wasm = path.resolve(__dirname, '../plugins/canvas.wasm');

function canvas(w, h, preset) {
  const engine = new EsenhoModule(wasm);
  const api = engine.exports;
  api.w_init(w,h);
  api.w_brush_reset();
  const ids = {size:1,opacity:2,hardness:3,flow:4,spacing:5,angle:6,roundness:7,smudge:10,grain:12,tex_mode:13,mode:15,texture_scale:17,texture_contrast:21,pressure_size:39,pressure_flow:40,tex_scale_with_size:57};
  for(const [key,id] of Object.entries(ids)) if(typeof preset[key]==='number') api.w_brush_set_param(id,preset[key]);
  function string(value) {
    const ptr=api.w_get_clip_mask_buffer(128);
    new Uint8Array(engine.memory.buffer).set(Buffer.from(value+'\0'),ptr);
    return ptr;
  }
  api.w_brush_select_shape_by_name(string(preset.shape || 'circle'));
  api.w_brush_select_texture_by_name(string(preset.texture || 'none'));
  const ptr=api.get_active_layer_pixels();
  const pixels=new Uint32Array(engine.memory.buffer,ptr,w*h);
  function stroke(points) {
    let prev=points[0];
    points.forEach((point,i)=>{
      api.w_brush_stroke_ext_f(i?1:0,...point,...prev,0xff306090,0,650,0,0);
      prev=point;
    });
    api.w_brush_stroke_ext_f(2,...prev,...prev,0xff306090,0,650,0,0);
  }
  return {api,pixels,stroke};
}

test('drawing, painting, blending and erasing presets do not impose a fixed surface mask',()=>{
  for(const p of Object.values(presets)) {
    if(!p.category || ['fx','texture'].includes(p.category) || p.id==='salt_bloom_wash') continue;
    assert.ok(!p.tex_mode, `${p.id}: fixed mask must be disabled`);
    assert.ok(!p.texture || p.texture==='none',`${p.id}: background texture must be unset`);
    const shipped=registry.get('brush',p.id);
    assert.ok(!shipped.tex_mode && (!shipped.texture || shipped.texture==='none'),`${p.id}: shipped registry must also clear the mask`);
  }
  for(const id of ['conte','pastel','charcoal','pencil']) assert.ok(presets[id].grain>0,`${id}: dry pigment keeps granulation`);
  assert.equal(presets.smudge.grain,0,'a finger moves pigment without adding grain');
  assert.ok(Object.values(presets).some(p=>p.category==='fx' && p.texture==='manga_dots'));
});

test('Conté texture follows pigment deposition rather than canvas coordinates',()=>{
  const w=320,h=140,dx=19,dy=23;
  const p={...presets.conte,size:36};
  const first=canvas(w,h,p), shifted=canvas(w,h,p);
  const points=Array.from({length:41},(_,i)=>[60+i*4,50]);
  first.stroke(points);
  shifted.stroke(points.map(([x,y])=>[x+dx,y+dy]));
  let painted=0;
  for(let y=0;y<h-dy;y++) for(let x=0;x<w-dx;x++) {
    const pixel=first.pixels[y*w+x];
    assert.equal(shifted.pixels[(y+dy)*w+x+dx],pixel,`translated pixel ${x},${y}`);
    if(pixel>>>24)painted++;
  }
  assert.ok(painted>100);
});

test('smudge reads the substrate before each dab, without scan-direction feedback',()=>{
  const w=128,h=64;
  const p={...presets.smudge,shape:'circle',size:24,spacing:10};
  const left=canvas(w,h,p), right=canvas(w,h,p);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const color=x<64?0xff204080:0xffd0e0f0;
    left.pixels[y*w+x]=color;
    right.pixels[y*w+w-1-x]=color;
  }
  const before=left.pixels.slice();
  const points=Array.from({length:31},(_,i)=>[40+i*2,32]);
  left.stroke(points);right.stroke(points.map(([x,y])=>[w-1-x,y]));
  assert.ok(left.pixels.some((pixel,i)=>pixel!==before[i]),'smudge must move existing paint');
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const a=left.pixels[y*w+x], b=right.pixels[y*w+w-1-x];
    for(const shift of [0,8,16,24]) assert.ok(Math.abs(((a>>>shift)&255)-((b>>>shift)&255))<=1,`mirror mismatch at ${x},${y}`);
  }
});
