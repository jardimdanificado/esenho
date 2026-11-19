# Modo 3D — desenho de arquitetura

## Objetivo

Tornar `.obj` para modelagem 3D o que `.svg` é para o modo vetorial: geometria editável é a fonte da verdade, pixels na camada nativa são cache de renderização. O modelo 3D deve passar pelo mesmo pipeline de camadas, undo, projeto e exportação que o vetor usa hoje.

**Estado:** Fases 1 a 4 implementadas. A portagem do rasterizador para C foi avaliada e adiada: a perfilagem no desktop dá ~9 ms para um frame completo de 512×512 com 352 triângulos e ~39 ms para 30 frames de preview em meia resolução. Em 1080p o preview fica perto de 18 ms/frame, aceitável sem JNI extra. O contínuo `MeshProfiler` e o comando `esenho.mesh.stats()` permitem reavaliar se modelos maiores mudarem esse quadro.

## Principio de integração

O modo vetorial já estabelece o padrão (`VectorWorkspace.kt`):

1. Objetos editáveis em memória com serialização JSON (`VectorObject.json/read`, `VectorWorkspace.kt:211-291`).
2. Renderização em Kotlin para um `Bitmap` ARGB do tamanho do canvas (`VectorWorkspace.render`, `VectorWorkspace.kt:1799-2037`).
3. Injeção do bitmap na camada nativa com `nativeBeginLayerUpdate` / `nativeLayerClear` / `nativeLayerDrawBitmap` / `nativeEndLayerUpdate`.
4. Histórico próprio ligado ao undo nativo (`record`/`restoreHistory`, `VectorWorkspace.kt:557-571`; `EsenhoEngine.pushUndoSnapshot`, `EsenhoEngine.kt:4060-4091`).
5. Serialização no projeto por chave aditiva (`EsenhoProjectIO.kt:148,226,460`; formato 8, `optJSONObject` com padrão `{}`).
6. Metadados no formato de intercâmbio para roundtrip sem perda (`<metadata id="esenho-vector">`, `VectorWorkspace.kt:2183`; `VectorSvgIO.kt:25-57`).

O modo 3D segue exatamente esse desenho, trocando `VectorWorkspace` por `MeshWorkspace` e `SvgDocumentReader/VectorSvgIO` por `ObjReader/ObjIO`.

## O que o motor nativo já oferece e o que falta

Compilados no Android e no desktop (`android/app/src/main/cpp/CMakeLists.txt:33-39`, `desktop/CMakeLists.txt:11-13`): `src/quadro.c` e os plugins/pincéis gerados.

- Existe: camadas ARGB com opacidade, visibilidade, blend e clipping (`quadro.c:34-46`); leitura/escrita de bitmap por camada (`EsenhoNativeBridge.kt:106,141`); desenho de forma 2D com matriz afim 2×3 (`EsenhoNativeBridge.kt:109-110`, `quadro.c:2520-2559`); `w_render` compõe camadas em `out_pixels` (`quadro.c:3218-3221`).
- Não existe: matriz 4×4, câmera com projeção, z-buffer, rasterização de triângulos, cor por vértice, textura por face. O `w_anim_mesh_*` atual é um grid 2D de FFD com `w_anim_mesh_render` como stub (`quadro.c:4844-4867,5184-5257`); `z_depth` em keyframes nunca é usado pelo compositor.
- A ponte JNI não expõe nenhuma API 3D (`EsenhoNativeBridge.kt` inteiro). `android.graphics.Camera` existe no SDK mas não é usado no repo.

Consequência: a primeira versão deve rasterizar em Kotlin, dentro do mesmo `Bitmap` que o vetor já usa. Isso evita mexer em ABI, JNI e CMake e mantém um único código compartilhado Android/desktop via `desktop/prepare-sources.py`. A portagem do hot path para C é uma otimização posterior, guiada por perfilagem.

## Modelo de dados

Arquivos novos em `android/app/src/main/java/app/esenho/nativeengine/mesh3d/`:

```
Vec3.kt           x, y, z + operações (add, sub, scale, dot, cross, normalize)
Mat4.kt           multiplicação, translate/rotate/scale, lookAt, perspective/ortho, invert
Camera3D.kt       posição, alvo, up, fov, near, far, projeção, viewport
MeshMaterial.kt   diffuse/specular/ambient, shininess, opacity, textura (PNG base64)
Mesh3DObject.kt   id, nome, visível, bloqueado, groupId, vértices, normais, UVs, faces, material, transform
Scene3D.kt        câmera, luzes, config de render, lista de objetos
MeshWorkspace.kt  estado, tools, histório, render, IO, overlay
MeshSelection.kt  seleção de objeto/vértice/aresta/face, gizmos, pick por raio
```

`Mesh3DObject` espelha `VectorObject`:

```kotlin
data class Mesh3DObject(
    val id: String,
    val vertices: MutableList<Vec3> = mutableListOf(),
    val normals: MutableList<Vec3> = mutableListOf(),
    val uvs: MutableList<Pair<Float, Float>> = mutableListOf(),
    val faces: MutableList<MeshFace> = mutableListOf(),
    var material: MeshMaterial = MeshMaterial(),
    var name: String = "",
    var visible: Boolean = true,
    var locked: Boolean = false,
    var groupId: String? = null,
    var transform: MeshTransform = MeshTransform(),
)
data class MeshFace(val v: IntArray, val vt: IntArray, val vn: IntArray, var material: Int = 0)
```

`json()` / `read()` com `optXxx(key, default)` para compatibilidade, igual `VectorObject.read` (`VectorWorkspace.kt:244-291`). Índices negativos do OBJ são normalizados na leitura.

`MeshTransform` guarda translação, rotação (quaternion para evitar gimbal lock) e escala. Animar essas propriedades depois reusa o padrão de `VectorAnimation`.

## Subconjunto OBJ (equivalente ao subconjunto SVG)

### Importação (`ObjReader`)

Aceitar:

- `v x y z [w]`, `vn x y z`, `vt u v [w]`.
- `f` com índices `v`, `v/vt`, `v//vn`, `v/vt/vn`, incluindo negativos.
- `g`, `o`, `s`, `usemtl`, `mtllib` (MTL básico: `Ka`, `Kd`, `Ks`, `Ns`, `d`, `illum`, `map_Kd`).
- Comentários `#`.

Rejeitar com erro atômico (documento intacto), como `SvgDocumentReader.fail` (`SvgDocumentReader.kt:58`):

- Curvas e superfícies (`cstype`, `deg`, `bparam`, `surf`, `curv`), NURBS.
- MTL com mapas avançados (normal, bump, displacement, PBR `Pr/Pm/Ps`/metallic-roughness).
- Mais de um conjunto de UV por face, faces não triangulares após fan triangulation (na prática, triangulate na leitura).
- Arquivos acima de um limite (ex.: 200 000 vértices / 400 000 triângulos), análogo ao limite de 20 000 objetos SVG.

`usemtl` ausente usa material padrão. Vértices sem normal recebem normal calculada por face.

### Exportação (`ObjIO`)

- `.obj` padrão com `v/vn/vt/f`, `o`, `g`, `usemtl`.
- `.mtl` opcional com materiais básicos.
- Roundtrip sem perda: linhas de comentário `# esenho3d <base64(JSON)>` no início do arquivo, análogo ao `<metadata>` do SVG. Importador lê esse comentário primeiro; se ausente, faz parse geométrico simples. Isso preserva transform, câmera, luzes, seleção e animação.
- "Exportar com aparência" equivalente: gravar PNG do resultado renderizado + `.obj`, como `exportSvg(appearance=true)` incorpora bitmap por camada.

## Pipeline de renderização

`MeshWorkspace.render()` espelha `VectorWorkspace.render()`:

1. `nativeBeginLayerUpdate()`; limpar a camada 3D.
2. Para cada objeto visível:
   - `model = translate * rotate * scale` do objeto.
   - `view = lookAt(camera.position, camera.target, camera.up)`.
   - `projection = perspective(fov, aspect, near, far)` ou `orthographic`.
   - `clip = projection * view * model`; transformar vértices para space de clip.
   - Clipar triângulos contra `near` (Sutherland–Hodgman no triângulo); dividir por `w` para coordenadas de tela.
3. Rasterizador de triângulos em Kotlin:
   - `zBuffer = FloatArray(width*height)` inicializado com `Infinity`, cacheado entre renders.
   - Função de aresta barycêntrica; interpolar `1/z` de forma perspective-correct para UV e normais.
   - Depth test por pixel (`z < zBuffer[i]`), escrever cor no `IntArray` ARGB.
   - Shading: `ambient + Σ luminância difusa (Lambert) + especular (Blinn-Phong)`; modo `flat` usa normal da face, modo `smooth` interpola `vn`.
   - Textura `map_Kd`: amostragem bilinear do PNG decodificado, mesma abstração `Bitmap` do vetor.
   - Backface culling opcional; wireframe desenha arestas com `Canvas.drawLine` após o passo de profundidade.
4. Escrever o `IntArray` no `Bitmap` da camada (`setPixels`), depois `nativeLayerDrawBitmap(layer, bitmap, 0,0,w,h)`.
5. `nativeEndLayerUpdate()`; `engine.captureCurrentFrame()`; `engine.getRenderBitmap()`.

O modo 3D ocupa uma camada nativa própria, criada por `switchMode(3D)` da mesma forma que `switchMode(true)` cria a camada "Vetores" (`VectorWorkspace.kt:456-483`). Camadas raster e vetoriais continuam existindo e compondo normalmente; rasterizar a camada 3D equivale a congelar o bitmap, como `VectorWorkspace.rasterize()` (`VectorWorkspace.kt:1510`).

### Desempenho

- Rasterizar só a bbox projetada de cada objeto, não o canvas inteiro.
- Reutilizar `zBuffer` e `IntArray` entre renders; realocar só quando o documento muda de tamanho.
- Durante órbita, renderizar em meia resolução com buffers de pixels/profundidade reaproveitados, e fazer o render final ao soltar. O undo é gravado uma vez no início do gesto, nunca a cada movimento — snapshots nativos por movimento eram o maior custo.
- Ordenar triângulos por profundidade média como otimização secundária; o z-buffer já garante correção.
- Se perfilagem mostrar gargalo, portar o loop de rasterização para `w_mesh3d_render` em `src/quadro.c` e expor via JNI — a ABI e o modelo de dados já estarão estáveis.

## Ferramentas e interação

`MeshTool` análogo a `VectorTool` (`VectorWorkspace.kt:12-26`):

| Ferramenta | Ação |
|---|---|
| `SELECT` | clicar objeto/face/vértice/aresta; marquee; Shift adiciona |
| `ORBIT` | arrastar para girar câmera em torno do alvo |
| `PAN` / `ZOOM` | deslocar câmera / distance ou fov |
| `MOVE` / `ROTATE` / `SCALE` | gizmo deTransform no objeto selecionado |
| `VERTEX` / `FACE` | editar vértices e faces diretamente |
| `EXTRUDE` | extrudar face selecionada |
| `PRIMITIVE` | cubo, plano, cilindro, esfera |
| `IMPORT` | abrir `.obj`/`.mtl` |

Picking usa ray–triangle (Möller–Trumbore) no espaço do mundo, com o raio construído a partir da câmera e da posição do ponteiro — mais confiável que ler o z-buffer para seleção. Gizmos são desenhados no overlay projetando os extremos dos eixos 3D e usando o mesmo padrão de `drawOverlay` do vetor (`VectorWorkspace.kt:2039-2139`).

Painéis (novo `ui/components/MeshWorkspaceControls.kt`) seguem `VectorWorkspaceControls.kt`: tool strip no dock inferior, painel de objeto com transform/material, painel de cena com câmera/luzes/modo de render, lista de objetos com olho/cadeado.

## Integração no editor

- `EsenhoEngine`: `val meshes = MeshWorkspace(this)` ao lado de `val vectors` (`EsenhoEngine.kt:661`); reset em `initEngine` (`EsenhoEngine.kt:1146`).
- Undo: `beginMeshEdit() = pushUndoSnapshot()`; `pushUndoSnapshot` registra também `meshes.record(token)` (`EsenhoEngine.kt:4090`); `undo`/`redo` chamam `meshes.restoreHistory` (`EsenhoEngine.kt:4397,4429`).
- Touch: `onTouchDown/Move/Up` despacha para `meshes` quando o modo 3D estiver ativo (`EsenhoEngine.kt:3260,3380,3487`).
- Projeto: `EsenhoProjectIO.Snapshot.meshWorkspace: String = "{}"`; grava em `capture` (`EsenhoProjectIO.kt:148`) e lê com `optJSONObject` em `load` (`EsenhoProjectIO.kt:460`). Nenhuma mudança de formato necessária — chave aditiva com padrão, como `vectorWorkspace`.
- UI: `WorkspacePanel.MESH` (`Workspace.kt:37-47`), chips Raster/Vetor/3D em `NativePainterActivity.kt:1686-1693`, import/export OBJ em `:1695-1707`, atalhos em `DesktopShortcuts.kt` + `prepare-sources.py`.
- Script: namespace `esenho.mesh` em `NativeScriptExtendedApi` (`vector.*` em `:357,583-586` é o modelo), com `import`, `export`, `create`, `transform`, `camera`, `render`.

## Fases e critério de parada

1. **Base**: `Vec3/Mat4/Camera3D`, `Mesh3DObject/Scene3D`, `ObjReader` (v/vn/vt/f, negativos, MTL básico), rasterizador de triângulo com z-buffer e shading plano, integração na camada nativa, snapshot/undo/projeto.
   - Pronto quando: importar um `.obj` de cubo, ver o cubo renderizado na camada, salvar/reabrir `.esenho`, desfazer/refazer.
2. **Câmera e seleção**: órbita/pan/zoom, pick por raio, seleção de objeto/face/vértice, gizmos de translação/rotação/escala.
   - Pronto quando: girar a câmera, selecionar uma face e movê-la com o gizmo, mantendo undo.
3. **Edição e aparência**: primitivas, extrude, edição de vértice/face, normais suaves, textura `map_Kd`, wireframe, export `.obj`/`.mtl` com metadados.
   - Pronto quando: criar, editar, texturizar e exportar um modelo com roundtrip integral.
4. **Avançado (opcional)**: booleanas de malha, keyframes de transform/câmera/luz reaproveitando `VectorAnimation`, portagem do rasterizador para C, LOD/preview.

## Riscos

- **Custo por pixel em Kotlin**: mitigado por bbox, cache de buffers e preview em baixa resolução durante gestos; portar para C só se perfilagem justificar.
- **Formato de pixel da camada nativa**: o bitmap é ARGB premultiplicado; o rasterizador deve escrever no mesmo formato usado por `Bitmap.setPixels` no vetor.
- **Robustez do OBJ**: limites de tamanho, índices negativos, faces degeneradas e MTL ausente precisam de validação explícita e erro atômico, como o leitor SVG faz.
- **Interação com o modo vetorial**: os dois modos não devem ser simultâneos no mesmo instante; `switchMode` desativa o outro e preserva o estado de cada um no snapshot.
