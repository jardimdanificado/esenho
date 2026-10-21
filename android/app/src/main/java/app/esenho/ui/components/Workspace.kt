package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import app.esenho.R
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.EsenhoStorageManager.SideSliderSetting
import app.esenho.nativeengine.ToolMode

enum class WorkspacePanel(val title: String, val icon: ImageVector) {
    BRUSHES("Pincéis", Icons.Default.Brush),
    COLOR("Cores", Icons.Default.Palette),
    LAYERS("Camadas", Icons.Default.Layers),
    ANIMATION("Animar", Icons.Default.Movie),
    EFFECTS("Efeitos", Icons.Default.AutoAwesome),
    SELECTION("Seleção", Icons.Default.CropFree),
    TRANSFORM("Transformação", Icons.Default.OpenWith),
    SCRIPTS("Scripts", Icons.Default.Code),
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
) {
    CompactControls {
        Surface(color = MaterialTheme.colorScheme.background) {
            Row(
                Modifier.fillMaxWidth().height(40.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
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
        AnchoredWorkspacePopup(
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
    quickShelfVisible: Boolean,
    quickShelfRecent: Boolean,
    onToggleQuickShelf: () -> Unit,
    onQuickShelfRecentChange: (Boolean) -> Unit,
    color: Int,
    engine: EsenhoEngine,
    configuredSliders: List<SideSliderSetting>,
    revision: Int,
    quickSlidersOpen: Boolean,
    onToggleQuickSliders: () -> Unit,
    onDismissQuickSliders: () -> Unit,
    onParameterChanged: (Int, Boolean) -> Unit,
    onMoveParameter: (String, Int) -> Unit,
    onReorderFinished: () -> Unit,
    toolPicker: @Composable () -> Unit,
    onBrush: () -> Unit,
    onColor: () -> Unit,
    onBrushProperties: () -> Unit,
    activePanel: WorkspacePanel?,
    onLayers: () -> Unit,
    onAnimation: () -> Unit,
    onEffects: () -> Unit,
    onScripts: () -> Unit,
    quickScripts: List<app.esenho.scripting.NativeScriptPreset> = emptyList(),
    onRunQuickScript: (app.esenho.scripting.NativeScriptPreset) -> Unit = {},
    onOpenScripts: () -> Unit = onScripts,
) {
    var more by remember { mutableStateOf(false) }
    val relevantSliders = relevantQuickSliders(engine, configuredSliders)
    CompactControls {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Row(
                Modifier.fillMaxWidth().height(40.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                toolPicker()
                Box(Modifier.weight(1f).height(36.dp)) {
                    QuickParameterTrigger(
                        engine,
                        relevantSliders.firstOrNull(),
                        revision,
                        quickSlidersOpen,
                        onToggleQuickSliders,
                        onBrushProperties,
                        onParameterChanged,
                    )
                    AnchoredWorkspacePopup(
                        quickSlidersOpen,
                        {},
                        modifier = Modifier.width(264.dp),
                        persistent = true,
                        scrollContent = false,
                    ) {
                        QuickParameterSliders(
                            engine,
                            relevantSliders,
                            revision,
                            onParameterChanged,
                            onMoveParameter,
                            onReorderFinished,
                            quickScripts,
                            onRunQuickScript,
                            onOpenScripts,
                        )
                    }
                }
                CompactPanelButton(
                    Icons.Default.CollectionsBookmark,
                    "Presets: $brushName",
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
                CompactPanelButton(
                    Icons.Default.Code,
                    "Scripts JavaScript",
                    activePanel == WorkspacePanel.SCRIPTS,
                    onScripts,
                )
                Box {
                    IconButton(onClick = { onDismissQuickSliders(); more = true }, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.MoreHoriz, "Efeitos e parâmetros", Modifier.size(19.dp))
                    }
                    AnchoredWorkspacePopup(
                        more,
                        { more = false },
                        modifier = Modifier.width(260.dp),
                    ) {
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
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (quickShelfVisible) "Ocultar barra de cores e pincéis"
                                    else "Mostrar barra de cores e pincéis"
                                )
                            },
                            onClick = {
                                onToggleQuickShelf()
                                more = false
                            },
                            trailingIcon = {
                                Icon(
                                    if (quickShelfVisible) Icons.Default.Visibility
                                    else Icons.Default.VisibilityOff,
                                    null,
                                )
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Paleta e pincéis favoritos") },
                            onClick = {
                                onQuickShelfRecentChange(false)
                                more = false
                            },
                            trailingIcon =
                                if (!quickShelfRecent) ({ Icon(Icons.Default.Check, null) })
                                else null,
                        )
                        DropdownMenuItem(
                            text = { Text("Cores e pincéis recentes") },
                            onClick = {
                                onQuickShelfRecentChange(true)
                                more = false
                            },
                            trailingIcon =
                                if (quickShelfRecent) ({ Icon(Icons.Default.Check, null) })
                                else null,
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
fun WorkspaceInspector(
    panel: WorkspacePanel,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
    onResize: ((Float) -> Unit)? = null,
    sideDock: Boolean = false,
    onToggleResize: (() -> Unit)? = null,
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
            if (sideDock) {
                Row(Modifier.fillMaxSize()) {
                    if (onResize != null) DockResizeHandle(true, onResize, onToggleResize)
                    Box(Modifier.weight(1f).fillMaxHeight()) { key(panel) { content() } }
                }
            } else {
                Column(Modifier.fillMaxSize()) {
                    if (onResize != null) DockResizeHandle(false, onResize, onToggleResize)
                    Box(Modifier.weight(1f)) { key(panel) { content() } }
                }
            }
        }
    }
}

@Composable
private fun DockResizeHandle(
    sideDock: Boolean,
    onResize: (Float) -> Unit,
    onToggle: (() -> Unit)?,
) {
    // Size changes recompose this handle during a drag. Keep the gesture coroutine
    // alive and use fresh callbacks so every delta reaches the current size state.
    val latestResize by rememberUpdatedState(onResize)
    val latestToggle by rememberUpdatedState(onToggle)
    val step = with(LocalDensity.current) { 32.dp.toPx() }
    Box(
        Modifier.then(
                if (sideDock) Modifier.width(16.dp).fillMaxHeight()
                else Modifier.fillMaxWidth().height(20.dp)
            )
            .pointerInput(sideDock) {
                if (sideDock)
                    detectHorizontalDragGestures { change, amount ->
                        change.consume()
                        latestResize(amount)
                    }
                else
                    detectVerticalDragGestures { change, amount ->
                        change.consume()
                        latestResize(amount)
                    }
            }
            .then(if (onToggle != null) Modifier.clickable { latestToggle?.invoke() } else Modifier)
            .semantics {
                contentDescription =
                    if (sideDock) "Arraste para ajustar a largura do painel"
                    else "Arraste para ajustar a altura do painel"
                customActions =
                    listOf(
                        CustomAccessibilityAction("Aumentar painel") {
                            latestResize(-step)
                            true
                        },
                        CustomAccessibilityAction("Diminuir painel") {
                            latestResize(step)
                            true
                        },
                    )
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.then(
                    if (sideDock) Modifier.width(3.dp).height(32.dp)
                    else Modifier.width(32.dp).height(3.dp)
                )
                .clip(RoundedCornerShape(2.dp))
                .background(MaterialTheme.colorScheme.outline)
        )
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
