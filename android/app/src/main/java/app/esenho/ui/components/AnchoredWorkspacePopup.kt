package app.esenho.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties

/**
 * Anchors the popup to the trigger bounds. The trigger must be wrapped in a small
 * layout (for example a Box) so the reported bounds are the trigger itself, not
 * the whole toolbar row.
 *
 * Placement order: above the trigger, below it when there is no room, then
 * clamped to the window. Horizontal alignment follows the trigger edge that has
 * room, so menus on the right edge never jump to the opposite side.
 */
internal class AnchoredPositionProvider(
    private val gap: Int,
    private val margin: Int,
) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val maxX = (windowSize.width - popupContentSize.width - margin).coerceAtLeast(margin)
        val above = anchorBounds.top - popupContentSize.height - gap
        val below = anchorBounds.bottom + gap
        val y =
            when {
                above >= margin -> above
                below <= windowSize.height - popupContentSize.height - margin -> below
                else -> above.coerceIn(margin, (windowSize.height - popupContentSize.height - margin).coerceAtLeast(margin))
            }
        val alignRight = layoutDirection == LayoutDirection.Rtl ||
            anchorBounds.right + popupContentSize.width > windowSize.width - margin
        val rawX =
            if (alignRight) anchorBounds.right - popupContentSize.width
            else anchorBounds.left
        return IntOffset(rawX.coerceIn(margin, maxX), y)
    }
}

@Composable
internal fun AnchoredWorkspacePopup(
    expanded: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    persistent: Boolean = false,
    scrollContent: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (!expanded) return
    val density = LocalDensity.current
    val gap = with(density) { 2.dp.roundToPx() }
    val margin = with(density) { 4.dp.roundToPx() }
    val position = remember(gap, margin) { AnchoredPositionProvider(gap, margin) }
    val maxHeight = (LocalConfiguration.current.screenHeightDp.dp - 88.dp).coerceAtLeast(80.dp)
    Popup(
        popupPositionProvider = position,
        onDismissRequest = { if (!persistent) onDismiss() },
        properties =
            PopupProperties(
                focusable = !persistent,
                dismissOnBackPress = !persistent,
                dismissOnClickOutside = !persistent,
            ),
    ) {
        Surface(
            modifier = modifier.heightIn(max = maxHeight),
            shape = RoundedCornerShape(WorkspaceStyle.PanelRadius),
            shadowElevation = 6.dp,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            val scrollState = rememberScrollState()
            Column(
                Modifier.then(if (scrollContent) Modifier.verticalScroll(scrollState) else Modifier)
                    .padding(vertical = 4.dp),
                content = content,
            )
        }
    }
}
