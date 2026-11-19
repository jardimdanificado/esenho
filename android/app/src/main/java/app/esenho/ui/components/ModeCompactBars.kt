package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.VectorSelection
import kotlinx.coroutines.delay

private val BarHeight = 40.dp

@Composable
private fun BarSurface(content: @Composable RowScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().height(BarHeight),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            content = content,
        )
    }
}

@Composable
private fun RowScope.FrameStrip(frameCount: Int, current: Int, onSeek: (Int) -> Unit) {
    Row(
        Modifier.weight(1f).horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        (0 until frameCount).forEach { index ->
            Box(
                Modifier.size(26.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(
                        if (index == current) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .border(
                        1.dp,
                        if (index == current) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.outlineVariant,
                        RoundedCornerShape(3.dp),
                    )
                    .clickable { onSeek(index) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "${index + 1}",
                    style = MaterialTheme.typography.labelSmall,
                    color =
                        if (index == current) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
fun VectorAnimationCompactBar(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
) {
    val animation = engine.vectors.animation
    var current by remember { mutableIntStateOf(animation.currentFrame) }
    var duration by remember { mutableIntStateOf(animation.duration) }
    var playing by remember { mutableStateOf(animation.playing) }
    var menu by remember { mutableStateOf(false) }
    LaunchedEffect(revision) {
        current = animation.currentFrame
        duration = animation.duration
        playing = animation.playing
    }
    fun sync() {
        current = animation.currentFrame
        duration = animation.duration
        onChanged()
    }
    fun seek(frame: Int) {
        animation.currentFrame = frame.coerceIn(0, (duration - 1).coerceAtLeast(0))
        engine.vectors.render()
        sync()
    }
    BarSurface {
        Text(
            "${current + 1}/$duration",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            maxLines = 1,
        )
        IconButton(onClick = { seek(current - 1) }, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Default.SkipPrevious, "Quadro anterior", Modifier.size(18.dp))
        }
        FilledIconButton(
            onClick = {
                playing = !playing
                animation.playing = playing
                onChanged()
            },
            modifier = Modifier.size(28.dp),
        ) {
            Icon(
                if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                if (playing) "Pausar" else "Reproduzir",
                Modifier.size(16.dp),
            )
        }
        IconButton(onClick = { seek(current + 1) }, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Default.SkipNext, "Próximo quadro", Modifier.size(18.dp))
        }
        IconButton(
            onClick = {
                val obj = engine.vectors.selected ?: return@IconButton
                val bounds = VectorSelection.VectorBounds.of(listOf(obj))
                animation.addKeyframe(
                    obj.id,
                    current,
                    bounds?.left ?: obj.nodes.firstOrNull()?.x ?: 0f,
                    bounds?.top ?: obj.nodes.firstOrNull()?.y ?: 0f,
                    0f,
                    1f,
                    obj.style.optDouble("opacity", 1.0).toFloat().coerceIn(0f, 1f),
                    "linear",
                    obj.fill,
                    obj.fontSize,
                )
                engine.vectors.render()
                sync()
            },
            modifier = Modifier.size(28.dp),
        ) {
            Icon(Icons.Default.Add, "Adicionar keyframe", Modifier.size(18.dp))
        }
        FrameStrip(duration, current, ::seek)
        Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.MoreVert, "Opções de animação vetorial", Modifier.size(18.dp))
            }
            DropdownMenu(menu, { menu = false }) {
                val obj = engine.vectors.selected
                DropdownMenuItem(
                    text = { Text("Remover keyframe do quadro") },
                    enabled = obj != null,
                    onClick = {
                        if (obj != null) animation.removeKeyframe(obj.id, current)
                        engine.vectors.render()
                        menu = false
                        sync()
                    },
                )
                DropdownMenuItem(
                    text = { Text(animation.activeClip?.let { "Clipe: $it" } ?: "Sem clipe ativo") },
                    onClick = { menu = false; onChanged() },
                )
            }
        }
    }
}

@Composable
fun VectorObjectsCompactBar(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
) {
    val vector = engine.vectors
    var objects by remember { mutableStateOf(vector.layers.values.flatten().asReversed()) }
    LaunchedEffect(revision) { objects = vector.layers.values.flatten().asReversed() }
    fun refresh() {
        objects = vector.layers.values.flatten().asReversed()
        onChanged()
    }
    BarSurface {
        Text(
            "Objetos",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Row(
            Modifier.weight(1f).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            objects.forEach { obj ->
                val selected = obj.id == vector.selectedId
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color =
                        if (selected) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                    modifier =
                        Modifier.height(28.dp)
                            .border(
                                1.dp,
                                if (selected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outlineVariant,
                                RoundedCornerShape(4.dp),
                            )
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { vector.selectObject(obj.id); refresh() },
                ) {
                    Row(
                        Modifier.padding(horizontal = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            if (obj.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            if (obj.visible) "Ocultar objeto" else "Mostrar objeto",
                            Modifier.size(14.dp).clickable {
                                vector.selection.toggleVisibility(obj)
                                vector.render()
                                refresh()
                            },
                        )
                        Text(
                            obj.name.ifBlank { "Caminho" },
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MeshAnimationCompactBar(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
) {
    val mesh = engine.meshes
    val animation = mesh.animation
    var current by remember { mutableIntStateOf(animation.currentFrame) }
    var duration by remember { mutableIntStateOf(animation.duration) }
    var playing by remember { mutableStateOf(animation.playing) }
    var menu by remember { mutableStateOf(false) }
    LaunchedEffect(revision) {
        current = animation.currentFrame
        duration = animation.duration
        playing = animation.playing
    }
    LaunchedEffect(playing) {
        while (playing) {
            delay((1000L / engine.animationFps.coerceIn(1, 60)).coerceAtLeast(16))
            animation.advance()
            mesh.seekFrame(animation.currentFrame)
            current = animation.currentFrame
            onChanged()
        }
    }
    fun sync() {
        current = animation.currentFrame
        duration = animation.duration
        onChanged()
    }
    fun seek(frame: Int) {
        mesh.seekFrame(frame.coerceIn(0, (duration - 1).coerceAtLeast(0)))
        sync()
    }
    BarSurface {
        Text(
            "${current + 1}/$duration",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            maxLines = 1,
        )
        IconButton(onClick = { seek(current - 1) }, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Default.SkipPrevious, "Quadro anterior", Modifier.size(18.dp))
        }
        FilledIconButton(
            onClick = {
                playing = !playing
                animation.playing = playing
                onChanged()
            },
            modifier = Modifier.size(28.dp),
        ) {
            Icon(
                if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                if (playing) "Pausar" else "Reproduzir",
                Modifier.size(16.dp),
            )
        }
        IconButton(onClick = { seek(current + 1) }, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Default.SkipNext, "Próximo quadro", Modifier.size(18.dp))
        }
        FrameStrip(duration, current, ::seek)
        Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.Add, "Criar keyframe", Modifier.size(18.dp))
            }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(
                    text = { Text("Keyframe do objeto") },
                    enabled = mesh.selected != null,
                    onClick = { mesh.keyframeObject(current); menu = false; sync() },
                )
                DropdownMenuItem(
                    text = { Text("Keyframe da câmera") },
                    onClick = { mesh.keyframeCamera(current); menu = false; sync() },
                )
                DropdownMenuItem(
                    text = { Text("Keyframe da luz") },
                    onClick = { mesh.keyframeLight(current); menu = false; sync() },
                )
            }
        }
    }
}

@Composable
fun MeshObjectsCompactBar(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
) {
    val mesh = engine.meshes
    var objects by remember { mutableStateOf(mesh.scene.objects.toList()) }
    LaunchedEffect(revision) { objects = mesh.scene.objects.toList() }
    fun refresh() {
        objects = mesh.scene.objects.toList()
        onChanged()
    }
    BarSurface {
        Text(
            "Objetos 3D",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Row(
            Modifier.weight(1f).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            objects.forEach { obj ->
                val selected = obj.id == mesh.selectedId
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color =
                        if (selected) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                    modifier =
                        Modifier.height(28.dp)
                            .border(
                                1.dp,
                                if (selected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outlineVariant,
                                RoundedCornerShape(4.dp),
                            )
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { mesh.selectedId = obj.id; refresh() },
                ) {
                    Row(
                        Modifier.padding(horizontal = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            if (obj.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            if (obj.visible) "Ocultar objeto" else "Mostrar objeto",
                            Modifier.size(14.dp).clickable {
                                obj.visible = !obj.visible
                                mesh.render()
                                refresh()
                            },
                        )
                        Text(
                            obj.name,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}
