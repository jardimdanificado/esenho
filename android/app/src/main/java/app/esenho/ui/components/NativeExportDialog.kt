package app.esenho.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.ui.NativeExportRequest

@Composable
fun NativeExportDialog(
    engine: EsenhoEngine,
    onExport: (NativeExportRequest) -> Unit,
    onDismiss: () -> Unit
) {
    val formats = listOf(
        NativeExportRequest.Format.PNG to "Imagem PNG",
        NativeExportRequest.Format.JPEG to "Imagem JPEG",
        NativeExportRequest.Format.WEBP to "Imagem WebP",
        NativeExportRequest.Format.GIF to "Animação GIF",
        NativeExportRequest.Format.WEBM to "Animação WebM"
    )
    var selectedFormat by remember { mutableStateOf(NativeExportRequest.Format.PNG) }
    var fps by remember { mutableIntStateOf(engine.animationFps.coerceIn(1, 60)) }
    var loop by remember { mutableStateOf(engine.animationLoop) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Exportar") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                formats.forEach { (format, label) ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { selectedFormat = format },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = selectedFormat == format, onClick = { selectedFormat = format })
                        Text(label, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (selectedFormat == NativeExportRequest.Format.GIF || selectedFormat == NativeExportRequest.Format.WEBM) {
                    Text("Velocidade: $fps fps", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
                    Slider(value = fps.toFloat(), onValueChange = { fps = it.toInt().coerceIn(1, 60) }, valueRange = 1f..60f)
                    if (selectedFormat == NativeExportRequest.Format.GIF) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Repetir animação", modifier = Modifier.weight(1f))
                            Switch(checked = loop, onCheckedChange = { loop = it })
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val request = when (selectedFormat) {
                    NativeExportRequest.Format.PNG,
                    NativeExportRequest.Format.JPEG,
                    NativeExportRequest.Format.WEBP -> engine.getRenderBitmap()?.let {
                        NativeExportRequest(selectedFormat, bitmap = it)
                    }
                    NativeExportRequest.Format.GIF -> {
                        engine.captureCurrentFrame()
                        NativeExportRequest(selectedFormat, frames = engine.renderAnimationFrames(), fps = fps, loop = loop)
                    }
                    NativeExportRequest.Format.WEBM -> NativeExportRequest(
                        selectedFormat,
                        frames = engine.renderAnimationFrames(),
                        fps = fps
                    )
                }
                request?.let(onExport)
                onDismiss()
            }) { Text("Exportar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}
