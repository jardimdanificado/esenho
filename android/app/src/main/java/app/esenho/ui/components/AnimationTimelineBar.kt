package app.esenho.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
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
    var currentDuration by remember { mutableIntStateOf(engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1) }
    var fpsMenuExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(isPlaying, fps) {
        if (isPlaying) {
            while (isActive && isPlaying) {
                val duration = engine.animationFrames.getOrNull(engine.currentFrameIndex)?.duration ?: 1
                delay((1000L * duration / fps.coerceIn(1, 30)).coerceAtLeast(16L))
                if (engine.animationFrames.isNotEmpty()) {
                    val next = (engine.currentFrameIndex + 1) % engine.animationFrames.size
                    engine.restoreFrame(next)
                    currentIdx = next
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
                .height(138.dp)
                .padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 6.dp)
        ) {
            // Transport controls and frame management stay in one compact strip.
            Row(
                modifier = Modifier.fillMaxWidth().height(38.dp),
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
                    Text("${(currentIdx + 1).coerceAtLeast(1)} / $frameCount", fontSize = 11.sp, color = Color(0xFFE1E4E7))
                }
                Spacer(Modifier.width(8.dp))
                FilledIconButton(
                    onClick = {
                        isPlaying = !isPlaying
                        engine.isAnimationPlaying = isPlaying
                    },
                    modifier = Modifier.size(32.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (isPlaying) Color(0xFF80C783) else Color(0xFF3A3F43),
                        contentColor = if (isPlaying) Color(0xFF152016) else Color(0xFFE5E8EB)
                    )
                ) {
                    Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = if (isPlaying) "Pausar" else "Reproduzir", modifier = Modifier.size(19.dp))
                }
                Box {
                    TextButton(onClick = { fpsMenuExpanded = true }, contentPadding = PaddingValues(horizontal = 7.dp)) {
                        Text("${fps} fps", fontSize = 11.sp, color = Color(0xFFD0D4D8))
                    }
                    DropdownMenu(expanded = fpsMenuExpanded, onDismissRequest = { fpsMenuExpanded = false }) {
                        listOf(6, 8, 12, 15, 24, 30).forEach { rate ->
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
                    }, contentPadding = PaddingValues(horizontal = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) { Text("−", fontSize = 16.sp, color = Color(0xFFE0E3E6)) }
                TextButton(
                    onClick = {
                        currentDuration = (currentDuration + 1).coerceAtMost(120)
                        engine.setCurrentFrameDuration(currentDuration)
                    }, contentPadding = PaddingValues(horizontal = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) { Text("${currentDuration}f +", fontSize = 10.sp, color = Color(0xFFFFC857)) }
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
                Spacer(Modifier.weight(1f))
                IconButton(onClick = {
                    engine.addAnimationFrame()
                    currentIdx = engine.currentFrameIndex
                    frameCount = engine.animationFrames.size
                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                    onFrameChanged()
                }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Add, contentDescription = "Adicionar quadro", tint = Color(0xFFD0D4D8), modifier = Modifier.size(19.dp))
                }
                IconButton(onClick = {
                    engine.duplicateAnimationFrame()
                    currentIdx = engine.currentFrameIndex
                    frameCount = engine.animationFrames.size
                    currentDuration = engine.animationFrames.getOrNull(currentIdx)?.duration ?: 1
                    onFrameChanged()
                }, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Duplicar quadro", tint = Color(0xFFD0D4D8), modifier = Modifier.size(17.dp))
                }
                IconButton(
                    onClick = {
                        engine.deleteAnimationFrame()
                        currentIdx = engine.currentFrameIndex
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

            Spacer(Modifier.height(4.dp))
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(horizontal = 2.dp),
                modifier = Modifier.fillMaxWidth().height(58.dp)
            ) {
                itemsIndexed(engine.animationFrames.toList()) { index, cel ->
                    val selected = index == currentIdx
                    Box(
                        modifier = Modifier
                            .width(76.dp)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(5.dp))
                            .background(Color(0xFF191B1D))
                            .border(
                                width = if (selected) 2.dp else 1.dp,
                                color = if (selected) Color(0xFF80C783) else Color(0xFF41464A),
                                shape = RoundedCornerShape(5.dp)
                            )
                            .clickable {
                                isPlaying = false
                                engine.isAnimationPlaying = false
                                engine.restoreFrame(index)
                                currentIdx = index
                                currentDuration = cel.duration
                                onFrameChanged()
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            bitmap = cel.bitmap.asImageBitmap(),
                            contentDescription = "Quadro ${index + 1}",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize().padding(3.dp)
                        )
                        Text(
                            text = (index + 1).toString().padStart(2, '0'),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (selected) Color(0xFFFFD166) else Color(0xFFCDD1D5),
                            modifier = Modifier.align(Alignment.BottomStart)
                                .clip(RoundedCornerShape(topEnd = 4.dp))
                                .background(Color(0xCC202326))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                        Text(
                            text = "${cel.duration}f",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (selected) Color(0xFF152016) else Color(0xFFE1E4E7),
                            modifier = Modifier.align(Alignment.BottomEnd)
                                .clip(RoundedCornerShape(topStart = 4.dp))
                                .background(if (selected) Color(0xFF80C783) else Color(0xCC303438))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                    }
                }
            }
        }
    }
}
