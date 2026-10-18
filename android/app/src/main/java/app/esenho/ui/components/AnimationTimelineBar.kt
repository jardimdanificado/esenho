package app.esenho.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.LayerModel
import app.esenho.nativeengine.RasterLayerGroup
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

private sealed interface TimelineEntry {
    data class Group(val group: RasterLayerGroup, val depth: Int) : TimelineEntry
    data class Layer(val layer: LayerModel, val depth: Int) : TimelineEntry
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
fun AnimationTimelineBar(
    engine: EsenhoEngine,
    onFrameChanged: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPlaying by remember { mutableStateOf(engine.isAnimationPlaying) }
    var currentIdx by remember { mutableIntStateOf(engine.currentFrameIndex) }
    var currentTick by remember { mutableIntStateOf(engine.currentAnimationTick) }
    var fps by remember { mutableIntStateOf(engine.animationFps) }
    var onionSkin by remember { mutableStateOf(engine.onionSkinEnabled) }
    var loop by remember { mutableStateOf(engine.animationLoop) }
    var frameCount by remember { mutableIntStateOf(engine.animationFrames.size) }
    var currentDuration by remember { mutableIntStateOf(engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1) }
    var showOnionSettings by remember { mutableStateOf(false) }
    var onionPrevCount by remember { mutableIntStateOf(engine.onionPrevFrames) }
    var onionNextCount by remember { mutableIntStateOf(engine.onionNextFrames) }
    var onionOpacity by remember { mutableFloatStateOf(engine.onionOpacity) }
    var onionPrevTint by remember { mutableIntStateOf(engine.onionPrevTint) }
    var onionNextTint by remember { mutableIntStateOf(engine.onionNextTint) }
    var layerRevision by remember { mutableIntStateOf(0) }
    val timelineLayers = remember(layerRevision) { engine.layers.filter { it.id >= 3 }.toList() }
    // Every cel occupies exactly duration ticks at one shared scale. The 6 dp
    // inter-cel gap is subtracted from its width so the gap completes the tick.
    val durationPixelsPerFrame = with(androidx.compose.ui.platform.LocalDensity.current) { 48.dp.toPx() }
    val layerRowHeightPixels = with(androidx.compose.ui.platform.LocalDensity.current) { 58.dp.toPx() }
    val timelineEntries = remember(layerRevision) {
        buildList {
            fun addGroup(groupId: String, depth: Int) {
                val group = engine.rasterLayerGroups[groupId] ?: return
                add(TimelineEntry.Group(group, depth))
                if (!group.collapsed) {
                    group.layerIds.mapNotNull { id -> timelineLayers.firstOrNull { it.id == id } }
                        .sortedBy { timelineLayers.indexOf(it) }
                        .forEach { add(TimelineEntry.Layer(it, depth + 1)) }
                    group.childGroupIds.forEach { addGroup(it, depth + 1) }
                }
            }
            engine.rasterGroupOrder.forEach { addGroup(it, 0) }
            timelineLayers.filterNot { layer ->
                engine.rasterLayerGroups.values.any { layer.id in it.layerIds }
            }.forEach { add(TimelineEntry.Layer(it, 0)) }
        }
    }
    var fpsMenuExpanded by remember { mutableStateOf(false) }
    var showDurationEditor by remember { mutableStateOf(false) }
    var durationInput by remember { mutableStateOf("1") }
    var showClearFrameConfirm by remember { mutableStateOf(false) }
    var showCelOpacityEditor by remember { mutableStateOf(false) }
    var celOpacityValue by remember { mutableFloatStateOf(1f) }
    var layerMenuId by remember { mutableIntStateOf(-1) }
    var editingLayerId by remember { mutableIntStateOf(-1) }
    var layerNameInput by remember { mutableStateOf("") }
    var editingGroupId by remember { mutableStateOf<String?>(null) }
    var groupNameInput by remember { mutableStateOf("") }
    var groupMenuId by remember { mutableStateOf<String?>(null) }
    var celMenuTarget by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    LaunchedEffect(timelineLayers) {
        if (timelineLayers.isNotEmpty() && engine.activeLayerIndex !in engine.animationTracks) {
            engine.selectLayer(timelineLayers.first().id)
            currentIdx = engine.currentFrameIndex
            currentTick = engine.currentAnimationTick
            frameCount = engine.animationFrames.size
            currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
            onFrameChanged()
        }
    }

    LaunchedEffect(isPlaying, fps) {
        if (isPlaying) {
            while (isActive && isPlaying) {
                delay((1000L / fps.coerceIn(1, 60)).coerceAtLeast(16L))
                if (engine.animationTracks.isNotEmpty()) {
                    engine.advanceAnimationTick()
                    if (!engine.isAnimationPlaying) {
                        isPlaying = false
                    }
                    currentIdx = engine.currentFrameIndex
                    currentTick = engine.currentAnimationTick
                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                    onFrameChanged()
                }
            }
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RectangleShape,
        color = Color(0xFF25282B),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(188.dp)
                .padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 6.dp)
        ) {
            // Transport controls and frame management stay in one compact strip.
            Row(
                modifier = Modifier.fillMaxWidth().height(38.dp).horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = {
                    isPlaying = false
                    engine.isAnimationPlaying = false
                    onClose()
                }, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Fechar timeline", tint = Color(0xFFB6BBC0), modifier = Modifier.size(19.dp))
                }
                Column(modifier = Modifier.padding(start = 2.dp)) {
                    Text("ANIMAÇÃO", fontSize = 9.sp, letterSpacing = 1.sp, color = Color(0xFF92989E), fontWeight = FontWeight.Bold)
                    Text("T ${engine.currentAnimationTick + 1}/${engine.totalAnimationTicks()} • ${currentIdx + 1}/$frameCount", fontSize = 10.sp, color = Color(0xFFE1E4E7), maxLines = 1)
                }
                Spacer(Modifier.width(8.dp))
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.applyAnimationTick(0)
                        currentTick = engine.currentAnimationTick
                        currentIdx = engine.currentFrameIndex
                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                        onFrameChanged()
                    },
                    contentPadding = PaddingValues(horizontal = 3.dp), modifier = Modifier.height(30.dp)
                ) { Text("⏮", fontSize = 13.sp, color = Color(0xFFD0D4D8)) }
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        if (frameCount > 0) engine.restoreFrame((currentIdx - 1 + frameCount) % frameCount)
                        currentTick = engine.currentAnimationTick
                        currentIdx = engine.currentFrameIndex
                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                        onFrameChanged()
                    },
                    contentPadding = PaddingValues(horizontal = 3.dp), modifier = Modifier.height(30.dp)
                ) { Text("◀", fontSize = 12.sp, color = Color(0xFFD0D4D8)) }
                FilledIconButton(
                    onClick = {
                        isPlaying = !isPlaying
                        if (isPlaying) engine.startAnimationPlayback() else engine.isAnimationPlaying = false
                    },
                    modifier = Modifier.size(32.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (isPlaying) Color(0xFF80C783) else Color(0xFF3A3F43),
                        contentColor = if (isPlaying) Color(0xFF152016) else Color(0xFFE5E8EB)
                    )
                ) {
                    Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = if (isPlaying) "Pausar" else "Reproduzir", modifier = Modifier.size(19.dp))
                }
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        if (frameCount > 0) engine.restoreFrame((currentIdx + 1) % frameCount)
                        currentTick = engine.currentAnimationTick
                        currentIdx = engine.currentFrameIndex
                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                        onFrameChanged()
                    },
                    contentPadding = PaddingValues(horizontal = 3.dp), modifier = Modifier.height(30.dp)
                ) { Text("▶", fontSize = 12.sp, color = Color(0xFFD0D4D8)) }
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.applyAnimationTick(engine.totalAnimationTicks() - 1)
                        currentTick = engine.currentAnimationTick
                        currentIdx = engine.currentFrameIndex
                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                        onFrameChanged()
                    },
                    contentPadding = PaddingValues(horizontal = 3.dp), modifier = Modifier.height(30.dp)
                ) { Text("⏭", fontSize = 13.sp, color = Color(0xFFD0D4D8)) }
                IconButton(onClick = { loop = !loop; engine.animationLoop = loop }, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Default.Repeat, contentDescription = if (loop) "Desativar repetição" else "Ativar repetição", tint = if (loop) Color(0xFF80C783) else Color(0xFF92989E), modifier = Modifier.size(18.dp))
                }
                Box {
                    TextButton(onClick = { fpsMenuExpanded = true }, contentPadding = PaddingValues(horizontal = 7.dp)) {
                        Text("${fps} fps", fontSize = 11.sp, color = Color(0xFFD0D4D8))
                    }
                    DropdownMenu(expanded = fpsMenuExpanded, onDismissRequest = { fpsMenuExpanded = false }) {
                        listOf(6, 8, 12, 15, 24, 30, 48, 60).forEach { rate ->
                            DropdownMenuItem(
                                text = { Text("$rate fps") },
                                onClick = {
                                    fps = rate
                                    engine.animationFps = rate
                                    fpsMenuExpanded = false
                                },
                                trailingIcon = if (fps == rate) {{ Text("✓", color = Color(0xFF80C783)) }} else null
                            )
                        }
                    }
                }
                TextButton(
                    onClick = {
                        currentDuration = (currentDuration - 1).coerceAtLeast(1)
                        engine.setCurrentFrameDuration(currentDuration)
                        currentTick = engine.currentAnimationTick
                    }, contentPadding = PaddingValues(horizontal = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) { Text("−", fontSize = 16.sp, color = Color(0xFFE0E3E6)) }
                TextButton(
                    onClick = { durationInput = currentDuration.toString(); showDurationEditor = true },
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) { Text("${currentDuration}f", fontSize = 10.sp, color = Color(0xFFFFC857)) }
                TextButton(
                    onClick = {
                        currentDuration = (currentDuration + 1).coerceAtMost(100000)
                        engine.setCurrentFrameDuration(currentDuration)
                        currentTick = engine.currentAnimationTick
                    }, contentPadding = PaddingValues(horizontal = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) { Text("+", fontSize = 14.sp, color = Color(0xFFE0E3E6)) }
                IconButton(
                    onClick = {
                        onionSkin = !onionSkin
                        engine.onionSkinEnabled = onionSkin
                        onFrameChanged()
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(Icons.Default.Layers, contentDescription = if (onionSkin) "Desativar onion skin" else "Ativar onion skin", tint = if (onionSkin) Color(0xFFFFC857) else Color(0xFF92989E), modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = { showOnionSettings = true }, modifier = Modifier.size(26.dp)) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Configurar onion skin", tint = Color(0xFFB6BBC0), modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(8.dp))
                TextButton(
                    onClick = {
                        val group = engine.createRasterLayerGroup()
                        engine.moveLayerToRasterGroup(engine.activeLayerIndex, group.id)
                        groupNameInput = group.name
                        editingGroupId = group.id
                        layerRevision++
                    },
                    contentPadding = PaddingValues(horizontal = 5.dp),
                    modifier = Modifier.height(30.dp)
                ) { Text("+Grupo", fontSize = 10.sp, color = Color(0xFFD0D4D8)) }
                IconButton(
                    onClick = {
                        engine.addLayer()
                        layerRevision++
                        currentIdx = engine.currentFrameIndex
                        currentTick = engine.currentAnimationTick
                        frameCount = engine.animationFrames.size
                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                        onFrameChanged()
                    }, modifier = Modifier.size(32.dp)
                ) {
                    Icon(Icons.Default.Layers, contentDescription = "Adicionar camada", tint = Color(0xFFD0D4D8), modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = {
                    isPlaying = false
                    engine.isAnimationPlaying = false
                    engine.addAnimationFrame()
                    currentIdx = engine.currentFrameIndex
                    currentTick = engine.currentAnimationTick
                    frameCount = engine.animationFrames.size
                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                    onFrameChanged()
                }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Add, contentDescription = "Adicionar quadro", tint = Color(0xFFD0D4D8), modifier = Modifier.size(19.dp))
                }
                IconButton(onClick = {
                    isPlaying = false
                    engine.isAnimationPlaying = false
                    engine.duplicateAnimationFrame()
                    currentIdx = engine.currentFrameIndex
                    currentTick = engine.currentAnimationTick
                    frameCount = engine.animationFrames.size
                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                    onFrameChanged()
                }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Duplicar quadro", tint = Color(0xFFD0D4D8), modifier = Modifier.size(17.dp))
                }
                IconButton(onClick = {
                    if (currentIdx > 0) engine.moveAnimationFrame(currentIdx, currentIdx - 1)
                    currentIdx = engine.currentFrameIndex
                    currentTick = engine.currentAnimationTick
                    onFrameChanged()
                }, enabled = currentIdx > 0, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Mover cel para a esquerda", tint = if (currentIdx > 0) Color(0xFFD0D4D8) else Color(0xFF64696E), modifier = Modifier.size(17.dp))
                }
                IconButton(onClick = {
                    if (currentIdx < frameCount - 1) engine.moveAnimationFrame(currentIdx, currentIdx + 1)
                    currentIdx = engine.currentFrameIndex
                    currentTick = engine.currentAnimationTick
                    onFrameChanged()
                }, enabled = currentIdx < frameCount - 1, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.ArrowForward, contentDescription = "Mover cel para a direita", tint = if (currentIdx < frameCount - 1) Color(0xFFD0D4D8) else Color(0xFF64696E), modifier = Modifier.size(17.dp))
                }
                IconButton(onClick = { showClearFrameConfirm = true }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Clear, contentDescription = "Limpar cel", tint = Color(0xFFE09A9A), modifier = Modifier.size(17.dp))
                }
                IconButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.deleteAnimationFrame()
                        currentIdx = engine.currentFrameIndex
                        currentTick = engine.currentAnimationTick
                        frameCount = engine.animationFrames.size
                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                        onFrameChanged()
                    },
                    enabled = frameCount > 1,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = "Excluir quadro", tint = if (frameCount > 1) Color(0xFFE09A9A) else Color(0xFF64696E), modifier = Modifier.size(17.dp))
                }
            }

            Slider(
                value = currentTick.toFloat(),
                onValueChange = { value ->
                    isPlaying = false
                    engine.isAnimationPlaying = false
                    currentTick = value.toInt()
                    engine.applyAnimationTick(currentTick)
                    currentTick = engine.currentAnimationTick
                    currentIdx = engine.currentFrameIndex
                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                    onFrameChanged()
                },
                valueRange = 0f..(engine.totalAnimationTicks() - 1).coerceAtLeast(1).toFloat(),
                enabled = engine.totalAnimationTicks() > 1,
                modifier = Modifier.fillMaxWidth().height(22.dp)
            )

            Spacer(Modifier.height(4.dp))
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.fillMaxWidth().weight(1f)
            ) {
                itemsIndexed(
                    timelineEntries,
                    key = { _, entry -> when (entry) {
                        is TimelineEntry.Group -> "group:${entry.group.id}"
                        is TimelineEntry.Layer -> "layer:${entry.layer.id}"
                    } }
                ) { _, entry ->
                    when (entry) {
                        is TimelineEntry.Group -> {
                            val group = entry.group
                            Row(
                                modifier = Modifier.fillMaxWidth().height(30.dp)
                                    .padding(start = (entry.depth * 10).dp)
                                    .clip(RoundedCornerShape(4.dp)).background(Color(0xFF34383C)),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(
                                    onClick = { group.collapsed = !group.collapsed; layerRevision++ },
                                    contentPadding = PaddingValues(horizontal = 4.dp),
                                    modifier = Modifier.height(28.dp)
                                ) { Text(if (group.collapsed) "▸" else "▾", color = Color(0xFFFFC857)) }
                                IconButton(
                                    onClick = { engine.toggleRasterLayerGroupVisibility(group.id); layerRevision++; onFrameChanged() },
                                    modifier = Modifier.size(26.dp)
                                ) {
                                    Icon(
                                        if (group.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = if (group.visible) "Ocultar grupo" else "Mostrar grupo",
                                        tint = if (group.visible) Color(0xFFBFC5C9) else Color(0xFF747B80),
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                                Text(group.name, fontSize = 10.sp, maxLines = 1, color = Color(0xFFFFD166), modifier = Modifier.weight(1f))
                                Text("${engine.rasterGroupLayerIds(group.id).size} cam.", fontSize = 8.sp, color = Color(0xFF92989E))
                                Box {
                                    IconButton(onClick = { groupMenuId = group.id }, modifier = Modifier.size(24.dp)) {
                                        Icon(Icons.Default.MoreVert, contentDescription = "Opções do grupo", tint = Color(0xFFB6BBC0), modifier = Modifier.size(15.dp))
                                    }
                                    DropdownMenu(expanded = groupMenuId == group.id, onDismissRequest = { groupMenuId = null }) {
                                        DropdownMenuItem(text = { Text("Renomear") }, onClick = {
                                            groupNameInput = group.name
                                            editingGroupId = group.id
                                            groupMenuId = null
                                        })
                                        DropdownMenuItem(text = { Text("Desagrupar") }, onClick = {
                                            engine.deleteRasterLayerGroup(group.id)
                                            groupMenuId = null
                                            layerRevision++
                                        })
                                        DropdownMenuItem(text = { Text("Mover para raiz") }, onClick = {
                                            engine.nestRasterLayerGroup(group.id, null)
                                            groupMenuId = null
                                            layerRevision++
                                        })
                                        engine.rasterLayerGroups.values.filter { it.id != group.id }.forEach { parent ->
                                            DropdownMenuItem(text = { Text("Aninhar em ${parent.name}") }, onClick = {
                                                engine.nestRasterLayerGroup(group.id, parent.id)
                                                groupMenuId = null
                                                layerRevision++
                                            })
                                        }
                                    }
                                }
                            }
                        }
                        is TimelineEntry.Layer -> {
                    val layer = entry.layer
                    val track = engine.animationTracks[layer.id] ?: return@itemsIndexed
                    var reorderDragRemainder by remember(layer.id) { mutableFloatStateOf(0f) }
                    Row(
                        modifier = Modifier.fillMaxWidth().height(58.dp).padding(start = (entry.depth * 10).dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(
                            modifier = Modifier.width(82.dp).fillMaxHeight()
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (layer.id == engine.activeLayerIndex) Color(0xFF29402D) else Color(0xFF303438))
                                .pointerInput(layer.id, layerRowHeightPixels) {
                                    detectDragGesturesAfterLongPress(
                                        onDragStart = { reorderDragRemainder = 0f },
                                        onDragEnd = { reorderDragRemainder = 0f },
                                        onDragCancel = { reorderDragRemainder = 0f },
                                        onDrag = { change, dragAmount ->
                                            change.consume()
                                            reorderDragRemainder += dragAmount.y
                                            val rows = (reorderDragRemainder / layerRowHeightPixels).toInt()
                                            if (rows != 0) {
                                                engine.moveLayerByOrderDelta(layer.id, rows)
                                                reorderDragRemainder -= rows * layerRowHeightPixels
                                                layerRevision++
                                                onFrameChanged()
                                            }
                                        }
                                    )
                                }
                                .clickable {
                                engine.selectLayer(layer.id)
                                    currentIdx = engine.currentFrameIndex
                                currentTick = engine.currentAnimationTick
                                    frameCount = engine.animationFrames.size
                                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                                    onFrameChanged()
                                },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                IconButton(
                                    onClick = {
                                        engine.setLayerVisible(layer.id, !layer.visible)
                                        layerRevision++
                                        onFrameChanged()
                                    }, modifier = Modifier.size(25.dp)
                                ) {
                                    Icon(
                                        if (layer.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = if (layer.visible) "Ocultar camada" else "Mostrar camada",
                                        tint = if (layer.visible) Color(0xFFBFC5C9) else Color(0xFF747B80),
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                                Text(
                                    layer.name, fontSize = 9.sp, maxLines = 1,
                                    color = if (layer.id == engine.activeLayerIndex) Color(0xFF9BE29F) else Color(0xFFCDD1D5),
                                    modifier = Modifier.weight(1f)
                                )
                                Box {
                                    IconButton(onClick = { layerMenuId = layer.id }, modifier = Modifier.size(22.dp)) {
                                        Icon(Icons.Default.MoreVert, contentDescription = "Opções da camada", tint = Color(0xFFB6BBC0), modifier = Modifier.size(15.dp))
                                    }
                                    DropdownMenu(expanded = layerMenuId == layer.id, onDismissRequest = { layerMenuId = -1 }) {
                                        DropdownMenuItem(
                                            text = { Text("Renomear") },
                                            onClick = { layerNameInput = layer.name; editingLayerId = layer.id; layerMenuId = -1 }
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Mover para cima") },
                                            enabled = engine.layers.indexOfFirst { it.id == layer.id } < engine.layers.lastIndex,
                                            onClick = { engine.moveLayerUp(layer.id); layerRevision++; layerMenuId = -1; onFrameChanged() }
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Mover para baixo") },
                                            enabled = engine.layers.indexOfFirst { it.id == layer.id } > 0,
                                            onClick = { engine.moveLayerDown(layer.id); layerRevision++; layerMenuId = -1; onFrameChanged() }
                                        )
                                        engine.rasterLayerGroups.values.forEach { group ->
                                            DropdownMenuItem(
                                                text = { Text("Mover para ${group.name}") },
                                                onClick = { engine.moveLayerToRasterGroup(layer.id, group.id); layerRevision++; layerMenuId = -1 }
                                            )
                                        }
                                        if (engine.rasterLayerGroups.values.any { layer.id in it.layerIds }) {
                                            DropdownMenuItem(
                                                text = { Text("Remover do grupo") },
                                                onClick = { engine.moveLayerToRasterGroup(layer.id, null); layerRevision++; layerMenuId = -1 }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            contentPadding = PaddingValues(start = 6.dp, end = 2.dp),
                            modifier = Modifier.fillMaxHeight().weight(1f)
                        ) {
                            itemsIndexed(track.frames.toList()) { index, cel ->
                                val selected = index == track.activeCelIndex
                                var durationDragRemainder by remember(layer.id, index) { mutableFloatStateOf(0f) }
                                fun activateCel() {
                                    isPlaying = false
                                    engine.isAnimationPlaying = false
                                    engine.selectLayer(layer.id)
                                    engine.restoreFrame(index)
                                    currentIdx = engine.currentFrameIndex
                                    currentTick = engine.currentAnimationTick
                                    frameCount = engine.animationFrames.size
                                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                                    onFrameChanged()
                                }
                                Box(
                                modifier = Modifier.width((cel.duration.coerceAtLeast(1) * 48f - 6f).dp).fillMaxHeight()
                                        .clip(RoundedCornerShape(5.dp))
                                        .background(Color(0xFF191B1D))
                                        .border(if (selected) 2.dp else 1.dp, if (selected) Color(0xFF80C783) else Color(0xFF41464A), RoundedCornerShape(5.dp))
                                        .combinedClickable(
                                            onClick = { activateCel() },
                                            onLongClick = { celMenuTarget = layer.id to index }
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    DropdownMenu(
                                        expanded = celMenuTarget == (layer.id to index),
                                        onDismissRequest = { celMenuTarget = null }
                                    ) {
                                        DropdownMenuItem(text = { Text("Inserir cel vazio depois") }, onClick = {
                                            celMenuTarget = null
                                            activateCel()
                                            engine.addAnimationFrame()
                                            currentIdx = engine.currentFrameIndex
                                            currentTick = engine.currentAnimationTick
                                            frameCount = engine.animationFrames.size
                                            currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                                            onFrameChanged()
                                        })
                                        DropdownMenuItem(text = { Text("Duplicar cel") }, onClick = {
                                            celMenuTarget = null
                                            activateCel()
                                            engine.duplicateAnimationFrame()
                                            currentIdx = engine.currentFrameIndex
                                            currentTick = engine.currentAnimationTick
                                            frameCount = engine.animationFrames.size
                                            currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                                            onFrameChanged()
                                        })
                                        DropdownMenuItem(text = { Text("Editar duração…") }, onClick = {
                                            celMenuTarget = null
                                            activateCel()
                                            durationInput = currentDuration.toString()
                                            showDurationEditor = true
                                        })
                                        DropdownMenuItem(
                                            text = { Text("Mover à esquerda") },
                                            enabled = index > 0,
                                            onClick = {
                                                celMenuTarget = null
                                                activateCel()
                                                engine.moveAnimationFrame(index, index - 1)
                                                currentIdx = engine.currentFrameIndex
                                                currentTick = engine.currentAnimationTick
                                                onFrameChanged()
                                            }
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Mover à direita") },
                                            enabled = index < track.frames.lastIndex,
                                            onClick = {
                                                celMenuTarget = null
                                                activateCel()
                                                engine.moveAnimationFrame(index, index + 1)
                                                currentIdx = engine.currentFrameIndex
                                                currentTick = engine.currentAnimationTick
                                                onFrameChanged()
                                            }
                                        )
                                        DropdownMenuItem(text = { Text("Limpar cel") }, onClick = {
                                            celMenuTarget = null
                                            activateCel()
                                            showClearFrameConfirm = true
                                        })
                                        DropdownMenuItem(
                                            text = { Text("Excluir cel", color = MaterialTheme.colorScheme.error) },
                                            enabled = track.frames.size > 1,
                                            onClick = {
                                                celMenuTarget = null
                                                activateCel()
                                                engine.deleteAnimationFrame()
                                                currentIdx = engine.currentFrameIndex
                                                currentTick = engine.currentAnimationTick
                                                frameCount = engine.animationFrames.size
                                                currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                                                onFrameChanged()
                                            }
                                        )
                                    }
                                    Image(bitmap = cel.bitmap.asImageBitmap(), contentDescription = "${layer.name}, quadro ${index + 1}", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(3.dp))
                                    Box(
                                        modifier = Modifier.align(Alignment.CenterEnd).width(12.dp).fillMaxHeight()
                                            .pointerInput(layer.id, index) {
                                                detectDragGestures(
                                                    onDragStart = {
                                                        durationDragRemainder = 0f
                                                        isPlaying = false
                                                        engine.isAnimationPlaying = false
                                                        engine.selectLayer(layer.id)
                                                        engine.restoreFrame(index)
                                                        currentIdx = engine.currentFrameIndex
                                                        currentTick = engine.currentAnimationTick
                                                        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                                                    },
                                                    onDrag = { change, dragAmount ->
                                                        change.consume()
                                                        durationDragRemainder += dragAmount.x
                                                        val steps = (durationDragRemainder / durationPixelsPerFrame).toInt()
                                                        if (steps != 0) {
                                                            val duration = engine.animationTracks[layer.id]?.frames?.getOrNull(index)?.duration ?: 1
                                                            engine.setCurrentFrameDuration((duration + steps).coerceAtLeast(1))
                                                            durationDragRemainder -= steps * durationPixelsPerFrame
                                                            currentDuration = engine.animationTracks[layer.id]?.frames?.getOrNull(index)?.duration ?: 1
                                                            currentIdx = engine.currentFrameIndex
                                                            currentTick = engine.currentAnimationTick
                                                            onFrameChanged()
                                                        }
                                                    },
                                                    onDragEnd = { durationDragRemainder = 0f },
                                                    onDragCancel = { durationDragRemainder = 0f }
                                                )
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Box(Modifier.width(2.dp).fillMaxHeight(0.62f).background(Color(0xCCFFC857), RoundedCornerShape(2.dp)))
                                    }
                                    Row(
                                        modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth().background(Color(0xAA202326)),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        TextButton(
                                            onClick = {
                                                engine.selectLayer(layer.id)
                                                engine.restoreFrame(index)
                                                celOpacityValue = cel.opacity / 255f
                                                showCelOpacityEditor = true
                                            },
                                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                            modifier = Modifier.height(20.dp)
                                        ) { Text("${(cel.opacity * 100 / 255)}%", fontSize = 8.sp, color = Color.White) }
                                        IconButton(
                                            onClick = {
                                                isPlaying = false
                                                engine.isAnimationPlaying = false
                                                engine.selectLayer(layer.id)
                                                engine.restoreFrame(index)
                                                engine.setCurrentCelVisible(!cel.visible)
                                                currentIdx = index
                                                currentTick = engine.currentAnimationTick
                                                layerRevision++
                                                onFrameChanged()
                                            },
                                            modifier = Modifier.size(22.dp)
                                        ) {
                                            Icon(
                                                if (cel.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                                contentDescription = if (cel.visible) "Ocultar cel" else "Mostrar cel",
                                                tint = if (cel.visible) Color(0xFFD0D4D8) else Color(0xFF747B80),
                                                modifier = Modifier.size(14.dp)
                                            )
                                        }
                                    }
                                    Text((index + 1).toString().padStart(2, '0'), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = if (selected) Color(0xFFFFD166) else Color(0xFFCDD1D5), modifier = Modifier.align(Alignment.BottomStart).clip(RoundedCornerShape(topEnd = 4.dp)).background(Color(0xCC202326)).padding(horizontal = 4.dp, vertical = 1.dp))
                                    Text("${cel.duration}f", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = if (selected) Color(0xFF152016) else Color(0xFFE1E4E7), modifier = Modifier.align(Alignment.BottomEnd).clip(RoundedCornerShape(topStart = 4.dp)).background(if (selected) Color(0xFF80C783) else Color(0xCC303438)).padding(horizontal = 4.dp, vertical = 1.dp))
                                }
                            }
                        }
                    }
                        }
                    }
                }
            }
        }
    }

    if (showOnionSettings) {
        AlertDialog(
            onDismissRequest = { showOnionSettings = false },
            title = { Text("Onion skin") },
            text = {
                Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Quadros anteriores: $onionPrevCount", style = MaterialTheme.typography.labelMedium)
                    Slider(value = onionPrevCount.toFloat(), onValueChange = { onionPrevCount = it.toInt(); engine.onionPrevFrames = onionPrevCount; onFrameChanged() }, valueRange = 0f..5f, steps = 4)
                    Text("Quadros seguintes: $onionNextCount", style = MaterialTheme.typography.labelMedium)
                    Slider(value = onionNextCount.toFloat(), onValueChange = { onionNextCount = it.toInt(); engine.onionNextFrames = onionNextCount; onFrameChanged() }, valueRange = 0f..5f, steps = 4)
                    Text("Opacidade: ${(onionOpacity * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                    Slider(value = onionOpacity, onValueChange = { onionOpacity = it; engine.onionOpacity = it; onFrameChanged() }, valueRange = 0.1f..0.85f)
                    OnionTintControl("Cor dos quadros anteriores", onionPrevTint) { tint -> onionPrevTint = tint; engine.onionPrevTint = tint; onFrameChanged() }
                    OnionTintControl("Cor dos quadros seguintes", onionNextTint) { tint -> onionNextTint = tint; engine.onionNextTint = tint; onFrameChanged() }
                }
            },
            confirmButton = { TextButton(onClick = { showOnionSettings = false }) { Text("Pronto") } }
        )
    }

    if (showDurationEditor) {
        AlertDialog(
            onDismissRequest = { showDurationEditor = false },
            title = { Text("Duração do cel") },
            text = {
                OutlinedTextField(
                    value = durationInput,
                    onValueChange = { durationInput = it.filter(Char::isDigit).take(7) },
                    label = { Text("Quadros") },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    currentDuration = durationInput.toIntOrNull()?.coerceAtLeast(1) ?: currentDuration
                    engine.setCurrentFrameDuration(currentDuration)
                    currentTick = engine.currentAnimationTick
                    showDurationEditor = false
                }) { Text("Aplicar") }
            },
            dismissButton = { TextButton(onClick = { showDurationEditor = false }) { Text("Cancelar") } }
        )
    }

    if (showCelOpacityEditor) {
        AlertDialog(
            onDismissRequest = { showCelOpacityEditor = false },
            title = { Text("Opacidade do cel") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${(celOpacityValue * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                    Slider(value = celOpacityValue, onValueChange = { celOpacityValue = it }, valueRange = 0f..1f)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    engine.setCurrentCelOpacity((celOpacityValue * 255).toInt())
                    showCelOpacityEditor = false
                    layerRevision++
                    onFrameChanged()
                }) { Text("Aplicar") }
            },
            dismissButton = { TextButton(onClick = { showCelOpacityEditor = false }) { Text("Cancelar") } }
        )
    }

    editingGroupId?.let { groupId ->
        AlertDialog(
            onDismissRequest = { editingGroupId = null },
            title = { Text("Renomear grupo") },
            text = {
                OutlinedTextField(
                    value = groupNameInput,
                    onValueChange = { groupNameInput = it.take(80) },
                    singleLine = true,
                    label = { Text("Nome") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    engine.renameRasterLayerGroup(groupId, groupNameInput)
                    editingGroupId = null
                    layerRevision++
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { editingGroupId = null }) { Text("Cancelar") } }
        )
    }

    if (editingLayerId >= 0) {
        AlertDialog(
            onDismissRequest = { editingLayerId = -1 },
            title = { Text("Renomear camada") },
            text = {
                OutlinedTextField(
                    value = layerNameInput,
                    onValueChange = { layerNameInput = it.take(80) },
                    singleLine = true,
                    label = { Text("Nome") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    engine.renameLayer(editingLayerId, layerNameInput)
                    editingLayerId = -1
                    layerRevision++
                }) { Text("Salvar") }
            },
            dismissButton = { TextButton(onClick = { editingLayerId = -1 }) { Text("Cancelar") } }
        )
    }

    if (showClearFrameConfirm) {
        AlertDialog(
            onDismissRequest = { showClearFrameConfirm = false },
            title = { Text("Limpar cel?") },
            text = { Text("Os pixels deste cel serão removidos.") },
            confirmButton = {
                TextButton(onClick = {
                    isPlaying = false
                    engine.isAnimationPlaying = false
                    engine.clearCurrentAnimationFrame()
                    showClearFrameConfirm = false
                    onFrameChanged()
                }) { Text("Limpar", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showClearFrameConfirm = false }) { Text("Cancelar") } }
        )
    }
}

@Composable
private fun OnionTintControl(label: String, color: Int, onColorChange: (Int) -> Unit) {
    val red = android.graphics.Color.red(color)
    val green = android.graphics.Color.green(color)
    val blue = android.graphics.Color.blue(color)
    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(16.dp).clip(CircleShape).background(Color(color)))
            Spacer(Modifier.width(8.dp))
            Text("$label  #${color.toUInt().toString(16).takeLast(6).uppercase()}", style = MaterialTheme.typography.labelMedium)
        }
        Text("R $red", style = MaterialTheme.typography.labelSmall)
        Slider(value = red.toFloat(), onValueChange = { onColorChange(android.graphics.Color.rgb(it.toInt(), green, blue)) }, valueRange = 0f..255f)
        Text("G $green", style = MaterialTheme.typography.labelSmall)
        Slider(value = green.toFloat(), onValueChange = { onColorChange(android.graphics.Color.rgb(red, it.toInt(), blue)) }, valueRange = 0f..255f)
        Text("B $blue", style = MaterialTheme.typography.labelSmall)
        Slider(value = blue.toFloat(), onValueChange = { onColorChange(android.graphics.Color.rgb(red, green, it.toInt())) }, valueRange = 0f..255f)
    }
}
