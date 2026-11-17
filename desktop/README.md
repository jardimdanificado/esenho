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
