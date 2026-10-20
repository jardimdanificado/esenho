# Revisão de pincéis — materiais naturais

## Escopo

Catálogo inspecionado: 66 presets nomeados e 12 aliases utilitários; 58 kernels WASM existentes. Foram adicionados 8 kernels, totalizando 66. A revisão recalibrou 47 presets de desenho/pintura e fixou a escala de papel/superfície de 13 presets de textura. Efeitos estilizados mantêm sua proposta visual.

## Alterações no motor

- Composição RGBA com normalização pela opacidade resultante: sobrepor tinta em uma camada transparente não escurece artificialmente o RGB.
- Texturas de papel ancoradas na tela; o motor não acrescenta furos aleatórios por cima de uma textura já configurada.
- Carvão e aquarela WASM usam ruído suave ancorado, removendo padrões de grade e diagonais repetidas.
- Óleo perde carga pela distância percorrida, reinicia a carga por traço e adapta a espessura das cerdas ao tamanho.
- Carvão, óleo, aquarela, caligrafia e spray respeitam pressão zero, alfa da cor e apagamento proporcional. Caligrafia usa orientação fixa por padrão; seguir o traço é uma opção explícita.
- Integração Android e manifest WASM regenerados. O CMake acompanha novos arquivos de plugins; o Make acompanha os cabeçalhos compartilhados.
- Compatibilidade freestanding do núcleo WASM: limpeza de memória local e intrínsecos matemáticos nas rotinas de seleção.

## Novos kernels WASM

| Kernel | Material e controles |
| --- | --- |
| graphite_pencil | Grafite: pressão, dureza, carga e relevo/escala do papel |
| colored_pencil | Lápis de cor: camadas translúcidas, carga, dureza e papel |
| soft_pastel | Pastel macio: depósito mais opaco, ponta achatada e papel |
| wax_crayon | Giz de cera: preenchimento irregular dos relevos do papel |
| dip_pen | Pena flexível: fluxo, ângulo, flexibilidade e absorção |
| felt_marker | Marcador chanfrado: largura estável, fluxo translúcido, ângulo e proporção da ponta |
| gouache_flat | Guache: carga, separação das cerdas, captura de cor e esgotamento |
| dry_flat_brush | Pincel seco: falhas do papel, cerdas, captura e esgotamento |

Os oito kernels expõem quatro controles próprios, metadados de capacidade, início/fim de traço e limites de parâmetros. O mesmo código C integra o runtime WASM e o registro nativo Android.

## Registro dos presets

“Recalibrado” inclui ajustes de fluxo, textura, pressão, espalhamento, água, mistura ou estabilização conforme o material. “Textura fixa” mantém a escala da superfície ao mudar o tamanho da ferramenta. “Preservado” indica configuração adequada ao uso utilitário ou estilizado.

| Preset | Grupo | Resultado |
| --- | --- | --- |
| pencil | sketch | Recalibrado |
| soft_pencil | sketch | Recalibrado |
| mech_pencil | sketch | Recalibrado |
| blue_pencil | sketch | Recalibrado |
| conte | sketch | Recalibrado |
| washi_sketch | sketch | Recalibrado |
| studio_inker | ink | Recalibrado |
| inker | ink | Recalibrado |
| gpen | ink | Recalibrado |
| dry_ink | ink | Recalibrado |
| fountain | ink | Recalibrado |
| brush_pen | ink | Recalibrado |
| precision_liner | ink | Recalibrado |
| solid_vector | ink | Preservado |
| oil_impasto | paint | Recalibrado |
| oil | paint | Recalibrado |
| acrylic | paint | Recalibrado |
| wet_acrylic | paint | Recalibrado |
| gouache | paint | Recalibrado |
| palette_knife | paint | Recalibrado |
| watercolor | paint | Recalibrado |
| watercolor_granulating | paint | Recalibrado |
| wet_on_wet_bloom | paint | Recalibrado |
| sumie_wash | paint | Recalibrado |
| clear_water_wash | paint | Recalibrado |
| marker | marker | Recalibrado |
| brush_marker | marker | Recalibrado |
| highlighter | marker | Recalibrado |
| charcoal | charcoal | Recalibrado |
| hard_charcoal | charcoal | Recalibrado |
| pastel | charcoal | Recalibrado |
| charcoal_soft | charcoal | Recalibrado |
| soft_airbrush | airbrush | Recalibrado |
| airbrush | airbrush | Recalibrado |
| hard_airbrush | airbrush | Recalibrado |
| spray | airbrush | Recalibrado |
| pixel | fx | Preservado |
| halftone | fx | Preservado |
| crosshatch | fx | Preservado |
| neon_glow | fx | Preservado |
| paper_texture | texture | Textura fixa |
| canvas_texture | texture | Textura fixa |
| sponge_fx | texture | Textura fixa |
| grunge_distress | texture | Textura fixa |
| stucco_plaster | texture | Textura fixa |
| tree_bark_brush | texture | Textura fixa |
| cracked_mud | texture | Textura fixa |
| vintage_engraving | texture | Textura fixa |
| smudge | blend | Recalibrado |
| blend | blend | Recalibrado |
| rake_blend | blend | Recalibrado |
| hard_eraser | eraser | Recalibrado |
| soft_eraser | eraser | Recalibrado |
| textured_eraser | eraser | Preservado |
| tech_pen | sketch | Recalibrado |
| airbrush_continuous | airbrush | Recalibrado |
| calligraphy_chisel_dyn | ink | Recalibrado |
| streamline_inker_dyn | ink | Recalibrado |
| charcoal_expressive_dyn | charcoal | Recalibrado |
| wet_acrylic_smudge | paint | Recalibrado |
| salt_bloom_wash | paint | Recalibrado |
| wood_grain | texture | Textura fixa |
| sandpaper_grit | texture | Textura fixa |
| crackle_fissure | texture | Textura fixa |
| marble_veins | texture | Textura fixa |
| denim_fabric | texture | Textura fixa |

Aliases utilitários preservados: `fill`, `flood_fill`, `lasso`, `lasso_fill`, `pen`, `paint`, `round`, `square`, `calligraphy`, `chisel`, `hatch`, `scatter`.

## Registro dos kernels

| Kernel | Resultado |
| --- | --- |
| aurora_borealis | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| bioluminescence_jellyfish | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| biomimetic_gecko_setae | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| bristle_oil | Material existente revisado |
| calligraphy_ribbon | Material existente revisado |
| caustic_water_sunlight | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| cellular_automata_brians_brain | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| charcoal_chalk | Material existente revisado |
| chromatic_holo_warp | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| colored_pencil | Novo material natural |
| crystal_birefringence_calcite | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| crystal_growth_dendrite | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| dip_pen | Novo material natural |
| dragon_scale_armor | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| dry_flat_brush | Novo material natural |
| electric_discharge_kirlian | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| felt_marker | Novo material natural |
| ferroelectric_domain_walls | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| ferrofluid_magnetic | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| fiber_optic_strands | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| fluid_smoke_swirl | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| fractal_lightning | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| glitch_datamosh_matrix | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| gouache_flat | Novo material natural |
| graphite_pencil | Novo material natural |
| gravitational_lens_einstein | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| holographic_interference | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| holographic_stereogram | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| iridescent_soap_bubble | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| lichen_symbiosis | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| liquid_mercury_chrome | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| magma_crust_tectonic | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| magnetohydrodynamic_dynamo | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| metamaterial_invisibility | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| meteor_shower_bolide | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| moire_interference_silk | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| mycelium_hyphae | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| nebula_stellar_birth | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| neon_cyber_circuit | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| neon_glow | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| origami_kaleido | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| particle_spray | Material existente revisado |
| peacock_feather_barbules | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| pixel_dither | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| plasma_ball_arc | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| prismatic_refract_kaleidoscope | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| quantum_chroma_tunnel | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| quantum_probability_cloud | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| radioactive_cloud_chamber | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| reaction_diffusion | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| sand_dune_ripples | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| sand_sim | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| slime_mold_physarum | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| smoke_ring_vortex | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| soft_pastel | Novo material natural |
| solar_flare_prominence | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| sonoluminescence_bubble | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| soundwave_cymatics | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| superfluid_helium_vortices | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| supernova_shockwave | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| thermal_pyro | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| topographic_contour_isolines | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| voronoi_mosaic | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |
| watercolor_bleed | Material existente revisado |
| wax_crayon | Novo material natural |
| xray_radiography_bone | Efeito procedural/ilustrativo preservado; composição compartilhada corrigida |

## Evidência e reprodução

- Amostras de 12 materiais WASM em duas curvas de pressão: executar `node scripts/render-natural-brushes.js`; resultado em `artifacts/brush-review/natural-media.svg`.
- Folha dos 66 presets: `node scripts/generate-brush-comparison-sheet.js`. Compara o host JavaScript com chamadas diretas ao núcleo C compilado para WASM. Não é uma captura de dispositivo Android.
- A execução registrada das suítes de materiais, plugins WASM, física de pintura, persistência de presets e dinâmica completa terminou com 42 testes aprovados. Esse resultado antecede a última correção localizada do spray.
- Compilação Android release concluída após a correção do spray; APK: `esenho-pinceis-realistas.apk`. Não houve execução em dispositivo.
- Os casos de materiais cobrem pressão zero, transparência, preservação de cor, reinício de carga, borracha, limites de memória e captura de tinta.

## Limites

São aproximações locais de materiais. Captura de cor usa mistura RGB aproximada, não um modelo espectral; a aquarela WASM não resolve escoamento global de água. O ABI de dab não transmite inclinação contínua para esses kernels. As amostras usam eventos sintéticos; a sensação com uma caneta física e o desempenho em aparelhos Android precisam de avaliação no dispositivo.
