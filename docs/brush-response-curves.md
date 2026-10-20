# Biblioteca de curvas de resposta

No editor nativo, a aba **Curvas** contém a biblioteca e os vínculos do brush
atual. O botão de gráfico ao lado do pin de cada propriedade abre o mesmo
painel já focado naquele parâmetro.

## Criar e reutilizar

1. Escolha **Nova**, ou use **Criar a partir** em uma das nove curvas iniciais.
2. Dê um nome, adicione pontos tocando no gráfico e arraste os pontos para
   modelar a resposta. Os extremos mantêm X em 0 e 1; suas saídas Y são editáveis.
   É possível adicionar até 32 pontos e remover os pontos internos.
3. Escolha interpolação **Suave**, **Linear** ou **Patamares** e salve.
4. Escolha um parâmetro e uma entrada. Ajuste os limites de saída e aplique.
5. A mesma curva salva pode ser usada em outros parâmetros e brushes. Editar
   uma curva pessoal atualiza todos os vínculos que a usam, no próximo traço.

As curvas iniciais são modelos protegidos: editá-las cria uma cópia pessoal.
Curvas pessoais podem ser renomeadas, duplicadas e excluídas. Excluir uma curva
também remove seus vínculos persistidos, preservando os valores base dos brushes.

## Entradas e saídas

As entradas disponíveis são pressão, velocidade, distância, tempo, inclinação,
direção e ruído contínuo. Velocidade possui uma referência em px/s; distância
e tempo permitem escolher comprimento/duração e repetição. O ruído é contínuo
ao longo da distância do traço. A direção é normalizada de 0 a 1, começando
à direita e avançando no sentido horário.

A saída normalizada da curva é mapeada nos limites escolhidos para o parâmetro.
Seletores e interruptores arredondam essa saída para seus estados. Os valores
base permanecem salvos e são restaurados ao terminar ou cancelar o traço.
Os controles continuam podendo ser pinados nos parâmetros rápidos.

Os parâmetros listados dependem do motor ativo. Propriedades de kernels
procedurais validam ID do kernel e nome da propriedade, além do índice. Um
vínculo de outro kernel ou de uma propriedade que mudou de identidade fica
inativo. Brushes contínuos usam suas bases e os controles compartilhados que
seu renderizador suporta.

Curvas de tempo também podem atuar com a ponta parada. Nos brushes clássicos,
ative **Acumular Tinta**; nos contínuos, configure uma taxa temporal de marcas
por segundo. A atualização para ao levantar a ponta.

## Demonstrações

- **Pena · Pressão em S:** tamanho e flexibilidade com curvas diferentes.
- **Fita · Ondulação por Distância:** largura cíclica e perfil de deposição em patamares.
- **Seco · Velocidade:** a mesma curva inversa controla tamanho e fluxo.
- **Carvão · Inclinação:** largura e achatamento dependem da inclinação da caneta.
- **Aerógrafo · Pulso Temporal:** fluxo e opacidade pulsantes por tempo.
- **Graphite Pencil HB–6B**, procedural: carga de grafite responde à pressão por curva salva.

## Persistência e validação

A biblioteca pessoal e os vínculos por brush são gravados juntos, por escrita
atômica, em `esenho_brush_curve_library.json`. Os vínculos acompanham presets
personalizados e estados favoritos; as formas pessoais permanecem na biblioteca.
Os modelos iniciais ficam em `src/brush_curves_data.json`; os vínculos de
demonstração procedurais, em `src/brush_curve_brushes.json`.

```sh
make test-brush-curves
```

O teste executa o avaliador e os sensores Java, e os modelos, a biblioteca e o
runtime Kotlin de produção contra um adaptador de renderização de teste. Cobre
persistência, falhas de gravação, reutilização, controles discretos, isolamento,
restauração exata das bases e atualização temporal. O script usa o Kotlin e a
implementação JSON locais do Android Studio; outros ambientes podem definir
`BRUSH_CURVE_KOTLINC`, `BRUSH_CURVE_JSON_JAR` e `BRUSH_CURVE_JAVA_HOME`.
