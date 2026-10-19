package app.esenho.ui.components

import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.ColorPaletteModel
import app.esenho.nativeengine.EsenhoEngine
import kotlin.math.*

@Composable
fun ColorStudioModal(
    engine: EsenhoEngine? = null,
    initialColor: Int,
    recentColors: List<Int>,
    onColorChanged: (Int) -> Unit,
    onDismiss: () -> Unit,
    embedded: Boolean = false,
) {
    val hsv = remember { FloatArray(3).also { AndroidColor.colorToHSV(initialColor, it) } }
    var hue by remember { mutableFloatStateOf(hsv[0]) }
    var sat by remember { mutableFloatStateOf(hsv[1]) }
    var value by remember { mutableFloatStateOf(hsv[2]) }
    val current = AndroidColor.HSVToColor(floatArrayOf(hue, sat, value))
    fun emit(h: Float = hue, s: Float = sat, v: Float = value) {
        hue = h
        sat = s
        value = v
        onColorChanged(AndroidColor.HSVToColor(floatArrayOf(h, s, v)))
    }
    fun select(color: Int) {
        val sample = FloatArray(3).also { AndroidColor.colorToHSV(color, it) }
        emit(if (sample[1] == 0f) hue else sample[0], sample[1], sample[2])
    }
    LaunchedEffect(initialColor) { if (initialColor != current) select(initialColor) }
    var mode by remember { mutableIntStateOf(0) }
    var modesOpen by remember { mutableStateOf(false) }
    var hexOpen by remember { mutableStateOf(false) }
    var hex by remember { mutableStateOf("") }
    var recent by remember { mutableStateOf(false) }
    var paletteVersion by remember { mutableIntStateOf(0) }
    val palettes =
        remember(paletteVersion) { engine?.palettes ?: ColorPaletteModel.getDefaultPalettes() }
    var paletteId by remember {
        mutableStateOf(engine?.activePaletteId ?: palettes.firstOrNull()?.id)
    }
    val palette = palettes.find { it.id == paletteId } ?: palettes.firstOrNull()
    var paletteMenu by remember { mutableStateOf(false) }
    var actions by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf(false) }
    var newPalette by remember { mutableStateOf(false) }
    var paletteName by remember { mutableStateOf("") }
    var paletteError by remember { mutableStateOf<String?>(null) }
    var deletePalette by remember { mutableStateOf(false) }
    val modes = listOf("HSV", "Roda", "RGB")
    WorkspaceDialogContainer(embedded, onDismiss) {
        Surface(modifier = if (embedded) Modifier.fillMaxSize() else Modifier.width(320.dp)) {
            Column(
                Modifier.verticalScroll(rememberScrollState())
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth().height(28.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Cores", Modifier.weight(1f), style = MaterialTheme.typography.labelMedium)
                    Box {
                        TextButton(
                            { modesOpen = true },
                            Modifier.height(28.dp),
                            contentPadding = PaddingValues(horizontal = 4.dp),
                        ) {
                            Text(modes[mode], style = MaterialTheme.typography.labelSmall)
                            Icon(Icons.Default.ExpandMore, null, Modifier.size(14.dp))
                        }
                        DropdownMenu(modesOpen, { modesOpen = false }) {
                            modes.forEachIndexed { index, name ->
                                DropdownMenuItem(
                                    text = { Text(name) },
                                    onClick = {
                                        mode = index
                                        modesOpen = false
                                    },
                                )
                            }
                        }
                    }
                    TextButton(
                        {
                            hex = "%06X".format(current and 0xFFFFFF)
                            hexOpen = true
                        },
                        Modifier.height(28.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp),
                    ) {
                        Box(
                            Modifier.size(14.dp)
                                .background(Color(current), RoundedCornerShape(3.dp))
                                .border(
                                    1.dp,
                                    MaterialTheme.colorScheme.outline,
                                    RoundedCornerShape(3.dp),
                                )
                        )
                        Text(
                            " #%06X".format(current and 0xFFFFFF),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    IconButton(onDismiss, Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, "Fechar cores", Modifier.size(16.dp))
                    }
                }
                when (mode) {
                    0 ->
                        Row(
                            Modifier.fillMaxWidth().height(100.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            SaturationValuePlane(
                                hue,
                                sat,
                                value,
                                { s, v -> emit(s = s, v = v) },
                                Modifier.weight(1f).fillMaxHeight(),
                            )
                            ColorTrack(
                                hue / 360f,
                                listOf(
                                    Color.Red,
                                    Color.Yellow,
                                    Color.Green,
                                    Color.Cyan,
                                    Color.Blue,
                                    Color.Magenta,
                                    Color.Red,
                                ),
                                { emit(h = it * 359.999f) },
                                "Matiz",
                                Modifier.width(24.dp).fillMaxHeight(),
                                vertical = true,
                            )
                        }
                    1 ->
                        Row(
                            Modifier.fillMaxWidth().height(100.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            HsvColorWheel(
                                hue,
                                sat,
                                value,
                                { emit(h = it) },
                                { s, v -> emit(s = s, v = v) },
                                Modifier.size(100.dp),
                            )
                            Column(
                                Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text("Saturação", style = MaterialTheme.typography.labelSmall)
                                ColorTrack(
                                    sat,
                                    listOf(
                                        Color.White,
                                        Color(AndroidColor.HSVToColor(floatArrayOf(hue, 1f, 1f))),
                                    ),
                                    { emit(s = it) },
                                    "Saturação",
                                    Modifier.fillMaxWidth().height(24.dp),
                                )
                                Text("Valor", style = MaterialTheme.typography.labelSmall)
                                ColorTrack(
                                    value,
                                    listOf(
                                        Color.Black,
                                        Color(AndroidColor.HSVToColor(floatArrayOf(hue, sat, 1f))),
                                    ),
                                    { emit(v = it) },
                                    "Valor",
                                    Modifier.fillMaxWidth().height(24.dp),
                                )
                            }
                        }
                    else ->
                        Column(
                            Modifier.fillMaxWidth().height(100.dp),
                            verticalArrangement = Arrangement.SpaceEvenly,
                        ) {
                            val channels =
                                listOf(
                                    AndroidColor.red(current),
                                    AndroidColor.green(current),
                                    AndroidColor.blue(current),
                                )
                            listOf("R", "G", "B").forEachIndexed { channel, label ->
                                fun rgb(amount: Int): Int {
                                    val c = channels.toMutableList()
                                    c[channel] = amount
                                    return AndroidColor.rgb(c[0], c[1], c[2])
                                }
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        label,
                                        Modifier.width(12.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                    ColorTrack(
                                        channels[channel] / 255f,
                                        listOf(Color(rgb(0)), Color(rgb(255))),
                                        { select(rgb((it * 255).roundToInt())) },
                                        label,
                                        Modifier.weight(1f).height(26.dp),
                                    )
                                    Text(
                                        channels[channel].toString(),
                                        Modifier.width(26.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                }
                            }
                        }
                }
                Row(
                    Modifier.fillMaxWidth().height(26.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (recent) "Recentes" else "Paleta",
                        Modifier.clip(RoundedCornerShape(4.dp))
                            .clickable {
                                recent = !recent
                                removing = false
                            }
                            .padding(horizontal = 4.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Box(Modifier.weight(1f)) {
                        if (!recent) {
                            Row(
                                Modifier.fillMaxWidth()
                                    .clickable { paletteMenu = true }
                                    .padding(horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    palette?.name ?: "Selecionar",
                                    Modifier.weight(1f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                                Icon(
                                    Icons.Default.ExpandMore,
                                    "Escolher paleta",
                                    Modifier.size(14.dp),
                                )
                            }
                            DropdownMenu(paletteMenu, { paletteMenu = false }) {
                                palettes.forEach { p ->
                                    DropdownMenuItem(
                                        text = { Text(p.name) },
                                        onClick = {
                                            paletteId = p.id
                                            engine?.activePaletteId = p.id
                                            paletteMenu = false
                                            removing = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                    Box {
                        IconButton({ actions = true }, Modifier.size(26.dp)) {
                            Icon(Icons.Default.MoreVert, "Opções de cores", Modifier.size(16.dp))
                        }
                        DropdownMenu(actions, { actions = false }) {
                            DropdownMenuItem(
                                text = {
                                    Text(if (recent) "Mostrar paleta" else "Mostrar recentes")
                                },
                                onClick = {
                                    recent = !recent
                                    removing = false
                                    actions = false
                                },
                            )
                            if (engine != null) {
                                DropdownMenuItem(
                                    text = { Text("Nova paleta") },
                                    onClick = {
                                        paletteName = ""
                                        paletteError = null
                                        newPalette = true
                                        actions = false
                                    },
                                )
                                if (palette != null && !palette.isBuiltIn) {
                                    DropdownMenuItem(
                                        text = { Text("Adicionar cor atual") },
                                        onClick = {
                                            engine.addColorToPalette(palette.id, current)
                                            paletteVersion++
                                            recent = false
                                            actions = false
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                if (removing) "Concluir remoção"
                                                else "Remover cores…"
                                            )
                                        },
                                        onClick = {
                                            removing = !removing
                                            recent = false
                                            actions = false
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Excluir paleta…") },
                                        onClick = {
                                            deletePalette = true
                                            actions = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
                val colors = if (recent) recentColors else palette?.colors.orEmpty()
                if (colors.isEmpty())
                    Text(
                        if (recent) "Nenhuma cor recente"
                        else "Paleta vazia · adicione cores pelo menu",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.height(28.dp),
                    )
                else
                    LazyRow(
                        Modifier.fillMaxWidth().height(28.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        itemsIndexed(colors) { index, color ->
                            Box(
                                Modifier.size(28.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color(color))
                                    .border(
                                        if (color == current) 2.dp else 1.dp,
                                        if (color == current) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.outline,
                                        RoundedCornerShape(4.dp),
                                    )
                                    .clickable {
                                        if (
                                            removing &&
                                                !recent &&
                                                palette != null &&
                                                !palette.isBuiltIn
                                        ) {
                                            engine?.removeColorFromPalette(palette.id, index)
                                            paletteVersion++
                                        } else select(color)
                                    }
                                    .semantics {
                                        contentDescription =
                                            if (removing)
                                                "Remover cor %06X".format(color and 0xFFFFFF)
                                            else "Selecionar cor %06X".format(color and 0xFFFFFF)
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                if (removing)
                                    Icon(
                                        Icons.Default.Close,
                                        "Remover",
                                        Modifier.size(18.dp),
                                        tint = Color.White,
                                    )
                            }
                        }
                    }
            }
        }
    }
    if (hexOpen) {
        val parsed =
            hex.removePrefix("#")
                .takeIf { it.length == 6 }
                ?.toIntOrNull(16)
                ?.let { it or 0xFF000000.toInt() }
        AlertDialog(
            onDismissRequest = { hexOpen = false },
            title = { Text("Cor hexadecimal") },
            text = {
                OutlinedTextField(
                    hex,
                    { hex = it.filter { c -> c in "0123456789abcdefABCDEF#" }.take(7) },
                    singleLine = true,
                    label = { Text("#RRGGBB") },
                    isError = parsed == null,
                )
            },
            confirmButton = {
                TextButton(
                    {
                        parsed?.let {
                            select(it)
                            hexOpen = false
                        }
                    },
                    enabled = parsed != null,
                ) {
                    Text("Aplicar")
                }
            },
            dismissButton = { TextButton({ hexOpen = false }) { Text("Cancelar") } },
        )
    }
    if (newPalette)
        AlertDialog(
            onDismissRequest = { newPalette = false },
            title = { Text("Nova paleta") },
            text = {
                OutlinedTextField(
                    paletteName,
                    {
                        paletteName = it
                        paletteError = null
                    },
                    label = { Text("Nome") },
                    singleLine = true,
                    isError = paletteError != null,
                    supportingText = { paletteError?.let { Text(it) } },
                )
            },
            confirmButton = {
                TextButton({
                    try {
                        if (paletteName.isBlank()) paletteError = "Informe um nome"
                        else {
                            engine?.createCustomPalette(paletteName.trim())?.let {
                                paletteId = it.id
                            }
                            paletteVersion++
                            recent = false
                            newPalette = false
                        }
                    } catch (e: Exception) {
                        paletteError = e.message ?: "Erro ao criar paleta"
                    }
                }) {
                    Text("Criar")
                }
            },
            dismissButton = { TextButton({ newPalette = false }) { Text("Cancelar") } },
        )
    if (deletePalette && palette != null && !palette.isBuiltIn)
        AlertDialog(
            onDismissRequest = { deletePalette = false },
            title = { Text("Excluir paleta?") },
            text = { Text("Excluir “${palette.name}” e suas cores salvas?") },
            confirmButton = {
                TextButton({
                    engine?.deletePalette(palette.id)
                    paletteId = engine?.activePaletteId
                    paletteVersion++
                    deletePalette = false
                    removing = false
                }) {
                    Text("Excluir")
                }
            },
            dismissButton = { TextButton({ deletePalette = false }) { Text("Cancelar") } },
        )
}

@Composable
private fun ColorTrack(
    value: Float,
    colors: List<Color>,
    onChange: (Float) -> Unit,
    label: String,
    modifier: Modifier,
    vertical: Boolean = false,
) {
    val change by rememberUpdatedState(onChange)
    Canvas(
        modifier
            .clip(RoundedCornerShape(4.dp))
            .semantics { contentDescription = label }
            .pointerInput(vertical) {
                detectTapGestures {
                    change(
                        (if (vertical) it.y / size.height else it.x / size.width).coerceIn(0f, 1f)
                    )
                }
            }
            .pointerInput(vertical) {
                detectDragGestures(
                    onDragStart = {
                        change(
                            (if (vertical) it.y / size.height else it.x / size.width).coerceIn(
                                0f,
                                1f,
                            )
                        )
                    }
                ) { p, _ ->
                    p.consume()
                    change(
                        (if (vertical) p.position.y / size.height else p.position.x / size.width)
                            .coerceIn(0f, 1f)
                    )
                }
            }
    ) {
        drawRect(if (vertical) Brush.verticalGradient(colors) else Brush.horizontalGradient(colors))
        val pos = value.coerceIn(0f, 1f)
        if (vertical) {
            val y = (pos * size.height).coerceIn(2.dp.toPx(), size.height - 2.dp.toPx())
            drawLine(Color.Black, Offset(0f, y), Offset(size.width, y), 4.dp.toPx())
            drawLine(Color.White, Offset(0f, y), Offset(size.width, y), 2.dp.toPx())
        } else {
            val x = (pos * size.width).coerceIn(2.dp.toPx(), size.width - 2.dp.toPx())
            drawLine(Color.Black, Offset(x, 0f), Offset(x, size.height), 4.dp.toPx())
            drawLine(Color.White, Offset(x, 0f), Offset(x, size.height), 2.dp.toPx())
        }
    }
}

@Composable
private fun SaturationValuePlane(
    hue: Float,
    sat: Float,
    value: Float,
    onChange: (Float, Float) -> Unit,
    modifier: Modifier,
) {
    val change by rememberUpdatedState(onChange)
    Canvas(
        modifier
            .clip(RoundedCornerShape(4.dp))
            .semantics { contentDescription = "Saturação e valor" }
            .pointerInput(Unit) {
                detectTapGestures {
                    change(
                        (it.x / size.width).coerceIn(0f, 1f),
                        (1f - it.y / size.height).coerceIn(0f, 1f),
                    )
                }
            }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = {
                        change(
                            (it.x / size.width).coerceIn(0f, 1f),
                            (1f - it.y / size.height).coerceIn(0f, 1f),
                        )
                    }
                ) { p, _ ->
                    p.consume()
                    change(
                        (p.position.x / size.width).coerceIn(0f, 1f),
                        (1f - p.position.y / size.height).coerceIn(0f, 1f),
                    )
                }
            }
    ) {
        drawRect(
            Brush.horizontalGradient(
                listOf(Color.White, Color(AndroidColor.HSVToColor(floatArrayOf(hue, 1f, 1f))))
            )
        )
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
        val point = Offset(sat * size.width, (1f - value) * size.height)
        drawCircle(Color.Black, 5.dp.toPx(), point, style = Stroke(3.dp.toPx()))
        drawCircle(Color.White, 5.dp.toPx(), point, style = Stroke(1.5.dp.toPx()))
    }
}

@Composable
fun HsvColorWheel(
    hue: Float,
    sat: Float,
    value: Float,
    onHueChange: (Float) -> Unit,
    onSatValChange: (Float, Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val hueChange by rememberUpdatedState(onHueChange)
    val svChange by rememberUpdatedState(onSatValChange)
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(
            modifier =
                Modifier.fillMaxSize()
                    .pointerInput(Unit) {
                        fun processPoint(offset: Offset) {
                            val center = Offset(size.width / 2f, size.height / 2f)
                            val dx = offset.x - center.x
                            val dy = offset.y - center.y
                            val dist = hypot(dx, dy)
                            val outerR = size.width / 2f
                            val innerR = outerR * 0.72f

                            if (dist >= innerR && dist <= outerR) {
                                // Touch on Outer Hue Ring
                                var angle =
                                    Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
                                if (angle < 0) angle += 360f
                                hueChange(angle)
                            } else if (dist < innerR) {
                                // Touch on Inner Saturation/Value Box
                                val boxSize = innerR * 1.30f
                                val sx = ((dx / boxSize) + 0.5f).coerceIn(0f, 1f)
                                val sy = (1f - ((dy / boxSize) + 0.5f)).coerceIn(0f, 1f)
                                svChange(sx, sy)
                            }
                        }

                        detectTapGestures { offset -> processPoint(offset) }
                    }
                    .pointerInput(Unit) {
                        detectDragGestures { change, _ ->
                            change.consume()
                            val center = Offset(size.width / 2f, size.height / 2f)
                            val dx = change.position.x - center.x
                            val dy = change.position.y - center.y
                            val dist = hypot(dx, dy)
                            val outerR = size.width / 2f
                            val innerR = outerR * 0.72f

                            if (dist >= innerR) {
                                var angle =
                                    Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
                                if (angle < 0) angle += 360f
                                hueChange(angle)
                            } else {
                                val boxSize = innerR * 1.30f
                                val sx = ((dx / boxSize) + 0.5f).coerceIn(0f, 1f)
                                val sy = (1f - ((dy / boxSize) + 0.5f)).coerceIn(0f, 1f)
                                svChange(sx, sy)
                            }
                        }
                    }
        ) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val outerR = size.width / 2f
            val innerR = outerR * 0.72f
            val strokeW = outerR - innerR

            // 1. Draw Hue Ring with gradient sweep
            val sweepColors =
                listOf(
                    Color.Red,
                    Color.Yellow,
                    Color.Green,
                    Color.Cyan,
                    Color.Blue,
                    Color.Magenta,
                    Color.Red,
                )
            drawCircle(
                brush = Brush.sweepGradient(sweepColors, center),
                radius = (outerR + innerR) / 2f,
                style = Stroke(width = strokeW),
            )

            // 2. Draw Hue Indicator Marker on the Ring
            val hueRad = Math.toRadians(hue.toDouble())
            val markerR = (outerR + innerR) / 2f
            val mx = center.x + (markerR * cos(hueRad)).toFloat()
            val my = center.y + (markerR * sin(hueRad)).toFloat()
            drawCircle(Color.White, radius = 7f, center = Offset(mx, my))
            drawCircle(Color.Black, radius = 5f, center = Offset(mx, my))

            // 3. Draw Center Sat/Val gradient preview
            val boxR = innerR * 0.65f
            val pureHueColor = Color(AndroidColor.HSVToColor(floatArrayOf(hue, 1f, 1f)))
            drawRect(
                brush = Brush.horizontalGradient(listOf(Color.White, pureHueColor)),
                topLeft = Offset(center.x - boxR, center.y - boxR),
                size = androidx.compose.ui.geometry.Size(boxR * 2, boxR * 2),
            )
            drawRect(
                brush = Brush.verticalGradient(listOf(Color.Transparent, Color.Black)),
                topLeft = Offset(center.x - boxR, center.y - boxR),
                size = androidx.compose.ui.geometry.Size(boxR * 2, boxR * 2),
            )

            // 4. Draw Sat/Val Marker
            val svX = (center.x - boxR) + sat * (boxR * 2)
            val svY = (center.y + boxR) - value * (boxR * 2)
            drawCircle(Color.White, radius = 6f, center = Offset(svX, svY), style = Stroke(2f))
            drawCircle(
                Color(AndroidColor.HSVToColor(floatArrayOf(hue, sat, value))),
                radius = 5f,
                center = Offset(svX, svY),
            )
        }
    }
}
