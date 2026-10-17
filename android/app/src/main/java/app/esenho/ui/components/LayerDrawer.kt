package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.LayerBlendMode
import app.esenho.nativeengine.LayerModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LayerDrawer(
    engine: EsenhoEngine,
    onLayersUpdated: () -> Unit,
    onDismiss: () -> Unit
) {
    var layersList by remember { mutableStateOf(engine.layers.toList().reversed()) }
    var activeLayerId by remember { mutableIntStateOf(engine.activeLayerIndex) }
    val activeLayer = layersList.find { it.id == activeLayerId }

    fun refresh() {
        layersList = engine.layers.toList().reversed()
        activeLayerId = engine.activeLayerIndex
        onLayersUpdated()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
        ) {
            // Header with Add Layer button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Camadas (${layersList.size})",
                    style = MaterialTheme.typography.titleMedium
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(onClick = {
                        engine.addLayer()
                        refresh()
                    }) {
                        Icon(Icons.Default.Add, contentDescription = "Adicionar Camada")
                    }
                    IconButton(onClick = {
                        engine.duplicateLayer(activeLayerId)
                        refresh()
                    }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Duplicar")
                    }
                    IconButton(onClick = {
                        engine.mergeDown(activeLayerId)
                        refresh()
                    }) {
                        Icon(Icons.Default.CallMerge, contentDescription = "Mesclar para Baixo")
                    }
                    IconButton(
                        onClick = {
                            engine.deleteLayer(activeLayerId)
                            refresh()
                        },
                        enabled = layersList.size > 1
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Deletar")
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Active Layer Controls (Opacity & Blend Mode)
            if (activeLayer != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Opacidade: ${(activeLayer.opacity * 100 / 255)}%",
                                style = MaterialTheme.typography.labelSmall
                            )
                            // Alpha lock & Clipping buttons
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(
                                    selected = activeLayer.alphaLock,
                                    onClick = {
                                        val newLock = !activeLayer.alphaLock
                                        engine.setLayerAlphaLock(activeLayer.id, newLock)
                                        refresh()
                                    },
                                    label = { Text("Alpha Lock", fontSize = 10.sp) }
                                )
                                FilterChip(
                                    selected = activeLayer.clipping,
                                    onClick = {
                                        val newClip = !activeLayer.clipping
                                        engine.setLayerClipping(activeLayer.id, newClip)
                                        refresh()
                                    },
                                    label = { Text("Máscara", fontSize = 10.sp) }
                                )
                            }
                        }

                        Slider(
                            value = activeLayer.opacity.toFloat(),
                            onValueChange = {
                                engine.setLayerOpacity(activeLayer.id, it.toInt())
                                refresh()
                            },
                            valueRange = 0f..255f
                        )

                        // Blend Mode Row
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Modo:", style = MaterialTheme.typography.labelSmall)
                            LayerBlendMode.values().forEach { mode ->
                                FilterChip(
                                    selected = activeLayer.blendMode == mode,
                                    onClick = {
                                        engine.setLayerBlendMode(activeLayer.id, mode)
                                        refresh()
                                    },
                                    label = { Text(mode.displayName.split(" ")[0], fontSize = 10.sp) }
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Layer Items List
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(layersList) { layer ->
                    val isSelected = layer.id == activeLayerId

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                engine.selectLayer(layer.id)
                                refresh()
                            }
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                                shape = RoundedCornerShape(10.dp)
                            ),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surface
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                // Eye Visibility Button
                                IconButton(onClick = {
                                    engine.setLayerVisible(layer.id, !layer.visible)
                                    refresh()
                                }) {
                                    Icon(
                                        if (layer.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = "Visibilidade",
                                        tint = if (layer.visible) MaterialTheme.colorScheme.onSurface else Color.Gray
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = layer.name,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "${layer.blendMode.displayName} • ${(layer.opacity * 100 / 255)}%",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            // Layer Reorder Buttons
                            Row {
                                IconButton(
                                    onClick = {
                                        engine.moveLayerUp(layer.id)
                                        refresh()
                                    },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.ArrowUpward, contentDescription = "Subir", modifier = Modifier.size(16.dp))
                                }
                                IconButton(
                                    onClick = {
                                        engine.moveLayerDown(layer.id)
                                        refresh()
                                    },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.ArrowDownward, contentDescription = "Descer", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
