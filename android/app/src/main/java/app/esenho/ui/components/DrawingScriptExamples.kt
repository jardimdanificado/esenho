package app.esenho.ui.components

import app.esenho.scripting.NativeScriptPreset

/** Each preset includes its setup so it remains runnable when copied/exported. */
object DrawingScriptExamples {
    private fun drawing(id: String, name: String, source: String): NativeScriptPreset {
        val setup = """
            // Marque a origem; arraste para orientar o desenho.
            // O desenho ocupa cerca de 320 × 260 pixels ao redor desse ponto.
            const p = esenho.pickPivot("Origem de: $name");
            esenho.animation.pause();
            esenho.selection.clear();
            esenho.selection.setOperation("replace");
            esenho.assist.set({symmetry:"off",snap:false,grid:false});
            esenho.layers.create("$name");
            esenho.brush.select("preset:studio_inker");
            esenho.brush.set({size:3,opacity:1,hardness:100,smoothing:0});
        """.trimIndent()
        return NativeScriptPreset("example:draw-$id", name, setup + "\n\n" + source.trimIndent())
    }

    val all = listOf(
        drawing("mandala", "Desenho · Mandala de pétalas", """
            esenho.color.set("#458588");
            for (let petal=0; petal<12; petal++) {
              const points=Array.from({length:101},(_,i)=>{
                const t=i/100*Math.PI*2;
                return {x:72-62*Math.cos(t),y:22*Math.sin(t),pressure:.35+.6*Math.sin(t/2)};
              });
              esenho.brush.stroke({space:p.rotate(petal*30),points});
            }
            esenho.color.set("#d79921");
            esenho.tools.ellipse.stroke({space:p,points:[{x:-28,y:-28},{x:28,y:28}]});
        """),
        drawing("rose", "Desenho · Rosácea matemática", """
            esenho.color.set("#b16286");
            const points=Array.from({length:901},(_,i)=>{
              const t=i/900*Math.PI*2, r=125*Math.cos(5*t);
              return {x:r*Math.cos(t),y:r*Math.sin(t),pressure:.4+.5*Math.abs(Math.cos(5*t))};
            });
            esenho.brush.stroke({space:p,points});
        """),
        drawing("spirograph", "Desenho · Espirógrafo de duas cores", """
            for (let pass=0; pass<2; pass++) {
              esenho.color.set(pass===0?"#076678":"#d65d0e");
              const points=Array.from({length:1201},(_,i)=>{
                const t=i/1200*Math.PI*12, R=95,r=35,d=55;
                return {x:(R-r)*Math.cos(t)+d*Math.cos((R-r)/r*t),
                        y:(R-r)*Math.sin(t)-d*Math.sin((R-r)/r*t),pressure:.7};
              });
              esenho.brush.stroke({space:p.rotate(pass*12),points});
            }
        """),
        drawing("tree", "Desenho · Árvore recursiva", """
            function branch(space,length,depth) {
              esenho.color.set(depth===0?"#689d6a":"#8f563b");
              esenho.brush.set({size:Math.max(2,depth*2)});
              esenho.brush.stroke({space,points:[{x:0,y:0,pressure:1},{x:0,y:-length,pressure:.5}]});
              if(depth>0) {
                const tip=space.translate(0,-length);
                branch(tip.rotate(-26),length*.7,depth-1);
                branch(tip.rotate(26),length*.7,depth-1);
              }
            }
            // Profundidade 3 produz 15 galhos, sem recursão excessiva.
            branch(p.translate(0,110),72,3);
        """),
        drawing("mountains", "Desenho · Paisagem em camadas", """
            const group=esenho.groups.create("Paisagem JS");
            esenho.groups.assign(esenho.layers.active,group);
            const colors=["#a5b7c7","#718f9a","#416b76"];
            for(let ridge=0;ridge<3;ridge++) {
              const layer=esenho.layers.create("Montanhas "+(ridge+1));
              esenho.groups.assign(layer,group);
              esenho.color.set(colors[ridge]);
              const points=Array.from({length:41},(_,i)=>({
                x:-150+i*7.5,y:-50+ridge*40-35*Math.sin(i*.6+ridge)-18*Math.cos(i*1.3)
              }));
              points.push({x:150,y:125},{x:-150,y:125},points[0]);
              esenho.tools.lasso_fill.stroke({space:p,points});
            }
        """),
        drawing("contours", "Desenho · Linhas topográficas", """
            for(let ring=0;ring<12;ring++) {
              esenho.color.set(ring%3===0?"#d79921":"#458588");
              const radius=18+ring*9;
              const points=Array.from({length:181},(_,i)=>{
                const t=i/180*Math.PI*2;
                const r=radius*(1+.12*Math.sin(3*t)+.06*Math.cos(7*t));
                return {x:r*Math.cos(t),y:r*Math.sin(t)*.8,pressure:.75};
              });
              esenho.brush.stroke({space:p,points});
            }
        """),
        drawing("waves", "Desenho · Mar com ondas", """
            esenho.color.set("#076678");
            for(let row=0;row<9;row++) {
              esenho.brush.set({size:2+row*.5});
              const points=Array.from({length:121},(_,i)=>({
                x:-150+i*2.5,y:-90+row*24+Math.sin(i*.1+row*.7)*(6+row),
                pressure:.3+.6*Math.sin(i/120*Math.PI)
              }));
              esenho.brush.stroke({space:p,points});
            }
        """),
        drawing("ribbon", "Desenho · Fitas de Bézier", """
            const a={x:-140,y:80},b={x:-80,y:-180},c={x:60,y:170},d={x:140,y:-80};
            const colors=["#cc241d","#d79921","#458588","#b16286"];
            for(let strip=0;strip<4;strip++) {
              esenho.color.set(colors[strip]);
              esenho.brush.set({size:8});
              const points=Array.from({length:161},(_,i)=>{
                const t=i/160,u=1-t;
                return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
                  y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y+strip*12,
                  pressure:.15+.85*Math.sin(Math.PI*t)};
              });
              esenho.brush.stroke({space:p,points});
            }
        """),
        drawing("cube", "Desenho · Cubo isométrico", """
            const faces=[
              {color:"#83a598",points:[[0,-100],[100,-42],[0,16],[-100,-42],[0,-100]]},
              {color:"#458588",points:[[-100,-42],[0,16],[0,128],[-100,70],[-100,-42]]},
              {color:"#076678",points:[[0,16],[100,-42],[100,70],[0,128],[0,16]]}
            ];
            for(const face of faces) {
              esenho.color.set(face.color);
              esenho.tools.lasso_fill.stroke({space:p,points:face.points.map(([x,y])=>({x,y}))});
            }
        """),
        drawing("gear", "Desenho · Engrenagem recortada", """
            esenho.color.set("#d79921");
            const points=Array.from({length:97},(_,i)=>{
              const t=i/96*Math.PI*2, radius=i%8<4?115:95;
              return {x:radius*Math.cos(t),y:radius*Math.sin(t)};
            });
            points[points.length-1]=points[0];
            esenho.tools.lasso_fill.stroke({space:p,points});
            // A forma de apagar abre um furo transparente.
            esenho.tools.erase_ellipse.stroke({space:p,points:[{x:-36,y:-36},{x:36,y:36}]});
        """),
        drawing("flower", "Desenho · Flor com laço preenchido", """
            esenho.color.set("#d3869b");
            for(let petal=0;petal<8;petal++) {
              const points=Array.from({length:61},(_,i)=>{
                const t=i/60*Math.PI*2;
                return {x:65-55*Math.cos(t),y:25*Math.sin(t)};
              });
              esenho.tools.lasso_fill.stroke({space:p.rotate(petal*45),points});
            }
            esenho.tools.select_ellipse.stroke({space:p,points:[{x:-26,y:-26},{x:26,y:26}]});
            esenho.selection.fill("#fabd2f");
            esenho.selection.clear();
        """),
        drawing("tiles", "Desenho · Azulejos rotacionados", """
            const colors=["#458588","#d79921","#b16286","#689d6a"];
            for(let y=0;y<4;y++)for(let x=0;x<4;x++) {
              esenho.color.set(colors[(x+y)%colors.length]);
              const tile=p.translate((x-1.5)*64,(y-1.5)*64).rotate((x+y)%2?45:0);
              esenho.tools.rectangle.stroke({space:tile,points:[{x:-20,y:-20},{x:20,y:20}]});
            }
        """),
        drawing("pressure", "Ferramentas · Pressão, tamanho e opacidade", """
            esenho.color.set("#458588");
            for(let row=0;row<5;row++) {
              esenho.brush.set({size:8+row*5,opacity:1-row*.15});
              const points=Array.from({length:81},(_,i)=>({
                x:-130+i*3.25,y:-80+row*40,pressure:.05+.95*i/80
              }));
              esenho.brush.stroke({space:p,points});
            }
        """),
        drawing("leaf", "Ferramentas · Folha com seleção por laço", """
            const outline=Array.from({length:81},(_,i)=>{
              const t=i/80*Math.PI*2;
              return {x:70*Math.sin(t)*Math.sin(t/2),y:115*Math.cos(t)};
            });
            esenho.tools.select_lasso.stroke({space:p,points:outline});
            esenho.selection.fill("#8ec07c");
            esenho.color.set("#427b58");
            esenho.tools.line.stroke({space:p,points:[{x:0,y:115},{x:0,y:-115}]});
            for(let i=0;i<5;i++) {
              const y=80-i*34;
              esenho.brush.stroke({space:p,points:[{x:-80,y:y-38},{x:0,y},{x:80,y:y-38}]});
            }
            esenho.selection.clear();
        """),
        drawing("stencil", "Ferramentas · Estêncil com borracha", """
            esenho.tools.select_rect.stroke({space:p,points:[{x:-140,y:-100},{x:140,y:100}]});
            esenho.selection.fill("#458588");
            esenho.selection.clear();
            esenho.brush.set({size:16});
            for(let i=-2;i<=2;i++) {
              const points=Array.from({length:81},(_,j)=>({x:-160+j*4,y:i*34+10*Math.sin(j*.14),pressure:1}));
              esenho.tools.eraser.stroke({space:p,points});
            }
            esenho.tools.erase_rectangle.stroke({space:p.rotate(20),points:[{x:-20,y:-120},{x:20,y:120}]});
        """),
        drawing("smudge", "Ferramentas · Arrastar e mesclar pigmento", """
            esenho.brush.set({size:50});
            for(const [x,color] of [[-55,"#d65d0e"],[55,"#458588"]]) {
              esenho.color.set(color);
              esenho.brush.stroke({space:p,points:[{x,y:-90,pressure:1},{x,y:90,pressure:1}]});
            }
            esenho.brush.set({size:65,opacity:.8});
            esenho.tools.smudge.stroke({space:p,points:Array.from({length:61},(_,i)=>({x:-55+i*1.8,y:-35+Math.sin(i*.1)*20,pressure:.8}))});
            esenho.tools.blend.stroke({space:p,points:Array.from({length:61},(_,i)=>({x:-55+i*1.8,y:45+Math.sin(i*.1)*15,pressure:.7}))});
        """),
        drawing("bucket", "Ferramentas · Balde em contorno fechado", """
            esenho.brush.set({size:8});
            esenho.color.set("#282828");
            esenho.brush.stroke({space:p,points:[{x:-110,y:-85},{x:110,y:-85},{x:110,y:85},{x:-110,y:85},{x:-110,y:-85}]});
            esenho.color.set("#fabd2f");
            // Um único ponto representa o clique dentro do contorno.
            esenho.tools.fill.stroke({space:p,points:[{x:0,y:0}]});
        """),
        drawing("soft-selection", "Ferramentas · Seleção suave e recorte", """
            esenho.tools.select_ellipse.stroke({space:p,points:[{x:-120,y:-90},{x:120,y:90}]});
            esenho.selection.feather(16);
            esenho.selection.fill("#b16286");
            esenho.selection.clear();
            esenho.tools.erase_ellipse.stroke({space:p,points:[{x:-60,y:-45},{x:60,y:45}]});
        """),
        drawing("timed-wave", "Ferramentas · Onda com begin, move e end", """
            esenho.brush.set({size:15,color:"#d65d0e"});
            esenho.tools.begin({x:-140,y:0,pressure:.2},{tool:"brush",space:p});
            for(let i=1;i<=100;i++) {
              esenho.wait(8); // O tempo entre pontos pode alimentar dinâmicas.
              esenho.tools.move({x:-140+i*2.8,y:65*Math.sin(i*.12),pressure:.2+.8*i/100});
            }
            esenho.tools.end();
        """),
        drawing("eye-dropper", "Ferramentas · Amostrar cor e desenhar", """
            // Cria uma faixa de referência e amostra seu centro.
            esenho.brush.set({size:50,color:"#689d6a"});
            esenho.brush.stroke({space:p,points:[{x:-100,y:-55,pressure:1},{x:100,y:-55,pressure:1}]});
            esenho.color.set("#cc241d");
            esenho.tools.eyedropper.stroke({space:p,points:[{x:0,y:-55}]});
            esenho.brush.set({size:12});
            esenho.brush.stroke({space:p,points:[{x:-100,y:55},{x:0,y:0},{x:100,y:55}]});
            console.log("Cor amostrada:",esenho.document.state().color);
        """),
    )
}
