# Bancada desktop Kotlin

Bancada Linux para experimentar traços no mesmo núcleo C (`src/quadro.c`) usado pelo Android. É uma ferramenta de teste, não uma versão completa do editor: usa o pincel clássico, sem presets Android, pressão da caneta, camadas na interface ou arquivos de projeto.

Requisitos: JDK 17, compilador C, Linux e Gradle (o wrapper do Android é usado automaticamente). O script usa `JAVA_HOME` ou procura o JDK instalado para o projeto Android.

```sh
./desktop/run.sh                 # janela, documento 4096 × 4096
./desktop/run.sh 2048 2048       # tamanho personalizado
./desktop/run.sh --benchmark 4096 4096 1000
./desktop/run.sh --benchmark 4096 4096 1000 full  # cópia completa para comparação
./desktop/run.sh --benchmark 2048 2048 300 partial dynamic
./desktop/run.sh --benchmark 2048 2048 300 full dynamic  # recomposição completa por segmento
```

Arraste para desenhar; o botão direito apaga. O benchmark mede o núcleo e a transferência parcial para um array Java, sem exibição ou GPU. No modo dinâmico, `full` força a recomposição completa antes da atualização, simulando o caminho anterior do Android. Ele também compara o resultado parcial com uma renderização completa. Os números não representam a latência do Android ou da interface gráfica.
