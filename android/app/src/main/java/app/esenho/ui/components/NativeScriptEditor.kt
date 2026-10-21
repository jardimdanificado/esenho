package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

object NativeScriptExamples {
    val radial = """
        // Toque e arraste para definir origem e orientação.
        const pivot = esenho.pickPivot({ name: "centro" });
        esenho.brush.set({ size: 12, color: "#d65d0e" });

        for (let i = 0; i < 12; i++) {
          esenho.brush.stroke({
            space: pivot.rotate(i * 30),
            points: [
              { x: 20, y: 0, pressure: 0.2 },
              { x: 80, y: 0, pressure: 1 },
              { x: 140, y: 0, pressure: 0.2 }
            ]
          });
        }
        console.log("Traços concluídos", pivot.origin);
    """.trimIndent()

    val spiral = """
        const pivot = esenho.pickPivot({
          name: "espiral",
          message: "Marque o centro da espiral"
        });
        const points = [];
        for (let i = 0; i <= 600; i++) {
          const angle = i * 0.05;
          const radius = i * 0.3;
          points.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            pressure: 0.2 + 0.8 * i / 600
          });
        }
        esenho.tools.stroke({ space: pivot, points });
    """.trimIndent()

    val view = """
        // Origem no centro visível; unidades em pixels da tela.
        const view = esenho.view.state();
        const space = esenho.spaces.view.snapshot()
          .translate(view.width / 2, view.height / 2);
        esenho.tools.line.stroke({
          space,
          points: [{ x: -100, y: 0 }, { x: 100, y: 0 }]
        });
        console.log(esenho.document.state());
    """.trimIndent()
}

@Composable
fun NativeScriptEditor(
    source: String,
    onSourceChange: (String) -> Unit,
    output: List<String>,
    onRun: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    pivotNames: List<String>,
    onPickPivot: (String) -> Unit,
    onClearPivots: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            Column(Modifier.fillMaxSize().imePadding().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                EditorPanelHeader("Scripts JavaScript", onDismiss)
                Text("Sem await: o script espera o toque e cada operação. Toque e arraste para orientar pivots.", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { onSourceChange(NativeScriptExamples.radial) }) { Text("Radial") }
                    TextButton(onClick = { onSourceChange(NativeScriptExamples.spiral) }) { Text("Espiral") }
                    TextButton(onClick = { onSourceChange(NativeScriptExamples.view) }) { Text("Tela") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { onPickPivot("document") }) { Text("Pivot na arte") }
                    TextButton(onClick = { onPickPivot("screen") }) { Text("Pivot na tela") }
                    if (pivotNames.isNotEmpty()) TextButton(onClick = onClearPivots) { Text("Limpar") }
                }
                if (pivotNames.isNotEmpty()) Text(
                    "Pivots: ${pivotNames.joinToString()} · use esenho.pivots.get(\"nome\")",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = source, onValueChange = onSourceChange,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    label = { Text("JavaScript") },
                )
                if (output.isNotEmpty()) {
                    Text(
                        output.joinToString("\n"),
                        Modifier.fillMaxWidth().heightIn(max = 140.dp).verticalScroll(rememberScrollState()),
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onImport) { Text("Abrir .js") }
                    TextButton(onClick = onExport) { Text("Salvar .js") }
                    Spacer(Modifier.weight(1f))
                    Button(onClick = onRun, enabled = source.isNotBlank()) { Text("Executar") }
                }
            }
        }
    }
}
