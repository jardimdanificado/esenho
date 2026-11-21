package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.*
import java.util.Locale

@Composable
internal fun VectorSelectionPanel(engine: EsenhoEngine, revision: Int, onChanged: () -> Unit) {
    val selection = engine.vectors.selection
    val objects = selection.objects
    val editable = objects.isNotEmpty() && objects.none { it.locked || !it.visible }
    fun addGuide(vertical: Boolean) {
        val b = selection.bounds()
        val position = if (vertical) (b?.cx ?: engine.width / 2f) else (b?.cy ?: engine.height / 2f)
        val path =
            if (vertical)
                listOf(GuidePoint(position, 0f), GuidePoint(position, engine.height.toFloat()))
            else
                listOf(GuidePoint(0f, position), GuidePoint(engine.width.toFloat(), position))
        engine.canvasGuides.add(CanvasGuide(DrawingGuideType.LINE, listOf(path)))
        engine.activeCanvasGuideIndex = engine.canvasGuides.lastIndex
        engine.guideSnapEnabled = true
        if (!engine.snapToAllVisibleGuides) engine.snapGuideIndices.add(engine.canvasGuides.lastIndex)
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(
            checked = selection.additive,
            onCheckedChange = {
                selection.additive = it
                onChanged()
            },
        )
        Text("Adicionar/remover da seleção", style = MaterialTheme.typography.bodySmall)
    }
    Text(
        "Arraste uma área vazia para selecionar. Arraste as alças para escalar; o círculo para girar.",
        style = MaterialTheme.typography.bodySmall,
    )
    Row {
        TextButton(
            onClick = {
                selection.all()
                onChanged()
            }
        ) {
            Text("Todos")
        }
        TextButton(
            onClick = {
                selection.clear()
                onChanged()
            }
        ) {
            Text("Limpar")
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(
            checked = selection.snapEnabled,
            onCheckedChange = {
                selection.snapEnabled = it
                onChanged()
            },
        )
        Text("Encaixar: objetos, canvas e grade", style = MaterialTheme.typography.bodySmall)
    }
    if (selection.snapEnabled) {
        Row {
            listOf(8f, 16f, 32f).forEach { size ->
                WorkspaceChoiceChip(
                    selected = selection.gridSize == size,
                    onClick = {
                        selection.gridSize = size
                        onChanged()
                    },
                    label = { Text("${size.toInt()} px") },
                )
            }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(
            checked = engine.vectors.rulersVisible,
            onCheckedChange = {
                engine.vectors.rulersVisible = it
                onChanged()
            },
        )
        Text("Réguas", style = MaterialTheme.typography.bodySmall)
    }
    Text("Guias", style = MaterialTheme.typography.titleSmall)
    Text(
        "Arraste uma guia no canvas para reposicioná-la.",
        style = MaterialTheme.typography.bodySmall,
    )
    Row {
        TextButton(
            onClick = {
                addGuide(true)
                onChanged()
            },
            modifier = Modifier.weight(1f),
        ) {
            Text("Guia vertical", style = MaterialTheme.typography.labelSmall)
        }
        TextButton(
            onClick = {
                addGuide(false)
                onChanged()
            },
            modifier = Modifier.weight(1f),
        ) {
            Text("Guia horizontal", style = MaterialTheme.typography.labelSmall)
        }
    }
    TextButton(
        onClick = {
            engine.canvasGuides.clear()
            engine.snapGuideIndices.clear()
            engine.snapToAllVisibleGuides = false
            engine.activeCanvasGuideIndex = -1
            onChanged()
        },
    ) {
        Text("Remover guias")
    }
    Text("${objects.size} selecionado(s)", style = MaterialTheme.typography.titleSmall)
    if (objects.size > 1) {
        Text("Operações de área", style = MaterialTheme.typography.titleSmall)
        Text(
            "Subtrair remove os objetos da frente do objeto de trás. O resultado usa a aparência do objeto de trás.",
            style = MaterialTheme.typography.bodySmall,
        )
        VectorBooleanOperation.values().toList().chunked(2).forEach { row ->
            Row {
                row.forEach { operation ->
                    TextButton(
                        enabled = VectorBoolean.eligible(objects),
                        onClick = {
                            selection.boolean(operation)
                            onChanged()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(operation.label, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        if (!VectorBoolean.eligible(objects))
            Text(
                "Feche os caminhos e desbloqueie os objetos para combinar áreas.",
                style = MaterialTheme.typography.bodySmall,
            )
    }
    if (objects.size > 1 || objects.any { it.isClip }) {
        Text("Recortes vetoriais", style = MaterialTheme.typography.titleSmall)
        Text(
            "O objeto da frente recorta os demais selecionados. O recorte permanece editável.",
            style = MaterialTheme.typography.bodySmall,
        )
        Row {
            TextButton(
                enabled = editable && objects.size > 1,
                onClick = {
                    selection.createClip()
                    onChanged()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Criar recorte", style = MaterialTheme.typography.labelSmall)
            }
            TextButton(
                enabled = editable && objects.any { it.isClip },
                onClick = {
                    selection.releaseClip()
                    onChanged()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Liberar recorte", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
    val bounds = selection.bounds()
    if (bounds != null) {
        fun number(value: Float) = String.format(Locale.ROOT, "%.2f", value)
        var x by remember(bounds, selection.selectedIds) { mutableStateOf(number(bounds.left)) }
        var y by remember(bounds, selection.selectedIds) { mutableStateOf(number(bounds.top)) }
        var width by
            remember(bounds, selection.selectedIds) { mutableStateOf(number(bounds.width)) }
        var height by
            remember(bounds, selection.selectedIds) { mutableStateOf(number(bounds.height)) }
        var angle by remember(bounds, selection.selectedIds) { mutableStateOf("0") }
        var skewX by remember(bounds, selection.selectedIds) { mutableStateOf("0") }
        var skewY by remember(bounds, selection.selectedIds) { mutableStateOf("0") }
        var pivotX by remember { mutableStateOf("50") }
        var pivotY by remember { mutableStateOf("50") }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VectorNumber("X", x, { x = it }, Modifier.weight(1f))
            VectorNumber("Y", y, { y = it }, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VectorNumber("Largura", width, { width = it }, Modifier.weight(1f))
            VectorNumber("Altura", height, { height = it }, Modifier.weight(1f))
        }
        VectorNumber("Girar seleção (graus)", angle, { angle = it }, Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VectorNumber("Inclinar X (graus)", skewX, { skewX = it }, Modifier.weight(1f))
            VectorNumber("Inclinar Y (graus)", skewY, { skewY = it }, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VectorNumber("Pivô X (%)", pivotX, { pivotX = it }, Modifier.weight(1f))
            VectorNumber("Pivô Y (%)", pivotY, { pivotY = it }, Modifier.weight(1f))
        }
        val values =
            listOf(x, y, width, height, angle, pivotX, pivotY, skewX, skewY).map {
                it.replace(',', '.').toFloatOrNull()?.takeIf(Float::isFinite)
            }
        OutlinedButton(
            enabled =
                editable &&
                    values.all { it != null } &&
                    (values[2] ?: -1f) >= 0 &&
                    (values[3] ?: -1f) >= 0,
            onClick = {
                selection.transform(
                    values[0]!!,
                    values[1]!!,
                    values[2]!!,
                    values[3]!!,
                    values[4]!!,
                    values[5]!! / 100f,
                    values[6]!! / 100f,
                    values[7]!!,
                    values[8]!!,
                )
                onChanged()
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Aplicar transformação")
        }
        if (objects.size == 1) {
            var name by
                remember(objects.first().id, objects.first().name) {
                    mutableStateOf(objects.first().name)
                }
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Nome") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(
                enabled = editable,
                onClick = {
                    selection.rename(name)
                    onChanged()
                },
            ) {
                Text("Renomear")
            }
        }
        Row {
            TextButton(
                enabled = editable && objects.size > 1,
                onClick = {
                    selection.group()
                    onChanged()
                },
            ) {
                Text("Agrupar")
            }
            TextButton(
                enabled = editable && objects.any { it.groupId != null },
                onClick = {
                    selection.ungroup()
                    onChanged()
                },
            ) {
                Text("Desagrupar")
            }
        }
        Row {
            TextButton(
                enabled = editable,
                onClick = {
                    selection.reorder(false)
                    onChanged()
                },
            ) {
                Text("Ao fundo")
            }
            TextButton(
                enabled = editable,
                onClick = {
                    selection.reorder(true)
                    onChanged()
                },
            ) {
                Text("À frente")
            }
        }
        Row {
            TextButton(
                enabled = editable,
                onClick = {
                    selection.reorderRelative(false)
                    onChanged()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Recuar", style = MaterialTheme.typography.labelSmall)
            }
            TextButton(
                enabled = editable,
                onClick = {
                    selection.reorderRelative(true)
                    onChanged()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Avançar", style = MaterialTheme.typography.labelSmall)
            }
            TextButton(
                enabled = editable,
                onClick = {
                    selection.flip(true)
                    onChanged()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Espelhar H", style = MaterialTheme.typography.labelSmall)
            }
            TextButton(
                enabled = editable,
                onClick = {
                    selection.flip(false)
                    onChanged()
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Espelhar V", style = MaterialTheme.typography.labelSmall)
            }
        }
        if (objects.size > 1) {
            Text("Alinhar seleção", style = MaterialTheme.typography.titleSmall)
            listOf(
                    listOf("left" to "Esquerda", "center" to "Centro H", "right" to "Direita"),
                    listOf("top" to "Topo", "middle" to "Centro V", "bottom" to "Base"),
                )
                .forEach { row ->
                    Row {
                        row.forEach { (axis, label) ->
                            TextButton(
                                enabled = editable,
                                onClick = {
                                    selection.align(axis)
                                    onChanged()
                                },
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(2.dp),
                            ) {
                                Text(label, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            Row {
                TextButton(
                    enabled = editable && objects.size > 2,
                    onClick = {
                        selection.distribute(true)
                        onChanged()
                    },
                ) {
                    Text("Distribuir H")
                }
                TextButton(
                    enabled = editable && objects.size > 2,
                    onClick = {
                        selection.distribute(false)
                        onChanged()
                    },
                ) {
                    Text("Distribuir V")
                }
            }
        }
    }
    Row {
        TextButton(
            enabled = objects.isNotEmpty(),
            onClick = {
                selection.copy()
                onChanged()
            },
        ) {
            Text("Copiar")
        }
        TextButton(
            onClick = {
                selection.paste()
                onChanged()
            }
        ) {
            Text("Colar")
        }
    }
    Text("Cópia interna de objetos vetoriais.", style = MaterialTheme.typography.bodySmall)
}

@Composable
internal fun VectorNumber(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier,
) {
    val valid = value.replace(',', '.').toFloatOrNull()?.isFinite() == true
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        isError = !valid,
        modifier = modifier,
    )
}
