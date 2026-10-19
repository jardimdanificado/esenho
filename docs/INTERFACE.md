# Interface Android compacta

O cabeçalho e a barra de acesso somam **80 dp**: 40 dp cada. A segunda barra opcional acrescenta **36 dp**, totalizando 116 dp quando visível. Não há faixa lateral permanente. As barras do sistema Android são adicionais.

- **Ferramentas:** toque no primeiro ícone da barra inferior. A ferramenta atual aparece nesse botão; o seletor reúne pintura, seleção, formas e navegação.
- **Documento:** toque nas dimensões da tela. Projeto reúne nova tela, abrir/salvar, importação e exportação; Tela reúne dimensões, enquadramento, espelhamento e auxiliares; Seleção reúne operações gerais da área selecionada.
- **Acesso rápido:** a barra inferior mostra ferramentas, um controle deslizante do primeiro parâmetro rápido, pincéis, cor, camadas e animação. Tocar nesse controle abre todos os parâmetros rápidos configurados, em sliders horizontais empilhados. Não há um segundo botão exclusivo para opacidade. O menu de três pontos reúne opções da ferramenta, efeitos e configuração dos parâmetros rápidos.

Tocar novamente no atalho de um painel fecha esse painel. Seleção e transformação usam o mesmo espaço de trabalho. Ações que exigem uma seleção ficam desativadas sem uma área selecionada.

## Barra de cores e pincéis

A segunda barra fica abaixo dos controles principais e divide o espaço igualmente: amostras de cores à esquerda, pincéis à direita. Cada metade tem rolagem horizontal independente. Os ícones das metades abrem o Color Studio e o catálogo de pincéis.

No menu de três pontos da barra principal, escolha **Paleta e pincéis favoritos** ou **Cores e pincéis recentes**. A paleta acompanha a seleção do Color Studio. Os pincéis recentes são registrados ao selecionar presets ou pincéis procedurais, inclusive pelo catálogo, e preservados entre sessões. O mesmo menu permite ocultar e mostrar a segunda barra; modo e visibilidade ficam salvos. O modo de foco também oculta as duas barras.

## Parâmetros rápidos

O controle da barra inferior ajusta o primeiro parâmetro da lista por arrasto horizontal. Um toque abre e fecha a pilha de sliders; arrastar não muda sua abertura. Ela permanece aberta ao desenhar, trocar de pincel ou tocar fora. Seu pop-up não captura o foco e permite pintar na área do desenho fora dos controles. O fechamento acontece ao tocar novamente no mesmo botão.

Segure a alça e arraste para reordenar tanto na pilha quanto na janela de configuração. A ordem é salva ao soltar; o primeiro item passa a ser controlado pela barra inferior.

A pilha usa os parâmetros e as faixas já salvos, sem limite de quantidade. A lista de sliders tem rolagem e cria apenas os controles visíveis. A configuração padrão inclui tamanho e opacidade. A dock **Configurar parâmetros rápidos** serve para adicionar ou remover controles, escolher a propriedade, ajustar mínimo e máximo e informar um valor numérico diretamente. Ela não duplica os sliders de uso rápido. Faixas e valores negativos são aceitos para parâmetros que os utilizam.

Sliders, menu inferior e seletor de ferramentas se ancoram diretamente nos botões, com intervalo de 2 dp acima deles e limites nas bordas da janela.

## Painéis

Em telas estreitas, o painel começa com 32% da altura disponível, limitado a 240 dp. Arraste a alça superior para redimensionar a altura continuamente, a partir de 128 dp, preservando espaço para desenhar. Toque na alça para alternar entre o tamanho inicial e uma altura de 62%. Em telas largas, os painéis começam com uma coluna de 260 a 300 dp; arraste a alça na borda esquerda para ajustar a largura. A timeline permanece embaixo, usando toda a largura, inclusive em tablets.

As dimensões escolhidas são mantidas durante a sessão ao fechar, reabrir ou trocar de painel. Os limites acompanham a área disponível após uma rotação ou mudança de tamanho da janela. As alças também oferecem ações de acessibilidade para aumentar e diminuir o painel.

O desenho tem uma área própria de layout. Abrir e fechar painéis preserva o zoom e o ponto central da visualização. O modo de foco está no cabeçalho; o botão no canto do desenho ou Voltar restaura a interface.

### Camadas

Apenas a lista rola. Opacidade, modo de mesclagem, bloqueio de alfa e máscara de corte permanecem fixos em uma única linha no rodapé. As linhas têm 40 dp; selecionar uma camada atualiza essas propriedades.

O olho muda a visibilidade. Segure a alça de uma linha e arraste para reordenar. O menu de cada camada oferece renomear, duplicar, mover para cima/baixo, mesclar, espelhar, criar recursos de pincel e operações de exclusão. A ordenação por arrasto registra um único histórico de alteração por gesto.

### Ajustes do pincel

O nome do preset, voltar, Padrão, Salvar e fechar compartilham um cabeçalho de 32 dp. Presets personalizados também exibem a ação de excluir nessa linha.

### Cores

O Color Studio reúne cabeçalho com cor hexadecimal editável, seletor de 100 dp e uma faixa de amostras. O menu de modo alterna entre plano HSV, roda e canais RGB. Toque em Paleta/Recentes para alternar as amostras; o menu de opções permite criar e excluir paletas, adicionar a cor atual e entrar no modo de remoção de cores. As alterações de cor são aplicadas imediatamente.

### Timeline

Reprodução e edição têm faixas separadas. A primeira contém contador, quadro anterior, reproduzir/pausar, próximo quadro, FPS, opções e fechar. A segunda contém adicionar/duplicar quadro, duração e zoom horizontal.

A régua e as células compartilham a mesma escala e rolagem. Toque na régua para mudar o instante; deslize horizontalmente para navegar. As linhas têm 40 dp e cada unidade de tempo começa com 40 dp de largura, ajustável entre 24 e 80 dp. O cursor acompanha reprodução e troca de quadro.

Toque em uma célula para ativá-la. Segure para acessar o menu da célula. Para alterar a duração, arraste horizontalmente a alça de 18 dp na borda direita da célula. Não é necessário selecionar antes nem segurar: o arrasto ativa a célula e agrupa as mudanças em uma única alteração no histórico; também é possível informar a duração numericamente. Repetição, onion skin e exclusão ficam no menu de opções. A exclusão pela barra pede confirmação.

Camadas e timeline recebem a revisão do editor para acompanhar alterações feitas por Desfazer/Refazer.

## Implementação

`Workspace.kt` contém cabeçalho, seletor de ferramentas, barra de acesso e contêiner do painel. `AnchoredWorkspacePopup.kt` posiciona os pop-ups inferiores e controla a passagem de toques externos. `ThumbSliders.kt` contém a pilha compartilhada e sua configuração. `WorkspacePanel` é a seleção única de painel em `NativePainterActivity.kt`. Os editores aceitam `embedded = true` para ocupar esse contêiner. A densidade dos controles é definida no contêiner compacto; diálogos comuns mantêm o dimensionamento padrão do tema.

## Tema

A interface usa Gruvbox Dark: fundo `#1d2021`, superfícies `#282828`/`#3c3836`, texto `#ebdbb2` e destaque amarelo `#fabd2f`. O tema também cobre a timeline e o fundo externo da área de desenho. As cores do documento e dos pincéis continuam sendo escolhidas pelo usuário.
