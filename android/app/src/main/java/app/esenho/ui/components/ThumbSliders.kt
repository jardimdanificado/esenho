package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.EsenhoStorageManager.SideSliderSetting

data class SliderParamConfig(
    val paramId: Int,
    val name: String,
    val shortLabel: String,
    val minVal: Float,
    val maxVal: Float,
    val unit: String
)

val AVAILABLE_SLIDER_PARAMS = listOf(
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
    SliderParamConfig(30, "Variação de Cor (Jitter)", "JitCor", 0f, 100f, "%")
)

private fun readSliderParameter(engine: EsenhoEngine, paramId: Int): Float = when (paramId) {
    1 -> engine.brushSize
    2 -> engine.brushOpacity * 100f
    else -> engine.getPresetParam(paramId).toFloat()
}

private fun writeSliderParameter(engine: EsenhoEngine, paramId: Int, value: Float) {
    when (paramId) {
        1 -> engine.brushSize = value
        2 -> engine.brushOpacity = value / 100f
        else -> engine.setPresetParam(paramId, value.toInt())
    }
}

/**
 * Vertical translucent thumb sliders placed at the screen edge.
 * Fully configurable: users can tap the header badge of any slider to assign
 * ANY brush property (Size, Opacity, Flow, Hardness, Smoothing, Bézier midpoint, etc.)
 */
@Composable
fun ThumbSliders(
    engine: EsenhoEngine,
    configuredSliders: List<SideSliderSetting>,
    onConfiguredSlidersChange: (List<SideSliderSetting>) -> Unit,
    onSizeChangeActive: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    var editingSliderIndex by remember { mutableStateOf<Int?>(null) }
    var editingParamId by remember { mutableIntStateOf(1) }
    var rangeMinText by remember { mutableStateOf("1") }
    var rangeMaxText by remember { mutableStateOf("300") }
    var currentValueText by remember { mutableStateOf("") }
    var refreshTrigger by remember { mutableIntStateOf(0) }

    Column(
        modifier = modifier
            .width(38.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        configuredSliders.take(6).forEachIndexed { index, setting ->
            val template = AVAILABLE_SLIDER_PARAMS.find { it.paramId == setting.paramId } ?: AVAILABLE_SLIDER_PARAMS[0]
            val minVal = setting.minVal ?: template.minVal
            val cfg = template.copy(minVal = minVal, maxVal = (setting.maxVal ?: template.maxVal).coerceAtLeast(minVal + 0.01f))

            val currentRawVal = remember(cfg.paramId, cfg.minVal, cfg.maxVal, engine.selectedPreset, engine.brushSize, engine.brushOpacity, refreshTrigger) {
                readSliderParameter(engine, cfg.paramId).coerceIn(cfg.minVal, cfg.maxVal)
            }

            // Property name and current value stay inside the slider. Tap to change property; drag to adjust.
            val norm = ((currentRawVal - cfg.minVal) / (cfg.maxVal - cfg.minVal)).coerceIn(0f, 1f)
            val barColor = when (index % 3) {
                0 -> Color(0xFF4CAF50) // green
                1 -> Color(0xFFFFC107) // yellow
                else -> Color(0xFFE53935) // red
            }
            VerticalThumbBar(
                value = norm,
                label = "${cfg.shortLabel} ${currentRawVal.toInt()}${cfg.unit}",
                fillColor = barColor,
                onClick = {
                    editingSliderIndex = index
                    editingParamId = setting.paramId
                    rangeMinText = cfg.minVal.toString().removeSuffix(".0")
                    rangeMaxText = cfg.maxVal.toString().removeSuffix(".0")
                    currentValueText = readSliderParameter(engine, cfg.paramId).toString().removeSuffix(".0")
                },
                onValueChange = { newNorm ->
                    val newVal = cfg.minVal + newNorm * (cfg.maxVal - cfg.minVal)
                    if (cfg.paramId == 1) engine.brushSize = newVal
                    else if (cfg.paramId == 2) engine.brushOpacity = newVal / 100f
                    else engine.setPresetParam(cfg.paramId, newVal.toInt())
                    refreshTrigger++
                },
                onActiveChange = { active -> if (cfg.paramId == 1) onSizeChangeActive(active) }
            )
        }

        // Add/Manage Slider action button
        if (configuredSliders.size < 6) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f),
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .clickable {
                        val next = AVAILABLE_SLIDER_PARAMS.firstOrNull { option -> configuredSliders.none { it.paramId == option.paramId } }
                            ?: AVAILABLE_SLIDER_PARAMS[4] // Smoothing
                        onConfiguredSlidersChange(configuredSliders.take(6) + SideSliderSetting(next.paramId))
                    }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = "Adicionar Slider Lateral",
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }

    // Modal Dialog to Select Property for the Tapped Slider
    editingSliderIndex?.let { editIdx ->
        val selectedTemplate = AVAILABLE_SLIDER_PARAMS.find { it.paramId == editingParamId } ?: AVAILABLE_SLIDER_PARAMS[0]

        Dialog(onDismissRequest = { editingSliderIndex = null }) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 6.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp)
                    .padding(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Configurar Slider Lateral #${editIdx + 1}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Escolha a propriedade do pincel a controlar",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(onClick = { editingSliderIndex = null }) {
                            Icon(Icons.Default.Close, contentDescription = "Fechar")
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text("Faixa de ${selectedTemplate.name}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = rangeMinText,
                            onValueChange = { rangeMinText = it.filter { ch -> ch.isDigit() || ch == '.' || ch == ',' } },
                            label = { Text("Mínimo") }, singleLine = true, modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = rangeMaxText,
                            onValueChange = { rangeMaxText = it.filter { ch -> ch.isDigit() || ch == '.' || ch == ',' } },
                            label = { Text("Máximo") }, singleLine = true, modifier = Modifier.weight(1f)
                        )
                    }
                    OutlinedTextField(
                        value = currentValueText,
                        onValueChange = { currentValueText = it.filter { ch -> ch.isDigit() || ch == '.' || ch == ',' } },
                        label = { Text("Valor atual (${selectedTemplate.unit.ifBlank { "sem unidade" }})") },
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text("Unidade: ${selectedTemplate.unit.ifBlank { "sem unidade" }}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(8.dp))

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(AVAILABLE_SLIDER_PARAMS) { opt ->
                            val isSelected = opt.paramId == editingParamId
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        editingParamId = opt.paramId
                                        rangeMinText = opt.minVal.toString().removeSuffix(".0")
                                        rangeMaxText = opt.maxVal.toString().removeSuffix(".0")
                                        currentValueText = readSliderParameter(engine, opt.paramId).toString().removeSuffix(".0")
                                    }
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            text = opt.name,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                        Text(
                                            text = "Padrão: ${opt.minVal} a ${opt.maxVal}${opt.unit}",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    if (isSelected) {
                                        Icon(
                                            Icons.Default.Check,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        TextButton(
                            enabled = configuredSliders.size > 1,
                            onClick = {
                                val mutable = configuredSliders.toMutableList()
                                if (editIdx < mutable.size) mutable.removeAt(editIdx)
                                onConfiguredSlidersChange(mutable)
                                editingSliderIndex = null
                            },
                            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                        ) { Text("Remover", fontSize = 12.sp) }
                        val minValue = rangeMinText.replace(',', '.').toFloatOrNull()
                        val maxValue = rangeMaxText.replace(',', '.').toFloatOrNull()
                        val currentValue = currentValueText.replace(',', '.').toFloatOrNull()
                        Button(
                            enabled = minValue != null && maxValue != null && currentValue != null && maxValue > minValue,
                            onClick = {
                                if (minValue != null && maxValue != null && currentValue != null && maxValue > minValue) {
                                    val mutable = configuredSliders.toMutableList()
                                    if (editIdx < mutable.size) mutable[editIdx] = SideSliderSetting(editingParamId, minValue, maxValue)
                                    onConfiguredSlidersChange(mutable)
                                    writeSliderParameter(engine, editingParamId, currentValue.coerceIn(minValue, maxValue))
                                    refreshTrigger++
                                    editingSliderIndex = null
                                }
                            }
                        ) { Text("Aplicar") }
                    }
                }
            }
        }
    }
}

@Composable
fun VerticalThumbBar(
    value: Float,
    label: String,
    fillColor: Color = Color(0xFF62676C),
    onClick: () -> Unit,
    onValueChange: (Float) -> Unit,
    onActiveChange: (Boolean) -> Unit
) {
    // pointerInput(Unit) intentionally keeps its gesture coroutine alive while
    // the thumb is dragged. Keep the callbacks fresh when the selected
    // property changes during recomposition, otherwise the next drag can keep
    // writing to the previous property.
    val latestOnClick by rememberUpdatedState(onClick)
    val latestOnValueChange by rememberUpdatedState(onValueChange)
    val latestOnActiveChange by rememberUpdatedState(onActiveChange)

    Box(
        modifier = Modifier
            .width(36.dp)
            .height(88.dp)
            .clip(RoundedCornerShape(13.dp))
            .background(Color(0x24000000))
            .clickable(onClick = { latestOnClick() })
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { offset ->
                        latestOnActiveChange(true)
                        val norm = 1f - (offset.y / size.height).coerceIn(0f, 1f)
                        latestOnValueChange(norm)
                    },
                    onDragEnd = { latestOnActiveChange(false) },
                    onDragCancel = { latestOnActiveChange(false) },
                    onVerticalDrag = { change, _ ->
                        change.consume()
                        val norm = 1f - (change.position.y / size.height).coerceIn(0f, 1f)
                        latestOnValueChange(norm)
                    }
                )
            },
        contentAlignment = Alignment.BottomCenter
    ) {
        // Filled portion from bottom
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(value.coerceIn(0f, 1f))
                .background(fillColor.copy(alpha = 0.82f))
        )

        // Center pill handle & label
        Text(
            text = label,
            fontSize = 7.sp,
            color = Color.White,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(2.dp)
        )
    }
}
