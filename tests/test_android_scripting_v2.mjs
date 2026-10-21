import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const api = read('android/app/src/main/res/raw/esenho_script_api.js');
const native = ['NativeScriptApi.kt','NativeScriptExtendedApi.kt','NativeScriptRuntime.kt']
  .map(file => read(`android/app/src/main/java/app/esenho/scripting/${file}`)).join('\n');
const commands = new Set([...native.matchAll(/"([a-z][\w]*(?:\.[\w]+)+)"\s*(?=,|->)/g)].map(m => m[1]));
for (const command of ['state','undo','redo','shape','log','wait']) commands.add(command);
for (const [, command] of api.matchAll(/call\("([\w.]+)"/g)) {
  assert.ok(commands.has(command), `JS command has no native handler: ${command}`);
}

function fixture({cancelPicker = false} = {}) {
  const calls = [], data = new Map(), curves = [], pivots = new Map();
  let layer = {id:3,name:'Base'}, serial = 3;
  function dispatch(op,a) {
    assert.ok(commands.has(op), `Unsupported command: ${op}`);
    calls.push([op,a]);
    switch(op) {
      case 'state': return {width:800,height:600,tool:'brush',layer};
      case 'view.state': return {width:400,height:400,x:400,y:300,rotation:0,zoom:1};
      case 'spaces.view': return {kind:'document',matrix:[1,0,0,1,0,0]};
      case 'spaces.resolve': return {...a.space,kind:'document'};
      case 'pivots.pick': {
        if(a.pointOnly)return {x:100,y:100};
        const p={kind:a.anchor ?? 'document',matrix:[1,0,0,1,100,100],name:a.name ?? 'picked'};
        pivots.set(p.name,p);return p;
      }
      case 'pivots.create': {
        const r=a.rotation*Math.PI/180 || 0;
        const p={name:a.name,kind:a.anchor ?? 'document',matrix:[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),a.x ?? 0,a.y ?? 0]};
        pivots.set(p.name,p);return p;
      }
      case 'pivots.update': {
        const p=pivots.get(a.name);assert.ok(p,'pivot must exist');pivots.delete(a.name);
        const result={...p,name:a.newName ?? p.name,matrix:[...p.matrix]};
        if(a.x!==undefined)result.matrix[4]=a.x;if(a.y!==undefined)result.matrix[5]=a.y;
        pivots.set(result.name,result);return result;
      }
      case 'pivots.list': return [...pivots.values()];
      case 'pivots.get': return pivots.get(a.name);
      case 'layers.create': layer={id:++serial,name:a.name};return layer;
      case 'layers.duplicate': layer={...layer,id:++serial};return layer;
      case 'groups.create': return {id:`group${++serial}`,name:a.name};
      case 'groups.list': return [];
      case 'brush.parameters': return [{id:1,min:1,max:100},{id:5,min:1,max:100}];
      case 'brush.save': return {id:'preset:saved',name:a.name};
      case 'curves.targets': return [{id:1,min:1,max:100,name:'Size'}];
      case 'curves.list': return curves;
      case 'curves.save': { const c={...a,id:a.id ?? `curve${curves.length}`};curves.push(c);return c; }
      case 'curves.bind': return a;
      case 'curves.evaluate': return .5;
      case 'curves.bindings': return [];
      case 'palettes.create': return {id:'palette',name:a.name};
      case 'filters.list': return [{id:'grayscale',params:[]}];
      case 'selection.state': return {active:true,bounds:{x:0,y:0,width:20,height:20}};
      case 'guides.create': return 0;
      case 'guides.list': return [];
      case 'transform.begin': return true;
      case 'transform.corners': return a.points ?? [{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}];
      case 'animation.state': return {frame:0,count:3,fps:12,ticks:3,tracks:[]};
      case 'ui.prompt': return Object.fromEntries(a.fields.map(f => [f.name,f.value]));
      case 'storage.set': data.set(a.key,a.value);return null;
      case 'storage.get': return data.get(a.key) ?? null;
      case 'files.writeText': data.set(a.path,a.text);return null;
      case 'files.readText': return data.get(a.path);
      case 'files.pick': return cancelPicker ? null : 'content://test/destination';
      case 'project.save': case 'export.image': case 'export.animation': return a.path;
      default: return null;
    }
  }
  const context=vm.createContext({__esenhoHost(op,args) { return JSON.stringify({value:dispatch(op,JSON.parse(args))}); }});
  vm.runInContext(api,context,{filename:'esenho-api.js'});
  return {calls,context};
}

const oldExamples=read('android/app/src/main/java/app/esenho/ui/components/NativeScriptEditor.kt');
const catalog=read('android/app/src/main/java/app/esenho/ui/components/NativeScriptCatalog.kt');
const trimIndent = text => {
  const lines=text.replace(/^\n|\n\s*$/g,'').split('\n');
  const indent=Math.min(...lines.filter(line=>line.trim()).map(line=>line.match(/^ */)[0].length));
  return lines.map(line=>line.slice(indent)).join('\n');
};
const sources = [...oldExamples.matchAll(/val (radial|spiral|view) = """([\s\S]*?)"""/g)].map(m=>[m[1],trimIndent(m[2])]);
for(const m of catalog.matchAll(/example\("([\w-]+)","[^"]+",\s*"""([\s\S]*?)"""\)/g))sources.push([m[1],trimIndent(m[2])]);
assert.ok(sources.length>=32,'expected a broad example catalog');
for(const [name,source] of sources) {
  const {context}=fixture();
  vm.runInContext(source,context,{filename:`example-${name}.js`,timeout:2000});
}
{
  const {calls,context}=fixture();
  vm.runInContext('esenho.brush.setParam(-100, "circle"); esenho.curves.bind(1,{id:"curve"},{input:"distance",scale:100,repeat:true});',context);
  assert.equal(calls[0][0],'brush.setParameter');
  assert.equal(calls[0][1].value,'circle');
  assert.equal(calls[1][1].curveId,'curve');
  assert.equal(calls[1][1].repeat,true);
}
{
  const {calls,context}=fixture({cancelPicker:true});
  assert.throws(()=>vm.runInContext('esenho.project.save()',context),/cancelada/);
  assert.ok(!calls.some(([op])=>op==='project.save'),'cancel must not write a placeholder path');
}
{
  const {calls,context}=fixture();
  vm.runInContext('esenho.tools.begin({x:0,y:0});esenho.wait(20);esenho.tools.move({x:20,y:30});esenho.tools.end();',context);
  assert.deepEqual(calls.map(([op])=>op),['stroke.begin','wait','stroke.move','stroke.end']);
  assert.deepEqual(calls.at(-1)[1].point,{x:20,y:30});
}
console.log(`Native scripting v2: ${sources.length} examples execute; JS/native command coverage, curve bindings, parameter choices, timed strokes and picker cancellation OK`);
