package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

@Composable
fun WorkspaceHeader(
    dimensions: String,
    canUndo: Boolean,
    canRedo: Boolean,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onDocument: () -> Unit,
    onFocus: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Row(
            Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                Modifier.weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onDocument)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    Icons.Default.FolderOpen,
                    "Documento",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp),
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        "esenho",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp,
                    )
                    Text(
                        dimensions,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
                Icon(
                    Icons.Default.ExpandMore,
                    null,
                    Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onUndo, enabled = canUndo) {
                Icon(Icons.AutoMirrored.Filled.Undo, "Desfazer", Modifier.size(20.dp))
            }
            IconButton(onClick = onRedo, enabled = canRedo) {
                Icon(Icons.AutoMirrored.Filled.Redo, "Refazer", Modifier.size(20.dp))
            }
            IconButton(onClick = onFocus) {
                Icon(Icons.Default.Fullscreen, "Modo de foco", Modifier.size(20.dp))
            }
        }
    }
}

@Composable
fun WorkspaceNavigation(active: WorkspacePanel?, onSelect: (WorkspacePanel) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Row(Modifier.fillMaxWidth().selectableGroup().padding(horizontal = 6.dp, vertical = 6.dp)) {
            listOf(
                    WorkspacePanel.BRUSHES,
                    WorkspacePanel.COLOR,
                    WorkspacePanel.LAYERS,
                    WorkspacePanel.ANIMATION,
                    WorkspacePanel.EFFECTS,
                )
                .forEach { panel ->
                    val selected = active == panel
                    Column(
                        Modifier.weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (selected) MaterialTheme.colorScheme.primaryContainer
                                else Color.Transparent
                            )
                            .selectable(
                                selected = selected,
                                role = Role.Tab,
                                onClick = { onSelect(panel) },
                            )
                            .padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            panel.icon,
                            null,
                            Modifier.size(20.dp),
                            tint =
                                if (selected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            panel.title,
                            style = MaterialTheme.typography.labelSmall,
                            color =
                                if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
        }
    }
}

@Composable
fun WorkspaceToolRail(
    current: ToolMode,
    onTool: (ToolMode) -> Unit,
    moreTools: @Composable () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = Modifier.width(56.dp).fillMaxHeight(),
    ) {
        Column(
            Modifier.fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 4.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            moreTools()
            HorizontalDivider(
                Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            val tools =
                listOf(
                    Triple(ToolMode.BRUSH, Icons.Default.Brush, "Pincel"),
                    Triple(ToolMode.ERASER, Icons.Default.DeleteOutline, "Borracha"),
                    Triple(ToolMode.SMUDGE, Icons.Default.WaterDrop, "Borrar"),
                    Triple(ToolMode.FILL, Icons.Default.FormatColorFill, "Preencher"),
                    Triple(ToolMode.SELECT_RECT, Icons.Default.CropFree, "Selecionar"),
                    Triple(ToolMode.TRANSFORM, Icons.Default.OpenWith, "Transformar"),
                    Triple(ToolMode.EYEDROPPER, Icons.Default.Colorize, "Conta-gotas"),
                    Triple(ToolMode.PAN, Icons.Default.PanTool, "Mover tela"),
                )
            tools.forEach { (mode, icon, label) ->
                val selected =
                    current == mode ||
                        (mode == ToolMode.SELECT_RECT && current.name.startsWith("SELECT_"))
                Surface(
                    onClick = { onTool(mode) },
                    modifier = Modifier.size(46.dp),
                    shape = RoundedCornerShape(12.dp),
                    color =
                        if (selected) MaterialTheme.colorScheme.primaryContainer
                        else Color.Transparent,
                    contentColor =
                        if (selected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (mode == ToolMode.ERASER)
                            Icon(painterResource(R.drawable.ic_eraser), label, Modifier.size(21.dp))
                        else Icon(icon, label, Modifier.size(21.dp))
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
) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    toolName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier =
                        Modifier.widthIn(max = 128.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .clickable(onClick = onToolOptions)
                            .padding(vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text("/", color = MaterialTheme.colorScheme.outline)
                Text(
                    brushName,
                    Modifier.weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(onClick = onBrush)
                        .padding(vertical = 6.dp),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Box(
                    Modifier.size(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(onClick = onColor),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier.size(24.dp)
                            .clip(CircleShape)
                            .background(Color(color))
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    )
                }
                IconButton(onClick = onParameters, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Tune, "Configurar parâmetros", Modifier.size(19.dp))
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                WorkspaceSlider(
                    "Tamanho",
                    "${size.toInt()} px",
                    size.coerceIn(1f, 300f),
                    1f..300f,
                    onSize,
                    onChangeFinished,
                    Modifier.weight(1f),
                )
                WorkspaceSlider(
                    "Opacidade",
                    "${(opacity * 100).toInt()}%",
                    opacity.coerceIn(0f, 1f),
                    0f..1f,
                    onOpacity,
                    onChangeFinished,
                    Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun WorkspaceSlider(
    label: String,
    valueLabel: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Float) -> Unit,
    onFinished: () -> Unit,
    modifier: Modifier,
) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(valueLabel, style = MaterialTheme.typography.labelSmall)
        }
        Slider(
            value = value,
            onValueChange = onChange,
            onValueChangeFinished = onFinished,
            valueRange = range,
            modifier =
                Modifier.fillMaxWidth().height(28.dp).semantics {
                    contentDescription = "$label: $valueLabel"
                },
        )
    }
}

@Composable
fun WorkspaceInspector(
    panel: WorkspacePanel,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        border =
            androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            ),
    ) {
        key(panel) { content() }
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
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
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
        modifier = modifier.heightIn(min = 64.dp),
        shape = RoundedCornerShape(12.dp),
        color =
            if (emphasized) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (enabled) 0.7f else 0.3f),
        contentColor =
            if (emphasized) MaterialTheme.colorScheme.onPrimary
            else MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else 0.38f),
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
