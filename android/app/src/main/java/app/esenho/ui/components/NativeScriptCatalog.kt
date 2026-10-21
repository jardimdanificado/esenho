package app.esenho.ui.components

import app.esenho.scripting.NativeScriptPreset

/** Runnable, editable examples. Operations that replace the document ask first. */
object NativeScriptCatalog {
    private fun example(id:String,name:String,source:String)=NativeScriptPreset("example:$id",name,source.trimIndent())
    val all = listOf(
        example("radial","Desenho · Traços radiais",NativeScriptExamples.radial),
        example("spiral","Desenho · Espiral e pressão",NativeScriptExamples.spiral),
        example("view","Câmera · Coordenadas da visualização",NativeScriptExamples.view),
        example("shapes","Desenho · Formas orientadas", """
            const pivot = esenho.pickPivot("Marque a origem das formas");
            esenho.color.set("#83a598");
            esenho.tools.rectangle.stroke({space:pivot.rotate(25),points:[{x:0,y:0},{x:140,y:60}]});
            esenho.color.set("#fabd2f");
            esenho.tools.ellipse.stroke({space:pivot.translate(180,0),points:[{x:-50,y:-30},{x:50,y:30}]});
        """),
        example("parametric","Desenho · Curva paramétrica", """
            const p = esenho.pickPivot("Centro da curva");
            const points = Array.from({length:1000},(_,i) => {
              const t = i * Math.PI * 2 / 999;
              return {x:150*Math.sin(3*t),y:100*Math.sin(4*t),pressure:.5+.5*Math.sin(t)**2};
            });
            esenho.brush.stroke({space:p,points});
        """),
        example("eraser","Ferramentas · Borracha e seleção", """
            const p = esenho.pickPivot("Origem da seleção");
            esenho.tools.select_ellipse.stroke({space:p,points:[{x:-70,y:-40},{x:70,y:40}]});
            esenho.selection.fill("#b8bb26");
            esenho.tools.eraser.stroke({space:p,points:[{x:-50,y:0},{x:50,y:0}]});
            esenho.selection.clear();
        """),
        example("groups","Camadas · Grupos e subgrupos", """
            const root = esenho.groups.create("Ilustração");
            const details = esenho.groups.create("Detalhes",root);
            const layer = esenho.layers.create("Luzes");
            esenho.groups.assign(layer,details);
            esenho.layers.set(layer,{opacity:.7,blendMode:"add"});
            esenho.ui.openPanel("layers");
            console.log(esenho.groups.list());
        """),
        example("layers","Camadas · Duplicar e espelhar", """
            const original = esenho.layers.active;
            const copy = esenho.layers.duplicate(original);
            esenho.layers.set(copy,{name:original.name+" — espelho",opacity:.5});
            esenho.layers.flipH(copy);
            esenho.layers.move(copy,1);
        """),
        example("curves","Curvas · Criar e vincular à pressão", """
            const curve = esenho.curves.list().find(c=>c.name==="Pressão suave JS") ?? esenho.curves.save({
              name:"Pressão suave JS",interpolation:"smooth",points:[[0,0],[.3,.1],[.7,.65],[1,1]]
            });
            const targets = esenho.curves.targets();
            const target = targets.find(t=>t.id===1) ?? targets[0];
            if (!target) throw Error("Selecione um pincel com suporte a curvas");
            esenho.curves.bind(target.id,curve,{input:"pressure",low:.1,high:1});
            console.log("Resposta em 0.5:",esenho.curves.evaluate(curve,.5));
            const p = esenho.pickPivot("Origem do teste de pressão");
            esenho.brush.stroke({space:p,points:Array.from({length:100},(_,i)=>({x:i*2,y:0,pressure:i/99}))});
        """),
        example("noise-curve","Curvas · Variação por distância", """
            const target = esenho.curves.targets().find(t=>t.id===1);
            if (!target) throw Error("Selecione um pincel compatível com curva de tamanho");
            const curve = esenho.curves.list().find(c=>c.name==="Onda JS") ?? esenho.curves.save({name:"Onda JS",interpolation:"smooth",points:[[0,.1],[.5,1],[1,.1]]});
            esenho.curves.bind(target.id,curve,{input:"distance",scale:100,repeat:true,low:0,high:1});
            console.log(esenho.curves.bindings());
        """),
        example("timed-stroke","Curvas · Traço com tempo controlado", """
            const p=esenho.pickPivot("Origem do traço");
            esenho.tools.begin({x:0,y:0,pressure:.5},{tool:"brush",space:p});
            for(let i=1;i<=50;i++) {
              esenho.wait(20);
              esenho.tools.move({x:i*3,y:Math.sin(i*.2)*20,pressure:i/50});
            }
            esenho.tools.end();
        """),
        example("brush","Pincel · Parâmetros e preset próprio", """
            console.log(esenho.brush.parameters());
            esenho.brush.set({size:24,opacity:.8,smoothing:15});
            esenho.brush.setParam(5,12); // espaçamento
            const options = esenho.ui.prompt({title:"Salvar pincel",fields:[{name:"name",label:"Nome",value:"Meu pincel JS"}]});
            if(options && options.name)console.log(esenho.brush.save(options.name));
        """),
        example("asset","Pincel · Criar ponta da seleção", """
            if(!esenho.selection.state().active)throw Error("Faça uma seleção antes de executar");
            const values = esenho.ui.prompt({title:"Ponta de pincel",fields:[{name:"name",value:"Ponta JS",label:"Nome"}]});
            if(values)console.log(esenho.brush.createAsset({name:values.name,kind:"tip",source:"selection"}));
        """),
        example("palette","Cor · Criar e usar paleta", """
            const palette = esenho.palettes.create("Paleta JS");
            for(const color of ["#282828","#fabd2f","#83a598","#b8bb26"])esenho.palettes.addColor(palette,color);
            esenho.palettes.select(palette);
            esenho.color.set("#83a598");
            esenho.ui.openPanel("color");
        """),
        example("filter","Filtros · Consultar catálogo e aplicar", """
            const filters = esenho.filters.list();
            console.log(filters);
            const filter = filters.find(f=>f.id.includes("grayscale"));
            if(filter)esenho.filters.apply(filter.id);
        """),
        example("selection-mask","Seleção · Máscara gradual", """
            const width=64,height=64;
            const data=Array.from({length:width*height},(_,i)=>Math.round(255*(i%width)/(width-1)));
            esenho.selection.setOperation("replace");
            esenho.selection.setMask({x:20,y:20,width,height,data});
            esenho.selection.fill("#d3869b");
            console.log(esenho.selection.state());
        """),
        example("guides","Guias · Régua e aderência", """
            const p=esenho.pickPoint("Início da régua");
            const q=esenho.pickPoint("Fim da régua");
            const id=esenho.guides.create({type:"line",paths:[[[p.x,p.y],[q.x,q.y]]]});
            esenho.assist.set({snap:true,snapAll:false,guides:[id],grid:true,gridStep:8});
            console.log(esenho.guides.list());
        """),
        example("symmetry","Assistência · Simetria radial", """
            esenho.assist.set({symmetry:"radial"});
            const p=esenho.pickPivot("Origem do traço");
            esenho.brush.stroke({space:p,points:[{x:0,y:0},{x:50,y:20},{x:100,y:-30}]});
            esenho.assist.set({symmetry:"off"});
        """),
        example("transform","Transformação · Girar em torno de pivot", """
            const p=esenho.pickPivot("Centro de rotação");
            if(esenho.transform.begin(esenho.selection.state().active)) {
              esenho.transform.rotate(30,p);
              esenho.transform.scale(.8,.8,p);
              esenho.transform.translate(20,0,p);
              esenho.transform.commit();
            }
        """),
        example("perspective","Transformação · Perspectiva", """
            if(esenho.transform.begin()) {
              esenho.transform.configure({mode:"perspective",interpolation:"bilinear"});
              const points=esenho.transform.corners();
              points[0].x+=30;
              points[1].x-=30;
              esenho.transform.corners(points);
              esenho.transform.commit();
            }
        """),
        example("animation","Animação · Gerar movimento", """
            const p=esenho.pickPivot("Origem da animação");
            esenho.layers.create("Movimento JS");
            esenho.animation.configure({fps:12,loop:true});
            for(let i=0;i<12;i++) {
              if(i>0)esenho.animation.addFrame();
              esenho.animation.setDuration(1);
              esenho.color.set("#fabd2f");
              esenho.tools.ellipse.stroke({space:p.translate(i*12,Math.sin(i/12*Math.PI*2)*30),points:[{x:0,y:0},{x:30,y:30}]});
            }
            esenho.animation.seek(0);
            esenho.animation.onion({enabled:true,previous:2,next:1,opacity:.25});
            esenho.animation.play();
        """),
        example("animation-edit","Animação · Duração e cels", """
            esenho.animation.pause();
            esenho.animation.duplicateFrame();
            esenho.animation.setDuration(3);
            esenho.animation.setCel({visible:true,opacity:.6});
            console.log(esenho.animation.state());
            esenho.ui.openPanel("animation");
        """),
        example("camera","Câmera · Navegar e restaurar", """
            const p=esenho.pickPoint("Ponto para centralizar");
            esenho.view.set({x:p.x,y:p.y,zoom:2,rotation:30});
            esenho.wait(1000);
            esenho.view.set({rotation:0}); // mantém zoom e centro
        """),
        example("pivots","Pivots · Criar, mover e renomear", """
            const name="referencia-"+Date.now();
            esenho.pivots.create({name,x:100,y:100,rotation:30,anchor:"document"});
            const renamed=name+"-movido";
            esenho.pivots.rename(name,renamed);
            esenho.pivots.update(renamed,{x:200,y:150});
            console.log(esenho.pivots.list());
            // esenho.pivots.remove(renamed);
        """),
        example("prompt","Interação · Formulário de parâmetros", """
            const options=esenho.ui.prompt({title:"Traços",fields:[
              {name:"count",label:"Quantidade",type:"number",value:6,min:1,max:30},
              {name:"color",label:"Cor",value:"#8ec07c"}
            ]});
            if(options) {
              const p=esenho.pickPivot("Origem");
              esenho.color.set(options.color);
              for(let i=0;i<options.count;i++)esenho.brush.stroke({space:p.translate(0,i*20),points:[{x:0,y:0},{x:100,y:0}]});
            }
        """),
        example("storage","JavaScript · Dados persistentes", """
            const count=esenho.storage.get("execucoes",0)+1;
            esenho.storage.set("execucoes",count);
            const colors=new Set(["#fabd2f","#83a598","#fabd2f"]);
            const table=new Map([...colors].map((c,i)=>[i,c]));
            const samples=new Float32Array([0,.25,.5,1]);
            console.log({count,colors:[...colors],table:[...table],samples:[...samples]});
            esenho.files.writeText("dados.json",JSON.stringify({count,colors:[...colors]},null,2));
            console.log(esenho.files.readText("dados.json"));
        """),
        example("project","Projeto · Salvar arquivo editável", """
            // Abre o seletor do Android; a execução espera a escolha.
            const file=esenho.files.pick({mode:"save",name:"desenho.esenho"});
            esenho.project.save(file);
            console.log("Projeto salvo:",file);
        """),
        example("import","Imagem · Importar da galeria", """
            const file=esenho.files.pick({mime:"image/*"});
            esenho.image.import(file,{newLayer:true});
            esenho.ui.openPanel("layers");
        """),
        example("export","Exportação · PNG", """
            esenho.export.image({format:"png"});
        """),
        example("export-animation","Exportação · GIF", """
            esenho.animation.pause();
            esenho.export.animation({format:"gif",fps:12,loop:true});
        """),
        example("document","Documento · Nova tela", """
            const options=esenho.ui.prompt({title:"Substituir o documento atual?",fields:[{name:"confirm",label:"Criar uma tela nova",type:"boolean",value:false}]});
            if(options?.confirm)esenho.document.create({width:800,height:600,background:"#ffffff"});
        """),
        example("ui","Interface · Painéis existentes", """
            esenho.ui.configure({quickShelfVisible:true,quickShelfRecent:true});
            esenho.ui.openPanel("brushes");
            console.log(esenho.help());
        """),
    )
}
