package app.esenho.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** Standard pen-nib icon for the Bézier pen tool. */
internal val PenToolIcon: ImageVector =
    ImageVector.Builder("PenTool", 24.dp, 24.dp, 24f, 24f)
        .apply {
            val stroke = SolidColor(Color.White)
            listOf(
                "M12 19l7-7 3 3-7 7-3-3z",
                "M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z",
                "M2 2l7.586 7.586",
                "M9 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
            ).forEach { pathData ->
                addPath(
                    pathData = addPathNodes(pathData),
                    stroke = stroke,
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }
        .build()
