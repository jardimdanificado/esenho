package app.esenho.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.esenho.R
import app.esenho.nativeengine.BrushModel
import app.esenho.nativeengine.BrushPresetModel
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.DYNAMIC_SETTING_KEYS
import org.json.JSONObject

fun mapWasmCategory(cat: String): String {
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

fun mapPresetCategory(cat: String): String {
    return when (cat.trim().lowercase()) {
        "personalizado", "personalizados", "custom" -> "Personalizados"
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

@Composable
fun getPresetIcon(group: String): ImageVector {
    return when (group) {
        "Personalizados" -> Icons.Default.Star
        "Esboço & Lápis" -> Icons.Default.Edit
        "Tinta & Caneta" -> Icons.Default.Draw
        "Pintura & Óleo" -> Icons.Default.Palette
        "Marcadores" -> Icons.Default.Highlight
        "Carvão & Pastel" -> Icons.Default.Brush
        "Aerógrafo" -> Icons.Default.Air
        "Efeitos (FX)" -> Icons.Default.AutoAwesome
        "Texturas" -> Icons.Default.Grain
        "Mistura & Smudge" -> Icons.Default.BlurOn
        "Borrachas" -> ImageVector.vectorResource(R.drawable.ic_eraser)
        else -> Icons.Default.Brush
    }
}

fun getWasmIcon(group: String): ImageVector {
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
    favoriteBrushIds: Set<String>,
    onToggleFavorite: (String) -> Unit,
    onBrushUpdated: () -> Unit,
    onDismiss: () -> Unit
) {
    var activeTab by remember { mutableStateOf(if (engine.selectedBrush != null) BrushDrawerTab.WASM_PROCEDURAL else BrushDrawerTab.PRESETS) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("Todos") }
    var showTuner by remember { mutableStateOf(false) }
    var catalogVersion by remember { mutableIntStateOf(0) }
    var searchExpanded by remember { mutableStateOf(false) }
    var categoryMenuExpanded by remember { mutableStateOf(false) }

    // When tab changes, reset category filter
    LaunchedEffect(activeTab) {
        selectedCategory = "Todos"
    }

    val filteredPresets = remember(selectedCategory, searchQuery, engine.presetCatalog.size, catalogVersion) {
        engine.presetCatalog.filter { p ->
            val matchCategory = when (selectedCategory) {
                "Todos" -> true
                "Personalizados" -> p.isCustom || mapPresetCategory(p.category) == "Personalizados"
                else -> mapPresetCategory(p.category) == selectedCategory
            }
            val matchSearch = if (searchQuery.isBlank()) true else {
                p.name.contains(searchQuery, ignoreCase = true) ||
                p.desc.contains(searchQuery, ignoreCase = true) ||
                p.category.contains(searchQuery, ignoreCase = true) ||
                p.id.contains(searchQuery, ignoreCase = true)
            }
            matchCategory && matchSearch
        }
    }

    val filteredWasmBrushes = remember(selectedCategory, searchQuery, engine.brushCatalog.size) {
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

    val presetCategories = remember(engine.presetCatalog.size, catalogVersion) {
        val cats = mutableListOf("Todos")
        if (engine.presetCatalog.any { it.isCustom }) {
            cats.add("Personalizados")
        }
        val groups = engine.presetCatalog.map { mapPresetCategory(it.category) }.filter { it != "Personalizados" }.distinct()
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
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        windowInsets = WindowInsets.safeDrawing
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 620.dp)
                .padding(horizontal = 14.dp)
                .padding(bottom = 8.dp)
        ) {
            EditorPanelHeader(if (showTuner) "Ajustes do pincel" else "Pincéis", onDismiss,
                onBack = if (showTuner) {{ showTuner = false }} else null)
            if (showTuner && engine.selectedPreset != null) {
                PresetTuner(
                    engine = engine,
                    preset = engine.selectedPreset!!,
                    onBrushUpdated = { catalogVersion++; onBrushUpdated() }
                )
            } else if (showTuner && engine.selectedBrush != null) {
                val b = engine.selectedBrush!!
                Text(b.title, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 500.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        TunerSliderCard(
                            label = "Estabilização / Suavização",
                            value = engine.brushSmooth.toFloat(),
                            range = 0f..100f,
                            unit = "%",
                            onValueChange = { engine.brushSmooth = it.toInt(); onBrushUpdated() }
                        )
                    }
                    items(b.params) { param ->
                        var paramValue by remember(param, param.currentVal) { mutableFloatStateOf(param.currentVal.toFloat()) }
                        TunerSliderCard(
                            label = param.name,
                            value = paramValue,
                            range = param.min.toFloat()..param.max.toFloat(),
                            unit = param.unit,
                            onValueChange = {
                                paramValue = it
                                engine.setBrushCustomParam(b.params.indexOf(param), it.toInt())
                                onBrushUpdated()
                            }
                        )
                    }
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    FilterChip(
                        selected = activeTab == BrushDrawerTab.PRESETS,
                        onClick = { activeTab = BrushDrawerTab.PRESETS },
                        label = { Text("Presets", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                        modifier = Modifier.weight(1f).height(32.dp)
                    )
                    FilterChip(
                        selected = activeTab == BrushDrawerTab.WASM_PROCEDURAL,
                        onClick = { activeTab = BrushDrawerTab.WASM_PROCEDURAL },
                        label = { Text("Procedurais", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                        modifier = Modifier.weight(1f).height(32.dp)
                    )
                    if (engine.selectedPreset != null || engine.selectedBrush?.params?.isNotEmpty() == true) {
                        IconButton(onClick = { showTuner = true }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Tune, contentDescription = "Ajustes")
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box {
                        OutlinedButton(
                            onClick = { categoryMenuExpanded = true },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text(selectedCategory, fontSize = 11.sp, maxLines = 1)
                            Icon(Icons.Default.ArrowDropDown, null, modifier = Modifier.size(16.dp))
                        }
                        DropdownMenu(expanded = categoryMenuExpanded, onDismissRequest = { categoryMenuExpanded = false }) {
                            (if (activeTab == BrushDrawerTab.PRESETS) presetCategories else wasmCategories).forEach { category ->
                                DropdownMenuItem(
                                    text = { Text(category) },
                                    leadingIcon = if (selectedCategory == category) {{ Icon(Icons.Default.Check, null) }} else null,
                                    onClick = { selectedCategory = category; categoryMenuExpanded = false }
                                )
                            }
                        }
                    }
                    if (searchExpanded) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Buscar", fontSize = 12.sp) },
                            singleLine = true,
                            trailingIcon = {
                                IconButton(onClick = { searchQuery = ""; searchExpanded = false }) {
                                    Icon(Icons.Default.Close, "Fechar busca", modifier = Modifier.size(16.dp))
                                }
                            },
                            modifier = Modifier.weight(1f).height(48.dp)
                        )
                    } else {
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = { searchExpanded = true }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Search, contentDescription = "Buscar")
                        }
                    }
                }

                LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(min = 180.dp, max = 470.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if ((activeTab == BrushDrawerTab.PRESETS && filteredPresets.isEmpty()) ||
                        (activeTab == BrushDrawerTab.WASM_PROCEDURAL && filteredWasmBrushes.isEmpty())) {
                        item {
                            Text("Nenhum pincel encontrado. Tente outra busca ou categoria.",
                                modifier = Modifier.padding(vertical = 24.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (activeTab == BrushDrawerTab.PRESETS) {
                        items(filteredPresets, key = { it.id }) { preset ->
                            val selected = engine.selectedPreset?.id == preset.id
                            PresetItemCard(
                                preset = preset,
                                isSelected = selected,
                                isFavorite = "preset:${preset.id}" in favoriteBrushIds,
                                onFavoriteClick = { onToggleFavorite("preset:${preset.id}") },
                                onClick = {
                                    engine.selectPreset(preset)
                                    onBrushUpdated()
                                    onDismiss()
                                },
                                onTuneClick = {
                                    if (!selected) { engine.selectPreset(preset); onBrushUpdated() }
                                    showTuner = true
                                }
                            )
                        }
                    } else {
                        items(filteredWasmBrushes, key = { it.id }) { brush ->
                            val selected = engine.selectedBrush?.id == brush.id
                            BrushItemCard(
                                title = brush.title,
                                categoryTag = brush.category,
                                paramCount = brush.params.size,
                                icon = getWasmIcon(mapWasmCategory(brush.category)),
                                isSelected = selected,
                                isFavorite = "brush:${brush.id}" in favoriteBrushIds,
                                onFavoriteClick = { onToggleFavorite("brush:${brush.id}") },
                                onClick = {
                                    engine.selectBrush(brush)
                                    onBrushUpdated()
                                    if (brush.params.isNotEmpty()) showTuner = true else onDismiss()
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
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    onClick: () -> Unit,
    onTuneClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
            .border(
                width = if (isSelected) 2.dp else 1.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
                shape = RoundedCornerShape(10.dp)
            ),
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
        tonalElevation = if (isSelected) 4.dp else 1.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = getPresetIcon(mapPresetCategory(preset.category)),
                    contentDescription = null,
                    tint = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(15.dp)
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = preset.name,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    maxLines = 1
                )
                Text(
                    text = "${preset.size}px • ${preset.opacity}%",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }

            IconButton(onClick = onFavoriteClick, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = if (isFavorite) Icons.Default.Star else Icons.Default.StarBorder,
                    contentDescription = if (isFavorite) "Remover dos favoritos" else "Adicionar aos favoritos",
                    tint = if (isFavorite) Color(0xFFFFC107) else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
            }

            if (isSelected) {
                IconButton(
                    onClick = onTuneClick,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Tune,
                        contentDescription = "Ajustar",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp)
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
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
            .border(
                width = if (isSelected) 2.dp else 1.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
                shape = RoundedCornerShape(10.dp)
            ),
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
        tonalElevation = if (isSelected) 4.dp else 1.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(15.dp)
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    maxLines = 1
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                    ) {
                        Text(
                            text = categoryTag,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    if (paramCount > 0) {
                        Text(
                            text = "$paramCount ajustes",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            IconButton(onClick = onFavoriteClick, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = if (isFavorite) Icons.Default.Star else Icons.Default.StarBorder,
                    contentDescription = if (isFavorite) "Remover dos favoritos" else "Adicionar aos favoritos",
                    tint = if (isFavorite) Color(0xFFFFC107) else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
            }

            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Selecionado",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp)
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
private fun CompactOptionDropdown(
    title: String,
    selectedKey: String,
    options: List<Pair<String, String>>,
    onSelected: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxWidth()) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth().clickable { expanded = true }
        ) {
            Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, modifier = Modifier.weight(1f), fontSize = 12.sp)
                Text(options.firstOrNull { it.first == selectedKey }?.second ?: selectedKey, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                Icon(Icons.Default.ArrowDropDown, null)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (key, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    trailingIcon = if (key == selectedKey) {{ Icon(Icons.Default.Check, null) }} else null,
                    onClick = { onSelected(key); expanded = false }
                )
            }
        }
    }
}

@Composable
fun PresetTuner(
    engine: EsenhoEngine,
    preset: BrushPresetModel,
    onBrushUpdated: () -> Unit
) {
    var tunerTab by remember { mutableStateOf(PresetTunerTab.TIP) }
    var tunerVersion by remember { mutableIntStateOf(0) }
    var showSavePresetDialog by remember { mutableStateOf(false) }
    var presetNameInput by remember { mutableStateOf("") }
    var showDeleteConfirmDialog by remember { mutableStateOf(false) }
    var saveErrorMessage by remember { mutableStateOf<String?>(null) }

    val updateParam: (Int, Int) -> Unit = { id, value ->
        engine.setPresetParam(id, value)
        onBrushUpdated()
    }

    Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
        // Preset Header with Reset and Save buttons
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
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
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Delete button for custom presets
                if (preset.isCustom) {
                    IconButton(
                        onClick = { showDeleteConfirmDialog = true },
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Excluir Preset",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                // Reset to Default button
                OutlinedButton(
                    onClick = {
                        engine.resetPresetToDefaults()
                        tunerVersion++
                        onBrushUpdated()
                    },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(13.dp))
                    Spacer(modifier = Modifier.width(3.dp))
                    Text("Padrão", fontSize = 11.sp)
                }

                // Save Preset button (F15)
                Button(
                    onClick = {
                        presetNameInput = "${preset.name} (Cópia)"
                        saveErrorMessage = null
                        showSavePresetDialog = true
                    },
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) {
                    Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(13.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Salvar Preset", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        if (showSavePresetDialog) {
            AlertDialog(
                onDismissRequest = { showSavePresetDialog = false },
                title = { Text("Salvar Preset", fontSize = 16.sp, fontWeight = FontWeight.Bold) },
                text = {
                    Column {
                        Text(
                            text = "Digite um nome para o preset com as configurações atuais:",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = presetNameInput,
                            onValueChange = {
                                presetNameInput = it
                                saveErrorMessage = null
                            },
                            label = { Text("Nome do Preset") },
                            isError = saveErrorMessage != null,
                            supportingText = if (saveErrorMessage != null) {
                                { Text(saveErrorMessage!!, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                            } else null,
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val trimmed = presetNameInput.trim()
                            if (trimmed.isEmpty()) {
                                saveErrorMessage = "O nome do preset não pode ser vazio"
                                return@Button
                            }
                            try {
                                engine.saveCurrentPresetAsCustom(trimmed)
                                tunerVersion++
                                onBrushUpdated()
                                showSavePresetDialog = false
                            } catch (e: Exception) {
                                saveErrorMessage = e.message ?: "Erro ao salvar preset"
                            }
                        }
                    ) {
                        Text("Salvar")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showSavePresetDialog = false }) {
                        Text("Cancelar")
                    }
                }
            )
        }

        if (showDeleteConfirmDialog) {
            AlertDialog(
                onDismissRequest = { showDeleteConfirmDialog = false },
                title = { Text("Excluir Preset?", fontSize = 16.sp, fontWeight = FontWeight.Bold) },
                text = {
                    Text(
                        text = "Deseja realmente excluir o preset '${preset.name}'? Esta ação removerá o arquivo salvo.",
                        fontSize = 13.sp
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            engine.deleteCustomPreset(preset.id)
                            tunerVersion++
                            onBrushUpdated()
                            showDeleteConfirmDialog = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("Excluir")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteConfirmDialog = false }) {
                        Text("Cancelar")
                    }
                }
            )
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
                    .height(420.dp),
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
                            val currentShape = preset.shape.ifBlank {
                                when (preset.shapeId) { 1 -> "square"; 2 -> "chisel"; else -> "circle" }
                            }
                            CompactOptionDropdown(
                                title = "Formato da ponta",
                                selectedKey = currentShape,
                                options = BUILTIN_SHAPES,
                                onSelected = { key -> engine.setPresetShape(key); tunerVersion++; onBrushUpdated() }
                            )
                        }
                        item {
                            TunerSwitchCard(
                                label = "Anti-Aliasing Subpixel (Precisão de Ponta)",
                                checked = preset.subpixel == 1,
                                onCheckedChange = { updateParam(32, if (it) 1 else 0) }
                            )
                        }
                        item {
                            CompactOptionDropdown(
                                title = "Mesclagem dos dabs",
                                selectedKey = preset.dabBlend.toString(),
                                options = DAB_BLEND_NAMES.mapIndexed { index, name -> index.toString() to name },
                                onSelected = { key -> updateParam(31, key.toInt()) }
                            )
                        }

                    }

                    PresetTunerTab.DYNAMICS -> {
                        item { DynamicPressureControls(preset, engine, onBrushUpdated) }
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
                        if (preset.engine.equals("dynamic", true) || preset.engine.equals("mypaint", true) || preset.dynamicConfig.optBoolean("dyn_continuous", false)) {
                            item { DynamicCurveEditor(preset, engine, onBrushUpdated) }
                        }
                    }

                    PresetTunerTab.TEXTURE -> {
                        item {
                            val selectedTexture = if (preset.texMode == 0) "none" else preset.texture.ifBlank { "none" }
                            CompactOptionDropdown(
                                title = "Textura",
                                selectedKey = selectedTexture,
                                options = BUILTIN_TEXTURES,
                                onSelected = { key -> engine.setPresetTexture(key); tunerVersion++; onBrushUpdated() }
                            )
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
                            Text(
                                "Água acumulada no papel pode ser seca ou difundida no cel atual.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { engine.dryPaintWater(); onBrushUpdated() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.WbSunny, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(5.dp))
                                    Text("Secar água", fontSize = 12.sp)
                                }
                                OutlinedButton(
                                    onClick = { engine.diffusePaintWater(); onBrushUpdated() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.WaterDrop, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(5.dp))
                                    Text("Difundir", fontSize = 12.sp)
                                }
                            }
                        }
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
private fun DynamicCurveEditor(preset: BrushPresetModel, engine: EsenhoEngine, onBrushUpdated: () -> Unit) {
    val sensors = listOf("Pressão", "Velocidade fina", "Velocidade", "Aleatório", "Distância do traço", "Direção", "Inclinação", "Ascensão", "Entrada customizada", "Ângulo de ataque", "Inclinação X", "Inclinação Y", "Mapa X", "Mapa Y", "Zoom", "Duração do traço")
    var setting by remember(preset.id) { mutableIntStateOf(0) }
    var input by remember(preset.id) { mutableIntStateOf(0) }
    val settingName = DYNAMIC_SETTING_KEYS[setting]
    val (baseMin, baseMax, curveMin, curveMax) = dynamicRanges(settingName)
    val points = remember(preset.id, setting, input) {
        val curves = preset.dynamicConfig.optJSONObject("dyn_curves")
        val name = DYNAMIC_SETTING_KEYS[setting]
        val inputs = curves?.optJSONObject(name) ?: curves?.optJSONObject("dyn_$name") ?: curves?.optJSONObject(setting.toString())
        val arr = inputs?.optJSONArray(input.toString())
        if (arr == null) mutableStateListOf(sensorRange(input).start to 0f, sensorRange(input).endInclusive to 0f) else mutableStateListOf<Pair<Float, Float>>().also { out ->
            for (i in 0 until arr.length()) arr.optJSONArray(i)?.let { out.add(it.optDouble(0).toFloat() to it.optDouble(1).toFloat()) }
            if (out.size < 2) { out.clear(); out.add(sensorRange(input).start to 0f); out.add(sensorRange(input).endInclusive to 0f) }
        }
    }
    val curveColor = MaterialTheme.colorScheme.primary
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text("Curva de resposta", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
        Spacer(Modifier.height(6.dp))
        CompactOptionDropdown("Parâmetro", settingName, DYNAMIC_SETTING_KEYS.map { it to it.replace('_', ' ').replaceFirstChar(Char::uppercase) }) { key -> setting = DYNAMIC_SETTING_KEYS.indexOf(key).coerceAtLeast(0) }
        var baseValue by remember(preset.id, setting) { mutableFloatStateOf(engine.dynamicBaseValue(setting)) }
        DynamicBaseSlider(baseValue, baseMin..baseMax, onValueChange = { baseValue = it; engine.setDynamicBase(setting, it); onBrushUpdated() })
        CompactOptionDropdown("Entrada", input.toString(), sensors.mapIndexed { i, label -> i.toString() to label }) { key -> input = key.toIntOrNull() ?: 0 }
        var dragging by remember { mutableIntStateOf(-1) }
        Canvas(Modifier.fillMaxWidth().height(132.dp).padding(8.dp).pointerInput(setting, input, points.size) {
            detectDragGestures(onDragStart = { pos ->
                val nearest = points.indices.minByOrNull { i ->
                    val px = (points[i].first - sensorRange(input).start) / (sensorRange(input).endInclusive - sensorRange(input).start) * size.width
                    val py = (1f - (points[i].second - curveMin) / (curveMax - curveMin)) * size.height
                    (px - pos.x) * (px - pos.x) + (py - pos.y) * (py - pos.y)
                } ?: 0
                if (nearest in 0 until points.size && (pos.x - (points[nearest].first - sensorRange(input).start) / (sensorRange(input).endInclusive - sensorRange(input).start) * size.width).let { it * it } + (pos.y - (1f - (points[nearest].second - curveMin) / (curveMax - curveMin)) * size.height).let { it * it } < 32f * 32f) dragging = nearest
            }, onDrag = { change, _ ->
                change.consume()
                val idx = dragging
                if (idx in points.indices) {
                    val xr = sensorRange(input)
                    val x = xr.start + (change.position.x / size.width).coerceIn(0f, 1f) * (xr.endInclusive - xr.start)
                    val y = curveMin + (1f - change.position.y / size.height).coerceIn(0f, 1f) * (curveMax - curveMin)
                    val gap = (xr.endInclusive - xr.start) * .01f
                    val left = if (idx == 0) xr.start else points[idx - 1].first + gap
                    val right = if (idx == points.lastIndex) xr.endInclusive else points[idx + 1].first - gap
                    val boundedX = x.coerceIn(left, right)
                    points[idx] = boundedX to y
                    engine.setDynamicCurve(setting, input, points.toList()); onBrushUpdated()
                }
            }, onDragEnd = { dragging = -1 })
        }) {
            val pad = 4.dp.toPx(); val w = size.width - 2 * pad; val h = size.height - 2 * pad
            for (i in 0..4) {
                val x = pad + w * i / 4f; val y = pad + h * i / 4f
                drawLine(Color.Gray.copy(alpha = .35f), Offset(x, pad), Offset(x, pad + h), 1.dp.toPx())
                drawLine(Color.Gray.copy(alpha = .35f), Offset(pad, y), Offset(pad + w, y), 1.dp.toPx())
            }
            for (i in 0 until points.lastIndex) {
                val a = points[i]; val b = points[i + 1]
                val xr = sensorRange(input)
                val ax = (a.first - xr.start) / (xr.endInclusive - xr.start); val bx = (b.first - xr.start) / (xr.endInclusive - xr.start)
                val ay = (a.second - curveMin) / (curveMax - curveMin); val by = (b.second - curveMin) / (curveMax - curveMin)
                drawLine(curveColor, Offset(pad + ax * w, pad + (1f - ay) * h), Offset(pad + bx * w, pad + (1f - by) * h), 3.dp.toPx(), cap = StrokeCap.Round)
            }
            points.forEach { (x, y) -> val xr = sensorRange(input); drawCircle(curveColor, 6.dp.toPx(), Offset(pad + (x - xr.start) / (xr.endInclusive - xr.start) * w, pad + (1f - (y - curveMin) / (curveMax - curveMin)) * h)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = {
                if (points.size < 16) {
                    val segment = (0 until points.lastIndex).maxByOrNull { points[it + 1].first - points[it].first } ?: 0
                    val a = points[segment]; val b = points[segment + 1]
                    points.add(segment + 1, ((a.first + b.first) / 2f) to ((a.second + b.second) / 2f))
                    engine.setDynamicCurve(setting, input, points.toList()); onBrushUpdated()
                }
            }) { Text("Adicionar ponto") }
            TextButton(onClick = { engine.setDynamicCurve(setting, input, null); points.clear(); points.add(sensorRange(input).start to 0f); points.add(sensorRange(input).endInclusive to 0f); onBrushUpdated() }) { Text("Sem ajuste") }
        }
    }
}

@Composable
private fun DynamicBaseSlider(value: Float, range: ClosedFloatingPointRange<Float>, onValueChange: (Float) -> Unit) {
    var local by remember(value) { mutableFloatStateOf(value) }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .35f))) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Valor base", fontSize = 13.sp)
                Text("%.2f".format(local), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
            Slider(value = local.coerceIn(range.start, range.endInclusive), valueRange = range, onValueChange = { local = it; onValueChange(it) })
        }
    }
}

private fun dynamicRanges(key: String): List<Float> {
    val base = when (key) {
        "radius_log", "smudge_radius_log", "smudge_length_log" -> -5f..8f
        "ellipse_angle" -> -360f..360f
        "color_h" -> 0f..1f
        "change_color_h" -> -1f..1f
        "dabs_per_basic_radius", "dabs_per_actual_radius", "dabs_per_second", "smudge_length", "smudge_bucket", "posterize_num" -> -10f..20f
        "speed_fine_slowness", "speed_coarse_slowness", "offset_by_speed_slowness", "lazy_tracking", "stroke_duration_log", "stroke_holdtime" -> -2f..2f
        "offset_by_speed", "offset_by_random", "tracking_noise", "lazy_tracking_per_dab", "custom_input", "custom_input_slowness" -> -2f..2f
        "change_color_l", "change_color_hsl_s", "change_color_vrx", "pressure_gain_log" -> -2f..2f
        "color_s", "color_v", "hardness", "opaque", "opaque_multiply", "opaque_linearize", "radius_by_random", "smudge", "smudge_transparency", "stroke_threshold", "ellipse_ratio" -> -1f..2f
        else -> -1f..1f
    }
    val curve = when (key) {
        "radius_log", "smudge_radius_log", "smudge_length_log" -> 5f
        "ellipse_angle" -> 360f
        "dabs_per_basic_radius", "dabs_per_actual_radius", "dabs_per_second", "smudge_length", "smudge_bucket", "posterize_num" -> 10f
        else -> maxOf(kotlin.math.abs(base.start), kotlin.math.abs(base.endInclusive))
    }
    return listOf(base.start, base.endInclusive, -curve, curve)
}

private fun sensorRange(input: Int): ClosedFloatingPointRange<Float> = when (input) {
    1, 2 -> 0f..8f // log speed
    4 -> 0f..1000f // distance in project pixels
    5 -> 0f..1f // normalized direction
    7, 10, 11 -> -1f..1f
    12, 13 -> 0f..2048f
    14 -> .1f..8f
    15 -> 0f..60f
    else -> 0f..1f
}

@Composable
private fun DynamicPressureControls(preset: BrushPresetModel, engine: EsenhoEngine, onBrushUpdated: () -> Unit) {
    val options = listOf("linear" to "Linear", "soft" to "Suave", "hard" to "Firme", "s-curve" to "Curva S", "0.5" to "Gamma 0,5", "0.75" to "Gamma 0,75", "1.25" to "Gamma 1,25", "1.5" to "Gamma 1,5", "2" to "Gamma 2")
    var curve by remember(preset.id) { mutableStateOf(preset.dynamicConfig.optString("pressure_curve", "linear")) }
    var minimum by remember(preset.id) { mutableFloatStateOf(preset.dynamicConfig.optInt("pressure_min", 0).toFloat()) }
    var maximum by remember(preset.id) { mutableFloatStateOf(preset.dynamicConfig.optInt("pressure_max", 100).toFloat()) }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text("Resposta da pressão", style = MaterialTheme.typography.titleSmall)
        CompactOptionDropdown("Curva", curve, options) { curve = it; engine.setPressureResponse(curve, minimum.toInt(), maximum.toInt()); onBrushUpdated() }
        TunerSliderCard("Pressão mínima", minimum, 0f..99f, "%", { minimum = it.coerceAtMost(maximum - 1f); engine.setPressureResponse(curve, minimum.toInt(), maximum.toInt()); onBrushUpdated() })
        TunerSliderCard("Pressão máxima", maximum, 1f..100f, "%", { maximum = it.coerceAtLeast(minimum + 1f); engine.setPressureResponse(curve, minimum.toInt(), maximum.toInt()); onBrushUpdated() })
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
