package app.esenho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.esenho.nativeengine.DYNAMIC_SETTING_KEYS
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.EsenhoStorageManager.SideSliderSetting

data class SliderParamConfig(
    val paramId: Int,
    val name: String,
    val shortLabel: String,
    val minVal: Float,
    val maxVal: Float,
    val unit: String,
)

private val STANDARD_SLIDER_PARAMS =
    listOf(
        SliderParamConfig(1, "Tamanho (Diâmetro)", "Tam", 1f, 300f, "px"),
        SliderParamConfig(2, "Opacidade", "Opac", 1f, 100f, "%"),
        SliderParamConfig(4, "Fluxo (Flow)", "Flux", 1f, 100f, "%"),
        SliderParamConfig(3, "Dureza da Borda", "Durez", 0f, 100f, "%"),
        SliderParamConfig(19, "Suavização (Estabilizador)", "Suav", 0f, 100f, "%"),
        SliderParamConfig(5, "Espaçamento", "Esp", 1f, 100f, "%"),
        SliderParamConfig(7, "Arredondamento", "Arred", 1f, 100f, "%"),
        SliderParamConfig(6, "Ângulo de Rotação", "Âng", 0f, 360f, "°"),
        SliderParamConfig(8, "Dispersão (Scatter)", "Disp", 0f, 100f, "%"),
        SliderParamConfig(9, "Tolerância do Balde", "Tol", 0f, 255f, ""),
        SliderParamConfig(20, "Ponto Médio Bézier", "Bézier", 0f, 100f, "%"),
        SliderParamConfig(10, "Borrar (Smudge)", "Borr", 0f, 100f, "%"),
        SliderParamConfig(11, "Umidade (Wetness)", "Umid", 0f, 100f, "%"),
        SliderParamConfig(12, "Grão / Ruído", "Grão", 0f, 100f, "%"),
        SliderParamConfig(17, "Escala da Textura", "TexEsc", 10f, 300f, "%"),
        SliderParamConfig(21, "Contraste Textura", "TexCont", 0f, 200f, "%"),
        SliderParamConfig(27, "Variação de Tamanho (Jitter)", "JitTam", 0f, 100f, "%"),
        SliderParamConfig(28, "Variação de Ângulo (Jitter)", "JitÂng", 0f, 360f, "°"),
        SliderParamConfig(29, "Variação de Opacidade (Jitter)", "JitOpac", 0f, 100f, "%"),
        SliderParamConfig(30, "Variação de Cor (Jitter)", "JitCor", 0f, 100f, "%"),
    )

private fun dynamicBaseRange(key: String): ClosedFloatingPointRange<Float> =
    when (key) {
        "radius_log",
        "smudge_radius_log",
        "smudge_length_log" -> -5f..8f
        "ellipse_angle" -> -360f..360f
        "color_h" -> 0f..1f
        "change_color_h" -> -1f..1f
        "dabs_per_basic_radius",
        "dabs_per_actual_radius",
        "dabs_per_second",
        "smudge_length",
        "smudge_bucket",
        "posterize_num" -> -10f..20f
        "speed_fine_slowness",
        "speed_coarse_slowness",
        "offset_by_speed_slowness",
        "lazy_tracking",
        "stroke_duration_log",
        "stroke_holdtime" -> -2f..2f
        "color_s",
        "color_v",
        "hardness",
        "opaque",
        "opaque_multiply",
        "opaque_linearize",
        "radius_by_random",
        "smudge",
        "smudge_transparency",
        "stroke_threshold",
        "ellipse_ratio" -> -1f..2f
        else -> -2f..2f
    }

private val DYNAMIC_SLIDER_PARAMS =
    DYNAMIC_SETTING_KEYS.mapIndexed { index, key ->
        val range = dynamicBaseRange(key)
        SliderParamConfig(
            -1000 - index,
            "Dinâmico: ${key.replace('_', ' ')}",
            "D${key.replace("_", "").take(4)}",
            range.start,
            range.endInclusive,
            "",
        )
    }
private const val PRESSURE_MIN_PARAM = -2001
private const val PRESSURE_MAX_PARAM = -2002
private val PRESSURE_SLIDER_PARAMS =
    listOf(
        SliderParamConfig(PRESSURE_MIN_PARAM, "Pressão mínima", "PMin", 0f, 99f, "%"),
        SliderParamConfig(PRESSURE_MAX_PARAM, "Pressão máxima", "PMax", 1f, 100f, "%"),
    )
val AVAILABLE_SLIDER_PARAMS =
    STANDARD_SLIDER_PARAMS + DYNAMIC_SLIDER_PARAMS + PRESSURE_SLIDER_PARAMS

private fun dynamicSettingIndex(paramId: Int): Int? =
    (-1000 - paramId).takeIf { paramId in -1047..-1000 }

private fun readSliderParameter(engine: EsenhoEngine, paramId: Int): Float =
    when {
        dynamicSettingIndex(paramId) != null ->
            engine.dynamicBaseValue(dynamicSettingIndex(paramId)!!)
        paramId == PRESSURE_MIN_PARAM ->
            engine.selectedPreset?.dynamicConfig?.optInt("pressure_min", 0)?.toFloat() ?: 0f
        paramId == PRESSURE_MAX_PARAM ->
            engine.selectedPreset?.dynamicConfig?.optInt("pressure_max", 100)?.toFloat() ?: 100f
        paramId == 1 -> engine.brushSize
        paramId == 2 -> engine.brushOpacity * 100f
        else -> engine.getPresetParam(paramId).toFloat()
    }

private fun writeSliderParameter(engine: EsenhoEngine, paramId: Int, value: Float) {
    val dynamicIndex = dynamicSettingIndex(paramId)
    when {
        dynamicIndex != null -> engine.setDynamicBase(dynamicIndex, value)
        paramId == PRESSURE_MIN_PARAM || paramId == PRESSURE_MAX_PARAM -> {
            val config = engine.selectedPreset?.dynamicConfig
            val curve = config?.optString("pressure_curve", "linear") ?: "linear"
            val min =
                if (paramId == PRESSURE_MIN_PARAM) value.toInt()
                else config?.optInt("pressure_min", 0) ?: 0
            val max =
                if (paramId == PRESSURE_MAX_PARAM) value.toInt()
                else config?.optInt("pressure_max", 100) ?: 100
            engine.setPressureResponse(curve, min, max)
        }
        paramId == 1 -> engine.brushSize = value
        paramId == 2 -> engine.brushOpacity = value / 100f
        else -> engine.setPresetParam(paramId, value.toInt())
    }
}

internal fun resolvedQuickParameter(setting: SideSliderSetting): SliderParamConfig {
    val template =
        AVAILABLE_SLIDER_PARAMS.find { it.paramId == setting.paramId }
            ?: AVAILABLE_SLIDER_PARAMS.first()
    val min = setting.minVal?.takeIf { it.isFinite() } ?: template.minVal
    val max =
        setting.maxVal?.takeIf { it.isFinite() && it > min }
            ?: template.maxVal.coerceAtLeast(min + 0.01f)
    return template.copy(minVal = min, maxVal = max)
}

private fun finiteParameterNumber(text: String): Float? =
    text.replace(',', '.').toFloatOrNull()?.takeIf { it.isFinite() }

private fun parameterValueLabel(value: Float): String =
    java.lang.String.format(java.util.Locale.US, "%.3f", value).trimEnd('0').trimEnd('.')

@Composable
fun QuickParameterSliders(
    engine: EsenhoEngine,
    settings: List<SideSliderSetting>,
    revision: Int,
    onParameterChanged: (Int, Boolean) -> Unit,
    onMoveParameter: (String, Int) -> Unit,
    onReorderFinished: () -> Unit,
) {
    val listState = rememberLazyListState()
    var movingId by remember { mutableStateOf<String?>(null) }
    RevealMovingParameter(settings, movingId, listState)
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp)) {
        Text(
            "Parâmetros rápidos",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false), state = listState) {
            items(settings, key = { it.id }) { setting ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ParameterDragHandle(
                        setting.id,
                        52f,
                        { id, steps ->
                            movingId = id
                            onMoveParameter(id, steps)
                        },
                        {
                            movingId = null
                            onReorderFinished()
                        },
                    )
                    Box(Modifier.weight(1f)) {
                        QuickParameterRow(engine, setting, revision, onParameterChanged)
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickParameterRow(
    engine: EsenhoEngine,
    setting: SideSliderSetting,
    revision: Int,
    onParameterChanged: (Int, Boolean) -> Unit,
) {
    var localRevision by remember { mutableIntStateOf(0) }
    val config = resolvedQuickParameter(setting)
    val rawValue =
        remember(
            revision,
            localRevision,
            setting,
            engine.selectedPreset,
            engine.brushSize,
            engine.brushOpacity,
        ) {
            readSliderParameter(engine, config.paramId)
        }
    Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                config.name,
                Modifier.weight(1f),
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${parameterValueLabel(rawValue)}${config.unit}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Slider(
            value = rawValue.coerceIn(config.minVal, config.maxVal),
            valueRange = config.minVal..config.maxVal,
            onValueChange = {
                writeSliderParameter(engine, config.paramId, it)
                localRevision++
                onParameterChanged(config.paramId, true)
            },
            onValueChangeFinished = { onParameterChanged(config.paramId, false) },
            modifier =
                Modifier.fillMaxWidth().height(30.dp).semantics { contentDescription = config.name },
        )
    }
}

/** This dock configures the shared quick stack; it contains no duplicate sliders. */
@Composable
fun ParameterSettingsPanel(
    engine: EsenhoEngine,
    configuredSliders: List<SideSliderSetting>,
    onConfiguredSlidersChange: (List<SideSliderSetting>) -> Unit,
    onValuesChanged: () -> Unit,
    onDismiss: () -> Unit,
    revision: Int,
    onMoveParameter: (String, Int) -> Unit,
    onReorderFinished: () -> Unit,
) {
    val listState = rememberLazyListState()
    var movingId by remember { mutableStateOf<String?>(null) }
    RevealMovingParameter(configuredSliders, movingId, listState)
    var editingSliderId by remember { mutableStateOf<String?>(null) }
    var editingParamId by remember { mutableIntStateOf(1) }
    var rangeMinText by remember { mutableStateOf("1") }
    var rangeMaxText by remember { mutableStateOf("300") }
    var currentValueText by remember { mutableStateOf("") }

    fun edit(index: Int) {
        val config = resolvedQuickParameter(configuredSliders[index])
        editingSliderId = configuredSliders[index].id
        editingParamId = config.paramId
        rangeMinText = parameterValueLabel(config.minVal)
        rangeMaxText = parameterValueLabel(config.maxVal)
        currentValueText = parameterValueLabel(readSliderParameter(engine, config.paramId))
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
        EditorPanelHeader("Configurar parâmetros rápidos", onDismiss)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState) {
            items(configuredSliders, key = { it.id }) { setting ->
                val index = configuredSliders.indexOfFirst { it.id == setting.id }
                val config = resolvedQuickParameter(configuredSliders[index])
                val value =
                    remember(revision, configuredSliders[index]) {
                        readSliderParameter(engine, config.paramId)
                    }
                Row(
                    Modifier.fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .clickable { edit(index) }
                        .padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ParameterDragHandle(
                        setting.id,
                        44f,
                        { id, steps ->
                            movingId = id
                            onMoveParameter(id, steps)
                        },
                        {
                            movingId = null
                            onReorderFinished()
                        },
                    )
                    Column(Modifier.weight(1f)) {
                        Text(
                            config.name,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "${parameterValueLabel(config.minVal)}–${parameterValueLabel(config.maxVal)}${config.unit}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        "${parameterValueLabel(value)}${config.unit}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                    Icon(
                        Icons.Default.Tune,
                        "Editar parâmetro, faixa e valor",
                        Modifier.size(18.dp),
                    )
                }
            }
        }
        TextButton(
            onClick = {
                val next =
                    AVAILABLE_SLIDER_PARAMS.firstOrNull { option ->
                        configuredSliders.none { it.paramId == option.paramId }
                    } ?: AVAILABLE_SLIDER_PARAMS.first()
                onConfiguredSlidersChange(configuredSliders + SideSliderSetting(next.paramId))
            },
            modifier = Modifier.height(32.dp),
        ) {
            Icon(Icons.Default.Add, null, Modifier.size(16.dp))
            Text("Adicionar parâmetro (${configuredSliders.size})")
        }
    }

    editingSliderId?.let { editId ->
        val editIdx = configuredSliders.indexOfFirst { it.id == editId }
        if (editIdx < 0) return@let
        val selectedTemplate =
            AVAILABLE_SLIDER_PARAMS.find { it.paramId == editingParamId }
                ?: AVAILABLE_SLIDER_PARAMS[0]

        Dialog(onDismissRequest = { editingSliderId = null }) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 6.dp,
                modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp).padding(12.dp),
            ) {
                Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = "Configurar parâmetro #${editIdx + 1}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "Escolha a propriedade do pincel a controlar",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { editingSliderId = null }) {
                            Icon(Icons.Default.Close, contentDescription = "Fechar")
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        "Faixa de ${selectedTemplate.name}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = rangeMinText,
                            onValueChange = {
                                rangeMinText =
                                    it.filter { ch ->
                                        ch.isDigit() || ch == '.' || ch == ',' || ch == '-'
                                    }
                            },
                            label = { Text("Mínimo") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = rangeMaxText,
                            onValueChange = {
                                rangeMaxText =
                                    it.filter { ch ->
                                        ch.isDigit() || ch == '.' || ch == ',' || ch == '-'
                                    }
                            },
                            label = { Text("Máximo") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    OutlinedTextField(
                        value = currentValueText,
                        onValueChange = {
                            currentValueText =
                                it.filter { ch ->
                                    ch.isDigit() || ch == '.' || ch == ',' || ch == '-'
                                }
                        },
                        label = {
                            Text("Valor atual (${selectedTemplate.unit.ifBlank { "sem unidade" }})")
                        },
                        singleLine = true,
                        keyboardOptions =
                            androidx.compose.foundation.text.KeyboardOptions(
                                keyboardType = KeyboardType.Decimal
                            ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        "Unidade: ${selectedTemplate.unit.ifBlank { "sem unidade" }}",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(AVAILABLE_SLIDER_PARAMS) { opt ->
                            val isSelected = opt.paramId == editingParamId
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color =
                                    if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                    else
                                        MaterialTheme.colorScheme.surfaceVariant.copy(
                                            alpha = 0.35f
                                        ),
                                modifier =
                                    Modifier.fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .clickable {
                                            editingParamId = opt.paramId
                                            rangeMinText = opt.minVal.toString().removeSuffix(".0")
                                            rangeMaxText = opt.maxVal.toString().removeSuffix(".0")
                                            currentValueText =
                                                readSliderParameter(engine, opt.paramId)
                                                    .toString()
                                                    .removeSuffix(".0")
                                        },
                            ) {
                                Row(
                                    modifier =
                                        Modifier.fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column {
                                        Text(
                                            text = opt.name,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight =
                                                if (isSelected) FontWeight.Bold
                                                else FontWeight.Normal,
                                        )
                                        Text(
                                            text =
                                                "Padrão: ${opt.minVal} a ${opt.maxVal}${opt.unit}",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    if (isSelected) {
                                        Icon(
                                            Icons.Default.Check,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(
                            enabled = configuredSliders.size > 1,
                            onClick = {
                                val mutable = configuredSliders.toMutableList()
                                if (editIdx < mutable.size) mutable.removeAt(editIdx)
                                onConfiguredSlidersChange(mutable)
                                editingSliderId = null
                            },
                            colors =
                                ButtonDefaults.textButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error
                                ),
                        ) {
                            Text("Remover", fontSize = 12.sp)
                        }
                        val minValue = finiteParameterNumber(rangeMinText)
                        val maxValue = finiteParameterNumber(rangeMaxText)
                        val currentValue = finiteParameterNumber(currentValueText)
                        Button(
                            enabled =
                                minValue != null &&
                                    maxValue != null &&
                                    currentValue != null &&
                                    maxValue > minValue,
                            onClick = {
                                if (
                                    minValue != null &&
                                        maxValue != null &&
                                        currentValue != null &&
                                        maxValue > minValue
                                ) {
                                    val mutable = configuredSliders.toMutableList()
                                    if (editIdx < mutable.size)
                                        mutable[editIdx] =
                                            mutable[editIdx].copy(
                                                paramId = editingParamId,
                                                minVal = minValue,
                                                maxVal = maxValue,
                                            )
                                    onConfiguredSlidersChange(mutable)
                                    writeSliderParameter(
                                        engine,
                                        editingParamId,
                                        currentValue.coerceIn(minValue, maxValue),
                                    )
                                    onValuesChanged()
                                    editingSliderId = null
                                }
                            },
                        ) {
                            Text("Aplicar")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ParameterDragHandle(
    id: String,
    rowHeight: Float,
    onMove: (String, Int) -> Unit,
    onFinish: () -> Unit,
) {
    val move by rememberUpdatedState(onMove)
    val finish by rememberUpdatedState(onFinish)
    val pixels = with(LocalDensity.current) { rowHeight.dp.toPx() }
    var dragging by remember { mutableStateOf(false) }
    Icon(
        Icons.Default.DragHandle,
        "Segure e arraste para reordenar",
        Modifier.size(32.dp)
            .semantics {
                customActions =
                    listOf(
                        CustomAccessibilityAction("Mover para cima") {
                            move(id, -1)
                            finish()
                            true
                        },
                        CustomAccessibilityAction("Mover para baixo") {
                            move(id, 1)
                            finish()
                            true
                        },
                    )
            }
            .background(
                if (dragging) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                RoundedCornerShape(4.dp),
            )
            .pointerInput(id, pixels) {
                var distance = 0f
                detectDragGesturesAfterLongPress(
                    onDragStart = {
                        distance = 0f
                        dragging = true
                    },
                    onDragEnd = {
                        dragging = false
                        finish()
                    },
                    onDragCancel = {
                        dragging = false
                        finish()
                    },
                ) { change, amount ->
                    change.consume()
                    distance += amount.y
                    val steps = (distance / pixels).toInt()
                    if (steps != 0) {
                        move(id, steps)
                        distance -= steps * pixels
                    }
                }
            }
            .padding(7.dp),
        tint =
            if (dragging) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
fun QuickParameterTrigger(
    engine: EsenhoEngine,
    setting: SideSliderSetting?,
    revision: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    onParameterChanged: (Int, Boolean) -> Unit,
) {
    val config = resolvedQuickParameter(setting ?: SideSliderSetting(1))
    var localRevision by remember { mutableIntStateOf(0) }
    val raw =
        remember(revision, localRevision, setting, engine.brushSize, engine.brushOpacity) {
            readSliderParameter(engine, config.paramId)
        }
    val changed by rememberUpdatedState(onParameterChanged)
    fun update(value: Float, active: Boolean) {
        writeSliderParameter(engine, config.paramId, value.coerceIn(config.minVal, config.maxVal))
        localRevision++
        changed(config.paramId, active)
    }
    val updateValue by
        rememberUpdatedState<(Float, Boolean) -> Unit>({ v, active -> update(v, active) })
    val fraction = ((raw - config.minVal) / (config.maxVal - config.minVal)).coerceIn(0f, 1f)
    Box(
        Modifier.fillMaxSize()
            .clip(RoundedCornerShape(5.dp))
            .background(
                if (expanded) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceVariant
            )
            .pointerInput(setting?.id, config.minVal, config.maxVal) {
                fun setAt(x: Float) {
                    updateValue(
                        config.minVal +
                            (x / size.width.coerceAtLeast(1)).coerceIn(0f, 1f) *
                                (config.maxVal - config.minVal),
                        true,
                    )
                }
                detectHorizontalDragGestures(
                    onDragStart = { setAt(it.x) },
                    onDragEnd = { changed(config.paramId, false) },
                    onDragCancel = { changed(config.paramId, false) },
                ) { change, _ ->
                    change.consume()
                    setAt(change.position.x)
                }
            }
            .clickable(onClick = onToggle)
            .semantics {
                contentDescription =
                    "${config.name}; arraste para ajustar, toque para abrir ou fechar parâmetros"
                progressBarRangeInfo =
                    ProgressBarRangeInfo(
                        raw.coerceIn(config.minVal, config.maxVal),
                        config.minVal..config.maxVal,
                    )
                setProgress {
                    updateValue(it, false)
                    true
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        val trackColor = MaterialTheme.colorScheme.outlineVariant
        val activeColor = MaterialTheme.colorScheme.primary
        Canvas(
            Modifier.align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(12.dp)
                .padding(horizontal = 6.dp)
        ) {
            val start = Offset(3.dp.toPx(), size.height / 2)
            val end = Offset(size.width - 3.dp.toPx(), size.height / 2)
            val thumb = Offset(start.x + (end.x - start.x) * fraction, start.y)
            drawLine(trackColor, start, end, 2.dp.toPx())
            drawLine(activeColor, start, thumb, 2.dp.toPx())
            drawCircle(activeColor, 3.dp.toPx(), thumb)
        }
        Text(
            "${config.shortLabel} ${parameterValueLabel(raw)}${config.unit}",
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 3.dp),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
    }
}

@Composable
private fun RevealMovingParameter(
    settings: List<SideSliderSetting>,
    movingId: String?,
    state: LazyListState,
) {
    LaunchedEffect(settings, movingId) {
        val index = settings.indexOfFirst { it.id == movingId }
        if (index >= 0 && state.layoutInfo.visibleItemsInfo.none { it.index == index }) {
            state.scrollToItem(index)
        }
    }
}
