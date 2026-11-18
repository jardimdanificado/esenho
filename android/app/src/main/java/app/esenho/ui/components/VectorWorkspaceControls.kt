package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.*
import java.util.Locale

private fun vectorIcon(tool: VectorTool): ImageVector =
    when (tool) {
        VectorTool.DRAW -> Icons.Default.Brush
        VectorTool.PEN -> PenToolIcon
        VectorTool.SELECT -> Icons.Default.NearMe
        VectorTool.NODES -> Icons.Default.Polyline
        VectorTool.LINE -> Icons.Default.HorizontalRule
        VectorTool.RECT -> Icons.Default.CropSquare
        VectorTool.ELLIPSE -> Icons.Default.RadioButtonUnchecked
        VectorTool.ERASER -> Icons.Default.DeleteOutline
        VectorTool.TEXT -> Icons.Default.TextFields
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VectorToolButton(
    checked: Boolean,
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(label) } },
        state = rememberTooltipState(),
    ) {
        FilledIconToggleButton(
            checked = checked,
            onCheckedChange = { onClick() },
            modifier = Modifier.size(38.dp),
        ) {
            Icon(icon, label, Modifier.size(20.dp))
        }
    }
}

/** Tools occupy the existing bottom dock; document actions live in the project menu. */
@Composable
fun EditorToolStrip(
    engine: EsenhoEngine,
    revision: Int,
    onTool: (ToolMode) -> Unit,
    onHide: () -> Unit,
    onChanged: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                if (engine.vectors.enabled) {
                    VectorTool.values().forEach { tool ->
                        VectorToolButton(
                            engine.vectors.tool == tool && engine.currentTool == ToolMode.BRUSH,
                            tool.label,
                            vectorIcon(tool),
                        ) {
                            engine.cancelActiveStroke()
                            engine.vectors.finishPen()
                            engine.vectors.tool = tool
                            engine.currentTool = ToolMode.BRUSH
                            onChanged()
                        }
                    }
                    listOf(
                            ToolMode.EYEDROPPER to Icons.Default.Colorize,
                            ToolMode.PAN to Icons.Default.PanTool,
                        )
                        .forEach { (tool, icon) ->
                            VectorToolButton(engine.currentTool == tool, tool.displayName, icon) {
                                engine.cancelActiveStroke()
                                engine.currentTool = tool
                                onChanged()
                            }
                        }
                } else {
                    ToolMode.values().forEach { tool ->
                        VectorToolButton(
                            engine.currentTool == tool,
                            tool.displayName,
                            workspaceToolIcon(tool),
                        ) {
                            onTool(tool)
                        }
                    }
                }
                Text(
                    if (engine.vectors.enabled && engine.currentTool == ToolMode.BRUSH)
                        engine.vectors.tool.label
                    else engine.currentTool.displayName,
                    modifier =
                        Modifier.align(Alignment.CenterVertically).padding(horizontal = 12.dp),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            IconButton(onClick = onHide, modifier = Modifier.size(38.dp)) {
                Icon(Icons.Default.ExpandMore, "Ocultar ferramentas", Modifier.size(20.dp))
            }
        }
    }
}

@Composable
fun VectorObjectPanel(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
    onColor: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val vector = engine.vectors
    val selected = vector.selected
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        EditorPanelHeader("Objetos vetoriais", onDismiss)
        Text(
            "${vector.tool.label} · ${vector.layers.values.sumOf { it.size }} objetos",
            style = MaterialTheme.typography.labelMedium,
        )
        if (vector.tool == VectorTool.PEN) {
            Text(
                "Clique para adicionar nós. Arraste para orientar as alças.",
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedButton(
                onClick = {
                    vector.finishPen()
                    vector.selectedId = null
                    onChanged()
                }
            ) {
                Text("Novo caminho")
            }
        }
        if (vector.tool == VectorTool.SELECT) {
            VectorSelectionPanel(engine, revision, onChanged)
            HorizontalDivider()
        }
        if (selected != null && !selected.locked && selected.visible) {
            Text("Aparência do objeto", style = MaterialTheme.typography.titleSmall)
            if (selected.text != null) {
                Text("Texto vetorial", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = selected.text!!,
                    onValueChange = {
                        vector.setTextContent(it)
                        onChanged()
                    },
                    label = { Text("Conteúdo") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
                Text("Fonte", style = MaterialTheme.typography.bodySmall)
                Row {
                    listOf(
                            "sans-serif" to "Sem serifa",
                            "serif" to "Serifa",
                            "monospace" to "Monoespaçada",
                        )
                        .forEach { (value, label) ->
                            FilterChip(
                                selected = selected.fontFamily == value,
                                onClick = {
                                    vector.setFontFamily(value)
                                    onChanged()
                                },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                                modifier = Modifier.padding(end = 4.dp),
                            )
                        }
                }
                Text("Tamanho: ${selected.fontSize.toInt()} px")
                Slider(
                    value = selected.fontSize.coerceIn(4f, 200f),
                    valueRange = 4f..200f,
                    onValueChange = {
                        vector.setFontSize(it)
                        onChanged()
                    },
                )
                var spacing by
                    remember(selected.id) {
                        mutableStateOf(String.format(Locale.ROOT, "%.1f", selected.letterSpacing))
                    }
                val spacingValue = spacing.replace(',', '.').toFloatOrNull()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    VectorNumber("Espaçamento", spacing, { spacing = it }, Modifier.weight(1f))
                    TextButton(
                        enabled = spacingValue != null && spacingValue.isFinite(),
                        onClick = {
                            vector.setLetterSpacing(spacingValue!!)
                            onChanged()
                        },
                    ) {
                        Text("Aplicar")
                    }
                }
                Text("Alinhamento", style = MaterialTheme.typography.bodySmall)
                Row {
                    listOf("left" to "Esquerda", "center" to "Centro", "right" to "Direita")
                        .forEach { (value, label) ->
                            FilterChip(
                                selected = selected.textAlign == value,
                                onClick = {
                                    vector.setTextAlign(value)
                                    onChanged()
                                },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                                modifier = Modifier.padding(end = 4.dp),
                            )
                        }
                }
                val paths =
                    vector.layers.values.flatten().filter {
                        it.id != selected.id && it.text == null && it.nodes.size > 1
                    }
                var pathMenu by remember { mutableStateOf(false) }
                val pathLabel =
                    selected.pathId?.let { id ->
                        paths.firstOrNull { it.id == id }?.name?.ifBlank { "Caminho" } ?: id
                    } ?: "Nenhum"
                Button(onClick = { pathMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Texto sobre caminho: $pathLabel")
                }
                DropdownMenu(expanded = pathMenu, onDismissRequest = { pathMenu = false }) {
                    DropdownMenuItem(
                        text = { Text("Nenhum") },
                        onClick = {
                            vector.setTextPath(null)
                            pathMenu = false
                            onChanged()
                        },
                    )
                    paths.forEach { path ->
                        DropdownMenuItem(
                            text = { Text(path.name.ifBlank { "Caminho" }) },
                            onClick = {
                                vector.setTextPath(path.id)
                                pathMenu = false
                                onChanged()
                            },
                        )
                    }
                }
                OutlinedButton(
                    onClick = {
                        vector.convertTextToCurves()
                        onChanged()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Converter em curvas")
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = selected.style.optBoolean("strokeEnabled", true),
                    onCheckedChange = { value ->
                        vector.changeAppearance { it.style.put("strokeEnabled", value) }
                        onChanged()
                    },
                )
                Text("Contorno")
            }
            if (selected.subPaths.isNotEmpty())
                Text(
                    "${selected.geometry().size} contornos no mesmo objeto",
                    style = MaterialTheme.typography.bodySmall,
                )

            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedButton(
                    onClick = {
                        vector.editFillColor = false
                        onColor(false)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Box(
                        Modifier.size(18.dp)
                            .background(
                                Color(selected.style.optInt("color", engine.currentColor)),
                                CircleShape,
                            )
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Cor do contorno")
                }
                OutlinedButton(
                    onClick = { onColor(true) },
                    enabled = selected.closed || selected.style.optBoolean("svgStroke", false),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Box(
                        Modifier.size(18.dp)
                            .background(Color(selected.fill ?: 0), CircleShape)
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Cor do preenchimento")
                }
            }
            Text("Espessura: ${selected.style.optDouble("size",14.0).toInt()} px")
            Slider(
                value = selected.style.optDouble("size", 14.0).toFloat().coerceIn(1f, 100f),
                valueRange = 1f..100f,
                onValueChange = { value ->
                    vector.setObjectSize(value)
                    onChanged()
                },
                onValueChangeFinished = { vector.finishAppearanceEdit() },
            )
            Text("Opacidade: ${(selected.style.optDouble("opacity",1.0)*100).toInt()}%")
            Slider(
                value = selected.style.optDouble("opacity", 1.0).toFloat().coerceIn(0f, 1f),
                valueRange = 0f..1f,
                onValueChange = { value ->
                    vector.setObjectOpacity(value)
                    onChanged()
                },
                onValueChangeFinished = { vector.finishAppearanceEdit() },
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = selected.closed,
                    onCheckedChange = { value ->
                        vector.changeAppearance {
                            it.closed = value
                            it.subPaths.forEach { c -> c.closed = value }
                        }
                        onChanged()
                    },
                )
                Text("Caminho fechado")
            }
            if (selected.closed || selected.style.optBoolean("svgStroke", false))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = selected.fill != null,
                        onCheckedChange = { value ->
                            vector.changeAppearance {
                                it.fill = if (value) engine.currentColor else null
                            }
                            onChanged()
                        },
                    )
                    Text("Preenchimento")
                }
            if (selected.closed || selected.style.optBoolean("svgStroke", false)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = selected.fillBrush,
                        onCheckedChange = {
                            vector.setBrushFill(it)
                            onChanged()
                        },
                    )
                    Text("Preenchimento com pincel", style = MaterialTheme.typography.bodySmall)
                }
                @Composable
                fun FilterPicker(label: String, current: VectorFilter?, apply: (VectorFilter?) -> Unit) {
                    var expanded by remember { mutableStateOf(false) }
                    Button(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                        Text("$label: ${current?.id ?: "Nenhum"}")
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        DropdownMenuItem(
                            text = { Text("Nenhum") },
                            onClick = {
                                apply(null)
                                expanded = false
                                onChanged()
                            },
                        )
                        engine.filterCatalog.forEach { filter ->
                            DropdownMenuItem(
                                text = { Text(filter.title) },
                                onClick = {
                                    apply(
                                        VectorFilter(
                                            filter.id,
                                            filter.params.getOrNull(0)?.currentVal ?: 0,
                                            filter.params.getOrNull(1)?.currentVal ?: 0,
                                        )
                                    )
                                    expanded = false
                                    onChanged()
                                },
                            )
                        }
                    }
                }
                FilterPicker("Filtro do preenchimento", selected.fillFilter) {
                    vector.setObjectFilter("fill", it)
                }
                FilterPicker("Filtro do contorno", selected.strokeFilter) {
                    vector.setObjectFilter("stroke", it)
                }
            }
            if (selected.style.optBoolean("svgStroke", false)) {
                Text(
                    "Terminações e junções do contorno SVG",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text("Terminação", style = MaterialTheme.typography.bodySmall)
                Row {
                    listOf("butt" to "Butt", "round" to "Redonda", "square" to "Quadrada")
                        .forEach { (value, label) ->
                            FilterChip(
                                selected = selected.style.optString("cap", "round") == value,
                                onClick = {
                                    vector.setObjectCap(value)
                                    onChanged()
                                },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                                modifier = Modifier.padding(end = 4.dp),
                            )
                        }
                }
                Text("Junção", style = MaterialTheme.typography.bodySmall)
                Row {
                    listOf("miter" to "Mitre", "round" to "Redonda", "bevel" to "Chanfro")
                        .forEach { (value, label) ->
                            FilterChip(
                                selected = selected.style.optString("join", "round") == value,
                                onClick = {
                                    vector.setObjectJoin(value)
                                    onChanged()
                                },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                                modifier = Modifier.padding(end = 4.dp),
                            )
                        }
                }
                if (selected.style.optString("join", "round") == "miter") {
                    var miter by
                        remember(selected.id) {
                            mutableStateOf(
                                String.format(
                                    Locale.ROOT,
                                    "%.1f",
                                    selected.style.optDouble("miter", 4.0),
                                )
                            )
                        }
                    val miterValue = miter.replace(',', '.').toFloatOrNull()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        VectorNumber("Limite do mitre", miter, { miter = it }, Modifier.weight(1f))
                        TextButton(
                            enabled =
                                miterValue != null && miterValue.isFinite() && miterValue >= 1f,
                            onClick = {
                                vector.setObjectMiter(miterValue!!)
                                onChanged()
                            },
                        ) {
                            Text("Aplicar")
                        }
                    }
                }
            }
            OutlinedButton(
                onClick = {
                    vector.applyStyle()
                    onChanged()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Aplicar pincel atual ao contorno")
            }
            HorizontalDivider()
            Text("Conversões", style = MaterialTheme.typography.titleSmall)
            Row {
                TextButton(
                    onClick = {
                        vector.outlineStroke()
                        onChanged()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Contorno em área", style = MaterialTheme.typography.labelSmall)
                }
                TextButton(
                    onClick = {
                        vector.simplify()
                        onChanged()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Simplificar", style = MaterialTheme.typography.labelSmall)
                }
            }
            var threshold by remember { mutableStateOf("128") }
            val thresholdValue = threshold.toIntOrNull()
            Row(verticalAlignment = Alignment.CenterVertically) {
                VectorNumber("Limiar da vetorização", threshold, { threshold = it }, Modifier.weight(1f))
                TextButton(
                    enabled = thresholdValue != null && thresholdValue in 1..255,
                    onClick = {
                        vector.traceLayer(thresholdValue!!)
                        onChanged()
                    },
                ) {
                    Text("Vetorizar camada")
                }
            }
            Text(
                "A vetorização lê os pixels opacos da camada ativa e cria caminhos fechados.",
                style = MaterialTheme.typography.bodySmall,
            )
            if (vector.tool == VectorTool.NODES) {
                Text("Nós e alças", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Selecione uma âncora ou alça no canvas.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Row {
                    TextButton(
                        onClick = {
                            vector.splitSegment()
                            onChanged()
                        }
                    ) {
                        Text("Inserir nó")
                    }
                    TextButton(
                        enabled = vector.selectedNode != null,
                        onClick = {
                            vector.removeNode()
                            onChanged()
                        },
                    ) {
                        Text("Excluir nó")
                    }
                }
                Text("Tipo do nó", style = MaterialTheme.typography.bodySmall)
                Row {
                    VectorNodeType.values().forEach { type ->
                        FilterChip(
                            enabled = vector.selectedNode != null,
                            selected = vector.selectedNode?.type == type,
                            onClick = {
                                vector.setNodeType(type)
                                onChanged()
                            },
                            label = { Text(type.label, style = MaterialTheme.typography.labelSmall) },
                            modifier = Modifier.padding(end = 4.dp),
                        )
                    }
                }
                vector.selectedNode?.let { node ->
                    var nodeX by
                        remember(vector.selected?.id, vector.selectedNodeIndex) {
                            mutableStateOf(String.format(Locale.ROOT, "%.2f", node.x))
                        }
                    var nodeY by
                        remember(vector.selected?.id, vector.selectedNodeIndex) {
                            mutableStateOf(String.format(Locale.ROOT, "%.2f", node.y))
                        }
                    val xValue = nodeX.replace(',', '.').toFloatOrNull()
                    val yValue = nodeY.replace(',', '.').toFloatOrNull()
                    Text("Posição do nó", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        VectorNumber("X", nodeX, { nodeX = it }, Modifier.weight(1f))
                        VectorNumber("Y", nodeY, { nodeY = it }, Modifier.weight(1f))
                    }
                    TextButton(
                        enabled =
                            xValue != null && yValue != null && xValue.isFinite() && yValue.isFinite(),
                        onClick = {
                            vector.moveNode(xValue!!, yValue!!)
                            onChanged()
                        },
                    ) {
                        Text("Mover nó")
                    }
                    Text("Pressão do nó: ${(node.pressure*100).toInt()}%")
                    Slider(
                        value = node.pressure.coerceIn(.01f, 1f),
                        valueRange = .01f..1f,
                        onValueChange = { value ->
                            vector.changeSelected { node.pressure = value }
                            onChanged()
                        },
                    )
                    Text("Largura do nó: ${String.format(Locale.ROOT, "%.2f", node.width)}×")
                    Slider(
                        value = node.width.coerceIn(.05f, 4f),
                        valueRange = .05f..4f,
                        onValueChange = { value ->
                            vector.changeSelected { node.width = value }
                            onChanged()
                        },
                    )
                }
            }
            Row {
                TextButton(
                    onClick = {
                        vector.duplicateSelected()
                        onChanged()
                    }
                ) {
                    Text("Duplicar")
                }
                TextButton(
                    onClick = {
                        vector.deleteSelected()
                        onChanged()
                    }
                ) {
                    Text("Excluir")
                }
            }
        } else
            Text(
                "Selecione um objeto no canvas ou na lista para editar sua aparência.",
                style = MaterialTheme.typography.bodySmall,
            )
        HorizontalDivider()
        Text("Objetos", style = MaterialTheme.typography.titleSmall)
        vector.layers.forEach { (_, objects) ->
            objects.asReversed().forEachIndexed { index, obj ->
                Surface(
                    onClick = {
                        vector.selectObject(obj.id)
                        onChanged()
                    },
                    color =
                        if (obj.id in vector.selection.selectedIds)
                            MaterialTheme.colorScheme.secondaryContainer
                        else MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Default.Polyline, null, Modifier.size(18.dp))
                        Text(
                            "${obj.name.ifBlank { if (obj.text != null) "Texto ${index+1}" else "Caminho ${index+1}" }}${if (obj.groupId != null) " · grupo" else ""}${if (obj.isClip) " · recorte" else ""}${if (obj.clipOf != null) " · recortado" else ""} · ${obj.allNodes().size} nós",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                vector.selection.toggleVisibility(obj)
                                onChanged()
                            },
                            modifier = Modifier.size(32.dp),
                        ) {
                            Icon(
                                if (obj.visible) Icons.Default.Visibility
                                else Icons.Default.VisibilityOff,
                                if (obj.visible) "Ocultar objeto" else "Mostrar objeto",
                                Modifier.size(18.dp),
                            )
                        }
                        IconButton(
                            onClick = {
                                vector.selection.toggleLock(obj)
                                onChanged()
                            },
                            modifier = Modifier.size(32.dp),
                        ) {
                            Icon(
                                if (obj.locked) Icons.Default.Lock else Icons.Default.LockOpen,
                                if (obj.locked) "Desbloquear objeto" else "Bloquear objeto",
                                Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }
        OutlinedButton(
            onClick = {
                vector.rasterize()
                onChanged()
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Rasterizar camada")
        }
    }
}
