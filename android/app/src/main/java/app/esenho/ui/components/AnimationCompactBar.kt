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

/** Single-row animation controls that live above the tool strip. */
@Composable
fun AnimationCompactBar(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var currentIdx by remember { mutableIntStateOf(engine.currentFrameIndex) }
    var frameCount by remember { mutableIntStateOf(engine.animationFrames.size) }
    var playing by remember { mutableStateOf(engine.isAnimationPlaying) }
    var fps by remember { mutableIntStateOf(engine.animationFps) }
    var fpsMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }

    LaunchedEffect(revision) {
        currentIdx = engine.currentFrameIndex
        frameCount = engine.animationFrames.size
        playing = engine.isAnimationPlaying
        fps = engine.animationFps
    }

    fun sync() {
        currentIdx = engine.currentFrameIndex
        frameCount = engine.animationFrames.size
        onChanged()
    }

    fun goTo(index: Int) {
        playing = false
        engine.isAnimationPlaying = false
        if (frameCount > 0) engine.restoreFrame((index % frameCount + frameCount) % frameCount)
        sync()
    }

    Surface(
        modifier = modifier.fillMaxWidth().height(40.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                if (frameCount > 0) "${currentIdx + 1}/$frameCount" else "—/0",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                maxLines = 1,
            )
            IconButton(onClick = { goTo(currentIdx - 1) }, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.SkipPrevious, "Quadro anterior", Modifier.size(18.dp))
            }
            FilledIconButton(
                onClick = {
                    playing = !playing
                    if (playing) engine.startAnimationPlayback()
                    else engine.isAnimationPlaying = false
                },
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                    if (playing) "Pausar" else "Reproduzir",
                    Modifier.size(16.dp),
                )
            }
            IconButton(onClick = { goTo(currentIdx + 1) }, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.SkipNext, "Próximo quadro", Modifier.size(18.dp))
            }
            IconButton(
                onClick = {
                    engine.addAnimationFrame()
                    sync()
                },
                modifier = Modifier.size(28.dp),
            ) {
                Icon(Icons.Default.Add, "Adicionar quadro", Modifier.size(18.dp))
            }
            Row(
                Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                (0 until frameCount).forEach { index ->
                    Box(
                        Modifier.size(26.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(
                                if (index == currentIdx) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                            .border(
                                1.dp,
                                if (index == currentIdx) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outlineVariant,
                                RoundedCornerShape(3.dp),
                            )
                            .clickable { goTo(index) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "${index + 1}",
                            style = MaterialTheme.typography.labelSmall,
                            color =
                                if (index == currentIdx) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Box {
                TextButton(
                    onClick = { fpsMenu = true },
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    modifier = Modifier.height(28.dp),
                ) {
                    Text("$fps fps", style = MaterialTheme.typography.labelSmall)
                }
                DropdownMenu(fpsMenu, { fpsMenu = false }) {
                    listOf(6, 8, 12, 15, 24, 30, 48, 60).forEach { rate ->
                        DropdownMenuItem(
                            text = { Text("$rate fps") },
                            onClick = {
                                fps = rate
                                engine.animationFps = rate
                                fpsMenu = false
                                onChanged()
                            },
                        )
                    }
                }
            }
            Box {
                IconButton(onClick = { moreMenu = true }, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Default.MoreVert, "Opções de animação", Modifier.size(18.dp))
                }
                DropdownMenu(moreMenu, { moreMenu = false }) {
                    DropdownMenuItem(
                        text = { Text("Duplicar quadro") },
                        onClick = {
                            engine.duplicateAnimationFrame()
                            moreMenu = false
                            sync()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Excluir quadro") },
                        enabled = frameCount > 0,
                        onClick = {
                            engine.deleteAnimationFrame()
                            moreMenu = false
                            sync()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Repetir animação") },
                        onClick = {
                            engine.animationLoop = !engine.animationLoop
                            moreMenu = false
                            onChanged()
                        },
                    )
                }
            }
        }
    }
}
