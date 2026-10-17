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
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.nativeengine.BrushModel
import app.esenho.nativeengine.EsenhoEngine

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrushDrawer(
    engine: EsenhoEngine,
    selectedBrush: BrushModel?,
    onBrushSelect: (BrushModel?) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedCategory by remember { mutableStateOf("Todos") }
    var showTuner by remember { mutableStateOf(false) }

    val categories = remember(engine.brushCatalog) {
        val cats = mutableListOf("Todos", "Clássicos")
        val unique = engine.brushCatalog.map { it.category }.distinct().filter { it.isNotBlank() }
        cats.addAll(unique)
        cats
    }

    val filteredBrushes = remember(selectedCategory, engine.brushCatalog) {
        if (selectedCategory == "Todos") {
            engine.brushCatalog
        } else if (selectedCategory == "Clássicos") {
            emptyList()
        } else {
            engine.brushCatalog.filter { it.category.equals(selectedCategory, ignoreCase = true) }
        }
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
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Biblioteca de Pincéis (${engine.brushCatalog.size + 1})",
                    style = MaterialTheme.typography.titleMedium
                )
                if (selectedBrush != null && selectedBrush.params.isNotEmpty()) {
                    FilledTonalButton(
                        onClick = { showTuner = !showTuner },
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Icon(Icons.Default.Tune, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(if (showTuner) "Ver Lista" else "Ajustes", fontSize = 12.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (showTuner && selectedBrush != null) {
                // Brush Tuning Parameters View
                Text(
                    text = "Ajustes: ${selectedBrush.title}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(10.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(340.dp)
                ) {
                    // Global Streamline / Smoothing
                    item {
                        Text("Estabilização / Suavização: ${engine.brushSmooth}%", style = MaterialTheme.typography.labelSmall)
                        Slider(
                            value = engine.brushSmooth.toFloat(),
                            onValueChange = { engine.brushSmooth = it.toInt() },
                            valueRange = 0f..100f
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    // Brush Custom Dynamic Parameters (e.g., Water Load, Fringe, Granulation, Bleed Spread)
                    items(selectedBrush.params) { p ->
                        var pVal by remember { mutableFloatStateOf(p.currentVal.toFloat()) }
                        Text(
                            text = "${p.name}: ${pVal.toInt()} ${p.unit}",
                            style = MaterialTheme.typography.labelSmall
                        )
                        Slider(
                            value = pVal,
                            onValueChange = {
                                pVal = it
                                val idx = selectedBrush.params.indexOf(p)
                                engine.setBrushCustomParam(idx, it.toInt())
                            },
                            valueRange = p.min.toFloat()..p.max.toFloat()
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                    }
                }
            } else {
                // Category Filter Chips
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(categories) { cat ->
                        FilterChip(
                            selected = selectedCategory == cat,
                            onClick = { selectedCategory = cat },
                            label = { Text(cat, fontSize = 12.sp) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Brush List
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(360.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Classic Quadro Brush Option
                    if (selectedCategory == "Todos" || selectedCategory == "Clássicos") {
                        item {
                            BrushItemCard(
                                title = "Pincel Clássico Quadro",
                                subtitle = "Motor vetorial nativo com dinâmica de pressão e inclinação",
                                isSelected = selectedBrush == null,
                                onClick = {
                                    onBrushSelect(null)
                                    onDismiss()
                                }
                            )
                        }
                    }

                    // Procedural Brushes
                    items(filteredBrushes) { brush ->
                        BrushItemCard(
                            title = brush.title,
                            subtitle = "${brush.category} • ${brush.params.size} parâmetros ajustáveis",
                            isSelected = selectedBrush?.id == brush.id,
                            onClick = {
                                onBrushSelect(brush)
                                onDismiss()
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun BrushItemCard(
    title: String,
    subtitle: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .border(
                width = if (isSelected) 2.dp else 0.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                shape = RoundedCornerShape(12.dp)
            ),
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Brush,
                contentDescription = null,
                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
