const fs = require('node:fs');
const path = require('node:path');
const { loadBrush, NATURAL_BRUSHES } = require('./lib/brush-renderer');
const { encodePng } = require('../src/image_io');
const out = process.argv[2] || 'artifacts/brush-review';
fs.mkdirSync(out,{recursive:true});
const rows=[];
for(const name of NATURAL_BRUSHES) {
  const samples=[];
  for(const strong of [false,true]) {
    const b=loadBrush(name,320,92);
    b.pixels.fill(0xfff4f7fb);
    b.stroke({radius: name==='dip_pen'?12:17, color:0xff435780, pressure:strong?t=>0.15+0.85*Math.sin(Math.PI*t):0.25, wave:12});
    const rgba=Buffer.from(b.pixels.buffer,b.pixels.byteOffset,b.pixels.byteLength);
    const png=encodePng(b.width,b.height,rgba);
    const filename=`${name}-${strong?'pressure':'light'}.png`;
    fs.writeFileSync(path.join(out,filename),png);
    samples.push(png.toString('base64'));
  }
  rows.push({name,samples});
}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${rows.length*110+70}" viewBox="0 0 900 ${rows.length*110+70}"><rect width="100%" height="100%" fill="#282828"/><g fill="#ebdbb2" font-family="sans-serif"><text x="20" y="28" font-size="20">Esenho · amostras renderizadas pelos kernels WASM</text><text x="232" y="53" font-size="13">Pressão leve (25%)</text><text x="564" y="53" font-size="13">Pressão variável (15–100%)</text>`;
rows.forEach((row,i)=>{
 const y=70+i*110;
 svg+=`<text x="15" y="${y+45}" font-size="13">${esc(row.name)}</text>`;
 row.samples.forEach((png,j)=>{svg+=`<image x="${225+j*332}" y="${y}" width="320" height="92" href="data:image/png;base64,${png}"/>`;});
});
svg+='</g></svg>';
fs.writeFileSync(path.join(out,'natural-media.svg'),svg);
console.log(path.join(out,'natural-media.svg'));
