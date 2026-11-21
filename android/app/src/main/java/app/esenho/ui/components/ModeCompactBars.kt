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
private fun RowScope.FrameStrip(frameCount: Int, current: Int, onSeek: (Int) -> Unit) {
    Row(
        Modifier.weight(1f).horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        (0 until frameCount).forEach { index ->
            Box(
                Modifier.size(28.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(
                        if (index == current) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
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
    CompactBarSurface {
        Text(
            "${current + 1}/$duration",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            maxLines = 1,
            modifier = Modifier.padding(start = 6.dp),
        )
        IconButton(onClick = { seek(current - 1) }, modifier = Modifier.size(36.dp)) {
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
        IconButton(onClick = { seek(current + 1) }, modifier = Modifier.size(36.dp)) {
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
            modifier = Modifier.size(36.dp),
        ) {
            Icon(Icons.Default.Add, "Adicionar keyframe", Modifier.size(18.dp))
        }
        FrameStrip(duration, current, ::seek)
        Box {
            IconButton(onClick = { menu = true }, modifier = Modifier.size(36.dp)) {
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
    CompactBarSurface {
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
                    shape = RoundedCornerShape(3.dp),
                    color =
                        if (selected) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f),
                    modifier =
                        Modifier.height(28.dp)
                            .clip(RoundedCornerShape(3.dp))
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
