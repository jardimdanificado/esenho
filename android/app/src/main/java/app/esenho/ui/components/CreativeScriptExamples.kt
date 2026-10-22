package app.esenho.ui.components

import app.esenho.scripting.NativeScriptPreset

/** Complete editable programs: helpers are included in every exported source. */
object CreativeScriptExamples {
    private fun art(id: String, name: String, source: String): NativeScriptPreset {
        val setup = """
            // Marque o centro, longe das bordas. Arraste para orientar.
            // Composição de aproximadamente 320 × 320 px; documento preservado.
            const p=esenho.pickPivot("Origem de: $name");
            esenho.animation.pause();
            esenho.selection.clear();
            esenho.selection.setOperation("replace");
            esenho.assist.set({symmetry:"off",snap:false,grid:false});
            const layer=esenho.layers.create("$name");
            esenho.brush.select("preset:studio_inker");
            esenho.brush.reset();
            esenho.brush.set({size:3,opacity:1,hardness:100,smoothing:0});

            // Helpers locais: caminhos, polígonos preenchidos e elipses.
            const pointsOf=points=>points.map(v=>Array.isArray(v)?{x:v[0],y:v[1],pressure:v[2]??1}:v);
            function path(points,color,size=3,space=p) {
              esenho.brush.set({size,opacity:1,color});
              esenho.brush.stroke({space,points:pointsOf(points)});
            }
            function polygon(points,color,space=p) {
              esenho.color.set(color);
              const closed=pointsOf(points);
              esenho.tools.lasso_fill.stroke({space,points:[...closed,closed[0]]});
            }
            function oval(x,y,rx,ry,color,space=p) {
              esenho.color.set(color);
              esenho.tools.ellipse.stroke({space,points:[{x:x-rx,y:y-ry},{x:x+rx,y:y+ry}]});
            }
            let seed=2026;
            function rand() { seed=(1664525*seed+1013904223)>>>0; return seed/4294967296; }
        """.trimIndent()
        return NativeScriptPreset("example:creative-$id", name, setup + "\n\n" + source.trimIndent())
    }

    val all = listOf(
        art("jellyfish", "Natureza · Água-viva bioluminescente", """
            oval(0,-45,88,55,"#153f56");
            path(Array.from({length:81},(_,i)=>{const t=i/80*Math.PI;return [-88*Math.cos(t),-45-55*Math.sin(t)];}),"#83e3df",5);
            for(let j=0;j<9;j++) {
              const points=Array.from({length:91},(_,i)=>({x:(j-4)*16+Math.sin(i*.13+j)*12,y:-18+i*1.7,pressure:1-i/110}));
              path(points,j%2?"#7bc6ed":"#b7a2f4",3);
            }
        """),
        art("nautilus", "Natureza · Concha de náutilo", """
            const spiral=Array.from({length:501},(_,i)=>{const t=i/500*Math.PI*5,r=8*Math.exp(t*.17);return [r*Math.cos(t),r*Math.sin(t)];});
            path(spiral,"#a95838",5);
            for(let i=0;i<18;i++) {
              const t=i/17*Math.PI*5,r=8*Math.exp(t*.17);
              path([[r*Math.cos(t),r*Math.sin(t)],[r*.62*Math.cos(t-.35),r*.62*Math.sin(t-.35)]],"#d8a765",2);
            }
        """),
        art("feather", "Natureza · Pena em duas tonalidades", """
            path([[0,140],[0,-135]],"#504e66",4);
            for(let j=0;j<14;j++) {
              const y=-105+j*17,width=65*Math.sin((j+1)/16*Math.PI);
              for(const side of [-1,1]) {
                const points=Array.from({length:31},(_,i)=>{const t=i/30;return {x:side*width*t,y:y-32*t+12*t*t,pressure:1-t*.85};});
                path(points,side<0?"#458588":"#b16286",5);
              }
            }
        """),
        art("fern", "Natureza · Samambaia geométrica", """
            path([[0,140],[0,-140]],"#356b4c",4);
            for(let j=0;j<12;j++) {
              const y=110-j*21,length=88*Math.sin((j+1)/14*Math.PI);
              for(const side of [-1,1]) {
                polygon([[0,y],[side*length*.6,y-42],[side*length,y-28],[side*length*.55,y-8]],j%2?"#5e9b62":"#8bbd73");
              }
            }
        """),
        art("butterfly", "Natureza · Borboleta de vitral", """
            for(const side of [-1,1]) {
              polygon([[0,-35],[side*105,-125],[side*140,-70],[side*90,12],[0,12]],"#458588");
              polygon([[0,0],[side*100,20],[side*80,105],[side*25,80]],"#b16286");
              for(let j=0;j<4;j++)path([[0,-10],[side*(45+j*25),-95+j*16]],"#e6d4a8",3);
              oval(side*60,52,15,22,"#fabd2f");
            }
            oval(0,0,9,78,"#282838");
            path([[-20,-110],[0,-75],[20,-110]],"#282838",3);
        """),
        art("dragonfly", "Natureza · Libélula técnica", """
            for(const side of [-1,1])for(const row of [-1,1]) {
              const wing=p.translate(0,row*18).rotate(side*row*17);
              oval(side*72,0,70,20,"#c2ded5",wing);
              path([[0,0],[side*135,0]],"#458588",2,wing);
            }
            path([[0,-95],[0,110]],"#365b62",12);
            for(let i=0;i<8;i++)path([[-7,i*17-20],[7,i*17-20]],"#83a598",3);
            oval(0,-88,16,15,"#282838");
        """),
        art("dandelion", "Natureza · Dente-de-leão ao vento", """
            path([[0,140],[0,15],[10,-30]],"#689d6a",4);
            for(let i=0;i<20;i++) {
              const a=i/20*Math.PI*2,r=70+rand()*25;
              const x=10+Math.cos(a)*r,y=-35+Math.sin(a)*r;
              path([[10,-35],[x,y]],"#9b977f",1);
              path([[x-9,y-4],[x,y],[x+9,y-4]],"#e3cfa6",2);
            }
            path([[90,-85],[120,-110],[145,-105]],"#bdae93",2);
        """),
        art("koi", "Natureza · Carpa em curva", """
            const body=Array.from({length:81},(_,i)=>{const t=i/80*Math.PI*2;return [70*Math.sin(t),-15+105*Math.cos(t)];});
            polygon(body,"#eee1bf");
            oval(-20,-55,28,35,"#d65d0e");oval(26,12,32,28,"#d65d0e");
            polygon([[0,80],[-45,140],[0,122],[45,140]],"#e7b477");
            polygon([[-52,-5],[-100,35],[-57,40]],"#d79921");
            oval(-22,-88,5,5,"#282828");oval(22,-88,5,5,"#282828");
            path([[-12,-105],[0,-112],[12,-105]],"#8f5638",2);
        """),
        art("coral", "Natureza · Coral de ramos arredondados", """
            function grow(space,length,depth) {
              const points=Array.from({length:21},(_,i)=>[Math.sin(i/20*Math.PI)*length*.15,-i/20*length]);
              path(points,depth%2?"#d65d0e":"#d3869b",4+depth*4,space);
              if(depth>0)for(const angle of [-32,30])grow(space.translate(0,-length).rotate(angle),length*.65,depth-1);
            }
            grow(p.translate(0,135),90,3);
        """),
        art("circuit", "Arte · Circuito de uma cidade imaginária", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#183a39");
            for(let j=0;j<10;j++) {
              const y=-120+j*26,x=-100+rand()*75;
              path([[-140,y],[x,y],[x+30,y+22],[125,y+22]],j%2?"#8ec07c":"#d5b75e",3);
              oval(125,y+22,5,5,"#f2d98c");
            }
            polygon([[-32,-40],[32,-40],[32,40],[-32,40]],"#28352d");
            path([[-32,-40],[32,-40],[32,40],[-32,40],[-32,-40]],"#e7c675",3);
        """),
        art("constellation", "Arte · Cartografia de constelações", """
            const stars=Array.from({length:17},()=>[rand()*260-130,rand()*250-125]);
            for(let i=1;i<stars.length;i++) {
              let nearest=0,best=Infinity;
              for(let j=0;j<i;j++){const d=(stars[i][0]-stars[j][0])**2+(stars[i][1]-stars[j][1])**2;if(d<best){best=d;nearest=j;}}
              path([stars[i],stars[nearest]],"#60798a",1);
            }
            for(const [x,y] of stars)oval(x,y,2+rand()*3,2+rand()*3,"#d7bb83");
        """),
        art("neon-city", "Arte · Cidade neon na chuva", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#171e35");
            for(let i=0;i<7;i++) {
              const x=-140+i*40,top=-30-rand()*95;
              polygon([[x,top],[x+31,top],[x+31,105],[x,105]],i%2?"#293a58":"#3b2e52");
              path([[x+5,top+10],[x+5,85]],i%2?"#d3869b":"#83d5d5",3);
            }
            path([[-150,108],[150,108]],"#d3869b",4);
            esenho.filters.apply("rain_glass",38,30);
            esenho.filters.apply("anamorphic",45,145);
        """),
        art("desert", "Arte · Dunas ao pôr do sol", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#edbf85");
            oval(55,-75,37,37,"#c65c43");
            const colors=["#d59b65","#bd7952","#88533f"];
            for(let row=0;row<3;row++) {
              const ridge=Array.from({length:61},(_,i)=>[-150+i*5,-5+row*48+28*Math.sin(i*.065+row*1.7)]);
              polygon([...ridge,[150,150],[-150,150]],colors[row]);
            }
            esenho.filters.apply("film_grain",12,1);
        """),
        art("eclipse", "Arte · Eclipse com coroa solar", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#101a29");
            for(let i=0;i<20;i++) {
              const space=p.rotate(i*18),length=100+rand()*40;
              path([[68,0,.8],[length,0,.05]],"#d7a55a",7,space);
            }
            oval(0,0,80,80,"#f0d69b");oval(3,-2,72,72,"#101a29");
            esenho.filters.apply("halation",10,80);
        """),
        art("aurora", "Arte · Aurora sobre montanhas", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#172b3d");
            for(let ribbon=0;ribbon<7;ribbon++) {
              const points=Array.from({length:101},(_,i)=>({x:-150+i*3,y:-65+ribbon*11+35*Math.sin(i*.045+ribbon*.14),pressure:.1+.8*Math.sin(i/100*Math.PI)}));
              path(points,ribbon%2?"#72beaa":"#8a8dc2",9);
            }
            polygon([[-150,150],[-150,90],[-100,30],[-45,80],[20,20],[100,100],[150,60],[150,150]],"#1b2635");
        """),
        art("meteor", "Arte · Chuva de meteoros", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#192338");
            for(let i=0;i<12;i++) {
              const x=-100+rand()*200,y=-80+rand()*200;
              path([[x-45,y-70,.05],[x,y,1]],i%2?"#e4b777":"#83a9c8",4);
              oval(x,y,2,2,"#f4e4c1");
            }
            esenho.filters.apply("diffraction_star",20,170);
        """),
        art("kintsugi", "Arte · Cerâmica kintsugi", """
            oval(0,0,125,140,"#3c626e");
            const cracks=[[[0,-140],[-20,-65],[20,-5],[5,70],[40,133]],
              [[-20,-65],[-85,-35],[-120,15]],[[20,-5],[80,20],[120,60]],[[5,70],[-60,100]]];
            for(const crack of cracks)path(crack,"#d4ac58",5);
            path([[-80,-85],[-35,-110],[10,-115]],"#aec6bc",3);
        """),
        art("geode", "Arte · Geodo de ágata", """
            const colors=["#4d5369","#726288","#a380a7","#e1c9cb","#8a98b4","#d5e1db"];
            for(let ring=0;ring<12;ring++) {
              const radius=140-ring*9;
              const points=Array.from({length:121},(_,i)=>{const t=i/120*Math.PI*2,r=radius*(1+.07*Math.sin(7*t)+.05*Math.cos(3*t));return [r*Math.cos(t),r*Math.sin(t)*.87];});
              polygon(points,colors[ring%colors.length]);
            }
        """),
        art("cat", "Arte · Gato olhando a lua", """
            oval(65,-85,35,35,"#e3c891");
            oval(-15,65,50,75,"#30354b");
            oval(-15,-15,43,38,"#30354b");
            polygon([[-55,-30],[-52,-75],[-20,-47]],"#30354b");
            polygon([[0,-48],[28,-75],[25,-25]],"#30354b");
            path([[10,110],[80,110],[95,65],[75,45]],"#30354b",16);
            for(const side of [-1,1])path([[side*8-15,-10],[side*30-15,-15]],"#d7c48a",3);
        """),
        art("wave-crest", "Arte · Onda com espuma", """
            const wave=Array.from({length:101},(_,i)=>{const t=i/100*Math.PI*1.55;return [15+95*Math.cos(t),-30+90*Math.sin(t)];});
            polygon([[-150,135],...wave,[150,135]],"#3c7a8e");
            path(wave,"#d9e5d5",10);
            for(let j=0;j<6;j++)path(Array.from({length:61},(_,i)=>[-140+i*4.7,75+j*10+9*Math.sin(i*.08+j*.4)]),"#89b6bb",2);
            for(let i=0;i<12;i++){const t=i/12*2;oval(15+100*Math.cos(t),-30+95*Math.sin(t),3,5,"#e7eee0");}
        """),
        art("flower-life", "Geometria · Flor da vida", """
            function circle(x,y,r,color) {
              path(Array.from({length:97},(_,i)=>{const t=i/96*Math.PI*2;return [x+r*Math.cos(t),y+r*Math.sin(t)];}),color,2);
            }
            circle(0,0,62,"#b1844c");
            for(let i=0;i<6;i++){const a=i*Math.PI/3;circle(62*Math.cos(a),62*Math.sin(a),62,"#458588");}
            circle(0,0,127,"#b1844c");
        """),
        art("triangles", "Geometria · Mosaico triangular", """
            const colors=["#d79921","#458588","#b16286","#689d6a","#cc6b49"];
            for(let row=0;row<4;row++)for(let col=0;col<4;col++) {
              const x=-140+col*70,y=-140+row*70;
              polygon([[x,y],[x+70,y],[x,y+70]],colors[(row+col)%colors.length]);
              polygon([[x+70,y],[x+70,y+70],[x,y+70]],colors[(row+col+2)%colors.length]);
            }
        """),
        art("truchet", "Geometria · Labirinto de Truchet", """
            const size=60;
            for(let row=0;row<5;row++)for(let col=0;col<5;col++) {
              const tile=p.translate(-120+col*size,-120+row*size).rotate(rand()<.5?0:90);
              for(const corner of [-1,1]) {
                const points=Array.from({length:25},(_,i)=>{
                  const t=i/24*Math.PI/2;
                  return [corner*(size/2-size/2*Math.cos(t)),corner*(size/2-size/2*Math.sin(t))];
                });
                path(points,"#458588",6,tile);
              }
            }
        """),
        art("knots", "Geometria · Nó de três laços", """
            const points=Array.from({length:601},(_,i)=>{const t=i/600*Math.PI*2;return [(90+35*Math.cos(3*t))*Math.cos(2*t),(90+35*Math.cos(3*t))*Math.sin(2*t)];});
            path(points,"#354f60",15);
            path(points,"#d6b47c",8);
            // Um segundo contorno fino dá a impressão de fio duplo.
            path(points,"#efe0b5",2,p.translate(-2,-2));
        """),
        art("iso-city", "Geometria · Bairro isométrico", """
            function building(space,height,color) {
              polygon([[0,-height],[28,16-height],[0,32-height],[-28,16-height]],"#d8c49a",space);
              polygon([[-28,16-height],[0,32-height],[0,32],[-28,16]],color,space);
              polygon([[0,32-height],[28,16-height],[28,16],[0,32]],"#375c6c",space);
            }
            for(let row=0;row<3;row++)for(let col=0;col<3;col++) {
              building(p.translate((col-row)*55,(col+row)*28-20),35+rand()*70,(row+col)%2?"#b08469":"#6d9599");
            }
        """),
        art("orbit", "Geometria · Atlas de órbitas", """
            oval(0,0,15,15,"#d79921");
            for(let ring=0;ring<5;ring++) {
              const r=35+ring*24;
              path(Array.from({length:101},(_,i)=>{const t=i/100*Math.PI*2;return [Math.cos(t)*r,Math.sin(t)*r*.65];}),"#64838e",1,p.rotate(-20));
              const t=ring*1.7;
              oval(Math.cos(t)*r,Math.sin(t)*r*.65,5+ring,5+ring,["#b16286","#458588","#d65d0e"][ring%3],p.rotate(-20));
            }
        """),
        art("harmonograph", "Procedural · Harmonógrafo amortecido", """
            for(let pass=0;pass<3;pass++) {
              const points=Array.from({length:1801},(_,i)=>{
                const t=i/1800*45,d=Math.exp(-t*.018);
                return {x:(85*Math.sin(t*2.01)+45*Math.sin(t*3+pass*.2))*d,
                  y:(85*Math.sin(t*3.01+.7)+45*Math.sin(t*2))*d,pressure:.5};
              });
              path(points,["#458588","#b16286","#d79921"][pass],1.5);
            }
        """),
        art("flow", "Procedural · Campo de correntes", """
            for(let row=0;row<16;row++) {
              let x=-145,y=-130+row*17;const points=[];
              for(let step=0;step<120;step++) {
                points.push({x,y,pressure:.3+.5*Math.sin(step/120*Math.PI)});
                const angle=Math.sin(x*.022)*.7+Math.cos(y*.025)*.6;
                x+=Math.cos(angle)*2.3;y+=Math.sin(angle)*2.3;
              }
              path(points,row%2?"#458588":"#b1844c",2);
            }
        """),
        art("attractor", "Procedural · Atrator de Clifford", """
            let x=.1,y=.1;const points=[];
            for(let i=0;i<2400;i++) {
              const nx=Math.sin(-1.4*y)+.7*Math.cos(-1.4*x);
              const ny=Math.sin(1.6*x)+.9*Math.cos(1.6*y);x=nx;y=ny;
              if(i>100)points.push({x:x*70,y:y*70,pressure:.12});
            }
            // Um traço fino liga as visitas do atrator, como fios tensionados.
            path(points,"#7f65a0",1);
        """),
        art("radar", "Procedural · Radar de expedição", """
            polygon([[-150,-150],[150,-150],[150,150],[-150,150]],"#173a32");
            for(let ring=1;ring<=4;ring++)path(Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return [ring*32*Math.cos(a),ring*32*Math.sin(a)];}),"#52816a",1);
            for(let i=0;i<8;i++)path([[0,0],[128*Math.cos(i*Math.PI/4),128*Math.sin(i*Math.PI/4)]],"#52816a",1);
            polygon([[0,0],[125,-25],[90,-90]],"#31664f");
            for(let i=0;i<10;i++)oval(rand()*190-95,rand()*190-95,3,3,"#b8d987");
        """),
        art("stitch", "Ferramentas · Costura entre dois pontos", """
            const a=p.origin; // A origem marcada é o primeiro ponto.
            const b=esenho.pickPoint("Segundo ponto da costura");
            const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
            if(length<1)throw Error("Escolha pontos diferentes");
            const normal={x:-dy/length,y:dx/length};
            const count=Math.min(40,Math.max(2,Math.round(length/12)));
            for(let i=0;i<count;i++) {
              const t=(i+.5)/count,c={x:a.x+dx*t,y:a.y+dy*t};
              path([[c.x-normal.x*7,c.y-normal.y*7],[c.x+normal.x*7,c.y+normal.y*7]],"#b1844c",3,esenho.spaces.document);
            }
        """),
        art("inlay", "Ferramentas · Incrustação com seleção vazada", """
            esenho.tools.select_ellipse.stroke({space:p,points:[{x:-140,y:-140},{x:140,y:140}]});
            esenho.selection.setOperation("sub");
            esenho.tools.select_ellipse.stroke({space:p,points:[{x:-85,y:-85},{x:85,y:85}]});
            esenho.selection.fill("#d6b47c");
            for(let i=0;i<12;i++)path([[-170,-130+i*24],[170,-40+i*24]],"#458588",8);
            esenho.selection.clear();esenho.selection.setOperation("replace");
        """),
        art("sample-mosaic", "Ferramentas · Mosaico da imagem existente", """
            // Todas as cores são lidas antes de pintar, evitando realimentação.
            const samples=[];
            for(let row=0;row<10;row++)for(let col=0;col<10;col++) {
              const x=-135+col*30,y=-135+row*30;
              samples.push({x,y,color:esenho.color.sample(x,y,p)});
            }
            for(const cell of samples)oval(cell.x,cell.y,11,11,cell.color);
        """),
        art("heartbeat", "Animação · Pulso de coração", """
            esenho.animation.configure({fps:12,loop:true});
            for(let frame=0;frame<12;frame++) {
              if(frame>0)esenho.animation.addFrame();
              esenho.animation.setDuration(1);
              const size=5+Math.exp(-(((frame-3)/1.8)**2))*20;
              path(Array.from({length:81},(_,i)=>{const t=i/80*Math.PI*2;return [16*Math.sin(t)**3*6,-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*6];}),"#cc4b67",size);
            }
            esenho.animation.seek(0);esenho.animation.play();
        """),
        art("bloom-loop", "Animação · Flor respirando", """
            esenho.animation.configure({fps:10,loop:true});
            for(let frame=0;frame<8;frame++) {
              if(frame>0)esenho.animation.addFrame();
              esenho.animation.setDuration(1);
              const radius=75+20*Math.sin(frame/8*Math.PI*2);
              const points=Array.from({length:241},(_,i)=>{const t=i/240*Math.PI*2,r=radius+20*Math.cos(6*t);return [r*Math.cos(t),r*Math.sin(t)];});
              polygon(points,"#b16286");oval(0,0,22,22,"#fabd2f");
            }
            esenho.animation.seek(0);esenho.animation.play();
        """),
        art("spectral-mask", "Ferramentas · Selo espectral com máscara", """
            const width=96,height=96,data=Array.from({length:width*height},(_,i)=>{
              const x=(i%width-47.5)/47.5,y=(Math.floor(i/width)-47.5)/47.5;
              return Math.round(Math.max(0,1-Math.hypot(x,y))*255);
            });
            const origin=p.origin;
            // setMask usa pixels globais do documento, sem rotação do pivot.
            esenho.selection.setMask({x:Math.round(origin.x)-48,y:Math.round(origin.y)-48,width,height,data});
            esenho.selection.fill("#a06ab8");esenho.selection.clear();
            esenho.filters.apply("iridescence",70,45);
        """),
        art("custom-rosette", "Interação · Roseta com formulário", """
            const settings=esenho.ui.prompt({title:"Desenhar roseta",fields:[
              {name:"petals",label:"Pétalas",type:"number",value:9,min:3,max:24},
              {name:"color",label:"Cor",type:"text",value:"#458588"}
            ]});
            if(settings) {
              const count=Math.max(3,Math.min(24,Math.round(settings.petals)));
              const points=Array.from({length:721},(_,i)=>{const t=i/720*Math.PI*2,r=70+45*Math.cos(count*t);return [r*Math.cos(t),r*Math.sin(t)];});
              path(points,settings.color,4);
              console.log("Roseta criada com",count,"pétalas");
            }
        """),
    )
}
