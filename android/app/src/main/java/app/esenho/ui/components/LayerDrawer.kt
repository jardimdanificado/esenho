package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMerge
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
            // Header with Layer Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Camadas (${layersList.size})",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                    Text(
                        text = "Toque para selecionar • Arraste ou use setas para ordenar",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
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
                        Icon(Icons.AutoMirrored.Filled.CallMerge, contentDescription = "Mesclar para Baixo")
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

            // 1. Primary Layer Items List (Takes main focus)
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 180.dp, max = 280.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(layersList, key = { it.id }) { layer ->
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
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                // Eye Visibility Button
                                IconButton(onClick = {
                                    engine.setLayerVisible(layer.id, !layer.visible)
                                    refresh()
                                }) {
                                    Icon(
                                        if (layer.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = "Visibilidade",
                                        tint = if (layer.visible) MaterialTheme.colorScheme.primary else Color.Gray
                                    )
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                                Column {
                                    Text(
                                        text = layer.name,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (isSelected) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Normal,
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

            Spacer(modifier = Modifier.height(10.dp))

            // 2. Active Layer Options & Adjustments Card (Docked at Bottom, Never Squeezed)
            if (activeLayer != null) {
                var localOpacity by remember(activeLayer.id, activeLayer.opacity) {
                    mutableFloatStateOf(activeLayer.opacity.toFloat())
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        // Opacity Header & Smooth Slider
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Opacidade (${activeLayer.name}): ${(localOpacity * 100 / 255).toInt()}%",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }

                        Slider(
                            value = localOpacity.coerceIn(0f, 255f),
                            onValueChange = {
                                localOpacity = it
                                engine.setLayerOpacity(activeLayer.id, it.toInt(), commitUndo = false)
                                onLayersUpdated()
                            },
                            onValueChangeFinished = {
                                engine.setLayerOpacity(activeLayer.id, localOpacity.toInt(), commitUndo = true)
                                refresh()
                            },
                            valueRange = 0f..255f
                        )

                        // Blend Modes (Horizontally scrollable with full names)
                        Text(
                            text = "Modo de Mesclagem",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(LayerBlendMode.values()) { mode ->
                                FilterChip(
                                    selected = activeLayer.blendMode == mode,
                                    onClick = {
                                        engine.setLayerBlendMode(activeLayer.id, mode)
                                        refresh()
                                    },
                                    label = { Text(mode.displayName, fontSize = 11.sp) }
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Layer Utility Actions (Horizontally scrollable with full spacing)
                        Text(
                            text = "Propriedades da Camada",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            item {
                                FilterChip(
                                    selected = activeLayer.alphaLock,
                                    onClick = {
                                        val newLock = !activeLayer.alphaLock
                                        engine.setLayerAlphaLock(activeLayer.id, newLock)
                                        refresh()
                                    },
                                    label = { Text("Bloquear Alpha", fontSize = 11.sp) }
                                )
                            }
                            item {
                                FilterChip(
                                    selected = activeLayer.clipping,
                                    onClick = {
                                        val newClip = !activeLayer.clipping
                                        engine.setLayerClipping(activeLayer.id, newClip)
                                        refresh()
                                    },
                                    label = { Text("Máscara de Corte", fontSize = 11.sp) }
                                )
                            }
                            item {
                                FilterChip(
                                    selected = false,
                                    onClick = {
                                        engine.flipLayerH(activeLayer.id)
                                        refresh()
                                    },
                                    label = { Text("Espelhar Horizontal", fontSize = 11.sp) }
                                )
                            }
                            item {
                                FilterChip(
                                    selected = false,
                                    onClick = {
                                        engine.flipLayerV(activeLayer.id)
                                        refresh()
                                    },
                                    label = { Text("Espelhar Vertical", fontSize = 11.sp) }
                                )
                            }
                            item {
                                FilterChip(
                                    selected = false,
                                    onClick = {
                                        engine.clearActiveLayer()
                                        refresh()
                                    },
                                    label = { Text("Limpar Conteúdo", fontSize = 11.sp, color = MaterialTheme.colorScheme.error) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
