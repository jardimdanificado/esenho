package app.esenho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import app.esenho.scripting.NativeScriptPreset
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController

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
    presets: List<NativeScriptPreset>,
    selectedPresetId: String?,
    onSelectPreset: (NativeScriptPreset?) -> Unit,
    onSavePreset: (String, Boolean) -> Unit,
    output: List<String>,
    onRun: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    pivotNames: List<String>,
    onPickPivot: (String) -> Unit,
    onClearPivots: () -> Unit,
    pivots: List<org.json.JSONObject>,
    onUpdatePivot: (String,org.json.JSONObject) -> Unit,
    onMovePivot: (String) -> Unit,
    onRemovePivot: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    fun releaseEditorFocus() {
        focusManager.clearFocus()
        keyboard?.hide()
    }
    var tab by remember { mutableIntStateOf(0) }
    val highlight = remember { JavaScriptHighlight() }
    var scriptsExpanded by remember { mutableStateOf(false) }
    var actionsExpanded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var presetName by remember { mutableStateOf("") }
    val selected = presets.firstOrNull { it.id == selectedPresetId }
    val modified = selected != null && source != selected.source
    Column(Modifier.fillMaxSize().padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        EditorPanelHeader("Scripts JavaScript", { releaseEditorFocus(); onDismiss() })
        WorkspaceSectionTabs(listOf("Código", "API", "Pivots"),tab,{ tab=it })
        if (tab == 1) ScriptReferencePanel(Modifier.weight(1f))
        else if (tab == 2) Box(Modifier.weight(1f)) { ScriptPivotsPanel(pivots,onPickPivot,onUpdatePivot,onMovePivot,onRemovePivot) }
        else {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                OutlinedButton(onClick = { scriptsExpanded = true }, shape=androidx.compose.foundation.shape.RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 8.dp)) {
                    Text((selected?.name ?: "Rascunho") + if (modified) " *" else "", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Icon(Icons.Default.ArrowDropDown, "Escolher script")
                }
                DropdownMenu(expanded = scriptsExpanded, onDismissRequest = { scriptsExpanded = false }) {
                    DropdownMenuItem(text = { Text("Novo script") }, onClick = {
                        scriptsExpanded = false
                        onSelectPreset(null)
                    })
                    var lastGroup: Boolean? = null
                    presets.forEach { preset ->
                        val example = preset.id.startsWith("example:")
                        if (lastGroup != example) {
                            HorizontalDivider()
                            Text(if (example) "Exemplos" else "Meus presets", Modifier.padding(horizontal = 12.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall)
                            lastGroup = example
                        }
                        DropdownMenuItem(
                            text = { Text(preset.name) },
                            trailingIcon = { if (preset.id == selectedPresetId) Icon(Icons.Default.Check, null) },
                            onClick = { scriptsExpanded = false; onSelectPreset(preset) },
                        )
                    }
                }
            }
            IconButton(onClick = { presetName = selected?.name.orEmpty(); saving = true }) {
                Icon(Icons.Default.Save, "Salvar preset")
            }
            IconButton(onClick = { releaseEditorFocus(); onRun() }, enabled = source.isNotBlank()) { Icon(Icons.Default.PlayArrow, "Executar script") }
            Box {
                IconButton(onClick = { actionsExpanded = true }) { Icon(Icons.Default.MoreVert, "Ações de scripts") }
                DropdownMenu(expanded = actionsExpanded, onDismissRequest = { actionsExpanded = false }) {
                    DropdownMenuItem(text = { Text("Abrir arquivo .js") }, onClick = { actionsExpanded = false; onImport() })
                    DropdownMenuItem(text = { Text("Exportar arquivo .js") }, onClick = { actionsExpanded = false; onExport() })
                    HorizontalDivider()
                    DropdownMenuItem(text = { Text("Marcar pivot na arte") }, onClick = { actionsExpanded = false; releaseEditorFocus(); onPickPivot("document") })
                    DropdownMenuItem(text = { Text("Marcar pivot na tela") }, onClick = { actionsExpanded = false; releaseEditorFocus(); onPickPivot("screen") })
                    DropdownMenuItem(text = { Text("Limpar pivots") }, enabled = pivotNames.isNotEmpty(), onClick = { actionsExpanded = false; onClearPivots() })
                }
            }
        }
        OutlinedTextField(
            value = source, onValueChange = onSourceChange,
            visualTransformation = highlight,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                autoCorrect = false, capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.None),
            modifier = Modifier.fillMaxWidth().weight(1f),
            textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            label = { Text("JavaScript") },
        )
        if (pivotNames.isNotEmpty()) Text("Pivots: ${pivotNames.joinToString()}", style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (output.isNotEmpty()) Text(
            output.joinToString("\n"),
            Modifier.fillMaxWidth().heightIn(max = 64.dp).verticalScroll(rememberScrollState()),
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
        )
    }
    }
    if (saving) AlertDialog(
        onDismissRequest = { saving = false },
        title = { Text("Salvar preset de script") },
        text = { OutlinedTextField(value = presetName, onValueChange = { presetName = it }, singleLine = true, label = { Text("Nome") }) },
        confirmButton = {
            Row {
                if (selected != null && !selected.id.startsWith("example:")) TextButton(
                    enabled = presetName.isNotBlank(),
                    onClick = { onSavePreset(presetName.trim(), true); saving = false },
                ) { Text("Salvar cópia") }
                TextButton(enabled = presetName.isNotBlank(), onClick = { onSavePreset(presetName.trim(), false); saving = false }) { Text("Salvar") }
            }
        },
        dismissButton = { TextButton(onClick = { saving = false }) { Text("Cancelar") } },
    )
}
