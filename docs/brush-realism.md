# Realismo dos pincéis

O editor de propriedades contém a seção **Realismo** para pincéis clássicos e
contínuos. Os 20 controles, incluindo o seletor de perfil e o interruptor de
pressão da opacidade, podem ser pinados nos parâmetros rápidos. Ao selecionar
um kernel procedural, os controles clássicos ficam ocultos e os parâmetros
específicos daquele kernel permanecem isolados.

- **Ponta:** flexibilidade e atraso da recuperação. Pressão e inclinação alteram
  o contato; o movimento produz deformação e arraste.
- **Cerdas:** quantidade, separação e irregularidade. A identidade de cada cerda
  acompanha o traço, com filtragem das cerdas menores que um pixel.
- **Variação contínua:** tamanho, fluxo e concentração de pigmento, com um
  comprimento de correlação em pixels. O ruído interpola suavemente ao longo
  da distância percorrida.
- **Papel e atrito:** resposta e profundidade do relevo, mais atrito/arraste.
  A deposição no relevo aumenta com a pressão e a umidade.
- **Deposição:** perfil uniforme, centro carregado, bordas carregadas, ponta
  dividida ou irregular, com intensidade ajustável.
- **Desgaste:** a face da ponta se alarga e perde definição conforme a distância
  de uso, inclusive entre traços. Selecionar o pincel novamente restaura a ponta;
  colocar o desgaste em zero também restaura a ponta.
- **Pressão:** respostas independentes de tamanho, fluxo, opacidade e deformação.
  100% é linear; valores menores oferecem resposta suave e maiores exigem
  mais pressão. Tamanho e fluxo clássicos respeitam seus interruptores na seção Dinâmica;
  opacidade tem um interruptor próprio. A deformação atua na flexibilidade.

Os presets antigos usam valores neutros. Os oito presets novos são Pena Flexível,
Aquarela de Marta, Cerdas Secas, Conté sobre Papel Rugoso, Carvão Desgastável,
Marcador com Bordas Carregadas, Pena de Ponta Dividida e Guache Orgânico.
As configurações de realismo acompanham os presets personalizados e os
favoritos salvos.

A definição compartilhada dos controles está em `src/brush_realism_params.json`.
Ela alimenta os metadados Android, o editor e o registro dos parâmetros rápidos.
O motor usa os IDs públicos 58–77; alterações nesse contrato exigem atualizar
`src/include/quadro.h` e `src/include/quadro_brush_realism.h`.

Validação:

```sh
make plugins/canvas.wasm bin/test_brush_realism
./bin/test_brush_realism
node tests/test_brush_realism.js
```

`LEGACY_CANVAS_WASM` permite comparar os pixels neutros com um motor anterior.
`BRUSH_REALISM_PREVIEW_DIR` salva amostras raster em PPM para revisão visual.
