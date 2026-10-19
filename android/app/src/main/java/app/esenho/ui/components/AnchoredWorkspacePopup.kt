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

/** Anchor to the trigger's actual bounds, with no menu baseline/transition offset. */
internal class AboveButtonPositionProvider(private val gap: Int, private val margin: Int) :
    PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val preferredX =
            if (layoutDirection == LayoutDirection.Ltr) anchorBounds.left
            else anchorBounds.right - popupContentSize.width
        val maxX = (windowSize.width - popupContentSize.width - margin).coerceAtLeast(margin)
        val maxY = (windowSize.height - popupContentSize.height - margin).coerceAtLeast(margin)
        return IntOffset(
            preferredX.coerceIn(margin, maxX),
            (anchorBounds.top - popupContentSize.height - gap).coerceIn(margin, maxY),
        )
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
    val position = remember(gap, margin) { AboveButtonPositionProvider(gap, margin) }
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
            shape = RoundedCornerShape(6.dp),
            shadowElevation = 4.dp,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            val scrollState = rememberScrollState()
            Column(
                Modifier.then(if (scrollContent) Modifier.verticalScroll(scrollState) else Modifier).padding(vertical = 4.dp),
                content = content,
            )
        }
    }
}
