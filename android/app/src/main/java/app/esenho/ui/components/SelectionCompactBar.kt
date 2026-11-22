package app.esenho.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.BlurOn
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Crop
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Deselect
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FormatColorFill
import androidx.compose.material.icons.filled.InvertColors
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OpenWith
import androidx.compose.material.icons.filled.SelectAll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.EsenhoEngine
import app.esenho.nativeengine.SelectionOp

/**
 * Selection and magic-wand options as a single dense bar, matching the other
 * editor bars. It replaces the former selection panel.
 */
@Composable
fun SelectionCompactBar(
    engine: EsenhoEngine,
    selectionActive: Boolean,
    canPasteSelection: Boolean,
    currentColor: Int,
    onCopy: () -> Unit,
    onCut: () -> Unit,
    onFill: () -> Unit,
    onCrop: () -> Unit,
    onPaste: () -> Unit,
    onSelectAll: () -> Unit,
    onInvert: () -> Unit,
    onFeather: () -> Unit,
    onDeselect: () -> Unit,
    onDeletePixels: () -> Unit,
    onTransform: () -> Unit,
    onCreateTip: () -> Unit,
    onCreateGrain: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var opMenu by remember { mutableStateOf(false) }
    var wandPopup by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }
    var tolerance by remember { mutableFloatStateOf(engine.wandTolerance.toFloat()) }
    var contiguous by remember { mutableStateOf(engine.wandContiguous) }

    CompactBarSurface(modifier) {
        Text(
            "Seleção",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(end = 2.dp),
            maxLines = 1,
        )
        Box {
            Surface(
                onClick = { opMenu = true },
                shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
                color = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Row(
                    Modifier.padding(start = 8.dp, end = 4.dp, top = 5.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(engine.selectionOp.displayName, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    Icon(Icons.Default.ExpandMore, "Modo de seleção", Modifier.size(14.dp))
                }
            }
            DropdownMenu(opMenu, { opMenu = false }) {
                SelectionOp.values().forEach { operation ->
                    DropdownMenuItem(
                        text = { Text(operation.displayName) },
                        trailingIcon =
                            if (engine.selectionOp == operation) {
                                { Icon(Icons.Default.Check, null) }
                            } else null,
                        onClick = {
                            engine.selectionOp = operation
                            opMenu = false
                        },
                    )
                }
            }
        }
        Box {
            IconButton(
                onClick = { wandPopup = true },
                modifier = Modifier.size(WorkspaceStyle.ButtonSize),
            ) {
                Icon(
                    Icons.Default.AutoFixHigh,
                    "Opções da varinha mágica",
                    Modifier.size(17.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            AnchoredWorkspacePopup(
                wandPopup,
                { wandPopup = false },
                modifier = Modifier.width(240.dp),
            ) {
                Text(
                    "Tolerância: ${tolerance.toInt()}",
                    style = MaterialTheme.typography.labelSmall,
                )
                WorkspaceSlider(
                    value = tolerance,
                    onValueChange = {
                        tolerance = it
                        engine.wandTolerance = it.toInt()
                    },
                    valueRange = 0f..255f,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Switch(
                        checked = contiguous,
                        onCheckedChange = {
                            contiguous = it
                            engine.wandContiguous = it
                        },
                    )
                    Text(
                        "Apenas pixels conectados",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        IconButton(
            enabled = selectionActive,
            onClick = onInvert,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(
                Icons.Default.InvertColors,
                "Inverter seleção",
                Modifier.size(17.dp),
            )
        }
        IconButton(
            enabled = selectionActive,
            onClick = onFeather,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.BlurOn, "Suavizar borda", Modifier.size(17.dp))
        }
        IconButton(
            enabled = selectionActive,
            onClick = onDeselect,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.Deselect, "Deselecionar", Modifier.size(17.dp))
        }
        IconButton(
            onClick = onSelectAll,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.SelectAll, "Selecionar tudo", Modifier.size(17.dp))
        }

        Box(Modifier.weight(1f))

        IconButton(
            enabled = selectionActive,
            onClick = onCopy,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.ContentCopy, "Copiar seleção", Modifier.size(17.dp))
        }
        IconButton(
            enabled = selectionActive,
            onClick = onCut,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.ContentCut, "Recortar seleção", Modifier.size(17.dp))
        }
        IconButton(
            enabled = canPasteSelection,
            onClick = onPaste,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.ContentPaste, "Colar seleção", Modifier.size(17.dp))
        }
        IconButton(
            enabled = selectionActive,
            onClick = onFill,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.FormatColorFill, "Preencher seleção", Modifier.size(17.dp))
        }
        IconButton(
            enabled = selectionActive,
            onClick = onCrop,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.Crop, "Cortar tela para seleção", Modifier.size(17.dp))
        }
        IconButton(
            enabled = selectionActive,
            onClick = onTransform,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(Icons.Default.OpenWith, "Transformar seleção", Modifier.size(17.dp))
        }
        IconButton(
            enabled = selectionActive,
            onClick = onDeletePixels,
            modifier = Modifier.size(WorkspaceStyle.ButtonSize),
        ) {
            Icon(
                Icons.Default.DeleteOutline,
                "Apagar pixels selecionados",
                Modifier.size(17.dp),
                tint = MaterialTheme.colorScheme.error,
            )
        }
        Box {
            IconButton(onClick = { moreMenu = true }, modifier = Modifier.size(WorkspaceStyle.ButtonSize)) {
                Icon(Icons.Default.MoreVert, "Mais ações de seleção", Modifier.size(17.dp))
            }
            DropdownMenu(moreMenu, { moreMenu = false }) {
                DropdownMenuItem(
                    text = { Text("Criar ponta de pincel") },
                    enabled = selectionActive,
                    onClick = {
                        moreMenu = false
                        onCreateTip()
                    },
                )
                DropdownMenuItem(
                    text = { Text("Criar textura de grão") },
                    enabled = selectionActive,
                    onClick = {
                        moreMenu = false
                        onCreateGrain()
                    },
                )
                DropdownMenuItem(
                    text = { Text("Fechar barra de seleção") },
                    onClick = {
                        moreMenu = false
                        onClose()
                    },
                )
            }
        }
    }
}
