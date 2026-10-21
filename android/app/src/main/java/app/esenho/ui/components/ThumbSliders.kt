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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.DYNAMIC_SETTING_KEYS
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.EsenhoStorageManager.SideSliderSetting
import kotlin.math.roundToInt

enum class QuickParameterKind { SLIDER, SWITCH, CHOICE }

data class SliderParamConfig(
    val paramId: Int,
    val name: String,
    val shortLabel: String,
    val minVal: Float,
    val maxVal: Float,
    val unit: String,
    val kind: QuickParameterKind = QuickParameterKind.SLIDER,
    val options: List<Pair<String, String>> = emptyList(),
)

private val STANDARD_SLIDER_PARAMS =
    listOf(
        SliderParamConfig(1, "Tamanho (Diâmetro)", "Tam", 1f, 100f, "px"),
        SliderParamConfig(2, "Opacidade", "Opac", 0f, 100f, "%"),
        SliderParamConfig(4, "Fluxo (Flow)", "Flux", 0f, 100f, "%"),
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

internal const val SHAPE_PARAMETER = -3001
internal const val TEXTURE_PARAMETER = -3002
internal const val PRESSURE_CURVE_PARAMETER = -2003
internal val PRESSURE_CURVE_OPTIONS = listOf(
    "linear" to "Linear", "soft" to "Suave", "hard" to "Firme", "s-curve" to "Curva S",
    "0.5" to "Gamma 0,5", "0.75" to "Gamma 0,75", "1.25" to "Gamma 1,25",
    "1.5" to "Gamma 1,5", "2" to "Gamma 2",
)
private val EXTRA_SLIDER_PARAMS = listOf(
    Triple(16, "Ângulo da Textura", 360f), Triple(23, "Velocidade", 100f),
    Triple(24, "Afinar Início", 100f), Triple(25, "Afinar Final", 100f), Triple(26, "Desvanecimento", 100f),
    Triple(33, "Desgaste de Tinta", 100f), Triple(34, "Captura de Cor", 100f),
    Triple(50, "Carga de Água", 100f), Triple(51, "Sangramento", 100f), Triple(52, "Granulação", 100f),
    Triple(53, "Borda Escura", 100f), Triple(55, "Impasto", 100f), Triple(56, "Secagem", 100f),
).map { (id, label, max) -> SliderParamConfig(id, label, label.take(8), 0f, max, if (id == 16) "°" else "%") }
private val SWITCH_PARAMS = listOf(
    22 to "Auto-Rotação", 32 to "Anti-Aliasing Subpixel", 39 to "Pressão Controla Tamanho",
    40 to "Pressão Controla Fluxo", 41 to "Inclinação Controla Ângulo", 42 to "Acumular Tinta",
    54 to "Mistura de Pigmentos", 57 to "Escalar Textura com o Tamanho",
).map { (id, label) -> SliderParamConfig(id, label, label.take(8), 0f, 1f, "", QuickParameterKind.SWITCH) }
private val CHOICE_PARAMS = listOf(
    SliderParamConfig(31, "Mesclagem dos dabs", "Mescla", 0f, 5f, "", QuickParameterKind.CHOICE,
        DAB_BLEND_NAMES.mapIndexed { index, name -> index.toString() to name }),
    SliderParamConfig(SHAPE_PARAMETER, "Formato da ponta", "Ponta", 0f, 1f, "", QuickParameterKind.CHOICE, BUILTIN_SHAPES),
    SliderParamConfig(TEXTURE_PARAMETER, "Textura", "Textura", 0f, 1f, "", QuickParameterKind.CHOICE, BUILTIN_TEXTURES),
    SliderParamConfig(PRESSURE_CURVE_PARAMETER, "Curva da pressão", "Curva", 0f, 1f, "", QuickParameterKind.CHOICE, PRESSURE_CURVE_OPTIONS),
)

private fun dynamicBaseRange(key: String): ClosedFloatingPointRange<Float> =
    dynamicRanges(key).let { it[0]..it[1] }

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
    STANDARD_SLIDER_PARAMS + EXTRA_SLIDER_PARAMS + SWITCH_PARAMS + CHOICE_PARAMS + DYNAMIC_SLIDER_PARAMS + PRESSURE_SLIDER_PARAMS

internal const val PROCEDURAL_PARAM_BASE = 10000
private val COMMON_PROCEDURAL_PARAMS = setOf(1, 2, 4, 5, 19, 20)

internal fun availableSliderParameters(engine: EsenhoEngine): List<SliderParamConfig> {
    val brush = engine.selectedBrush ?: return AVAILABLE_SLIDER_PARAMS + engine.realismParameters.map { param ->
        SliderParamConfig(param.id, param.label, param.shortLabel, param.min.toFloat(), param.max.toFloat(), param.unit,
            when { param.isSwitch -> QuickParameterKind.SWITCH; param.options.isNotEmpty() -> QuickParameterKind.CHOICE; else -> QuickParameterKind.SLIDER },
            param.options.mapIndexed { index, name -> index.toString() to name })
    }
    return STANDARD_SLIDER_PARAMS.filter { it.paramId in COMMON_PROCEDURAL_PARAMS }
        .map { if (it.paramId == 5) it.copy(minVal = 2f) else it } +
        brush.params.mapIndexed { index, param ->
            SliderParamConfig(PROCEDURAL_PARAM_BASE + index, param.name, param.name.take(7),
                param.min.toFloat(), param.max.toFloat().coerceAtLeast(param.min + 1f), param.unit)
        }
}

internal fun relevantQuickSliders(engine: EsenhoEngine, settings: List<SideSliderSetting>): List<SideSliderSetting> {
    val available = availableSliderParameters(engine).associateBy { it.paramId }
    return settings.filter { setting ->
        val config = available[setting.paramId]
        config != null && app.esenho.nativeengine.BrushParameterScope.matches(
            setting.ownerBrushId, setting.parameterName, engine.selectedBrush?.id,
            setting.paramId, config.name)
    }
}

private fun dynamicSettingIndex(paramId: Int): Int? =
    (-1000 - paramId).takeIf { paramId in -1047..-1000 }

private fun parameterStepValue(paramId: Int, value: Float): Float =
    if (dynamicSettingIndex(paramId) == null) value.roundToInt().toFloat() else value

internal fun readSliderParameter(engine: EsenhoEngine, paramId: Int): Float =
    parameterStepValue(
        paramId,
        when {
            paramId >= PROCEDURAL_PARAM_BASE -> engine.selectedBrush?.params?.getOrNull(paramId - PROCEDURAL_PARAM_BASE)?.currentVal?.toFloat() ?: 0f
            dynamicSettingIndex(paramId) != null ->
                engine.dynamicBaseValue(dynamicSettingIndex(paramId)!!)
            paramId == PRESSURE_MIN_PARAM ->
                engine.selectedPreset?.dynamicConfig?.optInt("pressure_min", 0)?.toFloat() ?: 0f
            paramId == PRESSURE_MAX_PARAM ->
                engine.selectedPreset?.dynamicConfig?.optInt("pressure_max", 100)?.toFloat() ?: 100f
            paramId == 1 -> engine.brushSize
            paramId == 2 -> engine.brushOpacity * 100f
            else -> engine.getPresetParam(paramId).toFloat()
        },
    )

internal fun writeSliderParameter(engine: EsenhoEngine, paramId: Int, requestedValue: Float) {
    val value = parameterStepValue(paramId, requestedValue)
    val dynamicIndex = dynamicSettingIndex(paramId)
    when {
        paramId >= PROCEDURAL_PARAM_BASE -> engine.setBrushCustomParam(paramId - PROCEDURAL_PARAM_BASE, value.toInt())
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

internal fun resolvedQuickParameter(setting: SideSliderSetting, engine: EsenhoEngine): SliderParamConfig {
    val template =
        availableSliderParameters(engine).find { it.paramId == setting.paramId }
            ?: STANDARD_SLIDER_PARAMS.first()
    return template
}

internal fun quickChoiceValue(engine: EsenhoEngine, id: Int): String = when (id) {
    SHAPE_PARAMETER -> engine.selectedPreset?.shape?.ifBlank { "circle" } ?: "circle"
    TEXTURE_PARAMETER -> engine.selectedPreset?.let { if (it.texMode == 0) "none" else it.texture } ?: "none"
    PRESSURE_CURVE_PARAMETER -> engine.selectedPreset?.dynamicConfig?.optString("pressure_curve", "linear") ?: "linear"
    else -> engine.getPresetParam(id).toString()
}
internal fun writeQuickChoice(engine: EsenhoEngine, id: Int, key: String) {
    when (id) {
        SHAPE_PARAMETER -> engine.setPresetShape(key)
        TEXTURE_PARAMETER -> engine.setPresetTexture(key)
        PRESSURE_CURVE_PARAMETER -> engine.setPressureResponse(key,
            engine.selectedPreset?.dynamicConfig?.optInt("pressure_min", 0) ?: 0,
            engine.selectedPreset?.dynamicConfig?.optInt("pressure_max", 100) ?: 100)
        else -> key.toIntOrNull()?.let { engine.setPresetParam(id, it) }
    }
}

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
    quickScripts: List<app.esenho.scripting.NativeScriptPreset> = emptyList(),
    onRunScript: (app.esenho.scripting.NativeScriptPreset) -> Unit = {},
    onOpenScripts: () -> Unit = {},
) {
    var quickTab by remember { mutableIntStateOf(0) }
    val visibleSettings = relevantQuickSliders(engine, settings)
    val listState = rememberLazyListState()
    var movingId by remember { mutableStateOf<String?>(null) }
    RevealMovingParameter(visibleSettings, movingId, listState)
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp)) {
        Text(
            "Parâmetros rápidos",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        WorkspaceSectionTabs(listOf("Parâmetros", "Scripts"),quickTab,{quickTab=it})
        if(quickTab == 1) {
            TextButton(onClick=onOpenScripts) { Text("Abrir editor de scripts") }
            if(quickScripts.isEmpty()) Text("Salve presets no dock de scripts para executá-los aqui.",style=MaterialTheme.typography.bodySmall)
            LazyColumn(Modifier.fillMaxWidth().heightIn(max=320.dp)) {
                items(quickScripts,key={it.id}) { script ->
                    TextButton(onClick={onRunScript(script)},modifier=Modifier.fillMaxWidth()) { Text("▶ ${script.name}") }
                }
            }
        } else LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false), state = listState) {
            items(visibleSettings, key = { it.id }) { setting ->
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
    val config = resolvedQuickParameter(setting, engine)
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
    if (config.kind == QuickParameterKind.SWITCH) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(config.name, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall)
            Switch(rawValue >= .5f, onCheckedChange = {
                writeSliderParameter(engine, config.paramId, if (it) 1f else 0f)
                localRevision++
                onParameterChanged(config.paramId, false)
            })
        }
        return
    }
    if (config.kind == QuickParameterKind.CHOICE) {
        CompactOptionDropdown(title = config.name, selectedKey = quickChoiceValue(engine, config.paramId), options = config.options,
            onSelected = {
                writeQuickChoice(engine, config.paramId, it)
                localRevision++
                onParameterChanged(config.paramId, false)
            })
        return
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
    onOpenEditor: () -> Unit,
    onParameterChanged: (Int, Boolean) -> Unit,
) {
    if (setting == null) {
        Box(Modifier.fillMaxSize().clickable(onClick = onOpenEditor), contentAlignment = Alignment.Center) {
            Text("Acompanhar parâmetros", style = MaterialTheme.typography.labelSmall)
        }
        return
    }
    val config = resolvedQuickParameter(setting, engine)
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
            .pointerInput(setting.id, config.minVal, config.maxVal) {
                fun setAt(x: Float) {
                    updateValue(
                        config.minVal +
                            (x / size.width.coerceAtLeast(1)).coerceIn(0f, 1f) *
                                (config.maxVal - config.minVal),
                        true,
                    )
                }
                if (config.kind == QuickParameterKind.SLIDER) detectHorizontalDragGestures(
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
                contentDescription = if (config.kind == QuickParameterKind.SLIDER)
                    "${config.name}; arraste para ajustar, toque para abrir ou fechar parâmetros"
                    else "${config.name}; toque para abrir os controles rápidos"
                if (config.kind == QuickParameterKind.SLIDER) {
                    progressBarRangeInfo = ProgressBarRangeInfo(
                        raw.coerceIn(config.minVal, config.maxVal), config.minVal..config.maxVal)
                    setProgress {
                        updateValue(it, false)
                        true
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        val trackColor = MaterialTheme.colorScheme.surfaceVariant
        val activeColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
        Canvas(Modifier.matchParentSize()) {
            drawRect(trackColor)
            drawRect(activeColor, size = androidx.compose.ui.geometry.Size(size.width * fraction, size.height))
        }
        Text(
            when (config.kind) {
                QuickParameterKind.SLIDER -> "${config.shortLabel} ${parameterValueLabel(raw)}${config.unit}"
                QuickParameterKind.SWITCH -> "${config.shortLabel}: ${if (raw >= .5f) "Sim" else "Não"}"
                QuickParameterKind.CHOICE -> "${config.shortLabel}: ${config.options.firstOrNull { it.first == quickChoiceValue(engine, config.paramId) }?.second ?: quickChoiceValue(engine, config.paramId)}"
            },
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 4.dp),
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
