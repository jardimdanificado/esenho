package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.nativeengine.EsenhoEngine
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable
fun AnimationTimelineBar(
    engine: EsenhoEngine,
    onFrameChanged: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPlaying by remember { mutableStateOf(engine.isAnimationPlaying) }
    var currentIdx by remember { mutableIntStateOf(engine.currentFrameIndex) }
    var fps by remember { mutableIntStateOf(engine.animationFps) }
    var onionSkin by remember { mutableStateOf(engine.onionSkinEnabled) }
    var frameCount by remember { mutableIntStateOf(engine.animationFrames.size) }

    // Playback loop
    LaunchedEffect(isPlaying, fps) {
        if (isPlaying) {
            while (isActive && isPlaying) {
                val delayMs = (1000L / fps.coerceIn(1, 30))
                delay(delayMs)
                if (engine.animationFrames.isNotEmpty()) {
                    val nextIdx = (engine.currentFrameIndex + 1) % engine.animationFrames.size
                    engine.restoreFrame(nextIdx)
                    currentIdx = nextIdx
                    onFrameChanged()
                }
            }
        }
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 8.dp,
        shadowElevation = 8.dp
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            // Control Row: Play, FPS, Onion, Add, Duplicate, Delete, Close
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    // Play / Pause
                    IconButton(onClick = {
                        isPlaying = !isPlaying
                        engine.isAnimationPlaying = isPlaying
                    }) {
                        Icon(
                            if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pausar" else "Reproduzir",
                            tint = if (isPlaying) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }

                    // FPS Counter
                    Text("${fps} FPS", fontSize = 12.sp, style = MaterialTheme.typography.labelSmall)

                    // Onion Skin Toggle
                    FilterChip(
                        selected = onionSkin,
                        onClick = {
                            onionSkin = !onionSkin
                            engine.onionSkinEnabled = onionSkin
                            onFrameChanged()
                        },
                        label = { Text("🧅 Onion", fontSize = 11.sp) }
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    // Add Blank Frame (+)
                    IconButton(onClick = {
                        engine.addAnimationFrame()
                        currentIdx = engine.currentFrameIndex
                        frameCount = engine.animationFrames.size
                        onFrameChanged()
                    }) {
                        Icon(Icons.Default.Add, contentDescription = "Adicionar Quadro")
                    }

                    // Duplicate Frame
                    IconButton(onClick = {
                        engine.duplicateAnimationFrame()
                        currentIdx = engine.currentFrameIndex
                        frameCount = engine.animationFrames.size
                        onFrameChanged()
                    }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Duplicar Quadro")
                    }

                    // Delete Frame
                    IconButton(
                        onClick = {
                            engine.deleteAnimationFrame()
                            currentIdx = engine.currentFrameIndex
                            frameCount = engine.animationFrames.size
                            onFrameChanged()
                        },
                        enabled = frameCount > 1
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Deletar Quadro")
                    }

                    // Close Timeline
                    IconButton(onClick = {
                        isPlaying = false
                        engine.isAnimationPlaying = false
                        onClose()
                    }) {
                        Icon(Icons.Default.Close, contentDescription = "Fechar Linha do Tempo")
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Frames Scroll Row
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                itemsIndexed(engine.animationFrames) { index, cel ->
                    val isSelected = index == currentIdx

                    Box(
                        modifier = Modifier
                            .width(52.dp)
                            .height(44.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(
                                if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                            )
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Gray,
                                shape = RoundedCornerShape(8.dp)
                            )
                            .clickable {
                                isPlaying = false
                                engine.isAnimationPlaying = false
                                engine.restoreFrame(index)
                                currentIdx = index
                                onFrameChanged()
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "${index + 1}",
                            fontSize = 12.sp,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}
