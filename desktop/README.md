# Esenho para Linux

O editor desktop usa os painéis Compose, o motor Kotlin, os projetos `.esenho`, os pincéis/filtros C e o runtime QuickJS da versão Android. A interface mantém o tema Gruvbox, os painéis de pincéis, cores, camadas, animação, efeitos, seleção, transformação e scripts.

A adaptação está em `src/main/kotlin/app/esenho/desktop`. `prepare-sources.py` gera as fontes JVM a partir das fontes Android durante a compilação. Não edite `build/generated/editor`: alterações nos painéis e no motor devem continuar nas fontes compartilhadas do Android. Serviços de desktop substituem armazenamento Android, seleção de arquivos, bitmaps, eventos de entrada e exportação de vídeo. Nenhuma WebView ou versão web é usada.

## Executar

Requisitos de compilação: Linux, JDK 17, Node.js, Python 3, CMake 3.22 ou superior e compilador C. O wrapper Gradle do repositório baixa as dependências na primeira execução. Os scripts usam `JAVA_HOME` ou o JDK 17 instalado para este projeto.

```sh
./desktop/run.sh
```

FFmpeg deve estar no `PATH` para exportar WebP e WebM. PNG, JPEG, GIF e importação de WebP funcionam sem FFmpeg. Os arquivos são escolhidos em diálogos nativos do sistema.

Os dados do editor ficam em `$XDG_DATA_HOME/esenho` ou `~/.local/share/esenho`; o cache fica em `$XDG_CACHE_HOME/esenho` ou `~/.cache/esenho`. Preferências, pincéis personalizados, paletas, scripts e o autosave ficam separados dos dados do Android.

## Entrada

- Botão esquerdo: ferramenta atual. Botão direito: borracha.
- Botão central e arraste: deslocar a tela.
- Roda: zoom no cursor. Shift + roda: girar a tela.
- `B`, `E`, `I`, `H`: pincel, borracha, conta-gotas e mover tela, com o canvas focado.
- `0`: reenquadrar a tela, com o canvas focado.
- `Ctrl+Z`, `Ctrl+Shift+Z` ou `Ctrl+Y`: desfazer/refazer, com o canvas focado.
- `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+E`: novo projeto, abrir, salvar e exportar.
- `F6`, `F7`, `F8`, `F9`: camadas, animação, scripts e efeitos.
- `Esc`: fechar o painel ou cancelar a interação de script atual.

Quando as bibliotecas de desenvolvimento X11/XInput2 estão disponíveis na compilação, o pacote inclui um leitor de pressão, inclinação e borracha da caneta. Esses dados dependem dos valuadores expostos pelo servidor X11/XWayland. Sem esses dados, o editor aceita o apontador com pressão constante. A integração com uma mesa digitalizadora física ainda precisa ser validada; Wayland pode não expor os valuadores ao XWayland.

## Pacote com Java incluído

```sh
./desktop/package.sh
```

O resultado é `desktop/build/Esenho-linux.tar.gz`. Extraia o arquivo e execute `Esenho/bin/Esenho`. O pacote contém o runtime Java e as bibliotecas nativas; FFmpeg continua sendo uma dependência externa para exportar WebP/WebM. O pacote atende à arquitetura e às bibliotecas de sistema da máquina onde foi compilado.

## Verificação

```sh
./desktop/test.sh
./desktop/test.sh --ui
```

Os testes usam uma pasta temporária para preservar os dados pessoais. Verificam transparência no JNI, traços, undo/redo, camadas, seleção, gravação/reabertura de projetos, animação, imagens PNG/JPEG/WebP, GIF/WebM, aplicação de filtro, homografia e execução de scripts com acesso ao editor. A verificação de UI abre uma janela, desenha por eventos de mouse e grava os buffers do próprio aplicativo em `desktop/build/ui-*.png`.

A paridade é obtida pelo reaproveitamento das fontes. Isso não substitui uma validação manual de cada opção dos painéis, de dispositivos físicos e de outras distribuições Linux.

## Bancada anterior

O benchmark do núcleo continua disponível, sem GPU ou interface do editor:

```sh
./desktop/run.sh --benchmark 4096 4096 1000
./desktop/run.sh --benchmark 2048 2048 300 partial dynamic
./desktop/run.sh --benchmark 2048 2048 300 full dynamic
```

Para abrir somente a bancada Swing anterior, use `./desktop/benchmark.sh`, com dimensões opcionais. O modo `full` força a cópia/recomposição completa para comparação; o benchmark também compara os pixels da renderização parcial com a completa.

## Espaços Raster e Vetor

No menu do documento (ícone de pasta), escolha **Raster** ou **Vetor**. A troca de espaço não acrescenta uma barra ao canvas. O dock inferior do Vetor oferece pincel, caneta Bézier, borracha de objetos, seleção, nós, linha, retângulo, elipse, texto, conta-gotas e navegação. Na caneta, clique para adicionar âncoras e arraste para orientar as alças. Arraste um objeto com **Objetos**; em **Nós**, arraste as âncoras ou as alças. Os controles permitem inserir/excluir nós, escolher o tipo do nó (angular, suave ou simétrico), mover a âncora por coordenadas numéricas e ajustar sua pressão. Nós suaves mantêm as duas alças alinhadas; nós simétricos também mantêm o mesmo comprimento.

Os botões de presets e a amostra de cor do dock abrem os mesmos painéis do raster. O botão de propriedades abre a lista de objetos e controles de contorno, preenchimento, espessura, opacidade e nós. Alterar a cor ou os parâmetros do pincel atualiza o objeto selecionado. Cada objeto guarda uma cópia da configuração completa do preset ou pincel procedural, suas curvas de parâmetros, cor, pressão e inclinação. **Aplicar pincel atual ao contorno** reaplica a configuração atual ao objeto selecionado. Contornos SVG mantêm terminações (butt, redonda, quadrada), junções (mitre, redonda, chanfro) e limite do mitre editáveis no painel. O contorno passa pelo motor nativo de pincéis; preenchimentos fechados usam cor sólida. O pincel pinta durante o arraste; ao soltar, o editor ajusta a curva e renderiza o caminho editável.

O arquivo `.esenho` preserva os caminhos e os pixels renderizados. Projetos anteriores continuam abrindo. No menu do documento, **Exportar curvas SVG** grava curvas convencionais e os metadados editáveis do Esenho; efeitos de pincel não equivalentes ao padrão SVG podem mudar de aparência em outros programas. **Exportar SVG com aparência** incorpora PNGs das camadas vetoriais e mantém os mesmos metadados. **Importar SVG** adiciona caminhos ao documento atual, preservando os parâmetros dos arquivos Esenho e lendo formas SVG externas compatíveis, sem alterar o tamanho do canvas.

**Rasterizar camada** permite continuar com ferramentas de pixels. Filtros raster, mesclagem de camadas e transformação raster exigem essa conversão. Undo/redo preserva geometria e aparência antes e depois da rasterização. O modo vetorial ainda não oferece rigging do editor web antigo.

A barra de ferramentas existe nos dois espaços. O botão de seta no fim da barra a oculta; no menu **…**, escolha **Mostrar ferramentas** para reabri-la. A visibilidade é salva separadamente para Raster e Vetor. Linha usa arraste entre as extremidades; retângulo e elipse usam arraste entre os cantos da caixa delimitadora, com prévia da forma durante o gesto. A caneta mostra âncoras quadradas e alças circulares enquanto desenha. A edição de nós/alças usa prévia geométrica durante o arraste e atualiza a aparência do pincel ao soltar.

Para medir o mesmo arraste de oito movimentos em uma camada com seis caminhos e pincel procedural semitransparente, execute o aplicativo com `--vector-benchmark`. A saída separa o tempo dos movimentos do tempo de confirmação.

### Seleção e organização vetorial

Na ferramenta **Objetos** (`V`), arraste uma área vazia para selecionar os caminhos totalmente contidos. Use `Shift` ao clicar, ou **Adicionar/remover da seleção** no painel, para acumular ou retirar objetos. Arraste o objeto para mover a seleção, as oito alças para escalar e o círculo acima para girar. A prévia geométrica acompanha o gesto; o pincel nativo é reaplicado ao soltar.

O painel **Objetos vetoriais** permite editar X/Y, largura/altura, rotação relativa, inclinação X/Y e pivô percentual, alinhar e distribuir centros, espelhar horizontal/verticalmente, agrupar/desagrupar e levar a seleção à frente, ao fundo, avançar ou recuar uma posição. O tamanho do pincel permanece constante ao transformar a geometria. Grupos podem ser aninhados dentro da mesma camada: agrupar objetos que já pertencem ao mesmo grupo cria um subgrupo, e selecionar um objeto do grupo pais inclui seus descendentes. Copiar/colar usa uma área de transferência interna do app, preservando pincéis e grupos. `Ctrl+A/C/V/D`, `Ctrl+G`, `Ctrl+Shift+G`, `Delete` e `Esc` controlam seleção, cópia, colagem, duplicação, grupos e exclusão quando o canvas tem foco.

Ative **Encaixar** no painel para alinhar movimentos e alças à grade de 8/16/32 px, aos limites/centro do canvas e às bordas/centros dos outros objetos da camada. Nome, ordem, grupo, bloqueio e visibilidade são salvos no projeto e participam do desfazer/refazer. Os ícones de olho e cadeado na lista agem por objeto.

### Animação vetorial

Cada objeto pode ter faixas de propriedades com keyframes de posição, rotação, escala e opacidade. No painel do objeto, ajuste os valores, escolha a interpolação (`linear`, `ease-in`, `ease-out`, `ease-in-out`) e use **Adicionar keyframe no quadro atual**. O slider percorre os quadros; **Reproduzir** avança no intervalo ativo. A geometria original não é alterada: a animação aplica uma transformação temporária só na renderização.

**Criar clipe** registra um nome e um intervalo de quadros; o menu **Clipe ativo** escolhe qual intervalo a reprodução repete. Tracks, keyframes, clipes e quadro atual ficam no projeto `.esenho` e no desfazer/refazer.

### Recortes, réguas e guias

No painel **Objetos**, selecione dois ou mais objetos da mesma camada e use **Criar recorte**: o objeto da frente passa a recortar os demais, mantendo a geometria editável. **Liberar recorte** devolve os objetos ao estado independente. O recorte aparece como `<clipPath>` na exportação SVG e volta com os metadados do projeto. A importação de SVG externo com `clip-path` ou `mask` continua sem suporte; converta o recorte em caminhos antes de importar.

A opção **Réguas** mostra escalas no topo e à esquerda do canvas. **Guia vertical** e **Guia horizontal** criam linhas na seleção ou no centro do documento; arraste uma guia no canvas para reposicioná-la. **Remover guias** limpa todas. O encaixe de objetos usa as guias ativas mesmo com a opção **Encaixar** desligada.

### Texto vetorial

A ferramenta **Texto** cria um objeto editável. No painel do objeto é possível alterar o conteúdo, a família da fonte (sem serifa, serifa, monoespaçada), o tamanho, o espaçamento entre caracteres e o alinhamento. O contorno do objeto acompanha o texto medido, então seleção, transformação e encaixe continuam funcionando.

**Texto sobre caminho** prende o texto a outro caminho da mesma camada; cada caractere é posicionado e girado ao longo da curva. **Converter em curvas** substitui o texto por contornos de glifos editáveis pela ferramenta **Nós**, preservando furos. Textos e referências `textPath` sobrevivem ao projeto `.esenho` e à exportação/importação SVG, inclusive SVG externo com `text`, `font-family`, `font-size`, `letter-spacing` e `text-anchor`. Fontes não instaladas no sistema podem mudar de aparência em outros computadores.

### Gradientes e imagens

**Preenchimento gradiente** cria um gradiente linear ou radial editável. Cada parada tem posição e cor; use **Adicionar parada com a cor atual** e o seletor de cor do objeto para compor a transição. **Coordenadas em pixels** troca as posições normalizadas do gradiente por coordenadas absolutas no documento. Gradientes são exportados como `<linearGradient>`/`<radialGradient>` e importados de SVG externo.

Imagens PNG incorporadas em SVG (`data:image/png;base64`) viram objetos vetoriais editáveis: a caixa do objeto controla posição e tamanho. Na exportação, voltam como `<image>`. O projeto `.esenho` guarda os bytes da imagem.

### Aparência avançada

**Preenchimento com pincel** usa o pincel atual em varreduras dentro da área fechada, em vez de cor sólida. A configuração do pincel fica guardada com o objeto. **Filtro do preenchimento** e **Filtro do contorno** aplicam um filtro nativo apenas à parte correspondente: o editor isola essa parte, aplica o filtro e recombina com o restante da camada. Ambos são salvos no projeto e participam do desfazer.

Ao editar nós, **Largura do nó** multiplica a espessura do traço naquele ponto, permitindo largura variável ao longo do caminho.

### Conversões

No painel do objeto, **Contorno em área** transforma a espessura do traço em uma área fechada preenchida, com o contorno interno preservado como furo quando aplicável. **Simplificar** reduz âncoras quase colineares com tolerância de 2 px, mantendo o caminho editável.

**Vetorizar camada** lê os pixels opacos da camada ativa, usa o limiar de alfa informado e cria caminhos fechados preenchidos com marching squares. Imagens grandes são amostradas para manter a operação responsiva; contornos duplicados gerados em cantos ambíguos são descartados. Todas as conversões entram no desfazer/refazer.

### Booleanas e SVG externo

No painel **Objetos**, selecione dois ou mais objetos fechados e desbloqueados da mesma camada. **Unir**, **Subtrair**, **Interseção** e **Excluir sobreposição** combinam suas áreas. Subtrair retira os objetos da frente do objeto de trás; o resultado herda a aparência do objeto de trás. A operação usa a geometria dos caminhos, sem expandir a espessura do pincel. O resultado pode conter furos e ilhas no mesmo objeto. Seus contornos continuam selecionáveis, transformáveis e editáveis pela ferramenta **Nós**; salvamento, exportação e desfazer/refazer preservam todos os contornos. As booleanas aproximam as curvas do resultado por segmentos editáveis com tolerância de 0,1 px; os caminhos originais ficam no desfazer.

A importação externa aceita `path` com M/L/H/V/C/S/Q/T/A/Z, comandos relativos e repetidos, `rect` com cantos arredondados, `circle`, `ellipse`, `line`, `polyline` e `polygon`. Quadráticas e arcos são convertidos em Béziers cúbicas. Também lê viewBox, unidades físicas/percentuais, transformações, grupos planos, referências internas `use`, estilos inline/herdados, cores sólidas, regras evenodd/nonzero, opacidade por objeto, terminações/junções e tracejados. Escalas não uniformes são aceitas em preenchimentos; contornos exigem transformação uniforme, sem inclinação. O contorno SVG mantém seus atributos ao importar; **Aplicar pincel atual ao contorno** troca essa aparência pelo pincel raster selecionado.

Padrões de preenchimento, `clip-path`/`mask` externos, filtros SVG, marcadores, CSS em folhas de estilo, opacidade de grupo, viewports aninhados, `pathLength` e `preserveAspectRatio="slice"` ainda não são importados. Gradientes lineares/radiais e imagens PNG incorporadas são importados. O importador informa o recurso incompatível e mantém o documento anterior intacto. Converta esses elementos em caminhos simples antes de importar. Os SVGs exportados pelo próprio app continuam usando seus metadados para preservar integralmente os parâmetros nativos.
