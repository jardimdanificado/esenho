package app.esenho.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

private fun toolbarIcon(name: String, vararg paths: String): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
        .apply {
            val stroke = SolidColor(Color.White)
            paths.forEach { pathData ->
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

/** Standard pen-nib icon for the Bézier pen tool. */
internal val PenToolIcon =
    toolbarIcon(
        "PenTool",
        "M12 19l7-7 3 3-7 7-3-3z",
        "M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z",
        "M2 2l7.586 7.586",
        "M9 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    )

internal val SelectRectIcon =
    toolbarIcon(
        "SelectRect",
        "M3 9V5a2 2 0 0 1 2-2h4",
        "M15 3h4a2 2 0 0 1 2 2v4",
        "M21 15v4a2 2 0 0 1-2 2h-4",
        "M9 21H5a2 2 0 0 1-2-2v-4",
    )

internal val SelectEllipseIcon =
    toolbarIcon(
        "SelectEllipse",
        "M12 3a9 9 0 0 1 9 9",
        "M21 12a9 9 0 0 1-9 9",
        "M12 21a9 9 0 0 1-9-9",
        "M3 12a9 9 0 0 1 9-9",
    )

internal val SelectLassoIcon =
    toolbarIcon(
        "SelectLasso",
        "M4 11a8 6 0 1 0 15 1",
        "M19 12a8 6 0 0 0-15-1",
        "M19 12l2.5 7",
        "M21.5 19a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0",
    )

internal val SelectBrushIcon =
    toolbarIcon(
        "SelectBrush",
        "M14 5l6 6-8 8H6v-6l8-8z",
        "M3 4h3",
        "M3 9h3",
        "M3 14h3",
        "M3 19h3",
    )

internal val SelectWandIcon =
    toolbarIcon(
        "SelectWand",
        "M5 19L15 9l2 2-10 10H5v-2z",
        "M15 9l2-2 3 3-2 2",
        "M19 3v3",
        "M17.5 4.5h3",
        "M5 3v3",
        "M3.5 4.5h3",
    )

internal val LassoFillIcon =
    toolbarIcon(
        "LassoFill",
        "M4 11a8 6 0 1 0 15 1",
        "M19 12a8 6 0 0 0-15-1",
        "M19 12l2 6",
        "M21 18c1 1.5 1.6 2.4 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-.8.6-1.7 1.6-3.2z",
    )

internal val SmudgeIcon =
    toolbarIcon(
        "Smudge",
        "M12 3a9 9 0 1 0 0 18",
        "M12 8a4 4 0 1 1 0 8",
        "M12 12h.01",
    )

internal val BlendIcon =
    toolbarIcon(
        "Blend",
        "M9 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
        "M15 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
    )

internal val EraseRectIcon =
    toolbarIcon(
        "EraseRect",
        "M4 5h16v10",
        "M4 19h4",
        "M11 19l-3-3 7-7 5 5-7 7h-2z",
    )

internal val EraseEllipseIcon =
    toolbarIcon(
        "EraseEllipse",
        "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z",
        "M11 19l-3-3 7-7 5 5-7 7h-2z",
    )

internal val EraserIcon =
    toolbarIcon(
        "Eraser",
        "M7 21L3.3 17.3a2 2 0 0 1 0-2.8l8.6-8.6a2 2 0 0 1 2.8 0l5.8 5.8a2 2 0 0 1 0 2.8L13 21",
        "M22 21H7",
        "M5 11l9 9",
    )
