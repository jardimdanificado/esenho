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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.esenho.nativeengine.ColorPaletteModel
import app.esenho.nativeengine.EsenhoEngine
import kotlin.math.*

@Composable
fun ColorStudioModal(
    engine: EsenhoEngine? = null,
    initialColor: Int,
    recentColors: List<Int>,
    onColorChanged: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    val hsv = remember {
        val arr = FloatArray(3)
        AndroidColor.colorToHSV(initialColor, arr)
        arr
    }

    var hue by remember { mutableFloatStateOf(hsv[0]) }
    var sat by remember { mutableFloatStateOf(hsv[1]) }
    var value by remember { mutableFloatStateOf(hsv[2]) }

    val currentColor = remember(hue, sat, value) {
        AndroidColor.HSVToColor(floatArrayOf(hue, sat, value))
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp,
            modifier = Modifier.width(320.dp)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Color Studio", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(12.dp))

                // 1. HSV Color Wheel Canvas
                HsvColorWheel(
                    hue = hue,
                    sat = sat,
                    value = value,
                    onHueChange = {
                        hue = it
                        onColorChanged(AndroidColor.HSVToColor(floatArrayOf(hue, sat, value)))
                    },
                    onSatValChange = { s, v ->
                        sat = s
                        value = v
                        onColorChanged(AndroidColor.HSVToColor(floatArrayOf(hue, sat, value)))
                    },
                    modifier = Modifier.size(220.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // 2. Color Swatch & Hex
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color(currentColor))
                            .border(2.dp, Color.White, CircleShape)
                    )
                    Text(
                        text = String.format("#%06X", 0xFFFFFF and currentColor),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Button(
                        onClick = onDismiss,
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)
                    ) {
                        Text("Pronto")
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // 3. Preset & Custom Color Palettes (F16)
                var paletteVersion by remember { mutableIntStateOf(0) }
                var showNewPaletteDialog by remember { mutableStateOf(false) }
                var newPaletteName by remember { mutableStateOf("") }
                var newPaletteError by remember { mutableStateOf<String?>(null) }
                var showDeletePaletteDialog by remember { mutableStateOf(false) }

                val currentPalettes = remember(engine?.palettes?.size, paletteVersion) {
                    engine?.palettes ?: ColorPaletteModel.getDefaultPalettes()
                }

                var activePaletteId by remember {
                    mutableStateOf(engine?.activePaletteId ?: currentPalettes.firstOrNull()?.id ?: "classic")
                }

                val activePalette = currentPalettes.find { it.id == activePaletteId } ?: currentPalettes.firstOrNull()

                // Header for Palettes
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Paletas de Cores",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    if (activePalette != null && !activePalette.isBuiltIn) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            // + Cor action button
                            OutlinedButton(
                                onClick = {
                                    engine?.addColorToPalette(activePalette.id, currentColor)
                                    paletteVersion++
                                },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                modifier = Modifier.height(26.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(12.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("+ Cor", fontSize = 10.sp)
                            }

                            // Delete palette button
                            IconButton(
                                onClick = { showDeletePaletteDialog = true },
                                modifier = Modifier.size(26.dp)
                            ) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Excluir Paleta",
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Palette Tabs + "+ Nova Paleta" button
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(currentPalettes) { pal ->
                        FilterChip(
                            selected = pal.id == activePaletteId,
                            onClick = {
                                activePaletteId = pal.id
                                engine?.activePaletteId = pal.id
                            },
                            label = { Text(pal.name, fontSize = 10.sp) }
                        )
                    }
                    item {
                        AssistChip(
                            onClick = {
                                newPaletteName = ""
                                newPaletteError = null
                                showNewPaletteDialog = true
                            },
                            label = { Text("+ Nova", fontSize = 10.sp, fontWeight = FontWeight.Bold) },
                            leadingIcon = {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(12.dp))
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Swatches row of the active palette
                if (activePalette != null) {
                    if (activePalette.colors.isEmpty()) {
                        Text(
                            text = "Paleta vazia. Toque em '+ Cor' para adicionar a cor selecionada.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                    } else {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            itemsIndexed(activePalette.colors) { idx, c ->
                                Box(contentAlignment = Alignment.TopEnd) {
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .clip(CircleShape)
                                            .background(Color(c))
                                            .border(
                                                width = if (c == currentColor) 2.dp else 1.dp,
                                                color = if (c == currentColor) MaterialTheme.colorScheme.primary else Color.Gray,
                                                shape = CircleShape
                                            )
                                            .clickable {
                                                val arr = FloatArray(3)
                                                AndroidColor.colorToHSV(c, arr)
                                                hue = arr[0]
                                                sat = arr[1]
                                                value = arr[2]
                                                onColorChanged(c)
                                            }
                                    )
                                    // If custom palette, allow removing color swatch
                                    if (!activePalette.isBuiltIn) {
                                        Box(
                                            modifier = Modifier
                                                .size(12.dp)
                                                .offset(x = 2.dp, y = (-2).dp)
                                                .clip(CircleShape)
                                                .background(MaterialTheme.colorScheme.error)
                                                .clickable {
                                                    engine?.removeColorFromPalette(activePalette.id, idx)
                                                    paletteVersion++
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                Icons.Default.Close,
                                                contentDescription = "Remover Cor",
                                                tint = Color.White,
                                                modifier = Modifier.size(8.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // New Palette Dialog
                if (showNewPaletteDialog) {
                    AlertDialog(
                        onDismissRequest = { showNewPaletteDialog = false },
                        title = { Text("Nova Paleta de Cores", fontSize = 16.sp, fontWeight = FontWeight.Bold) },
                        text = {
                            Column {
                                Text(
                                    "Digite um nome para a sua nova paleta customizada:",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                OutlinedTextField(
                                    value = newPaletteName,
                                    onValueChange = {
                                        newPaletteName = it
                                        newPaletteError = null
                                    },
                                    label = { Text("Nome da Paleta") },
                                    isError = newPaletteError != null,
                                    supportingText = if (newPaletteError != null) {
                                        { Text(newPaletteError!!, color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                    } else null,
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    val trimmed = newPaletteName.trim()
                                    if (trimmed.isEmpty()) {
                                        newPaletteError = "O nome da paleta não pode ser vazio"
                                        return@Button
                                    }
                                    try {
                                        val created = engine?.createCustomPalette(trimmed)
                                        if (created != null) {
                                            activePaletteId = created.id
                                        }
                                        paletteVersion++
                                        showNewPaletteDialog = false
                                    } catch (e: Exception) {
                                        newPaletteError = e.message ?: "Erro ao criar paleta"
                                    }
                                }
                            ) {
                                Text("Criar")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showNewPaletteDialog = false }) {
                                Text("Cancelar")
                            }
                        }
                    )
                }

                // Delete Palette Dialog
                if (showDeletePaletteDialog && activePalette != null && !activePalette.isBuiltIn) {
                    AlertDialog(
                        onDismissRequest = { showDeletePaletteDialog = false },
                        title = { Text("Excluir Paleta?", fontSize = 16.sp, fontWeight = FontWeight.Bold) },
                        text = {
                            Text(
                                "Tem certeza que deseja excluir a paleta '${activePalette.name}'? Todas as suas cores salvas serão removidas.",
                                fontSize = 13.sp
                            )
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    engine?.deletePalette(activePalette.id)
                                    activePaletteId = engine?.activePaletteId ?: "classic"
                                    paletteVersion++
                                    showDeletePaletteDialog = false
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                            ) {
                                Text("Excluir")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showDeletePaletteDialog = false }) {
                                Text("Cancelar")
                            }
                        }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // 4. Recent Colors
                Text("Cores Recentes", style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.Start))
                Spacer(modifier = Modifier.height(6.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(recentColors) { c ->
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(Color(c))
                                .border(1.dp, Color.Gray, CircleShape)
                                .clickable {
                                    val arr = FloatArray(3)
                                    AndroidColor.colorToHSV(c, arr)
                                    hue = arr[0]
                                    sat = arr[1]
                                    value = arr[2]
                                    onColorChanged(c)
                                }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HsvColorWheel(
    hue: Float,
    sat: Float,
    value: Float,
    onHueChange: (Float) -> Unit,
    onSatValChange: (Float, Float) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
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
                            var angle = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
                            if (angle < 0) angle += 360f
                            onHueChange(angle)
                        } else if (dist < innerR) {
                            // Touch on Inner Saturation/Value Box
                            val boxSize = innerR * 1.25f
                            val sx = ((dx / boxSize) + 0.5f).coerceIn(0f, 1f)
                            val sy = (1f - ((dy / boxSize) + 0.5f)).coerceIn(0f, 1f)
                            onSatValChange(sx, sy)
                        }
                    }

                    detectTapGestures { offset -> processPoint(offset) }
                }
                .pointerInput(Unit) {
                    detectDragGestures { change, _ ->
                        val center = Offset(size.width / 2f, size.height / 2f)
                        val dx = change.position.x - center.x
                        val dy = change.position.y - center.y
                        val dist = hypot(dx, dy)
                        val outerR = size.width / 2f
                        val innerR = outerR * 0.72f

                        if (dist >= innerR) {
                            var angle = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
                            if (angle < 0) angle += 360f
                            onHueChange(angle)
                        } else {
                            val boxSize = innerR * 1.25f
                            val sx = ((dx / boxSize) + 0.5f).coerceIn(0f, 1f)
                            val sy = (1f - ((dy / boxSize) + 0.5f)).coerceIn(0f, 1f)
                            onSatValChange(sx, sy)
                        }
                    }
                }
        ) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val outerR = size.width / 2f
            val innerR = outerR * 0.72f
            val strokeW = outerR - innerR

            // 1. Draw Hue Ring with gradient sweep
            val sweepColors = listOf(
                Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Magenta, Color.Red
            )
            drawCircle(
                brush = Brush.sweepGradient(sweepColors, center),
                radius = (outerR + innerR) / 2f,
                style = Stroke(width = strokeW)
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
                size = androidx.compose.ui.geometry.Size(boxR * 2, boxR * 2)
            )
            drawRect(
                brush = Brush.verticalGradient(listOf(Color.Transparent, Color.Black)),
                topLeft = Offset(center.x - boxR, center.y - boxR),
                size = androidx.compose.ui.geometry.Size(boxR * 2, boxR * 2)
            )

            // 4. Draw Sat/Val Marker
            val svX = (center.x - boxR) + sat * (boxR * 2)
            val svY = (center.y + boxR) - value * (boxR * 2)
            drawCircle(Color.White, radius = 6f, center = Offset(svX, svY), style = Stroke(2f))
            drawCircle(Color(AndroidColor.HSVToColor(floatArrayOf(hue, sat, value))), radius = 5f, center = Offset(svX, svY))
        }
    }
}
