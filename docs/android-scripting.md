# Scripting nativo do Android

Toque no botão **Scripts JavaScript** (ícone de código) da barra inferior.
O editor abre no dock redimensionável, mantendo o canvas visível, e guarda o
rascunho automaticamente. O dropdown reúne os exemplos Radial, Espiral e Tela
com os presets pessoais salvos no aparelho. Selecione um preset para abri-lo;
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

Crie referências pelo menu de ações (**Marcar pivot na arte** / **Marcar pivot na tela**), ou pelo script:

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
usa a direção horizontal da visualização. Pivots recebem nomes como `pivot1` se
nenhum nome for informado e continuam disponíveis entre execuções enquanto o
canvas existir. Não são salvos no projeto ou após recriar a Activity.

```js
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
esenho.tools.eraser.stroke({space: centro, points: caminho});
esenho.tools.select_lasso.stroke({space: centro, points: poligono});
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
