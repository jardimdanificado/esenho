package app.esenho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    modifier: Modifier = Modifier,
    embedded: Boolean = false,
    revision: Int = 0,
) {
    var isPlaying by remember { mutableStateOf(engine.isAnimationPlaying) }
    var currentIdx by remember { mutableIntStateOf(engine.currentFrameIndex) }
    var currentTick by remember { mutableIntStateOf(engine.currentAnimationTick) }
    var fps by remember { mutableIntStateOf(engine.animationFps) }
    var onionSkin by remember { mutableStateOf(engine.onionSkinEnabled) }
    var loop by remember { mutableStateOf(engine.animationLoop) }
    var frameCount by remember { mutableIntStateOf(engine.animationFrames.size) }
    var currentDuration by remember {
        mutableIntStateOf(engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1)
    }
    var showOnionSettings by remember { mutableStateOf(false) }
    var onionPrevCount by remember { mutableIntStateOf(engine.onionPrevFrames) }
    var onionNextCount by remember { mutableIntStateOf(engine.onionNextFrames) }
    var onionOpacity by remember { mutableFloatStateOf(engine.onionOpacity) }
    var onionPrevTint by remember { mutableIntStateOf(engine.onionPrevTint) }
    var onionNextTint by remember { mutableIntStateOf(engine.onionNextTint) }
    var layerRevision by remember { mutableIntStateOf(0) }
    // Each layer row is a separate horizontal scroller, but all of them share
    // one time axis just like the web timeline.
    val timelineHorizontalScroll = rememberScrollState()
    // Match the layer drawer: the topmost layer is shown first.
    val timelineLayers =
        remember(layerRevision, revision) {
            engine.layers.filter { it.id >= 3 }.toList().reversed()
        }
    // Ruler, cells and duration gestures use one shared scale; the 2 dp gap completes each cel.
    var tickWidth by remember { mutableIntStateOf(40) }
    var timeViewportWidth by remember { mutableIntStateOf(0) }
    var timelineMenu by remember { mutableStateOf(false) }
    var showDeleteFrameConfirm by remember { mutableStateOf(false) }
    val durationPixelsPerFrame = with(LocalDensity.current) { tickWidth.dp.toPx() }
    val layerRowHeightPixels = with(LocalDensity.current) { 40.dp.toPx() }
    val timelineEntries =
        remember(layerRevision, revision) {
            buildList {
                fun addGroup(groupId: String, depth: Int) {
                    val group = engine.rasterLayerGroups[groupId] ?: return
                    add(TimelineEntry.Group(group, depth))
                    if (!group.collapsed) {
                        group.layerIds
                            .mapNotNull { id -> timelineLayers.firstOrNull { it.id == id } }
                            .sortedBy { timelineLayers.indexOf(it) }
                            .forEach { add(TimelineEntry.Layer(it, depth + 1)) }
                        group.childGroupIds.forEach { addGroup(it, depth + 1) }
                    }
                }
                engine.rasterGroupOrder.forEach { addGroup(it, 0) }
                timelineLayers
                    .filterNot { layer ->
                        engine.rasterLayerGroups.values.any { layer.id in it.layerIds }
                    }
                    .forEach { add(TimelineEntry.Layer(it, 0)) }
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
    val collapsedHeight = 124f
    val maxTimelineHeight =
        (LocalConfiguration.current.screenHeightDp * 0.62f)
            .coerceAtMost(560f)
            .coerceAtLeast(collapsedHeight)
    val density = LocalDensity.current.density
    var timelineHeight by remember { mutableFloatStateOf(collapsedHeight) }

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

    DisposableEffect(Unit) { onDispose { engine.isAnimationPlaying = false } }

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

    fun syncTimeline() {
        currentIdx = engine.currentFrameIndex
        currentTick = engine.currentAnimationTick
        frameCount = engine.animationFrames.size
        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
        onFrameChanged()
    }
    LaunchedEffect(revision) {
        currentIdx = engine.currentFrameIndex
        currentTick = engine.currentAnimationTick
        frameCount = engine.animationFrames.size
        currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
        isPlaying = engine.isAnimationPlaying
        fps = engine.animationFps
        loop = engine.animationLoop
        onionSkin = engine.onionSkinEnabled
    }
    fun goToFrame(index: Int) {
        isPlaying = false
        engine.isAnimationPlaying = false
        if (frameCount > 0) engine.restoreFrame((index % frameCount + frameCount) % frameCount)
        syncTimeline()
    }
    LaunchedEffect(currentTick, tickWidth, timeViewportWidth) {
        val x = (currentTick * durationPixelsPerFrame).toInt()
        val viewport = timeViewportWidth
        if (
            viewport > 0 &&
                (x < timelineHorizontalScroll.value ||
                    x + durationPixelsPerFrame > timelineHorizontalScroll.value + viewport)
        ) {
            timelineHorizontalScroll.scrollTo((x - viewport / 2).coerceAtLeast(0))
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .then(
                        if (embedded) Modifier.fillMaxHeight()
                        else Modifier.height(timelineHeight.dp)
                    )
                    .padding(start = 4.dp, end = 4.dp, top = 0.dp, bottom = 1.dp)
        ) {
            if (!embedded)
                Box(
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(24.dp)
                            .pointerInput(maxTimelineHeight) {
                                detectVerticalDragGestures { change, dragAmount ->
                                    change.consume()
                                    timelineHeight =
                                        (timelineHeight - dragAmount / density).coerceIn(
                                            collapsedHeight,
                                            maxTimelineHeight,
                                        )
                                }
                            }
                            .clickable {
                                timelineHeight =
                                    if (timelineHeight > collapsedHeight + 1f) collapsedHeight
                                    else maxTimelineHeight
                            },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier.width(32.dp)
                            .height(4.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFEBDBB2).copy(alpha = 0.4f))
                    )
                }

            Row(
                Modifier.fillMaxWidth().height(36.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (currentIdx >= 0) "${currentIdx + 1}/$frameCount" else "—/$frameCount",
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                )
                IconButton(
                    onClick = { goToFrame(if (currentIdx < 0) frameCount - 1 else currentIdx - 1) },
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(Icons.Default.SkipPrevious, "Quadro anterior", Modifier.size(28.dp))
                }
                FilledIconButton(
                    onClick = {
                        isPlaying = !isPlaying
                        if (isPlaying) engine.startAnimationPlayback()
                        else engine.isAnimationPlaying = false
                    },
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(
                        if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        if (isPlaying) "Pausar" else "Reproduzir",
                        Modifier.size(21.dp),
                    )
                }
                IconButton(
                    onClick = { goToFrame(currentIdx + 1) },
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(Icons.Default.SkipNext, "Próximo quadro", Modifier.size(28.dp))
                }
                Box {
                    TextButton(
                        onClick = { fpsMenuExpanded = true },
                        contentPadding = PaddingValues(horizontal = 6.dp),
                        modifier = Modifier.height(32.dp),
                    ) {
                        Text("$fps fps", style = MaterialTheme.typography.labelSmall)
                    }
                    DropdownMenu(fpsMenuExpanded, { fpsMenuExpanded = false }) {
                        listOf(6, 8, 12, 15, 24, 30, 48, 60).forEach { rate ->
                            DropdownMenuItem(
                                text = { Text("$rate fps") },
                                onClick = {
                                    fps = rate
                                    engine.animationFps = rate
                                    fpsMenuExpanded = false
                                },
                            )
                        }
                    }
                }
                Box {
                    IconButton(onClick = { timelineMenu = true }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.MoreVert, "Opções da timeline", Modifier.size(18.dp))
                    }
                    DropdownMenu(timelineMenu, { timelineMenu = false }) {
                        DropdownMenuItem(
                            text = {
                                Text(if (loop) "Desativar repetição" else "Repetir animação")
                            },
                            onClick = {
                                loop = !loop
                                engine.animationLoop = loop
                                timelineMenu = false
                            },
                            trailingIcon =
                                if (loop) {
                                    { Text("✓") }
                                } else null,
                        )
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (onionSkin) "Ocultar quadros vizinhos"
                                    else "Mostrar quadros vizinhos"
                                )
                            },
                            onClick = {
                                onionSkin = !onionSkin
                                engine.onionSkinEnabled = onionSkin
                                timelineMenu = false
                                onFrameChanged()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Configurar onion skin…") },
                            onClick = {
                                timelineMenu = false
                                showOnionSettings = true
                            },
                        )
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("Adicionar camada") },
                            onClick = {
                                timelineMenu = false
                                engine.addLayer()
                                syncTimeline()
                                layerRevision++
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Criar grupo da camada ativa") },
                            onClick = {
                                timelineMenu = false
                                val group = engine.createRasterLayerGroup()
                                engine.moveLayerToRasterGroup(engine.activeLayerIndex, group.id)
                                groupNameInput = group.name
                                editingGroupId = group.id
                                layerRevision++
                            },
                        )
                        DropdownMenuItem(
                            text = {
                                Text("Excluir quadro…", color = MaterialTheme.colorScheme.error)
                            },
                            enabled = frameCount > 1 && currentIdx >= 0,
                            onClick = {
                                timelineMenu = false
                                showDeleteFrameConfirm = true
                            },
                        )
                    }
                }
                IconButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        onClose()
                    },
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(Icons.Default.Close, "Fechar timeline", Modifier.size(17.dp))
                }
            }
            Row(
                Modifier.fillMaxWidth().height(32.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.addAnimationFrame()
                        syncTimeline()
                    },
                    contentPadding = PaddingValues(horizontal = 6.dp),
                    modifier = Modifier.height(32.dp),
                ) {
                    Icon(Icons.Default.Add, null, Modifier.size(16.dp))
                    Text("Quadro", style = MaterialTheme.typography.labelSmall)
                }
                IconButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.duplicateAnimationFrame()
                        syncTimeline()
                    },
                    enabled = currentIdx >= 0,
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(Icons.Default.ContentCopy, "Duplicar quadro", Modifier.size(17.dp))
                }
                TextButton(
                    onClick = {
                        durationInput = currentDuration.toString()
                        showDurationEditor = true
                    },
                    enabled = currentIdx >= 0,
                    contentPadding = PaddingValues(horizontal = 6.dp),
                    modifier = Modifier.height(32.dp),
                ) {
                    Text("${currentDuration}f", style = MaterialTheme.typography.labelSmall)
                    Icon(Icons.Default.ExpandMore, "Duração do quadro", Modifier.size(14.dp))
                }
                Spacer(Modifier.weight(1f))
                IconButton(
                    onClick = { tickWidth = (tickWidth - 8).coerceAtLeast(24) },
                    enabled = tickWidth > 24,
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(Icons.Default.Remove, "Diminuir zoom da timeline", Modifier.size(17.dp))
                }
                IconButton(
                    onClick = { tickWidth = (tickWidth + 8).coerceAtMost(80) },
                    enabled = tickWidth < 80,
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(Icons.Default.Add, "Aumentar zoom da timeline", Modifier.size(17.dp))
                }
            }
            Row(
                Modifier.fillMaxWidth().height(24.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Camadas",
                    Modifier.width(124.dp).padding(start = 8.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val totalTicks = engine.totalAnimationTicks().coerceAtLeast(1)
                val tickColor = MaterialTheme.colorScheme.outline
                val accentColor = MaterialTheme.colorScheme.primary
                val textColor = MaterialTheme.colorScheme.onSurfaceVariant
                val densityScale = LocalDensity.current.density
                val labelPaint =
                    remember(densityScale, textColor) {
                        android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                            textSize = 10f * densityScale
                            color =
                                android.graphics.Color.argb(
                                    255,
                                    (textColor.red * 255).toInt(),
                                    (textColor.green * 255).toInt(),
                                    (textColor.blue * 255).toInt(),
                                )
                        }
                    }
                Row(
                    Modifier.weight(1f)
                        .onSizeChanged { timeViewportWidth = it.width }
                        .horizontalScroll(timelineHorizontalScroll)
                ) {
                    Canvas(
                        Modifier.width((totalTicks * tickWidth).dp).fillMaxHeight().pointerInput(
                            totalTicks,
                            durationPixelsPerFrame,
                        ) {
                            detectTapGestures { point ->
                                isPlaying = false
                                engine.isAnimationPlaying = false
                                engine.applyAnimationTick(
                                    (point.x / durationPixelsPerFrame)
                                        .toInt()
                                        .coerceIn(0, totalTicks - 1)
                                )
                                syncTimeline()
                            }
                        }
                    ) {
                        val firstTick =
                            (timelineHorizontalScroll.value / durationPixelsPerFrame)
                                .toInt()
                                .coerceAtLeast(0)
                        val lastTick =
                            ((timelineHorizontalScroll.value + timeViewportWidth) /
                                    durationPixelsPerFrame)
                                .toInt()
                                .coerceAtMost(totalTicks - 1)
                        for (tick in firstTick..lastTick) {
                            val x = tick * durationPixelsPerFrame
                            drawLine(
                                tickColor,
                                Offset(x, size.height - 4.dp.toPx()),
                                Offset(x, size.height),
                                1.dp.toPx(),
                            )
                            drawIntoCanvas { canvas ->
                                canvas.nativeCanvas.drawText(
                                    "${tick + 1}",
                                    x + 4.dp.toPx(),
                                    14.dp.toPx(),
                                    labelPaint,
                                )
                            }
                        }
                        val playhead = currentTick * durationPixelsPerFrame
                        drawLine(
                            accentColor,
                            Offset(playhead, 0f),
                            Offset(playhead, size.height),
                            2.dp.toPx(),
                        )
                    }
                }
            }
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(1.dp),
                modifier = Modifier.fillMaxWidth().weight(1f),
            ) {
                itemsIndexed(
                    timelineEntries,
                    key = { _, entry ->
                        when (entry) {
                            is TimelineEntry.Group -> "group:${entry.group.id}"
                            is TimelineEntry.Layer -> "layer:${entry.layer.id}"
                        }
                    },
                ) { _, entry ->
                    when (entry) {
                        is TimelineEntry.Group -> {
                            val group = entry.group
                            Row(
                                modifier =
                                    Modifier.fillMaxWidth()
                                        .height(28.dp)
                                        .padding(start = (entry.depth * 10).dp)
                                        .clip(RectangleShape)
                                        .background(Color(0xFF3C3836)),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                TextButton(
                                    onClick = {
                                        group.collapsed = !group.collapsed
                                        layerRevision++
                                    },
                                    contentPadding = PaddingValues(horizontal = 4.dp),
                                    modifier = Modifier.height(28.dp),
                                ) {
                                    Text(
                                        if (group.collapsed) "▸" else "▾",
                                        color = Color(0xFFFABD2F),
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        engine.toggleRasterLayerGroupVisibility(group.id)
                                        layerRevision++
                                        onFrameChanged()
                                    },
                                    modifier = Modifier.size(26.dp),
                                ) {
                                    Icon(
                                        if (group.visible) Icons.Default.Visibility
                                        else Icons.Default.VisibilityOff,
                                        contentDescription =
                                            if (group.visible) "Ocultar grupo" else "Mostrar grupo",
                                        tint =
                                            if (group.visible) Color(0xFFD5C4A1)
                                            else Color(0xFF928374),
                                        modifier = Modifier.size(15.dp),
                                    )
                                }
                                Text(
                                    group.name,
                                    fontSize = 10.sp,
                                    maxLines = 1,
                                    color = Color(0xFFEBDBB2),
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    "${engine.rasterGroupLayerIds(group.id).size} cam.",
                                    fontSize = 8.sp,
                                    color = Color(0xFFA89984),
                                )
                                Box {
                                    IconButton(
                                        onClick = { groupMenuId = group.id },
                                        modifier = Modifier.size(24.dp),
                                    ) {
                                        Icon(
                                            Icons.Default.MoreVert,
                                            contentDescription = "Opções do grupo",
                                            tint = Color(0xFFA89984),
                                            modifier = Modifier.size(15.dp),
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = groupMenuId == group.id,
                                        onDismissRequest = { groupMenuId = null },
                                    ) {
                                        DropdownMenuItem(
                                            text = { Text("Renomear") },
                                            onClick = {
                                                groupNameInput = group.name
                                                editingGroupId = group.id
                                                groupMenuId = null
                                            },
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Desagrupar") },
                                            onClick = {
                                                engine.deleteRasterLayerGroup(group.id)
                                                groupMenuId = null
                                                layerRevision++
                                            },
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Mover para raiz") },
                                            onClick = {
                                                engine.nestRasterLayerGroup(group.id, null)
                                                groupMenuId = null
                                                layerRevision++
                                            },
                                        )
                                        engine.rasterLayerGroups.values
                                            .filter { it.id != group.id }
                                            .forEach { parent ->
                                                DropdownMenuItem(
                                                    text = { Text("Aninhar em ${parent.name}") },
                                                    onClick = {
                                                        engine.nestRasterLayerGroup(
                                                            group.id,
                                                            parent.id,
                                                        )
                                                        groupMenuId = null
                                                        layerRevision++
                                                    },
                                                )
                                            }
                                    }
                                }
                            }
                        }
                        is TimelineEntry.Layer -> {
                            val layer = entry.layer
                            val track = engine.animationTracks[layer.id] ?: return@itemsIndexed
                            var reorderDragRemainder by
                                remember(layer.id) { mutableFloatStateOf(0f) }
                            var reorderUndoToken by remember(layer.id) { mutableStateOf(0L) }
                            Row(
                                modifier = Modifier.fillMaxWidth().height(40.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(
                                    modifier =
                                        Modifier.width(124.dp)
                                            .fillMaxHeight()
                                            .padding(start = (entry.depth * 4).dp)
                                            .clip(RectangleShape)
                                            .background(
                                                if (layer.id == engine.activeLayerIndex)
                                                    Color(0xFF504945)
                                                else Color(0xFF282828)
                                            )
                                            .pointerInput(layer.id, layerRowHeightPixels) {
                                                detectDragGesturesAfterLongPress(
                                                    onDragStart = {
                                                        reorderDragRemainder = 0f
                                                        reorderUndoToken = 0L
                                                    },
                                                    onDragEnd = {
                                                        reorderDragRemainder = 0f
                                                        reorderUndoToken = 0L
                                                    },
                                                    onDragCancel = {
                                                        reorderDragRemainder = 0f
                                                        reorderUndoToken = 0L
                                                    },
                                                    onDrag = { change, dragAmount ->
                                                        change.consume()
                                                        reorderDragRemainder += dragAmount.y
                                                        val rows =
                                                            (reorderDragRemainder /
                                                                    layerRowHeightPixels)
                                                                .toInt()
                                                        if (rows != 0) {
                                                            if (reorderUndoToken == 0L)
                                                                reorderUndoToken =
                                                                    engine.beginLayerOrderChange()
                                                            engine.moveLayerByOrderDelta(
                                                                layer.id,
                                                                rows,
                                                                captureUndo = false,
                                                                orderHistoryToken = reorderUndoToken,
                                                            )
                                                            reorderDragRemainder -=
                                                                rows * layerRowHeightPixels
                                                            layerRevision++
                                                            onFrameChanged()
                                                        }
                                                    },
                                                )
                                            }
                                            .clickable {
                                                engine.selectLayer(layer.id)
                                                currentIdx = engine.currentFrameIndex
                                                currentTick = engine.currentAnimationTick
                                                frameCount = engine.animationFrames.size
                                                currentDuration =
                                                    engine.animationFrames
                                                        .getOrNull(currentIdx)
                                                        ?.duration ?: 1
                                                onFrameChanged()
                                            },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        IconButton(
                                            onClick = {
                                                engine.setLayerVisible(layer.id, !layer.visible)
                                                layerRevision++
                                                onFrameChanged()
                                            },
                                            modifier = Modifier.size(28.dp),
                                        ) {
                                            Icon(
                                                if (layer.visible) Icons.Default.Visibility
                                                else Icons.Default.VisibilityOff,
                                                contentDescription =
                                                    if (layer.visible) "Ocultar camada"
                                                    else "Mostrar camada",
                                                tint =
                                                    if (layer.visible) Color(0xFFD5C4A1)
                                                    else Color(0xFF928374),
                                                modifier = Modifier.size(15.dp),
                                            )
                                        }
                                        Text(
                                            layer.name,
                                            fontSize = 11.sp,
                                            maxLines = 1,
                                            color =
                                                if (layer.id == engine.activeLayerIndex)
                                                    Color(0xFFEBDBB2)
                                                else Color(0xFFEBDBB2),
                                            modifier = Modifier.weight(1f),
                                        )
                                        Box {
                                            IconButton(
                                                onClick = { layerMenuId = layer.id },
                                                modifier = Modifier.size(28.dp),
                                            ) {
                                                Icon(
                                                    Icons.Default.MoreVert,
                                                    contentDescription = "Opções da camada",
                                                    tint = Color(0xFFA89984),
                                                    modifier = Modifier.size(13.dp),
                                                )
                                            }
                                            DropdownMenu(
                                                expanded = layerMenuId == layer.id,
                                                onDismissRequest = { layerMenuId = -1 },
                                            ) {
                                                DropdownMenuItem(
                                                    text = { Text("Renomear") },
                                                    onClick = {
                                                        layerNameInput = layer.name
                                                        editingLayerId = layer.id
                                                        layerMenuId = -1
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("Mover para cima") },
                                                    enabled =
                                                        engine.layers.indexOfFirst {
                                                            it.id == layer.id
                                                        } < engine.layers.lastIndex,
                                                    onClick = {
                                                        engine.moveLayerUp(layer.id)
                                                        layerRevision++
                                                        layerMenuId = -1
                                                        onFrameChanged()
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("Mover para baixo") },
                                                    enabled =
                                                        engine.layers.indexOfFirst {
                                                            it.id == layer.id
                                                        } > 0,
                                                    onClick = {
                                                        engine.moveLayerDown(layer.id)
                                                        layerRevision++
                                                        layerMenuId = -1
                                                        onFrameChanged()
                                                    },
                                                )
                                                engine.rasterLayerGroups.values.forEach { group ->
                                                    DropdownMenuItem(
                                                        text = { Text("Mover para ${group.name}") },
                                                        onClick = {
                                                            engine.moveLayerToRasterGroup(
                                                                layer.id,
                                                                group.id,
                                                            )
                                                            layerRevision++
                                                            layerMenuId = -1
                                                        },
                                                    )
                                                }
                                                if (
                                                    engine.rasterLayerGroups.values.any {
                                                        layer.id in it.layerIds
                                                    }
                                                ) {
                                                    DropdownMenuItem(
                                                        text = { Text("Remover do grupo") },
                                                        onClick = {
                                                            engine.moveLayerToRasterGroup(
                                                                layer.id,
                                                                null,
                                                            )
                                                            layerRevision++
                                                            layerMenuId = -1
                                                        },
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                                Row(
                                    modifier =
                                        Modifier.fillMaxHeight()
                                            .weight(1f)
                                            .horizontalScroll(timelineHorizontalScroll)
                                            .drawWithContent {
                                                drawContent()
                                                val x = currentTick * durationPixelsPerFrame
                                                drawLine(
                                                    Color(0xFFFABD2F),
                                                    Offset(x, 0f),
                                                    Offset(x, size.height),
                                                    1.dp.toPx(),
                                                )
                                            }
                                ) {
                                    track.frames.forEachIndexed { index, cel ->
                                        // Read mutable engine data again on each timeline revision.
                                        // Keep pointerInput keys stable while the handle is dragged.
                                        val celDuration = remember(revision, layerRevision, cel.id) {
                                            cel.duration.coerceAtLeast(1)
                                        }
                                        val selected = index == track.activeCelIndex
                                        var durationDragRemainder by
                                            remember(layer.id, index) { mutableFloatStateOf(0f) }
                                        var durationUndoStarted by
                                            remember(layer.id, index) { mutableStateOf(false) }
                                        fun activateCel() {
                                            isPlaying = false
                                            engine.isAnimationPlaying = false
                                            engine.selectLayer(layer.id)
                                            engine.restoreFrame(index)
                                            currentIdx = engine.currentFrameIndex
                                            currentTick = engine.currentAnimationTick
                                            frameCount = engine.animationFrames.size
                                            currentDuration =
                                                engine.animationFrames
                                                    .getOrNull(currentIdx)
                                                    ?.duration ?: 1
                                            onFrameChanged()
                                        }
                                        Box(
                                            modifier =
                                                Modifier.width(
                                                        (celDuration *
                                                                tickWidth.toFloat() - 2f)
                                                            .coerceAtLeast(22f)
                                                            .dp
                                                    )
                                                    .fillMaxHeight()
                                                    .clip(RectangleShape)
                                                    .background(Color(0xFF1D2021))
                                                    .border(
                                                        if (selected) 2.dp else 1.dp,
                                                        if (selected) Color(0xFFFABD2F)
                                                        else Color(0xFF504945),
                                                        RectangleShape,
                                                    )
                                                    .combinedClickable(
                                                        onClick = { activateCel() },
                                                        onLongClick = {
                                                            celMenuTarget = layer.id to index
                                                        },
                                                    ),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            DropdownMenu(
                                                expanded = celMenuTarget == (layer.id to index),
                                                onDismissRequest = { celMenuTarget = null },
                                            ) {
                                                DropdownMenuItem(
                                                    text = { Text("Inserir cel vazio depois") },
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        engine.addAnimationFrame()
                                                        currentIdx = engine.currentFrameIndex
                                                        currentTick = engine.currentAnimationTick
                                                        frameCount = engine.animationFrames.size
                                                        currentDuration =
                                                            engine.animationFrames
                                                                .getOrNull(currentIdx)
                                                                ?.duration ?: 1
                                                        onFrameChanged()
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("Duplicar cel") },
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        engine.duplicateAnimationFrame()
                                                        currentIdx = engine.currentFrameIndex
                                                        currentTick = engine.currentAnimationTick
                                                        frameCount = engine.animationFrames.size
                                                        currentDuration =
                                                            engine.animationFrames
                                                                .getOrNull(currentIdx)
                                                                ?.duration ?: 1
                                                        onFrameChanged()
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("Editar duração…") },
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        durationInput = currentDuration.toString()
                                                        showDurationEditor = true
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("Opacidade do cel…") },
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        celOpacityValue = cel.opacity / 255f
                                                        showCelOpacityEditor = true
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = {
                                                        Text(
                                                            if (cel.visible) "Ocultar cel"
                                                            else "Mostrar cel"
                                                        )
                                                    },
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        engine.setCurrentCelVisible(!cel.visible)
                                                        layerRevision++
                                                        onFrameChanged()
                                                    },
                                                )
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
                                                    },
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
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("Limpar cel") },
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        showClearFrameConfirm = true
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    text = {
                                                        Text(
                                                            "Excluir cel",
                                                            color = MaterialTheme.colorScheme.error,
                                                        )
                                                    },
                                                    enabled = track.frames.size > 1,
                                                    onClick = {
                                                        celMenuTarget = null
                                                        activateCel()
                                                        engine.deleteAnimationFrame()
                                                        currentIdx = engine.currentFrameIndex
                                                        currentTick = engine.currentAnimationTick
                                                        frameCount = engine.animationFrames.size
                                                        currentDuration =
                                                            engine.animationFrames
                                                                .getOrNull(currentIdx)
                                                                ?.duration ?: 1
                                                        onFrameChanged()
                                                    },
                                                )
                                            }
                                            Box(
                                                modifier =
                                                    Modifier.align(Alignment.CenterEnd)
                                                        .width(18.dp)
                                                        .fillMaxHeight()
                                                        .pointerInput(
                                                            layer.id,
                                                            cel.id,
                                                            durationPixelsPerFrame,
                                                        ) {
                                                            detectHorizontalDragGestures(
                                                                onDragStart = {
                                                                    durationDragRemainder = 0f
                                                                    durationUndoStarted = false
                                                                    isPlaying = false
                                                                    engine.isAnimationPlaying =
                                                                        false
                                                                    engine.selectLayer(layer.id)
                                                                    engine.restoreFrame(index)
                                                                    currentIdx =
                                                                        engine.currentFrameIndex
                                                                    currentTick =
                                                                        engine.currentAnimationTick
                                                                    currentDuration =
                                                                        engine.animationFrames
                                                                            .getOrNull(currentIdx)
                                                                            ?.duration ?: 1
                                                                    onFrameChanged()
                                                                },
                                                                onHorizontalDrag = {
                                                                    change,
                                                                    dragAmount ->
                                                                    change.consume()
                                                                    durationDragRemainder +=
                                                                        dragAmount
                                                                    val steps =
                                                                        (durationDragRemainder /
                                                                                durationPixelsPerFrame)
                                                                            .toInt()
                                                                    if (steps != 0) {
                                                                        if (!durationUndoStarted) {
                                                                            durationUndoStarted =
                                                                                engine
                                                                                    .beginCelDurationEdit()
                                                                        }
                                                                        val duration =
                                                                            engine.animationTracks[
                                                                                    layer.id]
                                                                                ?.frames
                                                                                ?.getOrNull(index)
                                                                                ?.duration ?: 1
                                                                        engine
                                                                            .setCurrentFrameDuration(
                                                                                (duration + steps)
                                                                                    .coerceAtLeast(
                                                                                        1
                                                                                    )
                                                                            )
                                                                        durationDragRemainder -=
                                                                            steps *
                                                                                durationPixelsPerFrame
                                                                        currentDuration =
                                                                            engine.animationTracks[
                                                                                    layer.id]
                                                                                ?.frames
                                                                                ?.getOrNull(index)
                                                                                ?.duration ?: 1
                                                                        currentIdx =
                                                                            engine.currentFrameIndex
                                                                        currentTick =
                                                                            engine
                                                                                .currentAnimationTick
                                                                        onFrameChanged()
                                                                    }
                                                                },
                                                                onDragEnd = {
                                                                    durationDragRemainder = 0f
                                                                    if (durationUndoStarted)
                                                                        engine
                                                                            .finishCelDurationEdit()
                                                                    durationUndoStarted = false
                                                                    onFrameChanged()
                                                                },
                                                                onDragCancel = {
                                                                    durationDragRemainder = 0f
                                                                    if (durationUndoStarted)
                                                                        engine
                                                                            .finishCelDurationEdit()
                                                                    durationUndoStarted = false
                                                                    onFrameChanged()
                                                                },
                                                            )
                                                        },
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Box(
                                                    Modifier.width(2.dp)
                                                        .fillMaxHeight(0.5f)
                                                        .background(
                                                            Color(0xFFFABD2F),
                                                            RectangleShape,
                                                        )
                                                )
                                            }
                                            Column(
                                                horizontalAlignment = Alignment.CenterHorizontally,
                                                verticalArrangement = Arrangement.Center,
                                            ) {
                                                Text(
                                                    "${index + 1}",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color =
                                                        if (selected) Color(0xFFEBDBB2)
                                                        else Color(0xFFEBDBB2),
                                                    maxLines = 1,
                                                )
                                                if (celDuration > 1)
                                                    Text(
                                                        "${celDuration}f",
                                                        fontSize = 10.sp,
                                                        color =
                                                            if (selected) Color(0xFFFABD2F)
                                                            else Color(0xFFA89984),
                                                        maxLines = 1,
                                                    )
                                            }
                                        }
                                        Spacer(Modifier.width(2.dp).fillMaxHeight())
                                    }
                                    val layerDurationTicks =
                                        track.frames.sumOf { it.duration.coerceAtLeast(1) }
                                    val remainingTicks =
                                        (engine.totalAnimationTicks() - layerDurationTicks)
                                            .coerceAtLeast(0)
                                    Spacer(
                                        Modifier.width((remainingTicks * tickWidth.toFloat()).dp)
                                            .fillMaxHeight()
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteFrameConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteFrameConfirm = false },
            title = { Text("Excluir quadro?") },
            text = { Text("O quadro atual será removido da camada ativa.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.deleteAnimationFrame()
                        syncTimeline()
                        showDeleteFrameConfirm = false
                    }
                ) {
                    Text("Excluir", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteFrameConfirm = false }) { Text("Cancelar") }
            },
        )
    }

    if (showOnionSettings) {
        AlertDialog(
            onDismissRequest = { showOnionSettings = false },
            title = { Text("Onion skin") },
            text = {
                Column(
                    Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "Quadros anteriores: $onionPrevCount",
                        style = MaterialTheme.typography.labelMedium,
                    )
                    Slider(
                        value = onionPrevCount.toFloat(),
                        onValueChange = {
                            onionPrevCount = it.toInt()
                            engine.onionPrevFrames = onionPrevCount
                            onFrameChanged()
                        },
                        valueRange = 0f..5f,
                        steps = 4,
                    )
                    Text(
                        "Quadros seguintes: $onionNextCount",
                        style = MaterialTheme.typography.labelMedium,
                    )
                    Slider(
                        value = onionNextCount.toFloat(),
                        onValueChange = {
                            onionNextCount = it.toInt()
                            engine.onionNextFrames = onionNextCount
                            onFrameChanged()
                        },
                        valueRange = 0f..5f,
                        steps = 4,
                    )
                    Text(
                        "Opacidade: ${(onionOpacity * 100).toInt()}%",
                        style = MaterialTheme.typography.labelMedium,
                    )
                    Slider(
                        value = onionOpacity,
                        onValueChange = {
                            onionOpacity = it
                            engine.onionOpacity = it
                            onFrameChanged()
                        },
                        valueRange = 0.1f..0.85f,
                    )
                    OnionTintControl("Cor dos quadros anteriores", onionPrevTint) { tint ->
                        onionPrevTint = tint
                        engine.onionPrevTint = tint
                        onFrameChanged()
                    }
                    OnionTintControl("Cor dos quadros seguintes", onionNextTint) { tint ->
                        onionNextTint = tint
                        engine.onionNextTint = tint
                        onFrameChanged()
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showOnionSettings = false }) { Text("Pronto") }
            },
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
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        currentDuration =
                            durationInput.toIntOrNull()?.coerceAtLeast(1) ?: currentDuration
                        engine.setCurrentFrameDuration(currentDuration)
                        currentTick = engine.currentAnimationTick
                        showDurationEditor = false
                    }
                ) {
                    Text("Aplicar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDurationEditor = false }) { Text("Cancelar") }
            },
        )
    }

    if (showCelOpacityEditor) {
        AlertDialog(
            onDismissRequest = { showCelOpacityEditor = false },
            title = { Text("Opacidade do cel") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "${(celOpacityValue * 100).toInt()}%",
                        style = MaterialTheme.typography.labelMedium,
                    )
                    Slider(
                        value = celOpacityValue,
                        onValueChange = { celOpacityValue = it },
                        valueRange = 0f..1f,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        engine.setCurrentCelOpacity((celOpacityValue * 255).toInt())
                        showCelOpacityEditor = false
                        layerRevision++
                        onFrameChanged()
                    }
                ) {
                    Text("Aplicar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCelOpacityEditor = false }) { Text("Cancelar") }
            },
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
                    label = { Text("Nome") },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        engine.renameRasterLayerGroup(groupId, groupNameInput)
                        editingGroupId = null
                        layerRevision++
                    }
                ) {
                    Text("Salvar")
                }
            },
            dismissButton = { TextButton(onClick = { editingGroupId = null }) { Text("Cancelar") } },
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
                    label = { Text("Nome") },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        engine.renameLayer(editingLayerId, layerNameInput)
                        editingLayerId = -1
                        layerRevision++
                    }
                ) {
                    Text("Salvar")
                }
            },
            dismissButton = { TextButton(onClick = { editingLayerId = -1 }) { Text("Cancelar") } },
        )
    }

    if (showClearFrameConfirm) {
        AlertDialog(
            onDismissRequest = { showClearFrameConfirm = false },
            title = { Text("Limpar cel?") },
            text = { Text("Os pixels deste cel serão removidos.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        engine.clearCurrentAnimationFrame()
                        showClearFrameConfirm = false
                        onFrameChanged()
                    }
                ) {
                    Text("Limpar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearFrameConfirm = false }) { Text("Cancelar") }
            },
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
            Text(
                "$label  #${color.toUInt().toString(16).takeLast(6).uppercase()}",
                style = MaterialTheme.typography.labelMedium,
            )
        }
        Text("R $red", style = MaterialTheme.typography.labelSmall)
        Slider(
            value = red.toFloat(),
            onValueChange = { onColorChange(android.graphics.Color.rgb(it.toInt(), green, blue)) },
            valueRange = 0f..255f,
        )
        Text("G $green", style = MaterialTheme.typography.labelSmall)
        Slider(
            value = green.toFloat(),
            onValueChange = { onColorChange(android.graphics.Color.rgb(red, it.toInt(), blue)) },
            valueRange = 0f..255f,
        )
        Text("B $blue", style = MaterialTheme.typography.labelSmall)
        Slider(
            value = blue.toFloat(),
            onValueChange = { onColorChange(android.graphics.Color.rgb(red, green, it.toInt())) },
            valueRange = 0f..255f,
        )
    }
}
