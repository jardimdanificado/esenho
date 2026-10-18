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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.esenho.nativeengine.EsenhoEngine

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

/**
 * Vertical translucent thumb sliders placed at the screen edge.
 * Fully configurable: users can tap the header badge of any slider to assign
 * ANY brush property (Size, Opacity, Flow, Hardness, Smoothing, Bézier midpoint, etc.)
 */
@Composable
fun ThumbSliders(
    engine: EsenhoEngine,
    configuredParamIds: List<Int>,
    onConfiguredParamsChange: (List<Int>) -> Unit,
    onSizeChangeActive: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    var editingSliderIndex by remember { mutableStateOf<Int?>(null) }
    var refreshTrigger by remember { mutableIntStateOf(0) }

    Column(
        modifier = modifier
            .padding(start = 6.dp)
            .width(46.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        configuredParamIds.forEachIndexed { index, paramId ->
            val cfg = AVAILABLE_SLIDER_PARAMS.find { it.paramId == paramId }
                ?: AVAILABLE_SLIDER_PARAMS[0]

            val currentRawVal = remember(cfg.paramId, engine.selectedPreset, engine.brushSize, engine.brushOpacity, refreshTrigger) {
                if (cfg.paramId == 1) {
                    engine.brushSize.coerceIn(cfg.minVal, cfg.maxVal)
                } else if (cfg.paramId == 2) {
                    (engine.brushOpacity * 100f).coerceIn(cfg.minVal, cfg.maxVal)
                } else {
                    engine.getPresetParam(cfg.paramId).toFloat().coerceIn(cfg.minVal, cfg.maxVal)
                }
            }

            // Property name and current value stay inside the slider. Tap to change property; drag to adjust.
            val norm = ((currentRawVal - cfg.minVal) / (cfg.maxVal - cfg.minVal)).coerceIn(0f, 1f)
            VerticalThumbBar(
                value = norm,
                label = "${cfg.shortLabel} ${currentRawVal.toInt()}${cfg.unit}",
                onClick = { editingSliderIndex = index },
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
        if (configuredParamIds.size < 4) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f),
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .clickable {
                        // Add next unassigned parameter
                        val next = AVAILABLE_SLIDER_PARAMS.firstOrNull { it.paramId !in configuredParamIds }
                            ?: AVAILABLE_SLIDER_PARAMS[4] // Smoothing
                        val newList = configuredParamIds + next.paramId
                        onConfiguredParamsChange(newList)
                    }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = "Adicionar Slider Lateral",
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }

    // Modal Dialog to Select Property for the Tapped Slider
    editingSliderIndex?.let { editIdx ->
        val currentParamId = configuredParamIds.getOrNull(editIdx) ?: 1

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

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(AVAILABLE_SLIDER_PARAMS) { opt ->
                            val isSelected = opt.paramId == currentParamId
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        val mutable = configuredParamIds.toMutableList()
                                        if (editIdx < mutable.size) {
                                            mutable[editIdx] = opt.paramId
                                        }
                                        onConfiguredParamsChange(mutable)
                                        editingSliderIndex = null
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
                                            text = "Faixa: ${opt.minVal.toInt()} a ${opt.maxVal.toInt()}${opt.unit}",
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

                    // Remove option if more than 1 slider
                    if (configuredParamIds.size > 1) {
                        Spacer(modifier = Modifier.height(8.dp))
                        TextButton(
                            onClick = {
                                val mutable = configuredParamIds.toMutableList()
                                if (editIdx < mutable.size) {
                                    mutable.removeAt(editIdx)
                                }
                                onConfiguredParamsChange(mutable)
                                editingSliderIndex = null
                            },
                            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        ) {
                            Text("Remover este Slider", fontSize = 12.sp)
                        }
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
            .width(42.dp)
            .height(115.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0x35000000))
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
                .background(Color(0x8064B5F6))
        )

        // Center pill handle & label
        Text(
            text = label,
            fontSize = 8.sp,
            color = Color.White,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(2.dp)
        )
    }
}
