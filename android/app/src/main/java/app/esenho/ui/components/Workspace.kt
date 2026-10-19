package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import app.esenho.R
import app.esenho.nativeengine.ToolMode

enum class WorkspacePanel(val title: String, val icon: ImageVector) {
    BRUSHES("Pincéis", Icons.Default.Brush),
    COLOR("Cores", Icons.Default.Palette),
    LAYERS("Camadas", Icons.Default.Layers),
    ANIMATION("Animar", Icons.Default.Movie),
    EFFECTS("Efeitos", Icons.Default.AutoAwesome),
    CONTROLS("Parâmetros", Icons.Default.Tune),
    SELECTION("Seleção", Icons.Default.CropFree),
    TRANSFORM("Transformação", Icons.Default.OpenWith),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CompactControls(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalMinimumInteractiveComponentEnforcement provides false,
        content = content,
    )
}

@Composable
fun WorkspaceHeader(
    dimensions: String,
    canUndo: Boolean,
    canRedo: Boolean,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onDocument: () -> Unit,
    onFocus: () -> Unit,
    toolPicker: @Composable () -> Unit,
) {
    CompactControls {
        Surface(color = MaterialTheme.colorScheme.background) {
            Row(
                Modifier.fillMaxWidth().height(40.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                toolPicker()
                Row(
                    Modifier.weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(onClick = onDocument)
                        .padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(
                        Icons.Default.FolderOpen,
                        "Documento",
                        Modifier.size(17.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        dimensions,
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = onUndo, enabled = canUndo, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.AutoMirrored.Filled.Undo, "Desfazer", Modifier.size(18.dp))
                }
                IconButton(onClick = onRedo, enabled = canRedo, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.AutoMirrored.Filled.Redo, "Refazer", Modifier.size(18.dp))
                }
                IconButton(onClick = onFocus, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Fullscreen, "Modo de foco", Modifier.size(18.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WorkspaceToolPicker(
    current: ToolMode,
    expanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    onTool: (ToolMode) -> Unit,
) {
    val groups =
        listOf(
            "Pintura" to
                listOf(
                    ToolMode.BRUSH,
                    ToolMode.ERASER,
                    ToolMode.FILL,
                    ToolMode.SMUDGE,
                    ToolMode.BLEND,
                ),
            "Seleção" to
                listOf(
                    ToolMode.SELECT_RECT,
                    ToolMode.SELECT_ELLIPSE,
                    ToolMode.SELECT_LASSO,
                    ToolMode.SELECT_BRUSH_MASK,
                    ToolMode.SELECT_WAND,
                    ToolMode.LASSO_FILL,
                ),
            "Formas" to
                listOf(
                    ToolMode.LINE,
                    ToolMode.RECTANGLE,
                    ToolMode.ELLIPSE,
                    ToolMode.ERASE_RECTANGLE,
                    ToolMode.ERASE_ELLIPSE,
                ),
            "Navegação" to listOf(ToolMode.TRANSFORM, ToolMode.EYEDROPPER, ToolMode.PAN),
        )
    fun icon(mode: ToolMode) =
        when (mode) {
            ToolMode.BRUSH -> Icons.Default.Brush
            ToolMode.ERASER -> Icons.Default.DeleteOutline
            ToolMode.FILL -> Icons.Default.FormatColorFill
            ToolMode.SMUDGE,
            ToolMode.BLEND -> Icons.Default.WaterDrop
            ToolMode.EYEDROPPER -> Icons.Default.Colorize
            ToolMode.TRANSFORM -> Icons.Default.OpenWith
            ToolMode.PAN -> Icons.Default.PanTool
            ToolMode.LINE -> Icons.Default.HorizontalRule
            ToolMode.RECTANGLE,
            ToolMode.ERASE_RECTANGLE -> Icons.Default.CropSquare
            ToolMode.ELLIPSE,
            ToolMode.ERASE_ELLIPSE -> Icons.Default.Circle
            else -> Icons.Default.CropFree
        }
    Box {
        IconButton(onClick = onOpen, modifier = Modifier.size(36.dp)) {
            Icon(
                icon(current),
                "Ferramentas: ${current.displayName}",
                Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        DropdownMenu(
            expanded,
            onDismiss,
            modifier = Modifier.width(312.dp).heightIn(max = 420.dp),
        ) {
            groups.forEach { (title, modes) ->
                Text(
                    title,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
                FlowRow(
                    Modifier.padding(horizontal = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    modes.forEach { mode ->
                        Surface(
                            onClick = { onTool(mode) },
                            modifier = Modifier.width(96.dp).heightIn(min = 40.dp),
                            shape = RoundedCornerShape(5.dp),
                            color =
                                if (mode == current) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Row(
                                Modifier.padding(5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                if (mode == ToolMode.ERASER)
                                    Icon(
                                        painterResource(R.drawable.ic_eraser),
                                        null,
                                        Modifier.size(16.dp),
                                    )
                                else Icon(icon(mode), null, Modifier.size(16.dp))
                                Text(
                                    mode.displayName,
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WorkspaceProperties(
    toolName: String,
    onToolOptions: () -> Unit,
    brushName: String,
    color: Int,
    size: Float,
    opacity: Float,
    onSize: (Float) -> Unit,
    onOpacity: (Float) -> Unit,
    onChangeFinished: () -> Unit,
    onBrush: () -> Unit,
    onColor: () -> Unit,
    onParameters: () -> Unit,
    activePanel: WorkspacePanel?,
    onLayers: () -> Unit,
    onAnimation: () -> Unit,
    onEffects: () -> Unit,
) {
    var more by remember { mutableStateOf(false) }
    CompactControls {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Row(
                Modifier.fillMaxWidth().height(40.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                CompactValue(
                    "Tamanho",
                    "${size.toInt()} px",
                    size.coerceIn(1f, 300f),
                    1f..300f,
                    onSize,
                    onChangeFinished,
                    Modifier.weight(1f),
                )
                CompactValue(
                    "Opacidade",
                    "${(opacity * 100).toInt()}%",
                    opacity.coerceIn(0f, 1f),
                    0f..1f,
                    onOpacity,
                    onChangeFinished,
                    Modifier.weight(1f),
                )
                CompactPanelButton(
                    Icons.Default.Brush,
                    "Pincéis: $brushName",
                    activePanel == WorkspacePanel.BRUSHES,
                    onBrush,
                )
                IconButton(onClick = onColor, modifier = Modifier.size(36.dp)) {
                    Box(
                        Modifier.size(22.dp)
                            .clip(CircleShape)
                            .background(Color(color))
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                            .semantics { contentDescription = "Cor atual; abrir cores" }
                    )
                }
                CompactPanelButton(
                    Icons.Default.Layers,
                    "Camadas",
                    activePanel == WorkspacePanel.LAYERS,
                    onLayers,
                )
                CompactPanelButton(
                    Icons.Default.Movie,
                    "Animação",
                    activePanel == WorkspacePanel.ANIMATION,
                    onAnimation,
                )
                Box {
                    IconButton(onClick = { more = true }, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.MoreHoriz, "Efeitos e parâmetros", Modifier.size(19.dp))
                    }
                    DropdownMenu(more, { more = false }) {
                        DropdownMenuItem(
                            text = { Text("Opções: $toolName") },
                            onClick = {
                                more = false
                                onToolOptions()
                            },
                            leadingIcon = { Icon(Icons.Default.Settings, null) },
                        )
                        DropdownMenuItem(
                            text = { Text("Efeitos") },
                            onClick = {
                                more = false
                                onEffects()
                            },
                            leadingIcon = { Icon(Icons.Default.AutoAwesome, null) },
                        )
                        DropdownMenuItem(
                            text = { Text("Parâmetros personalizados") },
                            onClick = {
                                more = false
                                onParameters()
                            },
                            leadingIcon = { Icon(Icons.Default.Tune, null) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CompactPanelButton(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(36.dp),
        colors =
            IconButtonDefaults.iconButtonColors(
                containerColor =
                    if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                contentColor =
                    if (selected) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
            ),
    ) {
        Icon(icon, label, Modifier.size(19.dp))
    }
}

@Composable
private fun CompactValue(
    label: String,
    valueLabel: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Float) -> Unit,
    onFinished: () -> Unit,
    modifier: Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        Box(
            Modifier.fillMaxWidth()
                .height(36.dp)
                .clip(RoundedCornerShape(5.dp))
                .clickable { expanded = true }
                .semantics { contentDescription = "$label: $valueLabel" },
            contentAlignment = Alignment.Center,
        ) {
            Text(valueLabel, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
        DropdownMenu(
            expanded,
            {
                expanded = false
                onFinished()
            },
            modifier = Modifier.width(240.dp),
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(label, style = MaterialTheme.typography.labelMedium)
                Text(
                    valueLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Slider(
                value,
                onChange,
                valueRange = range,
                onValueChangeFinished = onFinished,
                modifier =
                    Modifier.padding(horizontal = 12.dp).semantics { contentDescription = label },
            )
        }
    }
}

@Composable
fun WorkspaceInspector(
    panel: WorkspacePanel,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
    onResize: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp),
        border =
            androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            ),
    ) {
        CompactControls {
            Column(Modifier.fillMaxSize()) {
                if (onResize != null)
                    Box(
                        Modifier.fillMaxWidth()
                            .height(12.dp)
                            .clickable(onClick = onResize)
                            .semantics { contentDescription = "Expandir ou recolher painel" },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            Modifier.width(28.dp)
                                .height(2.dp)
                                .background(MaterialTheme.colorScheme.outline)
                        )
                    }
                Box(Modifier.weight(1f)) { key(panel) { content() } }
            }
        }
    }
}

/** All workspace panels can live in the same inspector without opening another modal. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspacePanelContainer(
    embedded: Boolean,
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (embedded) Column(Modifier.fillMaxSize(), content = content)
    else
        ModalBottomSheet(
            onDismissRequest = onDismiss,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface,
            content = content,
        )
}

@Composable
fun WorkspaceDialogContainer(
    embedded: Boolean,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    if (embedded) content() else Dialog(onDismissRequest = onDismiss, content = content)
}

@Composable
fun WorkspaceSectionTabs(labels: List<String>, active: Int, onSelect: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        labels.forEachIndexed { index, label ->
            FilterChip(
                selected = active == index,
                onClick = { onSelect(index) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
fun WorkspaceActionButton(
    onClick: () -> Unit,
    description: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    emphasized: Boolean = false,
    content: @Composable () -> Unit,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 36.dp),
        shape = RoundedCornerShape(5.dp),
        color =
            if (emphasized) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (enabled) 0.7f else 0.3f),
        contentColor =
            if (emphasized) MaterialTheme.colorScheme.onPrimary
            else MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else 0.38f),
    ) {
        Row(
            Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            content()
            Text(
                description,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
