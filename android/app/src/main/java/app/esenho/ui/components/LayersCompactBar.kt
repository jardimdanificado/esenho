package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine

/** Single-row layer picker that lives above the tool strip. */
@Composable
fun LayersCompactBar(
    engine: EsenhoEngine,
    revision: Int,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var layers by remember { mutableStateOf(engine.layers.toList().reversed()) }
    var activeId by remember { mutableIntStateOf(engine.activeLayerIndex) }
    var menu by remember { mutableStateOf(false) }
    var draggingId by remember { mutableStateOf<Int?>(null) }
    var dragRemainder by remember { mutableFloatStateOf(0f) }
    val chipPixels =
        with(androidx.compose.ui.platform.LocalDensity.current) {
            (WorkspaceStyle.ItemHeight + WorkspaceStyle.ItemGap + 3.dp).toPx()
        }

    LaunchedEffect(revision) {
        layers = engine.layers.toList().reversed()
        activeId = engine.activeLayerIndex
    }

    fun refresh() {
        layers = engine.layers.toList().reversed()
        activeId = engine.activeLayerIndex
        onChanged()
    }

    CompactBarSurface(modifier) {
            IconButton(
                onClick = { engine.addLayer(); refresh() },
                modifier = Modifier.size(36.dp),
            ) {
                Icon(Icons.Default.Add, "Adicionar camada", Modifier.size(18.dp))
            }
            Row(
                Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                layers.forEach { layer ->
                    Surface(
                        shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
                        color =
                            when {
                                draggingId == layer.id ->
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                                layer.id == activeId ->
                                    MaterialTheme.colorScheme.primaryContainer
                                else ->
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
                            },
                        modifier =
                            Modifier.height(WorkspaceStyle.ItemHeight)
                                .clip(RoundedCornerShape(WorkspaceStyle.ItemRadius))
                                .pointerInput(layer.id, chipPixels) {
                                    detectDragGesturesAfterLongPress(
                                        onDragStart = {
                                            engine.selectLayer(layer.id)
                                            draggingId = layer.id
                                            dragRemainder = 0f
                                            refresh()
                                        },
                                        onDragEnd = {
                                            draggingId = null
                                            dragRemainder = 0f
                                        },
                                        onDragCancel = {
                                            draggingId = null
                                            dragRemainder = 0f
                                        },
                                        onDrag = { change, amount ->
                                            change.consume()
                                            dragRemainder += amount.x
                                            val steps = (dragRemainder / chipPixels).toInt()
                                            if (steps != 0) {
                                                repeat(kotlin.math.abs(steps)) {
                                                    if (steps > 0) engine.moveLayerDown(layer.id)
                                                    else engine.moveLayerUp(layer.id)
                                                }
                                                dragRemainder -= steps * chipPixels
                                                refresh()
                                            }
                                        },
                                    )
                                }
                                .clickable {
                                    engine.selectLayer(layer.id)
                                    refresh()
                                },
                    ) {
                        Row(
                            Modifier.padding(horizontal = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                if (layer.visible) Icons.Default.Visibility
                                else Icons.Default.VisibilityOff,
                                if (layer.visible) "Ocultar camada" else "Mostrar camada",
                                Modifier
                                    .size(14.dp)
                                    .clickable {
                                        engine.setLayerVisible(layer.id, !layer.visible)
                                        refresh()
                                    },
                            )
                            Text(
                                layer.name,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                color =
                                    if (layer.id == activeId) MaterialTheme.colorScheme.onPrimaryContainer
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            Box {
                IconButton(onClick = { menu = true }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.MoreVert, "Opções de camadas", Modifier.size(18.dp))
                }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("Adicionar camada") },
                        onClick = { engine.addLayer(); menu = false; refresh() },
                    )
                    DropdownMenuItem(
                        text = { Text("Duplicar camada") },
                        enabled = layers.isNotEmpty(),
                        onClick = { engine.duplicateLayer(activeId); menu = false; refresh() },
                    )
                    DropdownMenuItem(
                        text = { Text("Novo grupo") },
                        onClick = {
                            engine.editRasterGroups { engine.createRasterLayerGroup() }
                            menu = false
                            refresh()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Mover para cima") },
                        enabled = layers.firstOrNull()?.id != activeId,
                        onClick = { engine.moveLayerUp(activeId); menu = false; refresh() },
                    )
                    DropdownMenuItem(
                        text = { Text("Mover para baixo") },
                        enabled = layers.lastOrNull()?.id != activeId,
                        onClick = { engine.moveLayerDown(activeId); menu = false; refresh() },
                    )
                    DropdownMenuItem(
                        text = { Text("Mesclar com a de baixo") },
                        enabled = layers.size > 1 && layers.lastOrNull()?.id != activeId,
                        onClick = { engine.mergeDown(activeId); menu = false; refresh() },
                    )
                    DropdownMenuItem(
                        text = { Text("Excluir camada") },
                        enabled = layers.isNotEmpty(),
                        onClick = { engine.deleteLayer(activeId); menu = false; refresh() },
                    )
                    HorizontalDivider()
                    val active = layers.firstOrNull { it.id == activeId }
                    if (active != null) {
                        Text(
                            "Opacidade: ${active.opacity * 100 / 255}%",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        )
                        WorkspaceSlider(
                            value = active.opacity.toFloat(),
                            onValueChange = { engine.setLayerOpacity(activeId, it.toInt()) },
                            valueRange = 0f..255f,
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                    }
                }
            }
    }
}
