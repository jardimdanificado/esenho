# Interface Android compacta

O espaço permanente da interface é de **80 dp**: cabeçalho de 40 dp e barra de acesso de 40 dp. Não há faixa lateral permanente. As barras do sistema Android são adicionais.

- **Ferramentas:** toque no primeiro ícone do cabeçalho. A ferramenta atual aparece nesse botão; o seletor reúne pintura, seleção, formas e navegação.
- **Documento:** toque nas dimensões da tela. Projeto reúne nova tela, abrir/salvar, importação e exportação; Tela reúne dimensões, enquadramento, espelhamento e auxiliares; Seleção reúne operações gerais da área selecionada.
- **Acesso rápido:** a barra inferior mostra tamanho, opacidade, pincéis, cor, camadas e animação. Tocar nos valores abre o ajuste temporário. O menu de três pontos reúne opções da ferramenta, efeitos e parâmetros personalizados.

Tocar novamente no atalho de um painel fecha esse painel. Seleção e transformação usam o mesmo espaço de trabalho. Ações que exigem uma seleção ficam desativadas sem uma área selecionada.

## Painéis

Em telas estreitas, o painel começa com 32% da altura disponível, limitado a 240 dp. Toque na alça para alternar entre esse tamanho e uma altura de 62%. Em telas largas, os painéis usam uma coluna de 260 a 300 dp. A timeline permanece embaixo, usando toda a largura, inclusive em tablets.

O desenho tem uma área própria de layout. Abrir e fechar painéis preserva o zoom e o ponto central da visualização. O modo de foco está no cabeçalho; o botão no canto do desenho ou Voltar restaura a interface.

### Camadas

Apenas a lista rola. Opacidade, modo de mesclagem, bloqueio de alfa e máscara de corte permanecem fixos no rodapé. As linhas têm 40 dp; selecionar uma camada atualiza essas propriedades.

O olho muda a visibilidade. Segure a alça de uma linha e arraste para reordenar. O menu de cada camada oferece renomear, duplicar, mover para cima/baixo, mesclar, espelhar, criar recursos de pincel e operações de exclusão. A ordenação por arrasto registra um único histórico de alteração por gesto.

### Timeline

Reprodução e edição têm faixas separadas. A primeira contém contador, quadro anterior, reproduzir/pausar, próximo quadro, FPS, opções e fechar. A segunda contém adicionar/duplicar quadro, duração e zoom horizontal.

A régua e as células compartilham a mesma escala e rolagem. Toque na régua para mudar o instante; deslize horizontalmente para navegar. As linhas têm 40 dp e cada unidade de tempo começa com 40 dp de largura, ajustável entre 24 e 80 dp. O cursor acompanha reprodução e troca de quadro.

Toque em uma célula para ativá-la. Segure para acessar o menu da célula. Para alterar a duração por arrasto, selecione a célula e segure sua borda direita; também é possível informar a duração numericamente. Repetição, onion skin e exclusão ficam no menu de opções. A exclusão pela barra pede confirmação.

Camadas e timeline recebem a revisão do editor para acompanhar alterações feitas por Desfazer/Refazer.

## Implementação

`Workspace.kt` contém cabeçalho, seletor de ferramentas, barra de acesso, ajustes temporários e contêiner do painel. `WorkspacePanel` é a seleção única de painel em `NativePainterActivity.kt`. Os editores aceitam `embedded = true` para ocupar esse contêiner. A densidade dos controles é definida no contêiner compacto; diálogos comuns mantêm o dimensionamento padrão do tema.
