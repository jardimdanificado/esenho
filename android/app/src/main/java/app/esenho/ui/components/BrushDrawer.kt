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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.nativeengine.BrushModel
import app.esenho.nativeengine.BrushPresetModel
import app.esenho.nativeengine.EsenhoEngine

private fun mapWasmCategory(cat: String): String {
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

private fun mapPresetCategory(cat: String): String {
    return when (cat.trim().lowercase()) {
        "sketch" -> "Esboço & Lápis"
        "ink" -> "Tinta & Caneta"
        "paint" -> "Pintura & Óleo"
        "marker" -> "Marcadores"
        "charcoal" -> "Carvão & Pastel"
        "airbrush" -> "Aerógrafo"
        "fx" -> "Efeitos (FX)"
        "texture" -> "Texturas"
        "blend" -> "Mistura & Smudge"
        "eraser" -> "Borrachas"
        else -> "Geral"
    }
}

private fun getPresetIcon(group: String): ImageVector {
    return when (group) {
        "Esboço & Lápis" -> Icons.Default.Edit
        "Tinta & Caneta" -> Icons.Default.Draw
        "Pintura & Óleo" -> Icons.Default.Palette
        "Marcadores" -> Icons.Default.Highlight
        "Carvão & Pastel" -> Icons.Default.Brush
        "Aerógrafo" -> Icons.Default.Air
        "Efeitos (FX)" -> Icons.Default.AutoAwesome
        "Texturas" -> Icons.Default.Grain
        "Mistura & Smudge" -> Icons.Default.BlurOn
        "Borrachas" -> Icons.Default.AutoFixNormal
        else -> Icons.Default.Brush
    }
}

private fun getWasmIcon(group: String): ImageVector {
    return when (group) {
        "Pintura & Traço" -> Icons.Default.Palette
        "Física & Fluídos" -> Icons.Default.Waves
        "Luz & FX" -> Icons.Default.AutoAwesome
        "Biológico & Orgânico" -> Icons.Default.Spa
        "Cosmos & Ciência" -> Icons.Default.Psychology
        else -> Icons.Default.Category
    }
}

enum class BrushDrawerTab {
    PRESETS,
    WASM_PROCEDURAL
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrushDrawer(
    engine: EsenhoEngine,
    onBrushUpdated: () -> Unit,
    onDismiss: () -> Unit
) {
    var activeTab by remember { mutableStateOf(if (engine.selectedBrush != null) BrushDrawerTab.WASM_PROCEDURAL else BrushDrawerTab.PRESETS) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("Todos") }
    var showTuner by remember { mutableStateOf(false) }

    // When tab changes, reset category filter
    LaunchedEffect(activeTab) {
        selectedCategory = "Todos"
    }

    val totalCount = engine.presetCatalog.size + engine.brushCatalog.size

    val filteredPresets = remember(selectedCategory, searchQuery, engine.presetCatalog) {
        engine.presetCatalog.filter { p ->
            val matchCategory = if (selectedCategory == "Todos") true else mapPresetCategory(p.category) == selectedCategory
            val matchSearch = if (searchQuery.isBlank()) true else {
                p.name.contains(searchQuery, ignoreCase = true) ||
                p.desc.contains(searchQuery, ignoreCase = true) ||
                p.category.contains(searchQuery, ignoreCase = true) ||
                p.id.contains(searchQuery, ignoreCase = true)
            }
            matchCategory && matchSearch
        }
    }

    val filteredWasmBrushes = remember(selectedCategory, searchQuery, engine.brushCatalog) {
        engine.brushCatalog.filter { b ->
            val matchCategory = if (selectedCategory == "Todos") true else mapWasmCategory(b.category) == selectedCategory
            val matchSearch = if (searchQuery.isBlank()) true else {
                b.title.contains(searchQuery, ignoreCase = true) ||
                b.category.contains(searchQuery, ignoreCase = true) ||
                b.id.contains(searchQuery, ignoreCase = true)
            }
            matchCategory && matchSearch
        }
    }

    val presetCategories = remember(engine.presetCatalog) {
        val cats = mutableListOf("Todos")
        val groups = engine.presetCatalog.map { mapPresetCategory(it.category) }.distinct()
        cats.addAll(groups)
        cats
    }

    val wasmCategories = listOf(
        "Todos",
        "Pintura & Traço",
        "Física & Fluídos",
        "Luz & FX",
        "Biológico & Orgânico",
        "Cosmos & Ciência"
    )

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
                Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                    Text(
                        text = "Biblioteca de Pincéis ($totalCount)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    Text(
                        text = "${engine.presetCatalog.size} presets calibrados + ${engine.brushCatalog.size} pincéis WASM",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }

                val canTune = (engine.selectedBrush != null && engine.selectedBrush!!.params.isNotEmpty()) || engine.selectedPreset != null
                if (canTune) {
                    FilledTonalButton(
                        onClick = { showTuner = !showTuner },
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Icon(
                            imageVector = if (showTuner) Icons.AutoMirrored.Filled.List else Icons.Default.Tune,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(if (showTuner) "Ver Lista" else "Ajustes", fontSize = 12.sp, maxLines = 1)
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            if (showTuner && engine.selectedPreset != null) {
                PresetTuner(
                    engine = engine,
                    preset = engine.selectedPreset!!,
                    onBrushUpdated = onBrushUpdated
                )
            } else if (showTuner && engine.selectedBrush != null) {
                val b = engine.selectedBrush!!
                // ── Procedural WASM Brush Parameter Tuner View ──
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
                            imageVector = getWasmIcon(mapWasmCategory(b.category)),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = b.title,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${b.category} • ${b.params.size} parâmetros ajustáveis",
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
                    items(b.params) { p ->
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
                                        val idx = b.params.indexOf(p)
                                        engine.setBrushCustomParam(idx, it.toInt())
                                    },
                                    valueRange = p.min.toFloat()..p.max.toFloat()
                                )
                            }
                        }
                    }
                }
            } else {
                // ── Tab Selector (Presets vs Procedurais WASM) ──
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = activeTab == BrushDrawerTab.PRESETS,
                        onClick = { activeTab = BrushDrawerTab.PRESETS },
                        label = {
                            Text("Presets Nativos (${engine.presetCatalog.size})", fontWeight = FontWeight.SemiBold)
                        },
                        leadingIcon = {
                            Icon(Icons.Default.Palette, contentDescription = null, modifier = Modifier.size(16.dp))
                        },
                        modifier = Modifier.weight(1f)
                    )

                    FilterChip(
                        selected = activeTab == BrushDrawerTab.WASM_PROCEDURAL,
                        onClick = { activeTab = BrushDrawerTab.WASM_PROCEDURAL },
                        label = {
                            Text("WASM / Físicos (${engine.brushCatalog.size})", fontWeight = FontWeight.SemiBold)
                        },
                        leadingIcon = {
                            Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(16.dp))
                        },
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // ── Search Bar ──
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = {
                        Text(
                            if (activeTab == BrushDrawerTab.PRESETS) "Buscar preset (lápis, óleo, aquarela, giz, caneta...)"
                            else "Buscar procedural (aurora, néon, física, ferrofluid...)",
                            fontSize = 13.sp
                        )
                    },
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
                val currentCategoryList = if (activeTab == BrushDrawerTab.PRESETS) presetCategories else wasmCategories
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(currentCategoryList) { cat ->
                        FilterChip(
                            selected = selectedCategory == cat,
                            onClick = { selectedCategory = cat },
                            label = { Text(cat, fontSize = 12.sp) },
                            leadingIcon = {
                                val icon = if (activeTab == BrushDrawerTab.PRESETS) getPresetIcon(cat) else getWasmIcon(cat)
                                Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp))
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // ── Brush & Preset Items List ──
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(380.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (activeTab == BrushDrawerTab.PRESETS) {
                        // Curated Presets
                        items(filteredPresets, key = { it.id }) { preset ->
                            val isSelected = engine.selectedPreset?.id == preset.id
                            PresetItemCard(
                                preset = preset,
                                isSelected = isSelected,
                                onClick = {
                                    if (isSelected) {
                                        showTuner = true
                                    } else {
                                        engine.selectPreset(preset)
                                        onBrushUpdated()
                                    }
                                },
                                onTuneClick = {
                                    if (!isSelected) {
                                        engine.selectPreset(preset)
                                        onBrushUpdated()
                                    }
                                    showTuner = true
                                }
                            )
                        }
                    } else {
                        // WASM / Procedural Brushes
                        items(filteredWasmBrushes, key = { it.id }) { brush ->
                            val isSelected = engine.selectedBrush?.id == brush.id
                            BrushItemCard(
                                title = brush.title,
                                categoryTag = brush.category,
                                paramCount = brush.params.size,
                                icon = getWasmIcon(mapWasmCategory(brush.category)),
                                isSelected = isSelected,
                                onClick = {
                                    engine.selectBrush(brush)
                                    onBrushUpdated()
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
}

@Composable
fun PresetItemCard(
    preset: BrushPresetModel,
    isSelected: Boolean,
    onClick: () -> Unit,
    onTuneClick: () -> Unit
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
                    imageVector = getPresetIcon(mapPresetCategory(preset.category)),
                    contentDescription = null,
                    tint = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = preset.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                )
                if (preset.desc.isNotBlank()) {
                    Text(
                        text = preset.desc,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
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
                            text = mapPresetCategory(preset.category),
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Text(
                        text = "tam: ${preset.size}px • opac: ${preset.opacity}%",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (isSelected) {
                IconButton(
                    onClick = onTuneClick,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Tune,
                        contentDescription = "Ajustar",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
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

enum class PresetTunerTab(val title: String) {
    TIP("Ponta"),
    DYNAMICS("Dinâmica"),
    TEXTURE("Textura"),
    PHYSICS("Física"),
    JITTER("Jitter")
}

val BUILTIN_SHAPES = listOf(
    "circle" to "Círculo",
    "soft_round" to "Redondo Suave",
    "square" to "Quadrado",
    "chisel" to "Cinzel",
    "calligraphy" to "Caligrafia",
    "charcoal" to "Carvão",
    "bristle" to "Cerdas",
    "dry_brush" to "Pincel Seco",
    "fan" to "Leque (Fan)",
    "rake" to "Rake",
    "dagger" to "Adaga / Dagger",
    "oval" to "Oval",
    "pixel" to "Pixel",
    "splatter" to "Splatter",
    "stipple" to "Pontilhado",
    "cloud" to "Nuvem",
    "star" to "Estrela",
    "triangle" to "Triângulo",
    "diamond" to "Diamante"
)

val BUILTIN_TEXTURES = listOf(
    "none" to "Nenhuma",
    "paper" to "Papel Natural",
    "canvas" to "Tela / Canvas",
    "watercolor" to "Papel Aquarela",
    "charcoal_tooth" to "Dente Carvão",
    "pastel_board" to "Pastel Board",
    "washi" to "Papel Washi",
    "rough_plaster" to "Gesso Áspero",
    "sandpaper" to "Lixa de Papel",
    "sponge" to "Esponja",
    "bark" to "Casca de Árvore",
    "wood" to "Madeira",
    "marble" to "Mármore",
    "cracked_earth" to "Terra Rachada",
    "crackle" to "Craquelado",
    "crosshatch_fine" to "Hachura Fina",
    "engraving_lines" to "Linhas Gravura",
    "manga_dots" to "Pontos Mangá",
    "grunge" to "Grunge Distress",
    "linen" to "Linho",
    "denim" to "Jeans Denim",
    "stipple_noise" to "Ruído Orgânico",
    "spatter_drops" to "Gotas Salpicos",
    "salt_bloom" to "Efeito Sal"
)

val DAB_BLEND_NAMES = listOf(
    "Normal",
    "Multiplicar",
    "Tela",
    "Sobrepor",
    "Subexposição",
    "Adicionar"
)

@Composable
fun PresetTuner(
    engine: EsenhoEngine,
    preset: BrushPresetModel,
    onBrushUpdated: () -> Unit
) {
    var tunerTab by remember { mutableStateOf(PresetTunerTab.TIP) }
    var tunerVersion by remember { mutableIntStateOf(0) }

    val updateParam: (Int, Int) -> Unit = { id, value ->
        engine.setPresetParam(id, value)
        onBrushUpdated()
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        // Preset Header with Reset button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = getPresetIcon(mapPresetCategory(preset.category)),
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = preset.name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${mapPresetCategory(preset.category)} • Configuração Fina",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            OutlinedButton(
                onClick = {
                    engine.resetPresetToDefaults()
                    tunerVersion++
                    onBrushUpdated()
                },
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Padrão", fontSize = 11.sp)
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Tuner Tab Row
        ScrollableTabRow(
            selectedTabIndex = tunerTab.ordinal,
            edgePadding = 0.dp,
            containerColor = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth()
        ) {
            PresetTunerTab.values().forEach { tab ->
                Tab(
                    selected = tunerTab == tab,
                    onClick = { tunerTab = tab },
                    text = { Text(tab.title, fontSize = 12.sp, fontWeight = if (tunerTab == tab) FontWeight.Bold else FontWeight.Normal) }
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(340.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                when (tunerTab) {
                    PresetTunerTab.TIP -> {
                        item {
                            TunerSliderCard(
                                label = "Tamanho (Diâmetro)",
                                value = preset.size.toFloat(),
                                range = 1f..300f,
                                unit = "px",
                                onValueChange = { updateParam(1, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Opacidade",
                                value = preset.opacity.toFloat(),
                                range = 1f..100f,
                                unit = "%",
                                onValueChange = { updateParam(2, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Dureza da Borda",
                                value = preset.hardness.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(3, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Fluxo de Tinta",
                                value = preset.flow.toFloat(),
                                range = 1f..100f,
                                unit = "%",
                                onValueChange = { updateParam(4, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Espaçamento entre Dabs",
                                value = preset.spacing.toFloat(),
                                range = 1f..50f,
                                unit = "%",
                                onValueChange = { updateParam(5, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Arredondamento / Aspecto",
                                value = preset.roundness.toFloat(),
                                range = 1f..100f,
                                unit = "%",
                                onValueChange = { updateParam(7, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Ângulo de Rotação",
                                value = preset.angle.toFloat(),
                                range = 0f..360f,
                                unit = "°",
                                onValueChange = { updateParam(6, it.toInt()) }
                            )
                        }
                        item {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text("Formato da Ponta (${BUILTIN_SHAPES.size} formas)", fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        items(BUILTIN_SHAPES) { (shKey, shLabel) ->
                                            val currentShape = preset.shape.ifBlank {
                                                when (preset.shapeId) {
                                                    1 -> "square"
                                                    2 -> "chisel"
                                                    else -> "circle"
                                                }
                                            }
                                            val isSelected = currentShape.equals(shKey, ignoreCase = true)
                                            FilterChip(
                                                selected = isSelected,
                                                onClick = {
                                                    engine.setPresetShape(shKey)
                                                    tunerVersion++
                                                    onBrushUpdated()
                                                },
                                                label = { Text(shLabel, fontSize = 11.sp) }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        item {
                            TunerSwitchCard(
                                label = "Anti-Aliasing Subpixel (Precisão de Ponta)",
                                checked = preset.subpixel == 1,
                                onCheckedChange = { updateParam(32, if (it) 1 else 0) }
                            )
                        }
                        item {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text("Modo de Mesclagem dos Dabs", fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                    Spacer(modifier = Modifier.height(6.dp))
                                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        items(DAB_BLEND_NAMES.indices.toList()) { idx ->
                                            FilterChip(
                                                selected = preset.dabBlend == idx,
                                                onClick = { updateParam(31, idx) },
                                                label = { Text(DAB_BLEND_NAMES[idx], fontSize = 11.sp) }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    PresetTunerTab.DYNAMICS -> {
                        item {
                            TunerSliderCard(
                                label = "Suavização / Estabilizador",
                                value = preset.smoothing.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(19, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Bézier Midpoint (Curvatura / Tensão)",
                                value = preset.midpoint.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(20, it.toInt()) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Auto-Rotação na Trajetória",
                                checked = preset.autoRotate == 1,
                                onCheckedChange = { updateParam(22, if (it) 1 else 0) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Pressão Controla Tamanho",
                                checked = preset.pressureSize == 1,
                                onCheckedChange = { updateParam(39, if (it) 1 else 0) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Pressão Controla Fluxo / Opacidade",
                                checked = preset.pressureFlow == 1,
                                onCheckedChange = { updateParam(40, if (it) 1 else 0) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Inclinação (Tilt) Controla Ângulo",
                                checked = preset.tiltAngle == 1,
                                onCheckedChange = { updateParam(41, if (it) 1 else 0) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Acúmulo Contínuo (Buildup)",
                                checked = preset.buildup == 1,
                                onCheckedChange = { updateParam(42, if (it) 1 else 0) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Sensibilidade à Velocidade",
                                value = preset.velocity.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(23, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Afilamento Entrada (Taper In)",
                                value = preset.taperIn.toFloat(),
                                range = 0f..200f,
                                unit = "px",
                                onValueChange = { updateParam(24, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Afilamento Saída (Taper Out)",
                                value = preset.taperOut.toFloat(),
                                range = 0f..200f,
                                unit = "px",
                                onValueChange = { updateParam(25, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Desvanecimento (Fade)",
                                value = preset.fade.toFloat(),
                                range = 0f..2000f,
                                unit = "px",
                                onValueChange = { updateParam(26, it.toInt()) }
                            )
                        }
                    }

                    PresetTunerTab.TEXTURE -> {
                        item {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text("Padrão de Grão / Textura (${BUILTIN_TEXTURES.size} texturas)", fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                    Spacer(modifier = Modifier.height(6.dp))
                                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        items(BUILTIN_TEXTURES) { (texKey, texLabel) ->
                                            val currentTexture = if (preset.texMode == 0) "none" else preset.texture.ifBlank { "none" }
                                            val isSelected = currentTexture.equals(texKey, ignoreCase = true)
                                            FilterChip(
                                                selected = isSelected,
                                                onClick = {
                                                    engine.setPresetTexture(texKey)
                                                    tunerVersion++
                                                    onBrushUpdated()
                                                },
                                                label = { Text(texLabel, fontSize = 11.sp) }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        item {
                            TunerSliderCard(
                                label = "Intensidade do Grão",
                                value = preset.grain.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(12, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Escala da Textura",
                                value = preset.textureScale.toFloat(),
                                range = 10f..300f,
                                unit = "%",
                                onValueChange = { updateParam(17, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Contraste da Textura",
                                value = preset.textureContrast.toFloat(),
                                range = 0f..200f,
                                unit = "%",
                                onValueChange = { updateParam(21, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Ângulo da Textura",
                                value = preset.texAngle.toFloat(),
                                range = 0f..360f,
                                unit = "°",
                                onValueChange = { updateParam(16, it.toInt()) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Escalar Textura Proporcional ao Tamanho",
                                checked = preset.texScaleWithSize == 1,
                                onCheckedChange = { updateParam(57, if (it) 1 else 0) }
                            )
                        }
                    }

                    PresetTunerTab.PHYSICS -> {
                        item {
                            TunerSliderCard(
                                label = "Carga de Água (Water Load)",
                                value = preset.water.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(50, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Sangria & Difusão (Bleed)",
                                value = preset.bleed.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(51, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Granulação de Pigmento",
                                value = preset.granulation.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(52, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Coffee Ring / Borda Escura (Fringe)",
                                value = preset.fringe.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(53, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Umidade / Wetness",
                                value = preset.wetness.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(11, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Força de Esfregaço / Smudge",
                                value = preset.smudge.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(10, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Desgaste de Tinta (Depletion)",
                                value = preset.depletion.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(33, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Coleta de Cor (Color Pickup)",
                                value = preset.colorPickup.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(34, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Relevo 3D / Espessura a Óleo (Impasto)",
                                value = preset.impasto.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(55, it.toInt()) }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Mistura de Pigmento Subtrativo Físico",
                                checked = preset.pigmentMode == 1,
                                onCheckedChange = { updateParam(54, if (it) 1 else 0) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Taxa de Evaporação / Secagem",
                                value = preset.dryingRate.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(56, it.toInt()) }
                            )
                        }
                    }

                    PresetTunerTab.JITTER -> {
                        item {
                            TunerSliderCard(
                                label = "Dispersão de Dabs (Scatter)",
                                value = preset.scatter.toFloat(),
                                range = 0f..100f,
                                unit = "",
                                onValueChange = { updateParam(8, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Variação de Tamanho (Size Jitter)",
                                value = preset.sizeJitter.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(27, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Variação de Ângulo (Angle Jitter)",
                                value = preset.angleJitter.toFloat(),
                                range = 0f..360f,
                                unit = "°",
                                onValueChange = { updateParam(28, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Variação de Opacidade (Opacity Jitter)",
                                value = preset.opacityJitter.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(29, it.toInt()) }
                            )
                        }
                        item {
                            TunerSliderCard(
                                label = "Variação de Cor (Color Jitter)",
                                value = preset.colorJitter.toFloat(),
                                range = 0f..100f,
                                unit = "%",
                                onValueChange = { updateParam(30, it.toInt()) }
                            )
                        }
                    }
                }
            }
        }
    }

@Composable
fun TunerSliderCard(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    unit: String = "",
    onValueChange: (Float) -> Unit,
    onValueChangeFinished: (() -> Unit)? = null
) {
    var localValue by remember(value) { mutableFloatStateOf(value) }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(label, fontWeight = FontWeight.Medium, fontSize = 13.sp)
                Text("${localValue.toInt()} $unit".trim(), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
            Slider(
                value = localValue.coerceIn(range.start, range.endInclusive),
                onValueChange = {
                    localValue = it
                    onValueChange(it)
                },
                onValueChangeFinished = onValueChangeFinished,
                valueRange = range
            )
        }
    }
}

@Composable
fun TunerSwitchCard(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, fontWeight = FontWeight.Medium, fontSize = 13.sp)
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange
            )
        }
    }
}
