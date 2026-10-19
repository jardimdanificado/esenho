# Interface Android

O editor usa uma única área de trabalho com três níveis de navegação:

- **Documento:** toque no nome `esenho` no cabeçalho. Projeto reúne nova tela, abrir/salvar, importação e exportação; Tela reúne dimensões, enquadramento, espelhamento e auxiliares; Seleção reúne operações gerais da área selecionada.
- **Ferramentas:** a faixa lateral troca a ferramenta ativa. O primeiro botão abre a lista completa, incluindo formas, modos de seleção, mistura e navegação.
- **Painel de trabalho:** a navegação inferior abre Pincéis, Cores, Camadas, Animar ou Efeitos. Tocar na categoria ativa fecha o painel.

A faixa de propriedades mostra a ferramenta, o pincel, a cor, o tamanho e a opacidade. Toque no nome da ferramenta para acessar suas opções e no ícone de ajustes para configurar os parâmetros personalizados.

Seleção e transformação também usam o painel de trabalho. As operações aparecem em cartões com rótulos; ações que exigem uma seleção ficam desativadas quando não existe uma área selecionada. Confirmar ou cancelar uma transformação encerra esse painel.

## Organização adaptável

Em telas estreitas, o painel ocupa a parte inferior, com altura limitada a 46% da área disponível e a 400 dp. Em telas largas ou em orientação horizontal com largura suficiente, ocupa uma coluna lateral de 300 a 360 dp. O desenho tem uma área própria de layout, sem painéis sobrepostos. Abrir e fechar o painel preserva o zoom e o ponto central da visualização.

O modo de foco está no cabeçalho. O botão no canto do desenho ou o comando Voltar restaura a interface.

## Implementação

`Workspace.kt` contém o cabeçalho, a navegação, a faixa de ferramentas, as propriedades, os cartões e os contêineres compartilhados. `WorkspacePanel` é a seleção única de painel em `NativePainterActivity.kt`. Os editores de pincéis, cores, camadas, filtros e animação aceitam `embedded = true` para funcionar dentro desse contêiner.

O tema usa superfícies escuras em grafite e destaque violeta. Diálogos de confirmação continuam usando os componentes do tema. Nova tela, projetos e exportação usam folhas com o mesmo cabeçalho e organização visual.
