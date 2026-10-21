# Scripting nativo do Android

Abra **Documento → Projeto → Scripts JavaScript**. O editor guarda o rascunho
automaticamente e permite abrir e salvar arquivos `.js`. Os exemplos Radial,
Espiral e Tela já podem ser executados.

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

Crie referências pelos botões **Pivot na arte** / **Pivot na tela**, ou pelo script:

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

`view.set()` define valores absolutos: zoom padrão 1, rotação padrão 0 e ponto
do documento `(x,y)` centralizado na área visível (centro da arte por padrão).
`ui.openPanel()` aceita `brushes`, `color`, `layers`, `animation`, `effects`,
`selection` e `transform`. Abrir um painel ou diálogo solicita sua exibição;
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
