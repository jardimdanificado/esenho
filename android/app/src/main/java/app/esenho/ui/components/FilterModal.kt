package app.esenho.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
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
    var search by remember { mutableStateOf("") }
    val visibleFilters =
        engine.filterCatalog.filter {
            it.title.contains(search.trim(), ignoreCase = true) ||
                it.id.contains(search.trim(), ignoreCase = true)
        }

    WorkspacePanelContainer(embedded = embedded, onDismiss = onDismiss) {
        EditorPanelHeader("Filtros · ${engine.filterCatalog.size}", onDismiss)
        WorkspaceSearchField(
            value = search,
            onValueChange = { search = it },
            placeholder = "Buscar filtro por nome ou ID",
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            "${visibleFilters.size} de ${engine.filterCatalog.size} filtros · camada ativa",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(vertical = 6.dp),
        )

        selectedFilter?.let { f ->
            Surface(
                shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
            ) {
                Column(Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            f.title,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        TextButton(
                            onClick = {
                                engine.applyFilter(f, param1.toInt(), param2.toInt())
                                onFilterApplied()
                                onDismiss()
                            },
                            contentPadding = PaddingValues(horizontal = 8.dp),
                            modifier = Modifier.height(26.dp),
                        ) {
                            Text("Aplicar", fontSize = 11.sp)
                        }
                        TextButton(
                            onClick = { selectedFilter = null },
                            contentPadding = PaddingValues(horizontal = 6.dp),
                            modifier = Modifier.height(26.dp),
                        ) {
                            Text("Fechar", fontSize = 11.sp)
                        }
                    }
                    if (f.params.isNotEmpty()) {
                        val p = f.params[0]
                        ParamRow(p.name, "${param1.toInt()} ${p.unit}".trim()) {
                            WorkspaceSlider(
                                value = param1,
                                onValueChange = { param1 = it },
                                valueRange = p.min.toFloat()..p.max.toFloat(),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                    if (f.params.size > 1) {
                        val p = f.params[1]
                        ParamRow(p.name, "${param2.toInt()} ${p.unit}".trim()) {
                            WorkspaceSlider(
                                value = param2,
                                onValueChange = { param2 = it },
                                valueRange = p.min.toFloat()..p.max.toFloat(),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }

        if (visibleFilters.isEmpty()) {
            Text("Nenhum filtro encontrado.", style = MaterialTheme.typography.bodySmall)
            return@WorkspacePanelContainer
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 84.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            contentPadding = PaddingValues(bottom = 8.dp),
            modifier =
                if (embedded) Modifier.fillMaxWidth().weight(1f)
                else Modifier.fillMaxWidth().height(320.dp),
        ) {
            items(visibleFilters, key = { it.id }) { filter ->
                val isSelected = selectedFilter?.id == filter.id
                Surface(
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(54.dp)
                            .clip(RoundedCornerShape(WorkspaceStyle.ItemRadius))
                            .clickable {
                                selectedFilter = filter
                                param1 =
                                    if (filter.params.isNotEmpty())
                                        filter.params[0].defaultVal.toFloat()
                                    else 10f
                                param2 =
                                    if (filter.params.size > 1)
                                        filter.params[1].defaultVal.toFloat()
                                    else 1f
                            },
                    color =
                        if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f)
                        else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            Icons.Default.AutoAwesome,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint =
                                if (isSelected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = filter.title,
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            color =
                                if (isSelected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ParamRow(
    name: String,
    valueLabel: String,
    slider: @Composable () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "$name: $valueLabel",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.width(120.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(Modifier.weight(1f)) { slider() }
    }
}
