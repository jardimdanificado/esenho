package app.esenho.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Flip
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.esenho.nativeengine.TransformState

/**
 * Transform controls as a single dense bar, matching the rest of the editor.
 * It replaces the old panel of oversized action buttons.
 */
@Composable
fun TransformCompactBar(
    mode: TransformState.Mode,
    onModeChange: (TransformState.Mode) -> Unit,
    lockAspect: Boolean,
    onToggleLockAspect: () -> Unit,
    interpolation: TransformState.Interpolation,
    onToggleInterpolation: () -> Unit,
    onFlipH: () -> Unit,
    onRotate: (Float) -> Unit,
    onCenter: () -> Unit,
    onFit: () -> Unit,
    onReset: () -> Unit,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var modeMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }
    CompactBarSurface(modifier) {
        Text(
            "Transformar",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 6.dp, end = 2.dp),
            maxLines = 1,
        )
        Box {
            Surface(
                onClick = { modeMenu = true },
                shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
                color = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Row(
                    Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(mode.title, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    Icon(
                        Icons.Default.ArrowDropDown,
                        contentDescription = "Modo de transformação",
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            DropdownMenu(modeMenu, { modeMenu = false }) {
                TransformState.Mode.values().forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.title) },
                        trailingIcon =
                            if (mode == option) {
                                { Icon(Icons.Default.Check, null) }
                            } else null,
                        onClick = {
                            modeMenu = false
                            onModeChange(option)
                        },
                    )
                }
            }
        }
        Surface(
            onClick = onToggleInterpolation,
            shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
            color = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ) {
            Text(
                if (interpolation == TransformState.Interpolation.NEAREST) "Nítido" else "Suave",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                maxLines = 1,
            )
        }
        IconButton(onClick = onToggleLockAspect, modifier = Modifier.size(WorkspaceStyle.ButtonSize)) {
            Icon(
                if (lockAspect) Icons.Default.Lock else Icons.Default.LockOpen,
                contentDescription = if (lockAspect) "Proporção bloqueada" else "Proporção livre",
                modifier = Modifier.size(17.dp),
                tint =
                    if (lockAspect) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onFlipH, modifier = Modifier.size(WorkspaceStyle.ButtonSize)) {
            Icon(
                Icons.Default.Flip,
                "Espelhar horizontal",
                modifier = Modifier.size(17.dp),
            )
        }
        IconButton(onClick = { onRotate(90f) }, modifier = Modifier.size(WorkspaceStyle.ButtonSize)) {
            Icon(
                Icons.Default.RotateRight,
                "Girar 90°",
                modifier = Modifier.size(17.dp),
            )
        }
        Box {
            IconButton(onClick = { moreMenu = true }, modifier = Modifier.size(WorkspaceStyle.ButtonSize)) {
                Icon(
                    Icons.Default.MoreVert,
                    "Mais ações de transformação",
                    modifier = Modifier.size(17.dp),
                )
            }
            DropdownMenu(moreMenu, { moreMenu = false }) {
                DropdownMenuItem(
                    text = { Text("Girar 90° anti-horário") },
                    onClick = { moreMenu = false; onRotate(-90f) },
                )
                DropdownMenuItem(
                    text = { Text("Girar 180°") },
                    onClick = { moreMenu = false; onRotate(180f) },
                )
                DropdownMenuItem(
                    text = { Text("Centralizar no canvas") },
                    onClick = { moreMenu = false; onCenter() },
                )
                DropdownMenuItem(
                    text = { Text("Ajustar ao canvas") },
                    onClick = { moreMenu = false; onFit() },
                )
                DropdownMenuItem(
                    text = { Text("Redefinir transformação") },
                    onClick = { moreMenu = false; onReset() },
                )
            }
        }
        Box(Modifier.weight(1f))
        IconButton(onClick = onCancel, modifier = Modifier.size(WorkspaceStyle.ButtonSize)) {
            Icon(
                Icons.Default.Close,
                "Cancelar transformação",
                modifier = Modifier.size(17.dp),
                tint = MaterialTheme.colorScheme.error,
            )
        }
        Surface(
            onClick = onConfirm,
            shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
            color = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.padding(end = 2.dp),
        ) {
            Row(
                Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(15.dp))
                Text("Aplicar", style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
        }
    }
}
