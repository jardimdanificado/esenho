package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.ui.NativeExportRequest

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NativeExportDialog(
    engine: EsenhoEngine,
    onExport: (NativeExportRequest) -> Unit,
    onDismiss: () -> Unit,
) {
    var animated by remember { mutableStateOf(false) }
    var selectedFormat by remember { mutableStateOf(NativeExportRequest.Format.PNG) }
    var fps by remember { mutableIntStateOf(engine.animationFps.coerceIn(1, 60)) }
    var loop by remember { mutableStateOf(engine.animationLoop) }
    val formats =
        if (animated) listOf(NativeExportRequest.Format.GIF, NativeExportRequest.Format.WEBM)
        else
            listOf(
                NativeExportRequest.Format.PNG,
                NativeExportRequest.Format.JPEG,
                NativeExportRequest.Format.WEBP,
            )

    WorkspacePanelContainer(false, onDismiss) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp)
        ) {
            EditorPanelHeader("Exportar criação", onDismiss)
            Text(
                "${engine.width} × ${engine.height} px · ${engine.layers.size} camadas",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            WorkspaceSectionTabs(listOf("Imagem", "Animação"), if (animated) 1 else 0) {
                animated = it == 1
                selectedFormat =
                    if (animated) NativeExportRequest.Format.GIF else NativeExportRequest.Format.PNG
            }
            Text("Formato de saída", style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                formats.forEach { format ->
                    FilterChip(
                        selected = selectedFormat == format,
                        onClick = { selectedFormat = format },
                        label = { Text(format.name) },
                    )
                }
            }
            Text(
                when (selectedFormat) {
                    NativeExportRequest.Format.PNG ->
                        "Imagem sem perda de qualidade, com transparência."
                    NativeExportRequest.Format.JPEG ->
                        "Arquivo menor para compartilhar imagens com fundo."
                    NativeExportRequest.Format.WEBP ->
                        "Imagem compacta com suporte a transparência."
                    NativeExportRequest.Format.GIF ->
                        "Animação compatível com navegadores e mensageiros."
                    NativeExportRequest.Format.WEBM -> "Vídeo da animação para compartilhar."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 12.dp),
            )
            if (animated) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Velocidade", style = MaterialTheme.typography.labelMedium)
                    Text(
                        "$fps fps",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Slider(fps.toFloat(), { fps = it.toInt().coerceIn(1, 60) }, valueRange = 1f..60f)
                if (selectedFormat == NativeExportRequest.Format.GIF)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Repetir animação", Modifier.weight(1f))
                        Switch(loop, { loop = it })
                    }
            }
            Button(
                onClick = {
                    val request =
                        when (selectedFormat) {
                            NativeExportRequest.Format.PNG,
                            NativeExportRequest.Format.JPEG,
                            NativeExportRequest.Format.WEBP ->
                                engine.getRenderBitmap()?.let {
                                    NativeExportRequest(selectedFormat, bitmap = it)
                                }
                            NativeExportRequest.Format.GIF -> {
                                engine.captureCurrentFrame()
                                NativeExportRequest(
                                    selectedFormat,
                                    frames = engine.renderAnimationFrames(),
                                    fps = fps,
                                    loop = loop,
                                )
                            }
                            NativeExportRequest.Format.WEBM ->
                                NativeExportRequest(
                                    selectedFormat,
                                    frames = engine.renderAnimationFrames(),
                                    fps = fps,
                                )
                        }
                    request?.let(onExport)
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(48.dp),
            ) {
                Text("Exportar ${selectedFormat.name}")
            }
        }
    }
}
