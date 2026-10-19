package app.esenho.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** A single compact row. Scrolling keeps every action reachable on narrow screens. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorTopBar(
    navigationIcon: @Composable () -> Unit,
    actions: @Composable RowScope.() -> Unit
) {
    // Keep a 40 dp touch area per action inside the 48 dp toolbar.
    CompositionLocalProvider(LocalMinimumInteractiveComponentEnforcement provides false) {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Column {
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState())
                            .widthIn(min = maxWidth).height(48.dp).padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        navigationIcon()
                        Spacer(Modifier.weight(1f))
                        actions()
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
            }
        }
    }
}

@Composable
fun EditorPanelHeader(title: String, onClose: () -> Unit, onBack: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.size(40.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Voltar à lista", modifier = Modifier.size(18.dp))
            }
        }
        Text(
            title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleSmall,
            maxLines = 1, overflow = TextOverflow.Ellipsis
        )
        IconButton(onClick = onClose, modifier = Modifier.size(40.dp)) {
            Icon(Icons.Default.Close, contentDescription = "Fechar $title", modifier = Modifier.size(18.dp))
        }
    }
}
