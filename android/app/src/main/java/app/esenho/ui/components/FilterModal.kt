package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.FilterModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterModal(
    engine: EsenhoEngine,
    onFilterApplied: () -> Unit,
    onDismiss: () -> Unit,
    embedded: Boolean = false
) {
    var selectedFilter by remember { mutableStateOf<FilterModel?>(null) }
    var param1 by remember { mutableFloatStateOf(10f) }
    var param2 by remember { mutableFloatStateOf(1f) }
    var showHsvAdjustment by remember { mutableStateOf(false) }
    var hue by remember { mutableFloatStateOf(0f) }
    var saturation by remember { mutableFloatStateOf(0f) }
    var value by remember { mutableFloatStateOf(0f) }

    WorkspacePanelContainer(embedded = embedded, onDismiss = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (embedded) Modifier.fillMaxHeight() else Modifier)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp)
                .padding(bottom = 12.dp)
        ) {
            EditorPanelHeader("Filtros · ${engine.filterCatalog.size}", onDismiss)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = !showHsvAdjustment,
                    onClick = { showHsvAdjustment = false },
                    label = { Text("Filtros") }
                )
                FilterChip(
                    selected = showHsvAdjustment,
                    onClick = { showHsvAdjustment = true },
                    label = { Text("Cor HSV") }
                )
            }
            Spacer(modifier = Modifier.height(10.dp))

            if (showHsvAdjustment) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("Ajustar cor da camada ativa", style = MaterialTheme.typography.titleSmall)
                        Text("Matiz: ${hue.toInt()}°", style = MaterialTheme.typography.labelSmall)
                        Slider(value = hue, onValueChange = { hue = it }, valueRange = -180f..180f)
                        Text("Saturação: ${saturation.toInt()}%", style = MaterialTheme.typography.labelSmall)
                        Slider(value = saturation, onValueChange = { saturation = it }, valueRange = -100f..100f)
                        Text("Valor: ${value.toInt()}%", style = MaterialTheme.typography.labelSmall)
                        Slider(value = value, onValueChange = { value = it }, valueRange = -100f..100f)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TextButton(onClick = { hue = 0f; saturation = 0f; value = 0f }) {
                                Text("Redefinir")
                            }
                            Button(onClick = {
                                engine.adjustActiveLayerHsv(hue.toInt(), saturation.toInt(), value.toInt())
                                onFilterApplied()
                                onDismiss()
                            }) {
                                Text("Aplicar")
                            }
                        }
                    }
                }
            }

            // Parameter Adjustment Box if filter selected
            if (!showHsvAdjustment && selectedFilter != null) {
                val f = selectedFilter!!
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Ajustes: ${f.title}",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Button(
                                onClick = {
                                    engine.applyFilter(f, param1.toInt(), param2.toInt())
                                    onFilterApplied()
                                    onDismiss()
                                },
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)
                            ) {
                                Text("Aplicar", fontSize = 12.sp)
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        if (f.params.isNotEmpty()) {
                            val p1 = f.params[0]
                            Text("${p1.name}: ${param1.toInt()} ${p1.unit}", style = MaterialTheme.typography.labelSmall)
                            Slider(
                                value = param1,
                                onValueChange = { param1 = it },
                                valueRange = p1.min.toFloat()..p1.max.toFloat()
                            )
                        }

                        if (f.params.size > 1) {
                            val p2 = f.params[1]
                            Text("${p2.name}: ${param2.toInt()} ${p2.unit}", style = MaterialTheme.typography.labelSmall)
                            Slider(
                                value = param2,
                                onValueChange = { param2 = it },
                                valueRange = p2.min.toFloat()..p2.max.toFloat()
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // Grid of 29 Filters
            if (!showHsvAdjustment) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 96.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(320.dp)
                ) {
                    items(engine.filterCatalog) { filter ->
                        val isSelected = selectedFilter?.id == filter.id

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(60.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                selectedFilter = filter
                                param1 = if (filter.params.isNotEmpty()) filter.params[0].defaultVal.toFloat() else 10f
                                param2 = if (filter.params.size > 1) filter.params[1].defaultVal.toFloat() else 1f
                            }
                            .border(
                                width = if (isSelected) 2.dp else 0.dp,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                                shape = RoundedCornerShape(10.dp)
                            ),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                    ) {
                        Column(
                            modifier = Modifier.padding(6.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                Icons.Default.AutoAwesome,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = filter.title,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 11.sp,
                                maxLines = 1,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                    }
                }
            }
        }
    }
}
