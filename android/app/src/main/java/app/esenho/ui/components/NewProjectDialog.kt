package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

data class CanvasPreset(val name: String, val width: Int, val height: Int)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewProjectDialog(
    currentW: Int,
    currentH: Int,
    onConfirm: (width: Int, height: Int, bgColor: Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val presets = remember {
        listOf(
            CanvasPreset("Vertical FHD", 1080, 1920),
            CanvasPreset("Horizontal FHD", 1920, 1080),
            CanvasPreset("Quadrado 2K", 2048, 2048),
            CanvasPreset("Quadrado 1K", 1080, 1080),
            CanvasPreset("Pixel 128", 128, 128),
            CanvasPreset("Pixel 64", 64, 64),
            CanvasPreset("A4", 2480, 3508),
        )
    }
    var width by remember { mutableStateOf(currentW.toString()) }
    var height by remember { mutableStateOf(currentH.toString()) }
    var background by remember { mutableIntStateOf(0xFFFFFFFF.toInt()) }
    val w = width.toIntOrNull()
    val h = height.toIntOrNull()
    val valid =
        w != null && h != null && w in 32..8192 && h in 32..8192 && w.toLong() * h <= 32_000_000L

    WorkspacePanelContainer(false, onDismiss) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp)
        ) {
            EditorPanelHeader("Nova tela", onDismiss)
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.background,
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    Box(Modifier.size(80.dp), contentAlignment = Alignment.Center) {
                        val ratio =
                            ((w ?: 1).toFloat() / (h ?: 1).coerceAtLeast(1)).coerceIn(0.2f, 5f)
                        Box(
                            Modifier.size(
                                    if (ratio >= 1) 72.dp else (72 * ratio).dp,
                                    if (ratio <= 1) 72.dp else (72 / ratio).dp,
                                )
                                .clip(RoundedCornerShape(3.dp))
                                .background(
                                    if (background == 0) Color(0xFF777B86) else Color(background)
                                )
                        )
                    }
                    Column {
                        Text(
                            "${w ?: "—"} × ${h ?: "—"}",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "pixels · tela raster",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("Formato", style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                presets.forEach { preset ->
                    FilterChip(
                        selected = w == preset.width && h == preset.height,
                        onClick = {
                            width = preset.width.toString()
                            height = preset.height.toString()
                        },
                        label = { Text(preset.name) },
                    )
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    width,
                    { width = it.filter(Char::isDigit) },
                    label = { Text("Largura · px") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    height,
                    { height = it.filter(Char::isDigit) },
                    label = { Text("Altura · px") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }
            if (!valid)
                Text(
                    "Use de 32 a 8192 px por lado, até 32 milhões de pixels.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 6.dp),
                )
            Text(
                "Fundo",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 16.dp),
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                        "Branco" to 0xFFFFFFFF.toInt(),
                        "Escuro" to 0xFF181A1B.toInt(),
                        "Transparente" to 0,
                    )
                    .forEach { (label, color) ->
                        FilterChip(
                            selected = background == color,
                            onClick = { background = color },
                            label = { Text(label) },
                        )
                    }
            }
            Button(
                onClick = { if (valid) onConfirm(w!!, h!!, background) },
                enabled = valid,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(48.dp),
            ) {
                Text("Criar tela")
            }
        }
    }
}
