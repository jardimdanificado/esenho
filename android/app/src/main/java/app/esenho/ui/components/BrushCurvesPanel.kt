package app.esenho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.esenho.nativeengine.*
import java.util.UUID
import kotlin.math.ln
import kotlin.math.roundToInt

private val CURVE_INPUTS = listOf(
    "pressure" to "Pressão", "speed" to "Velocidade", "distance" to "Distância do traço",
    "time" to "Tempo do traço", "tilt" to "Inclinação da caneta", "direction" to "Direção do traço", "noise" to "Ruído contínuo",
)
private val CURVE_INTERPOLATIONS = listOf("smooth" to "Suave", "linear" to "Linear", "steps" to "Patamares")

internal fun curveTarget(engine: EsenhoEngine, config: SliderParamConfig): BrushCurveTarget {
    val choice = config.kind == QuickParameterKind.CHOICE
    val minimum = if (choice) 0f else if (config.paramId == -1003) ln(.5f) else config.minVal
    val maximum = if (choice) config.options.lastIndex.toFloat().coerceAtLeast(1f) else if (config.paramId == -1003) ln(50f) else config.maxVal
    return BrushCurveTarget(config.paramId, config.name, minimum, maximum, config.kind.name.lowercase(),
        config.options.map { it.first }, BrushParameterScope.owner(engine.selectedBrush?.id, config.paramId))
}

@Composable
internal fun BrushCurveLinkButton(engine: EsenhoEngine, config: SliderParamConfig, onChanged: () -> Unit) {
    val target = curveTarget(engine, config)
    if (!engine.supportsCurveTarget(target)) return
    var open by remember(engine.selectedPreset?.id, engine.selectedBrush?.id, config.paramId) { mutableStateOf(false) }
    val bound = engine.brushCurves.bindings.any { it.target.id == config.paramId && it.enabled && engine.supportsCurveTarget(it.target) }
    IconButton(onClick = { open = true }, modifier = Modifier.size(32.dp)) {
        Icon(Icons.AutoMirrored.Filled.ShowChart, "Curva de ${config.name}", Modifier.size(18.dp),
            tint = if (bound) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (open) CurveWindow("Curvas do pincel", { open = false }) {
        BrushCurvesPanel(engine, onChanged, config.paramId)
    }
}

@Composable
private fun CurveWindow(title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val height = (LocalConfiguration.current.screenHeightDp - 64).coerceAtLeast(240).dp
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth(.96f).widthIn(max = 640.dp).heightIn(max = height), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Close, "Fechar") }
                }
                content()
            }
        }
    }
}

@Composable
fun BrushCurvesPanel(engine: EsenhoEngine, onChanged: () -> Unit, focusParameter: Int? = null) {
    val key = engine.selectedPreset?.let { "preset:${it.id}" } ?: engine.selectedBrush?.let { "brush:${it.id}" } ?: "classic"
    var version by remember(key) { mutableIntStateOf(0) }
    val libraryRevision = engine.brushCurves.revision + version
    val configs = availableSliderParameters(engine).filter { engine.supportsCurveTarget(curveTarget(engine, it)) }
    if (configs.isEmpty()) return
    var parameterId by remember(key, focusParameter) { mutableIntStateOf(focusParameter ?: configs.first().paramId) }
    val config = configs.firstOrNull { it.paramId == parameterId } ?: configs.first()
    val target = curveTarget(engine, config)
    val existing = engine.brushCurves.bindings.firstOrNull { it.target.id == target.id && engine.supportsCurveTarget(it.target) }
    val curves = remember(key, libraryRevision) { engine.brushCurves.curves }
    var curveId by remember(key, parameterId) { mutableStateOf(existing?.curveId ?: curves.firstOrNull()?.id.orEmpty()) }
    var input by remember(key, parameterId) { mutableStateOf(existing?.input ?: "pressure") }
    var scale by remember(key, parameterId) { mutableFloatStateOf(existing?.scale ?: 200f) }
    var repeat by remember(key, parameterId) { mutableStateOf(existing?.repeat ?: false) }
    val base = engine.curveParameterBase(target)
    val normalizedBase = ((base - target.min) / (target.max - target.min)).coerceIn(0f, 1f)
    val zero = ((0f-target.min)/(target.max-target.min)).coerceIn(0f, 1f)
    var low by remember(key, parameterId) { mutableFloatStateOf(existing?.low ?: if (base < 0) normalizedBase else zero) }
    var high by remember(key, parameterId) { mutableFloatStateOf(existing?.high ?: if (target.kind != "slider" || base == 0f) 1f else if (base < 0) zero else normalizedBase) }
    var editor by remember { mutableStateOf<SavedBrushCurve?>(null) }
    var editorIsCopy by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<SavedBrushCurve?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    fun updated(ok: Boolean) {
        message = if (ok) null else "Não foi possível salvar. Verifique o nome da curva e tente novamente."
        if (ok) { version++; onChanged() }
    }
    val selectedCurve = curves.firstOrNull { it.id == curveId }
    LaunchedEffect(curves.map { it.id }) {
        if (curves.none { it.id == curveId }) curveId = curves.firstOrNull()?.id.orEmpty()
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Biblioteca de curvas", style = MaterialTheme.typography.titleSmall)
        Text("Salve uma forma e reutilize em qualquer parâmetro compatível. Os vínculos pertencem a este brush e as mudanças valem no próximo traço.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        CompactOptionDropdown("Curva salva", curveId, curves.map { it.id to it.name }) { curveId = it }
        selectedCurve?.let { CurvePreview(it, Modifier.fillMaxWidth().height(90.dp)) }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = {
                editor = SavedBrushCurve("curve_user_${UUID.randomUUID()}", "Nova curva ${curves.count { !it.builtin } + 1}", listOf(0f to 0f, 1f to 1f))
                editorIsCopy = false
            }) { Text("Nova") }
            TextButton(enabled = selectedCurve != null, onClick = {
                editor = selectedCurve
                editorIsCopy = selectedCurve?.builtin == true
            }) { Text(if (selectedCurve?.builtin == true) "Criar a partir" else "Editar") }
            TextButton(enabled = selectedCurve != null, onClick = { editor = selectedCurve; editorIsCopy = true }) { Text("Duplicar") }
            IconButton(enabled = selectedCurve != null && !selectedCurve.builtin, onClick = { deleting = selectedCurve }) {
                Icon(Icons.Default.Delete, "Excluir curva salva")
            }
        }
        HorizontalDivider()
        Text("Vincular ao brush atual", style = MaterialTheme.typography.titleSmall)
        Text("O valor base permanece salvo. Os limites de saída definem o valor durante o traço.", style = MaterialTheme.typography.bodySmall)
        CompactOptionDropdown("Parâmetro", parameterId.toString(), configs.map { it.paramId.toString() to it.name }) { parameterId = it.toInt() }
        CompactOptionDropdown("Entrada", input, CURVE_INPUTS) {
            input = it
            scale = when (it) { "speed" -> 800f; "time" -> 2f; "noise" -> 60f; else -> 200f }
            repeat = it in setOf("time", "distance")
        }
        if (input in setOf("speed", "distance", "time", "noise")) {
            val range = when (input) { "speed" -> 50f..4000f; "time" -> .1f..20f; "noise" -> 5f..500f; else -> 10f..2000f }
            val label = when (input) { "speed" -> "Velocidade para chegar a 100%"; "time" -> "Duração do ciclo"; "noise" -> "Comprimento do ruído"; else -> "Distância do ciclo" }
            val unit = when (input) { "speed" -> "px/s"; "time" -> "s"; else -> "px" }
            Text("$label: ${formatCurveNumber(scale)} $unit", style = MaterialTheme.typography.labelMedium)
            Slider(scale.coerceIn(range.start, range.endInclusive), { scale = it }, valueRange = range)
        }
        if (input in setOf("time", "distance")) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Repetir o ciclo", Modifier.weight(1f)); Switch(repeat, { repeat = it })
            }
            if (input == "time") Text(if (engine.usesContinuousBrush)
                "Pincéis contínuos precisam de uma taxa de marcas por segundo acima de zero para pintar parados."
                else "Para pintar parado, ative Acumular Tinta em Dinâmica.", style = MaterialTheme.typography.bodySmall)
        }
        fun outputLabel(value: Float): String {
            val actual = target.min + (target.max - target.min) * value
            return if (target.kind == "choice") config.options.getOrNull(actual.roundToInt())?.second.orEmpty()
                else if (target.kind == "switch") if (actual >= .5f) "Ligado" else "Desligado"
                else "${formatCurveNumber(actual)} ${config.unit}".trim()
        }
        Text("Saída mínima: ${outputLabel(low)}", style = MaterialTheme.typography.labelMedium)
        Slider(low, { low = it.coerceAtMost(high) }, valueRange = 0f..1f)
        Text("Saída máxima: ${outputLabel(high)}", style = MaterialTheme.typography.labelMedium)
        Slider(high, { high = it.coerceAtLeast(low) }, valueRange = 0f..1f)
        FilledTonalButton(enabled = selectedCurve != null, onClick = {
            updated(engine.brushCurves.bind(BrushParameterCurve(target, curveId, input, scale, repeat, low, high)))
        }) { Text(if (existing == null) "Aplicar curva" else "Atualizar vínculo") }
        if (target.kind != "slider") Text("Seletores e interruptores usam a saída da curva para alternar entre seus estados.", style = MaterialTheme.typography.bodySmall)
        if (engine.brushCurves.bindings.isNotEmpty()) {
            HorizontalDivider()
            Text("Vínculos deste brush", style = MaterialTheme.typography.titleSmall)
            engine.brushCurves.bindings.forEach { binding ->
                val name = configs.firstOrNull { it.paramId == binding.target.id }?.name ?: binding.target.name
                val supported = engine.supportsCurveTarget(binding.target)
                Row(Modifier.fillMaxWidth().clickable(enabled = supported) { parameterId = binding.target.id }, verticalAlignment = Alignment.CenterVertically) {
                    Text("$name · ${curves.firstOrNull { it.id == binding.curveId }?.name ?: "Curva ausente"} · ${CURVE_INPUTS.firstOrNull { it.first == binding.input }?.second.orEmpty()}",
                        Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    Switch(binding.enabled, { updated(engine.brushCurves.bind(binding.copy(enabled = it))) },
                        enabled = supported && curves.any { it.id == binding.curveId })
                    IconButton(onClick = { updated(engine.brushCurves.unbind(binding.target.id)) }) { Icon(Icons.Default.Close, "Remover vínculo de $name") }
                }
                if (!supported) Text("Parâmetro indisponível neste motor ou versão do brush.", style = MaterialTheme.typography.bodySmall)
            }
        }
        message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
    editor?.let { curve ->
        val copy = editorIsCopy || curve.builtin
        CurveEditorDialog(curve, copy, onDismiss = { editor = null }) { saved ->
            val ok = engine.brushCurves.save(saved)
            updated(ok)
            if (ok) { curveId = saved.id; editor = null }
            ok
        }
    }
    deleting?.let { curve ->
        AlertDialog(onDismissRequest = { deleting = null }, title = { Text("Excluir ${curve.name}?") },
            text = { Text("A curva e seus vínculos salvos serão removidos. Os valores base dos brushes serão preservados.") },
            confirmButton = { TextButton(onClick = {
                updated(engine.brushCurves.delete(curve.id, engine.presetCatalog.associate { "preset:${it.id}" to it.curveBindings }))
                deleting = null
            }) { Text("Excluir") } }, dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancelar") } })
    }
}

private fun formatCurveNumber(value: Float): String = java.lang.String.format(java.util.Locale.US, "%.2f", value).trimEnd('0').trimEnd('.')

@Composable
private fun CurvePreview(curve: SavedBrushCurve, modifier: Modifier) {
    val color = MaterialTheme.colorScheme.primary
    Canvas(modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))) {
        val pad = 12.dp.toPx(); val w = size.width-2*pad; val h = size.height-2*pad
        for (i in 0..4) {
            drawLine(Color.Gray.copy(alpha = .25f), Offset(pad+w*i/4, pad), Offset(pad+w*i/4, pad+h))
            drawLine(Color.Gray.copy(alpha = .25f), Offset(pad, pad+h*i/4), Offset(pad+w, pad+h*i/4))
        }
        val path = Path()
        for (i in 0..160) {
            val x = i/160f; val y = curve.evaluator.valueAt(x)
            if (i == 0) path.moveTo(pad+x*w, pad+(1-y)*h) else path.lineTo(pad+x*w, pad+(1-y)*h)
        }
        drawPath(path, color, style = Stroke(2.dp.toPx()))
    }
}

@Composable
private fun CurveEditorDialog(source: SavedBrushCurve, copy: Boolean, onDismiss: () -> Unit, onSave: (SavedBrushCurve) -> Boolean) {
    var name by remember(source.id) { mutableStateOf(if (copy) "${source.name} — cópia" else source.name) }
    var interpolation by remember(source.id) { mutableStateOf(source.interpolation) }
    val points = remember(source.id) { mutableStateListOf<Pair<Float, Float>>().apply { addAll(source.points) } }
    var selected by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    val color = MaterialTheme.colorScheme.primary
    val selectedColor = MaterialTheme.colorScheme.tertiary
    val id = remember(source.id, copy) { if (copy) "curve_user_${UUID.randomUUID()}" else source.id }
    val preview = SavedBrushCurve(id, name.ifBlank { "Curva" }, points.toList(), interpolation)
    CurveWindow(if (copy) "Criar curva a partir de ${source.name}" else "Editar curva", onDismiss) {
        OutlinedTextField(name, { name = it.take(64) }, label = { Text("Nome da curva") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        CompactOptionDropdown("Interpolação", interpolation, CURVE_INTERPOLATIONS) { interpolation = it }
        Text("Arraste os pontos. Toque no gráfico para adicionar ou selecionar um ponto. Os extremos mantêm a posição horizontal.", style = MaterialTheme.typography.bodySmall)
        Canvas(Modifier.fillMaxWidth().height(210.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
            .semantics { contentDescription = "Editor de curva com ${points.size} pontos; entrada e saída de zero a cem por cento" }
            .pointerInput(source.id) {
                val pad = 12.dp.toPx()
                fun position(point: Pair<Float, Float>) = Offset(pad+point.first*(size.width-2*pad), pad+(1-point.second)*(size.height-2*pad))
                detectTapGestures { pos ->
                    val nearest = points.indices.minByOrNull { (position(points[it])-pos).getDistanceSquared() } ?: 0
                    if ((position(points[nearest])-pos).getDistance() < 24.dp.toPx()) selected = nearest
                    else if (points.size < 32) {
                        val x = ((pos.x-pad)/(size.width-2*pad)).coerceIn(.005f, .995f)
                        if (points.none { kotlin.math.abs(it.first-x) < .005f }) {
                            val y = (1-(pos.y-pad)/(size.height-2*pad)).coerceIn(0f, 1f)
                            val index = points.indexOfFirst { it.first > x }.coerceAtLeast(1)
                            points.add(index, x to y); selected = index
                        }
                    }
                }
            }.pointerInput(source.id) {
                val pad = 12.dp.toPx()
                detectDragGestures(onDragStart = { pos ->
                    selected = points.indices.minByOrNull { i ->
                        (Offset(pad+points[i].first*(size.width-2*pad), pad+(1-points[i].second)*(size.height-2*pad))-pos).getDistanceSquared()
                    } ?: 0
                }) { change, _ ->
                    change.consume()
                    val i = selected.coerceIn(points.indices)
                    val x = when (i) {
                        0 -> 0f; points.lastIndex -> 1f
                        else -> ((change.position.x-pad)/(size.width-2*pad)).coerceIn(points[i-1].first+.001f, points[i+1].first-.001f)
                    }
                    val y = (1-(change.position.y-pad)/(size.height-2*pad)).coerceIn(0f, 1f)
                    points[i] = x to y
                }
            }) {
            val pad = 12.dp.toPx(); val w = size.width-2*pad; val h = size.height-2*pad
            for (i in 0..4) {
                drawLine(Color.Gray.copy(alpha = .3f), Offset(pad+w*i/4, pad), Offset(pad+w*i/4, pad+h))
                drawLine(Color.Gray.copy(alpha = .3f), Offset(pad, pad+h*i/4), Offset(pad+w, pad+h*i/4))
            }
            val path = Path()
            for (i in 0..160) {
                val x = i/160f; val y = preview.evaluator.valueAt(x)
                if (i == 0) path.moveTo(pad+x*w, pad+(1-y)*h) else path.lineTo(pad+x*w, pad+(1-y)*h)
            }
            drawPath(path, color, style = Stroke(2.dp.toPx()))
            points.forEachIndexed { i, p -> drawCircle(if (i == selected) selectedColor else color, 6.dp.toPx(), Offset(pad+p.first*w, pad+(1-p.second)*h)) }
        }
        Row {
            TextButton(enabled = points.size < 32, onClick = {
                val i = (0 until points.lastIndex).maxByOrNull { points[it+1].first-points[it].first } ?: 0
                val x = (points[i].first+points[i+1].first)/2
                points.add(i+1, x to preview.evaluator.valueAt(x)); selected = i+1
            }) { Text("Adicionar ponto") }
            TextButton(enabled = selected > 0 && selected < points.lastIndex, onClick = { points.removeAt(selected); selected = (selected-1).coerceAtLeast(0) }) { Text("Remover ponto") }
        }
        if (!copy) Text("Editar uma curva salva atualiza todos os vínculos que a usam.", style = MaterialTheme.typography.bodySmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        FilledTonalButton(enabled = name.isNotBlank(), onClick = {
            if (!onSave(SavedBrushCurve(id, name.trim(), points.toList(), interpolation))) error = "Não foi possível salvar. Use um nome diferente e tente novamente."
        }) { Text(if (copy) "Salvar cópia na biblioteca" else "Salvar na biblioteca") }
    }
}
