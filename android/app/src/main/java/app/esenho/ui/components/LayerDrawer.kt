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
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        windowInsets = WindowInsets.safeDrawing
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 440.dp)
                .padding(horizontal = 14.dp)
                .padding(bottom = 16.dp)
        ) {
            // Header with Layer Action buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Camadas (${layersList.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )

                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    IconButton(
                        onClick = {
                            engine.addLayer()
                            refresh()
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Adicionar Camada", modifier = Modifier.size(18.dp))
                    }
                    IconButton(
                        onClick = {
                            engine.duplicateLayer(activeLayerId)
                            refresh()
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Duplicar", modifier = Modifier.size(18.dp))
                    }
                    IconButton(
                        onClick = {
                            engine.mergeDown(activeLayerId)
                            refresh()
                        },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.CallMerge, contentDescription = "Mesclar para Baixo", modifier = Modifier.size(18.dp))
                    }
                    IconButton(
                        onClick = {
                            engine.deleteLayer(activeLayerId)
                            refresh()
                        },
                        enabled = layersList.size > 1,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Deletar", modifier = Modifier.size(18.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // 1. Primary Layer Items List (Compact ~44dp)
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp, max = 180.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(layersList, key = { it.id }) { layer ->
                    val isSelected = layer.id == activeLayerId

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                engine.selectLayer(layer.id)
                                refresh()
                            }
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                                shape = RoundedCornerShape(8.dp)
                            ),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                // Eye Visibility Button
                                IconButton(
                                    onClick = {
                                        engine.setLayerVisible(layer.id, !layer.visible)
                                        refresh()
                                    },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(
                                        if (layer.visible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = "Visibilidade",
                                        tint = if (layer.visible) MaterialTheme.colorScheme.primary else Color.Gray,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                                Column {
                                    Text(
                                        text = layer.name,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = if (isSelected) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Normal,
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1
                                    )
                                    Text(
                                        text = "${layer.blendMode.displayName} • ${(layer.opacity * 100 / 255)}%",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontSize = 10.sp,
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
                                    modifier = Modifier.size(26.dp)
                                ) {
                                    Icon(Icons.Default.ArrowUpward, contentDescription = "Subir", modifier = Modifier.size(14.dp))
                                }
                                IconButton(
                                    onClick = {
                                        engine.moveLayerDown(layer.id)
                                        refresh()
                                    },
                                    modifier = Modifier.size(26.dp)
                                ) {
                                    Icon(Icons.Default.ArrowDownward, contentDescription = "Descer", modifier = Modifier.size(14.dp))
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // 2. Active Layer Options & Adjustments Card (Docked at Bottom, Never Squeezed)
            if (activeLayer != null) {
                var localOpacity by remember(activeLayer.id, activeLayer.opacity) {
                    mutableFloatStateOf(activeLayer.opacity.toFloat())
                }

                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                        // Inline Opacity Row & Smooth Slider
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Opac: ${(localOpacity * 100 / 255).toInt()}%",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.width(64.dp)
                            )
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
                                valueRange = 0f..255f,
                                modifier = Modifier.weight(1f).height(24.dp)
                            )
                        }

                        // Blend mode selector as a compact dropdown.
                        var blendMenuExpanded by remember(activeLayer.id) { mutableStateOf(false) }
                        Box {
                            OutlinedButton(
                                onClick = { blendMenuExpanded = true },
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                                modifier = Modifier.height(32.dp)
                            ) {
                                Text("Mesclagem: ${activeLayer.blendMode.displayName}", fontSize = 11.sp, maxLines = 1)
                                Icon(Icons.Default.ArrowDropDown, null, modifier = Modifier.size(16.dp))
                            }
                            DropdownMenu(expanded = blendMenuExpanded, onDismissRequest = { blendMenuExpanded = false }) {
                                LayerBlendMode.values().forEach { mode ->
                                    DropdownMenuItem(
                                        text = { Text(mode.displayName) },
                                        trailingIcon = if (activeLayer.blendMode == mode) {{ Icon(Icons.Default.Check, null) }} else null,
                                        onClick = {
                                            blendMenuExpanded = false
                                            engine.setLayerBlendMode(activeLayer.id, mode)
                                            refresh()
                                        }
                                    )
                                }
                            }
                        }

                        // Layer Utility Actions (Icon-only buttons with tooltips)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth().padding(top = 2.dp)
                        ) {
                            // Bloquear Alpha
                            TooltipBox(
                                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                                tooltip = { PlainTooltip { Text(if (activeLayer.alphaLock) "Alpha Bloqueado" else "Bloquear Alpha", fontSize = 11.sp) } },
                                state = rememberTooltipState()
                            ) {
                                IconButton(
                                    onClick = {
                                        engine.setLayerAlphaLock(activeLayer.id, !activeLayer.alphaLock)
                                        refresh()
                                    },
                                    colors = IconButtonDefaults.iconButtonColors(
                                        containerColor = if (activeLayer.alphaLock) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                        contentColor = if (activeLayer.alphaLock) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
                                    ),
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(if (activeLayer.alphaLock) Icons.Default.Lock else Icons.Default.LockOpen, contentDescription = "Bloquear Alpha", modifier = Modifier.size(16.dp))
                                }
                            }

                            // Máscara de Corte
                            TooltipBox(
                                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                                tooltip = { PlainTooltip { Text(if (activeLayer.clipping) "Máscara de Corte Ativa" else "Máscara de Corte", fontSize = 11.sp) } },
                                state = rememberTooltipState()
                            ) {
                                IconButton(
                                    onClick = {
                                        engine.setLayerClipping(activeLayer.id, !activeLayer.clipping)
                                        refresh()
                                    },
                                    colors = IconButtonDefaults.iconButtonColors(
                                        containerColor = if (activeLayer.clipping) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                        contentColor = if (activeLayer.clipping) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
                                    ),
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.ContentCut, contentDescription = "Máscara de Corte", modifier = Modifier.size(16.dp))
                                }
                            }

                            // Espelhar Horizontal
                            TooltipBox(
                                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                                tooltip = { PlainTooltip { Text("Espelhar Horizontal", fontSize = 11.sp) } },
                                state = rememberTooltipState()
                            ) {
                                IconButton(
                                    onClick = {
                                        engine.flipLayerH(activeLayer.id)
                                        refresh()
                                    },
                                    colors = IconButtonDefaults.iconButtonColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                        contentColor = MaterialTheme.colorScheme.onSurface
                                    ),
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.Flip, contentDescription = "Espelhar Horizontal", modifier = Modifier.size(16.dp))
                                }
                            }

                            // Espelhar Vertical
                            TooltipBox(
                                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                                tooltip = { PlainTooltip { Text("Espelhar Vertical", fontSize = 11.sp) } },
                                state = rememberTooltipState()
                            ) {
                                IconButton(
                                    onClick = {
                                        engine.flipLayerV(activeLayer.id)
                                        refresh()
                                    },
                                    colors = IconButtonDefaults.iconButtonColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                        contentColor = MaterialTheme.colorScheme.onSurface
                                    ),
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.FlipCameraAndroid, contentDescription = "Espelhar Vertical", modifier = Modifier.size(16.dp))
                                }
                            }

                            // Limpar Camada
                            TooltipBox(
                                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                                tooltip = { PlainTooltip { Text("Limpar Camada", fontSize = 11.sp) } },
                                state = rememberTooltipState()
                            ) {
                                IconButton(
                                    onClick = {
                                        engine.clearActiveLayer()
                                        refresh()
                                    },
                                    colors = IconButtonDefaults.iconButtonColors(
                                        containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f),
                                        contentColor = MaterialTheme.colorScheme.error
                                    ),
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.DeleteSweep, contentDescription = "Limpar Camada", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
