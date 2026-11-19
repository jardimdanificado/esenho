package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
        VectorTool.ERASER -> EraserIcon
        VectorTool.TEXT -> Icons.Default.TextFields
    }

private data class ToolbarTool(
    val label: String,
    val icon: ImageVector,
    val selected: Boolean,
    val onClick: () -> Unit,
)

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
            modifier = Modifier.size(36.dp),
            shape = RoundedCornerShape(9.dp),
            colors =
                IconButtonDefaults.filledIconToggleButtonColors(
                    containerColor = Color.Transparent,
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    checkedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    checkedContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
        ) {
            Icon(icon, label, Modifier.size(19.dp))
        }
    }
}

/** Tools occupy the existing bottom dock; document actions live in the project menu. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorToolStrip(
    engine: EsenhoEngine,
    revision: Int,
    onTool: (ToolMode) -> Unit,
    onHide: () -> Unit,
    onChanged: () -> Unit,
) {
    val groups: List<List<ToolbarTool>> =
        if (engine.vectors.enabled) {
            val vectorTool = { tool: VectorTool ->
                ToolbarTool(
                    tool.label,
                    vectorIcon(tool),
                    engine.vectors.tool == tool && engine.currentTool == ToolMode.BRUSH,
                ) {
                    engine.cancelActiveStroke()
                    engine.vectors.finishPen()
                    engine.vectors.tool = tool
                    engine.currentTool = ToolMode.BRUSH
                    onChanged()
                }
            }
            val navTool = { tool: ToolMode, icon: ImageVector ->
                ToolbarTool(tool.displayName, icon, engine.currentTool == tool) {
                    engine.cancelActiveStroke()
                    engine.currentTool = tool
                    onChanged()
                }
            }
            listOf(
                listOf(VectorTool.DRAW, VectorTool.PEN, VectorTool.ERASER, VectorTool.SELECT, VectorTool.NODES, VectorTool.TEXT).map(vectorTool),
                listOf(VectorTool.LINE, VectorTool.RECT, VectorTool.ELLIPSE).map(vectorTool),
                listOf(
                    navTool(ToolMode.EYEDROPPER, Icons.Default.Colorize),
                    navTool(ToolMode.PAN, Icons.Default.PanTool),
                ),
            )
        } else {
            val rasterTool = { tool: ToolMode ->
                ToolbarTool(tool.displayName, workspaceToolIcon(tool), engine.currentTool == tool) {
                    onTool(tool)
                }
            }
            listOf(
                listOf(ToolMode.BRUSH, ToolMode.ERASER, ToolMode.SMUDGE, ToolMode.BLEND, ToolMode.FILL, ToolMode.LASSO_FILL).map(rasterTool),
                listOf(ToolMode.SELECT_RECT, ToolMode.SELECT_ELLIPSE, ToolMode.SELECT_LASSO, ToolMode.SELECT_BRUSH_MASK, ToolMode.SELECT_WAND).map(rasterTool),
                listOf(ToolMode.LINE, ToolMode.RECTANGLE, ToolMode.ELLIPSE, ToolMode.ERASE_RECTANGLE, ToolMode.ERASE_ELLIPSE).map(rasterTool),
                listOf(ToolMode.EYEDROPPER, ToolMode.TRANSFORM, ToolMode.PAN).map(rasterTool),
            )
        }
    val activeLabel =
        if (engine.vectors.enabled && engine.currentTool == ToolMode.BRUSH)
            engine.vectors.tool.label
        else engine.currentTool.displayName

    Surface(color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier
                    .weight(1f)
                    .padding(vertical = 3.dp, horizontal = 4.dp)
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        RoundedCornerShape(10.dp),
                    )
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                groups.forEachIndexed { index, group ->
                    if (index > 0)
                        VerticalDivider(
                            Modifier.height(20.dp).padding(horizontal = 2.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    group.forEach { tool ->
                        VectorToolButton(tool.selected, tool.label, tool.icon, tool.onClick)
                    }
                }
            }
            Text(
                activeLabel,
                modifier =
                    Modifier.padding(start = 6.dp, end = 2.dp)
                        .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                maxLines = 1,
            )
            TooltipBox(
                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                tooltip = { PlainTooltip { Text("Ocultar ferramentas") } },
                state = rememberTooltipState(),
            ) {
                IconButton(onClick = onHide, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.ExpandMore, "Ocultar ferramentas", Modifier.size(19.dp))
                }
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
                Row {
                    FilterChip(
                        selected = selected.fontWeight == "bold",
                        onClick = {
                            vector.setFontWeight(if (selected.fontWeight == "bold") "normal" else "bold")
                            onChanged()
                        },
                        label = { Text("Negrito", style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.padding(end = 4.dp),
                    )
                    FilterChip(
                        selected = selected.fontStyle == "italic",
                        onClick = {
                            vector.setFontStyle(if (selected.fontStyle == "italic") "normal" else "italic")
                            onChanged()
                        },
                        label = { Text("Itálico", style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.padding(end = 4.dp),
                    )
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = selected.fillGradient != null,
                        onCheckedChange = {
                            vector.setGradientEnabled(it)
                            onChanged()
                        },
                    )
                    Text("Preenchimento gradiente", style = MaterialTheme.typography.bodySmall)
                }
                selected.fillGradient?.let { gradient ->
                    Row {
                        listOf("linear" to "Linear", "radial" to "Radial").forEach { (value, label) ->
                            FilterChip(
                                selected = gradient.type == value,
                                onClick = {
                                    vector.updateGradient { it.type = value }
                                    onChanged()
                                },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                                modifier = Modifier.padding(end = 4.dp),
                            )
                        }
                    }
                    gradient.stops.sortedBy { it.offset }.forEach { stop ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(16.dp)
                                    .background(Color(stop.color), CircleShape)
                                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                            )
                            Slider(
                                value = stop.offset.coerceIn(0f, 1f),
                                valueRange = 0f..1f,
                                onValueChange = { value ->
                                    vector.updateGradient { g ->
                                        g.stops.firstOrNull { it === stop }?.offset = value
                                    }
                                    onChanged()
                                },
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(
                                onClick = {
                                    vector.updateGradient { g ->
                                        if (g.stops.size > 2) g.stops.removeAll { it === stop }
                                    }
                                    onChanged()
                                }
                            ) {
                                Icon(Icons.Default.Delete, "Remover parada")
                            }
                        }
                    }
                    TextButton(
                        onClick = {
                            vector.updateGradient { g ->
                                val last = g.stops.maxOfOrNull { it.offset } ?: 0f
                                g.stops += VectorGradientStop((last + .25f).coerceAtMost(1f), engine.currentColor)
                            }
                            onChanged()
                        },
                    ) {
                        Text("Adicionar parada com a cor atual")
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = gradient.userSpace,
                            onCheckedChange = {
                                vector.updateGradient { g -> g.userSpace = it }
                                onChanged()
                            },
                        )
                        Text("Coordenadas em pixels", style = MaterialTheme.typography.bodySmall)
                    }
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
            var traceMode by remember { mutableStateOf("threshold") }
            Text("Modo da vetorização", style = MaterialTheme.typography.bodySmall)
            Row {
                listOf("threshold" to "Limiar", "silhouette" to "Silhueta", "color" to "Cores").forEach { (value, label) ->
                    FilterChip(
                        selected = traceMode == value,
                        onClick = { traceMode = value },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.padding(end = 4.dp),
                    )
                }
            }
            var threshold by remember { mutableStateOf("128") }
            var colorCount by remember { mutableStateOf("4") }
            var minArea by remember { mutableStateOf("0") }
            var smoothness by remember { mutableStateOf("1") }
            var bezierFit by remember { mutableStateOf(true) }
            val thresholdValue = threshold.toIntOrNull()
            val colorCountValue = colorCount.toIntOrNull()
            val minAreaValue = minArea.toFloatOrNull()
            val smoothnessValue = smoothness.toFloatOrNull()
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VectorNumber("Limiar", threshold, { threshold = it }, Modifier.weight(1f))
                VectorNumber("Cores", colorCount, { colorCount = it }, Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VectorNumber("Área mínima", minArea, { minArea = it }, Modifier.weight(1f))
                VectorNumber("Suavização", smoothness, { smoothness = it }, Modifier.weight(1f))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = bezierFit, onCheckedChange = { bezierFit = it })
                Text("Ajustar curvas Bézier", style = MaterialTheme.typography.bodySmall)
            }
            TextButton(
                enabled =
                    thresholdValue != null && thresholdValue in 1..255 &&
                        colorCountValue != null && colorCountValue in 2..16 &&
                        minAreaValue != null && minAreaValue >= 0 &&
                        smoothnessValue != null && smoothnessValue > 0,
                onClick = {
                    vector.traceLayer(
                        VectorTraceOptions(
                            mode = traceMode,
                            threshold = thresholdValue!!,
                            colorCount = colorCountValue!!,
                            minArea = minAreaValue!!,
                            smoothness = smoothnessValue!!,
                            bezierFit = bezierFit,
                        ),
                    )
                    onChanged()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Vetorizar camada")
            }
            Text(
                "Limiar e silhueta usam o alfa/cor da camada ativa; cores quantiza até 16 cores.",
                style = MaterialTheme.typography.bodySmall,
            )
            HorizontalDivider()
            Text("Animação vetorial", style = MaterialTheme.typography.titleSmall)
            val animation = vector.animation
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(
                    onClick = {
                        animation.playing = !animation.playing
                        onChanged()
                    }
                ) {
                    Text(if (animation.playing) "Pausar" else "Reproduzir")
                }
                Text("Quadro ${animation.currentFrame + 1} / ${animation.duration}")
            }
            Slider(
                value = animation.currentFrame.toFloat().coerceIn(0f, animation.duration.toFloat()),
                valueRange = 0f..animation.duration.toFloat().coerceAtLeast(1f),
                onValueChange = {
                    animation.currentFrame = it.toInt().coerceIn(0, animation.duration - 1)
                    vector.render()
                    onChanged()
                },
            )
            var rotation by remember(selected.id) { mutableStateOf("0") }
            var scale by remember(selected.id) { mutableStateOf("1") }
            var opacity by remember(selected.id) { mutableStateOf("100") }
            var keyframeFill by remember(selected.id) { mutableStateOf<Int?>(null) }
            var keyframeFont by remember(selected.id) { mutableStateOf("") }
            var easing by remember(selected.id) { mutableStateOf("linear") }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VectorNumber("Rotação", rotation, { rotation = it }, Modifier.weight(1f))
                VectorNumber("Escala", scale, { scale = it }, Modifier.weight(1f))
                VectorNumber("Opacidade %", opacity, { opacity = it }, Modifier.weight(1f))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { keyframeFill = engine.currentColor }) {
                    Text("Cor do keyframe")
                }
                keyframeFill?.let {
                    Box(
                        Modifier.size(18.dp)
                            .background(Color(it), CircleShape)
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    )
                }
                TextButton(onClick = { keyframeFill = null }) { Text("Sem cor") }
            }
            if (selected.text != null)
                VectorNumber("Tamanho da fonte", keyframeFont, { keyframeFont = it }, Modifier.fillMaxWidth())
            Row {
                (listOf("linear", "ease-in", "ease-out", "ease-in-out") + animation.customEasings.map { it.name }).forEach { type ->
                    FilterChip(
                        selected = easing == type,
                        onClick = { easing = type },
                        label = { Text(type, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.padding(end = 2.dp),
                    )
                }
            }
            val rotationValue = rotation.replace(',', '.').toFloatOrNull()
            val scaleValue = scale.replace(',', '.').toFloatOrNull()
            val opacityValue = opacity.replace(',', '.').toFloatOrNull()
            val fontValue = keyframeFont.replace(',', '.').toFloatOrNull()
            OutlinedButton(
                enabled = rotationValue != null && scaleValue != null && opacityValue != null,
                onClick = {
                    val bounds = VectorSelection.VectorBounds.of(listOf(selected)) ?: return@OutlinedButton
                    animation.addKeyframe(
                        selected.id,
                        animation.currentFrame,
                        bounds.left,
                        bounds.top,
                        rotationValue!!,
                        scaleValue!!,
                        opacityValue!! / 100f,
                        easing,
                        keyframeFill,
                        fontValue,
                    )
                    vector.render()
                    onChanged()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Adicionar keyframe no quadro atual")
            }
            animation.tracks[selected.id]?.keyframes?.sortedBy { it.frame }?.forEach { keyframe ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(
                        onClick = {
                            animation.currentFrame = keyframe.frame
                            vector.render()
                            onChanged()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            "Quadro ${keyframe.frame + 1} · ${keyframe.easing}",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    IconButton(
                        onClick = {
                            animation.removeKeyframe(selected.id, keyframe.frame)
                            vector.render()
                            onChanged()
                        }
                    ) {
                        Icon(Icons.Default.Delete, "Remover keyframe")
                    }
                }
            }
            Text("Curvas de easing", style = MaterialTheme.typography.titleSmall)
            var easingName by remember { mutableStateOf("suave") }
            var ex1 by remember { mutableStateOf("0.25") }
            var ey1 by remember { mutableStateOf("0.10") }
            var ex2 by remember { mutableStateOf("0.25") }
            var ey2 by remember { mutableStateOf("1.00") }
            OutlinedTextField(
                value = easingName,
                onValueChange = { easingName = it },
                label = { Text("Nome da curva") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VectorNumber("X1", ex1, { ex1 = it }, Modifier.weight(1f))
                VectorNumber("Y1", ey1, { ey1 = it }, Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VectorNumber("X2", ex2, { ex2 = it }, Modifier.weight(1f))
                VectorNumber("Y2", ey2, { ey2 = it }, Modifier.weight(1f))
            }
            val easingValues = listOf(ex1, ey1, ex2, ey2).map { it.replace(',', '.').toFloatOrNull() }
            TextButton(
                enabled = easingName.isNotBlank() && easingValues.all { it != null && it.isFinite() },
                onClick = {
                    animation.customEasings.removeAll { it.name == easingName }
                    animation.customEasings +=
                        VectorEasingCurve(
                            easingName.trim(),
                            easingValues[0]!!,
                            easingValues[1]!!,
                            easingValues[2]!!,
                            easingValues[3]!!,
                        )
                    easing = easingName.trim()
                    onChanged()
                },
            ) {
                Text("Salvar curva")
            }
            var clipName by remember { mutableStateOf("Clipe") }
            var clipStart by remember { mutableStateOf("1") }
            var clipEnd by remember { mutableStateOf(animation.duration.toString()) }
            OutlinedTextField(
                value = clipName,
                onValueChange = { clipName = it },
                label = { Text("Nome do clipe") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VectorNumber("Início", clipStart, { clipStart = it }, Modifier.weight(1f))
                VectorNumber("Fim", clipEnd, { clipEnd = it }, Modifier.weight(1f))
            }
            TextButton(
                enabled = clipStart.toIntOrNull() != null && clipEnd.toIntOrNull() != null,
                onClick = {
                    val start = (clipStart.toInt() - 1).coerceAtLeast(0)
                    val end = (clipEnd.toInt() - 1).coerceAtLeast(start)
                    animation.clips.add(VectorAnimationClip(clipName, start, end))
                    onChanged()
                },
            ) {
                Text("Criar clipe")
            }
            if (animation.clips.isNotEmpty()) {
                var clipMenu by remember { mutableStateOf(false) }
                Button(onClick = { clipMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Clipe ativo: ${animation.activeClip ?: "Nenhum"}")
                }
                DropdownMenu(expanded = clipMenu, onDismissRequest = { clipMenu = false }) {
                    DropdownMenuItem(
                        text = { Text("Nenhum") },
                        onClick = {
                            animation.activeClip = null
                            clipMenu = false
                            onChanged()
                        },
                    )
                    animation.clips.forEach { clip ->
                        DropdownMenuItem(
                            text = { Text("${clip.name} (${clip.start + 1}-${clip.end + 1})") },
                            onClick = {
                                animation.activeClip = clip.name
                                clipMenu = false
                                onChanged()
                            },
                        )
                    }
                }
            }
            HorizontalDivider()
            Text("Rigging", style = MaterialTheme.typography.titleSmall)
            val rig = vector.skeleton
            if (rig == null) {
                Button(
                    onClick = {
                        vector.createBone("Raiz", null, 80f, 0f)
                        onChanged()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Criar esqueleto")
                }
            } else {
                rig.bones.forEach { bone ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(bone.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        Text("${bone.localAngle.toInt()}°", style = MaterialTheme.typography.labelSmall)
                    }
                    Slider(
                        value = bone.localAngle.coerceIn(-180f, 180f),
                        valueRange = -180f..180f,
                        onValueChange = {
                            vector.poseBone(bone.id, it)
                            onChanged()
                        },
                    )
                }
                Button(
                    onClick = {
                        val parent = rig.bones.lastOrNull()?.id
                        vector.createBone("Filho", parent, 60f, 0f)
                        onChanged()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Adicionar osso filho")
                }
                var boneId by remember { mutableStateOf(rig.bones.firstOrNull()?.id ?: "") }
                var bindType by remember { mutableStateOf("cutout") }
                var ikX by remember { mutableStateOf("0") }
                var ikY by remember { mutableStateOf("0") }
                var boneMenu by remember { mutableStateOf(false) }
                Button(onClick = { boneMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Osso ativo: ${rig.bones.firstOrNull { it.id == boneId }?.name ?: "Nenhum"}")
                }
                DropdownMenu(expanded = boneMenu, onDismissRequest = { boneMenu = false }) {
                    rig.bones.forEach { bone ->
                        DropdownMenuItem(
                            text = { Text(bone.name) },
                            onClick = {
                                boneId = bone.id
                                boneMenu = false
                            },
                        )
                    }
                }
                var physicsMode by remember { mutableStateOf("kinematic") }
                var restAngle by remember { mutableStateOf("0") }
                var stiffness by remember { mutableStateOf("0.5") }
                var mass by remember { mutableStateOf("1") }
                Row {
                    listOf("kinematic" to "Cinemático", "ragdoll" to "Ragdoll", "secondary" to "Secundário").forEach { (value, label) ->
                        FilterChip(
                            selected = physicsMode == value,
                            onClick = { physicsMode = value },
                            label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                            modifier = Modifier.padding(end = 4.dp),
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    VectorNumber("Repouso", restAngle, { restAngle = it }, Modifier.weight(1f))
                    VectorNumber("Rigidez", stiffness, { stiffness = it }, Modifier.weight(1f))
                    VectorNumber("Massa", mass, { mass = it }, Modifier.weight(1f))
                }
                TextButton(
                    enabled = boneId.isNotBlank(),
                    onClick = {
                        vector.configureBonePhysics(
                            boneId,
                            physicsMode,
                            restAngle.replace(',', '.').toFloatOrNull() ?: 0f,
                            stiffness.replace(',', '.').toFloatOrNull() ?: .5f,
                            -180f,
                            180f,
                            mass.replace(',', '.').toFloatOrNull() ?: 1f,
                        )
                        onChanged()
                    },
                ) {
                    Text("Aplicar física ao osso")
                }
                Row {
                    listOf("cutout" to "Rígido", "path" to "Caminho", "smooth_path" to "Suave").forEach { (value, label) ->
                        FilterChip(
                            selected = bindType == value,
                            onClick = { bindType = value },
                            label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                            modifier = Modifier.padding(end = 4.dp),
                        )
                    }
                }
                Button(
                    enabled = boneId.isNotBlank() && selected != null,
                    onClick = {
                        vector.bindSelected(boneId, bindType)
                        onChanged()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Vincular objeto selecionado")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    VectorNumber("IK X", ikX, { ikX = it }, Modifier.weight(1f))
                    VectorNumber("IK Y", ikY, { ikY = it }, Modifier.weight(1f))
                }
                val xValue = ikX.replace(',', '.').toFloatOrNull()
                val yValue = ikY.replace(',', '.').toFloatOrNull()
                TextButton(
                    enabled = boneId.isNotBlank() && xValue != null && yValue != null,
                    onClick = {
                        vector.solveRigIk(boneId, xValue!!, yValue!!)
                        onChanged()
                    },
                ) {
                    Text("Resolver IK")
                }
                var aimX by remember { mutableStateOf("0") }
                var aimY by remember { mutableStateOf("0") }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    VectorNumber("Alvo X", aimX, { aimX = it }, Modifier.weight(1f))
                    VectorNumber("Alvo Y", aimY, { aimY = it }, Modifier.weight(1f))
                }
                val aimXValue = aimX.replace(',', '.').toFloatOrNull()
                val aimYValue = aimY.replace(',', '.').toFloatOrNull()
                Row {
                    TextButton(
                        enabled = boneId.isNotBlank() && aimXValue != null && aimYValue != null,
                        onClick = {
                            vector.setAim(boneId, aimXValue!!, aimYValue!!)
                            onChanged()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Apontar", style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(
                        enabled = boneId.isNotBlank(),
                        onClick = {
                            vector.clearConstraint(boneId)
                            onChanged()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Livre", style = MaterialTheme.typography.labelSmall)
                    }
                }
                var gravity by remember { mutableStateOf("1") }
                var ragdollSteps by remember { mutableStateOf("12") }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    VectorNumber("Gravidade", gravity, { gravity = it }, Modifier.weight(1f))
                    VectorNumber("Passos", ragdollSteps, { ragdollSteps = it }, Modifier.weight(1f))
                }
                val gravityValue = gravity.replace(',', '.').toFloatOrNull()
                val stepsValue = ragdollSteps.toIntOrNull()
                TextButton(
                    enabled = gravityValue != null && stepsValue != null && stepsValue in 1..120,
                    onClick = {
                        vector.stepRagdoll(gravityValue!!, .98f, stepsValue!!)
                        onChanged()
                    },
                ) {
                    Text("Simular ragdoll")
                }
                var bakeFrames by remember { mutableStateOf("60") }
                VectorNumber("Quadros para bakear", bakeFrames, { bakeFrames = it }, Modifier.fillMaxWidth())
                val framesValue = bakeFrames.toIntOrNull()
                TextButton(
                    enabled = framesValue != null && framesValue in 1..600,
                    onClick = {
                        vector.bakeRig(framesValue!!, 2)
                        onChanged()
                    },
                ) {
                    Text("Bakear para animação")
                }
                TextButton(onClick = {
                    vector.clearSkeleton()
                    onChanged()
                }) {
                    Text("Remover esqueleto")
                }
            }
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
                            "${obj.name.ifBlank { if (obj.text != null) "Texto ${index+1}" else "Caminho ${index+1}" }}${obj.groupId?.let { id -> " · ${vector.groups[id]?.name?.ifBlank { "grupo" } ?: "grupo"}" } ?: ""}${if (obj.isClip) " · recorte" else ""}${if (obj.clipOf != null) " · recortado" else ""} · ${obj.allNodes().size} nós",
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
