package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.nativeengine.BrushModel
import app.esenho.nativeengine.EsenhoEngine

private fun mapArtistCategory(cat: String): String {
    return when (cat.trim().lowercase()) {
        "paint", "watercolor", "inking", "sketch", "airbrush", "pixel art", "textiles" ->
            "Pintura & Traço"
        "fluid dynamics", "thermodynamics", "fluid metal", "quantum fluid", "magnetic physics",
        "physical simulation", "sedimentary", "geophysics", "geology" ->
            "Física & Fluídos"
        "optics", "optics & liquid", "mineral optics", "holography", "geometric optics",
        "acousto-optics", "atmospheric", "cyberpunk", "digital fx", "special fx" ->
            "Luz & FX"
        "living simulation", "biomimetics", "bio-simulation", "bio-electrical", "botanical",
        "aquatic", "abyssal bio", "photonic bio", "creature fx", "medical fx" ->
            "Biológico & Orgânico"
        "sacred geometry", "cellular geometry", "complexity", "astronomy", "astrophysics",
        "astrophysics vfx", "cosmic", "heliophysics", "quantum physics", "nuclear physics",
        "relativity", "solid state", "metamaterials", "crystalline", "cartography" ->
            "Cosmos & Ciência"
        else -> "Outros"
    }
}

private fun getCategoryIcon(group: String): ImageVector {
    return when (group) {
        "Pintura & Traço" -> Icons.Default.Palette
        "Física & Fluídos" -> Icons.Default.Waves
        "Luz & FX" -> Icons.Default.AutoAwesome
        "Biológico & Orgânico" -> Icons.Default.Spa
        "Cosmos & Ciência" -> Icons.Default.Psychology
        "Clássico" -> Icons.Default.Brush
        else -> Icons.Default.Category
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrushDrawer(
    engine: EsenhoEngine,
    selectedBrush: BrushModel?,
    onBrushSelect: (BrushModel?) -> Unit,
    onDismiss: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("Todos") }
    var showTuner by remember { mutableStateOf(false) }

    val categoryCounts = remember(engine.brushCatalog) {
        val map = mutableMapOf<String, Int>()
        map["Todos"] = engine.brushCatalog.size + 1 // +1 for Quadro Classic
        map["Clássico"] = 1
        for (b in engine.brushCatalog) {
            val group = mapArtistCategory(b.category)
            map[group] = (map[group] ?: 0) + 1
        }
        map
    }

    val orderedCategories = listOf(
        "Todos",
        "Pintura & Traço",
        "Física & Fluídos",
        "Luz & FX",
        "Biológico & Orgânico",
        "Cosmos & Ciência",
        "Clássico"
    )

    val filteredBrushes = remember(selectedCategory, searchQuery, engine.brushCatalog) {
        engine.brushCatalog.filter { b ->
            val matchCategory = when (selectedCategory) {
                "Todos" -> true
                "Clássico" -> false
                else -> mapArtistCategory(b.category) == selectedCategory
            }
            val matchSearch = if (searchQuery.isBlank()) true else {
                b.title.contains(searchQuery, ignoreCase = true) ||
                b.category.contains(searchQuery, ignoreCase = true) ||
                b.id.contains(searchQuery, ignoreCase = true)
            }
            matchCategory && matchSearch
        }
    }

    val showClassicInList = remember(selectedCategory, searchQuery) {
        (selectedCategory == "Todos" || selectedCategory == "Clássico") &&
        (searchQuery.isBlank() || "clássico quadro classic".contains(searchQuery, ignoreCase = true))
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
                Column {
                    Text(
                        text = "Biblioteca de Pincéis",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${engine.brushCatalog.size + 1} pincéis procedurais e físicos do esenho",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (selectedBrush != null && selectedBrush.params.isNotEmpty()) {
                    FilledTonalButton(
                        onClick = { showTuner = !showTuner },
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = if (showTuner) Icons.AutoMirrored.Filled.List else Icons.Default.Tune,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(if (showTuner) "Ver Lista" else "Ajustes", fontSize = 12.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            if (showTuner && selectedBrush != null) {
                // ── Brush Parameter Tuner View ──
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = getCategoryIcon(mapArtistCategory(selectedBrush.category)),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = selectedBrush.title,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${selectedBrush.category} • ${selectedBrush.params.size} parâmetros",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(360.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Global Streamline Smoothing
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("Estabilização / Suavização", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    Text("${engine.brushSmooth}%", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                                Slider(
                                    value = engine.brushSmooth.toFloat(),
                                    onValueChange = { engine.brushSmooth = it.toInt() },
                                    valueRange = 0f..100f
                                )
                            }
                        }
                    }

                    // Procedural Dynamic Parameters
                    items(selectedBrush.params) { p ->
                        var pVal by remember(p, p.currentVal) { mutableFloatStateOf(p.currentVal.toFloat()) }
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(p.name, fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                    Text("${pVal.toInt()} ${p.unit}".trim(), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                                Slider(
                                    value = pVal,
                                    onValueChange = {
                                        pVal = it
                                        val idx = selectedBrush.params.indexOf(p)
                                        engine.setBrushCustomParam(idx, it.toInt())
                                    },
                                    valueRange = p.min.toFloat()..p.max.toFloat()
                                )
                            }
                        }
                    }
                }
            } else {
                // ── Search Bar ──
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Buscar pincel (óleo, aquarela, néon, física...)", fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp)) },
                    trailingIcon = {
                        if (searchQuery.isNotBlank()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Limpar", modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(10.dp))

                // ── Category Filter Chips ──
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(orderedCategories) { cat ->
                        val count = categoryCounts[cat] ?: 0
                        FilterChip(
                            selected = selectedCategory == cat,
                            onClick = { selectedCategory = cat },
                            label = {
                                Text("$cat ($count)", fontSize = 12.sp)
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = getCategoryIcon(cat),
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // ── Brush List ──
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(380.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Classic Quadro Brush Item
                    if (showClassicInList) {
                        item {
                            BrushItemCard(
                                title = "Pincel Clássico Quadro",
                                categoryTag = "Clássico",
                                paramCount = 0,
                                icon = Icons.Default.Brush,
                                isSelected = selectedBrush == null,
                                onClick = {
                                    onBrushSelect(null)
                                    onDismiss()
                                }
                            )
                        }
                    }

                    // Procedural Brushes
                    items(filteredBrushes, key = { it.id }) { brush ->
                        BrushItemCard(
                            title = brush.title,
                            categoryTag = brush.category,
                            paramCount = brush.params.size,
                            icon = getCategoryIcon(mapArtistCategory(brush.category)),
                            isSelected = selectedBrush?.id == brush.id,
                            onClick = {
                                onBrushSelect(brush)
                                if (brush.params.isNotEmpty()) {
                                    showTuner = true
                                } else {
                                    onDismiss()
                                }
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
    categoryTag: String,
    paramCount: Int,
    icon: ImageVector,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable { onClick() }
            .border(
                width = if (isSelected) 2.dp else 1.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
                shape = RoundedCornerShape(14.dp)
            ),
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
        tonalElevation = if (isSelected) 4.dp else 1.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                    ) {
                        Text(
                            text = categoryTag,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    if (paramCount > 0) {
                        Text(
                            text = "$paramCount ajustes",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Selecionado",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
