# Scripting nativo do Android

Toque no botão **Scripts JavaScript** (ícone de código) da barra inferior.
O editor abre no dock redimensionável, mantendo o canvas visível, e guarda o
rascunho automaticamente. O dropdown reúne os exemplos de desenhos e ferramentas
com os presets pessoais salvos no aparelho e permite buscar pelo nome. Selecione um preset para abri-lo;
um asterisco indica alterações ainda não salvas.

Use o botão **Salvar preset** para guardar o código com um nome. Ao abrir um
preset pessoal, **Salvar** o atualiza e **Salvar cópia** cria outro preset.
**Novo script**, no dropdown, começa um rascunho vazio. O menu de ações permite
abrir e exportar arquivos `.js`, marcar pivots na arte ou na tela e limpar pivots.

O interpretador é QuickJS 2026-06-04, compilado pelo NDK e incluído no APK.
Não há WebView, dependência da internet ou carregamento do scripting do browser.
Cada execução recebe uma VM nova. As APIs padrão de JavaScript, como Math, JSON,
Array, Map, Set e typed arrays, estão disponíveis. APIs de browser e Node,
incluindo DOM, Canvas, fetch, require e módulos de arquivos, não são fornecidas.

## Primeiro desenho: execute este script

Na aba **Código**, abra o dropdown e busque um exemplo pelo nome. Toque em
**Executar**, depois marque a origem no canvas; arrastar também define a
orientação. Edite os números e execute de novo para comparar o resultado.

Este exemplo é completo e cria uma camada própria:

```js
const p = esenho.pickPivot("Marque o centro da flor");
esenho.selection.clear();
esenho.layers.create("Minha primeira flor JS");
esenho.brush.select("preset:studio_inker");
esenho.brush.set({size:4,opacity:1,color:"#458588",smoothing:0});
for (let i=0;i<8;i++) {
  esenho.brush.stroke({
    space:p.rotate(i*45),
    points:[{x:12,y:0,pressure:.2},{x:70,y:0,pressure:1},{x:110,y:0,pressure:.1}]
  });
}
```

A aba **API** permite escolher um assunto ou buscar comandos. Os exemplos de
código têm botão **Copiar**; volte a **Código** para colar e executar. O código
pode rolar horizontalmente. Tabelas aparecem como fichas com os nomes dos campos,
para caberem no dock. A busca mantém o assunto inteiro, incluindo explicações e
código, para preservar o contexto.

## Execução

As operações são sequenciais. `pickPivot()` e `pickPoint()` esperam o touch;
as ferramentas terminam a operação antes de retornar. Não é preciso `await`.
O JS roda numa thread própria; comandos do editor são encaminhados à thread
da interface. O canvas e os controles do editor ficam reservados à execução.
Use **Parar** ou Voltar para cancelar. Sair do app também pede cancelamento.

O histórico mantém as operações individuais do motor: cada traço e alteração
que normalmente gera histórico pode ser desfeito. A execução inteira ainda
não é uma transação única. Cancelar desfaz um traço ainda em andamento e uma
transformação não confirmada; operações já concluídas permanecem no documento.
Configurações de pincel e cor feitas pelo script permanecem após a execução.

Há limite de 64 MiB para a VM, 30 segundos de CPU da thread JS (a espera por
touch não consome esse orçamento), 50 mil pontos por traço e 1 MiB para importar
um script. Operações nativas individuais terminam antes de atender um cancelamento.
Erros mostram mensagem e localização; `console.log()` e `print()` aparecem no editor.

## Coordenadas e pivots

Todas as coordenadas usam X para a direita, Y para baixo. Ângulos são graus,
positivos no sentido horário. A origem da tela é o canto superior esquerdo do
canvas visível, sem incluir barras e painéis.

| Referência | Unidade e comportamento |
| --- | --- |
| `esenho.spaces.document` | Pixels do documento; independe da navegação |
| `esenho.spaces.screen` | Pixels da tela; usa a visualização no início do traço |
| `esenho.spaces.view.snapshot()` | Congela a visualização atual, com unidades em pixels da tela |
| `esenho.spaces.view.snapshot({units: "document"})` | Congela a origem e orientação visíveis, com unidades em pixels do documento |
| Pivot com `anchor: "document"` | Origem e orientação presas à arte; unidades em pixels do documento |
| Pivot com `anchor: "screen"` | Origem e orientação presas à tela; unidades em pixels da tela |

O espaço é capturado no início de cada traço. Transformações do espaço mudam
o caminho e a geometria das formas; tamanho do pincel continua sendo uma
configuração em pixels do documento. Para escalá-lo, ajuste `brush.set({size})`.

Use `pickPivot()` para obter uma referência temporária durante o script:

```js
const centro = esenho.pickPivot({
  name: "centro",
  anchor: "document",
  message: "Toque e arraste para orientar"
});

esenho.brush.stroke({
  space: centro.rotate(45),
  points: [
    {x: 0, y: 0, pressure: 0.2},
    {x: 80, y: 0, pressure: 1},
    {x: 160, y: 30, pressure: 0.2}
  ]
});
```

Tocar define a posição; arrastar define a direção do eixo X. Um toque sem arraste
usa a direção horizontal da visualização. `pickPivot()` e `pivots.pick()` retornam
referências temporárias: não criam marcadores na tela nem entradas na aba Pivots.
Informar `name` apenas dá um nome à referência retornada; não a torna permanente
e não substitui um pivot existente. A variável pode ser usada ao longo da execução.

Para criar pivots permanentes, use **Novo na arte** / **Novo na tela** na aba
Pivots, **Marcar pivot** no menu de ações, ou `esenho.pivots.create()`. Somente
esses pivots aparecem em `pivots.list()` e podem ser obtidos por `pivots.get()`.
Recebem nomes como `pivot1` quando criados pela interface sem nome informado e
continuam disponíveis entre execuções enquanto o canvas existir. Não são salvos
no projeto ou após recriar a Activity.

```js
// Primeiro crie "centro" pela aba Pivots ou por pivots.create().
const centro = esenho.pivots.get("centro");
const ponto = esenho.pickPoint("Marque a direção"); // {x,y} no documento
const referencia = centro.orientTowards(ponto);
const deslocado = referencia.translate(20, 0).rotate(30).scale(2);
console.log(deslocado.origin); // {x,y} no documento
const congelado = deslocado.snapshot(); // fixa o espaço no documento
```

`rotate`, `translate`, `scale` e `orientTowards` retornam novas referências.
`pivots.list()`, `remove(nome)` e `clear()` consultam e removem marcadores.
Uma referência obtida antes de remover um marcador continua sendo válida.

## Ferramentas

`esenho.tools.list()` retorna os identificadores. `tools.select(nome)` escolhe a
ferramenta e `tools.stroke({space, points})` executa a ferramenta selecionada.
Cada ponto tem `x`, `y`, `pressure` (0–1), `tiltX` e `tiltY` (graus, −90 a 90).
Pressão padrão: 0,85. O motor aplica suas regras normais de suavização e pressão.

Também é possível executar uma ferramenta temporariamente sem mudar a seleção:

```js
const centro = esenho.pickPivot("Origem das formas");
esenho.layers.create("Formas JS");
esenho.color.set("#458588");
esenho.tools.rectangle.stroke({
  space: centro.rotate(30),
  points: [{x: 0, y: 0}, {x: 100, y: 50}]
});
```

Disponíveis: `esenho.brush.stroke()` e `esenho.tools.<nome>.stroke()` para
`eraser`, `smudge`, `blend`, `line`, `rectangle`, `ellipse`, `fill`, `lasso_fill`,
`select_rect`, `select_lasso`, `select_ellipse`, `select_brush_mask`, `select_wand`,
`eyedropper`, `erase_rectangle` e `erase_ellipse`.
Formas usam o primeiro e o último ponto como cantos de uma caixa local e
acompanham a transformação completa da referência. Seleções de elipse orientadas
são aproximadas por um polígono de 360 pontos. Pan e transformação usam as APIs
`view` e `transform`, em vez de um traço sintético.

## Outras operações

| API | Operações |
| --- | --- |
| `document.state()` | Dimensões, ferramenta, cor ARGB, pincel, camada ativa, seleção e histórico |
| `brush` | `set({size, opacity, color, hardness, smoothing})`, `presets()`, `select(id)`, `setParam(id, value)` |
| `layers` | `list()`, `active`, `create(nome)`, `select(camada)`, `duplicate(camada)`, `remove(camada)`, `clear()`, `set(camada, opções)` |
| `selection` | `all()`, `clear()`, `invert()`, `feather(raio)`, `fill(cor)`, `erase()`, `copy()`, `cut()`, `paste()`, `setOperation(nome)` |
| `filters` | `list()` com parâmetros e limites; `apply(id, p1, p2)` |
| `animation` | `state()`, `addFrame()`, `duplicateFrame()`, `removeFrame()`, `selectFrame(índice)`, `setDuration(ticks)` |
| `transform` | `begin(selectionOnly)`, `rotate(graus, pivot?)`, `translate(x, y, espaço?)`, `scale(x, y, pivot?)`, `flipH()`, `flipV()`, `center()`, `fit()`, `reset()`, `commit()`, `cancel()` |
| `view` | `state()`, `reset()`, `set({zoom, rotation, x, y})` |
| `ui` | `openPanel(nome)`, `closePanel()`, `showExportDialog()` |
| Histórico | `esenho.undo()`, `esenho.redo()` |

Camadas são retornadas como objetos com `id` e aceitas por objeto ou ID.
`layers.set()` aceita `name`, `opacity` (0–1), `visible`, `alphaLock`, `clipping`
e `blendMode` (`normal`, `multiply`, `screen`, `overlay`, `dodge`, `add`).
IDs identificam os slots do motor e deixam de ser válidos após remover a camada;
não reutilize uma referência removida.
As operações de seleção são `replace`, `add`, `sub`, `intersect`.
Cores aceitam `#RRGGBB`, `#AARRGGBB` ou números ARGB.

`view.set()` define valores absolutos e preserva campos omitidos. O ponto do
documento `(x,y)` fica centralizado na área visível.
`ui.openPanel()` aceita `brushes`, `color`, `layers`, `animation`, `effects`,
`selection`, `transform` e `scripts`. Abrir um painel ou diálogo solicita sua exibição;
isso não espera o fechamento. A API opera os componentes existentes.

Confirme ou cancele uma transformação antes de editar outro recurso. Ao terminar
o script, uma transformação ainda não confirmada é cancelada.
Rotação e escala usam o centro do conteúdo por padrão ou a origem do pivot
informado; os eixos da escala são os do documento. Deslocamentos podem usar os
eixos e unidades de qualquer referência.

## Exemplos de desenhos e ferramentas

O dropdown de scripts tem busca por nome. Os 20 exemplos novos abaixo são
completos: pedem uma origem por touch, criam uma camada, selecionam Studio Inker
e definem tamanho, opacidade e suavização. Não substituem o documento. A paisagem
cria um grupo com camadas adicionais. A maioria ocupa cerca de 320 × 260 pixels:
marque a origem longe das bordas. Girar a referência gira todo o desenho.

| Exemplo no dropdown | O que demonstra |
| --- | --- |
| Desenho · Mandala de pétalas | Repetição radial, pressão e elipse |
| Desenho · Rosácea matemática | Curva polar em um único traço |
| Desenho · Espirógrafo de duas cores | Parametrização e rotação de referência |
| Desenho · Árvore recursiva | Recursão limitada, galhos relativos e espessura |
| Desenho · Paisagem em camadas | Laço preenchido, grupos e profundidade |
| Desenho · Linhas topográficas | Contornos fechados e funções trigonométricas |
| Desenho · Mar com ondas | Fileiras de traços com pressão variável |
| Desenho · Fitas de Bézier | Curva cúbica, cores e espessura pela pressão |
| Desenho · Cubo isométrico | Polígonos preenchidos com cores por face |
| Desenho · Engrenagem recortada | Polígono procedural e apagar elipse |
| Desenho · Flor com laço preenchido | Pétalas rotacionadas e seleção preenchida |
| Desenho · Azulejos rotacionados | Grade, deslocamentos locais e formas |
| Ferramentas · Pressão, tamanho e opacidade | Comparação de cinco traços com parâmetros diferentes |
| Ferramentas · Folha com seleção por laço | Pintura e nervuras limitadas pela seleção |
| Ferramentas · Estêncil com borracha | Traços apagados e retângulo de apagar orientado |
| Ferramentas · Arrastar e mesclar pigmento | Uso de smudge e blend sobre duas cores |
| Ferramentas · Balde em contorno fechado | Contorno de pincel e preenchimento por um clique |
| Ferramentas · Seleção suave e recorte | Feather e recorte transparente |
| Ferramentas · Onda com begin, move e end | Controle explícito do traço e do tempo entre pontos |
| Ferramentas · Amostrar cor e desenhar | Conta-gotas e reutilização da cor amostrada |

Os exemplos limpam a seleção anterior e desativam simetria, snap e grade para
que essas configurações não alterem a demonstração. Esses ajustes, a cor e o
pincel permanecem depois da execução; você pode mudá-los normalmente no editor.
Cada operação usa o histórico existente. Use **Parar** para interromper a geração.

### Como adaptar um exemplo

- Mude os valores de tamanho e opacidade em `brush.set()`.
- Troque as cores hexadecimais em `color.set()`.
- Modifique o número de repetições nos laços `for`.
- Use `p.rotate(graus)` e `p.translate(x,y)` para orientar e posicionar elementos.
- Para aumentar as coordenadas do desenho, use `space:p.scale(1.5)` nos traços.
  A escala da referência não aumenta o diâmetro do pincel; ajuste `size` também.
- Uma ferramenta `line` usa os extremos do gesto. Para uma polilinha com curvas
  ou cantos intermediários, use `brush.stroke()`.
- `rectangle` e `ellipse` criam formas preenchidas. Para contornos, desenhe um
  caminho fechado com `brush.stroke()`; o exemplo do balde mostra como fazer.

## Implementação

- `scripting/NativeScriptRuntime.kt`: worker, espera cancelável e ciclo de vida.
- `scripting/NativeScriptApi.kt`: comandos públicos e ponte ao motor.
- `scripting/ScriptCanvasInteraction.kt`: referências afins, touch e marcadores.
- `res/raw/esenho_script_api.js`: API JS criada para o app Android.
- `cpp/esenho_script_jni.c`: runtime QuickJS, ponte UTF-8 e limites de execução.
- `cpp/vendor/quickjs`: fontes oficiais e licença MIT.

## API 2: editor completo

O dock tem abas **Código**, **API** (esta documentação, com busca) e **Pivots**.
O código recebe destaque de sintaxe sem alterar o texto ou as posições do cursor.
O dropdown inclui exemplos de desenho, camadas, grupos, curvas, seleção, guias,
transformações, câmera, animação, arquivos, exportação e JavaScript padrão.
Nos **Parâmetros rápidos → Scripts**, execute qualquer preset pessoal salvo.

### Documentos, projetos e arquivos

```js
esenho.document.create({width: 800, height: 600, background: "#ffffff"});
esenho.document.resize(1024, 768, true); // terceiro argumento: reamostrar
esenho.document.cropToSelection();
esenho.document.clear();
esenho.document.flipH();
esenho.document.flipV();
```

Criar ou abrir um documento substitui o atual e limpa os pivots. Salve antes o
trabalho que quiser manter. O tamanho máximo aceito pela API é 16384 por eixo,
até 64 milhões de pixels, sujeito à memória disponível no aparelho.

`files.pick({mode: "open", mime: "image/*"})` abre o seletor do Android.
`files.pick({mode: "save", name: "arquivo.esenho"})` escolhe um destino.
A chamada espera o seletor e retorna uma URI; cancelar lança um erro de script.
Não é necessário await, e o seletor não cancela a sessão ao cobrir o aplicativo.

```js
const file = esenho.files.pick({mode: "save", name: "projeto.esenho"});
esenho.project.save(file);
// esenho.project.open(file);
// esenho.image.import(arquivoDeImagem, {newLayer: true});
```

`project.save()` e `project.open()` também abrem o seletor quando o caminho é
omitido. `image.import()` faz o mesmo para uma imagem. A importação conserva a
proporção, reduz quando necessário e centraliza a imagem, como na interface.

Caminhos relativos ficam na pasta privada `script-files` do app. Eles não são
caminhos arbitrários do sistema. URIs `content://` vêm do seletor do Android.
`files.writeText(path, texto)`, `readText(path)`, `list(pasta)` e `remove(path)`
manipulam arquivos; a leitura de texto aceita até 4 milhões de caracteres.
Remoção aceita arquivos individuais, sem remoção recursiva de pastas.

```js
esenho.files.writeText("config.json", JSON.stringify({copies: 8}));
console.log(JSON.parse(esenho.files.readText("config.json")));
console.log(esenho.files.list());
esenho.export.image({format: "png"}); // solicita o destino
// Outros formatos: jpeg e webp; quality de 0 a 100.
// esenho.export.animation({format: "gif", fps: 12, loop: true});
// esenho.export.animation({format: "webm", path: destino});
```

Exportações aceitam `path` para usar um destino já escolhido ou um arquivo
privado. Codificação de imagens, GIF/WebM, escrita de projetos e operações de
texto rodam na thread do script, depois de capturar o documento na thread da
interface. A exportação de animação precisa de memória para os frames compostos
na resolução do documento e recusa uma captura que exceda metade da memória
livre estimada. Cancelar não interrompe uma gravação já iniciada no meio do arquivo.

### Grupos e organização de camadas

```js
const root = esenho.groups.create("Ilustração");
const child = esenho.groups.create("Luzes", root);
const layer = esenho.layers.create("Brilhos");
esenho.groups.assign(layer, child);
esenho.groups.set(child, {name: "Detalhes", visible: true, collapsed: false});
esenho.groups.set(child, {parentId: null}); // mover para a raiz
esenho.groups.move(child, 1); // mover na ordem de grupos irmãos
console.log(esenho.groups.list());
```

Grupos são estruturas de organização e visibilidade, não grupos de composição
isolada com um modo de mesclagem próprio. `groups.remove(grupo)` desagrupa,
preservando as camadas e promovendo os subgrupos. `groups.assign(camada, null)`
retira uma camada de seu grupo. IDs podem ser passados como strings ou objetos
retornados pela API. O gerenciador permite criar, recolher, renomear, ocultar,
aninhar, reordenar e desagrupar, além de mover cada camada pelo menu.
As alterações de grupos participam do histórico de desfazer/refazer e são salvas
no projeto editável.

`layers.move(camada, delta)` usa a mesma direção do arraste na lista: delta
positivo desce; negativo sobe. Há também `mergeDown(camada)`, `flipH(camada)` e
`flipV(camada)`. A ordem é compartilhada com a composição do documento.

### Parâmetros, presets e curvas de pincel

```js
console.log(esenho.brush.state());
console.log(esenho.brush.parameters());
esenho.brush.setParam(1, 24); // tamanho
console.log(esenho.brush.getParam(1));
esenho.brush.shape("circle");
esenho.brush.texture("none");
const saved = esenho.brush.save("Meu pincel", "Personalizado");
esenho.brush.select(saved);
// esenho.brush.remove(saved); // somente presets pessoais
// esenho.brush.reset();
```

`brush.parameters()` descreve ID, nome, tipo, limites, valor e escolhas para o
pincel selecionado, incluindo parâmetros procedurais e de realismo. `setParam`
usa esses mesmos controles da interface: números para sliders/interruptores e
chaves de opção para escolhas. Use os IDs retornados, pois parâmetros de um
pincel procedural pertencem àquele pincel. `brush.pressure({curve, min, max})`
configura a resposta de pressão com limites em porcentagem.

`brush.createAsset({name, kind: "tip" | "grain", source: "selection" | "layer"})`
cria uma ponta ou textura a partir da seleção ou camada ativa.

```js
const curve = esenho.curves.save({
  name: "Minha pressão", interpolation: "smooth",
  points: [[0,0], [.4,.2], [1,1]]
});
console.log(esenho.curves.targets());
esenho.curves.bind(1, curve, {input: "pressure", low: .1, high: 1});
console.log(esenho.curves.evaluate(curve, .5));
console.log(esenho.curves.bindings());
```

`curves.list()` consulta curvas salvas e de fábrica. `save({id, name, points,
interpolation})` atualiza uma curva pessoal pelo ID; sem ID, cria outra. Nomes
precisam ser únicos. São aceitos 2–256 pontos normalizados entre 0 e 1, com X
estritamente crescente. Interpolação: `smooth`, `linear` ou `steps`.
Curvas de fábrica podem ser consultadas e usadas, mas precisam ser copiadas com
outro ID para edição.

`curves.targets()` lista somente alvos suportados pelo pincel atual.
`curves.bind(parameterId, curva, opções)` aceita `input`, `scale`, `repeat`, `low`,
`high` e `enabled`. Entradas: `pressure`, `speed`, `distance`, `time`, `tilt`,
`direction`, `noise`. `scale` controla a escala da entrada; `repeat` repete a
fase de distância/tempo. `low` e `high` são frações normalizadas da faixa do alvo.
`curves.unbind(parameterId)` retira um vínculo; `curves.reset()` restaura os
vínculos padrão do pincel; `curves.remove(curva)` exclui uma curva pessoal e
remove seus vínculos.

Para o motor dinâmico, `brush.dynamicSettings()` e `brush.dynamicInputs()`
descrevem os índices. `brush.dynamicBase(setting, value)` altera a base; omitir
value consulta. `brush.dynamicCurve(setting, input, points)` aceita 2–16 pares
numéricos finitos; null remove a curva daquele sensor. Esse é o mecanismo de
sensores do motor dinâmico, separado da biblioteca de curvas salvas da interface.

### Traços com tempo controlado

`tools.stroke()` executa um caminho de uma vez. Para controlar tempo entre
amostras e testar curvas de velocidade/tempo, use início, movimentos e término:

```js
const p = esenho.pickPivot("Origem");
esenho.tools.begin({x:0,y:0,pressure:.2}, {space:p, tool:"brush"});
for (let i=1; i<=20; i++) {
  esenho.wait(30);
  esenho.tools.move({x:i*5,y:0,pressure:i/20});
}
esenho.tools.end(); // usa o último ponto se nenhum for informado
```

`tools.cancel()` desfaz o traço em andamento. Termine/cancele um traço antes de
alterar outros recursos do editor. Erros ou cancelamento da sessão também
cancelam um traço incompleto. `wait(ms)` libera a interface, é cancelável e não
consome o limite de CPU do interpretador.

### Paletas, seleção, guias e pintura

`palettes.list()`, `create(name)`, `select(paleta)`, `remove(paleta)`,
`addColor(paleta, cor)` e `removeColor(paleta, índice)` operam paletas.
`color.set(cor)` escolhe a cor; `color.sample(x,y,espaço?)` usa o conta-gotas e
retorna ARGB numérico, alterando a cor atual como a ferramenta.
`color.adjust({hue, saturation, value})` ajusta a camada ativa; valores são
deltas, com saturação e luminosidade em porcentagem.

`selection.state()` retorna operação, limites, presença de máscara e estado.
`selection.configure({tolerance, contiguous})` configura a varinha.
`selection.mask()` retorna `{x,y,width,height,data}`; cada item de data é alfa de
0–255. Uma seleção retangular sem máscara retorna data vazio, e seus limites
definem a área selecionada. `selection.setMask()` aceita essa estrutura e usa a
operação atual. A transferência de máscaras é limitada a um milhão de pixels.

```js
const p = esenho.pickPoint("Início da guia");
const q = esenho.pickPoint("Fim da guia");
const id = esenho.guides.create({type:"line", paths:[[[p.x,p.y],[q.x,q.y]]]});
esenho.assist.set({snap:true, snapAll:false, guides:[id], grid:true, gridStep:8});
```

`guides.list()`, `remove(id)` e `clear()` gerenciam guias. `create()` recebe
caminhos de pontos no documento; type pode ser `line`, `curve`, `ellipse` ou
`sphere`, e os caminhos descrevem a geometria que será exibida.
`assist.state()` consulta a configuração e `assist.set()` aceita `symmetry`
(`off`, `mirror_x`, `mirror_y`, `quad`, `radial`), `grid`, `gridStep`, `snap`,
`snapAll` e `guides` (índices das guias).
`paint.dry()` seca a água; `paint.diffuse(steps)` executa difusão, de 1 a 100 passos.

### Transformação e câmera

Além de escala, rotação e deslocamento, `transform.configure({mode,
interpolation, lockAspect})` escolhe `scale`, `skew`, `distort` ou `perspective`,
e interpolação `nearest` ou `bilinear`. `transform.corners()` consulta os quatro
cantos. `transform.corners([{x,y},...], espaço?)` altera os quatro pontos, na
ordem superior esquerdo, superior direito, inferior direito, inferior esquerdo.
Chame `commit()` para aplicar ou `cancel()` para restaurar o conteúdo.

`view.state()` também retorna centro `x/y` em coordenadas do documento, `zoom`
e `rotation` em graus. Na API 2, `view.set()` preserva os campos omitidos:
`view.set({rotation:30})` gira mantendo centro e zoom. `view.reset()` enquadra
novamente a arte.

### Animação

```js
esenho.animation.configure({fps:12, loop:true});
esenho.animation.selectFrame(0);
esenho.animation.setDuration(3);
esenho.animation.setCel({visible:true, opacity:.75});
esenho.animation.onion({enabled:true, previous:2, next:1, opacity:.3,
  previousTint:"#ff3c3c", nextTint:"#3c8cff"});
esenho.animation.play();
esenho.wait(1000);
esenho.animation.pause();
```

`animation.state()` retorna frame e quantidade da camada ativa, FPS, tick
atual, total de ticks, reprodução, repetição e tracks. Cada track contém layerId,
frame ativo e a lista de cels com ID, índice, duração, visibilidade e opacidade.
Selecione outra camada para editar sua track. Os índices começam em zero.

`addFrame()`, `duplicateFrame()`, `removeFrame()`, `selectFrame(index)`,
`setDuration(ticks)`, `moveFrame(from,to)`, `clearFrame()` e `setCel(opções)`
editam a track ativa. `seek(tick)` navega pelo tempo global, incluindo exposições
de duração variável. `stop()` pausa e retorna ao tick zero; `pause()` conserva
posição. `configure()` define FPS de 1–60 e repetição. `onion()` consulta e altera
onion skin. A reprodução funciona com qualquer dock aberto, inclusive após
terminar o script. Desenhar interrompe a reprodução.

### Pivots individuais

A aba Pivots permite renomear, editar X/Y/rotação, reposicionar por touch e apagar
cada referência individualmente. O tipo exibido informa se está fixa na arte
ou na tela. O reposicionamento mantém esse tipo.

```js
const p = esenho.pivots.create({name:"origem", x:100,y:80,rotation:20,anchor:"document"});
const moved = esenho.pivots.update("origem", {x:200,y:150});
esenho.pivots.rename("origem", "centro");
// esenho.pivots.remove("centro");
```

`create()` exige um nome livre. `update(name, opções)` aceita `newName`, `x`, `y`,
`rotation` e `anchor` (`document`/`screen`). Ao mudar anchor, a posição visual é
preservada antes de aplicar X/Y opcionais nas novas unidades. Essas chamadas
retornam uma referência nova; variáveis antigas mantêm os valores anteriores.

### Formulários, preferências e dados dos scripts

```js
const values = esenho.ui.prompt({title:"Minha ferramenta",fields:[
  {name:"count",label:"Quantidade",type:"number",value:6,min:1,max:30},
  {name:"color",label:"Cor",type:"text",value:"#fabd2f"},
  {name:"enabled",label:"Ativar",type:"boolean",value:true}
]});
if (values) console.log(values);
```

O formulário espera o usuário e retorna valores ou null no cancelamento.
`ui.configure({quickShelfVisible,quickShelfRecent,quickParameters})` controla
recursos existentes da interface. `preferences.get()` retorna favoritos,
paleta ativa e parâmetros rápidos; `preferences.set({favoriteBrushes,
activePalette,quickParameters})` atualiza essas configurações. quickParameters
aceita IDs dos parâmetros do pincel atual, na ordem desejada; favoritos usam
IDs com prefixo `preset:` ou `brush:`.

`storage.set(key, valorJSON)`, `get(key, padrão)` e `remove(key)` guardam dados
entre execuções e reinicializações. `scripts.list()` consulta exemplos e presets
pessoais; `scripts.save({id?,name,source})` cria/atualiza um preset pessoal e
`scripts.remove(preset)` remove um preset pessoal. Exemplos de fábrica são
somente leitura. `esenho.help()` lista os membros públicos por namespace.

## Filtros: cor, detalhe, desenho e distorção

O painel Filtros possui 97 efeitos e busca por nome ou ID. Todos também estão
em `esenho.filters.list()`, com `id`, `name` e `params`. Cada parâmetro informa
`min`, `max`, `default`, `unit` e `value`. `apply(id)` usa os padrões do catálogo;
`apply(id, p1, p2)` permite valores explícitos, inclusive zero.

Os 36 novos IDs são:

- Cor: `exposure`, `gamma`, `saturation`, `vibrance`, `temperature`, `tint`,
  `shadows`, `highlights`, `black_point`, `white_point`, `fade`, `split_tone`,
  `channel_mixer`, `color_balance`, `posterize`, `colorize`, `bleach_bypass`,
  `cross_process`.
- Detalhe e desfoque: `median`, `minimum`, `maximum`, `high_pass`,
  `unsharp_mask`, `motion_blur`, `zoom_blur`, `radial_blur`, `bilateral`, `tilt_shift`.
- Desenho e distorção: `oil_paint`, `pencil`, `crosshatch`, `engraving`,
  `wave`, `pinch`, `mirror`, `weave`.

```js
// Cor e nitidez na camada ativa.
esenho.filters.apply("exposure", 50); // +0,5 EV; 100 = +1 EV
esenho.filters.apply("vibrance", 35);
esenho.filters.apply("split_tone", 220, 40); // matiz de sombras e luzes
esenho.filters.apply("unsharp_mask", 3, 120); // raio e intensidade
```

```js
// Acabamento de desenho; desfazer continua disponível por operação.
esenho.filters.apply("bilateral"); // raio e tolerância padrão
esenho.filters.apply("posterize", 5);
esenho.filters.apply("crosshatch", 7, 45); // espaçamento e mistura
```

Desfoques e efeitos de detalhe preservam a silhueta da camada e ponderam as
médias pelo alfa. `wave`, `pinch` e `mirror` deslocam cor e alfa juntos, com
vizinho mais próximo e coordenadas limitadas à borda. Zoom, rotação e pinçar
usam o centro da camada. A aplicação atua no quadro atual e gera histórico.

## Filtros criativos: fotografia, impressão e materiais

O catálogo tem 97 efeitos. Esta expansão acrescenta 32 filtros. Todos estão no
painel Filtros e em `esenho.filters.list()`, com limites e padrões dos parâmetros.
`esenho.filters.apply(id)` usa os valores padrão; argumentos explícitos definem
p1 e p2. As texturas são determinísticas e usam coordenadas da camada.

São aproximações artísticas: névoa não detecta profundidade; materiais não têm
simulação química; refração e flare não reproduzem uma lente física completa.

### Filtros de fotografia

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `film_grain` — Grão de película | p1: Intensidade, 0 a 100, padrão 24 %; p2: Tamanho do grão, 1 a 6, padrão 1 px | Grão determinístico mais perceptível nas sombras, com leve diferença entre os canais. |
| `light_leak` — Vazamento de luz | p1: Intensidade, 0 a 100, padrão 65 %; p2: Borda: 0=esq, 1=dir, 2=cima, 3=baixo, 0 a 3, padrão 0 | Véu quente e irregular entrando por uma borda, como uma câmera com vedação danificada. |
| `night_vision` — Visão noturna | p1: Ganho, 50 a 500, padrão 220 %; p2: Ruído, 0 a 100, padrão 25 % | Converte a luminosidade em verde, com ganho, ruído e escurecimento periférico. |

### Filtros de óptica

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `halation` — Halation de filme | p1: Raio, 1 a 48, padrão 12 px; p2: Intensidade, 0 a 200, padrão 100 % | Difunde as altas luzes em um halo vermelho e âmbar, inspirado em película. |
| `lens_flare` — Flare com fantasmas | p1: Intensidade, 0 a 150, padrão 70 %; p2: Raio dos fantasmas, 1 a 30, padrão 10 % | Localiza o pixel pintado mais luminoso e alinha cinco reflexos coloridos com o centro da camada. |
| `anamorphic` — Flare anamórfico | p1: Comprimento, 4 a 240, padrão 90 px; p2: Limiar de luz, 80 a 250, padrão 180 | Espalha as altas luzes em faixas horizontais azuladas. |
| `diffraction_star` — Estrelas de difração | p1: Comprimento, 4 a 160, padrão 48 px; p2: Limiar de luz, 80 a 250, padrão 185 | Cria raios horizontais, verticais e diagonais a partir das altas luzes. |
| `prism` — Refração prismática | p1: Dispersão, 0 a 60, padrão 12 px; p2: Direção, 0 a 359, padrão 30 ° | Desloca os canais em sentidos diferentes, com refração variável pela luminosidade local. |
| `rain_glass` — Vidro com gotas | p1: Distância entre gotas, 12 a 120, padrão 42 px; p2: Refração, 0 a 100, padrão 40 % | Distribui gotas elípticas com refração local, bordas sombreadas e reflexos de luz. |

### Filtros de ambiente

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `fog` — Névoa atmosférica | p1: Densidade, 0 a 100, padrão 45 %; p2: Atmosfera: 0=fria, 1=quente, 0 a 1, padrão 0 | Sobrepõe névoa irregular, mais densa no topo; usa a altura como aproximação de distância. |
| `underwater` — Submerso | p1: Profundidade, 0 a 100, padrão 70 %; p2: Luz cáustica, 0 a 100, padrão 45 % | Atenua vermelho e adiciona luz cáustica procedural, sugerindo uma cena debaixo d’água. |

### Filtros de impressão

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `cyanotype` — Cianotipia | p1: Contraste, 0 a 150, padrão 40 %; p2: Textura do papel, 0 a 60, padrão 15 % | Mapeia os tons entre azul profundo e papel claro, com granulação fina. |
| `lith_print` — Revelação lith | p1: Grão nas sombras, 0 a 100, padrão 35 %; p2: Calor, 0 a 100, padrão 55 % | Sombras densas e granuladas com altas luzes quentes, inspiradas na impressão lith. |
| `risograph` — Risografia de duas tintas | p1: Retícula, 2 a 18, padrão 6 px; p2: Desregistro, 0 a 16, padrão 3 px | Separa tintas azul e coral, com retículas inclinadas, falhas de tinta e desregistro. |
| `cmyk_print` — Impressão CMYK | p1: Retícula, 2 a 20, padrão 7 px; p2: Desregistro, 0 a 12, padrão 1 px | Separa ciano, magenta, amarelo e preto em retículas de ângulos diferentes. |
| `photocopy` — Fotocópia de toner | p1: Limiar, 20 a 240, padrão 145; p2: Falhas de toner, 0 a 100, padrão 35 % | Limiar adaptado à vizinhança e irregularidade do toner sobre papel levemente quente. |

### Filtros de pigmento

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `ink_bleed` — Tinta que sangra | p1: Raio, 1 a 12, padrão 4 px; p2: Mistura, 0 a 100, padrão 65 % | Difunde principalmente as cores escuras, sugerindo absorção de tinta pelo papel. |
| `watercolor_paper` — Papel aquarela | p1: Textura, 0 a 100, padrão 55 %; p2: Escala das fibras, 2 a 30, padrão 8 px | Fibras direcionais, relevo fino do papel e pigmento acumulado nas transições de tom. |
| `pigment_granulation` — Granulação de pigmento | p1: Intensidade, 0 a 150, padrão 85 %; p2: Escala, 2 a 40, padrão 8 px | Agrupa pigmento em manchas de várias escalas, com deposição diferente por canal. |

### Filtros de material

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `impasto_lighting` — Luz sobre impasto | p1: Relevo, 0 a 200, padrão 100 %; p2: Direção da luz, 0 a 359, padrão 315 ° | Interpreta a luminância como altura da tinta e aplica iluminação direcional ao relevo. |
| `brushed_metal` — Metal escovado | p1: Escovação, 0 a 100, padrão 70 %; p2: Direção, 0 a 179, padrão 0 ° | Converte os tons para metal frio com fibras alongadas e faixas de brilho. |
| `oxidized_copper` — Cobre oxidado | p1: Pátina, 0 a 100, padrão 65 %; p2: Escala das manchas, 8 a 160, padrão 45 px | Mistura cobre escurecido e manchas de pátina verde-azulada, mantendo as variações tonais. |
| `rust` — Ferrugem | p1: Cobertura, 0 a 100, padrão 65 %; p2: Escala da corrosão, 8 a 160, padrão 50 px | Aplica corrosão irregular em tons de óxido de ferro, com porosidade fina. |
| `crackle` — Craquelado | p1: Tamanho das células, 8 a 120, padrão 38 px; p2: Profundidade das fissuras, 0 a 100, padrão 65 % | Escurece as fronteiras de células irregulares para sugerir tinta ou verniz rachado. |
| `stained_glass` — Vitral de vidro | p1: Tamanho das peças, 8 a 100, padrão 30 px; p2: Largura do chumbo, 1 a 8, padrão 2 px | Recompõe as cores em peças irregulares de vidro separadas por juntas escuras. |
| `marble` — Veios de mármore | p1: Mistura, 0 a 100, padrão 75 %; p2: Escala dos veios, 8 a 140, padrão 50 px | Gera veios turbulentos sobre uma base mineral clara e mistura com a imagem. |
| `iridescence` — Filme iridescente | p1: Mistura, 0 a 100, padrão 60 %; p2: Deslocamento de cor, 0 a 359, padrão 30 ° | Usa luminância e direção das bordas para sugerir película fina, óleo ou superfície nacarada. |

### Filtros de experimental

| ID e efeito | p1 e p2 | Como funciona |
| --- | --- | --- |
| `contour_map` — Mapa de altitude | p1: Faixas de altitude, 3 a 32, padrão 12; p2: Largura tonal das curvas, 1 a 100, padrão 35 | Interpreta a luminosidade como altitude, com cores de terreno e curvas de nível. |
| `lenticular` — Lente lenticular | p1: Largura das tiras, 2 a 40, padrão 8 px; p2: Deslocamento, 0 a 100, padrão 18 px | Intercala tiras da imagem e de sua versão espelhada, lembrando uma lâmina lenticular. |
| `pixel_sort` — Pixel sorting | p1: Comprimento dos trechos, 4 a 128, padrão 48 px; p2: Limiar de luminosidade, 0 a 250, padrão 80 | Ordena pixels por luminância em trechos horizontais; regiões escuras e transparentes separam os trechos. |
| `moire` — Interferência moiré | p1: Período das grades, 2 a 40, padrão 8 px; p2: Ângulo entre grades, 1 a 89, padrão 8 ° | Sobrepõe duas grades próximas para produzir grandes bandas de interferência colorida. |
| `slit_scan` — Slit-scan em faixas | p1: Deslocamento, 0 a 140, padrão 40 px; p2: Altura das faixas, 1 a 32, padrão 4 px | Remonta a imagem em faixas horizontais deslocadas, sugerindo captura temporal por fenda. |

### Receitas: película, tinta e vidro

Os exemplos **Filtros · Película com halation**, **Impressão risográfica**,
**Metal antigo com relevo**, **Cena atrás de vidro molhado**, **Luzes anamórficas**
e **Interferência digital** estão no dropdown. Eles processam a camada ativa;
não criam conteúdo se a camada estiver vazia.

```js
// Película: halo quente nas altas luzes e grão fino.
esenho.filters.apply("halation",12,90);
esenho.filters.apply("film_grain",20,1);
```

```js
// Tinta sobre papel com deposição irregular.
esenho.filters.apply("pigment_granulation",75,8);
esenho.filters.apply("watercolor_paper",40,8);
esenho.filters.apply("impasto_lighting",80,315);
```

```js
// Impressão de quatro cores com retícula e leve desregistro.
esenho.filters.apply("cmyk_print",7,1);
```

### Preparação e transparência

- Para halation, flare, anamórfico e difração, use uma imagem com luzes claras
  sobre fundo escuro. Halation usa limiar interno 175 e flare busca uma fonte
  acima de 170. Anamórfico e difração expõem o limiar no segundo parâmetro.
- A névoa é mais densa no topo. A altura substitui um mapa de profundidade.
- Impasto e iridescência usam a luminosidade e as diferenças entre vizinhos
  para sugerir relevo. Não usam dados tridimensionais do desenho.
- Lenticular, slit-scan e pixel sorting transportam RGBA junto com os pixels.
  Os demais efeitos novos preservam o alfa original e a silhueta pintada.
- Os brilhos ópticos não crescem sobre áreas transparentes. Para esse resultado,
  use uma camada com fundo opaco. Prisma e gotas preservam o alfa do destino.
- Pixel sorting deixa pixels escuros ou transparentes como separadores e limita
  a ordenação a trechos curtos para controlar o custo em dispositivos móveis.

## Coleção criativa: 37 scripts novos

Busque pelos nomes abaixo no dropdown da aba **Código**. Cada exemplo é um
programa completo: seus helpers `path`, `polygon`, `oval` e `rand` aparecem no
próprio código e continuam disponíveis ao salvar ou exportar o preset.

Marque o centro em uma região com cerca de 320 × 320 pixels livres. Arrastar
orienta o pivot. Os desenhos criam uma camada própria e não substituem o
documento. A costura usa a origem como primeira ponta e pede um segundo ponto.
O mosaico precisa de uma imagem já existente sob a nova camada para amostrar
suas cores; ele coleta todas as cores antes de pintar.

| Exemplo no dropdown | O que faz |
| --- | --- |
| Natureza · Água-viva bioluminescente | Cúpula, tentáculos e pressão para afinar pontas. |
| Natureza · Concha de náutilo | Espiral logarítmica com divisórias de concha. |
| Natureza · Pena em duas tonalidades | Ramificações espelhadas e pressão decrescente. |
| Natureza · Samambaia geométrica | Folhas poligonais repetidas nos dois lados do caule. |
| Natureza · Borboleta de vitral | Asas poligonais, nervuras e simetria construída pelo código. |
| Natureza · Libélula técnica | Referências locais rotacionadas para asas e segmentos. |
| Natureza · Dente-de-leão ao vento | Sementes radiais e variação determinística de distância. |
| Natureza · Carpa em curva | Corpo, manchas, barbatanas e detalhes de uma carpa. |
| Natureza · Coral de ramos arredondados | Recursão limitada, galhos e espessuras variáveis. |
| Arte · Circuito de uma cidade imaginária | Trilhas de circuito com mudanças de direção e terminais. |
| Arte · Cartografia de constelações | Conecta estrelas ao vizinho anterior mais próximo. |
| Arte · Cidade neon na chuva | Edifícios e luzes com vidro molhado e flare anamórfico. |
| Arte · Dunas ao pôr do sol | Dunas sobrepostas, sol e grão de película. |
| Arte · Eclipse com coroa solar | Coroa solar procedural e halation sobre fundo escuro. |
| Arte · Aurora sobre montanhas | Fitas com pressão variável e silhueta de montanhas. |
| Arte · Chuva de meteoros | Traços afilados, pontos de luz e filtro de difração. |
| Arte · Cerâmica kintsugi | Forma de cerâmica com reparos dourados desenhados. |
| Arte · Geodo de ágata | Polígonos concêntricos irregulares com paleta mineral. |
| Arte · Gato olhando a lua | Silhueta feita de formas, cauda de pincel e lua. |
| Arte · Onda com espuma | Polígono de onda, espuma e fileiras de água. |
| Geometria · Flor da vida | Circunferências sobrepostas em uma grade hexagonal. |
| Geometria · Mosaico triangular | Mosaico de polígonos com alternância de cores. |
| Geometria · Labirinto de Truchet | Módulos de arcos com rotação aleatória reproduzível. |
| Geometria · Nó de três laços | Curva paramétrica com contornos sobrepostos de espessuras diferentes. |
| Geometria · Bairro isométrico | Edifícios de três faces e alturas determinísticas. |
| Geometria · Atlas de órbitas | Órbitas elípticas, planetas e referências rotacionadas. |
| Procedural · Harmonógrafo amortecido | Oscilações amortecidas em três passagens de cor. |
| Procedural · Campo de correntes | Traços que seguem um campo de direções calculado. |
| Procedural · Atrator de Clifford | Atrator de Clifford visualizado como caminho conectado. |
| Procedural · Radar de expedição | Anéis, eixos, setor de varredura e pontos detectados. |
| Ferramentas · Costura entre dois pontos | A origem é a primeira ponta; um segundo touch define o fim da costura. |
| Ferramentas · Incrustação com seleção vazada | Subtrai uma elipse de outra e limita a pintura à faixa selecionada. |
| Ferramentas · Mosaico da imagem existente | Amostra 100 cores do documento antes de pintar um mosaico de discos. |
| Animação · Pulso de coração | Cria 12 quadros de um coração com espessura pulsante. |
| Animação · Flor respirando | Cria oito quadros de uma flor que expande e contrai. |
| Ferramentas · Selo espectral com máscara | Constrói uma máscara radial de 96 × 96 pixels e aplica iridescência. |
| Interação · Roseta com formulário | Formulário para escolher número de pétalas e cor de uma curva polar. |

### Alterar o resultado

- `path(pontos, cor, tamanho, espaço)` desenha um caminho de pincel. Pontos podem
  ser objetos ou listas `[x,y,pressão]`; a pressão padrão desse helper é 1.
- `polygon(pontos, cor, espaço)` fecha e preenche um polígono usando laço.
- `oval(x,y,raioX,raioY,cor,espaço)` desenha uma elipse preenchida.
- Os espaços opcionais usam `p` por padrão. Use `p.translate(x,y).rotate(graus)`
  para posicionar elementos sem recalcular os pontos.
- Mude `seed=2026` para variar circuitos, meteoros e outras composições com
  sorteio. A mesma semente repete o resultado; não há dependência da internet.
- Cidade neon, deserto, eclipse e meteoros demonstram filtros sobre arte criada
  pelo próprio script. Edite os parâmetros das chamadas `filters.apply()`.

### Animações e configurações

**Pulso de coração** cria 12 quadros e define 12 FPS. **Flor respirando** cria
8 quadros e define 10 FPS. Ambas usam a camada recém-criada, repetem a animação
e iniciam a reprodução ao terminar. FPS e repetição são configurações globais
do documento; outras camadas continuam usando suas tracks. Pause pelo painel
de animação para inspecionar cada quadro.

Os exemplos pausam a reprodução anterior, limpam a seleção, desativam simetria,
snap e grade e preparam o preset Studio Inker com seus padrões. Essas mudanças
de configuração permanecem depois da execução. O histórico é por operação;
**Parar** interrompe a geração, mantendo as operações já concluídas.

O selo espectral usa uma máscara em coordenadas globais do documento, sem a
rotação do pivot. O caminho do atrator liga os pontos sucessivos; não é uma
nuvem de partículas independentes. O nó é uma curva decorativa de contornos
sobrepostos, sem simulação tridimensional de entrelaçamento.
