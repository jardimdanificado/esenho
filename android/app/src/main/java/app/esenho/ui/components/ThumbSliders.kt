package app.esenho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Vertical translucent thumb sliders (Infinite Painter / Procreate style)
 * placed at the screen edge for rapid single-thumb adjustments during drawing.
 */
@Composable
fun ThumbSliders(
    size: Float,
    opacity: Float,
    onSizeChange: (Float) -> Unit,
    onSizeChangeActive: (Boolean) -> Unit,
    onOpacityChange: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .padding(start = 8.dp)
            .width(42.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // 1. Size Slider
        VerticalThumbBar(
            value = (size - 1f) / 149f, // 1f..150f
            label = "${size.toInt()}px",
            onValueChange = { norm ->
                val newSize = (1f + norm * 149f).coerceIn(1f, 150f)
                onSizeChange(newSize)
            },
            onActiveChange = onSizeChangeActive
        )

        // 2. Opacity Slider
        VerticalThumbBar(
            value = opacity, // 0.05f..1.0f
            label = "${(opacity * 100).toInt()}%",
            onValueChange = { norm ->
                val newOp = norm.coerceIn(0.05f, 1.0f)
                onOpacityChange(newOp)
            },
            onActiveChange = {}
        )
    }
}

@Composable
fun VerticalThumbBar(
    value: Float,
    label: String,
    onValueChange: (Float) -> Unit,
    onActiveChange: (Boolean) -> Unit
) {
    var heightPx by remember { mutableFloatStateOf(160f) }

    Box(
        modifier = Modifier
            .width(36.dp)
            .height(130.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0x35000000))
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { offset ->
                        onActiveChange(true)
                        val norm = 1f - (offset.y / size.height).coerceIn(0f, 1f)
                        onValueChange(norm)
                    },
                    onDragEnd = { onActiveChange(false) },
                    onDragCancel = { onActiveChange(false) },
                    onVerticalDrag = { change, _ ->
                        val norm = 1f - (change.position.y / size.height).coerceIn(0f, 1f)
                        onValueChange(norm)
                    }
                )
            },
        contentAlignment = Alignment.BottomCenter
    ) {
        // Filled portion from bottom
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(value.coerceIn(0f, 1f))
                .background(Color(0x8064B5F6))
        )

        // Center pill handle & label
        Text(
            text = label,
            fontSize = 9.sp,
            color = Color.White,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(2.dp)
        )
    }
}
