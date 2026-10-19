package app.esenho.ui.components

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.LayerBlendMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LayerDrawer(
    engine: EsenhoEngine,
    onLayersUpdated: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    embedded: Boolean = false,
    revision: Int = 0,
) {
    var layersList by remember { mutableStateOf(engine.layers.toList().reversed()) }
    var activeLayerId by remember { mutableIntStateOf(engine.activeLayerIndex) }
    var confirmAction by remember { mutableStateOf<String?>(null) }
    var showBrushAssetDialog by remember { mutableStateOf(false) }
    var brushAssetKind by remember { mutableStateOf("tip") }
    var brushAssetName by remember { mutableStateOf("") }
    val context = LocalContext.current
    val activeLayer = layersList.find { it.id == activeLayerId }
    var showResizeDialog by remember(activeLayerId) { mutableStateOf(false) }
    var resizeWidth by
        remember(engine.width, engine.height) { mutableStateOf(engine.width.toString()) }
    var resizeHeight by
        remember(engine.width, engine.height) { mutableStateOf(engine.height.toString()) }
    var resizeResample by remember { mutableStateOf(true) }

    fun refresh() {
        layersList = engine.layers.toList().reversed()
        activeLayerId = engine.activeLayerIndex
        onLayersUpdated()
    }

    LaunchedEffect(revision) {
        layersList = engine.layers.toList().reversed()
        activeLayerId = engine.activeLayerIndex
    }
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    var layerMenuId by remember { mutableStateOf<Int?>(null) }
    var showRename by remember { mutableStateOf(false) }
    var renameText by remember { mutableStateOf("") }
    val rowPixels = with(androidx.compose.ui.platform.LocalDensity.current) { 40.dp.toPx() }
    LaunchedEffect(activeLayerId, layersList.map { it.id }) {
        val index = layersList.indexOfFirst { it.id == activeLayerId }
        if (index >= 0 && listState.layoutInfo.visibleItemsInfo.none { it.index == index })
            listState.animateScrollToItem(index)
    }

    Surface(
        modifier = if (embedded) modifier.fillMaxSize() else modifier.fillMaxWidth().height(320.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().height(32.dp).padding(start = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Camadas · ${layersList.size}",
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.labelMedium,
                )
                IconButton(
                    onClick = {
                        engine.addLayer()
                        refresh()
                    },
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(Icons.Default.Add, "Adicionar camada", Modifier.size(19.dp))
                }
                IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, "Fechar camadas", Modifier.size(17.dp))
                }
            }
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentPadding = PaddingValues(horizontal = 4.dp),
            ) {
                items(layersList, key = { it.id }) { layer ->
                    val selected = layer.id == activeLayerId
                    var dragRemainder by remember(layer.id) { mutableFloatStateOf(0f) }
                    var reorderToken by remember(layer.id) { mutableLongStateOf(0L) }
                    Row(
                        Modifier.fillMaxWidth()
                            .height(40.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(
                                if (selected) MaterialTheme.colorScheme.primaryContainer
                                else Color.Transparent
                            )
                            .clickable {
                                engine.selectLayer(layer.id)
                                refresh()
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(
                            onClick = {
                                engine.setLayerVisible(layer.id, !layer.visible)
                                refresh()
                            },
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                if (layer.visible) Icons.Default.Visibility
                                else Icons.Default.VisibilityOff,
                                if (layer.visible) "Ocultar ${layer.name}"
                                else "Mostrar ${layer.name}",
                                Modifier.size(18.dp),
                                tint =
                                    if (layer.visible) MaterialTheme.colorScheme.onSurface
                                    else MaterialTheme.colorScheme.outline,
                            )
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                layer.name,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                color =
                                    if (selected) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                "${layer.blendMode.displayName} · ${layer.opacity * 100 / 255}%" +
                                    (if (layer.alphaLock) " · α" else "") +
                                    (if (layer.clipping) " · corte" else ""),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                        Box(
                            Modifier.size(36.dp).pointerInput(layer.id, rowPixels) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = {
                                        engine.selectLayer(layer.id)
                                        refresh()
                                        dragRemainder = 0f
                                        reorderToken = 0L
                                    },
                                    onDragEnd = {
                                        dragRemainder = 0f
                                        reorderToken = 0L
                                    },
                                    onDragCancel = {
                                        dragRemainder = 0f
                                        reorderToken = 0L
                                    },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        dragRemainder += amount.y
                                        val steps = (dragRemainder / rowPixels).toInt()
                                        if (steps != 0) {
                                            if (reorderToken == 0L)
                                                reorderToken = engine.beginLayerOrderChange()
                                            engine.moveLayerByOrderDelta(
                                                layer.id,
                                                steps,
                                                captureUndo = false,
                                                orderHistoryToken = reorderToken,
                                            )
                                            dragRemainder -= steps * rowPixels
                                            refresh()
                                        }
                                    },
                                )
                            },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Default.DragHandle,
                                "Segure e arraste para reordenar ${layer.name}",
                                Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.outline,
                            )
                        }
                        Box {
                            IconButton(
                                onClick = {
                                    engine.selectLayer(layer.id)
                                    refresh()
                                    layerMenuId = layer.id
                                },
                                modifier = Modifier.size(36.dp),
                            ) {
                                Icon(
                                    Icons.Default.MoreVert,
                                    "Ações de ${layer.name}",
                                    Modifier.size(18.dp),
                                )
                            }
                            DropdownMenu(
                                expanded = layerMenuId == layer.id,
                                onDismissRequest = { layerMenuId = null },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Renomear") },
                                    onClick = {
                                        layerMenuId = null
                                        renameText = layer.name
                                        showRename = true
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Duplicar camada") },
                                    onClick = {
                                        layerMenuId = null
                                        engine.duplicateLayer(layer.id)
                                        refresh()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Mover para cima") },
                                    enabled = layersList.firstOrNull()?.id != layer.id,
                                    onClick = {
                                        layerMenuId = null
                                        engine.moveLayerUp(layer.id)
                                        refresh()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Mover para baixo") },
                                    enabled = layersList.lastOrNull()?.id != layer.id,
                                    onClick = {
                                        layerMenuId = null
                                        engine.moveLayerDown(layer.id)
                                        refresh()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Mesclar com a de baixo") },
                                    enabled = layersList.lastOrNull()?.id != layer.id,
                                    onClick = {
                                        layerMenuId = null
                                        confirmAction = "merge"
                                    },
                                )
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text("Espelhar horizontalmente") },
                                    onClick = {
                                        layerMenuId = null
                                        engine.flipLayerH(layer.id)
                                        refresh()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Espelhar verticalmente") },
                                    onClick = {
                                        layerMenuId = null
                                        engine.flipLayerV(layer.id)
                                        refresh()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Redimensionar tela…") },
                                    onClick = {
                                        layerMenuId = null
                                        showResizeDialog = true
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Criar ponta desta camada") },
                                    onClick = {
                                        layerMenuId = null
                                        brushAssetKind = "tip"
                                        brushAssetName = "${layer.name.take(24)} Ponta"
                                        showBrushAssetDialog = true
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Criar grão desta camada") },
                                    onClick = {
                                        layerMenuId = null
                                        brushAssetKind = "grain"
                                        brushAssetName = "${layer.name.take(24)} Grão"
                                        showBrushAssetDialog = true
                                    },
                                )
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            "Limpar camada",
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    onClick = {
                                        layerMenuId = null
                                        confirmAction = "clear"
                                    },
                                )
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            "Excluir camada",
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    enabled = layersList.size > 1,
                                    onClick = {
                                        layerMenuId = null
                                        confirmAction = "delete"
                                    },
                                )
                            }
                        }
                    }
                }
            }
            if (activeLayer != null) {
                var localOpacity by
                    remember(activeLayer.id, activeLayer.opacity) {
                        mutableFloatStateOf(activeLayer.opacity.toFloat())
                    }
                var blendMenu by remember { mutableStateOf(false) }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Row(
                    Modifier.fillMaxWidth().height(32.dp).padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${(localOpacity * 100 / 255).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.width(42.dp),
                    )
                    Slider(
                        value = localOpacity.coerceIn(0f, 255f),
                        valueRange = 0f..255f,
                        onValueChange = {
                            localOpacity = it
                            engine.setLayerOpacity(activeLayer.id, it.toInt(), commitUndo = false)
                            onLayersUpdated()
                        },
                        onValueChangeFinished = {
                            engine.setLayerOpacity(
                                activeLayer.id,
                                localOpacity.toInt(),
                                commitUndo = true,
                            )
                            refresh()
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(
                    Modifier.fillMaxWidth().height(32.dp).padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.weight(1f)) {
                        TextButton(
                            onClick = { blendMenu = true },
                            contentPadding = PaddingValues(horizontal = 6.dp),
                            modifier = Modifier.height(32.dp),
                        ) {
                            Text(
                                activeLayer.blendMode.displayName,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                            )
                            Icon(Icons.Default.ExpandMore, null, Modifier.size(14.dp))
                        }
                        DropdownMenu(blendMenu, { blendMenu = false }) {
                            LayerBlendMode.values().forEach { mode ->
                                DropdownMenuItem(
                                    text = { Text(mode.displayName) },
                                    trailingIcon =
                                        if (mode == activeLayer.blendMode) {
                                            { Icon(Icons.Default.Check, null) }
                                        } else null,
                                    onClick = {
                                        blendMenu = false
                                        engine.setLayerBlendMode(activeLayer.id, mode)
                                        refresh()
                                    },
                                )
                            }
                        }
                    }
                    IconToggleButton(
                        checked = activeLayer.alphaLock,
                        onCheckedChange = {
                            engine.setLayerAlphaLock(activeLayer.id, it)
                            refresh()
                        },
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            if (activeLayer.alphaLock) Icons.Default.Lock
                            else Icons.Default.LockOpen,
                            "Bloquear alfa",
                            Modifier.size(17.dp),
                        )
                    }
                    IconToggleButton(
                        checked = activeLayer.clipping,
                        onCheckedChange = {
                            engine.setLayerClipping(activeLayer.id, it)
                            refresh()
                        },
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(Icons.Default.ContentCut, "Máscara de corte", Modifier.size(17.dp))
                    }
                }
            }
        }
    }
    if (showRename) {
        AlertDialog(
            onDismissRequest = { showRename = false },
            title = { Text("Renomear camada") },
            text = {
                OutlinedTextField(
                    renameText,
                    { renameText = it.take(80) },
                    singleLine = true,
                    label = { Text("Nome") },
                )
            },
            confirmButton = {
                TextButton(
                    enabled = renameText.isNotBlank(),
                    onClick = {
                        engine.renameLayer(activeLayerId, renameText.trim())
                        refresh()
                        showRename = false
                    },
                ) {
                    Text("Salvar")
                }
            },
            dismissButton = { TextButton(onClick = { showRename = false }) { Text("Cancelar") } },
        )
    }

    if (showBrushAssetDialog) {
        val isGrain = brushAssetKind == "grain"
        AlertDialog(
            onDismissRequest = { showBrushAssetDialog = false },
            title = { Text(if (isGrain) "Criar grão da camada" else "Criar ponta da camada") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("O conteúdo raster da camada ativa será salvo em um preset personalizado.")
                    OutlinedTextField(
                        value = brushAssetName,
                        onValueChange = { brushAssetName = it.take(40) },
                        label = { Text("Nome") },
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = brushAssetName.isNotBlank(),
                    onClick = {
                        val created =
                            if (isGrain) engine.createGrainTextureFromActiveLayer(brushAssetName)
                            else engine.createBrushTipFromActiveLayer(brushAssetName)
                        showBrushAssetDialog = false
                        if (created) {
                            refresh()
                            Toast.makeText(
                                    context,
                                    if (isGrain) "Grão salvo nos presets"
                                    else "Ponta salva nos presets",
                                    Toast.LENGTH_SHORT,
                                )
                                .show()
                        } else {
                            Toast.makeText(
                                    context,
                                    "Não foi possível criar o recurso (limite de 2048 px por lado)",
                                    Toast.LENGTH_LONG,
                                )
                                .show()
                        }
                    },
                ) {
                    Text("Criar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBrushAssetDialog = false }) { Text("Cancelar") }
            },
        )
    }

    if (showResizeDialog) {
        AlertDialog(
            onDismissRequest = { showResizeDialog = false },
            title = { Text("Redimensionar tela") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "O novo tamanho é aplicado a todas as camadas e quadros.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = resizeWidth,
                            onValueChange = { resizeWidth = it.filter(Char::isDigit).take(5) },
                            label = { Text("Largura do projeto") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = resizeHeight,
                            onValueChange = { resizeHeight = it.filter(Char::isDigit).take(5) },
                            label = { Text("Altura do projeto") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = resizeResample,
                            onClick = { resizeResample = true },
                            label = { Text("Escalar") },
                        )
                        FilterChip(
                            selected = !resizeResample,
                            onClick = { resizeResample = false },
                            label = { Text("Centralizar") },
                        )
                    }
                    Text(
                        if (resizeResample) "Redimensiona o conteúdo de todas as camadas e cels."
                        else "Mantém os pixels e centraliza o conteúdo no novo canvas.",
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val width = resizeWidth.toIntOrNull()
                        val height = resizeHeight.toIntOrNull()
                        if (
                            width != null &&
                                height != null &&
                                engine.resizeCanvas(width, height, resizeResample)
                        ) {
                            showResizeDialog = false
                            refresh()
                        }
                    }
                ) {
                    Text("Aplicar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showResizeDialog = false }) { Text("Cancelar") }
            },
        )
    }

    confirmAction?.let { action ->
        val title =
            when (action) {
                "clear" -> "Limpar camada?"
                "delete" -> "Apagar camada?"
                else -> "Mesclar camada para baixo?"
            }
        val message =
            when (action) {
                "clear" -> "Todo o conteúdo da camada atual será removido."
                "delete" -> "A camada atual será removida permanentemente."
                else -> "O conteúdo será combinado com a camada abaixo."
            }
        AlertDialog(
            onDismissRequest = { confirmAction = null },
            title = { Text(title) },
            text = { Text(message) },
            confirmButton = {
                TextButton(
                    onClick = {
                        when (action) {
                            "clear" -> engine.clearActiveLayer()
                            "delete" -> engine.deleteLayer(activeLayerId)
                            else -> engine.mergeDown(activeLayerId)
                        }
                        confirmAction = null
                        refresh()
                    }
                ) {
                    Text("Continuar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmAction = null }) { Text("Cancelar") } },
        )
    }
}
