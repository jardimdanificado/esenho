# Filtros do Android

O catálogo possui 97 filtros: os 29 originais, a primeira expansão de 36 e a nova expansão de 32. No painel **Filtros**, busque pelo nome ou pelo identificador e toque no filtro para ajustar os parâmetros antes de aplicar. O filtro atua na camada ativa e participa do histórico de desfazer e do quadro de animação atual.

## Primeira expansão: 36 filtros

| ID de scripting | Nome | Parâmetros (p1; p2) | Efeito |
| --- | --- | --- | --- |
| `exposure` | Exposição | Exposição: -300…300 (padrão 50) EV × 100 | Multiplica a luz em passos de exposição; 100 equivale a +1 EV. |
| `gamma` | Gama | Gama: 20…300 (padrão 130) % | Ajusta os meios tons preservando preto e branco; 100 é neutro. |
| `saturation` | Saturação | Saturação: -100…100 (padrão 30) % | Aumenta ou reduz a distância das cores à luminância. |
| `vibrance` | Vibração | Vibração: -100…100 (padrão 40) % | Ajusta principalmente cores com pouca saturação. |
| `temperature` | Temperatura | Calor: -100…100 (padrão 25) % | Desloca a imagem entre tons frios e quentes. |
| `tint` | Matiz verde/magenta | Magenta: -100…100 (padrão 20) % | Corrige a dominante de verde ou magenta. |
| `shadows` | Sombras | Ajuste: -100…100 (padrão 40) % | Clareia ou escurece principalmente as regiões escuras. |
| `highlights` | Altas luzes | Ajuste: -100…100 (padrão -30) % | Ajusta principalmente as regiões claras. |
| `black_point` | Ponto preto | Ponto preto: 0…200 (padrão 25) | Remapeia a entrada escolhida para preto. |
| `white_point` | Ponto branco | Ponto branco: 55…255 (padrão 225) | Remapeia a entrada escolhida para branco. |
| `fade` | Desbotar | Intensidade: 0…100 (padrão 35) % | Levanta pretos e suaviza brancos para reduzir contraste. |
| `split_tone` | Tonalização dividida | Matiz das sombras: 0…359 (padrão 220) °; Matiz das luzes: 0…359 (padrão 40) ° | Aplica matizes diferentes nas sombras e nas luzes. |
| `channel_mixer` | Misturar canais | Rotação RGB: 0…100 (padrão 50) %; Monocromático: 0…100 (padrão 0) % | Mistura R→B, G→R e B→G, com mistura monocromática opcional. |
| `color_balance` | Balanço de cores | Vermelho / ciano: -100…100 (padrão 20); Azul / amarelo: -100…100 (padrão -15) | Ajusta o balanço dos canais vermelho e azul. |
| `posterize` | Posterizar | Níveis por canal: 2…32 (padrão 5) | Reduz o número de níveis em cada canal de cor. |
| `colorize` | Colorizar | Matiz: 0…359 (padrão 200) °; Saturação: 0…100 (padrão 65) % | Converte a luminância para uma tonalidade escolhida. |
| `bleach_bypass` | Bleach bypass | Contraste: 0…100 (padrão 50) %; Dessaturação: 0…100 (padrão 65) % | Combina contraste forte e perda de saturação. |
| `cross_process` | Processo cruzado | Intensidade: 0…100 (padrão 75) %; Calor: -50…50 (padrão 10) | Aplica curvas RGB diferentes para simular revelação cruzada. |
| `median` | Mediana | Raio: 1…2 (padrão 1) px | Reduz ruído impulsivo com a mediana de uma janela de 3×3 ou 5×5. |
| `minimum` | Mínimo (escurecer) | Raio: 1…5 (padrão 2) px | Expande regiões escuras pelo mínimo local de cada canal. |
| `maximum` | Máximo (clarear) | Raio: 1…5 (padrão 2) px | Expande regiões claras pelo máximo local de cada canal. |
| `high_pass` | Passa-altas | Raio: 1…16 (padrão 4) px; Ganho: 0…300 (padrão 100) % | Isola detalhes sobre cinza neutro usando uma média de 25 amostras. |
| `unsharp_mask` | Máscara de nitidez | Raio: 1…16 (padrão 3) px; Intensidade: 0…300 (padrão 120) % | Realça a diferença entre a imagem e uma média de 25 amostras. |
| `motion_blur` | Desfoque de movimento | Distância: 0…100 (padrão 20) px; Ângulo: 0…359 (padrão 0) ° | Desfoca em uma direção com até 32 amostras. |
| `zoom_blur` | Desfoque de zoom | Distância: 0…80 (padrão 20) %; Mistura: 0…100 (padrão 100) % | Acumula 24 amostras em direção ao centro da camada. |
| `radial_blur` | Desfoque de rotação | Ângulo: 0…45 (padrão 12) °; Mistura: 0…100 (padrão 100) % | Acumula 24 amostras girando ao redor do centro da camada. |
| `bilateral` | Suavização bilateral | Raio: 1…4 (padrão 3) px; Tolerância de cor: 1…100 (padrão 25) | Suaviza ruído com pesos espaciais e de cor para preservar bordas. |
| `tilt_shift` | Miniatura (tilt-shift) | Raio: 1…24 (padrão 10) px; Faixa em foco: 0…90 (padrão 25) % | Mantém uma faixa horizontal central em foco e desfoca o restante. |
| `oil_paint` | Pintura a óleo | Raio: 1…4 (padrão 3) px; Faixas tonais: 2…8 (padrão 6) | Substitui a cor pela média da faixa tonal dominante na vizinhança. |
| `pencil` | Desenho a lápis | Raio: 1…16 (padrão 4) px; Traço: 25…300 (padrão 140) % | Compara a luminância local com sua média para simular grafite. |
| `crosshatch` | Hachura cruzada | Espaçamento: 3…24 (padrão 7) px; Mistura: 0…100 (padrão 100) % | Sobrepõe traços diagonais conforme a luminância. |
| `engraving` | Gravura | Espaçamento: 2…24 (padrão 6) px; Mistura: 0…100 (padrão 100) % | Transforma o tom em linhas onduladas de espessura variável. |
| `wave` | Ondas XY | Amplitude: 0…80 (padrão 12) px; Comprimento: 8…300 (padrão 80) px | Desloca os dois eixos com ondas senoidais. |
| `pinch` | Pinçar / inflar | Força: -100…100 (padrão 60) %; Área: 10…100 (padrão 90) % | Distorce radialmente uma região elíptica central. |
| `mirror` | Espelho simétrico | Eixo: 0=X, 1=Y, 2=XY: 0…2 (padrão 0); Origem: 0=início, 1=fim: 0…1 (padrão 0) | Copia a metade escolhida para criar simetria horizontal, vertical ou dupla. |
| `weave` | Trama de tecido | Tamanho: 2…32 (padrão 6) px; Relevo: 0…80 (padrão 25) | Simula fios alternados com luz e sombra sobre as cores da imagem. |

## JavaScript

```js
// Catálogo completo, com intervalos, unidades e padrões.
const filtros = esenho.filters.list();
console.log(filtros);

// Sem parâmetros, usa os padrões do catálogo.
esenho.filters.apply("bilateral");
// Parâmetros explícitos; zero continua sendo um valor válido.
esenho.filters.apply("exposure", 50); // +0,5 EV
esenho.filters.apply("motion_blur", 24, 45);
esenho.filters.apply("split_tone", 220, 40);
esenho.filters.apply("unsharp_mask", 3, 120);
```

Os efeitos de cor, detalhe e desfoque preservam o alfa de cada pixel e a silhueta da camada; médias de vizinhança são ponderadas pelo alfa para evitar halos causados por pixels transparentes. Ondas, pinçar e espelho deslocam RGBA juntos. As distorções usam amostragem pelo vizinho mais próximo e limitam as coordenadas às bordas. Os centros de zoom, rotação e pinçar usam o centro da camada.

As médias usadas por passa-altas, máscara de nitidez, lápis e tilt-shift têm 25 amostras, mantendo um custo limitado mesmo nos raios maiores. Mediana, bilateral e pintura a óleo têm raios limitados para uso em dispositivos móveis. Não há prévia ao vivo; a aplicação usa o fluxo de desfazer existente.

## ABI nativa

Cada plugin exporta `w_plugin_get_info()` e `w_filter_apply(p1, p2)` e é descoberto pelo gerador de plugins nativos. Os novos parâmetros são limitados aos intervalos do catálogo. O framebuffer RGBA precisa ter uma imagem adicional de memória temporária contígua depois dos pixels (2 × largura × altura × 4 bytes), conforme a convenção dos plugins existentes. O adaptador JNI reserva esse espaço antes de chamar o filtro e copia o resultado de volta para a camada. O Bloom existente recebe duas imagens temporárias (3 × largura × altura × 4 bytes no total).

## Segunda expansão: 32 filtros criativos e materiais

Os efeitos abaixo são aproximações artísticas. Não estimam a profundidade real da cena, a composição química dos materiais ou as propriedades da lente. Parâmetros e texturas são determinísticos: o mesmo conteúdo com os mesmos valores gera o mesmo resultado.

| ID de scripting | Nome | Contexto | Parâmetros (p1; p2) | Efeito |
| --- | --- | --- | --- | --- |
| `film_grain` | Grão de película | Fotografia | Intensidade: 0…100 (padrão 24) %; Tamanho do grão: 1…6 (padrão 1) px | Grão determinístico mais perceptível nas sombras, com leve diferença entre os canais. |
| `halation` | Halation de filme | Óptica | Raio: 1…48 (padrão 12) px; Intensidade: 0…200 (padrão 100) % | Difunde as altas luzes em um halo vermelho e âmbar, inspirado em película. |
| `light_leak` | Vazamento de luz | Fotografia | Intensidade: 0…100 (padrão 65) %; Borda: 0=esq, 1=dir, 2=cima, 3=baixo: 0…3 (padrão 0) | Véu quente e irregular entrando por uma borda, como uma câmera com vedação danificada. |
| `lens_flare` | Flare com fantasmas | Óptica | Intensidade: 0…150 (padrão 70) %; Raio dos fantasmas: 1…30 (padrão 10) % | Localiza o pixel pintado mais luminoso e alinha cinco reflexos coloridos com o centro da camada. |
| `anamorphic` | Flare anamórfico | Óptica | Comprimento: 4…240 (padrão 90) px; Limiar de luz: 80…250 (padrão 180) | Espalha as altas luzes em faixas horizontais azuladas. |
| `diffraction_star` | Estrelas de difração | Óptica | Comprimento: 4…160 (padrão 48) px; Limiar de luz: 80…250 (padrão 185) | Cria raios horizontais, verticais e diagonais a partir das altas luzes. |
| `fog` | Névoa atmosférica | Ambiente | Densidade: 0…100 (padrão 45) %; Atmosfera: 0=fria, 1=quente: 0…1 (padrão 0) | Sobrepõe névoa irregular, mais densa no topo; usa a altura como aproximação de distância. |
| `underwater` | Submerso | Ambiente | Profundidade: 0…100 (padrão 70) %; Luz cáustica: 0…100 (padrão 45) % | Atenua vermelho e adiciona luz cáustica procedural, sugerindo uma cena debaixo d’água. |
| `night_vision` | Visão noturna | Fotografia | Ganho: 50…500 (padrão 220) %; Ruído: 0…100 (padrão 25) % | Converte a luminosidade em verde, com ganho, ruído e escurecimento periférico. |
| `cyanotype` | Cianotipia | Impressão | Contraste: 0…150 (padrão 40) %; Textura do papel: 0…60 (padrão 15) % | Mapeia os tons entre azul profundo e papel claro, com granulação fina. |
| `lith_print` | Revelação lith | Impressão | Grão nas sombras: 0…100 (padrão 35) %; Calor: 0…100 (padrão 55) % | Sombras densas e granuladas com altas luzes quentes, inspiradas na impressão lith. |
| `risograph` | Risografia de duas tintas | Impressão | Retícula: 2…18 (padrão 6) px; Desregistro: 0…16 (padrão 3) px | Separa tintas azul e coral, com retículas inclinadas, falhas de tinta e desregistro. |
| `cmyk_print` | Impressão CMYK | Impressão | Retícula: 2…20 (padrão 7) px; Desregistro: 0…12 (padrão 1) px | Separa ciano, magenta, amarelo e preto em retículas de ângulos diferentes. |
| `photocopy` | Fotocópia de toner | Impressão | Limiar: 20…240 (padrão 145); Falhas de toner: 0…100 (padrão 35) % | Limiar adaptado à vizinhança e irregularidade do toner sobre papel levemente quente. |
| `ink_bleed` | Tinta que sangra | Pigmento | Raio: 1…12 (padrão 4) px; Mistura: 0…100 (padrão 65) % | Difunde principalmente as cores escuras, sugerindo absorção de tinta pelo papel. |
| `watercolor_paper` | Papel aquarela | Pigmento | Textura: 0…100 (padrão 55) %; Escala das fibras: 2…30 (padrão 8) px | Fibras direcionais, relevo fino do papel e pigmento acumulado nas transições de tom. |
| `pigment_granulation` | Granulação de pigmento | Pigmento | Intensidade: 0…150 (padrão 85) %; Escala: 2…40 (padrão 8) px | Agrupa pigmento em manchas de várias escalas, com deposição diferente por canal. |
| `impasto_lighting` | Luz sobre impasto | Material | Relevo: 0…200 (padrão 100) %; Direção da luz: 0…359 (padrão 315) ° | Interpreta a luminância como altura da tinta e aplica iluminação direcional ao relevo. |
| `brushed_metal` | Metal escovado | Material | Escovação: 0…100 (padrão 70) %; Direção: 0…179 (padrão 0) ° | Converte os tons para metal frio com fibras alongadas e faixas de brilho. |
| `oxidized_copper` | Cobre oxidado | Material | Pátina: 0…100 (padrão 65) %; Escala das manchas: 8…160 (padrão 45) px | Mistura cobre escurecido e manchas de pátina verde-azulada, mantendo as variações tonais. |
| `rust` | Ferrugem | Material | Cobertura: 0…100 (padrão 65) %; Escala da corrosão: 8…160 (padrão 50) px | Aplica corrosão irregular em tons de óxido de ferro, com porosidade fina. |
| `crackle` | Craquelado | Material | Tamanho das células: 8…120 (padrão 38) px; Profundidade das fissuras: 0…100 (padrão 65) % | Escurece as fronteiras de células irregulares para sugerir tinta ou verniz rachado. |
| `stained_glass` | Vitral de vidro | Material | Tamanho das peças: 8…100 (padrão 30) px; Largura do chumbo: 1…8 (padrão 2) px | Recompõe as cores em peças irregulares de vidro separadas por juntas escuras. |
| `marble` | Veios de mármore | Material | Mistura: 0…100 (padrão 75) %; Escala dos veios: 8…140 (padrão 50) px | Gera veios turbulentos sobre uma base mineral clara e mistura com a imagem. |
| `contour_map` | Mapa de altitude | Experimental | Faixas de altitude: 3…32 (padrão 12); Largura tonal das curvas: 1…100 (padrão 35) | Interpreta a luminosidade como altitude, com cores de terreno e curvas de nível. |
| `iridescence` | Filme iridescente | Material | Mistura: 0…100 (padrão 60) %; Deslocamento de cor: 0…359 (padrão 30) ° | Usa luminância e direção das bordas para sugerir película fina, óleo ou superfície nacarada. |
| `prism` | Refração prismática | Óptica | Dispersão: 0…60 (padrão 12) px; Direção: 0…359 (padrão 30) ° | Desloca os canais em sentidos diferentes, com refração variável pela luminosidade local. |
| `lenticular` | Lente lenticular | Experimental | Largura das tiras: 2…40 (padrão 8) px; Deslocamento: 0…100 (padrão 18) px | Intercala tiras da imagem e de sua versão espelhada, lembrando uma lâmina lenticular. |
| `pixel_sort` | Pixel sorting | Experimental | Comprimento dos trechos: 4…128 (padrão 48) px; Limiar de luminosidade: 0…250 (padrão 80) | Ordena pixels por luminância em trechos horizontais; regiões escuras e transparentes separam os trechos. |
| `moire` | Interferência moiré | Experimental | Período das grades: 2…40 (padrão 8) px; Ângulo entre grades: 1…89 (padrão 8) ° | Sobrepõe duas grades próximas para produzir grandes bandas de interferência colorida. |
| `slit_scan` | Slit-scan em faixas | Experimental | Deslocamento: 0…140 (padrão 40) px; Altura das faixas: 1…32 (padrão 4) px | Remonta a imagem em faixas horizontais deslocadas, sugerindo captura temporal por fenda. |
| `rain_glass` | Vidro com gotas | Óptica | Distância entre gotas: 12…120 (padrão 42) px; Refração: 0…100 (padrão 40) % | Distribui gotas elípticas com refração local, bordas sombreadas e reflexos de luz. |

### Preparação da imagem

- **Halation, flare, anamórfico e difração:** funcionam melhor com pontos claros sobre fundo escuro. Halation usa um limiar interno de 175; flare procura a fonte mais brilhante acima de 170. Anamórfico e difração permitem ajustar o limiar.
- **Névoa:** usa a posição vertical como aproximação de distância. O topo recebe mais atmosfera; não existe detecção de profundidade.
- **Materiais:** relevo de impasto e iridescência usam a luminância e suas diferenças locais. Vitral usa cores amostradas em torno do centro de cada peça. Cobre, ferrugem e mármore usam texturas procedurais em coordenadas da camada.
- **Impressão:** as retículas CMYK e de risografia são padrões espaciais. Mude o zoom para inspecionar a retícula em tamanho real.
- **Transparência:** todos preservam o alfa original, exceto lenticular, slit-scan e pixel sorting, que transportam RGBA junto com os pixels. Efeitos ópticos não criam brilho fora da silhueta pintada; para isso, aplique a uma camada com fundo opaco.
- **Refração:** prisma e vidro com gotas preservam o alfa do destino; amostras completamente transparentes usam a cor original para evitar bordas pretas.

### Receitas JavaScript

```js
// Película: altas luzes quentes e grão fino.
esenho.filters.apply("halation", 12, 90);
esenho.filters.apply("film_grain", 20, 1);

// Ilustração como impressão de duas tintas.
esenho.filters.apply("risograph", 6, 3);

// Superfície pintada com textura e iluminação rasante.
esenho.filters.apply("pigment_granulation", 75, 8);
esenho.filters.apply("impasto_lighting", 100, 315);

// Vidro molhado na imagem da camada ativa.
esenho.filters.apply("rain_glass", 42, 40);
```
