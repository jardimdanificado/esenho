package app.esenho.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitHorizontalTouchSlopOrCancellation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.horizontalDrag
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

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

/**
 * Compact slider used by every dense panel. It draws its own 3 dp track and a
 * small thumb, so the row keeps the same height as the rest of the editor
 * instead of the 48 dp Material slider.
 */
@Composable
fun WorkspaceSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    valueRange: ClosedFloatingPointRange<Float> = 0f..1f,
    onValueChangeFinished: (() -> Unit)? = null,
    enabled: Boolean = true,
) {
    val span = (valueRange.endInclusive - valueRange.start).takeIf { it > 0f } ?: 1f
    val fraction = ((value - valueRange.start) / span).coerceIn(0f, 1f)
    var width by remember { mutableFloatStateOf(1f) }
    val activeColor = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.surfaceVariant
    val thumbColor =
        if (enabled) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    fun valueAt(x: Float) = valueRange.start + (x / width).coerceIn(0f, 1f) * span
    Box(
        modifier
            .height(22.dp)
            .onSizeChanged { width = it.width.toFloat().coerceAtLeast(1f) }
            .then(
                if (!enabled) Modifier
                else
                    Modifier
                        // A tap anywhere on the track sets the value, but a drag only owns the
                        // gesture after horizontal touch slop. Vertical drags stay with the parent
                        // scroll container, so lists with sliders stay scrollable.
                        .pointerInput(valueRange.start, valueRange.endInclusive) {
                            detectTapGestures { position ->
                                onValueChange(valueAt(position.x))
                                onValueChangeFinished?.invoke()
                            }
                        }
                        .pointerInput(valueRange.start, valueRange.endInclusive) {
                            awaitEachGesture {
                                val down = awaitFirstDown(requireUnconsumed = false)
                                val slop =
                                    awaitHorizontalTouchSlopOrCancellation(down.id) { change, _ ->
                                        onValueChange(valueAt(change.position.x))
                                    } ?: return@awaitEachGesture
                                onValueChange(valueAt(slop.position.x))
                                horizontalDrag(slop.id) { change ->
                                    onValueChange(valueAt(change.position.x))
                                    change.consume()
                                }
                                onValueChangeFinished?.invoke()
                            }
                        }
            )
            .semantics {
                progressBarRangeInfo =
                    androidx.compose.ui.semantics.ProgressBarRangeInfo(
                        value.coerceIn(valueRange.start, valueRange.endInclusive),
                        valueRange,
                    )
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxWidth().height(22.dp)) {
            val centerY = size.height / 2f
            val trackHeight = 3.dp.toPx()
            val radius = trackHeight / 2f
            drawRoundRect(
                color = trackColor,
                topLeft = androidx.compose.ui.geometry.Offset(0f, centerY - radius),
                size = androidx.compose.ui.geometry.Size(size.width, trackHeight),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius),
            )
            drawRoundRect(
                color = activeColor,
                topLeft = androidx.compose.ui.geometry.Offset(0f, centerY - radius),
                size = androidx.compose.ui.geometry.Size(size.width * fraction, trackHeight),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius),
            )
            val thumbRadius = 6.dp.toPx()
            drawCircle(
                color = thumbColor,
                radius = thumbRadius,
                center =
                    androidx.compose.ui.geometry.Offset(
                        (size.width * fraction).coerceIn(thumbRadius, (size.width - thumbRadius).coerceAtLeast(thumbRadius)),
                        centerY,
                    ),
            )
        }
    }
}

/** Compact search field: 28 dp tall, square corners, no floating label. */
@Composable
fun WorkspaceSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.height(WorkspaceStyle.ItemHeight),
        shape = RoundedCornerShape(WorkspaceStyle.ItemRadius),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            androidx.compose.foundation.text.BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle =
                    androidx.compose.ui.text.TextStyle(
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 12.sp,
                    ),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    if (value.isEmpty())
                        Text(
                            placeholder,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    inner()
                },
            )
            if (value.isNotEmpty())
                Icon(
                    Icons.Default.Close,
                    contentDescription = "Limpar busca",
                    modifier =
                        Modifier.size(14.dp).clickable { onValueChange("") },
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
        }
    }
}
