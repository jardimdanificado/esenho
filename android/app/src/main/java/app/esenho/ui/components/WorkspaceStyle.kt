package app.esenho.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Single source of truth for the editor chrome. Dense toolbars share one height,
 * one item height, one corner radius and one spacing scale. Selection is shown
 * with a filled surface plus text color, never with a colored outline.
 */
object WorkspaceStyle {
    /** Height of every full-width bar (header, parameters, tools, layers, animation, shelf). */
    val BarHeight = 40.dp
    /** Height of compact rows and chips inside a bar. */
    val ItemHeight = 28.dp
    /** Square touch target inside a bar. */
    val ButtonSize = 32.dp
    /** Horizontal bar padding. */
    val BarPadding = 4.dp
    /** Gap between related items. */
    val ItemGap = 2.dp
    /** Gap between groups. */
    val GroupGap = 6.dp
    /** Radius for rows, chips, fields and swatches. */
    val ItemRadius = 3.dp
    /** Radius for floating panels and popups. */
    val PanelRadius = 6.dp
    /** Radius for dialogs and sheets. */
    val DialogRadius = 8.dp
    /** Width of one quick-parameter cell. Keeps the bar compact instead of stretching. */
    val ParameterWidth = 104.dp
}

/** Compact segmented choice. Same radius and height everywhere, no colored outline. */
@Composable
fun WorkspaceChoiceChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
        color = if (selected) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent,
        contentColor =
            when {
                !enabled -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                selected -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
    ) {
        Box(
            Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            contentAlignment = Alignment.Center,
        ) {
            label()
        }
    }
}
